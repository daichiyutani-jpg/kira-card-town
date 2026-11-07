// 見下ろし型の街マップ。Canvas に描き、下の十字ボタンで歩く（押している間だけ動く）。
import mapsData from '../data/maps.json';
import { OPPONENTS } from '../game/collection';
import { sfx } from '../audio/sound';
import { game, h, saveSoon, showScreen } from './app';
import { drawHero } from './hero';
import { drawPersonSprite } from './person';
import { personSpec } from './people';

export interface Look {
  hair: string;
  shirt: string;
  skin: string;
  pants: string;
  hat?: string;
  apron?: string;
}
export interface Act {
  warp?: string;
  tx?: number;
  ty?: number;
  shop?: string;
  cup?: string;
  job?: string;
  talk?: string;
  desk?: boolean;
  travel?: boolean;
  forage?: string;
  kuji?: boolean;
  gacha?: boolean;
  schoolBoard?: boolean;
  rooftop?: boolean;
}
export interface Building {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
  wall: string;
  roof: string;
  label: string;
  door: { x: number; y: number };
  act: Act;
}
export interface Obj {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  kind: string;
  label: string;
  act: Act;
  walk?: boolean;
}
export interface Npc {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  look?: Look;
  name: string;
  talk?: string;
  opp?: string;
  hidden?: boolean;
}
export interface MapDef {
  name: string;
  bgm: string;
  w: number;
  h: number;
  fill: string;
  border: string;
  indoor?: boolean;
  night?: boolean;
  rects: { x: number; y: number; w: number; h: number; t: string }[];
  points: { x: number; y: number; t: string }[];
  buildings: Building[];
  objects: Obj[];
  npcs: Npc[];
  spawn: { x: number; y: number; dir: Dir };
}
export type Dir = 'up' | 'down' | 'left' | 'right';
export const MAPS = (mapsData as unknown as { maps: Record<string, MapDef> }).maps;

const BLOCK = new Set(['T', '~', 'W', 'f', 'x']);
const DXY: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export type Target = { kind: 'npc'; npc: Npc } | { kind: 'obj'; obj: Obj } | { kind: 'bld'; b: Building };

export interface FieldHooks {
  onInteract(t: Target): void;
  onStep?(x: number, y: number): void;
  overlayText?(): string | null; // ミニゲームのタイマーなど
  highlight?(): string | null; // 光らせる建物ID
  hiddenNpc?(n: Npc): boolean;
  goal?(): string;
}

export interface FieldHandle {
  map: MapDef;
  mapId: string;
  setPos(x: number, y: number, dir?: Dir): void;
  pause(p: boolean): void;
  refresh(): void;
  destroy(): void;
  pos(): { x: number; y: number; dir: Dir };
}

