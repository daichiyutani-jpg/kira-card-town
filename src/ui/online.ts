// 友達と対戦（オンライン）。招待URLをLINEなどで送り、相手から返事コードをもらってつなぐ。サーバーは使わない
import { APP_VERSION } from './title';
import { inviteUrl, readReply, REPLY_PREFIX } from '../net/protocol';
import { host, join, type Link } from '../net/rtc';
import { startSession } from '../net/session';
import { playBgm, sfx } from '../audio/sound';
import { confirmBox, game, h, save, showScreen, talk, titleBar, toast } from './app';
import { runBattle } from './battleView';
import { activeDeckOk } from './world';

export const PENDING_INVITE = 'kira-pending-invite';

function screen(title: string, back: () => void, ...body: (HTMLElement | null)[]) {
  const el = h('div', { class: 'screen', style: { background: 'var(--bg)' } }, titleBar(title, back), h('div', { class: 'scroll grow list' }, ...body.filter(Boolean) as HTMLElement[]));
  showScreen(el);
  return el;
}

function shareRow(text: string, label: string): HTMLElement {
  const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
  return h(
    'div',
    { class: 'row', style: { flexWrap: 'wrap' } },
    h('a', { class: 'btn primary grow', href: lineUrl, target: '_blank', rel: 'noopener', style: { background: '#06c755', textDecoration: 'none', textAlign: 'center' } }, `LINEで${label}`),
    'share' in navigator ? h('button', { class: 'btn grow', onclick: () => navigator.share({ text }).catch(() => {}) }, 'ほかのアプリで送る') : null,
    h('button', {
      class: 'btn grow',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast('コピーしました');
        } catch {
          toast('コピーできませんでした。下の文字を長押ししてコピーしてね', 2600);
        }
      },
    }, 'コピー'),
  );
}

const about = () =>
  h(
    'div',
    { class: 'panel', style: { fontSize: '13px', lineHeight: '1.6' } },
    h('b', {}, 'しくみ（お金はかかりません）'),
    h('div', {}, '・2台のスマホを直接つなぎます（WebRTC）。ゲームのサーバーはありません。'),
    h('div', {}, '・つなぐ道を探すために、Googleの無料の公開サーバー（STUN）にだけ問い合わせます。対戦の中身やセーブは送りません。'),
    h('div', {}, '・招待URLと返事コードには接続情報（IPアドレスなど）が入っています。対戦する友達にだけ送ってください。'),
    h('div', {}, '・ネットワークによってはつながらないことがあります（会社・学校のWi-Fiなど）。その時はモバイル回線やほかのWi-Fiで試してください。'),
    h('div', {}, '・オンライン対戦ではカードやコインは増えません（記録だけ残ります）。切断した対戦は記録しません。'),
  );

export function openOnline(back: () => void, invite?: string): void {
  if (!game.d.flags.starter || !activeDeckOk()) {
    void talk([{ s: '', t: 'オンライン対戦には、使えるデッキ（20枚）が必要です。ゲームを進めて、最初のデッキをもらってから遊んでね。' }]).then(back);
    return;
  }
  const pending = invite ?? sessionStorage.getItem(PENDING_INVITE) ?? undefined;
  if (pending) {
    sessionStorage.removeItem(PENDING_INVITE);
    return void guest(pending, back);
  }
  playBgm('shop');
  const st = game.d.stats;
  screen(
    '友達と対戦',
    back,
    h('div', { class: 'panel' }, h('div', { style: { fontWeight: '900', fontSize: '17px' } }, '👫 友達とオンライン対戦'), h('div', {}, `使うデッキ：${game.d.decks[game.d.activeDeck].name}`), h('div', { class: 'rates' }, `これまで：${st.online ?? 0}戦 ${st.onlineWins ?? 0}勝`)),
    h('button', { class: 'btn primary wide', onclick: () => void hostFlow(back) }, '部屋をつくって招待する'),
    h('div', { class: 'panel', style: { fontSize: '14px' } }, '招待された人は、届いたURLを開くだけでOK（このゲームを一度開いて、デッキを持っている必要があります）。'),
    about(),
  );
}

