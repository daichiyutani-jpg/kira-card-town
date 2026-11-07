// 大会：参加費 → 準決勝 → （もう片方の準決勝はCPUどうしで実際に対戦）→ 決勝 → 賞金。何度でも参加できる
import { bgStyle } from './bg';
import { OPPONENTS, checkPrizes } from '../game/collection';
import { afterFinal, afterSemi, CUPS, startCup, type CupRun } from '../game/tournament';
import { playBgm, sfx } from '../audio/sound';
import { confetti, confirmBox, game, h, save, showScreen, titleBar, toast } from './app';
import { battleOnly } from './battleFlow';
import { pickReward, showGet } from './reward';
import { activeDeckOk, scene } from './world';

function bracket(run: CupRun): HTMLElement {
  const name = (id: string | null) => (id === 'me' ? game.d.name : id ? OPPONENTS[id].name : '？');
  const [a, b, c] = run.players;
  const semi1W = run.stage === 'semi' ? null : run.stage === 'lost' && !run.finalOpp ? a : 'me';
  const semi2W = run.otherSemi?.winner ?? null;
  const champ = run.stage === 'won' ? 'me' : run.stage === 'lost' && run.finalOpp ? run.finalOpp : null;
  const box = (id: string | null, win: boolean | null) => h('div', { style: { padding: '6px 10px', borderRadius: '10px', background: win ? '#ffe27a' : win === false ? '#ddd' : '#fff', color: '#222', fontWeight: '800', fontSize: '14px', minWidth: '110px', textAlign: 'center' } }, name(id));
  return h(
    'div',
    { class: 'panel', style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', alignItems: 'center', margin: '10px' } },
    h('div', { class: 'col', style: { gap: '6px' } }, box('me', semi1W === null ? null : semi1W === 'me'), box(a, semi1W === null ? null : semi1W === a), h('div', { style: { height: '10px' } }), box(b, semi2W === null ? null : semi2W === b), box(c, semi2W === null ? null : semi2W === c)),
    h('div', { class: 'col', style: { gap: '40px' } }, box(semi1W, champ === null ? null : champ === semi1W), box(semi2W, champ === null ? null : champ === semi2W)),
    h('div', { class: 'col', style: { alignItems: 'center' } }, h('div', { style: { fontSize: '34px' } }, '🏆'), box(champ, champ ? true : null)),
  );
}

export function openCup(id: string, back: () => void): void {
  const cup = CUPS[id];
  playBgm('cup');
  const el = h('div', { class: 'screen', style: { background: bgStyle('cup', '#1b1446') } });
  const wins = game.d.cupWins[id] ?? 0;
  const plays = game.d.cupPlays[id] ?? 0;
  const list = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' } }, ...cup.entrants.map((e) => h('div', { class: 'item-row', style: { padding: '8px' } }, h('div', { class: 'grow' }, h('h4', { style: { fontSize: '14px' } }, OPPONENTS[e].name), h('div', { class: 'rates' }, OPPONENTS[e].title), game.d.beaten[e] ? h('div', { class: 'rates', style: { color: 'var(--good)' } }, `勝利 ${game.d.beaten[e]}回`) : null))));
  el.append(
    titleBar(cup.name, back),
    h(
      'div',
      { class: 'scroll grow' },
      h(
        'div',
        { class: 'panel', style: { margin: '10px' } },
        h('div', { style: { fontSize: '18px', fontWeight: '900' } }, `🏆 ${cup.name}`),
        h('div', {}, cup.feature),
        h('div', { style: { marginTop: '6px' } }, `参加費：${cup.fee}コイン（負けても返ってきません）`),
        h('div', {}, `優勝賞金：${cup.prize}コイン ＋ 勝つたびに相手のカードを1枚`),
        h('div', {}, '4人のトーナメント。準決勝と決勝の2連勝で優勝！ 出場者10人の中から毎回3人が選ばれます。'),
        h('div', { class: 'rates', style: { marginTop: '6px' } }, `これまで：参加${plays}回・優勝${wins}回${wins < 3 ? `（3回優勝すると特別なカード）` : ''}`),
        h('button', {
          class: 'btn primary wide',
          style: { marginTop: '10px' },
          disabled: game.d.money < cup.fee,
          onclick: () => void enter(id, back),
        }, game.d.money < cup.fee ? `コインが足りません（${cup.fee}必要）` : `参加する（${cup.fee}コイン）`),
      ),
      h('div', { style: { color: '#fff', fontWeight: '800', padding: '0 12px' } }, '出場するかもしれない選手'),
      list,
    ),
  );
  showScreen(el);
}

async function enter(id: string, back: () => void) {
  const cup = CUPS[id];
  if (!activeDeckOk()) return toast('使えるデッキがありません。机でデッキを20枚にしよう', 2600);
  if (!(await confirmBox(`参加費${cup.fee}コインを払って${cup.name}に参加しますか？\n（いま ${game.d.money}コイン・負けても返ってきません）`))) return;
  const run = startCup(game.d, id, Math.random);
  if (!run) return toast('コインが足りません');
  save();
  sfx('coin');
  await showBracket(run, `対戦表が決まった！ 準決勝の相手は ${OPPONENTS[run.players[0]].name}`);
  // 準決勝
  const w1 = await battleOnly(run.players[0], 'cup');
  if (w1) await pickReward(OPPONENTS[run.players[0]].deck, OPPONENTS[run.players[0]].name, 0);
  afterSemi(run, !!w1, (Date.now() ^ 0x2545f491) >>> 0);
  save();
  if (!w1) return finish(run, back);
  await showBracket(run, `もう一つの準決勝：${run.otherSemi!.log}\n決勝の相手は ${OPPONENTS[run.finalOpp!].name}！`);
  // 決勝
  const w2 = await battleOnly(run.finalOpp!, 'cup');
  if (w2) await pickReward(OPPONENTS[run.finalOpp!].deck, OPPONENTS[run.finalOpp!].name, 0);
  const firstWin = !!w2 && !game.d.flags[id];
  const prize = afterFinal(game.d, run, !!w2);
  save();
  await finish(run, back, prize, firstWin);
}

function showBracket(run: CupRun, msg: string): Promise<void> {
  return new Promise((resolve) => {
    const el = h('div', { class: 'screen', style: { background: bgStyle('cup', '#1b1446') } });
    el.append(titleBar(`${CUPS[run.cup].name} 対戦表`, null), h('div', { class: 'scroll grow' }, bracket(run), h('div', { class: 'panel', style: { margin: '10px', whiteSpace: 'pre-wrap' } }, msg), h('div', { style: { padding: '0 10px' } }, h('button', { class: 'btn primary wide', onclick: () => resolve() }, 'バトルへ！'))));
    showScreen(el);
  });
}

async function finish(run: CupRun, back: () => void, prize = 0, firstWin = false) {
  const won = run.stage === 'won';
  await new Promise<void>((resolve) => {
    const el = h('div', { class: 'screen', style: { background: bgStyle('cup', '#1b1446') } });
    el.append(
      titleBar('大会の結果', null),
      h(
        'div',
        { class: 'scroll grow' },
        bracket(run),
        won ? h('div', { class: 'trophy' }, '🏆') : null,
        h('div', { class: 'panel', style: { margin: '10px', textAlign: 'center' } }, h('div', { style: { fontSize: '22px', fontWeight: '900' } }, won ? '優勝！おめでとう！' : run.finalOpp ? '準優勝！' : '準決勝で負けてしまった……'), won ? h('div', {}, `賞金 ${prize}コインを手に入れた！`) : h('div', {}, '参加費は戻らないけど、何度でも挑戦できるよ。'), h('div', { class: 'rates' }, `${CUPS[run.cup].name}：参加${game.d.cupPlays[run.cup] ?? 0}回・優勝${game.d.cupWins[run.cup] ?? 0}回`)),
        h('div', { style: { padding: '0 10px' } }, h('button', { class: 'btn primary wide', onclick: () => resolve() }, 'OK')),
      ),
    );
    showScreen(el);
    if (won) {
      sfx('fanfare');
      confetti();
    }
  });
  if (won) for (const p of checkPrizes(game.d)) await showGet(p, '特別な条件を達成して手に入れた！');
  save();
  back();
  if (firstWin) await scene(`${run.cup}_win`);
}
