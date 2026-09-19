const { boot, settle, ok } = require('./harness.js');
const noFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const ORIGIN = 'https://ykimchem04.github.io/psk50/';

// The same overlapping pair as test_picks.js, plus one talk the search has to
// find by presenter rather than title.
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
]};

const open = (o = {}) => boot({ url: ORIGIN, talks: FIX, posters: null, fetchImpl: noFetch, ...o });
const type = (w, value) => {
  const input = w.$('#planAdd');
  input.value = value;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
};

(async () => {
  console.log('\n[the tab exists and opens empty]');
  const w = open();
  await settle();
  w.tab('plan');
  ok(!w.$('#v-plan').hidden, 'the My plan view is showing');
  ok(w.$('#v-plan h2').textContent.trim() === 'My plan', 'no counts when there is nothing to count');
  ok(w.$('#v-plan .lede').textContent.includes('Nothing planned yet'), 'and it says so');
  ok(w.$('#planAdd'), 'the add-a-talk search is there even when the plan is empty');
  ok(w.$('#planAddResults').textContent.includes('Type a name'),
     'no results until something is typed — 500 rows is not a starting point');

  console.log('\n[searching finds a talk to add]');
  type(w, 'polyimides');
  await settle(200);
  ok(w.$$('#planAddResults .prow').length === 1, 'one match');
  ok(w.$('#planAddResults [data-pick="415"]').textContent.trim() === 'Add', 'offered as Add');

  console.log('\n[adding it builds the agenda]');
  w.click(w.$('#planAddResults [data-pick="415"]'));
  ok(w.$('#planN').textContent === '1', 'the header counter moves');
  ok(w.$('#v-plan h2').textContent.includes('1 talk'), 'so does the heading');
  ok(w.$('#planAdd').value === 'polyimides', 'the search survives the re-render');
  ok(w.$('#planAddResults [data-pick="415"]').textContent.trim() === 'Added',
     'the same row now reads Added');
  const agenda = w.$$('#v-plan .prow').filter(r => r.querySelector('button')?.textContent.trim() === 'Remove');
  ok(agenda.length === 1, 'and it appears once in the agenda, with a Remove');

  console.log('\n[a clash is spelled out at the top]');
  type(w, 'Coarse-grained');
  await settle(200);
  w.click(w.$('#planAddResults [data-pick="900"]'));
  ok(w.$('#v-plan .note.clash'), 'the callout appears');
  ok(w.$('#v-plan .note.clash').textContent.includes('1 of these overlap'), 'counting pairs, not talks');
  ok(w.$$('#v-plan .prow.clash').length === 2, 'both agenda rows are marked');

  console.log('\n[the room grid rides along in this tab, not in Talks]');
  ok(w.$('#v-plan .plantimeline'), 'the grid is here');
  w.tab('talks');
  ok(!w.$('#v-talks .plantimeline'), 'and no longer duplicated in Talks');

  console.log('\n[removing from the agenda]');
  w.tab('plan');
  const remove = w.$$('#v-plan .prow button[data-pick]')
    .find(b => b.textContent.trim() === 'Remove' && b.dataset.pick === '900');
  w.click(remove);
  ok(w.$('#planN').textContent === '1', 'the pick is gone');
  ok(!w.$('#v-plan .note.clash'), 'and the clash callout with it');

  console.log('\n[starred tracks are listed and removable here too]');
  w.tab('sessions');
  w.click(w.$('[data-star="S1"]'));
  w.tab('plan');
  ok(w.$('#v-plan h2').textContent.includes('1 starred track'), 'counted in the heading');
  const starRow = w.$('#v-plan .prow button[data-star="S1"]');
  ok(starRow, 'and listed with its own Remove');
  w.click(starRow);
  ok(!w.$('#v-plan .prow button[data-star="S1"]'),
     'removing it redraws the tab — the row goes, rather than sitting there stale');
  ok(!w.$('#v-plan h2').textContent.includes('starred track'), 'and the heading drops it');

  console.log('\nall plan tab tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
