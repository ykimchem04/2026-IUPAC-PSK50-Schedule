const { boot, settle, ok } = require('./harness.js');
const noFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
const SITE = 'https://ykimchem04.github.io/psk50/';

// A plan lives in one browser's localStorage, so a laptop's stars never reach a
// phone. These cover the only bridge there is: the plan travelling in the URL.
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

const open = (o = {}) => boot({ url: SITE, talks: FIX, posters: null, fetchImpl: noFetch, ...o });
const stored = w => JSON.parse(w.localStorage.getItem('psk50.plan.v2') || 'null');

(async () => {
  console.log('\n[the laptop: a plan becomes a link]');
  const laptop = open({
    storage: { 'psk50.plan.v2': JSON.stringify({ tracks: ['S1'], talks: ['223', '415'] }) },
  });
  await settle();
  laptop.tab('plan');
  const link = laptop.$('#planLink').value;
  ok(link.startsWith(SITE), 'the link points at the site, not at this machine');
  ok(link.includes('#plan='), 'and carries the plan in the fragment');
  // The fragment is the half of a URL browsers never put on the wire.
  ok(decodeURIComponent(link.split('#plan=')[1]) === 'S1;223,415',
     'tracks before the semicolon, talks after — no server, no id, just the plan');

  console.log('\n[the phone: an empty device follows it]');
  const phone = open({ url: link });
  await settle();
  ok(phone.$('#planN').textContent === '3', 'the plan arrives whole');
  ok(phone.$('.tab[data-v="plan"]').getAttribute('aria-selected') === 'true',
     'and lands on My plan — following a plan link is asking for the plan');
  const saved = stored(phone);
  ok(saved && saved.talks.join() === '223,415' && saved.tracks.join() === 'S1',
     'written to this device, so a reload keeps it');
  ok(phone.$('#v-plan .note').textContent.includes('2 talks and 1 track'),
     'and it says what it brought');

  console.log('\n[the address bar is left clean]');
  ok(!phone.location.hash.includes('plan='),
     'the link is spent once read — a reload must not re-apply a stale plan');

  console.log('\n[a second device merges rather than overwrites]');
  const mine = open({
    url: SITE + '#plan=;900',
    storage: { 'psk50.plan.v2': JSON.stringify({ tracks: [], talks: ['223'] }) },
  });
  await settle();
  ok(mine.$('#planN').textContent === '2', 'what was already here survives the link');
  ok(stored(mine).talks.join() === '223,900', 'the link only adds');
  ok(mine.$('#v-plan .note').textContent.includes('1 talk'), 'reported as one talk, not two');

  console.log('\n[a link that says nothing new]');
  const again = open({
    url: SITE + '#plan=;223',
    storage: { 'psk50.plan.v2': JSON.stringify({ tracks: [], talks: ['223'] }) },
  });
  await settle();
  ok(again.$('#planN').textContent === '1', 'nothing doubles up');
  ok(again.$('#v-plan .note').textContent.includes('already'), 'and it says so rather than claiming a merge');

  console.log('\n[an unstarrable code in a link is dropped, not trusted]');
  const junk = open({ url: SITE + '#plan=NOPE;223' });
  await settle();
  ok(!junk.$('#v-plan h2').textContent.includes('starred track'), 'a track that does not exist is ignored');
  ok(junk.$('#planN').textContent === '1', 'the talk still lands');

  console.log('\n[no link, no change of behaviour]');
  const plain = open();
  await settle();
  ok(plain.$('.tab[data-v="schedule"]').getAttribute('aria-selected') === 'true',
     'the site still opens on Schedule');
  plain.tab('plan');
  ok(!plain.$('#v-plan').innerHTML.includes('Merged in'), 'and claims no merge');

  console.log('\n[an empty plan has no link to offer]');
  ok(!plain.$('#planLink'), 'nothing to share until something is picked');

  console.log('\nall plan share tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
