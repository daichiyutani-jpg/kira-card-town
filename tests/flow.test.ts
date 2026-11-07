import { describe, expect, it } from 'vitest';
import { applyAction, createBattle, findMon, stateHash } from '../src/engine/battle';
import type { Action, BattleState } from '../src/engine/types';
import { TUT_DICE, TUT_MY_DECK, TUT_OPP_DECK, TUT_OPP_LP, TUT_STEPS } from '../src/ui/tutorial';
import { checkReveal, combineSeed, helloProblem, inviteUrl, makeCommit, packSdp, parseMsg, readInvite, readReply, REPLY_PREFIX, unpackSdp } from '../src/net/protocol';
import { deliveryPay, jobPay } from '../src/ui/jobs';
import economy from '../src/data/economy.json';
import starters from '../src/data/starters.json';

const uidOf = (s: BattleState, p: 0 | 1, id: string) => s.players[p].hand.find((c) => c.id === id)!.uid;
const monOf = (s: BattleState, p: 0 | 1, id: string) => s.players[p].field.find((m) => m.id === id)!.uid;

describe('チュートリアル', () => {
  it('ガイドどおりに操作すると、必ず最後の直接攻撃で勝てる', () => {
    const { state: s } = createBattle({ seed: 12345, decks: [TUT_MY_DECK, TUT_OPP_DECK], names: ['me', 'ミドリ店長'], first: 0, lp: [20, TUT_OPP_LP], shuffle: false, forcedDice: [...TUT_DICE] });
    const run = (a: Action) => applyAction(s, a);
    // 1ターン目
    run({ t: 'summon', uid: uidOf(s, 0, 'f01'), tributes: [] });
    run({ t: 'end' });
    // 2ターン目（相手）
    run({ t: 'summon', uid: uidOf(s, 1, 'a01'), tributes: [] });
    run({ t: 'end' });
    // 3ターン目
    expect(s.players[0].hand.map((c) => c.id)).toContain('e05');
    run({ t: 'attack', uid: monOf(s, 0, 'f01'), target: monOf(s, 1, 'a01') });
    expect(s.players[1].field.length).toBe(0);
    run({ t: 'magic', uid: uidOf(s, 0, 'g01') });
    run({ t: 'item', uid: uidOf(s, 0, 'i01'), target: monOf(s, 0, 'f01') });
    run({ t: 'summon', uid: uidOf(s, 0, 'f02'), tributes: [] });
    run({ t: 'end' });
    // 4ターン目（相手）
    run({ t: 'summon', uid: uidOf(s, 1, 'e04'), tributes: [] });
    run({ t: 'end' });
    // 5ターン目
    run({ t: 'summon', uid: uidOf(s, 0, 'f12'), tributes: [monOf(s, 0, 'f02')] });
    run({ t: 'attack', uid: monOf(s, 0, 'f12'), target: monOf(s, 1, 'e04') });
    expect(s.winner).toBeNull();
    run({ t: 'attack', uid: monOf(s, 0, 'f01'), target: 'player' });
    expect(s.players[1].lp).toBe(0);
    expect(s.winner).toBe(0);
    expect(s.forcedDice.length).toBe(0);
  });
  it('説明は10項目（カードの見かた〜生け贄召喚）をすべて含む', () => {
    const all = TUT_STEPS.map((t) => t.text).join('');
    for (const k of ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']) expect(all).toContain(k);
    expect(TUT_MY_DECK.length).toBe(20);
    expect(TUT_OPP_DECK.length).toBe(20);
    void findMon;
  });
});

describe('オンライン対戦の取り決め', () => {
  it('招待URLと返事コードを読み取れる', async () => {
    const sdp = 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\na=candidate:1 1 udp 2122260223 192.168.0.2 5000 typ host\r\n'.repeat(5);
    const code = await packSdp(sdp);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const url = inviteUrl('https://example.com/kira/#old', code);
    expect(url).toBe(`https://example.com/kira/#join=${code}`);
    expect(readInvite(new URL(url).hash)).toBe(code);
    expect(await unpackSdp(readInvite(new URL(url).hash)!)).toBe(sdp);
    expect(readReply(`よろしく！\n${REPLY_PREFIX}${code}\n`)).toBe(code);
    expect(readReply('ちがう文字')).toBeNull();
    await expect(unpackSdp(await packSdp('hello'))).rejects.toThrow();
  });
  it('シードはコミットと公開で決まり、うそはばれる', async () => {
    const r = 123456789;
    const c = await makeCommit(r);
    expect(await checkReveal(c, r)).toBe(true);
    expect(await checkReveal(c, r + 1)).toBe(false);
    expect(combineSeed(r, 987654321)).toBe(combineSeed(987654321, r));
  });
  it('おかしなメッセージやルール違反のデッキを受け付けない', () => {
    expect(parseMsg('{bad')).toBeNull();
    expect(parseMsg(JSON.stringify({ t: 'commit', h: 'xyz' }))).toBeNull();
    expect(parseMsg(JSON.stringify({ t: 'act', n: 1, a: { t: 'end' }, h: 'abc' }))).toEqual({ t: 'act', n: 1, a: { t: 'end' }, h: 'abc' });
    expect(helloProblem({ v: 1, deck: starters.power.deck })).toBeNull();
    expect(helloProblem({ v: 1, deck: starters.power.deck.slice(0, 19) })).not.toBeNull();
    expect(helloProblem({ v: 99, deck: starters.power.deck })).not.toBeNull();
    expect(helloProblem({ v: 1, deck: [...starters.power.deck.slice(0, 19), 'zzz'] })).not.toBeNull();
  });
  it('二人が同じシード・デッキ・行動なら、同じ状態になる（ロックステップ）', () => {
    const setup = { seed: combineSeed(11, 22), decks: [starters.power.deck, starters.tech.deck] as [string[], string[]], names: ['A', 'B'] as [string, string] };
    const a = createBattle(setup).state;
    const b = createBattle(setup).state;
    expect(stateHash(a)).toBe(stateHash(b));
    for (let i = 0; i < 6; i++) {
      applyAction(a, { t: 'end' });
      applyAction(b, { t: 'end' });
      expect(stateHash(a)).toBe(stateHash(b));
    }
  });
});

describe('アルバイトの給料', () => {
  it('上限をこえない・成績が上がると増える', () => {
    expect(jobPay('sorting', 0)).toBe(0);
    expect(jobPay('sorting', 5)).toBe(economy.jobs.sorting.base + 5 * economy.jobs.sorting.perPoint);
    expect(jobPay('sorting', 999)).toBe(economy.jobs.sorting.max);
    expect(jobPay('nature', 999)).toBe(economy.jobs.nature.max);
    expect(deliveryPay(3, 40)).toBe(Math.min(economy.jobs.delivery.max, economy.jobs.delivery.base + 40 * economy.jobs.delivery.perExtra));
    expect(deliveryPay(3, 999)).toBe(economy.jobs.delivery.max);
    expect(deliveryPay(1, 0)).toBeLessThan(deliveryPay(3, 0));
  });
});
