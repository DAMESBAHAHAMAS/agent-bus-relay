// Short-lived session tokens: the gate issues one per approved conversation turn.
// The agent's tools take only this token, so the agent cannot pick a customer, a number or a project.
// The receiver and the OpenClaw plugin run in different processes, so the store can live in a file (mode 600).
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export class SessionStore {
  constructor({ ttlMs = 30 * 60000, file = null } = {}) { this.ttlMs = ttlMs; this.file = file; this.map = new Map(); }
  load() {
    if (!this.file || !fs.existsSync(this.file)) return;
    this.map = new Map(Object.entries(JSON.parse(fs.readFileSync(this.file, 'utf8'))));
  }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map)), { mode: 0o600 });
  }
  issue(session, now = Date.now()) {
    this.load();
    for (const [k, v] of this.map) if (v.expires < now) this.map.delete(k);
    const token = randomBytes(24).toString('base64url');
    this.map.set(token, { ...session, expires: now + this.ttlMs });
    this.save();
    return token;
  }
  get(token, now = Date.now()) {
    this.load();
    const s = this.map.get(token);
    if (!s || s.expires < now) return null;
    return s;
  }
}
