// Dungeon runs: the tower map, rooms (treasure, campfire, merchant, events) and loot.
const C = require('../shared/content');

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------------------------------------------------------------- the tower map
// A Slay-the-Spire-style climb: a grid of floors x columns, several paths walked from the
// bottom to the top that may merge but never cross, then room types dealt out by rules.
// Floors per run length (the boss sits on top of these).
const FLOORS = { quick: 6, standard: 9, long: 13 };
const COLS = 7, PATHS = 6;

function generateMap(length) {
  const F = FLOORS[length] || FLOORS.quick;
  const cells = new Map();                               // "row:col" -> node
  const edges = new Set();                               // "r:c>r+1:c2"
  const key = (r, c) => r + ':' + c;
  const crosses = (r, c, c2) => c2 !== c && edges.has(`${r}:${c2}>${r + 1}:${c}`);
  const starts = [];
  for (let p = 0; p < PATHS; p++) {
    // the first two paths start in different columns so there is always a real first choice
    let c = ri(0, COLS - 1);
    if (p === 1) while (c === starts[0]) c = ri(0, COLS - 1);
    starts.push(c);
    for (let r = 0; r < F; r++) {
      if (!cells.has(key(r, c))) cells.set(key(r, c), { row: r, col: c, next: new Set(), prev: new Set() });
      if (r === F - 1) break;
      let opts = shuffle([c - 1, c, c + 1].filter(x => x >= 0 && x < COLS && !crosses(r, c, x)));
      if (!opts.length) opts = [c];
      const c2 = opts[0];
      edges.add(`${r}:${c}>${r + 1}:${c2}`);
      c = c2;
    }
  }
  for (const e of edges) {
    const [a, b] = e.split('>');
    cells.get(a).next.add(b); cells.get(b).prev.add(a);
  }
  // ---- room types
  const nodes = [...cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  const treasureFloor = Math.round((F - 1) / 2);
  const early = Math.max(2, Math.round(F * 0.3));       // no elites or campfires below this floor
  const SPECIAL = ['elite', 'rest', 'merchant'];
  const weights = r => ({ enemy: 46, unknown: 22, elite: r >= early ? 15 : 0, rest: r >= Math.ceil(F * 0.4) && r < F - 2 ? 10 : 0, merchant: r >= 1 ? 7 : 0 });
  for (const n of nodes) {
    if (n.row === 0) { n.type = 'enemy'; continue; }
    if (n.row === F - 1) { n.type = 'rest'; continue; }
    if (n.row === treasureFloor) { n.type = 'treasure'; continue; }
    const parents = [...n.prev].map(k => cells.get(k));
    const siblings = new Set(parents.flatMap(pn => [...pn.next].map(k => cells.get(k)).filter(m => m !== n && m.type).map(m => m.type)));
    const banned = new Set(parents.map(pn => pn.type).filter(t => SPECIAL.includes(t)));
    for (const t of siblings) if (SPECIAL.includes(t) || t === 'unknown') banned.add(t);
    if (n.row === treasureFloor - 1 || n.row === treasureFloor + 1) banned.add('treasure');
    const w = weights(n.row);
    for (const t of banned) w[t] = 0;
    n.type = rollRarity(w) || 'enemy';
  }
  // ---- ids and layout (x across 0..1 with a little hand-drawn wobble, y = floor)
  let id = 0;
  const idOf = new Map();
  for (const n of nodes) idOf.set(key(n.row, n.col), 'n' + (++id));
  const out = nodes.map(n => ({
    id: idOf.get(key(n.row, n.col)), row: n.row, col: n.col, type: n.type,
    x: Math.min(1, Math.max(0, (n.col + 0.5) / COLS + (Math.random() - 0.5) * 0.03)),
    y: n.row + (Math.random() - 0.5) * 0.22,
    next: [...n.next].map(k => idOf.get(k))
  }));
  for (const n of out) if (n.row === F - 1) n.next = ['boss'];
  out.push({ id: 'boss', row: F, col: 3, type: 'boss', x: 0.5, y: F + 0.25, next: [] });
  return { nodes: out, rows: F + 1, cols: COLS };
}

function rollRarity(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const k of Object.keys(weights)) { r -= weights[k]; if (r <= 0) return k; }
  return 'common';
}
// Every chest and shop slot rolls its rarity 50 / 30 / 20.
const LOOT_WEIGHTS = Object.fromEntries(C.RARITY_ORDER.map(r => [r, C.RARITY[r].weight]));

