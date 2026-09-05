const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TRACK = Object.fromEntries(DATA.tracks.map(t => [t.code, t]));
const hue = code => TRACK[code] ? `hsl(${TRACK[code].hue} 38% 40%)` : 'var(--graphite)';

// Sessions the user has starred. In-memory by design: this file is meant to be
// opened from disk, copied and shared, so it never writes to the browser.
const plan = new Set();
let planOnly = false;
let query = '';

/* ---------------------------------------------------------------- helpers */
const mins = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const T0 = mins('07:30'), T1 = mins('20:30');
const pct = m => ((m - T0) / (T1 - T0)) * 100;

function hi(text) {
  const t = esc(text);
  if (!query) return t;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return t.replace(re, '<mark>$1</mark>');
}

const matches = p =>
  !query ||
  [p.name, p.aff, p.country, p.sessions.join(' '),
   ...p.sessions.map(c => TRACK[c] ? TRACK[c].title : '')]
    .join(' ').toLowerCase().includes(query.toLowerCase());

const visibleTracks = () =>
  DATA.tracks.filter(t => !planOnly || plan.has(t.code));

const peopleOf = code => DATA.people.filter(p => p.sessions.includes(code));

/* ---------------------------------------------------------------- schedule */
// Registration runs underneath a whole day, so blocks genuinely overlap. Pack
// them into lanes — first lane where nothing collides — instead of letting the
// later block paint over the earlier one.
function lanes(blocks) {
  const ends = [];
  return blocks.map(b => {
    const s = mins(b.start), e = mins(b.end);
    let i = ends.findIndex(t => t <= s);
    if (i < 0) { i = ends.length; }
    ends[i] = e;
    return i;
  });
}

