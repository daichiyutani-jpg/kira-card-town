/**
 * 主人公の見た目（男の子・女の子）。描き方は町の人と同じ person.ts を使う。
 */
import { drawPersonSprite, type PersonSpec } from './person';

export type HeroKind = 'boy' | 'girl';
export type HeroDir = 'up' | 'down' | 'left' | 'right';

export const HERO_LABEL: Record<HeroKind, string> = { boy: '男の子', girl: '女の子' };
export const HERO_DEFAULT_NAME: Record<HeroKind, string> = { boy: 'キラ', girl: 'キララ' };

const SKIN = '#f6cfa8';
export const HERO_SPEC: Record<HeroKind, PersonSpec> = {
  // 青い帽子（星）・はねた茶色の髪・オレンジの上着・紺の半ズボン・赤いくつ
  boy: { skin: SKIN, hair: '#4a2c1a', top: '#ff6a3d', bottom: '#2f4fa3', shoe: '#e53935', age: 'kid', hairStyle: 'spiky', hat: { type: 'cap', color: '#2f76f0', star: true }, inner: '#ffffff', star: '#2f76f0', bottomType: 'shorts', cardcase: true },
  // ピンクのリボンのツインテール・星の髪どめ・ピンクの上着とセーラーえり・紺のプリーツスカート
  girl: { skin: SKIN, hair: '#6b3424', top: '#ff5d9e', bottom: '#33408f', shoe: '#7b4bd6', age: 'kid', fem: true, hairStyle: 'twin', ribbon: '#ff3d7f', hairpin: '#ffd23b', inner: '#ffffff', star: '#ff3d7f', collar: '#ffffff', bottomType: 'skirt', socks: '#ffffff', cardcase: true },
};

/** 主人公を描く。(x, y) はマスの左上、s はマスの大きさ */
export function drawHero(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: HeroKind, dir: HeroDir, step: number, marker = false): void {
  drawPersonSprite(ctx, x, y, s, HERO_SPEC[kind] ?? HERO_SPEC.boy, dir, step, marker);
}
