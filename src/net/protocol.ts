// オンライン対戦の取り決め（サーバーを使わない）。
// ・接続情報（SDP）は圧縮して、招待URLの # の後ろ／返事コードに入れる（# の後ろはサーバーに送られない）
// ・最初の乱数（シード）は「コミット→公開」で二人が一緒に決める（片方が都合のいい値を選べない）
// ・毎手、行動と「行動後の状態のハッシュ」を送る。受け取った側はルールどおりか確かめて同じ計算をし、ハッシュがずれたら中止する
import { deckProblems } from '../engine/cards';

export const NET_VERSION = 1;
export const INVITE_KEY = 'join';
export const REPLY_PREFIX = 'KIRAR1-';

export type NetMsg =
  | { t: 'hello'; v: number; app: string; name: string; deck: string[] }
  | { t: 'commit'; h: string }
  | { t: 'reveal'; r: number }
  | { t: 'act'; n: number; a: unknown; h: string }
  | { t: 'quit' }
  | { t: 'ping' };

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
export async function packSdp(sdp: string): Promise<string> {
  return b64urlEncode(await pipe(new TextEncoder().encode(sdp), new CompressionStream('deflate-raw')));
}
export async function unpackSdp(code: string): Promise<string> {
  const t = code.trim().replace(/\s+/g, '');
  const bytes = await pipe(b64urlDecode(t), new DecompressionStream('deflate-raw'));
  const sdp = new TextDecoder().decode(bytes);
  if (!sdp.startsWith('v=0')) throw new Error('接続情報ではありません');
  return sdp;
}

export function inviteUrl(base: string, code: string): string {
  return `${base.split('#')[0]}#${INVITE_KEY}=${code}`;
}
export function readInvite(hash: string): string | null {
  const m = hash.match(new RegExp(`[#&]${INVITE_KEY}=([A-Za-z0-9_-]+)`));
  return m ? m[1] : null;
}
export function readReply(text: string): string | null {
  const t = text.trim().replace(/\s+/g, '');
  const i = t.indexOf(REPLY_PREFIX);
  if (i < 0) return null;
  const m = t.slice(i + REPLY_PREFIX.length).match(/^[A-Za-z0-9_-]+/);
  return m ? m[0] : null;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function randomU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
/** コミット：乱数と、推測されないための塩を合わせてハッシュにする */
export const commitText = (r: number) => `kira-seed:${r}`;
export async function makeCommit(r: number): Promise<string> {
  return sha256(commitText(r));
}
export async function checkReveal(commit: string, r: number): Promise<boolean> {
  return Number.isInteger(r) && r >= 0 && r <= 0xffffffff && (await sha256(commitText(r))) === commit;
}
export function combineSeed(a: number, b: number): number {
  return (a ^ b) >>> 0;
}

/** 届いたメッセージの形を確かめる（おかしなものは捨てる） */
export function parseMsg(raw: unknown): NetMsg | null {
  if (typeof raw !== 'string' || raw.length > 20000) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  switch (m.t) {
    case 'hello':
      if (typeof m.v !== 'number' || typeof m.name !== 'string' || typeof m.app !== 'string' || !Array.isArray(m.deck) || !m.deck.every((x) => typeof x === 'string')) return null;
      return { t: 'hello', v: m.v, app: m.app, name: m.name.slice(0, 8), deck: m.deck as string[] };
    case 'commit':
      return typeof m.h === 'string' && /^[0-9a-f]{64}$/.test(m.h) ? { t: 'commit', h: m.h } : null;
    case 'reveal':
      return typeof m.r === 'number' ? { t: 'reveal', r: m.r } : null;
    case 'act':
      return typeof m.n === 'number' && typeof m.h === 'string' && m.a && typeof m.a === 'object' ? { t: 'act', n: m.n, a: m.a, h: m.h } : null;
    case 'quit':
      return { t: 'quit' };
    case 'ping':
      return { t: 'ping' };
  }
  return null;
}

export function helloProblem(h: { v: number; deck: string[] }): string | null {
  if (h.v !== NET_VERSION) return 'ゲームの版がちがいます。両方とも最新にしてください（タイトル画面で更新）';
  const p = deckProblems(h.deck);
  return p.length ? `相手のデッキがルールに合っていません：${p[0]}` : null;
}
