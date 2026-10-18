// Question pictures: how image values are accepted, rewritten and rejected.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normaliseQuestion } = require('../server/questions');
const { resolveImage } = require('../server/qimages');

const q = img => normaliseQuestion({ q: 'Q', type: 'text', answers: ['1'], image: img }).image;
assert.strictEqual(q('img/y10-probability/venn-5-2-6-3.svg'), '/banks/img/y10-probability/venn-5-2-6-3.svg');
assert.strictEqual(q('https://example.com/a.png'), 'https://example.com/a.png');
assert.strictEqual(q('http://example.com/a.png'), undefined, 'plain http is refused');
assert.strictEqual(q('../server.js'), undefined, 'no path escapes');
assert.strictEqual(q('javascript:alert(1)'), undefined);
const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
assert.match(resolveImage(px), /^\/qimg\/[0-9a-f]{20}\.png$/);
assert.strictEqual(resolveImage(px), resolveImage(px), 'same picture, same link');
assert.strictEqual(resolveImage('data:text/html;base64,PGI+'), '', 'only pictures');

// every picture named in the bank files exists
const dir = path.join(__dirname, '..', 'banks');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const x of [...b.questions, ...(b.modified || [])]) if (x.image) assert.ok(fs.existsSync(path.join(dir, x.image)), 'missing ' + x.image);
}
console.log('image tests passed');
