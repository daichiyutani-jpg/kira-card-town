import { describe, expect, it } from 'vitest';
import { applyAction, combatCalc, createBattle, findMon, legalActions, statOf, summonCheck, attackTargets, stateHash } from '../src/engine/battle';
import { CARD_LIST, CARDS, deckProblems, DICE_BONUS, strongAgainst } from '../src/engine/cards';
import { fullText, summonText } from '../src/engine/describe';
import { chooseAction, STYLES } from '../src/engine/ai';
import type { BattleState } from '../src/engine/types';

const filler = (id: string) => Array(20).fill(id) as string[];

/** テスト用：手札・場を直接作る */
function setup(opts: { hand0?: string[]; field0?: string[]; field1?: string[]; hand1?: string[]; dice?: number[]; lp?: [number, number] }) {
  const { state } = createBattle({ seed: 1, decks: [filler('f01'), filler('w01')], names: ['A', 'B'], first: 0, shuffle: false, forcedDice: opts.dice, lp: opts.lp });
  const s = state;
  s.turn = 3; // 攻撃できるターン
  const put = (p: 0 | 1, id: string) => {
    s.players[p].field.push({ uid: s.nextUid++, id, owner: p, atkMod: 0, defMod: 0, atkTurn: 0, defTurn: 0, guard: false, attacks: 0, summonedTurn: 0, shield: (CARDS[id].kw ?? []).includes('tough'), stunned: 0, equip: null, equipId: null, extraKw: [], diceBonusNext: 0, luckyNext: false });
    return s.players[p].field.at(-1)!;
  };
  if (opts.hand0) s.players[0].hand = opts.hand0.map((id) => ({ uid: s.nextUid++, id }));
  if (opts.hand1) s.players[1].hand = opts.hand1.map((id) => ({ uid: s.nextUid++, id }));
  const f0 = (opts.field0 ?? []).map((id) => put(0, id));
  const f1 = (opts.field1 ?? []).map((id) => put(1, id));
  return { s, f0, f1 };
}

describe('カードデータ', () => {
  it('200種類あり、IDが重複しない', () => {
    expect(CARD_LIST.length).toBe(200);
    expect(new Set(CARD_LIST.map((c) => c.id)).size).toBe(200);
    expect(new Set(CARD_LIST.map((c) => c.name)).size).toBe(200);
  });
  it('3種類・4レアリティ・6属性がそろう', () => {
    expect(new Set(CARD_LIST.map((c) => c.type))).toEqual(new Set(['monster', 'magic', 'item']));
    expect(new Set(CARD_LIST.map((c) => c.r))).toEqual(new Set(['N', 'R', 'SR', 'UR']));
    expect(new Set(CARD_LIST.map((c) => c.el)).size).toBe(6);
  });
  it('すべてのカードの効果文が作れる（空のモンスター以外は1行以上）', () => {
    for (const c of CARD_LIST) {
      const t = fullText(c);
      if (c.type !== 'monster') expect(t.length, c.id).toBeGreaterThan(0);
      for (const line of t) expect(line).not.toMatch(/undefined/);
      if (c.type === 'monster') expect(summonText(c)).not.toMatch(/undefined/);
    }
  });
  it('モンスターはLv1〜7、攻撃・守備は0以上', () => {
    for (const c of CARD_LIST.filter((x) => x.type === 'monster')) {
      expect(c.lv).toBeGreaterThanOrEqual(1);
      expect(c.lv).toBeLessThanOrEqual(7);
      expect(c.atk).toBeGreaterThanOrEqual(0);
    }
  });
  it('お手伝い限定は5種類で、ほかの入手方法がない', () => {
    const mom = CARD_LIST.filter((c) => c.get.includes('mom'));
    expect(mom.length).toBe(5);
    for (const c of mom) expect(c.get).toEqual(['mom']);
  });
  it('カードの絵の組み合わせ（体型＋種）が全部ちがう', () => {
    expect(new Set(CARD_LIST.map((c) => `${c.art.body}:${c.art.seed}`)).size).toBe(200);
  });
});

describe('デッキ', () => {
  it('20枚ちょうどでないと使えない', () => {
    expect(deckProblems(Array(19).fill('f01'))[0]).toMatch(/たりません/);
    expect(deckProblems(Array(21).fill('f01'))[0]).toMatch(/多すぎ/);
  });
  it('同じカードは3枚まで・URは1枚まで', () => {
    const d = [...Array(4).fill('f01'), ...Array(16).fill('f02')];
    expect(deckProblems(d).join()).toMatch(/3枚まで/);
    const ok = ['f01', 'f01', 'f01', 'f02', 'f02', 'f02', 'f03', 'f03', 'f03', 'f04', 'f04', 'f04', 'f05', 'f05', 'f05', 'f06', 'f06', 'f06', 'f07', 'f21'];
    expect(deckProblems(ok)).toEqual([]);
    expect(deckProblems([...ok.slice(0, 18), 'f21', 'f21']).join()).toMatch(/1枚まで/);
  });
});

