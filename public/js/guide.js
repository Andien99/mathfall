// Pawcal, the guide cat. A pixel cat who pops up at the side of the screen with one short tip at a time:
// what to press, what skills and items are, and a nudge when a student keeps tapping Attack with a skill ready.
//
// Tips are rules (TIPS below). Each has an id, a test on the current game state and the text to say. Most are
// shown once per device (remembered in localStorage); a few nudges repeat with a cooldown. Only one tip shows at
// a time, never while a question is open, and students can close it, turn tips off, or ask for help with the ?
// button. The teacher can turn tips off for the whole class in the game options.
import { h, $ } from './ui.js';

const NAME = 'Pawcal';
const SHEET = '/art/guide.png';
const F = { idle: [0, 1, 2, 3, 2, 1], talk: [4, 5, 6, 5, 7, 4], point: [8], cheer: [9] };   // frames in guide.png (tools/build_guide.py)
const SEEN_KEY = 'mf_tips_seen', OFF_KEY = 'mf_tips_off';
const GAP = 3500;            // quiet time between two tips
const NAG_EVERY = 40000;     // the skill nudge repeats at most this often
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window: tips just repeat */ } }
};

export class Guide {
  // opts: { C, sfx, questionOpen(), touch(), actionKeys(hero), actionInfo(hero, key) }
  constructor(opts) {
    this.o = opts;
    this.seen = new Set(store.get(SEEN_KEY, []));
    this.off = !!store.get(OFF_KEY, false);
    this.teacherOff = false;
    this.cur = null; this.lastHide = 0; this.lastNag = 0;
    this.basicStreak = 0; this.skillsUsed = 0; this.fightSeq = 0; this.nagsThisFight = 0;
    this.frame = 0; this.pose = 'idle'; this.talkUntil = 0;
    this.build();
    new Image().src = SHEET;   // load the sprite now so the first tip doesn't pop in blank
    setInterval(() => this.animate(), 140);
    addEventListener('resize', () => this.place());
  }

