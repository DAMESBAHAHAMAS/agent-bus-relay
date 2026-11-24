// The outside systems the agent touches. Each one is wired at the channel step, on Damian's Mac,
// reading credentials by reference from Keychain the way the other agents do. Until then every call
// refuses, so nothing here can reach a live system by accident.
const notWired = (name) => async () => { const e = new Error(`NOT_WIRED: ${name}`); e.code = 'NOT_WIRED'; throw e; };
export function createAdapters(overrides = {}) {
  return {
    crm: { findContactByPhone: notWired('crm.findContactByPhone'), recordOptIn: notWired('crm.recordOptIn'), ...overrides.crm },
    projects: { listTasks: notWired('projects.listTasks'), getTask: notWired('projects.getTask'), addComment: notWired('projects.addComment'), attachFile: notWired('projects.attachFile'), ...overrides.projects },
    desk: { send: notWired('desk.send'), ...overrides.desk },
    cliq: { post: notWired('cliq.post'), ...overrides.cliq },
  };
}
