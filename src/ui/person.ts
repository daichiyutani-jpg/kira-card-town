/**
 * 人の絵（主人公も町の人も同じしくみ）。32×32 の方眼で設計し、マスの大きさ s に合わせて拡大する。
 * 正面（down）・後ろ（up）・右向き（right）を描き、左向きは右向きを左右反転する。
 * 頭まわり（髪・顔・帽子）は「頭の中心を原点・半径8」の座標で描き、子どもと大人で頭の大きさを変える。
 */
export type PDir = 'up' | 'down' | 'left' | 'right';
export type HairStyle = 'spiky' | 'short' | 'slick' | 'bob' | 'long' | 'twin' | 'pony' | 'bun' | 'bald';
export type HatType = 'cap' | 'hachi' | 'wide' | 'helmet' | 'bandana';

export interface PersonSpec {
  skin: string;
  hair: string;
  top: string; // 上着・シャツの色
  bottom: string; // ズボン・スカート・はかまの色
  shoe?: string;
  age?: 'kid' | 'adult' | 'elder';
  big?: boolean; // がっしりした体
  fem?: boolean; // まつげ
  hairStyle?: HairStyle;
  ribbon?: string; // 髪のリボン
  hairpin?: string; // 星の髪どめ
  hat?: { type: HatType; color: string; star?: boolean };
  inner?: string; // 前あきの上着の中のシャツ
  tie?: string;
  collar?: string; // セーラーえり
  star?: string; // 胸の星
  apron?: string;
  bottomType?: 'shorts' | 'pants' | 'skirt' | 'long';
  socks?: string;
  obi?: string; // 帯・ベルト
  glasses?: 'round' | 'sun';
  mustache?: boolean;
  beard?: boolean;
  beardColor?: string;
  cardcase?: boolean;
}

const LINE = 'rgba(40,24,48,.9)';

interface Metrics {
  hy: number; // 頭の中心の高さ
  hr: number; // 頭の半径
  ty: number; // 体の上
  th: number; // 体の高さ
  tw: number; // 体の幅
  ly: number; // 脚の上
  ll: number; // 脚の長さ
  aT: number; // 腕の上
  aL: number; // 腕の長さ
}
function metrics(p: PersonSpec): Metrics {
  const m: Metrics = p.age === 'adult' || p.age === 'elder' ? { hy: 7.6, hr: 6.8, ty: 12.8, th: 9, tw: 12, ly: 21.6, ll: 6.9, aT: 13.6, aL: 8 } : { hy: 9.5, hr: 8, ty: 14.5, th: 7.5, tw: 12, ly: 23, ll: 5.5, aT: 15.5, aL: 6.5 };
  if (p.big) m.tw += 3;
  return m;
}