describe('サイコロと計算', () => {
  it('出目の補正表', () => {
    expect(DICE_BONUS.slice(1)).toEqual([-1, 0, 0, 1, 1, 2]);
  });
  it('属性相性：炎→風→地→水→炎、光と闇はおたがい', () => {
    expect(strongAgainst('fire', 'wind')).toBe(true);
    expect(strongAgainst('wind', 'earth')).toBe(true);
    expect(strongAgainst('earth', 'water')).toBe(true);
    expect(strongAgainst('water', 'fire')).toBe(true);
    expect(strongAgainst('fire', 'water')).toBe(false);
    expect(strongAgainst('light', 'dark') && strongAgainst('dark', 'light')).toBe(true);
  });
  it('攻撃＋出目補正＋属性 と 守備＋出目補正 を比べる', () => {
    // ヒノコリス(炎 3/2) が ツムジリス(風 2/2) を攻撃。出目 4(+1) と 2(0)
    const { s, f0, f1 } = setup({ field0: ['f01'], field1: ['a01'] });
    const c = combatCalc(s, f0[0], f1[0], 4, 2);
    expect(c.atkTotal).toBe(3 + 1 + 2);
    expect(c.defTotal).toBe(2 + 0);
  });
  it('攻撃が勝つと破壊して差の分ダメージ', () => {
    const { s, f0, f1 } = setup({ field0: ['f07'], field1: ['w01'], dice: [6, 1] }); // 5+2 対 3-1+2(水→炎)
    applyAction(s, { t: 'attack', uid: f0[0].uid, target: f1[0].uid });
    expect(findMon(s, f1[0].uid)).toBeUndefined();
    expect(s.players[1].lp).toBe(20 - (7 - 4));
  });
  it('守備が勝つとはね返され、攻撃側が差の分ダメージ', () => {
    const { s, f0, f1 } = setup({ field0: ['f01'], field1: ['e07'], dice: [1, 6] }); // 3-1 対 6+2
    applyAction(s, { t: 'attack', uid: f0[0].uid, target: f1[0].uid });
    expect(findMon(s, f1[0].uid)).toBeDefined();
    expect(s.players[0].lp).toBe(20 - 6);
  });
  it('同じなら何も起きない', () => {
    const { s, f0, f1 } = setup({ field0: ['f01'], field1: ['e01'], dice: [3, 3] }); // 3 対 3
    applyAction(s, { t: 'attack', uid: f0[0].uid, target: f1[0].uid });
    expect(s.players[0].lp).toBe(20);
    expect(s.players[1].lp).toBe(20);
    expect(s.players[1].field.length).toBe(1);
  });
  it('相手の場が空なら直接攻撃（最低1）', () => {
    const { s, f0 } = setup({ field0: ['f01'], dice: [6] });
    applyAction(s, { t: 'attack', uid: f0[0].uid, target: 'player' });
    expect(s.players[1].lp).toBe(20 - 5);
  });
  it('まもる と守備+2、そのターンは攻撃できない', () => {
    const { s, f0 } = setup({ field0: ['f01'], field1: ['w01'] });
    applyAction(s, { t: 'guard', uid: f0[0].uid });
    expect(attackTargets(s, f0[0].uid).ok).toBe(false);
    const c = combatCalc(s, s.players[1].field[0], f0[0], 3, 3);
    expect(c.defCalc.some((p) => p.label === 'まもる' && p.v === 2)).toBe(true);
  });
  it('先攻の1ターン目は攻撃できない', () => {
    const { state } = createBattle({ seed: 3, decks: [filler('f01'), filler('w01')], names: ['A', 'B'], first: 0 });
    const h = state.players[0].hand[0];
    applyAction(state, { t: 'summon', uid: h.uid, tributes: [] });
    expect(legalActions(state).some((a) => a.t === 'attack')).toBe(false);
  });
});

