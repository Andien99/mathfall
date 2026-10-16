// Parchment tower map, climbed from the bottom up, with team voting.
import { h, clear } from './ui.js';
import * as SP from './sprites.js';

const INK = '#2a1d14';
const ICONS = {
  enemy: `<path d="M9 31 L27 13 M27 13 l3-7 -7 3 M13 27 l-4 1 -1 4 4-1 z M31 31 L13 13 M13 13 l-3-7 7 3 M27 27 l4 1 1 4 -4-1 z" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 25 l4 4 M29 25 l-4 4" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`,
  elite: `<path d="M8 8 C10 14 12 15 14 15 M32 8 C30 14 28 15 26 15" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M12 18 C12 10 28 10 28 18 L28 25 C28 28 25 29 24 30 L24 33 L16 33 L16 30 C15 29 12 28 12 25 Z" fill="${INK}"/><circle cx="16.5" cy="21" r="2.6" fill="#e6d7b8"/><circle cx="23.5" cy="21" r="2.6" fill="#e6d7b8"/><path d="M18 28 h4" stroke="#e6d7b8" stroke-width="1.6"/>`,
  treasure: `<path d="M7 17 C7 9 33 9 33 17 L33 31 L7 31 Z" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M7 18 H33" stroke="${INK}" stroke-width="3"/><rect x="17" y="15" width="6" height="7" rx="1.2" fill="${INK}"/><path d="M12 11 V31 M28 11 V31" stroke="${INK}" stroke-width="2"/>`,
  rest: `<path d="M20 7 C24 13 27 15 26 21 C25 26 22 27 20 27 C17 27 14 25 14 21 C14 17 17 16 17 12 C19 14 19 16 20 17 C21 14 21 10 20 7 Z" fill="${INK}"/><path d="M20 19 C21 21 22 22 21 24 C20 25 19 25 18.6 23.6 C18.4 22 19.6 21.4 20 19 Z" fill="#e6d7b8"/><path d="M8 33 L32 27 M8 27 L32 33" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`,
  merchant: `<path d="M14 11 L26 11 L23 15 C30 18 32 24 31 28 C30 33 25 34 20 34 C15 34 10 33 9 28 C8 24 10 18 17 15 Z" fill="${INK}"/><path d="M16 15 H24" stroke="#e6d7b8" stroke-width="1.6"/><text x="20" y="30" text-anchor="middle" font-family="Cinzel, serif" font-weight="900" font-size="12" fill="#e6d7b8">$</text>`,
  unknown: `<text x="20" y="31" text-anchor="middle" font-family="Cinzel, serif" font-weight="900" font-size="29" fill="${INK}">?</text>`
};
const LEGEND = [['unknown', 'Unknown'], ['merchant', 'Merchant'], ['treasure', 'Treasure'], ['rest', 'Campfire'], ['enemy', 'Monsters'], ['elite', 'Elite']];
const NAMES = { enemy: 'Monsters', elite: 'Elite', treasure: 'Treasure', rest: 'Campfire', merchant: 'Merchant', unknown: 'Unknown', boss: 'Boss' };
const ACTS = { quick: 'The Crumbling Spire', standard: 'The Crystal Tower', long: 'The Endless Tower' };
const ROW_H = 74;      // pixels between floors
const PAD_TOP = 92, PAD_BOTTOM = 46;

function svgIcon(type) { return `<svg viewBox="0 0 40 40" aria-hidden="true">${ICONS[type] || ICONS.unknown}</svg>`; }

let paperURL = null;
function paperTexture() {
  if (paperURL) return paperURL;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  const img = x.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random();
    const v = 205 + n * 30;
    img.data[i] = v; img.data[i + 1] = v * 0.93; img.data[i + 2] = v * 0.78; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.globalAlpha = 0.035;
  for (let k = 0; k < 26; k++) { x.fillStyle = Math.random() < 0.5 ? '#7a5a2a' : '#fff6e0'; x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 40, 3 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2); x.fill(); }
  x.globalAlpha = 0.06; x.strokeStyle = '#6a4a2a';
  for (let k = 0; k < 18; k++) { x.beginPath(); const y = Math.random() * 256; x.moveTo(0, y); x.bezierCurveTo(80, y + 6, 170, y - 6, 256, y); x.stroke(); }
  paperURL = c.toDataURL();
  return paperURL;
}

