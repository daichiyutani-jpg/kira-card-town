// タイトル画面：はじめから・つづきから・引き継ぎ・友達と対戦・設定
import { bgStyle } from './bg';
import pkg from '../../package.json';
import { newSave } from '../game/save';
import { playBgm, sfx } from '../audio/sound';
import { confirmBox, game, h, hasSave, loadGame, overlay, save, showScreen, toast } from './app';
import { miniCard } from './cardView';
import { showImport } from './deck';
import { enterMap } from './world';
import { applySettings, openSettings } from './settings';
import { openOnline } from './online';
import { HERO_DEFAULT_NAME, type HeroKind } from './hero';
import { heroPicker } from './heroPick';

export const APP_VERSION = pkg.version;

export function openTitle(): void {
  playBgm('title');
  const saved = hasSave() && loadGame();
  if (saved) applySettings();
  const cards = h('div', { class: 'title-cards' }, ...['f19', 'l18', 'w19', 'd18', 'a19'].map((id, i) => {
    const m = miniCard(id);
    m.style.left = `${i * 44}px`;
    m.style.transform = `rotate(${(i - 2) * 9}deg) translateY(${Math.abs(i - 2) * 8}px)`;
    m.style.zIndex = String(10 - Math.abs(i - 2));
    return m;
  }));
  const el = h(
    'div',
    { class: 'screen title', style: { background: bgStyle('title', '#1b1446') } },
    h('div', { class: 'logo' }, h('div', { class: 'k1' }, 'キラカード'), h('div', { class: 'k2' }, 'タウン')),
    cards,
    saved ? h('button', { class: 'btn primary', onclick: () => (sfx('ok'), enterMap()) }, `つづきから（${game.d.name}）`) : null,
    h('button', { class: `btn ${saved ? '' : 'primary'}`, onclick: () => void startNew(saved) }, 'はじめから'),
    h('button', { class: 'btn', onclick: () => (saved ? openOnline(openTitle) : toast('まずは「はじめから」で最初のデッキを手に入れよう', 2600)) }, '👫 友達と対戦'),
    h('div', { class: 'row', style: { width: '260px' } }, h('button', { class: 'btn small grow', onclick: () => void showImport(openTitle) }, '引き継ぎ'), h('button', { class: 'btn small grow', onclick: () => openSettings(openTitle) }, '設定')),
    game.note ? h('div', { class: 'panel', style: { maxWidth: '300px', fontSize: '13px' } }, game.note) : null,
    h('div', { class: 'version', id: 'ver' }, `ver ${APP_VERSION}${navigator.onLine ? '' : '・オフライン'}`),
  );
  showScreen(el);
}

async function startNew(saved: boolean) {
  if (saved && !(await confirmBox(`今の記録（${game.d.name}・コイン${game.d.money}・カード${Object.keys(game.d.dex).length}種）を消して、はじめから遊びますか？\n消した記録は元にもどせません。`, '消してはじめる', 'やめる'))) return;
  const who = await askHero();
  if (!who) return;
  const keepSettings = saved ? game.d.settings : undefined;
  game.d = newSave(who.name, who.hero);
  if (keepSettings) game.d.settings = keepSettings;
  save();
  sfx('ok');
  enterMap('home', { x: 3, y: 3, dir: 'down' });
}

/** 主人公（男の子・女の子）と名前をえらぶ */
function askHero(): Promise<{ name: string; hero: HeroKind } | null> {
  return new Promise((resolve) => {
    let hero: HeroKind = 'boy';
    let typed = false; // 自分で名前を打ったら、えらび直しても名前を変えない
    const input = h('input', { value: HERO_DEFAULT_NAME.boy, maxlength: '8', 'aria-label': 'きみの名前', style: { width: '100%', minHeight: '48px', fontSize: '20px', borderRadius: '12px', border: '2px solid #d8d0f0', padding: '4px 12px', font: 'inherit' } }) as HTMLInputElement;
    input.addEventListener('input', () => (typed = true));
    const picker = heroPicker(hero, (k) => {
      hero = k;
      sfx('tap');
      if (!typed) input.value = HERO_DEFAULT_NAME[k];
    });
    let done = false;
    const close = overlay(
      h('div', { class: 'modal col hero-modal' },
        h('h3', { style: { margin: 0 } }, '主人公をえらんでね'),
        picker,
        h('b', { style: { fontSize: '15px' } }, 'きみの名前は？（8文字まで）'),
        input,
        h('button', {
          class: 'btn primary wide',
          onclick: () => {
            const v = input.value.trim().slice(0, 8);
            if (!v) return toast('名前を入れてね');
            done = true;
            close();
            resolve({ name: v, hero });
          },
        }, 'けってい'),
        h('div', { class: 'muted', style: { fontSize: '12px' } }, '見た目はあとから「設定」で変えられます'),
      ),
      { onClose: () => !done && resolve(null) },
    );
  });
}