export function shade(hex: string, k: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

type C = CanvasRenderingContext2D;
function shape(ctx: C, fill: string, path: () => void, stroke = true) {
  ctx.beginPath();
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) ctx.stroke();
}
const rr = (ctx: C, x: number, y: number, w: number, h: number, r: number) => () => ctx.roundRect(x, y, w, h, r);
const circ = (ctx: C, x: number, y: number, r: number) => () => ctx.arc(x, y, r, 0, Math.PI * 2);
const ell = (ctx: C, x: number, y: number, rx: number, ry: number, a = 0) => () => ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
function poly(ctx: C, pts: number[]) {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
export function star(ctx: C, cx: number, cy: number, r: number, fill: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** 人を描く。(x, y) はマスの左上、s はマスの大きさ。step は歩きの位相（0〜1、止まっている時は 0） */
export function drawPersonSprite(ctx: C, x: number, y: number, s: number, p: PersonSpec, dir: PDir, step: number, marker = false): void {
  const u = s / 32;
  const bob = step ? Math.abs(Math.sin(step * Math.PI * 2)) * 1.2 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(u, u);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(16, 30.3, p.big ? 10 : 8.5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -bob);
  if (dir === 'left') {
    ctx.translate(32, 0);
    ctx.scale(-1, 1);
  }
  const sw = step ? Math.sin(step * Math.PI * 2) : 0;
  ctx.lineWidth = 1.1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LINE;
  const m = metrics(p);
  if (dir === 'down' || dir === 'up') front(ctx, p, m, dir === 'up', sw);
  else side(ctx, p, m, sw);
  ctx.restore();
  if (marker) {
    ctx.fillStyle = '#ffd23b';
    ctx.strokeStyle = 'rgba(80,50,0,.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const mx = x + s / 2;
    const my = y - u * 2 - bob * u + Math.sin(Date.now() / 250) * u;
    ctx.moveTo(mx, my);
    ctx.lineTo(mx - u * 3, my - u * 4);
    ctx.lineTo(mx + u * 3, my - u * 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** 頭の座標へ（中心を原点・半径8）。終わったら restore */
function headSpace(ctx: C, cx: number, m: Metrics) {
  ctx.save();
  ctx.translate(cx, m.hy);
  const k = m.hr / 8;
  ctx.scale(k, k);
  ctx.lineWidth = 1.1 / k;
}

function legColor(p: PersonSpec, bt: string): string {
  if (bt === 'pants') return p.bottom;
  return p.socks ?? p.skin;
}

// ---------------------------------------------------------------- 正面・後ろ
function front(ctx: C, p: PersonSpec, m: Metrics, back: boolean, sw: number) {
  const bt = p.bottomType ?? 'pants';
  const hs = p.hairStyle ?? 'short';
  const x0 = 16 - m.tw / 2;
  const hip = m.ty + m.th - 1.5;
  const shoe = p.shoe ?? '#5a4636';
  // 正面で体の後ろにくる長い髪
  if (!back && hs === 'long') {
    headSpace(ctx, 16, m);
    shape(ctx, p.hair, rr(ctx, -8.8, -2, 17.6, 15, 4));
    ctx.restore();
  }
  if (back && hs === 'twin') {
    headSpace(ctx, 16, m);
    tails(ctx, p);
    ctx.restore();
  }
  // 脚と靴
  const l = sw * 1.5;
  if (bt === 'long') {
    shape(ctx, shoe, ell(ctx, 13.8, 28.8 - l * 0.4, 2.6, 1.5));
    shape(ctx, shoe, ell(ctx, 18.2, 28.8 + l * 0.4, 2.6, 1.5));
  } else {
    const lc = legColor(p, bt);
    shape(ctx, lc, rr(ctx, 12.4, m.ly - l, 3, m.ll, 1));
    shape(ctx, lc, rr(ctx, 16.6, m.ly + l, 3, m.ll, 1));
    if (bt === 'shorts' && !p.socks) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(12.4, m.ly + m.ll - 2.5 - l, 3, 2);
      ctx.fillRect(16.6, m.ly + m.ll - 2.5 + l, 3, 2);
    }
    shape(ctx, shoe, ell(ctx, 13.8, 28.8 - l, 2.6, 1.6));
    shape(ctx, shoe, ell(ctx, 18.2, 28.8 + l, 2.6, 1.6));
  }
  // 腕
  const a = sw * 1.6;
  const ax1 = x0 - 2.4;
  const ax2 = x0 + m.tw - 0.8;
  shape(ctx, p.top, rr(ctx, ax1, m.aT + a, 3.2, m.aL, 1.5));
  shape(ctx, p.top, rr(ctx, ax2, m.aT - a, 3.2, m.aL, 1.5));
  shape(ctx, p.skin, circ(ctx, ax1 + 1.6, m.aT + m.aL + 0.6 + a, 1.6));
  shape(ctx, p.skin, circ(ctx, ax2 + 1.6, m.aT + m.aL + 0.6 - a, 1.6));
  // 下
  bottomFront(ctx, p, bt, x0, m.tw, hip);
  // 体
  shape(ctx, p.top, rr(ctx, x0, m.ty, m.tw, m.th, 3));
  if (!back) {
    if (p.inner) {
      shape(ctx, p.inner, () => poly(ctx, [14, m.ty + 0.5, 18, m.ty + 0.5, 17.3, m.ty + m.th - 0.2, 14.7, m.ty + m.th - 0.2]), false);
    }
    if (p.tie) shape(ctx, p.tie, () => poly(ctx, [15.2, m.ty + 0.6, 16.8, m.ty + 0.6, 16.4, m.ty + 1.6, 17, m.ty + 5, 16, m.ty + 6, 15, m.ty + 5, 15.6, m.ty + 1.6]));
    if (p.star) star(ctx, 16, m.ty + 3.5, 1.6, p.star);
    if (p.collar) shape(ctx, p.collar, () => poly(ctx, [12, m.ty + 0.3, 16, m.ty + 3, 20, m.ty + 0.3, 18.5, m.ty, 16, m.ty + 1.5, 13.5, m.ty]));
    if (p.apron) {
      // 胸当て＋ひもの細いエプロン（下は腰から広がる）
      const bw = Math.min(6, m.tw - 6);
      shape(ctx, p.apron, () => {
        ctx.moveTo(16 - bw / 2, m.ty + 2.6);
        ctx.lineTo(16 + bw / 2, m.ty + 2.6);
        ctx.lineTo(16 + bw / 2, hip - 0.6);
        ctx.lineTo(x0 + m.tw - 1.4, hip - 0.6);
        ctx.lineTo(x0 + m.tw - 1, hip + 5);
        ctx.lineTo(x0 + 1, hip + 5);
        ctx.lineTo(x0 + 1.4, hip - 0.6);
        ctx.lineTo(16 - bw / 2, hip - 0.6);
        ctx.closePath();
      });
      ctx.strokeStyle = p.apron;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(16 - bw / 2 + 0.4, m.ty + 2.8);
      ctx.lineTo(16 - bw / 2 - 1, m.ty + 0.3);
      ctx.moveTo(16 + bw / 2 - 0.4, m.ty + 2.8);
      ctx.lineTo(16 + bw / 2 + 1, m.ty + 0.3);
      ctx.stroke();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.strokeRect(16 - 1.6, hip + 1, 3.2, 2.2);
      ctx.strokeStyle = LINE;
    }
  } else {
    ctx.fillStyle = shade(p.top, -0.18);
    ctx.fillRect(x0 + 1, hip - 1, m.tw - 2, 1.6);
    if (p.apron) {
      shape(ctx, p.apron, ell(ctx, 14.6, hip - 0.4, 1.6, 1));
      shape(ctx, p.apron, ell(ctx, 17.4, hip - 0.4, 1.6, 1));
    }
  }
  if (p.obi) {
    ctx.fillStyle = p.obi;
    ctx.fillRect(x0 + 0.6, hip - 1.6, m.tw - 1.2, 2.2);
  }
  if (p.cardcase) {
    shape(ctx, '#ffcc33', rr(ctx, back ? x0 - 0.8 : x0 + m.tw - 2.4, hip - 0.7, 3.4, 4, 0.8));
    star(ctx, back ? x0 + 0.9 : x0 + m.tw - 0.7, hip + 1.3, 1, '#ff7a3c');
  }
  // 頭
  headSpace(ctx, 16, m);
  if (back) headBack(ctx, p, hs);
  else headFront(ctx, p, hs);
  ctx.restore();
}

function bottomFront(ctx: C, p: PersonSpec, bt: string, x0: number, tw: number, hip: number) {
  const adult = p.age === 'adult' || p.age === 'elder';
  if (bt === 'skirt') {
    const len = adult ? 6.5 : 5;
    shape(ctx, p.bottom, () => poly(ctx, [x0 + 1, hip, x0 + tw - 1, hip, x0 + tw + 1, hip + len, x0 - 1, hip + len]));
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    for (const px of [-3.5, 0, 3.5]) {
      ctx.beginPath();
      ctx.moveTo(16 + px, hip + 0.5);
      ctx.lineTo(16 + px * 1.3, hip + len - 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = LINE;
  } else if (bt === 'long') {
    shape(ctx, p.bottom, () => poly(ctx, [x0 + 0.5, hip - 1, x0 + tw - 0.5, hip - 1, x0 + tw + 1, 28, x0 - 1, 28]));
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.moveTo(16, hip + 1);
    ctx.lineTo(16, 27.6);
    ctx.stroke();
    ctx.strokeStyle = LINE;
  } else if (bt === 'shorts') shape(ctx, p.bottom, rr(ctx, x0 + 1, hip, tw - 2, 4.5, 1.5));
  else shape(ctx, p.bottom, rr(ctx, x0 + 1, hip, tw - 2, 3.6, 1.5));
}

function tails(ctx: C, p: PersonSpec) {
  for (const sx of [-1, 1]) {
    shape(ctx, p.hair, () => {
      ctx.moveTo(sx * 6.5, -3.5);
      ctx.quadraticCurveTo(sx * 14, -0.5, sx * 11.5, 8.5);
      ctx.quadraticCurveTo(sx * 10, 4.5, sx * 6, 1.5);
      ctx.closePath();
    });
    if (p.ribbon) {
      shape(ctx, p.ribbon, ell(ctx, sx * 8, -4, 2.4, 1.6, sx * 0.5));
      shape(ctx, p.ribbon, ell(ctx, sx * 10.4, -4.9, 2.4, 1.6, -sx * 0.5));
    }
  }
}

/** 女の子の前髪（横の髪の長さ sideY） */
function bangs(ctx: C, hair: string, sideY: number) {
  shape(ctx, hair, () => {
    ctx.arc(0, -0.5, 8.6, Math.PI * 1.02, Math.PI * 1.98);
    ctx.lineTo(7.8, sideY);
    ctx.lineTo(6.2, sideY + 0.5);
    ctx.lineTo(5.4, -0.9);
    ctx.lineTo(3.5, -0.1);
    ctx.lineTo(2, -1.9);
    ctx.lineTo(0, -0.5);
    ctx.lineTo(-2, -1.9);
    ctx.lineTo(-3.5, -0.1);
    ctx.lineTo(-5.4, -0.9);
    ctx.lineTo(-6.2, sideY + 0.5);
    ctx.lineTo(-7.8, sideY);
    ctx.closePath();
  });
}

function hairHi(ctx: C, p: PersonSpec, x: number, y: number) {
  ctx.fillStyle = shade(p.hair, 0.28);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.ellipse(x, y, 2.8, 1.1, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function headFront(ctx: C, p: PersonSpec, hs: HairStyle) {
  const elder = p.age === 'elder';
  if (hs === 'pony') {
    shape(ctx, p.hair, () => {
      ctx.moveTo(3, -7);
      ctx.quadraticCurveTo(12.5, -6, 10.5, 6);
      ctx.quadraticCurveTo(8.5, 0, 4, -3);
      ctx.closePath();
    });
  }
  if (hs === 'bun') shape(ctx, p.hair, circ(ctx, 0, -8.4, 3.6));
  // 顔
  shape(ctx, p.skin, circ(ctx, 0, 0, 8));
  ctx.fillStyle = 'rgba(255,120,130,.45)';
  ctx.beginPath();
  ctx.ellipse(-4.8, 3.1, 1.6, 1, 0, 0, Math.PI * 2);
  ctx.ellipse(4.8, 3.1, 1.6, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const ex of [-3.2, 3.2]) {
    if (elder) {
      ctx.strokeStyle = '#2a1c3a';
      ctx.beginPath();
      ctx.arc(ex, 1.6, 1.3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.strokeStyle = LINE;
      continue;
    }
    ctx.fillStyle = '#2a1c3a';
    ctx.beginPath();
    ctx.ellipse(ex, 1.1, 1.35, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + 0.4, 0.4, 0.55, 0, Math.PI * 2);
    ctx.fill();
    if (p.fem) {
      ctx.beginPath();
      ctx.moveTo(ex - 1.6, -0.5);
      ctx.lineTo(ex + 1.3, -0.9);
      ctx.stroke();
    }
  }
  if (p.beard) {
    shape(ctx, p.beardColor ?? p.hair, () => {
      ctx.moveTo(-6.4, 2);
      ctx.quadraticCurveTo(0, 13, 6.4, 2);
      ctx.quadraticCurveTo(0, 6.5, -6.4, 2);
      ctx.closePath();
    });
  }
  if (p.mustache) {
    shape(ctx, p.beardColor ?? p.hair, () => {
      ctx.ellipse(-1.5, 3.2, 1.8, 0.9, 0.25, 0, Math.PI * 2);
      ctx.moveTo(3.3, 3.2);
      ctx.ellipse(1.5, 3.2, 1.8, 0.9, -0.25, 0, Math.PI * 2);
    }, false);
  } else if (!p.beard) {
    ctx.strokeStyle = '#8a3a3a';
    ctx.beginPath();
    ctx.arc(0, 3.6, 1.2, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.strokeStyle = LINE;
  }
  if (p.glasses === 'round') {
    ctx.strokeStyle = '#3a2a3a';
    ctx.beginPath();
    ctx.arc(-3.2, 1.1, 2.3, 0, Math.PI * 2);
    ctx.moveTo(5.5, 1.1);
    ctx.arc(3.2, 1.1, 2.3, 0, Math.PI * 2);
    ctx.moveTo(-0.9, 0.8);
    ctx.lineTo(0.9, 0.8);
    ctx.stroke();
    ctx.strokeStyle = LINE;
  } else if (p.glasses === 'sun') {
    shape(ctx, '#1a1a24', () => {
      ctx.roundRect(-6, -0.3, 5, 3, 1.2);
      ctx.roundRect(1, -0.3, 5, 3, 1.2);
    });
    ctx.fillRect(-1.2, 0.3, 2.4, 0.8);
  }
  // 髪
  switch (hs) {
    case 'spiky':
      if (covered(p)) {
        shape(ctx, p.hair, () => poly(ctx, [-8.4, 0.5, -7, -4.5, 7, -4.5, 8.4, 0.5, 6, -1.3, 4.5, 0.5, 3, -1.7, 0.8, 0.1, -1, -1.9, -3, 0.1, -4.5, -1.7, -6, 0.5]));
        break;
      }
      shape(ctx, p.hair, () => poly(ctx, [-8.4, 1, -9.6, -3.5, -7.6, -5, -8.6, -8.4, -4.8, -7.6, -4, -10.6, -1, -8.4, 1.5, -11, 3.2, -8.2, 6.8, -9.6, 6.6, -6.4, 9.8, -5.6, 8.2, -2.6, 9.4, 1, 6, -1.3, 4.5, 0.5, 3, -1.7, 0.8, 0.1, -1, -1.9, -3, 0.1, -4.5, -1.7, -6, 0.5]));
      hairHi(ctx, p, -2.5, -6.5);
      break;
    case 'short':
      shape(ctx, p.hair, () => {
        ctx.arc(0, -0.6, 8.5, Math.PI, 0);
        poly2(ctx, [8.6, 1.6, 7, 1.6, 6, -2.2, 3, -1.2, 0, -2.4, -3, -1.2, -6, -2.2, -7, 1.6, -8.6, 1.6]);
      });
      hairHi(ctx, p, -3, -5.5);
      break;
    case 'slick':
      shape(ctx, p.hair, () => {
        ctx.arc(0, -0.6, 8.5, Math.PI, 0);
        poly2(ctx, [8.6, 1, 7, 0.6, 5.5, -3.6, -3, -3.4, -6.6, -1.6, -7.2, 1, -8.6, 1]);
      });
      hairHi(ctx, p, -2, -6);
      break;
    case 'bob':
      shape(ctx, p.hair, () => {
        ctx.arc(0, -0.5, 8.8, Math.PI, 0);
        poly2(ctx, [9, 5.5, 6.6, 5.5, 6.4, -1.4, -6.4, -1.4, -6.6, 5.5, -9, 5.5]);
      });
      hairHi(ctx, p, -3, -5.5);
      break;
    case 'long':
      bangs(ctx, p.hair, 9);
      hairHi(ctx, p, -3.5, -5.7);
      break;
    case 'twin':
      bangs(ctx, p.hair, 3.5);
      hairHi(ctx, p, -3.5, -5.7);
      tails(ctx, p);
      break;
    case 'pony':
      bangs(ctx, p.hair, 3.5);
      hairHi(ctx, p, -3.5, -5.7);
      if (p.ribbon) shape(ctx, p.ribbon, ell(ctx, 6.4, -6.6, 2.2, 1.5, 0.6));
      break;
    case 'bun':
      shape(ctx, p.hair, () => {
        ctx.arc(0, -0.5, 8.5, Math.PI, 0);
        poly2(ctx, [8.6, 2, 7.2, 2, 6.4, -2.8, 0, -3.6, -6.4, -2.8, -7.2, 2, -8.6, 2]);
      });
      hairHi(ctx, p, -3, -5.5);
      break;
    case 'bald':
      shape(ctx, p.hair, ell(ctx, -7.6, 0.4, 1.8, 3));
      shape(ctx, p.hair, ell(ctx, 7.6, 0.4, 1.8, 3));
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath();
      ctx.ellipse(-2.5, -5.5, 2.4, 1, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  if (p.hairpin) star(ctx, 4.5, -4.7, 1.8, p.hairpin);
  hat(ctx, p, 'front');
}

/** 帽子で頭のてっぺんがかくれる（はねた髪の先を描かない） */
const covered = (p: PersonSpec) => !!p.hat && p.hat.type !== 'hachi';

function poly2(ctx: C, pts: number[]) {
  for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

function headBack(ctx: C, p: PersonSpec, hs: HairStyle) {
  shape(ctx, p.skin, circ(ctx, 0, 0, 8));
  if (hs === 'bald') {
    shape(ctx, p.hair, () => {
      ctx.arc(0, 0, 8.3, Math.PI * 0.08, Math.PI * 0.92);
      ctx.closePath();
    });
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.beginPath();
    ctx.ellipse(-2.5, -5, 2.4, 1, -0.3, 0, Math.PI * 2);
    ctx.fill();
    hat(ctx, p, 'back');
    return;
  }
  if (hs === 'spiky' && !covered(p)) shape(ctx, p.hair, () => poly(ctx, [-9.6, -2.5, -7.6, -5, -8.6, -8.4, -4.8, -7.6, -4, -10.6, -1, -8.4, 1.5, -11, 3.2, -8.2, 6.8, -9.6, 6.6, -6.4, 9.8, -5.6, 9.6, -2.5]));
  if (hs === 'bun') shape(ctx, p.hair, circ(ctx, 0, -8.4, 3.6));
  if (hs === 'bob' || hs === 'twin' || hs === 'long') {
    const yb = hs === 'long' ? 13 : 6.7;
    shape(ctx, p.hair, () => {
      ctx.moveTo(-8.1, -0.5);
      ctx.quadraticCurveTo(-8.2, yb - 1.5, -6.5, yb);
      ctx.quadraticCurveTo(0, yb + 1.4, 6.5, yb);
      ctx.quadraticCurveTo(8.2, yb - 1.5, 8.1, -0.5);
      ctx.closePath();
    });
  }
  shape(ctx, p.hair, circ(ctx, 0, -0.2, 8.3));
  hairHi(ctx, p, -3, -4);
  if (hs === 'pony') {
    shape(ctx, p.hair, () => {
      ctx.moveTo(-2, -3);
      ctx.quadraticCurveTo(-3.4, 6, 0, 10);
      ctx.quadraticCurveTo(3.4, 6, 2, -3);
      ctx.closePath();
    });
    if (p.ribbon) {
      shape(ctx, p.ribbon, ell(ctx, -1.8, -3.2, 2.2, 1.4, 0.4));
      shape(ctx, p.ribbon, ell(ctx, 1.8, -3.2, 2.2, 1.4, -0.4));
    }
  }
  hat(ctx, p, 'back');
}

function hat(ctx: C, p: PersonSpec, view: 'front' | 'back' | 'side') {
  if (!p.hat) return;
  const c = p.hat.color;
  const sx = view === 'side' ? -0.7 : 0;
  switch (p.hat.type) {
    case 'cap':
      shape(ctx, c, () => ctx.arc(sx, -3, 8.2, Math.PI, 0));
      if (view === 'front') shape(ctx, c, ell(ctx, 0, -2.9, 9.6, 1.9));
      else if (view === 'side') shape(ctx, c, ell(ctx, 8, -2.9, 5, 1.5));
      else {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2.5, -3.9, 5, 1.3);
      }
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath();
      ctx.ellipse(sx - 3, -7, 3, 1, -0.2, 0, Math.PI * 2);
      ctx.fill();
      if (p.hat.star && view !== 'back') star(ctx, view === 'side' ? 1 : 0, -6, 2, '#ffd23b');
      break;
    case 'helmet':
      shape(ctx, c, () => ctx.arc(sx, -2, 8.8, Math.PI, 0));
      shape(ctx, shade(c, -0.15), rr(ctx, sx - 9.6, -2.8, 19.2, 1.8, 0.8));
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(sx - 0.8, -10.6, 1.6, 7.6);
      break;
    case 'wide': {
      const bx = view === 'side' ? 1.5 : 0;
      shape(ctx, c, ell(ctx, bx, -3.2, 12, 3));
      shape(ctx, c, rr(ctx, sx - 6, -10, 12, 7.4, 3));
      ctx.fillStyle = shade(c, -0.3);
      ctx.fillRect(sx - 6, -5, 12, 1.6);
      break;
    }
    case 'bandana':
      shape(ctx, c, () => {
        ctx.arc(sx, -2.4, 8.7, Math.PI, 0);
        ctx.closePath();
      });
      if (view !== 'front') {
        const kx = view === 'side' ? -8.6 : 0;
        shape(ctx, c, ell(ctx, kx - 1.4, -2.2, 1.8, 1.1, 0.5));
        shape(ctx, c, ell(ctx, kx + 1.4, -2.2, 1.8, 1.1, -0.5));
      }
      break;
    case 'hachi':
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 8.9, 0, Math.PI * 2);
      ctx.clip();
      shape(ctx, c, rr(ctx, -10, -4.6, 20, 2.6, 0.6));
      ctx.restore();
      if (view !== 'front') {
        const kx = view === 'side' ? -8.4 : 0;
        shape(ctx, c, () => poly(ctx, [kx, -3.3, kx - 3, -1, kx - 1.8, 0.6]));
        shape(ctx, c, () => poly(ctx, [kx, -3.3, kx + 2.4, -0.4, kx + 0.6, 0.8]));
      }
      break;
  }
}

// ---------------------------------------------------------------- 右向き
function side(ctx: C, p: PersonSpec, m: Metrics, sw: number) {
  const bt = p.bottomType ?? 'pants';
  const hs = p.hairStyle ?? 'short';
  const w = m.tw * 0.7;
  const x0 = 16.25 - w / 2;
  const hip = m.ty + m.th - 1.5;
  const shoe = p.shoe ?? '#5a4636';
  const adult = p.age === 'adult' || p.age === 'elder';
  if (hs === 'long') {
    headSpace(ctx, 16.5, m);
    shape(ctx, p.hair, rr(ctx, -9, -2, 9, 14.5, 4));
    ctx.restore();
  }
  // 奥の腕
  shape(ctx, shade(p.top, -0.18), rr(ctx, 14 - sw * 2, m.aT, 3, m.aL, 1.5));
  // 脚
  const l = sw * 2.4;
  for (const dx of [-l, l]) {
    if (bt === 'long') shape(ctx, shoe, ell(ctx, 16.6 + dx * 0.4, 28.8, 2.8, 1.5));
    else {
      shape(ctx, legColor(p, bt), rr(ctx, 14.4 + dx, m.ly, 3, m.ll, 1));
      shape(ctx, shoe, ell(ctx, 16.6 + dx, 28.8, 2.8, 1.5));
    }
  }
  // 下
  if (bt === 'skirt') {
    const len = adult ? 6.5 : 5;
    shape(ctx, p.bottom, () => poly(ctx, [x0 + 0.5, hip, x0 + w - 0.5, hip, x0 + w + 1.5, hip + len, x0 - 1.2, hip + len]));
  } else if (bt === 'long') shape(ctx, p.bottom, () => poly(ctx, [x0 + 0.3, hip - 1, x0 + w - 0.3, hip - 1, x0 + w + 1.6, 28, x0 - 1.2, 28]));
  else if (bt === 'shorts') shape(ctx, p.bottom, rr(ctx, x0 + 0.5, hip, w - 1, 4.5, 1.5));
  else shape(ctx, p.bottom, rr(ctx, x0 + 0.5, hip, w - 1, 3.6, 1.5));
  // 体
  shape(ctx, p.top, rr(ctx, x0, m.ty, w, m.th, 3));
  if (p.inner) shape(ctx, p.inner, rr(ctx, x0 + w - 2.2, m.ty + 0.7, 1.8, m.th - 1.5, 0.8), false);
  if (p.tie) shape(ctx, p.tie, rr(ctx, x0 + w - 1.4, m.ty + 1, 1.3, 4.5, 0.5), false);
  if (p.apron) shape(ctx, p.apron, rr(ctx, x0 + w - 2.6, m.ty + 2.4, 2.8, m.th + 3.4, 1));
  if (p.obi) {
    ctx.fillStyle = p.obi;
    ctx.fillRect(x0 + 0.4, hip - 1.6, w - 0.8, 2.2);
  }
  if (p.cardcase) shape(ctx, '#ffcc33', rr(ctx, x0 - 1, hip - 0.9, 3, 4, 0.8));
  // 手前の腕
  shape(ctx, p.top, rr(ctx, 15 + sw * 2, m.aT, 3, m.aL - 0.2, 1.5));
  shape(ctx, p.skin, circ(ctx, 16.5 + sw * 2.4, m.aT + m.aL + 0.4, 1.6));
  // 頭
  headSpace(ctx, 16.5, m);
  headSide(ctx, p, hs);
  ctx.restore();
}

function headSide(ctx: C, p: PersonSpec, hs: HairStyle) {
  const elder = p.age === 'elder';
  if (hs === 'pony' || hs === 'twin') {
    shape(ctx, p.hair, () => {
      ctx.moveTo(-6.5, -2.5);
      ctx.quadraticCurveTo(-13.5, -0.5, -11, 8.5);
      ctx.quadraticCurveTo(-9, 3.5, -5.5, 1.5);
      ctx.closePath();
    });
    if (p.ribbon) shape(ctx, p.ribbon, ell(ctx, -6.9, -2.9, 1.6, 2.4, 0.4));
  }
  if (hs === 'spiky' && !covered(p)) shape(ctx, p.hair, () => poly(ctx, [-8, 2, -11, 0, -9, -2.5, -10.5, -5.5, -6.5, -6, -6, -10, -2.5, -8, 0, -11.5, 2.5, -8.4, 5.5, -9.6, 5.5, -5]));
  if (hs === 'bun') shape(ctx, p.hair, circ(ctx, -3, -8.2, 3.6));
  shape(ctx, p.skin, circ(ctx, 0, 0, 8));
  ctx.fillStyle = shade(p.skin, -0.1);
  ctx.beginPath();
  ctx.ellipse(-2, 2, 1.5, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (elder) {
    ctx.strokeStyle = '#2a1c3a';
    ctx.beginPath();
    ctx.arc(4.1, 1.6, 1.2, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.strokeStyle = LINE;
  } else {
    ctx.fillStyle = '#2a1c3a';
    ctx.beginPath();
    ctx.ellipse(4.1, 1.1, 1.2, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(4.5, 0.4, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,120,130,.45)';
  ctx.beginPath();
  ctx.ellipse(5.1, 3.3, 1.4, 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.beard) {
    shape(ctx, p.beardColor ?? p.hair, () => {
      ctx.moveTo(-1, 3);
      ctx.quadraticCurveTo(4, 12, 7.6, 3.5);
      ctx.quadraticCurveTo(3.5, 6.5, -1, 3);
      ctx.closePath();
    });
  }
  if (p.mustache) shape(ctx, p.beardColor ?? p.hair, ell(ctx, 6.4, 3.6, 1.7, 0.9, -0.2), false);
  else if (!p.beard) {
    ctx.strokeStyle = '#8a3a3a';
    ctx.beginPath();
    ctx.moveTo(6.1, 4.1);
    ctx.lineTo(7.1, 3.8);
    ctx.stroke();
    ctx.strokeStyle = LINE;
  }
  if (p.glasses === 'round') {
    ctx.strokeStyle = '#3a2a3a';
    ctx.beginPath();
    ctx.arc(4.4, 1.1, 2.2, 0, Math.PI * 2);
    ctx.moveTo(2.2, 0.6);
    ctx.lineTo(-2.5, 0);
    ctx.stroke();
    ctx.strokeStyle = LINE;
  } else if (p.glasses === 'sun') {
    shape(ctx, '#1a1a24', rr(ctx, 2.2, -0.4, 4.6, 3, 1.2));
    ctx.fillRect(-2.5, 0, 5, 0.8);
  }
  // 髪
  if (hs === 'bald') {
    shape(ctx, p.hair, ell(ctx, -5.6, 0.6, 2.4, 3.2));
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath();
    ctx.ellipse(-0.5, -5.6, 2.4, 1, -0.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const back = hs === 'bob' ? 5.5 : hs === 'long' ? 9 : hs === 'twin' || hs === 'pony' ? 3.5 : 2.5;
    const girl = hs === 'bob' || hs === 'long' || hs === 'twin' || hs === 'pony';
    shape(ctx, p.hair, () => {
      ctx.arc(-0.5, -0.6, 8.6, Math.PI * 0.86, Math.PI * 1.92);
      if (hs === 'slick') poly2(ctx, [7, -0.6, 5.6, -3.2, 1, -3.6, -3.5, -1, -3, back, -8.2, back]);
      else if (girl) poly2(ctx, [7.4, -1, 5.6, -1.6, 4.4, -0.2, 2.6, -2, 0, -0.5, -3, back, -8.4, back]);
      else poly2(ctx, [6.6, -0.4, 4.6, -1.6, 3.4, 0, 1, -1.8, -3.5, -0.5, -4.4, back, -8.3, back]);
    });
    hairHi(ctx, p, -1.5, -5.6);
  }
  if (p.hairpin) star(ctx, 2.6, -4.9, 1.7, p.hairpin);
  hat(ctx, p, 'side');
}
