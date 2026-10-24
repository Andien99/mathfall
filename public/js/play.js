// Mathfall student client.
import { h, $, $$, clear, setMath, mathHTML, toast, fmtTime } from './ui.js';
import { BattleScene } from './scene.js';
import { MapView } from './mapview.js';
import { QuestionPanel } from './question.js';
import * as SP from './sprites.js';
import { sfx, setSound, soundOn, unlockAudio } from './audio.js';
import { startTelemetry, timed } from './telemetry.js';
import { Guide } from './guide.js';

const C = window.MF_Content;
const socket = io({ transports: ['websocket', 'polling'] });
window.__mfSocket = socket;
const qs = new URLSearchParams(location.search);

let me = null;            // { playerId, token, name, code }
let state = null;         // latest team state from the server
let skew = 0;             // client clock - server clock
let pendingCls = null;
let pendingGender = 'm';
let lastPhaseKey = '';
let roomUI = {};          // per-room local UI state
let ended = null;
let lastWarnRound = -1;

// ------------------------------------------------------------------ scene
const scene = new BattleScene($('#scene'), {
  onBanner: (text, kind, rarity) => banner(text, kind, rarity),
  onAnimDone: () => { if (state && state.run) { scene.sync(state.run, { force: true }); renderHUD(); } },
  onAfter: () => renderParty(true)
});
window.__mfScene = scene;
startTelemetry(socket, scene);
scene.onLowPower = () => { console.info('Mathfall: lower detail mode for smoother play'); fit(); };
// Portrait phones and tablets: the question docks to the bottom of the screen and the battle stays visible above it.
// PORTRAIT_VIEW 'top' keeps the fighters in the upper part of the screen all the time; 'pan' leaves them where they
// are and slides the battle up while a question is open. (?pv=pan or ?pv=top overrides, for comparing.)
// Tested on a 390x844 phone and an 820x1180 iPad: the slide (pan) fits every fighter above the question on an iPad and
// keeps the battle roomy, but on a phone the question card leaves too little room, so phones use 'top'.
const PV_PARAM = new URLSearchParams(location.search).get('pv');
let PORTRAIT_VIEW = PV_PARAM || (innerWidth < 700 ? 'top' : 'pan');
const isPortrait = () => innerHeight > innerWidth * 1.15 && innerWidth < 1100;
function stageRect() {
  const W = innerWidth, H = innerHeight;
  const top = 50;
  if (document.body.classList.contains('screen-game') && isPortrait() && PORTRAIT_VIEW === 'top') {
    // fighters live between the party cards and the top of the docked question / action panel
    const p = $('#party').getBoundingClientRect();
    const y0 = W < 700 && p.height ? p.bottom + 4 : top;
    return { x: 0, y: y0, w: W, h: Math.max(150, Math.round(H * (W < 700 ? 0.42 : 0.5)) - y0) };
  }
  let right = W, bottom = H;
  const party = $('#party'), act = $('#actions');
  const wide = W >= 1100 && H > 620;
  if (document.body.classList.contains('screen-game')) {
    if (wide) { const r = act.getBoundingClientRect(); if (act.classList.contains('show') && r.width) right = Math.min(W, r.left - 6); const p = party.getBoundingClientRect(); if (p.height) bottom = p.top - 4; }
    else { const r = act.getBoundingClientRect(); const p = party.getBoundingClientRect(); const tops = [r.height ? r.top : H, p.height ? p.top : H]; bottom = Math.min(...tops) - 4; if (W < 700) bottom = H - 210; }
  }
  return { x: 0, y: top, w: Math.max(200, right), h: Math.max(160, bottom - top) };
}
let resizeT = null;
function fit() { if (!PV_PARAM) PORTRAIT_VIEW = innerWidth < 700 ? 'top' : 'pan'; document.body.classList.toggle('portrait', isPortrait()); scene.resize(innerWidth, innerHeight, stageRect()); panForQuestion(); }
// 'pan' mode: while a question is open, slide the battle up so every fighter sits above the question card
function panForQuestion() {
  const cv = $('#scene');
  let dy = 0;
  if (PORTRAIT_VIEW === 'pan' && isPortrait() && document.body.classList.contains('q-open')) {
    const card = document.querySelector('.qpanel.show .qcard'), b = scene.actorBounds && scene.actorBounds();
    if (card && b) {
      const want = card.getBoundingClientRect().top - 6;               // fighters' feet must clear the card
      const floor = W_TOP();                                            // but don't push heads under the top bar
      dy = Math.max(0, Math.min(b.bottom - want, b.top - floor));
    }
  }
  cv.style.transform = dy ? `translateY(${-Math.round(dy)}px)` : '';
}
function W_TOP() { const p = $('#party').getBoundingClientRect(); return innerWidth < 700 && p.height ? p.bottom + 2 : 52; }
new MutationObserver(() => requestAnimationFrame(panForQuestion)).observe(document.body, { attributes: true, attributeFilter: ['class'] });
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(fit, 80); });
fit();
scene.setTheme('halls');

$('#scene').addEventListener('pointerdown', e => {
  if (!state || !state.run || state.run.phase !== 'combat') return;
  const a = scene.hitTest(e.clientX, e.clientY);
  if (!a) return;
  if (a.type === 'enemy') { scene.target = a.id; sfx('click'); }
  else if (a.type === 'hero') { scene.allyTarget = scene.allyTarget === a.id || a.id === me.playerId ? null : a.id; sfx('click'); renderParty(); renderActions(); }
});

// ------------------------------------------------------------------ panels
const mapView = new MapView($('#mapLayer'), node => {
  sfx('vote');
  socket.emit('vote', { node }, r => { if (!r.ok && r.msg) toast(r.msg); });
});
const qpanel = new QuestionPanel($('#qLayer'), {
  onSubmit: (qid, value) => {
    // Hold this round's animations until the card closes, so the student sees their own hero act.
    scene.hold(1500);
    const intent = qpanel.q && qpanel.q.intent;
    socket.emit('answer', { qid, value }, timed('answer', res => {
      if (!res || !res.ok || !res.correct) scene.release();
      guide.noteAnswer(res, intent);
      qpanel.result(res);
      if (res && res.ok) renderActions();
    }));
  },
  onClosed: res => {
    scene.release();
    setTimeout(guideUpdate, 600);
    if (res && res.free) banner('Next Attack or Defend is free!', 'free');
    else if (res && res.note) banner(res.note, 'free');
  },
  onNext: () => socket.emit('nextQ', {}, res => { if (res.ok && res.q) qpanel.open(res.q, metaFor(res.q.intent)); else { if (res.msg) toast(res.msg); if (!res.ok) qpanel.close(true); } }),
  onDrop: () => socket.emit('dropQ', {}),
  onClose: () => renderActions()
});

// ------------------------------------------------------------------ join
const codeIn = $('#code'), nameIn = $('#name');
try { nameIn.value = localStorage.getItem('mf_name') || ''; pendingCls = localStorage.getItem('mf_cls'); pendingGender = localStorage.getItem('mf_gender') === 'f' ? 'f' : 'm'; } catch (e) {}
if (qs.get('code')) codeIn.value = qs.get('code').replace(/\D/g, '').slice(0, 6);
codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.replace(/\D/g, '').slice(0, 6); });
$('#joinForm').addEventListener('submit', e => {
  e.preventDefault(); unlockAudio();
  const code = codeIn.value.trim(), name = nameIn.value.trim();
  if (code.length !== 6) { $('#joinErr').textContent = 'The game code has 6 digits.'; codeIn.focus(); return; }
  if (!name) { $('#joinErr').textContent = 'Type your name.'; nameIn.focus(); return; }
  join({ code, name });
});
function join(data) {
  $('#joinErr').textContent = '';
  socket.emit('join', { ...data, cls: pendingCls, gender: pendingGender }, res => {
    if (!res || !res.ok) {
      if (window.MF_Loading) MF_Loading.hide();   // show the error rather than a loading screen
      if (data.token) { sessionStorage.removeItem('mf_session'); showScreen('join'); }
      $('#joinErr').textContent = (res && res.msg) || 'Could not join.';
      return;
    }
    me = { playerId: res.playerId, token: res.token, name: res.name, code: data.code };
    scene.myId = me.playerId;
    try { sessionStorage.setItem('mf_session', JSON.stringify(me)); localStorage.setItem('mf_name', res.name); } catch (e) {}
    if (res.state === 'lobby') showScreen('lobby');
    if (window.MF_Loading) MF_Loading.ready();   // the test game's loading screen hides once every file has arrived
  });
}
function tryResume() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('mf_session') || 'null'); } catch (e) {}
  if (saved && saved.code && saved.token && (!qs.get('test') || saved.code === qs.get('code'))) join({ code: saved.code, token: saved.token, name: saved.name });
  // the teacher's solo test game (opened from the host screen): join straight away
  else if (qs.get('test') && qs.get('code')) join({ code: qs.get('code').replace(/\D/g, '').slice(0, 6), name: 'Teacher' });
}

socket.on('connect', () => { $('#conn').classList.remove('show'); if (me) join({ code: me.code, token: me.token, name: me.name }); else tryResume(); });
socket.on('disconnect', () => { $('#conn').classList.add('show'); });
socket.on('kicked', () => { sessionStorage.removeItem('mf_session'); me = null; showScreen('join'); $('#joinErr').textContent = 'Your teacher removed you from the game.'; });
socket.on('replaced', () => { toast('You joined from another tab.'); });
socket.on('q', q => { if (!qpanel.isOpen && q && q.intent) qpanel.open(q, metaFor(q.intent)); });
socket.on('qclose', () => { if (qpanel.isOpen && qpanel.q && qpanel.q.intent && qpanel.q.intent.kind !== 'event') qpanel.close(true); });
socket.on('ended', data => { ended = data; showEnded(); });
socket.on('state', onState);

function showScreen(name) {
  document.body.className = document.body.className.replace(/screen-\w+/g, '').trim() + ' screen-' + name;
  if (name !== 'game') { mapView.hide(); clear($('#roomLayer')); }
  setTimeout(fit, 30);
}