const SHORT = {
  'Graduate Student Oral Session (GS1-GS5)': 'Graduate student orals',
  'PSK50 Student Presentation Award': 'Student awards',
  'Council Member Meeting': 'Council meeting',
};
const shorten = s => SHORT[s] || s.replace(/\s*\(.*$/, '');

// Second-tier label for narrow blocks: the identifying number is the part worth
// keeping when only a few characters fit.
function compact(s) {
  let m = s.match(/^Scientific Program (\d+)/); if (m) return 'SP' + m[1];
  m = s.match(/^Plenary Lecture (\d+)/); if (m) return 'PL' + m[1];
  m = s.match(/^Poster Session (\d+)/); if (m) return 'P' + m[1];
  return { 'Opening Ceremony': 'Opening', 'Welcome Reception': 'Welcome',
           'PSK General Meeting': 'PSK meeting', 'Council Member Meeting': 'Council',
           'PSK50 Student Presentation Award': 'Awards' }[s] || '';
}

const LANE_H = 16, LANE_GAP = 2;
const CHAR_W = 5.4, TRACK_PX = 780;   // approximate track width for label fitting
const fitsIn = (widthPct, text) =>
  text && (widthPct / 100) * TRACK_PX > text.length * CHAR_W + 10;

function bestLabel(item, widthPct) {
  // Numbered items read as a sequence across the day, so the short form is the
  // better label wherever one exists — not merely a fallback for narrow blocks.
  const c = compact(item);
  if (c) return fitsIn(widthPct, c) ? c : '';
  const full = shorten(item);
  return fitsIn(widthPct, full) ? full : '';
}

function renderSchedule() {
  const hours = [];
  for (let h = 8; h <= 20; h += 2) hours.push(h);

  const chains = DATA.days.map((d, di) => {
    const ln = lanes(d.blocks);
    const nLanes = Math.max(...ln) + 1;
    const h = nLanes * LANE_H + (nLanes - 1) * LANE_GAP;
    const segs = d.blocks.map((b, bi) => {
      const l = pct(mins(b.start)), w = pct(mins(b.end)) - l;
      return `<button class="seg t-${esc(b.type)}"
        style="left:${l}%;width:${w}%;top:${ln[bi] * (LANE_H + LANE_GAP)}px;height:${LANE_H}px"
        data-day="${di}" data-blk="${bi}"
        title="${esc(b.item)} · ${b.start}–${b.end}${b.room ? ' · ' + esc(b.room) : ''}">
        <span>${esc(bestLabel(b.item, w))}</span></button>`;
    }).join('');
    return `<div class="chain">
      <div class="lab">${esc(d.day)}<i>${d.date.slice(5).replace('-', '/')}</i></div>
      <div class="track" style="height:${h}px">${segs}</div>
    </div>`;
  }).join('');

  const axis = `<div class="axis"><div></div><div class="marks">${
    hours.map(h => `<b style="left:${pct(h * 60)}%">${h}:00</b>`).join('')
  }</div></div>`;

  const legend = ['Plenary', 'Parallel', 'Session', 'Poster', 'Ceremony', 'Social', 'Meeting', 'Break']
    .map(t => `<span><i class="sw t-${t}"></i>${t}</span>`).join('');

  const days = DATA.days.map((d, di) => {
    const rows = d.blocks.map((b, bi) => {
      const quiet = b.type === 'Break' || b.type === 'Admin';
      return `<div class="row${quiet ? ' quiet' : ''}" id="b${di}-${bi}">
        <div class="t">${b.start}–${b.end}</div>
        <div class="n">${hi(b.item)}${b.note ? `<em>${esc(b.note)}</em>` : ''}</div>
        <div class="r">${esc(b.room || '')}</div>
      </div>`;
    }).join('');
    const wd = new Date(d.date + 'T00:00').toLocaleDateString('en-GB',
      { weekday: 'long', day: 'numeric', month: 'long' });
    return `<div class="day"><h3>${wd}</h3>${rows}</div>`;
  }).join('');

  $('#v-schedule').innerHTML = `
    <h2 class="sec">Four days, at a glance</h2>
    <p class="lede">Each bar is one day from 7:30 to 20:30. Click a block to jump to it.</p>
    <div class="chains">${chains}${axis}<div class="legend">${legend}</div></div>
    <div class="note">The nine <b>Scientific Program</b> blocks each run 26 tracks in parallel,
      but the organisers have not published which track sits in which block or room. Use
      Sessions to see who is speaking in each track.</div>
    ${days}`;

  $$('#v-schedule .seg').forEach(s => s.onclick = () => {
    $$('#v-schedule .seg').forEach(x => x.dataset.cur = '0');
    s.dataset.cur = '1';
    const el = $(`#b${s.dataset.day}-${s.dataset.blk}`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  });
}

/* ---------------------------------------------------------------- sessions */
const byTime = (a, b) =>
  ((a.date || '9999') + (a.start || '99:99')).localeCompare((b.date || '9999') + (b.start || '99:99'));

const talksOf = code => (talks || []).filter(t => t.session === code).sort(byTime);

// Native <details> rather than hand-rolled state: keyboard and screen readers get
// the disclosure behaviour for free, and an open panel survives a re-render only
// if we say so — which is why open state is tracked explicitly below.
const openTracks = new Set();
const openTalks = new Set();

function metaRail(t, extra = []) {
  const rows = [
    ['Presenter', t.presenter],
    ['Affiliation', t.affiliation],
    ['Type', t.type],
    ...extra,
    ['Co-authors', t.coauthors],
    ['Abstract no.', t.abstract_no],
  ].filter(([, v]) => v);
  const dl = rows.map(([k, v]) =>
    `<div><dt>${esc(k)}</dt><dd>${hi(v)}</dd></div>`).join('');
  const link = t.url
    ? `<p class="src"><a href="${esc(t.url)}" target="_blank" rel="noopener">On polymer.or.kr</a></p>`
    : '';
  return `<aside class="w-meta"><dl>${dl}</dl>${link}</aside>`;
}

function talkRow(t) {
  const when = t.start ? `${t.start}–${t.end || ''}`.replace(/–$/, '') : '—';
  const sub = [t.affiliation, t.type].filter(Boolean).map(esc).join(' · ');
  const head = `<span class="w-t">${esc(when)}</span>
    <span class="w-n"><b>${hi(t.presenter || 'Speaker not announced')}</b><i>${sub}</i></span>`;
  if (!(t.title || t.abstract)) return `<div class="who flat">${head}</div>`;
  return `<details class="who" data-talk="${esc(t.pid)}"${openTalks.has(t.pid) ? ' open' : ''}>
    <summary>${head}</summary>
    <div class="w-body">
      <div class="w-main">
        ${t.title ? `<h4>${hi(t.title)}</h4>` : ''}
        ${t.abstract ? `<p class="abs">${hi(t.abstract)}</p>`
          : '<p class="abs none">No abstract published for this talk.</p>'}
      </div>
      ${metaRail(t, [['Room', t.room], ['Chair', t.chair]])}
    </div>
  </details>`;
}

function trackBody(t) {
  const ts = talksOf(t.code).filter(k => !query ||
    [k.title, k.presenter, k.affiliation, k.chair, k.abstract].join(' ')
      .toLowerCase().includes(query.toLowerCase()));

  if (ts.length) {
    let lastChair = null, lastDay = null, out = '';
    for (const k of ts) {
      if (k.date && k.date !== lastDay) {
        lastDay = k.date; lastChair = null;
        out += `<div class="daybar">${esc(dayName(k.date))}${k.room ? ' · ' + esc(k.room) : ''}</div>`;
      }
      if (k.chair && k.chair !== lastChair) {
        lastChair = k.chair;
        out += `<div class="chairbar">Chair: ${hi(k.chair)}</div>`;
      }
      out += talkRow(k);
    }
    return out;
  }

  // No scrape loaded (or nothing matched): fall back to the announced speakers.
  const ppl = peopleOf(t.code).filter(matches);
  if (!ppl.length) {
    return `<div class="who flat"><span class="w-n"><i>${
      talks ? 'No podium talks in this track yet.'
            : 'No invited speakers announced for this track yet.'}</i></span></div>`;
  }
  return ppl.map(p => `<div class="who flat"><span class="w-n">
    <b>${hi(p.name)}</b><i>${hi(p.aff)}</i></span></div>`).join('');
}

function renderSessions() {
  const list = visibleTracks().map(t => {
    const ts = talksOf(t.code);
    const hit = !query
      || (t.code + ' ' + t.title).toLowerCase().includes(query.toLowerCase())
      || peopleOf(t.code).some(matches)
      || ts.some(k => [k.title, k.presenter, k.affiliation, k.chair, k.abstract]
          .join(' ').toLowerCase().includes(query.toLowerCase()));
    if (!hit) return '';
    const n = ts.length || t.n;
    const unit = ts.length ? 'talks' : 'invited';
    const open = query || openTracks.has(t.code);
    return `<details class="trk" data-track="${esc(t.code)}" style="--hue:${hue(t.code)}"${open ? ' open' : ''}>
      <summary class="trk-h">
        <span class="trk-code">${esc(t.code)}</span>
        <span class="trk-t">${hi(t.title)}</span>
        <span class="trk-meta"><span class="count">${n || '—'} ${n ? unit : ''}</span>
          <button class="star" data-star="${esc(t.code)}" data-on="${plan.has(t.code) ? 1 : 0}"
            aria-label="Add ${esc(t.code)} to my plan">★</button></span>
      </summary>
      <div class="trk-body">${trackBody(t)}</div>
    </details>`;
  }).join('');

  $('#v-sessions').innerHTML = `
    <h2 class="sec">26 tracks</h2>
    <p class="lede">Open a track for its running order. ${talks
      ? 'Each speaker opens to the talk itself.'
      : 'Talks appear here once a scrape has run; for now these are the announced invited speakers.'}
      Star what you care about, then switch on <b>My plan</b>.</p>
    ${list || `<p class="empty">Nothing matches “${esc(query)}”. Try a lab, a country or a topic.</p>`}`;

  // Remember what was open, so starring or searching does not collapse the page.
  $$('#v-sessions [data-track]').forEach(d => d.addEventListener('toggle', () => {
    d.open ? openTracks.add(d.dataset.track) : openTracks.delete(d.dataset.track);
  }));
  $$('#v-sessions [data-talk]').forEach(d => d.addEventListener('toggle', () => {
    d.open ? openTalks.add(d.dataset.talk) : openTalks.delete(d.dataset.talk);
  }));
  bindStars();
}

/* ---------------------------------------------------------------- speakers */
let sortKey = 'name', sortDir = 'asc', fCountry = '', fSession = '';

function renderSpeakers() {
  const countries = [...new Set(DATA.people.map(p => p.country))].sort();
  let rows = DATA.people.filter(p =>
    matches(p) &&
    (!fCountry || p.country === fCountry) &&
    (!fSession || p.sessions.includes(fSession)) &&
    (!planOnly || p.sessions.some(c => plan.has(c))));

  const key = p => sortKey === 'name' ? p.name.split(' ').pop().toLowerCase()
    : sortKey === 'aff' ? p.aff.toLowerCase()
      : sortKey === 'country' ? p.country.toLowerCase()
        : (TRACK[p.sessions[0]] ? DATA.tracks.indexOf(TRACK[p.sessions[0]]) : 99);
  rows = rows.sort((a, b) => {
    const x = key(a), y = key(b);
    return (x > y ? 1 : x < y ? -1 : 0) * (sortDir === 'asc' ? 1 : -1);
  });

  const opts = (arr, sel) => arr.map(v =>
    `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

  $('#v-speakers').innerHTML = `
    <h2 class="sec">Invited speakers <span class="count">${rows.length} of ${DATA.people.length}</span></h2>
    <p class="lede">Everyone the organisers have announced. Sort by any column.</p>
    <div class="filters">
      <select class="f" id="fc"><option value="">Every country</option>${opts(countries, fCountry)}</select>
      <select class="f" id="fs"><option value="">Every track</option>${
        DATA.tracks.filter(t => t.n).map(t =>
          `<option value="${t.code}"${t.code === fSession ? ' selected' : ''}>${esc(t.code)} — ${esc(t.title.slice(0, 46))}</option>`).join('')
      }</select>
    </div>
    ${rows.length ? `<table class="people"><thead><tr>
        <th data-k="name"${sortKey === 'name' ? ` data-dir="${sortDir}"` : ''}>Name</th>
        <th data-k="aff"${sortKey === 'aff' ? ` data-dir="${sortDir}"` : ''}>Affiliation</th>
        <th data-k="country"${sortKey === 'country' ? ` data-dir="${sortDir}"` : ''}>Country</th>
        <th data-k="session"${sortKey === 'session' ? ` data-dir="${sortDir}"` : ''}>Track</th>
      </tr></thead><tbody>${rows.map(p => `<tr>
        <td class="nm">${hi(p.name)}</td>
        <td class="af">${hi(p.aff)}</td>
        <td>${esc(p.country)}</td>
        <td class="se">${p.sessions.map(c =>
          `<span class="pill" style="--hue:${hue(c)}">${esc(c)}</span>`).join('')}</td>
      </tr>`).join('')}</tbody></table>`
      : `<p class="empty">No speaker matches those filters. Clear the search or pick a wider country.</p>`}`;

  $('#fc').onchange = e => { fCountry = e.target.value; renderSpeakers(); };
  $('#fs').onchange = e => { fSession = e.target.value; renderSpeakers(); };
  $$('#v-speakers th').forEach(th => th.onclick = () => {
    if (sortKey === th.dataset.k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = th.dataset.k; sortDir = 'asc'; }
    renderSpeakers();
  });
}

/* ---------------------------------------------------------------- talks */
let talks = null;

// Minimal RFC-4180 reader: handles quoted fields, embedded commas and newlines.
function parseCSV(text) {
  const rows = [];
  let row = [], val = '', q = false;
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else q = false; }
      else val += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(val); val = ''; }
    else if (c === '\n') { row.push(val); rows.push(row); row = []; val = ''; }
    else val += c;
  }
  if (val || row.length) { row.push(val); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter(r => r.some(v => v.trim()))
    .map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

var dayName = d => d
  ? new Date(d + 'T00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  : 'Day not announced';

let talkGroup = 'day';

function renderTalks() {
  const el = $('#v-talks');
  if (!talks && loadState === 'loading') {
    el.innerHTML = `<h2 class="sec">Talks</h2>
      <p class="lede">Loading the latest scrape…</p>`;
    return;
  }
  if (!talks) {
    el.innerHTML = `
      <h2 class="sec">Talks</h2>
      <p class="lede">The site ships with tracks and invited speakers. Individual talks,
        their chairs and their abstracts come from the scraper — load its output here.</p>
      <div class="drop" id="drop">
        <p>Drop <code>psk50_presentations.csv</code> here, and
           <code>psk50_abstracts.csv</code> after it if you ran the abstract pass.
           Nothing is uploaded; the files are read in this tab.</p>
        <input type="file" id="file" accept=".csv" multiple>
      </div>`;
    wireDrop();
    return;
  }

  const rows = talks.filter(t =>
    (!planOnly || plan.has(t.session)) &&
    (!query || [t.title, t.presenter, t.affiliation, t.chair, t.session, t.abstract]
      .join(' ').toLowerCase().includes(query.toLowerCase())));

  const groups = {};
  rows.forEach(t => {
    const k = talkGroup === 'day' ? (t.date || '') + '||' + (t.room || '')
                                  : t.session || '—';
    (groups[k] ||= []).push(t);
  });
  const keys = Object.keys(groups).sort((a, b) => talkGroup === 'day'
    ? a.localeCompare(b)
    : DATA.tracks.findIndex(x => x.code === a) - DATA.tracks.findIndex(x => x.code === b));

  const blocks = keys.map(k => {
    const list = groups[k].slice().sort((a, b) =>
      (a.date + a.start).localeCompare(b.date + b.start));
    let head, code;
    if (talkGroup === 'day') {
      const [d, room] = k.split('||');
      code = [...new Set(list.map(t => t.session))][0];
      head = `${dayName(d)} <span class="count">${room || 'room not announced'} · ${list.length}</span>`;
    } else {
      code = k;
      head = `${esc(k)}${TRACK[k] ? ' — ' + esc(TRACK[k].title) : ''} <span class="count">${list.length}</span>`;
    }
    let lastChair = null;
    const body = list.map(t => {
      let chairRow = '';
      if (t.chair && t.chair !== lastChair) {
        lastChair = t.chair;
        chairRow = `<div class="chairbar">Chair: ${hi(t.chair)}</div>`;
      }
      const when = t.start ? `${t.start}–${t.end}` : '—';
      const extra = talkGroup === 'session' ? [['Room', t.room], ['Chair', t.chair]] : [];
      return chairRow + `<div class="talk" style="--hue:${hue(t.session)}">
        <div class="c">${esc(when)}</div>
        <div class="ti">
          <div class="t-head">${hi(t.title)}
            <i>${hi(t.presenter || '')}${t.affiliation ? ' · ' + hi(t.affiliation) : ''}
               ${t.type ? '· ' + esc(t.type) : ''}${talkGroup === 'session' && t.room ? ' · ' + esc(t.room) : ''}</i>
          </div>
          ${t.abstract ? `<details data-talk="${esc(t.pid)}"><summary>Abstract</summary>
            <div class="w-body"><div class="w-main"><p class="abs">${hi(t.abstract)}</p></div>
              ${metaRail(t, extra)}</div></details>` : ''}
        </div></div>`;
    }).join('');
    return `<div class="day"><h3>${head}</h3>${body}</div>`;
  }).join('');

  const withAbs = talks.filter(t => t.abstract).length;
  const chairs = new Set(talks.map(t => t.chair).filter(Boolean)).size;
  el.innerHTML = `
    <h2 class="sec">Talks <span class="count">${rows.length} of ${talks.length}</span></h2>
    <p class="lede">Podium talks from your scraper output — ${chairs} chairs,
      ${withAbs} abstracts loaded.</p>
    <div class="filters">
      <button class="planbtn" id="gday" data-on="${talkGroup === 'day' ? 1 : 0}">By day and room</button>
      <button class="planbtn" id="gses" data-on="${talkGroup === 'session' ? 1 : 0}">By track</button>
    </div>
    ${blocks || `<p class="empty">Nothing matches “${esc(query)}”.</p>`}`;

  $('#gday').onclick = () => { talkGroup = 'day'; renderTalks(); };
  $('#gses').onclick = () => { talkGroup = 'session'; renderTalks(); };
}

function ingest(text) {
  const rows = parseCSV(text);
  if (!rows.length) return alert('That CSV had no rows.');
  if (!('pid' in rows[0])) return alert('No "pid" column — is this the scraper output?');
  const byPid = new Map((talks || []).map(t => [t.pid, t]));
  rows.forEach(r => {
    const cur = byPid.get(r.pid) || { pid: r.pid };
    for (const [k, v] of Object.entries(r)) if (v) cur[k] = v;
    byPid.set(r.pid, cur);
  });
  talks = [...byPid.values()];
  renderTalks();
}

function wireDrop() {
  const drop = $('#drop'), file = $('#file');
  if (!drop) return;
  const read = fs => [...fs].forEach(f => f.text().then(ingest));
  file.onchange = e => read(e.target.files);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', e => read(e.dataTransfer.files));
}

/* ---------------------------------------------------------------- plan */
function bindStars() {
  $$('[data-star]').forEach(b => b.onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const c = b.dataset.star;
    plan.has(c) ? plan.delete(c) : plan.add(c);
    b.dataset.on = plan.has(c) ? 1 : 0;
    $('#planN').textContent = plan.size;
    if (planOnly) renderAll();
  });
}

function savePlan() {
  if (!plan.size) return alert('Star a track or two first — the Sessions tab has all 26.');
  const picked = DATA.tracks.filter(t => plan.has(t.code));
  const body = {
    conference: DATA.meta.name, dates: DATA.meta.dates,
    saved: new Date().toISOString().slice(0, 10),
    tracks: picked.map(t => ({
      code: t.code, title: t.title, url: t.url,
      speakers: peopleOf(t.code).map(p => ({ name: p.name, affiliation: p.aff })),
    })),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'psk50-my-plan.json'; a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------- shell */
let view = 'schedule';
let loadState = 'idle';   // idle | loading | ok | none

function renderAll() {
  ({ schedule: renderSchedule, sessions: renderSessions,
     speakers: renderSpeakers, talks: renderTalks }[view])();
}

function show(v) {
  view = v;
  $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.v === v));
  $$('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  renderAll();
}

// On GitHub Pages the workflow writes talks.json next to this file, so the Talks
// tab fills itself. Opened from disk there is no fetch to make, and the drop zone
// stays as the way in.
async function loadTalks() {
  // Embedded at build time — this is what makes the page work from disk, where
  // browsers refuse to fetch a sibling file.
  const embedded = (typeof TALKS !== 'undefined' && TALKS) ? TALKS : null;
  if (embedded && Array.isArray(embedded.talks) && embedded.talks.length) {
    talks = embedded.talks;
    if (embedded.generated) $('#gen').textContent = 'Talks updated ' + embedded.generated;
    loadState = 'ok';
    if (view === 'talks' || view === 'sessions') renderAll();
  }

  // Served over http, also ask for the current file, so a re-scrape shows up
  // without anyone rebuilding the page.
  if (!/^https?:$/.test(location.protocol)) {
    if (!talks) loadState = 'none';
    return;
  }
  if (!talks) loadState = 'loading';
  try {
    const res = await fetch('talks.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : body.talks;
    if (!Array.isArray(rows) || !rows.length) throw new Error('no talks in file');
    talks = rows;
    if (body.generated) $('#gen').textContent = 'Talks updated ' + body.generated;
    loadState = 'ok';
  } catch (e) {
    console.warn('talks.json not fetched:', e.message);
    if (!talks) loadState = 'none';
  }
  if (view === 'talks' || view === 'sessions') renderAll();
}

function init() {
  $('#mDates').textContent = DATA.meta.dates;
  $('#mSub').textContent = DATA.meta.subtitle;
  $('#fSrc').innerHTML =
    `${DATA.meta.nTracks} tracks and ${DATA.meta.nSpeakers} invited speakers, read from ` +
    `<a href="https://${DATA.meta.source}" target="_blank" rel="noopener">${esc(DATA.meta.source)}</a> ` +
    `on ${DATA.meta.extracted}.`;

  $$('.tab').forEach(t => t.onclick = () => show(t.dataset.v));
  let deb;
  $('#q').oninput = e => {
    clearTimeout(deb);
    deb = setTimeout(() => { query = e.target.value.trim(); renderAll(); }, 140);
  };
  $('#planToggle').onclick = e => {
    planOnly = !planOnly;
    e.currentTarget.dataset.on = planOnly ? 1 : 0;
    renderAll();
  };
  $('#planSave').onclick = savePlan;
  show('schedule');
  loadTalks();
}

init();
