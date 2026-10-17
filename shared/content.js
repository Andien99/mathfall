/*
 * Mathfall game content: heroes, skills, enemies. Shared by server (rules) and
 * browser (names, descriptions, icons). Numbers here are the single source of truth.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MF_Content = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Loot rarity: the border colour of every skill and item card, the odds a chest or shop rolls it,
  // its shop price and the gold a chest offers instead.
  const RARITY = {
    common:    { name: 'Common',    color: '#b4bac4', weight: 60, price: 40,  gold: 35 },
    rare:      { name: 'Rare',      color: '#b46bff', weight: 30, price: 70,  gold: 55 },
    legendary: { name: 'Legendary', color: '#ff9a2e', weight: 10, price: 120, gold: 85 }
  };
  const RARITY_ORDER = ['common', 'rare', 'legendary'];
  const MAX_SKILLS = 3;   // heroes start with 2 skills and can carry 3

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

  // Energy powers Skill 1 and Skill 2. Basic actions charge it; it resets at the start of each fight.
  const ENERGY = { max: 10, start: 2, attack: 3, defend: 3, focus: 1 };

  // Every skill belongs to one class. Heroes start with their class's two starters (HEROES[cls].skills) and find
  // the rest in chests and shops: 8 common, 5 rare and 3 legendary per class (the Knight has a 4th legendary).
  // target: enemy | ally | party | allEnemies | self       cost: energy (legendaries cost 8 or more)
  // Numbers in `p` grow with upgrades (level 2 = x1.35). Durations (keys ending in T) and counts (ending in N) do not.
  const SKILLS = {
    // ================================================================= KNIGHT
    power_strike: { cls: 'knight', name: 'Power Strike', rarity: 'common', cost: 4, target: 'enemy', icon: 'sword_heavy', fx: 'slash_heavy', color: '#ffb35c',
      p: { dmg: 13, vulnT: 2 }, desc: p => `Deal ${p.dmg} damage. Target takes +50% damage for ${p.vulnT} rounds.` },
    shield_wall: { cls: 'knight', name: 'Shield Wall', rarity: 'common', cost: 5, target: 'party', icon: 'shield_wall', fx: 'shield_party', color: '#7fc8ff',
      p: { block: 7 }, desc: p => `Every hero gains ${p.block} block.` },
    shield_bash: { cls: 'knight', name: 'Shield Bash', rarity: 'common', cost: 3, target: 'enemy', icon: 'shield_bash', fx: 'slash', color: '#9fc4ff',
      p: { dmg: 6, weakT: 1 }, desc: p => `Deal ${p.dmg} damage. The target is Weak (deals 25% less) for ${p.weakT} round.` },
    cleave: { cls: 'knight', name: 'Cleave', rarity: 'common', cost: 4, target: 'enemy', icon: 'cleave', fx: 'slash_wide', color: '#ffd0a0',
      p: { dmg: 8 }, desc: p => `Deal ${p.dmg} damage to the target and the enemy beside it.` },
    iron_skin: { cls: 'knight', name: 'Iron Skin', rarity: 'common', cost: 3, target: 'self', icon: 'iron_skin', fx: 'shield_self', color: '#c8d4e8',
      p: { block: 12 }, desc: p => `Gain ${p.block} block. It doesn't fade at the start of next round.` },
    rallying_shout: { cls: 'knight', name: 'Rallying Shout', rarity: 'common', cost: 4, target: 'party', icon: 'rally', fx: 'rally_party', color: '#ffc08a',
      p: { block: 7, ally: 4 }, desc: p => `You gain ${p.block} block and every ally gains ${p.ally}.` },
    pommel_strike: { cls: 'knight', name: 'Pommel Strike', rarity: 'common', cost: 2, target: 'enemy', icon: 'pommel', fx: 'slash', color: '#e8d8b8',
      p: { dmg: 5, block: 4 }, desc: p => `Deal ${p.dmg} damage and gain ${p.block} block.` },
    sunder: { cls: 'knight', name: 'Sunder', rarity: 'common', cost: 3, target: 'enemy', icon: 'sunder', fx: 'slash_heavy', color: '#ff9a7a',
      p: { dmg: 7 }, desc: p => `Smash away all of the target's block, then deal ${p.dmg} damage.` },
    whirlwind: { cls: 'knight', name: 'Whirlwind', rarity: 'rare', cost: 5, target: 'allEnemies', icon: 'whirlwind', fx: 'whirl', color: '#d0f0ff',
      p: { dmg: 9 }, desc: p => `Spin through the enemy line: ${p.dmg} damage to every enemy.` },
    guardian_oath: { cls: 'knight', name: "Guardian's Oath", rarity: 'rare', cost: 5, target: 'self', icon: 'taunt', fx: 'taunt', color: '#ffd36b',
      p: { block: 14 }, desc: p => `Gain ${p.block} block. Every enemy attack targets you this round.` },
    battle_cry: { cls: 'knight', name: 'Battle Cry', rarity: 'rare', cost: 5, target: 'party', icon: 'battle_cry', fx: 'buff_party', color: '#ff9a7a',
      p: { str: 3, strT: 2 }, desc: p => `Every hero's attacks and skills deal +${p.str} damage for ${p.strT} rounds.` },
    shield_slam: { cls: 'knight', name: 'Shield Slam', rarity: 'rare', cost: 4, target: 'enemy', icon: 'shield_slam', fx: 'slash_heavy', color: '#8fc8ff',
      p: { dmg: 6 }, desc: p => `Deal ${p.dmg} damage plus your current block.` },
    riposte: { cls: 'knight', name: 'Riposte', rarity: 'rare', cost: 5, target: 'self', icon: 'riposte', fx: 'counter', color: '#ffe08a',
      p: { block: 10, thorns: 6 }, desc: p => `Gain ${p.block} block. Enemies that hit you this round take ${p.thorns} damage back.` },
    unbreakable: { cls: 'knight', name: 'Unbreakable', rarity: 'legendary', cost: 8, target: 'self', icon: 'unbreakable', fx: 'unbreakable', color: '#ffd36b',
      p: { block: 10 }, desc: p => `Gain ${p.block} block. Every enemy attack targets you this round at half damage, and you can't fall.` },
    earthshatter: { cls: 'knight', name: 'Earthshatter', rarity: 'legendary', cost: 8, target: 'allEnemies', icon: 'earthshatter', fx: 'quake', color: '#e0a060',
      p: { dmg: 16, weakT: 2 }, desc: p => `Smash the ground: ${p.dmg} damage to every enemy, and they are Weak for ${p.weakT} rounds.` },
    champions_combo: { cls: 'knight', name: "Champion's Combo", rarity: 'legendary', cost: 9, target: 'enemy', icon: 'combo', fx: 'combo', color: '#ffb347',
      p: { dmg: 6, finisher: 22, hitsN: 3 }, desc: p => `Three quick slashes of ${p.dmg}, then a finishing blow of ${p.finisher}.` },

    // ================================================================= MAGE
    fireball: { cls: 'mage', name: 'Fireball', rarity: 'common', cost: 4, target: 'enemy', icon: 'fireball', fx: 'proj_fire', color: '#ff7a2e',
      p: { dmg: 11, burn: 3, burnT: 2 }, desc: p => `Deal ${p.dmg} damage and Burn ${p.burn} for ${p.burnT} rounds.` },
    ice_shard: { cls: 'mage', name: 'Ice Shard', rarity: 'common', cost: 3, target: 'enemy', icon: 'ice_shard', fx: 'proj_ice', color: '#8fe3ff',
      p: { dmg: 8 }, desc: p => `Deal ${p.dmg} damage. Chill: its next attack deals half damage.` },
    arcane_missiles: { cls: 'mage', name: 'Arcane Missiles', rarity: 'common', cost: 4, target: 'allEnemies', icon: 'missiles', fx: 'missiles', color: '#b8a6ff',
      p: { dmg: 4, boltsN: 3 }, desc: p => `Fire ${p.boltsN} magic missiles of ${p.dmg} damage at random enemies.` },
    spark: { cls: 'mage', name: 'Spark', rarity: 'common', cost: 2, target: 'enemy', icon: 'spark', fx: 'proj_arcane', color: '#fff27a',
      p: { dmg: 6 }, desc: p => `Deal ${p.dmg} damage. Cheap and quick.` },
    frost_armour: { cls: 'mage', name: 'Frost Armour', rarity: 'common', cost: 3, target: 'self', icon: 'frost_armour', fx: 'shield_ice', color: '#a8f0ff',
      p: { block: 8 }, desc: p => `Gain ${p.block} block. Enemies that hit you this round are Chilled.` },
    kindle: { cls: 'mage', name: 'Kindle', rarity: 'common', cost: 3, target: 'enemy', icon: 'kindle', fx: 'proj_fire', color: '#ffb347',
      p: { dmg: 4, burn: 3, burnT: 2 }, desc: p => `Deal ${p.dmg} damage and double the target's Burn (or Burn ${p.burn} if it isn't burning).` },
    flame_wave: { cls: 'mage', name: 'Flame Wave', rarity: 'common', cost: 5, target: 'allEnemies', icon: 'flame_wave', fx: 'flamewave', color: '#ff8a3c',
      p: { dmg: 5, burn: 2, burnT: 2 }, desc: p => `Deal ${p.dmg} to every enemy and Burn ${p.burn} for ${p.burnT} rounds.` },
    frostbite: { cls: 'mage', name: 'Frostbite', rarity: 'common', cost: 3, target: 'enemy', icon: 'frostbite', fx: 'proj_ice', color: '#bff6ff',
      p: { dmg: 7 }, desc: p => `Deal ${p.dmg} damage and Chill. If it was already Chilled, it is Frozen instead (not bosses).` },
    lightning_bolt: { cls: 'mage', name: 'Lightning Bolt', rarity: 'rare', cost: 4, target: 'enemy', icon: 'lightning', fx: 'lightning', color: '#fff27a',
      p: { dmg: 15, chain: 6 }, desc: p => `Deal ${p.dmg} damage, then ${p.chain} to another enemy.` },
    frost_nova: { cls: 'mage', name: 'Frost Nova', rarity: 'rare', cost: 6, target: 'allEnemies', icon: 'frost_nova', fx: 'nova_ice', color: '#a8f0ff',
      p: { dmg: 6 }, desc: p => `Deal ${p.dmg} to every enemy and Freeze them: they skip their next action. Bosses are Chilled instead.` },
    mana_surge: { cls: 'mage', name: 'Mana Surge', rarity: 'rare', cost: 3, target: 'self', icon: 'mana_surge', fx: 'surge', color: '#9fd8ff',
      p: {}, desc: () => 'Your next skill this fight costs no energy.' },
    combust: { cls: 'mage', name: 'Combust', rarity: 'rare', cost: 5, target: 'enemy', icon: 'combust', fx: 'proj_fire', color: '#ff6a2a',
      p: { dmg: 10, blast: 8 }, desc: p => `Deal ${p.dmg} damage. If the target is Burning, it explodes: ${p.blast} damage to every other enemy.` },
    blizzard: { cls: 'mage', name: 'Blizzard', rarity: 'rare', cost: 5, target: 'allEnemies', icon: 'blizzard', fx: 'nova_ice', color: '#d8f8ff',
      p: { dmg: 7 }, desc: p => `Deal ${p.dmg} to every enemy and Chill them all.` },
    meteor: { cls: 'mage', name: 'Meteor', rarity: 'legendary', cost: 8, target: 'allEnemies', icon: 'meteor', fx: 'meteor', color: '#ff6a3d',
      p: { dmg: 18, burn: 4, burnT: 2 }, desc: p => `Deal ${p.dmg} to every enemy and Burn ${p.burn} for ${p.burnT} rounds.` },
    dragons_wrath: { cls: 'mage', name: "Dragon's Wrath", rarity: 'legendary', cost: 8, target: 'enemy', icon: 'dragon', fx: 'dragon', color: '#ff5030',
      p: { dmg: 34, burn: 5, burnT: 2 }, desc: p => `Deal ${p.dmg} damage and Burn ${p.burn} for ${p.burnT} rounds.` },
    time_stop: { cls: 'mage', name: 'Time Stop', rarity: 'legendary', cost: 8, target: 'allEnemies', icon: 'time_stop', fx: 'timestop', color: '#cfe8ff',
      p: { dmg: 12 }, desc: p => `Stop time: ${p.dmg} damage to every enemy and Freeze them all. Bosses are Chilled and Weak instead.` },

    // ================================================================= RANGER
    poison_arrow: { cls: 'ranger', name: 'Poison Arrow', rarity: 'common', cost: 4, target: 'enemy', icon: 'poison_arrow', fx: 'proj_poison', color: '#8fe05a',
      p: { dmg: 4, poison: 5 }, desc: p => `Deal ${p.dmg} damage and apply ${p.poison} Poison (damage each round, fading by 1).` },
    volley: { cls: 'ranger', name: 'Volley', rarity: 'common', cost: 4, target: 'allEnemies', icon: 'volley', fx: 'volley', color: '#e9d7a0',
      p: { dmg: 5 }, desc: p => `Deal ${p.dmg} damage to every enemy.` },
    aimed_shot: { cls: 'ranger', name: 'Aimed Shot', rarity: 'common', cost: 4, target: 'enemy', icon: 'aimed_shot', fx: 'proj_arrow', color: '#ffe9a0',
      p: { dmg: 12, bonus: 6 }, desc: p => `Deal ${p.dmg} damage, or ${p.dmg + p.bonus} if you used Focus ✦ first.` },
    twin_shot: { cls: 'ranger', name: 'Twin Shot', rarity: 'common', cost: 3, target: 'enemy', icon: 'twin_shot', fx: 'multishot', color: '#efe6d0',
      p: { dmg: 5, arrowsN: 2 }, desc: p => `Shoot ${p.arrowsN} arrows of ${p.dmg} damage.` },
    hunters_mark: { cls: 'ranger', name: "Hunter's Mark", rarity: 'common', cost: 2, target: 'enemy', icon: 'mark', fx: 'mark', color: '#ff6b6b',
      p: { mark: 3, markT: 2 }, desc: p => `Mark an enemy: it takes +${p.mark} damage from every hit for ${p.markT} rounds.` },
    smoke_bomb: { cls: 'ranger', name: 'Smoke Bomb', rarity: 'common', cost: 3, target: 'party', icon: 'smoke', fx: 'smoke', color: '#c8c4d8',
      p: { block: 4 }, desc: p => `Every hero gains ${p.block} block.` },
    fire_arrow: { cls: 'ranger', name: 'Fire Arrow', rarity: 'common', cost: 4, target: 'enemy', icon: 'fire_arrow', fx: 'proj_firearrow', color: '#ff8a3c',
      p: { dmg: 7, burn: 3, burnT: 2 }, desc: p => `Deal ${p.dmg} damage and Burn ${p.burn} for ${p.burnT} rounds.` },
    crippling_shot: { cls: 'ranger', name: 'Crippling Shot', rarity: 'common', cost: 3, target: 'enemy', icon: 'crippling', fx: 'proj_arrow', color: '#c7a2ff',
      p: { dmg: 6, weakT: 2 }, desc: p => `Deal ${p.dmg} damage. The target is Weak (deals 25% less) for ${p.weakT} rounds.` },
    shadow_strike: { cls: 'ranger', name: 'Shadow Strike', rarity: 'rare', cost: 4, target: 'enemy', icon: 'dagger', fx: 'shadow', color: '#c6a0ff',
      p: { dmg: 10 }, desc: p => `Deal ${p.dmg} damage. Double if the target is Poisoned or Burning.` },
    venom_storm: { cls: 'ranger', name: 'Venom Storm', rarity: 'rare', cost: 5, target: 'allEnemies', icon: 'venom_storm', fx: 'venom', color: '#9cff6b',
      p: { poison: 6 }, desc: p => `Apply ${p.poison} Poison to every enemy.` },
    pinning_shot: { cls: 'ranger', name: 'Pinning Shot', rarity: 'rare', cost: 5, target: 'enemy', icon: 'pinning', fx: 'proj_arrow', color: '#ffd36b',
      p: { dmg: 8 }, desc: p => `Deal ${p.dmg} damage. The target is Stunned and skips its next action. Bosses are Weak instead.` },
    arrow_rain: { cls: 'ranger', name: 'Arrow Rain', rarity: 'rare', cost: 5, target: 'allEnemies', icon: 'arrow_rain', fx: 'arrowrain', color: '#e9d7a0',
      p: { dmg: 5, wavesN: 2 }, desc: p => `Arrows rain down twice: ${p.dmg} damage to every enemy each time.` },
    ricochet: { cls: 'ranger', name: 'Ricochet', rarity: 'rare', cost: 4, target: 'enemy', icon: 'ricochet', fx: 'ricochet', color: '#fff2c0',
      p: { dmg: 10 }, desc: p => `An arrow bounces between enemies: ${p.dmg}, then ${Math.round(p.dmg * 0.7)}, then ${Math.round(p.dmg * 0.5)} damage.` },
    starfall: { cls: 'ranger', name: 'Starfall', rarity: 'legendary', cost: 8, target: 'allEnemies', icon: 'starfall', fx: 'starfall', color: '#fff0a8',
      p: { dmg: 8, hits: 3 }, desc: p => `Call down the stars: ${p.dmg} damage to every enemy, 3 times.` },
    phantom_volley: { cls: 'ranger', name: 'Phantom Volley', rarity: 'legendary', cost: 8, target: 'allEnemies', icon: 'phantom', fx: 'phantom', color: '#a8ffe0',
      p: { dmg: 6, poison: 2, arrowsN: 6 }, desc: p => `Fire ${p.arrowsN} ghost arrows of ${p.dmg} damage at random enemies. Each adds ${p.poison} Poison.` },
    deadeye: { cls: 'ranger', name: 'Deadeye', rarity: 'legendary', cost: 8, target: 'enemy', icon: 'deadeye', fx: 'proj_arrow', color: '#ff6b6b',
      p: { dmg: 22 }, desc: p => `A perfect shot: ${p.dmg} damage, doubled if the target is Poisoned, Burning or Marked.` },

    // ================================================================= CLERIC
    healing_light: { cls: 'cleric', name: 'Healing Light', rarity: 'common', cost: 4, target: 'ally', icon: 'heal', fx: 'heal', color: '#9dffb0',
      p: { heal: 13 }, desc: p => `Heal an ally ${p.heal} HP. Tap an ally first, or it heals the most hurt.` },
    blessing: { cls: 'cleric', name: 'Blessing', rarity: 'common', cost: 5, target: 'party', icon: 'blessing', fx: 'bless_party', color: '#ffe9a0',
      p: { heal: 5, block: 4 }, desc: p => `Every hero heals ${p.heal} and gains ${p.block} block.` },
    holy_smite: { cls: 'cleric', name: 'Holy Smite', rarity: 'common', cost: 3, target: 'enemy', icon: 'holy_smite', fx: 'smite', color: '#fff2a8',
      p: { dmg: 8, heal: 4 }, desc: p => `Deal ${p.dmg} damage and heal yourself ${p.heal}.` },
    purify: { cls: 'cleric', name: 'Purify', rarity: 'common', cost: 3, target: 'ally', icon: 'purify', fx: 'heal', color: '#d8fff0',
      p: { heal: 6 }, desc: p => `Clear an ally's Weak and Vulnerable, and heal them ${p.heal}.` },
    ward_of_light: { cls: 'cleric', name: 'Ward of Light', rarity: 'common', cost: 3, target: 'ally', icon: 'ward', fx: 'ward', color: '#ffe9a0',
      p: { block: 12 }, desc: p => `An ally gains ${p.block} block. Tap an ally first, or it shields the most hurt.` },
    prayer_of_mending: { cls: 'cleric', name: 'Prayer of Mending', rarity: 'common', cost: 4, target: 'ally', icon: 'mending', fx: 'heal', color: '#9dffb0',
      p: { heal: 6 }, desc: p => `Heal an ally ${p.heal} now and ${p.heal} more after the enemies attack.` },
    radiance: { cls: 'cleric', name: 'Radiance', rarity: 'common', cost: 4, target: 'allEnemies', icon: 'radiance', fx: 'radiance', color: '#fff0a8',
      p: { dmg: 5, heal: 3 }, desc: p => `Deal ${p.dmg} to every enemy and heal every hero ${p.heal}.` },
    empower: { cls: 'cleric', name: 'Empower', rarity: 'common', cost: 3, target: 'ally', icon: 'empower', fx: 'empower', color: '#ff9a7a',
      p: { heal: 4, str: 3, strT: 2 }, desc: p => `An ally heals ${p.heal} and deals +${p.str} damage for ${p.strT} rounds.` },
    sanctuary: { cls: 'cleric', name: 'Sanctuary', rarity: 'rare', cost: 5, target: 'party', icon: 'sanctuary', fx: 'heal_party', color: '#b6ffcf',
      p: { heal: 10 }, desc: p => `Heal every hero ${p.heal} HP.` },
    phoenix_feather: { cls: 'cleric', name: 'Phoenix Feather', rarity: 'rare', cost: 6, target: 'ally', icon: 'phoenix', fx: 'revive', color: '#ffb347',
      p: { heal: 22 }, desc: p => `Revive a fallen ally at half HP, or heal an ally ${p.heal}.`, allowDowned: true },
    judgement: { cls: 'cleric', name: 'Judgement', rarity: 'rare', cost: 5, target: 'enemy', icon: 'judgement', fx: 'pillar', color: '#fff2a8',
      p: { dmg: 12 }, desc: p => `Deal ${p.dmg} damage. Double against the undead (skeletons, thralls and the Hollow King).` },
    renewal: { cls: 'cleric', name: 'Renewal', rarity: 'rare', cost: 5, target: 'party', icon: 'renewal', fx: 'heal_party', color: '#b6ffcf',
      p: { heal: 4, regenT: 2 }, desc: p => `Every hero heals ${p.heal} now, and ${p.heal} more after each of the next ${p.regenT} enemy turns.` },
    sacred_flame: { cls: 'cleric', name: 'Sacred Flame', rarity: 'rare', cost: 5, target: 'enemy', icon: 'sacred_flame', fx: 'smite', color: '#ffd25a',
      p: { dmg: 11 }, desc: p => `Deal ${p.dmg} damage. The most hurt hero heals that much.` },
    resurrection: { cls: 'cleric', name: 'Resurrection', rarity: 'legendary', cost: 8, target: 'party', icon: 'resurrection', fx: 'revive_party', color: '#ffe27a',
      p: { heal: 10 }, desc: p => `Revive every fallen hero at half HP, and heal everyone ${p.heal}.`, allowDowned: true },
    divine_shield: { cls: 'cleric', name: 'Divine Shield', rarity: 'legendary', cost: 8, target: 'party', icon: 'divine_shield', fx: 'divine', color: '#fff6c8',
      p: {}, desc: () => 'A holy barrier: no hero takes damage from enemies this round.' },
    wrath_of_heaven: { cls: 'cleric', name: 'Wrath of Heaven', rarity: 'legendary', cost: 8, target: 'allEnemies', icon: 'wrath', fx: 'pillar', color: '#fff0a8',
      p: { dmg: 4, hitsN: 4, heal: 8 }, desc: p => `A pillar of light over the whole battlefield strikes every enemy ${p.hitsN} times for ${p.dmg}, and every hero heals ${p.heal}.` }
  };
  const UNDEAD = ['skeleton', 'thrall', 'hollowking'];

  // Items are passive: once found they work every fight for the rest of the run. Any class can carry any item.
  const ITEMS = {
    lucky_coin:      { name: 'Lucky Coin', rarity: 'common', icon: 'lucky_coin', desc: '+25% gold from every won fight.' },
    whetstone:       { name: 'Whetstone', rarity: 'common', icon: 'whetstone', desc: 'Your basic attack deals +2 damage.' },
    energy_crystal:  { name: 'Energy Crystal', rarity: 'common', icon: 'energy_crystal', desc: 'Start every fight with +2 energy.' },
    sturdy_boots:    { name: 'Sturdy Boots', rarity: 'common', icon: 'boots', desc: 'Start every fight with 5 block.' },
    chalk_pouch:     { name: 'Chalk Pouch', rarity: 'common', icon: 'chalk', desc: 'Your first correct answer in each fight gives +2 energy.' },
    bandage_roll:    { name: 'Bandage Roll', rarity: 'common', icon: 'bandage', desc: 'Heal 5 HP after every won fight.' },
    thorned_mail:    { name: 'Thorned Mail', rarity: 'rare', icon: 'thorned_mail', desc: 'Enemies that hit you take 3 damage.' },
    focus_lens:      { name: 'Focus Lens', rarity: 'rare', icon: 'focus_lens', desc: 'Each Focus ✦ adds +45% instead of +30%.' },
    healers_satchel: { name: "Healer's Satchel", rarity: 'rare', icon: 'satchel', desc: 'Healing you receive is 30% stronger.' },
    vampire_fang:    { name: 'Vampire Fang', rarity: 'rare', icon: 'fang', desc: 'Heal 2 whenever your attack or skill deals damage.' },
    spare_potion:    { name: 'Spare Potion', rarity: 'rare', icon: 'potion', desc: 'Once per fight, heal 10 when you drop below 25% HP.' },
    trolls_belt:     { name: "Troll's Belt", rarity: 'rare', icon: 'belt', desc: '+10 max HP.', maxHp: 10 },
    phoenix_plume:   { name: 'Phoenix Plume', rarity: 'legendary', icon: 'plume', desc: 'Once per run, when you fall you get straight back up at half HP.' },
    sages_crown:     { name: "Sage's Crown", rarity: 'legendary', icon: 'crown', desc: 'Your skills cost 1 less energy.' },
    infinity_pencil: { name: 'Infinity Pencil', rarity: 'legendary', icon: 'pencil', desc: 'Every correct answer in a fight gives +1 extra energy.' }
  };
  const hasItem = (hero, id) => !!(hero && hero.items && hero.items.includes(id));

  function skillParams(id, level) {
    const s = SKILLS[id]; if (!s) return {};
    const out = {};
    for (const k in s.p) {
      const v = s.p[k];
      out[k] = (level > 1 && !/[TN]$/.test(k) && k !== 'hits') ? Math.round(v * 1.35) : v;
    }
    return out;
  }
  // Energy a hero pays for a skill: Mana Surge makes the next one free, Sage's Crown takes 1 off.
  function skillCost(id, hero) {
    const s = SKILLS[id]; if (!s) return 99;
    if (hero && hero.st && hero.st.surge && id !== 'mana_surge') return 0;
    return Math.max(1, s.cost - (hasItem(hero, 'sages_crown') ? 1 : 0));
  }
  const focusStep = hero => hasItem(hero, 'focus_lens') ? 0.45 : 0.3;
  const classSkills = cls => Object.keys(SKILLS).filter(id => SKILLS[id].cls === cls);
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
    minotaur: { name: 'The Minotaur', title: 'Lord of the Labyrinth', hp: 230, size: 'xl', kind: 'boss' },
    wyrm:     { name: 'Gravemaw', title: 'the Crystal Wyrm', hp: 230, size: 'xl', kind: 'boss' },
    colossus: { name: 'The Iron Colossus', title: 'Warden of the Middle Floors', hp: 250, size: 'xl', kind: 'boss' },
    hollowking: { name: 'The Hollow King', title: 'Lord of the High Crypt', hp: 240, size: 'xl', kind: 'boss' },
    thrall:   { name: 'Bone Thrall', hp: 14, size: 's', kind: 'minion' },
    voidmaw:  { name: 'Inferno Dragon', title: 'Heart of the Tower', hp: 130, size: 'xl', kind: 'raid' },
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
    taunt:  { name: 'Taunting', color: '#ffd36b', desc: 'Enemies must target this hero.' },
    mark:   { name: 'Marked', color: '#ff6b6b', desc: 'Takes extra damage from every hit.' },
    stun:   { name: 'Stunned', color: '#ffe08a', desc: 'Skips its next action.' },
    regen:  { name: 'Mending', color: '#9dffb0', desc: 'Heals after the enemies attack.' },
    steady: { name: 'Iron Skin', color: '#c8d4e8', desc: 'Block does not fade next round.' },
    thorns: { name: 'Riposte', color: '#ffe08a', desc: 'Enemies that hit this hero take damage back.' },
    frost:  { name: 'Frost Armour', color: '#a8f0ff', desc: 'Enemies that hit this hero are Chilled.' },
    unbreak:{ name: 'Unbreakable', color: '#ffd36b', desc: 'Takes half damage and cannot fall this round.' },
    divine: { name: 'Divine Shield', color: '#fff6c8', desc: 'Takes no damage from enemies this round.' },
    surge:  { name: 'Mana Surge', color: '#9fd8ff', desc: 'The next skill costs no energy.' }
  };


  // After every won fight each hero picks one permanent upgrade (kept until the run is lost).
  const STATS = {
    atk: { name: 'Attack', icon: 'sword_heavy', color: '#ff9a6a', desc: '+15% damage from attacks and skills.' },
    def: { name: 'Defence', icon: 'shield_wall', color: '#7fc8ff', desc: '+15% block gained and 6% less damage taken.' },
    hp:  { name: 'Health', icon: 'heart', color: '#7ee08a', desc: '+6 max HP, and heal 6 now.' }
  };
  const STAT_STEP = { atk: 0.15, defBlock: 0.15, defCut: 0.06, defCutMax: 0.36, hp: 6 };

  // Campfire choices.
  const CAMP = {
    rest:     { name: 'Rest', icon: 'heal', color: '#6fbf73', desc: 'Heal 35% of your max HP.' },
    train:    { name: 'Train', icon: 'sword_heavy', color: '#e0635a', desc: 'Upgrade one skill (+35% power).' },
    meditate: { name: 'Meditate', icon: 'focus', color: '#8a7fe0', desc: 'Start the next fight with full energy and Focus ✦.' }
  };

  // "?" rooms. Text markup: [red]…[/] [gold]…[/] [green]…[/] [blue]…[/] [purple]…[/].
  // art: an image in /art/events/, or "scene:<name>" for one drawn by the game.
  // quiz: the option asks a question; the outcome depends on the answer.
  const EVENTS = {
    nest: {
      title: "Wyvern's Nest", art: 'nest.png',
      text: 'You spot an enormous [red]Crag Wyvern[/] chase off a smaller one.\nIn the nest it left behind, a [gold]single speckled egg[/] lies unguarded.\nYour stomach rumbles…',
      options: [
        { id: 'eat', label: 'Eat the Egg', desc: 'Gain [green]6 Max HP[/].' },
        { id: 'sell', label: 'Sell the Egg', desc: 'Gain [gold]45 gold[/].' }
      ]
    },
    vines: {
      title: 'Strangling Vines', art: 'vines.png',
      text: 'Having taken the wrong stair for a good while, you are lost in a tangle of [green]ferns[/] and [green]vines[/]. Especially vines.\nSomething with [red]red eyes[/] watches from the leaves.\n[purple]"Turn back, little climber…"[/]',
      options: [
        { id: 'hack', label: 'Hack Through', desc: 'Lose [red]8 HP[/]. Start the next fight with [gold]+4 energy[/].' },
        { id: 'around', label: 'Find Another Way', desc: 'Lose [gold]15 gold[/].', safe: true }
      ]
    },
    shrine: {
      title: 'Shrine of Numbers', art: 'shrine.png',
      text: 'A cracked altar hums with [gold]golden numerals[/] that drift like fireflies.\nA voice asks for a single correct answer.',
      options: [
        { id: 'pray', label: 'Pray', desc: 'Answer a question. Right: heal [green]20%[/] and gain [gold]35 gold[/]. Wrong: nothing happens.', quiz: true },
        { id: 'leave', label: 'Bow and Leave', desc: 'Nothing happens.', safe: true }
      ]
    },
    dealer: {
      title: 'The Grinning Dealer', art: 'dealer.png',
      text: 'A [red]grinning imp[/] slides three cups across a table of coins.\n[purple]"Answer my question and double your money. Get it wrong, and it\'s mine!"[/]',
      options: [
        { id: 'bet', label: 'Wager 30 Gold', desc: 'Answer a question. Right: win [gold]30 gold[/]. Wrong: lose [red]30 gold[/].', quiz: true, needGold: 30, risky: true },
        { id: 'walk', label: 'Walk Away', desc: 'Nothing happens.', safe: true }
      ]
    },
    library: {
      title: 'Forgotten Library', art: 'library.png',
      text: 'Dusty shelves climb out of sight. On a stone lectern, a [blue]glowing tome[/] turns its own pages.',
      options: [
        { id: 'study', label: 'Study the Tome', desc: 'Upgrade a random skill. Lose [red]6 HP[/].' },
        { id: 'nook', label: 'Rest in the Reading Nook', desc: 'Heal [green]15%[/] of your HP.', safe: true }
      ]
    },
    mimic: {
      title: 'The Suspicious Chest', art: 'mimic.png',
      text: 'A [gold]gold-trimmed chest[/] sits alone in an empty room.\nWas that… a [red]tongue[/]?',
      options: [
        { id: 'open', label: 'Open It', desc: '[green]60%[/]: a whetstone inside, [gold]+1 Attack level[/]. [red]40%[/]: it bites! Lose [red]12 HP[/].', risky: true },
        { id: 'leave', label: 'Leave It Alone', desc: 'Nothing happens.', safe: true }
      ]
    },
    adventurer: {
      title: 'The Fallen Adventurer', art: 'adventurer.png',
      text: 'A [blue]fallen adventurer[/] rests against the wall, pack still on their back.\nA thin [red]tripwire[/] glints beside it…',
      options: [
        { id: 'search', label: 'Search the Pack', desc: 'Answer a question. Right: gain [gold]50 gold[/]. Wrong: the trap springs, lose [red]10 HP[/].', quiz: true, risky: true },
        { id: 'respect', label: 'Pay Your Respects', desc: 'Heal [green]10 HP[/].', safe: true }
      ]
    },
    fountain: {
      title: 'Moonlit Fountain', art: 'fountain.png',
      text: 'Moonlight pours through a broken window into a fountain of [blue]silver water[/].\nIt smells of rain and old magic.',
      options: [
        { id: 'deep', label: 'Drink Deeply', desc: 'Heal to [green]full HP[/]. Lose [red]4 Max HP[/].' },
        { id: 'sip', label: 'Take a Sip', desc: 'Heal [green]20%[/] of your HP.', safe: true }
      ]
    },
    forge: {
      title: 'Abandoned Forge', art: 'forge.png',
      text: 'The coals of an old [red]forge[/] still glow.\nA hammer lies on the anvil, as if the smith just stepped out.',
      options: [
        { id: 'sharpen', label: 'Sharpen Your Weapon', desc: 'Lose [red]8 HP[/]. Gain [gold]+1 Attack level[/].' },
        { id: 'armour', label: 'Reinforce Your Armour', desc: 'Pay [gold]40 gold[/]. Gain [blue]+1 Defence level[/].', needGold: 40 },
        { id: 'leave', label: 'Move On', desc: 'Nothing happens.', safe: true }
      ]
    },
    ambush: {
      title: 'Ambush!', art: 'ambush.png',
      text: '[red]Monsters[/] leap from the shadows of the stairwell!\nYour team has a moment to decide.',
      team: true,
      options: [
        { id: 'fight', label: 'Stand and Fight', desc: 'Battle together. Winners gain [gold]+20 bonus gold[/].' },
        { id: 'sneak', label: 'Sneak Past', desc: 'Answer a question. If nobody fights and every sneak is right, the team slips past. Otherwise everyone fights, and sneaks who missed lose [red]5 HP[/].', quiz: true, risky: true }
      ]
    }
  };

  // Quick-time arithmetic for big enemy moves: + - x / with friendly numbers.
  function qteQuestion(level) {
    const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const op = ['+', '−', '×', '÷'][r(0, 3)];
    const hard = level > 1;
    if (op === '+') { const a = r(12, hard ? 89 : 49), b = r(5, hard ? 59 : 39); return { q: `${a} + ${b}`, a: a + b }; }
    if (op === '−') { const a = r(25, hard ? 99 : 70), b = r(4, a - 5); return { q: `${a} − ${b}`, a: a - b }; }
    if (op === '×') { const a = r(2, hard ? 12 : 9), b = r(3, 12); return { q: `${a} × ${b}`, a: a * b }; }
    const b = r(2, hard ? 12 : 9), a = r(2, 12); return { q: `${a * b} ÷ ${b}`, a };
  }

  // Each map ends in a boss; beating it starts the next act on a new map with the next boss.
  const BOSS_ORDER = ['minotaur', 'colossus', 'hollowking'];
  const ACT_NAMES = ['The Crumbling Spire', 'The Iron Galleries', 'The Hollow Crown', 'The Sunless Heights', 'The Shattered Crown', 'The Last Stair'];
  function bossForAct(act) { return BOSS_ORDER[act % BOSS_ORDER.length]; }

  const NODE_TYPES = {
    enemy:    { name: 'Monsters' },
    elite:    { name: 'Elite' },
    treasure: { name: 'Treasure' },
    rest:     { name: 'Campfire' },
    merchant: { name: 'Merchant' },
    unknown:  { name: 'Unknown' },
    boss:     { name: 'Boss' }
  };

  return { BOSS_ORDER, ACT_NAMES, bossForAct, STATS, STAT_STEP, CAMP, EVENTS, qteQuestion, ENERGY, RARITY, RARITY_ORDER, MAX_SKILLS, HEROES, HERO_ORDER, SKILLS, ITEMS, UNDEAD, ENEMIES, STATUS_INFO, NODE_TYPES, skillParams, skillDesc, skillName, skillCost, focusStep, classSkills, hasItem };
});
