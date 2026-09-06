const fs = require('fs');
const { JSDOM } = require('jsdom');

const { withTalks } = require('./harness.js');
// This suite is about the page with no scrape loaded, so say so rather than
// depending on whether docs/talks.json happened to exist at build time.
const html = withTalks(null);
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const $ = s => doc.querySelector(s);
const $$ = s => [...doc.querySelectorAll(s)];
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok  ' + m); };
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

console.log('\n[masthead]');
ok($('#mDates').textContent.includes('2026'), 'dates rendered');
ok($('#mSub').textContent.includes('Polymer Society'), 'subtitle rendered');
ok($('#fSrc').textContent.includes('278'), 'footer states 278 speakers');

console.log('\n[schedule]');
ok(!$('#v-schedule').hidden, 'schedule is the default view');
ok($$('#v-schedule .dcol').length === 4, 'four day columns');

const segs = $$('#v-schedule .seg');
const brks = $$('#v-schedule .brk');
const rails = $$('#v-schedule .rail');

// 39 glance blocks = 4 registrations (rails) + 8 breaks (hairlines) + 27 drawn
ok(rails.length === 4, 'each day gets one registration rail, not a background slab');
ok(brks.length === 8, 'the eight ten-minute breaks are hairlines, not blocks');
ok(segs.length === 27, `27 blocks drawn (got ${segs.length})`);
ok(segs.length + brks.length + rails.length === 39, 'every glance entry is accounted for');

ok($$('#v-schedule .seg.bare').length === 3,
   'the three lunches keep a label but take no fill');
ok([...segs].filter(s => s.className.includes('t-Break')).length === 0,
   'nothing is drawn with break colouring any more');
const lunch = $$('#v-schedule .seg.bare')[0];
ok(lunch.textContent.includes('Lunch') && lunch.textContent.includes('12:20'),
   'lunch still names itself and its hours');

// The whole point of the redesign: four days on one screen.
const H = parseFloat($('#v-schedule .dbody').style.height);
ok(H > 380 && H < 500, `day column is ${Math.round(H)}px — was ~900 before`);
const outside = [...segs].filter(s => {
  const top = parseFloat(s.style.top), h = parseFloat(s.style.height);
  return !(top >= -0.5 && h > 0 && top + h <= H + 0.5);
});
ok(outside.length === 0, 'every block sits inside 07:30-20:30 vertically');

const tue = [...$$('#v-schedule .dcol')[1].querySelectorAll('.seg')];
const tops = tue.map(s => parseFloat(s.style.top));
ok(tops.every((t, i) => i === 0 || t >= tops[i - 1]),
   'blocks are ordered top to bottom by start time');
ok(tue.every(s => parseFloat(s.style.height) >= 4), 'no zero-height block');

const mon = [...$$('#v-schedule .dcol')[0].querySelectorAll('.seg')];
ok(mon.some(s => parseFloat(s.style.width) < 100),
   'Monday still splits into lanes where blocks genuinely overlap');
ok(tue.filter(s => !s.classList.contains('bare'))
      .every(s => parseFloat(s.style.width) === 100),
   'Tuesday has nothing overlapping, so its blocks run full width');

ok($('#v-schedule .dhead i').textContent.includes('Registration'),
   'registration is stated in the day header');
ok($$('#v-schedule .tick').length === 13, '8:00 to 20:00 marked on the axis');
ok($$('#v-schedule .day').length === 4, 'four expanded day tables');
ok($('#v-schedule').textContent.includes('not published which track'),
   'states that track-to-slot assignment is unpublished');
ok($('#v-schedule').innerHTML.includes('end time inferred'),
   'SP5 inferred end time is disclosed on the block itself');
click(segs[5]);
ok(segs[5].dataset.cur === '1', 'clicking a block marks it current');

console.log('\n[sessions]');
click($$('.tab').find(t => t.dataset.v === 'sessions'));
ok($$('#v-sessions .trk').length === 26, '26 tracks listed');
const s1 = $('[data-track="S1"]');
ok(!s1.open, 'tracks start collapsed');
// jsdom does not implement the summary-click default action; setting .open is
// exactly what the browser does, and the toggle event is what the app listens for.
const openDetails = d => { d.open = true; d.dispatchEvent(new window.Event('toggle')); };
openDetails(s1);
ok(s1.open, 'a track opens');
ok(s1.querySelectorAll('.who').length === 20,
   'with no scrape loaded, S1 falls back to its 20 invited speakers');
ok(s1.querySelector('.who').classList.contains('flat'),
   'invited-speaker rows are plain, not disclosures — there is no talk to unfold');
ok($('[data-track="IDS3"] .trk-body').textContent.includes('No invited speakers announced'),
   'IDS3 (zero speakers) says so rather than rendering blank');

console.log('\n[plan]');
click($('[data-star="S1"]'));
click($('[data-star="S10"]'));
ok(!$('[data-track="S10"]').open, 'starring a track does not force it open');
ok($('#planN').textContent === '2', 'starring two tracks updates the counter');
click($('#planToggle'));
ok($$('#v-sessions .trk').length === 2, 'My plan narrows Sessions to the starred tracks');
ok($('[data-track="S1"]').open, 'the track left open stays open through the re-render');
click($$('.tab').find(t => t.dataset.v === 'speakers'));
const planned = $$('#v-speakers tbody tr').length;
ok(planned === 35, `My plan narrows Speakers to S1+S10 = 35 people (got ${planned})`);
click($('#planToggle'));