// ------------------------------------------------------------------ state
function onState(st) {
  // the server leaves the tower map out when it hasn't changed: keep the copy we have
  if (st.run && st.run.map === undefined && state && state.run && state.run.map) st.run.map = state.run.map;
  skew = Date.now() - st.now;
  const prev = state; state = st;
  if (!prev && st.you && st.you.gender) pendingGender = st.you.gender;   // rejoin keeps the server's look
  $('#paused').classList.toggle('show', !!st.paused);
  if (st.state === 'ended') { if (!ended) showEnded(); return; }
  if (st.state === 'lobby' || !st.run) { showScreen('lobby'); renderLobby(); return; }
  if (!document.body.classList.contains('screen-game')) showScreen('game');
  if (typeof st.sound === 'boolean' && !st.sound && soundOn()) setSound(false);
  const run = st.run;
  // theme from the node we are in
  const node = run.map.nodes.find(n => n.id === run.map.pos);
  scene.setTheme(run.raidMode ? 'inferno' : (node && node.type === 'boss') ? 'lair' : node && node.row >= Math.ceil((run.rows - 1) / 2) ? 'crypt' : 'halls');
  scene.raid = run.raidMode ? st.raid : null;
  scene.mode = run.phase === 'combat' ? 'battle' : 'room';
  scene.victory = run.phase === 'room' && run.room && (run.room.type === 'victory' || run.room.type === 'complete');
  if (st.events && st.events.length) scene.play(st.events);
  // warn the party about telegraphed big attacks at the start of a round
  if (run.combat && run.combat.phase === 'player' && run.combat.round !== lastWarnRound) {
    lastWarnRound = run.combat.round;
    const w = run.combat.enemies.find(e => !e.dead && e.intent && e.intent.warn && e.intent.type === 'charge');
    if (w) setTimeout(() => banner(w.intent.warn, 'warn'), 900);
  }
  scene.sync(run, { spawnFx: true });
  scene.setRoom(run.phase === 'room' ? run.room : null);
  if (scene.target && !(run.combat && run.combat.enemies.some(e => e.id === scene.target && !e.dead))) scene.target = null;
  if (!scene.target && run.combat) { const e = run.combat.enemies.find(x => !x.dead); scene.target = e ? e.id : null; }
  const key = run.phase + ':' + (run.room ? run.room.type : '') + ':' + run.map.pos + ':' + run.asc;
  if (key !== lastPhaseKey) {
    lastPhaseKey = key; roomUI = {};
    if (run.phase === 'room' && run.room) {
      if (run.room.type === 'victory') sfx('victory');
      if (run.room.type === 'defeat') sfx('lose');
      if (run.room.type === 'complete') sfx('victory');
    }
    if (run.phase === 'map') scene.dim = 0.35; else scene.dim = 0;
    document.body.classList.toggle('phase-map', run.phase === 'map');
    setTimeout(fit, 20);
  }
  renderHUD();
  guideUpdate();
}

// Pawcal the guide cat (guide.js): one short tip at a time, never over a question.
const guide = new Guide({ C, sfx, questionOpen: () => qpanel.isOpen, touch: () => matchMedia('(pointer: coarse)').matches || !matchMedia('(hover: hover)').matches,
  actionKeys: h => actionKeys(h), actionInfo: (h, k) => actionInfo(h, k) });
function guideUpdate() {
  if (!state || !state.run || state.you.joining) return;
  requestAnimationFrame(() => guide.update({ run: state.run, hero: myHero(), you: state.you, tips: state.tips }));
}
setInterval(guideUpdate, 1000);   // tips also wait out their gap and expire without a state change
$('#helpBtn').addEventListener('click', () => { unlockAudio(); if (state && state.run && !qpanel.isOpen) guide.help({ run: state.run, hero: myHero(), you: state.you }); });

function myHero() { return state && state.run ? state.run.heroes.find(x => x.id === me.playerId) : null; }

// ------------------------------------------------------------------ lobby
function renderLobby() {
  const box = $('#heroCards');
  const you = state.you;
  const team = state.members || [];
  const taken = {};
  for (const m of team) if (m.cls && m.id !== me.playerId) (taken[m.cls] = taken[m.cls] || []).push(m.name);
  const gender = pendingGender;
  for (const b of $$('#genderPick button')) { b.classList.toggle('on', b.dataset.g === gender); b.setAttribute('aria-pressed', b.dataset.g === gender ? 'true' : 'false'); }
  const locked = !!you.locked;
  document.body.classList.toggle('hero-locked', locked);
  for (const b of $$('#genderPick button')) b.disabled = locked;
  const sig = JSON.stringify([you.cls, gender, taken, locked]);
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    clear(box);
    for (const cls of C.HERO_ORDER) {
      const H = C.HEROES[cls];
      const mine = you.cls === cls;
      const card = h('button', { class: 'hero-card' + (mine ? ' picked' : '') + (locked ? (mine ? ' locked' : ' dim') : ''), onclick: () => { if (locked) { if (!mine) toast('Tap Change hero to pick someone else.'); return; } pickHero(cls); }, 'aria-pressed': mine ? 'true' : 'false' },
        locked && mine ? h('span', { class: 'lock-stamp' }, '✓ Locked in') : null,
        h('div', { class: 'art' }, h('img', { src: SP.heroFullURL(cls + ':' + gender, 0, 'idle0', 3), alt: '', 'data-cls': cls + ':' + gender })),
        h('h3', null, H.name), h('div', { class: 'role' }, H.role + ' · ' + H.hp + ' HP'),
        h('p', { class: 'blurb' }, H.blurb),
        h('div', { class: 'sk' }, ...H.skills.flatMap(id => [h('img', { src: SP.iconURL(C.SKILLS[id].icon, 2), alt: '' }), h('div', null, h('b', null, C.SKILLS[id].name, h('span', { class: 'skcost' }, C.SKILLS[id].cost + ' energy')), C.skillDesc(id, 1))])),
        h('div', { class: 'entip' }, `Attack or Defend to charge energy (+${C.ENERGY.attack} each). Skills spend it. Find a third skill and items in chests and shops.`),
        taken[cls] ? h('span', { class: 'taken' }, taken[cls].join(', ')) : null);
      box.appendChild(card);
    }
  }
  const tb = $('#teamBox');
  clear(tb); tb.className = 'team-box panel';
  tb.append(h('h3', { style: { color: state.team.color } }, 'Team ' + state.team.name), h('div', { style: { color: 'var(--muted)', fontSize: '14px', marginBottom: '6px' } }, 'Your teacher may move you to another team.'));
  for (const m of team) tb.appendChild(h('div', { class: 'mem' }, h('img', { src: m.cls ? SP.portraitURL(m.cls + ':' + (m.gender || 'm'), 0, 'open', 2) : SP.iconURL('focus', 2), alt: '' }), h('div', null, h('div', { style: { fontWeight: 800 } }, m.name + (m.id === me.playerId ? ' (you)' : '')), h('div', { class: 'cls' }, m.cls ? C.HEROES[m.cls].name : 'Choosing…', m.locked ? h('span', { class: 'mlock' }, ' ✓ Locked in') : m.cls ? h('span', { class: 'mpick' }, ' · still deciding') : null))));
  renderLockBar(you);
}
// The bar under the hero cards: pick → lock in → wait for the teacher (and change your mind any time before Start).
function renderLockBar(you) {
  const bar = $('#lockBar'); clear(bar);
  const H = you.cls && C.HEROES[you.cls];
  bar.classList.toggle('locked', !!you.locked);
  if (!H) {
    bar.append(h('div', { class: 'lb-text' }, h('b', null, 'Step 1: '), 'tap a hero above.'),
      h('button', { class: 'btn primary big', disabled: true }, 'Lock in'));
  } else if (!you.locked) {
    bar.append(h('div', { class: 'lb-text' }, h('b', null, 'Step 2: '), `happy with the ${H.name}? Lock it in so your team knows you're ready.`),
      h('button', { class: 'btn primary big', onclick: () => lockHero(true) }, `Lock in ${H.name}`));
  } else {
    bar.append(h('div', { class: 'lb-text' },
        h('div', { class: 'lb-big' }, h('span', { class: 'lb-tick' }, '✓'), ` You're the ${H.name}!`),
        h('div', { class: 'lb-wait' }, 'Waiting for your teacher to press ', h('b', null, 'Start'), h('span', { class: 'dots' }, h('i', null, '.'), h('i', null, '.'), h('i', null, '.')))),
      h('button', { class: 'btn big', onclick: () => lockHero(false) }, 'Change hero'));
  }
}
function lockHero(on) {
  sfx(on ? 'correct' : 'click');
  socket.emit('lockHero', { locked: on }, r => { if (r && !r.ok && r.msg) toast(r.msg); });
}
// idle animation for hero cards
setInterval(() => {
  if (!document.body.classList.contains('screen-lobby')) return;
  const f = Math.floor(Date.now() / 260) % 4;
  for (const img of $$('.hero-card img[data-cls]')) img.src = SP.heroFullURL(img.dataset.cls, 0, 'idle' + f, 3);
}, 260);
function pickHero(cls) {
  sfx('click'); pendingCls = cls;
  try { localStorage.setItem('mf_cls', cls); } catch (e) {}
  socket.emit('pickHero', { cls, gender: pendingGender }, r => { if (!r.ok && r.msg) toast(r.msg); });
}
// Boy / Girl switch: changes the art on every card; if a hero is already picked, it re-sends the pick.
for (const b of $$('#genderPick button')) b.addEventListener('click', () => {
  const g = b.dataset.g; if (g === pendingGender) return;
  sfx('click'); const was = pendingGender; pendingGender = g;
  try { localStorage.setItem('mf_gender', g); } catch (e) {}
  if (state && state.you) renderLobby();
  if (state && state.you && state.you.cls) socket.emit('pickHero', { cls: state.you.cls, gender: g }, r => {
    if (r.ok) return;
    if (r.msg) toast(r.msg);
    pendingGender = was; if (state && state.you) renderLobby();
  });
});

