// アルバイト3種類：配達（街を歩く）・商品仕分け（タップ）・自然探索（さがす）
import economy from '../data/economy.json';
import { earn } from '../game/collection';
import { playBgm, sfx } from '../audio/sound';
import { choose, game, h, save, showScreen, talk } from './app';

type JobId = 'delivery' | 'sorting' | 'nature';

function record(id: JobId, pay: number) {
  const j = (game.d.jobs[id] ??= { plays: 0, best: 0 });
  j.plays++;
  j.best = Math.max(j.best, pay);
  earn(game.d, pay);
  save();
}

/** 給料：成績が「基本ライン」以上なら基本給＋成績ぶん（上限あり）。下回った時は成績ぶんだけ */
export function jobPay(id: 'sorting' | 'nature', points: number): number {
  const j = economy.jobs[id];
  const line = 5;
  const pay = (points >= line ? j.base : 0) + j.perPoint * Math.max(0, points);
  return Math.min(j.max, pay);
}
export function deliveryPay(delivered: number, secLeft: number): number {
  const j = economy.jobs.delivery;
  if (delivered >= j.count) return Math.min(j.max, j.base + j.perExtra * Math.max(0, Math.floor(secLeft)));
  return Math.floor((j.base * delivered) / j.count / 2);
}

// ---------- 配達（街の中で行う） ----------
const HOUSES = ['d1', 'd2', 'd3', 'd4', 'd5'];
const HOUSE_NAME: Record<string, string> = { d1: '赤い屋根の家', d2: '青い屋根の家', d3: '黄色い屋根の家', d4: '緑の屋根の家', d5: '紫の屋根の家' };

export function deliveryJob(onEnd: (result: () => Promise<void>) => void) {
  const j = economy.jobs.delivery;
  const order = [...HOUSES].sort(() => Math.random() - 0.5).slice(0, j.count);
  let done = 0;
  const t0 = performance.now();
  let ended = false;
  const left = () => Math.max(0, j.time - (performance.now() - t0) / 1000);
  const end = () => {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    const secLeft = left();
    const pay = deliveryPay(done, secLeft);
    onEnd(async () => {
      record('delivery', pay);
      sfx(done >= j.count ? 'fanfare' : 'coin');
      await talk([{ s: '配達のおじさん', t: done >= j.count ? `全部届けてくれたね！ 残り${Math.floor(secLeft)}秒。お給料は${pay}コインだ！` : `時間切れ……${done}つ届けてくれたから、${pay}コインだよ。また頼むね！` }]);
    });
  };
  const timer = window.setInterval(() => {
    if (left() <= 0) end();
  }, 250);
  sfx('ok');
  return {
    step(_x: number, _y: number) {
      void _x;
      void _y;
    },
    text(): string {
      if (ended) return '';
      return `📦 配達 ${done}/${j.count}　⏱ ${Math.ceil(left())}秒　→ ${HOUSE_NAME[order[done]]}`;
    },
    target(): string | null {
      return ended ? null : order[done] ?? null;
    },
    deliver(id: string): boolean {
      if (ended) return false;
      if (id !== order[done]) {
        if (HOUSES.includes(id)) {
          sfx('bad');
          void talk([{ s: '', t: `ここではないみたい。${HOUSE_NAME[order[done]]}（光っている家）に届けよう。` }]);
          return true;
        }
        return false;
      }
      done++;
      sfx('coin');
      if (done >= j.count) end();
      return true;
    },
  };
}

// ---------- 共通：開始画面と結果 ----------
async function jobIntro(id: JobId, who: string, how: string): Promise<boolean> {
  const j = economy.jobs[id];
  const best = game.d.jobs[id]?.best ?? 0;
  const c = await choose({ s: who, t: `${j.name}\n${how}\nお給料：最大${j.max}コイン${best ? `（これまでの最高 ${best}）` : ''}` }, [
    { label: 'はじめる！', value: 'go', cls: 'primary' },
    { label: 'やめる', value: 'no', cls: 'gray' },
  ]);
  return c === 'go';
}

