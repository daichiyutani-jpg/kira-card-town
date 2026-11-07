// カードイラストをSVGで生成する。カードごとに 体型（body）・種（seed）から、部品・色・ポーズ・背景・構図を変える。
// 画像ファイルを用意した場合は cards.json の art.img に置けばそちらを使う（src/ui/cardView.ts）。
import type { CardDef, Element, Rarity } from '../engine/types';

type R = () => number;
function rng(seed: number): R {
  let s = seed | 0 || 7;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: R, a: T[]) => a[Math.floor(r() * a.length)];
const between = (r: R, a: number, b: number) => a + (b - a) * r();

function hsl(h: number, s: number, l: number) {
  return `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;
}

// 属性ごとの色相
const EL_HUE: Record<Element, number[]> = {
  fire: [8, 22, 35, 350],
  water: [200, 215, 185, 230],
  wind: [140, 160, 95, 175],
  earth: [30, 40, 20, 55],
  light: [48, 55, 40, 30],
  dark: [270, 285, 300, 250],
};

interface Pal {
  body: string;
  bodyLight: string;
  bodyDark: string;
  belly: string;
  accent: string;
  accent2: string;
  eye: string;
  line: string;
  hue: number;
}

function palette(el: Element, r: R): Pal {
  const hue = pick(r, EL_HUE[el]) + between(r, -10, 10);
  const sat = el === 'earth' ? between(r, 35, 55) : el === 'dark' ? between(r, 35, 60) : between(r, 55, 80);
  const lig = el === 'dark' ? between(r, 30, 42) : el === 'light' ? between(r, 62, 72) : between(r, 45, 58);
  const acc = hue + pick(r, [150, 180, 40, -40, 200]);
  return {
    hue,
    body: hsl(hue, sat, lig),
    bodyLight: hsl(hue + 8, sat + 5, Math.min(92, lig + 22)),
    bodyDark: hsl(hue - 8, sat, Math.max(10, lig - 22)),
    belly: hsl(hue + 20, Math.max(20, sat - 30), Math.min(94, lig + 32)),
    accent: hsl(acc, 80, el === 'dark' ? 60 : 55),
    accent2: hsl(acc + 30, 85, 70),
    eye: pick(r, el === 'dark' ? ['#ff3b5c', '#b6ff3b', '#ffd23b', '#3bf0ff'] : ['#ffd23b', '#3bf0ff', '#ff7a3b', '#ffffff', '#7cff6b']),
    line: hsl(hue - 10, 40, 12),
  };
}

// ---------- 背景 ----------
function background(el: Element, r: R, id: string): string {
  const g = `bg-${id}`;
  const top: Record<Element, string> = { fire: '#3a0a06', water: '#06223f', wind: '#0f4a5a', earth: '#3b2612', light: '#fff4c2', dark: '#0b0618' };
  const mid: Record<Element, string> = { fire: '#c2361b', water: '#1d6fb0', wind: '#7fd1c9', earth: '#9a6a32', light: '#ffd36b', dark: '#3a1d63' };
  const low: Record<Element, string> = { fire: '#ff9a3c', water: '#4fc3e8', wind: '#e8fff4', earth: '#d9b072', light: '#fffaf0', dark: '#6a2c8a' };
  let s = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top[el]}"/><stop offset="0.6" stop-color="${mid[el]}"/><stop offset="1" stop-color="${low[el]}"/></linearGradient></defs><rect width="200" height="150" fill="url(#${g})"/>`;
  const hz = between(r, 98, 118);
  if (el === 'fire') {
    for (let i = 0; i < 3; i++) {
      const x = between(r, -20, 180);
      const w = between(r, 60, 110);
      s += `<path d="M${x} ${hz + 10} L${x + w * 0.42} ${hz - between(r, 30, 55)} L${x + w * 0.5} ${hz - between(r, 25, 45)} L${x + w} ${hz + 10}Z" fill="#2a0804" opacity="0.75"/>`;
    }
    s += `<rect y="${hz + 8}" width="200" height="60" fill="#1a0503"/>`;
    for (let i = 0; i < 4; i++) s += `<path d="M${between(r, 0, 200)} ${hz + 10} q ${between(r, -10, 10)} ${between(r, 10, 20)} ${between(r, -5, 5)} 40" stroke="#ff6a1a" stroke-width="${between(r, 1.5, 3)}" fill="none" opacity="0.8"/>`;
    for (let i = 0; i < 14; i++) s += `<circle cx="${between(r, 0, 200)}" cy="${between(r, 0, 140)}" r="${between(r, 0.6, 1.8)}" fill="#ffc46b" opacity="${between(r, 0.4, 0.9)}"/>`;
  } else if (el === 'water') {
    for (let i = 0; i < 5; i++) s += `<path d="M${between(r, -10, 200)} 0 L${between(r, 0, 200)} 150" stroke="#bfefff" stroke-width="${between(r, 6, 16)}" opacity="0.07"/>`;
    for (let k = 0; k < 3; k++) {
      const y = hz + k * 12;
      let d = `M0 ${y}`;
      for (let x = 0; x <= 200; x += 25) d += ` q 12.5 ${k % 2 ? 6 : -6} 25 0`;
      s += `<path d="${d} V150 H0Z" fill="#0a3a66" opacity="${0.35 + k * 0.2}"/>`;
    }
    for (let i = 0; i < 12; i++) s += `<circle cx="${between(r, 0, 200)}" cy="${between(r, 10, 140)}" r="${between(r, 1, 4)}" fill="none" stroke="#dff7ff" stroke-width="0.8" opacity="0.7"/>`;
  } else if (el === 'wind') {
    for (let i = 0; i < 4; i++) {
      const x = between(r, -20, 170);
      const y = between(r, 15, 70);
      s += `<g fill="#fff" opacity="${between(r, 0.5, 0.85)}"><ellipse cx="${x}" cy="${y}" rx="${between(r, 18, 30)}" ry="8"/><ellipse cx="${x + 14}" cy="${y - 6}" rx="14" ry="9"/><ellipse cx="${x + 28}" cy="${y}" rx="16" ry="7"/></g>`;
    }
    for (let i = 0; i < 5; i++) {
      const y = between(r, 20, 130);
      s += `<path d="M${between(r, -20, 60)} ${y} q 40 -18 80 0 t 60 -6" stroke="#ffffff" stroke-width="1.6" fill="none" opacity="0.55" stroke-linecap="round"/>`;
    }
    s += `<path d="M0 ${hz + 15} Q 60 ${hz - 5} 120 ${hz + 12} T 200 ${hz + 6} V150 H0Z" fill="#3f9a6a"/><path d="M0 ${hz + 25} Q 80 ${hz + 10} 200 ${hz + 22} V150 H0Z" fill="#2c7a50"/>`;
  } else if (el === 'earth') {
    for (let i = 0; i < 3; i++) {
      const x = between(r, -30, 170);
      s += `<path d="M${x} ${hz + 15} l ${between(r, 10, 25)} ${-between(r, 35, 60)} h ${between(r, 25, 50)} l ${between(r, 10, 25)} ${between(r, 35, 60)} Z" fill="#6b4320" opacity="0.8"/>`;
    }
    s += `<rect y="${hz + 12}" width="200" height="60" fill="#5a3818"/>`;
    for (let i = 0; i < 9; i++) s += `<ellipse cx="${between(r, 0, 200)}" cy="${between(r, hz + 18, 148)}" rx="${between(r, 4, 12)}" ry="${between(r, 2, 6)}" fill="#7d5328"/>`;
    for (let i = 0; i < 6; i++) s += `<path d="M${between(r, 0, 200)} ${between(r, hz + 15, 150)} l 4 -6 l 4 6z" fill="#8bc34a" opacity="0.8"/>`;
  } else if (el === 'light') {
    const cx = between(r, 60, 140);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.2;
      s += `<path d="M${cx} 40 L${cx + Math.cos(a) * 160} ${40 + Math.sin(a) * 160} L${cx + Math.cos(a + 0.12) * 160} ${40 + Math.sin(a + 0.12) * 160}Z" fill="#ffffff" opacity="0.18"/>`;
    }
    s += `<circle cx="${cx}" cy="40" r="22" fill="#ffffff" opacity="0.7"/>`;
    s += `<path d="M0 ${hz + 18} Q 100 ${hz} 200 ${hz + 18} V150 H0Z" fill="#fff0c0"/>`;
    for (let i = 0; i < 4; i++) {
      const x = between(r, 10, 190);
      s += `<rect x="${x}" y="${hz - 20}" width="7" height="${40}" fill="#fffaf0" opacity="0.7"/>`;
    }
  } else {
    s += `<circle cx="${between(r, 30, 170)}" cy="${between(r, 20, 45)}" r="${between(r, 11, 17)}" fill="#f5e9ff" opacity="0.9"/>`;
    for (let i = 0; i < 26; i++) s += `<circle cx="${between(r, 0, 200)}" cy="${between(r, 0, 90)}" r="${between(r, 0.3, 1.2)}" fill="#fff" opacity="${between(r, 0.4, 1)}"/>`;
    s += `<path d="M0 ${hz + 10} L20 ${hz - 15} L32 ${hz + 5} L50 ${hz - 25} L70 ${hz + 8} L95 ${hz - 10} L120 ${hz + 10} L150 ${hz - 22} L170 ${hz + 4} L200 ${hz - 12} V150 H0Z" fill="#14081f"/>`;
    for (let i = 0; i < 5; i++) s += `<ellipse cx="${between(r, 0, 200)}" cy="${between(r, hz, 150)}" rx="${between(r, 20, 40)}" ry="5" fill="#9b59b6" opacity="0.15"/>`;
  }
  return s;
}

