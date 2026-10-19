// Builds banks/year-10-probability-mix.json: Year 10 Probability (Cambridge 10/10A, 8A–8F), with extra
// practice on the addition rule and conditional probability. (The file id is kept so teachers' selections still work.)
// Diagrams come from tools/build_prob_images.js. Run both after changing anything:
//   node tools/build_prob_images.js && node tools/build_y10_prob_bank.js
const fs = require('fs');
const path = require('path');
const I = f => 'img/y10-probability/' + f;
const fr = (a, b) => `$\\frac{${a}}{${b}}$`;

// skill names (shown on the results page)
const BAS = 'Probability basics', EXP = 'Experimental probability', SET = 'Set notation', VEN = 'Venn diagrams',
  TWT = 'Two-way tables', ADD = 'Addition rule', CON = 'Conditional probability', ARR = 'Two-step tables', TRE = 'Tree diagrams';

const mc = (skill, q, options, extra = {}) => ({ type: 'mc', skill, q, options, correct: 0, ...extra });
const ty = (skill, q, answers, extra = {}) => ({ type: 'text', skill, q, answers: [].concat(answers), ...extra });

const prob = [
  // ---------------- 8A Review of probability
  mc(BAS, 'What word describes the chance marked by the arrow?', ['Even chance', 'Likely', 'Unlikely', 'Certain'],
    { image: I('scale-even.svg'), imageAlt: 'Probability scale from 0 to 1 with an arrow at 0.5', solution: '$0.5$ is halfway between impossible and certain, so it is an even chance.' }),
  mc(BAS, 'What word best describes the chance marked by the arrow?', ['Likely', 'Even chance', 'Unlikely', 'Impossible'],
    { image: I('scale-likely.svg'), imageAlt: 'Probability scale from 0 to 1 with an arrow at 0.8', solution: '$0.8$ is closer to 1 (certain) than to $0.5$, so it is likely.' }),
  mc(BAS, 'Every probability is a number between…', ['$0$ and $1$', '$-1$ and $1$', '$1$ and $10$', '$0$ and $10$'],
    { solution: 'A probability of $0$ is impossible and $1$ is certain. Everything else is in between.' }),
  mc(BAS, 'Complete the rule for equally likely outcomes: $\\Pr(\\text{event}) = \\dfrac{\\text{number of favourable outcomes}}{\\;?\\;}$',
    ['total number of outcomes', 'number of unfavourable outcomes', 'number of favourable outcomes', 'number of events'],
    { solution: 'Favourable outcomes out of all the possible outcomes.' }),
  mc(BAS, 'What is the sample space for one roll of a 6-sided die?', ['$\\{1, 2, 3, 4, 5, 6\\}$', '$\\{6\\}$', '$\\{1, 6\\}$', '$\\{0, 1, 2, 3, 4, 5, 6\\}$'],
    { solution: 'The sample space lists every possible outcome: $1$ to $6$.' }),
  ty(BAS, 'The spinner is spun once. What is the probability of spinning a $4$?', '3/8',
    { image: I('spinner-8.svg'), imageAlt: 'Spinner with 8 equal sections labelled 1, 4, 3, 4, 2, 1, 4, 3', hint: 'Count the 4s, then count all the sections.', solution: 'There are $3$ fours out of $8$ equal sections, so $\\frac{3}{8}$.' }),
  ty(BAS, 'The spinner is spun once. What is the probability of spinning a $1$?', '3/5',
    { image: I('spinner-5.svg'), imageAlt: 'Spinner with 5 equal sections labelled 1, 2, 1, 3, 1', solution: '$3$ of the $5$ equal sections show $1$, so $\\frac{3}{5}$.' }),
  ty(BAS, 'A counter is taken from the bag without looking. What is the probability it is red?', '3/10',
    { image: I('bag-3r5y2b.svg'), imageAlt: 'A bag with 3 red, 5 yellow and 2 blue counters', hint: 'Red counters out of all the counters.', solution: '$3$ red out of $3 + 5 + 2 = 10$ counters: $\\frac{3}{10}$.' }),
  ty(BAS, 'A counter is taken from the bag without looking. What is the probability it is NOT yellow?', '1/2',
    { image: I('bag-3r5y2b.svg'), imageAlt: 'A bag with 3 red, 5 yellow and 2 blue counters', solution: '$5$ of the $10$ are not yellow, so $\\frac{5}{10} = \\frac{1}{2}$.' }),
  ty(BAS, 'A letter is chosen from the word TELEVISION. What is the probability it is an E?', '1/5',
    { solution: 'There are $2$ Es in $10$ letters: $\\frac{2}{10} = \\frac{1}{5}$.' }),
  ty(BAS, 'If $\\Pr(\\text{rain}) = 0.3$, what is $\\Pr(\\text{no rain})$?', '0.7',
    { hint: 'An event and its complement add to 1.', solution: '$1 - 0.3 = 0.7$' }),
  ty(BAS, 'A spinner lands on $4$ with probability $\\frac{1}{3}$. How many $4$s would you expect in $60$ spins?', '20',
    { solution: '$\\frac{1}{3} \\times 60 = 20$' }),

  // ---------------- 8A Experimental probability
  ty(EXP, 'Three coins were tossed $100$ times. What is the experimental probability of getting exactly $2$ heads?', ['0.43', '43/100'],
    { image: I('freq-heads.svg'), imageAlt: 'Table. Number of heads 0, 1, 2, 3. Frequency 9, 38, 43, 10.', solution: '$2$ heads happened $43$ times out of $100$: $0.43$.' }),
  ty(EXP, 'Three coins were tossed $100$ times. What is the experimental probability of getting fewer than $2$ heads?', ['0.47', '47/100'],
    { image: I('freq-heads.svg'), imageAlt: 'Table. Number of heads 0, 1, 2, 3. Frequency 9, 38, 43, 10.', hint: 'Fewer than 2 means 0 or 1.', solution: '$9 + 38 = 47$ out of $100$: $0.47$.' }),
  ty(EXP, '$50$ cars were inspected. What is the experimental probability that a car has no faults?', '3/5',
    { image: I('freq-faults.svg'), imageAlt: 'Table. Number of faults 0 to 4. Number of cars 30, 12, 4, 3, 1.', solution: '$30$ of $50$ cars: $\\frac{30}{50} = \\frac{3}{5}$.' }),
  mc(EXP, 'Experimental probability $= \\dfrac{\\text{number of favourable outcomes}}{\\;?\\;}$', ['total number of trials', 'total number of possible outcomes', 'number of failures', 'number of successes'],
    { solution: 'Experimental probability uses the results: how many times it happened out of how many trials.' }),

  // ---------------- 8B Set notation
  mc(SET, 'Which set is shaded?', ['$A \\cap B$', '$A \\cup B$', "$A'$", "$A \\cap B'$"],
    { image: I('venn-shade-AnB.svg'), imageAlt: 'Venn diagram with only the overlap of A and B shaded', solution: 'The overlap is in $A$ and $B$: the intersection $A \\cap B$.' }),
  mc(SET, 'Which set is shaded?', ['$A \\cup B$', '$A \\cap B$', "$A'$", "$A' \\cap B'$"],
    { image: I('venn-shade-AuB.svg'), imageAlt: 'Venn diagram with both circles fully shaded', solution: 'Everything in $A$ or $B$ (or both) is the union $A \\cup B$.' }),
  mc(SET, 'Which set is shaded?', ["$A \\cap B'$", '$A \\cap B$', '$A$', "$A' \\cap B$"],
    { image: I('venn-shade-Aonly.svg'), imageAlt: 'Venn diagram with A shaded except the overlap', solution: 'This is $A$ only: in $A$ and not in $B$, so $A \\cap B\'$.' }),
  mc(SET, 'Which set is shaded?', ["$A' \\cap B$", "$A \\cap B'$", '$B$', '$A \\cup B$'],
    { image: I('venn-shade-Bonly.svg'), imageAlt: 'Venn diagram with B shaded except the overlap', solution: 'This is $B$ only: not in $A$ and in $B$, so $A\' \\cap B$.' }),
  mc(SET, 'Which set is shaded?', ["$A' \\cap B'$", '$A \\cap B$', "$A'$", '$A \\cup B$'],
    { image: I('venn-shade-neither.svg'), imageAlt: 'Venn diagram with only the region outside both circles shaded', solution: 'Outside both circles is neither $A$ nor $B$: $A\' \\cap B\'$, which is the same as $(A \\cup B)\'$.' }),
  mc(SET, 'Which set is shaded?', ["$A'$", "$B'$", "$A' \\cap B'$", '$A \\cap B$'],
    { image: I('venn-shade-Aprime.svg'), imageAlt: 'Venn diagram with everything outside circle A shaded', solution: 'Everything not in $A$ is the complement $A\'$.' }),
  mc(SET, 'What does the symbol $\\varnothing$ mean?', ['The empty set', 'The sample space', 'The union', 'Zero probability of the sample space'],
    { solution: '$\\varnothing$ (or $\\{\\,\\}$) is the null or empty set: a set with no elements.' }),
  mc(SET, 'Events $A$ and $B$ are mutually exclusive. This means…', ['$A \\cap B = \\varnothing$', '$A \\cup B = \\varnothing$', '$A = B$', "$A' = B$"],
    { solution: 'Mutually exclusive events have nothing in common, so their intersection is empty.' }),
  mc(SET, 'If $A = \\{1, 3, 5, 7\\}$ and $B = \\{5, 8, 11\\}$, what is $A \\cap B$?', ['$\\{5\\}$', '$\\{1, 3, 5, 7, 8, 11\\}$', '$\\varnothing$', '$\\{1, 3, 7\\}$'],
    { solution: '$5$ is the only number in both sets.' }),
  mc(SET, 'Complete the rule: $\\Pr(A\') = $', ['$1 - \\Pr(A)$', '$\\Pr(A) - 1$', '$1 + \\Pr(A)$', '$\\dfrac{1}{\\Pr(A)}$'],
    { solution: 'An event and its complement add to $1$.' }),

  // ---------------- 8B Venn diagrams
  ty(VEN, 'Find $n(A)$.', '7', { image: I('venn-5-2-6-3.svg'), imageAlt: 'Venn diagram: A only 5, A and B 2, B only 6, neither 3', hint: 'All of circle A, including the overlap.', solution: '$5 + 2 = 7$' }),
  ty(VEN, 'Find $n(A \\cup B)$.', '13', { image: I('venn-5-2-6-3.svg'), imageAlt: 'Venn diagram: A only 5, A and B 2, B only 6, neither 3', solution: 'Everything inside the circles: $5 + 2 + 6 = 13$.' }),
  ty(VEN, 'How many elements are in the sample space $\\xi$?', '16', { image: I('venn-5-2-6-3.svg'), imageAlt: 'Venn diagram: A only 5, A and B 2, B only 6, neither 3', solution: '$5 + 2 + 6 + 3 = 16$, including the $3$ outside the circles.' }),
  ty(VEN, 'Find $\\Pr(A \\cap B)$.', '1/5', { image: I('venn-6-3-4-2.svg'), imageAlt: 'Venn diagram: A only 6, A and B 3, B only 4, neither 2', hint: 'Total first: add all four numbers.', solution: 'Total $= 15$. $\\Pr(A \\cap B) = \\frac{3}{15} = \\frac{1}{5}$.' }),
  ty(VEN, 'Find $\\Pr(B \\text{ only})$.', '4/15', { image: I('venn-6-3-4-2.svg'), imageAlt: 'Venn diagram: A only 6, A and B 3, B only 4, neither 2', solution: '$4$ out of $15$: $\\frac{4}{15}$.' }),
  ty(VEN, "Find $\\Pr(A')$.", '2/5', { image: I('venn-6-3-4-2.svg'), imageAlt: 'Venn diagram: A only 6, A and B 3, B only 4, neither 2', hint: 'Not in A: B only and neither.', solution: '$4 + 2 = 6$ out of $15$: $\\frac{6}{15} = \\frac{2}{5}$.' }),
  ty(VEN, '$20$ dogs: $9$ like fresh meat ($M$), $12$ like dry food ($D$), $7$ like both. How many like neither?', '6',
    { image: I('venn-meat-dry.svg'), imageAlt: 'Venn diagram: M only 2, M and D 7, D only 5, neither 6', solution: '$2 + 7 + 5 = 14$ like at least one, so $20 - 14 = 6$.' }),
  ty(VEN, '$12$ students enjoy cricket ($C$). What number goes in the "?"?', '6',
    { image: I('venn-blank-CN.svg'), imageAlt: 'Venn diagram: C only ?, C and N 6, N only 8, neither 10', hint: 'Circle C holds 12 altogether.', solution: 'Cricket only $= 12 - 6 = 6$.' }),

  // ---------------- 8B Two-way tables
  ty(TWT, "Find $n(A \\cap B')$.", '5', { image: I('twoway-2-6-5-3.svg'), imageAlt: "Two-way table. Row B: 2, 6, total 8. Row B': 5, 3, total 8. Totals: A 7, A' 9, 16.", hint: "Column A, row B'.", solution: "In $A$ and not in $B$: column $A$, row $B'$, which is $5$." }),
  ty(TWT, 'Find $\\Pr(A)$.', '7/16', { image: I('twoway-2-6-5-3.svg'), imageAlt: "Two-way table. Row B: 2, 6, total 8. Row B': 5, 3, total 8. Totals: A 7, A' 9, 16.", solution: 'Column $A$ totals $7$ out of $16$: $\\frac{7}{16}$.' }),
  ty(TWT, 'What number goes in the "?"?', '3', { image: I('twoway-missing.svg'), imageAlt: "Two-way table with a missing value. Row B: 3, ?, total 6. Row B': 1, 4, total 5. Totals 4, 7, 11.", hint: 'The row has to add to its total.', solution: '$6 - 3 = 3$ (check the column: $3 + 4 = 7$).' }),
  mc(TWT, 'In a two-way table, the number in the bottom-right corner is…', ['the total in the sample space, $n(\\xi)$', '$n(A \\cap B)$', "$n(A' \\cap B')$", '$n(A \\cup B)$'],
    { solution: 'The bottom-right corner is the grand total of everything counted.' }),

  // ---------------- 8C Addition rule
  mc(ADD, 'Complete the addition rule: $\\Pr(A \\cup B) = \\Pr(A) + \\Pr(B) - \\;?$', ['$\\Pr(A \\cap B)$', '$\\Pr(A \\cup B)$', "$\\Pr(A')$", '$1$'],
    { solution: 'The overlap is counted twice when you add $\\Pr(A)$ and $\\Pr(B)$, so subtract it once.' }),
  ty(ADD, 'If $\\Pr(A) = 0.5$, $\\Pr(B) = 0.4$ and $\\Pr(A \\cap B) = 0.1$, find $\\Pr(A \\cup B)$.', '0.8',
    { solution: '$0.5 + 0.4 - 0.1 = 0.8$' }),
  ty(ADD, 'If $\\Pr(A \\cup B) = 0.9$, $\\Pr(A) = 0.5$ and $\\Pr(B) = 0.45$, find $\\Pr(A \\cap B)$.', '0.05',
    { hint: 'Add the two, then see how much bigger than 0.9 it is.', solution: '$0.5 + 0.45 = 0.95$, and $0.95 - 0.9 = 0.05$.' }),
  ty(ADD, '$A$ and $B$ are mutually exclusive. If $\\Pr(A) = 0.2$ and $\\Pr(B) = 0.3$, find $\\Pr(A \\cup B)$.', '0.5',
    { solution: 'Mutually exclusive means $\\Pr(A \\cap B) = 0$, so just add: $0.2 + 0.3 = 0.5$.' }),
  ty(ADD, "If $\\Pr(A \\cup B) = 0.85$, find $\\Pr(A' \\cap B')$.", '0.15',
    { hint: "Neither A nor B is everything outside A ∪ B.", solution: "$\\Pr(A' \\cap B') = 1 - \\Pr(A \\cup B) = 1 - 0.85 = 0.15$" }),
  mc(ADD, 'A card is drawn from a standard deck of $52$. What is the probability it is a heart or a king?', [fr(4, 13), fr(17, 52), fr(1, 52), fr(1, 4)],
    { hint: '13 hearts, 4 kings, and one card is both.', solution: '$\\frac{13}{52} + \\frac{4}{52} - \\frac{1}{52} = \\frac{16}{52} = \\frac{4}{13}$' }),

  // ---------------- 8D Conditional probability
  mc(CON, 'Complete the rule: $\\Pr(A \\mid B) = \\dfrac{\\Pr(A \\cap B)}{\\;?\\;}$', ['$\\Pr(B)$', '$\\Pr(A)$', '$\\Pr(A \\cup B)$', "$\\Pr(B')$"],
    { solution: 'Given $B$, the sample space shrinks to $B$, so divide by $\\Pr(B)$.' }),
  mc(CON, 'How is $\\Pr(A \\mid B)$ read?', ['The probability of $A$ given $B$', 'The probability of $A$ or $B$', 'The probability of $A$ and $B$', 'The probability of $A$ divided by $B$'],
    { solution: 'The line $\\mid$ means "given that".' }),
  ty(CON, 'Find $\\Pr(A \\mid B)$.', '1/3', { image: I('venn-5-2-4-3.svg'), imageAlt: 'Venn diagram: A only 5, A and B 2, B only 4, neither 3', hint: 'Only look inside circle B.', solution: '$B$ has $2 + 4 = 6$ elements, $2$ of them in $A$: $\\frac{2}{6} = \\frac{1}{3}$.' }),
  ty(CON, 'Find $\\Pr(B \\mid A)$.', '2/7', { image: I('venn-5-2-4-3.svg'), imageAlt: 'Venn diagram: A only 5, A and B 2, B only 4, neither 3', hint: 'Only look inside circle A.', solution: '$A$ has $5 + 2 = 7$ elements, $2$ of them in $B$: $\\frac{2}{7}$.' }),
  ty(CON, 'Find $\\Pr(A \\mid B)$.', '7/12', { image: I('twoway-7-5-3-1.svg'), imageAlt: "Two-way table. Row B: 7, 5, total 12. Row B': 3, 1, total 4. Totals: A 10, A' 6, 16.", hint: 'Only use row B.', solution: 'Row $B$ has $12$; $7$ of them are in $A$: $\\frac{7}{12}$.' }),

  // ---------------- 8E Two-step experiments using arrays
  ty(ARR, 'Two dice are rolled and the numbers added. What is the probability of a sum of $7$?', '1/6',
    { image: I('dice-sums.svg'), imageAlt: 'A 6 by 6 table of sums for two dice', hint: 'Count the 7s in the table.', solution: 'There are $6$ sevens out of $36$: $\\frac{6}{36} = \\frac{1}{6}$.' }),
  ty(ARR, 'Two dice are rolled and the numbers added. What is the probability the sum is $12$?', '1/36',
    { image: I('dice-sums.svg'), imageAlt: 'A 6 by 6 table of sums for two dice', solution: 'Only $(6, 6)$ gives $12$: $\\frac{1}{36}$.' }),
  ty(ARR, 'Two letters are chosen from DOG without replacement. How many outcomes are there?', '6',
    { image: I('dog-without.svg'), imageAlt: 'Table of pairs from D, O, G with the repeated pairs crossed out', solution: '$9$ cells minus the $3$ crossed out: $6$ (or $3 \\times 2 = 6$).' }),
  ty(ARR, 'Two letters are chosen from DOG without replacement. What is the probability that a D is chosen?', '2/3',
    { image: I('dog-without.svg'), imageAlt: 'Table of pairs from D, O, G with the repeated pairs crossed out', solution: '$4$ of the $6$ outcomes contain a D: $\\frac{4}{6} = \\frac{2}{3}$.' }),
  ty(ARR, 'Two coins are tossed. How many outcomes are in the sample space?', '4',
    { solution: '$HH, HT, TH, TT$: $2 \\times 2 = 4$.' }),
  mc(ARR, 'Choosing two different people to play in a team is…', ['without replacement', 'with replacement', 'mutually exclusive', 'impossible'],
    { solution: 'The same person can\'t be picked twice, so it is without replacement.' }),

  // ---------------- 8F Tree diagrams
  ty(TRE, 'Two counters are picked with replacement. Find $\\Pr(R, R)$.', '4/9',
    { image: I('tree-RB-with.svg'), imageAlt: 'Tree diagram. First pick R 2/3, B 1/3. Second pick the same each time: R 2/3, B 1/3.', hint: 'Multiply along the branches.', solution: '$\\frac{2}{3} \\times \\frac{2}{3} = \\frac{4}{9}$' }),
  ty(TRE, 'Two counters are picked with replacement. Find $\\Pr(B, B)$.', '1/9',
    { image: I('tree-RB-with.svg'), imageAlt: 'Tree diagram. First pick R 2/3, B 1/3. Second pick the same each time: R 2/3, B 1/3.', solution: '$\\frac{1}{3} \\times \\frac{1}{3} = \\frac{1}{9}$' }),
  ty(TRE, '$5$ blue and $3$ white marbles, two picked without replacement. What probability goes in the "?"?', '3/7',
    { image: I('tree-BW-without.svg'), imageAlt: 'Tree diagram. First B 5/8, W 3/8. After B: B 4/7, W ?. After W: B 5/7, W 2/7.', hint: 'Branches from the same point add to 1.', solution: 'After a blue, $7$ are left and $3$ are white: $\\frac{3}{7}$ (and $\\frac{4}{7} + \\frac{3}{7} = 1$).' }),
  ty(TRE, 'A box is chosen, then a counter. What is the probability of box B and a red counter?', '1/8',
    { image: I('tree-boxes.svg'), imageAlt: 'Tree diagram. Box A 1/2: red 1/2, green 1/2. Box B 1/2: red 1/4, green 3/4.', solution: '$\\frac{1}{2} \\times \\frac{1}{4} = \\frac{1}{8}$' }),
  mc(TRE, 'On a tree diagram, the probability of one outcome is found by ___ the probabilities along its branches.', ['multiplying', 'adding', 'subtracting', 'averaging'],
    { solution: 'Multiply along a path. If several paths fit the event, add their results.' }),
  mc(TRE, 'For "exactly one red" there are two paths, $(R, B)$ and $(B, R)$. To get the probability you…', ['add the two path probabilities', 'multiply the two path probabilities', 'take the bigger one', 'subtract the smaller from the bigger'],
    { solution: 'Each path is one way it can happen, so add them.' }),
  mc(TRE, 'Selections made with replacement are…', ['independent', 'mutually exclusive', 'impossible', 'always equally likely'],
    { solution: 'Putting it back means the second pick has the same probabilities as the first, so the picks are independent.' })
];

