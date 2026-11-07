// セーブデータ。localStorage に本体と予備を置く。版番号つきで、古いデータは migrate() で補う。
import economy from '../data/economy.json';
import { CARDS } from '../engine/cards';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'kira-card-town-save-v1';
export const BACKUP_KEY = 'kira-card-town-save-v1-backup';
export const BROKEN_KEY = 'kira-card-town-save-broken';

export interface DeckSlot {
  name: string;
  cards: string[];
}

export interface Settings {
  bgm: number; // 0〜1
  se: number;
  bgmOn: boolean;
  seOn: boolean;
  fastAnim: boolean; // 演出を短く
}

export interface SaveData {
  v: number;
  name: string;
  hero: 'boy' | 'girl'; // 主人公の見た目（男の子・女の子）
  money: number;
  cards: Record<string, number>; // 所持枚数
  dex: Record<string, 1>; // 一度でも手に入れた
  decks: DeckSlot[];
  activeDeck: number;
  flags: Record<string, boolean>;
  cupWins: Record<string, number>;
  cupPlays: Record<string, number>;
  beaten: Record<string, number>; // 対戦相手ごとの勝利回数
  jobs: Record<string, { plays: number; best: number }>;
  chores: { plays: number; misses: number; wins: number };
  forage: Record<string, string>; // スポット → 最後に調べた日（YYYY-MM-DD）
  stats: { battles: number; wins: number; packs: number; kuji: number; gacha: number; online: number; onlineWins: number };
  pos: { map: string; x: number; y: number; dir: string };
  settings: Settings;
  createdAt: number;
  savedAt: number;
}

export function newSave(name = 'キラ', hero: 'boy' | 'girl' = 'boy'): SaveData {
  return {
    v: SAVE_VERSION,
    name,
    hero,
    money: economy.startMoney,
    cards: {},
    dex: {},
    decks: [],
    activeDeck: 0,
    flags: {},
    cupWins: {},
    cupPlays: {},
    beaten: {},
    jobs: {},
    chores: { plays: 0, misses: 0, wins: 0 },
    forage: {},
    stats: { battles: 0, wins: 0, packs: 0, kuji: 0, gacha: 0, online: 0, onlineWins: 0 },
    pos: { map: 'home', x: 3, y: 3, dir: 'down' },
    settings: { bgm: 0.6, se: 0.8, bgmOn: true, seOn: true, fastAnim: false },
    createdAt: Date.now(),
    savedAt: Date.now(),
  };
}

/** 足りない項目を補い、知らないカードを取り除く（カードを増減しても既存データが壊れない） */
export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('セーブデータの形が正しくありません');
  const d = raw as Partial<SaveData>;
  if (typeof d.v !== 'number' || d.v > SAVE_VERSION) throw new Error('このゲームより新しい版のセーブデータです');
  const base = newSave(typeof d.name === 'string' ? d.name : 'キラ');
  const out: SaveData = { ...base, ...d, v: SAVE_VERSION } as SaveData;
  out.settings = { ...base.settings, ...(d.settings ?? {}) };
  out.stats = { ...base.stats, ...(d.stats ?? {}) };
  out.chores = { ...base.chores, ...(d.chores ?? {}) };
  out.pos = { ...base.pos, ...(d.pos ?? {}) };
  for (const k of ['cards', 'dex', 'flags', 'cupWins', 'cupPlays', 'beaten', 'jobs', 'forage'] as const)
    if (!out[k] || typeof out[k] !== 'object') (out as unknown as Record<string, unknown>)[k] = {};
  out.cards = Object.fromEntries(Object.entries(out.cards).filter(([id, n]) => CARDS[id] && Number.isFinite(n) && n > 0));
  out.dex = Object.fromEntries(Object.keys(out.dex).filter((id) => CARDS[id]).map((id) => [id, 1 as const]));
  out.decks = (Array.isArray(out.decks) ? out.decks : []).map((dk) => ({ name: String(dk?.name ?? 'デッキ'), cards: (dk?.cards ?? []).filter((id: string) => CARDS[id]) }));
  if (out.activeDeck >= out.decks.length) out.activeDeck = 0;
  if (!Number.isFinite(out.money) || out.money < 0) out.money = 0;
  if (out.hero !== 'boy' && out.hero !== 'girl') out.hero = 'boy';
  return out;
}

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function checksum(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function serialize(d: SaveData): string {
  const body = JSON.stringify(d);
  return JSON.stringify({ sum: checksum(body), body });
}
export function deserialize(text: string): SaveData {
  const wrap = JSON.parse(text) as { sum: string; body: string };
  if (typeof wrap.body !== 'string' || checksum(wrap.body) !== wrap.sum) throw new Error('セーブデータが壊れています');
  return migrate(JSON.parse(wrap.body));
}

export type LoadResult = { data: SaveData | null; note: string };

export function loadSave(store: Store): LoadResult {
  const main = store.getItem(SAVE_KEY);
  if (!main) return { data: null, note: '' };
  try {
    return { data: deserialize(main), note: '' };
  } catch {
    const backup = store.getItem(BACKUP_KEY);
    store.setItem(BROKEN_KEY, main);
    if (backup) {
      try {
        const data = deserialize(backup);
        store.setItem(SAVE_KEY, backup);
        return { data, note: 'セーブデータが壊れていたので、ひとつ前の記録から復元しました。' };
      } catch {
        /* 予備もだめ */
      }
    }
    store.removeItem(SAVE_KEY);
    return { data: null, note: 'セーブデータが壊れていて読み込めませんでした（壊れたデータは別に保管しました）。' };
  }
}

export function writeSave(store: Store, d: SaveData): void {
  d.savedAt = Date.now();
  const text = serialize(d);
  const prev = store.getItem(SAVE_KEY);
  if (prev) store.setItem(BACKUP_KEY, prev);
  store.setItem(SAVE_KEY, text);
}

// ---------- 引き継ぎコード（端末やブラウザを変える時） ----------
const PREFIX = 'KIRA1-';
function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(t: string): Uint8Array {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
export async function exportCode(d: SaveData): Promise<string> {
  const bytes = new TextEncoder().encode(serialize(d));
  return PREFIX + b64urlEncode(await pipe(bytes, new CompressionStream('deflate-raw')));
}
export async function importCode(code: string): Promise<SaveData> {
  const t = code.trim().replace(/\s+/g, '');
  if (!t.startsWith(PREFIX)) throw new Error('引き継ぎコードではありません（KIRA1- で始まります）');
  const bytes = await pipe(b64urlDecode(t.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
  return deserialize(new TextDecoder().decode(bytes));
}
