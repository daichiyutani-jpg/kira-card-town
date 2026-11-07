// カードショップ：パック・単品・デッキの購入（デッキ編集はできない。自分の部屋の机で行う）
import { bgStyle } from './bg';
import shops from '../data/shops.json';
import economy from '../data/economy.json';
import { card, RARITY_NAME } from '../engine/cards';
import { addCard, drawOne, giveStarter, PACKS, poolOf, singlePrice, spend, STARTERS, type DrawTable } from '../game/collection';
import { checkPrizes } from '../game/collection';
import { playBgm, sfx } from '../audio/sound';
import { confirmBox, game, h, overlay, save, showScreen, sleep, titleBar, toast } from './app';
import { miniCard, openCard } from './cardView';
import { showGet } from './reward';
import { pager } from './pager';

type ShopDef = { name: string; keeper: string; packs: string[]; singles: string[]; starters: boolean };
const SHOPS = shops.shops as Record<string, ShopDef>;

export function ratesText(t: DrawTable): string {
  const total = Object.values(t.rates).reduce((a, b) => a + (b ?? 0), 0);
  return (Object.entries(t.rates) as [keyof typeof RARITY_NAME, number][]).map(([r, w]) => `${RARITY_NAME[r]} ${((w / total) * 100).toFixed(w / total < 0.1 ? 1 : 0)}%`).join(' ／ ');
}

export function openShop(id: string, back: () => void): void {
  const sh = SHOPS[id];
  let tab = 'pack';
  playBgm('shop');
  const el = h('div', { class: 'screen', style: { background: bgStyle('shop', '#1b1446') } });
  const tabs = h('div', { class: 'tabs' });
  const singlePg = pager({ body: 'grid', uniform: true, shrinkTo: 0.8 });
  const render = () => {
    const body = h('div', { class: 'grow col', style: { minHeight: '0', gap: '0' } });
    el.replaceChildren(titleBar(sh.name, back), tabs, body);
    tabs.replaceChildren(
      ...[
        ['pack', '📦 パック'],
        ['single', '🃏 単品'],
        ...(sh.starters ? [['deck', '🎁 デッキ']] : []),
      ].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => ((tab = k), sfx('tap'), render()) }, l)),
    );
    if (tab === 'pack') {
      const pg = pager({ body: 'list' });
      const rows: HTMLElement[] = [h('div', { class: 'panel' }, `${sh.keeper}「パックには5枚入り。何が出るかはお楽しみ！ 出る確率はここに書いてあるとおりよ」`)];
      for (const pid of sh.packs) {
        const p = PACKS[pid];
        const pool = poolOf(p);
        rows.push(
          h(
            'div',
            { class: 'item-row' },
            h('div', { style: { fontSize: '40px' } }, '📦'),
            h('div', { class: 'grow' }, h('h4', {}, `${p.name}（${p.count}枚入り）`), h('div', { class: 'rates' }, `1枚ごとの確率：${ratesText(p)}`), h('div', { class: 'rates' }, `入っているカード：${Object.values(pool).reduce((a, l) => a + l.length, 0)}種類`)),
            h('button', { class: 'btn primary small', disabled: game.d.money < p.price, onclick: () => buyPack(pid) }, `${p.price}コイン`),
          ),
        );
      }
      body.append(pg.el);
      pg.set(rows);
    } else if (tab === 'single') {
      body.append(h('div', { class: 'panel', style: { margin: '8px 10px 0', padding: '8px 12px', fontSize: '14px' } }, `タップでくわしく見られるよ。ノーマル${economy.singlePrice.N}・レア${economy.singlePrice.R}・スーパーレア${economy.singlePrice.SR}コイン`));
      const pg = singlePg;
      const cells: HTMLElement[] = [];
      for (const cid of sh.singles) {
        const def = card(cid);
        const price = singlePrice(def);
        cells.push(
          h(
            'div',
            { class: 'col shop-cell', style: { alignItems: 'center', gap: '4px' } },
            miniCard(def, {
              badge: game.d.cards[cid] ? `所持${game.d.cards[cid]}` : undefined,
              onClick: () => {
                let close = () => {};
                close = openCard(def, {
                  showSource: true,
                  actions: [
                    h('button', {
                      class: 'btn primary wide',
                      disabled: game.d.money < price,
                      onclick: async () => {
                        if (!spend(game.d, price)) return toast('コインが足りません');
                        addCard(game.d, cid);
                        save();
                        sfx('coin');
                        close();
                        await showGet(cid, '買った！');
                        render();
                      },
                    }, `${price}コインで買う`),
                  ],
                });
              },
            }),
            h('span', { class: 'chip' }, `${price}`),
          ),
        );
      }
      body.append(pg.el);
      pg.set(cells, { keepPage: true });
    } else {
      const pg = pager({ body: 'list' });
      const rows: HTMLElement[] = [h('div', { class: 'panel' }, `最初に選ばなかったデッキも、${economy.starterPrice}コインで買えるよ。買うとカード20枚と、デッキが1つ増える。`)];
      for (const [k, s] of Object.entries(STARTERS)) {
        const have = game.d.flags[`starter_${k}`];
        rows.push(h('div', { class: 'item-row' }, miniCard(s.deck[s.deck.length - 8]), h('div', { class: 'grow' }, h('h4', {}, s.name), h('div', { class: 'rates' }, s.desc)), h('button', { class: 'btn primary small', disabled: have || game.d.money < economy.starterPrice, onclick: () => buyStarter(k as keyof typeof STARTERS) }, have ? '購入済み' : `${economy.starterPrice}`)));
      }
      body.append(pg.el);
      pg.set(rows);
    }
  };

  async function buyPack(pid: string) {
    const p = PACKS[pid];
    if (!(await confirmBox(`${p.name}を${p.price}コインで買いますか？\n（いま ${game.d.money}コイン）`))) return;
    if (!spend(game.d, p.price)) return toast('コインが足りません');
    const got = Array.from({ length: p.count ?? 5 }, () => drawOne(p, Math.random));
    const fresh = got.map((c) => !game.d.dex[c.id]);
    for (const c of got) addCard(game.d, c.id);
    game.d.stats.packs++;
    save();
    await openPackAnim(p.name, got.map((c) => c.id), fresh);
    for (const pr of checkPrizes(game.d)) await showGet(pr, '特別な条件を達成して手に入れた！');
    save();
    render();
  }
  async function buyStarter(k: keyof typeof STARTERS) {
    if (!(await confirmBox(`${STARTERS[k].name}を${economy.starterPrice}コインで買いますか？`))) return;
    if (!spend(game.d, economy.starterPrice)) return toast('コインが足りません');
    giveStarter(game.d, k);
    save();
    sfx('get');
    toast(`${STARTERS[k].name}を手に入れた！ 机のデッキ切り替えで使えるよ`, 2600);
    render();
  }
  render();
  showScreen(el);
}

