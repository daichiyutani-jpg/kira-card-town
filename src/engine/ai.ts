// CPUの思考。正規のルールの範囲だけで行動を選ぶ（相手の手札・山札は見ない）。
import { attackTargets, combatCalc, findMon, keywords, legalActions, other, statOf, summonCheck } from './battle';
import { card } from './cards';
import type { Action, BattleState, CardDef, Effect, FieldMon } from './types';

export interface AiStyle {
  aggression: number; // 0〜1：攻めたがる
  guard: number; // 0〜1：まもりたがる
  magic: number; // 0.5〜1.5：魔法・アイテムを好む
  tribute: number; // 0〜1：生け贄召喚の上手さ
  smart: number; // 0〜1：読みの正確さ（低いと見積もりがぶれる）
  mistake: number; // 0〜1：うっかり別の手を選ぶ確率
}

export const STYLES: Record<string, AiStyle> = {
  beginner: { aggression: 0.5, guard: 0.2, magic: 0.7, tribute: 0.3, smart: 0.3, mistake: 0.25 },
  normal: { aggression: 0.55, guard: 0.4, magic: 1, tribute: 0.6, smart: 0.6, mistake: 0.12 },
  aggro: { aggression: 0.9, guard: 0.1, magic: 1, tribute: 0.6, smart: 0.65, mistake: 0.08 },
  defense: { aggression: 0.35, guard: 0.9, magic: 1, tribute: 0.7, smart: 0.65, mistake: 0.08 },
  combo: { aggression: 0.6, guard: 0.35, magic: 1.4, tribute: 0.8, smart: 0.75, mistake: 0.06 },
  element: { aggression: 0.6, guard: 0.4, magic: 1, tribute: 0.7, smart: 0.85, mistake: 0.05 },
  expert: { aggression: 0.65, guard: 0.45, magic: 1.2, tribute: 0.95, smart: 0.95, mistake: 0.02 },
  tutorial: { aggression: 0, guard: 0, magic: 0, tribute: 0, smart: 0, mistake: 0 },
};

export function monValue(s: BattleState, m: FieldMon): number {
  return statOf(s, m, 'atk').total + statOf(s, m, 'def').total * 0.7 + keywords(s, m).length * 1.2 + (m.equipId ? 1 : 0);
}
function defValue(d: CardDef): number {
  return d.atk + d.def * 0.7 + (d.kw?.length ?? 0) * 1.2 + (d.fx?.length ?? 0) * 1.5;
}

/** 36通りのサイコロで、攻撃の期待値を出す */
export function attackEV(s: BattleState, att: FieldMon, target: number | 'player'): { ev: number; pWin: number; minDmg: number } {
  const dfn = target === 'player' ? null : findMon(s, target)!;
  let ev = 0;
  let pWin = 0;
  let minDmg = 99;
  for (let a = 1; a <= 6; a++)
    for (let d = 1; d <= 6; d++) {
      const c = combatCalc(s, att, dfn, a, d);
      if (!dfn) {
        ev += c.atkTotal / 36;
        minDmg = Math.min(minDmg, c.atkTotal);
        pWin += 1 / 36;
        continue;
      }
      const diff = c.atkTotal - c.defTotal;
      if (diff > 0) {
        pWin += 1 / 36;
        ev += ((dfn.shield ? 0 : monValue(s, dfn)) + diff) / 36;
      } else if (diff < 0) ev += diff / 36;
    }
  return { ev, pWin, minDmg };
}