// ---------- 共通の部品 ----------
function eyes(p: Pal, r: R, cx: number, cy: number, size: number, mode: number, count = 2, gap = 1): string {
  let s = '';
  const sx = size * 1.15 * gap;
  const xs = count === 1 ? [cx] : count === 3 ? [cx - sx, cx, cx + sx] : [cx - sx / 2 - size * 0.2, cx + sx / 2 + size * 0.2];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = count === 3 && i === 1 ? cy - size * 0.6 : cy;
    if (mode === 0) {
      // まるい目
      s += `<ellipse cx="${x}" cy="${y}" rx="${size * 0.55}" ry="${size * 0.65}" fill="#fff" stroke="${p.line}" stroke-width="1"/>`;
      s += `<circle cx="${x + size * 0.08}" cy="${y + size * 0.05}" r="${size * 0.38}" fill="${p.eye}"/><circle cx="${x + size * 0.1}" cy="${y + size * 0.08}" r="${size * 0.2}" fill="#111"/><circle cx="${x - size * 0.12}" cy="${y - size * 0.2}" r="${size * 0.12}" fill="#fff"/>`;
    } else if (mode === 1) {
      // つり目
      const dir = x < cx ? 1 : -1;
      s += `<path d="M${x - size * 0.6} ${y - size * 0.25 * dir * -1} Q ${x} ${y - size * 0.6} ${x + size * 0.6} ${y + size * 0.25 * dir * -1} Q ${x} ${y + size * 0.45} ${x - size * 0.6} ${y - size * 0.25 * dir * -1}Z" fill="${p.eye}" stroke="${p.line}" stroke-width="1.2"/><ellipse cx="${x}" cy="${y}" rx="${size * 0.12}" ry="${size * 0.3}" fill="#111"/>`;
    } else {
      // 光る目
      s += `<circle cx="${x}" cy="${y}" r="${size * 0.7}" fill="${p.eye}" opacity="0.35"/><circle cx="${x}" cy="${y}" r="${size * 0.4}" fill="${p.eye}"/><circle cx="${x}" cy="${y}" r="${size * 0.18}" fill="#fff"/>`;
    }
  }
  void r;
  return s;
}

function horn(p: Pal, x: number, y: number, len: number, ang: number, kind: number): string {
  const a = (ang * Math.PI) / 180;
  const tx = x + Math.cos(a) * len;
  const ty = y + Math.sin(a) * len;
  const nx = Math.cos(a + Math.PI / 2) * len * 0.18;
  const ny = Math.sin(a + Math.PI / 2) * len * 0.18;
  if (kind === 0) return `<path d="M${x - nx} ${y - ny} Q ${(x + tx) / 2 + nx * 1.5} ${(y + ty) / 2 + ny * 1.5} ${tx} ${ty} L${x + nx} ${y + ny}Z" fill="${p.accent2}" stroke="${p.line}" stroke-width="1"/>`;
  if (kind === 1) return `<path d="M${x - nx} ${y - ny} L${tx} ${ty} L${x + nx} ${y + ny}Z" fill="${p.belly}" stroke="${p.line}" stroke-width="1"/>`;
  return `<path d="M${x} ${y} Q ${tx + nx * 2} ${ty + ny * 2} ${tx} ${ty}" stroke="${p.accent}" stroke-width="${len * 0.16}" fill="none" stroke-linecap="round"/><circle cx="${tx}" cy="${ty}" r="${len * 0.14}" fill="${p.accent2}"/>`;
}

function wing(p: Pal, x: number, y: number, size: number, side: 1 | -1, kind: number, id: string): string {
  const s = side;
  if (kind === 0) {
    // 翼膜
    return `<path d="M${x} ${y} Q ${x + s * size * 0.6} ${y - size * 0.9} ${x + s * size * 1.2} ${y - size * 0.7} L${x + s * size * 1.05} ${y - size * 0.25} L${x + s * size * 1.15} ${y + size * 0.05} L${x + s * size * 0.85} ${y + size * 0.1} L${x + s * size * 0.8} ${y + size * 0.4} Q ${x + s * size * 0.4} ${y + size * 0.2} ${x} ${y + size * 0.3}Z" fill="url(#wg-${id})" stroke="${p.line}" stroke-width="1.2"/><path d="M${x} ${y} L${x + s * size * 1.05} ${y - size * 0.25} M${x} ${y + size * 0.1} L${x + s * size * 0.85} ${y + size * 0.1}" stroke="${p.bodyDark}" stroke-width="1"/>`;
  }
  // 羽根
  let out = '';
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.32;
    const len = size * (1.1 - i * 0.12);
    out += `<path d="M${x} ${y} Q ${x + s * Math.cos(a) * len * 0.6} ${y + Math.sin(a) * len * 0.6 - 6} ${x + s * Math.cos(a) * len} ${y + Math.sin(a) * len} Q ${x + s * Math.cos(a) * len * 0.5} ${y + Math.sin(a) * len * 0.5 + 6} ${x} ${y + 4}Z" fill="${i % 2 ? p.bodyLight : p.belly}" stroke="${p.line}" stroke-width="0.8"/>`;
  }
  return out;
}

function grads(p: Pal, id: string): string {
  return `<defs><radialGradient id="bd-${id}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${p.bodyLight}"/><stop offset="0.55" stop-color="${p.body}"/><stop offset="1" stop-color="${p.bodyDark}"/></radialGradient><linearGradient id="wg-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.accent}"/><stop offset="1" stop-color="${p.bodyDark}"/></linearGradient><radialGradient id="glow-${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${p.accent2}" stop-opacity="0.7"/><stop offset="1" stop-color="${p.accent2}" stop-opacity="0"/></radialGradient></defs>`;
}

function pattern(p: Pal, r: R, cx: number, cy: number, rx: number, ry: number, kind: number): string {
  let s = '';
  if (kind === 1) for (let i = 0; i < 5; i++) s += `<circle cx="${cx + between(r, -rx * 0.6, rx * 0.6)}" cy="${cy + between(r, -ry * 0.5, ry * 0.3)}" r="${between(r, 2, 4.5)}" fill="${p.bodyDark}" opacity="0.55"/>`;
  if (kind === 2) for (let i = -2; i <= 2; i++) s += `<path d="M${cx + i * rx * 0.3} ${cy - ry * 0.8} q ${rx * 0.12} ${ry * 0.5} 0 ${ry * 0.9}" stroke="${p.bodyDark}" stroke-width="3" fill="none" opacity="0.5"/>`;
  if (kind === 3) s += `<path d="M${cx - rx * 0.5} ${cy - ry * 0.2} l ${rx * 0.25} ${-ry * 0.3} l ${rx * 0.25} ${ry * 0.3} l ${rx * 0.25} ${-ry * 0.3} l ${rx * 0.25} ${ry * 0.3}" stroke="${p.accent}" stroke-width="2.5" fill="none"/>`;
  return s;
}

const shadow = (cx: number, y: number, w: number) => `<ellipse cx="${cx}" cy="${y}" rx="${w}" ry="${w * 0.18}" fill="#000" opacity="0.35"/>`;

// ---------- 体型ごとの描画 ----------
interface Ctx {
  p: Pal;
  r: R;
  id: string;
  lv: number;
  size: number; // レベルで大きくなる
  eyeMode: number;
}

