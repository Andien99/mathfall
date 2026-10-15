// Combat rules: simultaneous rounds, hero actions, enemy intents, statuses, the boss.
const C = require('../shared/content');

const MS = { hero: 1000, enemy: 1100, tick: 500, small: 650 };
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;

// ---------------------------------------------------------------- helpers
function aliveEnemies(c) { return c.enemies.filter(e => !e.dead); }
function heroList(run) { return Object.values(run.heroes); }
function aliveHeroes(run) { return heroList(run).filter(h => !h.downed); }
function st(ent, k) { return ent.st[k]; }
function addStatus(ent, k, v) {
  const cur = ent.st[k];
  if (k === 'poison') ent.st.poison = { v: (cur ? cur.v : 0) + v.v };
  else if (k === 'burn') ent.st.burn = { v: Math.max(cur ? cur.v : 0, v.v), t: Math.max(cur ? cur.t : 0, v.t) };
  else if (k === 'str') ent.st.str = { v: (cur ? cur.v : 0) + v.v, t: Math.max(cur ? cur.t : 0, v.t || 99) };
  else ent.st[k] = { t: Math.max(cur ? cur.t : 0, v.t || 1) };
}
function gainEnergy(hero, n, ev) {
  const before = hero.energy || 0;
  hero.energy = Math.min(C.ENERGY.max, before + n);
  if (ev) ev.energy = hero.energy - before;
}
function snapEnt(e) {
  const o = { hp: e.hp, maxHp: e.maxHp, block: e.block, st: JSON.parse(JSON.stringify(e.st)) };
  if ('energy' in e) o.energy = e.energy;
  if ('downed' in e) o.downed = e.downed; else o.dead = !!e.dead;
  return o;
}
function lowestHero(run, includeDowned) {
  const list = heroList(run).filter(h => includeDowned || !h.downed);
  list.sort((a, b) => (a.downed - b.downed) || (a.hp / a.maxHp) - (b.hp / b.maxHp));
  return list[0];
}

// Damage from hero to enemy (or enemy to hero).
function hitEnemy(src, e, base, opts = {}) {
  let d = base + (opts.noStr ? 0 : (src && src.st.str ? src.st.str.v : 0));
  if (src && src.st.weak) d *= 0.75;
  if (e.st.vuln) d *= 1.5;
  d = Math.max(0, Math.round(d));
  const blocked = Math.min(e.block, d);
  e.block -= blocked;
  const dmg = d - blocked;
  e.hp = Math.max(0, e.hp - dmg);
  const killed = e.hp <= 0 && !e.dead;
  if (killed) { e.dead = true; e.block = 0; }
  if (src && src.stats) src.stats.dmg += dmg;
  return { id: e.id, dmg, blocked, killed };
}
function hitHero(e, h, base, opts = {}) {
  let d = base + (opts.noStr ? 0 : (e && e.st && e.st.str ? e.st.str.v : 0));
  if (e && e.st && e.st.weak) d *= 0.75;
  if (opts.chilled) d *= 0.5;
  if (h.st.vuln) d *= 1.5;
  d = Math.max(0, Math.round(d));
  const blocked = Math.min(h.block, d);
  h.block -= blocked;
  const dmg = d - blocked;
  h.hp = Math.max(0, h.hp - dmg);
  let downed = false;
  if (h.hp <= 0 && !h.downed) { h.downed = true; h.block = 0; h.st = {}; downed = true; h.focus = 0; }
  if (h.stats) h.stats.taken += dmg;
  return { id: h.id, dmg, blocked, downed };
}
function healHero(src, h, amt) {
  if (h.downed) return { id: h.id, heal: 0 };
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + Math.round(amt));
  const heal = h.hp - before;
  if (src && src.stats) src.stats.heal += heal;
  return { id: h.id, heal };
}
function blockHero(h, amt) {
  if (h.downed) return { id: h.id, block: 0 };
  const v = Math.round(amt);
  h.block += v;
  return { id: h.id, block: v };
}

