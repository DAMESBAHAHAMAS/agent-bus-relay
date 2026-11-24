import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInbound } from '../lib/pipeline.mjs';
import { tools } from '../lib/tools.mjs';
import { createAdapters } from '../lib/adapters.mjs';
import { draftInvoice, prepaidBalance } from '../lib/usage.mjs';
import { audit } from '../lib/audit.mjs';
import { deps, event, crm, PAT, IN_HOURS } from './helpers.mjs';

test('a normal message wakes the agent with a token, framed as untrusted data', async () => {
  const d = deps();
  const r = await handleInbound(event({ text: 'What do you need from me today?' }), { ...d, now: IN_HOURS });
  assert.equal(r.action, 'wake_agent');
  assert.match(r.agent_input, /^\[CUSTOMER MESSAGE, untrusted data/);
  assert.ok(d.sessions.get(r.token, IN_HOURS.getTime()));
});
test('a money question escalates at once with a holding reply and never wakes the agent', async () => {
  const d = deps();
  const r = await handleInbound(event({ text: 'How much is the deposit?' }), { ...d, now: IN_HOURS });
  assert.equal(r.action, 'escalate');
  assert.match(r.holding_reply, /Damian/);
  assert.match(r.escalation.message.text, /They wrote/);
});
test('the welcome goes out once; further messages before YES go to Damian', async () => {
  const d = deps({ crm: crm([{ ...PAT, agent_opt_in_at: null }]) });
  const a = await handleInbound(event({ text: 'Hello' }), { ...d, now: IN_HOURS });
  const b = await handleInbound(event({ text: 'Hello again' }), { ...d, now: IN_HOURS });
  assert.equal(a.action, 'reply');
  assert.equal(b.reason, 'awaiting_opt_in');
});
test('tools see only the session\'s project: another customer\'s task is refused', async () => {
  const d = deps();
  const r = await handleInbound(event({ text: 'Which step is next?' }), { ...d, now: IN_HOURS });
  const td = { ...d, now: IN_HOURS };
  const list = await tools.liaison_tasks({ token: r.token }, td);
  assert.deepEqual(list.map((t) => t.id), ['t1', 't2']);
  await assert.rejects(tools.liaison_comment({ token: r.token, task_id: 't9', text: 'note' }, td), /OTHER_PROJECT/);
  assert.deepEqual(await tools.liaison_comment({ token: r.token, task_id: 't2', text: 'Photo received.' }, td), { saved: true });
  assert.equal(d.comments[0].text, '[Assistant] Photo received.');
});
test('a reply with a price is blocked and Damian is alerted; a clean reply is sent', async () => {
  const d = deps();
  const r = await handleInbound(event({ text: 'Next step?' }), { ...d, now: IN_HOURS });
  const td = { ...d, now: IN_HOURS };
  const bad = await tools.liaison_reply({ token: r.token, text: 'That will be $300.' }, td);
  assert.equal(bad.sent, false); assert.equal(d.sent.length, 0); assert.equal(d.posts.length, 1);
  const ok = await tools.liaison_reply({ token: r.token, text: 'Thank you. Please send your photo here when you can.' }, td);
  assert.equal(ok.sent, true); assert.equal(d.sent[0].to, '+12425550100');
});
test('a forged or expired token does nothing', async () => {
  const d = deps();
  await assert.rejects(tools.liaison_tasks({ token: 'x'.repeat(32) }, { ...d, now: IN_HOURS }), /SESSION_EXPIRED/);
});
test('Damian-only actions become a Cliq card with Approve and Decline', async () => {
  const d = deps();
  const r = await handleInbound(event({ text: 'I finished the domain step' }), { ...d, now: IN_HOURS });
  const out = await tools.liaison_ask_damian({ token: r.token, action: 'complete_task', task_id: 't1', note: 'Customer says the domain access is done.' }, { ...d, now: IN_HOURS });
  assert.equal(out.asked, true);
  assert.deepEqual(d.posts[0].message.buttons.map((b) => b.label), ['Approve', 'Decline']);
});
test('unwired adapters refuse instead of reaching a live system', async () => {
  await assert.rejects(createAdapters().desk.send({}), /NOT_WIRED/);
});
test('usage: monthly units, prepaid balance and a Books invoice draft that waits for the rate', async () => {
  const d = deps();
  for (let i = 0; i < 3; i++) await handleInbound(event({ text: `Question ${i}` }), { ...d, now: IN_HOURS });
  const s = d.ledger.summary('c-1', '2026-11', d.config.usage.weights);
  assert.equal(s.counts.message_in, 3); assert.equal(s.units, 3);
  assert.equal(draftInvoice({ booksCustomerId: 'B-1', customerName: 'Alex', summary: s, usage: d.config.usage }).reason, 'rate_not_set');
  const inv = draftInvoice({ booksCustomerId: 'B-1', customerName: 'Alex', summary: s, usage: { ...d.config.usage, rate_per_unit: 0.5 } });
  assert.equal(inv.body.line_items[0].quantity, 3); assert.equal(inv.needs_damian_review, true);
  assert.deepEqual(prepaidBalance({ prepaidAmount: 10, usedUnits: 3, ratePerUnit: 0.5, lowBalanceUnits: 50 }), { known: true, used: 1.5, left: 8.5, low: true });
});
test('audit: a message to another number or a blocked text is a finding that pauses the agent', () => {
  const contact = { contact_id: 'c-1', phone: '+12425550100', agent_scope_project_id: 'P-100' };
  assert.equal(audit({ contact, events: [{ kind: 'message_out', to: '+12425550100', project_id: 'P-100', guard_ok: true }] }).pass, true);
  const r = audit({ contact, events: [{ kind: 'message_out', to: '+13055550111', project_id: 'P-100' }, { kind: 'task_touch', project_id: 'P-200' }], transcripts: [{ direction: 'OUT', text: 'Pay $100 now' }] });
  assert.equal(r.pause, true);
  assert.deepEqual(r.findings.map((f) => f.rule).sort(), ['outbound_text', 'outside_project', 'unapproved_number']);
});
