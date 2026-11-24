// The Client Liaison's whole toolbox. Every tool takes the session token the gate issued;
// the project, the customer and the number come from the token, never from the agent.
import { authorize, NEEDS_DAMIAN } from './scope.mjs';
import { checkOutbound } from './outbound-guard.mjs';
import { buildEscalation } from './escalation.mjs';
import { sendReply } from './pipeline.mjs';

const session = (deps, token) => {
  const s = deps.sessions.get(token, (deps.now ?? new Date()).getTime());
  if (!s) { const e = new Error('SESSION_EXPIRED'); e.code = 'SESSION_EXPIRED'; throw e; }
  return s;
};
async function ownTask(deps, s, taskId) {
  const t = await deps.adapters.projects.getTask(s.project_id, taskId);
  authorize('get_task', s, { project_id: t?.project_id });
  if (!t) { const e = new Error('TASK_NOT_FOUND'); e.code = 'TASK_NOT_FOUND'; throw e; }
  return t;
}

export const tools = {
  async liaison_tasks({ token }, deps) {
    const s = session(deps, token); authorize('list_tasks', s);
    const tasks = await deps.adapters.projects.listTasks(s.project_id);
    return tasks.filter((t) => String(t.project_id) === s.project_id && !t.completed).map((t) => ({ id: t.id, name: t.name, due: t.due ?? null, status: t.status ?? null }));
  },
  async liaison_comment({ token, task_id, text }, deps) {
    const s = session(deps, token); authorize('comment_task', s);
    const t = await ownTask(deps, s, task_id);
    const g = checkOutbound(text, { linkAllowlist: deps.config.link_allowlist });
    if (!g.ok) return { saved: false, reasons: g.reasons };
    await deps.adapters.projects.addComment(s.project_id, t.id, `[Assistant] ${text}`);
    deps.ledger.record(s.contact_id, 'task_touch', { project_id: s.project_id, task_id: t.id });
    return { saved: true };
  },
  async liaison_save_file({ token, task_id, attachment }, deps) {
    const s = session(deps, token); authorize('save_file', s);
    const t = await ownTask(deps, s, task_id);
    await deps.adapters.projects.attachFile(s.project_id, t.id, attachment);
    deps.ledger.record(s.contact_id, 'file_saved', { project_id: s.project_id, task_id: t.id });
    return { saved: true };
  },
  async liaison_reply({ token, text }, deps) {
    const s = session(deps, token);
    const r = await sendReply({ token, text }, { ...deps, desk: deps.adapters.desk, contactTimeZone: s.time_zone ?? deps.config.default_time_zone ?? 'America/New_York' });
    if (r.escalate) {
      const esc = buildEscalation({ chatId: deps.config.escalation_cliq_chat_id, customerName: s.name, reason: `reply blocked (${r.reasons.join(', ')})`, text: null });
      await deps.adapters.cliq.post(esc);
    }
    return r;
  },
  async liaison_ask_damian({ token, action, task_id = null, note }, deps) {
    const s = session(deps, token);
    if (!NEEDS_DAMIAN.has(action) && action !== 'other') { const e = new Error('ACTION_DENIED'); e.code = 'ACTION_DENIED'; throw e; }
    const t = task_id ? await ownTask(deps, s, task_id) : null;
    const esc = buildEscalation({ chatId: deps.config.escalation_cliq_chat_id, customerName: s.name, reason: action, text: note, taskName: t?.name ?? null, proposedAction: action === 'other' ? null : `${action.replace(/_/g, ' ')}${t ? ` on "${t.name}"` : ''}` });
    await deps.adapters.cliq.post(esc);
    deps.ledger.record(s.contact_id, 'escalation', { project_id: s.project_id, reason: action });
    return { asked: true, escalation_id: esc.id };
  },
};