// ---------------------------------------------------------------- creation
const ENCOUNTERS = {
  normal1: [['slime', 'slime'], ['goblin', 'slime'], ['skeleton'], ['goblin', 'goblin']],
  normal2: [['skeleton', 'goblin'], ['hexer', 'skeleton'], ['slime', 'goblin', 'slime'], ['hexer', 'goblin', 'goblin']],
  elite: [['sentinel']],
  boss: [['wyrm']]
};

function makeEnemy(c, kind, mult) {
  const def = C.ENEMIES[kind];
  const hp = Math.max(6, Math.round(def.hp * mult.hp));
  return { id: 'e' + (++c.nextId), kind, name: def.name, size: def.size, tier: def.kind, hp, maxHp: hp, block: 0, st: {}, dead: false, intent: null, mem: {}, dmgMult: mult.dmg };
}

function createCombat(run, encounterType) {
  const size = Math.max(1, heroList(run).length);
  const partyMult = 0.25 + 0.1875 * size;
  const depth = run.depth || run.floor || 1;
  const floorMult = 1 + 0.08 * Math.max(0, depth - 1);
  const ascMult = 1 + 0.15 * (run.asc || 0);
  const mult = { hp: partyMult * floorMult * ascMult, dmg: (1 + 0.06 * Math.max(0, depth - 1)) * (1 + 0.12 * (run.asc || 0)) };
  const c = { enemies: [], round: 0, phase: 'player', roundEndsAt: 0, phaseEndsAt: 0, nextId: 0, type: encounterType, mult, events: 0 };
  const kinds = pick(ENCOUNTERS[encounterType] || ENCOUNTERS.normal1);
  for (const k of kinds) c.enemies.push(makeEnemy(c, k, mult));
  for (const h of heroList(run)) {
    h.block = 0; h.st = {}; h.acted = false; h.readyAction = null; h.focus = h.focus || 0;
    h.energy = C.ENERGY.start;
  }
  return c;
}

