// Unit test for every skill and item: runs each one through the real combat rules on a small fight
// and checks the numbers it promises. Run: node test/skills.test.js
const assert = require('assert');
const C = require('../shared/content');
const CB = require('../server/combat');
const RUN = require('../server/run');

let failures = 0, checks = 0;
function check(name, fn) {
  try { fn(); checks++; } catch (e) { failures++; console.log('FAIL', name, '-', e.message); }
}

// A fight: the caster (h1) plus an ally (h2, hurt), against a goblin (e1), a slime (e2) and a skeleton (e3).
function fight(cls, opts = {}) {
  const run = { heroes: {}, floor: 1, depth: 1, asc: 0, activeCount: 2 };
  const hero = (id, c) => ({ id, name: id, cls: c, skills: [], items: [], maxHp: C.HEROES[c].hp, hp: C.HEROES[c].hp, block: 0, st: {}, focus: 0, energy: 10, lv: { atk: 0, def: 0, hp: 0 }, stats: { dmg: 0, heal: 0, taken: 0, skills: 0 } });
  run.heroes.h1 = hero('h1', cls); run.heroes.h2 = hero('h2', opts.allyCls || 'knight');
  run.heroes.h2.hp = 20;
  run.combat = { enemies: [], round: 1, phase: 'player', nextId: 0, type: 'normal1', mult: { hp: 1, dmg: 1 } };
  const mk = (id, kind, hp) => ({ id, kind, name: kind, size: 's', tier: opts.boss && id === 'e1' ? 'boss' : 'normal', hp, maxHp: hp, block: 0, st: {}, dead: false, intent: null, mem: {}, dmgMult: 1 });
  run.combat.enemies.push(mk('e1', 'goblin', 200), mk('e2', 'slime', 200), mk('e3', 'skeleton', 200));
  for (const h of Object.values(run.heroes)) { h.energy = 10; }
  return run;
}
function cast(run, id, target, setup) {
  const h = run.heroes.h1;
  h.skills = [{ id, lvl: 1 }];
  if (setup) setup(run);
  const out = [];
  const res = CB.heroAction(run, h, 'skill0', target, out);
  return { res, ev: out[0], h, e: run.combat.enemies, ally: run.heroes.h2 };
}
const dmgTo = (ev, id) => ev.targets.filter(t => t.id === id && t.dmg != null).reduce((a, t) => a + t.dmg, 0);

// ---------------------------------------------------------------- content rules
check('every class has 8 common, 5 rare, 3+ legendary', () => {
  for (const cls of C.HERO_ORDER) {
    const by = {}; for (const id of C.classSkills(cls)) by[C.SKILLS[id].rarity] = (by[C.SKILLS[id].rarity] || 0) + 1;
    assert.deepStrictEqual([by.common, by.rare], [8, 5], cls);
    assert.ok(by.legendary >= 3, cls);
  }
});
check('legendaries cost at least 8, the combo 9', () => {
  for (const [id, s] of Object.entries(C.SKILLS)) if (s.rarity === 'legendary') assert.ok(s.cost >= 8, id);
  assert.strictEqual(C.SKILLS.champions_combo.cost, 9);
});
check('odds are 60 / 30 / 10', () => assert.deepStrictEqual(C.RARITY_ORDER.map(r => C.RARITY[r].weight), [60, 30, 10]));

// ---------------------------------------------------------------- every skill runs
for (const [id, s] of Object.entries(C.SKILLS)) {
  check('runs: ' + id, () => {
    const run = fight(s.cls);
    const { res, ev, h } = cast(run, id, s.target === 'ally' ? 'h2' : 'e1');
    assert.ok(res.ok, res.msg);
    assert.ok(ev && ev.targets.length, 'no targets');
    assert.strictEqual(h.energy, 10 - s.cost, 'energy');
    for (const t of ev.targets) for (const k of ['dmg', 'heal', 'block']) if (t[k] != null) assert.ok(Number.isFinite(t[k]) && t[k] >= 0, k + ' ' + t[k]);
    assert.ok(!/undefined|NaN/.test(C.skillDesc(id, 1) + C.skillDesc(id, 2)), 'description');
  });
}