// A random skill of the hero's own class, of that rarity if one is left (else any rarity), that they don't
// already have or have just been offered. null once the class pool is used up.
function skillOffer(hero, rarity, skip) {
  const owned = new Set([...hero.skills.map(s => s.id), ...(skip || [])]);
  const mine = C.classSkills(hero.cls).filter(id => !owned.has(id));
  const pool = mine.filter(id => C.SKILLS[id].rarity === rarity);
  const from = pool.length ? pool : mine;
  return from.length ? { id: pick(from), lvl: 1 } : null;
}
// Same for items (passives): any class, never one the hero already carries.
function itemOffer(hero, rarity, skip) {
  const owned = new Set([...(hero.items || []), ...(skip || [])]);
  const all = Object.keys(C.ITEMS).filter(id => !owned.has(id));
  const pool = all.filter(id => C.ITEMS[id].rarity === rarity);
  const from = pool.length ? pool : all;
  return from.length ? pick(from) : null;
}

// Each hero gets a chest of one rarity. Inside: a skill, an item and a pile of gold; they keep one.
function makeTreasureRoom(run, kind) {
  const chests = {};
  for (const h of Object.values(run.heroes)) {
    const rarity = rollRarity(LOOT_WEIGHTS);
    const gold = C.RARITY[rarity].gold + ri(-5, 5) + (kind === 'elite' ? 15 : 0);
    chests[h.id] = { rarity, opened: false, skill: skillOffer(h, rarity), item: itemOffer(h, rarity), gold, decided: false };
  }
  return { type: 'treasure', kind, chests, ready: {} };
}

// Pip sells each hero two skills of their class and two items, each rolled 50 / 30 / 20.
function makeMerchantRoom(run) {
  const stock = {};
  const price = r => C.RARITY[r].price + ri(-5, 5);
  for (const h of Object.values(run.heroes)) {
    const skills = [], items = [];
    for (let i = 0; i < 2; i++) {
      const sk = skillOffer(h, rollRarity(LOOT_WEIGHTS), skills.map(s => s.id));
      if (sk) skills.push({ ...sk, price: price(C.SKILLS[sk.id].rarity), sold: false });
      const it = itemOffer(h, rollRarity(LOOT_WEIGHTS), items.map(s => s.id));
      if (it) items.push({ id: it, price: price(C.ITEMS[it].rarity), sold: false });
    }
    stock[h.id] = { skills, items, mend: { price: 30, sold: false } };
  }
  return { type: 'merchant', stock, ready: {} };
}

// Adds an item to a hero (Troll's Belt raises max HP straight away). False if they already have it.
function giveItem(h, id) {
  const it = C.ITEMS[id]; if (!it) return false;
  h.items = h.items || [];
  if (h.items.includes(id)) return false;
  h.items.push(id);
  if (it.maxHp) { h.maxHp += it.maxHp; h.hp += it.maxHp; }
  return true;
}
// Puts a skill into the hero's free slot, or over the given slot when all three are full.
// Returns the replaced skill id ('' if it went into a free slot), or null if it can't be placed.
function giveSkill(h, sk, slot) {
  if (!sk || !C.SKILLS[sk.id] || h.skills.some(s => s.id === sk.id)) return null;
  if (h.skills.length < C.MAX_SKILLS) { h.skills.push({ id: sk.id, lvl: sk.lvl || 1 }); return ''; }
  if (!(slot >= 0 && slot < h.skills.length)) return null;
  const old = h.skills[slot].id;
  h.skills[slot] = { id: sk.id, lvl: sk.lvl || 1 };
  return old;
}

function makeRestRoom() { return { type: 'rest', choices: {}, ready: {} }; }

function makeEventRoom(run) {
  // One of the ten "?" events, avoiding repeats within a run where possible.
  const all = Object.keys(C.EVENTS);
  const seen = run.seenEvents || (run.seenEvents = []);
  let pool = all.filter(id => !seen.includes(id));
  if (!pool.length) { seen.length = 0; pool = all; }
  const id = pick(pool); seen.push(id);
  return { type: 'event', event: id, choices: {}, results: {}, correct: {}, ready: {} };
}

module.exports = { FLOORS, generateMap, makeTreasureRoom, makeMerchantRoom, makeRestRoom, makeEventRoom, skillOffer, itemOffer, giveItem, giveSkill, ri, pick, shuffle };
