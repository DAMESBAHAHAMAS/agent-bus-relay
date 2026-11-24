// When the agent may message a customer: weekdays 10:00-16:00 in the customer's time zone,
// never on Saturday or a closed date (Shabbat and Jewish holidays are kept as closed dates),
// and outside the window only as a reply within a few minutes of the customer's own message.
// Friday gets no grace after the window, so nothing goes out as Shabbat begins.
function localParts(now, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const o = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
  return { date: `${o.year}-${o.month}-${o.day}`, weekday: wd, minutes: (+o.hour % 24) * 60 + +o.minute };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function canMessageNow({ now = new Date(), timeZone, hours, closedDates = [], lastInboundAt = null }) {
  const l = localParts(now, timeZone);
  if (closedDates.includes(l.date)) return { ok: false, reason: 'closed_date' };
  if (l.weekday === 6) return { ok: false, reason: 'saturday' };
  const inWindow = hours.weekdays.includes(l.weekday) && l.minutes >= toMin(hours.start) && l.minutes < toMin(hours.end);
  if (inWindow) return { ok: true, reason: 'in_window' };
  const grace = (hours.reply_grace_minutes ?? 3) * 60000;
  const recent = lastInboundAt && now - new Date(lastInboundAt) >= 0 && now - new Date(lastInboundAt) <= grace;
  if (recent && l.weekday !== 5) return { ok: true, reason: 'reply_grace' };
  return { ok: false, reason: 'outside_hours' };
}