  // ---------------------------------------------------------------- DOM
  build() {
    this.cat = h('button', { class: 'gd-cat', 'aria-label': `${NAME} the guide cat`, onclick: () => this.cur ? this.dismiss(true) : null });
    this.cat.style.backgroundImage = `url(${SHEET})`;
    this.text = h('div', { class: 'gd-text' });
    this.bubble = h('div', { class: 'gd-bubble', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'gd-name' }, NAME),
      this.text,
      h('div', { class: 'gd-btns' },
        h('button', { class: 'gd-ok', onclick: () => this.dismiss(true) }, 'Got it'),
        h('button', { class: 'gd-mute', onclick: () => this.setOff(true) }, 'No more tips')));
    this.el = h('div', { id: 'guide', class: 'gd' }, this.cat, this.bubble);
    document.body.append(this.el);
  }
  animate() {
    const seq = this.pose === 'idle' && Date.now() < this.talkUntil ? F.talk : F[this.pose] || F.idle;
    this.frame = (this.frame + 1) % seq.length;
    this.cat.style.backgroundPositionX = `${seq[this.frame] / 9 * 100}%`;   // 10 frames: 0% is the first, 100% the last
    if (this.cur && Date.now() > this.cur.until) this.dismiss(false);
  }
  // Where the cat sits. Battles: beside the party card (desktop) or just above the action list (phones), on the
  // floor in front of the fighters. The tower map: top left, so the rooms you vote on stay clear. Rooms: bottom
  // left, over the loadout strip rather than the cards it is talking about.
  place() {
    if (!this.cur) return;
    const mobile = innerWidth < 700 || innerHeight > innerWidth;
    const st = this.el.style;
    const phase = (this.cur.where || '').split(':')[0];
    st.left = ''; st.top = ''; st.bottom = '';
    const top = phase === 'map';   // the vote nodes start at the bottom of the scroll
    this.el.classList.toggle('top', !!top);
    if (top) { st.top = (mobile ? 52 : 64) + 'px'; return; }
    const acts = document.getElementById('actions');
    const party = document.getElementById('party');
    const pr = party && party.getBoundingClientRect();
    if (phase === 'combat' && mobile && acts && acts.classList.contains('show')) { st.bottom = Math.max(12, innerHeight - acts.getBoundingClientRect().top + 6) + 'px'; return; }
    if (!mobile && pr && pr.width && pr.left < 260 && pr.top > innerHeight * 0.5) { st.left = Math.round(pr.right + 8) + 'px'; st.bottom = '6px'; return; }
    st.bottom = (pr && pr.height && pr.left < 260 && pr.top > innerHeight * 0.5 ? innerHeight - pr.top + 10 : 12) + 'px';
  }

  // ---------------------------------------------------------------- showing
  get enabled() { return !this.off && !this.teacherOff; }
  setOff(off) {
    this.off = off; store.set(OFF_KEY, off);
    if (off) this.dismiss(true);
  }
  show(tip) {
    this.cur = { ...tip, at: Date.now(), until: Date.now() + (tip.ms || Math.min(14000, 5000 + tip.text.length * 45)) };
    this.text.innerHTML = tip.text;
    this.pose = tip.pose || (tip.point ? 'point' : 'idle');
    this.talkUntil = Date.now() + 1800;
    document.body.dataset.gdhl = tip.point || '';
    this.el.classList.add('show');
    this.place();
    if (this.o.sfx) this.o.sfx('twinkle');
    if (tip.once !== false) { this.seen.add(tip.id); store.set(SEEN_KEY, [...this.seen]); }
    if (tip.nag) { this.lastNag = Date.now(); this.nagsThisFight++; }
  }
  dismiss(byUser) {
    if (!this.cur) return;
    this.cur = null; this.lastHide = Date.now();
    delete document.body.dataset.gdhl;
    this.el.classList.remove('show');
    if (byUser && this.o.sfx) this.o.sfx('click');
  }
  resetSeen() { this.seen.clear(); store.set(SEEN_KEY, []); this.setOff(false); }

  // ---------------------------------------------------------------- events from the game
  // A student chose an action. Attack or Defend while a skill was affordable counts towards the nudge.
  noteAction(action, hero) {
    if (!hero) return;
    if (action.startsWith('skill')) { this.basicStreak = 0; this.skillsUsed++; return; }
    if ((action === 'attack' || action === 'defend') && !hero.free && this.bestSkill(hero)) this.basicStreak++;
  }
  noteAnswer(res, intent) {
    if (!res || !res.ok || !intent) return;
    if (!res.correct && intent.kind !== 'event') this.pending = 'miss';
    else if (res.correct && intent.action && intent.action.startsWith('skill') && !this.seen.has('b_skill_used')) this.pending = 'skillUsed';
  }
  noteLearned(skillName) { this.pending = 'learned:' + skillName; }

  // The affordable skill with the biggest cost (usually the strongest), or null.
  bestSkill(hero) {
    const keys = this.o.actionKeys(hero).filter(k => k.startsWith('skill'));
    let best = null;
    for (const k of keys) {
      const info = this.o.actionInfo(hero, k);
      if (!(info.cost > 0 && info.cost <= (hero.energy || 0))) continue;
      // damage skills first (that is what replaces Attack), then the biggest cost
      const hits = info.target === 'enemy' || info.target === 'allEnemies' || /damage/i.test(info.desc);
      const score = (hits ? 100 : 0) + info.cost;
      if (!best || score > best.score) best = { k, info, hits, score, n: this.o.actionKeys(hero).indexOf(k) + 1 };
    }
    return best;
  }

  // Called after every state update. Picks at most one tip.
  update(ctx) {
    this.teacherOff = ctx.tips === false;
    if (!this.enabled) { if (this.cur) this.dismiss(false); return; }
    if (this.o.questionOpen()) { if (this.cur && !this.cur.keepWithQuestion) this.dismiss(false); return; }
    const run = ctx.run;
    // a new fight resets the per-fight nudges
    const fk = run && run.phase === 'combat' && run.combat ? run.map.pos + ':' + run.asc + ':' + (run.combat.type || '') : '';
    if (fk && fk !== this.fightKey) { this.fightKey = fk; this.basicStreak = 0; this.nagsThisFight = 0; }
    const where = run ? run.phase + ':' + (run.room ? run.room.type : '') : '';
    if (this.cur) {
      // drop a tip whose moment has passed (a new screen, already acted, ...)
      if (this.cur.where !== where) { this.dismiss(false); this.lastHide = 0; }
      else if (this.cur.still && !this.cur.still(ctx)) this.dismiss(false);
      else { this.place(); return; }
    }
    if (Date.now() - this.lastHide < GAP) return;
    const tip = this.pick(ctx);
    if (tip) this.show({ ...tip, where });
  }
  // The ? button: say the most useful thing for right now, even if it was said before.
  help(ctx) {
    if (this.off) this.setOff(false);
    const tip = this.pick(ctx, true) || { id: 'help', text: 'Answer maths questions to power your hero. Tap things to see what they do!' };
    const run = ctx.run;
    this.show({ ...tip, once: false, nag: false, ms: 14000, where: run ? run.phase + ':' + (run.room ? run.room.type : '') : '' });
  }

  // ---------------------------------------------------------------- the tips
  pick(ctx, forHelp) {
    const C = this.o.C;
    const run = ctx.run; const hero = ctx.hero; if (!run || !hero) return null;
    const touch = this.o.touch();
    const key = n => touch ? '' : ` <kbd>${n}</kbd>`;
    const tap = touch ? 'Tap' : 'Click';
    const fresh = id => forHelp || !this.seen.has(id);
    const T = (id, text, extra) => ({ id, text, ...extra });

    // things the student just did
    if (!forHelp && this.pending) {
      const p = this.pending; this.pending = null;
      if (p === 'miss' && fresh('b_miss')) return T('b_miss', 'Missed that one, so that turn is used up. Read the working, then have another go next round!');
      if (p === 'skillUsed') return T('b_skill_used', 'Nice! Skills are your big moves. Attack and Defend charge your energy, then you spend it on skills.', { pose: 'cheer', ms: 7000 });
      if (p.startsWith('learned:')) return T('learned', `You learned <b>${p.slice(8)}</b>! It shows up in your action list in the next battle.`, { pose: 'cheer', once: false, ms: 7000 });
    }

    if (run.phase === 'combat' && run.combat) {
      const c = run.combat;
      if (c.phase !== 'player') return null;
      const canAct = !hero.downed && !hero.acted && !hero.ready;
      const still = f => ({ still: f });
      if (hero.downed && fresh('b_downed')) return T('b_downed', `You've been knocked out! ${tap} <b>Get back up</b>${key(1)} and answer a question to rejoin the fight.`, { point: 'rise', ...still(x => x.hero && x.hero.downed) });
      if (canAct && fresh('b_start')) {
        const H = C.HEROES[hero.cls];
        return T('b_start', touch
          ? `${tap} <b>${H.attack.name}</b> to attack or <b>${H.defend.name}</b> to block. Then answer the question: get it right and your move happens!`
          : `Press <kbd>1</kbd> for <b>${H.attack.name}</b> or <kbd>2</kbd> for <b>${H.defend.name}</b> (or click them). Then answer the question: get it right and your move happens!`,
          { point: 'attack', ...still(x => x.hero && !x.hero.acted && !x.hero.ready) });
      }
      const best = canAct ? this.bestSkill(hero) : null;
      const skillTip = (id, lead, extra) => {
        const desc = best.info.desc.split(/(?<=\.)\s/)[0];
        const why = best.hits ? `Skills hit much harder than ${C.HEROES[hero.cls].attack.name}.` : 'Skills are your big moves.';
        return T(id, `${lead} <b>${best.info.name}</b>${key(best.n)}: ${desc} ${why}`,
          { point: best.k, ...still(x => x.hero && !x.hero.acted && !x.hero.ready && (x.hero.energy || 0) >= best.info.cost), ...extra });
      };
      if (best && fresh('b_skill_first')) return skillTip('b_skill_first', `You have <b>${hero.energy} energy</b>, enough for a skill! Try`);
      if (best && (hero.energy || 0) >= C.ENERGY.max && (forHelp || (fresh('b_energy_full') && this.basicStreak >= 1))) return skillTip('b_energy_full', 'Your energy is <b>full</b>, so any more is wasted. Spend it on', { once: !forHelp });
      if (best && !forHelp && this.basicStreak >= 2 && this.nagsThisFight < 2 && Date.now() - this.lastNag > NAG_EVERY && this.skillsUsed < 4)
        return skillTip('b_skill_spam', `Psst! You've saved up <b>${hero.energy} energy</b>. Use it on`, { once: false, nag: true });
      if (canAct && hero.free && fresh('b_free')) return T('b_free', `Correct answer bonus: your next <b>${C.HEROES[hero.cls].attack.name}</b> or <b>${C.HEROES[hero.cls].defend.name}</b> is <b>free</b>, no question needed!`, { point: 'attack', ms: 7000 });
      const living = c.enemies.filter(e => !e.dead);
      if (canAct && c.round >= 2 && living.some(e => e.intent) && fresh('b_intent'))
        return T('b_intent', `The tags above the enemies show what they will do next${living.length > 1 ? `. ${tap} an enemy to choose who you hit` : ''}. If a big hit is coming for you, <b>${C.HEROES[hero.cls].defend.name}</b> blocks it.`, { ms: 11000 });
      if (!canAct && !hero.downed && hero.acted && (hero.focus || 0) < 3 && fresh('b_focus') && c.round >= 1)
        return T('b_focus', `Waiting for your team? ${tap} <b>Focus</b>${key('F')} for bonus questions: each one makes your next hit stronger.`, { point: 'focus', ...still(x => x.hero && x.hero.acted) });
      if (c.type === 'boss' && canAct && fresh('b_boss'))
        return T('b_boss', 'A boss! Save energy for your strongest skills, and watch for its big attacks: answer the quick question fast to dodge them.', { ms: 10000 });
      if (forHelp) {
        if (!canAct && !hero.downed) return T('help', `You've acted this round. ${tap} <b>Focus</b>${key('F')} for bonus power while your team finishes.`, { point: 'focus' });
        return T('help', touch
          ? `${tap} an action, then answer the question. Attack and Defend give energy; skills spend it for big moves. ${tap} an enemy to target it, or a teammate to guard or heal them.`
          : `Keys <kbd>1</kbd> attack, <kbd>2</kbd> defend, <kbd>3</kbd>–<kbd>5</kbd> your skills, <kbd>F</kbd> Focus. Attack and Defend give energy; skills spend it. Click an enemy to target it.`, { point: 'attack' });
      }
      return null;
    }

    if (run.phase === 'map') {
      if (fresh('m_vote')) return T('m_vote', `${tap} a glowing room to vote where your team goes next. Most votes wins! Chests, shops and campfires help you; horned heads are tough elite fights.`, { ms: 11000 });
      return null;
    }

    const room = run.room;
    if (run.phase === 'room' && room) {
      if (room.type === 'treasure' && ctx.you && ctx.you.chest && ctx.you.chest.opened && !ctx.you.chest.decided && fresh('r_loot'))
        return T('r_loot', `Blue <b>SKILL</b> cards are new moves you pick in battle; they cost energy and you can hold ${C.MAX_SKILLS}. Green <b>ITEM</b> cards work by themselves, every fight, with no limit. Tap the gold to collect it (it's always yours), then pick a skill or an item.`, { point: 'cards', ms: 14000 });
      if (room.type === 'merchant' && fresh('r_shop'))
        return T('r_shop', `Pip sells blue <b>skills</b> (new moves for battle) and green <b>items</b> (always on, no slot needed). Spend your gold!`, { point: 'cards', ms: 12000 });
      if (room.type === 'rest' && fresh('r_rest'))
        return T('r_rest', '<b>Rest</b> heals you, <b>Train</b> makes one skill stronger, and <b>Meditate</b> starts your next fight with full energy.', { ms: 11000 });
      if ((room.type === 'victory' || room.type === 'complete') && fresh('r_upgrade'))
        return T('r_upgrade', 'You won! Pick an upgrade. It lasts for the whole climb.', { pose: 'cheer', ms: 8000 });
      if (forHelp) return T('help', `Pick what you want, then press the ready button. Blue cards are skills (moves you choose in battle); green cards are items (always on). Chest gold is always yours.`, {});
    }
    return null;
  }
}
