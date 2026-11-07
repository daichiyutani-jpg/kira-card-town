/**
 * 町の人の見た目。色は maps.json / opponents.json の look（髪・服・肌・ズボン・帽子・エプロン）を使い、
 * 髪型・服の形・年れい・小物はここで人ごとに決める（役割と名前に合わせた、このゲームのオリジナル）。
 */
import type { PersonSpec, HatType } from './person';

export interface LookColors {
  hair: string;
  shirt: string;
  skin: string;
  pants: string;
  hat?: string;
  apron?: string;
}

type Style = Omit<Partial<PersonSpec>, 'hat'> & { hat?: string; hatType?: HatType; hatStar?: boolean };

const KID_BOY: Style = { age: 'kid', hairStyle: 'spiky', bottomType: 'shorts' };
const KID_GIRL: Style = { age: 'kid', fem: true, hairStyle: 'bob', bottomType: 'skirt', socks: '#ffffff' };
const MAN: Style = { age: 'adult', hairStyle: 'short', bottomType: 'pants' };
const WOMAN: Style = { age: 'adult', fem: true, hairStyle: 'pony', bottomType: 'skirt' };
const ELDER_M: Style = { age: 'elder', hairStyle: 'bald', bottomType: 'pants' };
// 学校：白いシャツ。男子はネクタイとズボン、女子はリボンとプリーツスカート
const SCHOOL_M: Style = { age: 'kid', hairStyle: 'short', bottomType: 'pants', tie: '#2a3a6b' };
const SCHOOL_F: Style = { age: 'kid', fem: true, hairStyle: 'bob', bottomType: 'skirt', socks: '#ffffff', collar: '#2a3a6b', tie: '#d33c3c' };

