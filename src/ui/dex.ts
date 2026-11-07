// カード図鑑：全部・入手済み・未入手。未入手はシルエット、秘密のカードは名前も伏せる
import { CARD_LIST } from '../engine/cards';
import type { CardDef } from '../engine/types';
import { game, h, showScreen, titleBar } from './app';
import { miniCard, openCard } from './cardView';
import { matches } from './deck';
import { pager } from './pager';

export function openDex(back: () => void): void {
  let tab: 'all' | 'got' | 'not' = 'all';
  const f = { q: '', el: '' as CardDef['el'] | '', r: '' as CardDef['r'] | '', t: '' as CardDef['type'] | '' };
  const el = h('div', { class: 'screen', style: { background: 'var(--bg)' } });
  const pg = pager({ body: 'grid', uniform: true, shrinkTo: 0.78 });
  const head = h('div', { class: 'panel dex-head' });
  const tabs = h('div', { class: 'tabs' });
  const q = h('input', { placeholder: '🔍 名前' }) as HTMLInputElement;
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
    sel('el', [['', '全属性'], ['fire', '🔥炎'], ['water', '💧水'], ['wind', '🌀風'], ['earth', '⛰️地'], ['light', '✨光'], ['dark', '🌙闇']]),
    sel('r', [['', '全レア'], ['N', 'ノーマル'], ['R', 'レア'], ['SR', 'スーパーレア'], ['UR', 'ウルトラレア']]),
    sel('t', [['', '全種類'], ['monster', 'モンスター'], ['magic', '魔法'], ['item', 'アイテム']]),
  );
  const render = (keepPage = false) => {
    const got = CARD_LIST.filter((c) => game.d.dex[c.id]).length;
    const pct = Math.floor((got / CARD_LIST.length) * 100);
    head.replaceChildren(h('div', { class: 'row', style: { gap: '8px' } }, h('b', { style: { whiteSpace: 'nowrap' } }, `登録 ${got}/${CARD_LIST.length}（${pct}%）`), h('div', { class: 'bar grow' }, h('i', { style: { width: `${pct}%` } }))), h('div', { class: 'rates' }, '持っていないカードもタップすると手に入れ方が分かります'));
    tabs.replaceChildren(...([['all', '全部'], ['got', '入手済み'], ['not', '未入手']] as const).map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => ((tab = k), render()) }, l)));
    const list = CARD_LIST.filter((c) => {
      const have = !!game.d.dex[c.id];
      if (tab === 'got' && !have) return false;
      if (tab === 'not' && have) return false;
      return matches(c, f, !have && !!c.secret);
    });
    pg.set(
      list.map((c) => {
        const have = !!game.d.dex[c.id];
        const no = CARD_LIST.indexOf(c) + 1;
        return miniCard(c, { locked: !have, badge: `No.${no}`, onClick: () => openCard(c, { locked: !have, showSource: true }) });
      }),
      { empty: '条件に合うカードがありません', keepPage },
    );
  };
  el.append(titleBar('カード図鑑', back), head, tabs, filters, pg.el);
  render();
  showScreen(el);
}
