// 街の中の出来事（話す・建物に入る・移動・ストーリー）をまとめる
import story from '../data/story.json';
import economy from '../data/economy.json';
import { CARD_LIST, deckProblems } from '../engine/cards';
import { addCard, OPPONENTS } from '../game/collection';
import { clockNow, fmtDate, isFestivalOpen, nextFestival, scheduleText } from '../game/festival';
import { CUPS, schoolEvent } from '../game/tournament';
import { playBgm, sfx } from '../audio/sound';
import { choose, game, save, talk, toast, type Line } from './app';
import { openField, todayStr, type FieldHandle, type Npc, type Target } from './field';
import { chooseStarter, openShop } from './shop';
import { openDesk, openCollection } from './deck';
import { openDex } from './dex';
import { openCup } from './cup';
import { openSorting, openNature, deliveryJob } from './jobs';
import { openChores } from './chores';
import { openGacha, openKuji } from './fest';
import { fightCpu } from './battleFlow';
import { openSettings } from './settings';
import { openOnline } from './online';
import { openTitle } from './title';
import { showGet } from './reward';

type TalkVariant = { when?: { flag?: string; notFlag?: string }; lines: Line[] };
const TALK = (story as unknown as { talk: Record<string, TalkVariant[]> }).talk;
const SCENES = (story as unknown as { scenes: Record<string, Line[]> }).scenes;
const CHAPTERS = (story as unknown as { chapters: { id: number; title: string; goal: string; done: string }[] }).chapters;

export function scene(id: string): Promise<void> {
  return talk(SCENES[id] ?? []);
}
export function talkLines(id: string): Line[] {
  const vs = TALK[id] ?? [];
  for (const v of vs) {
    if (v.when?.flag && !game.d.flags[v.when.flag]) continue;
    if (v.when?.notFlag && game.d.flags[v.when.notFlag]) continue;
    return v.lines;
  }
  return [];
}

export function currentChapter() {
  return CHAPTERS.find((c) => !game.d.flags[c.done]) ?? CHAPTERS[CHAPTERS.length - 1];
}

let field: FieldHandle | null = null;
let delivery: ReturnType<typeof deliveryJob> | null = null;

export function enterMap(mapId?: string, pos?: { x: number; y: number; dir?: string }): void {
  const id = mapId ?? game.d.pos.map;
  const start = pos ?? (mapId ? undefined : { x: game.d.pos.x, y: game.d.pos.y, dir: game.d.pos.dir });
  if (id === 'festival' && !isFestivalOpen(clockNow())) {
    toast('星まつりは終わりました。またね！', 2200);
    return enterMap('town1', { x: 21, y: 7, dir: 'down' });
  }
  field = openField(
    id,
    {
      onInteract: (t) => void onInteract(t),
      onStep: (x, y) => delivery?.step(x, y),
      overlayText: () => delivery?.text() ?? null,
      highlight: () => delivery?.target() ?? null,
      hiddenNpc: (n: Npc) => hideNpc(n),
      goal: () => (delivery ? '' : `🎯 ${currentChapter().goal}`),
    },
    start ? { x: start.x, y: start.y, dir: start.dir as 'up' } : undefined,
  );
  const p = field.pos();
  game.d.pos = { map: id, x: p.x, y: p.y, dir: p.dir };
  save();
  playBgm(field.map.bgm);
  void onEnter(id);
}

function hideNpc(n: Npc): boolean {
  void n;
  return false;
}

async function onEnter(id: string) {
  if (id === 'home' && !game.d.flags.intro) {
    field?.pause(true);
    game.d.flags.intro = true;
    save();
    await scene('intro');
    field?.pause(false);
  }
}

/** 会話や画面のあいだは歩けないようにする */
async function busy<T>(f: () => Promise<T>): Promise<T> {
  field?.pause(true);
  try {
    return await f();
  } finally {
    field?.pause(false);
  }
}

function needStarter(): boolean {
  if (game.d.flags.starter) return false;
  void talk([{ s: '', t: 'まずはカードショップで、最初のデッキをもらおう！（ひだまり町の右上の青い屋根）' }]);
  return true;
}

export function activeDeckOk(): boolean {
  const dk = game.d.decks[game.d.activeDeck];
  return !!dk && deckProblems(dk.cards).length === 0;
}

