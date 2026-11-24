// Phone numbers are compared only in E.164 form (+ and digits), never as typed.
export function toE164(raw, defaultCountry = '1') {
  if (raw == null) return null;
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  let out;
  if (s.startsWith('+')) out = '+' + digits;
  else if (digits.length === 10) out = '+' + defaultCountry + digits;
  else out = '+' + digits;
  return /^\+[1-9]\d{7,14}$/.test(out) ? out : null;
}
export const samePhone = (a, b) => { const x = toE164(a), y = toE164(b); return !!x && x === y; };
