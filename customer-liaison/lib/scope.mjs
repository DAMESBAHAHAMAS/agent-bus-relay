// What the agent may do, decided in code. The agent never names a project: the session carries it.
export const ALLOWED = new Set(['list_tasks', 'get_task', 'comment_task', 'save_file', 'send_reply', 'ask_damian']);
export const NEEDS_DAMIAN = new Set(['complete_task', 'change_due_date', 'add_task', 'send_template']);

export class ScopeError extends Error { constructor(code) { super(code); this.code = code; } }

export function authorize(action, session, target = {}) {
  if (!session || !session.project_id || !session.contact_id) throw new ScopeError('NO_SESSION');
  if (target.project_id && String(target.project_id) !== String(session.project_id)) throw new ScopeError('OTHER_PROJECT');
  if (target.phone && target.phone !== session.phone) throw new ScopeError('OTHER_NUMBER');
  if (ALLOWED.has(action)) return { decision: 'allow' };
  if (NEEDS_DAMIAN.has(action)) return { decision: 'ask_damian' };
  throw new ScopeError('ACTION_DENIED');
}
