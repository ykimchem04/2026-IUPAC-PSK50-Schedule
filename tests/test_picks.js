const { boot, settle, ok } = require('./harness.js');
const noFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const ORIGIN = 'https://ykimchem04.github.io/psk50/';

// S1 and S10 run at the same hour on the 30th — the real reason to pick talks
// rather than tracks, and the case the clash check exists for.
const FIX = { generated: '2026-09-05', talks: [
  { pid: '223', session: 'S1', type: 'Keynote', date: '2026-09-29', start: '10:50', end: '11:15',
    room: 'Room 101', chair: 'Cheoljae KIM', presenter: 'Martina Stenzel',
    affiliation: 'UNSW', title: 'Tadpole nanoparticles', abstract: 'A.' },
  { pid: '1633', session: 'S1', type: 'Invited', date: '2026-09-29', start: '11:15', end: '11:40',
    room: 'Room 101', chair: 'Cheoljae KIM', presenter: 'Hyun-jong Paik',
    affiliation: 'PNU', title: 'Chromatographic separation', abstract: 'B.' },
  { pid: '415', session: 'S1', type: 'Keynote', date: '2026-09-30', start: '10:20', end: '11:00',
    room: 'Room 101', chair: 'Chang-Geun CHAE', presenter: 'Sang Youl Kim',
    affiliation: 'KAIST', title: 'Colorless polyimides', abstract: 'C.' },
  { pid: '900', session: 'S10', type: 'Invited', date: '2026-09-30', start: '10:40', end: '11:05',
    room: 'Room 205', chair: 'Jaeup KIM', presenter: 'Charles Sing',
    affiliation: 'UIUC', title: 'Coarse-grained potentials', abstract: 'D.' },
]};

const open = (o = {}) => boot({ url: ORIGIN, talks: FIX, posters: null, fetchImpl: noFetch, ...o });

(async () => {
  console.log('\n[a star on every talk]');
  const w = open();
  await settle();
  w.tab('sessions');
  const s1 = w.$('[data-track="S1"]');
  w.openDetails(s1);
  ok(s1.querySelectorAll('[data-pick]').length === 3, 'each S1 talk carries its own star');
  ok(w.$('[data-pick="223"]').dataset.on === '0', 'nothing picked to begin with');
  ok(w.$('#planN').textContent === '0', 'counter empty');

  console.log('\n[picking a single talk]');
  w.click(w.$('[data-pick="223"]'));
  ok(w.$('[data-pick="223"]').dataset.on === '1', 'the talk is marked');
  ok(w.$('#planN').textContent === '1', 'counter counts talks, not just tracks');
  const saved = JSON.parse(w.localStorage.getItem('psk50.plan.v2'));
  ok(saved.talks.join() === '223' && saved.tracks.length === 0,
     'stored as a talk, separately from tracks');

  console.log('\n[picking a talk does not star its whole track]');
  ok(w.$('[data-star="S1"]').dataset.on === '0', 'the track star stays off');
  w.click(w.$('#planToggle'));
  ok(w.$$('#v-sessions .trk').length === 1, 'the plan filter still finds S1 through its talk');
  w.openDetails(w.$('[data-track="S1"]'));
  ok(w.$$('[data-track="S1"] .who').length === 1,
     'and shows only the picked talk, not the other two');
  w.click(w.$('#planToggle'));

  console.log('\n[a starred track still shows all of its talks]');
  w.click(w.$('[data-star="S1"]'));
  w.click(w.$('#planToggle'));
  w.openDetails(w.$('[data-track="S1"]'));
  ok(w.$$('[data-track="S1"] .who').length === 3,
     'starring the track means the whole room, so all three appear');
  w.click(w.$('[data-star="S1"]'));
  w.click(w.$('#planToggle'));

  console.log('\n[clash detection]');
  ok(w.$('#planClash').hidden, 'no clash with one talk picked');
  w.click(w.$('[data-pick="415"]'));
  ok(w.$('#planClash').hidden, 'still none — 29th and 30th do not overlap');
  w.click(w.$('[data-pick="900"]'));
  ok(!w.$('#planClash').hidden, '10:20-11:00 and 10:40-11:05 overlap, so a clash is flagged');
  ok(w.$('#planClash').textContent.includes('1 clash'), 'and counted');
  ok(w.$('[data-pick="415"]').dataset.clash === '1', 'both sides of the clash are marked');
  ok(w.$('[data-pick="900"]').dataset.clash === '1', 'not just the newer one');
  ok(!w.$('[data-pick="223"]').dataset.clash, 'the unrelated pick is left alone');

  w.tab('talks');
  ok(w.$('#v-talks .note.clash'), 'the Talks tab explains it in place');
  ok(w.$('#v-talks .note.clash').textContent.includes('two rooms at once'), 'in plain words');

  console.log('\n[removing one side resolves it]');
  w.click(w.$('#v-talks [data-pick="900"]'));
  ok(w.$('#planClash').hidden, 'clash clears');
  // Only the visible view is re-rendered; hidden ones are rebuilt on switch, so
  // scope the check to the tab actually on screen.
  ok(!w.$('#v-talks [data-pick="415"]').dataset.clash,
     'and the other side is unmarked again');
  w.tab('sessions');
  w.openDetails(w.$('[data-track="S1"]'));
  ok(!w.$('#v-sessions [data-pick="415"]').dataset.clash,
     'switching tabs rebuilds the other view without the stale mark');
  ok(w.$('#planN').textContent === '2', 'two picks left');

  console.log('\n[picks survive a reload]');
  const stored = w.localStorage.getItem('psk50.plan.v2');
  const back = open({ storage: { 'psk50.plan.v2': stored } });
  await settle();
  ok(back.$('#planN').textContent === '2', 'both picks restored');
  back.tab('sessions');
  back.openDetails(back.$('[data-track="S1"]'));
  ok(back.$('[data-pick="223"]').dataset.on === '1', 'the right talks are marked');
  ok(back.$('[data-pick="1633"]').dataset.on === '0', 'and the unpicked one is not');

  console.log('\n[a plan saved before talks could be picked still loads]');
  const legacy = open({ storage: { 'psk50.plan.v1': '["S1","S10"]' } });
  await settle();
  ok(legacy.$('#planN').textContent === '2', 'the old track-only format is read');
  legacy.tab('sessions');
  ok(legacy.$('[data-star="S1"]').dataset.on === '1', 'as starred tracks');

  console.log('\n[clear takes both]');
  const c = open({ storage: { 'psk50.plan.v2': JSON.stringify({ tracks: ['S1'], talks: ['223'] }) } });
  await settle();
  ok(c.$('#planN').textContent === '2', 'one track and one talk');
  c.click(c.$('#planClear'));
  ok(c.$('#planN').textContent === '0', 'both cleared');
  const after = JSON.parse(c.localStorage.getItem('psk50.plan.v2'));
  ok(after.tracks.length === 0 && after.talks.length === 0, 'storage emptied on both sides');

  console.log('\nall pick tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
