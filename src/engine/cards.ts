import raw from '../data/cards.json';
import type { CardDef, Element } from './types';

export const CARD_LIST: CardDef[] = (raw as { cards: CardDef[] }).cards;
export const CARDS: Record<string, CardDef> = Object.fromEntries(CARD_LIST.map((c) => [c.id, c]));

export function card(id: string): CardDef {
  const c = CARDS[id];
  if (!c) throw new Error(`カードが見つかりません: ${id}`);
  return c;
}

export const ELEMENTS: Element[] = ['fire', 'water', 'wind', 'earth', 'light', 'dark'];
export const EL_NAME: Record<Element, string> = { fire: '炎', water: '水', wind: '風', earth: '地', light: '光', dark: '闇' };
export const EL_ICON: Record<Element, string> = { fire: '🔥', water: '💧', wind: '🌀', earth: '⛰️', light: '✨', dark: '🌙' };
export const RARITY_NAME = { N: 'ノーマル', R: 'レア', SR: 'スーパーレア', UR: 'ウルトラレア' } as const;
export const TYPE_NAME = { monster: 'モンスター', magic: '魔法', item: 'アイテム' } as const;

/** 属性相性：a が b に強いか。炎→風→地→水→炎、光と闇はおたがいに強い */
const BEATS: Record<Element, Element[]> = {
  fire: ['wind'],
  wind: ['earth'],
  earth: ['water'],
  water: ['fire'],
  light: ['dark'],
  dark: ['light'],
};
export function strongAgainst(a: Element, b: Element): boolean {
  return BEATS[a].includes(b);
}
export const ELEMENT_BONUS = 2;

/** サイコロの出目 → 補正 */
export const DICE_BONUS = [0, -1, 0, 0, 1, 1, 2];

export const DECK_SIZE = 20;
export const MAX_COPIES = 3;
export const MAX_UR_COPIES = 1;
export const FIELD_MAX = 3;
export const START_LP = 20;
export const START_HAND = 4;

export function tributeNeedByLevel(lv: number): number {
  if (lv >= 6) return 2;
  if (lv >= 4) return 1;
  return 0;
}

/** デッキが使えるかの判定。使えない理由を返す（使えるなら空配列） */
export function deckProblems(ids: string[]): string[] {
  const out: string[] = [];
  if (ids.length < DECK_SIZE) out.push(`あと${DECK_SIZE - ids.length}枚たりません（${ids.length}/${DECK_SIZE}）`);
  if (ids.length > DECK_SIZE) out.push(`${ids.length - DECK_SIZE}枚多すぎます（${ids.length}/${DECK_SIZE}）`);
  const count: Record<string, number> = {};
  for (const id of ids) count[id] = (count[id] ?? 0) + 1;
  for (const [id, n] of Object.entries(count)) {
    const c = CARDS[id];
    if (!c) {
      out.push(`知らないカードがあります（${id}）`);
      continue;
    }
    const max = c.r === 'UR' ? MAX_UR_COPIES : MAX_COPIES;
    if (n > max) out.push(`「${c.name}」は${max}枚までです（${n}枚）`);
  }
  if (!ids.some((id) => CARDS[id]?.type === 'monster')) out.push('モンスターが1枚もありません');
  return out;
}