console.log('\n[speakers]');
ok($$('#v-speakers tbody tr').length === 278, 'all 278 rows with no filter');
$('#fc').value = 'Germany';
$('#fc').dispatchEvent(new window.Event('change'));
ok($$('#v-speakers tbody tr').length === 10, 'country filter: 10 from Germany');
ok($$('#v-speakers tbody tr').every(r => r.cells[2].textContent === 'Germany'),
   'every filtered row really is Germany');
$('#fc').value = '';
$('#fc').dispatchEvent(new window.Event('change'));
const first = () => $('#v-speakers tbody tr').cells[0].textContent.trim();
const asc = first();
click($$('#v-speakers th')[0]);
ok(first() !== asc, 'clicking Name reverses the sort');
click($$('#v-speakers th')[0]);
ok(first() === asc, 'clicking again restores it');

console.log('\n[search]');
$('#q').value = 'KAIST';
$('#q').dispatchEvent(new window.Event('input'));
return new Promise(r => setTimeout(r, 260)).then(() => {
  const n = $$('#v-speakers tbody tr').length;
  ok(n > 0 && n < 278, `search narrows to ${n} KAIST rows`);
  ok($('#v-speakers').innerHTML.includes('<mark>'), 'matches are highlighted');
  ok($$('#v-speakers tbody tr').every(r => r.textContent.includes('KAIST')),
     'every search hit really contains the term');

  $('#q').value = 'zzzznotathing';
  $('#q').dispatchEvent(new window.Event('input'));
  return new Promise(r => setTimeout(r, 260));
}).then(() => {
  ok($('#v-speakers .empty'), 'no-match state shows guidance, not a blank page');
  $('#q').value = '';
  $('#q').dispatchEvent(new window.Event('input'));
  return new Promise(r => setTimeout(r, 260));
}).then(() => {
  console.log('\n[talks / CSV ingest]');
  click($$('.tab').find(t => t.dataset.v === 'talks'));
  ok($('#drop'), 'empty state offers a drop zone');

  const csv = 'session,idx,pid,type,title,presenter,affiliation,date,start,end,room,chair,url\n' +
    'S1,1,223,Keynote,"Tadpole nanoparticles, part 1",Martina Stenzel,UNSW,2026-09-29,10:50,11:15,Room 101,Cheoljae KIM,u\n' +
    'S1,1,1633,Invited,Chromatographic Separation,Hyun-jong Paik,Pusan Nat Univ,2026-09-29,11:15,11:40,Room 101,Cheoljae KIM,u\n' +
    'S1,1,283,Oral,"Anionic ROP of ""oxindole"" derivatives",Chihiro Homma,Inst Sci Tokyo,2026-09-29,16:15,16:30,Room 101,Min Sang KWON,u\n' +
    'S10,10,900,Invited,Coarse-grained potentials,Charles Sing,UIUC,2026-09-30,10:20,10:45,Room 205,Jaeup KIM,u\n';
  window.eval(`ingest(${JSON.stringify(csv)})`);
  ok($$('#v-talks .talk').length === 4, '4 podium talks ingested');
  ok($('#v-talks').textContent.includes('Tadpole nanoparticles, part 1'), 'CSV quoted comma parsed');
  ok($('#v-talks').textContent.includes('oxindole'), 'CSV escaped quotes parsed');
  ok($('#v-talks').textContent.includes('3 chairs'), 'distinct chairs counted');

  const bars = $$('#v-talks .chairbar').map(b => b.textContent.trim());
  ok(bars.length === 3, 'a chair bar per chair stint, not per talk');
  ok(bars[0].includes('Cheoljae KIM'), 'first stint chair named once for its two talks');
  ok($$('#v-talks .day').length === 2, 'grouped by day+room into two blocks');
  ok($('#v-talks').textContent.includes('Room 101'), 'room shown on the group heading');

  click($('#gses'));
  ok($$('#v-talks .day').length === 2, 'regrouping by track still gives two blocks');
  ok($('#v-talks h3').textContent.includes('Polymer Synthesis'), 'track heading names the track');
  click($('#gday'));

  ok(!$('#v-talks details'), 'no abstract disclosure before abstracts are loaded');
  const abs = 'pid,abstract_no,coauthors,abstract\n' +
    '223,KES1-0142,"B Kim; M Seo","Nanoparticles are widely explored for drug delivery."\n';
  window.eval(`ingest(${JSON.stringify(abs)})`);
  ok($$('#v-talks details').length === 1, 'abstract pass adds one disclosure');
  ok($('#v-talks details p').textContent.includes('widely explored'), 'abstract text merged by pid');
  ok($('#v-talks').textContent.includes('1 abstracts loaded'), 'abstract count reported');
  ok($('#v-talks').textContent.includes('Tadpole nanoparticles, part 1'),
     'second CSV does not wipe fields absent from it');

  $('#q').value = 'Cheoljae';
  $('#q').dispatchEvent(new window.Event('input'));
  return new Promise(r => setTimeout(r, 260)).then(() => {
    ok($$('#v-talks .talk').length === 2, 'search matches on chair name');
    $('#q').value = '';
    $('#q').dispatchEvent(new window.Event('input'));
    return new Promise(r => setTimeout(r, 260));
  }).then(() => {

  console.log('\n[escaping]');
  ok(!$('body').innerHTML.includes('<script>alert'), 'no injected script survives');
  window.eval(`ingest(${JSON.stringify('pid,session,title,type\n9,S1,"<img src=x onerror=alert(1)>",Oral\n')})`);
  ok($('#v-talks').innerHTML.includes('&lt;img'), 'HTML in CSV is escaped, not executed');

  console.log('\nall site tests passed');
  });
});
