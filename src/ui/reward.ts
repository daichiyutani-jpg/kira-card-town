// 勝利報酬のカード選び・カード入手の演出
import { bgStyle } from './bg';
import { card } from '../engine/cards';
import { addCard, checkPrizes } from '../game/collection';
import { sfx } from '../audio/sound';
import { confetti, game, h, overlay, save, showScreen, titleBar } from './app';
import { bigCard, miniCard, openCard } from './cardView';

/** カード入手の演出（大きく表示） */
export function showGet(id: string, caption = '手に入れた！'): Promise<void> {
  return new Promise((resolve) => {
    const def = card(id);
    sfx(def.r === 'UR' || def.r === 'SR' ? 'fanfare' : 'get');
    if (def.r === 'UR' || def.r === 'SR') confetti();
    let close = () => {};
    const box = h(
      'div',
      { class: 'modal', style: { background: 'transparent', boxShadow: 'none', padding: '0', position: 'relative', overflow: 'visible' } },
      def.r !== 'N' ? h('div', { class: 'rays' }) : null,
      h('div', { style: { position: 'relative', textAlign: 'center', color: '#fff', fontWeight: '900', fontSize: '20px', marginBottom: '8px', textShadow: '0 2px 4px #000' } }, `「${def.name}」を${caption}`),
      h('div', { style: { position: 'relative', animation: 'pop .4s' } }, bigCard(def)),
      h('button', { class: 'btn primary wide', style: { position: 'relative', marginTop: '12px' }, onclick: () => (sfx('ok'), close()) }, 'やったね！'),
    );
    close = overlay(box, { closeOnBg: false, onClose: resolve });
  });
}

/** 勝利後：相手のデッキから1枚選ぶ（相手のカードは減らない） */
export function pickReward(deck: string[], oppName: string, money: number): Promise<void> {
  return new Promise((resolve) => {
    const ids = [...new Set(deck)];
    const order = { UR: 0, SR: 1, R: 2, N: 3 } as const;
    ids.sort((a, b) => order[card(a).r] - order[card(b).r] || a.localeCompare(b));
    const el = h('div', { class: 'screen', style: { background: bgStyle('reward', '#1b1446') } });
    const grid = h('div', { class: 'grid' });
    const head = h('div', { class: 'panel', style: { margin: '10px' } }, h('div', { style: { fontSize: '20px', fontWeight: '900' } }, '🏆 勝利！'), money ? h('div', {}, `💰 ${money}コインもらった！`) : null, h('div', { style: { marginTop: '4px' } }, `${oppName}のデッキから、好きなカードを1枚選ぼう。（相手のカードはなくならないよ）`));
    for (const id of ids) {
      const n = game.d.cards[id] ?? 0;
      grid.append(
        miniCard(id, {
          badge: n ? `所持${n}` : 'NEW',
          onClick: () => {
            let close = () => {};
            close = openCard(card(id), {
              actions: [
                h('button', {
                  class: 'btn primary wide',
                  onclick: async () => {
                    close();
                    addCard(game.d, id);
                    save();
                    await showGet(id);
                    for (const p of checkPrizes(game.d)) await showGet(p, '特別な条件を達成して手に入れた！');
                    save();
                    resolve();
                  },
                }, 'このカードにする'),
              ],
            });
          },
        }),
      );
    }
    el.append(titleBar('カードをえらぶ', null), h('div', { class: 'scroll grow' }, head, grid));
    showScreen(el);
  });
}
