// お母さんのお手伝い（3種類のミニゲーム）。終わると確率でお母さん限定カードがもらえる
import economy from '../data/economy.json';
import { choreRoll, MOM_CARDS } from '../game/collection';
import { card } from '../engine/cards';
import { playBgm, sfx } from '../audio/sound';
import { choose, game, h, save, showScreen, talk } from './app';
import { miniCard, openCard } from './cardView';
import { showGet } from './reward';

export function choreRateText(): string {
  const c = economy.chores;
  const left = Math.max(0, c.pity - game.d.chores.misses);
  return `お手伝いが終わると ${Math.round(c.chance * 100)}% の確率で、お母さんだけがくれるカード（全${MOM_CARDS.length}種・どれも同じ確率）がもらえる。はずれが${c.pity}回つづくと、次は必ずもらえる。（あと${left}回はずれたら確定）`;
}

export async function openChores(back: () => void): Promise<void> {
  const owned = MOM_CARDS.filter((id) => game.d.dex[id]).length;
  const c = await choose(
    { s: 'お母さん', t: `どれを手伝ってくれる？\n${choreRateText()}\n集めたお母さんカード：${owned}/${MOM_CARDS.length}種` },
    [
      { label: '🍽 お皿あらい', value: 'dish', cls: 'primary' },
      { label: '🧦 洗たくもの（くつ下あわせ）', value: 'sock', cls: 'primary' },
      { label: '🛒 おつかいメモ', value: 'shop', cls: 'primary' },
      { label: '🎁 お母さんカードを見る', value: 'see' },
      { label: 'またあとで', value: 'no', cls: 'gray' },
    ],
  );
  if (c === 'see') {
    await new Promise<void>((resolve) => {
      const el = h('div', { class: 'screen mg' }, h('div', { class: 'mg-top' }, '🎁 お母さんのカード'), h('div', { class: 'panel', style: { margin: '10px' } }, choreRateText()), h('div', { class: 'grid' }, ...MOM_CARDS.map((id) => miniCard(id, { locked: !game.d.dex[id], onClick: () => openCard(card(id), { locked: !game.d.dex[id], showSource: true }) }))), h('div', { style: { padding: '10px' } }, h('button', { class: 'btn wide', onclick: () => resolve() }, 'もどる')));
      showScreen(el);
    });
    return openChores(back);
  }
  if (c === 'dish') return dishes(back);
  if (c === 'sock') return socks(back);
  if (c === 'shop') return shopping(back);
  back();
}

async function finish(ok: boolean, back: () => void) {
  if (!ok) {
    await talk([{ s: 'お母さん', t: 'ありがとう、助かったわ。でも、もう少しだったわね。また手伝ってね（終わらなかったので、カードの抽選はなし）' }]);
    return back();
  }
  const id = choreRoll(game.d, Math.random);
  save();
  if (id) {
    await talk([{ s: 'お母さん', t: 'ありがとう！ がんばったごほうびに、これをあげるわ。お母さんが昔使っていたカードよ。' }]);
    await showGet(id, 'お母さんからもらった！');
  } else {
    sfx('ok');
    await talk([{ s: 'お母さん', t: `ありがとう、とっても助かったわ！（今回はカードはなし。${choreRateText()}）` }]);
  }
  back();
}

function frame(title: string, timeSec: number, body: HTMLElement, onTimeUp: () => void): { el: HTMLElement; stop: () => void } {
  const tm = h('span', { class: 't' }, `⏱ ${timeSec}`);
  const el = h('div', { class: 'screen mg' }, h('div', { class: 'mg-top' }, title, tm), body);
  const t0 = performance.now();
  let stopped = false;
  const timer = window.setInterval(() => {
    const left = timeSec - (performance.now() - t0) / 1000;
    tm.textContent = `⏱ ${Math.max(0, Math.ceil(left))}`;
    if (left <= 0) {
      stop();
      onTimeUp();
    }
  }, 200);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
  showScreen(el, stop);
  playBgm('home');
  return { el, stop };
}

// お皿あらい：よごれたお皿を何回かタップしてピカピカに（20秒で9枚）
function dishes(back: () => void) {
  let cleaned = 0;
  const N = 9;
  const grid = h('div', { class: 'plates' });
  const info = h('div', { class: 'panel', style: { margin: '10px' } }, 'よごれたお皿をタップして洗おう！ 1枚3回こすると、ピカピカ。');
  let f: { stop: () => void } = { stop: () => {} };
  for (let i = 0; i < N; i++) {
    let dirt = 3;
    const b = h('button', {
      onclick: () => {
        if (dirt <= 0) return;
        dirt--;
        sfx('tap');
        b.textContent = dirt === 0 ? '✨' : dirt === 1 ? '🍽' : '🥘';
        b.style.background = dirt === 0 ? '#c8f7d0' : '#fff';
        if (dirt === 0) {
          cleaned++;
          sfx('ok');
          if (cleaned >= N) {
            f.stop();
            setTimeout(() => void finish(true, back), 300);
          }
        }
      },
    }, '🍛');
    grid.append(b);
  }
  f = frame('🍽 お皿あらい', 20, h('div', { class: 'col grow' }, info, grid), () => void finish(false, back));
}

