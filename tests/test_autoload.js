const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('site/index.html', 'utf8');
const talksJson = fs.readFileSync('site/talks.json', 'utf8');
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
    fetchImpl: async (u, o) => { fetched.push([u, o && o.cache]);
      return { ok: true, status: 200, json: async () => JSON.parse(talksJson) }; },
  });
  await settle();
  ok(fetched.length === 1 && fetched[0][0] === 'talks.json', 'fetches talks.json relative to the page');
  ok(fetched[0][1] === 'no-cache', 'asks for a fresh copy, so a re-scrape is visible');
  const $ = s => w.document.querySelector(s);
  const $$ = s => [...w.document.querySelectorAll(s)];
  $$('.tab').find(t => t.dataset.v === 'talks').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok($$('#v-talks .talk').length === 10, '10 talks rendered with no user action');
  ok(!$('#drop'), 'drop zone not shown when data loaded itself');
  ok($('#v-talks').textContent.includes('Room 101'), 'room from the scrape shown');
  ok($$('#v-talks .chairbar').length === 3, 'three chair stints');
  ok($('#v-talks details'), 'the one abstract is expandable');
  ok($('#gen').textContent.includes('Talks updated'), 'footer states when talks were scraped');

  console.log('\n[opened from disk — file://]');
  fetched = [];
  w = boot({ url: 'file:///home/user/index.html',
             fetchImpl: async () => { fetched.push('called'); throw new Error('no'); } });
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
  ok(!w.document.body.textContent.includes('undefined'), 'no undefined leaks into the page');

  console.log('\n[schedule still works without talks]');
  ok([...w.document.querySelectorAll('#v-schedule .seg')].length === 39,
     '39 schedule blocks render from the inlined data alone');
  console.log('\nall autoload tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