// ---------------------------------------------------------------- enemy AI
const AI = {
  slime(e) { return chance(0.6) ? { move: 'slam', type: 'attack', dmg: 6, label: 'Slam' } : { move: 'spit', type: 'attack', dmg: 4, status: 'weak', label: 'Acid Spit (Weak)' }; },
  goblin(e) { return chance(0.6) ? { move: 'stab', type: 'attack', dmg: 7, label: 'Stab' } : { move: 'twin', type: 'attack', dmg: 3, hits: 2, label: 'Twin Knives' }; },
  skeleton(e) {
    if (e.mem.last === 'raise') return { move: 'cleave2', type: 'attack', dmg: 11, label: 'Shield Charge' };
    return chance(0.65) ? { move: 'cleave', type: 'attack', dmg: 8, label: 'Bone Cleave' } : { move: 'raise', type: 'block', block: 8, label: 'Raise Shield' };
  },
  hexer(e, c) {
    const hurt = aliveEnemies(c).filter(o => o !== e && o.hp < o.maxHp * 0.7);
    if (hurt.length && chance(0.6)) return { move: 'mend', type: 'heal', heal: 8, ally: hurt[0].id, label: `Mend ${hurt[0].name}` };
    return chance(0.4) ? { move: 'hex', type: 'debuff', status: 'vuln', label: 'Hex (Vulnerable)' } : { move: 'bolt', type: 'attack', dmg: 6, label: 'Shadow Bolt' };
  },
  sentinel(e) {
    const cycle = ['bash', 'fortify', 'charge', 'crush'];
    if (e.mem.i == null) e.mem.i = ri(0, 1);
    const m = cycle[e.mem.i % 4]; e.mem.i++;
    if (m === 'bash') return { move: 'bash', type: 'attack', dmg: 10, label: 'Shield Bash' };
    if (m === 'fortify') return { move: 'fortify', type: 'block', block: 14, label: 'Fortify' };
    if (m === 'charge') return { move: 'charge', type: 'charge', label: 'Winding up…', warn: 'Crushing Blow next round' };
    return { move: 'crush', type: 'attack', dmg: 22, label: 'Crushing Blow', keepTarget: true };
  },
  shard() { return { move: 'zap', type: 'attack', dmg: 4, label: 'Crystal Zap' }; },
  wyrm(e, c) {
    const m = e.mem;
    if (m.phase == null) { m.phase = 1; m.i = ri(0, 2); }
    if (m.phase === 1 && e.hp <= e.maxHp * 0.5) { m.phase = 2; m.step = 'summon'; }
    if (m.phase === 2) {
      const shardsAlive = aliveEnemies(c).filter(x => x.kind === 'shard').length;
      if (m.step === 'summon') { m.step = 'charge'; return { move: 'summon', type: 'summon', label: 'Crystal Roar', warn: 'Summons two Crystal Shards' }; }
      if (m.step === 'charge') { m.step = 'storm'; return { move: 'gather', type: 'charge', block: 10, label: 'Gathering power', warn: 'Shatterstorm next round. Break the crystals!' }; }
      if (m.step === 'storm') { m.step = 'rest1'; return { move: 'storm', type: 'attackAll', dmg: 8, perShard: 6, label: 'Shatterstorm', shardsAlive }; }
      if (m.step === 'rest1') { m.step = 'rest2'; return { move: 'bite', type: 'attack', dmg: 15, label: 'Crushing Bite' }; }
      m.step = 'summon';
      return { move: 'breath', type: 'attackAll', dmg: 7, label: 'Crystal Breath' };
    }
    const cycle = ['tail', 'breath', 'harden'];
    const mv = cycle[m.i++ % 3];
    if (mv === 'tail') return { move: 'tail', type: 'attack', dmg: 13, label: 'Tail Sweep' };
    if (mv === 'breath') return { move: 'breath', type: 'attackAll', dmg: 6, label: 'Crystal Breath' };
    return { move: 'harden', type: 'block', block: 16, label: 'Crystal Hide' };
  }
};

function planIntents(run) {
  const c = run.combat;
  const heroes = aliveHeroes(run);
  for (const e of aliveEnemies(c)) {
    const plan = (AI[e.kind] || AI.slime)(e, c);
    const intent = { ...plan };
    if (intent.dmg) intent.dmg = Math.round(intent.dmg * e.dmgMult);
    if (intent.perShard) intent.perShard = Math.round(intent.perShard * e.dmgMult);
    if (intent.heal) intent.heal = Math.round(intent.heal * e.dmgMult);
    if ((intent.type === 'attack' || intent.type === 'debuff' || intent.type === 'charge' && e.kind === 'sentinel') && heroes.length) {
      if (intent.keepTarget && e.mem.chargeTarget && run.heroes[e.mem.chargeTarget] && !run.heroes[e.mem.chargeTarget].downed) intent.target = e.mem.chargeTarget;
      else intent.target = pick(heroes).id;
      if (intent.type === 'charge') e.mem.chargeTarget = intent.target;
    }
    e.intent = intent;
  }
}

// ---------------------------------------------------------------- rounds
function beginRound(run, now, timerSec) {
  const c = run.combat;
  c.round++;
  c.phase = 'player';
  c.roundEndsAt = timerSec > 0 ? now + timerSec * 1000 : 0;
  for (const h of heroList(run)) {
    h.block = 0;
    h.acted = false;
  }
  planIntents(run);
}

function needsToAct(h, player) { return player && player.connected && !h.acted; }

