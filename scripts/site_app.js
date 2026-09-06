const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Structural changes — a table becoming a card list — cannot be done in CSS, so
// the few views that need a different shape on a phone ask here. Everything else
// is handled by media queries, and the desktop path is untouched.
const NARROW = '(max-width: 640px)';
// The schedule runs out of room before anything else does: four columns on a
// 700px screen leave each day too narrow to name a block.
const SCHED_NARROW = '(max-width: 820px)';
const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);
const isNarrow = () => mq(NARROW);
const oneDay = () => mq(SCHED_NARROW);

const TRACK = Object.fromEntries(DATA.tracks.map(t => [t.code, t]));
// Solved per hue at build time so all 26 clear 4.5:1 on white — see gen_data.py
const hue = code => (TRACK[code] && TRACK[code].color) || 'var(--graphite)';

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
    if (i < 0) i = ends.length;
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

function compact(s) {
  let m = s.match(/^Scientific Program (\d+)/); if (m) return 'SP' + m[1];
  m = s.match(/^Plenary Lecture (\d+)/); if (m) return 'PL' + m[1];
  m = s.match(/^Poster Session (\d+)/); if (m) return 'P' + m[1];
  return { 'Opening Ceremony': 'Opening', 'Welcome Reception': 'Welcome',
           'PSK General Meeting': 'PSK meeting', 'Council Member Meeting': 'Council',
           'PSK50 Student Presentation Award': 'Awards' }[s] || '';
}

// Half the old scale: all four days fit one screen, which is the only reason to
// draw a grid rather than read the tables underneath.
const PX_PER_MIN = 0.55;
const MIN_LABEL_H = 14;                   // below this a block cannot hold a line
const TWO_LINE_H = 38;                    // above this the label can breathe onto two
// Breaks are the gap between sessions, not sessions. Drawn as a filled block they
// carry the same weight as a plenary; drawn as a hairline they read as what they
// are. Lunch keeps a label but no fill. Registration spans the whole day, so it
// gets a rail at the column edge and a line in the header — not a slab behind
// everything, which turned every gap into a grey stripe.
const HAIRLINE = new Set(['Break']);
const isMeal = b => /^(Lunch|Breakfast|Dinner)\b/.test(b.item);
const QUIET = new Set(['Admin']);

let schedDay = 0;

