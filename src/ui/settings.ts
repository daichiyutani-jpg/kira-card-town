// 設定：BGM・効果音の音量とオン/オフ、演出の速さ、主人公の見た目、名前
import { playBgm, setVolumes, sfx } from '../audio/sound';
import { game, h, hasSave, save, showScreen, titleBar, toast } from './app';
import { HERO_LABEL } from './hero';
import { heroPicker } from './heroPick';
import { pager } from './pager';

export function applySettings(): void {
  setVolumes(game.d.settings);
}

export function openSettings(back: () => void): void {
  const st = game.d.settings;
  const el = h('div', { class: 'screen', style: { background: 'var(--bg)' } });
  const slider = (label: string, key: 'bgm' | 'se', onKey: 'bgmOn' | 'seOn') => {
    const r = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(st[key] * 100)), style: { width: '100%' } }) as HTMLInputElement;
    const val = h('span', {}, `${r.value}`);
    r.addEventListener('input', () => {
      st[key] = Number(r.value) / 100;
      val.textContent = r.value;
      applySettings();
    });
    r.addEventListener('change', () => {
      save();
      if (key === 'se') sfx('ok');
    });
    const chk = h('input', { type: 'checkbox', checked: st[onKey] }) as HTMLInputElement;
    chk.addEventListener('change', () => {
      st[onKey] = chk.checked;
      applySettings();
      save();
      if (onKey === 'bgmOn' && chk.checked) playBgm('town1', true);
    });
    return h('div', { class: 'panel col' }, h('label', { class: 'row', style: { justifyContent: 'space-between', fontWeight: '800' } }, h('span', {}, label), h('span', { class: 'row', style: { gap: '6px' } }, chk, 'オン')), h('div', { class: 'row' }, r, val));
  };
  const fast = h('input', { type: 'checkbox', checked: st.fastAnim }) as HTMLInputElement;
  fast.addEventListener('change', () => {
    st.fastAnim = fast.checked;
    save();
  });
  const name = h('input', { value: game.d.name, maxlength: '8', style: { minHeight: '44px', borderRadius: '10px', border: '2px solid #d8d0f0', padding: '4px 10px', font: 'inherit', flex: '1' } }) as HTMLInputElement;
  const pg = pager({ body: 'list' });
  el.append(titleBar('設定', back), pg.el);
  pg.set(
    [
      slider('🎵 BGM', 'bgm', 'bgmOn'),
      slider('🔔 効果音', 'se', 'seOn'),
      h('label', { class: 'panel row', style: { justifyContent: 'space-between', fontWeight: '800' } }, h('span', {}, '⚡ バトルの演出を短くする'), fast),
      hasSave()
        ? h('div', { class: 'panel col' }, h('b', {}, '🧒 主人公の見た目'), heroPicker(game.d.hero, (k) => {
            if (game.d.hero === k) return;
            game.d.hero = k;
            save();
            sfx('ok');
            toast(`${HERO_LABEL[k]}にしました`);
          }))
        : null,
      h('div', { class: 'panel col' }, h('b', {}, '名前（8文字まで）'), h('div', { class: 'row' }, name, h('button', {
        class: 'btn small primary',
        onclick: () => {
          const v = name.value.trim().slice(0, 8);
          if (!v) return toast('名前を入れてね');
          game.d.name = v;
          save();
          toast('名前を変えました');
        },
      }, '決定'))),
      h('div', { class: 'panel', style: { fontSize: '13px', lineHeight: '1.6' } }, 'セーブはこの端末のブラウザの中だけに保存されます（外へ送りません）。ブラウザのデータを消すと記録も消えるので、自分の部屋の机で「引き継ぎコード」を作っておくと安心です。', h('br'), 'お金は遊びの中のコインだけで、本物のお金を払う場所はありません。'),
    ].filter(Boolean) as HTMLElement[],
  );
  showScreen(el);
}
