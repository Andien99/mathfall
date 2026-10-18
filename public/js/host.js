// Mathfall teacher page: question sets, settings, lobby, live view, results.
import { h, $, $$, clear, setMath, mathHTML, toast, fmtTime } from './ui.js';
import * as SP from './sprites.js';

const C = window.MF_Content, A = window.MF_Answers, G = window.MF_Generators;
const socket = io({ transports: ['websocket', 'polling'] });
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Your browser could not save that.'); } }
};
let bank = { sets: [], topics: [] };
let bankCache = {};
let mySets = store.get('mf_sets', []);
let sel = store.get('mf_sel', { bankIds: ['year-7-algebra-core-skills'], setIds: [], gens: [], format: 'mix' });
let settings = store.get('mf_settings', { length: 'quick', timer: 60, adaptive: true, hints: true, sound: true, teamSize: 4, lateJoin: true, timeLimit: 30, wrongPause: 1.5, raid: true, raidMinutes: 8 });
if (settings.raid == null) { settings.raid = true; settings.raidMinutes = 8; if (!settings.timeLimit) settings.timeLimit = 30; }
let session = null;     // { code, hostToken }
let hs = null;          // latest host state
let view = 'setup';
let sortKey = 'name';

// ------------------------------------------------------------------ views
function show(v) {
  view = v;
  for (const el of $$('.view')) el.classList.toggle('on', el.id === v);
  renderNav();
}
function renderNav() {
  const nav = $('#topNav'); clear(nav);
  if (session && hs) {
    nav.append(h('span', { class: 'tip' }, 'Game ' + session.code));
    if (hs.state === 'ended') nav.append(h('button', { class: 'btn', onclick: newGame }, 'New game'));
  }
}
function newGame() {
  if (hs && hs.state !== 'ended' && !confirm('Leave this game? Students in it will stay connected until it ends.')) return;
  sessionStorage.removeItem('mf_host'); session = null; hs = null; show('setup'); renderSetup();
}

// ------------------------------------------------------------------ setup: questions
async function loadBank() {
  try { const r = await fetch('/api/bank'); bank = await r.json(); } catch (e) { bank = { sets: [], topics: G.list() }; }
  renderSetup();
}
for (const b of $$('.tabs button')) b.addEventListener('click', () => {
  for (const x of $$('.tabs button')) x.classList.toggle('on', x === b);
  for (const p of $$('.tabpane')) p.classList.toggle('on', p.id === 'tab-' + b.dataset.tab);
});
function saveSel() { store.set('mf_sel', sel); renderSummary(); }

function renderSetup() {
  renderBankTab(); renderMineTab(); renderGenTab(); renderSettings(); renderSummary();
}
function renderBankTab() {
  const pane = $('#tab-bank'); clear(pane);
  pane.append(h('p', { class: 'tip' }, 'Sets your school has agreed on. They live in the game\'s banks folder, so every teacher sees the same questions.'));
  if (!bank.sets.length) { pane.append(h('div', { class: 'empty' }, 'No school sets yet. Add a .json file to the banks folder and redeploy.')); return; }
  const list = h('div', { class: 'setlist' });
  for (const s of bank.sets) {
    const on = sel.bankIds.includes(s.id);
    const pv = h('div', { class: 'preview', style: { display: 'none' } });
    const row = h('div', { class: 'setrow' + (on ? ' on' : '') },
      h('input', { type: 'checkbox', class: 'check', checked: on, 'aria-label': 'Use ' + s.title, onchange: e => { sel.bankIds = e.target.checked ? [...new Set([...sel.bankIds, s.id])] : sel.bankIds.filter(x => x !== s.id); row.classList.toggle('on', e.target.checked); saveSel(); } }),
      h('div', null, h('h3', null, s.title), h('div', { class: 'meta' }, [s.year ? 'Year ' + s.year : '', s.topic, `${s.main} questions`, s.modified ? `${s.modified} supported` : ''].filter(Boolean).join(' · ')), s.description ? h('div', { class: 'meta' }, s.description) : null, pv),
      h('div', { class: 'ops' },
        h('button', { class: 'btn small', onclick: async () => { if (pv.style.display === 'none') { pv.style.display = 'block'; await fillPreview(pv, s.id); } else pv.style.display = 'none'; } }, 'Preview'),
        h('button', { class: 'btn small', onclick: async () => { const full = await getBankSet(s.id); const copy = { id: uid(), title: full.title + ' (my copy)', questions: full.questions, modified: full.modified || [] }; mySets.push(copy); store.set('mf_sets', mySets); renderMineTab(); openEditor(copy.id); } }, 'Copy and edit')));
    list.append(row);
  }
  pane.append(list);
}
async function getBankSet(id) {
  if (bankCache[id]) return bankCache[id];
  const r = await fetch('/api/bank/' + encodeURIComponent(id)); bankCache[id] = await r.json(); return bankCache[id];
}
async function fillPreview(pv, id) {
  const s = await getBankSet(id); clear(pv);
  const ol = h('ol');
  for (const q of s.questions.slice(0, 80)) ol.append(h('li', null, h('span', { html: mathHTML(q.q) }), ' ', h('span', { class: 'ans', html: '→ ' + mathHTML(answerText(q)) })));
  pv.append(ol);
}
function answerText(q) { if (q.type === 'mc') return q.options[q.correct] || ''; const a = (q.answers || [])[0] || ''; return /\$/.test(a) ? a : a ? '$' + a + '$' : ''; }

