// Question sets, selection (adaptive, no quick repeats, shuffled options) and marking.
const { mark } = require('../shared/answers');
const G = require('../shared/generators');
const { resolveImage } = require('./qimages');

const TIPS = [
  [/identif|like term/i, 'Like terms have exactly the same letters and powers. The number in front can be different: $xy$ and $yx$ are like terms, $x$ and $x^{2}$ are not.'],
  [/collect|simplif/i, 'Add or subtract the numbers in front of like terms. Keep different letter parts apart, and keep plain numbers apart.'],
  [/coeffic|constant|term/i, 'Terms are separated by + and − signs. The coefficient is the number in front of a letter (no number means 1). A constant has no letter.'],
  [/substitut|evaluat/i, 'Swap each letter for its number, then follow the order of operations: brackets, powers, × and ÷, then + and −.'],
  [/equivalen|expand/i, 'Equivalent expressions are equal for every value of the letters. Simplify or expand both, then compare.'],
  [/integer|negative|directed/i, 'Same signs multiply to a positive, different signs to a negative. Subtracting a negative is the same as adding.'],
  [/equation|solv/i, 'Do the same thing to both sides. Undo + and − first, then × and ÷.'],
  [/index|indices|power/i, 'Multiplying: add the indices. Dividing: subtract them. Power of a power: multiply them.'],
  [/percent/i, 'Percent means out of 100. 10% is ÷ 10, 5% is half of 10%, 1% is ÷ 100.'],
  [/fraction/i, 'Add and subtract with a common denominator. Multiply tops and bottoms. To divide, flip the second fraction and multiply.']
];
function tipFor(skill) {
  for (const [re, tip] of TIPS) if (re.test(skill || '')) return tip;
  return 'Read the question again slowly and check each step.';
}

function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }

// Accepts Mathfall and Flurry Fight question formats.
function normaliseQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const q = clip(raw.q != null ? raw.q : raw.question, 800).trim();
  if (!q) return null;
  const skill = clip(raw.skill || '', 80).trim();
  const hint = clip(raw.hint || '', 400).trim();
  const solution = clip(raw.solution || raw.worked || '', 800).trim();
  const image = resolveImage(raw.image || raw.img || '');
  const imageAlt = image ? clip(raw.imageAlt || raw.alt || '', 300).trim() : '';
  const pic = image ? { image, imageAlt } : {};
  let type = raw.type === 'text' || raw.type === 'typed' ? 'text' : raw.type === 'mc' ? 'mc' : (Array.isArray(raw.options) && raw.options.length > 1 ? 'mc' : 'text');
  if (type === 'mc') {
    const options = (Array.isArray(raw.options) ? raw.options : []).map(o => clip(o, 200).trim()).filter(Boolean).slice(0, 6);
    let correct = raw.correct;
    if (typeof correct === 'string' && !/^\d+$/.test(correct)) correct = options.indexOf(correct.trim());
    correct = parseInt(correct, 10);
    if (options.length < 2 || !(correct >= 0 && correct < options.length)) return null;
    return { type, q, options, correct, skill, hint, solution, ...pic };
  }
  let answers = raw.answers != null ? raw.answers : raw.answer;
  if (!Array.isArray(answers)) answers = answers == null ? [] : String(answers).split('|');
  answers = answers.map(a => clip(a, 120).trim()).filter(Boolean).slice(0, 8);
  if (!answers.length) return null;
  return { type, q, answers, skill, hint, solution, ...pic };
}

function normaliseSet(raw) {
  if (!raw || typeof raw !== 'object') return { title: 'Untitled', main: [], modified: [] };
  const list = a => (Array.isArray(a) ? a : []).slice(0, 500).map(normaliseQuestion).filter(Boolean);
  return { id: clip(raw.id || '', 80), title: clip(raw.title || 'Untitled set', 120), main: list(raw.questions || raw.main), modified: list(raw.modified) };
}

// config: { sets: [rawSet], gens: [{topic, level}], format: 'mix'|'mc'|'text' (generators only), hints: bool }
class QuestionService {
  constructor(config) {
    this.hints = config.hints !== false;
    this.format = ['mc', 'text', 'mix'].includes(config.format) ? config.format : 'mix';
    this.sets = (config.sets || []).map(normaliseSet);
    this.gens = (config.gens || []).filter(g => G.TOPICS[g.topic]).map(g => ({ topic: g.topic, level: Math.max(1, Math.min(3, g.level | 0 || 2)) }));
    this.main = []; this.modified = [];
    this.sets.forEach((s, si) => {
      s.main.forEach((q, i) => this.main.push({ key: `s${si}m${i}`, q }));
      s.modified.forEach((q, i) => this.modified.push({ key: `s${si}x${i}`, q }));
    });
    this.title = [...this.sets.map(s => s.title), ...this.gens.map(g => G.TOPICS[g.topic].name)].join(' + ') || 'No questions';
    this.seq = 0;
  }

