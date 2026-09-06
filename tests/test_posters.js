const { boot, settle, ok } = require('./harness.js');
const fs = require('fs');
const FIX = JSON.parse(fs.readFileSync('docs/posters.json', 'utf8'));

const noFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });

(async () => {
  const w = boot({ url: 'file:///x/i.html', talks: null, posters: FIX, fetchImpl: noFetch });
  await settle();
  const { $, $$, click, tab } = w;

  console.log('\n[tab exists and loads from the embedded copy]');
  ok($$('.tab').some(t => t.dataset.v === 'posters'), 'Posters tab present');
  tab('posters');
  ok(!$('#v-posters').hidden, 'Posters view shown');
  ok($$('#v-posters .pboard').length > 0, 'boards rendered with no fetch and no user action');

  console.log('\n[one session at a time]');
  const sessions = [...new Set(FIX.posters.map(p => p.session))].sort();
  ok($$('#v-posters [data-ps]').length === sessions.length,
     `${sessions.length} session buttons (PS1/PS2/PS3)`);
  const n1 = FIX.posters.filter(p => p.session === sessions[0]).length;
  ok($$('#v-posters .pboard').length === n1,
     `opens on ${sessions[0]} with its ${n1} boards, not all ${FIX.posters.length}`);
  ok($('#v-posters .lede').textContent.includes('Room 301'),
     'states date and room from the PDF');

  console.log('\n[switching session]');
  click($('#v-posters [data-ps="PS3"]'));
  const n3 = FIX.posters.filter(p => p.session === 'PS3').length;
  ok($$('#v-posters .pboard').length === n3, `PS3 shows its ${n3} boards`);
  ok($('#v-posters [data-ps="PS3"]').dataset.on === '1', 'PS3 button marked active');
  ok($('#v-posters [data-ps="PS1"]').dataset.on === '0', 'PS1 no longer active');
  ok($$('#v-posters .pboard .bn').every(b => b.textContent.trim().startsWith('PS3_')),
     'no PS1 board leaks into the PS3 list');

  console.log('\n[board content]');
  click($('#v-posters [data-ps="PS1"]'));
  const first = $('#v-posters .pboard');
  ok(first.querySelector('.bn').textContent.trim() === 'PS1_001', 'boards ordered by number');
  const src = FIX.posters.find(p => p.board === 'PS1_001');
  ok(first.querySelector('.pt').textContent.includes(src.title.slice(0, 40)), 'title shown');
  ok(first.querySelector('.pt i').textContent.includes(src.presenter), 'presenter shown');
  ok(first.querySelector('.pt i').textContent.includes(src.abstract_no), 'abstract number shown');
  ok(!!first.querySelector('.award') === src.award, 'award badge matches the source row');

  console.log('\n[grouped by track, in programme order]');
  const heads = $$('#v-posters h3').map(h => h.textContent.trim().split(' ')[0]);
  ok(heads.length > 1, `${heads.length} track groups`);
  const codes = [...new Set(FIX.posters.filter(p => p.session === 'PS1').map(p => p.track))];
  ok(heads.length === codes.length, 'one group per track present in this session');
  ok(heads[0] === 'S1', 'groups follow programme order, S1 first');

  console.log('\n[flagged rows are declared, not hidden]');
  const flagged = FIX.posters.filter(p => p.check);
  if (flagged.length) {
    const s = flagged[0].session;
    click($(`#v-posters [data-ps="${s}"]`));
    ok($$('#v-posters .flagged').length ===
       flagged.filter(p => p.session === s).length,
       `${flagged.length} rows that did not parse cleanly are marked in the UI`);
  } else {
    ok(true, 'nothing flagged in this fixture');
  }

  console.log('\n[search and plan]');
  click($('#v-posters [data-ps="PS1"]'));
  w.$('#q').value = 'PS1_001';
  w.$('#q').dispatchEvent(new w.Event('input'));
  await settle(260);
  ok($$('#v-posters .pboard').length === 1, 'search by board number finds one board');
  w.$('#q').value = '';
  w.$('#q').dispatchEvent(new w.Event('input'));
  await settle(260);

  tab('sessions');
  click($('[data-star="S1"]'));
  tab('posters');
  click($('#planToggle'));
  ok($$('#v-posters .pboard').length > 0, 'My plan leaves S1 boards visible');
  ok($$('#v-posters h3').every(h => h.textContent.trim().startsWith('S1')),
     'My plan narrows posters to starred tracks');

  console.log('\n[timings from the guidelines]');
  click($('#planToggle'));
  ok($('#v-posters .ptimes').textContent.includes('08:30–09:30'),
     'presentation window shown');
  ok($('#v-posters .ptimes').textContent.includes('17:00–18:00'), 'removal window shown');

  console.log('\nall poster tests passed');
})().catch(e => { console.error(e.message); process.exit(1); });
