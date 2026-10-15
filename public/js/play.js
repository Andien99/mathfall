// Mathfall student client.
import { h, $, $$, clear, setMath, mathHTML, toast, fmtTime } from './ui.js';
import { BattleScene } from './scene.js';
import { MapView } from './mapview.js';
import { QuestionPanel } from './question.js';
import * as SP from './sprites.js';
import { sfx, setSound, soundOn, unlockAudio } from './audio.js';

const C = window.MF_Content;
const socket = io({ transports: ['websocket', 'polling'] });
window.__mfSocket = socket;
const qs = new URLSearchParams(location.search);

let me = null;            // { playerId, token, name, code }
let state = null;         // latest team state from the server
let skew = 0;             // client clock - server clock
let pendingCls = null;
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
scene.onLowPower = () => { console.info('Mathfall: lower detail mode for smoother play'); fit(); };
function stageRect() {
  const W = innerWidth, H = innerHeight;
  const top = 50;
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
function fit() { scene.resize(innerWidth, innerHeight, stageRect()); }
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
  onSubmit: (qid, value) => socket.emit('answer', { qid, value }, res => { qpanel.result(res); if (res && res.ok) renderActions(); }),
  onNext: () => socket.emit('nextQ', {}, res => { if (res.ok && res.q) qpanel.open(res.q, metaFor(res.q.intent)); else { if (res.msg) toast(res.msg); if (!res.ok) qpanel.close(true); } }),
  onDrop: () => socket.emit('dropQ', {}),
  onClose: () => renderActions()
});

// ------------------------------------------------------------------ join
const codeIn = $('#code'), nameIn = $('#name');
try { nameIn.value = localStorage.getItem('mf_name') || ''; pendingCls = localStorage.getItem('mf_cls'); } catch (e) {}
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
  socket.emit('join', { ...data, cls: pendingCls }, res => {
    if (!res || !res.ok) {
      if (data.token) { sessionStorage.removeItem('mf_session'); showScreen('join'); }
      $('#joinErr').textContent = (res && res.msg) || 'Could not join.';
      return;
    }
    me = { playerId: res.playerId, token: res.token, name: res.name, code: data.code };
    scene.myId = me.playerId;
    try { sessionStorage.setItem('mf_session', JSON.stringify(me)); localStorage.setItem('mf_name', res.name); } catch (e) {}
    if (res.state === 'lobby') showScreen('lobby');
  });
}
function tryResume() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('mf_session') || 'null'); } catch (e) {}
  if (saved && saved.code && saved.token) join({ code: saved.code, token: saved.token, name: saved.name });
}

socket.on('connect', () => { $('#conn').classList.remove('show'); if (me) join({ code: me.code, token: me.token, name: me.name }); else tryResume(); });
socket.on('disconnect', () => { $('#conn').classList.add('show'); });
socket.on('kicked', () => { sessionStorage.removeItem('mf_session'); me = null; showScreen('join'); $('#joinErr').textContent = 'Your teacher removed you from the game.'; });
socket.on('replaced', () => { toast('You joined from another tab.'); });
socket.on('q', q => { if (!qpanel.isOpen && q && q.intent) qpanel.open(q, metaFor(q.intent)); });
socket.on('qclose', () => { if (qpanel.isOpen && qpanel.q && qpanel.q.intent && qpanel.q.intent.kind !== 'shrine') qpanel.close(true); });
socket.on('ended', data => { ended = data; showEnded(); });
socket.on('state', onState);

function showScreen(name) {
  document.body.className = document.body.className.replace(/screen-\w+/g, '').trim() + ' screen-' + name;
  if (name !== 'game') { mapView.hide(); clear($('#roomLayer')); }
  setTimeout(fit, 30);
}

