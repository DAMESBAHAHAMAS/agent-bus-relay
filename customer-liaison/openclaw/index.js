// OpenClaw plugin: gives the client-liaison agent, and no other agent, its five tools.
// Every tool takes the session token from the customer message frame. Nothing else identifies a customer.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const HOME = process.env.CUSTOMER_LIAISON_HOME || path.join(os.homedir(), 'Developer', 'agent-bus-relay', 'customer-liaison');
const STATE = path.join(os.homedir(), '.customer-liaison');
const AGENT = 'client-liaison';
const load = (rel) => import(pathToFileURL(path.join(HOME, rel)).href);
const TOKEN = { type: 'string', pattern: '^[A-Za-z0-9_-]{32}$' };

const SPECS = {
  liaison_tasks: { label: 'List this customer\'s open tasks', description: 'Open tasks in the one project this customer is approved for.', properties: { token: TOKEN }, required: ['token'] },
  liaison_comment: { label: 'Comment on one of their tasks', description: 'Adds a comment starting with [Assistant] to a task in this customer\'s project.', properties: { token: TOKEN, task_id: { type: 'string', maxLength: 40 }, text: { type: 'string', maxLength: 1000 } }, required: ['token', 'task_id', 'text'] },
  liaison_save_file: { label: 'Save a file they sent to a task', description: 'Attaches the file from this customer message to a task in their project.', properties: { token: TOKEN, task_id: { type: 'string', maxLength: 40 }, attachment: { type: 'object' } }, required: ['token', 'task_id', 'attachment'] },
  liaison_reply: { label: 'Reply to the customer on WhatsApp', description: 'Sends one reply to this customer only. Checked for money, credentials, numbers and links, and held outside client hours.', properties: { token: TOKEN, text: { type: 'string', maxLength: 1000 } }, required: ['token', 'text'] },
  liaison_ask_damian: { label: 'Ask Damian', description: 'Sends Damian a Cliq card for: complete_task, change_due_date, add_task, send_template, or other.', properties: { token: TOKEN, action: { type: 'string', enum: ['complete_task', 'change_due_date', 'add_task', 'send_template', 'other'] }, task_id: { type: 'string', maxLength: 40 }, note: { type: 'string', maxLength: 600 } }, required: ['token', 'action', 'note'] },
};

let depsPromise = null;
async function deps() {
  depsPromise ??= (async () => {
    const [{ SessionStore }, { UsageLedger }, { createAdapters }] = await Promise.all([load('lib/sessions.mjs'), load('lib/usage.mjs'), load('lib/adapters.mjs')]);
    const config = JSON.parse(fs.readFileSync(path.join(STATE, 'config.json'), 'utf8'));
    const wired = fs.existsSync(path.join(STATE, 'adapters.mjs')) ? (await import(pathToFileURL(path.join(STATE, 'adapters.mjs')).href)).default : {};
    return { config, sessions: new SessionStore({ file: path.join(STATE, 'sessions.json') }), ledger: new UsageLedger(config.ledger_dir), adapters: createAdapters(wired) };
  })();
  return depsPromise;
}

export default {
  id: 'customer-liaison',
  name: 'Client Liaison',
  register(api) {
    for (const [name, spec] of Object.entries(SPECS)) {
      api.registerTool((ctx) => {
        if (ctx.agentId !== AGENT) return null;
        return {
          name, label: spec.label, description: spec.description,
          parameters: { type: 'object', properties: spec.properties, required: spec.required, additionalProperties: false },
          async execute(_id, args) {
            if (ctx.agentId !== AGENT) throw Error('DENIED');
            ctx.assertInvocationCurrent?.();
            try {
              const { tools } = await load('lib/tools.mjs');
              const out = await tools[name](args, await deps());
              return { content: [{ type: 'text', text: JSON.stringify(out) }], details: out };
            } catch (e) {
              const d = { ok: false, error: e.code || 'FAILED', note: 'Nothing was done. Tell the customer Damian will follow up, and use liaison_ask_damian.' };
              return { content: [{ type: 'text', text: JSON.stringify(d) }], details: d, isError: true };
            }
          },
        };
      }, { name, optional: true });
    }
  },
};
