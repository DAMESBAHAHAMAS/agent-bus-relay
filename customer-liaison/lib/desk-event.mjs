// Parses one Zoho Desk IM_Message_Add webhook event.
// Field names follow Zoho's IM Message Add Event article: text (TEXT messages only), actor.externalId
// (the phone number for WhatsApp), actor.contactId, actor.name, sessionId, channelId, integration,
// direction (IN or OUT), meta.DESK_TICKET_ID. Anything that does not match is refused, never guessed.
import { toE164 } from './phone.mjs';

export class EventError extends Error { constructor(code) { super(code); this.code = code; } }

export function parseDeskEvent(raw) {
  const ev = Array.isArray(raw) ? raw[0] : raw;
  if (!ev || typeof ev !== 'object') throw new EventError('NOT_AN_EVENT');
  const p = ev.payload && typeof ev.payload === 'object' ? ev.payload : ev;
  const integration = String(p.integration ?? '').toUpperCase();
  const direction = String(p.direction ?? '').toUpperCase();
  if (!integration || !direction) throw new EventError('MISSING_FIELDS');
  if (direction !== 'IN' && direction !== 'OUT') throw new EventError('BAD_DIRECTION');
  const actor = p.actor && typeof p.actor === 'object' ? p.actor : {};
  const messageType = String(p.messageType ?? p.type ?? 'TEXT').toUpperCase();
  return {
    integration,
    direction,
    messageType,
    text: messageType === 'TEXT' && typeof p.text === 'string' ? p.text : null,
    phone: toE164(actor.externalId),
    actorName: typeof actor.name === 'string' ? actor.name.slice(0, 120) : null,
    deskContactId: actor.contactId ? String(actor.contactId) : null,
    sessionId: p.sessionId ? String(p.sessionId) : null,
    channelId: p.channelId ? String(p.channelId) : null,
    messageId: p.id ? String(p.id) : (p.messageId ? String(p.messageId) : null),
    ticketId: p.meta?.DESK_TICKET_ID ? String(p.meta.DESK_TICKET_ID) : null,
    attachment: p.attachment ?? p.content?.attachment ?? null,
  };
}