// ---------------- extra: addition rule
const VP = { image: I('venn-p-3-2-4-1.svg'), imageAlt: 'Venn diagram of probabilities: A only 0.3, A and B 0.2, B only 0.4, neither 0.1' };
const V8 = { image: I('venn-8-4-6-2.svg'), imageAlt: 'Venn diagram: A only 8, A and B 4, B only 6, neither 2' };
const T3 = { image: I('twoway-3-9-6-2.svg'), imageAlt: "Two-way table. Row B: 3, 9, total 12. Row B': 6, 2, total 8. Totals: A 9, A' 11, 20." };
prob.push(
  ty(ADD, 'The Venn diagram shows probabilities. Find $\\Pr(A \\cup B)$.', '0.9', { ...VP, hint: 'Add everything inside the circles.', solution: '$0.3 + 0.2 + 0.4 = 0.9$ (or $1 - 0.1$).' }),
  ty(ADD, 'The Venn diagram shows probabilities. Find $\\Pr(A)$.', '0.5', { ...VP, solution: 'All of circle $A$: $0.3 + 0.2 = 0.5$.' }),
  ty(ADD, 'If $\\Pr(A) = 0.6$, $\\Pr(B) = 0.3$ and $\\Pr(A \\cap B) = 0.2$, find $\\Pr(A \\cup B)$.', '0.7', { solution: '$0.6 + 0.3 - 0.2 = 0.7$' }),
  ty(ADD, 'If $\\Pr(A \\cup B) = 0.8$, $\\Pr(A) = 0.5$ and $\\Pr(A \\cap B) = 0.1$, find $\\Pr(B)$.', '0.4', { hint: '$0.8 = 0.5 + \\Pr(B) - 0.1$', solution: '$0.8 = 0.4 + \\Pr(B)$, so $\\Pr(B) = 0.4$.' }),
  ty(ADD, '$n(A) = 12$, $n(B) = 10$ and $n(A \\cap B) = 4$. Find $n(A \\cup B)$.', '18', { ...V8, solution: '$12 + 10 - 4 = 18$. Check on the diagram: $8 + 4 + 6 = 18$.' }),
  ty(ADD, 'Find $\\Pr(A \\cup B)$.', '9/10', { ...T3, hint: 'Every cell that is in A or in B (or both).', solution: '$3 + 9 + 6 = 18$ out of $20$: $\\frac{18}{20} = \\frac{9}{10}$.' }),
  ty(ADD, 'A die is rolled. What is the probability of an even number or a number greater than $4$?', '2/3', { hint: 'Even: 2, 4, 6. Greater than 4: 5, 6. Don\'t count 6 twice.', solution: '$\\{2, 4, 5, 6\\}$: $\\frac{4}{6} = \\frac{2}{3}$. Or $\\frac{3}{6} + \\frac{2}{6} - \\frac{1}{6}$.' }),
  mc(ADD, 'A card is drawn from a standard deck of $52$. What is the probability it is red or an ace?', [fr(7, 13), fr(15, 26), fr(1, 26), fr(4, 13)],
    { hint: '26 red cards, 4 aces, 2 red aces.', solution: '$\\frac{26}{52} + \\frac{4}{52} - \\frac{2}{52} = \\frac{28}{52} = \\frac{7}{13}$' }),
  mc(ADD, 'A die is rolled. Which two events are mutually exclusive?', ['"rolling a 2" and "rolling an odd number"', '"rolling a 2" and "rolling an even number"', '"rolling a 5" and "rolling more than 3"', '"rolling an even number" and "rolling more than 4"'],
    { solution: '$2$ is not odd, so both can\'t happen at once. The others share an outcome ($2$, $5$ or $6$).' }),
  mc(ADD, 'For mutually exclusive events, the addition rule becomes $\\Pr(A \\cup B) = $', ['$\\Pr(A) + \\Pr(B)$', '$\\Pr(A) \\times \\Pr(B)$', '$\\Pr(A) + \\Pr(B) - 1$', '$1 - \\Pr(A \\cap B)$'],
    { solution: 'Mutually exclusive means $\\Pr(A \\cap B) = 0$, so there is nothing to subtract.' }),
  mc(ADD, '$\\Pr(A) = 0.4$, $\\Pr(B) = 0.5$ and $\\Pr(A \\cup B) = 0.7$. Are $A$ and $B$ mutually exclusive?', ['No, because $\\Pr(A \\cap B) = 0.2$', 'Yes, because $0.4 + 0.5 < 1$', 'Yes, because $\\Pr(A \\cup B) < 1$', 'No, because $\\Pr(A) < \\Pr(B)$'],
    { solution: '$0.4 + 0.5 - 0.7 = 0.2$. The overlap isn\'t $0$, so they are not mutually exclusive.' })
);