// ---------------------------------------------------------------- hero actions
// Returns { ok, msg } and pushes events into out[]
function heroAction(run, hero, action, targetId, out) {
  const c = run.combat;
  const H = C.HEROES[hero.cls];
  const enemies = aliveEnemies(c);
  if (!enemies.length) return { ok: false, msg: 'The fight is over.' };
  const pickEnemy = () => (targetId && c.enemies.find(e => e.id === targetId && !e.dead)) || enemies.find(e => e.id === hero.lastTarget) || enemies[0];
  const pickAlly = (allowDowned) => {
    const t = targetId && run.heroes[targetId];
    if (t && (allowDowned || !t.downed)) return t;
    return lowestHero(run, allowDowned) || hero;
  };
  const ev = { kind: 'hero', actor: hero.id, act: action, targets: [], after: {} };
  const touched = new Set([hero.id]);
  const done = () => {
    for (const id of touched) {
      const ent = run.heroes[id] || c.enemies.find(e => e.id === id);
      if (ent) ev.after[id] = snapEnt(ent);
    }
    ev.dur = MS.hero;
    out.push(ev);
  };

  if (action === 'rise') {
    if (!hero.downed) return { ok: false, msg: 'You are still standing.' };
    hero.downed = false; hero.hp = Math.max(1, Math.round(hero.maxHp * 0.3));
    ev.fx = 'revive'; ev.name = 'Back on your feet';
    ev.targets.push({ id: hero.id, heal: hero.hp, revived: true });
    hero.acted = true;
    done();
    return { ok: true };
  }
  if (hero.downed) return { ok: false, msg: 'You are knocked out.' };

  const focusMult = 1 + 0.3 * (hero.focus || 0);
  const usedFocus = hero.focus || 0;

  if (action === 'attack') {
    const e = pickEnemy(); hero.lastTarget = e.id;
    ev.fx = { knight: 'slash', mage: 'proj_arcane', ranger: 'proj_arrow', cleric: 'smite' }[hero.cls];
    ev.name = H.attack.name;
    ev.targets.push(hitEnemy(hero, e, H.attack.dmg * focusMult)); touched.add(e.id);
    if (H.attack.heal) {
      const a = lowestHero(run);
      if (a) { const r = healHero(hero, a, H.attack.heal * focusMult); if (r.heal) { ev.targets.push(r); touched.add(a.id); } }
    }
    hero.focus = 0; ev.focus = usedFocus;
    gainEnergy(hero, C.ENERGY.attack, ev);
  } else if (action === 'defend') {
    const t = (targetId && run.heroes[targetId] && !run.heroes[targetId].downed) ? run.heroes[targetId] : hero;
    ev.fx = 'defend'; ev.name = H.defend.name;
    ev.targets.push(blockHero(t, H.defend.block)); touched.add(t.id);
    if (t !== hero) ev.guard = t.id;
    gainEnergy(hero, C.ENERGY.defend, ev);
  } else if (action === 'skill0' || action === 'skill1') {
    const slot = action === 'skill0' ? 0 : 1;
    const sk = hero.skills[slot];
    if (!sk) return { ok: false, msg: 'No skill in that slot.' };
    const def = C.SKILLS[sk.id];
    if ((hero.energy || 0) < def.cost) return { ok: false, msg: `${C.skillName(sk.id, sk.lvl)} needs ${def.cost} energy (you have ${hero.energy || 0}).` };
    const p = C.skillParams(sk.id, sk.lvl);
    const m = focusMult;
    ev.skill = sk.id; ev.name = C.skillName(sk.id, sk.lvl); ev.fx = def.fx; ev.rarity = def.rarity;
    const allE = () => aliveEnemies(c);
    const allH = () => aliveHeroes(run);
    switch (sk.id) {
      case 'power_strike': { const e = pickEnemy(); hero.lastTarget = e.id; const r = hitEnemy(hero, e, p.dmg * m); if (!e.dead) { addStatus(e, 'vuln', { t: p.vulnT }); r.status = ['vuln']; } ev.targets.push(r); touched.add(e.id); break; }
      case 'shield_wall': for (const h of allH()) { ev.targets.push(blockHero(h, p.block * m)); touched.add(h.id); } break;
      case 'fireball': { const e = pickEnemy(); hero.lastTarget = e.id; const r = hitEnemy(hero, e, p.dmg * m); if (!e.dead) { addStatus(e, 'burn', { v: Math.round(p.burn * m), t: p.burnT }); r.status = ['burn']; } ev.targets.push(r); touched.add(e.id); break; }
      case 'ice_shard': { const e = pickEnemy(); hero.lastTarget = e.id; const r = hitEnemy(hero, e, p.dmg * m); if (!e.dead) { addStatus(e, 'chill', { t: 1 }); r.status = ['chill']; } ev.targets.push(r); touched.add(e.id); break; }
      case 'poison_arrow': { const e = pickEnemy(); hero.lastTarget = e.id; const r = hitEnemy(hero, e, p.dmg * m); if (!e.dead) { addStatus(e, 'poison', { v: Math.round(p.poison * m) }); r.status = ['poison']; } ev.targets.push(r); touched.add(e.id); break; }
      case 'volley': case 'whirlwind': for (const e of allE()) { ev.targets.push(hitEnemy(hero, e, p.dmg * m)); touched.add(e.id); } break;
      case 'healing_light': { const a = pickAlly(false); ev.targets.push(healHero(hero, a, p.heal * m)); touched.add(a.id); break; }
      case 'blessing': for (const h of allH()) { const r = healHero(hero, h, p.heal * m); r.block = blockHero(h, p.block * m).block; ev.targets.push(r); touched.add(h.id); } break;
      case 'guardian_oath': { ev.targets.push(blockHero(hero, p.block * m)); addStatus(hero, 'taunt', { t: 1 }); ev.targets[0].status = ['taunt']; break; }
      case 'lightning_bolt': {
        const e = pickEnemy(); hero.lastTarget = e.id;
        ev.targets.push(hitEnemy(hero, e, p.dmg * m)); touched.add(e.id);
        const others = allE().filter(o => o !== e);
        if (others.length) { const o = pick(others); const r = hitEnemy(hero, o, p.chain * m, { noStr: true }); r.chain = true; ev.targets.push(r); touched.add(o.id); }
        break;
      }
      case 'sanctuary': for (const h of allH()) { ev.targets.push(healHero(hero, h, p.heal * m)); touched.add(h.id); } break;
      case 'shadow_strike': { const e = pickEnemy(); hero.lastTarget = e.id; const dbl = e.st.poison || e.st.burn; const r = hitEnemy(hero, e, p.dmg * m * (dbl ? 2 : 1)); if (dbl) r.crit = true; ev.targets.push(r); touched.add(e.id); break; }
      case 'battle_cry': for (const h of allH()) { addStatus(h, 'str', { v: Math.round(p.str * m), t: p.strT }); ev.targets.push({ id: h.id, status: ['str'] }); touched.add(h.id); } break;
      case 'frost_nova': for (const e of allE()) { const r = hitEnemy(hero, e, p.dmg * m); if (!e.dead) { if (e.tier === 'boss') addStatus(e, 'chill', { t: 1 }); else addStatus(e, 'freeze', { t: 1 }); r.status = [e.tier === 'boss' ? 'chill' : 'freeze']; } ev.targets.push(r); touched.add(e.id); } break;
      case 'meteor': for (const e of allE()) { const r = hitEnemy(hero, e, p.dmg * m); if (!e.dead) { addStatus(e, 'burn', { v: Math.round(p.burn * m), t: p.burnT }); r.status = ['burn']; } ev.targets.push(r); touched.add(e.id); } break;
      case 'phoenix_feather': {
        const a = pickAlly(true);
        if (a.downed) { a.downed = false; a.hp = Math.round(a.maxHp * 0.5); ev.targets.push({ id: a.id, heal: a.hp, revived: true }); }
        else ev.targets.push(healHero(hero, a, p.heal * m));
        touched.add(a.id); break;
      }
      case 'venom_storm': for (const e of allE()) { addStatus(e, 'poison', { v: Math.round(p.poison * m) }); ev.targets.push({ id: e.id, status: ['poison'] }); touched.add(e.id); } break;
      case 'starfall': {
        ev.hits = [];
        for (let i = 0; i < p.hits; i++) { const wave = []; for (const e of allE()) { wave.push(hitEnemy(hero, e, p.dmg * m)); touched.add(e.id); } ev.hits.push(wave); }
        ev.targets = ev.hits.flat(); break;
      }
      case 'aegis': for (const h of allH()) { const r = healHero(hero, h, p.heal * m); r.block = blockHero(h, p.block * m).block; ev.targets.push(r); touched.add(h.id); } break;
      case 'dragons_wrath': { const e = pickEnemy(); hero.lastTarget = e.id; const r = hitEnemy(hero, e, p.dmg * m); if (!e.dead) { addStatus(e, 'burn', { v: Math.round(p.burn * m), t: p.burnT }); r.status = ['burn']; } ev.targets.push(r); touched.add(e.id); break; }
      default: return { ok: false, msg: 'Unknown skill.' };
    }
    hero.energy -= def.cost; ev.energy = -def.cost;
    hero.focus = 0; ev.focus = usedFocus;
    if (hero.stats) hero.stats.skills++;
  } else return { ok: false, msg: 'Unknown action.' };

  // A boss dying takes its crystals with it.
  const boss = c.enemies.find(e => e.tier === 'boss');
  if (boss && boss.dead) for (const e of c.enemies) if (e.kind === 'shard' && !e.dead) { e.dead = true; e.hp = 0; ev.targets.push({ id: e.id, dmg: 0, killed: true, shatter: true }); touched.add(e.id); }
  hero.acted = true;
  done();
  return { ok: true };
}