// ------------------------------------------------------------------ state
function onState(st) {
  skew = Date.now() - st.now;
  const prev = state; state = st;
  $('#paused').classList.toggle('show', !!st.paused);
  if (st.state === 'ended') { if (!ended) showEnded(); return; }
  if (st.state === 'lobby' || !st.run) { showScreen('lobby'); renderLobby(); return; }
  if (!document.body.classList.contains('screen-game')) showScreen('game');
  if (typeof st.sound === 'boolean' && !st.sound && soundOn()) setSound(false);
  const run = st.run;
  // theme from the node we are in
  const node = run.map.nodes.find(n => n.id === run.map.pos);
  scene.setTheme(node && node.type === 'boss' ? 'lair' : node && node.row >= Math.ceil((run.rows - 1) / 2) ? 'crypt' : 'halls');
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
}

function myHero() { return state && state.run ? state.run.heroes.find(x => x.id === me.playerId) : null; }

// ------------------------------------------------------------------ lobby
function renderLobby() {
  const box = $('#heroCards');
  const you = state.you;
  const team = state.members || [];
  const taken = {};
  for (const m of team) if (m.cls && m.id !== me.playerId) (taken[m.cls] = taken[m.cls] || []).push(m.name);
  const sig = JSON.stringify([you.cls, taken]);
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    clear(box);
    for (const cls of C.HERO_ORDER) {
      const H = C.HEROES[cls];
      const card = h('button', { class: 'hero-card' + (you.cls === cls ? ' picked' : ''), onclick: () => pickHero(cls), 'aria-pressed': you.cls === cls ? 'true' : 'false' },
        h('div', { class: 'art' }, h('img', { src: SP.heroFullURL(cls, 0, 'idle0', 3), alt: '', 'data-cls': cls })),
        h('h3', null, H.name), h('div', { class: 'role' }, H.role + ' · ' + H.hp + ' HP'),
        h('p', { class: 'blurb' }, H.blurb),
        h('div', { class: 'sk' }, ...H.skills.flatMap(id => [h('img', { src: SP.iconURL(C.SKILLS[id].icon, 2), alt: '' }), h('div', null, h('b', null, C.SKILLS[id].name, h('span', { class: 'skcost' }, C.SKILLS[id].cost + ' energy')), C.skillDesc(id, 1))])),
        h('div', { class: 'entip' }, `Attack or Defend to charge energy (+${C.ENERGY.attack} each). Skills spend it.`),
        taken[cls] ? h('span', { class: 'taken' }, taken[cls].join(', ')) : null);
      box.appendChild(card);
    }
  }
  const tb = $('#teamBox');
  clear(tb); tb.className = 'team-box panel';
  tb.append(h('h3', { style: { color: state.team.color } }, 'Team ' + state.team.name), h('div', { style: { color: 'var(--muted)', fontSize: '14px', marginBottom: '6px' } }, 'Your teacher may move you to another team.'));
  for (const m of team) tb.appendChild(h('div', { class: 'mem' }, h('img', { src: m.cls ? SP.portraitURL(m.cls, 0, 'open', 2) : SP.iconURL('focus', 2), alt: '' }), h('div', null, h('div', { style: { fontWeight: 800 } }, m.name + (m.id === me.playerId ? ' (you)' : '')), h('div', { class: 'cls' }, m.cls ? C.HEROES[m.cls].name : 'Choosing…'))));
  $('#lobbyWait').textContent = you.cls ? 'Ready! Waiting for your teacher to start the game…' : 'Pick a hero, then wait for your teacher to start.';
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
  socket.emit('pickHero', { cls }, r => { if (!r.ok && r.msg) toast(r.msg); });
}

