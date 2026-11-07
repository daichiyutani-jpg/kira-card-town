// 星まつり：カードくじ（紙をひらく演出）と星のガチャ（カプセル演出）。確率は抽選に使う表そのものを表示する
import { bgStyle } from './bg';
import { card, RARITY_NAME } from '../engine/cards';
import { addCard, checkPrizes, drawOne, GACHA, KUJI, poolOf, spend, type DrawTable } from '../game/collection';
import { clockNow, fmtDate, isFestivalOpen, nextFestival } from '../game/festival';
import { playBgm, sfx } from '../audio/sound';
import { confetti, confirmBox, game, h, overlay, save, showScreen, sleep, titleBar, toast } from './app';
import { miniCard, openCard } from './cardView';
import { ratesText } from './shop';
import { showGet } from './reward';
import { pager } from './pager';

function stillOpen(): boolean {
  if (isFestivalOpen(clockNow())) return true;
  toast('星まつりの時間は終わりました', 2200);
  return false;
}

function stand(kind: 'kuji' | 'gacha', back: () => void) {
  const t: DrawTable = kind === 'kuji' ? KUJI : GACHA;
  playBgm('festival');
  const pool = poolOf(t);
  const fest = nextFestival(clockNow());
  const limited = Object.values(pool).flat().filter((c) => c.get.includes('fest'));
  const el = h('div', { class: 'screen', style: { background: bgStyle('fest', '#120a28') } });
  const body = h('div', { class: 'grow col', style: { minHeight: '0', gap: '0' } });
  const pg = pager({ body: 'grid', uniform: true, shrinkTo: 0.8 });
  const render = () => {
    body.replaceChildren(
      h(
        'div',
        { class: 'panel fest-panel' },
        h('div', { style: { fontSize: '18px', fontWeight: '900' } }, kind === 'kuji' ? '🎫 カードくじ' : '🌟 星のガチャ'),
        h('div', {}, `1回 ${t.price}コインで1枚。${kind === 'kuji' ? '紙をひらくと当たりが分かる！' : 'カプセルの色でレア度が分かる！'}`),
        h('div', { class: 'rates', style: { marginTop: '6px' } }, `確率：${ratesText(t)}`),
        h('div', { class: 'rates' }, `同じレア度の中では、どのカードも同じ確率です。入っているカード：${Object.values(pool).reduce((a, l) => a + l.length, 0)}種類（うち星まつり限定 ${limited.length}種）`),
        h('div', { class: 'rates' }, fest.open ? `今夜の星まつりは ${fmtDate(fest.at)} まで` : ''),
        h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn primary grow', disabled: game.d.money < t.price, onclick: () => void draw(1) }, `1回ひく（${t.price}）`), h('button', { class: 'btn primary grow', disabled: game.d.money < t.price * 5, onclick: () => void draw(5) }, `5回ひく（${t.price * 5}）`)),
      ),
      h('div', { class: 'sec-label' }, '星まつり限定カード（ここでしか手に入らない）'),
      pg.el,
    );
    pg.set(limited.map((c) => miniCard(c, { locked: !game.d.dex[c.id], onClick: () => openCard(c, { locked: !game.d.dex[c.id], showSource: true }) })), { keepPage: true });
  };
  async function draw(n: number) {
    if (!stillOpen()) return back();
    if (!(await confirmBox(`${n}回ひきますか？（${t.price * n}コイン・いま ${game.d.money}コイン）`))) return;
    if (!spend(game.d, t.price * n)) return toast('コインが足りません');
    const got = Array.from({ length: n }, () => drawOne(t, Math.random));
    const fresh = got.map((c, i) => !game.d.dex[c.id] && got.findIndex((x) => x.id === c.id) === i);
    for (const c of got) addCard(game.d, c.id);
    game.d.stats[kind] += n;
    save();
    for (let i = 0; i < got.length; i++) await (kind === 'kuji' ? kujiAnim : gachaAnim)(got[i].id, fresh[i], i + 1, n);
    for (const p of checkPrizes(game.d)) await showGet(p, '特別な条件を達成して手に入れた！');
    save();
    el.replaceChildren(titleBar(kind === 'kuji' ? 'カードくじ屋' : '星のガチャ屋台', back), body);
    render();
  }
  el.append(titleBar(kind === 'kuji' ? 'カードくじ屋' : '星のガチャ屋台', back), body);
  render();
  showScreen(el);
}

