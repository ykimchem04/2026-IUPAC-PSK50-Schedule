const fs = require('fs');
const { JSDOM } = require('jsdom');
const { withTalks } = require('./harness.js');
// Embedding is covered by test_offline.js; here the subject is the fetch path,
// so start from a page with nothing embedded.
const html = withTalks(null);
const { FIXTURE } = require('./harness.js');
const talksJson = JSON.stringify(FIXTURE);
// derive expectations from the fixture rather than hard-coding counts
const fixture = JSON.parse(talksJson).talks;
const nTalks = fixture.length;
const nChairs = new Set(fixture.map(t => t.chair).filter(Boolean)).size;
const nAbs = fixture.filter(t => t.abstract).length;
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok  ' + m); };

function boot({ url, fetchImpl }) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  dom.window.fetch = fetchImpl;
  dom.window.eval(html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')));
  return dom.window;
}
const settle = () => new Promise(r => setTimeout(r, 60));

(async () => {
  console.log('\n[served over https — GitHub Pages]');
  let fetched = [];
  let w = boot({
    url: 'https://someone.github.io/psk50/',
    // posters.json is fetched by the same startup path; this suite is about
    // talks, so record only that request.
    fetchImpl: async (u, o) => {
      if (u !== 'talks.json') return { ok: false, status: 404, json: async () => ({}) };
      fetched.push([u, o && o.cache]);
      return { ok: true, status: 200, json: async () => JSON.parse(talksJson) };
    },
  });
  await settle();
  ok(fetched.length === 1 && fetched[0][0] === 'talks.json', 'fetches talks.json relative to the page');
  ok(fetched[0][1] === 'no-cache', 'asks for a fresh copy, so a re-scrape is visible');
  const $ = s => w.document.querySelector(s);
  const $$ = s => [...w.document.querySelectorAll(s)];
  $$('.tab').find(t => t.dataset.v === 'talks').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(nTalks > 0, `fixture has ${nTalks} talks to render`);
  ok($$('#v-talks .talk').length === nTalks, `all ${nTalks} talks rendered with no user action`);
  ok(!$('#drop'), 'drop zone not shown when data loaded itself');
  ok($('#v-talks').textContent.includes('Room 101'), 'room from the scrape shown');
  ok($$('#v-talks .chairbar').length === nChairs, `${nChairs} chair stints shown`);
  ok($$('#v-talks details').length === nAbs, `${nAbs} abstract(s) expandable`);
  ok($('#gen').textContent.includes('Talks updated'), 'footer states when talks were scraped');

  console.log('\n[opened from disk — file://]');
  fetched = [];
  w = boot({ url: 'file:///home/user/index.html',
             fetchImpl: async (u) => { fetched.push(u); throw new Error('no'); } });
  await settle();
  ok(fetched.length === 0, 'no fetch attempted from file:// — no console error for the user');
  $$('.tab').find(t => t.dataset.v === 'talks').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(w.document.querySelector('#drop'), 'drop zone offered instead');

  console.log('\n[talks.json missing or broken]');
  w = boot({ url: 'https://x.github.io/p/',
             fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  await settle();
  $$('.tab').find(t => t.dataset.v === 'talks').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(w.document.querySelector('#drop'), '404 falls back to the drop zone, not a blank tab');
  // body.textContent includes the inlined <script> source, which legitimately
  // contains the word "undefined" — check the rendered views instead.
  const rendered = [...w.document.querySelectorAll('.view')].map(v => v.textContent).join(' ');
  ok(!rendered.includes('undefined'), 'no undefined leaks into any rendered view');

  console.log('\n[schedule still works without talks]');
  const drawn = ['.seg', '.brk', '.rail']
    .reduce((n, sel) => n + w.document.querySelectorAll('#v-schedule ' + sel).length, 0);
  ok(drawn === 39, 'all 39 schedule entries render from the inlined data alone');
  console.log('\nall autoload tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