// ---------------------------------------------------------------- the numbers each skill promises
check('Champion\'s Combo: 3 x 6 then 22', () => { const { ev } = cast(fight('knight'), 'champions_combo', 'e1'); assert.deepStrictEqual(ev.targets.map(t => t.dmg), [6, 6, 6, 22]); });
check('Combo moves on when the target falls', () => { const { ev } = cast(fight('knight'), 'champions_combo', 'e1', r => { r.combat.enemies[0].hp = 10; }); assert.deepStrictEqual(ev.targets.map(t => t.id), ['e1', 'e1', 'e2', 'e2']); });
check('Cleave hits the target and the one beside it', () => { const { ev } = cast(fight('knight'), 'cleave', 'e2'); assert.deepStrictEqual(ev.targets.map(t => t.id).sort(), ['e2', 'e3']); });
check('Sunder strips block', () => { const { ev } = cast(fight('knight'), 'sunder', 'e1', r => { r.combat.enemies[0].block = 30; }); assert.strictEqual(dmgTo(ev, 'e1'), 7); });
check('Shield Slam adds block', () => { const { ev } = cast(fight('knight'), 'shield_slam', 'e1', r => { r.heroes.h1.block = 9; }); assert.strictEqual(dmgTo(ev, 'e1'), 15); });
check('Iron Skin block survives the next round start', () => {
  const run = fight('knight'); const { h } = cast(run, 'iron_skin', null);
  CB.enemyTurn(run); assert.strictEqual(h.block, 12, 'after enemy turn (no attacks planned)');
  CB.beginRound(run, Date.now(), 0); assert.strictEqual(h.block, 12, 'kept into round 2');
  CB.enemyTurn(run); CB.beginRound(run, Date.now(), 0); assert.strictEqual(h.block, 0, 'gone in round 3');
});
check('Riposte hits the attacker back', () => {
  const run = fight('knight'); cast(run, 'riposte', null);
  run.combat.enemies.forEach(e => { e.intent = { move: 'stab', type: 'attack', dmg: 4, target: 'h1' }; });
  const evs = CB.enemyTurn(run);
  const back = evs.filter(e => e.kind === 'enemy').map(e => e.targets[0].thorns);
  assert.deepStrictEqual(back, [6, 6, 6]);
});
check('Unbreakable: taunts, halves damage, cannot fall', () => {
  const run = fight('knight'); const { h } = cast(run, 'unbreakable', null);
  h.hp = 5; h.block = 0;
  run.combat.enemies.forEach(e => { e.intent = { move: 'stab', type: 'attack', dmg: 20, target: 'h2' }; });
  const evs = CB.enemyTurn(run);
  assert.ok(evs.filter(e => e.kind === 'enemy').every(e => e.targets[0].id === 'h1'), 'all hit the knight');
  assert.strictEqual(h.hp, 1); assert.ok(!h.downed);
});
check('Earthshatter: 16 to all and Weak', () => { const { ev, e } = cast(fight('knight'), 'earthshatter', null); assert.strictEqual(dmgTo(ev, 'e3'), 16); assert.ok(e.every(x => x.st.weak)); });
check('Arcane Missiles: 3 x 4', () => { const { ev } = cast(fight('mage'), 'arcane_missiles', null); assert.deepStrictEqual(ev.targets.map(t => t.dmg), [4, 4, 4]); });
check('Kindle doubles Burn', () => { const { e } = cast(fight('mage'), 'kindle', 'e1', r => { r.combat.enemies[0].st.burn = { v: 4, t: 1 }; }); assert.strictEqual(e[0].st.burn.v, 8); });
check('Frostbite freezes a chilled enemy', () => { const { e } = cast(fight('mage'), 'frostbite', 'e1', r => { r.combat.enemies[0].st.chill = { t: 1 }; }); assert.ok(e[0].st.freeze); });
check('Frostbite only chills a boss', () => { const { e } = cast(fight('mage', { boss: true }), 'frostbite', 'e1', r => { r.combat.enemies[0].st.chill = { t: 1 }; }); assert.ok(!e[0].st.freeze && e[0].st.chill); });
check('Mana Surge makes the next skill free', () => {
  const run = fight('mage'); cast(run, 'mana_surge', null);
  const h = run.heroes.h1; h.energy = 0; h.acted = false;
  const r = cast(run, 'meteor', null); assert.ok(r.res.ok, r.res.msg); assert.strictEqual(h.energy, 0); assert.ok(!h.st.surge);
});
check('Combust explodes on a burning target', () => { const { ev } = cast(fight('mage'), 'combust', 'e1', r => { r.combat.enemies[0].st.burn = { v: 2, t: 2 }; }); assert.strictEqual(dmgTo(ev, 'e2'), 8); });
check('Combust does not explode otherwise', () => { const { ev } = cast(fight('mage'), 'combust', 'e1'); assert.strictEqual(dmgTo(ev, 'e2'), 0); });
check('Time Stop freezes all', () => { const { e } = cast(fight('mage'), 'time_stop', null); assert.ok(e.every(x => x.st.freeze)); });
check('Aimed Shot: +6 with Focus', () => {
  const r1 = cast(fight('ranger'), 'aimed_shot', 'e1'); assert.strictEqual(dmgTo(r1.ev, 'e1'), 12);
  const r2 = cast(fight('ranger'), 'aimed_shot', 'e1', r => { r.heroes.h1.focus = 1; }); assert.strictEqual(dmgTo(r2.ev, 'e1'), Math.round(18 * 1.3));
});
check("Hunter's Mark adds 3 to every hero hit", () => {
  const run = fight('ranger'); cast(run, 'hunters_mark', 'e1');
  const out = []; run.heroes.h2.acted = false; CB.heroAction(run, run.heroes.h2, 'attack', 'e1', out);
  assert.strictEqual(out[0].targets[0].dmg, C.HEROES.knight.attack.dmg + 3);
});
check('Pinning Shot stuns: the enemy skips its turn', () => {
  const run = fight('ranger'); cast(run, 'pinning_shot', 'e1');
  run.combat.enemies.forEach(e => { e.intent = { move: 'stab', type: 'attack', dmg: 4, target: 'h2' }; });
  const evs = CB.enemyTurn(run); assert.strictEqual(evs.find(x => x.actor === 'e1').name, 'Stunned');
});
check('Ricochet: 10, 7, 5 on different enemies', () => { const { ev } = cast(fight('ranger'), 'ricochet', 'e1'); assert.deepStrictEqual(ev.targets.map(t => t.dmg), [10, 7, 5]); assert.notStrictEqual(ev.targets[0].id, ev.targets[1].id); });
check('Arrow Rain: two waves', () => { const { ev } = cast(fight('ranger'), 'arrow_rain', null); assert.strictEqual(ev.targets.length, 6); });
check('Phantom Volley: 6 arrows with poison', () => { const { ev, e } = cast(fight('ranger'), 'phantom_volley', null); assert.strictEqual(ev.targets.filter(t => t.dmg != null).length, 6); assert.strictEqual(e.reduce((a, x) => a + (x.st.poison ? x.st.poison.v : 0), 0), 12); });
check('Deadeye: a 20-damage crit on every enemy', () => { const { ev } = cast(fight('ranger'), 'deadeye', null); for (const id of ['e1', 'e2', 'e3']) assert.strictEqual(dmgTo(ev, id), 20); assert.ok(ev.targets.filter(t => t.dmg != null).every(t => t.crit)); });
check('Judgement doubles on undead', () => { const { ev } = cast(fight('cleric'), 'judgement', 'e3'); assert.strictEqual(dmgTo(ev, 'e3'), 24); });
check('Prayer of Mending heals again after the enemy turn', () => {
  const run = fight('cleric'); cast(run, 'prayer_of_mending', 'h2');
  assert.strictEqual(run.heroes.h2.hp, 26);
  const evs = CB.enemyTurn(run); assert.ok(evs.some(x => x.fx === 'regen')); assert.strictEqual(run.heroes.h2.hp, 32); assert.ok(!run.heroes.h2.st.regen);
});
check('Purify clears Weak and Vulnerable', () => { const { ally } = cast(fight('cleric'), 'purify', 'h2', r => { r.heroes.h2.st = { weak: { t: 2 }, vuln: { t: 2 } }; }); assert.deepStrictEqual(Object.keys(ally.st), []); });
check('Sacred Flame heals the most hurt by the damage', () => { const { ally } = cast(fight('cleric'), 'sacred_flame', 'e1'); assert.strictEqual(ally.hp, 31); });
check('Resurrection revives the fallen', () => { const { ally } = cast(fight('cleric'), 'resurrection', null, r => { Object.assign(r.heroes.h2, { downed: true, hp: 0 }); }); assert.ok(!ally.downed); assert.strictEqual(ally.hp, Math.round(ally.maxHp * 0.5)); });
check('Divine Shield: no damage this round', () => {
  const run = fight('cleric'); cast(run, 'divine_shield', null);
  run.combat.enemies.forEach(e => { e.intent = { move: 'stab', type: 'attackAll', dmg: 30 }; });
  CB.enemyTurn(run); assert.strictEqual(run.heroes.h2.hp, 20); assert.strictEqual(run.heroes.h1.hp, C.HEROES.cleric.hp);
});
check('Divine Shield clears Weak and Vulnerable from every hero', () => { const run = fight('cleric'); cast(run, 'divine_shield', null, r => { r.heroes.h2.st = { weak: { t: 2 }, vuln: { t: 2 } }; r.heroes.h1.st = { weak: { t: 1 } }; }); assert.deepStrictEqual(Object.keys(run.heroes.h2.st), ['divine']); assert.deepStrictEqual(Object.keys(run.heroes.h1.st), ['divine']); });