function resultScreen(title: string, lines: string[], pay: number, back: () => void) {
  const el = h('div', { class: 'screen mg' }, h('div', { class: 'mg-top' }, title), h('div', { class: 'col center grow', style: { padding: '20px', textAlign: 'center', gap: '10px' } }, h('div', { style: { fontSize: '64px' } }, pay >= 200 ? '🌟' : '💰'), ...lines.map((l) => h('div', { style: { fontSize: '18px', fontWeight: '800' } }, l)), h('div', { style: { fontSize: '26px', fontWeight: '900', color: '#b06000' } }, `+${pay}コイン`), h('button', { class: 'btn primary wide', onclick: back }, 'もどる')));
  showScreen(el);
  sfx(pay >= 200 ? 'fanfare' : 'coin');
}

function countdown(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let n = 3;
    const box = h('div', { class: 'overlay', style: { fontSize: '90px', color: '#fff', fontWeight: '900' } }, String(n));
    el.append(box);
    const t = setInterval(() => {
      n--;
      sfx('tap');
      if (n <= 0) {
        clearInterval(t);
        box.remove();
        resolve();
      } else box.textContent = String(n);
    }, 650);
  });
}

// ---------- 商品仕分け ----------
const SHELVES = [
  { id: 'card', label: '🃏 カード', items: [['🃏', 'トレカ'], ['🎴', '花札'], ['📇', 'カードケース'], ['🗂', 'ファイル']] },
  { id: 'toy', label: '🧸 おもちゃ', items: [['🧸', 'くまのぬいぐるみ'], ['🪀', 'ヨーヨー'], ['🪁', 'たこ'], ['🎲', 'サイコロ']] },
  { id: 'food', label: '🍙 食べもの', items: [['🍙', 'おにぎり'], ['🍩', 'ドーナツ'], ['🍎', 'りんご'], ['🍪', 'クッキー']] },
  { id: 'stat', label: '✏️ 文房具', items: [['✏️', 'えんぴつ'], ['📏', 'じょうぎ'], ['📒', 'ノート'], ['✂️', 'はさみ']] },
];
export async function openSorting(back: () => void): Promise<void> {
  if (!(await jobIntro('sorting', '倉庫の主任', `${economy.jobs.sorting.time}秒のあいだに、流れてくる商品を正しい棚にどんどん仕分けよう。まちがえると1点マイナス。5点以上で基本給${economy.jobs.sorting.base}コイン＋1点ごとに${economy.jobs.sorting.perPoint}コイン。`))) return back();
  playBgm('shop');
  const j = economy.jobs.sorting;
  let points = 0;
  let miss = 0;
  let cur = { shelf: '', icon: '', name: '' };
  const tm = h('span', { class: 't' }, `⏱ ${j.time}`);
  const sc = h('span', {}, '0点');
  const goods = h('div', { class: 'goods' });
  const fb = h('div', { class: 'fb' });
  const next = () => {
    const s = SHELVES[Math.floor(Math.random() * SHELVES.length)];
    const it = s.items[Math.floor(Math.random() * s.items.length)];
    cur = { shelf: s.id, icon: it[0], name: it[1] };
    goods.replaceChildren(fb, h('div', { style: { animation: 'pop .15s' } }, cur.icon), h('div', { class: 'nm' }, cur.name));
  };
  let playing = false;
  const shelves = h(
    'div',
    { class: 'shelves' },
    ...SHELVES.map((s) =>
      h('button', {
        onclick: () => {
          if (!playing) return;
          if (s.id === cur.shelf) {
            points++;
            sfx('ok');
            fb.textContent = '⭕';
            fb.style.color = '#2e7d32';
          } else {
            points = Math.max(0, points - 1);
            miss++;
            sfx('bad');
            fb.textContent = '❌';
            fb.style.color = '#c62828';
          }
          sc.textContent = `${points}点`;
          next();
        },
      }, s.label),
    ),
  );
  let timer = 0;
  const el = h('div', { class: 'screen mg' }, h('div', { class: 'mg-top' }, '📦 商品仕分け', sc, tm), goods, shelves);
  showScreen(el, () => clearInterval(timer));
  next();
  await countdown(el);
  playing = true;
  const t0 = performance.now();
  timer = window.setInterval(() => {
    const left = j.time - (performance.now() - t0) / 1000;
    tm.textContent = `⏱ ${Math.max(0, Math.ceil(left))}`;
    if (left <= 0) {
      clearInterval(timer);
      playing = false;
      const pay = jobPay('sorting', points);
      record('sorting', pay);
      resultScreen('📦 仕分け おつかれさま！', [`正しく仕分けた：${points}点（ミス${miss}回）`], pay, back);
    }
  }, 200);
}