// ------------------------------------------------------------------ HUD
// Teacher test game: a small panel of shortcuts to any room, so every part of a run can be checked solo
function renderTestTools() {
  const t = state && state.you && state.you.test;
  let box = $('#testTools');
  if (!t || !state.run) { if (box) box.remove(); return; }
  if (box) return;
  const go = (type, label) => h('button', { class: 'btn small', onclick: () => socket.emit('dev:room', { type }, r => { if (!r || !r.ok) toast('Not available right now.'); else toast(label); }) }, label);
  const panel = h('div', { class: 'tt-panel' },
    h('div', { class: 'tt-head' }, 'Test game', t.invincible ? h('span', { class: 'tt-inv' }, 'Invincible') : null),
    h('div', { class: 'tt-grid' }, go('normal1', 'Monsters'), go('normal2', 'Harder monsters'), go('elite', 'Elite'), go('boss', 'Boss'),
      go('bosshalf', 'Boss to half HP'), go('treasure', 'Treasure'), go('merchant', 'Merchant'), go('rest', 'Campfire'),
      go('event', 'Unknown event'), go('victory', 'Victory screen'), go('complete', 'Act complete'), go('energy', 'Full energy'),
      go('hurt', 'Low health'), go('raid', 'Raid boss'),
      h('button', { class: 'btn small', onclick: () => { guide.resetSeen(); toast('Pawcal will give every tip again'); } }, 'Reset tips')));
  box = h('div', { id: 'testTools' }, h('button', { class: 'tt-toggle', onclick: () => box.classList.toggle('open') }, 'TEST'), panel);
  document.body.append(box);
}
function renderHUD() {
  renderTestTools();
  if (!state || !state.run) return;
  const run = state.run;
  const node = run.map.nodes.find(n => n.id === run.map.pos);
  const nodeName = node ? (C.NODE_TYPES[node.type] || {}).name : 'Entrance';
  $('#floorInfo').innerHTML = run.raidMode ? 'Raid<span class="sub">All teams vs the Inferno Dragon</span>' : (run.floor >= run.rows ? `<span class="fl-full">Boss floor</span><span class="fl-short">Boss</span>` : `<span class="fl-full">Floor ${Math.max(1, run.floor)} of ${run.rows - 1}</span><span class="fl-short">F${Math.max(1, run.floor)}/${run.rows - 1}</span>`) + `<span class="sub">Act ${(run.asc || 0) + 1} · ${nodeName}</span>`;
  $('#teamChip').innerHTML = `<span class="chip" style="border-color:${state.team.color};color:${state.team.color}">${state.team.name}</span>`;
  const mh = myHero();
  $('#goldChip').textContent = mh ? mh.gold : 0;
  $('#soundBtn').textContent = soundOn() ? '🔊' : '🔇';
  $('#joining').classList.toggle('show', !!state.you.joining);
  if (state.you.joining) $('#joining').innerHTML = '<div class="panel" style="padding:16px 22px"><h3 style="margin:0;font-family:var(--display)">You join your team at the next room</h3><p style="margin:6px 0 0;color:var(--muted)">Watch the fight and get ready.</p></div>';
  renderParty();
  renderActions();
  renderMap();
  renderRoom();
  renderQTE();
  renderRaidBar();
}
$('#soundBtn').addEventListener('click', () => { setSound(!soundOn()); unlockAudio(); $('#soundBtn').textContent = soundOn() ? '🔊' : '🔇'; });

function renderParty(fromScene) {
  if (!state || !state.run) return;
  const box = $('#party');
  const run = state.run;
  clear(box);
  for (const hdat of run.heroes) {
    const a = scene.actors.get(hdat.id);
    const hp = a && a.hp != null ? a.hp : hdat.hp, maxHp = hdat.maxHp, block = a && a.block != null ? a.block : hdat.block, st = (a && a.st) || hdat.st || {};
    const downed = a && a.downed != null ? a.downed : hdat.downed;
    const pct = Math.max(0, Math.min(100, 100 * hp / maxHp));
    let stLabel = null;
    if (!hdat.connected) stLabel = h('span', { class: 'state' }, 'Offline');
    else if (downed) stLabel = h('span', { class: 'state ko' }, 'Knocked out');
    else if (run.phase === 'combat') {
      if (hdat.acted) stLabel = h('span', { class: 'state ok' }, 'Done ✓');
      else if (hdat.ready) stLabel = h('span', { class: 'state ok' }, 'Ready');
      else if (hdat.busy) stLabel = h('span', { class: 'state busy' }, 'Answering…');
      else stLabel = h('span', { class: 'state' }, 'Choosing');
    }
    const card = h('div', { class: ['pc', hdat.id === me.playerId ? 'me' : '', scene.allyTarget === hdat.id ? 'ally' : '', downed ? 'down' : '', hdat.connected ? '' : 'off'].join(' '), title: hdat.id === me.playerId ? 'You' : 'Tap to target ' + hdat.name,
      onclick: () => { if (run.phase !== 'combat' || hdat.id === me.playerId) { scene.allyTarget = null; } else scene.allyTarget = scene.allyTarget === hdat.id ? null : hdat.id; renderParty(); renderActions(); } },
      h('img', { class: 'pt', src: SP.portraitURL(hdat.skin || hdat.cls, hdat.variant, downed ? 'closed' : pct < 30 ? 'hurt' : 'open', 2), alt: '' }),
      h('div', { class: 'nm' }, hdat.name, h('small', null, C.HEROES[hdat.cls].name)),
      h('div', { class: 'hpbar' }, h('i', { class: pct < 30 ? 'lo' : '', style: { width: pct + '%' } })),
      h('div', { class: 'hpline' }, h('span', null, `${hp}/${maxHp}`), block ? h('span', { class: 'blk' }, `🛡 ${block}`) : h('span')),
      h('div', { class: 'stt' }, ...Object.entries(st).map(([k, v]) => h('span', { style: { '--c': (C.STATUS_INFO[k] || {}).color || '#fff' }, title: (C.STATUS_INFO[k] || {}).desc }, (C.STATUS_INFO[k] || { name: k }).name + (v.v ? ' ' + v.v : v.t > 1 && v.t < 50 ? ' ' + v.t : '')))),
      run.phase === 'combat' ? h('div', { class: 'enline', title: 'Energy' }, h('i', { style: { width: (100 * (hdat.energy || 0) / C.ENERGY.max) + '%' } })) : null,
      hdat.focus ? h('div', { class: 'focus' }, '✦'.repeat(hdat.focus) + '✧'.repeat(3 - hdat.focus)) : null,
      stLabel);
    box.appendChild(card);
  }
}

// Attack, Defend, then one button per skill (heroes carry up to three).
const actionKeys = hero => ['attack', 'defend', ...hero.skills.map((_, i) => 'skill' + i)];
function actionInfo(hero, action) {
  const H = C.HEROES[hero.cls];
  if (action === 'attack') return { name: H.attack.name, desc: H.attack.desc.replace(/\d+ damage/, d => C.hasItem(hero, 'whetstone') ? (parseInt(d, 10) + 2) + ' damage' : d), icon: 'attack', color: '#ffb08a', cls: 'attack', gain: C.ENERGY.attack };
  if (action === 'defend') return { name: H.defend.name, desc: H.defend.desc.replace(/ Tap an ally.*$/, ''), icon: 'defend', color: '#a8d0ff', cls: 'defend', gain: C.ENERGY.defend };
  const sk = hero.skills[+action.slice(5)];
  const def = C.SKILLS[sk.id];
  return { name: C.skillName(sk.id, sk.lvl), desc: C.skillDesc(sk.id, sk.lvl), icon: def.icon, color: def.color, cls: 'rarity-' + def.rarity + ' sk' + action.slice(5), cost: C.skillCost(sk.id, hero), target: def.target, rarity: def.rarity };
}
function metaFor(intent) {
  const hero = myHero();
  if (!intent) return {};
  if (intent.kind === 'focus') return { title: 'Focus', subtitle: `Each correct answer powers your next attack or skill by ${focusPct()}%.`, icon: SP.iconURL('focus', 3), color: '#b8c8ff', go: 'Focus', yes: 'Focused!' };
  if (intent.kind === 'rise') return { title: 'Get back up', subtitle: 'Answer correctly to return with 30% health.', icon: SP.iconURL('rise', 3), color: '#ffe2a0', go: 'Rise', yes: 'Back up!', noSwitch: true };
  if (intent.kind === 'event') { const ev = C.EVENTS[intent.event] || {}; const opt = (ev.options || []).find(o => o.id === intent.opt) || {}; return { title: opt.label || 'Answer', subtitle: ev.title || '', icon: SP.iconURL('blessing', 3), color: '#ffe9a0', go: 'Answer', yes: 'Correct!', noSwitch: true, retry: 'Close' }; }
  if (!hero) return {};
  const info = actionInfo(hero, intent.action);
  const target = targetName(intent);
  return { title: info.name, subtitle: (intent.action === 'attack' || intent.action.startsWith('skill') ? 'Answer correctly to ' + (intent.action === 'attack' ? 'strike' : 'cast') : 'Answer correctly to brace') + (target ? ' · ' + target : ''), icon: SP.iconURL(info.icon, 3), color: info.color, go: intent.action === 'attack' ? 'Strike' : intent.action === 'defend' ? 'Brace' : 'Cast' };
}
function targetName(intent) {
  const run = state.run;
  if (!intent.target) return '';
  const e = run.combat && run.combat.enemies.find(x => x.id === intent.target);
  if (e) return 'target: ' + e.name;
  const a = run.heroes.find(x => x.id === intent.target);
  if (a && a.id !== me.playerId) return 'for ' + a.name;
  return '';
}

