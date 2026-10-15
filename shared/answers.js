/*
 * Mathfall typed-answer marking. Shared by the server (which does the real marking)
 * and the teacher's question editor ("Test it" box).
 *
 * Accepted as the same answer:
 *   spacing and capitals, term order (6 + 8k = 8k + 6), letter order (ba = ab),
 *   equal numbers (1/2 = 0.5, 1 1/2 = 1.5), a leading "x =", a "$" sign, a unit (26 cm),
 *   unicode minus/times signs.
 * Marked wrong on purpose (algebra conventions):
 *   unsimplified answers (3k + 5k for 8k), brackets left in when the answer is expanded,
 *   no brackets when the answer is factorised, × or ÷ when the answer has none,
 *   an unevaluated sum (40/8 + 8) when the answer is a single number.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MF_Answers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;

  // ---------- text clean-up ----------
  function latexToPlain(s) {
    let t = String(s == null ? '' : s);
    t = t.replace(/\$/g, ' $ ');           // keep money signs visible for stripping later
    for (let i = 0; i < 4; i++) t = t.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
    t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)');
    t = t.replace(/\\left|\\right/g, '');
    t = t.replace(/\\times|\\cdot/g, '×').replace(/\\div/g, '÷');
    t = t.replace(/\\pi/g, 'π').replace(/\\%/g, '%').replace(/\\,|\\;|\\!|\\ /g, ' ');
    t = t.replace(/\^\{\s*(-?\d+|[a-z])\s*\}/g, '^$1').replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/_\{([^{}]*)\}/g, '_$1');
    t = t.replace(/\\[a-zA-Z]+/g, ' ');
    t = t.replace(/[{}]/g, '');
    return t;
  }

  function basicClean(s) {
    let t = latexToPlain(s);
    t = t.replace(/[−–—‒]/g, '-');   // minus signs and dashes
    t = t.replace(/[×⋅·✕✖]/g, '×');
    t = t.replace(/÷/g, '÷');
    t = t.replace(/²/g, '^2').replace(/³/g, '^3');
    t = t.replace(/ | /g, ' ');
    t = t.toLowerCase().trim();
    return t;
  }

  function hasTimesOrDivide(t) { return /[×÷*]/.test(t) || /[a-z)]\s*\/|\/\s*[a-z(]/.test(t); }
  function hasBracket(t) { return /[()\[\]]/.test(t); }

  // Strip $ signs, thousands commas, a leading "x =" and trailing units when the
  // expected answer is a plain number.
  const UNIT_RE = /\s*(%|°|degrees?|cm\^?[23]?|mm\^?[23]?|km\^?[23]?|m\^?[23]?|ml|l|kg|g|mg|s|sec|seconds?|mins?|minutes?|h|hrs?|hours?|units?\^?[23]?|cents?|dollars?|kmh|km\/h|m\/s|square\s+\w+|cubic\s+\w+)\s*$/;

  function numericOnly(t) {
    let x = t.replace(/\$/g, '').replace(/(\d),(?=\d{3}\b)/g, '$1').trim();
    x = x.replace(/^[a-z]\s*=\s*/, '');
    x = x.replace(UNIT_RE, '');
    x = x.replace(/\s+/g, ' ').trim();
    // mixed number: 1 1/2, -2 3/4
    let m = x.match(/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (m) {
      const v = (+m[2]) + (+m[3]) / (+m[4]);
      return m[1] ? -v : v;
    }
    x = x.replace(/\s+/g, '');
    m = x.match(/^([+-]?)\(?([+-]?\d*\.?\d+)\)?\/\(?(\d*\.?\d+)\)?$/);
    if (m) {
      const d = parseFloat(m[3]);
      if (!d) return null;
      const v = parseFloat(m[2]) / d;
      return m[1] === '-' ? -v : v;
    }
    m = x.match(/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/);
    if (m) return parseFloat(x);
    if (/^[+-]?π$/.test(x)) return (x[0] === '-' ? -1 : 1) * Math.PI;
    return null;
  }

  // ---------- tiny polynomial algebra ----------
  // A polynomial is a Map from monomial key ("" for constants, "a1b2" etc.) to coefficient.
  function monoKey(vars) {
    return Object.keys(vars).filter(k => vars[k] !== 0).sort().map(k => k + vars[k]).join('');
  }
  function polyConst(c) { const p = new Map(); if (Math.abs(c) > EPS) p.set('', c); return p; }
  function polyVar(v) { const p = new Map(); p.set(v + '1', 1); return p; }
  function parseKey(k) {
    const vars = {}; const re = /([a-zπ])(-?\d+)/g; let m;
    while ((m = re.exec(k))) vars[m[1]] = (vars[m[1]] || 0) + (+m[2]);
    return vars;
  }
  function add(a, b, sign) {
    const r = new Map(a);
    for (const [k, v] of b) {
      const n = (r.get(k) || 0) + sign * v;
      if (Math.abs(n) < EPS) r.delete(k); else r.set(k, n);
    }
    return r;
  }
  function mul(a, b) {
    let r = new Map();
    for (const [k1, v1] of a) for (const [k2, v2] of b) {
      const vars = parseKey(k1); const v2s = parseKey(k2);
      for (const k in v2s) vars[k] = (vars[k] || 0) + v2s[k];
      const key = monoKey(vars);
      const n = (r.get(key) || 0) + v1 * v2;
      if (Math.abs(n) < EPS) r.delete(key); else r.set(key, n);
    }
    return r;
  }
  function isConst(p) { return p.size === 0 || (p.size === 1 && p.has('')); }
  function constVal(p) { return p.get('') || 0; }
  function isMonomial(p) { return p.size === 1; }
  function powInt(p, n) {
    if (n === 0) return polyConst(1);
    if (n < 0) {
      if (!isMonomial(p)) throw new Error('nonpoly');
      const [[k, c]] = p; const vars = parseKey(k);
      for (const v in vars) vars[v] *= n;
      return new Map([[monoKey(vars), Math.pow(c, n)]]);
    }
    let r = polyConst(1);
    for (let i = 0; i < n; i++) r = mul(r, p);
    return r;
  }
  function divide(a, b) {
    if (isConst(b)) {
      const d = constVal(b); if (Math.abs(d) < EPS) throw new Error('div0');
      return mul(a, polyConst(1 / d));
    }
    if (isMonomial(b)) return mul(a, powInt(b, -1));
    throw new Error('nonpoly');
  }
  function polyEqual(a, b) {
    const keys = new Set([...a.keys(), ...b.keys()]);
    for (const k of keys) {
      const x = a.get(k) || 0, y = b.get(k) || 0;
      if (Math.abs(x - y) > 1e-7 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
    }
    return true;
  }

  // Tokens: numbers, single-letter variables, operators, brackets.
  function tokenize(t) {
    const out = []; let i = 0;
    while (i < t.length) {
      const c = t[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i; while (j < t.length && /[0-9.]/.test(t[j])) j++;
        const s = t.slice(i, j);
        if ((s.match(/\./g) || []).length > 1) throw new Error('bad number');
        out.push({ t: 'num', v: parseFloat(s) }); i = j; continue;
      }
      if (t.startsWith('sqrt', i)) { out.push({ t: 'fn', v: 'sqrt' }); i += 4; continue; }
      if (/[a-zπ]/.test(c)) { out.push({ t: 'var', v: c }); i++; continue; }
      if (c === '×' || c === '*') { out.push({ t: 'op', v: '*', explicit: true }); i++; continue; }
      if (c === '÷' || c === '/') { out.push({ t: 'op', v: '/' }); i++; continue; }
      if ('+-^'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
      if (c === '(' || c === '[') { out.push({ t: '(' }); i++; continue; }
      if (c === ')' || c === ']') { out.push({ t: ')' }); i++; continue; }
      throw new Error('bad char ' + c);
    }
    return out;
  }

  // Recursive-descent parser that builds a polynomial and records the top-level terms.
  function parseExpr(t) {
    const toks = tokenize(t); let pos = 0;
    const topTerms = [];
    const peek = () => toks[pos];
    const eat = () => toks[pos++];
    function expr(top) {
      let sign = 1;
      if (peek() && peek().t === 'op' && (peek().v === '-' || peek().v === '+')) { sign = eat().v === '-' ? -1 : 1; }
      let first = term();
      if (top) topTerms.push(first);
      let r = sign < 0 ? mul(first, polyConst(-1)) : first;
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = eat().v;
        // allow "+ -3" style
        let s2 = 1;
        while (peek() && peek().t === 'op' && (peek().v === '-' || peek().v === '+')) { if (eat().v === '-') s2 = -s2; }
        const tm = term();
        if (top) topTerms.push(tm);
        r = add(r, tm, (op === '-' ? -1 : 1) * s2);
      }
      return r;
    }
    function term() {
      let r = unary();
      for (;;) {
        const p = peek();
        if (!p) break;
        if (p.t === 'op' && (p.v === '*' || p.v === '/')) {
          eat();
          const rhs = unary();
          r = p.v === '*' ? mul(r, rhs) : divide(r, rhs);
        } else if (p.t === 'num' || p.t === 'var' || p.t === '(' || p.t === 'fn') {
          r = mul(r, power());
        } else break;
      }
      return r;
    }
    function unary() {
      const p = peek();
      if (p && p.t === 'op' && p.v === '-') { eat(); return mul(unary(), polyConst(-1)); }
      if (p && p.t === 'op' && p.v === '+') { eat(); return unary(); }
      return power();
    }
    function power() {
      let base = atom();
      if (peek() && peek().t === 'op' && peek().v === '^') {
        eat();
        const ex = unary();
        if (!isConst(ex)) throw new Error('nonpoly');
        const n = constVal(ex);
        if (Math.abs(n - Math.round(n)) > EPS) {
          if (!isConst(base)) throw new Error('nonpoly');
          return polyConst(Math.pow(constVal(base), n));
        }
        if (isConst(base)) return polyConst(Math.pow(constVal(base), Math.round(n)));
        base = powInt(base, Math.round(n));
      }
      return base;
    }
    function atom() {
      const p = eat();
      if (!p) throw new Error('end');
      if (p.t === 'num') return polyConst(p.v);
      if (p.t === 'var') return p.v === 'π' ? polyConst(Math.PI) : polyVar(p.v);
      if (p.t === 'fn') {
        const inner = atom();
        if (!isConst(inner)) throw new Error('nonpoly');
        return polyConst(Math.sqrt(constVal(inner)));
      }
      if (p.t === '(') {
        const r = expr(false);
        const c = eat();
        if (!c || c.t !== ')') throw new Error('bracket');
        return r;
      }
      throw new Error('unexpected');
    }
    const result = expr(true);
    if (pos !== toks.length) throw new Error('trailing');
    return { poly: result, topTerms };
  }

  function tryParse(t) {
    try { return parseExpr(t); } catch (e) { return null; }
  }

  function hasDuplicateLikeTerms(parsed) {
    const seen = new Set();
    for (const tm of parsed.topTerms) {
      if (tm.size !== 1) continue;
      const [k] = tm.keys();
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  }

  function isWordAnswer(raw) {
    const t = basicClean(raw);
    if (/\d/.test(t)) return false;
    if (/[a-z]{2,}\s+[a-z]{2,}/.test(t)) return true;
    return /[a-z]{4,}/.test(t.replace(/sqrt/g, ''));
  }
  function wordNorm(t) {
    return basicClean(t).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(an?|the) /, '');
  }

  // ---------- main entry ----------
  function markOne(student, expected) {
    const sRaw = String(student == null ? '' : student);
    const eRaw = String(expected == null ? '' : expected);
    if (!sRaw.trim()) return false;
    const s = basicClean(sRaw), e = basicClean(eRaw);
    if (s.replace(/\s+/g, '') === e.replace(/\s+/g, '')) return true;

    if (isWordAnswer(eRaw)) return wordNorm(sRaw) === wordNorm(eRaw);

    // Equations: compare side by side (either order); "x = 5" also matches a bare "5".
    const eEq = e.includes('='), sEq = s.includes('=');
    if (eEq || sEq) {
      const es = e.split('='), ss = s.split('=');
      if (es.length > 2 || ss.length > 2) return false;
      if (eEq && sEq) {
        return (markOne(ss[0], es[0]) && markOne(ss[1], es[1])) || (markOne(ss[0], es[1]) && markOne(ss[1], es[0]));
      }
      if (eEq) return /^\s*[a-z]\s*$/.test(es[0]) ? markOne(s, es[1]) : false;
      return /^\s*[a-z]\s*$/.test(ss[0]) ? markOne(ss[1], e) : false;
    }

    const eNum = numericOnly(e);
    if (eNum !== null) {
      const sNum = numericOnly(s);
      if (sNum === null) return false;
      return Math.abs(sNum - eNum) <= 1e-9 * Math.max(1, Math.abs(eNum)) + 1e-12;
    }

    // Algebraic answer.
    let e2 = e.replace(/\$/g, '').replace(/^[a-z]\s*=\s*/, '');
    let s2 = s.replace(/\$/g, '');
    if (!/^[a-z]\s*=/.test(e)) s2 = s2.replace(/^[a-z]\s*=\s*/, '');
    const ep = tryParse(e2), sp = tryParse(s2);
    if (!ep || !sp) {
      return s2.replace(/\s+/g, '') === e2.replace(/\s+/g, '');
    }
    if (!polyEqual(ep.poly, sp.poly)) return false;
    // form rules
    if (!hasTimesOrDivide(e2) && hasTimesOrDivide(s2)) return false;
    if (!hasBracket(e2) && hasBracket(s2)) return false;
    if (hasBracket(e2) && !hasBracket(s2)) return false;
    if (!hasDuplicateLikeTerms(ep) && hasDuplicateLikeTerms(sp)) return false;
    return true;
  }

  function mark(student, answers) {
    const list = Array.isArray(answers) ? answers : [answers];
    for (const a of list) {
      if (a == null || String(a).trim() === '') continue;
      if (markOne(student, a)) return true;
    }
    return false;
  }

  return { mark, markOne, basicClean, numericOnly, _parse: tryParse };
});
