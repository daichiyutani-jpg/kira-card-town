// BGMと効果音。Web Audio でその場で作る（著作権のある音源は使わない）。
// 音声ファイルに差し替える時は FILES に「曲名: './audio/xxx.mp3'」を書き、public/audio に置く。
export const FILES: Partial<Record<string, string>> = {};

interface Track {
  bpm: number;
  root: number; // MIDIノート
  wave: OscillatorType;
  mel: (number | null)[]; // 8分音符ごと（ルートからの半音）
  bass: number[]; // 1小節（8ステップ）ごとのベース音
  drum?: string; // k=キック s=スネア h=ハイハット .=なし（8ステップ）
  bell?: boolean;
}

const _ = null;
const TRACKS: Record<string, Track> = {
  title: { bpm: 100, root: 60, wave: 'triangle', mel: [12, _, 16, 19, 24, _, 19, _, 17, _, 16, 14, 12, _, _, _, 9, _, 12, 16, 19, _, 17, 16, 14, _, 12, 11, 12, _, _, _], bass: [0, 5, 7, 0], drum: 'k.h.s.h.', bell: true },
  town1: { bpm: 112, root: 62, wave: 'square', mel: [0, 4, 7, 4, 9, 7, 4, _, 2, 5, 9, 5, 7, _, _, _, 0, 4, 7, 12, 11, 9, 7, _, 5, 4, 2, 4, 0, _, _, _], bass: [0, 5, 7, 0], drum: 'k.h.s.hh' },
  home: { bpm: 88, root: 65, wave: 'triangle', mel: [7, _, 4, _, 5, 7, 9, _, 7, _, 4, _, 2, _, _, _, 4, _, 2, _, 0, 2, 4, _, 5, 4, 2, _, 0, _, _, _], bass: [0, 5, 0, 7], bell: true },
  town2: { bpm: 128, root: 60, wave: 'square', mel: [0, _, 3, 5, 7, _, 10, 7, 5, _, 3, _, 5, 7, _, _, 12, _, 10, 7, 5, 7, 3, _, 5, _, 3, 2, 0, _, _, _], bass: [0, 0, 5, 7], drum: 'kkhskhsh' },
  town3: { bpm: 96, root: 67, wave: 'sine', mel: [0, 2, 4, 7, _, 9, 7, _, 4, 2, 0, _, 2, _, _, _, 4, 7, 9, 12, _, 9, 7, _, 4, 7, 4, 2, 0, _, _, _], bass: [0, 9, 5, 7], drum: 'k...s...', bell: true },
  school: { bpm: 120, root: 64, wave: 'square', mel: [0, 4, 7, 12, 7, 4, 0, _, 5, 9, 12, 9, 7, _, _, _, 4, 7, 11, 14, 12, 11, 9, 7, 5, 4, 2, 4, 0, _, _, _], bass: [0, 5, 7, 7], drum: 'k.hsk.hs' },
  festival: { bpm: 104, root: 62, wave: 'triangle', mel: [0, _, 2, 5, 7, _, 9, 7, 5, _, 2, _, 0, _, _, _, 7, _, 9, 12, 9, 7, 5, _, 2, 5, 2, 0, -3, _, 0, _], bass: [0, 7, 5, 0], drum: 'k.ks.kss', bell: true },
  battle: { bpm: 144, root: 57, wave: 'sawtooth', mel: [0, 0, 3, 0, 7, 0, 6, 7, 0, 0, 3, 0, 10, 8, 7, 5, 0, 0, 3, 0, 7, 0, 10, 12, 15, 14, 12, 10, 8, 7, 5, 3], bass: [0, 0, 8, 7], drum: 'kshskshs' },
  cup: { bpm: 150, root: 59, wave: 'sawtooth', mel: [0, 3, 7, 12, 10, 7, 3, 7, 5, 8, 12, 17, 15, 12, 8, 12, 0, 3, 7, 12, 15, 12, 10, 7, 8, 7, 5, 3, 2, 3, 5, 7], bass: [0, 5, 8, 7], drum: 'ksksksks' },
  shop: { bpm: 108, root: 67, wave: 'triangle', mel: [0, 4, 7, 9, 7, 4, 2, _, 4, 7, 9, 12, 9, _, _, _], bass: [0, 5, 7, 0], drum: 'k.h.k.h.', bell: true },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
let seGain: GainNode | null = null;
const vol = { bgm: 0.6, se: 0.8, bgmOn: true, seOn: true };

export function setVolumes(v: { bgm: number; se: number; bgmOn: boolean; seOn: boolean }): void {
  Object.assign(vol, v);
  if (bgmGain) bgmGain.gain.value = vol.bgmOn ? vol.bgm * 0.32 : 0;
  if (seGain) seGain.gain.value = vol.seOn ? vol.se * 0.6 : 0;
  if (fileAudio) fileAudio.volume = vol.bgmOn ? vol.bgm : 0;
}

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    ctx = null; // 音が出せない端末でも遊べるようにする
    return;
  }
  master = ctx.createGain();
  master.connect(ctx.destination);
  bgmGain = ctx.createGain();
  seGain = ctx.createGain();
  bgmGain.connect(master);
  seGain.connect(master);
  setVolumes(vol);
  if (wanted) playBgm(wanted, true);
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function tone(dest: AudioNode, t: number, freq: number, dur: number, wave: OscillatorType, gain: number, slide = 0): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}
let noiseBuf: AudioBuffer | null = null;
function noise(dest: AudioNode, t: number, dur: number, gain: number, hp = 1000): void {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + dur + 0.02);
}

// ---------- BGM ----------
let wanted = '';
let playing = '';
let timer = 0;
let step = 0;
let nextT = 0;
let fileAudio: HTMLAudioElement | null = null;