// ---------------------------------------------------------------- items
const withItems = (cls, items) => { const run = fight(cls); for (const id of items) RUN.giveItem(run.heroes.h1, id); return run; };
check("Sage's Crown: skills cost 1 less", () => { const run = withItems('knight', ['sages_crown']); cast(run, 'champions_combo', 'e1'); assert.strictEqual(run.heroes.h1.energy, 2); });
check('Whetstone: +2 on the basic attack', () => { const run = withItems('knight', ['whetstone']); const out = []; CB.heroAction(run, run.heroes.h1, 'attack', 'e1', out); assert.strictEqual(out[0].targets[0].dmg, 10); });
check('Focus Lens: +45% per Focus', () => { const run = withItems('knight', ['focus_lens']); run.heroes.h1.focus = 2; const out = []; CB.heroAction(run, run.heroes.h1, 'attack', 'e1', out); assert.strictEqual(out[0].targets[0].dmg, Math.round(8 * 1.9)); });
check('Thorned Mail hits back for 3', () => {
  const run = withItems('knight', ['thorned_mail']);
  run.combat.enemies.forEach(e => { e.intent = { move: 'stab', type: 'attack', dmg: 4, target: 'h1' }; });
  const evs = CB.enemyTurn(run); assert.ok(evs.filter(x => x.kind === 'enemy').every(x => x.targets[0].thorns === 3));
});
check('Vampire Fang heals 2 on a hit', () => { const run = withItems('knight', ['vampire_fang']); run.heroes.h1.hp = 30; const out = []; CB.heroAction(run, run.heroes.h1, 'attack', 'e1', out); assert.strictEqual(run.heroes.h1.hp, 32); });
check("Healer's Satchel: +30% healing", () => { const run = fight('cleric'); RUN.giveItem(run.heroes.h2, 'healers_satchel'); cast(run, 'healing_light', 'h2'); assert.strictEqual(run.heroes.h2.hp, 20 + Math.round(13 * 1.3)); });
check('Spare Potion: heals 10 once below 25%', () => {
  const run = withItems('knight', ['spare_potion']); const h = run.heroes.h1; h.hp = 14;
  run.combat.enemies.forEach(e => { e.intent = { move: 'stab', type: 'attack', dmg: 4, target: 'h1' }; });
  CB.enemyTurn(run); assert.strictEqual(h.hp, 14 - 4 + 10 - 4 - 4); assert.ok(h.potionUsed);
});
check('Phoenix Plume: back up once per run', () => {
  const run = withItems('knight', ['phoenix_plume']); const h = run.heroes.h1; h.hp = 3;
  run.combat.enemies = run.combat.enemies.slice(0, 1); run.combat.enemies[0].intent = { move: 'stab', type: 'attack', dmg: 10, target: 'h1' };
  CB.enemyTurn(run); assert.ok(!h.downed); assert.strictEqual(h.hp, 24); assert.ok(h.plumeUsed);
});
check("Troll's Belt: +10 max HP", () => { const run = withItems('knight', ['trolls_belt']); assert.strictEqual(run.heroes.h1.maxHp, 58); });
check('Energy Crystal and Sturdy Boots at the start of a fight', () => {
  const run = withItems('knight', ['energy_crystal', 'sturdy_boots']); delete run.combat;
  run.combat = CB.createCombat(run, 'normal1'); CB.beginRound(run, Date.now(), 0);
  assert.strictEqual(run.heroes.h1.energy, C.ENERGY.start + 2); assert.strictEqual(run.heroes.h1.block, 5);
});

