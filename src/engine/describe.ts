// カードの効果文を、効果データ（fx）から自動で作る。文章とエンジンの動きが食い違わないようにするため。
import { card, EL_NAME, tributeNeedByLevel } from './cards';
import { KW_NAME } from './battle';
import type { CardDef, Condition, Effect, Keyword, Target } from './types';

const ON: Record<Effect['on'], string> = {
  summon: '召喚した時',
  attack: '攻撃する時',
  defend: '攻撃された時',
  destroyed: '破壊された時',
  turnStart: '自分のターンの始め',
  play: '',
  equip: '装備中',
  passive: '場にいる間',
};

const TG: Record<Target, string> = {
  self: 'このカード',
  allyAll: '味方全員',
  allyOther: 'ほかの味方全員',
  ally: '味方1体',
  enemy: '相手1体',
  enemyAll: '相手全員',
  enemyStrong: '相手の一番強いモンスター',
  enemyWeak: '相手の一番弱いモンスター',
  enemyRandom: '相手のランダムな1体',
  foe: 'バトルの相手',
};

export const KW_HELP: Record<Keyword, string> = {
  sky: '相手の場に「そら」がいなければ、相手に直接攻撃できる',
  wall: '相手はまずこのモンスターを狙わなければならない',
  double: '1ターンに2回攻撃できる',
  lucky: 'サイコロを2回振って高い方を使う',
  stealth: '相手の魔法・アイテムの対象にならない',
  tough: '1度だけ破壊されない',
};

function cond(c?: Condition): string {
  if (!c) return '';
  const out: string[] = [];
  if (c.allyEl) out.push(`自分の場に${EL_NAME[c.allyEl]}属性が${c.allyElN ?? 1}体以上いれば`);
  if (c.withCard) out.push(`自分の場に「${card(c.withCard).name}」がいれば`);
  if (c.lpBelow !== undefined) out.push(`自分のLPが${c.lpBelow}以下なら`);
  if (c.graveMonsters !== undefined) out.push(`自分の墓地にモンスターが${c.graveMonsters}枚以上あれば`);
  if (c.enemyMore) out.push('相手の場のモンスターの方が多ければ');
  if (c.foeEl) out.push(`相手が${EL_NAME[c.foeEl]}属性なら`);
  return out.join('、');
}

function filt(e: Effect): string {
  const f: string[] = [];
  if (e.el) f.push(`${EL_NAME[e.el]}属性`);
  if (e.maxLv) f.push(`Lv${e.maxLv}以下`);
  return f.length ? `（${f.join('・')}）` : '';
}

function one(e: Effect): string {
  const n = e.n ?? 1;
  const tg = TG[e.target ?? 'self'] + filt(e);
  const st = e.stat === 'both' ? '攻撃と守備' : e.stat === 'def' ? '守備' : '攻撃';
  const turn = e.dur === 'perm' || e.on === 'equip' || e.on === 'passive' ? '' : '（このターン）';
  switch (e.do) {
    case 'dmg':
      return e.target === 'self' ? `自分に${n}ダメージ` : `相手に${n}ダメージ`;
    case 'drain':
      return `相手のLPを${n}すいとる（相手-${n}・自分+${n}）`;
    case 'heal':
      return `自分のLPを${n}回復`;
    case 'buff':
      if (e.on === 'equip') return `装備したモンスターの${st}${n >= 0 ? '+' : ''}${n}`;
      return `${tg}の${st}${n >= 0 ? '+' : ''}${n}${turn}`;
    case 'destroy':
      return `${tg}を破壊`;
    case 'draw':
      return `カードを${n}枚引く`;
    case 'bounce':
      return `${tg}を持ち主の手札に戻す`;
    case 'revive':
      return `自分の墓地の一番上のモンスター${filt(e)}を復活させる`;
    case 'search': {
      const t = e.type ? ({ monster: 'モンスター', magic: '魔法', item: 'アイテム' } as const)[e.type] : 'カード';
      return `山札から${filt(e)}${t}を1枚手札に加える`;
    }
    case 'shield':
      return `${tg}に守りの盾（1度だけ破壊されない）`;
    case 'stun':
      return `${tg}は次のターン攻撃できない`;
    case 'discard':
      return `相手の手札をランダムに${n}枚捨てさせる`;
    case 'grant':
      if (e.on === 'equip') return `装備したモンスターは「${KW_NAME[e.kw!]}」`;
      return `${tg}は「${KW_NAME[e.kw!]}」になる`;
    case 'dice':
      return e.on === 'attack' || e.on === 'defend' ? `サイコロの補正${n >= 0 ? '+' : ''}${n}` : `${tg}の次のサイコロ補正+${n}`;
    case 'lucky':
      return e.on === 'attack' || e.on === 'defend' ? 'サイコロを2回振って高い方を使う' : `${tg}の次のサイコロは2回振って高い方`;
  }
}

export function effectLines(def: CardDef): string[] {
  const lines: string[] = [];
  if (def.type === 'item' && def.equip) lines.push('【装備】味方1体に付ける。モンスターが場を離れると墓地へ。');
  for (const e of def.fx ?? []) {
    const head = ON[e.on];
    const c = cond(e.if);
    const body = one(e);
    lines.push(`${head ? `${head}：` : ''}${c ? `${c}、` : ''}${body}`);
  }
  return lines;
}

export function summonText(def: CardDef): string {
  if (def.type !== 'monster') return '';
  const r = def.summon ?? {};
  const need = r.tribute ?? tributeNeedByLevel(def.lv);
  const parts: string[] = [];
  if (need === 0) parts.push('生け贄なしで召喚');
  else {
    let s = `生け贄${need}体`;
    if (r.tributeEl) s = `${EL_NAME[r.tributeEl]}属性の生け贄${need}体`;
    if (r.tributeId) s += `（「${card(r.tributeId).name}」を含む）`;
    parts.push(s);
  }
  if (r.noTributeIf) parts.push(`${cond(r.noTributeIf)}生け贄なしで召喚できる`);
  if (r.needGrave) parts.push(`墓地にモンスター${r.needGrave}枚以上が必要`);
  return parts.join('／');
}

export function fullText(def: CardDef): string[] {
  const out: string[] = [];
  for (const k of def.kw ?? []) out.push(`《${KW_NAME[k]}》${KW_HELP[k]}`);
  return [...out, ...effectLines(def)];
}