function renderMineTab() {
  const pane = $('#tab-mine'); clear(pane);
  pane.append(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } },
    h('button', { class: 'btn primary', onclick: () => { const s = { id: uid(), title: 'New question set', questions: [], modified: [] }; mySets.push(s); store.set('mf_sets', mySets); renderMineTab(); openEditor(s.id); } }, 'New set'),
    h('label', { class: 'btn' }, 'Import a file', h('input', { type: 'file', accept: '.json,.csv,.txt,.tsv', style: { display: 'none' }, onchange: e => importFile(e.target.files[0]) })),
    h('span', { class: 'tip', style: { alignSelf: 'center' } }, 'Flurry Fight exports work here too.')));
  if (!mySets.length) { pane.append(h('div', { class: 'empty' }, 'You have no sets of your own yet. Make one, import a file, or copy one from the school bank.')); return; }
  const list = h('div', { class: 'setlist' });
  for (const s of mySets) {
    const on = sel.setIds.includes(s.id);
    const need = [...s.questions, ...(s.modified || [])].filter(needsAnswer).length;
    list.append(h('div', { class: 'setrow' + (on ? ' on' : '') },
      h('input', { type: 'checkbox', class: 'check', checked: on, 'aria-label': 'Use ' + s.title, onchange: e => { sel.setIds = e.target.checked ? [...new Set([...sel.setIds, s.id])] : sel.setIds.filter(x => x !== s.id); saveSel(); renderMineTab(); } }),
      h('div', null, h('h3', null, s.title), h('div', { class: 'meta' }, `${s.questions.length} questions` + ((s.modified || []).length ? ` · ${s.modified.length} supported` : '') + (need ? ` · ${need} need an answer` : ''))),
      h('div', { class: 'ops' },
        h('button', { class: 'btn small', onclick: () => openEditor(s.id) }, 'Edit'),
        h('button', { class: 'btn small', onclick: () => download(slug(s.title) + '.json', JSON.stringify({ title: s.title, questions: s.questions, modified: s.modified || [] }, null, 1), 'application/json') }, 'Export'),
        h('button', { class: 'btn small', onclick: () => { if (confirm(`Delete "${s.title}"?`)) { mySets = mySets.filter(x => x.id !== s.id); sel.setIds = sel.setIds.filter(x => x !== s.id); store.set('mf_sets', mySets); saveSel(); renderMineTab(); } } }, 'Delete'))));
  }
  pane.append(list);
}
function renderGenTab() {
  const pane = $('#tab-gen'); clear(pane);
  pane.append(h('p', { class: 'tip' }, 'Fresh numbers every time, wrong options built from common mistakes, and a worked answer for every question. Supported students get the level below.'));
  for (const t of (bank.topics.length ? bank.topics : G.list())) {
    const cur = sel.gens.find(g => g.topic === t.id);
    const lev = h('select', { 'aria-label': 'Level for ' + t.name, onchange: () => { const g = sel.gens.find(x => x.topic === t.id); if (g) { g.level = +lev.value; saveSel(); } } }, ...t.levels.map((l, i) => h('option', { value: i + 1, selected: (cur ? cur.level : 2) === i + 1 }, ['Foundation', 'Core', 'Extension'][i] + ': ' + l)));
    const row = h('div', { class: 'genrow' + (cur ? ' on' : '') },
      h('input', { type: 'checkbox', class: 'check', checked: !!cur, 'aria-label': 'Use ' + t.name, onchange: e => { if (e.target.checked) sel.gens.push({ topic: t.id, level: +lev.value }); else sel.gens = sel.gens.filter(g => g.topic !== t.id); row.classList.toggle('on', e.target.checked); saveSel(); } }),
      h('div', null, h('b', null, t.name), h('div', { class: 'tip', style: { margin: 0 } }, 'Year ' + t.year + ' · ' + t.levels.join(' / '))),
      lev);
    pane.append(row);
  }
  pane.append(h('div', { class: 'setting', style: { marginTop: '10px' } }, h('label', null, 'Generated question style'), seg(['mix', 'mc', 'text'], ['Mix', 'Multiple choice', 'Typed'], sel.format, v => { sel.format = v; saveSel(); })));
}
function renderSummary() {
  const parts = [];
  for (const id of sel.bankIds) { const s = bank.sets.find(x => x.id === id); if (s) parts.push(`${s.title} (${s.main}${s.modified ? ' + ' + s.modified + ' supported' : ''})`); }
  for (const id of sel.setIds) { const s = mySets.find(x => x.id === id); if (s) parts.push(`${s.title} (${s.questions.length})`); }
  for (const g of sel.gens) { const t = (bank.topics.length ? bank.topics : G.list()).find(x => x.id === g.topic); if (t) parts.push(`${t.name}: ${['Foundation', 'Core', 'Extension'][g.level - 1]}`); }
  $('#selSummary').textContent = parts.length ? 'Using: ' + parts.join(' + ') : 'No questions selected yet.';
}

// ------------------------------------------------------------------ setup: settings
function seg(values, labels, cur, onPick) {
  const box = h('div', { class: 'seg', role: 'radiogroup' });
  values.forEach((v, i) => box.append(h('button', { class: String(cur) === String(v) ? 'on' : '', role: 'radio', 'aria-checked': String(cur) === String(v), onclick: () => { for (const b of box.children) b.classList.remove('on'); box.children[i].classList.add('on'); onPick(v); } }, labels[i])));
  return box;
}
function renderSettings() {
  const f = $('#settingsForm'); clear(f);
  const S = (label, sub, control) => h('div', { class: 'setting' }, h('label', null, label, sub ? h('div', { class: 'sub' }, sub) : null), control);
  const set = (k, v) => { settings[k] = v; store.set('mf_settings', settings); if (session && hs && hs.state !== 'ended') socket.emit('host:settings', { settings: { [k]: v } }); };
  f.append(
    S('Run length', 'One run is a tower climb ending in a boss. Teams who win start a harder run.', seg(['quick', 'standard', 'long'], ['Quick · 6 floors ~20 min', 'Standard · 9 floors ~30 min', 'Long · 13 floors ~45 min'], settings.length, v => set('length', v))),
    S('Round timer', 'Enemies act when everyone has acted, or when this runs out.', seg([0, 30, 45, 60, 90], ['Off', '30s', '45s', '60s', '90s'], settings.timer, v => set('timer', +v))),
    S('Team size', 'Students are grouped as they join. Balance teams in the lobby.', seg([2, 3, 4, 5], ['2', '3', '4', '5'], settings.teamSize, v => set('teamSize', +v))),
    S('Adaptive support', 'After two wrong in a row, a student gets supported questions until they get two right.', seg([true, false], ['On', 'Off'], settings.adaptive, v => set('adaptive', v === true || v === 'true'))),
    S('Hints', 'Students can open a hint before answering.', seg([true, false], ['On', 'Off'], settings.hints, v => set('hints', v === true || v === 'true'))),
    S('Pause after a wrong answer', 'Time to read the worked answer before the next question.', seg([0, 1.5, 3, 5], ['None', '1.5s', '3s', '5s'], settings.wrongPause, v => set('wrongPause', +v))),
    S('Time until the raid', 'When this runs out, every team is pulled into the raid boss fight together. The goal: be as strong as possible by then.', seg([0, 15, 20, 30, 45, 60], ['No timer', '15m', '20m', '30m', '45m', '60m'], settings.timeLimit, v => set('timeLimit', +v))),
    S('Raid boss', 'Off: the game simply ends when time is up.', seg([true, false], ['On', 'Off'], settings.raid !== false, v => set('raid', v === true || v === 'true'))),
    S('Raid length', 'How long teams have to beat the raid boss.', seg([5, 8, 10, 12], ['5m', '8m', '10m', '12m'], settings.raidMinutes || 8, v => set('raidMinutes', +v))),
    S('Sound on student devices', null, seg([true, false], ['On', 'Off'], settings.sound, v => set('sound', v === true || v === 'true'))),
    S('Late joining', null, seg([true, false], ['Allowed', 'Locked once started'], settings.lateJoin, v => set('lateJoin', v === true || v === 'true'))));
}