function renderActions() {
  const box = $('#actions');
  const run = state && state.run;
  const hero = myHero();
  const show = run && run.phase === 'combat' && hero && run.combat && !state.you.joining;
  const wasShown = box.classList.contains('show');
  box.classList.toggle('show', !!show);
  if (wasShown !== !!show) setTimeout(fit, 10);
  if (!show) return;
  clear(box);
  const c = run.combat;
  const phase = c.phase;
  const enemyTurn = phase === 'enemy';
  const over = phase === 'won' || phase === 'lost';
  const head = h('div', { class: 'am-head' }, h('img', { src: SP.portraitURL(hero.skin || hero.cls, hero.variant, 'determined', 2), alt: '' }), h('div', null, h('div', null, hero.name), h('div', { class: 'hint' },
    over ? 'Battle over' : hero.downed ? 'You are knocked out' : hero.acted ? 'Done for this round' : hero.ready ? 'Your action fires next round' : enemyTurn ? 'Enemies are acting. Plan your next move.' : 'Choose an action')));
  head.appendChild(energyMeter(hero.energy || 0));
  if ((hero.items || []).length) head.appendChild(itemStrip(hero.items));
  const list = h('div', { class: 'am-list' });
  if (hero.downed) {
    list.appendChild(h('button', { class: 'act rise', disabled: over, onclick: () => act('rise') }, h('img', { src: SP.iconURL('rise', 2), alt: '' }), h('div', null, h('div', { class: 'an' }, 'Get back up'), h('div', { class: 'ad' }, 'Answer a question to return with 30% health.')), h('span', { class: 'ak' }, '1')));
  } else if (hero.acted || hero.ready) {
    list.appendChild(h('div', { class: 'am-done' }, hero.ready ? 'Ready! Your action fires at the start of next round.' : 'Done. Waiting for your team.'));
    if (hero.focus < 3 && !over) list.appendChild(h('button', { class: 'act focus', onclick: () => act('focus') }, h('img', { src: SP.iconURL('focus', 2), alt: '' }), h('div', null, h('div', { class: 'an' }, `Focus ${'✦'.repeat(hero.focus)}${'✧'.repeat(3 - hero.focus)}`), h('div', { class: 'ad' }, `Bonus question: +${focusPct()}% power on your next attack or skill.`)), h('span', { class: 'ak' }, 'F')));
    else if (hero.focus >= 3) list.appendChild(h('div', { class: 'am-tip' }, 'Focus is full ✦✦✦. Use it next round.'));
  } else {
    actionKeys(hero).forEach((k, i) => {
      const info = actionInfo(hero, k);
      const short = info.cost ? Math.max(0, info.cost - (hero.energy || 0)) : 0;
      const free = (hero.free && (k === 'attack' || k === 'defend')) || (k.startsWith('skill') && info.cost === 0);
      const allyNote = (k === 'defend' || info.target === 'ally') && scene.allyTarget ? ' → ' + (run.heroes.find(x => x.id === scene.allyTarget) || {}).name : '';
      const ready = info.cost > 0 && !short && !free && !over;
      list.appendChild(h('button', { class: 'act ' + info.cls + (short ? ' low' : '') + (free ? ' freeact' : '') + (ready ? ' ready' : ''), disabled: over || short > 0, onclick: () => act(k), title: info.desc },
        h('img', { src: SP.iconURL(info.icon, 2), alt: '' }),
        h('div', null, h('div', { class: 'an' }, info.name + allyNote), h('div', { class: 'ad' }, info.desc)),
        free ? h('span', { class: 'freetag', title: k.startsWith('skill') ? 'Mana Surge: no energy needed' : 'No question needed' }, h('b', null, 'FREE'), h('small', null, k.startsWith('skill') ? 'no energy' : 'no question'))
          : info.cost ? h('span', { class: 'cost' + (short ? ' short' : ''), title: short ? `Need ${short} more energy` : `Costs ${info.cost} energy` }, h('b', null, info.cost), h('small', null, 'energy'))
          : h('span', { class: 'gain', title: `Charges ${info.gain} energy` }, h('b', null, '+' + info.gain), h('small', null, 'energy'))));
    });
    if (hero.skills.length < C.MAX_SKILLS) list.appendChild(h('div', { class: 'act empty', title: 'Find more skills in chests and shops' }, h('span', { class: 'slot' }, '+'), h('div', null, h('div', { class: 'an' }, 'Empty skill slot'), h('div', { class: 'ad' }, 'Find a third skill in a chest or shop.'))));
    if (hero.free) list.appendChild(h('div', { class: 'am-tip free' }, 'You answered correctly: your next Attack or Defend is free. After that, answer again.'));
    if (hero.focus) list.appendChild(h('div', { class: 'am-tip' }, `Focus ${'✦'.repeat(hero.focus)}: your next attack or skill is ${focusPct() * hero.focus}% stronger.`));
    else list.appendChild(h('div', { class: 'am-tip' }, 'Tap an enemy to target it. Tap a teammate to guard or heal them.'));
  }
  box.append(head, list);
}

const focusPct = () => Math.round(100 * C.focusStep(myHero()));
// the hero's items as small icons; tap one to read what it does
function itemStrip(items) {
  return h('div', { class: 'am-items' }, ...items.map(id => { const it = C.ITEMS[id]; return h('button', { class: 'itm', style: { '--rc': C.RARITY[it.rarity].color }, title: `${it.name}: ${it.desc}`, onclick: () => toast(`${it.name}: ${it.desc}`) }, h('img', { src: SP.iconURL(it.icon, 2), alt: it.name })); }));
}
function energyMeter(n) {
  const max = C.ENERGY.max;
  return h('div', { class: 'energy', title: `Energy ${n}/${max}. Attack and Defend charge it; skills spend it.` },
    h('span', { class: 'en-label' }, 'Energy'),
    h('div', { class: 'en-cells' }, ...Array.from({ length: max }, (_, i) => h('i', { class: i < n ? 'on' : '' }))),
    h('b', null, `${n}/${max}`));
}

function act(action) {
  if (qpanel.isOpen) return;
  const hero = myHero(); if (!hero) return;
  unlockAudio(); sfx('click');
  guide.noteAction(action, hero);
  let target = scene.target;
  if (action === 'defend') target = scene.allyTarget || null;
  if (action.startsWith('skill')) { const info = actionInfo(hero, action); if (info.target === 'ally') target = scene.allyTarget || null; else if (info.target === 'self' || info.target === 'party') target = null; }
  socket.emit('act', { action, target }, timed('act', res => {
    if (!res || !res.ok) { if (res && res.msg) toast(res.msg); return; }
    if (res.free) { sfx('correct'); banner(res.queued ? 'Free action ready for next round!' : 'Free action!', 'free'); renderActions(); return; }
    qpanel.open(res.q, metaFor(res.q.intent));
  }));
}
document.addEventListener('keydown', e => {
  if (qpanel.isOpen || !state || !state.run || state.run.phase !== 'combat') return;
  if (e.target && e.target.tagName === 'INPUT') return;
  const hero = myHero(); if (!hero) return;
  if (hero.downed && e.key === '1') act('rise');
  else if (!hero.acted && !hero.ready && '12345'.includes(e.key) && e.key.length === 1 && actionKeys(hero)[+e.key - 1]) act(actionKeys(hero)[+e.key - 1]);
  else if ((hero.acted || hero.ready) && (e.key === 'f' || e.key === 'F')) act('focus');
});