// ---------------- extra: conditional probability
prob.push(
  ty(CON, 'The Venn diagram shows probabilities. Find $\\Pr(A \\mid B)$.', '1/3', { ...VP, hint: '$\\Pr(A \\cap B) \\div \\Pr(B)$', solution: '$\\Pr(B) = 0.2 + 0.4 = 0.6$, so $\\frac{0.2}{0.6} = \\frac{1}{3}$.' }),
  ty(CON, 'The Venn diagram shows probabilities. Find $\\Pr(B \\mid A)$.', '0.4', { ...VP, hint: '$\\Pr(A \\cap B) \\div \\Pr(A)$', solution: '$\\Pr(A) = 0.5$, so $\\frac{0.2}{0.5} = 0.4$.' }),
  ty(CON, 'If $\\Pr(A \\cap B) = 0.12$ and $\\Pr(B) = 0.4$, find $\\Pr(A \\mid B)$.', '0.3', { solution: '$\\frac{0.12}{0.4} = 0.3$' }),
  ty(CON, 'If $\\Pr(A \\cap B) = 0.1$ and $\\Pr(A) = 0.5$, find $\\Pr(B \\mid A)$.', '0.2', { solution: 'Given $A$, so divide by $\\Pr(A)$: $\\frac{0.1}{0.5} = 0.2$.' }),
  ty(CON, 'If $\\Pr(A \\mid B) = 0.5$ and $\\Pr(B) = 0.6$, find $\\Pr(A \\cap B)$.', '0.3', { hint: '$\\Pr(A \\cap B) = \\Pr(A \\mid B) \\times \\Pr(B)$', solution: '$0.5 \\times 0.6 = 0.3$' }),
  ty(CON, 'Find $\\Pr(A \\mid B)$.', '2/5', { ...V8, hint: 'Only look inside circle B.', solution: '$B$ has $4 + 6 = 10$; $4$ are in $A$: $\\frac{4}{10} = \\frac{2}{5}$.' }),
  ty(CON, 'Find $\\Pr(B \\mid A)$.', '1/3', { ...V8, hint: 'Only look inside circle A.', solution: '$A$ has $8 + 4 = 12$; $4$ are in $B$: $\\frac{4}{12} = \\frac{1}{3}$.' }),
  ty(CON, 'Find $\\Pr(A \\mid B)$.', '1/4', { ...T3, hint: 'Only use row B.', solution: 'Row $B$ totals $12$; $3$ are in $A$: $\\frac{3}{12} = \\frac{1}{4}$.' }),
  ty(CON, 'Find $\\Pr(B \\mid A)$.', '1/3', { ...T3, hint: 'Only use column A.', solution: 'Column $A$ totals $9$; $3$ are in $B$: $\\frac{3}{9} = \\frac{1}{3}$.' }),
  ty(CON, "Find $\\Pr(B' \\mid A')$.", '2/11', { ...T3, hint: "Only use column A'.", solution: "Column $A'$ totals $11$; $2$ are in $B'$: $\\frac{2}{11}$." }),
  ty(CON, 'A die is rolled and shows an even number. What is the probability it is a $6$?', '1/3', { hint: 'The even numbers are the new sample space.', solution: 'Given even: $\\{2, 4, 6\\}$. One of them is $6$: $\\frac{1}{3}$.' }),
  ty(CON, 'A die is rolled and shows a number greater than $3$. What is the probability it is even?', '2/3', { solution: 'Given $> 3$: $\\{4, 5, 6\\}$. Two are even: $\\frac{2}{3}$.' }),
  ty(CON, 'A card drawn from a standard deck is a heart. What is the probability it is a king?', '1/13', { solution: 'Given a heart: $13$ cards, one is a king: $\\frac{1}{13}$.' }),
  ty(CON, 'Box B is chosen. What is the probability of a green counter?', '3/4', { image: I('tree-boxes.svg'), imageAlt: 'Tree diagram. Box A 1/2: red 1/2, green 1/2. Box B 1/2: red 1/4, green 3/4.', hint: 'Given box B: just read the branch.', solution: 'The second-stage branches are conditional: $\\Pr(\\text{green} \\mid B) = \\frac{3}{4}$.' }),
  mc(CON, 'When finding $\\Pr(A \\mid B)$, the sample space is reduced to…', ['$B$', '$A$', '$A \\cap B$', '$A \\cup B$'],
    { solution: 'We know $B$ happened, so only outcomes in $B$ count.' })
);

