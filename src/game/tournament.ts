// 4人トーナメント（プレイヤー＋CPU3人）。もう片方の準決勝はCPUどうしで実際にバトルして決める。
import economy from '../data/economy.json';
import { STYLES, chooseAction } from '../engine/ai';
import { applyAction, createBattle } from '../engine/battle';
import { OPPONENTS, earn, spend } from './collection';
import type { SaveData } from './save';

export interface CupDef {
  name: string;
  town: string;
  fee: number;
  prize: number;
  entrants: string[];
  feature: string;
}
export const CUPS = economy.cups as Record<string, CupDef>;

export interface CupRun {
  cup: string;
  players: [string, string, string]; // CPU 3人（[0]が準決勝の相手）
  stage: 'semi' | 'final' | 'won' | 'lost';
  finalOpp: string | null;
  otherSemi: { winner: string; log: string } | null;
}

export function lcg(seed: number): () => number {
  let r = seed >>> 0 || 1;
  return () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0), (r >>> 1) / 0x7fffffff);
}

export function startCup(d: SaveData, cup: string, rand: () => number): CupRun | null {
  const def = CUPS[cup];
  if (!spend(d, def.fee)) return null;
  d.cupPlays[cup] = (d.cupPlays[cup] ?? 0) + 1;
  const pool = [...def.entrants];
  const pick = () => pool.splice(Math.floor(rand() * pool.length), 1)[0];
  return { cup, players: [pick(), pick(), pick()], stage: 'semi', finalOpp: null, otherSemi: null };
}

/** CPUどうしのバトルを最後まで行う（結果は本当にバトルした結果） */
export function cpuVsCpu(a: string, b: string, seed: number): string {
  const A = OPPONENTS[a];
  const B = OPPONENTS[b];
  const { state } = createBattle({ seed, decks: [A.deck, B.deck], names: [A.name, B.name] });
  const rand = lcg(seed ^ 0x5bd1e995);
  let guard = 0;
  while (state.winner === null && guard++ < 3000) {
    const style = STYLES[(state.active === 0 ? A : B).style] ?? STYLES.normal;
    applyAction(state, chooseAction(state, style, rand));
  }
  if (state.winner === 'draw' || state.winner === null) return rand() < 0.5 ? a : b;
  return state.winner === 0 ? a : b;
}

/** 準決勝の結果を記録し、勝ったら決勝の相手を決める */
export function afterSemi(run: CupRun, playerWon: boolean, seed: number): void {
  if (!playerWon) {
    run.stage = 'lost';
    return;
  }
  const w = cpuVsCpu(run.players[1], run.players[2], seed);
  run.otherSemi = { winner: w, log: `${OPPONENTS[run.players[1]].name} 対 ${OPPONENTS[run.players[2]].name} → ${OPPONENTS[w].name}の勝ち` };
  run.finalOpp = w;
  run.stage = 'final';
}

export function afterFinal(d: SaveData, run: CupRun, playerWon: boolean): number {
  if (!playerWon) {
    run.stage = 'lost';
    return 0;
  }
  run.stage = 'won';
  const prize = CUPS[run.cup].prize;
  earn(d, prize);
  d.cupWins[run.cup] = (d.cupWins[run.cup] ?? 0) + 1;
  d.flags[run.cup] = true;
  return prize;
}

/** 学園の今日のイベント（日付で決まる） */
export const STUDENTS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
export function schoolEvent(date: Date): { student: string; text: string } {
  const days = Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000);
  const student = STUDENTS[((days % 8) + 8) % 8];
  return { student, text: `今日の「学園チャレンジ」：${OPPONENTS[student].name}（${OPPONENTS[student].title}）に勝つと、もらえるコインが2倍！` };
}
