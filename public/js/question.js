// The maths question panel: multiple choice, typed answers with an on-screen keypad, hints and worked answers.
import { h, clear, setMath, mathHTML, typedToTex } from './ui.js';
import { sfx } from './audio.js';

const coarse = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const LETTERS = 'ABCDEF';

export class QuestionPanel {
  constructor(root, handlers) {
    this.root = root; this.hd = handlers;
    this.el = h('div', { class: 'qpanel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qtitle' });
    this.root.appendChild(this.el);
    this.q = null; this.busy = false;
    document.addEventListener('keydown', e => this.key(e));
  }
  get isOpen() { return this.el.classList.contains('show'); }

  open(q, meta) {
    if (q && q._answer != null) window.__q = q; // test mode only
    this.q = q; this.meta = meta || {}; this.busy = false; this.mode = 'ask';
    this.useKeypad = coarse() && q.type === 'text';
    this.abc = false;
    this.render();
    this.el.classList.add('show');
    document.body.classList.add('q-open');
    if (q.type === 'text' && !this.useKeypad) setTimeout(() => this.input && this.input.focus(), 30);
  }
  close(silent) {
    this.el.classList.remove('show', 'correct', 'wrong', 'compact', 'peek');
    document.body.classList.remove('q-open');
    if (!silent && this.hd.onClose) this.hd.onClose();
    this.q = null;
  }

  header() {
    const m = this.meta;
    return h('div', { class: 'qhead', style: { '--accent': m.color || '#ffd27a' } },
      m.icon ? h('img', { class: 'qicon', src: m.icon, alt: '' }) : null,
      h('div', { class: 'qtitles' }, h('div', { id: 'qtitle', class: 'qt' }, m.title || 'Answer to act'), h('div', { class: 'qs' }, m.subtitle || '')),
      h('button', { class: 'qclose', 'aria-label': 'Close question', title: coarse() ? 'Close' : 'Close (Esc)', onclick: () => this.close() }, coarse() ? '×' : 'Esc'));
  }

