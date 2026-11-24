import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UsageLedger } from '../lib/usage.mjs';
import { SessionStore } from '../lib/sessions.mjs';
import { createAdapters } from '../lib/adapters.mjs';

export const PAT = { contact_id: 'c-1', name: 'Alex Example', phone: '+12425550100', agent_channel_approved: true, agent_scope_project_id: 'P-100', agent_opt_in_at: '2026-11-20T15:00:00Z', agent_paused: false, time_zone: 'America/Nassau' };
export const OTHER = { contact_id: 'c-2', name: 'Other Customer', phone: '+13055550111', agent_channel_approved: true, agent_scope_project_id: 'P-200', agent_opt_in_at: '2026-11-20T15:00:00Z' };

export function config(over = {}) {
  return {
    agent_id: 'client-liaison', client_line: '+10000000000', desk_channel_id: 'CH-1', escalation_cliq_chat_id: 'CT_test',
    client_hours: { start: '10:00', end: '16:00', weekdays: [1, 2, 3, 4, 5], reply_grace_minutes: 3 },
    closed_dates: [], default_time_zone: 'America/New_York',
    usage: { weights: { message_in: 1, message_out: 1, task_touch: 1, file_saved: 1, escalation: 0 }, rate_per_unit: null, currency: 'USD', low_balance_units: 50, whatsapp_pass_through_per_message: null },
    link_allowlist: ['https://lovable.dev/'],
    ...over,
  };
}
export function crm(contacts = [PAT, OTHER]) {
  return { findContactByPhone: async (p) => contacts.find((c) => c.phone === p) ?? null };
}
export function event({ phone = '+1 (242) 555-0100', text = 'Hello', direction = 'IN', channelId = 'CH-1', integration = 'WHATSAPP' } = {}) {
  return [{ eventType: 'IM_Message_Add', payload: { id: 'm1', text, messageType: 'TEXT', direction, integration, channelId, sessionId: 'S-1', actor: { externalId: phone, name: 'Alex', contactId: 'dc-1' }, meta: { DESK_TICKET_ID: 'T-1' } } }];
}
export function deps(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liaison-'));
  const sent = [], comments = [], posts = [];
  const tasks = [
    { id: 't1', project_id: 'P-100', name: 'Give Damian access to your domain', completed: false },
    { id: 't2', project_id: 'P-100', name: 'Send your photo and bio', completed: false },
    { id: 't9', project_id: 'P-200', name: 'Other customer task', completed: false },
  ];
  const adapters = createAdapters({
    projects: {
      listTasks: async (pid) => tasks.filter((t) => t.project_id === pid),
      getTask: async (_pid, id) => tasks.find((t) => t.id === id) ?? null,
      addComment: async (pid, id, text) => comments.push({ pid, id, text }),
      attachFile: async () => true,
    },
    desk: { send: async (m) => { sent.push(m); return { ok: true }; } },
    cliq: { post: async (m) => { posts.push(m); return { ok: true }; } },
  });
  return { config: config(), crm: crm(), ledger: new UsageLedger(dir), sessions: new SessionStore(), adapters, sent, comments, posts, dir, ...over };
}
// Tuesday 24 Nov 2026, 11:00 in Nassau (UTC-5)
export const IN_HOURS = new Date('2026-11-24T16:00:00Z');