// round timer
function tickTimers() {
  requestAnimationFrame(tickTimers);
  mapView.tick();
  const qf = document.getElementById('qteFill');
  if (qf && state && state.you && state.you.qte) { const left = state.you.qte.endsAt - (Date.now() - skew); qf.style.transform = `scaleX(${Math.max(0, Math.min(1, left / 10700))})`; }
  if (raidEl && raidEl.classList.contains('show') && state && state.raid) { const t = raidEl.querySelector('.rtime'); if (t) t.textContent = fmtTime(state.raid.endsAt - (Date.now() - skew)); }
  const run = state && state.run;
  const box = $('#roundBox');
  if (!run || run.phase !== 'combat' || !run.combat) { box.classList.remove('show'); $('#waitingFor').textContent = ''; return; }
  box.classList.add('show');
  const c = run.combat;
  $('#roundLabel').textContent = c.phase === 'enemy' ? 'Enemy turn' : c.phase === 'qte' ? 'Quick time!' : 'Round ' + c.round;
  const fill = $('#timerFill');
  if (c.phase === 'player' && c.roundEndsAt) {
    const left = c.roundEndsAt - (Date.now() - skew);
    const frac = Math.max(0, Math.min(1, left / (state.timer * 1000)));
    fill.style.transform = `scaleX(${frac})`; fill.classList.toggle('low', left < 10000);
    $('#timerText').textContent = fmtTime(left);
  } else { fill.style.transform = 'scaleX(1)'; fill.classList.remove('low'); $('#timerText').textContent = c.phase === 'player' ? '' : ''; }
  if (c.phase === 'player') {
    const waiting = run.heroes.filter(x => x.connected && !x.acted && !x.ready).map(x => x.id === me.playerId ? 'you' : x.name);
    $('#waitingFor').textContent = waiting.length ? 'Waiting for ' + listJoin(waiting) : '';
  } else $('#waitingFor').textContent = '';
}
requestAnimationFrame(tickTimers);
function listJoin(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

let bannerT = null;
function banner(text, kind, rarity) {
  if (kind === 'skill') {
    const sb = $('#skillBanner'); clear(sb);
    sb.appendChild(h('span', { class: 's', style: { '--c': rarity ? C.RARITY[rarity].color : '#fff' } }, text));
    return;
  }
  const b = $('#banner'); clear(b);
  b.appendChild(h('span', { class: 'b ' + (kind || '') }, text));
  if (kind === 'battle') sfx('banner');
}

// ------------------------------------------------------------------ map
let mapWaitSince = 0;
function renderMap() {
  const run = state.run;
  if (run.phase === 'map' && !state.you.joining && scene.busyCount > 0 && !mapView.el.classList.contains('show')) {
    if (!mapWaitSince) mapWaitSince = Date.now();
    if (Date.now() - mapWaitSince < 3500) { setTimeout(renderMap, 250); return; }
  }
  mapWaitSince = 0;
  if (run.phase === 'map' && !state.you.joining) mapView.render(state, me.playerId);
  else mapView.hide();
}

// ------------------------------------------------------------------ rooms
function readyLine(room) {
  const run = state.run;
  const n = run.heroes.filter(x => x.connected).length;
  const r = run.heroes.filter(x => room.ready[x.id]).length;
  const names = run.heroes.filter(x => x.connected && !room.ready[x.id]).map(x => x.id === me.playerId ? 'you' : x.name);
  return h('div', { class: 'readyline' }, h('b', null, `${r}/${n} ready`), names.length ? ' · waiting for ' + listJoin(names) : '');
}
// Loot cards. Two things are shown on every card, kept visually apart so students can't mix them up:
//  - WHAT it is (the ribbon, the card's colour and the icon's frame): a SKILL is an action you choose in battle
//    (blue, square rune tile, an energy cost, takes one of your 3 slots); an ITEM is a passive bonus that works by
//    itself (green-brown, round relic frame, no cost, no limit).
//  - HOW RARE it is (the border and the small gem label): grey common, purple rare, orange legendary.
function skillCard(id, lvl, extra) {
  const def = C.SKILLS[id]; const rc = C.RARITY[def.rarity].color;
  const hero = myHero() || {};
  const cost = C.skillCost(id, { items: hero.items });
  const used = (hero.skills || []).length;
  const pips = h('span', { class: 'slots', title: `You have ${used} of ${C.MAX_SKILLS} skill slots filled` }, ...Array.from({ length: C.MAX_SKILLS }, (_, i) => h('i', { class: i < used ? 'on' : '' })));
  return h('div', { class: 'skcard skill rar-' + def.rarity + (extra && extra.isNew ? ' new' : '') + (extra && extra.small ? ' small' : ''), style: { '--rc': rc } },
    h('div', { class: 'kind' }, h('span', { class: 'kind-tag' }, 'Skill'), h('span', { class: 'kind-sub' }, 'You use it in battle')),
    h('div', { class: 'ic' }, h('img', { src: SP.iconURL(def.icon, 3), alt: '' }), h('span', { class: 'ecost', title: `Costs ${cost} energy each time you use it` }, h('b', null, cost), h('small', null, 'energy'))),
    h('div', { class: 'rar' }, C.RARITY[def.rarity].name + ' · ' + C.HEROES[def.cls].name + (extra && extra.label ? ' · ' + extra.label : '')),
    h('h4', null, C.skillName(id, lvl)),
    h('p', null, C.skillDesc(id, lvl)),
    h('div', { class: 'cd' }, 'Takes a skill slot ', pips),
    extra && extra.button ? extra.button : null);
}
function itemCard(id, extra) {
  const it = C.ITEMS[id]; const rc = C.RARITY[it.rarity].color;
  return h('div', { class: 'skcard item rar-' + it.rarity + (extra && extra.isNew ? ' new' : '') + (extra && extra.small ? ' small' : ''), style: { '--rc': rc } },
    h('div', { class: 'kind' }, h('span', { class: 'kind-tag' }, 'Item'), h('span', { class: 'kind-sub' }, 'Always on by itself')),
    h('div', { class: 'ic' }, h('img', { src: SP.iconURL(it.icon, 3), alt: '' })),
    h('div', { class: 'rar' }, C.RARITY[it.rarity].name + ' · any hero' + (extra && extra.label ? ' · ' + extra.label : '')),
    h('h4', null, it.name),
    h('p', null, it.desc),
    h('div', { class: 'cd' }, 'No energy, no slot, no limit'),
    extra && extra.button ? extra.button : null);
}
// Chest gold is not a choice: it is always yours. It still sits on its own card (gold's own yellow, border = the
// chest's rarity) so students tap it and see it arrive; uncollected gold is paid when the room closes anyway.
function goldCard(ch) {
  const rc = C.RARITY[ch.rarity].color;
  const got = ch.goldPaid;
  const collect = () => {
    if (got) return;
    roomOp('collect', {}, r => { if (r && r.ok) { sfx('coin'); coinBurst(card); } });
  };
  const card = h('button', { class: 'skcard gold rar-' + ch.rarity + (got ? ' got' : ' tap') + (!roomUI.goldDealt ? ' new' : ''), style: { '--rc': rc }, onclick: collect, disabled: got, 'aria-label': got ? `${ch.gold} gold collected` : `Collect ${ch.gold} gold` },
    h('div', { class: 'kind' }, h('span', { class: 'kind-tag' }, 'Gold'), h('span', { class: 'kind-sub' }, 'Always yours')),
    h('div', { class: 'ic' }, h('img', { src: SP.iconURL('gold', 3), alt: '' })),
    h('div', { class: 'rar' }, C.RARITY[ch.rarity].name + ' chest'),
    h('h4', null, `${ch.gold} gold`),
    h('p', null, got ? 'Added to your pouch. Spend it at the merchant.' : 'Free with the chest: you don\'t give anything up for it.'),
    h('div', { class: 'cd' }, `You have ${(myHero() || {}).gold || 0}`),
    h('div', { class: 'btn gbtn' }, got ? '✓ Collected' : `Collect ${ch.gold} gold`));
  roomUI.goldDealt = true;
  return card;
}
// a few coins fly from the gold card to the gold counter in the top bar
function coinBurst(from) {
  const a = from.getBoundingClientRect(); const chip = $('#goldChip'); const b = chip ? chip.getBoundingClientRect() : { left: innerWidth - 80, top: 10, width: 40, height: 20 };
  for (let i = 0; i < 7; i++) {
    const c = h('img', { class: 'flycoin', src: SP.iconURL('gold', 2), alt: '' });
    const x0 = a.left + a.width / 2 + (Math.random() - 0.5) * 60, y0 = a.top + a.height * 0.35 + (Math.random() - 0.5) * 30;
    c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
    document.body.append(c);
    const dx = b.left + b.width / 2 - x0, dy = b.top + b.height / 2 - y0;
    c.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 60}px) scale(1.2)`, opacity: 1, offset: 0.4 }, { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.2 }],
      { duration: 650 + i * 70, easing: 'cubic-bezier(.4,0,.6,1)', delay: i * 40 }).onfinish = () => c.remove();
  }
  if (chip) setTimeout(() => { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }, 700);
}
// The "OR" between chest choices: you keep only one card.
const orSep = () => h('div', { class: 'or', 'aria-hidden': 'true' }, h('span', null, 'OR'));
// "Your skills" and "Your items" under the loot, so students can see what they already carry
function loadout(hero) {
  const items = hero.items || [];
  return h('div', { class: 'loadout' },
    h('div', { class: 'lo-row lo-skill' }, h('b', null, `Your skills ${hero.skills.length}/${C.MAX_SKILLS}`, h('small', null, 'used in battle')), ...hero.skills.map(s => { const d = C.SKILLS[s.id]; return h('span', { class: 'chipx', style: { '--rc': C.RARITY[d.rarity].color }, title: C.skillDesc(s.id, s.lvl) }, h('img', { src: SP.iconURL(d.icon, 1), alt: '' }), C.skillName(s.id, s.lvl)); })),
    h('div', { class: 'lo-row lo-item' }, h('b', null, 'Your items', h('small', null, 'always on')), ...(items.length ? items.map(id => { const it = C.ITEMS[id]; return h('span', { class: 'chipx', style: { '--rc': C.RARITY[it.rarity].color }, title: it.desc }, h('img', { src: SP.iconURL(it.icon, 1), alt: '' }), it.name); }) : [h('i', { class: 'none' }, 'none yet')])));
}
// A new skill when all three slots are full: pick the one it replaces.
function replaceRow(newId, lvl, label, onPick, onBack) {
  return [h('p', { class: 'lead' }, `Your ${C.MAX_SKILLS} skill slots are full. Which skill should ${C.SKILLS[newId].name} replace?`),
    h('div', { class: 'row' }, skillCard(newId, lvl, { isNew: true, label, small: true }), h('div', { class: 'vs' }, '→'),
      ...myHero().skills.map((s, i) => skillCard(s.id, s.lvl, { small: true, label: `Slot ${i + 1}`, button: h('button', { class: 'btn replace', onclick: () => { sfx('click'); onPick(i); } }, 'Replace') }))),
    h('div', { class: 'center' }, h('button', { class: 'linkbtn', onclick: onBack }, 'Back'))];
}
function roomOp(op, data, cb) { socket.emit('room', { op, ...(data || {}) }, r => { if (!r.ok && r.msg) toast(r.msg); cb && cb(r); }); }

let roomWaitSince = 0;
function renderRoom() {
  const layer = $('#roomLayer');
  const run = state.run;
  if (run.phase !== 'room' || !run.room || state.you.joining) { clear(layer); roomWaitSince = 0; return; }
  // let the last blows of a fight finish before covering the scene
  if (scene.busyCount > 0 && !layer.firstChild) {
    if (!roomWaitSince) roomWaitSince = Date.now();
    if (Date.now() - roomWaitSince < 3500) { setTimeout(renderRoom, 250); return; }
  }
  const room = run.room; const hero = myHero(); const you = state.you;
  clear(layer);
  const panel = h('div', { class: 'room panel' + (['victory', 'defeat', 'complete', 'raidEnd'].includes(room.type) ? ' low' : '') });
  const ready = room.ready && room.ready[me.playerId];
  if (room.type === 'victory' || room.type === 'complete') { resultScreen(layer, room, hero); return; }
  if (room.type === 'defeat') {
    panel.append(h('p', { class: 'result-big lose' }, 'Your party has fallen'), h('p', { class: 'lead' }, `You reached floor ${room.floor}. Every run teaches you something. Try again with a new map.`),
      h('div', { class: 'center' }, h('button', { class: 'btn primary', disabled: ready, onclick: () => roomOp('ready') }, ready ? 'Waiting for team…' : 'Try again')), readyLine(room));
  } else if (room.type === 'raidEnd') {
    const raid = state.raid || {};
    panel.append(h('p', { class: 'result-big' + (room.won ? '' : ' lose') }, room.won ? 'The Inferno Dragon is defeated!' : 'The Inferno Dragon survives…'),
      h('p', { class: 'lead' }, room.won ? 'Every team climbed, fought and won together.' : 'So close. Every hit counted.'),
      raidBoard(raid));
  } else if (room.type === 'treasure') {
    const ch = you.chest;
    const rc = ch ? C.RARITY[ch.rarity].color : '#fff';
    panel.append(h('h2', null, room.event === 'cache' ? 'An abandoned cache' : room.kind === 'boss' ? 'The boss\'s hoard' : room.kind === 'elite' ? 'Elite treasure' : 'Treasure'));
    if (!ch) panel.append(h('p', { class: 'lead' }, 'No chest for you this time.'));
    else if (!ch.opened) {
      panel.append(h('p', { class: 'lead' }, `A ${C.RARITY[ch.rarity].name.toLowerCase()} chest. Open it to see what's inside.`));
      const img = h('img', { class: 'chest-big shake', style: { '--rc': rc }, src: chestURL(ch.rarity, false), alt: 'Treasure chest', onclick: openIt });
      panel.append(img, h('div', { class: 'center' }, h('button', { class: 'btn primary', onclick: openIt }, 'Open the chest')));
      function openIt() { sfx('open'); roomOp('open', {}, r => { if (r.ok) { sfx('twinkle'); setTimeout(() => sfx('coin'), 350); } }); }
    } else if (!ch.decided) {
      const take = (pick, slot) => roomOp('take', { pick, slot }, r => { if (r.ok) { sfx(pick === 'keep' ? 'click' : 'open'); roomUI.chestSkill = false; if (pick === 'skill' && ch.skill) guide.noteLearned(C.skillName(ch.skill.id, ch.skill.lvl)); } });
      if (roomUI.chestSkill && ch.skill) panel.append(...replaceRow(ch.skill.id, ch.skill.lvl, 'New', i => take('skill', i), () => { roomUI.chestSkill = false; renderRoom(); }));
      else {
        panel.append(h('p', { class: 'lead' }, h('b', { class: 'mk-gold' }, 'Collect your gold'), ', then ', h('b', { class: 'mk-one' }, 'choose one: '), h('b', { class: 'mk-skill' }, 'a skill'), ' (a new move for battle) ', h('b', { class: 'mk-or' }, 'or'), ' ', h('b', { class: 'mk-item' }, 'an item'), ' (a bonus that is always on).'));
        const row = h('div', { class: 'row choose' });
        const fresh = !roomUI.dealt; roomUI.dealt = true;   // the cards fly in once, not on every update
        if (ch.skill) row.append(skillCard(ch.skill.id, ch.skill.lvl, { isNew: fresh, small: true, button: h('button', { class: 'btn primary', onclick: () => { sfx('click'); if (hero.skills.length < C.MAX_SKILLS) take('skill'); else { roomUI.chestSkill = true; renderRoom(); } } }, 'Take skill') }));
        if (ch.item) { if (row.firstChild) row.append(orSep()); row.append(itemCard(ch.item, { isNew: fresh, small: true, button: h('button', { class: 'btn primary', onclick: () => { sfx('click'); take('item'); } }, 'Take item') })); }
        const choose = h('div', { class: 'grp grp-choose' }, h('div', { class: 'grp-h' }, 'Choose one'), row,
          h('div', { class: 'center keep' }, h('button', { class: 'linkbtn', onclick: () => { sfx('click'); take('keep'); } }, 'No thanks, keep what I have')));
        panel.append(h('div', { class: 'loot' }, h('div', { class: 'grp grp-gold' }, h('div', { class: 'grp-h' }, 'Yours to keep'), goldCard(ch)), h('div', { class: 'loot-split', 'aria-hidden': 'true' }), choose));
      }
      panel.append(loadout(hero));
    } else {
      const c = ch.choice || {};
      if (!ch.goldPaid) panel.append(h('p', { class: 'lead' }, h('b', { class: 'mk-gold' }, "Don't forget your gold!")), h('div', { class: 'loot solo' }, goldCard(ch)));
      panel.append(h('p', { class: 'lead' }, (c.skill ? `You learned ${C.SKILLS[c.skill].name}${c.replaced ? ` (instead of ${C.SKILLS[c.replaced].name})` : ''}.` : c.item ? `You found ${C.ITEMS[c.item].name}.` : c.kept ? 'You kept your skills and items as they are.' : 'Nothing else in this chest.') + (ch.goldPaid ? ' Waiting for your team.' : '')));
      panel.append(loadout(hero));
    }
    const feed = h('div', { class: 'feed' });
    for (const [pid, c2] of Object.entries(room.chests || {})) {
      const who = state.run.heroes.find(x => x.id === pid); const c = c2.choice; if (!who || pid === me.playerId || !c) continue;
      feed.appendChild(h('div', null, c.skill ? `${who.name} learned ${C.SKILLS[c.skill].name}` : c.item ? `${who.name} found ${C.ITEMS[c.item].name}` : `${who.name} kept their loadout`));
    }
    panel.append(feed, readyLine(room));
  } else if (room.type === 'rest') {
    layer.appendChild(campfireRoom(room, hero));
    return;
  } else if (room.type === 'merchant') {
    const stock = you.stock;
    panel.append(h('h2', null, "Pip's Wandering Wares"), h('p', { class: 'lead' }, `"Shiny skills and trinkets, fair prices!" You have ${hero.gold} gold.`));
    if (stock) {
      const buy = (kind, i, slot) => roomOp('buy', { kind, i, slot }, r => { if (r.ok) { sfx('coin'); roomUI.buy = null; if (kind === 'skill' && stock.skills[i]) guide.noteLearned(C.skillName(stock.skills[i].id, stock.skills[i].lvl)); } });
      const priceBtn = (it, onclick) => h('button', { class: 'btn' + (hero.gold >= it.price && !it.sold ? ' primary' : ''), disabled: it.sold || hero.gold < it.price, onclick }, it.sold ? 'Sold' : hero.gold < it.price ? `${it.price} gold (not enough)` : `Buy for ${it.price}`);
      if (roomUI.buy != null && stock.skills[roomUI.buy] && !stock.skills[roomUI.buy].sold) {
        const it = stock.skills[roomUI.buy];
        panel.append(...replaceRow(it.id, it.lvl, `${it.price} gold`, i => buy('skill', roomUI.buy, i), () => { roomUI.buy = null; renderRoom(); }));
      } else {
        panel.append(h('div', { class: 'row shop' },
          ...stock.skills.map((it, i) => skillCard(it.id, it.lvl, { small: true, label: it.sold ? 'Sold' : '', button: priceBtn(it, () => { if (hero.skills.length < C.MAX_SKILLS) buy('skill', i); else { roomUI.buy = i; renderRoom(); } }) })),
          ...stock.items.map((it, i) => itemCard(it.id, { small: true, label: it.sold ? 'Sold' : '', button: priceBtn(it, () => buy('item', i)) }))));
        panel.append(loadout(hero));
        panel.append(h('div', { class: 'center' }, h('button', { class: 'btn', disabled: stock.mend.sold || hero.gold < stock.mend.price || hero.hp >= hero.maxHp, onclick: () => roomOp('mend', {}, r => r.ok && sfx('heal')) }, stock.mend.sold ? 'Mended' : `Mend 40% health (${stock.mend.price} gold)`), ' ',
          h('button', { class: 'btn primary', disabled: ready, onclick: () => roomOp('ready') }, ready ? 'Waiting for team…' : 'Leave the shop')));
      }
    }
    panel.append(readyLine(room));
  } else if (room.type === 'event') {
    layer.appendChild(eventRoom(room, hero));
    return;
  }
  layer.appendChild(panel);
}

