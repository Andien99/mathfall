/*
 * Mathfall game content: heroes, skills, enemies. Shared by server (rules) and
 * browser (names, descriptions, icons). Numbers here are the single source of truth.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MF_Content = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RARITY = {
    common:    { name: 'Common',    color: '#d8d2c2', weight: 55, price: 45 },
    rare:      { name: 'Rare',      color: '#5aa8ff', weight: 30, price: 75 },
    epic:      { name: 'Epic',      color: '#bf7bff', weight: 12, price: 115 },
    legendary: { name: 'Legendary', color: '#ffc845', weight: 3,  price: 170 }
  };

  // Variants let two players pick the same class without looking identical.
  const HEROES = {
    knight: {
      name: 'Knight', hp: 48, blurb: 'Tough frontliner. Hits hard and shields the party.',
      attack: { name: 'Slash', dmg: 8, desc: 'Deal 8 damage.' },
      defend: { name: 'Guard', block: 10, desc: 'Gain 10 block. Tap an ally first to guard them instead.' },
      skills: ['power_strike', 'shield_wall'], role: 'Defence'
    },
    mage: {
      name: 'Mage', hp: 34, blurb: 'Fragile, but bends the battle with fire and ice.',
      attack: { name: 'Arcane Bolt', dmg: 7, desc: 'Deal 7 damage.' },
      defend: { name: 'Ward', block: 6, desc: 'Gain 6 block. Tap an ally first to ward them instead.' },
      skills: ['fireball', 'ice_shard'], role: 'Damage'
    },
    ranger: {
      name: 'Ranger', hp: 38, blurb: 'Precise shots, poison and arrows for every enemy.',
      attack: { name: 'Quick Shot', dmg: 7, desc: 'Deal 7 damage.' },
      defend: { name: 'Evade', block: 7, desc: 'Gain 7 block. Tap an ally first to cover them instead.' },
      skills: ['poison_arrow', 'volley'], role: 'Damage over time'
    },
    cleric: {
      name: 'Cleric', hp: 40, blurb: 'Keeps the party standing with light and blessings.',
      attack: { name: 'Smite', dmg: 5, heal: 3, desc: 'Deal 5 damage and heal the most hurt ally 3.' },
      defend: { name: 'Sanctify', block: 7, desc: 'Gain 7 block. Tap an ally first to protect them instead.' },
      skills: ['healing_light', 'blessing'], role: 'Healing'
    }
  };
  const HERO_ORDER = ['knight', 'mage', 'ranger', 'cleric'];

  // target: enemy | ally | party | allEnemies | self
  // Numbers in `p` scale with upgrades (level 2 = x1.35). Durations (keys ending in 'T') do not.
  const SKILLS = {
    // ---- common ----
    power_strike: { name: 'Power Strike', rarity: 'common', cd: 2, target: 'enemy', icon: 'sword_heavy', fx: 'slash_heavy', color: '#ffb35c',
      p: { dmg: 13, vulnT: 2 }, desc: p => `Deal ${p.dmg} damage. Target takes +50% damage for ${p.vulnT} rounds.` },
    shield_wall: { name: 'Shield Wall', rarity: 'common', cd: 3, target: 'party', icon: 'shield_wall', fx: 'shield_party', color: '#7fc8ff',
      p: { block: 7 }, desc: p => `Every hero gains ${p.block} block.` },
    fireball: { name: 'Fireball', rarity: 'common', cd: 2, target: 'enemy', icon: 'fireball', fx: 'proj_fire', color: '#ff7a2e',
      p: { dmg: 11, burn: 3, burnT: 2 }, desc: p => `Deal ${p.dmg} damage and Burn ${p.burn} for ${p.burnT} rounds.` },
    ice_shard: { name: 'Ice Shard', rarity: 'common', cd: 1, target: 'enemy', icon: 'ice_shard', fx: 'proj_ice', color: '#8fe3ff',
      p: { dmg: 8 }, desc: p => `Deal ${p.dmg} damage. Chill: its next attack deals half damage.` },
    poison_arrow: { name: 'Poison Arrow', rarity: 'common', cd: 2, target: 'enemy', icon: 'poison_arrow', fx: 'proj_poison', color: '#8fe05a',
      p: { dmg: 4, poison: 5 }, desc: p => `Deal ${p.dmg} damage and apply ${p.poison} Poison (damage each round, fading by 1).` },
    volley: { name: 'Volley', rarity: 'common', cd: 2, target: 'allEnemies', icon: 'volley', fx: 'volley', color: '#e9d7a0',
      p: { dmg: 5 }, desc: p => `Deal ${p.dmg} damage to every enemy.` },
    healing_light: { name: 'Healing Light', rarity: 'common', cd: 2, target: 'ally', icon: 'heal', fx: 'heal', color: '#9dffb0',
      p: { heal: 13 }, desc: p => `Heal an ally ${p.heal} HP. Tap an ally first, or it heals the most hurt.` },
    blessing: { name: 'Blessing', rarity: 'common', cd: 3, target: 'party', icon: 'blessing', fx: 'bless_party', color: '#ffe9a0',
      p: { heal: 5, block: 4 }, desc: p => `Every hero heals ${p.heal} and gains ${p.block} block.` },

    // ---- rare ----
    whirlwind: { name: 'Whirlwind', rarity: 'rare', cd: 3, target: 'allEnemies', icon: 'whirlwind', fx: 'whirl', color: '#d0f0ff',
      p: { dmg: 9 }, desc: p => `Spin through the enemy line: ${p.dmg} damage to every enemy.` },
    guardian_oath: { name: "Guardian's Oath", rarity: 'rare', cd: 3, target: 'self', icon: 'taunt', fx: 'taunt', color: '#ffd36b',
      p: { block: 14 }, desc: p => `Gain ${p.block} block. Every enemy attack targets you next round.` },
    lightning_bolt: { name: 'Lightning Bolt', rarity: 'rare', cd: 2, target: 'enemy', icon: 'lightning', fx: 'lightning', color: '#fff27a',
      p: { dmg: 15, chain: 6 }, desc: p => `Deal ${p.dmg} damage, then ${p.chain} to another enemy.` },
    sanctuary: { name: 'Sanctuary', rarity: 'rare', cd: 3, target: 'party', icon: 'sanctuary', fx: 'heal_party', color: '#b6ffcf',
      p: { heal: 10 }, desc: p => `Heal every hero ${p.heal} HP.` },
    shadow_strike: { name: 'Shadow Strike', rarity: 'rare', cd: 2, target: 'enemy', icon: 'dagger', fx: 'shadow', color: '#c6a0ff',
      p: { dmg: 10 }, desc: p => `Deal ${p.dmg} damage. Double if the target is Poisoned or Burning.` },
    battle_cry: { name: 'Battle Cry', rarity: 'rare', cd: 3, target: 'party', icon: 'battle_cry', fx: 'buff_party', color: '#ff9a7a',
      p: { str: 3, strT: 2 }, desc: p => `Every hero's attacks and skills deal +${p.str} damage for ${p.strT} rounds.` },

    // ---- epic ----
    frost_nova: { name: 'Frost Nova', rarity: 'epic', cd: 4, target: 'allEnemies', icon: 'frost_nova', fx: 'nova_ice', color: '#a8f0ff',
      p: { dmg: 6 }, desc: p => `Deal ${p.dmg} to every enemy and Freeze them: they skip their next action. Bosses are Chilled instead.` },
    meteor: { name: 'Meteor', rarity: 'epic', cd: 4, target: 'allEnemies', icon: 'meteor', fx: 'meteor', color: '#ff6a3d',
      p: { dmg: 16, burn: 3, burnT: 2 }, desc: p => `Deal ${p.dmg} to every enemy and Burn ${p.burn} for ${p.burnT} rounds.` },
    phoenix_feather: { name: 'Phoenix Feather', rarity: 'epic', cd: 4, target: 'ally', icon: 'phoenix', fx: 'revive', color: '#ffb347',
      p: { heal: 22 }, desc: p => `Revive a fallen ally at half HP, or heal an ally ${p.heal}.`, allowDowned: true },
    venom_storm: { name: 'Venom Storm', rarity: 'epic', cd: 3, target: 'allEnemies', icon: 'venom_storm', fx: 'venom', color: '#9cff6b',
      p: { poison: 6 }, desc: p => `Apply ${p.poison} Poison to every enemy.` },

    // ---- legendary ----
    starfall: { name: 'Starfall', rarity: 'legendary', cd: 4, target: 'allEnemies', icon: 'starfall', fx: 'starfall', color: '#fff0a8',
      p: { dmg: 7, hits: 3 }, desc: p => `Call down the stars: ${p.dmg} damage to every enemy, 3 times.` },
    aegis: { name: 'Aegis', rarity: 'legendary', cd: 4, target: 'party', icon: 'aegis', fx: 'aegis', color: '#ffe27a',
      p: { block: 14, heal: 8 }, desc: p => `Every hero gains ${p.block} block and heals ${p.heal}.` },
    dragons_wrath: { name: "Dragon's Wrath", rarity: 'legendary', cd: 3, target: 'enemy', icon: 'dragon', fx: 'dragon', color: '#ff5030',
      p: { dmg: 30, burn: 5, burnT: 2 }, desc: p => `Deal ${p.dmg} damage and Burn ${p.burn} for ${p.burnT} rounds.` }
  };

  function skillParams(id, level) {
    const s = SKILLS[id]; if (!s) return {};
    const out = {};
    for (const k in s.p) {
      const v = s.p[k];
      out[k] = (level > 1 && !/T$/.test(k) && k !== 'hits') ? Math.round(v * 1.35) : v;
    }
    return out;
  }
  function skillDesc(id, level) {
    const s = SKILLS[id]; if (!s) return '';
    return s.desc(skillParams(id, level || 1));
  }
  function skillName(id, level) {
    const s = SKILLS[id]; if (!s) return id;
    return s.name + (level > 1 ? '+' : '');
  }

  // Enemy roster. hp is for a party of four on floor 1.
  const ENEMIES = {
    slime:    { name: 'Mire Slime', hp: 24, size: 's', kind: 'normal' },
    goblin:   { name: 'Goblin Raider', hp: 22, size: 's', kind: 'normal' },
    skeleton: { name: 'Skeleton Warrior', hp: 30, size: 'm', kind: 'normal' },
    hexer:    { name: 'Goblin Hexer', hp: 20, size: 's', kind: 'normal' },
    sentinel: { name: 'Ironbound Sentinel', hp: 84, size: 'l', kind: 'elite' },
    wyrm:     { name: 'Gravemaw', title: 'the Crystal Wyrm', hp: 230, size: 'xl', kind: 'boss' },
    shard:    { name: 'Crystal Shard', hp: 16, size: 's', kind: 'minion' }
  };

  const STATUS_INFO = {
    burn:   { name: 'Burn', color: '#ff7a2e', desc: 'Takes damage each round.' },
    poison: { name: 'Poison', color: '#8fe05a', desc: 'Takes damage each round, fading by 1.' },
    weak:   { name: 'Weak', color: '#c7a2ff', desc: 'Deals 25% less damage.' },
    vuln:   { name: 'Vulnerable', color: '#ff6b8a', desc: 'Takes 50% more damage.' },
    chill:  { name: 'Chilled', color: '#8fe3ff', desc: 'Next attack deals half damage.' },
    freeze: { name: 'Frozen', color: '#cff6ff', desc: 'Skips its next action.' },
    str:    { name: 'Strength', color: '#ff9a7a', desc: 'Deals extra damage.' },
    taunt:  { name: 'Taunting', color: '#ffd36b', desc: 'Enemies must target this hero.' }
  };

  const NODE_TYPES = {
    enemy:    { name: 'Monsters' },
    elite:    { name: 'Elite' },
    treasure: { name: 'Treasure' },
    rest:     { name: 'Campfire' },
    merchant: { name: 'Merchant' },
    unknown:  { name: 'Unknown' },
    boss:     { name: 'Boss' }
  };

  return { RARITY, HEROES, HERO_ORDER, SKILLS, ENEMIES, STATUS_INFO, NODE_TYPES, skillParams, skillDesc, skillName };
});
