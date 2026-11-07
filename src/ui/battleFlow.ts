// CPU戦の流れ：デッキ確認 → バトル → 勝ったら報酬（コイン＋カード1枚）
import { battleBg } from './bg';
import { STYLES } from '../engine/ai';
import { OPPONENTS, earn } from '../game/collection';
import { sfx } from '../audio/sound';
import { game, save, talk } from './app';
import { runBattle } from './battleView';
import { pickReward } from './reward';

export interface FightOpts {
  money: number;
  bgm?: string;
  back: () => void;
  onWin?: () => Promise<void>;
  noReward?: boolean;
}

export async function fightCpu(oppId: string, o: FightOpts): Promise<boolean> {
  const won = await battleOnly(oppId, o.bgm);
  if (won === null) {
    o.back();
    return false;
  }
  if (won) {
    earn(game.d, o.money);
    save();
    if (!o.noReward) await pickReward(OPPONENTS[oppId].deck, OPPONENTS[oppId].name, o.money);
    o.back();
    if (o.onWin) await o.onWin();
  } else o.back();
  return won;
}

/** バトルだけを行い、勝ち true / 負け false を返す（大会でも使う） */
export async function battleOnly(oppId: string, bgm = 'battle'): Promise<boolean | null> {
  const opp = OPPONENTS[oppId];
  const deck = game.d.decks[game.d.activeDeck];
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  const r = await runBattle({
    setup: { seed, decks: [deck.cards, opp.deck], names: [game.d.name, opp.name] },
    cpu: STYLES[opp.style] ?? STYLES.normal,
    oppTitle: opp.title,
    bgm,
    bg: battleBg(oppId, bgm),
  });
  game.d.stats.battles++;
  const won = r.winner === 0;
  if (won) {
    game.d.stats.wins++;
    game.d.beaten[oppId] = (game.d.beaten[oppId] ?? 0) + 1;
    sfx('win');
  } else sfx('lose');
  save();
  await talk([{ s: opp.name, t: won ? opp.talk.win : r.winner === 'draw' ? '引き分けか……いい勝負だった！' : opp.talk.lose }, won ? { s: '', t: `${r.state.endReason}。勝利！` } : { s: '', t: r.winner === 'draw' ? '引き分け（勝利にはなりません）' : `${r.state.endReason}。負けてしまった……。デッキを見直して、また挑戦しよう！` }]);
  return won;
}
