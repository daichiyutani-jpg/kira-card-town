// 主人公（男の子・女の子）をえらぶカード。はじめからの画面と設定で使う。
import { h } from './app';
import { drawHero, HERO_LABEL, type HeroDir, type HeroKind } from './hero';

// 正面を長めに見せ、ときどき横を向く（後ろ姿は地図で見られる）
const SPIN: HeroDir[] = ['down', 'down', 'right', 'down', 'down', 'left'];

/** 動く見本の絵（その場で足ぶみし、ときどき向きを変える）。外れたら自動で止まる */
export function heroPreview(kind: HeroKind, size = 96): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = h('canvas', { class: 'hero-cv', width: String(size * dpr), height: String(size * 1.15 * dpr), style: { width: `${size}px`, height: `${size * 1.15}px` } }) as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  const t0 = performance.now();
  const tick = (now: number) => {
    if (!cv.isConnected && now - t0 > 500) return;
    const t = (now - t0) / 1000;
    const dir = SPIN[Math.floor(t / 1.2) % SPIN.length];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size * 1.15);
    drawHero(ctx, 0, size * 0.12, size, kind, dir, cv.classList.contains('walk') ? (t * 1.6) % 1 : 0);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return cv;
}

/** 男の子・女の子の2枚のカード。選ぶと onPick が呼ばれる */
export function heroPicker(initial: HeroKind, onPick: (k: HeroKind) => void): HTMLElement {
  let cur = initial;
  const opts = (['boy', 'girl'] as HeroKind[]).map((k) => {
    const cv = heroPreview(k);
    const b = h('button', { class: `hero-opt hero-${k}`, type: 'button', 'aria-pressed': String(k === cur), onclick: () => pick(k) }, cv, h('span', { class: 'hero-name' }, HERO_LABEL[k]));
    return { k, b, cv };
  });
  const pick = (k: HeroKind) => {
    cur = k;
    for (const o of opts) {
      o.b.classList.toggle('on', o.k === k);
      o.b.setAttribute('aria-pressed', String(o.k === k));
      o.cv.classList.toggle('walk', o.k === k);
    }
    onPick(k);
  };
  for (const o of opts) {
    o.b.classList.toggle('on', o.k === cur);
    o.cv.classList.toggle('walk', o.k === cur);
  }
  return h('div', { class: 'hero-pick' }, ...opts.map((o) => o.b));
}
