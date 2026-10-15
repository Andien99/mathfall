/*
 * Skill-based question generators. Each topic has three levels:
 *   1 Foundation, 2 Core, 3 Extension.
 * Wrong options are built from common mistakes. Every question has a worked solution.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MF_Generators = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const nz = (rng, a, b) => { let v; do { v = ri(rng, a, b); } while (v === 0); return v; };
  const paren = n => (n < 0 ? `(${n})` : `${n}`);
  const fmt = n => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
  const neg = n => (n < 0 ? `-${Math.abs(n)}` : `${n}`);
  const LET = ['x', 'a', 'm', 'k', 'n', 'p', 'y', 't'];

  // Build a question as multiple choice or typed.
  function finish(rng, format, base, answer, wrongs) {
    const wantMc = format === 'mc' || (format === 'mix' && rng() < 0.5) || base.mcOnly;
    if (wantMc) {
      const opts = [String(answer)];
      for (const w of wrongs) {
        const s = String(w);
        if (opts.length >= 4) break;
        if (!opts.includes(s)) opts.push(s);
      }
      let guard = 0;
      while (opts.length < 4 && guard++ < 20) {
        const n = parseFloat(answer);
        const s = Number.isFinite(n) ? fmt(n + nz(rng, -4, 4)) : String(answer) + guard;
        if (!opts.includes(s)) opts.push(s);
      }
      return { type: 'mc', q: base.q, options: opts.map(o => base.mathOpts ? `$${o.replace(/\^(-?\d+)/g, '^{$1}')}$` : o), correct: 0, skill: base.skill, solution: base.solution };
    }
    return { type: 'text', q: base.q, answers: [String(answer)], skill: base.skill, solution: base.solution };
  }

  const TOPICS = {
    integers: {
      name: 'Integers', year: 7, skill: 'Integers',
      levels: ['Add and subtract', 'Multiply and divide', 'Order of operations'],
      make(rng, level, format) {
        if (level === 1) {
          const a = nz(rng, -12, 12), b = nz(rng, -12, 12), op = pick(rng, ['+', '-']);
          const ans = op === '+' ? a + b : a - b;
          return finish(rng, format, { skill: 'Integers', q: `Calculate $${a} ${op} ${paren(b)}$.`,
            solution: op === '+' ? `$${a} + ${paren(b)} = ${ans}$.` : `Subtracting ${paren(b)} is the same as adding ${-b}: $${a} + ${paren(-b)} = ${ans}$.` },
            ans, [-ans, op === '+' ? a - b : a + b, ans + 1]);
        }
        if (level === 2) {
          const a = nz(rng, -9, 9), b = nz(rng, -9, 9);
          if (rng() < 0.5) {
            const ans = a * b;
            return finish(rng, format, { skill: 'Integers', q: `Calculate $${a} \\times ${paren(b)}$.`,
              solution: `${(a < 0) !== (b < 0) ? 'Different signs give a negative' : 'Same signs give a positive'}: $${a} \\times ${paren(b)} = ${ans}$.` },
              ans, [-ans, a + b, ans + (ans > 0 ? -2 : 2)]);
          }
          const prod = a * b;
          return finish(rng, format, { skill: 'Integers', q: `Calculate $${prod} \\div ${paren(b)}$.`,
            solution: `${(prod < 0) !== (b < 0) ? 'Different signs give a negative' : 'Same signs give a positive'}: $${prod} \\div ${paren(b)} = ${a}$.` },
            a, [-a, prod - b, a + 1]);
        }
        const a = nz(rng, -8, 8), b = nz(rng, -6, 6), c = nz(rng, -6, 6);
        const kind = ri(rng, 0, 2);
        if (kind === 0) {
          const ans = a + b * c;
          return finish(rng, format, { skill: 'Integers', q: `Calculate $${a} + ${paren(b)} \\times ${paren(c)}$.`,
            solution: `Multiply first: $${paren(b)} \\times ${paren(c)} = ${b * c}$. Then $${a} + ${paren(b * c)} = ${ans}$.` },
            ans, [(a + b) * c, a - b * c, -ans]);
        }
        if (kind === 1) {
          const ans = (a - b) * c;
          return finish(rng, format, { skill: 'Integers', q: `Calculate $(${a} - ${paren(b)}) \\times ${paren(c)}$.`,
            solution: `Brackets first: $${a} - ${paren(b)} = ${a - b}$. Then $${paren(a - b)} \\times ${paren(c)} = ${ans}$.` },
            ans, [a - b * c, (a + b) * c, -ans]);
        }
        const s = nz(rng, -7, -2), t = ri(rng, 1, 9);
        const ans = s * s - t;
        return finish(rng, format, { skill: 'Integers', q: `Calculate $(${s})^{2} - ${t}$.`,
          solution: `$(${s})^{2} = ${s} \\times ${paren(s)} = ${s * s}$. Then $${s * s} - ${t} = ${ans}$.` },
          ans, [-s * s - t, s * 2 - t, s * s + t]);
      }
    },

    equations: {
      name: 'Solving equations', year: 7, skill: 'Solving equations',
      levels: ['One step', 'Two steps', 'Both sides and brackets'],
      make(rng, level, format) {
        const v = pick(rng, LET);
        const x = nz(rng, level === 1 ? 1 : -6, level === 1 ? 12 : 12);
        if (level === 1) {
          const k = ri(rng, 0, 2);
          if (k === 0) { const a = ri(rng, 2, 15); return finish(rng, format, { skill: 'Solving equations', q: `Solve $${v} + ${a} = ${x + a}$.`, solution: `Subtract ${a} from both sides: $${v} = ${x + a} - ${a} = ${x}$.` }, x, [x + 2 * a, x + a, x - 1]); }
          if (k === 1) { const a = ri(rng, 2, 12); return finish(rng, format, { skill: 'Solving equations', q: `Solve $${v} - ${a} = ${x - a}$.`, solution: `Add ${a} to both sides: $${v} = ${x - a} + ${a} = ${x}$.` }, x, [x - 2 * a, x - a, x + 1]); }
          const a = ri(rng, 2, 9); return finish(rng, format, { skill: 'Solving equations', q: `Solve $${a}${v} = ${a * x}$.`, solution: `Divide both sides by ${a}: $${v} = ${a * x} \\div ${a} = ${x}$.` }, x, [a * x - a, a * x * a, x + a]);
        }
        if (level === 2) {
          const a = ri(rng, 2, 9), b = nz(rng, -15, 15), c = a * x + b;
          const sign = b < 0 ? '-' : '+';
          return finish(rng, format, { skill: 'Solving equations', q: `Solve $${a}${v} ${sign} ${Math.abs(b)} = ${c}$.`,
            solution: `${b < 0 ? 'Add' : 'Subtract'} ${Math.abs(b)}: $${a}${v} = ${c - b}$. Divide by ${a}: $${v} = ${x}$.` },
            x, [fmt((c + b) / a), c - b, -x]);
        }
        if (rng() < 0.5) {
          let a = ri(rng, 3, 9), c = ri(rng, 1, a - 1), b = nz(rng, -10, 10);
          const d = a * x + b - c * x;
          return finish(rng, format, { skill: 'Solving equations', q: `Solve $${a}${v} ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${c === 1 ? '' : c}${v} ${d < 0 ? '-' : '+'} ${Math.abs(d)}$.`,
            solution: `Subtract $${c === 1 ? '' : c}${v}$ from both sides: $${a - c}${v} ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${d}$. Then $${a - c}${v} = ${d - b}$, so $${v} = ${x}$.` },
            x, [fmt((d - b) / (a + c)), d - b, -x]);
        }
        const a = ri(rng, 2, 6), b = nz(rng, -6, 8), c = a * (x + b);
        return finish(rng, format, { skill: 'Solving equations', q: `Solve $${a}(${v} ${b < 0 ? '-' : '+'} ${Math.abs(b)}) = ${c}$.`,
          solution: `Divide by ${a}: $${v} ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${c / a}$. Then $${v} = ${x}$.` },
          x, [fmt(c / a + b), fmt((c - b) / a), -x]);
      }
    },

    index: {
      name: 'Index laws', year: 8, skill: 'Index laws',
      levels: ['Multiply and divide', 'Powers and coefficients', 'Mixed laws'],
      make(rng, level, format) {
        const v = pick(rng, ['a', 'x', 'm', 'y', 'p']);
        const base = { skill: 'Index laws', mathOpts: true };
        if (level === 1) {
          const m = ri(rng, 2, 9), n = ri(rng, 2, 8);
          if (rng() < 0.5) {
            return finish(rng, format, { ...base, q: `Simplify $${v}^{${m}} \\times ${v}^{${n}}$.`, solution: `Same base, so add the indices: $${v}^{${m} + ${n}} = ${v}^{${m + n}}$.` },
              `${v}^${m + n}`, [`${v}^${m * n}`, `2${v}^${m + n}`, `${v}^${Math.abs(m - n) || 1}`]);
          }
          const big = m + n;
          return finish(rng, format, { ...base, q: `Simplify $${v}^{${big}} \\div ${v}^{${n}}$.`, solution: `Same base, so subtract the indices: $${v}^{${big} - ${n}} = ${v}^{${m}}$.` },
            `${v}^${m}`, [`${v}^${big + n}`, `${v}^${fmt(big / n)}`, `1`]);
        }
        if (level === 2) {
          if (rng() < 0.5) {
            const m = ri(rng, 2, 6), n = ri(rng, 2, 5);
            return finish(rng, format, { ...base, q: `Simplify $(${v}^{${m}})^{${n}}$.`, solution: `Power of a power: multiply the indices. $${v}^{${m} \\times ${n}} = ${v}^{${m * n}}$.` },
              `${v}^${m * n}`, [`${v}^${m + n}`, `${n}${v}^${m}`, `${v}^${m}${n}`]);
          }
          const a = ri(rng, 2, 6), b = ri(rng, 2, 6), m = ri(rng, 2, 7), n = ri(rng, 2, 6);
          return finish(rng, format, { ...base, q: `Simplify $${a}${v}^{${m}} \\times ${b}${v}^{${n}}$.`, solution: `Multiply the numbers: $${a} \\times ${b} = ${a * b}$. Add the indices: $${m} + ${n} = ${m + n}$. So $${a * b}${v}^{${m + n}}$.` },
            `${a * b}${v}^${m + n}`, [`${a + b}${v}^${m + n}`, `${a * b}${v}^${m * n}`, `${a * b}${v}^${m + n + 1}`]);
        }
        if (rng() < 0.5) {
          const a = ri(rng, 2, 5), m = ri(rng, 2, 5), n = ri(rng, 2, 3);
          const c = Math.pow(a, n);
          return finish(rng, format, { ...base, q: `Simplify $(${a}${v}^{${m}})^{${n}}$.`, solution: `Raise both parts to the power ${n}: $${a}^{${n}} = ${c}$ and $(${v}^{${m}})^{${n}} = ${v}^{${m * n}}$. So $${c}${v}^{${m * n}}$.` },
            `${c}${v}^${m * n}`, [`${a * n}${v}^${m * n}`, `${a}${v}^${m * n}`, `${c}${v}^${m + n}`]);
        }
        const b = ri(rng, 2, 6), q = ri(rng, 2, 6), m = ri(rng, 6, 11), n = ri(rng, 2, 4);
        return finish(rng, format, { ...base, q: `Simplify $${b * q}${v}^{${m}} \\div ${b}${v}^{${n}}$.`, solution: `Divide the numbers: $${b * q} \\div ${b} = ${q}$. Subtract the indices: $${m} - ${n} = ${m - n}$. So $${q}${v}^{${m - n}}$.` },
          `${q}${v}^${m - n}`, [`${q}${v}^${m + n}`, `${b * q - b}${v}^${m - n}`, `${q}${v}^${fmt(m / n)}`]);
      }
    },

    percentages: {
      name: 'Percentages', year: 7, skill: 'Percentages',
      levels: ['Easy percentages', 'Any percentage of an amount', 'Increase and decrease'],
      make(rng, level, format) {
        if (level === 1) {
          const p = pick(rng, [10, 20, 25, 50, 75, 5]);
          const amt = pick(rng, [20, 40, 60, 80, 100, 120, 200, 240, 360, 400, 500, 800]);
          const ans = amt * p / 100;
          return finish(rng, format, { skill: 'Percentages', q: `Find ${p}% of ${amt}.`, solution: p === 10 ? `Divide by 10: $${amt} \\div 10 = ${fmt(ans)}$.` : `$${p}\\% = \\frac{${p}}{100}$, so $\\frac{${p}}{100} \\times ${amt} = ${fmt(ans)}$.` },
            fmt(ans), [fmt(amt / p), fmt(ans * 2), fmt(amt - ans)]);
        }
        if (level === 2) {
          const p = pick(rng, [12, 15, 35, 40, 8, 30, 60, 45]);
          const amt = pick(rng, [50, 80, 120, 150, 250, 300, 450, 600]);
          const ans = amt * p / 100;
          return finish(rng, format, { skill: 'Percentages', q: `Find ${p}% of \\$${amt}.`, solution: `$\\frac{${p}}{100} \\times ${amt} = ${fmt(ans)}$. Answer: \\$${fmt(ans)}.` },
            fmt(ans), [fmt(amt * p / 10), fmt(amt - ans), fmt(ans + p)]);
        }
        const p = pick(rng, [10, 15, 20, 25, 30, 5]);
        const amt = pick(rng, [40, 60, 80, 120, 200, 240, 300]);
        const up = rng() < 0.5;
        const ans = up ? amt * (1 + p / 100) : amt * (1 - p / 100);
        return finish(rng, format, { skill: 'Percentages', q: `${up ? 'Increase' : 'Decrease'} \\$${amt} by ${p}%.`,
          solution: `${p}% of ${amt} is ${fmt(amt * p / 100)}. ${up ? 'Add it' : 'Take it away'}: $${amt} ${up ? '+' : '-'} ${fmt(amt * p / 100)} = ${fmt(ans)}$.` },
          fmt(ans), [fmt(amt * p / 100), fmt(up ? amt - amt * p / 100 : amt + amt * p / 100), fmt(amt + (up ? p : -p))]);
      }
    },

    fractions: {
      name: 'Fractions', year: 7, skill: 'Fractions',
      levels: ['Same denominator', 'Different denominators', 'Multiply and divide'],
      make(rng, level, format) {
        const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
        const fr = (n, d) => { const g = gcd(n, d); n /= g; d /= g; return d === 1 ? `${n}` : `\\frac{${n}}{${d}}`; };
        const base = { skill: 'Fractions', mcOnly: true, mathOpts: true };
        if (level === 1) {
          const d = ri(rng, 5, 12), a = ri(rng, 1, d - 2), b = ri(rng, 1, d - a - 1);
          return finish(rng, 'mc', { ...base, q: `Calculate $\\frac{${a}}{${d}} + \\frac{${b}}{${d}}$.`, solution: `Same denominator, so add the tops: $\\frac{${a} + ${b}}{${d}} = ${fr(a + b, d)}$.` },
            fr(a + b, d), [`\\frac{${a + b}}{${2 * d}}`, `\\frac{${a * b}}{${d}}`, `\\frac{${a + b + 1}}{${d}}`]);
        }
        if (level === 2) {
          const d1 = pick(rng, [2, 3, 4, 5]), d2 = pick(rng, [3, 4, 6, 8, 10].filter(x => x !== d1));
          const a = ri(rng, 1, d1 - 1), b = ri(rng, 1, d2 - 1);
          const n = a * d2 + b * d1, d = d1 * d2;
          return finish(rng, 'mc', { ...base, q: `Calculate $\\frac{${a}}{${d1}} + \\frac{${b}}{${d2}}$.`, solution: `Common denominator ${d}: $\\frac{${a * d2}}{${d}} + \\frac{${b * d1}}{${d}} = ${fr(n, d)}$.` },
            fr(n, d), [`\\frac{${a + b}}{${d1 + d2}}`, `\\frac{${a + b}}{${d}}`, fr(n + d1, d)]);
        }
        const a = ri(rng, 1, 5), b = ri(rng, a + 1, 9), c = ri(rng, 1, 5), d = ri(rng, c + 1, 9);
        if (rng() < 0.5) {
          return finish(rng, 'mc', { ...base, q: `Calculate $\\frac{${a}}{${b}} \\times \\frac{${c}}{${d}}$.`, solution: `Multiply tops and bottoms: $\\frac{${a * c}}{${b * d}} = ${fr(a * c, b * d)}$.` },
            fr(a * c, b * d), [fr(a * d, b * c), `\\frac{${a + c}}{${b + d}}`, fr(a * c + 1, b * d)]);
        }
        return finish(rng, 'mc', { ...base, q: `Calculate $\\frac{${a}}{${b}} \\div \\frac{${c}}{${d}}$.`, solution: `Flip the second fraction and multiply: $\\frac{${a}}{${b}} \\times \\frac{${d}}{${c}} = ${fr(a * d, b * c)}$.` },
          fr(a * d, b * c), [fr(a * c, b * d), fr(b * c, a * d), `\\frac{${a + d}}{${b + c}}`]);
      }
    },

    algebra: {
      name: 'Like terms and substitution', year: 7, skill: 'Collecting like terms',
      levels: ['One letter', 'Letters and numbers', 'Two letters and substitution'],
      make(rng, level, format) {
        const v = pick(rng, LET);
        if (level === 1) {
          const a = ri(rng, 2, 9), b = ri(rng, 1, 9), op = pick(rng, ['+', '-']);
          const c = op === '+' ? a + b : a - b;
          if (c === 0) return this.make(rng, level, format);
          const ans = c === 1 ? v : c === -1 ? `-${v}` : `${c}${v}`;
          return finish(rng, format, { skill: 'Collecting like terms', mathOpts: true, q: `Simplify $${a}${v} ${op} ${b === 1 ? '' : b}${v}$.`, solution: `Combine the numbers in front: $${a} ${op} ${b} = ${c}$, so $${ans}$.` },
            ans, [`${c}${v}^2`, `${op === '+' ? a - b : a + b}${v}`, `${c}`]);
        }
        if (level === 2) {
          const a = ri(rng, 2, 8), b = ri(rng, 1, 9), c = ri(rng, 2, 7), d = ri(rng, 1, 9);
          const k = a + c, n = b - d;
          const ans = n === 0 ? `${k}${v}` : `${k}${v}${n > 0 ? '+' : '-'}${Math.abs(n)}`;
          return finish(rng, format, { skill: 'Collecting like terms', mathOpts: true, q: `Simplify $${a}${v} + ${b} + ${c}${v} - ${d}$.`, solution: `Letter terms: $${a}${v} + ${c}${v} = ${k}${v}$. Numbers: $${b} - ${d} = ${n}$. Answer: $${ans}$.` },
            ans, [`${k + n}${v}`, `${k}${v}${b + d >= 0 ? '+' : ''}${b + d}`, `${a + b + c + d}${v}`]);
        }
        if (rng() < 0.5) {
          const a = ri(rng, 2, 6), b = ri(rng, 2, 6), x = ri(rng, 2, 5), y = ri(rng, 1, 6);
          const ans = a * x * x + b * y;
          return finish(rng, format, { skill: 'Substitution', q: `If $x = ${x}$ and $y = ${y}$, evaluate $${a}x^{2} + ${b}y$.`, solution: `Square first: $${x}^{2} = ${x * x}$. Then $${a} \\times ${x * x} + ${b} \\times ${y} = ${a * x * x} + ${b * y} = ${ans}$.` },
            ans, [(a * x) * (a * x) + b * y, a * 2 * x + b * y, a * x * x + b + y]);
        }
        const p = ri(rng, 2, 7), q = ri(rng, 1, 6), r = ri(rng, 2, 6), s = ri(rng, 1, 5);
        const ans = `${p + r}xy+${q + s}x`;
        return finish(rng, format, { skill: 'Collecting like terms', mathOpts: true, q: `Simplify $${p}xy + ${q}x + ${r}yx + ${s}x$.`, solution: `$yx = xy$, so $${p}xy + ${r}xy = ${p + r}xy$. Then $${q}x + ${s}x = ${q + s}x$. Answer: $${ans}$.` },
          ans, [`${p + q + r + s}xy`, `${p + r}xy+${q + s}y`, `${p + r}x^2y+${q + s}x`]);
      }
    }
  };

  function generate(topic, level, format, rng) {
    const t = TOPICS[topic]; if (!t) return null;
    const q = t.make(rng || Math.random, Math.max(1, Math.min(3, level || 2)), format || 'mix');
    q.gen = topic + ':' + level;
    return q;
  }

  function list() {
    return Object.keys(TOPICS).map(k => ({ id: k, name: TOPICS[k].name, year: TOPICS[k].year, levels: TOPICS[k].levels }));
  }

  return { generate, list, TOPICS };
});
