// バトルエンジン本体。画面には依存しない。state を直接書き換え、演出用のイベント列を返す。
import {
  card,
  DICE_BONUS,
  ELEMENT_BONUS,
  EL_NAME,
  FIELD_MAX,
  START_HAND,
  START_LP,
  strongAgainst,
  tributeNeedByLevel,
} from './cards';
import type {
  Action,
  BattleEvent,
  BattleState,
  CalcPart,
  CardDef,
  Condition,
  Effect,
  FieldMon,
  Keyword,
  PlayerState,
  Target,
} from './types';

// ---------- 乱数（mulberry32。種が同じなら同じ結果） ----------
export function nextRandom(s: BattleState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function randInt(s: BattleState, n: number): number {
  return Math.floor(nextRandom(s) * n);
}
function rollDie(s: BattleState): number {
  if (s.forcedDice.length) return s.forcedDice.shift()!;
  return randInt(s, 6) + 1;
}
function shuffle<T>(s: BattleState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export interface BattleSetup {
  seed: number;
  decks: [string[], string[]];
  names: [string, string];
  first?: 0 | 1; // 省略時は乱数
  lp?: [number, number];
  shuffle?: boolean; // false でデッキの並び順のまま（チュートリアル）
  forcedDice?: number[];
  maxTurns?: number;
}

function newPlayer(s: BattleState, name: string, ids: string[], lp: number): PlayerState {
  return {
    name,
    lp,
    deck: ids.map((id) => ({ uid: s.nextUid++, id })),
    hand: [],
    grave: [],
    field: [],
    summoned: false,
    magicUsed: false,
    itemUsed: false,
  };
}

export function createBattle(setup: BattleSetup): { state: BattleState; events: BattleEvent[] } {
  const s: BattleState = {
    seed: setup.seed >>> 0,
    rng: setup.seed | 0,
    turn: 0,
    active: 0,
    first: 0,
    players: [] as unknown as [PlayerState, PlayerState],
    nextUid: 1,
    winner: null,
    endReason: '',
    forcedDice: [...(setup.forcedDice ?? [])],
    log: [],
    maxTurns: setup.maxTurns ?? 30,
  };
  const lp = setup.lp ?? [START_LP, START_LP];
  s.players = [newPlayer(s, setup.names[0], setup.decks[0], lp[0]), newPlayer(s, setup.names[1], setup.decks[1], lp[1])];
  if (setup.shuffle !== false) {
    shuffle(s, s.players[0].deck);
    shuffle(s, s.players[1].deck);
  }
  s.first = setup.first ?? (randInt(s, 2) as 0 | 1);
  const ev: BattleEvent[] = [];
  for (const p of [0, 1] as const) for (let i = 0; i < START_HAND; i++) drawCard(s, p, ev);
  s.log.push(`${s.players[s.first].name}の先攻です。`);
  startTurn(s, s.first, ev);
  return { state: s, events: ev };
}

export function cloneState(s: BattleState): BattleState {
  return structuredClone(s);
}

// ---------- 参照 ----------
export const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);

export function findMon(s: BattleState, uid: number): FieldMon | undefined {
  return s.players[0].field.find((m) => m.uid === uid) ?? s.players[1].field.find((m) => m.uid === uid);
}

function checkCond(s: BattleState, p: 0 | 1, c: Condition | undefined, foe?: FieldMon): boolean {
  if (!c) return true;
  const me = s.players[p];
  if (c.allyEl && me.field.filter((m) => card(m.id).el === c.allyEl).length < (c.allyElN ?? 1)) return false;
  if (c.withCard && !me.field.some((m) => m.id === c.withCard || m.equipId === c.withCard)) return false;
  if (c.lpBelow !== undefined && me.lp > c.lpBelow) return false;
  if (c.graveMonsters !== undefined && me.grave.filter((g) => card(g.id).type === 'monster').length < c.graveMonsters) return false;
  if (c.enemyMore && s.players[other(p)].field.length <= me.field.length) return false;
  if (c.foeEl && (!foe || card(foe.id).el !== c.foeEl)) return false;
  return true;
}

/** 常時効果・装備による補正を含めたキーワード */
export function keywords(s: BattleState, m: FieldMon): Keyword[] {
  const set = new Set<Keyword>([...(card(m.id).kw ?? []), ...m.extraKw]);
  if (m.equipId) for (const e of card(m.equipId).fx ?? []) if (e.on === 'equip' && e.do === 'grant' && e.kw) set.add(e.kw);
  for (const ally of s.players[m.owner].field) {
    for (const e of card(ally.id).fx ?? []) {
      if (e.on !== 'passive' || e.do !== 'grant' || !e.kw) continue;
      if (!passiveHits(s, ally, m, e)) continue;
      set.add(e.kw);
    }
  }
  return [...set];
}
export const hasKw = (s: BattleState, m: FieldMon, k: Keyword) => keywords(s, m).includes(k);

function passiveHits(s: BattleState, src: FieldMon, m: FieldMon, e: Effect): boolean {
  const t = e.target ?? 'self';
  if (t === 'self' && src.uid !== m.uid) return false;
  if (t === 'allyOther' && src.uid === m.uid) return false;
  if (t !== 'self' && t !== 'allyAll' && t !== 'allyOther') return false;
  if (e.el && card(m.id).el !== e.el) return false;
  return checkCond(s, src.owner, e.if);
}

/** 表示・計算に使う攻撃と守備（常時効果・装備・強化込み。サイコロと属性は含まない） */
export function statOf(s: BattleState, m: FieldMon, stat: 'atk' | 'def'): { total: number; parts: CalcPart[] } {
  const def = card(m.id);
  const parts: CalcPart[] = [{ label: stat === 'atk' ? '攻撃' : '守備', v: stat === 'atk' ? def.atk : def.def }];
  const mod = stat === 'atk' ? m.atkMod + m.atkTurn : m.defMod + m.defTurn;
  if (mod) parts.push({ label: '強化', v: mod });
  if (m.equipId) {
    let v = 0;
    for (const e of card(m.equipId).fx ?? [])
      if (e.on === 'equip' && e.do === 'buff' && (e.stat === stat || e.stat === 'both') && checkCond(s, m.owner, e.if)) v += e.n ?? 0;
    if (v) parts.push({ label: card(m.equipId).name, v });
  }
  let aura = 0;
  for (const ally of s.players[m.owner].field) {
    for (const e of card(ally.id).fx ?? []) {
      if (e.on !== 'passive' || e.do !== 'buff' || !(e.stat === stat || e.stat === 'both')) continue;
      if (!passiveHits(s, ally, m, e)) continue;
      aura += e.n ?? 0;
    }
  }
  // 相手の場からの常時効果（相手全体を弱める）
  for (const foe of s.players[other(m.owner)].field) {
    for (const e of card(foe.id).fx ?? []) {
      if (e.on !== 'passive' || e.do !== 'buff' || e.target !== 'enemyAll' || !(e.stat === stat || e.stat === 'both')) continue;
      if (e.el && card(m.id).el !== e.el) continue;
      if (!checkCond(s, foe.owner, e.if)) continue;
      aura += e.n ?? 0;
    }
  }
  if (aura) parts.push({ label: '仲間の力', v: aura });
  const total = Math.max(0, parts.reduce((a, b) => a + b.v, 0));
  return { total, parts };
}

// ---------- 召喚 ----------
export interface SummonCheck {
  ok: boolean;
  reason: string;
  need: number;
  options: number[][]; // 生け贄の組み合わせ（uid）
}

export function summonCheck(s: BattleState, p: 0 | 1, uid: number): SummonCheck {
  const me = s.players[p];
  const h = me.hand.find((c) => c.uid === uid);
  const no = (reason: string): SummonCheck => ({ ok: false, reason, need: 0, options: [] });
  if (!h) return no('手札にありません');
  const def = card(h.id);
  if (def.type !== 'monster') return no('モンスターではありません');
  if (s.active !== p) return no('自分のターンではありません');
  if (me.summoned) return no('召喚はこのターンもうしました（1ターン1回）');
  const rule = def.summon ?? {};
  if (rule.needGrave !== undefined && me.grave.filter((g) => card(g.id).type === 'monster').length < rule.needGrave)
    return no(`墓地にモンスターが${rule.needGrave}枚以上いないと召喚できません`);
  let need = rule.tribute ?? tributeNeedByLevel(def.lv);
  if (rule.noTributeIf && checkCond(s, p, rule.noTributeIf)) need = 0;
  if (need === 0) {
    if (me.field.length >= FIELD_MAX) return no(`場がいっぱいです（${FIELD_MAX}体まで）`);
    return { ok: true, reason: '', need: 0, options: [[]] };
  }
  const cands = me.field.filter((m) => !rule.tributeEl || card(m.id).el === rule.tributeEl);
  const combos = combinations(cands.map((m) => m.uid), need).filter(
    (combo) => !rule.tributeId || combo.some((u) => findMon(s, u)?.id === rule.tributeId),
  );
  if (!combos.length) {
    let why = `生け贄が${need}体必要です（場に${me.field.length}体）`;
    if (rule.tributeEl) why = `${EL_NAME[rule.tributeEl]}属性の生け贄が${need}体必要です`;
    if (rule.tributeId) why = `「${card(rule.tributeId).name}」を含む生け贄が${need}体必要です`;
    return { ok: false, reason: why, need, options: [] };
  }
  return { ok: true, reason: '', need, options: combos };
}

function combinations(arr: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...rest] = arr;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

// ---------- 魔法・アイテムの対象 ----------
/** そのカードを使う時に選ぶ対象の種類。null なら選ばない */
export function chosenTargetKind(def: CardDef): 'ally' | 'enemy' | null {
  if (def.type === 'item' && def.equip) return 'ally';
  for (const e of def.fx ?? []) {
    if (e.on !== 'play') continue;
    if (e.target === 'ally') return 'ally';
    if (e.target === 'enemy') return 'enemy';
  }
  return null;
}

export function validTargets(s: BattleState, p: 0 | 1, def: CardDef): number[] {
  const kind = chosenTargetKind(def);
  if (!kind) return [];
  if (kind === 'ally') {
    const list = s.players[p].field;
    return list.filter((m) => !(def.equip && m.equip !== null)).map((m) => m.uid);
  }
  const eff = (def.fx ?? []).find((e) => e.on === 'play' && e.target === 'enemy');
  return s.players[other(p)].field
    .filter((m) => !hasKw(s, m, 'stealth'))
    .filter((m) => !eff?.maxLv || card(m.id).lv <= eff.maxLv)
    .filter((m) => !eff?.el || card(m.id).el === eff.el)
    .map((m) => m.uid);
}

export function playCheck(s: BattleState, p: 0 | 1, uid: number): { ok: boolean; reason: string; targets: number[] } {
  const me = s.players[p];
  const h = me.hand.find((c) => c.uid === uid);
  if (!h) return { ok: false, reason: '手札にありません', targets: [] };
  const def = card(h.id);
  if (s.active !== p) return { ok: false, reason: '自分のターンではありません', targets: [] };
  if (def.type === 'magic' && me.magicUsed) return { ok: false, reason: '魔法はこのターンもう使いました（1ターン1枚）', targets: [] };
  if (def.type === 'item' && me.itemUsed) return { ok: false, reason: 'アイテムはこのターンもう使いました（1ターン1枚）', targets: [] };
  if (def.type === 'monster') return { ok: false, reason: 'モンスターは召喚します', targets: [] };
  const kind = chosenTargetKind(def);
  const targets = validTargets(s, p, def);
  if (kind && !targets.length)
    return { ok: false, reason: kind === 'ally' ? '使える味方モンスターがいません' : '狙える相手モンスターがいません', targets };
  // 復活は場の空きと墓地が必要
  for (const e of def.fx ?? []) {
    if (e.on !== 'play') continue;
    if (e.do === 'revive') {
      if (me.field.length >= FIELD_MAX) return { ok: false, reason: '場がいっぱいです', targets };
      if (!reviveCandidate(s, p, e)) return { ok: false, reason: '墓地に復活できるモンスターがいません', targets };
    }
    if (e.if && !checkCond(s, p, e.if) && (def.fx ?? []).filter((x) => x.on === 'play').length === 1)
      return { ok: false, reason: '使う条件を満たしていません', targets };
  }
  return { ok: true, reason: '', targets };
}

// ---------- 攻撃 ----------
export function attackTargets(s: BattleState, uid: number): { ok: boolean; reason: string; targets: (number | 'player')[] } {
  const m = findMon(s, uid);
  if (!m) return { ok: false, reason: 'いません', targets: [] };
  const p = m.owner;
  if (s.active !== p) return { ok: false, reason: '自分のターンではありません', targets: [] };
  if (s.turn === 1) return { ok: false, reason: '先攻の1ターン目は攻撃できません', targets: [] };
  if (m.guard) return { ok: false, reason: 'まもっている間は攻撃できません', targets: [] };
  if (m.stunned >= s.turn) return { ok: false, reason: '動けない状態です', targets: [] };
  const maxAtk = hasKw(s, m, 'double') ? 2 : 1;
  if (m.attacks >= maxAtk) return { ok: false, reason: 'このターンはもう攻撃しました', targets: [] };
  const foes = s.players[other(p)].field;
  const targets: (number | 'player')[] = [];
  const walls = foes.filter((f) => hasKw(s, f, 'wall'));
  for (const f of walls.length ? walls : foes) targets.push(f.uid);
  const skyDirect = hasKw(s, m, 'sky') && !foes.some((f) => hasKw(s, f, 'sky'));
  if (!foes.length || skyDirect) targets.push('player');
  return { ok: true, reason: '', targets };
}

/** バトルの計算（演出のプレビューやCPUの読みにも使う。サイコロの値を渡す） */
export function combatCalc(
  s: BattleState,
  att: FieldMon,
  dfn: FieldMon | null,
  dieA: number,
  dieD: number,
  extraA = 0,
  extraD = 0,
): { atkCalc: CalcPart[]; defCalc: CalcPart[]; atkTotal: number; defTotal: number } {
  const a = statOf(s, att, 'atk');
  const atkCalc = [...a.parts, { label: `サイコロ(${dieA})`, v: DICE_BONUS[dieA] }];
  if (extraA) atkCalc.push({ label: '効果', v: extraA });
  if (!dfn) {
    const atkTotal = Math.max(1, atkCalc.reduce((x, y) => x + y.v, 0));
    return { atkCalc, defCalc: [], atkTotal, defTotal: 0 };
  }
  const d = statOf(s, dfn, 'def');
  const defCalc = [...d.parts, { label: `サイコロ(${dieD})`, v: DICE_BONUS[dieD] }];
  if (extraD) defCalc.push({ label: '効果', v: extraD });
  if (dfn.guard) defCalc.push({ label: 'まもる', v: 2 });
  const ea = card(att.id).el;
  const ed = card(dfn.id).el;
  if (strongAgainst(ea, ed)) atkCalc.push({ label: `属性(${EL_NAME[ea]}→${EL_NAME[ed]})`, v: ELEMENT_BONUS });
  else if (strongAgainst(ed, ea)) defCalc.push({ label: `属性(${EL_NAME[ed]}→${EL_NAME[ea]})`, v: ELEMENT_BONUS });
  const atkTotal = Math.max(0, atkCalc.reduce((x, y) => x + y.v, 0));
  const defTotal = Math.max(0, defCalc.reduce((x, y) => x + y.v, 0));
  return { atkCalc, defCalc, atkTotal, defTotal };
}

// ---------- 行動の一覧 ----------
export function legalActions(s: BattleState): Action[] {
  if (s.winner !== null) return [];
  const p = s.active;
  const me = s.players[p];
  const out: Action[] = [];
  for (const h of me.hand) {
    const def = card(h.id);
    if (def.type === 'monster') {
      const c = summonCheck(s, p, h.uid);
      if (c.ok) for (const t of c.options) out.push({ t: 'summon', uid: h.uid, tributes: t });
    } else {
      const c = playCheck(s, p, h.uid);
      if (!c.ok) continue;
      const t = def.type === 'magic' ? 'magic' : 'item';
      if (chosenTargetKind(def)) for (const target of c.targets) out.push({ t, uid: h.uid, target });
      else out.push({ t, uid: h.uid });
    }
  }
  for (const m of me.field) {
    const a = attackTargets(s, m.uid);
    if (a.ok) {
      for (const target of a.targets) out.push({ t: 'attack', uid: m.uid, target });
      if (m.attacks === 0) out.push({ t: 'guard', uid: m.uid });
    }
  }
  out.push({ t: 'end' });
  return out;
}

export function isLegal(s: BattleState, a: Action): boolean {
  return legalActions(s).some((b) => sameAction(a, b));
}
export function sameAction(a: Action, b: Action): boolean {
  if (a.t !== b.t) return false;
  if (a.t === 'end') return true;
  if (a.t === 'summon' && b.t === 'summon') return a.uid === b.uid && [...a.tributes].sort().join() === [...b.tributes].sort().join();
  if ((a.t === 'magic' || a.t === 'item') && (b.t === 'magic' || b.t === 'item')) return a.uid === b.uid && (a.target ?? null) === (b.target ?? null);
  if (a.t === 'attack' && b.t === 'attack') return a.uid === b.uid && a.target === b.target;
  if (a.t === 'guard' && b.t === 'guard') return a.uid === b.uid;
  return false;
}

// ---------- 行動の実行 ----------
export function applyAction(s: BattleState, a: Action): BattleEvent[] {
  if (s.winner !== null) throw new Error('バトルは終わっています');
  if (!isLegal(s, a)) throw new Error(`その行動はできません: ${JSON.stringify(a)}`);
  const ev: BattleEvent[] = [];
  const p = s.active;
  const me = s.players[p];
  switch (a.t) {
    case 'summon': {
      const idx = me.hand.findIndex((c) => c.uid === a.uid);
      const h = me.hand.splice(idx, 1)[0];
      const tribNames: string[] = [];
      for (const t of a.tributes) {
        const m = findMon(s, t)!;
        tribNames.push(card(m.id).name);
        removeFromField(s, m, ev, false);
      }
      me.summoned = true;
      const m = putOnField(s, p, h.uid, h.id);
      s.log.push(`${me.name}は「${card(h.id).name}」を召喚${tribNames.length ? `（生け贄：${tribNames.join('・')}）` : ''}。`);
      ev.push({ k: 'summon', p, uid: m.uid, id: h.id, tributes: tribNames });
      runEffects(s, p, m, card(h.id), 'summon', ev, {});
      break;
    }
    case 'magic':
    case 'item': {
      const idx = me.hand.findIndex((c) => c.uid === a.uid);
      const h = me.hand.splice(idx, 1)[0];
      const def = card(h.id);
      if (def.type === 'magic') me.magicUsed = true;
      else me.itemUsed = true;
      s.log.push(`${me.name}は「${def.name}」を使った。`);
      ev.push({ k: 'cast', p, id: h.id, target: a.target });
      if (def.type === 'item' && def.equip) {
        const m = findMon(s, a.target!)!;
        m.equip = h.uid;
        m.equipId = h.id;
        runEffects(s, p, m, def, 'equip', ev, {});
      } else {
        const chosen = a.target !== undefined ? findMon(s, a.target) : undefined;
        runEffects(s, p, null, def, 'play', ev, { chosen });
        me.grave.push(h);
      }
      break;
    }
    case 'guard': {
      const m = findMon(s, a.uid)!;
      m.guard = true;
      m.attacks = 9;
      s.log.push(`「${card(m.id).name}」はまもりをかためた（守備+2）。`);
      ev.push({ k: 'guard', p, uid: m.uid });
      break;
    }
    case 'attack':
      doAttack(s, a.uid, a.target, ev);
      break;
    case 'end':
      endTurn(s, ev);
      break;
  }
  checkWin(s, ev);
  return ev;
}

function putOnField(s: BattleState, p: 0 | 1, uid: number, id: string): FieldMon {
  const m: FieldMon = {
    uid,
    id,
    owner: p,
    atkMod: 0,
    defMod: 0,
    atkTurn: 0,
    defTurn: 0,
    guard: false,
    attacks: 0,
    summonedTurn: s.turn,
    shield: (card(id).kw ?? []).includes('tough'),
    stunned: 0,
    equip: null,
    equipId: null,
    extraKw: [],
    diceBonusNext: 0,
    luckyNext: false,
  };
  s.players[p].field.push(m);
  return m;
}

/** 場から取り除く（墓地へ）。destroyed=true なら「破壊された時」の効果を発動 */
function removeFromField(s: BattleState, m: FieldMon, ev: BattleEvent[], destroyed: boolean, toHand = false): void {
  const owner = s.players[m.owner];
  const i = owner.field.findIndex((x) => x.uid === m.uid);
  if (i < 0) return;
  owner.field.splice(i, 1);
  if (m.equip !== null && m.equipId) owner.grave.push({ uid: m.equip, id: m.equipId });
  if (toHand) owner.hand.push({ uid: m.uid, id: m.id });
  else owner.grave.push({ uid: m.uid, id: m.id });
  if (destroyed) {
    ev.push({ k: 'destroy', p: m.owner, uid: m.uid, id: m.id });
    s.log.push(`「${card(m.id).name}」は破壊された。`);
    runEffects(s, m.owner, m, card(m.id), 'destroyed', ev, {});
  }
}

/** 破壊を試みる（しぶとい・守りの盾で1回耐える） */
function tryDestroy(s: BattleState, m: FieldMon, ev: BattleEvent[]): boolean {
  if (!findMon(s, m.uid)) return false;
  if (m.shield) {
    m.shield = false;
    s.log.push(`「${card(m.id).name}」はたえた！（しぶとい）`);
    ev.push({ k: 'fx', p: m.owner, src: m.id, text: 'たえた！' });
    return false;
  }
  removeFromField(s, m, ev, true);
  return true;
}

function changeLp(s: BattleState, p: 0 | 1, delta: number, ev: BattleEvent[]): void {
  if (!delta) return;
  const pl = s.players[p];
  pl.lp = Math.max(0, pl.lp + delta);
  ev.push({ k: 'lp', p, delta, lp: pl.lp });
  s.log.push(`${pl.name}のLP ${delta > 0 ? '+' : ''}${delta}（${pl.lp}）`);
}

function drawCard(s: BattleState, p: 0 | 1, ev: BattleEvent[]): boolean {
  const pl = s.players[p];
  const c = pl.deck.shift();
  if (!c) return false;
  pl.hand.push(c);
  ev.push({ k: 'draw', p, id: c.id });
  return true;
}

interface Ctx {
  chosen?: FieldMon;
  foe?: FieldMon | null;
  battle?: { diceAdd: number; lucky: boolean };
}

function resolveTargets(s: BattleState, p: 0 | 1, src: FieldMon | null, e: Effect, ctx: Ctx, fromSpell: boolean): FieldMon[] {
  const t: Target = e.target ?? 'self';
  const mine = s.players[p].field;
  const theirs = s.players[other(p)].field.filter((m) => !(fromSpell && hasKw(s, m, 'stealth')));
  const elOk = (m: FieldMon) => !e.el || card(m.id).el === e.el;
  const lvOk = (m: FieldMon) => !e.maxLv || card(m.id).lv <= e.maxLv;
  const pick = (list: FieldMon[]) => list.filter(elOk).filter(lvOk);
  const byPower = (list: FieldMon[]) => [...list].sort((a, b) => statOf(s, b, 'atk').total - statOf(s, a, 'atk').total || a.uid - b.uid);
  switch (t) {
    case 'self':
      return src && findMon(s, src.uid) ? [src] : [];
    case 'allyAll':
      return pick(mine);
    case 'allyOther':
      return pick(mine.filter((m) => m.uid !== src?.uid));
    case 'ally':
      if (ctx.chosen && ctx.chosen.owner === p) return [ctx.chosen];
      return byPower(pick(mine)).slice(0, 1);
    case 'enemy':
      if (ctx.chosen && ctx.chosen.owner !== p) return [ctx.chosen];
      return byPower(pick(theirs)).slice(0, 1);
    case 'enemyAll':
      return pick(theirs);
    case 'enemyStrong':
      return byPower(pick(theirs)).slice(0, 1);
    case 'enemyWeak':
      return byPower(pick(theirs)).slice(-1);
    case 'enemyRandom': {
      const l = pick(theirs);
      return l.length ? [l[randInt(s, l.length)]] : [];
    }
    case 'foe':
      return ctx.foe && findMon(s, ctx.foe.uid) ? [ctx.foe] : [];
  }
}

function reviveCandidate(s: BattleState, p: 0 | 1, e: Effect) {
  const g = s.players[p].grave;
  for (let i = g.length - 1; i >= 0; i--) {
    const d = card(g[i].id);
    if (d.type !== 'monster') continue;
    if (e.el && d.el !== e.el) continue;
    if (e.maxLv && d.lv > e.maxLv) continue;
    return g[i];
  }
  return undefined;
}

function runEffects(s: BattleState, p: 0 | 1, src: FieldMon | null, def: CardDef, on: Effect['on'], ev: BattleEvent[], ctx: Ctx): void {
  for (const e of def.fx ?? []) {
    if (e.on !== on) continue;
    if (s.winner !== null) return;
    if (!checkCond(s, p, e.if, ctx.foe ?? undefined)) continue;
    const fromSpell = def.type !== 'monster';
    const n = e.n ?? 1;
    const say = (text: string) => {
      ev.push({ k: 'fx', p, src: def.id, text });
      s.log.push(`【${def.name}】${text}`);
    };
    switch (e.do) {
      case 'dmg':
        if (e.target === 'self') changeLp(s, p, -n, ev);
        else {
          say(`相手に${n}ダメージ`);
          changeLp(s, other(p), -n, ev);
        }
        break;
      case 'drain':
        say(`相手のLPを${n}すいとった`);
        changeLp(s, other(p), -n, ev);
        changeLp(s, p, n, ev);
        break;
      case 'heal':
        say(`LPを${n}回復`);
        changeLp(s, p, n, ev);
        break;
      case 'buff': {
        if (on === 'equip') break; // 装備中ずっと効く（statOf で計算）
        const targets = resolveTargets(s, p, src, e, ctx, fromSpell);
        for (const m of targets) {
          const perm = e.dur === 'perm';
          if (e.stat === 'atk' || e.stat === 'both') perm ? (m.atkMod += n) : (m.atkTurn += n);
          if (e.stat === 'def' || e.stat === 'both') perm ? (m.defMod += n) : (m.defTurn += n);
        }
        if (targets.length) {
          const st = e.stat === 'both' ? '攻撃と守備' : e.stat === 'atk' ? '攻撃' : '守備';
          say(`${targets.map((m) => card(m.id).name).join('・')}の${st}${n >= 0 ? '+' : ''}${n}${e.dur === 'perm' ? '' : '（このターン）'}`);
        }
        break;
      }
      case 'destroy': {
        const targets = resolveTargets(s, p, src, e, ctx, fromSpell);
        for (const m of targets) {
          say(`「${card(m.id).name}」を破壊`);
          tryDestroy(s, m, ev);
        }
        break;
      }
      case 'draw':
        for (let i = 0; i < n; i++) drawCard(s, p, ev);
        say(`カードを${n}枚引いた`);
        break;
      case 'bounce': {
        for (const m of resolveTargets(s, p, src, e, ctx, fromSpell)) {
          say(`「${card(m.id).name}」を手札に戻した`);
          removeFromField(s, m, ev, false, true);
        }
        break;
      }
      case 'revive': {
        if (s.players[p].field.length >= FIELD_MAX) break;
        const g = reviveCandidate(s, p, e);
        if (!g) break;
        const grave = s.players[p].grave;
        grave.splice(grave.indexOf(g), 1);
        const m = putOnField(s, p, g.uid, g.id);
        say(`「${card(g.id).name}」が墓地から復活`);
        ev.push({ k: 'summon', p, uid: m.uid, id: g.id, tributes: [] });
        break;
      }
      case 'search': {
        const deck = s.players[p].deck;
        const i = deck.findIndex((c) => {
          const d = card(c.id);
          return (!e.type || d.type === e.type) && (!e.el || d.el === e.el) && (!e.maxLv || d.lv <= e.maxLv);
        });
        if (i >= 0) {
          const [c] = deck.splice(i, 1);
          s.players[p].hand.push(c);
          say(`山札から「${card(c.id).name}」を手札に加えた`);
        }
        break;
      }
      case 'shield':
        for (const m of resolveTargets(s, p, src, e, ctx, fromSpell)) {
          m.shield = true;
          say(`「${card(m.id).name}」に守りの盾`);
        }
        break;
      case 'stun':
        for (const m of resolveTargets(s, p, src, e, ctx, fromSpell)) {
          m.stunned = s.turn + 1;
          say(`「${card(m.id).name}」は次のターン攻撃できない`);
        }
        break;
      case 'discard': {
        const hand = s.players[other(p)].hand;
        for (let i = 0; i < n && hand.length; i++) {
          const [c] = hand.splice(randInt(s, hand.length), 1);
          s.players[other(p)].grave.push(c);
          say(`相手の手札「${card(c.id).name}」を捨てさせた`);
        }
        break;
      }
      case 'grant':
        if (on === 'equip') break;
        if (on === 'passive') break;
        for (const m of resolveTargets(s, p, src, e, ctx, fromSpell)) {
          if (e.kw && !m.extraKw.includes(e.kw)) m.extraKw.push(e.kw);
          if (e.kw === 'tough') m.shield = true;
          say(`「${card(m.id).name}」は${KW_NAME[e.kw!]}になった`);
        }
        break;
      case 'dice':
        if (ctx.battle) {
          ctx.battle.diceAdd += n;
          say(`サイコロ${n >= 0 ? '+' : ''}${n}`);
        } else
          for (const m of resolveTargets(s, p, src, e, ctx, fromSpell)) {
            m.diceBonusNext += n;
            say(`「${card(m.id).name}」の次のサイコロ+${n}`);
          }
        break;
      case 'lucky':
        if (ctx.battle) {
          ctx.battle.lucky = true;
          say('サイコロを2回振る');
        } else
          for (const m of resolveTargets(s, p, src, e, ctx, fromSpell)) {
            m.luckyNext = true;
            say(`「${card(m.id).name}」の次のサイコロは2回振って高い方`);
          }
        break;
    }
    // 装備の「装備した時」の追加効果（盾・キーワードのしぶとい）
    if (on === 'equip' && e.do === 'grant' && e.kw === 'tough' && src) src.shield = true;
  }
}

export const KW_NAME: Record<Keyword, string> = {
  sky: 'そら',
  wall: 'かべ',
  double: 'れんげき',
  lucky: 'ラッキー',
  stealth: 'かくれみ',
  tough: 'しぶとい',
};

function doAttack(s: BattleState, uid: number, target: number | 'player', ev: BattleEvent[]): void {
  const att = findMon(s, uid)!;
  const p = att.owner;
  const op = other(p);
  const dfn = target === 'player' ? null : findMon(s, target)!;
  att.attacks++;
  const ctxA: Ctx = { foe: dfn, battle: { diceAdd: att.diceBonusNext, lucky: att.luckyNext || hasKw(s, att, 'lucky') } };
  att.diceBonusNext = 0;
  att.luckyNext = false;
  s.log.push(`「${card(att.id).name}」の攻撃！ → ${dfn ? `「${card(dfn.id).name}」` : s.players[op].name}`);
  runEffects(s, p, att, card(att.id), 'attack', ev, ctxA);
  if (s.winner !== null || !findMon(s, att.uid)) return;
  let ctxD: Ctx | null = null;
  if (dfn) {
    ctxD = { foe: att, battle: { diceAdd: dfn.diceBonusNext, lucky: dfn.luckyNext || hasKw(s, dfn, 'lucky') } };
    dfn.diceBonusNext = 0;
    dfn.luckyNext = false;
    runEffects(s, op, dfn, card(dfn.id), 'defend', ev, ctxD);
    if (!findMon(s, dfn.uid)) {
      s.log.push('相手がいなくなったので攻撃は止まった。');
      return;
    }
  }
  const roll = (lucky: boolean, who: 'atk' | 'def', owner: 0 | 1): number => {
    const a = rollDie(s);
    if (!lucky) {
      ev.push({ k: 'dice', p: owner, v: a, bonus: DICE_BONUS[a], who });
      return a;
    }
    const b = rollDie(s);
    const v = Math.max(a, b);
    ev.push({ k: 'dice', p: owner, v, bonus: DICE_BONUS[v], who, extra: Math.min(a, b) });
    return v;
  };
  const dA = roll(ctxA.battle!.lucky, 'atk', p);
  const dD = dfn ? roll(ctxD!.battle!.lucky, 'def', op) : 0;
  const c = combatCalc(s, att, dfn, dA, dfn ? dD : 1, ctxA.battle!.diceAdd, ctxD?.battle?.diceAdd ?? 0);
  if (!dfn) {
    ev.push({ k: 'combat', p, atkUid: att.uid, defUid: null, ...c, result: 'direct', dmg: c.atkTotal });
    s.log.push(`直接攻撃！ ${c.atkTotal}ダメージ`);
    changeLp(s, op, -c.atkTotal, ev);
    return;
  }
  const diff = c.atkTotal - c.defTotal;
  const result = diff > 0 ? 'win' : diff === 0 ? 'tie' : 'lose';
  ev.push({ k: 'combat', p, atkUid: att.uid, defUid: dfn.uid, ...c, result, dmg: Math.abs(diff) });
  s.log.push(`攻撃${c.atkTotal} 対 守備${c.defTotal}`);
  if (result === 'win') {
    tryDestroy(s, dfn, ev);
    changeLp(s, op, -diff, ev);
  } else if (result === 'lose') {
    s.log.push('はね返された！');
    changeLp(s, p, diff, ev);
  } else {
    s.log.push('互角！ 何も起きなかった。');
  }
}

function startTurn(s: BattleState, p: 0 | 1, ev: BattleEvent[]): void {
  s.turn++;
  s.active = p;
  const me = s.players[p];
  me.summoned = false;
  me.magicUsed = false;
  me.itemUsed = false;
  for (const m of me.field) {
    m.attacks = 0;
    m.guard = false;
  }
  ev.push({ k: 'turn', p, turn: s.turn });
  s.log.push(`―― ${s.turn}ターン目：${me.name} ――`);
  if (s.turn > 1) {
    if (!drawCard(s, p, ev)) {
      s.winner = other(p);
      s.endReason = `${me.name}の山札がなくなった`;
      ev.push({ k: 'end', winner: s.winner, reason: s.endReason });
      return;
    }
  }
  for (const m of [...me.field]) {
    if (s.winner !== null) return;
    runEffects(s, p, m, card(m.id), 'turnStart', ev, {});
  }
}

function endTurn(s: BattleState, ev: BattleEvent[]): void {
  for (const pl of s.players)
    for (const m of pl.field) {
      m.atkTurn = 0;
      m.defTurn = 0;
    }
  if (s.turn >= s.maxTurns) {
    const [a, b] = [s.players[0].lp, s.players[1].lp];
    s.winner = a === b ? 'draw' : a > b ? 0 : 1;
    s.endReason = `${s.maxTurns}ターンが終わった（LPの多い方の勝ち）`;
    ev.push({ k: 'end', winner: s.winner, reason: s.endReason });
    return;
  }
  startTurn(s, other(s.active), ev);
}

function checkWin(s: BattleState, ev: BattleEvent[]): void {
  if (s.winner !== null) {
    if (!ev.some((e) => e.k === 'end')) ev.push({ k: 'end', winner: s.winner, reason: s.endReason });
    return;
  }
  const z0 = s.players[0].lp <= 0;
  const z1 = s.players[1].lp <= 0;
  if (!z0 && !z1) return;
  s.winner = z0 && z1 ? 'draw' : z0 ? 1 : 0;
  s.endReason = s.winner === 'draw' ? 'おたがいのLPが0になった' : `${s.players[other(s.winner as 0 | 1)].name}のLPが0になった`;
  ev.push({ k: 'end', winner: s.winner, reason: s.endReason });
}

/** 状態の指紋（通信対戦で両端末の食い違いを見つける） */
export function stateHash(s: BattleState): string {
  const str = JSON.stringify([s.rng, s.turn, s.active, s.players.map((p) => [p.lp, p.deck.map((c) => c.uid), p.hand.map((c) => c.uid), p.field.map((m) => [m.uid, m.atkMod, m.defMod, m.shield, m.equip])])]);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