const BODIES: Record<string, (c: Ctx) => string> = {
  beast(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 92;
    const rx = 34 * k, ry = 22 * k;
    const legs = [-0.7, -0.3, 0.35, 0.75].map((f) => `<rect x="${cx + f * rx - 5}" y="${cy + ry * 0.4}" width="10" height="${20 * k}" rx="4" fill="${p.bodyDark}" stroke="${p.line}"/>`).join('');
    const tailKind = Math.floor(r() * 3);
    const tail = tailKind === 0 ? `<path d="M${cx - rx} ${cy} q ${-25 * k} ${-10} ${-20 * k} ${-35 * k}" stroke="${p.body}" stroke-width="${9 * k}" fill="none" stroke-linecap="round"/>` : tailKind === 1 ? `<path d="M${cx - rx + 4} ${cy - 4} C ${cx - rx - 40 * k} ${cy - 10} ${cx - rx - 30 * k} ${cy - 50 * k} ${cx - rx - 5} ${cy - 30 * k}" stroke="${p.accent}" stroke-width="${12 * k}" fill="none" stroke-linecap="round" opacity="0.9"/>` : `<path d="M${cx - rx} ${cy} l ${-22 * k} ${-6} l ${8} ${-10} l ${-12} ${-8}" stroke="${p.accent}" stroke-width="5" fill="none" stroke-linejoin="round"/>`;
    const hx = cx + rx * 0.75, hy = cy - ry * 0.9;
    const hr = 18 * k;
    const ears = r() < 0.5 ? `<path d="M${hx - hr * 0.7} ${hy - hr * 0.5} l ${-4} ${-hr * 0.9} l ${hr * 0.6} ${hr * 0.5}Z M${hx + hr * 0.2} ${hy - hr * 0.8} l ${hr * 0.4} ${-hr * 0.8} l ${hr * 0.3} ${hr * 0.9}Z" fill="${p.body}" stroke="${p.line}"/>` : horn(p, hx - 4, hy - hr * 0.7, 22 * k, -110 + between(r, -10, 10), Math.floor(r() * 3)) + horn(p, hx + 8, hy - hr * 0.7, 20 * k, -70 + between(r, -10, 10), Math.floor(r() * 3));
    return `${shadow(cx, cy + ry + 18 * k, rx * 1.1)}${tail}${legs}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>${pattern(p, r, cx, cy, rx, ry, Math.floor(r() * 4))}<ellipse cx="${cx + 5}" cy="${cy + ry * 0.4}" rx="${rx * 0.55}" ry="${ry * 0.4}" fill="${p.belly}" opacity="0.8"/>${ears}<circle cx="${hx}" cy="${hy}" r="${hr}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><ellipse cx="${hx + hr * 0.55}" cy="${hy + hr * 0.35}" rx="${hr * 0.45}" ry="${hr * 0.32}" fill="${p.belly}" stroke="${p.line}"/><circle cx="${hx + hr * 0.85}" cy="${hy + hr * 0.25}" r="2" fill="${p.line}"/>${eyes(p, r, hx + 2, hy - 3, 6 * k, c.eyeMode)}`;
  },
  bird(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 78;
    const wk = Math.floor(r() * 2);
    const span = 46 * k;
    const tail = `<path d="M${cx - 6} ${cy + 26 * k} l ${-10} ${30 * k} l ${8} ${-6} l ${8} ${10} l ${6} ${-12} l ${8} ${6} l ${-6} ${-28 * k}Z" fill="${p.accent}" stroke="${p.line}"/>`;
    const crest = Array.from({ length: 3 }, (_, i) => `<path d="M${cx - 4 + i * 4} ${cy - 30 * k} q ${-6 + i * 3} ${-16 * k} ${4 + i * 4} ${-22 * k}" stroke="${p.accent2}" stroke-width="3" fill="none" stroke-linecap="round"/>`).join('');
    return `${shadow(cx, 132, 30 * k)}${tail}${wing(p, cx - 12, cy - 4, span, -1, wk, id)}${wing(p, cx + 12, cy - 4, span, 1, wk, id)}<ellipse cx="${cx}" cy="${cy + 6}" rx="${22 * k}" ry="${28 * k}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><ellipse cx="${cx}" cy="${cy + 14}" rx="${13 * k}" ry="${17 * k}" fill="${p.belly}"/>${crest}<circle cx="${cx}" cy="${cy - 20 * k}" r="${15 * k}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><path d="M${cx - 6} ${cy - 16 * k} L${cx} ${cy - 4 * k} L${cx + 6} ${cy - 16 * k}Z" fill="#ffb300" stroke="${p.line}"/>${eyes(p, r, cx, cy - 23 * k, 5 * k, c.eyeMode)}<path d="M${cx - 8} ${cy + 33 * k} v 12 m 16 -12 v 12" stroke="#ffb300" stroke-width="3"/>`;
  },
  dragon(c) {
    const { p, r, id, size: k } = c;
    const cx = 96, cy = 90;
    const neck = `<path d="M${cx + 10} ${cy - 10} Q ${cx + 30 * k} ${cy - 40 * k} ${cx + 22 * k} ${cy - 55 * k}" stroke="${p.body}" stroke-width="${16 * k}" fill="none" stroke-linecap="round"/>`;
    const hx = cx + 24 * k, hy = cy - 58 * k;
    const spikes = Array.from({ length: 5 }, (_, i) => `<path d="M${cx - 30 * k + i * 12 * k} ${cy - 14 * k + Math.abs(i - 2) * 2} l ${5 * k} ${-12 * k} l ${5 * k} ${12 * k}Z" fill="${p.accent}" stroke="${p.line}" stroke-width="0.8"/>`).join('');
    const tail = `<path d="M${cx - 30 * k} ${cy + 8} Q ${cx - 70 * k} ${cy + 20} ${cx - 80 * k} ${cy - 10 * k}" stroke="${p.body}" stroke-width="${12 * k}" fill="none" stroke-linecap="round"/><path d="M${cx - 82 * k} ${cy - 10 * k} l -8 -8 l 14 0z" fill="${p.accent}"/>`;
    return `${shadow(cx, 136, 50 * k)}${wing(p, cx - 6, cy - 18 * k, 60 * k, -1, 0, id)}${wing(p, cx + 10, cy - 18 * k, 52 * k, 1, 0, id)}${tail}<ellipse cx="${cx - 8}" cy="${cy}" rx="${36 * k}" ry="${24 * k}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>${spikes}<ellipse cx="${cx - 4}" cy="${cy + 8 * k}" rx="${22 * k}" ry="${12 * k}" fill="${p.belly}" opacity="0.85"/>${pattern(p, r, cx - 8, cy, 30 * k, 18 * k, 2)}${neck}<rect x="${cx - 30 * k}" y="${cy + 14 * k}" width="${10 * k}" height="${18 * k}" rx="4" fill="${p.bodyDark}" stroke="${p.line}"/><rect x="${cx + 8 * k}" y="${cy + 14 * k}" width="${10 * k}" height="${18 * k}" rx="4" fill="${p.bodyDark}" stroke="${p.line}"/>${horn(p, hx - 6, hy - 8 * k, 20 * k, -130, Math.floor(r() * 2))}${horn(p, hx + 6, hy - 8 * k, 20 * k, -60, Math.floor(r() * 2))}<ellipse cx="${hx}" cy="${hy}" rx="${16 * k}" ry="${13 * k}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><ellipse cx="${hx + 12 * k}" cy="${hy + 5 * k}" rx="${10 * k}" ry="${7 * k}" fill="${p.body}" stroke="${p.line}"/><path d="M${hx + 8 * k} ${hy + 10 * k} l 3 4 l 3 -4 l 3 4" stroke="#fff" stroke-width="1.5" fill="none"/>${eyes(p, r, hx - 1, hy - 3 * k, 5 * k, Math.max(1, c.eyeMode))}`;
  },
  serpent(c) {
    const { p, r, id, size: k } = c;
    const pts: string[] = [];
    const amp = 18 * k;
    for (let i = 0; i <= 8; i++) pts.push(`${30 + i * 17} ${110 + Math.sin(i * 1.1 + r()) * amp}`);
    const hx = 160, hy = 60;
    return `${shadow(100, 136, 60)}<path d="M${pts.join(' L')} Q 170 90 ${hx} ${hy + 10}" stroke="${p.bodyDark}" stroke-width="${22 * k}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${pts.join(' L')} Q 170 90 ${hx} ${hy + 10}" stroke="url(#bd-${id})" stroke-width="${18 * k}" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${pts.join(' L')}" stroke="${p.belly}" stroke-width="${5 * k}" fill="none" stroke-dasharray="4 5" opacity="0.8"/><ellipse cx="${hx}" cy="${hy}" rx="${18 * k}" ry="${14 * k}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>${r() < 0.6 ? `<path d="M${hx - 22 * k} ${hy - 4} Q ${hx} ${hy - 40 * k} ${hx + 22 * k} ${hy - 4}" fill="${p.accent}" opacity="0.75" stroke="${p.line}"/>` : ''}<path d="M${hx + 12} ${hy + 10} l 10 4 l -6 1 l 6 3" stroke="#e53935" stroke-width="1.5" fill="none"/>${eyes(p, r, hx, hy - 3, 5 * k, Math.max(1, c.eyeMode))}`;
  },
  fish(c) {
    const { p, r, id, size: k } = c;
    const cx = 96, cy = 80;
    const rx = 40 * k, ry = 24 * k * between(r, 0.8, 1.2);
    const fins = `<path d="M${cx - rx + 6} ${cy} l ${-30 * k} ${-24 * k} l ${6} ${24 * k} l ${-6} ${24 * k}Z" fill="${p.accent}" stroke="${p.line}"/><path d="M${cx - 10} ${cy - ry + 2} q 10 ${-26 * k} ${30 * k} ${-8 * k} l -6 ${10 * k}Z" fill="${p.accent2}" stroke="${p.line}"/><path d="M${cx} ${cy + ry - 4} q 6 ${16 * k} ${20 * k} ${6 * k}Z" fill="${p.accent}" stroke="${p.line}"/>`;
    const scales = Array.from({ length: 8 }, (_, i) => `<path d="M${cx - rx * 0.4 + (i % 4) * 12} ${cy - 6 + Math.floor(i / 4) * 12} q 6 6 0 12" stroke="${p.bodyDark}" fill="none" opacity="0.5"/>`).join('');
    const lure = r() < 0.4 ? `<path d="M${cx + rx * 0.6} ${cy - ry} q 10 -30 30 -20" stroke="${p.line}" stroke-width="2" fill="none"/><circle cx="${cx + rx * 0.6 + 30}" cy="${cy - ry - 20}" r="6" fill="${p.eye}"/><circle cx="${cx + rx * 0.6 + 30}" cy="${cy - ry - 20}" r="12" fill="${p.eye}" opacity="0.3"/>` : '';
    return `${shadow(cx, 134, 40)}${fins}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><path d="M${cx - rx * 0.6} ${cy + ry * 0.3} Q ${cx} ${cy + ry} ${cx + rx * 0.8} ${cy + ry * 0.2}" fill="${p.belly}" opacity="0.8"/>${scales}${lure}<path d="M${cx + rx * 0.82} ${cy + 6} q -6 4 -12 0" stroke="${p.line}" stroke-width="1.5" fill="none"/>${eyes(p, r, cx + rx * 0.55, cy - 6, 6 * k, c.eyeMode, 1)}`;
  },
  insect(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 88;
    const legs = [-1, 1].flatMap((s) => [0, 1, 2].map((i) => `<path d="M${cx + s * 10} ${cy - 4 + i * 10} l ${s * 24 * k} ${-6 + i * 6} l ${s * 8} ${18}" stroke="${p.line}" stroke-width="2.5" fill="none" stroke-linejoin="round"/>`)).join('');
    const wingsOn = r() < 0.7;
    const wings = wingsOn ? [-1, 1].map((s) => `<ellipse cx="${cx + s * 28 * k}" cy="${cy - 26 * k}" rx="${26 * k}" ry="${11 * k}" transform="rotate(${s * -25} ${cx + s * 28 * k} ${cy - 26 * k})" fill="${p.accent2}" opacity="0.45" stroke="${p.line}" stroke-width="0.8"/>`).join('') : '';
    const hornK = r();
    const head = hornK < 0.4 ? horn(p, cx, cy - 34 * k, 30 * k, -90, 1) : hornK < 0.7 ? `<path d="M${cx - 6} ${cy - 34 * k} q -10 -18 -18 -16 M${cx + 6} ${cy - 34 * k} q 10 -18 18 -16" stroke="${p.line}" stroke-width="2" fill="none"/><circle cx="${cx - 18}" cy="${cy - 34 * k - 16}" r="3" fill="${p.accent}"/><circle cx="${cx + 18}" cy="${cy - 34 * k - 16}" r="3" fill="${p.accent}"/>` : `<path d="M${cx - 12} ${cy - 26 * k} l -16 -4 l 8 10 M${cx + 12} ${cy - 26 * k} l 16 -4 l -8 10" stroke="${p.line}" stroke-width="3" fill="none"/>`;
    return `${shadow(cx, 134, 36 * k)}${wings}${legs}<ellipse cx="${cx}" cy="${cy + 18 * k}" rx="${22 * k}" ry="${26 * k}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>${pattern(p, r, cx, cy + 18 * k, 18 * k, 22 * k, 1 + Math.floor(r() * 3))}<line x1="${cx}" y1="${cy - 4}" x2="${cx}" y2="${cy + 42 * k}" stroke="${p.line}" stroke-width="1.2"/><ellipse cx="${cx}" cy="${cy - 10 * k}" rx="${15 * k}" ry="${12 * k}" fill="${p.bodyDark}" stroke="${p.line}"/>${head}<circle cx="${cx}" cy="${cy - 26 * k}" r="${12 * k}" fill="url(#bd-${id})" stroke="${p.line}"/>${eyes(p, r, cx, cy - 27 * k, 5 * k, 2, 2, 1.3)}`;
  },
  golem(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 84;
    const block = (x: number, y: number, w: number, h: number) => `<path d="M${x} ${y + 4} l 4 -4 h ${w - 8} l 4 4 v ${h - 8} l -4 4 h ${-(w - 8)} l -4 -4Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>`;
    const cracks = Array.from({ length: 4 }, () => `<path d="M${cx + between(r, -20, 20)} ${cy + between(r, -10, 20)} l ${between(r, -8, 8)} 6 l ${between(r, -6, 6)} 6" stroke="${p.bodyDark}" fill="none"/>`).join('');
    const gem = `<polygon points="${cx},${cy - 6} ${cx + 7},${cy + 2} ${cx},${cy + 10} ${cx - 7},${cy + 2}" fill="${p.eye}" stroke="#fff" stroke-width="0.8"/><circle cx="${cx}" cy="${cy + 2}" r="14" fill="url(#glow-${id})"/>`;
    return `${shadow(cx, 138, 46 * k)}${block(cx - 48 * k, cy - 12, 22 * k, 46 * k)}${block(cx + 26 * k, cy - 12, 22 * k, 46 * k)}${block(cx - 28 * k, cy + 26 * k, 22, 26)}${block(cx + 28 * k - 22, cy + 26 * k, 22, 26)}${block(cx - 30 * k, cy - 22, 60 * k, 52 * k)}${cracks}${gem}${block(cx - 16 * k, cy - 50 * k, 32 * k, 26 * k)}${r() < 0.5 ? `<path d="M${cx - 18 * k} ${cy - 50 * k} l 6 -10 l 6 10 l 6 -12 l 6 12 l 6 -10 l 6 10" fill="#7cb342" stroke="${p.line}" stroke-width="0.8"/>` : ''}${eyes(p, r, cx, cy - 38 * k, 5 * k, 2, 2, 1.4)}`;
  },
  robot(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 84;
    const ant = `<line x1="${cx}" y1="${cy - 52 * k}" x2="${cx + between(r, -8, 8)}" y2="${cy - 70 * k}" stroke="${p.line}" stroke-width="2"/><circle cx="${cx}" cy="${cy - 70 * k}" r="4" fill="${p.accent}"/>`;
    const arms = r() < 0.5 ? `<path d="M${cx - 30 * k} ${cy - 10} q -20 10 -18 30" stroke="${p.bodyDark}" stroke-width="${8 * k}" fill="none" stroke-linecap="round"/><path d="M${cx + 30 * k} ${cy - 10} q 20 10 18 30" stroke="${p.bodyDark}" stroke-width="${8 * k}" fill="none" stroke-linecap="round"/><circle cx="${cx - 48 * k + 4}" cy="${cy + 22}" r="${6 * k}" fill="${p.accent}"/><circle cx="${cx + 48 * k - 4}" cy="${cy + 22}" r="${6 * k}" fill="${p.accent}"/>` : `<rect x="${cx - 52 * k}" y="${cy - 14}" width="${20 * k}" height="${34 * k}" rx="6" fill="${p.bodyDark}" stroke="${p.line}"/><rect x="${cx + 32 * k}" y="${cy - 14}" width="${20 * k}" height="${34 * k}" rx="6" fill="${p.bodyDark}" stroke="${p.line}"/>`;
    const treads = r() < 0.5 ? `<rect x="${cx - 34 * k}" y="${cy + 28 * k}" width="${68 * k}" height="${16 * k}" rx="8" fill="#333" stroke="#111"/>${Array.from({ length: 6 }, (_, i) => `<circle cx="${cx - 28 * k + i * 11 * k}" cy="${cy + 36 * k}" r="3" fill="#888"/>`).join('')}` : `<rect x="${cx - 22 * k}" y="${cy + 26 * k}" width="${12 * k}" height="${22 * k}" fill="${p.bodyDark}" stroke="${p.line}"/><rect x="${cx + 10 * k}" y="${cy + 26 * k}" width="${12 * k}" height="${22 * k}" fill="${p.bodyDark}" stroke="${p.line}"/>`;
    return `${shadow(cx, 138, 40 * k)}${arms}${treads}<rect x="${cx - 32 * k}" y="${cy - 22 * k}" width="${64 * k}" height="${50 * k}" rx="10" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><rect x="${cx - 18 * k}" y="${cy - 8 * k}" width="${36 * k}" height="${20 * k}" rx="4" fill="#1b2633"/>${Array.from({ length: 4 }, (_, i) => `<rect x="${cx - 14 * k + i * 8 * k}" y="${cy - 4 * k}" width="${5 * k}" height="${12 * k}" fill="${i % 2 ? p.accent : p.eye}" opacity="0.85"/>`).join('')}${ant}<rect x="${cx - 24 * k}" y="${cy - 52 * k}" width="${48 * k}" height="${30 * k}" rx="8" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><rect x="${cx - 18 * k}" y="${cy - 46 * k}" width="${36 * k}" height="${16 * k}" rx="6" fill="#0d1620"/>${eyes(p, r, cx, cy - 38 * k, 4.5 * k, 2, 2, 1.3)}`;
  },
  ghost(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 74;
    let hem = '';
    for (let i = 0; i < 5; i++) hem += ` q ${-5 * k} ${10} ${-10 * k} 0`;
    const flame = r() < 0.5 ? `<path d="M${cx} ${cy - 46 * k} q -14 -10 -4 -30 q 4 12 12 6 q 4 14 -8 24" fill="${p.accent2}" opacity="0.85"/>` : `<path d="M${cx - 30 * k} ${cy - 30 * k} q -8 -16 6 -22 M${cx + 30 * k} ${cy - 30 * k} q 8 -16 -6 -22" stroke="${p.accent}" stroke-width="3" fill="none"/>`;
    const lantern = r() < 0.4 ? `<rect x="${cx + 30 * k}" y="${cy + 6}" width="14" height="20" rx="4" fill="#ffcc80" stroke="${p.line}"/><circle cx="${cx + 37 * k}" cy="${cy + 16}" r="14" fill="#ffd54f" opacity="0.35"/>` : '';
    return `<circle cx="${cx}" cy="${cy}" r="${55 * k}" fill="url(#glow-${id})" opacity="0.7"/>${flame}<path d="M${cx - 25 * k} ${cy + 30 * k} V ${cy - 10} A ${25 * k} ${30 * k} 0 0 1 ${cx + 25 * k} ${cy - 10} V ${cy + 30 * k}${hem}Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5" opacity="0.92"/><path d="M${cx - 24 * k} ${cy + 4} q -18 4 -22 18 M${cx + 24 * k} ${cy + 4} q 18 4 22 18" stroke="${p.body}" stroke-width="${7 * k}" fill="none" stroke-linecap="round"/>${lantern}${eyes(p, r, cx, cy - 8, 6 * k, c.eyeMode)}<path d="M${cx - 6} ${cy + 8} q 6 6 12 0" stroke="${p.line}" stroke-width="1.5" fill="none"/>`;
  },
  plant(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 92;
    const leaves = Array.from({ length: 5 }, (_, i) => {
      const a = -160 + i * 35 + between(r, -8, 8);
      return `<ellipse cx="${cx + Math.cos((a * Math.PI) / 180) * 30 * k}" cy="${cy - 30 * k + Math.sin((a * Math.PI) / 180) * 26 * k}" rx="${18 * k}" ry="${8 * k}" transform="rotate(${a} ${cx + Math.cos((a * Math.PI) / 180) * 30 * k} ${cy - 30 * k + Math.sin((a * Math.PI) / 180) * 26 * k})" fill="${i % 2 ? '#43a047' : '#66bb6a'}" stroke="#1b5e20"/>`;
    }).join('');
    const cap = r() < 0.5 ? `<path d="M${cx - 40 * k} ${cy - 24 * k} Q ${cx} ${cy - 80 * k} ${cx + 40 * k} ${cy - 24 * k}Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>${Array.from({ length: 5 }, () => `<circle cx="${cx + between(r, -28, 28) * k}" cy="${cy - between(r, 32, 52) * k}" r="${between(r, 3, 6)}" fill="#fff" opacity="0.85"/>`).join('')}` : `${leaves}${Array.from({ length: 6 }, (_, i) => `<ellipse cx="${cx + Math.cos(i) * 12 * k}" cy="${cy - 46 * k + Math.sin(i) * 10 * k}" rx="${9 * k}" ry="${6 * k}" transform="rotate(${i * 60} ${cx} ${cy - 46 * k})" fill="${p.accent2}" stroke="${p.line}" stroke-width="0.6"/>`).join('')}<circle cx="${cx}" cy="${cy - 46 * k}" r="${6 * k}" fill="${p.accent}"/>`;
    return `${shadow(cx, 136, 34 * k)}<path d="M${cx - 18 * k} ${cy + 40 * k} q -10 4 -16 -2 M${cx + 18 * k} ${cy + 40 * k} q 10 4 16 -2" stroke="#6d4c41" stroke-width="4" fill="none"/>${cap}<ellipse cx="${cx}" cy="${cy + 10 * k}" rx="${22 * k}" ry="${32 * k}" fill="${p.belly}" stroke="${p.line}" stroke-width="1.5"/><path d="M${cx - 20 * k} ${cy} q -16 -4 -20 10 M${cx + 20 * k} ${cy} q 16 -4 20 10" stroke="#558b2f" stroke-width="${5 * k}" fill="none" stroke-linecap="round"/>${eyes(p, r, cx, cy, 6 * k, c.eyeMode)}<path d="M${cx - 5} ${cy + 14 * k} q 5 5 10 0" stroke="${p.line}" stroke-width="1.5" fill="none"/>`;
  },
  slime(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 100;
    const drips = Array.from({ length: 3 }, () => `<path d="M${cx + between(r, -30, 30) * k} ${cy + 10} q 3 ${between(r, 8, 16)} 6 0" fill="${p.body}"/>`).join('');
    const crown = r() < 0.35 ? `<path d="M${cx - 14} ${cy - 44 * k} l 4 -14 l 6 8 l 4 -12 l 4 12 l 6 -8 l 4 14Z" fill="#ffd54f" stroke="${p.line}"/>` : r() < 0.5 ? `<circle cx="${cx}" cy="${cy - 10 * k}" r="${9 * k}" fill="${p.accent}" opacity="0.6"/>` : '';
    const tent = r() < 0.5 ? Array.from({ length: 4 }, (_, i) => `<path d="M${cx - 24 * k + i * 16 * k} ${cy + 18 * k} q ${between(r, -8, 8)} 20 ${between(r, -4, 4)} 32" stroke="${p.body}" stroke-width="${5 * k}" fill="none" stroke-linecap="round" opacity="0.8"/>`).join('') : '';
    return `${shadow(cx, 132, 42 * k)}${tent}<path d="M${cx - 42 * k} ${cy + 22 * k} Q ${cx - 46 * k} ${cy - 46 * k} ${cx} ${cy - 46 * k} Q ${cx + 46 * k} ${cy - 46 * k} ${cx + 42 * k} ${cy + 22 * k}Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5" opacity="0.93"/>${drips}<ellipse cx="${cx - 18 * k}" cy="${cy - 26 * k}" rx="${8 * k}" ry="${5 * k}" fill="#fff" opacity="0.6"/>${crown}${eyes(p, r, cx, cy - 8 * k, 7 * k, c.eyeMode)}<path d="M${cx - 8} ${cy + 8 * k} q 8 8 16 0" stroke="${p.line}" stroke-width="2" fill="none"/>`;
  },
  knight(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 82;
    const weapon = pick(r, ['sword', 'spear', 'staff', 'twin']);
    let w = '';
    if (weapon === 'sword' || weapon === 'twin') w += `<path d="M${cx + 30 * k} ${cy + 10} L${cx + 52 * k} ${cy - 50 * k}" stroke="#e0e7ef" stroke-width="${5 * k}" stroke-linecap="round"/><path d="M${cx + 24 * k} ${cy + 2} l 14 6" stroke="${p.accent}" stroke-width="4"/>`;
    if (weapon === 'twin') w += `<path d="M${cx - 30 * k} ${cy + 10} L${cx - 52 * k} ${cy - 50 * k}" stroke="#e0e7ef" stroke-width="${5 * k}" stroke-linecap="round"/>`;
    if (weapon === 'spear') w += `<path d="M${cx + 34 * k} ${cy + 40} L${cx + 40 * k} ${cy - 60 * k}" stroke="#8d6e63" stroke-width="3"/><path d="M${cx + 40 * k} ${cy - 72 * k} l -6 14 h 12z" fill="#e0e7ef" stroke="${p.line}"/>`;
    if (weapon === 'staff') w += `<path d="M${cx + 34 * k} ${cy + 40} L${cx + 36 * k} ${cy - 50 * k}" stroke="#8d6e63" stroke-width="3"/><circle cx="${cx + 36 * k}" cy="${cy - 56 * k}" r="${8 * k}" fill="${p.eye}" stroke="#fff"/><circle cx="${cx + 36 * k}" cy="${cy - 56 * k}" r="${16 * k}" fill="url(#glow-${id})"/>`;
    const cape = `<path d="M${cx - 22 * k} ${cy - 26 * k} Q ${cx - 46 * k} ${cy + 20} ${cx - 34 * k} ${cy + 48 * k} H ${cx + 34 * k} Q ${cx + 46 * k} ${cy + 20} ${cx + 22 * k} ${cy - 26 * k}Z" fill="${p.accent}" stroke="${p.line}" opacity="0.9"/>`;
    const shield = weapon !== 'twin' && r() < 0.6 ? `<path d="M${cx - 44 * k} ${cy - 10} h ${24 * k} v ${20 * k} q 0 ${16 * k} ${-12 * k} ${22 * k} q ${-12 * k} ${-6 * k} ${-12 * k} ${-22 * k}Z" fill="${p.bodyLight}" stroke="${p.line}" stroke-width="1.5"/><circle cx="${cx - 32 * k}" cy="${cy + 6 * k}" r="${5 * k}" fill="${p.eye}"/>` : '';
    const plume = r() < 0.6 ? `<path d="M${cx} ${cy - 54 * k} q 10 -16 26 -10 q -10 4 -14 16" fill="${p.accent2}" stroke="${p.line}" stroke-width="0.8"/>` : horn(p, cx - 10, cy - 50 * k, 16 * k, -120, 1) + horn(p, cx + 10, cy - 50 * k, 16 * k, -60, 1);
    return `${shadow(cx, 138, 36 * k)}${cape}<rect x="${cx - 16 * k}" y="${cy + 24 * k}" width="${12 * k}" height="${24 * k}" fill="${p.bodyDark}" stroke="${p.line}"/><rect x="${cx + 4 * k}" y="${cy + 24 * k}" width="${12 * k}" height="${24 * k}" fill="${p.bodyDark}" stroke="${p.line}"/><path d="M${cx - 22 * k} ${cy - 24 * k} h ${44 * k} l ${-4 * k} ${50 * k} h ${-36 * k}Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><path d="M${cx} ${cy - 20 * k} v ${40 * k}" stroke="${p.accent2}" stroke-width="2"/>${w}${shield}${plume}<path d="M${cx - 16 * k} ${cy - 30 * k} Q ${cx - 18 * k} ${cy - 58 * k} ${cx} ${cy - 58 * k} Q ${cx + 18 * k} ${cy - 58 * k} ${cx + 16 * k} ${cy - 30 * k}Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><rect x="${cx - 12 * k}" y="${cy - 46 * k}" width="${24 * k}" height="${7 * k}" rx="3" fill="#0d1620"/>${eyes(p, r, cx, cy - 42.5 * k, 3.4 * k, 2, 2, 1.6)}`;
  },
  turtle(c) {
    const { p, r, id, size: k } = c;
    const cx = 96, cy = 96;
    const plates = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return `<polygon points="${[0, 1, 2, 3, 4, 5].map((j) => `${cx + Math.cos(a) * 18 * k + Math.cos((j / 6) * Math.PI * 2) * 9 * k},${cy - 12 * k + Math.sin(a) * 10 * k + Math.sin((j / 6) * Math.PI * 2) * 7 * k}`).join(' ')}" fill="${p.accent}" opacity="0.55" stroke="${p.line}" stroke-width="0.6"/>`;
    }).join('');
    const top = r();
    const deco = top < 0.33 ? `<path d="M${cx - 10} ${cy - 38 * k} l 10 -22 l 10 22Z" fill="#4e342e"/><path d="M${cx - 4} ${cy - 52 * k} q 4 -14 8 0" fill="#ff7043"/>` : top < 0.66 ? `${horn(p, cx - 14, cy - 34 * k, 18 * k, -110, 1)}${horn(p, cx + 6, cy - 36 * k, 22 * k, -80, 1)}` : `<rect x="${cx - 12}" y="${cy - 50 * k}" width="24" height="14" fill="#cfd8dc" stroke="${p.line}"/><path d="M${cx - 12} ${cy - 50 * k} l 4 -6 l 4 6 l 4 -6 l 4 6 l 4 -6 l 4 6" fill="#cfd8dc" stroke="${p.line}"/>`;
    return `${shadow(cx, 136, 50 * k)}<ellipse cx="${cx - 30 * k}" cy="${cy + 20 * k}" rx="10" ry="8" fill="${p.belly}" stroke="${p.line}"/><ellipse cx="${cx + 26 * k}" cy="${cy + 20 * k}" rx="10" ry="8" fill="${p.belly}" stroke="${p.line}"/><path d="M${cx + 40 * k} ${cy} q 20 -6 26 -20" stroke="${p.belly}" stroke-width="${14 * k}" fill="none" stroke-linecap="round"/><circle cx="${cx + 64 * k}" cy="${cy - 22 * k}" r="${12 * k}" fill="${p.belly}" stroke="${p.line}" stroke-width="1.5"/>${eyes(p, r, cx + 66 * k, cy - 25 * k, 4 * k, c.eyeMode, 1)}<path d="M${cx - 46 * k} ${cy + 12 * k} Q ${cx - 46 * k} ${cy - 42 * k} ${cx} ${cy - 42 * k} Q ${cx + 46 * k} ${cy - 42 * k} ${cx + 46 * k} ${cy + 12 * k}Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>${plates}<path d="M${cx - 48 * k} ${cy + 12 * k} h ${96 * k}" stroke="${p.bodyDark}" stroke-width="4"/>${deco}`;
  },
  fairy(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 78;
    const wings = [-1, 1].map((s) => `<path d="M${cx} ${cy} C ${cx + s * 50 * k} ${cy - 50 * k} ${cx + s * 60 * k} ${cy + 10} ${cx} ${cy + 6}Z" fill="${p.accent2}" opacity="0.5" stroke="${p.bodyLight}"/><path d="M${cx} ${cy + 8} C ${cx + s * 40 * k} ${cy + 10} ${cx + s * 36 * k} ${cy + 44 * k} ${cx} ${cy + 14}Z" fill="${p.accent}" opacity="0.45" stroke="${p.bodyLight}"/>`).join('');
    const hair = pick(r, [0, 1, 2]);
    const hairS = hair === 0 ? `<path d="M${cx - 16 * k} ${cy - 24 * k} Q ${cx} ${cy - 56 * k} ${cx + 16 * k} ${cy - 24 * k} Q ${cx + 24 * k} ${cy} ${cx + 18 * k} ${cy + 10}" fill="${p.body}" stroke="${p.line}"/>` : hair === 1 ? `<path d="M${cx - 18 * k} ${cy - 20 * k} Q ${cx} ${cy - 54 * k} ${cx + 18 * k} ${cy - 20 * k} Q ${cx + 30 * k} ${cy + 20} ${cx + 10} ${cy + 26} M${cx - 18 * k} ${cy - 20 * k} Q ${cx - 30 * k} ${cy + 20} ${cx - 10} ${cy + 26}" fill="${p.body}" stroke="${p.line}"/>` : `<circle cx="${cx}" cy="${cy - 30 * k}" r="${17 * k}" fill="${p.body}" stroke="${p.line}"/><circle cx="${cx - 16 * k}" cy="${cy - 40 * k}" r="${7 * k}" fill="${p.body}" stroke="${p.line}"/><circle cx="${cx + 16 * k}" cy="${cy - 40 * k}" r="${7 * k}" fill="${p.body}" stroke="${p.line}"/>`;
    const halo = r() < 0.5 ? `<ellipse cx="${cx}" cy="${cy - 50 * k}" rx="${14 * k}" ry="${4 * k}" fill="none" stroke="#fff59d" stroke-width="2.5"/>` : `<path d="M${cx - 10} ${cy - 44 * k} l 4 -8 l 6 6 l 6 -6 l 4 8z" fill="${p.accent}" stroke="${p.line}" stroke-width="0.8"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${58 * k}" fill="url(#glow-${id})"/>${wings}<path d="M${cx - 14 * k} ${cy + 4} L${cx - 22 * k} ${cy + 44 * k} H ${cx + 22 * k} L${cx + 14 * k} ${cy + 4}Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/><path d="M${cx - 14 * k} ${cy + 10} q -16 6 -20 -10 M${cx + 14 * k} ${cy + 10} q 16 6 20 -10" stroke="#ffe0c8" stroke-width="${4 * k}" fill="none" stroke-linecap="round"/>${hairS}<circle cx="${cx}" cy="${cy - 22 * k}" r="${14 * k}" fill="#ffe0c8" stroke="${p.line}"/>${halo}${eyes(p, r, cx, cy - 22 * k, 4 * k, 0)}<path d="M${cx - 3} ${cy - 14 * k} q 3 3 6 0" stroke="${p.line}" fill="none"/>${Array.from({ length: 6 }, () => `<path d="M${cx + between(r, -60, 60)} ${cy + between(r, -40, 50)} l 2 -5 l 2 5 l 5 2 l -5 2 l -2 5 l -2 -5 l -5 -2z" fill="#fff" opacity="0.8"/>`).join('')}`;
  },
  crab(c) {
    const { p, r, id, size: k } = c;
    const cx = 100, cy = 96;
    const legs = [-1, 1].flatMap((s) => [0, 1, 2].map((i) => `<path d="M${cx + s * 22 * k} ${cy + 4 + i * 6} l ${s * 22 * k} ${4 + i * 4} l ${s * 4} ${14}" stroke="${p.bodyDark}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`)).join('');
    const big = r() < 0.5 ? 1 : 0;
    const claw = (s: number, sc: number) => `<path d="M${cx + s * 26 * k} ${cy - 8} q ${s * 16} -16 ${s * 22 * k} -30" stroke="${p.body}" stroke-width="${7 * k}" fill="none"/><path d="M${cx + s * 46 * k} ${cy - 40 * k} m ${-12 * sc} 0 a ${14 * sc * k} ${12 * sc * k} 0 1 1 ${24 * sc} 6 l ${-10 * sc} 2 l ${8 * sc} -10 Z" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>`;
    return `${shadow(cx, 134, 48 * k)}${legs}${claw(-1, big ? 1.4 : 1)}${claw(1, 1)}<ellipse cx="${cx}" cy="${cy}" rx="${34 * k}" ry="${22 * k}" fill="url(#bd-${id})" stroke="${p.line}" stroke-width="1.5"/>${pattern(p, r, cx, cy, 30 * k, 18 * k, 1)}<path d="M${cx - 10} ${cy - 18 * k} v -14 M${cx + 10} ${cy - 18 * k} v -14" stroke="${p.line}" stroke-width="2"/>${eyes(p, r, cx, cy - 32 * k, 5 * k, c.eyeMode, 2, 1.6)}<path d="M${cx - 8} ${cy + 4} q 8 6 16 0" stroke="${p.line}" stroke-width="1.5" fill="none"/>`;
  },
};