// ------------------------------------------------------------------ HUD
function renderHUD() {
  if (!state || !state.run) return;
  const run = state.run;
  const node = run.map.nodes.find(n => n.id === run.map.pos);
  const nodeName = node ? (C.NODE_TYPES[node.type] || {}).name : 'Entrance';
  $('#floorInfo').innerHTML = `Floor ${Math.max(1, run.floor)} of ${run.rows}<span class="sub">${nodeName}${run.asc ? ' · Ascension ' + run.asc : ''}</span>`;
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
      h('img', { class: 'pt', src: SP.portraitURL(hdat.cls, hdat.variant, downed ? 'closed' : pct < 30 ? 'hurt' : 'open', 2), alt: '' }),
      h('div', { class: 'nm' }, hdat.name, h('small', null, C.HEROES[hdat.cls].name)),
      h('div', { class: 'hpbar' }, h('i', { class: pct < 30 ? 'lo' : '', style: { width: pct + '%' } })),
      h('div', { class: 'hpline' }, h('span', null, `${hp}/${maxHp}`), block ? h('span', { class: 'blk' }, `🛡 ${block}`) : h('span')),
      h('div', { class: 'stt' }, ...Object.entries(st).map(([k, v]) => h('span', { style: { '--c': (C.STATUS_INFO[k] || {}).color || '#fff' }, title: (C.STATUS_INFO[k] || {}).desc }, (C.STATUS_INFO[k] || { name: k }).name + (v.v ? ' ' + v.v : v.t > 1 ? ' ' + v.t : '')))),
      run.phase === 'combat' ? h('div', { class: 'enline', title: 'Energy' }, h('i', { style: { width: (100 * (hdat.energy || 0) / C.ENERGY.max) + '%' } })) : null,
      hdat.focus ? h('div', { class: 'focus' }, '✦'.repeat(hdat.focus) + '✧'.repeat(3 - hdat.focus)) : null,
      stLabel);
    box.appendChild(card);
  }
}

