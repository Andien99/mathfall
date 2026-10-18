// Builds the diagrams for banks/year-10-probability-mix.json as SVGs in banks/img/y10-probability/.
// node tools/build_prob_images.js
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'banks', 'img', 'y10-probability');
fs.mkdirSync(OUT, { recursive: true });

const INK = '#1d2433', A_C = '#2a56c6', B_C = '#c43a6b', SHADE = '#9db8ff', SOFT = '#eef2fb', MUTED = '#6b7385';
const FONT = "font-family=\"Helvetica Neue, Helvetica, Arial, sans-serif\"";
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${FONT}><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>\n`;
const text = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 26}" font-weight="${o.weight || 600}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'middle'}" dominant-baseline="central"${o.italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`;
// A stacked fraction like 2/3 (or plain text if there's no slash).
function frac(x, y, s, size = 20, fill = INK) {
  const m = /^(\d+|\?)\/(\d+|\?)$/.exec(String(s));
  if (!m) return text(x, y, s, { size: s === '?' ? size * 1.5 : size, fill, weight: s === '?' ? 800 : 600 });
  const w = Math.max(m[1].length, m[2].length) * size * 0.62 + 6;
  return text(x, y - size * 0.62, m[1], { size, fill }) + `<line x1="${x - w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y}" stroke="${fill}" stroke-width="2"/>` + text(x, y + size * 0.66, m[2], { size, fill });
}
function save(name, content) { fs.writeFileSync(path.join(OUT, name), content); console.log('wrote', name); }

// ---------------------------------------------------------------- Venn diagrams
// counts: { a, both, b, out } (strings or numbers; '' hides it). shade: region to fill.
function venn(name, { counts, shade, labels = ['A', 'B'] }) {
  const W = 440, H = 280, cx1 = 175, cx2 = 265, cy = 145, r = 92;
  const ca = `<circle cx="${cx1}" cy="${cy}" r="${r}"/>`, cb = `<circle cx="${cx2}" cy="${cy}" r="${r}"/>`;
  let defs = `<defs><clipPath id="clA">${ca}</clipPath><clipPath id="clB">${cb}</clipPath>
    <mask id="noA"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="${cx1}" cy="${cy}" r="${r}" fill="#000"/></mask>
    <mask id="noB"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="${cx2}" cy="${cy}" r="${r}" fill="#000"/></mask>
    <mask id="noAB"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="${cx1}" cy="${cy}" r="${r}" fill="#000"/><circle cx="${cx2}" cy="${cy}" r="${r}" fill="#000"/></mask></defs>`;
  const box = `x="20" y="20" width="${W - 40}" height="${H - 40}"`;
  const fill = `fill="${SHADE}"`;
  const regions = {
    A: `<circle cx="${cx1}" cy="${cy}" r="${r}" ${fill}/>`,
    B: `<circle cx="${cx2}" cy="${cy}" r="${r}" ${fill}/>`,
    AnB: `<circle cx="${cx2}" cy="${cy}" r="${r}" ${fill} clip-path="url(#clA)"/>`,
    Aonly: `<circle cx="${cx1}" cy="${cy}" r="${r}" ${fill} mask="url(#noB)"/>`,
    Bonly: `<circle cx="${cx2}" cy="${cy}" r="${r}" ${fill} mask="url(#noA)"/>`,
    AuB: `<circle cx="${cx1}" cy="${cy}" r="${r}" ${fill}/><circle cx="${cx2}" cy="${cy}" r="${r}" ${fill}/>`,
    neither: `<rect ${box} ${fill} mask="url(#noAB)"/>`,
    Aprime: `<rect ${box} ${fill} mask="url(#noA)"/>`
  };
  let body = defs + (shade ? regions[shade] : '');
  body += `<rect ${box} fill="none" stroke="${INK}" stroke-width="3" rx="4"/>`;
  body += `<circle cx="${cx1}" cy="${cy}" r="${r}" fill="none" stroke="${A_C}" stroke-width="3.5"/><circle cx="${cx2}" cy="${cy}" r="${r}" fill="none" stroke="${B_C}" stroke-width="3.5"/>`;
  body += text(cx1 - 60, 42, labels[0], { size: 26, fill: A_C, italic: true, weight: 700 }) + text(cx2 + 60, 42, labels[1], { size: 26, fill: B_C, italic: true, weight: 700 });
  body += text(36, 36, 'ξ', { size: 22, anchor: 'start', fill: MUTED, italic: true });
  if (counts) {
    const c = counts;
    body += text(cx1 - 48, cy, c.a, { size: 32 }) + text((cx1 + cx2) / 2, cy, c.both, { size: 32 }) + text(cx2 + 48, cy, c.b, { size: 32 });
    if (c.out !== '' && c.out != null) body += text(W - 48, H - 46, c.out, { size: 30 });
  }
  save(name, svg(W, H, body));
}