  render() {
    const q = this.q;
    clear(this.el);
    const card = h('div', { class: 'qcard' });
    card.appendChild(this.header());
    const body = h('div', { class: 'qbody' });
    const text = h('div', { class: 'qtext' }); setMath(text, q.text);
    body.appendChild(text);
    if (q.skill) body.prepend(h('div', { class: 'qskill' }, q.skill + (q.track === 'modified' ? '' : '')));
    if (q.type === 'mc') {
      const grid = h('div', { class: 'qopts' + (q.options.length > 4 ? ' many' : '') });
      q.options.forEach((o, i) => {
        const b = h('button', { class: 'qopt', onclick: () => this.submit(i) }, h('span', { class: 'qk' }, LETTERS[i]), h('span', { class: 'qo', html: mathHTML(o) }));
        grid.appendChild(b);
      });
      body.appendChild(grid);
    } else {
      const row = h('div', { class: 'qtype' });
      this.input = h('input', { class: 'qinput', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer', placeholder: 'Your answer', inputmode: this.useKeypad && !this.abc ? 'none' : 'text', readonly: this.useKeypad && !this.abc ? true : null });
      this.input.addEventListener('input', () => this.preview());
      this.prev = h('div', { class: 'qprev', 'aria-hidden': 'true' });
      row.append(this.input, h('button', { class: 'qgo', onclick: () => this.submit(this.input.value) }, this.meta.go || 'Cast'));
      body.append(row, this.prev);
      if (this.useKeypad) body.appendChild(this.keypad());
    }
    if (q.hint) {
      const hint = h('div', { class: 'qhint' });
      const btn = h('button', { class: 'hintbtn', onclick: () => { hint.classList.add('open'); setMath(hint.querySelector('.ht'), q.hint); btn.remove(); } }, 'Need a hint?');
      hint.append(btn, h('div', { class: 'ht' }));
      body.appendChild(hint);
    }
    card.appendChild(body);
    this.el.appendChild(card);
  }

  keypad() {
    const pad = h('div', { class: 'keypad' });
    const letters = (this.q.letters || []).slice(0, 6);
    const rows = [
      ['7', '8', '9', '÷', '(', ')'],
      ['4', '5', '6', '×', '^', '/'],
      ['1', '2', '3', '−', '.', '='],
      ['0', '+', ...letters.slice(0, 2), '⌫']
    ];
    if (letters.length > 2) rows.push([...letters.slice(2), 'abc']); else rows[3].push('abc');
    for (const r of rows) {
      const row = h('div', { class: 'krow' });
      for (const k of r) {
        const b = h('button', { class: 'key' + (k === '⌫' ? ' del' : k === 'abc' ? ' abc' : /[a-z]/.test(k) ? ' var' : /\d/.test(k) ? ' num' : ' op'), type: 'button' }, k);
        b.addEventListener('pointerdown', e => { e.preventDefault(); this.press(k); });
        row.appendChild(b);
      }
      pad.appendChild(row);
    }
    return pad;
  }
  press(k) {
    sfx('click');
    if (k === '⌫') this.input.value = this.input.value.slice(0, -1);
    else if (k === 'abc') { this.abc = true; this.el.classList.add('compact'); this.input.removeAttribute('readonly'); this.input.setAttribute('inputmode', 'text'); this.input.focus(); return; }
    else this.input.value += k === '−' ? '-' : k;
    this.preview();
  }
  preview() {
    const v = this.input.value.trim();
    if (!v || /^[\d.\-]+$/.test(v)) { this.prev.innerHTML = ''; return; }
    this.prev.innerHTML = mathHTML('$' + typedToTex(v) + '$');
  }

  submit(value) {
    if (!this.q || this.busy || this.mode !== 'ask') return;
    if (this.q.type === 'text' && !String(value).trim()) { this.input && this.input.focus(); return; }
    this.busy = true;
    this.el.classList.add('sending');
    this.hd.onSubmit(this.q.qid, value);
  }
  result(res) {
    this.busy = false; this.el.classList.remove('sending');
    if (!res || !res.ok) {
      if (res && res.stale) { this.close(true); return; }
      if (res && res.msg) this.flashMsg(res.msg);
      return;
    }
    if (res.correct) {
      this.mode = 'done';
      sfx('correct');
      this.el.classList.add('correct');
      const card = this.el.querySelector('.qcard');
      // In a fight the card gets out of the way fast so the student sees their hero act;
      // the "free action" news shows as a banner over the battle instead.
      const inFight = !res.result;
      const note = res.result || (inFight ? null : res.note);
      card.appendChild(h('div', { class: 'qcorrect' }, h('div', { class: 'big' }, this.meta.yes || 'Correct!'), note ? h('div', { class: 'note' }, note) : null, res.streak >= 3 ? h('div', { class: 'streak' }, `${res.streak} in a row`) : null));
      const ms = res.result ? 1600 : 380;
      this.closeIn = ms;
      setTimeout(() => { this.close(true); this.hd.onClosed && this.hd.onClosed(res); }, ms);
      return;
    }
    this.mode = 'feedback';
    sfx('wrong');
    this.el.classList.add('wrong');
    // A miss: drop the card to the bottom of the screen so the whiff plays in view above it.
    if (res.missed) this.el.classList.add('peek');
    const card = this.el.querySelector('.qcard');
    const body = card.querySelector('.qbody');
    clear(body);
    const text = h('div', { class: 'qtext small' }); setMath(text, this.q.text);
    const fb = h('div', { class: 'qfeedback' },
      res.missed ? h('div', { class: 'fbmiss' }, 'Missed! Your turn is used up.') : null,
      res.result ? h('div', { class: 'fbmiss' }, res.result) : null,
      h('div', { class: 'fbt' }, pickEncourage()),
      h('div', { class: 'fbans', html: 'The answer is ' + mathHTML(asMath(res.correctText)) }));
    if (res.solution) fb.appendChild(h('div', { class: 'fbsol', html: mathHTML(res.solution) }));
    else if (res.tip) fb.appendChild(h('div', { class: 'fbsol tip', html: mathHTML(res.tip) }));
    if (res.missed && (res.solution || res.tip)) fb.appendChild(h('button', { class: 'linkbtn showsol', onclick: e => { fb.classList.add('open'); e.target.remove(); } }, 'Show the working'));
    const again = h('button', { class: 'qgo again', disabled: true }, res.closeOnly ? 'Close' : (this.meta.retry || 'Try another question'));
    const wait = res.closeOnly ? 1000 : Math.max(0, (res.wait || 0) * 1000);
    let left = Math.ceil(wait / 1000);
    const lab = again.textContent;
    if (wait > 0) { again.textContent = `${lab} (${left})`; const iv = setInterval(() => { left--; if (left <= 0) { clearInterval(iv); again.disabled = false; again.textContent = lab; again.focus(); } else again.textContent = `${lab} (${left})`; }, 1000); }
    else { again.disabled = false; setTimeout(() => again.focus(), 30); }
    again.addEventListener('click', () => { if (again.disabled) return; if (res.closeOnly) this.close(); else this.hd.onNext(); });
    body.append(text, fb, h('div', { class: 'fbrow' }, again, this.meta.noSwitch || res.closeOnly ? null : h('button', { class: 'linkbtn', onclick: () => { this.hd.onDrop && this.hd.onDrop(); this.close(); } }, 'Choose a different action')));
  }
  flashMsg(msg) {
    let m = this.el.querySelector('.qmsg');
    if (!m) { m = h('div', { class: 'qmsg' }); const card = this.el.querySelector('.qcard'); card && card.appendChild(m); }
    m.textContent = msg;
  }
  key(e) {
    if (!this.isOpen || !this.q) return;
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if (this.mode === 'feedback' && e.key === 'Enter') { const b = this.el.querySelector('.again'); if (b && !b.disabled) { e.preventDefault(); b.click(); } return; }
    if (this.mode !== 'ask') return;
    if (this.q.type === 'mc') {
      const idx = '123456'.indexOf(e.key) >= 0 ? '123456'.indexOf(e.key) : 'abcdef'.indexOf(e.key.toLowerCase());
      if (idx >= 0 && idx < this.q.options.length && e.target.tagName !== 'INPUT') { e.preventDefault(); this.submit(idx); }
    } else if (e.key === 'Enter') { e.preventDefault(); this.submit(this.input.value); }
  }
}

function asMath(t) {
  t = String(t == null ? '' : t);
  if (/\$/.test(t)) return t;
  if (/^[\w\s+\-*/^().=×÷,]+$/.test(t) && !/[a-z]{4,}/i.test(t)) return '$' + typedToTex(t) + '$';
  return t;
}
const ENC = ['Close! Here is how it works.', 'Not quite. Have a look at this.', 'Good try. This is the trick.', 'Almost. Check this step.', 'Not this time. You will get the next one.'];
function pickEncourage() { return ENC[Math.floor(Math.random() * ENC.length)]; }
