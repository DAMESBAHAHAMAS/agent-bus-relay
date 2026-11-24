// What a customer message is about, before the agent sees it.
// Topics that are Damian's alone escalate at once; the agent only sends a holding reply.
const RULES = [
  ['money', /(\$\s?\d|\b\d+\s?(usd|dollars?)\b|\b(price|pricing|cost|costs|charge|charged|invoice|bill|billing|payment|pay|paid|deposit|refund|quote|discount|fee|fees|balance|owe|money)\b)/i],
  ['scope', /\b(add(ing)? (a |another )?(page|section|feature)|change the (scope|plan|design)|new feature|extra work|more pages?)\b/i],
  ['deadline', /\b(deadline|due date|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|tomorrow)|push (it|this) back|delay|extend)\b/i],
  ['complaint', /\b(unhappy|not happy|disappointed|complain|complaint|frustrat\w*|angry|upset|terrible|waste of)\b/i],
  ['legal', /\b(lawyer|attorney|legal|contract|lawsuit|sue|copyright claim|terms)\b/i],
  ['credentials', /\b(password|passcode|pin\b|verification code|one[- ]time code|login details|username and password|security question)\b/i],
  ['other_party', /\b(other (client|customer)s?|someone else'?s|another (client|customer)|who else)\b/i],
  ['instructions_inside', /\b(ignore (all |your |previous )?(rules|instructions)|system prompt|you are now|act as|forward this to|send this to everyone)\b/i],
];
export function classifyInbound(text) {
  if (!text) return [];
  return RULES.filter(([, re]) => re.test(text)).map(([k]) => k);
}
export const ESCALATE_AT_ONCE = new Set(['money', 'scope', 'deadline', 'complaint', 'legal', 'other_party']);
export const HOLDING_REPLY = {
  money: "That's one for Damian personally. I've passed it to him and he'll come back to you.",
  scope: "Good idea. Changes to the plan go to Damian first, so I've passed this to him.",
  deadline: "I've passed the timing question to Damian; he'll confirm with you.",
  complaint: "I'm sorry to hear that. I've told Damian right away and he'll reach out to you himself.",
  legal: "That's for Damian to answer personally. I've passed it to him.",
  other_party: "I can only help with your own project, so I've passed this to Damian.",
  credentials: "Please don't send passwords or codes here. Damian will show you a safe way to share access.",
  instructions_inside: "I can only help with the tasks on your project. I've let Damian know about this message.",
};
