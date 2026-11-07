// カードとバトルの型。カードの中身は src/data/cards.json にあり、ここは形だけを決める。

export type Element = 'fire' | 'water' | 'wind' | 'earth' | 'light' | 'dark';
export type Rarity = 'N' | 'R' | 'SR' | 'UR';
export type CardType = 'monster' | 'magic' | 'item';
export type Keyword = 'sky' | 'wall' | 'double' | 'lucky' | 'stealth' | 'tough';

export type Trigger = 'summon' | 'attack' | 'destroyed' | 'turnStart' | 'play' | 'equip' | 'passive' | 'defend';

/** 効果の対象 */
export type Target =
  | 'self' // このモンスター（装備アイテムなら装備先）
  | 'allyAll'
  | 'allyOther'
  | 'ally' // 味方モンスター1体を選ぶ
  | 'enemy' // 相手モンスター1体を選ぶ
  | 'enemyAll'
  | 'enemyStrong'
  | 'enemyWeak'
  | 'enemyRandom'
  | 'foe'; // このバトルの相手モンスター

export interface Condition {
  allyEl?: Element; // 自分の場にこの属性が n 体以上（自分を含む）
  allyElN?: number;
  withCard?: string; // 自分の場にこのカードがある
  lpBelow?: number; // 自分のLPがこの値以下
  graveMonsters?: number; // 自分の墓地のモンスターが n 枚以上
  enemyMore?: boolean; // 相手の場のモンスターの方が多い
  foeEl?: Element; // バトル相手がこの属性
}

export interface Effect {
  on: Trigger;
  do:
    | 'dmg'
    | 'heal'
    | 'buff'
    | 'destroy'
    | 'draw'
    | 'bounce'
    | 'revive'
    | 'search'
    | 'shield'
    | 'stun'
    | 'discard'
    | 'grant'
    | 'dice'
    | 'lucky'
    | 'drain';
  n?: number;
  stat?: 'atk' | 'def' | 'both';
  target?: Target;
  dur?: 'turn' | 'perm';
  kw?: Keyword;
  el?: Element; // 対象をこの属性に絞る／サーチ・復活の条件
  maxLv?: number; // 破壊・復活・サーチの対象レベル上限
  type?: CardType; // サーチの対象
  if?: Condition;
}

export interface SummonRule {
  tribute?: number; // 生け贄の数（省略時はレベルから）
  tributeEl?: Element; // 生け贄はこの属性
  tributeId?: string; // 生け贄にこのカードが必要（1体分）
  noTributeIf?: Condition; // この条件なら生け贄なしで召喚できる
  needGrave?: number; // 墓地にモンスターが n 枚以上いないと召喚できない
}

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  el: Element;
  lv: number; // 魔法・アイテムは0
  r: Rarity;
  atk: number;
  def: number;
  kw?: Keyword[];
  fx?: Effect[];
  summon?: SummonRule;
  equip?: boolean; // アイテム：装備するタイプ
  flavor: string;
  art: { body: string; seed: number; img?: string };
  get: string[]; // 入手方法のタグ（pack1, shop2, mom, fest, prize:xxx ...）
  secret?: boolean; // 図鑑で未入手のとき名前も隠す
}

export interface FieldMon {
  uid: number;
  id: string;
  owner: 0 | 1;
  atkMod: number; // ずっと続く強化
  defMod: number;
  atkTurn: number; // このターンだけの強化
  defTurn: number;
  guard: boolean;
  attacks: number; // このターンの攻撃回数
  summonedTurn: number;
  shield: boolean;
  stunned: number; // この値のターン番号まで攻撃できない
  equip: number | null; // 装備しているアイテムの uid
  equipId: string | null;
  extraKw: Keyword[];
  diceBonusNext: number; // 次のバトルのサイコロ補正
  luckyNext: boolean;
}

export interface PlayerState {
  name: string;
  lp: number;
  deck: { uid: number; id: string }[];
  hand: { uid: number; id: string }[];
  grave: { uid: number; id: string }[];
  field: FieldMon[];
  summoned: boolean;
  magicUsed: boolean;
  itemUsed: boolean;
}

export interface BattleState {
  seed: number;
  rng: number; // 乱数の内部状態
  turn: number; // 1 から
  active: 0 | 1;
  first: 0 | 1;
  players: [PlayerState, PlayerState];
  nextUid: number;
  winner: 0 | 1 | 'draw' | null;
  endReason: string;
  forcedDice: number[]; // チュートリアル用：決まった出目を順に使う
  log: string[];
  maxTurns: number;
}

export type Action =
  | { t: 'summon'; uid: number; tributes: number[] }
  | { t: 'magic'; uid: number; target?: number }
  | { t: 'item'; uid: number; target?: number }
  | { t: 'attack'; uid: number; target: number | 'player' }
  | { t: 'guard'; uid: number }
  | { t: 'end' };

/** 画面の演出用イベント */
export type BattleEvent =
  | { k: 'draw'; p: 0 | 1; id: string }
  | { k: 'summon'; p: 0 | 1; uid: number; id: string; tributes: string[] }
  | { k: 'cast'; p: 0 | 1; id: string; target?: number }
  | { k: 'fx'; p: 0 | 1; src: string; text: string }
  | { k: 'dice'; p: 0 | 1; v: number; bonus: number; who: 'atk' | 'def'; extra?: number }
  | {
      k: 'combat';
      p: 0 | 1;
      atkUid: number;
      defUid: number | null;
      atkCalc: CalcPart[];
      defCalc: CalcPart[];
      atkTotal: number;
      defTotal: number;
      result: 'win' | 'tie' | 'lose' | 'direct';
      dmg: number;
    }
  | { k: 'destroy'; p: 0 | 1; uid: number; id: string }
  | { k: 'lp'; p: 0 | 1; delta: number; lp: number }
  | { k: 'guard'; p: 0 | 1; uid: number }
  | { k: 'turn'; p: 0 | 1; turn: number }
  | { k: 'end'; winner: 0 | 1 | 'draw'; reason: string };

export interface CalcPart {
  label: string;
  v: number;
}
