// Every reply is checked before it can go out. A failed check never sends; it escalates instead.
const luhn = (d) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
const CHECKS = [
  ['money', (t) => /(\$\s?\d|\b\d+(\.\d+)?\s?(usd|dollars?)\b|\b(price|pricing|invoice|payment|deposit|refund|quote|discount|you owe|balance due|fee)\b)/i.test(t)],
  ['credential', (t) => /\b(password|passcode|api[ _-]?key|secret|token|verification code|one[- ]time code)\b\s*[:=]?\s*\S{4,}/i.test(t) || /\bsk-[A-Za-z0-9]{16,}/.test(t) || /\b1000\.[0-9a-f]{20,}/.test(t)],
  ['card_number', (t) => (t.match(/\b(?:\d[ -]?){13,19}\b/g) || []).some((m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && luhn(d); })],
  ['id_number', (t) => /\b\d{3}-\d{2}-\d{4}\b/.test(t) || /\b\d{2}-\d{7}\b/.test(t)],
  ['phone_number', (t) => (t.match(/\+?\d[\d\s().-]{8,}\d/g) || []).some((m) => m.replace(/\D/g, '').length >= 10 && !/^\d{4}-\d{2}-\d{2}$/.test(m.trim()))],
  ['impersonation', (t) => /\b(this is damian|i am damian|i'm damian)\b(?!['\u2019]s)/i.test(t)],
];
export function checkOutbound(text, { linkAllowlist = [] } = {}) {
  const reasons = [];
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reasons: ['empty'] };
  if (text.length > 1000) reasons.push('too_long');
  for (const [k, f] of CHECKS) if (f(text)) reasons.push(k);
  for (const url of text.match(/https?:\/\/[^\s)]+/gi) || []) {
    if (!linkAllowlist.some((p) => url.toLowerCase().startsWith(p.toLowerCase()))) { reasons.push('link_not_allowed'); break; }
  }
  return { ok: reasons.length === 0, reasons };
}
