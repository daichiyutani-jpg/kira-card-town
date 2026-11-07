// 画面の土台：要素づくり・画面切りかえ・重ね表示・会話・トースト・セーブ
import { loadSave, newSave, writeSave, type SaveData } from '../game/save';
import { sfx } from '../audio/sound';

export const root = () => document.getElementById('app')!;

type Child = Node | string | number | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') e.innerHTML = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) e.append(typeof c === 'object' ? c : String(c));
  return e;
}

// ---------- セーブ ----------
export const game: { d: SaveData; note: string } = { d: newSave(), note: '' };
export function hasSave(): boolean {
  return !!localStorage.getItem('kira-card-town-save-v1');
}
export function loadGame(): boolean {
  const r = loadSave(localStorage);
  game.note = r.note;
  if (!r.data) return false;
  game.d = r.data;
  return true;
}
let saveTimer = 0;
export function save(): void {
  clearTimeout(saveTimer);
  try {
    writeSave(localStorage, game.d);
  } catch (e) {
    toast('保存できませんでした（空き容量を確認してください）');
    console.error(e);
  }
}
export function saveSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 400);
}

// ---------- 画面 ----------
let current: { el: HTMLElement; cleanup?: () => void } | null = null;
export function showScreen(el: HTMLElement, cleanup?: () => void): void {
  current?.cleanup?.();
  root().replaceChildren(el);
  current = { el, cleanup };
}

export function overlay(content: HTMLElement, opts: { bottom?: boolean; onClose?: () => void; closeOnBg?: boolean } = {}): () => void {
  const ov = h('div', { class: `overlay${opts.bottom ? ' bottom' : ''}` }, content);
  // スクロールさせず、入りきらない時は少し小さくして全部見せる
  autoFit(content, ov, () => {
    const cs = getComputedStyle(ov);
    return ov.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 4;
  });
  const close = () => {
    ov.remove();
    opts.onClose?.();
  };
  if (opts.closeOnBg !== false)
    ov.addEventListener('click', (e) => {
      if (e.target === ov) {
        sfx('cancel');
        close();
      }
    });
  root().append(ov);
  return close;
}

/**
 * 枠に収める：中身が枠より高い時だけ、全体を少し小さく（zoom）して全部見えるようにする。
 * 中身が変わった時・枠の大きさが変わった時に測り直す。minZoom より小さくはしない。
 */
export function autoFit(inner: HTMLElement, frame: HTMLElement, avail: () => number, minZoom = 0.55): void {
  let busy = false;
  const fit = () => {
    if (busy || !inner.isConnected) return;
    busy = true;
    inner.style.zoom = '1';
    const H = avail();
    let z = 1;
    for (let k = 0; k < 4 && H > 0; k++) {
      const hgt = inner.getBoundingClientRect().height;
      if (hgt <= H + 0.5) break;
      z = Math.max(minZoom, z * (H / hgt) - 0.004);
      inner.style.zoom = String(z);
      if (z === minZoom) break;
    }
    busy = false;
  };
  let raf = 0;
  const soon = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fit);
  };
  new ResizeObserver(fit).observe(frame);
  new MutationObserver(soon).observe(inner, { childList: true, subtree: true, characterData: true });
  // 画像やフォントが読みこまれて高さが変わった時も
  inner.addEventListener('load', soon, true);
  // 出てくる時の拡大アニメの最中は小さく測れてしまうので、終わったら測り直す
  inner.addEventListener('animationend', soon);
}

export function toast(msg: string, ms = 1800): void {
  const t = h('div', { class: 'toast' }, msg);
  root().append(t);
  setTimeout(() => t.remove(), ms);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface Line {
  s: string;
  t: string;
}

/** 会話を順に表示する。タップで次へ */
export function talk(lines: (Line | string)[]): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const catcher = h('div', { class: 'talk-catch' });
    const box = h('div', { class: 'talk' });
    const show = () => {
      const l = lines[i];
      const line = typeof l === 'string' ? { s: '', t: l } : l;
      box.replaceChildren(...[line.s ? h('div', { class: 'who' }, line.s) : null, h('div', { class: 'text' }, line.t.replace('{name}', game.d.name)), h('div', { class: 'next' }, i < lines.length - 1 ? '▼ タップ' : '▼ とじる')].filter(Boolean) as HTMLElement[]);
    };
    const next = () => {
      sfx('tap');
      i++;
      if (i >= lines.length) {
        catcher.remove();
        box.remove();
        resolve();
      } else show();
    };
    catcher.addEventListener('click', next);
    box.addEventListener('click', next);
    if (!lines.length) return resolve();
    show();
    root().append(catcher, box);
  });
}

/** 選択肢。キャンセル（範囲外タップ）で null */
export function choose(text: string | Line, options: { label: string; value: string; disabled?: boolean; cls?: string }[], who = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const line = typeof text === 'string' ? { s: who, t: text } : text;
    const catcher = h('div', { class: 'talk-catch' });
    const done = (v: string | null) => {
      catcher.remove();
      box.remove();
      resolve(v);
    };
    const box = h(
      'div',
      { class: 'talk' },
      line.s ? h('div', { class: 'who' }, line.s) : null,
      h('div', { class: 'text' }, line.t),
      h(
        'div',
        { class: 'choices' },
        options.map((o) =>
          h(
            'button',
            {
              class: `btn ${o.cls ?? ''}`,
              disabled: o.disabled,
              onclick: () => {
                sfx('ok');
                done(o.value);
              },
            },
            o.label,
          ),
        ),
      ),
    );
    catcher.addEventListener('click', () => {
      sfx('cancel');
      done(null);
    });
    root().append(catcher, box);
  });
}

export function confirmBox(msg: string, ok = 'はい', ng = 'いいえ'): Promise<boolean> {
  return new Promise((resolve) => {
    let closer = () => {};
    const box = h('div', { class: 'modal' }, h('p', { style: { fontSize: '17px', lineHeight: '1.6', margin: '0 0 14px', whiteSpace: 'pre-wrap' } }, msg), h('div', { class: 'row' }, h('button', { class: 'btn gray grow', onclick: () => (sfx('cancel'), closer(), resolve(false)) }, ng), h('button', { class: 'btn primary grow', onclick: () => (sfx('ok'), closer(), resolve(true)) }, ok)));
    closer = overlay(box, { closeOnBg: false });
  });
}

export function titleBar(title: string, onBack: (() => void) | null, extra?: HTMLElement): HTMLElement {
  return h('div', { class: 'title-bar' }, onBack ? h('button', { class: 'btn small gray', onclick: () => (sfx('cancel'), onBack()) }, '← もどる') : null, h('h2', {}, title), extra ?? h('span', { class: 'money' }, `💰 ${game.d.money.toLocaleString()}`));
}

export function confetti(): void {
  const box = h('div', { class: 'confetti' });
  const colors = ['#ff5d8f', '#ffcc33', '#4cff7a', '#3c8dff', '#b05dff', '#fff'];
  for (let i = 0; i < 60; i++) box.append(h('i', { style: { left: `${Math.random() * 100}%`, background: colors[i % colors.length], animationDelay: `${Math.random() * 0.8}s`, animationDuration: `${1.8 + Math.random() * 1.4}s` } }));
  root().append(box);
  setTimeout(() => box.remove(), 4000);
}
