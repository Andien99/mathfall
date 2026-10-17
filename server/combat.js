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
const has = C.hasItem;
function addStatus(ent, k, v) {
  const cur = ent.st[k];
  if (k === 'poison') ent.st.poison = { v: (cur ? cur.v : 0) + v.v };
  else if (k === 'str') ent.st.str = { v: (cur ? cur.v : 0) + v.v, t: Math.max(cur ? cur.t : 0, v.t || 99) };
  else if (v.v != null) ent.st[k] = { v: Math.max(cur && cur.v ? cur.v : 0, v.v), t: Math.max(cur ? cur.t : 0, v.t || 1) };   // burn, mark, regen, thorns
  else ent.st[k] = { t: Math.max(cur ? cur.t : 0, v.t || 1) };
}
const isBig = e => e.tier === 'boss' || e.tier === 'raid';
function gainEnergy(hero, n, ev) {
  const before = hero.energy || 0;
  hero.energy = Math.min(C.ENERGY.max, before + n);
  if (ev) ev.energy = hero.energy - before;
}
function snapEnt(e) {
  const o = { hp: e.hp, maxHp: e.maxHp, block: e.block, st: JSON.parse(JSON.stringify(e.st)) };
  if ('lv' in e) o.lv = e.lv;
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
  if (src && e.st.mark) d += e.st.mark.v;   // Hunter's Mark: every hero hit lands harder
  if (src && src.lv && src.lv.atk) d *= 1 + C.STAT_STEP.atk * src.lv.atk;
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
  if (h.lv && h.lv.def) d *= 1 - Math.min(C.STAT_STEP.defCutMax, C.STAT_STEP.defCut * h.lv.def);
  if (h.st.unbreak) d *= 0.5;
  d = Math.max(0, Math.round(d));
  const r = { id: h.id, dmg: 0, blocked: 0, downed: false };
  if (h.st.divine) { r.shielded = true; d = 0; }   // Divine Shield
  const blocked = Math.min(h.block, d);
  h.block -= blocked;
  const dmg = d - blocked;
  r.dmg = dmg; r.blocked = blocked;
  if (!h.invincible) h.hp = Math.max(0, h.hp - dmg);   // teacher test games can make heroes invincible
  if (h.st.unbreak && h.hp < 1) h.hp = 1;
  if (h.hp <= 0 && !h.downed) {
    if (has(h, 'phoenix_plume') && !h.plumeUsed) { h.plumeUsed = true; h.hp = Math.round(h.maxHp * 0.5); r.plume = h.hp; }
    else { h.downed = true; h.block = 0; h.st = {}; r.downed = true; h.focus = 0; }
  } else if (!h.downed && dmg > 0 && has(h, 'spare_potion') && !h.potionUsed && h.hp < h.maxHp * 0.25) {
    h.potionUsed = true; r.potion = healHero(null, h, 10).heal;
  }
  if (h.stats) h.stats.taken += dmg;
  // the attacker pays: Riposte and Thorned Mail hit back, Frost Armour chills
  if (e && e.st && !e.dead && !opts.noReact) {
    const back = (h.st.thorns ? h.st.thorns.v : 0) + (has(h, 'thorned_mail') ? 3 : 0);
    if (back > 0) { const t = hitEnemy(null, e, back, { noStr: true }); r.thorns = t.dmg; r.attacker = e.id; if (h.stats) h.stats.dmg += t.dmg; }
    if (h.st.frost && !e.dead) { addStatus(e, 'chill', { t: 2 }); r.chilled = e.id; r.attacker = e.id; }
  }
  return r;
}
function healHero(src, h, amt) {
  if (h.downed) return { id: h.id, heal: 0 };
  if (has(h, 'healers_satchel')) amt *= 1.3;
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + Math.round(amt));
  const heal = h.hp - before;
  if (src && src.stats) src.stats.heal += heal;
  return { id: h.id, heal };
}
function blockHero(h, amt) {
  if (h.downed) return { id: h.id, block: 0 };
  const v = Math.round(amt * (1 + C.STAT_STEP.defBlock * ((h.lv && h.lv.def) || 0)));
  h.block += v;
  return { id: h.id, block: v };
}

// ---------------------------------------------------------------- creation
const ENCOUNTERS = {
  normal1: [['slime', 'slime'], ['goblin', 'slime'], ['skeleton'], ['goblin', 'goblin']],
  normal2: [['skeleton', 'goblin'], ['hexer', 'skeleton'], ['slime', 'goblin', 'slime'], ['hexer', 'goblin', 'goblin']],
  elite: [['sentinel']],
  boss: [['minotaur']]
};
function encounterKinds(run, type) {
  if (type === 'boss') return [C.bossForAct(run.asc || 0)];
  return pick(ENCOUNTERS[type] || ENCOUNTERS.normal1);
}