// くつ下あわせ：神経衰弱（12枚・6組、40秒）
function socks(back: () => void) {
  const kinds = ['🧦', '🧤', '👕', '🩳', '🧣', '👒'];
  const deck = [...kinds, ...kinds].sort(() => Math.random() - 0.5);
  const grid = h('div', { class: 'memory', style: { gridTemplateColumns: 'repeat(4, 1fr)' } });
  let open: { i: number; b: HTMLButtonElement }[] = [];
  let pairs = 0;
  let lock = false;
  let f: { stop: () => void } = { stop: () => {} };
  deck.forEach((k, i) => {
    const b = h('button', {
      onclick: () => {
        if (lock || b.classList.contains('open') || b.classList.contains('done')) return;
        sfx('card');
        b.classList.add('open');
        b.textContent = k;
        open.push({ i, b });
        if (open.length === 2) {
          const [a, c] = open;
          if (deck[a.i] === deck[c.i]) {
            a.b.classList.add('done');
            c.b.classList.add('done');
            open = [];
            pairs++;
            sfx('ok');
            if (pairs >= kinds.length) {
              f.stop();
              setTimeout(() => void finish(true, back), 400);
            }
          } else {
            lock = true;
            setTimeout(() => {
              for (const o of open) {
                o.b.classList.remove('open');
                o.b.textContent = '？';
              }
              open = [];
              lock = false;
            }, 650);
          }
        }
      },
    }, '？') as HTMLButtonElement;
    grid.append(b);
  });
  f = frame('🧦 洗たくもの', 40, h('div', { class: 'col grow' }, h('div', { class: 'panel', style: { margin: '10px' } }, '同じものを2枚ずつ見つけてたたもう！'), grid), () => void finish(false, back));
}

// おつかいメモ：メモを覚えて、お店で同じものを選ぶ（4つ、まちがい2回まで）
function shopping(back: () => void) {
  const all = [['🥕', 'にんじん'], ['🥚', 'たまご'], ['🍞', 'パン'], ['🥛', '牛乳'], ['🍅', 'トマト'], ['🧅', 'たまねぎ'], ['🐟', 'さかな'], ['🍌', 'バナナ'], ['🧀', 'チーズ']];
  const want = [...all].sort(() => Math.random() - 0.5).slice(0, 4);
  const body = h('div', { class: 'col grow', style: { padding: '12px', gap: '10px' } });
  let f: { stop: () => void } = { stop: () => {} };
  body.append(h('div', { class: 'panel', style: { textAlign: 'center' } }, h('div', { style: { fontWeight: '900' } }, '📝 おつかいメモ（よく覚えてね）'), h('div', { style: { fontSize: '40px', letterSpacing: '6px' } }, want.map((w) => w[0]).join('')), h('div', {}, want.map((w) => w[1]).join('・'))), h('button', { class: 'btn primary wide', onclick: () => go() }, '覚えた！お店へ行く'));
  const go = () => {
    let got = 0;
    let miss = 0;
    const picked = new Set<string>();
    body.replaceChildren(h('div', { class: 'panel' }, `メモに書いてあったものを4つ選ぼう（まちがいは2回まで）`));
    const g = h('div', { class: 'plates' });
    for (const it of [...all].sort(() => Math.random() - 0.5)) {
      const b = h('button', {
        style: { borderRadius: '16px' },
        onclick: () => {
          if (picked.has(it[0])) return;
          picked.add(it[0]);
          if (want.some((w) => w[0] === it[0])) {
            got++;
            sfx('ok');
            b.style.background = '#c8f7d0';
            if (got >= want.length) {
              f.stop();
              setTimeout(() => void finish(true, back), 300);
            }
          } else {
            miss++;
            sfx('bad');
            b.style.background = '#ffcdd2';
            if (miss > 2) {
              f.stop();
              setTimeout(() => void finish(false, back), 300);
            }
          }
        },
      }, it[0]);
      g.append(b);
    }
    body.append(g);
  };
  f = frame('🛒 おつかい', 45, body, () => void finish(false, back));
}
