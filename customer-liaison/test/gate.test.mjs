import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeskEvent } from '../lib/desk-event.mjs';
import { gate } from '../lib/approval.mjs';
import { config, crm, event, PAT } from './helpers.mjs';

const run = (ev, cfg = config(), c = crm()) => gate(parseDeskEvent(ev), { config: cfg, crm: c });

test('an approved, opted-in customer on the client line is delivered with their own project', async () => {
  const r = await run(event());
  assert.equal(r.action, 'deliver');
  assert.equal(r.session.project_id, 'P-100');
  assert.equal(r.session.phone, '+12425550100');
});
test('nothing is delivered until the client line is set', async () => {
  assert.equal((await run(event(), config({ client_line: null }))).reason, 'client_line_not_set');
});
test('unknown, unapproved, unscoped and paused numbers go to Damian', async () => {
  assert.equal((await run(event({ phone: '+15555550199' }))).reason, 'unknown_number');
  assert.equal((await run(event(), config(), crm([{ ...PAT, agent_channel_approved: false }]))).reason, 'not_approved');
  assert.equal((await run(event(), config(), crm([{ ...PAT, agent_scope_project_id: null }]))).reason, 'no_project_scope');
  assert.equal((await run(event(), config(), crm([{ ...PAT, agent_paused: true }]))).reason, 'agent_paused');
});
test('only the client line\'s Desk channel counts; outbound echoes and other channels are ignored', async () => {
  assert.equal((await run(event({ channelId: 'CH-OTHER' }))).reason, 'other_desk_channel');
  assert.equal((await run(event({ direction: 'OUT' }))).reason, 'outbound_echo');
  assert.equal((await run(event({ integration: 'TELEGRAM' }))).reason, 'not_whatsapp');
});
test('the approval flag must be exactly true, not a truthy string', async () => {
  assert.equal((await run(event(), config(), crm([{ ...PAT, agent_channel_approved: 'true' }]))).reason, 'not_approved');
});
test('before opt-in the customer gets the welcome; YES records the opt-in', async () => {
  const c = crm([{ ...PAT, agent_opt_in_at: null }]);
  assert.equal((await run(event({ text: 'Hi there' }), config(), c)).action, 'request_opt_in');
  assert.equal((await run(event({ text: 'Yes' }), config(), c)).action, 'record_opt_in');
});
test('a malformed event is refused, never guessed', () => {
  assert.throws(() => parseDeskEvent({ payload: { text: 'x' } }), /MISSING_FIELDS/);
  assert.throws(() => parseDeskEvent(null), /NOT_AN_EVENT/);
});