const RANK_TEXT = { N: '4等', R: '3等', SR: '2等', UR: '1等' } as const;

class Skip extends Error {}

/**
 * 演出の進行役：スキップを押した時・設定で演出を短くしている時は、途中を飛ばして結果へ。
 * wait() はスキップされたら Skip を投げる。
 */
function director() {
  let skipped = !!game.d.settings.fastAnim;
  return {
    skip: () => (skipped = true),
    get skipped() {
      return skipped;
    },
    async wait(ms: number) {
      if (skipped) throw new Skip();
      await sleep(ms);
      if (skipped) throw new Skip();
    },
  };
}

/** 画面いっぱいに光る（ウルトラレア） */
function flash(kind: 'gold' | 'rainbow') {
  const f = h('div', { class: `lot-flash ${kind}` });
  document.body.append(f);
  setTimeout(() => f.remove(), 1100);
}

/** 結果の表示（くじ・ガチャ共通）。カードは横から回って出る */
function resultView(def: ReturnType<typeof card>, fresh: boolean, head: HTMLElement, last: boolean, close: () => void): HTMLElement[] {
  const r = def.r;
  return [
    r !== 'N' ? h('div', { class: `rays lr-${r}` }) : h('span'),
    head,
    h('div', { class: 'lot-card', style: { position: 'relative', display: 'flex', justifyContent: 'center' } }, miniCard(def, { big: true, badge: fresh ? 'NEW' : undefined })),
    h('div', { style: { position: 'relative', fontWeight: '900', marginTop: '6px' } }, `「${def.name}」`),
    h('button', { class: 'btn primary wide', style: { position: 'relative', marginTop: '8px' }, onclick: () => close() }, last ? 'OK' : 'つぎへ'),
  ];
}

function cheer(r: string) {
  if (r === 'UR' || r === 'SR') {
    sfx('fanfare');
    confetti();
  } else sfx('get');
}

function kujiAnim(id: string, fresh: boolean, i: number, n: number): Promise<void> {
  return new Promise((resolve) => {
    const def = card(id);
    const r = def.r;
    const d = director();
    let close = () => {};
    // くじ箱（上に穴）と、中から出てくる折った紙
    const paper = h('div', { class: 'kp-fold' });
    const box = h('div', { class: 'kbox' }, h('div', { class: 'kbox-top' }, h('div', { class: 'kbox-hole' })), h('div', { class: 'kbox-front' }, h('span', {}, 'くじ')));
    const stage = h('div', { class: 'lot-stage' }, paper, box);
    const hint = h('div', { class: 'lot-hint' }, '箱をタップしてひく！');
    const skipBtn = h('button', { class: 'btn gray small', onclick: () => (d.skip(), show()) }, 'スキップ');
    const modal = h('div', { class: 'modal lot', style: { textAlign: 'center', position: 'relative', overflow: 'hidden' } }, h('div', { class: 'muted' }, `${i}/${n}回目`), stage, hint, skipBtn);
    let started = false;
    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      cheer(r);
      if (r === 'UR') flash('gold');
      const head = h('div', { class: `kp-open lr-${r}` }, h('div', { class: `kp-stamp lr-${r}` }, RANK_TEXT[r]), h('div', { class: 'kp-rank' }, RARITY_NAME[r]));
      modal.replaceChildren(...resultView(def, fresh, head, i >= n, () => close()));
    };
    const play = async () => {
      if (started) return;
      started = true;
      hint.textContent = 'ガサガサ……';
      try {
        // 1) 箱が大きくゆれる
        box.classList.add('shake-hard');
        sfx('tap');
        await d.wait(300);
        sfx('tap');
        await d.wait(300);
        box.classList.remove('shake-hard');
        // 2) 折った紙が穴から出てくる
        paper.classList.add('rise');
        sfx('card');
        await d.wait(700);
        // 3) 紙が広がる → はんこが押される
        const sheet = h('div', { class: `kp-sheet lr-${r}` }, h('div', { class: 'kp-flap t' }), h('div', { class: 'kp-flap b' }));
        stage.replaceChildren(sheet);
        hint.textContent = 'ひらくと……';
        await d.wait(60);
        sheet.classList.add('unfold');
        sfx('card');
        await d.wait(r === 'SR' || r === 'UR' ? 1000 : 650);
        sheet.append(h('div', { class: `kp-stamp lr-${r} hit` }, RANK_TEXT[r]));
        sfx(r === 'N' ? 'tap' : 'hit');
        if (r === 'UR' || r === 'SR') sheet.classList.add(r === 'UR' ? 'glow' : 'glow-sr');
        await d.wait(r === 'UR' ? 1000 : 700);
      } catch (e) {
        if (!(e instanceof Skip)) throw e;
      }
      show();
    };
    modal.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') void play();
    });
    close = overlay(modal, { closeOnBg: false, onClose: resolve });
    if (d.skipped) show();
  });
}

