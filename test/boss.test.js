// Boss health follows the team: party size and the damage rate it has shown in earlier fights.
// Run: node test/boss.test.js
const assert = require('assert');
const C = require('../shared/content');
const CB = require('../server/combat');

let failures = 0, checks = 0;
function check(name, fn) {
  try { fn(); checks++; } catch (e) { failures++; console.log('FAIL', name, '-', e.message); }
}
function run(size, opts = {}) {
  const heroes = {};
  for (let i = 0; i < size; i++) heroes['h' + i] = { id: 'h' + i, cls: 'knight', skills: [], items: [], maxHp: 48, hp: 48, st: {}, lv: {}, stats: { dmg: 0 } };
  return { heroes, asc: opts.asc || 0, depth: 5, floor: 9, length: opts.length || 'standard', activeCount: size, pace: null };
}
const bossHp = r => CB.createCombat(r, 'boss').enemies.find(e => e.tier === 'boss').maxHp;
const minute = 60000;

check('no pace yet: health is linear in party size', () => {
  const four = bossHp(run(4)), three = bossHp(run(3)), two = bossHp(run(2));
  assert.ok(Math.abs(three / four - 0.75) < 0.02, `3/4 = ${three}/${four}`);
  assert.ok(Math.abs(two / four - 0.5) < 0.02, `2/4 = ${two}/${four}`);
});

check('one short fight is not enough to judge pace', () => {
  const r = run(3); CB.recordPace(r, 60, 0.5 * minute, 3);
  assert.strictEqual(CB.pacePerHero(r), 0);
  assert.strictEqual(bossHp(r), bossHp(run(3)));
});

check('a slow team gets a smaller boss', () => {
  const r = run(3);
  for (let i = 0; i < 4; i++) CB.recordPace(r, 3 * 12, minute, 3);   // 12 damage per hero per minute
  const hp = bossHp(r), base = bossHp(run(3));
  assert.ok(hp < base * 0.8, `${hp} vs ${base}`);
  assert.ok(hp >= Math.round(base * 0.5) - 1, 'never below half');
  const mins = hp / (3 * 12);
  assert.ok(mins < 4.5, `about ${mins.toFixed(1)} min of fighting`);
});

check('a fast team gets a bigger boss, capped at +15%', () => {
  const r = run(4);
  for (let i = 0; i < 4; i++) CB.recordPace(r, 4 * 80, minute, 4);
  const hp = bossHp(r), base = bossHp(run(4));
  assert.ok(hp > base, `${hp} vs ${base}`);
  assert.ok(hp <= Math.round(base * 1.15) + 1, 'capped');
});

check('pace is per hero, so it carries over if the party changes size', () => {
  const a = run(4), b = run(3);
  for (let i = 0; i < 4; i++) { CB.recordPace(a, 4 * 20, minute, 4); CB.recordPace(b, 4 * 20 * 3 / 4, minute, 4); }
  b.pace = { ...a.pace }; b.activeCount = 3;
  const ha = bossHp(a), hb = bossHp(b);
  assert.ok(Math.abs(hb / ha - 0.75) < 0.03, `${hb}/${ha}`);
});

check('recent fights count more than early ones', () => {
  const r = run(4);
  CB.recordPace(r, 4 * 10, minute, 4); CB.recordPace(r, 4 * 10, minute, 4);
  const early = CB.pacePerHero(r);
  CB.recordPace(r, 4 * 40, minute, 4); CB.recordPace(r, 4 * 40, minute, 4);
  const later = CB.pacePerHero(r) * minute;
  assert.ok(later > 25, `pace ${later.toFixed(1)}/min after improving (was ${(early * minute).toFixed(1)})`);
});

check('a hero leaving mid-fight scales the boss, keeping the bar fraction', () => {
  const r = run(4); const c = CB.createCombat(r, 'boss');
  const b = c.enemies.find(e => e.tier === 'boss');
  b.hp = Math.round(b.maxHp * 0.6); const max = b.maxHp;
  CB.rescaleBoss(c, 3);
  assert.ok(Math.abs(b.maxHp / max - 0.75) < 0.02);
  assert.ok(Math.abs(b.hp / b.maxHp - 0.6) < 0.02);
  CB.rescaleBoss(c, 4);
  assert.ok(Math.abs(b.maxHp - max) <= 2, 'back to full size');
});

check('normal fights are unchanged', () => {
  const r = run(4); const c = CB.createCombat(r, 'normal1');
  for (const e of c.enemies) assert.strictEqual(e.maxHp, Math.max(6, Math.round(C.ENEMIES[e.kind].hp * 1.0 * 1.32)));
});

console.log(`boss health: ${checks} passed, ${failures} failed`);
if (failures) process.exit(1);