describe('生け贄召喚', () => {
  it('Lv4は1体、Lv6は2体必要。足りないと理由が出る', () => {
    const { s } = setup({ hand0: ['f12', 'f17'], field0: ['f01'] });
    const lv4 = summonCheck(s, 0, s.players[0].hand[0].uid);
    expect(lv4.ok).toBe(true);
    expect(lv4.need).toBe(1);
    const lv6 = summonCheck(s, 0, s.players[0].hand[1].uid);
    expect(lv6.ok).toBe(false);
    expect(lv6.reason).toMatch(/生け贄が2体/);
  });
  it('属性指定の生け贄（ソルガドラは炎2体）', () => {
    const { s } = setup({ hand0: ['f21'], field0: ['f01', 'w01'] });
    expect(summonCheck(s, 0, s.players[0].hand[0].uid).ok).toBe(false);
    const t = setup({ hand0: ['f21'], field0: ['f01', 'f02', 'w01'] });
    const c = summonCheck(t.s, 0, t.s.players[0].hand[0].uid);
    expect(c.ok).toBe(true);
    expect(c.options.length).toBe(1);
  });
  it('墓地条件（ヤミノバンケンは墓地にモンスター4枚）', () => {
    const { s } = setup({ hand0: ['d19'] });
    expect(summonCheck(s, 0, s.players[0].hand[0].uid).reason).toMatch(/墓地/);
    s.players[0].grave = ['f01', 'f01', 'f02', 'f03'].map((id) => ({ uid: s.nextUid++, id }));
    expect(summonCheck(s, 0, s.players[0].hand[0].uid).ok).toBe(true);
  });
  it('生け贄は墓地へ行き、召喚は1ターン1回', () => {
    const { s, f0 } = setup({ hand0: ['f12', 'f01'], field0: ['f02'] });
    applyAction(s, { t: 'summon', uid: s.players[0].hand[0].uid, tributes: [f0[0].uid] });
    expect(s.players[0].grave.map((g) => g.id)).toContain('f02');
    expect(s.players[1].lp).toBe(18); // ネツリュウの召喚ダメージ2
    expect(summonCheck(s, 0, s.players[0].hand[0].uid).reason).toMatch(/1ターン1回/);
  });
});

describe('特殊効果', () => {
  it('常時効果：ヒノタマクジャクで他の炎の攻撃+1', () => {
    const { s, f0 } = setup({ field0: ['f14', 'f01', 'w01'] });
    expect(statOf(s, f0[1], 'atk').total).toBe(4);
    expect(statOf(s, f0[2], 'atk').total).toBe(2);
  });
  it('しぶとい：1度だけ破壊されない', () => {
    const { s, f0, f1 } = setup({ field0: ['f07', 'f07'], field1: ['e09'], dice: [6, 1, 6, 1] });
    applyAction(s, { t: 'attack', uid: f0[0].uid, target: f1[0].uid });
    expect(findMon(s, f1[0].uid)).toBeDefined();
    applyAction(s, { t: 'attack', uid: f0[1].uid, target: f1[0].uid });
    expect(findMon(s, f1[0].uid)).toBeUndefined();
  });
  it('かべ：相手はかべを狙わないといけない', () => {
    const { s, f0, f1 } = setup({ field0: ['f01'], field1: ['w01', 'w02'] });
    expect(attackTargets(s, f0[0].uid).targets).toEqual([f1[1].uid]);
  });
  it('そら：相手にそらがいなければ直接攻撃できる', () => {
    const { s, f0 } = setup({ field0: ['f05'], field1: ['w01'] });
    expect(attackTargets(s, f0[0].uid).targets).toContain('player');
  });
  it('れんげき：2回攻撃できる', () => {
    const { s, f0 } = setup({ field0: ['f03'], dice: [3, 3] });
    applyAction(s, { t: 'attack', uid: f0[0].uid, target: 'player' });
    expect(attackTargets(s, f0[0].uid).ok).toBe(true);
    applyAction(s, { t: 'attack', uid: f0[0].uid, target: 'player' });
    expect(attackTargets(s, f0[0].uid).ok).toBe(false);
  });
  it('魔法：バクハツはLv3以下の相手1体を破壊。1ターン1枚', () => {
    const { s, f1 } = setup({ hand0: ['g03', 'g03'], field1: ['w01', 'w12'] });
    const acts = legalActions(s).filter((a) => a.t === 'magic');
    expect(acts.length).toBe(2); // 2枚×対象1体（w12はLv4なので対象外）
    applyAction(s, { t: 'magic', uid: s.players[0].hand[0].uid, target: f1[0].uid });
    expect(findMon(s, f1[0].uid)).toBeUndefined();
    expect(legalActions(s).some((a) => a.t === 'magic')).toBe(false);
  });
  it('装備アイテム：どうのつるぎで攻撃+2、モンスターが破壊されると一緒に墓地へ', () => {
    const { s, f0 } = setup({ hand0: ['i01'], field0: ['f01'] });
    applyAction(s, { t: 'item', uid: s.players[0].hand[0].uid, target: f0[0].uid });
    expect(statOf(s, f0[0], 'atk').total).toBe(5);
  });
  it('かくれみ：魔法の対象にならない', () => {
    const { s } = setup({ hand0: ['g03'], field1: ['d05'] });
    expect(legalActions(s).some((a) => a.t === 'magic')).toBe(false);
  });
  it('破壊された時：マグマスライムで相手に2ダメージ', () => {
    const { s, f0, f1 } = setup({ field0: ['f07'], field1: ['f06'], dice: [6, 1] });
    applyAction(s, { t: 'attack', uid: f0[0].uid, target: f1[0].uid });
    expect(s.players[0].lp).toBe(18);
  });
  it('復活：ヨミガエリノヒカリ', () => {
    const { s } = setup({ hand0: ['g21'] });
    s.players[0].grave.push({ uid: s.nextUid++, id: 'f07' });
    applyAction(s, { t: 'magic', uid: s.players[0].hand[0].uid });
    expect(s.players[0].field.map((m) => m.id)).toEqual(['f07']);
  });
  it('条件つき魔法：ヤミノギシキは墓地3枚がないと使えない', () => {
    const { s } = setup({ hand0: ['g27'], field1: ['w01'] });
    expect(legalActions(s).some((a) => a.t === 'magic')).toBe(false);
  });
});