const ACTION_KEYS = ['attack', 'defend', 'skill0', 'skill1'];
function actionInfo(hero, action) {
  const H = C.HEROES[hero.cls];
  if (action === 'attack') return { name: H.attack.name, desc: H.attack.desc, icon: 'attack', color: '#ffb08a', cls: 'attack', gain: C.ENERGY.attack };
  if (action === 'defend') return { name: H.defend.name, desc: H.defend.desc.replace(/ Tap an ally.*$/, ''), icon: 'defend', color: '#a8d0ff', cls: 'defend', gain: C.ENERGY.defend };
  const sk = hero.skills[action === 'skill0' ? 0 : 1];
  const def = C.SKILLS[sk.id];
  return { name: C.skillName(sk.id, sk.lvl), desc: C.skillDesc(sk.id, sk.lvl), icon: def.icon, color: def.color, cls: 'rarity-' + def.rarity, cost: def.cost, target: def.target, rarity: def.rarity };
}
function metaFor(intent) {
  const hero = myHero();
  if (!intent) return {};
  if (intent.kind === 'focus') return { title: 'Focus', subtitle: 'Each correct answer powers your next attack or skill by 30%.', icon: SP.iconURL('focus', 3), color: '#b8c8ff', go: 'Focus', yes: 'Focused!' };
  if (intent.kind === 'rise') return { title: 'Get back up', subtitle: 'Answer correctly to return with 30% health.', icon: SP.iconURL('rise', 3), color: '#ffe2a0', go: 'Rise', yes: 'Back up!', noSwitch: true };
  if (intent.kind === 'shrine') return { title: 'The shrine asks…', subtitle: 'Answer to receive its blessing.', icon: SP.iconURL('blessing', 3), color: '#ffe9a0', go: 'Offer', yes: 'Blessed!', noSwitch: true, retry: 'Close' };
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
  const head = h('div', { class: 'am-head' }, h('img', { src: SP.portraitURL(hero.cls, hero.variant, 'determined', 2), alt: '' }), h('div', null, h('div', null, hero.name), h('div', { class: 'hint' },
    over ? 'Battle over' : hero.downed ? 'You are knocked out' : hero.acted ? 'Done for this round' : hero.ready ? 'Your action fires next round' : enemyTurn ? 'Enemies are acting. Plan your next move.' : 'Choose an action')));
  head.appendChild(energyMeter(hero.energy || 0));
  const list = h('div', { class: 'am-list' });
  if (hero.downed) {
    list.appendChild(h('button', { class: 'act rise', disabled: over, onclick: () => act('rise') }, h('img', { src: SP.iconURL('rise', 2), alt: '' }), h('div', null, h('div', { class: 'an' }, 'Get back up'), h('div', { class: 'ad' }, 'Answer a question to return with 30% health.')), h('span', { class: 'ak' }, '1')));
  } else if (hero.acted || hero.ready) {
    list.appendChild(h('div', { class: 'am-done' }, hero.ready ? 'Ready! Your action fires at the start of next round.' : 'Nice work. Waiting for your team.'));
    if (hero.focus < 3 && !over) list.appendChild(h('button', { class: 'act focus', onclick: () => act('focus') }, h('img', { src: SP.iconURL('focus', 2), alt: '' }), h('div', null, h('div', { class: 'an' }, `Focus ${'✦'.repeat(hero.focus)}${'✧'.repeat(3 - hero.focus)}`), h('div', { class: 'ad' }, 'Bonus question: +30% power on your next attack or skill.')), h('span', { class: 'ak' }, 'F')));
    else if (hero.focus >= 3) list.appendChild(h('div', { class: 'am-tip' }, 'Focus is full ✦✦✦. Use it next round.'));
  } else {
    ACTION_KEYS.forEach((k, i) => {
      const info = actionInfo(hero, k);
      const short = info.cost ? Math.max(0, info.cost - (hero.energy || 0)) : 0;
      const allyNote = (k === 'defend' || info.target === 'ally') && scene.allyTarget ? ' → ' + (run.heroes.find(x => x.id === scene.allyTarget) || {}).name : '';
      list.appendChild(h('button', { class: 'act ' + info.cls + (short ? ' low' : ''), disabled: over || short > 0, onclick: () => act(k), title: info.desc },
        h('img', { src: SP.iconURL(info.icon, 2), alt: '' }),
        h('div', null, h('div', { class: 'an' }, info.name + allyNote), h('div', { class: 'ad' }, info.desc)),
        info.cost ? h('span', { class: 'cost' + (short ? ' short' : ''), title: short ? `Need ${short} more energy` : `Costs ${info.cost} energy` }, h('b', null, info.cost), h('small', null, 'energy'))
          : h('span', { class: 'gain', title: `Charges ${info.gain} energy` }, h('b', null, '+' + info.gain), h('small', null, 'energy'))));
    });
    if (hero.focus) list.appendChild(h('div', { class: 'am-tip' }, `Focus ${'✦'.repeat(hero.focus)}: your next attack or skill is ${Math.round(30 * hero.focus)}% stronger.`));
    else list.appendChild(h('div', { class: 'am-tip' }, 'Tap an enemy to target it. Tap a teammate to guard or heal them.'));
  }
  box.append(head, list);
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
  let target = scene.target;
  if (action === 'defend') target = scene.allyTarget || null;
  if (action.startsWith('skill')) { const info = actionInfo(hero, action); if (info.target === 'ally') target = scene.allyTarget || null; }
  socket.emit('act', { action, target }, res => {
    if (!res || !res.ok) { if (res && res.msg) toast(res.msg); return; }
    qpanel.open(res.q, metaFor(res.q.intent));
  });
}
document.addEventListener('keydown', e => {
  if (qpanel.isOpen || !state || !state.run || state.run.phase !== 'combat') return;
  if (e.target && e.target.tagName === 'INPUT') return;
  const hero = myHero(); if (!hero) return;
  if (hero.downed && e.key === '1') act('rise');
  else if (!hero.acted && !hero.ready && '1234'.includes(e.key) && e.key.length === 1) act(ACTION_KEYS[+e.key - 1]);
  else if ((hero.acted || hero.ready) && (e.key === 'f' || e.key === 'F')) act('focus');
});

