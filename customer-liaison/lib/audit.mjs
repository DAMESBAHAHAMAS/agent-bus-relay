// Weekly check of the agent's own record. One finding pauses that customer's agent until Damian reviews it.
import { checkOutbound } from './outbound-guard.mjs';
export function audit({ contact, events, transcripts = [], linkAllowlist = [] }) {
  const findings = [];
  for (const e of events) {
    if (e.project_id && String(e.project_id) !== String(contact.agent_scope_project_id)) findings.push({ rule: 'outside_project', at: e.ts, kind: e.kind });
    if (e.kind === 'message_out' && e.to && e.to !== contact.phone) findings.push({ rule: 'unapproved_number', at: e.ts });
    if (e.kind === 'message_out' && e.guard_ok === false) findings.push({ rule: 'sent_without_passing_guard', at: e.ts });
  }
  for (const t of transcripts) {
    if (t.direction !== 'OUT') continue;
    const r = checkOutbound(t.text, { linkAllowlist });
    if (!r.ok) findings.push({ rule: 'outbound_text', at: t.ts, reasons: r.reasons });
  }
  return { contact_id: contact.contact_id, pass: findings.length === 0, findings, pause: findings.length > 0 };
}