// ---------- 魔法・アイテム ----------
const EL_GLYPH: Record<Element, string> = {
  fire: 'M0 -18 C 10 -6 12 4 0 16 C -12 4 -10 -6 0 -18Z',
  water: 'M0 -18 C 12 0 12 14 0 16 C -12 14 -12 0 0 -18Z',
  wind: 'M-14 -4 Q 0 -18 12 -6 Q 4 -2 -4 -4 M-12 6 Q 4 -6 14 6 Q 4 8 -4 6',
  earth: 'M-16 12 L-4 -12 L4 2 L8 -6 L16 12Z',
  light: 'M0 -18 L4 -4 L18 0 L4 4 L0 18 L-4 4 L-18 0 L-4 -4Z',
  dark: 'M6 -16 A 16 16 0 1 0 6 16 A 12 12 0 1 1 6 -16Z',
};

function spell(def: CardDef, p: Pal, r: R, id: string): string {
  const cx = 100, cy = 76;
  const rings = 2 + Math.floor(r() * 2);
  let s = `<circle cx="${cx}" cy="${cy}" r="62" fill="url(#glow-${id})"/>`;
  for (let i = 0; i < rings; i++) {
    const rr = 50 - i * 13;
    s += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${i % 2 ? p.accent2 : '#fff'}" stroke-width="${i === 0 ? 2.5 : 1.5}" opacity="0.85" stroke-dasharray="${i === 1 ? '6 4' : 'none'}"/>`;
  }
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    s += `<rect x="${cx + Math.cos(a) * 44 - 3}" y="${cy + Math.sin(a) * 44 - 3}" width="6" height="6" transform="rotate(${(a * 180) / Math.PI + 45} ${cx + Math.cos(a) * 44} ${cy + Math.sin(a) * 44})" fill="${p.accent2}"/>`;
  }
  const poly = 3 + Math.floor(r() * 4);
  s += `<polygon points="${Array.from({ length: poly }, (_, i) => `${cx + Math.cos((i / poly) * Math.PI * 2 - Math.PI / 2) * 36},${cy + Math.sin((i / poly) * Math.PI * 2 - Math.PI / 2) * 36}`).join(' ')}" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.8"/>`;
  s += `<g transform="translate(${cx} ${cy}) scale(1.6)"><path d="${EL_GLYPH[def.el]}" fill="${p.bodyLight}" stroke="#fff" stroke-width="1.2"/></g>`;
  // 効果の種類を表すしるし
  const kind = def.fx?.[0]?.do ?? 'buff';
  const mark: Record<string, string> = {
    dmg: `<path d="M${cx + 30} ${cy - 40} l 10 14 l -8 0 l 10 16" stroke="#fff176" stroke-width="3" fill="none"/>`,
    heal: `<path d="M${cx + 36} ${cy - 44} v 20 m -10 -10 h 20" stroke="#a5ff9e" stroke-width="5"/>`,
    destroy: `<path d="M${cx + 26} ${cy - 46} l 20 20 m 0 -20 l -20 20" stroke="#ff5252" stroke-width="4"/>`,
    draw: `<rect x="${cx + 28}" y="${cy - 48}" width="14" height="20" rx="2" fill="#fff" transform="rotate(12 ${cx + 35} ${cy - 38})"/>`,
    shield: `<path d="M${cx + 28} ${cy - 48} h 16 v 10 q 0 10 -8 14 q -8 -4 -8 -14z" fill="#90caf9" stroke="#fff"/>`,
  };
  s += mark[kind] ?? '';
  for (let i = 0; i < 10; i++) s += `<circle cx="${between(r, 20, 180)}" cy="${between(r, 10, 140)}" r="${between(r, 0.8, 2.2)}" fill="#fff" opacity="0.8"/>`;
  return s;
}