// round timer
function tickTimers() {
  requestAnimationFrame(tickTimers);
  mapView.tick();
  const run = state && state.run;
  const box = $('#roundBox');
  if (!run || run.phase !== 'combat' || !run.combat) { box.classList.remove('show'); $('#waitingFor').textContent = ''; return; }
  box.classList.add('show');
  const c = run.combat;
  $('#roundLabel').textContent = c.phase === 'enemy' ? 'Enemy turn' : 'Round ' + c.round;
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
function skillCard(id, lvl, extra) {
  const def = C.SKILLS[id]; const rc = C.RARITY[def.rarity].color;
  return h('div', { class: 'skcard' + (extra && extra.isNew ? ' new' : ''), style: { '--rc': rc } },
    h('img', { src: SP.iconURL(def.icon, 3), alt: '' }),
    h('div', { class: 'rar' }, C.RARITY[def.rarity].name + (extra && extra.label ? ' · ' + extra.label : '')),
    h('h4', null, C.skillName(id, lvl)),
    h('p', null, C.skillDesc(id, lvl)),
    h('div', { class: 'cd' }, `Costs ${def.cost} energy`),
    extra && extra.button ? extra.button : null);
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
  const panel = h('div', { class: 'room panel' + (['rest', 'event', 'victory', 'defeat', 'complete'].includes(room.type) ? ' low' : '') });
  const ready = room.ready && room.ready[me.playerId];
  if (room.type === 'victory') {
    panel.append(h('p', { class: 'result-big' }, 'Victory!'), h('div', { class: 'gold-gain' }, `+${room.gold} gold each · heroes recover 10% health`),
      room.elite ? h('p', { class: 'lead' }, 'The elite dropped a treasure chest for everyone.') : null,
      h('div', { class: 'center' }, h('button', { class: 'btn primary', disabled: ready, onclick: () => roomOp('ready') }, ready ? 'Waiting for team…' : room.elite ? 'Open the loot' : 'Continue')), readyLine(room));
  } else if (room.type === 'defeat') {
    panel.append(h('p', { class: 'result-big lose' }, 'Your party has fallen'), h('p', { class: 'lead' }, `You reached floor ${room.floor}. Every run teaches you something. Try again with a new map.`),
      h('div', { class: 'center' }, h('button', { class: 'btn primary', disabled: ready, onclick: () => roomOp('ready') }, ready ? 'Waiting for team…' : 'Try again')), readyLine(room));
  } else if (room.type === 'complete') {
    panel.append(h('p', { class: 'result-big' }, 'Gravemaw falls!'), h('p', { class: 'lead' }, `Your team conquered the dungeon. +${room.gold} gold each.`),
      h('p', { class: 'lead' }, `Ready for Ascension ${room.asc + 1}? Enemies are tougher and hit harder.`),
      h('div', { class: 'center' }, h('button', { class: 'btn primary', disabled: ready, onclick: () => roomOp('ready') }, ready ? 'Waiting for team…' : 'Climb higher')), readyLine(room));
  } else if (room.type === 'treasure') {
    const ch = you.chest;
    const rc = ch ? C.RARITY[ch.rarity].color : '#fff';
    panel.append(h('h2', null, room.event === 'cache' ? 'An abandoned cache' : room.kind === 'elite' ? 'Elite treasure' : 'Treasure'));
    if (!ch) panel.append(h('p', { class: 'lead' }, 'No chest for you this time.'));
    else if (!ch.opened) {
      panel.append(h('p', { class: 'lead' }, `A ${C.RARITY[ch.rarity].name.toLowerCase()} chest. Open it to see what's inside.`));
      const img = h('img', { class: 'chest-big shake', style: { '--rc': rc }, src: chestURL(ch.rarity, false), alt: 'Treasure chest', onclick: openIt });
      panel.append(img, h('div', { class: 'center' }, h('button', { class: 'btn primary', onclick: openIt }, 'Open the chest')));
      function openIt() { sfx('open'); roomOp('open', {}, r => { if (r.ok) sfx('coin'); }); }
    } else if (!ch.decided) {
      panel.append(h('div', { class: 'gold-gain' }, `+${ch.gold} gold`), h('p', { class: 'lead' }, 'You found a new skill. Swap it into a slot, or keep your current two.'));
      const offer = ch.offer;
      const row = h('div', { class: 'row' });
      row.append(skillCard(offer.id, offer.lvl, { isNew: true, label: 'New' }), h('div', { class: 'vs' }, 'or'));
      hero.skills.forEach((s, i) => row.append(skillCard(s.id, s.lvl, { label: `Slot ${i + 1}`, button: h('button', { class: 'btn', onclick: () => { sfx('click'); roomOp('take', { slot: i }); } }, `Replace with ${C.SKILLS[offer.id].name}`) })));
      panel.append(row, h('div', { class: 'center' }, h('button', { class: 'btn ghost', onclick: () => roomOp('keep') }, 'Keep my skills (+10 gold)')));
    } else {
      panel.append(h('p', { class: 'lead' }, 'Loot sorted. Waiting for your team.'));
      panel.append(h('div', { class: 'row' }, ...hero.skills.map((s, i) => skillCard(s.id, s.lvl, { label: `Slot ${i + 1}` }))));
    }
    const feed = h('div', { class: 'feed' });
    for (const [pid, c2] of Object.entries(room.chests || {})) {
      const who = state.run.heroes.find(x => x.id === pid); if (!who || pid === me.playerId || !c2.choice) continue;
      feed.appendChild(h('div', null, c2.choice.took ? `${who.name} took ${C.SKILLS[c2.choice.took].name}` : `${who.name} kept their skills`));
    }
    panel.append(feed, readyLine(room));
  } else if (room.type === 'rest') {
    const mine = room.choices[me.playerId];
    panel.append(h('h2', null, 'Campfire'), h('p', { class: 'lead' }, 'Catch your breath. Choose one.'));
    if (!mine) {
      if (roomUI.train) {
        panel.append(h('p', { class: 'lead' }, 'Which skill do you want to upgrade? Upgraded skills are 35% stronger.'));
        panel.append(h('div', { class: 'row' }, ...hero.skills.map((s, i) => skillCard(s.id, s.lvl, { label: `Slot ${i + 1}`, button: h('button', { class: 'btn primary', disabled: s.lvl > 1, onclick: () => roomOp('train', { slot: i }) }, s.lvl > 1 ? 'Already upgraded' : `Upgrade to ${C.skillName(s.id, 2)}`) }))));
        panel.append(h('div', { class: 'center' }, h('button', { class: 'linkbtn', onclick: () => { roomUI.train = false; renderRoom(); } }, 'Back')));
      } else {
        const missing = hero.maxHp - hero.hp;
        panel.append(h('div', { class: 'row' },
          h('div', { class: 'choice-card' }, h('img', { src: SP.iconURL('heart', 3), alt: '' }), h('h3', null, 'Rest'), h('p', null, missing > 0 ? `Heal 35% of your health (${Math.min(missing, Math.round(hero.maxHp * 0.35))} HP).` : 'You are already at full health.'), h('button', { class: 'btn primary big', onclick: () => roomOp('rest') }, 'Rest')),
          h('div', { class: 'choice-card' }, h('img', { src: SP.iconURL('battle_cry', 3), alt: '' }), h('h3', null, 'Train'), h('p', null, 'Upgrade one of your skills. It stays upgraded for the whole run.'), h('button', { class: 'btn big', disabled: hero.skills.every(s => s.lvl > 1), onclick: () => { roomUI.train = true; renderRoom(); } }, 'Train'))));
      }
    } else panel.append(h('p', { class: 'lead' }, mine.rest != null ? `You rested and healed ${mine.rest} HP.` : `You trained ${C.SKILLS[mine.train].name}.`));
    panel.append(readyLine(room));
  } else if (room.type === 'merchant') {
    const stock = you.stock;
    panel.append(h('h2', null, "Pip's Wandering Wares"), h('p', { class: 'lead' }, `"Shiny skills, fair prices!" You have ${hero.gold} gold.`));
    if (stock) {
      if (roomUI.buy != null) {
        const it = stock.items[roomUI.buy];
        panel.append(h('p', { class: 'lead' }, `Which skill should ${C.SKILLS[it.id].name} replace?`));
        panel.append(h('div', { class: 'row' }, skillCard(it.id, it.lvl, { isNew: true, label: `${it.price} gold` }), h('div', { class: 'vs' }, '→'), ...hero.skills.map((s, i) => skillCard(s.id, s.lvl, { label: `Slot ${i + 1}`, button: h('button', { class: 'btn primary', onclick: () => roomOp('buy', { item: roomUI.buy, slot: i }, r => { if (r.ok) { sfx('coin'); roomUI.buy = null; } }) }, 'Replace') }))));
        panel.append(h('div', { class: 'center' }, h('button', { class: 'linkbtn', onclick: () => { roomUI.buy = null; renderRoom(); } }, 'Back to the shop')));
      } else {
        panel.append(h('div', { class: 'row' }, ...stock.items.map((it, i) => skillCard(it.id, it.lvl, { label: it.sold ? 'Sold' : `${it.price} gold`, button: h('button', { class: 'btn' + (hero.gold >= it.price && !it.sold ? ' primary' : ''), disabled: it.sold || hero.gold < it.price, onclick: () => { roomUI.buy = i; renderRoom(); } }, it.sold ? 'Sold' : hero.gold < it.price ? 'Not enough gold' : `Buy for ${it.price}`) }))));
        panel.append(h('div', { class: 'center' }, h('button', { class: 'btn', disabled: stock.mend.sold || hero.gold < stock.mend.price || hero.hp >= hero.maxHp, onclick: () => roomOp('mend', {}, r => r.ok && sfx('heal')) }, stock.mend.sold ? 'Mended' : `Mend 40% health (${stock.mend.price} gold)`), ' ',
          h('button', { class: 'btn primary', disabled: ready, onclick: () => roomOp('ready') }, ready ? 'Waiting for team…' : 'Leave the shop')));
      }
    }
    panel.append(readyLine(room));
  } else if (room.type === 'event' && room.event === 'shrine') {
    const res = room.results[me.playerId];
    panel.append(h('h2', null, 'The Whispering Shrine'), h('p', { class: 'lead' }, 'A crystal hums with old magic. Answer its question for a blessing: +35 gold and 20% health.'));
    if (!res) panel.append(h('div', { class: 'center' }, h('button', { class: 'btn primary', onclick: () => roomOp('pray', {}, r => { if (r.ok && r.q) qpanel.open(r.q, metaFor(r.q.intent)); }) }, 'Touch the crystal'), ' ', h('button', { class: 'btn ghost', onclick: () => roomOp('ready') }, 'Walk past')));
    else panel.append(h('p', { class: 'lead' }, res === 'blessed' ? 'The shrine glows warmly. You feel stronger.' : 'The shrine dims. Maybe next time.'));
    panel.append(readyLine(room));
  }
  layer.appendChild(panel);
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
  const y = ended && ended.you;
  if (y) {
    const rep = h('div', { class: 'report panel' });
    rep.append(h('h2', null, 'Your report'), h('div', { class: 'bigstats' },
      h('div', null, h('b', null, y.pct + '%'), 'correct'), h('div', null, h('b', null, `${y.correct}/${y.answered}`), 'questions'),
      h('div', null, h('b', null, y.best), 'best streak'), h('div', null, h('b', null, y.dmg), 'damage dealt')));
    const skills = Object.entries(y.bySkill || {}).sort((a, b) => a[1].c / a[1].a - b[1].c / b[1].a);
    if (skills.length) rep.append(h('h3', null, 'By skill'), h('div', { class: 'skillbars' }, ...skills.map(([k, v]) => h('div', { class: 'sb' }, h('span', null, k), h('div', { class: 'bar' }, h('i', { style: { width: Math.round(100 * v.c / v.a) + '%' } })), h('b', null, Math.round(100 * v.c / v.a) + '%')))));
    if (y.wrong && y.wrong.length) {
      rep.append(h('h3', null, 'Questions to look at again'));
      const wl = h('div', { class: 'wrongs' });
      for (const w of y.wrong.slice(0, 12)) wl.appendChild(h('div', { class: 'w' }, h('div', { html: mathHTML(w.q) }), h('div', { class: 'a', html: 'Answer: ' + mathHTML(/\$/.test(w.correct) ? w.correct : '$' + w.correct + '$') }), w.solution ? h('div', { class: 's', html: mathHTML(w.solution) }) : null));
      rep.append(wl);
    }
    wrap.append(rep);
  }
  box.append(wrap);
}
