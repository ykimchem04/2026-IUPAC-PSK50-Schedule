const { boot, settle, ok, FIXTURE } = require('./harness.js');
const fs = require('fs');
const noFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });

// Two visits to the same origin share storage; a different origin does not.
const ORIGIN = 'https://ykimchem04.github.io/psk50/';
const OTHER = 'https://someone-else.github.io/psk50/';

const open = url => boot({ url, talks: FIXTURE, posters: null, fetchImpl: noFetch });

(async () => {
  console.log('\n[starring persists across a reload]');
  let w = open(ORIGIN);
  await settle();
  w.tab('sessions');
  ok(w.$('#planN').textContent === '0', 'starts empty');
  ok(w.$('#planClear').hidden, 'no Clear button with an empty plan');
  ok(w.$('#planToggle').disabled, 'My plan is disabled until something is starred');

  w.click(w.$('[data-star="S1"]'));
  w.click(w.$('[data-star="S10"]'));
  ok(w.$('#planN').textContent === '2', 'two tracks starred');
  ok(!w.$('#planClear').hidden, 'Clear appears');
  ok(!w.$('#planToggle').disabled, 'My plan becomes usable');
  const stored = w.localStorage.getItem('psk50.plan.v2');
  ok(stored && JSON.parse(stored).tracks.sort().join() === 'S1,S10',
     `written to storage as ${stored}`);

  console.log('\n[reload]');
  // Each jsdom window gets its own store, so a reload is modelled by seeding the
  // next window with exactly what the last one wrote.
  const reloaded = boot({ url: ORIGIN, talks: FIXTURE, posters: null, fetchImpl: noFetch,
                          storage: { 'psk50.plan.v2': stored } });
  await settle();
  ok(reloaded.$('#planN').textContent === '2', 'plan restored on the next visit');
  reloaded.tab('sessions');
  ok(reloaded.$('[data-star="S1"]').dataset.on === '1', 'S1 still shows as starred');
  ok(reloaded.$('[data-star="S2"]').dataset.on === '0', 'S2 does not');
  reloaded.click(reloaded.$('#planToggle'));
  ok(reloaded.$$('#v-sessions .trk').length === 2, 'and it still filters');

  console.log('\n[a copy handed to someone else opens clean]');
  const theirs = open(OTHER);
  await settle();
  ok(theirs.$('#planN').textContent === '0',
     'a different origin has its own storage — the plan does not travel in the file');
  ok(!fs.readFileSync('docs/index.html', 'utf8').includes('"tracks":["S1"'),
     'and nothing is baked into the published page');

  console.log('\n[clearing]');
  const c = boot({ url: ORIGIN, talks: FIXTURE, posters: null, fetchImpl: noFetch,
                   storage: { 'psk50.plan.v2': stored } });
  await settle();
  c.click(c.$('#planToggle'));
  c.click(c.$('#planClear'));
  ok(c.$('#planN').textContent === '0', 'counter resets');
  ok(c.$('#planClear').hidden, 'Clear hides itself again');
  ok(c.$('#planToggle').dataset.on === '0', 'the filter switches off with it');
  const cleared = JSON.parse(c.localStorage.getItem('psk50.plan.v2'));
  ok(cleared.tracks.length === 0 && cleared.talks.length === 0, 'storage emptied');
  c.tab('speakers');
  ok(c.$$('#v-speakers tbody tr').length === 278, 'all speakers visible again');

  console.log('\n[a stale track code is dropped, not carried]');
  const stale = boot({ url: ORIGIN, talks: FIXTURE, posters: null, fetchImpl: noFetch,
                       storage: { 'psk50.plan.v2': '{"tracks":["S1","S99","NOPE"],"talks":[]}' } });
  await settle();
  ok(stale.$('#planN').textContent === '1', 'only the code that still exists is restored');

  console.log('\n[storage unavailable — private mode, file://]');
  const blocked = boot({ url: 'file:///x/i.html', talks: FIXTURE, posters: null,
                         fetchImpl: noFetch, storageThrows: true });
  await settle();
  blocked.tab('sessions');
  blocked.click(blocked.$('[data-star="S1"]'));
  ok(blocked.$('#planN').textContent === '1', 'starring still works when storage throws');
  ok(blocked.$$('#v-sessions .trk').length === 26, 'the page is not broken by it');

  console.log('\n[export is still there alongside it]');
  ok(c.$('#planSave'), 'Export button rendered');
  ok(c.$('#planSave').textContent.trim() === 'Export', 'relabelled, since saving is now automatic');

  console.log('\nall plan tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