// ------------------------------------------------------------------ text markup for events
function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function markup(t) {
  return esc(t).replace(/\[(red|gold|green|blue|purple)\](.*?)\[\/\]/g, '<span class="mk-$1">$2</span>').replace(/\n/g, '<br>');
}

// ------------------------------------------------------------------ stat upgrades after a fight
// Battle result (after a win and after a boss): rewards on the left, the heroes' victory poses on the right of the
// battle scene. On phones and portrait screens the heroes celebrate first and the rewards pop up after.
function resultScreen(layer, room, hero) {
  const mobile = innerWidth < 700 || isPortrait();
  const first = !roomUI.resultAt; if (first) roomUI.resultAt = Date.now();
  const since = Date.now() - roomUI.resultAt;
  const boss = room.type === 'complete';
  const row = (label, value, icon, i) => h('div', { class: 'rs-row', style: { '--i': i } }, h('span', { class: 'rs-l' }, label),
    h('span', { class: 'rs-v' }, value, icon || null));
  const coin = h('img', { src: SP.iconURL('gold', 2), alt: '' }), heart = h('img', { src: SP.iconURL('heart', 2), alt: '' });
  const chest = room.elite || boss ? h('img', { class: 'rs-chest', src: SP.chestFrame(boss ? 'legendary' : 'rare', false).toDataURL(), alt: '' }) : null;
  const goldV = h('b', { class: 'rs-num' }, first || since < 1500 ? '0' : String(room.gold));
  const box = h('div', { class: 'result-screen' + (mobile ? ' mobile' : '') + (since > 1200 ? ' shown' : '') },
    h('div', { class: 'rs-title' }, h('i', { class: 'rs-star' }, '✦'), h('h2', null, boss ? 'Act Complete' : 'Battle Result')),
    boss ? h('p', { class: 'rs-sub' }, `${room.boss || 'The boss'} falls! Next: Act ${room.asc + 2}${room.nextAct ? ', ' + room.nextAct : ''}${room.nextBoss ? ', with ' + room.nextBoss + ' at the top' : ''}.`) : null,
    h('div', { class: 'rs-rows' },
      row('Gold obtained', h('span', null, '+', goldV), coin, 0),
      row('Health recovered', h('b', { class: 'rs-num' }, '+10%'), heart, 1),
      row('Items obtained', boss ? h('b', { class: 'rs-num rs-item rs-legend' }, 'Legendary chest') : room.elite ? h('b', { class: 'rs-num rs-item' }, 'Treasure chest') : h('i', { class: 'rs-none' }), chest, 2)),
    h('div', { class: 'rs-more' }, statPicker(room, hero), readyLine(room)));
  layer.append(box);
  // count the gold up the first time the screen appears
  const delay = mobile ? 2600 : 500;
  if (since < delay + 900) {
    const start = Math.max(0, delay + 350 - since);
    setTimeout(() => { const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / 600);
      goldV.textContent = String(Math.round(room.gold * k)); if (k < 1) requestAnimationFrame(step); }; step(); }, start);
  } else goldV.textContent = String(room.gold);
  // phones: let the victory poses play on their own first; tap to skip
  if (mobile && since < delay) {
    box.classList.add('wait');
    if (first) scene.focusHeroes(1.8, 0.5, 0.42);
    const show = () => {
      if (!box.classList.contains('wait')) return;
      box.classList.remove('wait'); removeEventListener('pointerdown', show);
      // keep the party framed, smaller, in the gap between the party cards and the rewards
      const p = $('#party').getBoundingClientRect(), top = box.getBoundingClientRect().top + 30;
      const y0 = p.height ? p.bottom : 60;
      scene.focusHeroes(1.3, 0.5, Math.max(0.2, ((y0 + top) / 2 + 20) / innerHeight));
    };
    setTimeout(show, delay - since); setTimeout(() => addEventListener('pointerdown', show), 300);
  }
}
function statPicker(room, hero) {
  const mine = room.stats && room.stats[me.playerId];
  const box = h('div', { class: 'stat-pick' });
  if (mine) {
    const S = C.STATS[mine];
    box.append(h('p', { class: 'lead' }, `You chose ${S.name} (level ${hero.lv[mine]}).`));
  } else {
    box.append(h('h3', null, 'Choose an upgrade'));
    const row = h('div', { class: 'stat-row' });
    for (const [k, S] of Object.entries(C.STATS)) {
      const lv = (hero.lv && hero.lv[k]) || 0;
      row.append(h('button', { class: 'stat-card', style: { '--sc': S.color }, onclick: () => { sfx('coin'); roomOp('stat', { stat: k }); } },
        h('img', { src: SP.iconURL(S.icon, 3), alt: '' }), h('b', null, S.name), h('span', { class: 'lv' }, `Lv ${lv} → ${lv + 1}`), h('p', null, S.desc)));
    }
    box.append(row);
  }
  const others = state.run.heroes.filter(x => x.id !== me.playerId && room.stats && room.stats[x.id]);
  if (others.length) box.append(h('div', { class: 'feed' }, ...others.map(x => h('div', null, `${x.name} chose ${C.STATS[room.stats[x.id]].name}`))));
  return box;
}