  get isEmpty() { return !this.main.length && !this.gens.length && !this.modified.length; }
  hasModified() { return this.modified.length > 0 || this.gens.length > 0; }

  summary() {
    return { title: this.title, main: this.main.length, modified: this.modified.length, gens: this.gens };
  }

  // track: 'main' | 'modified'
  pick(player, track) {
    let pool = track === 'modified' && this.modified.length ? this.modified : this.main;
    const useModifiedGen = track === 'modified';
    let fromGen = false;
    if (this.gens.length) {
      if (!pool.length) fromGen = true;
      else {
        const pGen = Math.min(0.6, Math.max(0.25, (this.gens.length * 10) / (this.gens.length * 10 + pool.length)));
        fromGen = Math.random() < pGen;
      }
    }
    if (!pool.length && !this.gens.length) pool = this.modified;
    if (fromGen) {
      const g = this.gens[Math.floor(Math.random() * this.gens.length)];
      const lvl = useModifiedGen ? Math.max(1, g.level - 1) : g.level;
      const q = G.generate(g.topic, lvl, this.format);
      return { key: `g:${g.topic}:${lvl}`, q, gen: true };
    }
    const seen = player.qseen || (player.qseen = {});
    const recent = player.recent || (player.recent = []);
    const avoid = new Set(recent.slice(-Math.min(12, Math.floor(pool.length / 2))));
    let best = [], bestCount = Infinity;
    for (const item of pool) {
      if (avoid.has(item.key)) continue;
      const c = seen[item.key] || 0;
      if (c < bestCount) { bestCount = c; best = [item]; } else if (c === bestCount) best.push(item);
    }
    if (!best.length) best = pool;
    return best[Math.floor(Math.random() * best.length)];
  }

  // Returns { pub, priv }. pub goes to the student; priv stays on the server.
  serve(player, track, kind) {
    const item = this.pick(player, track);
    if (!item) return null;
    const q = item.q;
    player.qseen = player.qseen || {}; player.recent = player.recent || [];
    if (!item.gen) {
      player.qseen[item.key] = (player.qseen[item.key] || 0) + 1;
      player.recent.push(item.key); if (player.recent.length > 30) player.recent.shift();
    }
    const qid = `q${++this.seq}${Math.random().toString(36).slice(2, 6)}`;
    const pub = { qid, kind, type: q.type, text: q.q, skill: q.skill || '', track };
    if (q.image) { pub.image = q.image; pub.imageAlt = q.imageAlt || ''; }
    const priv = { qid, key: item.key, q, type: q.type, track, servedAt: Date.now() };
    if (q.type === 'mc') {
      const order = q.options.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      pub.options = order.map(i => q.options[i]);
      priv.correctDisplay = order.indexOf(q.correct);
      priv.correctText = q.options[q.correct];
    } else {
      priv.answers = q.answers;
      priv.correctText = q.answers[0];
      // letters used in the question, for the on-screen keypad
      const math = (q.q.match(/\$[^$]*\$/g) || []).join(' ').replace(/\\[a-zA-Z]+/g, ' ');
      pub.letters = [...new Set((math.match(/[a-zA-Z]/g) || []).map(c => c.toLowerCase()))].slice(0, 6);
    }
    if (this.hints) pub.hint = q.hint || tipFor(q.skill);
    if (process.env.MATHFALL_TEST === '1') pub._answer = q.type === 'mc' ? priv.correctDisplay : priv.correctText;
    return { pub, priv };
  }

  check(priv, value) {
    if (priv.type === 'mc') return parseInt(value, 10) === priv.correctDisplay;
    return mark(String(value == null ? '' : value).slice(0, 120), priv.answers);
  }

  feedback(priv) {
    return { correctText: priv.correctText, solution: priv.q.solution || '', tip: tipFor(priv.q.skill), skill: priv.q.skill || '' };
  }
}

module.exports = { QuestionService, normaliseSet, normaliseQuestion, tipFor };
