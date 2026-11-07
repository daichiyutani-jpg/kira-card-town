/**
 * 画面の背景の絵（public/art/bg/<名前>.webp）。
 * 文字やカードが読めるように、上から暗い色を重ねる。画像が読めない時は fallback の色だけになる。
 * パスは相対（GitHub Pages のサブフォルダでも動くように、インラインの style で指定する）。
 */
export type BgName = 'title' | 'street' | 'practice' | 'arena' | 'rooftop' | 'champion' | 'online' | 'shop' | 'fest' | 'cup' | 'reward';

/** 重ねる暗さ（0〜1）。対戦はカードが多いので濃いめ */
const SHADE: Record<BgName, [number, number]> = {
  title: [0.15, 0.55],
  street: [0.45, 0.6],
  practice: [0.45, 0.6],
  arena: [0.45, 0.6],
  rooftop: [0.45, 0.6],
  champion: [0.6, 0.72],
  online: [0.4, 0.55],
  shop: [0.35, 0.8],
  fest: [0.3, 0.75],
  cup: [0.3, 0.75],
  reward: [0.4, 0.8],
};

export function bgStyle(name: BgName, fallback = '#1b1446'): string {
  const [a, b] = SHADE[name];
  const shade = `linear-gradient(rgba(16,10,40,${a}), rgba(16,10,40,${b}))`;
  return `${shade}, url("art/bg/${name}.webp") center / cover no-repeat, ${fallback}`;
}

/** 要素に背景を付ける */
export function setBg(el: HTMLElement, name: BgName, fallback?: string): HTMLElement {
  el.style.background = bgStyle(name, fallback);
  return el;
}

/** 対戦相手ごとの背景 */
export function battleBg(oppId: string | undefined, bgm: string | undefined): BgName {
  if (oppId === 'rival') return 'rooftop';
  if (oppId === 'champion') return 'champion';
  return bgm === 'cup' ? 'arena' : 'street';
}
