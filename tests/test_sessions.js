const fs = require('fs');
const { JSDOM } = require('jsdom');
const { withTalks } = require('./harness.js');
const talksJson = JSON.stringify(require('./harness.js').FIXTURE);
const FIX = JSON.parse(talksJson);
const s1Talks = FIX.talks.filter(t => t.session === 'S1');
const nS1 = s1Talks.length;
const nChairs = new Set(s1Talks.map(t => t.chair).filter(Boolean)).size;
const nDays = new Set(s1Talks.map(t => t.date).filter(Boolean)).size;
const html = withTalks(FIX);
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok  ' + m); };

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://x.github.io/p/' });
const w = dom.window;
w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(talksJson) });
w.eval(html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')));
const $ = s => w.document.querySelector(s);
const $$ = s => [...w.document.querySelectorAll(s)];
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const settle = () => new Promise(r => setTimeout(r, 60));

// jsdom does not toggle <details> on summary click, so drive `open` directly —
// that is what the browser's default action does.
const openDetails = d => { d.open = true; d.dispatchEvent(new w.Event('toggle')); };

(async () => {
  await settle();
  click($$('.tab').find(t => t.dataset.v === 'sessions'));

  console.log('\n[tracks start collapsed]');
  ok($$('#v-sessions .trk').length === 26, '26 tracks listed');
  ok($$('#v-sessions .trk[open]').length === 0, 'all collapsed on arrival');
  const s1 = $('[data-track="S1"]');
  ok(s1.querySelector('.trk-t').textContent.includes('Polymer Synthesis'), 'S1 titled');
  ok(s1.querySelector('.count').textContent.includes(`${nS1} talks`),
     'header counts scraped talks, not the static invited list');
  ok($('[data-track="S2"] .count').textContent.includes('invited'),
     'a track with no scraped talks still counts its invited speakers');

  console.log('\n[open a track: running order by time]');
  openDetails(s1);
  const rows = [...s1.querySelectorAll('.who')];
  ok(rows.length === nS1, `${nS1} speakers listed`);
  const times = rows.map(r => r.querySelector('.w-t').textContent.trim());
  ok(times.join() === s1Talks.slice().sort((a,b)=>((a.date||'')+(a.start||'')).localeCompare((b.date||'')+(b.start||''))).map(t=>`${t.start}–${t.end}`).join(),
     'ordered by date then start time, across days');
  ok(rows[0].querySelector('.w-n b').textContent.includes('Martina Stenzel'), 'presenter shown');
  ok(rows[0].querySelector('.w-n i').textContent.includes('University of New South Wales'),
     'affiliation shown');
  ok(rows[0].querySelector('.w-n i').textContent.includes('Keynote'), 'type shown');

  const bars = [...s1.querySelectorAll('.daybar')].map(b => b.textContent);
  ok(bars.length === nDays, `${nDays} day dividers`);
  ok(bars[0].includes('Room 101'), 'day divider names the room');
  ok([...s1.querySelectorAll('.chairbar')].length === nChairs, `${nChairs} chair dividers`);

  console.log('\n[open a speaker: talk unfolds in place]');
  const first = s1.querySelector('.who[data-talk]');
  ok(!first.open, 'talk starts folded');
  // <details> keeps its contents in the DOM and lets the browser hide them, so the
  // test is that it is closed — not that the text is absent. Being in the DOM is
  // the point: the browser's own Ctrl+F still finds a folded abstract.
  ok(first.querySelector('.w-body').textContent.includes('Nanoparticles are widely'),
     'abstract is in the DOM while folded, so in-page find still reaches it');
  ok(first.getAttribute('open') === null, 'no open attribute until asked');
  openDetails(first);
  ok(first.open, 'talk unfolds');
  ok(first.querySelector('h4').textContent.includes('tadpole-shaped'), 'title revealed');
  ok(first.querySelector('.abs').textContent.includes('mRNA vaccines'), 'abstract revealed');
  const meta = el => Object.fromEntries([...el.querySelectorAll('.w-meta dl > div')]
    .map(r => [r.querySelector('dt').textContent, r.querySelector('dd').textContent]));
  const m = meta(first);
  ok(m['Abstract no.'] === 'KES1-0142', 'abstract number in the metadata rail');
  ok(m['Presenter'].includes('Martina Stenzel'), 'presenter in the rail');
  ok(m['Room'] === 'Room 101' && m['Chair'] === 'Cheoljae KIM', 'room and chair in the rail');
  ok(first.querySelector('.w-main .abs') && !first.querySelector('.w-meta .abs'),
     'abstract stays in the reading column, metadata beside it');
  ok(first.querySelector('.w-meta .src a').href.includes('pid=223'),
     'source link sits in the rail');
  ok(w.document.querySelector('#v-sessions'), 'still on the Sessions tab — no navigation');

  const co = s1.querySelectorAll('.who[data-talk]')[1];
  openDetails(co);
  ok(meta(co)['Co-authors'].includes('Myungeun Seo'), 'co-authors shown when present');
  const noAbs = [...s1.querySelectorAll('.who[data-talk]')]
    .find(d => d.querySelector('.w-n b').textContent.includes('Chihiro'));
  openDetails(noAbs);
  ok(noAbs.querySelector('.abs.none'), 'a talk without an abstract says so rather than showing blank');

  console.log('\n[open state survives a re-render]');
  click(s1.querySelector('.star'));
  ok($('#planN').textContent === '1', 'star registered');
  ok($('[data-track="S1"]').open, 'track still open after starring');
  ok($('[data-talk="223"]').open, 'the opened talk is still open');
  ok(!$('[data-track="S2"]').open, 'an untouched track did not spring open');

  console.log('\n[search]');
  $('#q').value = 'oxindole';
  $('#q').dispatchEvent(new w.Event('input'));
  await new Promise(r => setTimeout(r, 260));
  ok($$('#v-sessions .trk').length === 1, 'only the matching track survives');
  ok($$('#v-sessions .who').length === 1, 'only the matching talk inside it');
  ok($('#v-sessions .trk').open, 'matching track auto-opens so the hit is visible');
  ok($('#v-sessions').innerHTML.includes('<mark>'), 'hit highlighted');

  $('#q').value = 'Cheoljae';
  $('#q').dispatchEvent(new w.Event('input'));
  await new Promise(r => setTimeout(r, 260));
  const nCheoljae = FIX.talks.filter(t => t.chair === 'Cheoljae KIM').length;
  ok($$('#v-sessions .who').length === nCheoljae,
     `searching a chair finds the ${nCheoljae} talks they chair`);

  $('#q').value = '';
  $('#q').dispatchEvent(new w.Event('input'));
  await new Promise(r => setTimeout(r, 260));
  console.log('\nall sessions tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
