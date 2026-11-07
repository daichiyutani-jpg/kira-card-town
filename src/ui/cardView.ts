// カードの表示（小さいカード・大きい詳細）
import { cardArtUrl } from '../art/cardArt';
import { card, EL_ICON, EL_NAME, RARITY_NAME, TYPE_NAME } from '../engine/cards';
import { fullText, summonText } from '../engine/describe';
import type { CardDef } from '../engine/types';
import { sourcesOf } from '../game/collection';
import { h, overlay } from './app';
import { sfx } from '../audio/sound';

export function frameClass(def: CardDef): string {
  const fr = def.type === 'monster' ? `fr-${def.el}` : def.type === 'magic' ? 'fr-magic' : 'fr-item';
  return `${fr} r-${def.r}`;
}

export interface MiniOpts {
  atk?: number;
  def?: number;
  baseAtk?: number;
  baseDef?: number;
  count?: number;
  badge?: string;
  locked?: boolean;
  big?: boolean;
  cls?: string;
  onClick?: () => void;
}

export function miniCard(idOrDef: string | CardDef, o: MiniOpts = {}): HTMLElement {
  const def = typeof idOrDef === 'string' ? card(idOrDef) : idOrDef;
  const locked = o.locked;
  const name = locked && def.secret ? '？？？' : def.name;
  const atk = o.atk ?? def.atk;
  const dfv = o.def ?? def.def;
  const stats =
    def.type === 'monster'
      ? h('div', { class: 'stats' }, h('b', { class: `a ${atk > (o.baseAtk ?? def.atk) ? 'boost' : atk < (o.baseAtk ?? def.atk) ? 'down' : ''}` }, atk), h('b', { class: `d ${dfv > (o.baseDef ?? def.def) ? 'boost' : dfv < (o.baseDef ?? def.def) ? 'down' : ''}` }, dfv))
      : h('div', { class: 'tp' }, def.type === 'magic' ? '魔法' : def.equip ? 'アイテム(装備)' : 'アイテム');
  const art = h('div', { class: 'art' });
  art.style.backgroundImage = `url("${cardArtUrl(def)}")`;
  const el = h(
    'div',
    { class: `mini ${frameClass(def)} ${def.art.img ? 'pic' : ''} ${o.big ? 'big' : ''} ${locked ? 'locked' : ''} ${o.cls ?? ''}`, 'data-id': def.id },
    h('div', { class: 'nm' }, name),
    art,
    def.type === 'monster' ? h('div', { class: 'lv' }, '★'.repeat(def.lv)) : null,
    h('div', { class: 'el' }, EL_ICON[def.el]),
    stats,
    o.count !== undefined ? h('div', { class: 'cnt' }, `×${o.count}`) : null,
    o.badge ? h('div', { class: 'badge' }, o.badge) : null,
  );
  if (o.onClick)
    el.addEventListener('click', () => {
      sfx('card');
      o.onClick!();
    });
  return el;
}

export function bigCard(def: CardDef, opts: { locked?: boolean; atk?: number; def?: number; showSource?: boolean } = {}): HTMLElement {
  const locked = opts.locked;
  const hide = locked && def.secret;
  const art = h('div', { class: 'art' });
  art.style.backgroundImage = `url("${cardArtUrl(def)}")`;
  if (locked) art.style.filter = 'brightness(0) opacity(.5)';
  const lines = hide ? ['？？？（手に入れると分かる）'] : fullText(def);
  const st = summonText(def);
  return h(
    'div',
    { class: `big-card ${frameClass(def)} ${def.art.img ? 'pic' : ''}` },
    h('div', { class: 'head' }, h('div', { class: 'nm' }, hide ? '？？？' : def.name), h('div', { class: 'el' }, EL_ICON[def.el])),
    h('div', { class: 'stars' }, def.type === 'monster' ? `${'★'.repeat(def.lv)}  Lv${def.lv}` : ''),
    art,
    h(
      'div',
      { class: 'type' },
      h('span', {}, `${EL_NAME[def.el]}属性・${TYPE_NAME[def.type]}${def.equip ? '（装備）' : ''}`),
      // 魔法・アイテムは攻撃/守備の欄がないので、レア度はこの行に置く（説明文に重ならないように）
      def.type !== 'monster' ? h('span', { class: 'rar inl' }, RARITY_NAME[def.r]) : null,
      h('span', {}, `No.${def.id}`),
    ),
    h(
      'div',
      { class: 'text' },
      st && !hide ? h('p', { class: 'summon' }, `【召喚】${st}`) : null,
      lines.length ? lines.map((l) => h('p', {}, l)) : h('p', {}, '特殊な効果はない。'),
      !hide ? h('p', { class: 'flavor' }, def.flavor) : null,
    ),
    def.type === 'monster' ? h('div', { class: 'stats' }, h('b', { class: 'a' }, h('small', {}, '攻撃'), opts.atk ?? def.atk), h('b', { class: 'd' }, h('small', {}, '守備'), opts.def ?? def.def)) : null,
    def.type === 'monster' ? h('div', { class: 'rar' }, RARITY_NAME[def.r]) : null,
  );
}

/** カード詳細を開く。actions にボタンを並べられる */
export function openCard(def: CardDef, o: { locked?: boolean; actions?: HTMLElement[]; atk?: number; def?: number; showSource?: boolean; extra?: HTMLElement; onClose?: () => void } = {}): () => void {
  let close = () => {};
  const src = o.showSource ? h('div', { class: 'panel', style: { marginTop: '10px', fontSize: '14px' } }, h('b', {}, '入手方法'), h('ul', { style: { margin: '4px 0 0', paddingLeft: '20px' } }, (o.locked && def.secret ? ['ヒミツ（特別な条件で手に入る）'] : sourcesOf(def.id)).map((s) => h('li', {}, s)))) : null;
  const box = h('div', { class: 'modal', style: { background: 'transparent', padding: '0', boxShadow: 'none' } }, bigCard(def, o), o.extra ?? null, src, h('div', { class: 'card-actions' }, ...(o.actions ?? []), h('button', { class: 'btn gray wide', onclick: () => (sfx('cancel'), close()) }, 'とじる')));
  close = overlay(box, { onClose: o.onClose });
  return close;
}