async function onInteract(t: Target) {
  if (t.kind === 'obj' && t.obj.id === '__menu') return busy(openMenu);
  const act = t.kind === 'npc' ? null : t.kind === 'obj' ? t.obj.act : t.b.act;
  if (t.kind === 'npc') return busy(() => talkNpc(t.npc));
  if (!act) return;
  // 配達中は、家の扉の前で荷物をわたす（中には入らない）
  if (delivery && t.kind === 'bld') {
    if (delivery.deliver(t.b.id)) return;
  }
  if (act.warp) {
    sfx('ok');
    return enterMap(act.warp, { x: act.tx ?? 0, y: act.ty ?? 0, dir: act.dir ?? 'down' });
  }
  if (act.talk) return busy(() => talk(talkLines(act.talk!)));
  if (act.desk) return openDesk(() => enterMap());
  if (act.shop) {
    if (act.shop === 'shop1' && !game.d.flags.starter) return busy(firstShop);
    if (needStarter()) return;
    return openShop(act.shop, () => enterMap());
  }
  if (act.cup) {
    if (needStarter()) return;
    if (act.cup === 'cup1' && game.d.flags.rival) {
      const c = await busy(() => choose('どうする？', [{ label: game.d.flags.champion ? 'チャンピオン・レイと再戦する' : 'チャンピオン戦に挑む！', value: 'champ', cls: 'primary' }, { label: `${CUPS.cup1.name}に参加する`, value: 'cup' }, { label: 'やめる', value: 'no', cls: 'gray' }]));
      if (c === 'champ') return championBattle();
      if (c !== 'cup') return;
    }
    return openCup(act.cup, () => enterMap());
  }
  if (act.job) {
    if (needStarter()) return;
    if (act.job === 'delivery') return busy(startDelivery);
    if (act.job === 'sorting') return openSorting(() => enterMap());
    if (act.job === 'nature') return openNature(() => enterMap());
  }
  if (act.travel) return busy(travel);
  if (act.forage) return busy(() => forage(act.forage!));
  if (act.kuji) return openKuji(() => enterMap());
  if (act.gacha) return openGacha(() => enterMap());
  if (act.schoolBoard) return busy(() => talk([{ s: '掲示板', t: schoolEvent(clockNow()).text }, { s: '掲示板', t: '学園の生徒8人全員に勝つと、特別なカードがもらえるらしい……' }]));
  if (act.rooftop) return busy(rooftop);
}

async function talkNpc(n: Npc) {
  if (n.id === 'mom') {
    await talk(talkLines('mom'));
    if (!game.d.flags.starter) return;
    const c = await choose('お手伝いする？', [{ label: 'お手伝いする', value: 'yes', cls: 'primary' }, { label: 'またあとで', value: 'no', cls: 'gray' }], 'お母さん');
    if (c === 'yes') openChores(() => enterMap());
    return;
  }
  if (n.opp) {
    const o = OPPONENTS[n.opp];
    const isStudent = n.opp.startsWith('s');
    const ev = schoolEvent(clockNow());
    const bonus = isStudent && ev.student === n.opp ? 2 : 1;
    const beaten = game.d.beaten[n.opp] ?? 0;
    const c = await choose({ s: o.name, t: `${o.talk.hi}${beaten ? `（勝った回数：${beaten}）` : ''}\n勝つとコイン${o.reward * bonus}${bonus > 1 ? '（今日は2倍！）' : ''}と、デッキのカードを1枚もらえるよ。` }, [{ label: '対戦する！', value: 'fight', cls: 'primary' }, { label: 'デッキを見る', value: 'see' }, { label: 'やめる', value: 'no', cls: 'gray' }]);
    if (c === 'see') {
      openCollection(o.deck, `${o.name}のデッキ`, () => enterMap(), true);
      return;
    }
    if (c !== 'fight') return;
    if (!activeDeckOk()) return talk([{ s: '', t: '使えるデッキがありません。自分の部屋の机でデッキを20枚にしよう。' }]);
    fightCpu(n.opp, { money: o.reward * bonus, bgm: 'battle', back: () => enterMap() });
    return;
  }
  if (n.talk) await talk(talkLines(n.talk));
}

async function firstShop() {
  await scene('shop_first');
  const kind = await chooseStarter(true);
  if (!kind) {
    await talk([{ s: 'ミドリ店長', t: 'ゆっくり選んでね。決まったらまた来て！' }]);
    return enterMap();
  }
  game.d.flags.starter = true;
  save();
  await scene('after_starter');
  const { runTutorial } = await import('./tutorial');
  runTutorial(async () => {
    enterMap('town1', { x: 16, y: 6, dir: 'down' });
    await busy(() => scene('after_tutorial'));
  });
}

async function startDelivery() {
  const job = economy.jobs.delivery;
  const c = await choose({ s: '配達のおじさん', t: `${job.name}：${job.time}秒以内に、光っている家まで荷物を${job.count}つ届けよう。早いほどお給料アップ！（${job.base}〜${job.max}コイン）` }, [{ label: 'はじめる！', value: 'go', cls: 'primary' }, { label: 'やめる', value: 'no', cls: 'gray' }]);
  if (c !== 'go') return;
  delivery = deliveryJob(async (result) => {
    delivery = null;
    field?.pause(true);
    await result();
    field?.pause(false);
  });
}