// ---------- 自然探索 ----------
const FINDS = [
  ['🍄', 'キノコ'],
  ['🐞', 'てんとう虫'],
  ['🌰', 'どんぐり'],
  ['🍀', '四つ葉'],
  ['🦋', 'ちょうちょ'],
  ['🐌', 'かたつむり'],
];
const DECOY = ['🌿', '🌱', '🍃', '🌾', '🪨'];
export async function openNature(back: () => void): Promise<void> {
  if (!(await jobIntro('nature', '森の案内人', `${economy.jobs.nature.time}秒のあいだに、上に出ている生きもの・植物を森の中から見つけてタップしよう。まちがえると2秒へる。5つ以上で基本給${economy.jobs.nature.base}コイン＋1つごとに${economy.jobs.nature.perPoint}コイン。`))) return back();
  playBgm('town3');
  const j = economy.jobs.nature;
  let points = 0;
  let penalty = 0;
  let want = FINDS[0];
  const tm = h('span', { class: 't' }, `⏱ ${j.time}`);
  const sc = h('span', {}, '0こ');
  const wantEl = h('span', { style: { fontSize: '18px' } });
  const fieldEl = h('div', { class: 'nature-field' });
  let playing = false;
  const layout = () => {
    want = FINDS[Math.floor(Math.random() * FINDS.length)];
    wantEl.textContent = `さがす：${want[0]} ${want[1]}`;
    fieldEl.replaceChildren();
    const W = fieldEl.clientWidth || 360;
    const H = fieldEl.clientHeight || 480;
    const cols = Math.max(4, Math.floor(W / 58));
    const rows = Math.max(5, Math.floor(H / 58));
    const cells = Array.from({ length: cols * rows }, (_, i) => i).sort(() => Math.random() - 0.5);
    const items: string[] = [want[0]];
    for (let i = 0; i < 4; i++) items.push(FINDS[Math.floor(Math.random() * FINDS.length)][0]);
    for (let i = 0; i < 12; i++) items.push(DECOY[Math.floor(Math.random() * DECOY.length)]);
    items.forEach((ic, i) => {
      const cell = cells[i];
      const x = (cell % cols) * (W / cols) + Math.random() * 6;
      const y = Math.floor(cell / cols) * (H / rows) + Math.random() * 6;
      const b = h('button', {
        style: { left: `${x}px`, top: `${y}px`, transform: `rotate(${Math.floor(Math.random() * 40 - 20)}deg)` },
        onclick: () => {
          if (!playing) return;
          if (ic === want[0]) {
            points++;
            sc.textContent = `${points}こ`;
            sfx('get');
            b.classList.add('found');
            playing = false;
            setTimeout(() => {
              playing = true;
              layout();
            }, 250);
          } else {
            penalty += 2;
            sfx('bad');
            fieldEl.classList.add('shake');
            setTimeout(() => fieldEl.classList.remove('shake'), 300);
          }
        },
      }, ic);
      fieldEl.append(b);
    });
  };
  let timer = 0;
  const el = h('div', { class: 'screen mg' }, h('div', { class: 'mg-top' }, '🌳 自然探索', sc, tm), h('div', { style: { padding: '8px 12px', fontWeight: '900', background: '#fffbe6' } }, wantEl), fieldEl);
  showScreen(el, () => clearInterval(timer));
  await new Promise((r) => requestAnimationFrame(r));
  layout();
  await countdown(el);
  playing = true;
  const t0 = performance.now();
  timer = window.setInterval(() => {
    const left = j.time - (performance.now() - t0) / 1000 - penalty;
    tm.textContent = `⏱ ${Math.max(0, Math.ceil(left))}`;
    if (left <= 0) {
      clearInterval(timer);
      playing = false;
      const pay = jobPay('nature', points);
      record('nature', pay);
      resultScreen('🌳 自然探索 おつかれさま！', [`見つけた数：${points}こ`], pay, back);
    }
  }, 200);
}
