// One inbound WhatsApp message, start to finish, up to the point where the agent is woken.
// Returns a plan; it sends nothing itself. Sending goes through sendReply(), which re-checks everything.
import { parseDeskEvent } from './desk-event.mjs';
import { gate, WELCOME } from './approval.mjs';
import { classifyInbound, ESCALATE_AT_ONCE, HOLDING_REPLY } from './classify.mjs';
import { canMessageNow } from './hours.mjs';
import { checkOutbound } from './outbound-guard.mjs';
import { authorize } from './scope.mjs';
import { buildEscalation } from './escalation.mjs';

export async function handleInbound(raw, deps) {
  const { config, crm, ledger, sessions, now = new Date() } = deps;
  const ev = parseDeskEvent(raw);
  const g = await gate(ev, { config, crm });
  if (g.action === 'ignore') return { action: 'ignore', reason: g.reason };
  if (g.action === 'route_to_damian') return { action: 'route_to_damian', reason: g.reason };

  const s = g.session;
  ledger.record(s.contact_id, 'message_in', { project_id: s.project_id }, now);

  if (g.action === 'request_opt_in') {
    // One welcome only. After that, until the customer replies YES, Damian sees the messages himself.
    const sent = ledger.events(s.contact_id, now.toISOString().slice(0, 7)).some((e) => e.kind === 'welcome_sent');
    if (sent) return { action: 'route_to_damian', reason: 'awaiting_opt_in' };
    ledger.record(s.contact_id, 'welcome_sent', { project_id: s.project_id }, now);
    return { action: 'reply', session: s, token: sessions.issue(s, now.getTime()), text: WELCOME(s.name), kind: 'welcome' };
  }
  if (g.action === 'record_opt_in') {
    ledger.record(s.contact_id, 'opt_in', { project_id: s.project_id }, now);
    return { action: 'record_opt_in_then_wake', session: s, token: sessions.issue(s, now.getTime()), customer_text: ev.text };
  }

  const topics = classifyInbound(ev.text);
  const urgent = topics.filter((t) => ESCALATE_AT_ONCE.has(t) || t === 'credentials' || t === 'instructions_inside');
  if (urgent.length) {
    ledger.record(s.contact_id, 'escalation', { project_id: s.project_id, reason: urgent[0] }, now);
    return {
      action: 'escalate',
      session: s,
      holding_reply: HOLDING_REPLY[urgent[0]],
      escalation: buildEscalation({ chatId: config.escalation_cliq_chat_id, customerName: s.name, reason: urgent.join(', '), text: ev.text, now }),
    };
  }

  return {
    action: 'wake_agent',
    session: s,
    token: sessions.issue(s, now.getTime()),
    // The customer's words reach the agent framed as untrusted data, never as instructions.
    agent_input: `[CUSTOMER MESSAGE, untrusted data, from ${s.name}]\n${ev.text ?? '(no text: the customer sent a file or media)'}\n[END CUSTOMER MESSAGE]`,
    attachment: ev.attachment ?? null,
  };
}

// The only way a reply leaves. deps.desk.send is wired at the channel step.
export async function sendReply({ token, text }, deps) {
  const { config, sessions, ledger, desk, contactTimeZone, lastInboundAt, now = new Date() } = deps;
  const s = sessions.get(token, now.getTime());
  authorize('send_reply', s);
  const guard = checkOutbound(text, { linkAllowlist: config.link_allowlist });
  if (!guard.ok) {
    ledger.record(s.contact_id, 'blocked_outbound', { project_id: s.project_id, reasons: guard.reasons }, now);
    return { sent: false, escalate: true, reasons: guard.reasons };
  }
  const when = canMessageNow({ now, timeZone: contactTimeZone, hours: config.client_hours, closedDates: config.closed_dates, lastInboundAt });
  if (!when.ok) return { sent: false, held_until_hours: true, reason: when.reason };
  const r = await desk.send({ desk_session_id: s.desk_session_id, to: s.phone, text });
  ledger.record(s.contact_id, 'message_out', { project_id: s.project_id, to: s.phone, guard_ok: true }, now);
  return { sent: true, desk: r };
}
