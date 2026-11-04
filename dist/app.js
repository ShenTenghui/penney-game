(function () {
  'use strict';
  const game = window.Penney;
  const STORAGE_KEY = 'penney-game.round.v1';
  const $ = id => document.getElementById(id);
  const ui = {
    p1: $('p1'), p2: $('p2'), p1coins: $('p1-coins'), p2coins: $('p2-coins'),
    status: $('status'), toss: $('toss'), auto: $('auto'), manualH: $('manual-h'), manualT: $('manual-t'),
    reset: $('reset'), counter: $('counter'), history: $('history'), empty: $('history-empty'),
    coin: $('large-coin'), coinFace: $('coin-face'), total: $('total'), heads: $('heads'), tails: $('tails'),
    probability: $('probability'), error: $('error'), save: $('save-status'), hint: $('choice-hint')
  };
  let state = game.newRound();
  let timer = null;
  let errorTimer = null;
  let storageAvailable = true;
  let loadedRound = false;

  function showError(message) {
    ui.error.textContent = message;
    ui.error.hidden = false;
    window.clearTimeout(errorTimer);
    errorTimer = window.setTimeout(() => { ui.error.hidden = true; }, 6000);
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      state = game.restoreRound(JSON.parse(saved));
      loadedRound = true;
    }
  } catch (error) {
    if (error.name === 'SecurityError' || error.name === 'QuotaExceededError') storageAvailable = false;
    else showError('上次的本地记录无法读取，已开始新一轮。');
  }

  function save() {
    if (!storageAvailable) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { storageAvailable = false; }
  }

  for (const select of [ui.p1, ui.p2]) {
    for (const pattern of game.PATTERNS) {
      const option = document.createElement('option');
      option.value = pattern;
      option.textContent = game.label(pattern);
      select.appendChild(option);
    }
  }

  function patternCoins(element, pattern) {
    element.replaceChildren();
    for (const side of pattern) {
      const span = document.createElement('span');
      span.className = 'small-coin' + (side === 'T' ? ' tail' : '');
      span.textContent = side === 'H' ? '正' : '反';
      element.appendChild(span);
    }
  }

  function render() {
    const started = state.history.length > 0;
    const ended = state.winner !== null;
    ui.p1.value = state.p1;
    ui.p2.value = state.p2;
    ui.p1.disabled = ui.p2.disabled = started;
    for (const option of ui.p1.options) option.disabled = option.value === state.p2;
    for (const option of ui.p2.options) option.disabled = option.value === state.p1;
    patternCoins(ui.p1coins, state.p1);
    patternCoins(ui.p2coins, state.p2);
    ui.hint.textContent = started ? '本轮组合已锁定；点「新一轮」可以重新选择。' : '先由 P1 选择，再由 P2 选择；两人的组合不能相同。';
    ui.counter.disabled = started;
    const probability = game.probabilityP2(state.p1, state.p2);
    ui.probability.textContent = `${probability.numerator} / ${probability.denominator} · ${(100 * probability.numerator / probability.denominator).toFixed(1)}%`;
    document.querySelector('.game').classList.toggle('has-winner', ended);
    document.querySelector('.player-one').classList.toggle('winner', state.winner === 'P1');
    document.querySelector('.player-two').classList.toggle('winner', state.winner === 'P2');
    ui.toss.disabled = ui.manualH.disabled = ui.manualT.disabled = ended || timer !== null;
    ui.auto.disabled = ended;
    ui.auto.textContent = timer !== null ? '暂停抛掷' : '连续抛掷';
    ui.auto.setAttribute('aria-pressed', String(timer !== null));
    const last = state.history.at(-1);
    ui.coinFace.textContent = last ? (last === 'H' ? '正' : '反') : '?';
    ui.coin.classList.toggle('tail-face', last === 'T');
    if (ended) ui.status.textContent = `${state.winner} 赢了！「${game.label(state.winner === 'P1' ? state.p1 : state.p2)}」在第 ${state.history.length} 次出现。`;
    else if (timer !== null) ui.status.textContent = '正在连续抛掷，出现赢家就会停下。';
    else if (started) ui.status.textContent = `第 ${state.history.length} 次：${last === 'H' ? '正' : '反'}。继续等下一个组合。`;
    else ui.status.textContent = '组合选好了，就抛第一枚。';
    ui.total.textContent = String(state.history.length);
    ui.heads.textContent = String(state.history.filter(side => side === 'H').length);
    ui.tails.textContent = String(state.history.filter(side => side === 'T').length);
    ui.empty.hidden = started;
    const fragment = document.createDocumentFragment();
    state.history.forEach((side, index) => {
      const item = document.createElement('li');
      const winning = ended && index >= state.winningStart && index < state.winningStart + 3;
      item.className = (side === 'T' ? 'tail' : 'head') + (winning ? ' winning' : '');
      item.setAttribute('aria-label', `第 ${index + 1} 次：${side === 'H' ? '正' : '反'}${winning ? '，获胜组合' : ''}`);
      const coin = document.createElement('span');
      coin.className = 'history-coin';
      coin.textContent = side === 'H' ? '正' : '反';
      coin.setAttribute('aria-hidden', 'true');
      const number = document.createElement('span');
      number.className = 'history-index';
      number.textContent = String(index + 1).padStart(2, '0');
      number.setAttribute('aria-hidden', 'true');
      item.append(coin, number);
      fragment.appendChild(item);
    });
    ui.history.replaceChildren(fragment);
    ui.history.scrollTop = ui.history.scrollHeight;
    ui.save.textContent = storageAvailable ? '本轮已保存在当前浏览器。' : '本轮仅在当前页面保留；浏览器未允许本地保存。';
  }

  function stopAuto() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function record(side) {
    if (state.winner) return;
    try {
      state = game.toss(state, side);
      if (state.winner) stopAuto();
      save();
      render();
      ui.coin.classList.remove('tossed');
      void ui.coin.offsetWidth;
      ui.coin.classList.add('tossed');
    } catch (error) { stopAuto(); render(); showError(error.message); }
  }

  function randomToss() {
    try { record(game.fairSide(window.crypto)); }
    catch (error) { stopAuto(); render(); showError(error.message); }
  }

  function updateChoices() {
    try { state = game.changeChoices(state, ui.p1.value, ui.p2.value); save(); render(); }
    catch (error) { render(); showError(error.message); }
  }

  ui.p1.addEventListener('change', updateChoices);
  ui.p2.addEventListener('change', updateChoices);
  ui.toss.addEventListener('click', randomToss);
  ui.manualH.addEventListener('click', () => record('H'));
  ui.manualT.addEventListener('click', () => record('T'));
  ui.auto.addEventListener('click', () => {
    if (timer !== null) { stopAuto(); render(); return; }
    if (state.winner) return;
    timer = window.setInterval(randomToss, 600);
    render();
    randomToss();
  });
  ui.reset.addEventListener('click', () => {
    stopAuto();
    state = game.newRound(state.p1, state.p2);
    save(); render();
    ui.coin.classList.remove('tossed');
  });
  ui.counter.addEventListener('click', () => {
    if (state.history.length) return;
    state = game.changeChoices(state, state.p1, game.bestResponse(state.p1));
    save(); render();
  });
  // Browsers throttle background tabs; pause rather than add an unseen burst of tosses.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer !== null) { stopAuto(); render(); }
  });
  save();
  render();
  if (loadedRound && state.history.length) ui.save.textContent = '已恢复上次保存在当前浏览器的这一轮。';
}());