// ---------------------------------------------------------------- two-way table
// cells: [[AnB, A'nB, B], [AnB', A'nB', B'], [A, A', total]] ('?' highlighted)
function twoWay(name, cells, labels = ['A', 'B']) {
  const cw = 104, ch = 56, x0 = 20, y0 = 16, W = x0 * 2 + cw * 4, H = y0 * 2 + ch * 4;
  let body = '';
  const heads = [labels[0], labels[0] + '′', ''];
  const rows = [labels[1], labels[1] + '′', ''];
  // header fills
  for (let i = 0; i < 2; i++) body += `<rect x="${x0 + cw * (i + 1)}" y="${y0}" width="${cw}" height="${ch}" fill="${SOFT}" stroke="${INK}" stroke-width="2"/>` + text(x0 + cw * (i + 1.5), y0 + ch / 2, heads[i], { italic: true, weight: 700, fill: A_C });
  for (let j = 0; j < 2; j++) body += `<rect x="${x0}" y="${y0 + ch * (j + 1)}" width="${cw}" height="${ch}" fill="${SOFT}" stroke="${INK}" stroke-width="2"/>` + text(x0 + cw / 2, y0 + ch * (j + 1.5), rows[j], { italic: true, weight: 700, fill: B_C });
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const v = cells[j][i];
    const x = x0 + cw * (i + 1), y = y0 + ch * (j + 1);
    const total = i === 2 || j === 2;
    body += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="${v === '?' ? '#fff3c4' : total ? '#f7f7f9' : '#fff'}" stroke="${INK}" stroke-width="2"/>`;
    body += text(x + cw / 2, y + ch / 2, v, { size: 28, weight: total ? 700 : 600, fill: v === '?' ? '#a05a00' : INK });
  }
  save(name, svg(W, H, body));
}

// ---------------------------------------------------------------- frequency table
function freqTable(name, rowLabel, values, freqs, rowLabel2 = 'Frequency') {
  const lw = 210, cw = 70, ch = 54, x0 = 16, y0 = 16, W = x0 * 2 + lw + cw * values.length, H = y0 * 2 + ch * 2;
  let body = '';
  [[rowLabel, values], [rowLabel2, freqs]].forEach(([lab, vals], j) => {
    const y = y0 + ch * j;
    body += `<rect x="${x0}" y="${y}" width="${lw}" height="${ch}" fill="${SOFT}" stroke="${INK}" stroke-width="2"/>` + text(x0 + 14, y + ch / 2, lab, { size: 21, anchor: 'start', weight: 700, fill: A_C });
    vals.forEach((v, i) => { body += `<rect x="${x0 + lw + cw * i}" y="${y}" width="${cw}" height="${ch}" fill="#fff" stroke="${INK}" stroke-width="2"/>` + text(x0 + lw + cw * (i + 0.5), y + ch / 2, v, { size: 25 }); });
  });
  save(name, svg(W, H, body));
}

// ---------------------------------------------------------------- spinner
function spinner(name, labels) {
  const W = 300, H = 300, cx = 150, cy = 150, r = 128;
  const cols = ['#ffd7a8', '#cfe3ff', '#d6f2d0', '#f6d0e4', '#fff1a8', '#e2d6ff'];
  const n = labels.length;
  let body = '';
  labels.forEach((lab, i) => {
    const a0 = -Math.PI / 2 + (i / n) * 2 * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / n) * 2 * Math.PI, am = (a0 + a1) / 2;
    const p = a => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    const col = cols[(parseInt(lab, 10) || i) % cols.length];
    body += `<path d="M ${cx} ${cy} L ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z" fill="${col}" stroke="${INK}" stroke-width="2.5"/>`;
    body += text(cx + r * 0.66 * Math.cos(am), cy + r * 0.66 * Math.sin(am), lab, { size: 30, weight: 700 });
  });
  body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="3.5"/>`;
  // pointer
  body += `<path d="M ${cx} ${cy} L ${cx + 18} ${cy - 70}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="9" fill="${INK}"/>`;
  save(name, svg(W, H, body));
}