export function playBgm(name: string, force = false): void {
  wanted = name;
  if (!ctx || (!force && playing === name)) return;
  stopBgm(false);
  playing = name;
  const file = FILES[name];
  if (file) {
    fileAudio = new Audio(file);
    fileAudio.loop = true;
    fileAudio.volume = vol.bgmOn ? vol.bgm : 0;
    void fileAudio.play().catch(() => {});
    return;
  }
  const tr = TRACKS[name];
  if (!tr) return;
  step = 0;
  nextT = ctx.currentTime + 0.08;
  const stepDur = 60 / tr.bpm / 2;
  const tick = () => {
    if (!ctx || !bgmGain) return;
    while (nextT < ctx.currentTime + 0.25) {
      const m = tr.mel[step % tr.mel.length];
      if (m !== null) {
        tone(bgmGain, nextT, midi(tr.root + m + 12 * 0), stepDur * 1.6, tr.wave, tr.wave === 'sawtooth' ? 0.16 : 0.22);
        if (tr.bell && step % 4 === 0) tone(bgmGain, nextT, midi(tr.root + m + 24), stepDur * 2.5, 'sine', 0.06);
      }
      if (step % 2 === 0) {
        const b = tr.bass[Math.floor(step / 8) % tr.bass.length];
        tone(bgmGain, nextT, midi(tr.root - 24 + b + (step % 4 === 2 ? 7 : 0)), stepDur * 1.8, 'triangle', 0.28);
      }
      const dr = tr.drum?.[step % 8];
      if (dr === 'k') tone(bgmGain, nextT, 140, 0.18, 'sine', 0.5, 0.3);
      if (dr === 's') noise(bgmGain, nextT, 0.12, 0.18, 1800);
      if (dr === 'h') noise(bgmGain, nextT, 0.04, 0.08, 7000);
      nextT += stepDur;
      step++;
    }
  };
  tick();
  timer = window.setInterval(tick, 60);
}

export function stopBgm(clearWanted = true): void {
  clearInterval(timer);
  timer = 0;
  playing = '';
  if (clearWanted) wanted = '';
  if (fileAudio) {
    fileAudio.pause();
    fileAudio = null;
  }
}

// ---------- 効果音 ----------
export type Sfx = 'tap' | 'ok' | 'cancel' | 'card' | 'summon' | 'attack' | 'hit' | 'dice' | 'win' | 'lose' | 'get' | 'gacha' | 'coin' | 'bad' | 'heal' | 'destroy' | 'menu' | 'fanfare';

export function sfx(name: Sfx): void {
  if (!ctx || !seGain || !vol.seOn) return;
  const t = ctx.currentTime + 0.005;
  const g = seGain;
  switch (name) {
    case 'tap':
      tone(g, t, 880, 0.05, 'square', 0.15);
      break;
    case 'menu':
      tone(g, t, 660, 0.06, 'square', 0.15);
      tone(g, t + 0.05, 990, 0.06, 'square', 0.12);
      break;
    case 'ok':
      tone(g, t, 784, 0.07, 'square', 0.18);
      tone(g, t + 0.07, 1175, 0.1, 'square', 0.16);
      break;
    case 'cancel':
      tone(g, t, 520, 0.08, 'square', 0.15);
      tone(g, t + 0.07, 390, 0.1, 'square', 0.12);
      break;
    case 'card':
      noise(g, t, 0.08, 0.25, 3000);
      tone(g, t, 1200, 0.05, 'triangle', 0.1);
      break;
    case 'summon':
      tone(g, t, 300, 0.35, 'sawtooth', 0.18, 3);
      tone(g, t + 0.1, 600, 0.3, 'triangle', 0.2, 2);
      break;
    case 'attack':
      noise(g, t, 0.2, 0.4, 800);
      tone(g, t, 500, 0.15, 'sawtooth', 0.2, 0.4);
      break;
    case 'hit':
      tone(g, t, 180, 0.25, 'square', 0.3, 0.4);
      noise(g, t, 0.15, 0.3, 400);
      break;
    case 'destroy':
      noise(g, t, 0.5, 0.45, 200);
      tone(g, t, 220, 0.5, 'sawtooth', 0.22, 0.2);
      break;
    case 'dice':
      for (let i = 0; i < 6; i++) noise(g, t + i * 0.06, 0.03, 0.25, 4000);
      break;
    case 'heal':
      [0, 4, 7, 12].forEach((n, i) => tone(g, t + i * 0.07, midi(72 + n), 0.2, 'sine', 0.18));
      break;
    case 'coin':
      tone(g, t, 1319, 0.08, 'square', 0.15);
      tone(g, t + 0.08, 1760, 0.2, 'square', 0.15);
      break;
    case 'bad':
      tone(g, t, 200, 0.25, 'square', 0.2);
      break;
    case 'get':
      [0, 4, 7, 12, 16].forEach((n, i) => tone(g, t + i * 0.08, midi(72 + n), 0.25, 'triangle', 0.22));
      break;
    case 'gacha':
      for (let i = 0; i < 10; i++) tone(g, t + i * 0.07, midi(60 + i * 2), 0.08, 'square', 0.12);
      break;
    case 'win':
    case 'fanfare':
      [0, 0, 0, 4, 7, 12].forEach((n, i) => tone(g, t + [0, 0.12, 0.24, 0.36, 0.6, 0.84][i], midi(67 + n), i === 5 ? 0.7 : 0.14, 'square', 0.2));
      break;
    case 'lose':
      [7, 5, 3, 0].forEach((n, i) => tone(g, t + i * 0.22, midi(60 + n), 0.3, 'triangle', 0.22));
      break;
  }
}
