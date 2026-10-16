// Small DOM helpers shared by the student and teacher pages.

// append() silently skips null/false so conditional children can be passed inline.
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...nodes) { return nativeAppend.apply(this, nodes.filter(n => n != null && n !== false)); };

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Text with $...$ maths. "\$" is a literal dollar sign.
export function mathHTML(text) {
  const src = String(text == null ? '' : text);
  const parts = [];
  let buf = '', inMath = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\' && src[i + 1] === '$') { buf += inMath ? '\\$' : '$'; i++; continue; }
    if (c === '$') { parts.push({ math: inMath, s: buf }); buf = ''; inMath = !inMath; continue; }
    buf += c;
  }
  if (buf) parts.push({ math: inMath, s: inMath ? buf : buf });
  return parts.map(p => {
    if (!p.math) return esc(p.s).replace(/\n/g, '<br>');
    if (window.katex) {
      try { return window.katex.renderToString(p.s, { throwOnError: false, output: 'html', strict: 'ignore' }); } catch (e) { /* fall through */ }
    }
    return '<span class="m">' + esc(p.s) + '</span>';
  }).join('');
}
export function setMath(el, text) { el.innerHTML = mathHTML(text); return el; }

// Plain typed answer → LaTeX preview ("2x^2/3" → 2x^{2}/3)
export function typedToTex(s) {
  let t = String(s || '').replace(/\\/g, '');
  t = t.replace(/\^(-?\d+|[a-z])/gi, '^{$1}').replace(/\*/g, '\\times ').replace(/×/g, '\\times ').replace(/÷/g, '\\div ').replace(/sqrt/g, '\\sqrt');
  return t;
}

let toastTimer = null;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
  el.textContent = msg; el.className = 'show ' + kind;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

export function fmtTime(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`; }