function effectScore(s: BattleState, p: 0 | 1, e: Effect, target: FieldMon | undefined): number {
  const me = s.players[p];
  const op = s.players[other(p)];
  const n = e.n ?? 1;
  switch (e.do) {
    case 'dmg':
      if (e.target === 'self') return -n;
      return op.lp <= n ? 100 : n * 1.5;
    case 'drain':
      return op.lp <= n ? 100 : n * 2;
    case 'heal':
      return me.lp <= 10 ? n * 1.3 : me.lp <= 15 ? n * 0.6 : n * 0.15;
    case 'buff': {
      const enemyT = e.target?.startsWith('enemy');
      const list = target ? [target] : enemyT ? op.field : me.field;
      if (!list.length) return 0;
      if (enemyT) return Math.abs(n) * 0.7 * list.length;
      if (e.stat === 'def' || e.dur === 'perm') return n * 0.7 * list.length;
      const attackers = list.filter((m) => attackTargets(s, m.uid).ok);
      return n * 1.1 * attackers.length;
    }
    case 'destroy': {
      const list = target ? [target] : op.field.filter((m) => !e.maxLv || card(m.id).lv <= e.maxLv);
      if (e.target === 'enemyAll') return list.reduce((a, m) => a + monValue(s, m), 0);
      return list.length ? Math.max(...list.map((m) => monValue(s, m))) : 0;
    }
    case 'bounce': {
      const list = target ? [target] : op.field;
      if (e.target === 'enemyAll') return list.reduce((a, m) => a + monValue(s, m) * 0.7, 0);
      return list.length ? Math.max(...list.map((m) => monValue(s, m))) * 0.7 : 0;
    }
    case 'stun':
      return target ? statOf(s, target, 'atk').total * 0.5 : op.field.length * 2;
    case 'draw':
      return me.deck.length > n + 2 ? n * 1.6 : -1;
    case 'search':
      return 2;
    case 'revive':
      return 5;
    case 'shield':
      return me.field.length ? 2 : 0;
    case 'discard':
      return op.hand.length ? n * 1.8 : 0;
    case 'grant': {
      const m = target ?? me.field[0];
      if (!m) return 0;
      if (e.kw === 'double') return statOf(s, m, 'atk').total * 0.7;
      if (e.kw === 'sky') return op.field.length ? statOf(s, m, 'atk').total * 0.5 : 0.5;
      return 1.5;
    }
    case 'lucky':
    case 'dice':
      return 1;
  }
}

function cardPlayScore(s: BattleState, p: 0 | 1, def: CardDef, target: number | undefined, style: AiStyle): number {
  const t = target !== undefined ? findMon(s, target) : undefined;
  let sc = 0;
  if (def.equip && t) {
    for (const e of def.fx ?? []) {
      if (e.do === 'buff') sc += (e.n ?? 0) * 1.1;
      if (e.do === 'grant') sc += effectScore(s, p, { ...e, on: 'play' }, t);
    }
    sc += statOf(s, t, 'atk').total * 0.15; // 強いモンスターに付けたい
  } else for (const e of def.fx ?? []) if (e.on === 'play') sc += effectScore(s, p, e, t);
  return sc * style.magic;
}

export function scoreAction(s: BattleState, a: Action, style: AiStyle): number {
  const p = s.active;
  const me = s.players[p];
  const op = s.players[other(p)];
  switch (a.t) {
    case 'end':
      return 0;
    case 'summon': {
      const h = me.hand.find((c) => c.uid === a.uid)!;
      const d = card(h.id);
      let v = defValue(d) + 2;
      for (const t of a.tributes) {
        const m = findMon(s, t)!;
        v -= monValue(s, m) * (1.4 - style.tribute * 0.6);
      }
      if (!me.field.length) v += 3;
      return 20 + v; // 召喚は先に考える
    }
    case 'magic':
    case 'item': {
      const h = me.hand.find((c) => c.uid === a.uid)!;
      const v = cardPlayScore(s, p, card(h.id), a.target, style);
      return v > 0.8 ? 10 + v : v - 5;
    }
    case 'attack': {
      const m = findMon(s, a.uid)!;
      const r = attackEV(s, m, a.target);
      if (a.target === 'player' && r.minDmg >= op.lp) return 200;
      let v = r.ev + (style.aggression - 0.5) * 3;
      if (a.target === 'player') v += 1;
      return v > 0 ? 5 + v : v;
    }
    case 'guard': {
      if (!op.field.length) return -1;
      const m = findMon(s, a.uid)!;
      const threat = Math.max(...op.field.map((f) => statOf(s, f, 'atk').total));
      const gap = threat + 1 - statOf(s, m, 'def').total;
      return gap > -2 ? style.guard * 2 + 0.3 : -1;
    }
  }
}

/** CPUの次の行動を1つ選ぶ。rand は CPU専用の乱数（バトルの乱数とは別。出目には影響しない） */
export function chooseAction(s: BattleState, style: AiStyle, rand: () => number): Action {
  const acts = legalActions(s);
  if (acts.length === 1) return acts[0];
  const scored = acts.map((a) => ({ a, v: scoreAction(s, a, style) + (rand() - 0.5) * (1 - style.smart) * 4 }));
  scored.sort((x, y) => y.v - x.v);
  const good = scored.filter((x) => x.v > 0 && x.a.t !== 'end');
  if (!good.length) return { t: 'end' };
  if (rand() < style.mistake && good.length > 1) return good[Math.floor(rand() * good.length)].a;
  return good[0].a;
}

/** 召喚の可否（AIテスト用の補助） */
export const canSummon = summonCheck;
