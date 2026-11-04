(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Penney = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PATTERNS = Object.freeze(['HHH', 'HHT', 'HTH', 'HTT', 'THH', 'THT', 'TTH', 'TTT']);
  const validPattern = value => typeof value === 'string' && PATTERNS.includes(value);
  const validSide = value => value === 'H' || value === 'T';
  const label = pattern => pattern.split('').map(side => side === 'H' ? '正' : '反').join('');

  function checkPair(p1, p2) {
    if (!validPattern(p1) || !validPattern(p2)) throw new TypeError('请选择三枚硬币的组合。');
    if (p1 === p2) throw new RangeError('两位玩家需要选择不同的组合。');
  }

  function newRound(p1 = 'HTH', p2 = 'HHT') {
    checkPair(p1, p2);
    return { version: 1, p1, p2, history: [], winner: null, winningStart: null };
  }

  function firstMatch(history, p1, p2) {
    for (let index = 2; index < history.length; index += 1) {
      const pattern = history.slice(index - 2, index + 1).join('');
      if (pattern === p1 || pattern === p2) {
        return { winner: pattern === p1 ? 'P1' : 'P2', winningStart: index - 2, end: index };
      }
    }
    return { winner: null, winningStart: null, end: null };
  }

  // Validate the entire stored history, including the rule that a round ends at its first match.
  function restoreRound(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw new TypeError('存档版本无效。');
    checkPair(value.p1, value.p2);
    if (!Array.isArray(value.history) || !Array.from(value.history).every(validSide)) throw new TypeError('存档中的抛掷记录无效。');
    const result = firstMatch(value.history, value.p1, value.p2);
    if (result.end !== null && result.end !== value.history.length - 1) throw new RangeError('存档包含本轮结束后的记录。');
    if (value.winner !== result.winner || value.winningStart !== result.winningStart) throw new RangeError('存档的获胜信息与记录不一致。');
    return {
      version: 1, p1: value.p1, p2: value.p2, history: value.history.slice(),
      winner: result.winner, winningStart: result.winningStart
    };
  }

  function changeChoices(state, p1, p2) {
    const current = restoreRound(state);
    if (current.history.length) throw new RangeError('开始抛掷后，组合会锁定到下一轮。');
    return newRound(p1, p2);
  }

  function toss(state, side) {
    if (!validSide(side)) throw new TypeError('硬币结果只能是 H 或 T。');
    const current = restoreRound(state);
    if (current.winner) return current;
    current.history.push(side);
    const lastThree = current.history.slice(-3).join('');
    if (lastThree === current.p1 || lastThree === current.p2) {
      current.winner = lastThree === current.p1 ? 'P1' : 'P2';
      current.winningStart = current.history.length - 3;
    }
    return current;
  }

  function overlap(x, y) {
    let sum = 0;
    for (let length = 1; length <= 3; length += 1) {
      if (x.slice(-length) === y.slice(0, length)) sum += 2 ** length;
    }
    return sum;
  }

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

  function probabilityP2(p1, p2) {
    checkPair(p1, p2);
    const numerator = overlap(p1, p1) - overlap(p1, p2);
    const denominator = numerator + overlap(p2, p2) - overlap(p2, p1);
    const divisor = gcd(numerator, denominator);
    return { numerator: numerator / divisor, denominator: denominator / divisor };
  }

  function bestResponse(p1) {
    if (!validPattern(p1)) throw new TypeError('请选择三枚硬币的组合。');
    return (p1[1] === 'H' ? 'T' : 'H') + p1.slice(0, 2);
  }

  function fairSide(cryptoSource) {
    if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全随机数，请使用下方的手动记录。');
    const bytes = new Uint8Array(1);
    cryptoSource.getRandomValues(bytes);
    return (bytes[0] & 1) === 0 ? 'H' : 'T';
  }

  return Object.freeze({ PATTERNS, label, newRound, restoreRound, changeChoices, toss, probabilityP2, bestResponse, fairSide });
}));
