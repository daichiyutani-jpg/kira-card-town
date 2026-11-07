// カードの入手・お金・抽選（パック・くじ・ガチャ・お手伝い）
import economy from '../data/economy.json';
import shops from '../data/shops.json';
import opponents from '../data/opponents.json';
import starters from '../data/starters.json';
import { CARD_LIST, CARDS } from '../engine/cards';
import type { CardDef, Rarity } from '../engine/types';
import type { SaveData } from './save';

export interface Opponent {
  id: string;
  name: string;
  title: string;
  style: string;
  deck: string[];
  talk: { hi: string; win: string; lose: string };
  look: { hair: string; shirt: string; skin: string; pants: string };
  reward: number;
}
export const OPPONENTS: Record<string, Opponent> = Object.fromEntries((opponents as { opponents: Opponent[] }).opponents.map((o) => [o.id, o]));
export const STARTERS = starters as Record<'power' | 'balance' | 'tech', { name: string; desc: string; deck: string[] }>;

export interface DrawTable {
  name: string;
  price: number;
  tags: string[];
  rates: Partial<Record<Rarity, number>>;
  count?: number;
}
export const PACKS = shops.packs as Record<string, DrawTable>;
export const KUJI = shops.festival.kuji as DrawTable;
export const GACHA = shops.festival.gacha as DrawTable;

export function poolOf(t: DrawTable): Record<Rarity, CardDef[]> {
  const out: Record<Rarity, CardDef[]> = { N: [], R: [], SR: [], UR: [] };
  for (const c of CARD_LIST) if (c.get.some((g) => t.tags.includes(g))) out[c.r].push(c);
  return out;
}

/** 表示している確率どおりに1枚引く。rand は 0〜1 */
export function drawOne(t: DrawTable, rand: () => number): CardDef {
  const pool = poolOf(t);
  const entries = (Object.entries(t.rates) as [Rarity, number][]).filter(([, w]) => w > 0);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = rand() * total;
  let rar: Rarity = entries[0][0];
  for (const [r, w] of entries) {
    if (x < w) {
      rar = r;
      break;
    }
    x -= w;
  }
  const list = pool[rar];
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

export function addCard(d: SaveData, id: string, n = 1): void {
  d.cards[id] = (d.cards[id] ?? 0) + n;
  d.dex[id] = 1;
}
export function owned(d: SaveData, id: string): number {
  return d.cards[id] ?? 0;
}
export function spend(d: SaveData, n: number): boolean {
  if (d.money < n) return false;
  d.money -= n;
  return true;
}
export function earn(d: SaveData, n: number): void {
  d.money += Math.max(0, Math.floor(n));
}

export function singlePrice(c: CardDef): number {
  return (economy.singlePrice as Record<Rarity, number>)[c.r];
}

export function giveStarter(d: SaveData, kind: keyof typeof STARTERS): void {
  const s = STARTERS[kind];
  for (const id of s.deck) addCard(d, id);
  d.decks.push({ name: s.name, cards: [...s.deck] });
  d.flags[`starter_${kind}`] = true;
}

/** お手伝いの抽選：確率 chance、pity 回つづけてはずれたら次は必ず当たり */
export const MOM_CARDS = CARD_LIST.filter((c) => c.get.includes('mom')).map((c) => c.id);
export function choreRoll(d: SaveData, rand: () => number): string | null {
  d.chores.plays++;
  const guaranteed = d.chores.misses >= economy.chores.pity;
  if (guaranteed || rand() < economy.chores.chance) {
    d.chores.misses = 0;
    d.chores.wins++;
    const id = MOM_CARDS[Math.floor(rand() * MOM_CARDS.length)];
    addCard(d, id);
    return id;
  }
  d.chores.misses++;
  return null;
}

/** 入手方法の説明（図鑑用）。データから自動で作る */
export function sourcesOf(id: string): string[] {
  const c = CARDS[id];
  const out: string[] = [];
  const TAG: Record<string, string> = {
    pack1: 'ひだまりパック・にぎわいパック',
    pack2: 'にぎわいパック・みどりパック',
    pack3: 'みどりパック',
    gacha: 'みどりパック・星まつりのガチャ',
    fest: '星まつりのくじ・ガチャ（期間限定）',
    mom: 'お母さんのお手伝い（ここでしか手に入らない）',
    'prize:story': 'ストーリーをクリアする',
    'prize:cup1x3': 'ひだまりカップで3回優勝する',
    'prize:cup2x3': 'にぎわいカップで3回優勝する',
    'prize:cup3x3': 'みどりカップで3回優勝する',
    'prize:school': 'キラ星学園の生徒8人全員に勝つ',
    'prize:dex100': '図鑑に100種類を登録する',
  };
  for (const g of c.get) if (TAG[g] && !out.includes(TAG[g])) out.push(TAG[g]);
  for (const s of Object.values(shops.shops)) if (s.singles.includes(id)) out.push(`${s.name}で単品販売`);
  for (const [k, s] of Object.entries(STARTERS)) if (s.deck.includes(id)) out.push(`初期デッキ「${s.name}」` + (k ? '' : ''));
  const opps = Object.values(OPPONENTS).filter((o) => o.deck.includes(id) && o.style !== 'tutorial');
  if (opps.length) out.push(`対戦の勝利報酬：${opps.slice(0, 4).map((o) => o.name).join('・')}${opps.length > 4 ? ` ほか${opps.length - 4}人` : ''}`);
  return out;
}

export const PRIZES: { id: string; flag: string; test: (d: SaveData) => boolean }[] = [
  { id: 'pr2', flag: 'prize_pr2', test: (d) => (d.cupWins.cup1 ?? 0) >= 3 },
  { id: 'pr3', flag: 'prize_pr3', test: (d) => (d.cupWins.cup2 ?? 0) >= 3 },
  { id: 'pr4', flag: 'prize_pr4', test: (d) => (d.cupWins.cup3 ?? 0) >= 3 },
  { id: 'pr5', flag: 'prize_pr5', test: (d) => ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].every((s) => (d.beaten[s] ?? 0) > 0) },
  { id: 'pr6', flag: 'prize_pr6', test: (d) => Object.keys(d.dex).length >= 100 },
];
/** 条件を満たした特別なカードを渡し、渡したIDを返す */
export function checkPrizes(d: SaveData): string[] {
  const got: string[] = [];
  for (const p of PRIZES)
    if (!d.flags[p.flag] && p.test(d)) {
      d.flags[p.flag] = true;
      addCard(d, p.id);
      got.push(p.id);
    }
  return got;
}
