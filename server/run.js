// Dungeon runs: branching map, rooms (treasure, campfire, merchant, events) and loot.
const C = require('../shared/content');

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Row templates. Each row is a list of node types to draw from.
const LAYOUTS = {
  quick:    [['enemy'], ['treasure', 'unknown', 'elite'], ['rest', 'merchant']],
  standard: [['enemy'], ['enemy', 'unknown', 'treasure'], ['treasure'], ['elite', 'enemy', 'merchant', 'unknown'], ['rest']],
  long:     [['enemy'], ['enemy', 'unknown', 'treasure'], ['enemy', 'elite', 'unknown'], ['treasure'], ['elite', 'merchant', 'unknown', 'enemy'], ['enemy', 'unknown', 'treasure'], ['rest']]
};

function generateMap(length) {
  const layout = LAYOUTS[length] || LAYOUTS.quick;
  const rows = [];
  let id = 0;
  layout.forEach((choices, r) => {
    const count = r === 0 ? 2 : (choices.length === 1 ? 2 : 3);
    let types;
    if (choices.length === 1) types = Array(count).fill(choices[0]);
    else {
      types = shuffle(choices.slice()).slice(0, count);
      while (types.length < count) types.push(pick(choices));
      // quick runs always offer a chest on the second floor
      if (length === 'quick' && r === 1 && !types.includes('treasure')) types[0] = 'treasure';
    }
    rows.push(types.map((t, k) => ({ id: 'n' + (++id), row: r, type: t, x: (r + 1) / (layout.length + 1), y: (k + 1) / (count + 1) + (Math.random() - 0.5) * 0.08, next: [] })));
  });
  // connections: each node links forward to the nearest one or two nodes
  for (let r = 0; r < rows.length - 1; r++) {
    const a = rows[r], b = rows[r + 1];
    a.forEach((n, i) => {
      const j = Math.round(i * (b.length - 1) / Math.max(1, a.length - 1));
      n.next.push(b[j].id);
      const alt = j + (Math.random() < 0.5 ? -1 : 1);
      if (b[alt] && Math.random() < 0.55) n.next.push(b[alt].id);
    });
    b.forEach((m, j) => {
      if (!a.some(n => n.next.includes(m.id))) {
        let best = a[0], bd = 9;
        a.forEach(n => { const d = Math.abs(n.y - m.y); if (d < bd) { bd = d; best = n; } });
        best.next.push(m.id);
      }
    });
  }
  const boss = { id: 'boss', row: rows.length, type: 'boss', x: (rows.length + 1) / (layout.length + 1), y: 0.5, next: [] };
  rows[rows.length - 1].forEach(n => n.next.push('boss'));
  const nodes = rows.flat().concat([boss]);
  nodes.forEach(n => { n.x = Math.min(0.93, n.x); n.next = [...new Set(n.next)]; });
  return { nodes, rows: rows.length + 1 };
}

function rollRarity(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const k of Object.keys(weights)) { r -= weights[k]; if (r <= 0) return k; }
  return 'common';
}
const CHEST_WEIGHTS = { treasure: { common: 50, rare: 35, epic: 12, legendary: 3 }, elite: { common: 0, rare: 55, epic: 35, legendary: 10 }, cache: { common: 70, rare: 30, epic: 0, legendary: 0 } };

function skillOffer(hero, rarity) {
  const owned = new Set(hero.skills.map(s => s.id));
  let pool = Object.keys(C.SKILLS).filter(id => C.SKILLS[id].rarity === rarity && !owned.has(id));
  if (!pool.length) pool = Object.keys(C.SKILLS).filter(id => !owned.has(id));
  return { id: pick(pool), lvl: 1 };
}

function makeTreasureRoom(run, kind) {
  const weights = CHEST_WEIGHTS[kind] || CHEST_WEIGHTS.treasure;
  const chests = {};
  for (const h of Object.values(run.heroes)) {
    const rarity = rollRarity(weights);
    chests[h.id] = { rarity, opened: false, offer: skillOffer(h, rarity), gold: ri(15, 30) + (kind === 'elite' ? 15 : 0), decided: false };
  }
  return { type: 'treasure', kind, chests, ready: {} };
}

function makeMerchantRoom(run) {
  const stock = {};
  for (const h of Object.values(run.heroes)) {
    const items = [];
    const used = new Set(h.skills.map(s => s.id));
    for (const rarity of shuffle(['common', 'rare', rollRarity({ rare: 50, epic: 40, legendary: 10 })])) {
      let pool = Object.keys(C.SKILLS).filter(id => C.SKILLS[id].rarity === rarity && !used.has(id));
      if (!pool.length) continue;
      const id = pick(pool); used.add(id);
      items.push({ id, lvl: 1, price: C.RARITY[rarity].price + ri(-5, 5), sold: false });
    }
    stock[h.id] = { items, mend: { price: 30, sold: false } };
  }
  return { type: 'merchant', stock, ready: {} };
}

function makeRestRoom() { return { type: 'rest', choices: {}, ready: {} }; }

function makeEventRoom(run) {
  const r = Math.random();
  if (r < 0.4) return { type: 'event', event: 'ambush' };
  if (r < 0.7) return { type: 'event', event: 'shrine', results: {}, ready: {} };
  return { ...makeTreasureRoom(run, 'cache'), event: 'cache' };
}

module.exports = { generateMap, makeTreasureRoom, makeMerchantRoom, makeRestRoom, makeEventRoom, skillOffer, ri, pick, shuffle };
