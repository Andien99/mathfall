// Run: node test/answers.test.js
const { mark } = require('../shared/answers.js');

const cases = [
  // [student, expected, shouldBeCorrect]
  ['8x', '8x', true], ['8X', '8x', true], [' 8 x ', '8x', true],
  ['6+8k', '8k+6', true], ['8k + 6', '8k+6', true], ['6 + 8k', '8k + 6', true],
  ['3k+5k', '8k', false], ['8k+8-2', '8k+6', false],
  ['ba', 'ab', true], ['4ba', '4ab', true], ['4 ab', '4ab', true],
  ['9m+3mn', '3mn+9m', true], ['3nm+9m', '3mn+9m', true],
  ['3xy+4y+4', '3xy+4y+4', true], ['4+4y+3yx', '3xy+4y+4', true], ['3xy+4y', '3xy+4y+4', false],
  ['1/2', '0.5', true], ['0.5', '1/2', true], ['2/4', '0.5', true], ['1 1/2', '1.5', true],
  ['x=5', '5', true], ['x = 5', '5', true], ['5', 'x=5', true], ['k=6', '6', true],
  ['$26', '26', true], ['26 cm', '26', true], ['26cm', '26', true], ['26', '26 cm', true],
  ['40/8+8', '13', false], ['13', '13', true], ['-8', '−8', true], ['−8', '-8', true],
  ['3×x', '3x', false], ['3*x', '3x', false], ['x×3', '3x', false],
  ['3(x+2)', '3x+6', false], ['3x+6', '3(x+2)', false], ['3(x+2)', '3(x+2)', true], ['(x+2)3', '3(x+2)', true],
  ['2x^2', '2x^2', true], ['2x²', '2x^2', true], ['x^2*2', '2x^2', false], ['2xx', '2x^2', true],
  ['1x', 'x', true], ['-x+5', '5-x', true], ['5 - x', '-x+5', true],
  ['4', '4', true], ['four', '4', false], ['isosceles', 'Isosceles', true], ['an isosceles', 'isosceles', true],
  ['y=2x+3', 'y = 3 + 2x', true], ['y=2x+4', 'y = 3 + 2x', false],
  ['1,000', '1000', true], ['12.50', '12.5', true], ['', '5', false], ['5', '', false],
  ['\\frac{1}{2}', '0.5', true], ['x', 'x', true], ['3m', '5m', false], ['5m', '5m', true],
  ['a^7', 'a^{7}', true], ['12x^7', '12x^{7}', true], ['12x^6', '12x^{7}', false],
  ['25%', '25', true], ['25', '25%', true]
];

let fail = 0;
for (const [s, e, want] of cases) {
  const got = mark(s, [e]);
  if (got !== want) { fail++; console.log(`FAIL  student=${JSON.stringify(s)} expected=${JSON.stringify(e)}  wanted ${want} got ${got}`); }
}
console.log(`${cases.length - fail}/${cases.length} answer-marking cases pass`);
if (fail) process.exit(1);
