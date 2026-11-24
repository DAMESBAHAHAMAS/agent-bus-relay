// The gate. A message reaches the Client Liaison only when every check passes.
// Anything else is routed to Damian untouched, as a normal Desk conversation.
import { toE164 } from './phone.mjs';

export const YES = /^\s*(yes|y|yes please|ok yes)\s*[.!]?\s*$/i;

// crm.findContactByPhone(e164) -> null | {
//   contact_id, name, phone, agent_channel_approved (bool), agent_scope_project_id (string|null),
//   agent_opt_in_at (ISO string|null), agent_paused (bool) }
export async function gate(ev, { config, crm }) {
  if (ev.integration !== 'WHATSAPP') return { action: 'ignore', reason: 'not_whatsapp' };
  if (ev.direction !== 'IN') return { action: 'ignore', reason: 'outbound_echo' };
  if (!config.client_line || !config.desk_channel_id) return { action: 'route_to_damian', reason: 'client_line_not_set' };
  if (ev.channelId !== String(config.desk_channel_id)) return { action: 'ignore', reason: 'other_desk_channel' };
  if (!ev.phone) return { action: 'route_to_damian', reason: 'no_valid_phone' };

  const contact = await crm.findContactByPhone(ev.phone);
  if (!contact) return { action: 'route_to_damian', reason: 'unknown_number' };
  if (toE164(contact.phone) !== ev.phone) return { action: 'route_to_damian', reason: 'phone_mismatch' };
  if (contact.agent_channel_approved !== true) return { action: 'route_to_damian', reason: 'not_approved', contact };
  if (!contact.agent_scope_project_id) return { action: 'route_to_damian', reason: 'no_project_scope', contact };
  if (contact.agent_paused === true) return { action: 'route_to_damian', reason: 'agent_paused', contact };

  const session = { contact_id: contact.contact_id, name: contact.name, phone: ev.phone, project_id: String(contact.agent_scope_project_id), desk_session_id: ev.sessionId, time_zone: contact.time_zone ?? null };
  if (!contact.agent_opt_in_at) {
    if (ev.text && YES.test(ev.text)) return { action: 'record_opt_in', session };
    return { action: 'request_opt_in', session };
  }
  return { action: 'deliver', session };
}

export const WELCOME = (name) =>
  `Hi ${name ? name.split(' ')[0] : 'there'}, this is Damian's AI assistant. ` +
  `I can help you with the tasks on your website project, one step at a time. ` +
  `Reply YES if you'd like to work with me here. Damian is always one message away.`;
