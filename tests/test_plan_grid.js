const { boot, settle, ok } = require('./harness.js');
const noFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const ORIGIN = 'https://ykimchem04.github.io/psk50/';

// Same clash pair as test_picks.js — S1 and S10 overlap on the 30th — plus one
// talk with no room/time yet, to check the "can't be placed" note.
const FIX = { generated: '2026-09-05', talks: [
  { pid: '223', session: 'S1', type: 'Keynote', date: '2026-09-29', start: '10:50', end: '11:15',
    room: 'Room 101', chair: 'Cheoljae KIM', presenter: 'Martina Stenzel',
    affiliation: 'UNSW', title: 'Tadpole nanoparticles', abstract: 'A.' },
  { pid: '415', session: 'S1', type: 'Keynote', date: '2026-09-30', start: '10:20', end: '11:00',
    room: 'Room 101', chair: 'Chang-Geun CHAE', presenter: 'Sang Youl Kim',
    affiliation: 'KAIST', title: 'Colorless polyimides', abstract: 'C.' },
  { pid: '900', session: 'S10', type: 'Invited', date: '2026-09-30', start: '10:40', end: '11:05',
    room: 'Room 205', chair: 'Jaeup KIM', presenter: 'Charles Sing',
    affiliation: 'UIUC', title: 'Coarse-grained potentials', abstract: 'D.' },
  { pid: '999', session: 'S10', type: 'Invited', date: '0000-00-00', start: '00:00', end: '00:00',
    room: '', chair: '', presenter: 'Not yet scheduled',
    affiliation: 'Nowhere U', title: 'Undated talk' },
]};

const open = (o = {}) => boot({ url: ORIGIN, talks: FIX, posters: null, fetchImpl: noFetch, ...o });

(async () => {
  console.log('\n[no picks: no timeline]');
  const w = open();
  await settle();
  w.tab('talks');
  ok(!w.$('#v-talks .plantimeline'), 'nothing to draw with an empty plan');

  console.log('\n[one pick: one room, one block]');
  w.click(w.$('#v-talks [data-pick="223"]'));
  ok(w.$('#v-talks .plantimeline'), 'the timeline appears once something is picked');
  ok(w.$$('#v-talks .plan-day').length === 1, 'one day (the 29th) so far');
  ok(w.$$('#v-talks .plan-grid .dcol').length === 1, 'one room column');
  ok(w.$$('#v-talks .plan-seg').length === 1, 'one block');
  ok(w.$('#v-talks .plan-seg').dataset.goto === '223', 'tagged with its pid');
  ok(!w.$('#v-talks .plan-seg').dataset.clash, 'no clash yet');

  console.log('\n[a second day gets its own grid]');
  w.click(w.$('#v-talks [data-pick="415"]'));
  ok(w.$$('#v-talks .plan-day').length === 2, '29th and 30th both shown');

  console.log('\n[two rooms, overlapping: both blocks flagged]');
  w.click(w.$('#v-talks [data-pick="900"]'));
  const segs = w.$$('#v-talks .plan-seg');
  ok(segs.length === 3, 'three placed talks');
  const day30 = w.$$('#v-talks .plan-day')[1];
  ok(day30.querySelectorAll('.plan-grid .dcol').length === 2, 'two rooms on the 30th');
  ok(day30.querySelector('.plan-seg[data-goto="415"]').dataset.clash === '1',
     'the 10:20-11:00 talk is marked');
  ok(day30.querySelector('.plan-seg[data-goto="900"]').dataset.clash === '1',
     'so is the 10:40-11:05 one it overlaps');
  ok(day30.querySelector('.plan-seg[data-goto="415"]').title.includes('clashes'),
     'the tooltip says so too');

  console.log('\n[an undated pick is noted, not silently dropped]');
  w.click(w.$('#v-talks [data-pick="999"]'));
  ok(w.$$('#v-talks .plan-seg').length === 3, 'still three placed blocks');
  ok(w.$('#v-talks .plantimeline .note'), 'a note appears');
  ok(w.$('#v-talks .plantimeline .note').textContent.includes('1 picked talk'),
     'counting the one that could not be placed');

  console.log('\n[clicking a block does not throw, even without scrollIntoView]');
  w.click(day30.querySelector('.plan-seg[data-goto="415"]'));

  console.log('\nall plan grid tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