// ------------------------------------------------------------------ "?" events
const sceneArt = {};
function eventArtURL(art) {
  if (!art.startsWith('scene:')) return '/art/events/' + art;
  if (sceneArt[art]) return sceneArt[art];
  const W = 192, H = 192;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  const sky = x.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0d1220'); sky.addColorStop(1, '#1c1a2a'); x.fillStyle = sky; x.fillRect(0, 0, W, H);
  // stone blocks
  for (let r = 0; r < 9; r++) for (let k = 0; k < 7; k++) { x.fillStyle = (r + k) % 2 ? '#1d2233' : '#232a3d'; x.fillRect(k * 30 - (r % 2) * 15, r * 16, 28, 14); }
  x.fillStyle = '#2b2a3a'; x.fillRect(0, 140, W, 52);
  for (let k = 0; k < 12; k++) { x.fillStyle = k % 2 ? '#34324a' : '#2f2d44'; x.fillRect(k * 18, 140 + (k % 3) * 6, 16, 4); }
  const glow = (gx, gy, r, col) => { const g = x.createRadialGradient(gx, gy, 2, gx, gy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); };
  if (art === 'scene:shrine') {
    glow(96, 92, 90, 'rgba(255,214,110,0.45)');
    x.fillStyle = '#5a5470'; x.fillRect(66, 104, 60, 40); x.fillStyle = '#6e6888'; x.fillRect(60, 98, 72, 10); x.fillStyle = '#3e3a52'; x.fillRect(70, 112, 52, 4);
    x.fillStyle = '#4a4560'; x.fillRect(82, 60, 28, 40); x.fillStyle = '#ffe9a0'; x.fillRect(92, 66, 8, 26);
    x.font = 'bold 13px Cinzel, serif'; x.textAlign = 'center';
    const nums = ['7', '3', '+', '9', '×', '2', '=', '5', '÷', '8'];
    nums.forEach((n, i) => { const a = i / nums.length * Math.PI * 2; x.fillStyle = `rgba(255,${200 + (i % 3) * 18},110,${0.55 + (i % 2) * 0.35})`; x.fillText(n, 96 + Math.cos(a) * 58, 84 + Math.sin(a) * 34); });
    const ic = SP.iconCanvas('blessing'); x.drawImage(ic, 96 - ic.width, 30, ic.width * 2, ic.height * 2);
  } else if (art === 'scene:ambush') {
    glow(96, 120, 110, 'rgba(255,60,50,0.28)');
    const put = (kind, cx, scale) => { const f = SP.enemyFrame(kind, 'windup'); x.drawImage(f, cx - f.width * scale / 2, 150 - f.height * scale, f.width * scale, f.height * scale); };
    put('skeleton', 96, 1.6); put('goblin', 42, 1.35); put('hexer', 152, 1.35);
    for (const [ex, ey] of [[30, 40], [166, 30], [100, 20]]) { x.fillStyle = '#ff3b3b'; x.fillRect(ex, ey, 3, 2); x.fillRect(ex + 7, ey, 3, 2); }
  }
  // vignette
  const v = x.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.9)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
  sceneArt[art] = c.toDataURL();
  return sceneArt[art];
}
function eventRoom(room, hero) {
  const ev = C.EVENTS[room.event];
  const wrap = h('div', { class: 'room panel event-room' });
  const mine = room.choices && room.choices[me.playerId];
  const ready = room.ready && room.ready[me.playerId];
  const art = h('div', { class: 'ev-art' }, h('img', { src: eventArtURL(ev.art), alt: '' }));
  const side = h('div', { class: 'ev-side' });
  side.append(h('h2', { class: 'ev-title' }, ev.title), h('div', { class: 'ev-text', html: markup(ev.text) }));
  const opts = h('div', { class: 'ev-opts' });
  for (const o of ev.options) {
    const poor = o.needGold && hero.gold < o.needGold;
    const chosen = mine === o.id;
    const b = h('button', { class: 'ev-opt' + (chosen ? ' chosen' : '') + (o.risky ? ' risky' : '') + (o.safe ? ' safe' : ''), disabled: !!mine || poor,
      onclick: () => { sfx('click'); roomOp('choose', { opt: o.id }, r => { if (r.ok && r.q) qpanel.open(r.q, metaFor(r.q.intent)); }); } },
      h('div', { class: 'ev-label' }, o.label + (o.quiz ? ' ✎' : '')), h('div', { class: 'ev-desc', html: markup(o.desc) + (poor ? ` <span class="mk-red">(you have ${hero.gold} gold)</span>` : '') }));
    opts.append(b);
  }
  side.append(opts);
  const res = room.results && room.results[me.playerId];
  if (res) side.append(h('div', { class: 'ev-result' }, res));
  if (mine && !ev.team) side.append(h('div', { class: 'center' }, h('button', { class: 'btn primary', disabled: ready, onclick: () => roomOp('ready') }, ready ? 'Waiting for team…' : 'Continue')));
  if (ev.team && mine) side.append(h('p', { class: 'lead' }, 'Waiting for the rest of your team to decide…'));
  const feed = h('div', { class: 'feed' });
  for (const x of state.run.heroes) {
    if (x.id === me.playerId) continue;
    const c = room.choices && room.choices[x.id];
    if (!c) continue;
    const o = ev.options.find(q => q.id === c);
    feed.append(h('div', null, `${x.name}: ${o ? o.label : c}` + (room.results[x.id] && !ev.team ? ` · ${room.results[x.id]}` : '')));
  }
  side.append(feed, readyLine(room));
  wrap.append(art, side);
  return wrap;
}