describe('勝敗', () => {
  it('LPが0で負け', () => {
    const { s, f0 } = setup({ field0: ['f07'], dice: [6], lp: [20, 3] });
    const ev = applyAction(s, { t: 'attack', uid: f0[0].uid, target: 'player' });
    expect(s.winner).toBe(0);
    expect(ev.some((e) => e.k === 'end')).toBe(true);
  });
  it('山札が切れたらドローできずに負け', () => {
    const { state } = createBattle({ seed: 1, decks: [filler('f01'), filler('w01')], names: ['A', 'B'], first: 0 });
    state.players[1].deck = [];
    applyAction(state, { t: 'end' });
    expect(state.winner).toBe(0);
  });
  it('ターン上限でLPの多い方が勝ち', () => {
    const { state } = createBattle({ seed: 1, decks: [filler('w02'), filler('w02')], names: ['A', 'B'], first: 0, maxTurns: 4 });
    state.players[0].lp = 15;
    for (let i = 0; i < 4; i++) applyAction(state, { t: 'end' });
    expect(state.winner).toBe(1);
  });
});

describe('CPU と 通しのバトル', () => {
  const decks = [
    ['f01', 'f01', 'f02', 'f03', 'f05', 'f07', 'f07', 'f09', 'f12', 'f13', 'f17', 'g01', 'g02', 'g03', 'i01', 'i07', 'e06', 'e08', 'e10', 'e13'],
    ['w03', 'w06', 'w07', 'w08', 'w09', 'w11', 'w13', 'w16', 'w12', 'w17', 'l06', 'l07', 'l03', 'g05', 'g06', 'g20', 'i02', 'i06', 'l12', 'l15'],
  ];
  it('CPU同士で200戦しても止まらず必ず決着し、正規の行動しかしない', () => {
    const wins = [0, 0, 0];
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = createBattle({ seed, decks: decks as [string[], string[]], names: ['A', 'B'] });
      let r = seed * 99;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff), r / 0x7fffffff);
      let guard = 0;
      while (state.winner === null && guard++ < 2000) {
        const style = state.active === 0 ? STYLES.aggro : STYLES.defense;
        applyAction(state, chooseAction(state, style, rand)); // 不正な行動なら例外になる
      }
      expect(state.winner).not.toBeNull();
      wins[state.winner === 'draw' ? 2 : (state.winner as 0 | 1)]++;
    }
    expect(wins[0] + wins[1]).toBeGreaterThan(150);
  });
  it('同じ種なら同じ結果になる（通信対戦の前提）', () => {
    const run = () => {
      const { state } = createBattle({ seed: 42, decks: decks as [string[], string[]], names: ['A', 'B'] });
      let r = 7;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff), r / 0x7fffffff);
      while (state.winner === null) applyAction(state, chooseAction(state, STYLES.normal, rand));
      return stateHash(state as BattleState) + state.log.length;
    };
    expect(run()).toBe(run());
  });
  it('強いCPUは弱いCPUに勝ち越す（同じデッキ）', () => {
    let strong = 0;
    const N = 200;
    for (let seed = 1; seed <= N; seed++) {
      const { state } = createBattle({ seed, decks: [decks[0], decks[0]] as [string[], string[]], names: ['S', 'W'] });
      let r = seed;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff), r / 0x7fffffff);
      while (state.winner === null) applyAction(state, chooseAction(state, state.active === 0 ? STYLES.expert : STYLES.beginner, rand));
      if (state.winner === 0) strong++;
    }
    expect(strong / N).toBeGreaterThan(0.55);
  });
});
