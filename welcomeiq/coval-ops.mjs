// WelcomeIQ Coval operations for the accountable Claude Code session (Damian approved testing with no cost limit, 2026-10-18).
// Uses the WelcomeIQ-only OAuth sign-in (coval-oauth.mjs). Prints no credentials.
//   node coval-ops.mjs inventory          read-only: agents, test sets, personas, recent runs
//   node coval-ops.mjs result <run_id>    read-only: status and per-call metrics
//   node coval-ops.mjs run <preset>       starts ONE run from a named preset below; nothing else can be launched
import {remoteClient} from './coval-oauth.mjs';

const AGENT = 'GANBuxiCnWTkC6PYVFTC47'; // "My agent", calls the designated WelcomeIQ test number
const METRICS = ['422Q5Yoem7MyWbHkPHbF8Y', 'nnjctAC9urMbTUsaVGQXm8', 'asiU5hscj4CjWn6qRAmdda', 'aRtf5Tow8K3ZxtQzivYiGp',
  'NRM5evhy98nutHSLyMG9GX', 'HXnLU7V6gtU9gMdcDowLxY', '29BlkepvvX19ebbLDB0y6Q', 'fstokU4ev5UmT8sUBexiwV'];
const PRESETS = {
  // Same persona and test set as Arsalan's Oct 14/15 runs, so results compare like for like.
  baseline: {persona_id: 'gjxBaQEtnaBdEV6XJmjmfp', test_set_id: 'ickuZTc8', options: {iteration_count: 1, concurrency: 1}},
  stress: {persona_id: 'gjxBaQEtnaBdEV6XJmjmfp', test_set_id: 'WzYj6KAm', options: {iteration_count: 1, concurrency: 1}},
  concurrent3: {persona_id: 'gjxBaQEtnaBdEV6XJmjmfp', test_set_id: 'ickuZTc8', options: {iteration_count: 2, concurrency: 3}},
};

async function call(c, name, args = {}) {
  const r = await c.callTool({name, arguments: args});
  const text = (r.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
  if (r.isError) throw Error(name + ' refused: ' + text.slice(0, 200));
  return JSON.parse(text);
}

const [mode, arg] = process.argv.slice(2);
const c = await remoteClient();
try {
  if (mode === 'inventory') {
    const agents = (await call(c, 'list_agents', {page_size: 50})).agents;
    const sets = (await call(c, 'list_test_sets', {page_size: 50})).test_sets;
    const personas = (await call(c, 'list_personas', {page_size: 50})).personas;
    const runs = (await call(c, 'list_runs', {page_size: 10})).runs;
    console.log(JSON.stringify({
      agents: agents.map(a => ({id: a.id, name: a.display_name, type: a.model_type, metrics: a.metric_ids.length})),
      test_sets: sets.map(s => ({id: s.id, name: s.display_name, description: s.description})),
      personas: personas.map(p => ({id: p.id, name: p.display_name})),
      runs: runs.map(r => ({id: r.run_id, name: r.display_name, status: r.status, created: r.create_time, test_set: r.test_set_id})),
    }, null, 1));
  } else if (mode === 'result' && arg) {
    const run = (await call(c, 'get_run', {run_id: arg})).run;
    console.log(JSON.stringify({id: run.run_id, status: run.status, created: run.create_time, updated: run.update_time, error: run.error, progress: run.progress}));
    for (const m of Object.values(run.results?.metrics ?? {}))
      console.log(m.metric_name.replace(/\s+/g, ' ').padEnd(32), JSON.stringify(m.values.map(v => typeof v.value === 'number' ? Math.round(v.value * 100) / 100 : v.value)));
  } else if (mode === 'run' && PRESETS[arg]) {
    const r = await call(c, 'create_run', {agent_id: AGENT, metric_ids: METRICS, ...PRESETS[arg],
      tags: ['welcomeiq', 'claude-code', arg, new Date().toISOString().slice(0, 10)]});
    console.log(JSON.stringify({started: r.run.run_id, status: r.run.status, preset: arg}));
  } else {
    console.error('Use: inventory | result <run_id> | run <' + Object.keys(PRESETS).join('|') + '>');
    process.exitCode = 2;
  }
} finally {
  await c.close();
}
