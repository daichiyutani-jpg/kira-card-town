// チュートリアル：ミドリ店長と練習バトル。山札の順番とサイコロの目を固定して、必ず同じ流れで覚えられるようにする
import { sfx } from '../audio/sound';
import { game, save, talk } from './app';
import { runBattle, type TutStep } from './battleView';

// 自分の山札（上から順に引く）。手札4枚：f01 f02 g01 i01 → 3ターン目 e05 → 5ターン目 f12
export const TUT_MY_DECK = ['f01', 'f02', 'g01', 'i01', 'e05', 'f12', 'f03', 'f04', 'f05', 'f06', 'f07', 'f08', 'a02', 'a03', 'a04', 'e01', 'e02', 'w03', 'g02', 'i02'];
export const TUT_OPP_DECK = ['a01', 'e04', 'w01', 'w02', 'e01', 'e02', 'e03', 'w03', 'e06', 'e08', 'e09', 'w08', 'w09', 'g05', 'g06', 'g14', 'g15', 'i02', 'i05', 'i06'];
// サイコロ：1回目の攻撃(4,3) 2回目の攻撃(4,2) 直接攻撃(3)
export const TUT_DICE = [4, 3, 4, 2, 3];
export const TUT_OPP_LP = 16;

const hand = (id: string) => `.hand [data-id=${id}]`;
const mine = (id: string) => `.lane.me .slot[data-id=${id}]`;
const foe = (id: string) => `.lane.opp .slot[data-id=${id}]`;

export const TUT_STEPS: TutStep[] = [
  { text: 'カードバトルへようこそ！ 相手のLP（ライフ）を0にしたら勝ち。今回は練習なので、相手のLPは16からスタートよ。', wait: 'next' },
  { text: '①カードの見かた：手札の「ヒノコリス」をタップしてみよう。', wait: { open: 'f01' }, hl: hand('f01'), pos: 'top' },
  { text: '左上の★がレベル、左下の赤い数字が攻撃力、右下の青い数字が守備力。マークは属性（🔥炎）。下の文が特殊な効果よ。見たら「召喚する」を押してね。', wait: { act: 'summon', id: 'f01' }, hint: '「召喚する」ボタンを押そう', pos: 'top' },
  { text: '②召喚できた！ 召喚は1ターンに1回。先攻の1ターン目は攻撃できないから、③「ターン終了」を押そう。', wait: { act: 'end' }, hl: '#bt-end', hint: '右下の「ターン終了」を押そう', pos: 'top' },
  { text: '相手はツムジリス（🌀風）を出してきた。④攻撃してみよう！ 自分のヒノコリスをタップ →「攻撃する」→ 相手のツムジリスをタップ。', wait: { act: 'attack', id: 'f01', target: 'a01' }, hl: `${mine('f01')}, ${foe('a01')}`, hint: 'ヒノコリス → 攻撃する → ツムジリス の順にタップ', pos: 'top' },
  { text: '⑤サイコロ：攻撃する側も守る側も1回ずつ振るよ。出目1は−1、2・3は±0、4・5は+1、6は+2。サイコロは少しだけ結果を変えるけど、それだけで勝負は決まらない。', wait: 'next', pos: 'top' },
  { text: '⑥属性：炎は風に強い！ 有利な属性で戦うと+2。表のように、炎→風→地→水→炎 の順に強く、光と闇はおたがいに強い（攻撃した側が+2）。', wait: 'next', chart: true, pos: 'top' },
  { text: '⑦魔法カード：「ファイアボール」を使ってみよう。相手に直接2ダメージ！ 魔法は1ターンに1回。', wait: { act: 'magic', id: 'g01' }, hl: hand('g01'), hint: '手札のファイアボール →「使う」', pos: 'top' },
  { text: '⑧アイテム：「どうのつるぎ」をヒノコリスに装備しよう。攻撃力が+2になる。アイテムも1ターンに1回。', wait: { act: 'item', id: 'i01' }, hl: hand('i01'), hint: 'どうのつるぎ →「使う」→ ヒノコリスをタップ', pos: 'top' },
  { text: '召喚はこのターンまだしていないね。「ホムラッコ」を召喚しよう。', wait: { act: 'summon', id: 'f02' }, hl: hand('f02'), hint: '手札のホムラッコ →「召喚する」', pos: 'top' },
  { text: '⑨特殊効果：ホムラッコは「召喚した時、相手に1ダメージ」。カードの文に書いてある効果は、自動で発動するよ。', wait: 'next', pos: 'top' },
  { text: 'このターンはここまで。「ターン終了」を押そう。', wait: { act: 'end' }, hl: '#bt-end', pos: 'top' },
  { text: '⑩生け贄召喚：レベル4の「ネツリュウ」は、場のモンスター1体を生け贄にして召喚する（レベル6以上は2体）。ネツリュウ →「召喚する」→ ホムラッコを選んで「生け贄にして召喚」。', wait: { act: 'summon', id: 'f12', tribute: 'f02' }, hl: hand('f12'), hint: 'ネツリュウ → 召喚する → ホムラッコをタップ → 生け贄にして召喚', pos: 'top' },
  { text: 'ネツリュウは召喚した時に2ダメージ！ 次はネツリュウで、相手のイワガニを攻撃しよう。', wait: { act: 'attack', id: 'f12', target: 'e04' }, hl: `${mine('f12')}, ${foe('e04')}`, hint: 'ネツリュウ → 攻撃する → イワガニ', pos: 'top' },
  { text: '相手の場にモンスターがいない時は、相手に直接攻撃できる！ ヒノコリスでとどめをさそう！', wait: { act: 'attack', id: 'f01', target: 'player' }, hl: mine('f01'), hint: 'ヒノコリス → 攻撃する', pos: 'top' },
];

export function runTutorial(done: () => void | Promise<void>): void {
  let ended = false;
  const finish = async (won: boolean) => {
    if (ended) return;
    ended = true;
    game.d.flags.tutorial = true;
    save();
    if (won) {
      sfx('win');
      await talk([{ s: 'ミドリ店長', t: 'おめでとう！ 完ぺきよ！ これでバトルの基本はバッチリね。' }, { s: 'ミドリ店長', t: 'くわしいルールは、バトル中に「？」ボタンでいつでも見られるわ。' }]);
    } else await talk([{ s: 'ミドリ店長', t: 'ルールはバトル中の「？」ボタンでいつでも見られるわ。わからなくなったら見てね。' }]);
    await done();
  };
  void runBattle({
    setup: { seed: 12345, decks: [TUT_MY_DECK, TUT_OPP_DECK], names: [game.d.name, 'ミドリ店長'], first: 0, lp: [20, TUT_OPP_LP], shuffle: false, forcedDice: [...TUT_DICE] },
    oppTitle: '練習',
    bg: 'practice',
    bgm: 'battle',
    canQuit: false,
    tutorial: {
      steps: TUT_STEPS,
      oppScript: { 2: ['summon:a01', 'end'], 4: ['summon:e04', 'end'] },
      onSkip: () => void finish(false),
      onRestart: () => {
        ended = true;
        runTutorial(done);
      },
    },
  }).then((r) => {
    if (!ended) void finish(r.winner === 0);
  });
}
