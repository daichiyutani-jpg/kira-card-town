// カード図鑑：全部・入手済み・未入手。未入手はシルエット、秘密のカードは名前も伏せる
import { CARD_LIST } from '../engine/cards';
import type { CardDef } from '../engine/types';
import { game, h, showScreen, titleBar } from './app';
import { miniCard, openCard } from './cardView';
import { matches } from './deck';

export function openDex(back: () => void): void {
  let tab: 'all' | 'got' | 'not' = 'all';
  const f = { q: '', el: '' as CardDef['el'] | '', r: '' as CardDef['r'] | '', t: '' as CardDef['type'] | '' };
  const el = h('div', { class: 'screen', style: { background: 'var(--bg)' } });
  const grid = h('div', { class: 'grid' });
  const head = h('div', { class: 'panel', style: { margin: '10px 10px 0' } });
  const tabs = h('div', { class: 'tabs' });
  const q = h('input', { placeholder: '🔍 名前でさがす' }) as HTMLInputElement;
  q.addEventListener('input', () => ((f.q = q.value), render()));
  const sel = (key: 'el' | 'r' | 't', opts: [string, string][]) => {
    const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v }, l))) as HTMLSelectElement;
    s.addEventListener('change', () => ((f as Record<string, string>)[key] = s.value, render()));
    return s;
  };
  const filters = h(
    'div',
    { class: 'filters' },
    q,
    sel('el', [['', '属性：全部'], ['fire', '🔥炎'], ['water', '💧水'], ['wind', '🌀風'], ['earth', '⛰️地'], ['light', '✨光'], ['dark', '🌙闇']]),
    sel('r', [['', 'レア：全部'], ['N', 'ノーマル'], ['R', 'レア'], ['SR', 'スーパーレア'], ['UR', 'ウルトラレア']]),
    sel('t', [['', '種類：全部'], ['monster', 'モンスター'], ['magic', '魔法'], ['item', 'アイテム']]),
  );
  const render = () => {
    const got = CARD_LIST.filter((c) => game.d.dex[c.id]).length;
    const pct = Math.floor((got / CARD_LIST.length) * 100);
    head.replaceChildren(h('div', { style: { fontWeight: '900' } }, `登録 ${got} / ${CARD_LIST.length}種類（${pct}%）`), h('div', { class: 'bar', style: { marginTop: '6px' } }, h('i', { style: { width: `${pct}%` } })), h('div', { class: 'rates', style: { marginTop: '4px' } }, 'まだ持っていないカードもタップすると手に入れ方が分かります（ひみつのカードは名前も？？？）'));
    tabs.replaceChildren(...([['all', '全部'], ['got', '入手済み'], ['not', '未入手']] as const).map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => ((tab = k), render()) }, l)));
    grid.replaceChildren();
    const list = CARD_LIST.filter((c) => {
      const have = !!game.d.dex[c.id];
      if (tab === 'got' && !have) return false;
      if (tab === 'not' && have) return false;
      return matches(c, f, !have && !!c.secret);
    });
    list.forEach((c) => {
      const have = !!game.d.dex[c.id];
      const no = CARD_LIST.indexOf(c) + 1;
      grid.append(miniCard(c, { locked: !have, badge: `No.${no}`, onClick: () => openCard(c, { locked: !have, showSource: true }) }));
    });
    if (!list.length) grid.append(h('div', { class: 'empty' }, '条件に合うカードがありません'));
  };
  el.append(titleBar('カード図鑑', back), head, tabs, filters, h('div', { class: 'scroll grow' }, grid));
  render();
  showScreen(el);
}