// ---------------------------------------------------------------- enemy turn
function enemyTurn(run) {
  const c = run.combat;
  const out = [];
  const heroesAlive = () => aliveHeroes(run);
  const taunter = () => heroesAlive().find(h => h.st.taunt);
  const ev = (o) => { o.after = o.after || {}; out.push(o); return o; };
  const snapAll = (o, ids) => { for (const id of ids) { const ent = run.heroes[id] || c.enemies.find(e => e.id === id); if (ent) o.after[id] = snapEnt(ent); } };

  // Block from last enemy turn wears off; damage over time.
  for (const e of aliveEnemies(c)) {
    e.block = 0;
    const dots = [];
    if (e.st.burn) dots.push(['burn', e.st.burn.v]);
    if (e.st.poison) { dots.push(['poison', e.st.poison.v]); e.st.poison.v--; if (e.st.poison.v <= 0) delete e.st.poison; }
    for (const [k, v] of dots) {
      if (e.dead) break;
      const r = hitEnemy(null, e, v, { noStr: true });
      r.dot = k;
      const o = ev({ kind: 'tick', actor: e.id, fx: k, targets: [r], dur: MS.tick });
      snapAll(o, [e.id]);
    }
  }
  const boss = c.enemies.find(e => e.tier === 'boss');
  if (boss && boss.dead) for (const e of c.enemies) if (e.kind === 'shard' && !e.dead) { e.dead = true; e.hp = 0; }

  for (const e of c.enemies) {
    if (e.dead || !e.intent) continue;
    if (!heroesAlive().length) break;
    const it = e.intent;
    e.mem.last = it.move;
    if (e.st.freeze) {
      delete e.st.freeze;
      const o = ev({ kind: 'enemy', actor: e.id, act: 'frozen', fx: 'frozen', name: 'Frozen solid', targets: [], dur: MS.small });
      snapAll(o, [e.id]);
      continue;
    }
    const chilled = !!e.st.chill;
    if (chilled && (it.type === 'attack' || it.type === 'attackAll')) delete e.st.chill;
    const o = ev({ kind: 'enemy', actor: e.id, act: it.move, type: it.type, name: it.label, targets: [], dur: MS.enemy });
    const ids = new Set([e.id]);
    const targetHero = () => {
      const t = taunter(); if (t) return t;
      const h = run.heroes[it.target];
      if (h && !h.downed) return h;
      const alive = heroesAlive(); return alive.length ? pick(alive) : null;
    };
    if (it.type === 'attack') {
      const hits = it.hits || 1;
      for (let i = 0; i < hits; i++) {
        const h = targetHero(); if (!h) break;
        const r = hitHero(e, h, it.dmg, { chilled });
        if (it.status && !h.downed) { addStatus(h, it.status, { t: 2 }); r.status = [it.status]; }
        o.targets.push(r); ids.add(h.id);
      }
    } else if (it.type === 'attackAll') {
      let dmg = it.dmg;
      if (it.perShard) {
        const shards = aliveEnemies(c).filter(x => x.kind === 'shard');
        dmg += it.perShard * shards.length;
        o.shards = shards.length;
      }
      for (const h of heroesAlive()) { o.targets.push(hitHero(e, h, dmg, { chilled })); ids.add(h.id); }
      if (it.perShard) {
        for (const s of aliveEnemies(c).filter(x => x.kind === 'shard')) { s.dead = true; s.hp = 0; o.targets.push({ id: s.id, dmg: 0, killed: true, shatter: true }); ids.add(s.id); }
      }
    } else if (it.type === 'block') {
      e.block += Math.round(it.block * (1 + 0.08 * Math.max(0, run.floor - 1)));
      o.targets.push({ id: e.id, block: it.block });
    } else if (it.type === 'debuff') {
      const h = targetHero();
      if (h) { addStatus(h, it.status, { t: 2 }); o.targets.push({ id: h.id, status: [it.status] }); ids.add(h.id); }
    } else if (it.type === 'heal') {
      const a = c.enemies.find(x => x.id === it.ally && !x.dead) || aliveEnemies(c).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      if (a) { const before = a.hp; a.hp = Math.min(a.maxHp, a.hp + it.heal); o.targets.push({ id: a.id, heal: a.hp - before }); ids.add(a.id); }
    } else if (it.type === 'charge') {
      if (it.block) { e.block += it.block; o.targets.push({ id: e.id, block: it.block }); }
      o.warn = it.warn;
    } else if (it.type === 'summon') {
      for (const x of c.enemies) if (x.st) { delete x.st.weak; delete x.st.vuln; delete x.st.chill; }
      for (let i = 0; i < 2; i++) {
        const s = makeEnemy(c, 'shard', c.mult);
        c.enemies.push(s); ids.add(s.id);
        o.targets.push({ id: s.id, summoned: true });
      }
      o.spawn = c.enemies.filter(x => x.kind === 'shard' && !x.dead).map(publicEnemy);
    }
    snapAll(o, ids);
  }

  // Durations tick down at the end of the round.
  const tickAll = ent => {
    for (const k of Object.keys(ent.st)) {
      if (k === 'poison') continue;
      const s = ent.st[k];
      if (s.t != null) { s.t--; if (s.t <= 0) delete ent.st[k]; }
    }
  };
  heroList(run).forEach(tickAll);
  c.enemies.forEach(e => { if (!e.dead) tickAll(e); });
  return out;
}

function combatOutcome(run) {
  const c = run.combat;
  if (!aliveEnemies(c).length) return 'won';
  if (!aliveHeroes(run).length) return 'lost';
  return null;
}

function publicEnemy(e) {
  return { id: e.id, kind: e.kind, name: e.name, size: e.size, tier: e.tier, hp: e.hp, maxHp: e.maxHp, block: e.block, st: e.st, dead: e.dead, intent: e.intent && !e.dead ? publicIntent(e.intent) : null };
}
function publicIntent(it) {
  const o = { move: it.move, type: it.type, label: it.label };
  for (const k of ['dmg', 'hits', 'block', 'status', 'heal', 'target', 'warn', 'perShard', 'ally']) if (it[k] != null) o[k] = it[k];
  return o;
}

module.exports = { createCombat, beginRound, heroAction, enemyTurn, combatOutcome, publicEnemy, aliveHeroes, aliveEnemies, heroList, needsToAct, MS };