const ITEMS: Record<string, (p: Pal) => string> = {
  sword: (p) => `<path d="M100 18 L110 30 L104 100 L96 100 L90 30Z" fill="#e3e9f0" stroke="#455a64" stroke-width="1.5"/><path d="M100 22 V96" stroke="#fff" stroke-width="1.5"/><rect x="78" y="98" width="44" height="8" rx="3" fill="${p.accent}" stroke="#333"/><rect x="96" y="106" width="8" height="22" fill="#6d4c41"/><circle cx="100" cy="132" r="6" fill="${p.eye}" stroke="#333"/>`,
  shield: (p) => `<path d="M60 30 H140 V70 Q140 112 100 130 Q60 112 60 70Z" fill="${p.body}" stroke="#3e2723" stroke-width="3"/><path d="M72 40 H128 V70 Q128 102 100 116 Q72 102 72 70Z" fill="${p.bodyLight}" opacity="0.6"/><circle cx="100" cy="72" r="14" fill="${p.accent}" stroke="#333"/>`,
  boots: (p) => `<path d="M70 30 h28 v60 h26 q10 0 10 14 v10 h-64z" fill="${p.body}" stroke="#333" stroke-width="2"/><path d="M60 40 q-16 -10 -10 -24 q10 12 24 10 M116 70 q20 -6 22 -24 q-14 10 -26 8" fill="#fff" stroke="#90a4ae"/>`,
  pendant: (p) => `<path d="M60 20 Q100 80 140 20" stroke="#ffd54f" stroke-width="3" fill="none"/><polygon points="100,62 120,86 100,124 80,86" fill="${p.accent2}" stroke="#fff" stroke-width="2"/><polygon points="100,70 112,86 100,112 88,86" fill="${p.accent}"/>`,
  gun: (p) => `<rect x="56" y="58" width="80" height="26" rx="12" fill="${p.accent}" stroke="#333" stroke-width="2"/><rect x="134" y="66" width="18" height="10" fill="#90caf9"/><path d="M80 84 l -8 34 h 20 l 6 -34z" fill="${p.bodyDark}" stroke="#333"/><circle cx="96" cy="50" r="12" fill="#81d4fa" stroke="#0277bd"/>${[0, 1, 2].map((i) => `<circle cx="${160 + i * 10}" cy="${70 + (i % 2) * 6}" r="${4 - i}" fill="#e1f5fe"/>`).join('')}`,
  potion: (p) => `<path d="M88 24 h24 v22 q28 14 28 46 q0 34 -40 34 q-40 0 -40 -34 q0 -32 28 -46z" fill="${p.body}" stroke="#333" stroke-width="2" opacity="0.9"/><rect x="86" y="16" width="28" height="12" rx="3" fill="#8d6e63"/><ellipse cx="86" cy="80" rx="8" ry="14" fill="#fff" opacity="0.5"/>`,
  glove: (p) => `<path d="M64 100 v-40 q0-8 8-8 v-20 q0-8 8-8 q8 0 8 8 v-8 q0-8 8-8 q8 0 8 8 v8 q0-8 8-8 q8 0 8 8 v24 l10-10 q10 0 8 12 l-20 32 v20z" fill="${p.body}" stroke="#333" stroke-width="2"/><path d="M80 18 q -8 -14 4 -18 q 0 10 8 8 q 4 10 -6 16" fill="#ffab40"/>`,
  armor: (p) => `<path d="M60 40 l20-16 h40 l20 16 v20 l-14 6 v54 h-52 v-54 l-14 -6z" fill="${p.body}" stroke="#263238" stroke-width="2.5"/><path d="M80 24 q20 20 40 0" fill="none" stroke="#263238" stroke-width="2"/><path d="M100 46 v66" stroke="${p.accent}" stroke-width="3"/>`,
  dice: (p) => `<rect x="62" y="40" width="70" height="70" rx="12" fill="#fff" stroke="#333" stroke-width="2.5" transform="rotate(-12 97 75)"/>${[[80, 58], [97, 75], [114, 92], [80, 92], [114, 58]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${p.accent}"/>`).join('')}`,
  cloak: (p) => `<path d="M80 22 h40 l30 110 h-100z" fill="${p.body}" stroke="#111" stroke-width="2" opacity="0.85"/><path d="M80 22 q20 18 40 0" fill="${p.bodyDark}"/><circle cx="100" cy="30" r="5" fill="${p.accent}"/>`,
  bracelet: (p) => `<ellipse cx="100" cy="76" rx="44" ry="30" fill="none" stroke="${p.accent}" stroke-width="12"/><ellipse cx="100" cy="76" rx="44" ry="30" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="6 6"/><polygon points="100,40 110,50 100,60 90,50" fill="${p.eye}"/>`,
  scale: (p) => `<path d="M100 20 Q150 50 136 100 Q120 130 100 132 Q80 130 64 100 Q50 50 100 20Z" fill="${p.body}" stroke="#4e342e" stroke-width="2"/><path d="M100 30 Q130 60 120 100 M100 30 Q70 60 80 100" stroke="${p.bodyLight}" stroke-width="3" fill="none"/>`,
  ring: (p) => `<circle cx="100" cy="86" r="34" fill="none" stroke="#ffd54f" stroke-width="10"/><polygon points="100,30 116,46 100,62 84,46" fill="${p.accent2}" stroke="#fff" stroke-width="2"/>`,
  case: (p) => `<rect x="60" y="34" width="80" height="90" rx="10" fill="${p.body}" stroke="#333" stroke-width="2"/><rect x="70" y="44" width="60" height="70" rx="6" fill="${p.bodyLight}"/><path d="M90 60 l10 20 l10 -20" stroke="${p.accent}" stroke-width="4" fill="none"/>`,
  bandage: () => `<rect x="40" y="62" width="120" height="34" rx="16" fill="#ffccbc" stroke="#8d6e63" stroke-width="2" transform="rotate(-20 100 79)"/><rect x="82" y="64" width="36" height="30" fill="#fff3e0" transform="rotate(-20 100 79)"/>`,
  bomb: (p) => `<circle cx="100" cy="88" r="36" fill="#37474f" stroke="#111" stroke-width="2"/><path d="M118 56 q 14 -20 30 -14" stroke="#8d6e63" stroke-width="4" fill="none"/><path d="M148 38 l6 -10 l2 12 l10 -4 l-8 10z" fill="#ffca28"/><ellipse cx="86" cy="74" rx="8" ry="12" fill="#fff" opacity="0.3"/><circle cx="100" cy="88" r="54" fill="${p.bodyLight}" opacity="0.15"/>`,
  club: (p) => `<path d="M90 130 L80 50 Q86 20 110 22 Q130 30 120 60 L106 130Z" fill="#8d6e63" stroke="#3e2723" stroke-width="2"/>${[[96, 40], [116, 44], [92, 62], [114, 66], [104, 30]].map(([x, y]) => `<path d="M${x} ${y} l 8 -4 l -2 8z" fill="${p.accent}"/>`).join('')}`,
  can: (p) => `<path d="M60 60 h60 v56 h-60z" fill="${p.body}" stroke="#333" stroke-width="2"/><path d="M120 70 l40 -30 l6 8 l-40 32" fill="${p.bodyDark}" stroke="#333"/>${[0, 1, 2, 3].map((i) => `<path d="M${166 + i * 4} ${48 + i * 8} q 2 6 0 10" stroke="#4fc3f7" stroke-width="2" fill="none"/>`).join('')}<path d="M64 60 q30 -26 52 0" stroke="#333" stroke-width="3" fill="none"/>`,
  magnet: () => `<path d="M60 30 h26 v50 q0 16 14 16 q14 0 14 -16 v-50 h26 v50 q0 42 -40 42 q-40 0 -40 -42z" fill="#e53935" stroke="#333" stroke-width="2"/><rect x="60" y="30" width="26" height="16" fill="#eceff1"/><rect x="114" y="30" width="26" height="16" fill="#eceff1"/>`,
  map: (p) => `<path d="M40 40 l40 -12 l40 12 l40 -12 v90 l-40 12 l-40 -12 l-40 12z" fill="#ffe0b2" stroke="#8d6e63" stroke-width="2"/><path d="M60 70 q 20 -30 40 0 t 40 10" stroke="#8d6e63" stroke-dasharray="4 4" fill="none" stroke-width="2"/><path d="M132 74 l10 10 m0 -10 l-10 10" stroke="${p.accent}" stroke-width="4"/>`,
  lamp: (p) => `<path d="M80 40 h40 l10 60 h-60z" fill="#37474f" stroke="#111" stroke-width="2"/><rect x="86" y="50" width="28" height="40" fill="${p.accent}" opacity="0.9"/><circle cx="100" cy="70" r="40" fill="${p.accent}" opacity="0.25"/><path d="M90 40 q10 -20 20 0" stroke="#111" stroke-width="3" fill="none"/>`,
  wing: () => `<path d="M70 120 Q60 60 110 26 Q100 60 130 52 Q110 80 140 82 Q110 100 120 120Z" fill="#fff" stroke="#b0bec5" stroke-width="2"/><path d="M80 110 Q84 70 108 44" stroke="#cfd8dc" stroke-width="2" fill="none"/>`,
  rock: (p) => `<path d="M58 110 L52 70 L80 40 L126 36 L150 70 L144 110Z" fill="#78909c" stroke="#37474f" stroke-width="2"/><path d="M90 60 l10 10 l-6 12" stroke="#37474f" fill="none" stroke-width="2"/><path d="M120 34 q6 -16 18 -18" stroke="#8d6e63" stroke-width="3" fill="none"/><circle cx="140" cy="14" r="5" fill="${p.accent}"/>`,
  hourglass: (p) => `<rect x="66" y="20" width="68" height="10" rx="3" fill="#8d6e63"/><rect x="66" y="122" width="68" height="10" rx="3" fill="#8d6e63"/><path d="M74 30 h52 q0 30 -22 46 q22 16 22 46 h-52 q0 -30 22 -46 q-22 -16 -22 -46z" fill="#e3f2fd" stroke="#455a64" stroke-width="2" opacity="0.9"/><path d="M84 112 q16 -14 32 0 v10 h-32z M92 46 h16 l-8 20z" fill="${p.accent2}"/>`,
  crown: (p) => `<path d="M50 110 L44 50 L74 76 L100 36 L126 76 L156 50 L150 110Z" fill="#ffd54f" stroke="#e65100" stroke-width="2.5"/><rect x="50" y="104" width="100" height="14" rx="4" fill="#ffca28" stroke="#e65100" stroke-width="2"/>${[[74, 90], [100, 86], [126, 90]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="7" fill="${['#e53935', p.accent, '#1e88e5'][i]}" stroke="#fff"/>`).join('')}`,
  charm: (p) => `<rect x="70" y="34" width="60" height="90" rx="8" fill="#ef9a9a" stroke="#b71c1c" stroke-width="2"/><rect x="78" y="44" width="44" height="70" rx="4" fill="#fff3e0"/><path d="M100 58 c 8 -12 22 -2 12 10 l-12 12 l-12 -12 c -10 -12 4 -22 12 -10z" fill="${p.accent}"/><path d="M100 20 v14" stroke="#ffd54f" stroke-width="3"/><circle cx="100" cy="18" r="5" fill="none" stroke="#ffd54f" stroke-width="2"/>`,
};

function rarityFx(rar: Rarity, r: R): string {
  if (rar === 'N') return '';
  const n = rar === 'R' ? 4 : rar === 'SR' ? 8 : 14;
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = between(r, 10, 190);
    const y = between(r, 8, 140);
    const sz = between(r, 2, rar === 'UR' ? 6 : 4);
    s += `<path d="M${x} ${y - sz} L${x + sz * 0.3} ${y - sz * 0.3} L${x + sz} ${y} L${x + sz * 0.3} ${y + sz * 0.3} L${x} ${y + sz} L${x - sz * 0.3} ${y + sz * 0.3} L${x - sz} ${y} L${x - sz * 0.3} ${y - sz * 0.3}Z" fill="#fff" opacity="${between(r, 0.6, 1)}"/>`;
  }
  return s;
}