function makeEnemy(c, kind, mult) {
  const def = C.ENEMIES[kind];
  const hp = Math.max(6, Math.round(def.hp * mult.hp));
  return { id: 'e' + (++c.nextId), kind, name: def.name, size: def.size, tier: def.kind, hp, maxHp: hp, block: 0, st: {}, dead: false, intent: null, mem: {}, dmgMult: mult.dmg };
}

function createCombat(run, encounterType) {
  const size = Math.max(1, run.activeCount || heroList(run).length);
  const partyMult = 0.25 + 0.1875 * size;
  const depth = run.depth || run.floor || 1;
  const floorMult = 1 + 0.08 * Math.max(0, depth - 1);
  const ascMult = 1 + 0.15 * (run.asc || 0);
  const mult = { hp: partyMult * floorMult * ascMult, dmg: (1 + 0.06 * Math.max(0, depth - 1)) * (1 + 0.12 * (run.asc || 0)) };
  const c = { enemies: [], round: 0, phase: 'player', roundEndsAt: 0, phaseEndsAt: 0, nextId: 0, type: encounterType, mult, events: 0 };
  const kinds = encounterKinds(run, encounterType);
  for (const k of kinds) c.enemies.push(makeEnemy(c, k, mult));
  for (const h of heroList(run)) {
    h.block = 0; h.st = {}; h.acted = false; h.readyAction = null; h.focus = h.focus || 0;
    h.energy = C.ENERGY.start + (has(h, 'energy_crystal') ? 2 : 0);
    h.potionUsed = false; h.chalkUsed = false;
    if (h.nextFight) {
      h.energy = Math.min(C.ENERGY.max, h.energy + (h.nextFight.energy || 0));
      h.focus = Math.min(3, h.focus + (h.nextFight.focus || 0));
      h.nextFight = null;
    }
    h.free = false;
  }
  return c;
}

// The raid boss: one shared health pool for every team. Each team fights its own copy
// (own intents, block and statuses) whose hp reads and writes the shared pool.
function createRaidCombat(run, raid, teamId) {
  const mult = { hp: 1, dmg: 1.2 + 0.1 * (run.asc || 0) };
  const c = { enemies: [], round: 0, phase: 'player', roundEndsAt: 0, phaseEndsAt: 0, nextId: 0, type: 'raid', mult, events: 0, raid: true };
  const def = C.ENEMIES.voidmaw;
  const e = { id: 'raid', kind: 'voidmaw', name: def.name, size: def.size, tier: 'raid', block: 0, st: {}, intent: null, mem: {}, dmgMult: mult.dmg };
  Object.defineProperty(e, 'hp', { enumerable: true, get: () => raid.hp, set: v => {
    const d = raid.hp - v;
    if (d > 0) { raid.hp = Math.max(0, v); raid.dmg[teamId] = (raid.dmg[teamId] || 0) + Math.min(d, raid.hp + d); raid.hits.push({ teamId, d }); }
    else raid.hp = Math.min(raid.maxHp, v);
  } });
  Object.defineProperty(e, 'maxHp', { enumerable: true, get: () => raid.maxHp });
  Object.defineProperty(e, 'dead', { enumerable: true, get: () => raid.hp <= 0, set: () => {} });
  c.enemies.push(e);
  for (const h of heroList(run)) { h.block = 0; h.st = {}; h.acted = false; h.readyAction = null; h.energy = Math.max(h.energy || 0, C.ENERGY.start + 2); h.free = false; h.potionUsed = false; h.chalkUsed = false; }
  return c;
}