export class MapView {
  constructor(root, onVote) {
    this.root = root; this.onVote = onVote;
    this.el = h('div', { class: 'map-wrap' });
    this.root.appendChild(this.el);
    this.mapKey = null; this.scrollTop = null; this.lastPos = undefined;
  }
  hide() { this.el.classList.remove('show'); }
  render(state, myId) {
    const run = state.run; if (!run) return;
    const map = run.map;
    this.el.classList.add('show');
    // keep the reader's scroll position across re-renders of the same map
    const oldTower = this.el.querySelector('.tower');
    if (oldTower) this.scrollTop = oldTower.scrollTop;
    const key = map.nodes.length + ':' + map.nodes[0].id + ':' + (run.asc || 0) + ':' + map.nodes.map(n => n.type[0]).join('');
    const fresh = key !== this.mapKey;
    const moved = run.map.pos !== this.lastPos;
    this.mapKey = key; this.lastPos = run.map.pos;
    clear(this.el);

    const top = Math.max(...map.nodes.map(n => n.row));
    const H = PAD_TOP + PAD_BOTTOM + top * ROW_H;
    const Y = n => PAD_TOP + (top - n.y) * ROW_H;       // floor 0 at the bottom, boss at the top
    const X = n => 7 + n.x * 86;                          // percent across

    const scroll = h('div', { class: 'scroll tall' });
    scroll.style.backgroundImage = `radial-gradient(ellipse at 50% 50%, rgba(255,250,230,0.35), rgba(120,80,40,0.25) 80%, rgba(80,50,20,0.5)), url(${paperTexture()})`;
    const floorNow = run.floor || 0;
    const C = window.MF_Content;
    const bossNode = map.nodes.find(n => n.type === 'boss');
    const bossName = bossNode && bossNode.boss && C.ENEMIES[bossNode.boss] ? C.ENEMIES[bossNode.boss].name : 'the boss';
    const title = h('div', { class: 'map-title' }, h('h2', null, C.ACT_NAMES[(run.asc || 0) % C.ACT_NAMES.length]),
      h('div', { class: 'map-act' }, `Act ${(run.asc || 0) + 1} · ` + (floorNow ? `Floor ${floorNow} of ${top}` : `${top} floors to ${bossName}`)));
    const tower = h('div', { class: 'tower' });
    const field = h('div', { class: 'field tall', style: { height: H + 'px' } });
    // faint floor numbers up the left edge
    for (let r = 0; r < top; r++) field.appendChild(h('span', { class: 'floor-no', style: { top: (PAD_TOP + (top - r) * ROW_H) + 'px' } }, String(r + 1)));
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'paths'); svg.setAttribute('viewBox', `0 0 1000 ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
    const byId = Object.fromEntries(map.nodes.map(n => [n.id, n]));
    const visited = map.nodes.filter(n => n.visited).sort((a, b) => a.row - b.row);
    const walkedSet = new Set();
    for (let i = 0; i + 1 < visited.length; i++) walkedSet.add(visited[i].id + '>' + visited[i + 1].id);
    const options = new Set(run.map.options);
    for (const n of map.nodes) for (const id of n.next) {
      const m = byId[id]; if (!m) continue;
      const x1 = X(n) * 10, y1 = Y(n), x2 = X(m) * 10, y2 = Y(m);
      // stop the ink short of each icon
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx / 10 * 6, dy) || 1;
      const gap = 26 / len, gap2 = (m.type === 'boss' ? 52 : 26) / len;
      const line = document.createElementNS(svgNS, 'path');
      line.setAttribute('d', `M${x1 + dx * gap},${y1 + dy * gap} L${x2 - dx * gap2},${y2 - dy * gap2}`);
      const live = run.map.pos === n.id && options.has(m.id);
      line.setAttribute('class', walkedSet.has(n.id + '>' + m.id) ? 'walked' : live ? 'live' : 'trail');
      svg.appendChild(line);
    }
    field.appendChild(svg);
    const votes = run.map.votes || {};
    const heroes = Object.fromEntries(run.heroes.map(h2 => [h2.id, h2]));
    let focusY = null;
    for (const n of map.nodes) {
      const x = X(n), y = Y(n);
      const isOpt = options.has(n.id);
      const here = run.map.pos === n.id;
      const reachable = !n.visited && !isOpt && run.map.pos && !here;
      const cls = ['node', n.type, isOpt ? 'option' : '', n.visited ? 'visited' : '', here ? 'here' : '', run.map.goNode === n.id ? 'going' : '', votes[myId] === n.id ? 'myvote' : '', n.row < floorNow - 1 && !n.visited ? 'past' : ''].join(' ');
      const btn = h('button', { class: cls, style: { left: x + '%', top: y + 'px' }, title: NAMES[n.type], 'aria-label': NAMES[n.type] + (isOpt ? ' – vote' : ''), disabled: !isOpt || !!run.map.goNode });
      if (n.type === 'boss') {
        btn.appendChild(h('img', { src: SP.enemyPortraitURL(n.boss || 'minotaur', 1), alt: '' }));
        btn.appendChild(h('span', { class: 'boss-label' }, 'Boss'));
      } else btn.innerHTML = svgIcon(n.type);
      if (n.visited && !here) btn.appendChild(h('span', { class: 'cross' }));
      if (isOpt) { btn.addEventListener('click', () => this.onVote(n.id)); focusY = focusY == null ? y : Math.min(focusY, y); }
      const voters = Object.entries(votes).filter(([, v]) => v === n.id).map(([pid]) => heroes[pid]).filter(Boolean);
      if (voters.length) {
        const vs = h('div', { class: 'voters' });
        for (const v of voters) vs.appendChild(h('img', { src: SP.portraitURL(v.skin || v.cls, v.variant, 'open', 2), alt: v.name, title: v.name }));
        btn.appendChild(vs);
      }
      if (here) btn.appendChild(h('span', { class: 'banner-pin', style: { '--team': state.team.color } }));
      field.appendChild(btn);
    }
    tower.appendChild(field);
    const legend = h('div', { class: 'legend' }, ...LEGEND.map(([t, label]) => h('div', { class: 'leg', html: svgIcon(t) + `<span>${label}</span>` })));
    const connected = run.heroes.filter(x => x.connected).length;
    const nVotes = Object.keys(votes).length;
    let msg = 'Tap a glowing room to vote. The team climbs where most of you choose.';
    if (run.map.goNode) msg = `Heading to ${NAMES[byId[run.map.goNode].type] || 'the next room'}…`;
    else if (nVotes) msg = `${nVotes} of ${connected} voted.` + (votes[myId] ? ' Waiting for the rest of your team.' : ' Your vote counts too.');
    this.status = h('div', { class: 'map-status' }, h('span', { class: 'msg' }, msg), h('span', { class: 'count', id: 'voteCount' }));
    scroll.append(title, tower, legend, this.status);
    this.el.append(h('div', { class: 'scroll-col' }, h('div', { class: 'rod t' }), scroll, h('div', { class: 'rod b' })));
    // Scroll: keep the reader's place, but bring the next choices into view when the team moves.
    requestAnimationFrame(() => {
      if (!fresh && !moved && this.scrollTop != null) { tower.scrollTop = this.scrollTop; return; }
      const target = focusY != null ? focusY : H;
      tower.scrollTop = Math.max(0, target - tower.clientHeight * 0.62);
      this.scrollTop = tower.scrollTop;
    });
    this.deadline = run.map.voteDeadline;
    this.serverSkew = Date.now() - state.now;
  }
  tick() {
    const c = this.el.querySelector('#voteCount'); if (!c) return;
    if (this.deadline) { const ms = this.deadline - (Date.now() - this.serverSkew); c.textContent = ms > 0 ? `Deciding in ${Math.ceil(ms / 1000)}s` : ''; }
    else c.textContent = '';
  }
}
