// Shared test harness.
//
// docs/index.html may or may not have talks embedded, depending on whether a
// scrape has run. Tests must not depend on that, so each one states the state it
// wants: no talks, these talks, whatever is in docs/talks.json.

const fs = require('fs');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync('docs/index.html', 'utf8');

const TALKS_RE = /const TALKS = .*?;\nconst POSTERS = /s;
const POSTERS_RE = /const POSTERS = .*?;\nconst \$ =/s;

/** Replace the build-time TALKS constant with `value` (an object, or null). */
function withTalks(value, posters) {
  // Test the pattern rather than comparing before/after: substituting the same
  // talks that are already embedded is a legitimate no-op, and comparing strings
  // would report that as a failure.
  if (!TALKS_RE.test(HTML)) throw new Error('harness: no TALKS constant in docs/index.html');
  const json = value === null ? 'null' : JSON.stringify(value);
  let out = HTML.replace(TALKS_RE, () => `const TALKS = ${json};\nconst POSTERS = `);
  if (posters !== undefined) {
    if (!POSTERS_RE.test(out)) throw new Error('harness: no POSTERS constant');
    const pj = posters === null ? 'null' : JSON.stringify(posters);
    out = out.replace(POSTERS_RE, () => `const POSTERS = ${pj};\nconst $ =`);
  }
  return out;
}

/** Boot the page. `talks` is null, an object, or undefined to keep the build's own. */
function boot({ url = 'https://example.github.io/p/', talks, posters, fetchImpl } = {}) {
  const html = (talks === undefined && posters === undefined) ? HTML : withTalks(talks ?? null, posters);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  const w = dom.window;
  w.fetch = fetchImpl || (async () => { throw new Error('no fetch stub installed'); });
  w.eval(html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')));
  w.$ = s => w.document.querySelector(s);
  w.$$ = s => [...w.document.querySelectorAll(s)];
  w.click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  // jsdom does not run the summary-click default action; setting .open and firing
  // toggle is exactly what a browser does.
  w.openDetails = d => { d.open = true; d.dispatchEvent(new w.Event('toggle')); };
  w.tab = v => w.click(w.$$('.tab').find(t => t.dataset.v === v));
  return w;
}

const settle = (ms = 80) => new Promise(r => setTimeout(r, ms));

function ok(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('  ok  ' + msg);
}

/**
 * A fixture standing in for a scrape. Tests use this rather than
 * docs/talks.json so they pass on a clean checkout, where no scrape has run.
 * The rows are real S1/S10 entries read off the live site on 2026-09-05.
 */
const FIXTURE = {
  generated: '2026-09-05',
  source: 'polymer.or.kr/conferenceintl',
  talks: [
    { pid: '223', session: 'S1', type: 'Keynote', date: '2026-09-29', start: '10:50', end: '11:15',
      room: 'Room 101', chair: 'Cheoljae KIM', presenter: 'Martina Stenzel',
      affiliation: 'University of New South Wales', abstract_no: 'KES1-0142',
      title: 'Ultrasmall tadpole-shaped nanoparticles for drug delivery',
      abstract: 'Nanoparticles are widely explored for drug delivery and have entered the market, such as in mRNA vaccines.',
      url: 'https://polymer.or.kr/conferenceintl/default/program/presentation_detail.php?pid=223' },
    { pid: '1633', session: 'S1', type: 'Invited', date: '2026-09-29', start: '11:15', end: '11:40',
      room: 'Room 101', chair: 'Cheoljae KIM', presenter: 'Hyun-jong Paik',
      affiliation: 'Pusan National University', abstract_no: 'IS1-0088',
      coauthors: 'Beomsoon Kim (KAIST); Myungeun Seo (KAIST)',
      title: 'Chromatographic Separation of Living Chains in RDRP',
      abstract: 'Living chains were separated by interaction chromatography across acrylate block copolymers.' },
    { pid: '1719', session: 'S1', type: 'Keynote', date: '2026-09-29', start: '11:40', end: '12:05',
      room: 'Room 101', chair: 'Cheoljae KIM', presenter: 'Didier Gigmes',
      affiliation: 'Aix-Marseille University - CNRS',
      title: 'Solid Polymer Electrolytes for Lithium Metal Battery' },
    { pid: '1263', session: 'S1', type: 'Invited', date: '2026-09-29', start: '14:50', end: '15:15',
      room: 'Room 101', chair: 'Min Sang KWON', presenter: 'Jeung Gon Kim',
      affiliation: 'Hanyang University',
      title: 'Mechanochemical Polymerization Not Limited By Miscibility' },
    { pid: '283', session: 'S1', type: 'Oral', date: '2026-09-29', start: '16:15', end: '16:30',
      room: 'Room 101', chair: 'Min Sang KWON', presenter: 'Chihiro Homma',
      affiliation: 'Institute of Science Tokyo',
      title: 'Anionic Ring-Opening Polymerization of Oxindole Derivatives with a Cyclopropane Ring' },
    { pid: '415', session: 'S1', type: 'Keynote', date: '2026-09-30', start: '09:30', end: '09:55',
      room: 'Room 101', chair: 'Chang-Geun CHAE', presenter: 'Sang Youl Kim',
      affiliation: 'KAIST', title: 'Colorless poly(amide-imide)s for flexible displays' },
    { pid: '900', session: 'S10', type: 'Invited', date: '2026-09-30', start: '10:20', end: '10:45',
      room: 'Room 205', chair: 'Jaeup KIM', presenter: 'Charles Sing',
      affiliation: 'University of Illinois at Urbana-Champaign',
      title: 'Coarse-grained potentials from machine learning' },
  ],
};

module.exports = { HTML, boot, withTalks, settle, ok, FIXTURE };
