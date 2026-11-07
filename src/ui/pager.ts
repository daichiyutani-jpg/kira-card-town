/**
 * ページ送り：スクロールさせずに、枠に入る分だけ並べて「‹ 1/3 ›」でめくる。
 * 枠の大きさを実際に測って、入るところまで詰める（画面の大きさが変わったら数え直す）。左右になぞってもめくれる。
 */
import { sfx } from '../audio/sound';
import { autoFit, h } from './app';

export interface Pager {
  /** 外枠（画面に置く要素） */
  el: HTMLElement;
  /** 並べるものを入れかえる。keepPage=true なら今のページあたりを保つ */
  set(items: HTMLElement[], opts?: { empty?: string; keepPage?: boolean }): void;
}

export interface PagerOpts {
  /** 中身の並べ方のクラス（grid / list など） */
  body: string;
  /** 全部同じ大きさ（カードの一覧）なら、1ページ目の数をほかのページにも使う */
  uniform?: boolean;
  /** めくるボタンを左右に置く（横1列の帯に使う） */
  side?: boolean;
  /** 外枠に付けるクラス */
  cls?: string;
  /** カードを少し小さくして（この倍率まで）もう1段入るなら小さくする。空いたすき間を減らしてページ数を少なくする */
  shrinkTo?: number;
}

export function pager(o: PagerOpts): Pager {
  const body = h('div', { class: `pager-body ${o.body}` });
  const label = h('span', { class: 'pg-label' });
  const prev = h('button', { class: 'pg-btn', 'aria-label': '前のページ', onclick: () => go(page - 1) }, '‹');
  const next = h('button', { class: 'pg-btn', 'aria-label': '次のページ', onclick: () => go(page + 1) }, '›');
  const nav = o.side ? null : h('div', { class: 'pager-nav' }, prev, label, next);
  const el = o.side
    ? h('div', { class: `pager side ${o.cls ?? ''}` }, prev, body, next, label)
    : h('div', { class: `pager ${o.cls ?? ''}` }, body, nav);

  let items: HTMLElement[] = [];
  let empty = '';
  let starts: number[] = [0];
  let page = 0;
  let lastW = 0;
  let lastH = 0;

  const navShown = (on: boolean) => {
    if (nav) nav.style.visibility = on ? '' : 'hidden';
    else for (const b of [prev, next, label]) b.style.visibility = on ? '' : 'hidden';
  };
  const fits = (it: HTMLElement) => {
    const b = body.getBoundingClientRect();
    const cs = getComputedStyle(body);
    const r = it.getBoundingClientRect();
    return r.bottom <= b.bottom - parseFloat(cs.paddingBottom) + 0.5 && r.right <= b.right - parseFloat(cs.paddingRight) + 0.5;
  };
  const show = () => {
    const end = starts[page + 1] ?? items.length;
    body.replaceChildren(...items.slice(starts[page], end));
    if (!items.length && empty) body.append(h('div', { class: 'empty' }, empty));
    label.textContent = `${page + 1} / ${starts.length}`;
    (prev as HTMLButtonElement).disabled = page <= 0;
    (next as HTMLButtonElement).disabled = page >= starts.length - 1;
    navShown(starts.length > 1);
  };
  const layout = () => {
    lastW = body.clientWidth;
    lastH = body.clientHeight;
    const keep = starts[page] ?? 0;
    if (!lastW || !lastH) return show();
    if (o.shrinkTo && items.length) fitZoom();
    starts = [];
    let i = 0;
    let cap = 0;
    while (i < items.length) {
      starts.push(i);
      if (o.uniform && cap) {
        i += cap;
        continue;
      }
      body.replaceChildren();
      let n = 0;
      while (i < items.length) {
        body.append(items[i]);
        if (n > 0 && !fits(items[i])) {
          items[i].remove();
          break;
        }
        i++;
        n++;
      }
      cap = n;
    }
    if (!starts.length) starts = [0];
    page = 0;
    while (page < starts.length - 1 && starts[page + 1] <= keep) page++;
    show();
  };
  // 1枚の高さとすき間から、何段入るかを計算して、あと1段入る倍率にする
  const fitZoom = () => {
    body.style.setProperty('--pz', '1');
    body.replaceChildren(items[0]);
    const cs = getComputedStyle(body);
    const ih = items[0].getBoundingClientRect().height;
    const gap = parseFloat(cs.rowGap) || 0;
    const H = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!ih) return;
    const rows = Math.max(1, Math.floor((H + gap) / (ih + gap)));
    const n = rows + 1;
    const z = (H - (n - 1) * gap) / (n * ih); // すき間は小さくならないので、カードの高さだけで割る
    body.style.setProperty('--pz', String(z >= (o.shrinkTo ?? 1) ? Math.min(1, z - 0.005).toFixed(3) : '1'));
  };
  const go = (p: number) => {
    if (p < 0 || p >= starts.length || p === page) return;
    sfx('tap');
    page = p;
    show();
  };

  // 大きさが変わったら数え直す（画面に出た時・回転した時も）
  new ResizeObserver(() => {
    if (body.clientWidth !== lastW || body.clientHeight !== lastH) layout();
  }).observe(body);

  // 左右になぞってめくる。めくった時はカードを開かない
  let sx = 0;
  let sy = 0;
  let swiped = false;
  body.addEventListener('pointerdown', (e) => {
    sx = e.clientX;
    sy = e.clientY;
    swiped = false;
  });
  body.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(e.clientY - sy) * 1.5) {
      swiped = true;
      go(page + (dx < 0 ? 1 : -1));
    }
  });
  body.addEventListener(
    'click',
    (e) => {
      if (swiped) {
        e.stopPropagation();
        e.preventDefault();
        swiped = false;
      }
    },
    true,
  );

  return {
    el,
    set(list, opts = {}) {
      items = list;
      empty = opts.empty ?? '';
      if (!opts.keepPage) {
        starts = [0];
        page = 0;
      }
      if (body.isConnected) layout();
      else show();
    },
  };
}

/** 画面の残りに収める箱（大会の対戦表・結果など、ページに分けたくない画面に使う） */
export function fitBox(...children: (HTMLElement | null)[]): HTMLElement {
  const inner = h('div', { class: 'fit-inner' }, ...children);
  const box = h('div', { class: 'fit-box' }, inner);
  autoFit(inner, box, () => box.clientHeight, 0.6);
  return box;
}
