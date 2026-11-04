'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../dist/core.js');

function play(p1, p2, sequence) {
  return [...sequence].reduce((state, side) => P.toss(state, side), P.newRound(p1, p2));
}

// Independently solve the absorbing prefix Markov chain. This does not use the overlap formula.
function markovProbability(p1, p2) {
  const prefixes = [...new Set(['', p1[0], p1.slice(0, 2), p2[0], p2.slice(0, 2)])];
  const n = prefixes.length;
  const matrix = prefixes.map((prefix, row) => {
    const values = Array(n + 1).fill(0);
    values[row] = 1;
    for (const side of ['H', 'T']) {
      const next = prefix + side;
      if (next.endsWith(p2)) values[n] += 0.5;
      else if (!next.endsWith(p1)) {
        const suffix = prefixes.filter(candidate => next.endsWith(candidate)).sort((a, b) => b.length - a.length)[0];
        values[prefixes.indexOf(suffix)] -= 0.5;
      }
    }
    return values;
  });
  for (let col = 0; col < n; col += 1) {
    const pivot = matrix.findIndex((row, index) => index >= col && Math.abs(row[col]) > 1e-12);
    assert.notEqual(pivot, -1);
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const divisor = matrix[col][col];
    for (let i = col; i <= n; i += 1) matrix[col][i] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const multiple = matrix[row][col];
      for (let i = col; i <= n; i += 1) matrix[row][i] -= multiple * matrix[col][i];
    }
  }
  return matrix[0][n];
}

test('eight patterns and distinct choices are enforced', () => {
  assert.equal(P.PATTERNS.length, 8);
  assert.equal(P.label('HTH'), '正反正');
  for (const pattern of P.PATTERNS) assert.throws(() => P.newRound(pattern, pattern));
  for (const invalid of ['', 'HT', 'HTHH', '正反正', 'hth', null, 123]) {
    assert.throws(() => P.newRound(invalid, 'HHT'));
    assert.throws(() => P.bestResponse(invalid));
  }
});

test('HHHT finds HHT at toss four using the sliding window', () => {
  const state = play('HTH', 'HHT', 'HHHT');
  assert.equal(state.winner, 'P2');
  assert.equal(state.winningStart, 1);
  assert.deepEqual(state.history, [...'HHHT']);
});

test('HTHTHHT stops at the first HTH and never records post-win tosses', () => {
  const state = play('HTH', 'HHT', 'HTHTHHT');
  assert.equal(state.winner, 'P1');
  assert.equal(state.winningStart, 0);
  assert.deepEqual(state.history, [...'HTH']);
  assert.deepEqual(P.toss(state, 'T'), state);
});

test('overlapping windows are checked rather than groups of three', () => {
  const state = play('HHH', 'HTH', 'THTH');
  assert.equal(state.winner, 'P2');
  assert.equal(state.winningStart, 1);
  assert.equal(state.history.length, 4);
});

test('no early winner is possible and transitions do not mutate callers', () => {
  const original = P.newRound();
  const first = P.toss(original, 'H');
  const second = P.toss(first, 'T');
  assert.equal(first.winner, null);
  assert.equal(second.winner, null);
  assert.deepEqual(original.history, []);
  assert.deepEqual(first.history, ['H']);
  assert.throws(() => P.toss(second, 'invalid'));
});

test('choices lock on the first toss; new rounds clear the history and winner', () => {
  const selected = P.changeChoices(P.newRound(), 'TTT', 'HTT');
  assert.equal(selected.p1, 'TTT');
  assert.throws(() => P.changeChoices(P.toss(selected, 'H'), 'HHH', 'HHT'));
  const ended = play('TTT', 'HTT', 'TTT');
  const reset = P.newRound(ended.p1, ended.p2);
  assert.deepEqual(reset, { version: 1, p1: 'TTT', p2: 'HTT', history: [], winner: null, winningStart: null });
});

test('long histories are kept complete and survive JSON round trips', () => {
  const sequence = 'HT'.repeat(1024) + 'HHH';
  const state = play('HHH', 'TTT', sequence);
  assert.equal(state.history.length, 2051);
  assert.deepEqual(state.history, [...sequence]);
  assert.equal(state.winner, 'P1');
  const restored = P.restoreRound(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  restored.history[0] = 'T';
  assert.equal(state.history[0], 'H');
});

test('valid in-progress and finished persisted rounds restore with independent arrays', () => {
  for (const state of [P.newRound(), play('HTH', 'HHT', 'HH'), play('HTH', 'HHT', 'HHHT')]) {
    assert.deepEqual(P.restoreRound(JSON.parse(JSON.stringify(state))), state);
    assert.notEqual(P.restoreRound(state).history, state.history);
  }
});

test('tampered and malformed persisted rounds are rejected', () => {
  const empty = P.newRound();
  const ended = play('HTH', 'HHT', 'HHHT');
  const corrupt = [null, {}, [], { ...empty, version: 2 }, { ...empty, p1: 'HHT' },
    { ...empty, history: 'HT' }, { ...empty, history: ['H', 'X'] },
    { ...empty, history: new Array(1) }, { ...empty, history: ['H'], winner: 'P1' },
    { ...ended, winner: 'P1' }, { ...ended, winner: null }, { ...ended, winningStart: 0 },
    { ...ended, history: [...ended.history, 'T'] }, { ...empty, winningStart: 0 }];
  for (const value of corrupt) assert.throws(() => P.restoreRound(value));
});

test('all 56 distinct ordered matchups agree with an independent absorbing Markov chain', () => {
  let pairs = 0;
  for (const p1 of P.PATTERNS) {
    for (const p2 of P.PATTERNS) {
      if (p1 === p2) continue;
      const { numerator, denominator } = P.probabilityP2(p1, p2);
      assert.ok(Number.isInteger(numerator) && Number.isInteger(denominator));
      assert.ok(numerator > 0 && numerator < denominator);
      assert.ok(Math.abs(numerator / denominator - markovProbability(p1, p2)) < 1e-12, `${p1} vs ${p2}`);
      const reversed = P.probabilityP2(p2, p1);
      assert.ok(Math.abs(numerator / denominator + reversed.numerator / reversed.denominator - 1) < 1e-12);
      pairs += 1;
    }
  }
  assert.equal(pairs, 56);
});

test('the eight recommended responses give the known exact odds and are optimal', () => {
  const table = {
    HHH: ['THH', 7, 8], HHT: ['THH', 3, 4], HTH: ['HHT', 2, 3], HTT: ['HHT', 2, 3],
    THH: ['TTH', 2, 3], THT: ['TTH', 2, 3], TTH: ['HTT', 3, 4], TTT: ['HTT', 7, 8]
  };
  for (const [p1, [p2, numerator, denominator]] of Object.entries(table)) {
    assert.equal(P.bestResponse(p1), p2);
    assert.deepEqual(P.probabilityP2(p1, p2), { numerator, denominator });
    for (const candidate of P.PATTERNS.filter(value => value !== p1)) {
      const odds = P.probabilityP2(p1, candidate);
      assert.ok(odds.numerator / odds.denominator <= numerator / denominator + 1e-12);
    }
  }
});

test('crypto byte parity maps all 256 possible byte values to equal head and tail counts', () => {
  const count = { H: 0, T: 0 };
  for (let value = 0; value < 256; value += 1) {
    count[P.fairSide({ getRandomValues(bytes) { assert.equal(bytes.length, 1); bytes[0] = value; return bytes; } })] += 1;
  }
  assert.deepEqual(count, { H: 128, T: 128 });
  assert.throws(() => P.fairSide(null));
  assert.throws(() => P.fairSide({}));
});