const cache = new Map<string, string>();

/** カードのイラスト（SVG文字列。幅200×高さ150） */
export function cardArtSvg(def: CardDef): string {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const r = rng(def.art.seed * 31 + def.id.length);
  const id = def.id.replace(/[^a-z0-9]/gi, '');
  const p = palette(def.el, r);
  let inner = background(def.el, rng(def.art.seed + 99), id);
  inner += grads(p, id);
  if (def.type === 'monster') {
    const k = 0.78 + Math.min(7, def.lv) * 0.055;
    const flip = r() < 0.5;
    const tilt = between(r, -6, 6);
    const body = BODIES[def.art.body] ?? BODIES.beast;
    const eyeMode = def.lv >= 6 ? 2 : def.lv >= 4 ? (r() < 0.6 ? 1 : 2) : r() < 0.7 ? 0 : 1;
    const aura = def.r === 'SR' || def.r === 'UR' ? `<circle cx="100" cy="80" r="70" fill="url(#glow-${id})" opacity="${def.r === 'UR' ? 0.9 : 0.6}"/>` : '';
    inner += `${aura}<g transform="translate(100 150) rotate(${tilt}) scale(${flip ? -1 : 1} 1) translate(-100 -150)">${body({ p, r, id, lv: def.lv, size: k, eyeMode })}</g>`;
  } else if (def.type === 'magic') {
    inner += spell(def, p, r, id);
  } else {
    const kind = def.art.body.split(':')[1] ?? 'sword';
    inner += `<circle cx="100" cy="76" r="64" fill="url(#glow-${id})"/><g transform="translate(100 76) rotate(${between(r, -10, 10)}) translate(-100 -76)">${(ITEMS[kind] ?? ITEMS.sword)(p)}</g>`;
  }
  inner += rarityFx(def.r, r);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
  cache.set(def.id, svg);
  return svg;
}

export function cardArtUrl(def: CardDef): string {
  if (def.art.img) return def.art.img;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardArtSvg(def))}`;
}
