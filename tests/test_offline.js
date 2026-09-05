const { JSDOM } = require('jsdom');
const { withTalks, FIXTURE, ok } = require('./harness.js');

// The subject here is a page saved to disk with talks baked in at build time,
// so bake the fixture in rather than depending on whether a scrape has run.
const html = withTalks(FIXTURE);
const S1 = FIXTURE.talks.filter(t => t.session === 'S1');

// file:// — no server, and fetch of a sibling file is blocked by the browser.
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'file:///Users/me/index.html' });
const w = dom.window;
let fetched = 0;
w.fetch = async () => { fetched++; throw new Error('blocked on file://'); };
w.eval(html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')));
const $ = s => w.document.querySelector(s);
const $$ = s => [...w.document.querySelectorAll(s)];
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const open = d => { d.open = true; d.dispatchEvent(new w.Event('toggle')); };

setTimeout(() => {
  console.log('\n[opened from disk, no server]');
  ok(fetched === 0, 'no fetch attempted — nothing for the browser to block');

  click($$('.tab').find(t => t.dataset.v === 'sessions'));
  const s1 = $('[data-track="S1"]');
  ok(s1.querySelector('.count').textContent.includes(`${S1.length} talks`),
     'S1 header shows scraped talks, not the invited fallback');
  open(s1);

  const times = $$('[data-track="S1"] .w-t').map(e => e.textContent.trim());
  ok(times.length === S1.length, `${S1.length} speaker rows`);
  ok(times.every(t => /^\d{2}:\d{2}–\d{2}:\d{2}$/.test(t)), `every row shows a time (${times[0]} …)`);

  const chairs = $$('[data-track="S1"] .chairbar').map(e => e.textContent.trim());
  const nChairs = new Set(S1.map(t => t.chair).filter(Boolean)).size;
  ok(chairs.length === nChairs, `${nChairs} chair dividers`);
  ok(chairs[0] === 'Chair: Cheoljae KIM', 'chair named');
  ok($$('[data-track="S1"] .daybar').length === 2, 'day dividers present');

  const first = $('[data-talk="223"]');
  open(first);
  ok(first.querySelector('h4').textContent.includes('tadpole'), 'talk title unfolds');
  ok(first.querySelector('.abs').textContent.includes('mRNA vaccines'), 'abstract unfolds');

  click($$('.tab').find(t => t.dataset.v === 'talks'));
  ok(!$('#drop'), 'Talks tab is populated, not asking for a file drop');
  ok($$('#v-talks .talk').length === FIXTURE.talks.length,
     `all ${FIXTURE.talks.length} talks in the Talks tab`);
  ok($('#gen').textContent.includes('Talks updated'), 'footer dates the scrape');

  console.log('\nall offline tests passed');
}, 80);