// ------------------------------------------------------------------ campfire
function campfireRoom(room, hero) {
  if (!roomUI.camp) roomUI.camp = makeCampStage();
  const camp = roomUI.camp;
  const mine = room.choices[me.playerId];
  const wrap = h('div', { class: 'room panel camp' });
  wrap.append(h('h2', { class: 'camp-title' }, mine ? 'Rest easy. Waiting for your team…' : 'What shall I do?'));
  if (!mine && roomUI.train) {
    wrap.append(h('p', { class: 'lead' }, 'Which skill do you want to upgrade? Upgraded skills are 35% stronger.'),
      h('div', { class: 'row' }, ...hero.skills.map((s, i) => skillCard(s.id, s.lvl, { label: `Slot ${i + 1}`, button: h('button', { class: 'btn primary', disabled: s.lvl > 1, onclick: () => roomOp('train', { slot: i }) }, s.lvl > 1 ? 'Already upgraded' : `Upgrade to ${C.skillName(s.id, 2)}`) }))),
      h('div', { class: 'center' }, h('button', { class: 'linkbtn', onclick: () => { roomUI.train = false; renderRoom(); } }, 'Back')));
  } else {
    const cards = h('div', { class: 'camp-cards' });
    const missing = hero.maxHp - hero.hp;
    for (const [k, O] of Object.entries(C.CAMP)) {
      const disabled = !!mine || (k === 'train' && hero.skills.every(s => s.lvl > 1));
      const picked = mine && (mine[k] != null);
      const desc = k === 'rest' ? (missing > 0 ? `Heal ${Math.min(missing, Math.round(hero.maxHp * 0.35))} HP.` : 'You are at full health.') : O.desc;
      cards.append(h('button', { class: 'camp-card' + (picked ? ' picked' : ''), style: { '--cc': O.color }, disabled,
        onclick: () => { sfx('click'); if (k === 'train') { roomUI.train = true; renderRoom(); } else roomOp(k); } },
        h('div', { class: 'cc-art' }, h('img', { src: SP.iconURL(O.icon, 4), alt: '' })), h('b', null, O.name), h('span', null, desc)));
    }
    wrap.append(cards);
  }
  // heroes around the fire, with a bubble showing each choice
  camp.setHeroes(state.run.heroes, room.choices);
  wrap.append(camp.el, readyLine(room));
  return wrap;
}
function makeCampStage() {
  const W = 320, H = 132;
  const el = h('div', { class: 'camp-stage' });
  const cv = h('canvas', { width: W, height: H });
  const bubbles = h('div', { class: 'camp-bubbles' });
  el.append(cv, bubbles);
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  const fx = 160, fy = 100;
  const SEATS = [[86, 112, 1], [118, 88, 1], [204, 88, 0], [236, 112, 0], [56, 96, 1], [266, 96, 0]];
  let heroes = [];
  const stage = {
    el,
    setHeroes(list, choices) {
      heroes = list.slice(0, 6);
      clear(bubbles);
      heroes.forEach((hd, i) => {
        const [sx, sy] = SEATS[i];
        const ch = choices[hd.id];
        const icon = !ch ? null : ch.rest != null ? C.CAMP.rest.icon : ch.train ? C.CAMP.train.icon : C.CAMP.meditate.icon;
        bubbles.append(h('div', { class: 'cb' + (ch ? ' done' : ''), style: { left: (100 * sx / W) + '%', top: (100 * (sy - 62) / H) + '%' } },
          icon ? h('img', { src: SP.iconURL(icon, 2), alt: '' }) : h('span', null, '…'), ch ? h('i', null, '✓') : null));
      });
    }
  };
  const draw = () => {
    if (!el.isConnected) { stage.raf = requestAnimationFrame(draw); return; }
    const t = performance.now() / 1000;
    const bg = x.createRadialGradient(fx, fy, 6, fx, fy, 190); bg.addColorStop(0, '#2c3a26'); bg.addColorStop(0.5, '#172015'); bg.addColorStop(1, '#090c0a');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    // flagstones and grass tufts
    for (let i = 0; i < 26; i++) { const gx = (i * 53) % W, gy = 60 + ((i * 37) % 70); x.fillStyle = i % 3 ? 'rgba(80,110,60,0.35)' : 'rgba(60,70,80,0.35)'; x.fillRect(gx, gy, 6 + (i % 4) * 3, 2); }
    // fire light
    const flick = 0.85 + Math.sin(t * 9) * 0.06 + Math.sin(t * 23) * 0.04;
    const gl = x.createRadialGradient(fx, fy - 6, 4, fx, fy - 6, 120 * flick); gl.addColorStop(0, 'rgba(190,255,120,0.55)'); gl.addColorStop(0.35, 'rgba(120,200,70,0.22)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gl; x.fillRect(0, 0, W, H);
    // stone ring and logs
    for (let a = 0; a < 12; a++) { const ang = a / 12 * Math.PI * 2; x.fillStyle = a % 2 ? '#6c6f78' : '#555862'; x.fillRect(Math.round(fx + Math.cos(ang) * 17) - 3, Math.round(fy + 4 + Math.sin(ang) * 6) - 2, 6, 4); }
    x.fillStyle = '#5a3a22'; x.fillRect(fx - 14, fy + 1, 28, 4); x.fillStyle = '#4a2e1a'; x.fillRect(fx - 10, fy - 2, 20, 4);
    // flames (green-gold like a spirit fire)
    for (let k = 0; k < 14; k++) {
      const ph = (t * 1.6 + k * 0.37) % 1;
      const fxk = fx + Math.sin(k * 2.1 + t * 3) * (7 - ph * 5);
      const fyk = fy - 2 - ph * 26;
      const sz = Math.max(1, Math.round((1 - ph) * 6));
      x.fillStyle = ph < 0.3 ? '#fffbd0' : ph < 0.6 ? '#c8ff6a' : '#5fd04a';
      x.fillRect(Math.round(fxk - sz / 2), Math.round(fyk), sz, sz);
    }
    // heroes (back row first)
    const order = heroes.map((hd, i) => [hd, SEATS[i]]).sort((a, b) => a[1][1] - b[1][1]);
    for (const [hd, [sx, sy, flip]] of order) {
      const pose = Math.floor(t * 3.5) % 4;
      const fr = SP.heroFrame(hd.skin || hd.cls, hd.variant, SP.hasPose(hd.skin || hd.cls, 'sit') ? 'sit' : 'idle' + pose);
      x.save();
      if (flip) { x.translate(sx, 0); x.scale(-1, 1); x.drawImage(fr, -SP.ANCHOR_X, sy - SP.ANCHOR_Y); }
      else x.drawImage(fr, sx - SP.ANCHOR_X, sy - SP.ANCHOR_Y);
      x.restore();
    }
    stage.raf = requestAnimationFrame(draw);
  };
  draw();
  return stage;
}

// ------------------------------------------------------------------ raid
function raidBoard(raid) {
  const list = (raid && raid.teams) || [];
  const max = Math.max(1, ...list.map(t => t.dmg));
  return h('div', { class: 'raid-board' }, h('h3', null, 'Damage by team'), ...list.map(t => h('div', { class: 'rb' + (t.id === state.team.id ? ' mine' : '') },
    h('span', { style: { color: t.color } }, t.name), h('div', { class: 'bar' }, h('i', { style: { width: (100 * t.dmg / max) + '%', background: t.color } })), h('b', null, t.dmg))));
}
let raidEl = null;
function renderRaidBar() {
  const raid = state && state.raid;
  const show = raid && state.run && state.run.raidMode && !raid.over;
  if (!raidEl) { raidEl = h('div', { id: 'raidBar' }); document.body.appendChild(raidEl); }
  raidEl.classList.toggle('show', !!show);
  if (!show) return;
  const pct = Math.max(0, 100 * raid.hp / raid.maxHp);
  const left = raid.endsAt - (Date.now() - skew);
  clear(raidEl);
  raidEl.append(
    h('div', { class: 'rt' }, h('b', null, 'INFERNO DRAGON'), h('span', null, 'Heart of the Tower · every team is fighting it'), h('span', { class: 'rtime' }, fmtTime(left))),
    h('div', { class: 'rhp' }, h('i', { style: { width: pct + '%' } }), h('span', null, `${raid.hp} / ${raid.maxHp}`)),
    h('div', { class: 'rteams' }, ...raid.teams.slice(0, 6).map(t => h('span', { style: { borderColor: t.color, color: t.color } }, `${t.name} ${t.dmg}`))));
}

// ------------------------------------------------------------------ quick-time events
let qteEl = null, qteKey = null, qteResult = null;
function renderQTE() {
  const q = state && state.you && state.you.qte;
  if (!qteEl) { qteEl = h('div', { id: 'qteLayer' }); document.body.appendChild(qteEl); }
  if (!q) { qteEl.classList.remove('show'); qteKey = null; return; }
  // the prompt waits while the camera closes in on the enemy, frozen in its wind-up
  const wait = (q.showAt || 0) - (Date.now() - skew);
  clearTimeout(renderQTE._t);
  if (wait > 30 && !q.answered) { qteEl.classList.remove('show'); renderQTE._t = setTimeout(renderQTE, wait); return; }
  qteEl.classList.add('show');
  if (q.key === qteKey && !(q.answered && !qteEl.querySelector('.qte-done'))) return;
  qteKey = q.key;
  clear(qteEl);
  const card = h('div', { class: 'qte-card' });
  card.append(h('div', { class: 'qte-top' }, h('b', null, '⚡ QUICK TIME!'), h('span', null, `${q.name}${q.total > 1 ? ` · strike ${q.i + 1} of ${q.total}` : ''}`)),
    h('div', { class: 'qte-bar' }, h('i', { id: 'qteFill' })));
  if (q.answered) {
    card.append(h('div', { class: 'qte-done ' + (q.ok ? 'ok' : 'no') }, q.ok ? 'Dodge ready!' : 'Too slow… brace yourself!'), h('div', { class: 'qte-wait' }, 'Waiting for your team…'));
  } else {
    if (q._answer != null) window.__qte = q;
    const input = h('input', { class: 'qte-input', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Answer' });
    const send = () => {
      const v = input.value.trim(); if (!v) return;
      socket.emit('qte', { value: v }, timed('qte', r => { if (r && r.ok) sfx(r.correct ? 'correct' : 'wrong'); }));
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    card.append(h('div', { class: 'qte-q' }, q.q + ' = ?'), h('div', { class: 'qte-row' }, input, h('button', { class: 'qgo', onclick: send }, 'Dodge!')));
    const pad = h('div', { class: 'qte-pad' });
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '-']) {
      const b = h('button', { class: 'key', type: 'button' }, k);
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (k === '⌫') input.value = input.value.slice(0, -1); else input.value += k; });
      pad.append(b);
    }
    card.append(pad);
    setTimeout(() => input.focus(), 30);
    sfx('banner');
  }
  qteEl.append(card);
}

function chestURL(rarity, open) {
  const src = SP.chestFrame(rarity, open);
  const c = document.createElement('canvas'); c.width = src.width * 5; c.height = src.height * 5;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL();
}

// ------------------------------------------------------------------ end of game
function showEnded() {
  showScreen('ended');
  qpanel.close(true);
  const box = $('#ended'); clear(box);
  const wrap = h('div', { class: 'end-wrap' });
  wrap.append(h('h1', { class: 'logo', style: { textAlign: 'center' } }, 'Well played'));
  if (ended && ended.podium && ended.podium.length) {
    const order = [1, 0, 2].filter(i => ended.podium[i]);
    wrap.append(h('div', { class: 'podium' }, ...order.map(i => {
      const t = ended.podium[i];
      return h('div', { class: 'pod p' + (i + 1) }, h('div', { class: 'tn', style: { color: t.color } }, t.name), h('div', { class: 'mem' }, t.members.join(', ')),
        h('div', { class: 'blk' }, h('div', { class: 'place' }, ['1st', '2nd', '3rd'][i]), h('div', null, t.bossKills ? `${t.bossKills} boss win${t.bossKills > 1 ? 's' : ''}` : `Reached floor ${t.bestFloor}`)));
    })));
  }
  if (ended && ended.raid) {
    const r = ended.raid;
    wrap.append(h('div', { class: 'report panel raid-end' }, h('h2', null, r.won ? 'The raid boss fell!' : 'The Inferno Dragon survived'),
      h('div', { class: 'raid-board' }, ...r.teams.map(t => h('div', { class: 'rb' }, h('span', { style: { color: t.color } }, t.name), h('div', { class: 'bar' }, h('i', { style: { width: (100 * t.dmg / Math.max(1, r.teams[0].dmg)) + '%', background: t.color } })), h('b', null, t.dmg))))));
  }
  const y = ended && ended.you;
  if (y) {
    const rep = h('div', { class: 'report panel' });
    rep.append(h('h2', null, 'Your report'), h('div', { class: 'bigstats' },
      h('div', null, h('b', null, y.pct + '%'), 'correct'), h('div', null, h('b', null, `${y.correct}/${y.answered}`), 'questions'),
      h('div', null, h('b', null, y.best), 'best streak'), h('div', null, h('b', null, y.dmg), 'damage dealt'),
      y.raidDmg ? h('div', null, h('b', null, y.raidDmg), 'raid damage') : null,
      y.qte ? h('div', null, h('b', null, `${y.qte.c}/${y.qte.a}`), 'quick-times') : null));
    const skills = Object.entries(y.bySkill || {}).sort((a, b) => a[1].c / a[1].a - b[1].c / b[1].a);
    if (skills.length) rep.append(h('h3', null, 'By skill'), h('div', { class: 'skillbars' }, ...skills.map(([k, v]) => h('div', { class: 'sb' }, h('span', null, k), h('div', { class: 'bar' }, h('i', { style: { width: Math.round(100 * v.c / v.a) + '%' } })), h('b', null, Math.round(100 * v.c / v.a) + '%')))));
    if (y.wrong && y.wrong.length) {
      rep.append(h('h3', null, 'Questions to look at again'));
      const wl = h('div', { class: 'wrongs' });
      for (const w of y.wrong.slice(0, 12)) wl.appendChild(h('div', { class: 'w' }, h('div', { html: mathHTML(w.q) }), w.image ? h('img', { class: 'wimg', src: w.image, alt: '' }) : null, h('div', { class: 'a', html: 'Answer: ' + mathHTML(/\$/.test(w.correct) ? w.correct : '$' + w.correct + '$') }), w.solution ? h('div', { class: 's', html: mathHTML(w.solution) }) : null));
      rep.append(wl);
    }
    wrap.append(rep);
  }
  box.append(wrap);
}