$('#createBtn').addEventListener('click', () => {
  $('#createErr').textContent = '';
  const sets = sel.setIds.map(id => mySets.find(s => s.id === id)).filter(Boolean).map(s => ({ title: s.title, questions: s.questions, modified: s.modified || [] }));
  const unanswered = sets.reduce((n, s) => n + [...s.questions, ...s.modified].filter(needsAnswer).length, 0);
  if (unanswered && !confirm(`${unanswered} question(s) still need an answer and will be skipped. Create the game anyway?`)) return;
  socket.emit('host:create', { settings, questions: { bankIds: sel.bankIds, sets, gens: sel.gens, format: sel.format } }, res => {
    if (!res.ok) { $('#createErr').textContent = res.msg || 'Could not create the game.'; return; }
    session = { code: res.code, hostToken: res.hostToken };
    sessionStorage.setItem('mf_host', JSON.stringify(session));
    show('lobby');
  });
});

// Solo test game: the same questions and settings, played by the teacher in a new tab
$('#testBtn').addEventListener('click', () => {
  $('#createErr').textContent = '';
  const tab = window.open('about:blank', '_blank');   // opened during the click so pop-up blockers allow it
  loadingTab(tab);
  const sets = sel.setIds.map(id => mySets.find(s => s.id === id)).filter(Boolean).map(s => ({ title: s.title, questions: s.questions, modified: s.modified || [] }));
  socket.emit('host:create', { settings, test: { invincible: $('#testInv').checked }, questions: { bankIds: sel.bankIds, sets, gens: sel.gens, format: sel.format } }, res => {
    if (!res.ok) { if (tab) tab.close(); $('#createErr').textContent = res.msg || 'Could not create the test game.'; return; }
    session = { code: res.code, hostToken: res.hostToken };
    sessionStorage.setItem('mf_host', JSON.stringify(session));
    const url = `/?test=1&code=${res.code}`;
    if (tab) tab.location.href = url; else location.href = url;
    show('lobby');
  });
});

// The blank test tab shows the loading screen straight away, while the server creates the game and the page loads.
function loadingTab(tab) {
  if (!tab || !window.MF_Loading) return;
  try {
    const d = tab.document;
    d.open();
    d.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Mathfall · Test game</title><link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/loading.css">' +
      '<style>html,body{margin:0;background:#0b0814}</style></head><body><div id="mfLoad">' + MF_Loading.markup('Test game') + '</div></body></html>');
    d.close();
    d.querySelector('.ml-what').textContent = 'Creating the test game…';
    d.querySelector('.ml-tip').textContent = 'Invincible heroes are on by default. The pink TEST button jumps to any room.';
  } catch (e) { /* the tab still works without it */ }
}

// ------------------------------------------------------------------ socket
socket.on('connect', () => {
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('mf_host') || 'null'); } catch (e) { return null; } })();
  if (saved) socket.emit('host:resume', saved, res => { if (res.ok) { session = saved; } else { sessionStorage.removeItem('mf_host'); session = null; show('setup'); } });
});
socket.on('host:state', st => {
  hs = st;
  if (!session) return;
  if (st.state === 'lobby') { if (view !== 'lobby') show('lobby'); renderLobby(); }
  else if (st.state === 'playing') { if (view !== 'live') show('live'); renderLive(); }
  else if (st.state === 'ended') { if (view !== 'results') { show('results'); renderResults(); } }
  applyRememberedPins();
  renderNav();
});
socket.on('watch', st => onWatch(st));

// students the teacher marked for supported questions in earlier games
function applyRememberedPins() {
  const pins = store.get('mf_modified', []);
  for (const p of hs.players) if (!p.modified && pins.includes(p.name.toLowerCase()) && !p._asked) { p._asked = true; socket.emit('host:modified', { pid: p.id, on: true }); }
}
function togglePin(p) {
  const on = !p.modified;
  socket.emit('host:modified', { pid: p.id, on });
  let pins = store.get('mf_modified', []);
  const n = p.name.toLowerCase();
  pins = on ? [...new Set([...pins, n])] : pins.filter(x => x !== n);
  store.set('mf_modified', pins);
}

// ------------------------------------------------------------------ lobby
function joinURL() { return location.origin.replace(/^https?:\/\//, ''); }
function renderLobby() {
  $('#joinUrl').textContent = joinURL();
  $('#joinCode').textContent = hs.code;
  const qrSrc = '/api/qr?text=' + encodeURIComponent(location.origin + '/?code=' + hs.code);
  if ($('#qr').getAttribute('src') !== qrSrc) $('#qr').src = qrSrc;
  $('#playerCount').textContent = hs.players.length;
  $('#lobbyQs').textContent = hs.questions.title;
  const grid = $('#lobbyTeams'); clear(grid);
  const byId = Object.fromEntries(hs.players.map(p => [p.id, p]));
  for (const t of hs.teams) grid.append(teamColumn(t, t.members.map(id => byId[id]).filter(Boolean), true));
  if (hs.players.length) {
    const nt = h('div', { class: 'tcol newteam', style: { '--tc': '#888' } }, 'Drop here for a new team');
    dropZone(nt, 'new');
    grid.append(nt);
  } else grid.append(h('div', { class: 'empty' }, 'Students appear here as they join.'));
}
function teamColumn(t, players, lobby) {
  const col = h('div', { class: 'tcol', style: { '--tc': t.color } }, h('h3', null, t.name, h('small', null, `${players.length} student${players.length === 1 ? '' : 's'}`)));
  for (const p of players) {
    const row = h('div', { class: 'pl' + (p.connected ? '' : ' off'), draggable: 'true' },
      h('button', { class: 'dot' + (p.modified ? ' on' : ''), title: p.modified ? 'Supported questions' : 'Main questions', 'aria-label': (p.modified ? 'Using supported questions: ' : 'Using main questions: ') + p.name, onclick: () => togglePin(p) }),
      h('img', { src: p.cls ? SP.portraitURL(p.skin || p.cls, 0, 'open', 2) : SP.iconURL('focus', 2), alt: '' }),
      h('div', { class: 'n' }, p.name, h('div', { class: 'c' }, p.cls ? C.HEROES[p.cls].name : 'Choosing a hero')),
      h('button', { class: 'x', title: 'Remove ' + p.name, 'aria-label': 'Remove ' + p.name, onclick: () => { if (confirm(`Remove ${p.name} from the game?`)) socket.emit('host:kick', { pid: p.id }); } }, '×'));
    row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', p.id); });
    col.append(row);
  }
  dropZone(col, t.id);
  return col;
}
function dropZone(el, teamId) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drop'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drop'); const pid = e.dataTransfer.getData('text/plain'); if (pid) socket.emit('host:move', { pid, teamId }); });
}
$('#balanceBtn').addEventListener('click', () => socket.emit('host:balance', {}));
$('#startBtn').addEventListener('click', () => socket.emit('host:start', {}, r => { if (!r.ok) toast(r.msg || 'Could not start.'); }));