async function hostFlow(back: () => void) {
  screen('部屋をつくる', back, h('div', { class: 'panel' }, '招待URLを作っています…（数秒かかります）'));
  let room: Awaited<ReturnType<typeof host>>;
  try {
    room = await host();
  } catch (e) {
    toast(`作れませんでした：${(e as Error).message}`, 3000);
    return openOnline(back);
  }
  const url = inviteUrl(location.href, room.code);
  const msg = `キラカードタウンで対戦しよう！ このURLを開いてね（開いたら出てくる「返事コード」を送り返してね）\n${url}`;
  const ta = h('textarea', { placeholder: `${REPLY_PREFIX} で始まる返事コードを貼りつけ`, style: { width: '100%', height: '90px', borderRadius: '10px', padding: '8px', fontSize: '12px' } }) as HTMLTextAreaElement;
  const status = h('div', { class: 'rates' });
  const cancel = () => {
    room.cancel();
    openOnline(back);
  };
  screen(
    '部屋をつくる',
    cancel,
    h('div', { class: 'panel col' }, h('b', {}, '① 招待URLを友達に送る'), shareRow(msg, '招待を送る'), h('div', { style: { fontSize: '11px', wordBreak: 'break-all', color: 'var(--sub)', maxHeight: '60px', overflow: 'hidden' } }, url)),
    h('div', { class: 'panel col' }, h('b', {}, '② 友達から届いた返事コードを貼りつける'), ta, h('button', {
      class: 'btn primary wide',
      onclick: async () => {
        const code = readReply(ta.value);
        if (!code) return toast(`${REPLY_PREFIX} で始まるコードを貼りつけてね`, 2400);
        status.textContent = 'つないでいます…';
        try {
          const link = await room.accept(code);
          await play(link, true, back);
        } catch (e) {
          status.textContent = '';
          toast(`つながりませんでした：${(e as Error).message}`, 3200);
        }
      },
    }, 'つなぐ'), status),
    h('div', { class: 'panel', style: { fontSize: '13px' } }, 'この画面を開いたまま待ってね。ほかの画面へ行くと、招待は使えなくなります。'),
  );
}

async function guest(invite: string, back: () => void) {
  screen('招待された対戦', back, h('div', { class: 'panel' }, '招待を読みこんでいます…'));
  let j: Awaited<ReturnType<typeof join>>;
  try {
    j = await join(invite);
  } catch (e) {
    await talk([{ s: '', t: `招待URLを読みこめませんでした（${(e as Error).message}）。もう一度、新しい招待URLを送ってもらってね。` }]);
    return back();
  }
  const text = `${REPLY_PREFIX}${j.reply}`;
  const status = h('div', { class: 'rates' }, '返事コードを送ったら、この画面のまま待ってね。相手が貼りつけるとつながります。');
  screen(
    '招待された対戦',
    () => {
      j.cancel();
      back();
    },
    h('div', { class: 'panel col' }, h('b', {}, '返事コードを、招待してくれた友達に送り返そう'), shareRow(text, '返事を送る'), h('div', { style: { fontSize: '11px', wordBreak: 'break-all', color: 'var(--sub)', maxHeight: '60px', overflow: 'hidden' } }, text), status),
    about(),
  );
  try {
    const link = await j.ready;
    await play(link, false, back);
  } catch (e) {
    await talk([{ s: '', t: `つながりませんでした（${(e as Error).message}）。` }]);
    back();
  }
}

async function play(link: Link, isHost: boolean, back: () => void) {
  screen('対戦の準備', () => link.close(), h('div', { class: 'panel' }, 'つながりました！ 対戦の準備をしています…'));
  const deck = game.d.decks[game.d.activeDeck].cards;
  const m = await startSession(link, isHost, { name: game.d.name, deck, app: APP_VERSION });
  sfx('ok');
  const r = await runBattle({ setup: m.setup, me: m.me, remote: m.remote, oppTitle: 'オンライン', bgm: 'cup', bg: 'online', intro: `${m.oppName}と対戦！` });
  if (r.winner === 'lost') {
    await talk([{ s: '', t: '通信が切れたため、対戦を中止しました（この対戦は記録しません）。' }]);
    return back();
  }
  game.d.stats.online = (game.d.stats.online ?? 0) + 1;
  const won = r.winner === m.me;
  if (won) game.d.stats.onlineWins = (game.d.stats.onlineWins ?? 0) + 1;
  save();
  sfx(won ? 'win' : 'lose');
  await talk([{ s: '', t: r.winner === 'draw' ? '引き分け！' : won ? `${m.oppName}に勝った！` : `${m.oppName}に負けてしまった……` }]);
  if (await confirmBox('また対戦しますか？（もう一度、招待からやり直します）', '招待する', 'もどる')) return void hostFlow(back);
  back();
}