// ---------------------------------------------------------------- enemy AI
const MINOTAUR_MOVES = { tail: 'Horn Gore', tailstorm: 'Stampede', breath: 'Ground Slam', harden: 'Iron Hide',
  summon: 'Earthshaker Roar', bite: 'Crushing Blow' };
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
    if (m === 'charge') return { move: 'charge', type: 'charge', label: 'Winding up…', warn: 'Earthshatter next round: get ready to dodge!' };
    return { move: 'crush', type: 'attackAll', dmg: 14, label: 'Earthshatter', qte: 1, warn: 'Quick-time: answer fast to dodge!' };
  },
  shard() { return { move: 'zap', type: 'attack', dmg: 4, label: 'Crystal Zap' }; },
  thrall() { return chance(0.7) ? { move: 'claw', type: 'attack', dmg: 5, label: 'Bone Claw' } : { move: 'rattle', type: 'debuff', status: 'weak', label: 'Rattle (Weak)' }; },
  colossus(e) {
    const m = e.mem;
    if (m.i == null) m.i = ri(0, 1);
    if (!m.enraged && e.hp <= e.maxHp * 0.5) { m.enraged = true; return { move: 'overheat', type: 'buff', str: 4, block: 18, label: 'Overheat', warn: 'The Colossus overheats: it hits harder now!' }; }
    const cycle = ['hammer', 'quake', 'plate', 'overcharge', 'meltdown'];
    const mv = cycle[m.i++ % cycle.length];
    if (mv === 'hammer') return { move: 'hammer', type: 'attack', dmg: 14, label: 'Piston Hammer' };
    if (mv === 'quake') return { move: 'quake', type: 'attackAll', dmg: 7, label: 'Quake' };
    if (mv === 'plate') return { move: 'plate', type: 'block', block: 18, label: 'Iron Plating' };
    if (mv === 'overcharge') return { move: 'overcharge', type: 'charge', label: 'Overcharging…', warn: 'Meltdown next round: get ready to dodge!' };
    return { move: 'meltdown', type: 'attackAll', dmg: 15, label: 'Meltdown', qte: 1, warn: 'Quick-time: answer fast to dodge!' };
  },
  hollowking(e, c) {
    const m = e.mem;
    if (m.i == null) m.i = ri(0, 2);
    const thralls = aliveEnemies(c).filter(x => x.kind === 'thrall').length;
    const cycle = ['cleave', 'raise', 'drain', 'cleave', 'knell'];
    let mv = cycle[m.i++ % cycle.length];
    if (mv === 'raise' && thralls >= 2) mv = 'drain';
    if (mv === 'cleave') return { move: 'cleave', type: 'attack', dmg: 15, label: 'Royal Cleave' };
    if (mv === 'raise') return { move: 'raise', type: 'summon', minion: 'thrall', count: 2, label: 'Raise the Dead', warn: 'The Hollow King raises two Bone Thralls' };
    if (mv === 'drain') return { move: 'drain', type: 'attackAll', dmg: 6, drain: true, label: 'Soul Drain' };
    return { move: 'knell', type: 'attackAll', dmg: 8, label: 'Death Knell', qte: 3, warn: 'Three quick-time strikes in a row!' };
  },
  voidmaw(e) {
    const cycle = ['rend', 'wave', 'cascade', 'rend', 'gaze', 'cataclysm'];
    if (e.mem.i == null) e.mem.i = ri(0, 5);
    const m = cycle[e.mem.i++ % cycle.length];
    if (m === 'rend') return { move: 'rend', type: 'attack', dmg: 12, label: 'Void Rend' };
    if (m === 'wave') return { move: 'wave', type: 'attackAll', dmg: 7, label: 'Abyssal Wave' };
    if (m === 'gaze') return { move: 'gaze', type: 'debuff', status: 'vuln', label: 'Dread Gaze (Vulnerable)' };
    if (m === 'cascade') return { move: 'cascade', type: 'attackAll', dmg: 7, label: 'Doom Cascade', qte: 3, warn: 'Three quick-time strikes in a row!' };
    return { move: 'cataclysm', type: 'attackAll', dmg: 17, label: 'Cataclysm', qte: 1, warn: 'Quick-time: answer fast to dodge!' };
  },
  // The first act's boss: the same two-phase fight Gravemaw had (break the crystals before the storm), with his own moves.
  minotaur(e, c) { return AI.wyrm(e, c, MINOTAUR_MOVES); },
  wyrm(e, c, L = {}) {
    const lb = (k, d) => L[k] || d;
    const m = e.mem;
    if (m.phase == null) { m.phase = 1; m.i = ri(0, 2); }
    if (m.phase === 1 && e.hp <= e.maxHp * 0.5) { m.phase = 2; m.step = 'summon'; }
    if (m.phase === 2) {
      const shardsAlive = aliveEnemies(c).filter(x => x.kind === 'shard').length;
      if (m.step === 'summon') { m.step = 'charge'; return { move: 'summon', type: 'summon', label: lb('summon', 'Crystal Roar'), warn: 'Summons two Crystal Shards' }; }
      if (m.step === 'charge') { m.step = 'storm'; return { move: 'gather', type: 'charge', block: 10, label: 'Gathering power', warn: 'Shatterstorm next round. Break the crystals!' }; }
      if (m.step === 'storm') { m.step = 'rest1'; return { move: 'storm', type: 'attackAll', dmg: 8, perShard: 6, label: 'Shatterstorm', shardsAlive, qte: 1, warn: 'Quick-time: answer fast to dodge!' }; }
      if (m.step === 'rest1') { m.step = 'rest2'; return { move: 'bite', type: 'attack', dmg: 15, label: lb('bite', 'Crushing Bite') }; }
      m.step = 'summon';
      return { move: 'breath', type: 'attackAll', dmg: 7, label: lb('breath', 'Crystal Breath') };
    }
    const cycle = ['tail', 'breath', 'harden'];
    const mv = cycle[m.i++ % 3];
    if (mv === 'tail') return chance(0.5) ? { move: 'tailstorm', type: 'attackAll', dmg: 10, label: lb('tailstorm', 'Tail Storm'), qte: 1, warn: 'Quick-time: answer fast to dodge!' } : { move: 'tail', type: 'attack', dmg: 13, label: lb('tail', 'Tail Sweep') };
    if (mv === 'breath') return { move: 'breath', type: 'attackAll', dmg: 6, label: lb('breath', 'Crystal Breath') };
    return { move: 'harden', type: 'block', block: 16, label: lb('harden', 'Crystal Hide') };
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
    if (intent.qte && run.combat.raid && chance(0.3)) intent.qte = intent.qte === 1 ? 3 : intent.qte;
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
    if (!h.st.steady) h.block = 0;   // Iron Skin keeps last round's block
    h.acted = false;
    if (c.round === 1 && !h.downed && has(h, 'sturdy_boots')) h.block += 5;
  }
  planIntents(run);
}