function renderSchedule() {
  const H = (T1 - T0) * PX_PER_MIN;
  const solo = oneDay();
  if (schedDay >= DATA.days.length) schedDay = 0;
  const y = m => (m - T0) * PX_PER_MIN;

  const hours = [];
  for (let h = 8; h <= 20; h++) hours.push(h);
  const grid = hours.map(h => `<div class="hline" style="top:${y(h * 60)}px"></div>`).join('');
  const ticks = hours.map(h =>
    `<div class="tick" style="top:${y(h * 60)}px">${h}:00</div>`).join('');

  const shown = solo ? [DATA.days[schedDay]] : DATA.days;
  const cols = shown.map((d) => {
    const di = DATA.days.indexOf(d);
    const reg = d.blocks.find(b => QUIET.has(b.type));
    const drawn = d.blocks.filter(b => !QUIET.has(b.type));
    const solid = drawn.filter(b => !HAIRLINE.has(b.type) && b.type !== 'Break');
    const ln = lanes(solid);
    const n = Math.max(1, Math.max(...ln, 0) + 1);

    const parts = [];
    if (reg) {
      parts.push(`<div class="rail" style="top:${y(mins(reg.start))}px;height:${
        y(mins(reg.end)) - y(mins(reg.start))}px"
        title="${esc(reg.item)} · ${reg.start}–${reg.end}"></div>`);
    }
    d.blocks.forEach((b, bi) => {
      if (QUIET.has(b.type)) return;
      const top = y(mins(b.start)), h = y(mins(b.end)) - top;
      const label = compact(b.item) || shorten(b.item);
      const room = b.room ? ` · ${esc(b.room)}` : '';
      const tip = `${esc(b.item)} · ${b.start}–${b.end}${room}`;

      // Lunch is typed Break in the source data, so it has to be picked out by
      // name before the hairline rule — otherwise the whole midday vanishes.
      if (!isMeal(b) && HAIRLINE.has(b.type)) {
        parts.push(`<div class="brk" style="top:${top + h / 2}px" title="${tip}"></div>`);
        return;
      }
      if (isMeal(b)) {
        parts.push(`<button class="seg bare" style="top:${top}px;height:${h}px"
          data-day="${di}" data-blk="${bi}" title="${tip}">
          <span class="sl">${esc(label)} · ${b.start}–${b.end}</span></button>`);
        return;
      }
      const i = solid.indexOf(b), w = 100 / n, left = (i < 0 ? 0 : ln[i]) * w;
      const two = h >= TWO_LINE_H;
      parts.push(`<button class="seg t-${esc(b.type)}"
        style="top:${top}px;height:${Math.max(h, 4)}px;left:${left}%;width:${w}%"
        data-day="${di}" data-blk="${bi}" title="${tip}">
        ${h < MIN_LABEL_H ? '' : two
          ? `<span class="sl">${esc(label)}</span><span class="st">${b.start}–${b.end}${
              b.note ? ' · end time inferred' : room}</span>`
          : `<span class="sl">${esc(label)} · ${b.start}–${b.end}</span>`}</button>`);
    });

    const wd = new Date(d.date + 'T00:00').toLocaleDateString('en-GB',
      { weekday: solo ? 'long' : 'short', day: 'numeric', month: solo ? 'long' : 'short' });
    return `<div class="dcol">
      <div class="dhead">${esc(wd)}
        <i>${reg ? `Registration ${reg.start}–${reg.end}` : '&nbsp;'}</i></div>
      <div class="dbody" style="height:${H}px">${grid}${parts.join('')}</div>
    </div>`;
  }).join('');

  // One day at a time on a narrow screen, picked with day buttons.
  const pills = solo ? `<div class="daypick">${DATA.days.map((d, i) => {
    const lbl = new Date(d.date + 'T00:00').toLocaleDateString('en-GB',
      { weekday: 'short', day: 'numeric' });
    return `<button data-day-pick="${i}" data-on="${i === schedDay ? 1 : 0}">${esc(lbl)}</button>`;
  }).join('')}</div>` : '';

  const legend = ['Plenary', 'Parallel', 'Session', 'Poster', 'Ceremony', 'Social', 'Meeting']
    .map(t => `<span><i class="sw t-${t}"></i>${t}</span>`).join('');

  const days = DATA.days.map((d, di) => renderDayTable(d, di)).join('');

  function renderDayTable(d, di) {
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
  }

  $('#v-schedule').innerHTML = `
    <h2 class="sec">Four days, at a glance</h2>
    <p class="lede">Time runs down, days run across. Click a block to jump to its
      entry below; breaks are the hairlines between them.</p>
    ${pills}
    <div class="gridwrap${solo ? ' solo' : ''}">
      <div class="axis"><div class="dhead"></div>
        <div class="ticks" style="height:${H}px">${ticks}</div></div>
      ${cols}
    </div>
    <div class="legend">${legend}</div>
    <div class="note">The nine <b>Scientific Program</b> blocks each run 26 tracks in
      parallel, but the organisers have not published which track sits in which block
      or room. Use Sessions to see who is speaking in each track.</div>
    ${solo ? renderDayTable(DATA.days[schedDay], schedDay) : days}`;

  $$('#v-schedule [data-day-pick]').forEach(b => b.onclick = () => {
    schedDay = +b.dataset.dayPick;
    renderSchedule();
  });
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

  const filters = `<div class="filters">
      <select class="f" id="fc"><option value="">Every country</option>${opts(countries, fCountry)}</select>
      <select class="f" id="fs"><option value="">Every track</option>${
        DATA.tracks.filter(t => t.n).map(t =>
          `<option value="${t.code}"${t.code === fSession ? ' selected' : ''}>${esc(t.code)} — ${esc(t.title.slice(0, 46))}</option>`).join('')
      }</select>
    </div>`;

  // A four-column table leaves the affiliation about 27px on a 390px screen and
  // pushes the page sideways. On a phone each speaker becomes a stacked card.
  const body = rows.length
    ? (isNarrow()
      ? rows.map(p => `<div class="pcard">
          <div class="pn">${hi(p.name)}</div>
          <div class="pp">${p.sessions.map(c =>
            `<span class="pill" style="--hue:${hue(c)}">${esc(c)}</span>`).join('')}</div>
          <div class="pa">${hi(p.aff)}</div>
        </div>`).join('')
      : `<table class="people"><thead><tr>
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
      </tr>`).join('')}</tbody></table>`)
    : `<p class="empty">No speaker matches those filters. Clear the search or pick a wider country.</p>`;

  $('#v-speakers').innerHTML = `
    <h2 class="sec">Invited speakers <span class="count">${rows.length} of ${DATA.people.length}</span></h2>
    <p class="lede">Everyone the organisers have announced.${
      isNarrow() ? '' : ' Sort by any column.'}</p>
    ${filters}
    ${body}`;

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

/* ---------------------------------------------------------------- posters */
// From the organisers' poster-assignment PDF, not the programme pages — the
// scraper skips posters, so this is a separate source with its own file.
let posters = null, posterMeta = {}, pSession = null;

// From Poster Presentation Guidelines v2.
const POSTER_TIMES = [
  ['Mounting', '08:00–08:30'],
  ['Presentation (stay at your board)', '08:30–09:30'],
  ['On display', '08:30–17:00'],
  ['Removal', '17:00–18:00'],
];

function renderPosters() {
  const el = $('#v-posters');
  if (!posters) {
    el.innerHTML = `<h2 class="sec">Posters</h2>
      <p class="lede">Poster boards come from the organisers' assignment PDF.
        Run <code>scripts/parse_posters.py</code> and the list appears here.</p>`;
    return;
  }

  const sessions = [...new Set(posters.map(p => p.session))].sort();
  if (!pSession) pSession = sessions[0];

  const rows = posters.filter(p =>
    p.session === pSession &&
    (!planOnly || plan.has(p.track)) &&
    (!query || [p.board, p.title, p.presenter, p.affiliation, p.abstract_no, p.track]
      .join(' ').toLowerCase().includes(query.toLowerCase())));

  const byTrack = {};
  rows.forEach(p => (byTrack[p.track || '—'] ||= []).push(p));
  const order = [...DATA.tracks.map(t => t.code), '—'].filter(c => byTrack[c]);

  const groups = order.map(c => {
    const t = TRACK[c];
    const list = byTrack[c].slice().sort((a, b) => a.seq - b.seq);
    return `<div class="day"><h3>${esc(c)}${t ? ' — ' + esc(t.title) : ''}
      <span class="count">${list.length}</span></h3>
      ${list.map(p => `<div class="pboard" style="--hue:${hue(c)}">
        <div class="bn">${hi(p.board)}</div>
        <div class="pt">${hi(p.title)}
          ${p.award ? '<span class="award">AWARD</span>' : ''}
          ${p.check ? '<span class="flagged" title="This row did not parse cleanly from the PDF">check PDF</span>' : ''}
          <i>${hi(p.presenter || '—')}${p.affiliation ? ' · ' + hi(p.affiliation) : ''}
             ${p.abstract_no ? ' · ' + esc(p.abstract_no) : ''}</i>
        </div></div>`).join('')}</div>`;
  }).join('');

  const tabs = sessions.map(s =>
    `<button data-ps="${esc(s)}" data-on="${s === pSession ? 1 : 0}">${esc(s)} — ${
      esc((posterMeta[s] || '').split(',')[0])}</button>`).join('');
  const awards = posters.filter(p => p.session === pSession && p.award).length;

  el.innerHTML = `
    <h2 class="sec">Posters <span class="count">${rows.length} of ${
      posters.filter(p => p.session === pSession).length} on this day</span></h2>
    <p class="lede">${esc(posterMeta[pSession] || '')}${
      awards ? ` · ${awards} boards are Student Presentation Award applicants` : ''}</p>
    <div class="psess">${tabs}</div>
    <div class="ptimes">${POSTER_TIMES.map(([k, v]) =>
      `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</div>
    ${groups || `<p class="empty">Nothing matches “${esc(query)}” in ${esc(pSession)}.</p>`}`;

  $$('#v-posters [data-ps]').forEach(b => b.onclick = () => {
    pSession = b.dataset.ps; renderPosters();
  });
}

async function loadPosters() {
  if (!/^https?:$/.test(location.protocol)) {
    if (typeof POSTERS !== 'undefined' && POSTERS) applyPosters(POSTERS);
    return;
  }
  if (typeof POSTERS !== 'undefined' && POSTERS) applyPosters(POSTERS);
  try {
    const res = await fetch('posters.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    applyPosters(await res.json());
  } catch (e) {
    console.warn('posters.json not fetched:', e.message);
  }
  if (view === 'posters') renderPosters();
}

function applyPosters(body) {
  if (!body || !Array.isArray(body.posters) || !body.posters.length) return;
  posters = body.posters;
  posterMeta = body.sessions || {};
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
  ({ schedule: renderSchedule, sessions: renderSessions, speakers: renderSpeakers,
     talks: renderTalks, posters: renderPosters }[view])();
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
  loadPosters();

  // Rotating a phone crosses the breakpoint; re-render so the view matches.
  if (window.matchMedia) {
    const mq = window.matchMedia(NARROW);
    const onChange = () => renderAll();
    mq.addEventListener ? mq.addEventListener('change', onChange)
                        : mq.addListener(onChange);
  }
}

init();