async function travel() {
  const d = game.d;
  const fest = nextFestival(clockNow());
  const opts = [
    { label: '🏠 ひだまり町', value: 'town1', ok: true },
    { label: '🛍 にぎわい通り', value: 'town2', ok: !!d.flags.cup1 },
    { label: '🌳 みどりの森町', value: 'town3', ok: !!d.flags.cup2 },
    { label: '🏫 キラ星学園', value: 'school', ok: !!d.flags.starter },
    { label: fest.open ? '🏮 星まつり（開催中！）' : '🏮 星まつり（開催時間外）', value: 'festival', ok: fest.open && !!d.flags.starter },
  ];
  const cur = field?.mapId;
  const c = await choose(
    `どこへ行く？\n星まつり：${scheduleText()}　${fest.open ? `今夜は${fmtDate(fest.at)}まで` : `次は ${fmtDate(fest.at)}`}`,
    [...opts.filter((o) => o.value !== cur).map((o) => ({ label: o.ok ? o.label : `🔒 ${o.label.slice(2)}`, value: o.value, disabled: !o.ok })), { label: 'やめる', value: 'no', cls: 'gray' }],
    'バス停',
  );
  if (!c || c === 'no') return;
  const dest: Record<string, { x: number; y: number }> = { town1: { x: 21, y: 7 }, town2: { x: 14, y: 11 }, town3: { x: 8, y: 10 }, school: { x: 10, y: 15 }, festival: { x: 10, y: 15 } };
  sfx('ok');
  enterMap(c, { ...dest[c], dir: 'down' });
}

async function forage(spot: string) {
  const today = todayStr(clockNow());
  if (game.d.forage[spot] === today) return talk([{ s: '', t: '今日はもう何も見つからなさそう。また明日来てみよう。' }]);
  game.d.forage[spot] = today;
  const f = economy.forage;
  if (Math.random() < f.cardChance) {
    const pool = CARD_LIST.filter((c) => f.cardRarity.includes(c.r) && c.get.includes('pack1') && ['earth', 'wind', 'water'].includes(c.el));
    const c = pool[Math.floor(Math.random() * pool.length)];
    addCard(game.d, c.id);
    save();
    sfx('get');
    await talk([{ s: '', t: `草むらの中にカードが落ちていた！「${c.name}」を手に入れた！` }]);
  } else {
    const coin = Math.floor(f.coinMin + Math.random() * (f.coinMax - f.coinMin));
    game.d.money += coin;
    save();
    sfx('coin');
    await talk([{ s: '', t: `キラキラ光るどんぐりを見つけた！ 案内人さんが${coin}コインと交換してくれた。` }]);
  }
}

async function rooftop() {
  if (!game.d.flags.cup3) return talk([{ s: '', t: '屋上への扉にはカギがかかっている。「3つの大会の優勝者のみ」と書いてある。' }]);
  const first = !game.d.flags.rival;
  if (first) await scene('rooftop_before');
  const c = await choose({ s: 'ソウタ', t: first ? '準備はいい？' : 'また勝負するかい？' }, [{ label: '対戦する！', value: 'go', cls: 'primary' }, { label: 'あとで', value: 'no', cls: 'gray' }]);
  if (c !== 'go') return;
  if (!activeDeckOk()) return talk([{ s: '', t: '使えるデッキがありません。机でデッキを20枚にしよう。' }]);
  fightCpu('rival', {
    money: first ? OPPONENTS.rival.reward : 300,
    bgm: 'cup',
    back: () => enterMap('school', { x: 19, y: 13, dir: 'down' }),
    onWin: async () => {
      if (!game.d.flags.rival) {
        game.d.flags.rival = true;
        save();
        await scene('rival_win');
      }
    },
  });
}

async function championBattle() {
  if (!activeDeckOk()) return talk([{ s: '', t: '使えるデッキがありません。机でデッキを20枚にしよう。' }]);
  const first = !game.d.flags.champion;
  if (first) await busy(() => scene('champion_before'));
  fightCpu('champion', {
    money: first ? OPPONENTS.champion.reward : 800,
    bgm: 'cup',
    back: () => enterMap('town1', { x: 4, y: 14, dir: 'down' }),
    onWin: async () => {
      if (!game.d.flags.champion) {
        game.d.flags.champion = true;
        addCard(game.d, 'pr1');
        save();
        await scene('ending');
        await showGet('pr1', 'ストーリークリアの証！');
      }
    },
  });
}

async function openMenu() {
  const ch = currentChapter();
  const c = await choose(
    `第${ch.id}章「${ch.title}」\n🎯 ${ch.goal}\n図鑑 ${Object.keys(game.d.dex).length}/${CARD_LIST.length}　優勝 ${Object.values(game.d.cupWins).reduce((a, b) => a + b, 0)}回`,
    [
      { label: '🃏 もっているカード', value: 'cards' },
      { label: '📖 カード図鑑', value: 'dex' },
      { label: '👫 友達と対戦（オンライン）', value: 'online' },
      { label: '⚙ 設定', value: 'settings' },
      { label: '💾 セーブしてタイトルへ', value: 'title' },
      { label: 'とじる', value: 'close', cls: 'gray' },
    ],
    'メニュー',
  );
  if (c === 'cards') openCollection(null, 'もっているカード', () => enterMap());
  else if (c === 'dex') openDex(() => enterMap());
  else if (c === 'settings') openSettings(() => enterMap());
  else if (c === 'online') openOnline(() => enterMap());
  else if (c === 'title') {
    save();
    openTitle();
  }
}
