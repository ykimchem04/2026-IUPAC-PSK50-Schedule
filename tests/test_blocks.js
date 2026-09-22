const { boot, settle, ok } = require('./harness.js');
const noFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const ORIGIN = 'https://ykimchem04.github.io/psk50/';

// Two tracks in two rooms inside SP1's 10:50-12:20, one talk in a later block,
// and a plenary — which must not turn into a one-track disclosure.
const FIX = { generated: '2026-09-05', talks: [
  { pid: '223', session: 'S1', type: 'Keynote', date: '2026-09-29', start: '10:50', end: '11:15',
    room: 'Room 101', presenter: 'Martina Stenzel', title: 'Tadpole nanoparticles' },
  { pid: '224', session: 'S1', type: 'Invited', date: '2026-09-29', start: '11:15', end: '11:40',
    room: 'Room 101', presenter: 'Hyun-jong Paik', title: 'Chromatographic separation' },
  { pid: '900', session: 'S10', type: 'Invited', date: '2026-09-29', start: '11:00', end: '11:25',
    room: 'Room 109', presenter: 'Charles Sing', title: 'Coarse-grained potentials' },
  { pid: '301', session: 'S1', type: 'Invited', date: '2026-09-29', start: '15:00', end: '15:25',
    room: 'Room 101', presenter: 'Someone Else', title: 'A talk in SP2' },
  { pid: '999', session: 'PL', type: 'Plenary', date: '2026-09-29', start: '10:00', end: '10:40',
    room: 'Room 205', presenter: 'Takuzo Aida', title: 'Supramolecular polymerization' },
]};

const open = (o = {}) => boot({ url: ORIGIN, talks: FIX, posters: null, fetchImpl: noFetch, width: 1280, ...o });
const blockNamed = (w, text) => w.$$('#v-schedule .blk')
  .find(b => b.querySelector('.n').textContent.includes(text));

(async () => {
  console.log('\n[a parallel block opens to the tracks inside it]');
  const w = open();
  await settle();
  const sp1 = blockNamed(w, 'Scientific Program 1');
  ok(sp1, 'SP1 became a disclosure rather than a bare row');
  ok(sp1.tagName === 'DETAILS', 'and it is a real one');
  ok(sp1.querySelector('.r').textContent.trim() === '2 tracks',
     'counting tracks in the block, not talks');
  const rows = [...sp1.querySelectorAll('.inroom')];
  ok(rows.length === 2, 'one row per track');
  ok(rows[0].dataset.jump === 'S1' && rows[1].dataset.jump === 'S10',
     'in programme order, not the order the talks happen to be in');
  ok(rows[0].querySelector('.irr').textContent.trim() === 'Room 101', 'with its room');
  ok(rows[1].querySelector('.irr').textContent.trim() === 'Room 109', 'per track');

  console.log('\n[a block only claims the talks that overlap it]');
  // The 15:00 talk is SP2's, and SP2 runs one track, so it stays a plain row —
  // a disclosure that opens onto a single line is worse than no disclosure.
  ok(!blockNamed(w, 'Scientific Program 2'), 'SP2 is not a disclosure on this fixture');
  const sp2row = w.$$('#v-schedule .row').find(r => r.textContent.includes('Scientific Program 2'));
  ok(sp2row && sp2row.tagName !== 'DETAILS', 'it is still listed, just not expandable');

  console.log('\n[all-day rows do not swallow the programme]');
  // Registration runs 07:30-17:00 and overlaps every talk on the day; if it were
  // allowed to "contain" tracks it would claim all of them.
  const reg = w.$$('#v-schedule .row').find(r => r.textContent.includes('Registration'));
  ok(reg && reg.tagName !== 'DETAILS', 'Registration stays a plain row');
  const plenary = w.$$('#v-schedule .row').find(r => r.textContent.includes('Plenary Lecture 1'));
  ok(plenary && plenary.tagName !== 'DETAILS', 'and a plenary is not a one-track disclosure');

  console.log('\n[a track jumps to its running order]');
  w.click(rows[1]);
  ok(w.$('.tab[data-v="sessions"]').getAttribute('aria-selected') === 'true', 'Sessions opens');
  ok(w.$('#v-sessions [data-track="S10"]').open, 'with that track already unfolded');

  console.log('\n[without a scrape there is nothing to derive]');
  const bare = boot({ url: ORIGIN, talks: null, posters: null, fetchImpl: noFetch, width: 1280 });
  await settle();
  ok(!bare.$('#v-schedule .blk'), 'no disclosures');
  ok(bare.$('#v-schedule .note').textContent.includes('once a scrape has run'),
     'and the note says why rather than claiming nothing was published');

  console.log('\nall block tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