function needsToAct(h, player) { return player && player.connected && !h.acted; }

// ---------------------------------------------------------------- skills
// Each skill is a small function over these helpers. Damage, healing, block and status strength all
// take the hero's Focus multiplier (X.m); hit() pushes one target record per hit, the rest merge into
// the target's latest record so a heal and a block on one hero show together.
function skillCtx(run, hero, ev, touched, pickEnemy, pickAlly, m, usedFocus) {
  const c = run.combat;
  const X = {
    run, hero, ev, m, usedFocus,
    enemies: () => aliveEnemies(c),
    heroes: () => aliveHeroes(run),
    enemy() { const e = pickEnemy(); hero.lastTarget = e.id; return e; },
    ally: allowDowned => pickAlly(allowDowned),
    rec(id) { let r = null; for (let i = ev.targets.length - 1; i >= 0; i--) if (ev.targets[i].id === id) { r = ev.targets[i]; break; } if (!r) ev.targets.push(r = { id }); touched.add(id); return r; },
    hit(e, base, opts = {}) { const r = hitEnemy(hero, e, base * m, opts); ev.targets.push(r); touched.add(e.id); return r; },
    status(ent, k, v, r) { if (ent.dead || ent.downed) return r; addStatus(ent, k, v); r = r || X.rec(ent.id); (r.status = r.status || []).push(k); return r; },
    heal(h, amt, raw) { const n = healHero(hero, h, raw ? amt : amt * m).heal; const r = X.rec(h.id); r.heal = (r.heal || 0) + n; return n; },
    block(h, amt) { const n = blockHero(h, amt * m).block; const r = X.rec(h.id); r.block = (r.block || 0) + n; return n; },
    n: v => Math.round(v * m),
    // the next living enemy for multi-hit skills, sticking to the first target while it stands
    next(e) { return e && !e.dead ? e : aliveEnemies(c)[0]; }
  };
  return X;
}
const burn = (X, e, p, r) => X.status(e, 'burn', { v: X.n(p.burn), t: p.burnT }, r);
const SKILL_FX = {
  // ---- knight
  power_strike(X, p) { const e = X.enemy(); X.status(e, 'vuln', { t: p.vulnT }, X.hit(e, p.dmg)); },
  shield_wall(X, p) { for (const h of X.heroes()) X.block(h, p.block); },
  shield_bash(X, p) { const e = X.enemy(); X.status(e, 'weak', { t: p.weakT }, X.hit(e, p.dmg)); },
  cleave(X, p) { const e = X.enemy(), list = X.enemies(), i = list.indexOf(e), nb = list[i + 1] || list[i - 1]; X.hit(e, p.dmg); if (nb) X.hit(nb, p.dmg); },
  iron_skin(X, p) { X.block(X.hero, p.block); X.status(X.hero, 'steady', { t: 2 }); },
  rallying_shout(X, p) { X.block(X.hero, p.block); for (const h of X.heroes()) if (h !== X.hero) X.block(h, p.ally); },
  pommel_strike(X, p) { X.hit(X.enemy(), p.dmg); X.block(X.hero, p.block); },
  sunder(X, p) { const e = X.enemy(), had = e.block; e.block = 0; const r = X.hit(e, p.dmg); if (had) r.sundered = had; },
  whirlwind(X, p) { for (const e of X.enemies()) X.hit(e, p.dmg); },
  guardian_oath(X, p) { X.block(X.hero, p.block); X.status(X.hero, 'taunt', { t: 1 }); },
  battle_cry(X, p) { for (const h of X.heroes()) X.status(h, 'str', { v: X.n(p.str), t: p.strT }); },
  shield_slam(X, p) { const r = X.hit(X.enemy(), p.dmg + X.hero.block); r.slam = X.hero.block; },
  riposte(X, p) { X.block(X.hero, p.block); X.status(X.hero, 'thorns', { v: X.n(p.thorns), t: 1 }); },
  aegis(X, p) { for (const h of X.heroes()) { X.heal(h, p.heal); X.block(h, p.block); } },
  unbreakable(X, p) { X.block(X.hero, p.block); X.status(X.hero, 'taunt', { t: 1 }); X.status(X.hero, 'unbreak', { t: 1 }); },
  earthshatter(X, p) { for (const e of X.enemies()) X.status(e, 'weak', { t: p.weakT }, X.hit(e, p.dmg)); },
  champions_combo(X, p) {
    let e = X.enemy();
    for (let i = 0; i <= p.hitsN; i++) { e = X.next(e); if (!e) break; const r = X.hit(e, i < p.hitsN ? p.dmg : p.finisher); r.hit = i; if (i === p.hitsN) r.finisher = true; }
  },
  // ---- mage
  fireball(X, p) { const e = X.enemy(); burn(X, e, p, X.hit(e, p.dmg)); },
  ice_shard(X, p) { const e = X.enemy(); X.status(e, 'chill', { t: 1 }, X.hit(e, p.dmg)); },
  arcane_missiles(X, p) { for (let i = 0; i < p.boltsN; i++) { const list = X.enemies(); if (!list.length) break; X.hit(pick(list), p.dmg); } },
  spark(X, p) { X.hit(X.enemy(), p.dmg); },
  frost_armour(X, p) { X.block(X.hero, p.block); X.status(X.hero, 'frost', { t: 1 }); },
  kindle(X, p) {
    const e = X.enemy(), r = X.hit(e, p.dmg);
    if (e.dead) return;
    if (e.st.burn) { e.st.burn.v *= 2; e.st.burn.t = Math.max(e.st.burn.t, p.burnT); (r.status = r.status || []).push('burn'); r.doubled = true; }
    else burn(X, e, p, r);
  },
  flame_wave(X, p) { for (const e of X.enemies()) burn(X, e, p, X.hit(e, p.dmg)); },
  frostbite(X, p) {
    const e = X.enemy(), was = !!e.st.chill, r = X.hit(e, p.dmg);
    if (was && !isBig(e)) { delete e.st.chill; X.status(e, 'freeze', { t: 1 }, r); } else X.status(e, 'chill', { t: 1 }, r);
  },
  lightning_bolt(X, p) {
    const e = X.enemy(); X.hit(e, p.dmg);
    const others = X.enemies().filter(o => o !== e);
    if (others.length) { const r = X.hit(pick(others), p.chain, { noStr: true }); r.chain = true; }
  },
  frost_nova(X, p) { for (const e of X.enemies()) X.status(e, isBig(e) ? 'chill' : 'freeze', { t: 1 }, X.hit(e, p.dmg)); },
  mana_surge(X) { X.status(X.hero, 'surge', { t: 99 }); },
  combust(X, p) {
    const e = X.enemy(), burning = !!e.st.burn; X.hit(e, p.dmg);
    if (burning) for (const o of X.enemies()) if (o !== e) { const r = X.hit(o, p.blast, { noStr: true }); r.splash = true; }
  },
  blizzard(X, p) { for (const e of X.enemies()) X.status(e, 'chill', { t: 1 }, X.hit(e, p.dmg)); },
  meteor(X, p) { for (const e of X.enemies()) burn(X, e, p, X.hit(e, p.dmg)); },
  dragons_wrath(X, p) { const e = X.enemy(); burn(X, e, p, X.hit(e, p.dmg)); },
  time_stop(X, p) {
    for (const e of X.enemies()) {
      const r = X.hit(e, p.dmg);
      if (isBig(e)) { X.status(e, 'chill', { t: 1 }, r); X.status(e, 'weak', { t: 1 }, r); } else X.status(e, 'freeze', { t: 1 }, r);
    }
  },
  // ---- ranger
  poison_arrow(X, p) { const e = X.enemy(); X.status(e, 'poison', { v: X.n(p.poison) }, X.hit(e, p.dmg)); },
  volley(X, p) { for (const e of X.enemies()) X.hit(e, p.dmg); },
  aimed_shot(X, p) { const r = X.hit(X.enemy(), p.dmg + (X.usedFocus ? p.bonus : 0)); if (X.usedFocus) r.crit = true; },
  twin_shot(X, p) { let e = X.enemy(); for (let i = 0; i < p.arrowsN; i++) { e = X.next(e); if (!e) break; X.hit(e, p.dmg); } },
  hunters_mark(X, p) { X.status(X.enemy(), 'mark', { v: X.n(p.mark), t: p.markT }); },
  smoke_bomb(X, p) { for (const h of X.heroes()) X.block(h, p.block); },
  fire_arrow(X, p) { const e = X.enemy(); burn(X, e, p, X.hit(e, p.dmg)); },
  crippling_shot(X, p) { const e = X.enemy(); X.status(e, 'weak', { t: p.weakT }, X.hit(e, p.dmg)); },
  shadow_strike(X, p) { const e = X.enemy(), dbl = e.st.poison || e.st.burn, r = X.hit(e, p.dmg * (dbl ? 2 : 1)); if (dbl) r.crit = true; },
  venom_storm(X, p) { for (const e of X.enemies()) X.status(e, 'poison', { v: X.n(p.poison) }); },
  pinning_shot(X, p) { const e = X.enemy(); X.status(e, isBig(e) ? 'weak' : 'stun', { t: 1 }, X.hit(e, p.dmg)); },
  arrow_rain(X, p) { for (let w = 0; w < p.wavesN; w++) for (const e of X.enemies()) X.hit(e, p.dmg).wave = w; },
  ricochet(X, p) {
    let prev = null; const first = X.enemy();
    [1, 0.7, 0.5].forEach((k, i) => {
      const list = X.enemies(); if (!list.length) return;
      const t = i === 0 && !first.dead ? first : (list.find(o => o !== prev) || list[0]);
      X.hit(t, Math.round(p.dmg * k)).bounce = i; prev = t;
    });
  },
  starfall(X, p) { for (let i = 0; i < p.hits; i++) for (const e of X.enemies()) X.hit(e, p.dmg).wave = i; },
  phantom_volley(X, p) { for (let i = 0; i < p.arrowsN; i++) { const list = X.enemies(); if (!list.length) break; const e = pick(list); X.status(e, 'poison', { v: X.n(p.poison) }, X.hit(e, p.dmg)); } },
  deadeye(X, p) { const e = X.enemy(), dbl = e.st.poison || e.st.burn || e.st.mark, r = X.hit(e, p.dmg * (dbl ? 2 : 1)); if (dbl) r.crit = true; },
  // ---- cleric
  healing_light(X, p) { X.heal(X.ally(false), p.heal); },
  blessing(X, p) { for (const h of X.heroes()) { X.heal(h, p.heal); X.block(h, p.block); } },
  holy_smite(X, p) { X.hit(X.enemy(), p.dmg); X.heal(X.hero, p.heal); },
  purify(X, p) { const a = X.ally(false); const bad = ['weak', 'vuln'].filter(k => a.st[k]); bad.forEach(k => delete a.st[k]); X.heal(a, p.heal); if (bad.length) X.rec(a.id).cleansed = bad; },
  ward_of_light(X, p) { X.block(X.ally(false), p.block); },
  prayer_of_mending(X, p) { const a = X.ally(false); X.heal(a, p.heal); X.status(a, 'regen', { v: X.n(p.heal), t: 1 }); },
  radiance(X, p) { for (const e of X.enemies()) X.hit(e, p.dmg); for (const h of X.heroes()) X.heal(h, p.heal); },
  empower(X, p) { const a = X.ally(false); X.heal(a, p.heal); X.status(a, 'str', { v: X.n(p.str), t: p.strT }); },
  sanctuary(X, p) { for (const h of X.heroes()) X.heal(h, p.heal); },
  phoenix_feather(X, p) {
    const a = X.ally(true);
    if (a.downed) { a.downed = false; a.hp = Math.round(a.maxHp * 0.5); Object.assign(X.rec(a.id), { heal: a.hp, revived: true }); }
    else X.heal(a, p.heal);
  },
  judgement(X, p) { const e = X.enemy(), u = C.UNDEAD.includes(e.kind), r = X.hit(e, p.dmg * (u ? 2 : 1)); if (u) r.crit = true; },
  renewal(X, p) { for (const h of X.heroes()) { X.heal(h, p.heal); X.status(h, 'regen', { v: X.n(p.heal), t: p.regenT }); } },
  sacred_flame(X, p) { const r = X.hit(X.enemy(), p.dmg); const a = lowestHero(X.run); if (a && r.dmg) X.heal(a, r.dmg, true); },
  resurrection(X, p) {
    for (const h of heroList(X.run)) {
      if (h.downed) { h.downed = false; h.hp = Math.round(h.maxHp * 0.5); Object.assign(X.rec(h.id), { heal: h.hp, revived: true }); }
      else X.heal(h, p.heal);
    }
  },
  divine_shield(X) { for (const h of X.heroes()) X.status(h, 'divine', { t: 1 }); },
  wrath_of_heaven(X, p) { for (const e of X.enemies()) X.hit(e, p.dmg); for (const h of X.heroes()) X.heal(h, p.heal); }
};

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

  const focusMult = 1 + C.focusStep(hero) * (hero.focus || 0);
  const usedFocus = hero.focus || 0;

  if (action === 'attack') {
    const e = pickEnemy(); hero.lastTarget = e.id;
    ev.fx = { knight: 'slash', mage: 'proj_arcane', ranger: 'proj_arrow', cleric: 'smite' }[hero.cls];
    ev.name = H.attack.name;
    ev.targets.push(hitEnemy(hero, e, (H.attack.dmg + (has(hero, 'whetstone') ? 2 : 0)) * focusMult)); touched.add(e.id);
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
  } else if (/^skill[0-2]$/.test(action)) {
    const sk = hero.skills[+action.slice(5)];
    if (!sk) return { ok: false, msg: 'No skill in that slot.' };
    const def = C.SKILLS[sk.id], fn = SKILL_FX[sk.id];
    if (!def || !fn) return { ok: false, msg: 'Unknown skill.' };
    const cost = C.skillCost(sk.id, hero);
    if ((hero.energy || 0) < cost) return { ok: false, msg: `${C.skillName(sk.id, sk.lvl)} needs ${cost} energy (you have ${hero.energy || 0}).` };
    ev.skill = sk.id; ev.name = C.skillName(sk.id, sk.lvl); ev.fx = def.fx; ev.rarity = def.rarity;
    const free = hero.st.surge && sk.id !== 'mana_surge';
    fn(skillCtx(run, hero, ev, touched, pickEnemy, pickAlly, focusMult, usedFocus), C.skillParams(sk.id, sk.lvl));
    if (free) { delete hero.st.surge; ev.surged = true; }   // Mana Surge's free cast is used up
    hero.energy = Math.max(0, (hero.energy || 0) - cost); ev.energy = -cost;
    hero.focus = 0; ev.focus = usedFocus;
    if (hero.stats) hero.stats.skills++;
  } else return { ok: false, msg: 'Unknown action.' };

  // Vampire Fang: a little life back from any action that drew blood
  if (action !== 'defend' && has(hero, 'vampire_fang') && !hero.downed && ev.targets.some(t => t.dmg > 0 && !run.heroes[t.id])) {
    const r = healHero(hero, hero, 2);
    if (r.heal) { let rec = ev.targets.find(t => t.id === hero.id); if (!rec) ev.targets.push(rec = { id: hero.id }); rec.heal = (rec.heal || 0) + r.heal; rec.fang = true; }
  }

  // A boss dying takes its crystals with it.
  const boss = c.enemies.find(e => e.tier === 'boss');
  if (boss && boss.dead) for (const e of c.enemies) if (e.tier === 'minion' && !e.dead) { e.dead = true; e.hp = 0; ev.targets.push({ id: e.id, dmg: 0, killed: true, shatter: true }); touched.add(e.id); }
  hero.acted = true;
  done();
  return { ok: true };
}