export function openPackAnim(name: string, ids: string[], fresh: boolean[]): Promise<void> {
  return new Promise((resolve) => {
    let close = () => {};
    const pack = h('div', { class: 'pack' }, name);
    const box = h('div', { class: 'modal', style: { textAlign: 'center' } }, h('h3', { style: { margin: '0 0 6px' } }, 'タップしてパックを開けよう！'), pack, h('button', { class: 'btn gray small', onclick: () => show(true) }, 'スキップ'));
    let shown = false;
    const show = async (skip = false) => {
      if (shown) return;
      shown = true;
      sfx('card');
      const best = ids.reduce((a, id) => Math.max(a, { N: 0, R: 1, SR: 2, UR: 3 }[card(id).r]), 0);
      if (!skip && best >= 2) {
        pack.style.background = best === 3 ? 'conic-gradient(#ff5d8f,#ffcc33,#4cff7a,#3c8dff,#b05dff,#ff5d8f)' : 'linear-gradient(135deg,#fff6b0,#ffcc33)';
        pack.textContent = best === 3 ? '✨✨✨' : '✨';
        sfx('gacha');
        await sleep(900);
      }
      const reveal = h('div', { class: 'reveal' });
      ids.forEach((id, i) => {
        const m = miniCard(id, { badge: fresh[i] ? 'NEW' : undefined, onClick: () => openCard(card(id)) });
        m.style.animationDelay = `${skip ? 0 : i * 0.18}s`;
        reveal.append(m);
      });
      if (best >= 2) sfx('fanfare');
      else sfx('get');
      box.replaceChildren(h('h3', { style: { margin: '0 0 8px' } }, `${name}の中身`), reveal, h('p', { class: 'muted' }, 'カードをタップするとくわしく見られます'), h('button', { class: 'btn primary wide', onclick: () => close() }, 'OK'));
    };
    pack.addEventListener('click', () => show());
    close = overlay(box, { closeOnBg: false, onClose: resolve });
  });
}

/** 初期デッキを選ぶ。free=true なら無料 */
export function chooseStarter(free: boolean): Promise<keyof typeof STARTERS | null> {
  return new Promise((resolve) => {
    const el = h('div', { class: 'screen', style: { background: bgStyle('shop', '#1b1446') } });
    const pg = pager({ body: 'list' });
    const list: HTMLElement[] = [];
    for (const [k, s] of Object.entries(STARTERS)) {
      const key = k as keyof typeof STARTERS;
      const sample = h('div', { class: 'row starter-sample' }, ...[...new Set(s.deck)].filter((id) => card(id).type === 'monster').slice(-4).map((id) => miniCard(id, { onClick: () => openCard(card(id)) })));
      list.push(
        h(
          'div',
          { class: 'panel col' },
          h('h3', { style: { margin: 0 } }, s.name),
          h('div', {}, s.desc),
          sample,
          h('div', { class: 'row' }, h('button', { class: 'btn gray grow', onclick: () => showList(key) }, '20枚を見る'), h('button', {
            class: 'btn primary grow',
            onclick: async () => {
              if (!(await confirmBox(`「${s.name}」にしますか？\n（ほかのデッキも、あとでお店で買えます）`))) return;
              if (free) giveStarter(game.d, key);
              game.d.activeDeck = game.d.decks.length - 1;
              save();
              sfx('get');
              resolve(key);
            },
          }, 'これにする！')),
        ),
      );
    }
    const showList = (key: keyof typeof STARTERS) => overlay(h('div', { class: 'modal' }, h('h3', { style: { marginTop: 0 } }, STARTERS[key].name), h('div', { class: 'grid' }, STARTERS[key].deck.map((id) => miniCard(id, { onClick: () => openCard(card(id)) })))));
    el.append(titleBar('最初のデッキをえらぼう', () => resolve(null), h('span', { class: 'money' }, free ? '無料！' : '')), pg.el);
    pg.set(list);
    showScreen(el);
  });
}