// ---------------------------------------------------------------- loot
check('chests and shops only offer the hero\'s own class', () => {
  const h = { cls: 'ranger', skills: [{ id: 'poison_arrow' }, { id: 'volley' }], items: [] };
  for (let i = 0; i < 200; i++) { const o = RUN.skillOffer(h, C.RARITY_ORDER[i % 3]); assert.strictEqual(C.SKILLS[o.id].cls, 'ranger'); assert.ok(!['poison_arrow', 'volley'].includes(o.id)); }
});
check('rarity odds roll close to 60 / 30 / 10', () => {
  const n = { common: 0, rare: 0, legendary: 0 }; const run = { heroes: {} };
  for (let i = 0; i < 400; i++) run.heroes['p' + i] = { id: 'p' + i, cls: 'mage', skills: [], items: [] };
  const room = RUN.makeTreasureRoom(run, 'treasure'); for (const ch of Object.values(room.chests)) n[ch.rarity]++;
  assert.ok(Math.abs(n.common / 400 - 0.6) < 0.08 && Math.abs(n.rare / 400 - 0.3) < 0.08 && Math.abs(n.legendary / 400 - 0.1) < 0.06, JSON.stringify(n));
});
check('shop slots roll legendary about 10% of the time', () => {
  let leg = 0, all = 0;
  for (let i = 0; i < 300; i++) { const st = RUN.makeMerchantRoom({ heroes: { a: { id: 'a', cls: 'knight', skills: [], items: [] } } }).stock.a;
    for (const x of st.skills) { all++; if (C.SKILLS[x.id].rarity === 'legendary') leg++; } for (const x of st.items) { all++; if (C.ITEMS[x.id].rarity === 'legendary') leg++; } }
  assert.ok(Math.abs(leg / all - 0.1) < 0.04, leg + '/' + all);
});
check('after an act boss every hero gets a legendary chest with one legendary skill of their class', () => {
  const run = { heroes: { a: { id: 'a', cls: 'mage', skills: [{ id: 'fireball' }, { id: 'meteor' }], items: [] }, b: { id: 'b', cls: 'knight', skills: [], items: [] } } };
  for (let i = 0; i < 50; i++) {
    const room = RUN.makeTreasureRoom(run, 'boss');
    assert.strictEqual(room.kind, 'boss');
    for (const [id, ch] of Object.entries(room.chests)) {
      assert.strictEqual(ch.rarity, 'legendary');
      const sk = C.SKILLS[ch.skill.id]; assert.strictEqual(sk.rarity, 'legendary'); assert.strictEqual(sk.cls, run.heroes[id].cls);
      assert.notStrictEqual(ch.skill.id, 'meteor');
    }
  }
});
check('merchant stocks 2 skills and 2 items', () => { const room = RUN.makeMerchantRoom({ heroes: { a: { id: 'a', cls: 'cleric', skills: [], items: [] } } }); assert.strictEqual(room.stock.a.skills.length, 2); assert.strictEqual(room.stock.a.items.length, 2); });
check('a third skill goes in the free slot; a fourth must replace one', () => {
  const h = { skills: [{ id: 'fireball', lvl: 1 }, { id: 'ice_shard', lvl: 1 }] };
  assert.strictEqual(RUN.giveSkill(h, { id: 'spark' }), ''); assert.strictEqual(h.skills.length, 3);
  assert.strictEqual(RUN.giveSkill(h, { id: 'meteor' }), null);
  assert.strictEqual(RUN.giveSkill(h, { id: 'meteor' }, 0), 'fireball'); assert.strictEqual(h.skills[0].id, 'meteor');
});

console.log(`${checks} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
