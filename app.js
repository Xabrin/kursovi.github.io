(() => {
  'use strict';

  const NBSP = ' ';        // узкий неразрывный пробел между разрядами
  const MINUS = '−';       // типографский минус
  const DOT = '·';         // разделитель в подписи
  const MAX_DIGITS = 12;
  const STORE_KEY = 'percent-calc.state.v1';

  /* ---------- числа ---------- */

  const round = (n) => Number(n.toFixed(6));

  function group(str) {
    const neg = str.startsWith('-');
    const body = neg ? str.slice(1) : str;
    const [int, frac] = body.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? MINUS : '') + grouped + (frac ? ',' + frac : '');
  }

  // Число -> строка для показа: 1234.5 -> "1 234,5"
  function fmt(n) {
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) {
      return n.toExponential(4).replace(/\.?0+e/, 'e').replace('.', ',').replace('-', MINUS);
    }
    return group(String(round(n)));
  }

  // Строка ввода -> строка для показа: "-1234,5" -> "−1 234,5"
  function fmtInput(raw) {
    if (raw === '') return '';
    const neg = raw.startsWith('-');
    const body = neg ? raw.slice(1) : raw;
    const [int, frac] = body.split(',');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? MINUS : '') + grouped + (frac !== undefined ? ',' + frac : '');
  }

  function parse(raw) {
    if (raw === '' || raw === '-') return NaN;
    return parseFloat(raw.replace(',', '.'));
  }

  const lenClass = (s) => (s.length > 15 ? 'xlong' : s.length > 11 ? 'long' : '');

  /* ---------- режимы ---------- */

  const MODES = [
    {
      id: 'of',
      tab: 'Процент от числа',
      fields: [
        { label: 'Процент', unit: '%', ph: 'X' },
        { label: 'Число', unit: '', ph: 'Y' }
      ],
      tpl: 'Сколько будет {0}% от {1}',
      empty: 'Введите процент и число',
      calc(p, n) {
        const value = n * p / 100;
        return {
          value,
          note: `${fmt(n)} ${MINUS} ${fmt(value)} = ${fmt(n - value)}  ${DOT}  ` +
                `${fmt(n)} + ${fmt(value)} = ${fmt(n + value)}`
        };
      }
    },
    {
      id: 'share',
      tab: 'Доля в процентах',
      fields: [
        { label: 'Часть', unit: '', ph: 'X' },
        { label: 'Целое', unit: '', ph: 'Y' }
      ],
      tpl: '{0} — это сколько процентов от {1}',
      empty: 'Введите часть и целое',
      calc(a, b) {
        if (b === 0) return { error: 'Целое не может быть нулём' };
        const value = a / b * 100;
        return {
          value,
          unit: '%',
          note: `Остальное: ${fmt(b - a)} — это ${fmt(100 - value)}%`
        };
      }
    },
    {
      id: 'delta',
      tab: 'Прибавить процент',
      fields: [
        { label: 'Число', unit: '', ph: 'X' },
        { label: 'Процент', unit: '%', ph: 'Y' }
      ],
      sign: true,
      tpl: (sign) => (sign > 0 ? '{0} плюс {1}%' : '{0} минус {1}%'),
      empty: 'Введите число и процент',
      calc(n, p, sign) {
        const diff = n * p / 100;
        return {
          value: n + sign * diff,
          note: `Изменение: ${sign > 0 ? '+' : MINUS}${fmt(Math.abs(diff))}`
        };
      }
    },
    {
      id: 'change',
      tab: 'Изменение в %',
      fields: [
        { label: 'Было', unit: '', ph: 'X' },
        { label: 'Стало', unit: '', ph: 'Y' }
      ],
      signed: true,
      tpl: 'Было {0}, стало {1} — на сколько процентов изменилось',
      empty: 'Введите старое и новое значение',
      calc(a, b) {
        if (a === 0) return { error: '«Было» не может быть нулём' };
        const value = (b - a) / a * 100;
        const diff = b - a;
        const word = diff > 0 ? 'Рост' : diff < 0 ? 'Снижение' : 'Без изменений';
        return {
          value,
          unit: '%',
          note: diff === 0 ? word : `${word} на ${fmt(Math.abs(diff))}`
        };
      }
    }
  ];

  /* ---------- состояние ---------- */

  const state = { mode: 0, focus: 0, sign: 1, vals: ['', ''] };

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!saved) return;
      if (Number.isInteger(saved.mode) && MODES[saved.mode]) state.mode = saved.mode;
      if (saved.focus === 0 || saved.focus === 1) state.focus = saved.focus;
      if (saved.sign === 1 || saved.sign === -1) state.sign = saved.sign;
      if (Array.isArray(saved.vals) && saved.vals.length === 2 &&
          saved.vals.every((v) => typeof v === 'string' && /^-?\d*,?\d*$/.test(v))) {
        state.vals = saved.vals.slice();
      }
    } catch { /* повреждённое хранилище — стартуем с чистого состояния */ }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* приватный режим */ }
  }

  /* ---------- разметка ---------- */

  const $ = (id) => document.getElementById(id);
  const elModes = $('modes');
  const elFields = $('fields');
  const elPrompt = $('prompt');
  const elSignRow = $('signRow');
  const elResult = $('result');
  const elValue = $('resultValue');
  const elUnit = $('resultUnit');
  const elNote = $('resultNote');
  const elHint = $('resultHint');

  const fieldEls = MODES[0].fields.map((_, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'field';
    btn.dataset.idx = String(i);
    btn.innerHTML = '<span class="field__label"></span>' +
                    '<span class="field__value"></span>' +
                    '<span class="field__unit"></span>';
    elFields.append(btn);
    return {
      root: btn,
      label: btn.querySelector('.field__label'),
      value: btn.querySelector('.field__value'),
      unit: btn.querySelector('.field__unit')
    };
  });

  MODES.forEach((mode, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode';
    btn.setAttribute('role', 'tab');
    btn.textContent = mode.tab;
    btn.addEventListener('click', () => {
      state.mode = i;
      state.focus = 0;
      render();
      save();
    });
    elModes.append(btn);
  });

  elFields.addEventListener('click', (e) => {
    const btn = e.target.closest('.field');
    if (!btn) return;
    state.focus = Number(btn.dataset.idx);
    render();
    save();
  });

  elSignRow.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sign]');
    if (!btn) return;
    state.sign = Number(btn.dataset.sign);
    render();
    save();
  });

  $('keypad').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn) press(btn.dataset.key);
  });

  elResult.addEventListener('click', copyResult);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Tab и Enter не перехватываем — они нужны для навигации с клавиатуры
    const map = {
      Backspace: 'back', Delete: 'clear', Escape: 'clear',
      '.': 'dot', ',': 'dot', '-': 'neg'
    };
    const key = /^\d$/.test(e.key) ? e.key : map[e.key];
    if (!key) return;
    e.preventDefault();
    press(key);
  });

  /* ---------- ввод ---------- */

  function press(key) {
    const i = state.focus;
    const cur = state.vals[i];

    if (/^\d$/.test(key)) {
      if (cur.replace(/\D/g, '').length >= MAX_DIGITS) return;
      if (cur === '0') state.vals[i] = key;
      else if (cur === '-0') state.vals[i] = '-' + key;
      else state.vals[i] = cur + key;
    } else if (key === 'dot') {
      if (cur.includes(',')) return;
      state.vals[i] = (cur === '' || cur === '-' ? cur + '0' : cur) + ',';
    } else if (key === 'neg') {
      state.vals[i] = cur.startsWith('-') ? cur.slice(1) : '-' + cur;
    } else if (key === 'back') {
      state.vals[i] = cur.slice(0, -1);
    } else if (key === 'clear') {
      if (cur === '') state.vals = ['', ''];
      else state.vals[i] = '';
    } else if (key === 'swap') {
      state.vals = [state.vals[1], state.vals[0]];
    } else if (key === 'next') {
      state.focus = (i + 1) % state.vals.length;
    }

    render();
    save();
  }

  /* ---------- отрисовка ---------- */

  function renderPrompt(tpl, parts) {
    elPrompt.textContent = '';
    const re = /\{(\d)\}/g;
    let last = 0, m;
    while ((m = re.exec(tpl)) !== null) {
      if (m.index > last) elPrompt.append(tpl.slice(last, m.index));
      const b = document.createElement('b');
      b.textContent = parts[Number(m[1])];
      elPrompt.append(b);
      last = m.index + m[0].length;
    }
    if (last < tpl.length) elPrompt.append(tpl.slice(last));
  }

  let copyValue = '';

  function render() {
    const mode = MODES[state.mode];

    Array.from(elModes.children).forEach((btn, i) => {
      btn.setAttribute('aria-selected', String(i === state.mode));
    });

    fieldEls.forEach((f, i) => {
      const spec = mode.fields[i];
      const shown = fmtInput(state.vals[i]);
      f.label.textContent = spec.label;
      f.unit.textContent = spec.unit;
      f.value.textContent = shown || '0';
      f.value.classList.toggle('is-empty', shown === '');
      f.value.dataset.len = lenClass(shown);
      f.root.classList.toggle('is-active', i === state.focus);
      f.root.setAttribute('aria-label', `${spec.label}: ${shown || 'пусто'}`);
    });

    elSignRow.hidden = !mode.sign;
    if (mode.sign) {
      Array.from(elSignRow.children).forEach((btn) => {
        btn.classList.toggle('is-active', Number(btn.dataset.sign) === state.sign);
      });
    }

    const tpl = typeof mode.tpl === 'function' ? mode.tpl(state.sign) : mode.tpl;
    renderPrompt(tpl, mode.fields.map((spec, i) => fmtInput(state.vals[i]) || spec.ph));

    const a = parse(state.vals[0]);
    const b = parse(state.vals[1]);
    const out = (Number.isNaN(a) || Number.isNaN(b))
      ? { error: mode.empty }
      : mode.calc(a, b, state.sign);

    elValue.classList.remove('is-up', 'is-down', 'is-empty');

    if (out.error || !Number.isFinite(out.value)) {
      copyValue = '';
      elValue.textContent = '—';
      elValue.dataset.len = '';
      elValue.classList.add('is-empty');
      elUnit.textContent = '';
      elNote.textContent = out.error || 'Не получается посчитать';
      elHint.textContent = '';
    } else {
      const rounded = round(out.value);
      const sign = mode.signed && rounded > 0 ? '+' : '';
      const shown = sign + fmt(out.value);
      copyValue = String(rounded);
      elValue.textContent = shown;
      elValue.dataset.len = lenClass(shown);
      if (mode.signed) elValue.classList.add(rounded > 0 ? 'is-up' : rounded < 0 ? 'is-down' : 'is-empty');
      elUnit.textContent = out.unit || '';
      elNote.textContent = out.note || '';
      elHint.textContent = 'нажмите, чтобы скопировать';
    }
    elResult.classList.remove('is-copied');
  }

  /* ---------- копирование ---------- */

  let copyTimer = 0;

  function copyResult() {
    if (!copyValue) return;
    const done = () => {
      elResult.classList.add('is-copied');
      elHint.textContent = 'скопировано ✓';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        elResult.classList.remove('is-copied');
        elHint.textContent = 'нажмите, чтобы скопировать';
      }, 1500);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(copyValue).then(done, () => { if (fallbackCopy(copyValue)) done(); });
    } else if (fallbackCopy(copyValue)) {
      done();
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------- старт ---------- */

  load();
  render();

  if ('serviceWorker' in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* офлайн-режим просто не включится */ });
    });
  }
})();