// ------------------------------------------------------------------ live
const NODE_LABEL = { enemy: 'Fighting monsters', elite: 'Fighting an elite', boss: 'Fighting the boss', treasure: 'Opening treasure', rest: 'At the campfire', merchant: 'At the merchant', unknown: 'Exploring' };
function renderLive() {
  $('#liveCode').textContent = hs.code;
  renderTower();
  $('#raidBtn').style.display = hs.raid || hs.settings.raid === false ? 'none' : '';
  $('#pauseBtn').textContent = hs.paused ? 'Resume' : 'Pause all';
  const grid = $('#liveTeams'); clear(grid);
  const byId = Object.fromEntries(hs.players.map(p => [p.id, p]));
  for (const t of hs.teams) {
    const card = h('div', { class: 'lteam', style: { '--tc': t.color } });
    const ms = t.members.map(id => byId[id]).filter(Boolean);
    const acc = ms.reduce((a, p) => [a[0] + p.correct, a[1] + p.answered], [0, 0]);
    card.append(h('h3', null, t.name, h('small', null, `Act ${(t.asc || 0) + 1} · ` + `${t.history.bossKills} boss win${t.history.bossKills === 1 ? '' : 's'}`)));
    if (t.rows) { const pr = h('div', { class: 'progress' }); for (let i = 1; i <= t.rows; i++) pr.append(h('i', { class: i < t.floor ? 'done' : i === t.floor ? 'now' : '' })); card.append(pr); }
    let room = 'Choosing a path', sub = '';
    if (t.phase === 'combat' && t.combat) { room = NODE_LABEL[t.node] || 'Fighting'; sub = `Round ${t.combat.round} · ` + t.combat.enemies.map(e => `${e.name} ${e.hp}/${e.maxHp}`).join(', '); }
    else if (t.phase === 'room') room = ROOM_LABEL[t.room] || 'Exploring';
    card.append(h('div', { class: 'lroom' }, room, sub ? h('div', { class: 'sub' }, sub) : null));
    if (t.heroes) card.append(h('div', { class: 'lheroes' }, ...t.heroes.map(x => h('div', { class: 'lh' + (x.downed ? ' ko' : '') }, h('img', { src: SP.portraitURL(x.skin || x.cls, 0, x.downed ? 'closed' : 'open', 2), alt: '' }), h('div', null, x.name, h('div', { class: 'bar' }, h('i', { style: { width: Math.round(100 * x.hp / x.maxHp) + '%' } }))), h('span', { class: 'lstats' }, `${x.hp}/${x.maxHp}`)))));
    card.append(h('div', { class: 'lstats' }, acc[1] ? `Team accuracy ${Math.round(100 * acc[0] / acc[1])}% · ${acc[1]} answered` : 'No answers yet'));
    card.append(h('div', { class: 'ops' }, h('button', { class: 'btn small', onclick: () => openWatch(t) }, 'Watch'), h('button', { class: 'btn small', title: 'Ends the round or room for this team now', onclick: () => socket.emit('host:skipRoom', { teamId: t.id }) }, 'Hurry along')));
    grid.append(card);
  }
  renderLiveTable();
}
function renderLiveTable() {
  const tb = $('#liveTable'); clear(tb);
  const teamName = Object.fromEntries(hs.teams.map(t => [t.id, t]));
  const rows = hs.players.map(p => ({ ...p, pct: p.answered ? Math.round(100 * p.correct / p.answered) : -1, team: (teamName[p.teamId] || {}).name || '' }));
  const cmp = { name: (a, b) => a.name.localeCompare(b.name), team: (a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name), answered: (a, b) => b.answered - a.answered, pct: (a, b) => a.pct - b.pct, streak: (a, b) => b.streak - a.streak };
  rows.sort(cmp[sortKey] || cmp.name);
  const th = (k, label, num) => h('th', { class: num ? 'num' : '', onclick: () => { sortKey = k; renderLiveTable(); } }, label + (sortKey === k ? ' ▾' : ''));
  tb.append(h('thead', null, h('tr', null, h('th', null, ''), th('name', 'Student'), th('team', 'Team'), th('answered', 'Answered', 1), th('pct', 'Correct', 1), th('streak', 'Streak', 1), h('th', null, 'Status'))));
  const body = h('tbody');
  for (const p of rows) {
    body.append(h('tr', null,
      h('td', null, h('button', { class: 'dot' + (p.modified ? ' on' : ''), title: 'Supported questions', 'aria-label': 'Supported questions for ' + p.name, onclick: () => togglePin(p) })),
      h('td', null, p.name), h('td', null, p.team), h('td', { class: 'num' }, p.answered),
      h('td', { class: 'num' }, p.pct < 0 ? '–' : h('span', { class: 'pct ' + (p.pct < 50 ? 'lo' : p.pct < 75 ? 'mid' : 'hi') }, p.pct + '%')),
      h('td', { class: 'num' }, p.streak), h('td', null, !p.connected ? 'Offline' : p.busy ? 'Answering' : '')));
  }
  tb.append(body);
}
setInterval(() => {
  if (!hs || hs.state !== 'playing') return;
  const clock = $('#liveClock');
  if (hs.endsAt) clock.textContent = (hs.paused ? 'Paused · ' : '') + fmtTime(hs.endsAt - hs.now - (hs.paused ? 0 : Date.now() - lastStateAt)) + (hs.raid ? ' left in the raid' : hs.settings.raid !== false ? ' until the raid' : ' left');
  else clock.textContent = hs.paused ? 'Paused' : '';
}, 500);
let lastStateAt = Date.now();
socket.on('host:state', () => { lastStateAt = Date.now(); });
$('#pauseBtn').addEventListener('click', () => socket.emit('host:pause', { paused: !hs.paused }));
$('#addTimeBtn').addEventListener('click', () => socket.emit('host:time', { minutes: 5 }, () => toast('Added 5 minutes')));
$('#endBtn').addEventListener('click', () => { if (confirm('End the game for everyone and show results?')) socket.emit('host:end', {}); });