// ---------------------------------------------------------------- bag of counters
function counters(name, groups) { // [[colour, count, label]]
  const all = []; groups.forEach(([c, n]) => { for (let i = 0; i < n; i++) all.push(c); });
  // fixed shuffle so the picture is stable
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  const W = 360, H = 260;
  let body = `<path d="M 70 70 Q 60 240 180 244 Q 300 240 290 70 Z" fill="#f4ead9" stroke="#8a6a3a" stroke-width="4"/><path d="M 60 70 Q 180 40 300 70" fill="none" stroke="#8a6a3a" stroke-width="5"/>`;
  const cols = Math.ceil(Math.sqrt(all.length * 1.6));
  all.forEach((c, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const rowsN = Math.ceil(all.length / cols);
    const x = 180 + (col - (cols - 1) / 2) * 40 + (row % 2 ? 10 : -10), y = 150 + (row - (rowsN - 1) / 2) * 38;
    body += `<circle cx="${x}" cy="${y}" r="16" fill="${c}" stroke="${INK}" stroke-width="2"/>`;
  });
  save(name, svg(W, H, body));
}

// ---------------------------------------------------------------- tree diagram (two stages)
// first: [[label, prob], [label, prob]]; second: for each first branch, [[label, prob], ...]
function tree(name, first, second, { outcomes = true, heads = ['1st', '2nd'] } = {}) {
  const W = 520, H = 330, x0 = 30, x1 = 190, x2 = 360;
  const y1s = [95, 245], y2s = [[50, 140], [200, 290]];
  let body = text(x1, 18, heads[0], { size: 18, fill: MUTED, italic: true }) + text(x2, 18, heads[1], { size: 18, fill: MUTED, italic: true });
  if (outcomes) body += text(455, 18, 'Outcome', { size: 18, fill: MUTED, italic: true });
  const line = (ax, ay, bx, by) => `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${A_C}" stroke-width="3" stroke-linecap="round"/>`;
  first.forEach(([lab, p], i) => {
    const y = y1s[i];
    body += line(x0, 170, x1 - 18, y);
    body += frac((x0 + x1) / 2 - 18, (170 + y) / 2 + (i ? 22 : -22), p, 19, p === '?' ? '#a05a00' : INK);
    body += text(x1, y, lab, { size: 26, weight: 700 });
    second[i].forEach(([lab2, p2], k) => {
      const yy = y2s[i][k];
      body += line(x1 + 18, y, x2 - 18, yy);
      body += frac((x1 + x2) / 2, (y + yy) / 2 + (k ? 20 : -20), p2, 19, p2 === '?' ? '#a05a00' : INK);
      body += text(x2, yy, lab2, { size: 26, weight: 700 });
      if (outcomes) body += text(455, yy, `(${lab}, ${lab2})`, { size: 20, weight: 500, fill: MUTED });
    });
  });
  save(name, svg(W, H, body));
}

// ---------------------------------------------------------------- arrays (two-step tables)
function sumGrid(name) {
  const c = 50, x0 = 70, y0 = 60, W = x0 + c * 6 + 16, H = y0 + c * 6 + 16;
  let body = text(x0 + c * 3, 18, 'Die 1', { size: 20, fill: A_C, weight: 700 }) + `<text x="20" y="${y0 + c * 3}" font-size="20" font-weight="700" fill="${B_C}" text-anchor="middle" transform="rotate(-90 20 ${y0 + c * 3})">Die 2</text>`;
  for (let i = 1; i <= 6; i++) { body += text(x0 + c * (i - 0.5), y0 - 18, i, { size: 22, weight: 700, fill: A_C }); body += text(x0 - 20, y0 + c * (i - 0.5), i, { size: 22, weight: 700, fill: B_C }); }
  for (let j = 1; j <= 6; j++) for (let i = 1; i <= 6; i++) body += `<rect x="${x0 + c * (i - 1)}" y="${y0 + c * (j - 1)}" width="${c}" height="${c}" fill="#fff" stroke="${INK}" stroke-width="1.5"/>` + text(x0 + c * (i - 0.5), y0 + c * (j - 0.5), i + j, { size: 22, weight: 500 });
  save(name, svg(W, H, body));
}
function pairGrid(name, items, withRep, title) {
  const c = 92, ch = 52, x0 = 92, y0 = 74, n = items.length, W = x0 + c * n + 16, H = y0 + ch * n + 14;
  let body = text(x0 + (c * n) / 2, 20, '1st', { size: 20, fill: A_C, weight: 700, italic: true }) + `<text x="22" y="${y0 + (ch * n) / 2}" font-size="20" font-weight="700" font-style="italic" fill="${B_C}" text-anchor="middle" transform="rotate(-90 22 ${y0 + (ch * n) / 2})">2nd</text>`;
  items.forEach((it, i) => { body += text(x0 + c * (i + 0.5), y0 - 20, it, { size: 22, weight: 700, fill: A_C }); body += text(x0 - 24, y0 + ch * (i + 0.5), it, { size: 22, weight: 700, fill: B_C }); });
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cell = !withRep && i === j ? '×' : `(${items[i]}, ${items[j]})`;
    body += `<rect x="${x0 + c * i}" y="${y0 + ch * j}" width="${c}" height="${ch}" fill="${cell === '×' ? '#f3f3f6' : '#fff'}" stroke="${INK}" stroke-width="1.5"/>` + text(x0 + c * (i + 0.5), y0 + ch * (j + 0.5), cell, { size: 20, weight: 500, fill: cell === '×' ? MUTED : INK });
  }
  save(name, svg(W, H, body));
}