function gachaAnim(id: string, fresh: boolean, i: number, n: number): Promise<void> {
  return new Promise((resolve) => {
    const def = card(id);
    const r = def.r;
    const d = director();
    let close = () => {};
    // ガチャの機械：ガラスの丸い入れ物（中にカプセル）・本体・ハンドル・取り出し口
    const BALLS: [number, number, string][] = [[22, 62, '#ff5d8f'], [48, 70, '#3c8dff'], [74, 60, '#ffbf1f'], [34, 40, '#4cd17a'], [62, 42, '#b05dff'], [48, 20, '#ff8a3c'], [18, 36, '#3c8dff'], [80, 34, '#ff5d8f']];
    const dome = h('div', { class: 'gm-dome' }, ...BALLS.map(([x, y, c], k) => h('i', { class: 'gm-ball', style: { left: `${x}%`, top: `${y}%`, background: `linear-gradient(${c} 50%, #fff 50%)`, animationDelay: `${k * 0.07}s` } })), h('b', { class: 'gm-shine' }));
    const handle = h('div', { class: 'gm-handle' }, h('i'));
    const machine = h('div', { class: 'gm' }, dome, h('div', { class: 'gm-body' }, h('div', { class: 'gm-star' }, '★'), handle, h('div', { class: 'gm-out' })));
    const cap = h('div', { class: `gcap lr-${r}` }, h('div', { class: 'gcap-t' }), h('div', { class: 'gcap-b' }));
    const stage = h('div', { class: 'lot-stage gacha' }, machine, cap);
    const hint = h('div', { class: 'lot-hint' }, 'ハンドルをタップして回す！');
    const skipBtn = h('button', { class: 'btn gray small', onclick: () => (d.skip(), show()) }, 'スキップ');
    const modal = h('div', { class: 'modal lot', style: { textAlign: 'center', position: 'relative', overflow: 'hidden' } }, h('div', { class: 'muted' }, `${i}/${n}回目`), stage, hint, skipBtn);
    let started = false;
    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      cheer(r);
      if (r === 'UR') flash('rainbow');
      const head = h('div', { class: `lot-rarity lr-${r}` }, RARITY_NAME[r]);
      modal.replaceChildren(...resultView(def, fresh, head, i >= n, () => close()));
    };
    const play = async () => {
      if (started) return;
      started = true;
      hint.textContent = 'ガラガラ……';
      try {
        // 1) ハンドルを2回まわす・中のカプセルがまざる
        handle.classList.add('turn');
        dome.classList.add('stir');
        for (let k = 0; k < 4; k++) {
          sfx('dice');
          await d.wait(230);
        }
        dome.classList.remove('stir');
        // 2) 取り出し口からカプセルが出て、前へころがる
        cap.classList.add('drop');
        sfx('tap');
        await d.wait(700);
        machine.classList.add('away');
        cap.classList.replace('drop', 'center');
        hint.textContent = 'カプセルをあけると……';
        await d.wait(450);
        // 3) ゆれる（スーパーレア以上は光りながら長め）
        cap.classList.replace('center', r === 'SR' || r === 'UR' ? 'wobble-big' : 'wobble');
        await d.wait(r === 'SR' || r === 'UR' ? 1150 : 680);
        // 4) パカッと割れて、レア度の色の光があふれる
        sfx('gacha');
        cap.className = `gcap lr-${r} pop`;
        stage.append(h('div', { class: `gcap-light lr-${r}` }));
        await d.wait(520);
      } catch (e) {
        if (!(e instanceof Skip)) throw e;
      }
      show();
    };
    modal.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') void play();
    });
    close = overlay(modal, { closeOnBg: false, onClose: resolve });
    if (d.skipped) show();
  });
}

export function openKuji(back: () => void): void {
  if (!stillOpen()) return back();
  stand('kuji', back);
}
export function openGacha(back: () => void): void {
  if (!stillOpen()) return back();
  stand('gacha', back);
}
