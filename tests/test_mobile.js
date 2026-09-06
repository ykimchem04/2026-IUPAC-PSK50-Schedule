const { boot, settle, ok, FIXTURE } = require('./harness.js');
const noFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });

const PHONE = 390, DESKTOP = 1280;
const chars = (s, px) => s.length * px * 0.55;

(async () => {
  console.log('\n[phone: the tab bar is one scrolling row]');
  const m = boot({ url: 'file:///x/i.html', width: PHONE, talks: FIXTURE, posters: null, fetchImpl: noFetch });
  await settle();
  const set = m.$('.tabset');
  ok(set, 'the five tabs share one container');
  ok(m.$$('.tabset .tab').length === 5, 'all five are inside it');
  ok(m.$$('.tabs-in > .tab').length === 0,
     'no tab is a direct child of the bar, so they cannot wrap independently');

  console.log('\n[phone: speakers become cards, not a 4-column table]');
  m.tab('speakers');
  ok(!m.$('#v-speakers table'), 'no table rendered at phone width');
  ok(m.$$('#v-speakers .pcard').length === 278, 'all 278 speakers as cards');
  const card = m.$('#v-speakers .pcard');
  ok(card.querySelector('.pn').textContent.trim().length > 0, 'card shows the name');
  ok(card.querySelector('.pa').textContent.trim().length > 0, 'card shows the affiliation');
  ok(card.querySelector('.pp .pill'), 'card shows the track');
  ok(!m.$('#v-speakers .lede').textContent.includes('Sort by any column'),
     'the sort hint is dropped when there are no column headers to click');
  ok(m.$('#fc') && m.$('#fs'), 'country and track filters still there');

  console.log('\n[phone: filters still work on cards]');
  m.$('#fc').value = 'Germany';
  m.$('#fc').dispatchEvent(new m.Event('change'));
  ok(m.$$('#v-speakers .pcard').length === 10, 'country filter narrows to 10');
  m.$('#fc').value = '';
  m.$('#fc').dispatchEvent(new m.Event('change'));

  m.$('#q').value = 'KAIST';
  m.$('#q').dispatchEvent(new m.Event('input'));
  await settle(260);
  const hits = m.$$('#v-speakers .pcard').length;
  ok(hits > 0 && hits < 278, `search narrows cards to ${hits}`);
  ok(m.$('#v-speakers').innerHTML.includes('<mark>'), 'matches still highlighted');
  m.$('#q').value = '';
  m.$('#q').dispatchEvent(new m.Event('input'));
  await settle(260);

  console.log('\n[desktop is unchanged]');
  const d = boot({ url: 'file:///x/i.html', width: DESKTOP, talks: FIXTURE, posters: null, fetchImpl: noFetch });
  await settle();
  d.tab('speakers');
  ok(d.$('#v-speakers table.people'), 'still a table on desktop');
  ok(d.$$('#v-speakers tbody tr').length === 278, 'still 278 rows');
  ok(d.$$('#v-speakers th').length === 4, 'still four sortable columns');
  ok(!d.$('#v-speakers .pcard'), 'no phone cards leak onto desktop');
  ok(d.$('#v-speakers .lede').textContent.includes('Sort by any column'), 'sort hint present');
  d.tab('schedule');
  ok(d.$$('#v-schedule .dcol').length === 4, 'desktop schedule still four columns');
  ok(d.$$('#v-schedule .seg').length === 27, 'desktop schedule still 27 blocks');

  console.log('\n[rotating the phone re-renders]');
  const r = boot({ url: 'file:///x/i.html', width: PHONE, talks: FIXTURE, posters: null, fetchImpl: noFetch });
  await settle();
  r.tab('speakers');
  ok(r.$$('#v-speakers .pcard').length === 278, 'starts as cards');
  r.__setWidth(1280);
  await settle();
  ok(r.$('#v-speakers table.people'), 'widening swaps back to the table');
  ok(!r.$('#v-speakers .pcard'), 'no cards left behind');

  console.log('\n[the overflow that started this]');
  const longest = [...r.$$('#v-speakers .af')].map(e => e.textContent)
    .reduce((a, b) => (a.length > b.length ? a : b), '');
  ok(chars(longest, 14.4) > 342,
     `longest affiliation is ${Math.round(chars(longest, 14.4))}px unwrapped — wider than a phone`);
  ok(m.$('#v-speakers .pcard .pa'), 'on a phone it wraps inside a card instead of pushing the page sideways');

  console.log('\n[phone: one day of schedule at a time]');
  m.tab('schedule');
  ok(m.$('.daypick'), 'day picker shown');
  ok(m.$$('.daypick button').length === 4, 'one button per conference day');
  ok(m.$$('#v-schedule .dcol').length === 1, 'a single day column, not four');
  ok(m.$('#v-schedule .dcol .dhead').textContent.includes('Monday'),
     'opens on the first day, named in full');
  ok(m.$$('#v-schedule .day').length === 1, 'only that day\'s table below it');
  const monBlocks = m.$$('#v-schedule .seg').length;
  m.click(m.$('[data-day-pick="1"]'));
  ok(m.$('#v-schedule .dcol .dhead').textContent.includes('Tuesday'), 'picking a day switches it');
  ok(m.$('[data-day-pick="1"]').dataset.on === '1', 'the chosen day is marked');
  ok(m.$('[data-day-pick="0"]').dataset.on === '0', 'the previous one is not');
  ok(m.$$('#v-schedule .seg').length !== monBlocks, 'the blocks actually changed');
  // Lunch takes its width from CSS, not an inline lane percentage.
  ok(m.$$('#v-schedule .seg:not(.bare)').every(s => parseFloat(s.style.width) === 100),
     'with one day there are no lanes to share, so blocks run full width');
  ok(m.$$('#v-schedule .seg.bare').every(s => !s.style.width),
     'lunch is not lane-positioned at all');
  ok(m.$('#v-schedule .rail'), 'registration rail still drawn');
  ok(m.$$('#v-schedule .brk').length > 0, 'breaks still hairlines');

  console.log('\n[tablet: still one day at 700px, still four at 900px]');
  const tab = boot({ url: 'file:///x/i.html', width: 700, talks: FIXTURE, posters: null, fetchImpl: noFetch });
  await settle();
  ok(tab.$$('#v-schedule .dcol').length === 1, '700px gets the single-day view');
  const wide = boot({ url: 'file:///x/i.html', width: 900, talks: FIXTURE, posters: null, fetchImpl: noFetch });
  await settle();
  ok(wide.$$('#v-schedule .dcol').length === 4, '900px keeps all four columns');
  ok(!wide.$('.daypick'), 'and no day picker there');

  console.log('\nall mobile tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
