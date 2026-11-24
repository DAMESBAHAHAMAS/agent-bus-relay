// Per-customer usage, the basis for billing. Message text is never stored here: the Desk
// conversation is the transcript. One JSON line per event, one file per customer per month.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const expand = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
export const KINDS = ['message_in', 'message_out', 'task_touch', 'file_saved', 'escalation', 'blocked_outbound', 'opt_in', 'welcome_sent'];

export class UsageLedger {
  constructor(dir) { this.dir = expand(dir); }
  file(contactId, month) { return path.join(this.dir, String(contactId).replace(/[^A-Za-z0-9_-]/g, ''), `${month}.jsonl`); }
  record(contactId, kind, detail = {}, now = new Date()) {
    if (!KINDS.includes(kind)) throw new Error('UNKNOWN_KIND');
    const month = now.toISOString().slice(0, 7);
    const f = this.file(contactId, month);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const row = { ts: now.toISOString(), kind, ...detail };
    fs.appendFileSync(f, JSON.stringify(row) + '\n');
    return row;
  }
  events(contactId, month) {
    const f = this.file(contactId, month);
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  summary(contactId, month, weights) {
    const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
    for (const e of this.events(contactId, month)) counts[e.kind]++;
    const units = Object.entries(weights).reduce((s, [k, w]) => s + (counts[k] || 0) * w, 0);
    return { contact_id: contactId, month, counts, units };
  }
}

// Prepaid credit: what the customer paid minus what they used, both in currency.
export function prepaidBalance({ prepaidAmount, usedUnits, ratePerUnit, lowBalanceUnits }) {
  if (ratePerUnit == null) return { known: false, reason: 'rate_not_set' };
  const used = +(usedUnits * ratePerUnit).toFixed(2);
  const left = +(prepaidAmount - used).toFixed(2);
  return { known: true, used, left, low: left <= lowBalanceUnits * ratePerUnit };
}

// A Zoho Books invoice body for Damian to review. It is never sent from here.
export function draftInvoice({ booksCustomerId, customerName, summary, usage }) {
  if (!booksCustomerId) return { ready: false, reason: 'no_books_customer' };
  if (usage.rate_per_unit == null) return { ready: false, reason: 'rate_not_set' };
  const lines = [{
    name: 'AI assistant service',
    description: `${summary.month}: ${summary.counts.message_in} messages answered, ${summary.counts.task_touch} task updates, ${summary.counts.file_saved} files saved`,
    quantity: summary.units,
    rate: usage.rate_per_unit,
  }];
  if (usage.whatsapp_pass_through_per_message != null && summary.counts.message_out > 0) {
    lines.push({ name: 'WhatsApp messaging', description: `${summary.month}: ${summary.counts.message_out} messages sent (Meta charges passed through)`, quantity: summary.counts.message_out, rate: usage.whatsapp_pass_through_per_message });
  }
  return {
    ready: true,
    needs_damian_review: true,
    body: { customer_id: booksCustomerId, reference_number: `LIAISON-${summary.month}`, line_items: lines, notes: `Client Liaison usage for ${customerName}, ${summary.month}.` },
  };
}
