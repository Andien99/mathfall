// Writes public/dev/skill-events.json: one real hero event per skill, made by the server's combat rules, so the
// Animation Lab (/dev/lab.html) replays exactly what a game would send. Run: node tools/skill_events.js
// The lab's scene uses heroes h1 (you), h2 (hurt ally), h3, h4 and enemies e1 (picked in the lab), e2 (a slime).
const fs = require('fs');
const path = require('path');
const C = require('../shared/content');
const CB = require('../server/combat');

// a few skills show their best case: a burning, poisoned or chilled target, a fallen ally
const SETUP = {
  combust: r => { r.combat.enemies[0].st.burn = { v: 3, t: 2 }; },
  kindle: r => { r.combat.enemies[0].st.burn = { v: 3, t: 2 }; },
  shadow_strike: r => { r.combat.enemies[0].st.poison = { v: 3 }; },
  frostbite: r => { r.combat.enemies[0].st.chill = { t: 1 }; },
  resurrection: r => { Object.assign(r.heroes.h2, { downed: true, hp: 0 }); },
  phoenix_feather: r => { Object.assign(r.heroes.h2, { downed: true, hp: 0 }); },
  shield_slam: r => { r.heroes.h1.block = 8; },
  sunder: r => { r.combat.enemies[0].block = 6; },
  purify: r => { r.heroes.h2.st.weak = { t: 2 }; },
  divine_shield: r => { r.heroes.h2.st.weak = { t: 2 }; r.heroes.h3.st.vuln = { t: 2 }; },
  aimed_shot: r => { r.heroes.h1.focus = 1; }
};
const out = {};
for (const [id, s] of Object.entries(C.SKILLS)) {
  const run = { heroes: {}, floor: 1, depth: 1, asc: 0, activeCount: 4 };
  const mk = (hid, cls, hp) => ({ id: hid, name: hid, cls, skills: [], items: [], maxHp: C.HEROES[cls].hp, hp: hp || C.HEROES[cls].hp, block: 0, st: {}, focus: 0, energy: 10, lv: { atk: 0, def: 0, hp: 0 }, stats: { dmg: 0, heal: 0, taken: 0, skills: 0 } });
  run.heroes.h1 = mk('h1', s.cls); run.heroes.h2 = mk('h2', s.cls === 'knight' ? 'cleric' : 'knight', 20);
  run.heroes.h3 = mk('h3', 'mage', 30); run.heroes.h4 = mk('h4', 'ranger', 30);
  const en = (eid, kind, hp) => ({ id: eid, kind, name: kind, size: 's', tier: 'normal', hp, maxHp: hp, block: 0, st: {}, dead: false, intent: null, mem: {}, dmgMult: 1 });
  run.combat = { enemies: [en('e1', 'goblin', 90), en('e2', 'slime', 24)], round: 1, phase: 'player', nextId: 2, type: 'normal1', mult: { hp: 1, dmg: 1 } };
  if (SETUP[id]) SETUP[id](run);
  run.heroes.h1.skills = [{ id, lvl: 1 }];
  const evs = [];
  const res = CB.heroAction(run, run.heroes.h1, 'skill0', s.target === 'ally' ? 'h2' : 'e1', evs);
  if (!res.ok) throw new Error(id + ': ' + res.msg);
  const ev = evs[0];
  for (const t of ev.targets) if (t.killed && t.id === 'e1') { t.killed = false; ev.after.e1.dead = false; ev.after.e1.hp = 1; }   // keep the lab's target standing
  out[id] = ev;
}
fs.writeFileSync(path.join(__dirname, '..', 'public', 'dev', 'skill-events.json'), JSON.stringify(out));
console.log('wrote', Object.keys(out).length, 'skill events');