// ------------------------------------------------------------------ tower map: where every team is, live
const ROOM_LABEL = { victory: 'Choosing an upgrade', defeat: 'Fell, restarting', complete: 'Beat the boss!', treasure: 'Opening treasure', rest: 'At the campfire', merchant: 'At the merchant', event: 'At a mystery room', raidEnd: 'Raid over' };
function teamStatus(t) {
  if (t.phase === 'combat' && t.combat) return t.combat.type === 'raid' ? 'Raiding' : t.combat.type === 'boss' ? 'Boss fight!' : t.combat.type === 'elite' ? 'Elite fight' : 'Fighting';
  if (t.phase === 'room') return ROOM_LABEL[t.room] || 'Exploring';
  if (t.phase === 'map') return 'Choosing a path';
  return '';
}
function renderTower() {
  const box = $('#towerMap'); clear(box);
  const teams = hs.teams.filter(t => t.rows);
  if (hs.raid) {
    const r = hs.raid;
    const pct = Math.max(0, 100 * r.hp / r.maxHp);
    const max = Math.max(1, ...hs.teams.map(t => r.dmg[t.id] || 0));
    box.append(h('div', { class: 'raid-view' },
      h('div', { class: 'raid-title' }, h('b', null, 'INFERNO DRAGON'), h('span', null, r.over ? (r.won ? 'Defeated!' : 'Survived') : 'Heart of the Tower · all teams fighting')),
      h('div', { class: 'raid-hp' }, h('i', { style: { width: pct + '%' } }), h('span', null, `${r.hp} / ${r.maxHp}`)),
      h('div', { class: 'raid-teams' }, ...hs.teams.slice().sort((a, b) => (r.dmg[b.id] || 0) - (r.dmg[a.id] || 0)).map(t => h('button', { class: 'rteam', style: { '--tc': t.color }, onclick: () => openWatch(t), title: 'Show this team on screen' },
        h('span', { class: 'nm' }, t.name), h('div', { class: 'bar' }, h('i', { style: { width: (100 * (r.dmg[t.id] || 0) / max) + '%' } })), h('b', null, Math.round(r.dmg[t.id] || 0)), h('span', { class: 'mini' }, ...(t.heroCls || []).map(x => h('img', { class: x.downed ? 'ko' : '', src: SP.portraitURL(x.skin || x.cls, x.variant, x.downed ? 'closed' : 'open', 1), alt: '' }))))))));
    return;
  }
  box.append(h('div', { class: 'card-h' }, h('h2', null, 'The tower'), h('p', null, 'Every team, live. Click a team to show its battle on your screen.')));
  if (!teams.length) { box.append(h('p', { class: 'tip' }, 'Teams appear here once the game starts.')); return; }
  const rows = Math.max(...teams.map(t => t.rows));            // floors + the boss
  const token = t => h('button', { class: 'ttoken' + (t.phase === 'combat' ? ' fighting' : ''), style: { '--tc': t.color }, onclick: () => openWatch(t), title: 'Show Team ' + t.name + ' on screen' },
    h('span', { class: 'flag' }), h('b', null, t.name), h('span', { class: 'asc' }, 'Act ' + ((t.asc || 0) + 1)),
    h('span', { class: 'mini' }, ...(t.heroCls || []).map(x => h('img', { class: x.downed ? 'ko' : '', src: SP.portraitURL(x.skin || x.cls, x.variant, x.downed ? 'closed' : 'open', 1), alt: '' }))),
    h('span', { class: 'st' }, teamStatus(t)));
  const floorOf = t => Math.max(1, t.floor || 1);
  const scene = h('div', { class: 'tower-scene' });
  const tw = h('div', { class: 'tw' });
  // the boss chamber at the top, under the battlements
  const bossTeams = teams.filter(t => floorOf(t) >= rows);
  const kinds = [...new Set(teams.map(t => t.boss || 'minotaur'))];
  tw.append(h('div', { class: 'tw-crown' }),
    h('div', { class: 'tw-boss' + (bossTeams.length ? ' lit' : '') },
      h('div', { class: 'tw-bosspics' }, ...kinds.map(k => h('img', { src: SP.enemyPortraitURL(k, 1), alt: C.ENEMIES[k].name, title: C.ENEMIES[k].name }))),
      h('span', { class: 'plaque boss' }, 'Boss'),
      h('div', { class: 'lane' }, ...bossTeams.map(token))));
  for (let f = rows - 1; f >= 1; f--) {
    const here = teams.filter(t => floorOf(t) === f);
    tw.append(h('div', { class: 'tw-floor' + (here.length ? ' lit' : '') },
      h('span', { class: 'win l' }), h('span', { class: 'plaque' }, String(f)),
      h('div', { class: 'lane' }, ...here.map(token)),
      h('span', { class: 'win r' })));
  }
  tw.append(h('div', { class: 'tw-base' }, h('span', { class: 'door' })));
  scene.append(tw);
  box.append(scene);
}
$('#raidBtn').addEventListener('click', () => { if (confirm('Start the raid now? Every team stops where they are and fights the raid boss together.')) socket.emit('host:raid', {}, r => { if (!r.ok) toast(r.msg || 'Could not start the raid.'); }); });

// ------------------------------------------------------------------ spectate
let watchScene = null, watchTeam = null;
async function openWatch(t) {
  watchTeam = t.id;
  $('#watch').classList.add('show');
  $('#watchTitle').textContent = 'Team ' + t.name;
  const { BattleScene } = await import('./scene.js');
  if (!watchScene) watchScene = new BattleScene($('#watchCanvas'), { onBanner: () => {}, onAnimDone: () => { if (watchScene.last) watchScene.sync(watchScene.last.run, { force: true }); } });
  watchScene.actors.clear();
  const fitW = () => { const r = $('.watch-stage').getBoundingClientRect(); watchScene.resize(r.width, r.height, { x: 0, y: 10, w: r.width, h: r.height - 20 }); };
  fitW();
  socket.emit('host:watch', { teamId: t.id });
}
function onWatch(st) {
  if (!watchScene || !st.run) return;
  watchScene.last = st;
  const run = st.run;
  const node = run.map.nodes.find(n => n.id === run.map.pos);
  watchScene.setTheme(run.raidMode ? 'inferno' : (node && node.type === 'boss') ? 'lair' : node && node.row >= Math.ceil((run.rows - 1) / 2) ? 'crypt' : 'halls');
  watchScene.raid = run.raidMode ? st.raid : null;
  watchScene.mode = run.phase === 'combat' ? 'battle' : 'room';
  if (st.events && st.events.length) watchScene.play(st.events);
  watchScene.sync(run, { spawnFx: true });
  watchScene.setRoom(run.phase === 'room' ? run.room : null);
  $('#watchInfo').textContent = run.raidMode ? (st.raid ? `Raid · Inferno Dragon ${st.raid.hp}/${st.raid.maxHp}` : 'Raid') : run.phase === 'combat' && run.combat ? `Floor ${run.floor} · Round ${run.combat.round}` : run.phase === 'map' ? 'Choosing a path' : 'Floor ' + run.floor;
}
$('#watchClose').addEventListener('click', () => { $('#watch').classList.remove('show'); socket.emit('host:watch', { teamId: null }); watchTeam = null; });