export const PEOPLE: Record<string, Style> = {
  // ---- 町の人（maps.json）
  kenta: { ...KID_BOY },
  obaachan: { age: 'elder', fem: true, hairStyle: 'bun', bottomType: 'long', glasses: 'round', obi: '#7a4a2a' },
  postman: { ...MAN, hatType: 'cap', mustache: true, inner: '#e8f5e9' },
  mom: { ...WOMAN, apron: '#ffffff', ribbon: '#e05a88' },
  merchant: { ...MAN, big: true, hairStyle: 'slick', mustache: true, hatType: 'hachi', hat: '#ffffff', inner: '#ffffff' },
  girl2: { ...KID_GIRL, hairStyle: 'long', ribbon: '#ffffff', hairpin: '#ffd23b' },
  worker: { ...MAN, big: true, hatType: 'helmet', hat: '#ffc107', apron: undefined },
  ranger_npc: { ...MAN, hatType: 'wide', beard: true, beardColor: '#5a3a1a' },
  bugkid: { ...KID_BOY, hatType: 'wide' },
  forestlady: { ...WOMAN, hairStyle: 'long', bottomType: 'long', hairpin: '#ffffff' },
  teacher: { ...MAN, hairStyle: 'slick', glasses: 'round', inner: '#ffffff', tie: '#c0392b' },
  yukata: { ...KID_GIRL, hairStyle: 'bun', bottomType: 'long', obi: '#ffca28', ribbon: '#e53935', socks: undefined, shoe: '#8d6e63' },
  festkid: { ...KID_BOY, hatType: 'hachi', obi: '#e53935', bottomType: 'shorts' },
  // ---- 対戦相手（opponents.json）
  clerk: { ...WOMAN, bottomType: 'pants', apron: '#2f8f5b', ribbon: '#ffffff' },
  rival: { ...KID_BOY, bottomType: 'pants', inner: '#222222', star: '#ffd23b' },
  champion: { ...MAN, hairStyle: 'spiky', inner: '#e9c46a', star: '#e9c46a', obi: '#e9c46a', shoe: '#1d1636' },
  h1: { ...KID_BOY },
  h2: { ...KID_GIRL, hairpin: '#ff7fb0', apron: '#ffffff' },
  h3: { ...MAN, hatType: 'wide', hat: '#c8b07a' },
  h4: { ...KID_GIRL, hairStyle: 'pony', ribbon: '#ff8a3c' },
  h5: { ...ELDER_M, beard: true, beardColor: '#eeeeee', glasses: 'round' },
  h6: { ...KID_BOY, hatType: 'cap', hat: '#4a8a2a' },
  h7: { ...WOMAN, apron: '#ffffff', hatType: 'bandana', hat: '#ffffff' },
  h8: { ...MAN, hairStyle: 'slick', inner: '#ffffff', tie: '#c0392b' },
  h9: { ...KID_GIRL, hairStyle: 'twin', ribbon: '#c58cff' },
  h10: { ...MAN, hairStyle: 'spiky', inner: '#ffffff' },
  n1: { ...KID_BOY, bottomType: 'pants', inner: '#c33333' },
  n2: { ...WOMAN, hairStyle: 'long', bottomType: 'long', glasses: 'round', hairpin: '#ffd23b' },
  n3: { ...MAN, big: true, hatType: 'hachi', hat: '#ffffff' },
  n4: { ...WOMAN, hairStyle: 'bob', glasses: 'round', apron: '#7a5a3a' },
  n5: { ...MAN, glasses: 'round', inner: '#ffffff' },
  n6: { ...MAN, hairStyle: 'spiky', glasses: 'sun', inner: '#f2d24a' },
  n7: { ...WOMAN, bottomType: 'pants', apron: '#c89a50', hatType: 'bandana', hat: '#e8c86b' },
  n8: { ...MAN, hatType: 'cap', hat: '#5a8a3a', glasses: 'round' },
  n9: { ...WOMAN, ribbon: '#ffffff', socks: '#ffffff' },
  n10: { ...MAN, big: true, hairStyle: 'slick', glasses: 'sun', mustache: true, inner: '#ffffff' },
  m1: { ...WOMAN, hairStyle: 'long', bottomType: 'long', bottom: '#c62828', ribbon: '#ffffff', obi: '#c62828' },
  m2: { ...KID_GIRL, hairStyle: 'long', bottomType: 'long', socks: undefined },
  m3: { ...MAN, hairStyle: 'spiky', bottomType: 'long', obi: '#1a3a2a', hatType: 'hachi', hat: '#111111' },
  m4: { ...ELDER_M, bottomType: 'long', beard: true, beardColor: '#cccccc', obi: '#5a3a1a' },
  m5: { ...WOMAN, hairStyle: 'long', bottomType: 'long', hairpin: '#ffd23b' },
  m6: { ...ELDER_M, glasses: 'round', mustache: true, beardColor: '#cfcfe8', hair: '#cfcfe8', inner: '#ffffff' },
  m7: { ...KID_GIRL, hairStyle: 'pony', bottomType: 'pants', hatType: 'bandana', hat: '#e57373' },
  m8: { ...MAN, hairStyle: 'spiky', inner: '#ffffff' },
  m9: { ...WOMAN, hairStyle: 'pony', bottomType: 'long', bottom: '#6b1a1a', ribbon: '#ffffff', obi: '#6b1a1a' },
  m10: { ...ELDER_M, big: true, hairStyle: 'long', beard: true, bottomType: 'long', obi: '#6b8a3a' },
  s1: { ...SCHOOL_M, hairStyle: 'spiky' },
  s2: { ...SCHOOL_F, hairStyle: 'long', glasses: 'round' },
  s3: { ...SCHOOL_M, glasses: 'round' },
  s4: { ...SCHOOL_F },
  s5: { ...SCHOOL_M, hairStyle: 'spiky' },
  s6: { ...SCHOOL_F, hairStyle: 'long' },
  s7: { ...SCHOOL_F, hairStyle: 'twin', ribbon: '#ffffff' },
  s8: { ...SCHOOL_M, hairStyle: 'slick', glasses: 'round', tie: '#c9a227', inner: '#ffffff' },
  fest_boss: { ...MAN, big: true, hatType: 'hachi', hat: '#ffffff', mustache: true, inner: '#ffffff', obi: '#e53935' },
  // ---- 建物の中の人（maps.json の in_*）
  shopkid: { ...KID_BOY, hatType: 'cap' },
  hallstaff1: { ...WOMAN, bottomType: 'pants', ribbon: '#ffffff', collar: '#ffffff' },
  hallstaff2: { ...MAN, hairStyle: 'slick', inner: '#ffffff', tie: '#ffd23b' },
  hallstaff3: { ...WOMAN, hairStyle: 'bob', bottomType: 'pants', collar: '#ffffff' },
  fan1: { ...KID_BOY, hatType: 'cap', hat: '#c0392b' },
  fan2: { ...MAN, glasses: 'round', hatType: 'cap', hat: '#2980b9' },
  fan3: { ...KID_GIRL, hairStyle: 'twin', ribbon: '#aed581' },
  poststaff: { ...MAN, hatType: 'cap', inner: '#e8f5e9' },
  satou: { ...WOMAN, hairStyle: 'bun', apron: '#ffffff' },
  pianist: { ...WOMAN, hairStyle: 'long', bottomType: 'long', hairpin: '#ffffff' },
  catgrandpa: { ...ELDER_M, glasses: 'round', mustache: true, beardColor: '#e0e0e0' },
  farmer: { ...MAN, hatType: 'wide', apron: '#8d6e63', beard: true, beardColor: '#5d4037' },
  cardbro: { ...KID_BOY, bottomType: 'pants', glasses: 'round' },
  cardsis: { ...KID_GIRL, hairStyle: 'twin', ribbon: '#ce93d8' },
  megaclerk: { ...MAN, hairStyle: 'spiky', apron: '#e67e22', hatType: 'cap', hat: '#e67e22' },
  megakid: { ...KID_BOY, hairStyle: 'short' },
  megagirl: { ...KID_GIRL, hairStyle: 'pony', ribbon: '#ffd23b' },
  whstaff: { ...MAN, big: true, hatType: 'helmet' },
  ramenmaster: { ...MAN, big: true, hatType: 'bandana', hat: '#ffffff', mustache: true, apron: '#ffffff' },
  ramenguest: { ...MAN, hairStyle: 'slick', glasses: 'round', tie: '#5d4037', inner: '#ffffff' },
  boutiquestaff: { ...WOMAN, hairStyle: 'long', ribbon: '#e91e63' },
  forestclerk: { ...ELDER_M, beard: true, beardColor: '#bdbdbd', glasses: 'round' },
  rangerstaff: { ...WOMAN, hatType: 'wide', bottomType: 'pants' },
};

/** 色（look）と人ごとの形を合わせて、描くための見た目にする */
export function personSpec(id: string | undefined, look: LookColors): PersonSpec {
  const st: Style = (id && PEOPLE[id]) || { age: 'kid', hairStyle: 'short', bottomType: 'pants' };
  const { hatType, hatStar, hat: hatColor, ...rest } = st;
  const spec: PersonSpec = {
    skin: look.skin,
    hair: look.hair,
    top: look.shirt,
    bottom: look.pants,
    apron: look.apron,
    ...rest,
  };
  // 帽子：人ごとの指定がなければ look.hat の色で野球帽
  const hc = hatColor ?? look.hat;
  if (hatType || look.hat) spec.hat = { type: hatType ?? 'cap', color: hc ?? '#555555', star: hatStar };
  return spec;
}