function buildGrid(m: MapDef): string[][] {
  const g: string[][] = [];
  for (let y = 0; y < m.h; y++) {
    g.push([]);
    for (let x = 0; x < m.w; x++) g[y].push(x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1 ? m.border : m.fill);
  }
  for (const r of m.rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (g[y]?.[x] !== undefined) g[y][x] = r.t;
  for (const p of m.points) if (g[p.y]?.[p.x] !== undefined) g[p.y][p.x] = p.t;
  return g;
}

const hash = (x: number, y: number) => {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

export function openField(mapId: string, hooks: FieldHooks, start?: { x: number; y: number; dir?: Dir }): FieldHandle {
  const m = MAPS[mapId];
  const grid = buildGrid(m);
  const p = { x: start?.x ?? m.spawn.x, y: start?.y ?? m.spawn.y, dir: (start?.dir ?? m.spawn.dir) as Dir, fx: 0, fy: 0, moving: false, t: 0 };
  p.fx = p.x;
  p.fy = p.y;
  let held: Dir | null = null;
  let paused = false;
  let alive = true;
  let frame = 0;

  const canvas = h('canvas');
  const hud = h('div', { class: 'hud' });
  const goal = h('div', { class: 'goal' });
  const timer = h('div', { class: 'minitimer', style: { display: 'none' } });
  const aBtn = h('button', { class: 'abtn', 'aria-label': 'しらべる' }, 'しらべる');
  const dpad = h('div', { class: 'dpad' });
  const mk = (d: Dir, label: string, cls: string) => {
    const b = h('button', { class: cls, 'aria-label': label }, label);
    const down = (e: Event) => {
      e.preventDefault();
      held = d;
      b.classList.add('held');
      try {
        (e as PointerEvent).pointerId !== undefined && b.setPointerCapture((e as PointerEvent).pointerId);
      } catch {
        /* */
      }
    };
    const up = () => {
      if (held === d) held = null;
      b.classList.remove('held');
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };
  dpad.append(mk('up', '▲', 'u'), mk('left', '◀', 'l'), mk('right', '▶', 'r'), mk('down', '▼', 'd'), h('div', { class: 'c' }));
  const controls = h('div', { class: 'controls' }, dpad, aBtn);
  const wrap = h('div', { style: { position: 'relative', flex: '1', minHeight: '0', display: 'flex' } }, canvas);
  const el = h('div', { class: 'screen field' }, wrap, hud, goal, timer, controls);
  showScreen(el, () => destroy());

  const ctx = canvas.getContext('2d')!;
  let TS = 32;
  let cw = 0;
  let ch = 0;
  /** 上の表示（場所・お金・目標）の高さ。地図のいちばん上がその下に隠れないよう、ここまで下げて見られるようにする */
  let topPad = 0;
  const resize = () => {
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = r.width;
    ch = r.height;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    TS = Math.max(28, Math.floor(r.width / 11));
  };
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  const keyDir: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  const kd = (e: KeyboardEvent) => {
    if (keyDir[e.key]) {
      held = keyDir[e.key];
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'z') interact();
  };
  const ku = (e: KeyboardEvent) => {
    if (keyDir[e.key] === held) held = null;
  };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  aBtn.addEventListener('click', () => interact());

  // ---------- 当たり判定 ----------
  const npcs = () => m.npcs.filter((n) => !hooks.hiddenNpc?.(n));
  function bldAt(x: number, y: number) {
    return m.buildings.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  }
  function objAt(x: number, y: number) {
    return m.objects.find((o) => x >= o.x && x < o.x + (o.w ?? 1) && y >= o.y && y < o.y + (o.h ?? 1));
  }
  function npcAt(x: number, y: number) {
    return npcs().find((n) => n.x === x && n.y === y);
  }
  function blocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
    const t = grid[y][x];
    const o = objAt(x, y);
    if (o?.walk) return false;
    if (BLOCK.has(t)) return true;
    if (bldAt(x, y)) return true;
    if (o) return true;
    if (npcAt(x, y)) return true;
    return false;
  }
  function targetAt(x: number, y: number): Target | null {
    const n = npcAt(x, y);
    if (n) return { kind: 'npc', npc: n };
    const o = objAt(x, y);
    if (o && !o.walk) return { kind: 'obj', obj: o };
    const b = bldAt(x, y);
    if (b) return { kind: 'bld', b };
    return null;
  }
  function nearTarget(): Target | null {
    const [dx, dy] = DXY[p.dir];
    const f = targetAt(p.x + dx, p.y + dy);
    if (f) return f;
    for (const d of ['up', 'down', 'left', 'right'] as Dir[]) {
      const [ax, ay] = DXY[d];
      const t = targetAt(p.x + ax, p.y + ay);
      if (t && (t.kind !== 'bld' || (t.b.door.x === p.x + ax && t.b.door.y === p.y + ay))) return t;
    }
    return null;
  }
  function interact() {
    if (paused || p.moving) return;
    const t = nearTarget();
    if (!t) return;
    // 話しかけた相手の方を向く
    if (t.kind === 'npc') {
      const dx = t.npc.x - p.x;
      const dy = t.npc.y - p.y;
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      t.npc.dir = ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[p.dir];
    }
    held = null;
    sfx('tap');
    hooks.onInteract(t);
  }

  // ---------- 更新 ----------
  let last = performance.now();
  function loop(now: number) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame++;
    if (!paused) update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  function update(dt: number) {
    const speed = 5.5;
    if (p.moving) {
      p.t += dt * speed;
      const [dx, dy] = DXY[p.dir];
      if (p.t >= 1) {
        p.x += dx;
        p.y += dy;
        p.fx = p.x;
        p.fy = p.y;
        p.moving = false;
        p.t = 0;
        game.d.pos = { map: mapId, x: p.x, y: p.y, dir: p.dir };
        saveSoon();
        const o = objAt(p.x, p.y);
        if (o?.walk) {
          held = null;
          hooks.onInteract({ kind: 'obj', obj: o });
          return;
        }
        hooks.onStep?.(p.x, p.y);
      } else {
        p.fx = p.x + dx * p.t;
        p.fy = p.y + dy * p.t;
      }
    }
    if (!p.moving && held && !paused) {
      p.dir = held;
      const [dx, dy] = DXY[held];
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!blocked(nx, ny)) {
        p.moving = true;
        p.t = 0;
      } else {
        // 扉にぶつかったら入る
        const b = bldAt(nx, ny);
        if (b && b.door.x === nx && b.door.y === ny) {
          held = null;
          sfx('tap');
          hooks.onInteract({ kind: 'bld', b });
        }
      }
    }
    // しらべるボタン
    const t = p.moving ? null : nearTarget();
    const label = !t ? 'しらべる' : t.kind === 'npc' ? 'はなす' : t.kind === 'bld' ? '入る' : 'しらべる';
    if (aBtn.textContent !== label) aBtn.textContent = label;
    aBtn.classList.toggle('ready', !!t);
    aBtn.style.opacity = t ? '1' : '0.55';
    const ot = hooks.overlayText?.() ?? null;
    timer.style.display = ot ? 'block' : 'none';
    if (ot && timer.textContent !== ot) timer.textContent = ot;
  }

  // ---------- 描画 ----------
  function drawTile(t: string, x: number, y: number, sx: number, sy: number) {
    const s = TS;
    const r = hash(x, y);
    switch (t) {
      case '.':
      case ',':
      case 'T': {
        // 草地：明るさのむら＋草の葉＋ときどき小石
        const g0 = 120 + Math.floor(r * 5) + ((x + y) % 2) * 2;
        ctx.fillStyle = `rgb(${g0 - 6},${g0 + 82},${g0 - 34})`;
        ctx.fillRect(sx, sy, s, s);
        ctx.fillStyle = 'rgba(255,255,220,.08)';
        ctx.fillRect(sx, sy, s, s * 0.5);
        const r2 = hash(x + 31, y + 17);
        ctx.strokeStyle = 'rgba(40,110,40,.55)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const bx = sx + ((r * 5 + i * 0.27) % 1) * s;
          const by = sy + ((r2 * 7 + i * 0.41) % 1) * (s - 6);
          ctx.beginPath();
          ctx.moveTo(bx, by + 5);
          ctx.lineTo(bx - 1.5, by);
          ctx.moveTo(bx + 2, by + 5);
          ctx.lineTo(bx + 3, by + 1);
          ctx.stroke();
        }
        if (r2 < 0.12) {
          ctx.fillStyle = '#b9b4a6';
          ctx.beginPath();
          ctx.ellipse(sx + s * 0.7, sy + s * 0.75, s * 0.07, s * 0.045, 0, 0, 6.3);
          ctx.fill();
        }
        if (t === ',') {
          const cols = ['#ff7aa8', '#fff36b', '#ffffff', '#ff9a52', '#b48cff'];
          for (let i = 0; i < 3; i++) {
            const fx = sx + ((r * 7 + i * 0.31) % 1) * (s - 8) + 4;
            const fy = sy + ((r * 13 + i * 0.47) % 1) * (s - 12) + 4;
            ctx.strokeStyle = '#3f8f3a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(fx, fy);
            ctx.lineTo(fx, fy + s * 0.14);
            ctx.stroke();
            ctx.fillStyle = cols[Math.floor((r * 10 + i) % cols.length)];
            for (let k = 0; k < 5; k++) {
              ctx.beginPath();
              ctx.arc(fx + Math.cos(k * 1.26) * s * 0.05, fy + Math.sin(k * 1.26) * s * 0.05, s * 0.045, 0, 6.3);
              ctx.fill();
            }
            ctx.fillStyle = '#ffd23b';
            ctx.beginPath();
            ctx.arc(fx, fy, s * 0.03, 0, 6.3);
            ctx.fill();
          }
        }
        if (t === 'T') {
          // 木：影・幹・重ねた葉・光の当たる面
          ctx.fillStyle = 'rgba(10,40,10,.28)';
          ctx.beginPath();
          ctx.ellipse(sx + s * 0.56, sy + s * 0.88, s * 0.42, s * 0.13, 0, 0, 6.3);
          ctx.fill();
          const tg = ctx.createLinearGradient(sx + s * 0.4, 0, sx + s * 0.6, 0);
          tg.addColorStop(0, '#5a3418');
          tg.addColorStop(1, '#8a5a2c');
          ctx.fillStyle = tg;
          ctx.fillRect(sx + s * 0.43, sy + s * 0.5, s * 0.14, s * 0.38);
          const dark = r < 0.5 ? '#1f6b2c' : '#246f22';
          const mid = r < 0.5 ? '#2f8f3a' : '#3a9a2f';
          const blobs: [number, number, number, string][] = [
            [0.5, 0.48, 0.4, dark],
            [0.36, 0.4, 0.26, mid],
            [0.64, 0.38, 0.26, mid],
            [0.5, 0.26, 0.27, mid],
            [0.4, 0.24, 0.14, '#5cc456'],
            [0.56, 0.18, 0.1, '#7fd86a'],
          ];
          for (const [bx, by, br, c] of blobs) {
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(sx + s * bx, sy + s * by, s * br, 0, 6.3);
            ctx.fill();
          }
        }
        break;
      }
      case '=': {
        // 石だたみの道：互い違いの石＋目地＋光
        const v = (x * 7 + y * 3) % 3;
        ctx.fillStyle = ['#cfc6b4', '#c8bfac', '#d4ccbb'][v];
        ctx.fillRect(sx, sy, s, s);
        ctx.strokeStyle = 'rgba(120,108,90,.45)';
        ctx.lineWidth = 1;
        const off = ((x + y) % 2) * s * 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy + s * 0.5);
        ctx.lineTo(sx + s, sy + s * 0.5);
        ctx.moveTo(sx, sy + 0.5);
        ctx.lineTo(sx + s, sy + 0.5);
        const xa = sx + ((off + s * 0.25) % s);
        const xb = sx + ((off + s * 0.75) % s);
        ctx.moveTo(xa, sy);
        ctx.lineTo(xa, sy + s * 0.5);
        ctx.moveTo(xb, sy + s * 0.5);
        ctx.lineTo(xb, sy + s);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(sx + 2, sy + 2, s * 0.4, 2);
        if (r < 0.3) {
          ctx.fillStyle = 'rgba(90,80,60,.16)';
          ctx.fillRect(sx + r * s * 2, sy + s * 0.65, s * 0.18, s * 0.12);
        }
        break;
      }
      case ':': {
        // 歩道の敷石：4枚の石＋明るい上辺と暗い下辺（立体感）＋ときどき汚れ
        ctx.fillStyle = '#b8a98e';
        ctx.fillRect(sx, sy, s, s);
        const hs = s / 2;
        for (let j = 0; j < 4; j++) {
          const px = sx + (j % 2) * hs;
          const py = sy + Math.floor(j / 2) * hs;
          const v = hash(x * 2 + (j % 2), y * 2 + Math.floor(j / 2));
          ctx.fillStyle = v < 0.33 ? '#e4d9c6' : v < 0.66 ? '#dccfb8' : '#d3c5ac';
          ctx.fillRect(px + 1, py + 1, hs - 2, hs - 2);
          ctx.fillStyle = 'rgba(255,255,255,.35)';
          ctx.fillRect(px + 1, py + 1, hs - 2, 1.5);
          ctx.fillStyle = 'rgba(90,70,40,.18)';
          ctx.fillRect(px + 1, py + hs - 2.5, hs - 2, 1.5);
        }
        if (r < 0.08) {
          ctx.fillStyle = 'rgba(80,90,40,.25)';
          ctx.beginPath();
          ctx.ellipse(sx + s * 0.5, sy + s * 0.5, s * 0.12, s * 0.06, 0.4, 0, 6.3);
          ctx.fill();
        }
        break;
      }
      case '~': {
        // 水：深さのグラデーション＋岸の明るい縁＋ゆれる光
        const wg = ctx.createLinearGradient(0, sy, 0, sy + s);
        wg.addColorStop(0, '#3fa6ec');
        wg.addColorStop(1, '#2a86d0');
        ctx.fillStyle = wg;
        ctx.fillRect(sx, sy, s, s);
        const up = grid[y - 1]?.[x];
        if (up && up !== '~' && up !== 'b') {
          ctx.fillStyle = 'rgba(255,255,255,.45)';
          ctx.fillRect(sx, sy, s, 3);
          ctx.fillStyle = 'rgba(0,40,80,.25)';
          ctx.fillRect(sx, sy + 3, s, 4);
        }
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 2;
        const w = Math.sin(frame / 20 + x + y) * 3;
        ctx.beginPath();
        ctx.moveTo(sx + 4, sy + s * 0.4 + w);
        ctx.quadraticCurveTo(sx + s / 2, sy + s * 0.3 + w, sx + s - 4, sy + s * 0.4 + w);
        ctx.stroke();
        const tw = (Math.sin(frame / 15 + r * 20) + 1) / 2;
        ctx.fillStyle = `rgba(255,255,255,${0.15 + tw * 0.5})`;
        ctx.fillRect(sx + r * s * 0.8 + 3, sy + s * 0.72, 3, 2);
        break;
      }
      case 'b':
        ctx.fillStyle = '#3aa0e8';
        ctx.fillRect(sx, sy, s, s);
        ctx.fillStyle = '#b07a44';
        ctx.fillRect(sx, sy + 2, s, s - 4);
        ctx.fillStyle = '#8a5a2c';
        for (let i = 0; i < 4; i++) ctx.fillRect(sx + (i * s) / 4, sy + 2, 2, s - 4);
        break;
      case 's': {
        // 踏み固めた土：色むら＋小石＋ときどき足あと
        const v = Math.floor(r * 6);
        ctx.fillStyle = `rgb(${210 + v},${186 + v},${132 + v})`;
        ctx.fillRect(sx, sy, s, s);
        const r2 = hash(x + 7, y + 13);
        ctx.fillStyle = 'rgba(120,90,50,.28)';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(sx + ((r * 3 + i * 0.29) % 1) * s, sy + ((r2 * 5 + i * 0.37) % 1) * s, 1.3 + ((i + v) % 2), 0, 6.3);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.beginPath();
        ctx.arc(sx + ((r2 * 9) % 1) * s, sy + ((r * 11) % 1) * s, 1.5, 0, 6.3);
        ctx.fill();
        if (r2 < 0.1) {
          ctx.fillStyle = 'rgba(110,80,40,.18)';
          ctx.beginPath();
          ctx.ellipse(sx + s * 0.35, sy + s * 0.4, s * 0.06, s * 0.1, 0.2, 0, 6.3);
          ctx.ellipse(sx + s * 0.6, sy + s * 0.65, s * 0.06, s * 0.1, 0.2, 0, 6.3);
          ctx.fill();
        }
        break;
      }
      case '_':
        ctx.fillStyle = (y % 2) ? '#d9a86a' : '#d19e60';
        ctx.fillRect(sx, sy, s, s);
        ctx.fillStyle = '#b98448';
        ctx.fillRect(sx, sy + s - 2, s, 2);
        ctx.fillRect(sx + ((y % 2) * s) / 2, sy, 2, s);
        break;
      case 'k':
        ctx.fillStyle = '#c94a5a';
        ctx.fillRect(sx, sy, s, s);
        ctx.fillStyle = '#e06a78';
        ctx.fillRect(sx + 3, sy + 3, s - 6, s - 6);
        break;
      case 'W':
        ctx.fillStyle = '#efe4cf';
        ctx.fillRect(sx, sy, s, s);
        ctx.fillStyle = '#c7b89a';
        ctx.fillRect(sx, sy + s - 6, s, 6);
        break;
      case 'f':
        ctx.fillStyle = '#d8cab2';
        ctx.fillRect(sx, sy, s, s);
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx, sy + s * 0.35, s, 4);
        ctx.fillRect(sx, sy + s * 0.65, s, 4);
        ctx.fillRect(sx + 4, sy + s * 0.2, 4, s * 0.7);
        ctx.fillRect(sx + s - 8, sy + s * 0.2, 4, s * 0.7);
        break;
      case 'x':
        ctx.fillStyle = '#d8cab2';
        ctx.fillRect(sx, sy, s, s);
        break;
      default:
        ctx.fillStyle = '#7ccf5e';
        ctx.fillRect(sx, sy, s, s);
    }
  }

  /** 色を明るく（k>0）・暗く（k<0）する */
  function shadeHex(hex: string, k: number): string {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  /** 屋台の正面：両わきの柱・木のカウンター・並んだ品物・つり下げの灯り */
  function drawStallFront(b: Building, x: number, y: number, w: number, hh: number, roofH: number) {
    const s = TS;
    const top = y + roofH + 4;
    // 奥の暗がり
    ctx.fillStyle = 'rgba(40,20,10,.55)';
    ctx.fillRect(x + 4, top, w - 8, hh - roofH - s * 0.55);
    // 柱
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(x, y + 4, s * 0.12, hh - 4);
    ctx.fillRect(x + w - s * 0.12, y + 4, s * 0.12, hh - 4);
    // つり下げの電球
    const n = Math.max(2, b.w);
    for (let i = 0; i < n; i++) {
      const bx = x + ((i + 0.5) * w) / n;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, top);
      ctx.lineTo(bx, top + s * 0.18);
      ctx.stroke();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(bx, top + s * 0.22, s * 0.06, 0, 6.3);
      ctx.fill();
    }
    // カウンター
    const cy = y + hh - s * 0.62;
    const cg = ctx.createLinearGradient(0, cy, 0, y + hh);
    cg.addColorStop(0, '#c58b4e');
    cg.addColorStop(1, '#8d5a2b');
    ctx.fillStyle = cg;
    ctx.fillRect(x + s * 0.1, cy, w - s * 0.2, s * 0.62);
    ctx.fillStyle = '#e0b07a';
    ctx.fillRect(x + s * 0.05, cy - 3, w - s * 0.1, 4);
    ctx.strokeStyle = 'rgba(70,40,15,.45)';
    ctx.lineWidth = 1;
    for (let xx = x + s * 0.35; xx < x + w - s * 0.2; xx += s * 0.35) {
      ctx.beginPath();
      ctx.moveTo(xx, cy + 2);
      ctx.lineTo(xx, y + hh);
      ctx.stroke();
    }
    // カウンターの上の品物（屋台の色に合わせた丸や箱）
    const cols = [b.roof, '#ffd54f', '#ffffff', '#81d4fa', '#f48fb1'];
    for (let i = 0; i < b.w * 2; i++) {
      const gx = x + s * 0.25 + i * (s * 0.48);
      if (gx > x + w - s * 0.3) break;
      ctx.fillStyle = cols[i % cols.length];
      if (i % 2) ctx.fillRect(gx - s * 0.09, cy - s * 0.2, s * 0.18, s * 0.17);
      else {
        ctx.beginPath();
        ctx.arc(gx, cy - s * 0.1, s * 0.09, 0, 6.3);
        ctx.fill();
      }
    }
  }

  /** 社の正面：朱の柱・白い壁の格子・鈴と縄・屋根の金の飾り */
  function drawShrineFront(b: Building, x: number, y: number, w: number, hh: number, roofH: number) {
    const s = TS;
    ctx.fillStyle = '#c62828';
    for (const px of [x + s * 0.15, x + w - s * 0.33]) {
      ctx.fillRect(px, y + roofH, s * 0.18, hh - roofH);
    }
    ctx.strokeStyle = 'rgba(120,60,40,.35)';
    ctx.lineWidth = 1;
    for (let xx = x + s * 0.45; xx < x + w - s * 0.4; xx += s * 0.18) {
      ctx.beginPath();
      ctx.moveTo(xx, y + roofH + 6);
      ctx.lineTo(xx, y + roofH + s * 0.5);
      ctx.stroke();
    }
    const bx = b.door.x * s + s / 2 + (x - b.x * s);
    ctx.fillStyle = '#ffca28';
    ctx.beginPath();
    ctx.arc(bx, y + roofH + s * 0.1, s * 0.09, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, y + roofH + s * 0.18);
    ctx.lineTo(bx + 2, y + roofH + s * 0.55);
    ctx.stroke();
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 2, s * 0.08, 0, 6.3);
    ctx.fill();
  }

  /** 夜：同じ行にある提灯どうしを縄でつなぎ、小さな提灯を下げる */
  function drawGarlands(ox: number, oy: number) {
    const s = TS;
    const ls = m.objects.filter((o) => o.kind === 'lantern');
    const rows = new Map<number, typeof ls>();
    for (const o of ls) rows.set(o.y, [...(rows.get(o.y) ?? []), o]);
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 0; i + 1 < row.length; i++) {
        const ax = row[i].x * s - ox + s / 2;
        const bx = row[i + 1].x * s - ox + s / 2;
        const yy = row[i].y * s - oy - s * 0.05;
        const sag = s * 0.45;
        ctx.strokeStyle = 'rgba(40,25,15,.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ax, yy);
        ctx.quadraticCurveTo((ax + bx) / 2, yy + sag * 2, bx, yy);
        ctx.stroke();
        const n = Math.max(2, Math.round((bx - ax) / (s * 0.8)));
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const px = ax + (bx - ax) * t;
          const py = yy + sag * 2 * 2 * t * (1 - t);
          ctx.fillStyle = k % 2 ? '#ef5350' : '#ffffff';
          ctx.beginPath();
          ctx.ellipse(px, py + s * 0.1, s * 0.08, s * 0.1, 0, 0, 6.3);
          ctx.fill();
        }
      }
    }
  }

  /** 夜：暗くしたあとで、提灯・屋台の灯りを明るく足す */
  function drawNightLights(ox: number, oy: number) {
    const s = TS;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (cx: number, cy: number, r: number, a: number, c = '255,170,70') => {
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    const flick = 0.85 + Math.sin(frame / 7) * 0.08 + Math.sin(frame / 3.1) * 0.04;
    for (const o of m.objects) {
      if (o.kind !== 'lantern') continue;
      const cx = o.x * s - ox + s / 2;
      const cy = o.y * s - oy + s * 0.42;
      glow(cx, cy, s * 0.5, 0.55 * flick);
      glow(cx, cy, s * 1.6, 0.18 * flick);
    }
    for (const b of m.buildings) {
      if (b.kind !== 'stall' && b.kind !== 'shrine') continue;
      const cx = b.x * s - ox + (b.w * s) / 2;
      const cy = b.y * s - oy + b.h * s * 0.6;
      glow(cx, cy, b.w * s * 0.7, 0.2 * flick, '255,210,120');
    }
    ctx.restore();
  }

  function drawBuilding(b: Building, ox: number, oy: number, lit: boolean) {
    const s = TS;
    const x = b.x * s - ox;
    const y = b.y * s - oy;
    const w = b.w * s;
    const hh = b.h * s;
    const gable = b.kind === 'house' || b.kind === 'cabin';
    // 地面の影（右下へ落ちる）
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.fillRect(x + 6, y + hh - 4, w, 8);
    ctx.fillRect(x + w - 2, y + hh * 0.45, 8, hh * 0.55);
    const roofH = hh * (b.kind === 'stall' ? 0.45 : 0.48);
    // 壁：上が明るいグラデーション＋下の腰板
    const wg = ctx.createLinearGradient(0, y + roofH, 0, y + hh);
    wg.addColorStop(0, shadeHex(b.wall, 0.12));
    wg.addColorStop(1, shadeHex(b.wall, -0.1));
    ctx.fillStyle = wg;
    ctx.fillRect(x + 2, y + roofH - 4, w - 4, hh - roofH + 4);
    ctx.fillStyle = shadeHex(b.wall, -0.28);
    ctx.fillRect(x + 2, y + hh - s * 0.16, w - 4, s * 0.16);
    if (b.kind === 'cabin' || b.kind === 'warehouse') {
      ctx.strokeStyle = shadeHex(b.wall, -0.22);
      ctx.lineWidth = 1;
      for (let yy = y + roofH + 6; yy < y + hh - s * 0.16; yy += s * 0.22) {
        ctx.beginPath();
        ctx.moveTo(x + 2, yy);
        ctx.lineTo(x + w - 2, yy);
        ctx.stroke();
      }
    }
    // 屋根の下の影
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(x + 2, y + roofH, w - 4, 6);
    // 屋根：形＋明暗＋瓦の線
    const rg = ctx.createLinearGradient(0, y, 0, y + roofH);
    rg.addColorStop(0, shadeHex(b.roof, 0.18));
    rg.addColorStop(1, shadeHex(b.roof, -0.18));
    ctx.fillStyle = rg;
    ctx.beginPath();
    if (gable) {
      ctx.moveTo(x - 6, y + roofH);
      ctx.lineTo(x + w / 2, y + 2);
      ctx.lineTo(x + w + 6, y + roofH);
    } else if (b.kind === 'stall') {
      ctx.rect(x - 2, y + 4, w + 4, roofH);
    } else if (b.kind === 'shrine') {
      ctx.moveTo(x - 10, y + roofH);
      ctx.quadraticCurveTo(x + w / 2, y - 8, x + w + 10, y + roofH);
    } else ctx.rect(x - 3, y + 4, w + 6, roofH - 4);
    ctx.closePath();
    ctx.fill();
    if (b.kind !== 'stall') {
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = shadeHex(b.roof, -0.32);
      ctx.lineWidth = 1.2;
      for (let yy = y + 8; yy < y + roofH; yy += s * 0.2) {
        ctx.beginPath();
        ctx.moveTo(x - 12, yy);
        ctx.lineTo(x + w + 12, yy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(x - 12, y - 10, w / 2 + 12, roofH + 10);
      ctx.restore();
    }
    // 軒先の線
    const eave = gable ? 6 : 3;
    ctx.fillStyle = shadeHex(b.roof, -0.4);
    ctx.fillRect(x - eave, y + roofH - 3, w + eave * 2, 3);
    if (b.kind === 'stall') {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < b.w * 2; i += 2) ctx.fillRect(x - 2 + (i * s) / 2, y + 4, s / 2, roofH);
      // 布のすその波
      for (let i = 0; i < b.w * 2; i++) {
        ctx.fillStyle = i % 2 ? b.roof : '#fff';
        ctx.beginPath();
        ctx.arc(x - 2 + (i + 0.5) * (s / 2), y + 4 + roofH, s / 4, 0, Math.PI);
        ctx.fill();
      }
    }
    if (b.kind === 'shop' || b.kind === 'mall' || b.kind === 'hall') {
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillRect(x - 3, y + 4, w + 6, 4);
    }
    if (b.kind === 'stall') {
      drawStallFront(b, x, y, w, hh, roofH);
    } else if (b.kind === 'shrine') {
      drawShrineFront(b, x, y, w, hh, roofH);
    }
    // 窓：明かり・枠・十字の桟・窓台・反射
    const glow = lit || m.night;
    const wy = y + roofH + (hh - roofH) * 0.18;
    for (let i = 0; i < b.w; i++) {
      if (b.kind === 'stall' || b.kind === 'shrine') break;
      if (b.x + i === b.door.x) continue;
      const wx = x + i * s + s * 0.22;
      const ww = s * 0.56;
      const wh = s * 0.42;
      if (glow) {
        ctx.fillStyle = 'rgba(255,220,120,.25)';
        ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      }
      const gg = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      gg.addColorStop(0, glow ? '#fff4c4' : '#d6eeff');
      gg.addColorStop(1, glow ? '#ffd36a' : '#7fb8e8');
      ctx.fillStyle = gg;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath();
      ctx.moveTo(wx + 2, wy + wh * 0.6);
      ctx.lineTo(wx + ww * 0.45, wy + 2);
      ctx.lineTo(wx + ww * 0.6, wy + 2);
      ctx.lineTo(wx + 2, wy + wh * 0.85);
      ctx.fill();
      ctx.strokeStyle = '#5b4a30';
      ctx.lineWidth = 2;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2);
      ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();
      ctx.fillStyle = shadeHex(b.wall, -0.35);
      ctx.fillRect(wx - 3, wy + wh, ww + 6, 3);
    }
    // 扉：枠・板・取っ手・踏み石
    const dx = b.door.x * s - ox;
    const dy = b.door.y * s - oy;
    ctx.fillStyle = shadeHex(b.wall, -0.4);
    ctx.fillRect(dx + s * 0.13, dy + s * 0.07, s * 0.74, s * 0.93);
    const dg = ctx.createLinearGradient(dx, 0, dx + s, 0);
    dg.addColorStop(0, b.kind === 'stall' ? '#fff3c4' : '#8a5a2c');
    dg.addColorStop(1, b.kind === 'stall' ? '#f0dc9a' : '#5e3a1a');
    ctx.fillStyle = dg;
    ctx.fillRect(dx + s * 0.18, dy + s * 0.12, s * 0.64, s * 0.88);
    if (b.kind !== 'stall') {
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + s * 0.26, dy + s * 0.2, s * 0.48, s * 0.3);
      ctx.strokeRect(dx + s * 0.26, dy + s * 0.56, s * 0.48, s * 0.34);
    }
    ctx.fillStyle = '#ffd23b';
    ctx.beginPath();
    ctx.arc(dx + s * 0.68, dy + s * 0.58, 2.2, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#a49a88';
    ctx.fillRect(dx + s * 0.08, dy + s * 0.96, s * 0.84, s * 0.08);
    // 看板
    const fs = Math.max(10, Math.floor(s * 0.32));
    ctx.font = `bold ${fs}px sans-serif`;
    const label = b.label.length > 12 ? b.label.slice(0, 12) + '…' : b.label;
    const tw = ctx.measureText(label).width + 12;
    const lx = x + w / 2 - tw / 2;
    const ly = y + roofH - fs - 6;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(lx + 2, ly + 2, tw, fs + 6);
    ctx.fillStyle = 'rgba(255,252,240,.96)';
    ctx.fillRect(lx, ly, tw, fs + 6);
    ctx.strokeStyle = shadeHex(b.roof, -0.3);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lx, ly, tw, fs + 6);
    ctx.fillStyle = '#2a2140';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + roofH - 6);
    ctx.textAlign = 'left';
    if (lit) {
      ctx.strokeStyle = `rgba(255,220,60,${0.6 + Math.sin(frame / 8) * 0.4})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(x - 4, y - 2, w + 8, hh + 6);
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      const ay = y - 18 + Math.sin(frame / 6) * 5;
      ctx.moveTo(x + w / 2 - 10, ay);
      ctx.lineTo(x + w / 2 + 10, ay);
      ctx.lineTo(x + w / 2, ay + 14);
      ctx.fill();
    }
  }

  function drawObj(o: Obj, ox: number, oy: number) {
    const s = TS;
    const x = o.x * s - ox;
    const y = o.y * s - oy;
    const w = (o.w ?? 1) * s;
    const hh = (o.h ?? 1) * s;
    switch (o.kind) {
      case 'busstop':
        ctx.fillStyle = '#555';
        ctx.fillRect(x + s * 0.45, y + s * 0.2, s * 0.1, s * 0.8);
        ctx.fillStyle = '#2e86de';
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s * 0.25, s * 0.25, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${s * 0.28}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('バス', x + s / 2, y + s * 0.34);
        ctx.textAlign = 'left';
        break;
      case 'sign':
        ctx.fillStyle = '#8a5a2c';
        ctx.fillRect(x + s * 0.45, y + s * 0.4, s * 0.1, s * 0.6);
        ctx.fillStyle = '#d9a86a';
        ctx.fillRect(x + s * 0.1, y + s * 0.12, s * 0.8, s * 0.38);
        ctx.strokeStyle = '#6b4320';
        ctx.strokeRect(x + s * 0.1, y + s * 0.12, s * 0.8, s * 0.38);
        break;
      case 'desk':
      case 'schooldesk':
        ctx.fillStyle = '#a0682e';
        ctx.fillRect(x + 2, y + s * 0.2, w - 4, hh * 0.6);
        ctx.fillStyle = '#c8894a';
        ctx.fillRect(x + 2, y + s * 0.2, w - 4, hh * 0.18);
        if (o.kind === 'desk') {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + s * 0.3, y + s * 0.26, s * 0.4, s * 0.12);
          ctx.fillStyle = '#ff7a3c';
          ctx.fillRect(x + s * 1.1, y + s * 0.24, s * 0.22, s * 0.3);
          ctx.fillStyle = '#3c8dff';
          ctx.fillRect(x + s * 1.38, y + s * 0.24, s * 0.22, s * 0.3);
          // きらきら
          ctx.fillStyle = `rgba(255,236,120,${0.5 + Math.sin(frame / 10) * 0.5})`;
          ctx.beginPath();
          ctx.arc(x + w - 6, y + 8, 4, 0, 6.3);
          ctx.fill();
        }
        break;
      case 'bed':
        ctx.fillStyle = '#7a4a24';
        ctx.fillRect(x + 2, y + 2, w - 4, hh - 4);
        ctx.fillStyle = '#6fa8ff';
        ctx.fillRect(x + 5, y + s * 0.5, w - 10, hh - s * 0.6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 6, y + 6, w - 12, s * 0.36);
        break;
      case 'shelf':
        ctx.fillStyle = '#8a5a2c';
        ctx.fillRect(x + 2, y + 2, w - 4, hh - 4);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = ['#e5484d', '#3c8dff', '#2ead5b', '#ffcc33', '#b05dff', '#ff7a3c'][i];
          ctx.fillRect(x + 6 + i * ((w - 12) / 6), y + 6, (w - 12) / 6 - 2, hh * 0.6);
        }
        break;
      case 'kitchen':
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(x + 2, y + 2, w - 4, hh - 4);
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.22, 0, 6.3);
        ctx.arc(x + s * 1.5, y + s * 0.5, s * 0.22, 0, 6.3);
        ctx.fill();
        break;
      case 'table':
        ctx.fillStyle = '#b07a44';
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s / 2, s * 0.16, 0, 6.3);
        ctx.fill();
        break;
      case 'doormat':
        ctx.fillStyle = '#8a5a2c';
        ctx.fillRect(x + 4, y + s * 0.3, w - 8, s * 0.5);
        ctx.fillStyle = '#ffd23b';
        ctx.font = `bold ${s * 0.3}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('▼', x + w / 2, y + s * 0.68);
        ctx.textAlign = 'left';
        break;
      case 'fountain':
        ctx.fillStyle = '#b0bec5';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + hh / 2, w * 0.48, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = '#4fc3f7';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + hh / 2, w * 0.38, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        for (let i = 0; i < 6; i++) {
          const a = frame / 15 + i;
          ctx.fillRect(x + w / 2 + Math.cos(a) * w * 0.2, y + hh / 2 - 10 + Math.sin(a * 2) * 6, 3, 3);
        }
        break;
      case 'sparkle': {
        const done = game.d.forage[o.act.forage ?? ''] === todayStr();
        if (!done) {
          for (let i = 0; i < 4; i++) {
            const a = frame / 12 + i * 1.6;
            ctx.fillStyle = `rgba(255,255,180,${0.5 + Math.sin(a) * 0.5})`;
            ctx.beginPath();
            const cx = x + s / 2 + Math.cos(a) * s * 0.25;
            const cy = y + s / 2 + Math.sin(a * 1.3) * s * 0.25;
            ctx.moveTo(cx, cy - 6);
            ctx.lineTo(cx + 2, cy);
            ctx.lineTo(cx, cy + 6);
            ctx.lineTo(cx - 2, cy);
            ctx.fill();
          }
        }
        ctx.fillStyle = '#4caf50';
        ctx.beginPath();
        ctx.arc(x + s / 2, y + s * 0.65, s * 0.3, Math.PI, 0);
        ctx.fill();
        break;
      }
      case 'bigtree':
        ctx.fillStyle = '#6d4c2f';
        ctx.fillRect(x + s * 0.3, y + s * 0.2, s * 0.4, s * 0.8);
        ctx.fillStyle = '#2e7d32';
        ctx.beginPath();
        ctx.arc(x + s / 2, y - s * 0.4, s * 0.9, 0, 6.3);
        ctx.fill();
        ctx.fillStyle = '#43a047';
        ctx.beginPath();
        ctx.arc(x + s * 0.2, y - s * 0.7, s * 0.4, 0, 6.3);
        ctx.fill();
        break;
      case 'board':
        ctx.fillStyle = '#2e7d32';
        ctx.fillRect(x + 2, y + 2, w - 4, hh - 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 6, y + 6, s * 0.5, s * 0.4);
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(x + s * 0.9, y + 8, s * 0.6, s * 0.35);
        break;
      case 'stairs':
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? '#9e9e9e' : '#bdbdbd';
          ctx.fillRect(x + 2, y + 2 + (i * (s - 4)) / 4, s - 4, (s - 4) / 4);
        }
        break;
      case 'lantern': {
        const sway = Math.sin(frame / 30 + o.x) * s * 0.03;
        const cx = x + s / 2 + sway;
        const cy = y + s * 0.42;
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath();
        ctx.ellipse(x + s * 0.55, y + s * 0.95, s * 0.2, s * 0.06, 0, 0, 6.3);
        ctx.fill();
        // 柱と腕木
        ctx.fillStyle = '#4e342e';
        ctx.fillRect(x + s * 0.12, y - s * 0.1, s * 0.08, s * 1.05);
        ctx.fillRect(x + s * 0.12, y - s * 0.08, s * 0.42, s * 0.05);
        ctx.strokeStyle = '#3e2723';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + s / 2, y - s * 0.03);
        ctx.lineTo(cx, cy - s * 0.3);
        ctx.stroke();
        // 光（暗くする前の地面の照り返し）
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, s * 1.1);
        g.addColorStop(0, 'rgba(255,190,90,.5)');
        g.addColorStop(1, 'rgba(255,190,90,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - s * 1.2, cy - s * 1.2, s * 2.4, s * 2.4);
        // 紙の提灯
        const lg = ctx.createRadialGradient(cx - s * 0.06, cy - s * 0.06, 1, cx, cy, s * 0.3);
        lg.addColorStop(0, '#ffb199');
        lg.addColorStop(0.5, '#ef4b3a');
        lg.addColorStop(1, '#b71c1c');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 0.22, s * 0.28, 0, 0, 6.3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,10,10,.55)';
        ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.ellipse(cx, cy + i * s * 0.09, s * 0.22 * Math.sqrt(1 - (i * 0.3) ** 2), s * 0.015, 0, 0, 6.3);
          ctx.stroke();
        }
        ctx.fillStyle = '#212121';
        ctx.fillRect(cx - s * 0.12, cy - s * 0.31, s * 0.24, s * 0.06);
        ctx.fillRect(cx - s * 0.12, cy + s * 0.25, s * 0.24, s * 0.06);
        ctx.fillStyle = '#ffcc33';
        ctx.fillRect(cx - s * 0.01, cy + s * 0.31, s * 0.02, s * 0.08);
        break;
      }
      default:
        ctx.fillStyle = '#999';
        ctx.fillRect(x + 4, y + 4, w - 8, hh - 8);
    }
  }

  /** 見た目の指定がない人の色 */
  const DEFAULT_LOOK: Look = { hair: '#3a2a1a', shirt: '#ff7a3c', skin: '#f3c9a4', pants: '#2f5fb3', hat: '#2f76f0' };

  function draw() {
    const s = TS;
    ctx.fillStyle = m.indoor ? '#3a2a1a' : '#2f6a2a';
    ctx.fillRect(0, 0, cw, ch);
    const mapW = m.w * s;
    const mapH = m.h * s;
    let ox = p.fx * s + s / 2 - cw / 2;
    let oy = p.fy * s + s / 2 - ch / 2;
    ox = mapW <= cw ? (mapW - cw) / 2 : Math.max(0, Math.min(mapW - cw, ox));
    oy = mapH + topPad <= ch ? (mapH - ch - topPad) / 2 : Math.max(-topPad, Math.min(mapH - ch, oy));
    const x0 = Math.max(0, Math.floor(ox / s));
    const y0 = Math.max(0, Math.floor(oy / s));
    const x1 = Math.min(m.w - 1, Math.ceil((ox + cw) / s));
    const y1 = Math.min(m.h - 1, Math.ceil((oy + ch) / s));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTile(grid[y][x], x, y, x * s - ox, y * s - oy);
    const hl = hooks.highlight?.() ?? null;
    // 奥から手前に（y順）
    type D = { y: number; f: () => void };
    const list: D[] = [];
    for (const b of m.buildings) list.push({ y: b.y + b.h - 1, f: () => drawBuilding(b, ox, oy, hl === b.id) });
    for (const o of m.objects) list.push({ y: o.y + (o.h ?? 1) - 1 - (o.walk ? 100 : 0), f: () => drawObj(o, ox, oy) });
    for (const n of npcs()) {
      const look = n.look ?? (n.opp ? OPPONENTS[n.opp]?.look : undefined) ?? DEFAULT_LOOK;
      list.push({
        y: n.y,
        f: () => {
          drawPersonSprite(ctx, n.x * s - ox, n.y * s - oy, s, personSpec(n.opp ?? n.id, look), n.dir, 0);
          if (n.opp) {
            const beaten = (game.d.beaten[n.opp] ?? 0) > 0;
            // 頭の右上のふきだし（未対戦 ! ・勝ったことがある ★）
            const bx = n.x * s - ox + s * 0.82;
            const by = n.y * s - oy + s * 0.04;
            const br = s * 0.15;
            ctx.fillStyle = beaten ? '#2ead5b' : '#ff7a3c';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1.5, s * 0.04);
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.moveTo(bx - br * 0.5, by + br * 0.7);
            ctx.lineTo(bx - br * 0.9, by + br * 1.5);
            ctx.lineTo(bx + br * 0.1, by + br * 0.9);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${s * 0.22}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(beaten ? '★' : '!', bx, by + s * 0.01);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
          }
        },
      });
    }
    list.push({ y: p.fy + 0.01, f: () => drawHero(ctx, p.fx * s - ox, p.fy * s - oy, s, game.d.hero, p.dir, p.moving ? p.t : 0, true) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.f();
    if (m.night) {
      drawGarlands(ox, oy);
      // 色を残したまま暗く青くする（乗算）。上ほど少し濃く
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const ng = ctx.createLinearGradient(0, 0, 0, ch);
      ng.addColorStop(0, '#5a5aa0');
      ng.addColorStop(1, '#7a78b8');
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
      drawNightLights(ox, oy);
      // 夜空の花火（2か所で時間をずらして上がる）
      for (const [period, shift, col] of [[200, 0, '255,120,90'], [260, 90, '120,200,255']] as [number, number, string][]) {
        const t = (frame + shift) % period;
        if (t >= 70) continue;
        const k = t / 70;
        const seed = Math.floor((frame + shift) / period);
        const fx = cw * (0.15 + ((seed * 0.37 + shift * 0.001) % 0.7));
        const fy = 50 + ((seed * 23) % 40);
        const n = 16;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const rr = 55 * Math.sqrt(k);
          const px = fx + Math.cos(a) * rr;
          const py = fy + Math.sin(a) * rr + k * k * 18;
          ctx.fillStyle = `rgba(${i % 3 ? col : '255,240,160'},${1 - k})`;
          ctx.beginPath();
          ctx.arc(px, py, 2.4 * (1 - k * 0.5), 0, 6.3);
          ctx.fill();
          ctx.strokeStyle = `rgba(${col},${(1 - k) * 0.5})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(fx + Math.cos(a) * rr * 0.6, fy + Math.sin(a) * rr * 0.6 + k * k * 10);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
      }
    }
    if (frame % 15 === 0) {
      hud.replaceChildren(h('span', { class: 'place' }, m.name), h('span', { class: 'money' }, `💰 ${game.d.money.toLocaleString()}`), menuBtn);
      const g = hooks.goal?.() ?? '';
      goal.style.display = g ? 'block' : 'none';
      goal.textContent = g;
      const top = wrap.getBoundingClientRect().top;
      const el = g ? goal : hud;
      topPad = Math.max(0, el.getBoundingClientRect().bottom - top + 4);
    }
  }
  const menuBtn = h('button', { class: 'menu-btn' }, '≡ メニュー');
  menuBtn.addEventListener('click', () => {
    sfx('menu');
    hooks.onInteract({ kind: 'obj', obj: { id: '__menu', x: 0, y: 0, kind: 'menu', label: 'メニュー', act: {} } });
  });

  requestAnimationFrame(loop);

  function destroy() {
    alive = false;
    ro.disconnect();
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
  }
  return {
    map: m,
    mapId,
    setPos(x, y, dir) {
      p.x = x;
      p.y = y;
      p.fx = x;
      p.fy = y;
      p.moving = false;
      if (dir) p.dir = dir;
    },
    pause(v) {
      paused = v;
      if (v) held = null;
    },
    refresh() {
      frame = Math.ceil(frame / 15) * 15;
    },
    destroy,
    pos: () => ({ x: p.x, y: p.y, dir: p.dir }),
  };
}

export function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