// ---------------------------------------------------------------- probability scale
function scale(name, at) {
  const W = 560, H = 150, x0 = 40, x1 = 520, y = 70, X = v => x0 + (x1 - x0) * v;
  let body = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${INK}" stroke-width="3"/>`;
  for (let i = 0; i <= 10; i++) { const x = X(i / 10); body += `<line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y + 8}" stroke="${INK}" stroke-width="2"/>` + text(x, y + 26, i === 0 ? '0' : i === 10 ? '1' : (i / 10).toString(), { size: 17, weight: 500 }); }
  const x = X(at);
  body += `<path d="M ${x} ${y - 12} l -12 -26 h 24 Z" fill="${B_C}"/>` + text(x, 18, '?', { size: 24, weight: 800, fill: B_C });
  body += text(X(0), y + 58, 'impossible', { size: 15, fill: MUTED, weight: 500 }) + text(X(1), y + 58, 'certain', { size: 15, fill: MUTED, weight: 500 });
  save(name, svg(W, H, body));
}

// ================================================================ the diagrams
scale('scale-even.svg', 0.5);
scale('scale-likely.svg', 0.8);
spinner('spinner-8.svg', ['1', '4', '3', '4', '2', '1', '4', '3']);
spinner('spinner-5.svg', ['1', '2', '1', '3', '1']);
counters('bag-3r5y2b.svg', [['#e0484d', 3], ['#f6c945', 5], ['#3f74d6', 2]]);
freqTable('freq-heads.svg', 'Number of heads', [0, 1, 2, 3], [9, 38, 43, 10]);
freqTable('freq-faults.svg', 'Number of faults', [0, 1, 2, 3, 4], [30, 12, 4, 3, 1], 'Number of cars');

venn('venn-shade-AnB.svg', { shade: 'AnB' });
venn('venn-shade-AuB.svg', { shade: 'AuB' });
venn('venn-shade-Aonly.svg', { shade: 'Aonly' });
venn('venn-shade-neither.svg', { shade: 'neither' });
venn('venn-shade-Aprime.svg', { shade: 'Aprime' });
venn('venn-shade-Bonly.svg', { shade: 'Bonly' });
venn('venn-5-2-6-3.svg', { counts: { a: 5, both: 2, b: 6, out: 3 } });
venn('venn-6-3-4-2.svg', { counts: { a: 6, both: 3, b: 4, out: 2 } });
venn('venn-5-2-4-3.svg', { counts: { a: 5, both: 2, b: 4, out: 3 } });
venn('venn-meat-dry.svg', { counts: { a: 2, both: 7, b: 5, out: 6 }, labels: ['M', 'D'] });
venn('venn-blank-CN.svg', { counts: { a: '?', both: 6, b: 8, out: 10 }, labels: ['C', 'N'] });

twoWay('twoway-2-6-5-3.svg', [[2, 6, 8], [5, 3, 8], [7, 9, 16]]);
twoWay('twoway-missing.svg', [[3, '?', 6], [1, 4, 5], [4, 7, 11]]);
twoWay('twoway-7-5-3-1.svg', [[7, 5, 12], [3, 1, 4], [10, 6, 16]]);

sumGrid('dice-sums.svg');
pairGrid('dog-without.svg', ['D', 'O', 'G'], false);

tree('tree-RB-with.svg', [['R', '2/3'], ['B', '1/3']], [[['R', '2/3'], ['B', '1/3']], [['R', '2/3'], ['B', '1/3']]]);
tree('tree-BW-without.svg', [['B', '5/8'], ['W', '3/8']], [[['B', '4/7'], ['W', '?']], [['B', '5/7'], ['W', '2/7']]]);
tree('tree-boxes.svg', [['A', '1/2'], ['B', '1/2']], [[['red', '1/2'], ['green', '1/2']], [['red', '1/4'], ['green', '3/4']]], { heads: ['Box', 'Counter'], outcomes: false });