// Order by exercise (8A → 8F) for the preview; the game shuffles anyway.
const ORDER = [BAS, EXP, SET, VEN, TWT, ADD, CON, ARR, TRE];
const questions = ORDER.flatMap(sk => prob.filter(q => q.skill === sk));

const out = {
  id: 'year-10-probability-mix',
  title: 'Year 10 Probability (8A–8F)',
  year: 10,
  topic: 'Probability',
  description: `${prob.length} questions from 8A–8F: basics, experimental, set notation, Venn diagrams, two-way tables, the addition rule (${prob.filter(q => q.skill === ADD).length}), conditional probability (${prob.filter(q => q.skill === CON).length}), arrays and tree diagrams. ${prob.filter(q => q.image).length} have diagrams.`,
  questions,
  modified: []
};
// sanity checks
const { normaliseQuestion } = require('../server/questions');
const fsImg = q => !q.image || fs.existsSync(path.join(__dirname, '..', 'banks', q.image));
questions.forEach((q, i) => {
  if (!normaliseQuestion(q)) throw new Error('Bad question ' + i + ': ' + q.q);
  if (!fsImg(q)) throw new Error('Missing picture ' + q.image);
  if (q.type === 'mc' && new Set(q.options).size !== q.options.length) throw new Error('Duplicate option: ' + q.q);
});
fs.writeFileSync(path.join(__dirname, '..', 'banks', 'year-10-probability-mix.json'), JSON.stringify(out, null, 1) + '\n');
const by = {}; questions.forEach(q => { by[q.skill] = (by[q.skill] || 0) + 1; });
console.log(`wrote ${questions.length} questions, ${questions.filter(q => q.image).length} with pictures`, by);
