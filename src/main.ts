// 起動：画面の準備・音の解除・Service Worker（オフライン用）・招待URLの受け取り
import './ui/style.css';
import { unlockAudio } from './audio/sound';
import { readInvite } from './net/protocol';
import { game, h, hasSave, loadGame, root } from './ui/app';
import { openOnline, PENDING_INVITE } from './ui/online';
import { applySettings } from './ui/settings';
import { openTitle } from './ui/title';
import { enterMap } from './ui/world';
import { openNature, openSorting } from './ui/jobs';
import { openChores } from './ui/chores';
import { openGacha, openKuji } from './ui/fest';
import { openCup } from './ui/cup';
import { openDex } from './ui/dex';
import { openDeckEditor, openDeckSwitch, openCollection, openDesk } from './ui/deck';
import { openSettings } from './ui/settings';
import { pickReward } from './ui/reward';
import { openCard } from './ui/cardView';
import { CARDS } from './engine/cards';
import { openShop, chooseStarter } from './ui/shop';
import { drawHero } from './ui/hero';
import { drawPersonSprite } from './ui/person';
import { personSpec } from './ui/people';
import { fightCpu } from './ui/battleFlow';

/** 自動テスト（?e2e がURLにある時だけ）用の入口。ふだんの遊びには関係しない */
if (new URLSearchParams(location.search).has('e2e'))
  (window as unknown as Record<string, unknown>).__kira = { game, enterMap, openSorting, openNature, openChores, openKuji, openGacha, openCup, openDex, openDeckEditor, openShop, fightCpu, drawHero, drawPersonSprite, personSpec, openDeckSwitch, openCollection, openDesk, openSettings, pickReward, chooseStarter, openOnline, openCard, CARDS };

function boot() {
  // スマホの「戻る」やピンチで画面がずれないように
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  const unlock = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);

  const invite = readInvite(location.hash);
  if (invite) {
    history.replaceState(null, '', location.pathname + location.search);
    if (hasSave() && loadGame()) {
      applySettings();
      if (game.d.flags.starter) return openOnline(openTitle, invite);
    }
    sessionStorage.setItem(PENDING_INVITE, invite);
    openTitle();
    root().append(h('div', { class: 'toast' }, '友達からの招待を受け取りました。最初のデッキをもらったら、メニューの「友達と対戦」から始まります'));
    return;
  }
  openTitle();
}

function registerSw() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  // 読みこみ直すのは「更新する」を押した時だけ（初めて開いた時にオフライン用の準備が終わっても、遊んでいる画面を消さない）
  let wantReload = false;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wantReload || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const offer = (w: ServiceWorker) => {
        const bar = h('div', { class: 'toast', style: { pointerEvents: 'auto', top: 'auto', bottom: 'calc(16px + var(--safe-b))' } }, '新しい版があります ', h('button', { class: 'btn small primary', onclick: () => ((wantReload = true), w.postMessage({ type: 'SKIP_WAITING' })) }, '更新する'));
        root().append(bar);
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
        });
      });
      setInterval(() => void reg.update().catch(() => {}), 30 * 60 * 1000);
    })
    .catch((e) => console.warn('Service Worker を登録できませんでした', e));
}

boot();
registerSw();
// ゲームを開いたままの画面で招待URLを開いた時（ページが読みこみ直されない）にも対応する
window.addEventListener('hashchange', () => {
  if (readInvite(location.hash)) boot();
});
