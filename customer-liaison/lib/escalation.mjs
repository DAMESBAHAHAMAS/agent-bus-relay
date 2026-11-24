// One Cliq message to Damian per escalation: the customer's words, the task, Approve and Decline.
// Built here, sent by the existing Cliq path once the channel step is wired.
import { createHash } from 'node:crypto';
export function buildEscalation({ chatId, customerName, reason, text, taskName = null, proposedAction = null, now = new Date() }) {
  const id = createHash('sha256').update(`${customerName}|${reason}|${text}|${now.toISOString()}`).digest('hex').slice(0, 12);
  const lines = [
    `Client Liaison needs you: ${customerName}`,
    `Why: ${reason.replace(/_/g, ' ')}`,
    taskName ? `Task: ${taskName}` : null,
    text ? `They wrote: "${String(text).slice(0, 500)}"` : null,
    proposedAction ? `Proposed: ${proposedAction}` : null,
  ].filter(Boolean);
  const buttons = proposedAction
    ? [
        { label: 'Approve', type: '+', key: `approve:${id}`, action: { type: 'invoke.function', data: { name: 'liaisondecision' } } },
        { label: 'Decline', type: '-', key: `decline:${id}`, action: { type: 'invoke.function', data: { name: 'liaisondecision' } } },
      ]
    : [];
  return { id, chat_id: chatId, message: { text: lines.join('\n'), card: { title: 'Client Liaison', theme: 'modern-inline' }, ...(buttons.length ? { buttons } : {}) } };
}