// ------------------------------------------------------------------ results
function renderResults() {
  const r = hs.results; const box = $('#results'); clear(box);
  if (!r) return;
  const head = h('div', { class: 'card res-head' }, h('h1', null, 'Results'), h('div', null, h('button', { class: 'btn primary', onclick: () => download(`mathfall-results-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(r), 'text/csv') }, 'Download results (CSV)'), ' ', h('button', { class: 'btn', onclick: newGame }, 'New game')));
  const teams = r.teams.slice().sort((a, b) => (b.bossKills - a.bossKills) || ((b.ascNow * 100 + b.floorNow) - (a.ascNow * 100 + a.floorNow)) || (b.bestFloor - a.bestFloor));
  const stand = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, 'Team standings')), h('div', { class: 'standings' }, ...teams.map((t, i) => h('div', { class: 'stand', style: { '--tc': t.color } }, h('span', { class: 'place' }, i + 1), h('div', null, h('b', null, t.name), h('div', { class: 'tip', style: { margin: 0 } }, t.members.join(', '))), h('div', null, `${t.bossKills} boss win${t.bossKills === 1 ? '' : 's'} · best floor ${t.bestFloor} · ${t.wipes} fall${t.wipes === 1 ? '' : 's'}`)))));
  const skills = Object.entries(r.skills).map(([k, v]) => ({ k, pct: Math.round(100 * v.c / v.a), a: v.a })).sort((a, b) => a.pct - b.pct);
  const sk = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, 'Skills, weakest first'), h('p', null, 'Class accuracy on each skill.')), ...skills.map(s => h('div', { class: 'skillrow' }, h('span', null, s.k, h('span', { class: 'tip' }, ` (${s.a})`)), h('div', { class: 'bar' }, h('i', { style: { width: s.pct + '%' } })), h('b', null, s.pct + '%'))));
  const hard = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, 'Hardest questions'), h('p', null, 'Questions asked at least twice, lowest accuracy first.')), ...r.questions.filter(q => q.asked >= 2).slice(0, 12).map(q => h('div', { class: 'hardq' }, h('div', { html: mathHTML(q.text) + (q.track === 'modified' ? ' <span class="tip">(supported)</span>' : '') }), h('b', { class: 'pct ' + (q.pct < 50 ? 'lo' : q.pct < 75 ? 'mid' : 'hi') }, `${q.pct}% of ${q.asked}`))));
  const tbl = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Student'), h('th', null, 'Team'), h('th', { class: 'num' }, 'Answered'), h('th', { class: 'num' }, 'Correct'), h('th', { class: 'num' }, 'Best streak'), h('th', { class: 'num' }, 'Avg time'), h('th', null, 'Weakest skill'))),
    h('tbody', null, ...r.players.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => {
      const weak = Object.entries(p.bySkill).filter(([, v]) => v.a >= 2).sort((a, b) => a[1].c / a[1].a - b[1].c / b[1].a)[0];
      return h('tr', null, h('td', null, p.modified ? h('span', { class: 'dot on', style: { display: 'inline-block', marginRight: '6px', width: '10px', height: '10px' } }) : null, p.name), h('td', null, p.team), h('td', { class: 'num' }, p.answered), h('td', { class: 'num' }, h('span', { class: 'pct ' + (p.pct < 50 ? 'lo' : p.pct < 75 ? 'mid' : 'hi') }, p.answered ? p.pct + '%' : '–')), h('td', { class: 'num' }, p.best), h('td', { class: 'num' }, p.avgSec ? p.avgSec + 's' : '–'), h('td', null, weak ? `${weak[0]} (${Math.round(100 * weak[1].c / weak[1].a)}%)` : ''));
    })));
  const raidCard = r.raid ? h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, r.raid.won ? 'Raid: Inferno Dragon defeated' : `Raid: Inferno Dragon survived (${r.raid.hp}/${r.raid.maxHp} HP left)`)),
    ...r.raid.teams.map(t => h('div', { class: 'skillrow' }, h('span', { style: { color: t.color, fontWeight: 800 } }, t.name), h('div', { class: 'bar' }, h('i', { style: { width: (100 * t.dmg / Math.max(1, r.raid.teams[0].dmg)) + '%', background: t.color } })), h('b', null, t.dmg)))) : null;
  box.append(head, raidCard, h('div', { class: 'res-grid' }, stand, sk), h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', null, 'Students')), tbl), hard);
}
function toCSV(r) {
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const skills = Object.keys(r.skills);
  const lines = [['Student', 'Team', 'Hero', 'Question list', 'Answered', 'Correct', 'Percent', 'Best streak', 'Avg seconds', 'Damage', 'Healing', 'Raid damage', 'Quick-times', ...skills.map(s => s + ' %')].map(q).join(',')];
  for (const p of r.players) lines.push([p.name, p.team, p.cls ? C.HEROES[p.cls].name : '', p.modified ? 'Supported' : (p.supportAnswered ? 'Main + adaptive support' : 'Main'), p.answered, p.correct, p.pct, p.best, p.avgSec, p.dmg, p.heal, p.raidDmg || 0, p.qte ? `${p.qte.c}/${p.qte.a}` : '', ...skills.map(s => p.bySkill[s] ? Math.round(100 * p.bySkill[s].c / p.bySkill[s].a) : '')].map(q).join(','));
  lines.push('');
  lines.push(['Skill', 'Answered', 'Class percent'].map(q).join(','));
  for (const [k, v] of Object.entries(r.skills)) lines.push([k, v.a, Math.round(100 * v.c / v.a)].map(q).join(','));
  lines.push('');
  lines.push(['Question', 'Skill', 'List', 'Asked', 'Percent correct'].map(q).join(','));
  for (const x of r.questions) lines.push([x.text.replace(/\$/g, ''), x.skill, x.track === 'modified' ? 'Supported' : 'Main', x.asked, x.pct].map(q).join(','));
  return lines.join('\r\n');
}

// ------------------------------------------------------------------ editor
let edSet = null, edComposer = { type: 'mc', target: 'main', editing: null };
function openEditor(id) {
  edSet = mySets.find(s => s.id === id); if (!edSet) return;
  edSet.modified = edSet.modified || [];
  edComposer = { type: 'mc', target: 'main', editing: null };
  $('#editor').classList.add('show');
  renderEditor();
}
function closeEditor() { store.set('mf_sets', mySets); $('#editor').classList.remove('show'); renderMineTab(); renderSummary(); }
function saveSet() { edSet.updated = Date.now(); store.set('mf_sets', mySets); }
function renderEditor() {
  const m = $('#editor'); clear(m);
  const ed = h('div', { class: 'ed' });
  const title = h('input', { value: edSet.title, 'aria-label': 'Set title', onchange: () => { edSet.title = title.value.trim() || 'Untitled set'; saveSet(); } });
  ed.append(h('div', { class: 'ed-top' }, title, h('div', null, h('button', { class: 'btn', onclick: () => importInto() }, 'Paste a list'), ' ', h('label', { class: 'btn' }, 'Upload a file', h('input', { type: 'file', accept: '.json,.csv,.txt,.tsv', style: { display: 'none' }, onchange: e => importFile(e.target.files[0], edSet) })), ' ', h('button', { class: 'btn primary', onclick: closeEditor }, 'Done'))));
  const lists = h('div', { class: 'ed-grid' });
  lists.append(qList('main', 'Main list', edSet.questions), qList('modified', 'Supported list', edSet.modified, 'For students who need simpler questions. Optional.'));
  ed.append(lists, composer());
  m.append(ed);
}
function qList(key, label, arr, sub) {
  const box = h('div', { class: 'ed-list' }, h('h3', null, label, h('small', null, `${arr.length} question${arr.length === 1 ? '' : 's'}`)));
  if (sub) box.append(h('div', { class: 'tip', style: { marginTop: 0 } }, sub));
  if (!arr.length) box.append(h('div', { class: 'empty' }, 'No questions yet. Add one below' + (key === 'modified' ? ' or drag one across.' : '.')));
  arr.forEach((q, i) => {
    const need = needsAnswer(q);
    const row = h('div', { class: 'qrow', draggable: 'true' },
      h('span', { class: 'ty ' + q.type }, q.type === 'mc' ? 'MC' : 'Typed'),
      h('div', null, h('div', { html: mathHTML(q.q) }), h('div', { class: 'a' + (need ? ' need' : ''), html: need ? 'Needs an answer' : '✓ ' + mathHTML(answerText(q)) }), q.skill ? h('div', { class: 'sk' }, q.skill) : null),
      h('div', { class: 'ops' },
        h('button', { title: 'Edit', 'aria-label': 'Edit', onclick: () => { edComposer = { type: q.type, target: key, editing: i, draft: JSON.parse(JSON.stringify(q)) }; renderEditor(); } }, '✎'),
        h('button', { title: 'Copy to the other list', 'aria-label': 'Copy to the other list', onclick: () => { (key === 'main' ? edSet.modified : edSet.questions).push(JSON.parse(JSON.stringify(q))); saveSet(); renderEditor(); } }, '⇄'),
        h('button', { title: 'Move up', 'aria-label': 'Move up', onclick: () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; saveSet(); renderEditor(); } } }, '↑'),
        h('button', { title: 'Delete', 'aria-label': 'Delete', onclick: () => { const removed = arr.splice(i, 1)[0]; saveSet(); renderEditor(); toastUndo(() => { arr.splice(i, 0, removed); saveSet(); renderEditor(); }); } }, '🗑')));
    row.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', JSON.stringify({ from: key, i })));
    box.append(row);
  });
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drop'); });
  box.addEventListener('dragleave', () => box.classList.remove('drop'));
  box.addEventListener('drop', e => {
    e.preventDefault(); box.classList.remove('drop');
    try { const d = JSON.parse(e.dataTransfer.getData('text/plain')); if (d.from === key) return; const src = d.from === 'main' ? edSet.questions : edSet.modified; const [q] = src.splice(d.i, 1); arr.push(q); saveSet(); renderEditor(); } catch (err) { /* ignore */ }
  });
  return box;
}
function toastUndo(fn) {
  const t = $('#toast'); clear(t); t.append('Question deleted. ', h('button', { class: 'btn small', onclick: () => { fn(); t.className = ''; } }, 'Undo'));
  t.className = 'show'; clearTimeout(toastUndo.t); toastUndo.t = setTimeout(() => { t.className = ''; }, 5000);
}
function composer() {
  const c = edComposer;
  const d = c.draft || (c.draft = { type: c.type, q: '', options: ['', '', '', ''], correct: 0, answers: [''], skill: '', hint: '', solution: '' });
  d.type = c.type;
  d.options = d.options || ['', '', '', '']; d.answers = d.answers || [''];
  while (d.options.length < 4) d.options.push('');
  const box = h('div', { class: 'composer' });
  box.append(h('h3', null, c.editing != null ? 'Edit question' : 'Add a question'), h('div', { class: 'tip', style: { marginTop: 0 } }, 'Write maths between dollar signs: $3x + 5x$, $\\frac{1}{2}$, $x^{2}$. The preview shows what students see.'));
  const typeSeg = seg(['mc', 'text'], ['Pick from options', 'Type the answer'], c.type, v => { c.type = v; renderEditor(); });
  const target = seg(['main', 'modified'], ['Main list', 'Supported list'], c.target, v => { c.target = v; });
  box.append(h('div', { class: 'comp-grid' }, h('div', null, h('label', null, 'Question type'), typeSeg), h('div', null, h('label', null, 'Add to'), target)));
  const qIn = h('textarea', { 'aria-label': 'Question', placeholder: 'Simplify $3x + 5x$.' }); qIn.value = d.q;
  const pv = h('div', { class: 'livepv' });
  const upd = () => { d.q = qIn.value; setMath(pv, d.q || ' '); };
  qIn.addEventListener('input', upd); upd();
  box.append(h('label', null, 'Question'), qIn, pv);
  if (c.type === 'mc') {
    const grid = h('div', { class: 'comp-grid' });
    d.options.slice(0, 4).forEach((o, i) => {
      const inp = h('input', { type: 'text', placeholder: i === 0 ? 'Correct answer, e.g. $8x$' : `Wrong answer ${i}`, value: o, 'aria-label': i === 0 ? 'Correct answer' : 'Wrong answer ' + i });
      inp.addEventListener('input', () => { d.options[i] = inp.value; });
      grid.append(h('div', null, h('label', null, i === 0 ? 'Correct answer' : `Wrong answer ${i}`), inp));
    });
    box.append(grid, h('div', { class: 'tip' }, 'Options are shuffled for each student. Leave a wrong answer empty to have fewer options.'));
  } else {
    const ans = h('input', { type: 'text', placeholder: '8k+6   (separate other accepted answers with |)', value: d.answers.join(' | '), 'aria-label': 'Accepted answers' });
    ans.addEventListener('input', () => { d.answers = ans.value.split('|').map(s => s.trim()).filter(Boolean); runTest(); });
    const test = h('input', { type: 'text', placeholder: 'Type what a student might write', 'aria-label': 'Test an answer' });
    const res = h('span', { class: 'testres' });
    const runTest = () => { if (!test.value.trim()) { res.textContent = ''; return; } const ok = A.mark(test.value, d.answers); res.textContent = ok ? '✓ Marked right' : '✗ Marked wrong'; res.className = 'testres ' + (ok ? 'ok' : 'no'); };
    test.addEventListener('input', runTest);
    box.append(h('label', null, 'Accepted answer'), ans, h('label', null, 'Test it'), h('div', { class: 'testbox' }, test, res),
      h('div', { class: 'tip' }, 'Spacing, capitals, term order (6 + 8k = 8k + 6), letter order, equal numbers (1/2 = 0.5), x = 5 and units are accepted. Unsimplified answers, leftover brackets and × or ÷ are marked wrong.'));
  }
  const sk = h('input', { type: 'text', value: d.skill || '', placeholder: 'e.g. Collecting like terms', 'aria-label': 'Skill' }); sk.addEventListener('input', () => { d.skill = sk.value; });
  const hint = h('input', { type: 'text', value: d.hint || '', placeholder: 'Optional. Shown when a student taps Hint.', 'aria-label': 'Hint' }); hint.addEventListener('input', () => { d.hint = hint.value; });
  const sol = h('textarea', { placeholder: 'Optional. Shown after a wrong answer: $3 + 5 = 8$, so $8x$.', 'aria-label': 'Worked solution' }); sol.value = d.solution || ''; sol.addEventListener('input', () => { d.solution = sol.value; });
  box.append(h('div', { class: 'comp-grid' }, h('div', null, h('label', null, 'Skill (for the results page)'), sk), h('div', null, h('label', null, 'Hint'), hint)), h('label', null, 'Worked solution'), sol);
  const err = h('span', { class: 'err' });
  const save = () => {
    const q = cleanQuestion(d);
    if (!q.q) { err.textContent = 'Write the question first.'; return; }
    if (q.type === 'mc' && q.options.length < 2) { err.textContent = 'Add the correct answer and at least one wrong answer.'; return; }
    if (q.type === 'text' && !q.answers.length) { err.textContent = 'Add the accepted answer.'; return; }
    const list = c.target === 'main' ? edSet.questions : edSet.modified;
    if (c.editing != null) list[c.editing] = q; else list.push(q);
    saveSet();
    edComposer = { type: c.type, target: c.target, editing: null };
    renderEditor();
    toast(c.editing != null ? 'Question updated' : 'Question added');
  };
  const add = h('button', { class: 'btn primary', onclick: save }, c.editing != null ? 'Save changes' : 'Add question');
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
  box.append(h('div', { class: 'comp-actions' }, add, c.editing != null ? h('button', { class: 'btn', onclick: () => { edComposer = { type: c.type, target: c.target, editing: null }; renderEditor(); } }, 'Cancel') : h('span', { class: 'tip' }, 'Ctrl + Enter adds it and starts the next one.'), err));
  return box;
}
function cleanQuestion(d) {
  const base = { type: d.type, q: (d.q || '').trim(), skill: (d.skill || '').trim() };
  if (d.hint && d.hint.trim()) base.hint = d.hint.trim();
  if (d.solution && d.solution.trim()) base.solution = d.solution.trim();
  if (d.type === 'mc') { base.options = d.options.map(o => (o || '').trim()).filter(Boolean); base.correct = 0; }
  else base.answers = (d.answers || []).map(a => a.trim()).filter(Boolean);
  return base;
}
function needsAnswer(q) { return q.type === 'mc' ? !(q.options && q.options.length > 1 && q.options[q.correct]) : !(q.answers && q.answers.length); }

// ------------------------------------------------------------------ import
function importInto() {
  const m = $('#editor');
  const box = h('div', { class: 'composer import-box' }, h('h3', null, 'Paste a list'), h('div', { class: 'tip' }, 'One question per line. Separate parts with | or a tab: question | correct answer | wrong answers… | skill. With only a correct answer, it becomes a typed question.'));
  const ta = h('textarea', { placeholder: 'Simplify $3x + 5x$ | 8x\nWhich is a like term to $3a$? | $a$ | $3b$ | $3$ | Identifying like terms' });
  const target = { v: 'main' };
  box.append(ta, h('div', { class: 'comp-actions' }, seg(['main', 'modified'], ['Main list', 'Supported list'], 'main', v => { target.v = v; }), h('button', { class: 'btn primary', onclick: () => { const qs = parseLines(ta.value); (target.v === 'main' ? edSet.questions : edSet.modified).push(...qs); saveSet(); renderEditor(); toast(`Added ${qs.length} question${qs.length === 1 ? '' : 's'}`); } }, 'Add these'), h('button', { class: 'btn', onclick: renderEditor }, 'Cancel')));
  m.querySelector('.ed').append(box);
  ta.focus();
}
function parseLines(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(line.includes('\t') ? '\t' : '|').map(s => s.trim());
    const [q, correct, ...rest] = parts;
    if (!q) continue;
    let skill = '';
    // a trailing part with no maths and several words is treated as the skill
    if (rest.length && /^[A-Za-z][A-Za-z ,'-]{6,}$/.test(rest[rest.length - 1]) && !/^\$/.test(rest[rest.length - 1]) && rest.length !== 1) skill = rest.pop();
    else if (rest.length === 1 && /^[A-Za-z][A-Za-z ,'-]{10,}$/.test(rest[0])) skill = rest.pop();
    const wrong = rest.filter(Boolean);
    if (!correct) out.push({ type: 'text', q, answers: [], skill });
    else if (wrong.length) out.push({ type: 'mc', q, options: [correct, ...wrong].slice(0, 6), correct: 0, skill });
    else out.push({ type: 'text', q, answers: correct.split(/\s*;\s*/), skill });
  }
  return out;
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') inQ = false; else cell += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
async function importFile(file, intoSet) {
  if (!file) return;
  const text = await file.text();
  let set = null;
  try {
    if (/\.json$/i.test(file.name)) {
      const raw = JSON.parse(text);
      const src = Array.isArray(raw) ? { questions: raw } : raw;
      set = { title: src.title || file.name.replace(/\.\w+$/, ''), questions: (src.questions || []).map(fixQ).filter(Boolean), modified: (src.modified || []).map(fixQ).filter(Boolean) };
    } else if (/\.csv$/i.test(file.name)) {
      const rows = parseCSV(text);
      const header = rows[0] && /question/i.test(rows[0][0]) ? rows.shift() : null;
      const lines = rows.map(r => r.map(c => c.trim()).join('|'));
      set = { title: file.name.replace(/\.\w+$/, ''), questions: parseLines(lines.join('\n')), modified: [] };
    } else {
      set = { title: file.name.replace(/\.\w+$/, ''), questions: parseLines(text), modified: [] };
    }
  } catch (e) { toast('That file could not be read. Check it is a Mathfall/Flurry Fight .json, a .csv or a text list.'); return; }
  if (!set.questions.length && !set.modified.length) { toast('No questions found in that file.'); return; }
  if (intoSet) { intoSet.questions.push(...set.questions); intoSet.modified.push(...set.modified); saveSet(); renderEditor(); toast(`Added ${set.questions.length + set.modified.length} questions`); return; }
  const s = { id: uid(), ...set };
  mySets.push(s); sel.setIds.push(s.id); store.set('mf_sets', mySets); saveSel();
  renderMineTab();
  toast(`Imported "${s.title}" with ${s.questions.length} questions`);
}
function fixQ(q) {
  if (!q || typeof q !== 'object') return null;
  const text = q.q || q.question; if (!text) return null;
  const out = { type: q.type === 'text' || q.type === 'typed' ? 'text' : (q.options ? 'mc' : 'text'), q: text, skill: q.skill || '' };
  if (q.hint) out.hint = q.hint; if (q.solution) out.solution = q.solution;
  if (out.type === 'mc') { out.options = q.options; out.correct = typeof q.correct === 'number' ? q.correct : Math.max(0, q.options.indexOf(q.correct)); }
  else out.answers = Array.isArray(q.answers) ? q.answers : q.answer != null ? [String(q.answer)] : [];
  return out;
}

// ------------------------------------------------------------------ utils
function uid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'set'; }
function download(name, text, type) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#editor').classList.contains('show')) closeEditor(); });

show('setup');
loadBank();
if (window.MF_Loading) MF_Loading.ready();