// A wrong answer: the hero swings (or casts, or braces) and misses. Their turn is used up.
function whiff(run, hero, action, targetId, out) {
  const c = run.combat;
  const ev = { kind: 'hero', actor: hero.id, act: action, whiff: true, targets: [], after: {}, dur: MS.small };
  if (action === 'rise') { ev.name = 'Stumbled'; }
  else if (action === 'defend') { ev.name = 'Fumbled'; ev.fx = 'defend'; }
  else {
    const enemies = aliveEnemies(c);
    const e = (targetId && enemies.find(x => x.id === targetId)) || enemies.find(x => x.id === hero.lastTarget) || enemies[0];
    ev.name = 'Miss!';
    ev.fx = action === 'attack' ? ({ knight: 'slash', mage: 'proj_arcane', ranger: 'proj_arrow', cleric: 'smite' }[hero.cls]) : 'miss';
    if (e) ev.targets.push({ id: e.id, miss: true });
  }
  hero.acted = true;
  ev.after[hero.id] = snapEnt(hero);
  out.push(ev);
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
  if (boss && boss.dead) for (const e of c.enemies) if (e.tier === 'minion' && !e.dead) { e.dead = true; e.hp = 0; }

  for (const e of c.enemies) {
    if (e.dead || !e.intent) continue;
    if (!heroesAlive().length) break;
    const it = e.intent;
    e.mem.last = it.move;
    if (e.st.freeze || e.st.stun) {
      const stun = !e.st.freeze;
      delete e.st.freeze; delete e.st.stun;
      const o = ev({ kind: 'enemy', actor: e.id, act: 'frozen', fx: stun ? 'stun' : 'frozen', name: stun ? 'Stunned' : 'Frozen solid', targets: [], dur: MS.small });
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
        const h = targetHero(); if (!h || e.dead) break;   // Riposte can finish an attacker mid-combo
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
      if (it.qte) {
        // Quick-time strikes: each one is dodged by heroes who answered that prompt in time.
        const res = c.qteRes || {};
        o.qte = it.qte; o.wave = 0;
        let cur = o;
        for (let i = 0; i < it.qte; i++) {
          if (i > 0) { snapAll(cur, ids); cur = ev({ kind: 'enemy', actor: e.id, act: it.move, type: it.type, name: it.label + ` (${i + 1}/${it.qte})`, targets: [], dur: MS.enemy, qte: it.qte, wave: i }); }
          for (const h of heroesAlive()) {
            if (res[h.id] && res[h.id][i]) { cur.targets.push({ id: h.id, dmg: 0, dodged: true }); ids.add(h.id); }
            else { cur.targets.push(hitHero(e, h, dmg, { chilled })); ids.add(h.id); }
          }
        }
        c.qteRes = null;
        if (it.perShard) for (const sh of aliveEnemies(c).filter(x => x.kind === 'shard')) { sh.dead = true; sh.hp = 0; cur.targets.push({ id: sh.id, dmg: 0, killed: true, shatter: true }); ids.add(sh.id); }
        snapAll(cur, ids);
        continue;
      }
      let drained = 0;
      for (const h of heroesAlive()) { const r = hitHero(e, h, dmg, { chilled }); drained += r.dmg; o.targets.push(r); ids.add(h.id); }
      if (it.drain && drained) { const before = e.hp; e.hp = Math.min(e.maxHp, e.hp + drained); if (e.hp > before) o.targets.push({ id: e.id, heal: e.hp - before }); }
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
      const kind = it.minion || 'shard';
      if (kind === 'shard') for (const x of c.enemies) if (x.st) { delete x.st.weak; delete x.st.vuln; delete x.st.chill; }
      for (let i = 0; i < (it.count || 2); i++) {
        const s = makeEnemy(c, kind, c.mult);
        c.enemies.push(s); ids.add(s.id);
        o.targets.push({ id: s.id, summoned: true });
      }
      o.spawn = c.enemies.filter(x => x.kind === kind && !x.dead).map(publicEnemy);
    } else if (it.type === 'buff') {
      addStatus(e, 'str', { v: it.str || 3, t: 99 });
      if (it.block) e.block += it.block;
      o.targets.push({ id: e.id, block: it.block || 0, status: ['str'] });
      o.warn = it.warn;
    }
    snapAll(o, ids);
  }

  // a boss felled by Riposte or Thorned Mail takes its minions with it
  if (boss && boss.dead && out.length) for (const e of c.enemies) if (e.tier === 'minion' && !e.dead) { e.dead = true; e.hp = 0; snapAll(out[out.length - 1], [e.id]); }

  // Prayer of Mending and Renewal heal once the enemies have attacked.
  for (const h of aliveHeroes(run)) if (h.st.regen) {
    const r = healHero(null, h, h.st.regen.v);
    const o = ev({ kind: 'tick', actor: h.id, fx: 'regen', targets: [r], dur: MS.tick });
    snapAll(o, [h.id]);
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

module.exports = { createRaidCombat, whiff, createCombat, beginRound, heroAction, enemyTurn, combatOutcome, publicEnemy, aliveHeroes, aliveEnemies, heroList, needsToAct, MS };
