// バトル画面。エンジン（src/engine）の結果を表示し、プレイヤーの操作をエンジンの行動に変える。
import { bgStyle, battleBg } from './bg';
import { chooseAction, type AiStyle } from '../engine/ai';
import { applyAction, attackTargets, chosenTargetKind, createBattle, findMon, hasKw, KW_NAME, keywords, playCheck, statOf, summonCheck, type BattleSetup } from '../engine/battle';
import { card, DICE_BONUS, EL_ICON, EL_NAME } from '../engine/cards';
import type { Action, BattleEvent, BattleState, FieldMon } from '../engine/types';
import { playBgm, sfx } from '../audio/sound';
import { confirmBox, game, h, overlay, root, showScreen, sleep, toast } from './app';
import { miniCard, openCard } from './cardView';
import { lcg } from '../game/tournament';

export interface TutStep {
  text: string;
  wait: 'next' | { open: string } | { act: Action['t']; id?: string; target?: string; tribute?: string };
  hl?: string;
  hint?: string;
  chart?: boolean;
  pos?: 'top' | 'bottom';
}
export interface Tutorial {
  steps: TutStep[];
  oppScript: Record<number, string[]>; // ターン番号 → ['summon:a01', 'end']
  onSkip: () => void;
  onRestart: () => void;
}

export interface Remote {
  next(): Promise<Action | { t: 'quit' } | { t: 'lost' }>;
  send(a: Action): void;
  quit(): void;
  /** 対戦の状態を渡す（ずれの確認用）。end は自分のターン中に相手が切断・降参した時に呼ぶ */
  bind?(s: BattleState, end: (w: 0 | 1 | 'lost') => void): void;
}

export interface BattleOpts {
  setup: BattleSetup;
  me?: 0 | 1;
  cpu?: AiStyle;
  cpuSeed?: number;
  oppTitle?: string;
  bgm?: string;
  /** 背景の絵（省略時は bgm から決める） */
  bg?: import('./bg').BgName;
  tutorial?: Tutorial;
  remote?: Remote;
  canQuit?: boolean;
  intro?: string;
}

export interface BattleResult {
  winner: 0 | 1 | 'draw' | 'quit' | 'lost';
  state: BattleState;
}

type Mode = { k: 'idle' } | { k: 'tribute'; uid: number; need: number; picked: number[]; options: number[][] } | { k: 'target'; uid: number; t: 'magic' | 'item'; targets: number[] } | { k: 'attack'; uid: number; targets: (number | 'player')[] };

export function runBattle(o: BattleOpts): Promise<BattleResult> {
  return new Promise((resolve) => {
    const me = o.me ?? 0;
    const op = (me === 0 ? 1 : 0) as 0 | 1;
    const { state: s, events: startEvents } = createBattle(o.setup);
    const fast = () => game.d.settings.fastAnim;
    const cpuRand = lcg(o.cpuSeed ?? o.setup.seed ^ 0x9e3779b9);
    let mode: Mode = { k: 'idle' };
    let busy = false;
    let finished = false;
    let tutI = 0;
    let lastHint = '';
    playBgm(o.bgm ?? 'battle');

    const el = h('div', { class: 'screen battle', style: { background: bgStyle(o.bg ?? battleBg(undefined, o.bgm), '#160f3a') } });
    const topBar = h('div', { class: 'bt-bar top' });
    const oppLane = h('div', { class: 'lane opp' });
    const mid = h('div', { class: 'mid' });
    const myLane = h('div', { class: 'lane me' });
    const myBar = h('div', { class: 'bt-bar' });
    const hand = h('div', { class: 'hand' });
    const actions = h('div', { class: 'bt-actions' });
    el.append(topBar, oppLane, mid, myLane, myBar, hand, actions);
    // ガイドは画面の一番上に「場所をとって」置く（相手の場やボタンを隠さない）
    const guide = h('div', { class: 'guide', style: { display: 'none' } });
    el.prepend(guide);
    showScreen(el);

    // ---------- 描画 ----------
    function lpBar(lp: number, start: number) {
      const pct = Math.max(0, Math.min(100, (lp / Math.max(start, 20)) * 100));
      return h('div', { class: `lp ${lp <= 6 ? 'low' : ''}` }, h('i', { style: { width: `${pct}%` } }), h('span', {}, `LP ${lp}`));
    }
    const startLp = o.setup.lp ?? [20, 20];

    function monEl(m: FieldMon) {
      const a = statOf(s, m, 'atk').total;
      const d = statOf(s, m, 'def').total;
      const def = card(m.id);
      const kws = keywords(s, m);
      const node = miniCard(def, { atk: a, def: d, badge: kws.length ? kws.map((k) => KW_NAME[k]).join('・') : undefined });
      return node;
    }

    function slot(m: FieldMon | undefined, side: 0 | 1) {
      const sl = h('div', { class: 'slot' });
      if (!m) return sl;
      sl.dataset.uid = String(m.uid);
      sl.dataset.id = m.id;
      sl.append(monEl(m));
      if (m.guard) sl.append(h('div', { class: 'state' }, '🛡まもり'));
      else if (m.stunned >= s.turn && side === s.active) sl.append(h('div', { class: 'state stun' }, '動けない'));
      else if (m.shield) sl.append(h('div', { class: 'state' }, '✨盾'));
      if (m.equipId) sl.append(h('div', { class: 'eq' }, `⚔${card(m.equipId).name}`));
      // 操作できる印
      if (!busy && s.active === me && side === me && mode.k === 'idle' && attackTargets(s, m.uid).ok) sl.classList.add('can');
      if (mode.k === 'tribute' && side === me && mode.options.some((op2) => op2.includes(m.uid))) sl.classList.add(mode.picked.includes(m.uid) ? 'target' : 'can');
      if (mode.k === 'target' && mode.targets.includes(m.uid)) sl.classList.add('target');
      if (mode.k === 'attack' && side !== me && mode.targets.includes(m.uid)) sl.classList.add('target');
      sl.addEventListener('click', () => onSlot(m, side));
      return sl;
    }

    function render() {
      const P = s.players[me];
      const O = s.players[op];
      topBar.replaceChildren(h('span', { class: 'nm' }, `${O.name}${o.oppTitle ? `（${o.oppTitle}）` : ''}`), h('span', { class: 'pile' }, `手札${O.hand.length}`), h('span', { class: 'pile' }, `山札${O.deck.length}`), lpBar(O.lp, startLp[op]));
      oppLane.replaceChildren(...[0, 1, 2].map((i) => slot(O.field[i], op)));
      myLane.replaceChildren(...[0, 1, 2].map((i) => slot(P.field[i], me)));
      myBar.replaceChildren(h('span', { class: 'nm' }, P.name), h('span', { class: 'pile', onclick: () => showGrave(me) }, `墓地${P.grave.length}`), h('span', { class: 'pile' }, `山札${P.deck.length}`), lpBar(P.lp, startLp[me]));
      hand.replaceChildren(
        ...P.hand.map((c) => {
          const def = card(c.id);
          let playable = false;
          if (s.active === me && !busy) playable = def.type === 'monster' ? summonCheck(s, me, c.uid).ok : playCheck(s, me, c.uid).ok;
          const m = miniCard(def, { cls: playable ? 'playable' : '' });
          m.addEventListener('click', () => onHand(c.uid));
          return m;
        }),
      );
      hand.style.setProperty('--n', String(Math.max(2, P.hand.length)));
      if (!P.hand.length) hand.append(h('div', { class: 'empty' }, '手札はありません'));
      // 真ん中の情報
      let info = '';
      if (s.winner !== null) info = '決着！';
      else if (s.active !== me) info = `${O.name}のターン…`;
      else if (mode.k === 'tribute') info = `生け贄にするモンスターを${mode.need}体タップ（${mode.picked.length}/${mode.need}）`;
      else if (mode.k === 'target') info = '対象のモンスターをタップ';
      else if (mode.k === 'attack') info = '攻撃する相手をタップ';
      else {
        const left: string[] = [];
        if (!P.summoned) left.push('召喚');
        if (!P.magicUsed) left.push('魔法');
        if (!P.itemUsed) left.push('アイテム');
        info = `あなたのターン（${s.turn}/${s.maxTurns}）　まだできる：${left.join('・') || 'なし'}${P.field.some((m) => attackTargets(s, m.uid).ok) ? '・攻撃' : ''}`;
      }
      mid.replaceChildren(h('div', { class: 'info' }, info), h('button', { class: 'mbtn', onclick: showLog }, 'ログ'), h('button', { class: 'mbtn', onclick: showHelp }, '？'));
      // 下のボタン
      actions.replaceChildren();
      if (mode.k !== 'idle') {
        if (mode.k === 'attack' && mode.targets.includes('player')) actions.append(h('button', { class: 'btn primary', onclick: () => act({ t: 'attack', uid: (mode as { uid: number }).uid, target: 'player' }) }, '相手に直接攻撃！'));
        if (mode.k === 'tribute') {
          const m = mode;
          const ok = m.options.some((opt) => opt.length === m.picked.length && opt.every((u) => m.picked.includes(u)));
          actions.append(h('button', { class: 'btn primary', disabled: !ok, onclick: () => act({ t: 'summon', uid: m.uid, tributes: [...m.picked] }) }, '生け贄にして召喚'));
        }
        actions.append(h('button', { class: 'btn gray', onclick: () => ((mode = { k: 'idle' }), sfx('cancel'), render()) }, 'やめる'));
      } else {
        if (o.canQuit !== false && !o.tutorial) actions.append(h('button', { class: 'btn gray', style: { flex: '0 0 auto' }, onclick: quit }, 'こうさん'));
        actions.append(h('button', { class: 'btn blue', id: 'bt-end', disabled: s.active !== me || busy || s.winner !== null, onclick: () => act({ t: 'end' }) }, 'ターン終了 ▶'));
      }
      applyHighlight();
    }

    // ---------- チュートリアル ----------
    function tutStep(): TutStep | null {
      return o.tutorial ? (o.tutorial.steps[tutI] ?? null) : null;
    }
    function showGuide() {
      const st = tutStep();
      if (!st) {
        guide.style.display = 'none';
        return;
      }
      guide.style.display = 'block';
      const kids: HTMLElement[] = [h('div', {}, `📘 ${st.text}`)];
      if (st.chart) kids.push(elementChart());
      if (lastHint) kids.push(h('div', { class: 'hint' }, `💡 ${lastHint}`));
      const btns = h('div', { class: 'gbtns' }, h('button', { onclick: () => o.tutorial!.onRestart() }, 'やりなおす'), h('button', { onclick: () => skipTut() }, 'スキップ'));
      if (st.wait === 'next')
        btns.append(
          h('button', {
            class: 'ok',
            onclick: () => {
              sfx('ok');
              advanceTut();
            },
          }, 'つぎへ ▶'),
        );
      kids.push(btns);
      guide.replaceChildren(...kids);
      applyHighlight();
    }
    async function skipTut() {
      if (await confirmBox('チュートリアルをスキップしますか？\n（スキップしても、カードとデッキはもらえます）')) {
        finished = true;
        o.tutorial!.onSkip();
      }
    }
    function advanceTut() {
      tutI++;
      lastHint = '';
      showGuide();
      void maybeOpponent();
    }
    function applyHighlight() {
      document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
      const st = tutStep();
      if (st?.hl) document.querySelectorAll(st.hl).forEach((e) => e.classList.add('hl'));
    }
    function tutAllows(a: Action): boolean {
      const st = tutStep();
      if (!st) return true;
      if (st.wait === 'next' || 'open' in st.wait) {
        lastHint = st.wait === 'next' ? '説明を読んだら「つぎへ」を押そう' : st.hint ?? 'まずはカードをタップして見てみよう';
        showGuide();
        return false;
      }
      const w = st.wait;
      let ok = a.t === w.act;
      if (ok && w.id && 'uid' in a) {
        const hc = s.players[me].hand.find((c) => c.uid === a.uid) ?? findMon(s, a.uid);
        ok = hc?.id === w.id;
      }
      if (ok && w.target && a.t === 'attack') ok = w.target === 'player' ? a.target === 'player' : a.target !== 'player' && findMon(s, a.target)?.id === w.target;
      if (ok && w.tribute && a.t === 'summon') ok = a.tributes.some((u) => findMon(s, u)?.id === w.tribute);
      if (!ok) {
        sfx('bad');
        lastHint = st.hint ?? 'ガイドに書いてあることをやってみよう';
        showGuide();
      }
      return ok;
    }
    function tutOpen(id: string) {
      const st = tutStep();
      if (st && typeof st.wait === 'object' && 'open' in st.wait && st.wait.open === id) advanceTut();
    }

    // ---------- 操作 ----------
    function onHand(uid: number) {
      if (busy) return;
      const c = s.players[me].hand.find((x) => x.uid === uid);
      if (!c) return;
      const def = card(c.id);
      const btns: HTMLElement[] = [];
      let close = () => {};
      if (s.active === me && s.winner === null && mode.k === 'idle') {
        if (def.type === 'monster') {
          const chk = summonCheck(s, me, uid);
          btns.push(
            h('button', {
              class: 'btn primary wide',
              disabled: !chk.ok,
              onclick: () => {
                close();
                if (chk.need === 0) act({ t: 'summon', uid, tributes: [] });
                else {
                  mode = { k: 'tribute', uid, need: chk.need, picked: [], options: chk.options };
                  sfx('tap');
                  render();
                }
              },
            }, chk.need ? `生け贄${chk.need}体で召喚する` : '召喚する'),
          );
          if (!chk.ok) btns.push(h('div', { class: 'reason' }, chk.reason));
        } else {
          const chk = playCheck(s, me, uid);
          btns.push(
            h('button', {
              class: 'btn primary wide',
              disabled: !chk.ok,
              onclick: () => {
                close();
                const t = def.type === 'magic' ? 'magic' : 'item';
                if (chosenTargetKind(def)) {
                  mode = { k: 'target', uid, t, targets: chk.targets };
                  sfx('tap');
                  render();
                } else act({ t, uid });
              },
            }, def.equip ? '使う（装備するモンスターを選ぶ）' : '使う'),
          );
          if (!chk.ok) btns.push(h('div', { class: 'reason' }, chk.reason));
        }
      } else if (s.active !== me) btns.push(h('div', { class: 'muted center' }, '相手のターン中です'));
      close = openCard(def, { actions: btns });
      tutOpen(def.id);
      applyHighlight();
    }

    function onSlot(m: FieldMon, side: 0 | 1) {
      if (busy) return;
      if (mode.k === 'tribute') {
        if (side !== me) return;
        const md = mode;
        if (md.picked.includes(m.uid)) md.picked = md.picked.filter((u) => u !== m.uid);
        else if (md.picked.length < md.need) md.picked.push(m.uid);
        sfx('tap');
        render();
        return;
      }
      if (mode.k === 'target') {
        if (mode.targets.includes(m.uid)) act({ t: mode.t, uid: mode.uid, target: m.uid });
        else toast('そのモンスターは選べません');
        return;
      }
      if (mode.k === 'attack') {
        if (side !== me && mode.targets.includes(m.uid)) act({ t: 'attack', uid: mode.uid, target: m.uid });
        else if (side !== me) toast(s.players[op].field.some((f) => hasKw(s, f, 'wall')) ? '「かべ」のモンスターを先に狙おう' : 'そのモンスターは狙えません');
        return;
      }
      const def = card(m.id);
      const btns: HTMLElement[] = [];
      let close = () => {};
      if (side === me && s.active === me && s.winner === null) {
        const at = attackTargets(s, m.uid);
        btns.push(
          h('button', {
            class: 'btn primary wide',
            disabled: !at.ok,
            onclick: () => {
              close();
              if (at.targets.length === 1 && at.targets[0] === 'player') act({ t: 'attack', uid: m.uid, target: 'player' });
              else {
                mode = { k: 'attack', uid: m.uid, targets: at.targets };
                sfx('tap');
                render();
              }
            },
          }, '⚔ 攻撃する'),
        );
        if (!at.ok) btns.push(h('div', { class: 'reason' }, at.reason));
        if (at.ok && m.attacks === 0) btns.push(h('button', { class: 'btn blue wide', onclick: () => (close(), act({ t: 'guard', uid: m.uid })) }, '🛡 まもる（守備+2・このターンは攻撃しない）'));
      }
      const a = statOf(s, m, 'atk');
      const d = statOf(s, m, 'def');
      const detail = h('div', { class: 'panel', style: { marginTop: '8px', fontSize: '14px' } }, h('div', {}, `いまの攻撃 ${a.total}（${a.parts.map((p) => `${p.label}${p.v >= 0 ? '+' : ''}${p.v}`).join(' ')}）`), h('div', {}, `いまの守備 ${d.total}（${d.parts.map((p) => `${p.label}${p.v >= 0 ? '+' : ''}${p.v}`).join(' ')}）`), m.equipId ? h('div', {}, `装備：${card(m.equipId).name}`) : null);
      close = openCard(def, { actions: btns, atk: a.total, def: d.total, extra: detail });
      tutOpen(def.id);
      applyHighlight();
    }

    async function act(a: Action) {
      if (busy || finished) return;
      if (o.tutorial && !tutAllows(a)) {
        mode = { k: 'idle' };
        render();
        return;
      }
      mode = { k: 'idle' };
      busy = true;
      let ev: BattleEvent[];
      try {
        ev = applyAction(s, a);
      } catch (e) {
        busy = false;
        toast(String((e as Error).message));
        render();
        return;
      }
      o.remote?.send(a);
      render();
      await animate(ev);
      busy = false;
      if (o.tutorial && tutStep() && typeof tutStep()!.wait === 'object') {
        tutI++;
        lastHint = '';
        showGuide();
      }
      render();
      if (await checkEnd()) return;
      await maybeOpponent();
    }

    async function maybeOpponent() {
      if (finished || s.winner !== null || s.active !== op || busy) return;
      if (o.tutorial && tutStep()?.wait === 'next') return; // 説明を読んでから
      busy = true;
      render();
      await sleep(fast() ? 250 : 650);
      let guard = 0;
      while (!finished && s.winner === null && s.active === op && guard++ < 60) {
        let a: Action | null = null;
        if (o.remote) {
          const r = await o.remote.next();
          if (r.t === 'quit' || r.t === 'lost') {
            finish(r.t === 'quit' ? me : 'lost');
            return;
          }
          a = r;
        } else if (o.tutorial) {
          const script = o.tutorial.oppScript[s.turn] ?? ['end'];
          const done = (s as unknown as { _tdone?: Record<number, number> })._tdone ?? ((s as unknown as { _tdone: Record<number, number> })._tdone = {});
          const step = done[s.turn] ?? 0;
          done[s.turn] = step + 1;
          const cmd = script[step] ?? 'end';
          if (cmd.startsWith('summon:')) {
            const hc = s.players[op].hand.find((c) => c.id === cmd.slice(7));
            a = hc ? { t: 'summon', uid: hc.uid, tributes: [] } : { t: 'end' };
          } else a = { t: 'end' };
        } else a = chooseAction(s, o.cpu!, cpuRand);
        let ev: BattleEvent[];
        try {
          ev = applyAction(s, a);
        } catch {
          if (o.remote) {
            toast('相手から不正な行動が届きました。対戦を中止します。');
            finish('lost');
            return;
          }
          ev = applyAction(s, { t: 'end' });
        }
        render();
        await animate(ev);
        render();
        if (await checkEnd()) return;
        if (s.active === op) await sleep(fast() ? 200 : 520);
      }
      busy = false;
      render();
    }

    // ---------- 演出 ----------
    async function animate(ev: BattleEvent[]) {
      const dice: Extract<BattleEvent, { k: 'dice' }>[] = [];
      for (const e of ev) {
        switch (e.k) {
          case 'draw':
            if (e.p === me) sfx('card');
            break;
          case 'summon': {
            sfx('summon');
            render();
            const node = el.querySelector(`.slot[data-uid="${e.uid}"]`);
            node?.classList.add('flash');
            if (e.p === op) toast(`${s.players[op].name}は「${card(e.id).name}」を${e.tributes.length ? '生け贄召喚' : '召喚'}！`, 1300);
            await sleep(fast() ? 200 : 500);
            break;
          }
          case 'cast':
            sfx('ok');
            if (e.p === op) {
              toast(`${s.players[op].name}は「${card(e.id).name}」を使った！`, 1500);
              await sleep(fast() ? 300 : 800);
            }
            break;
          case 'fx':
            toast(`【${card(e.src).name}】${e.text}`, 1500);
            await sleep(fast() ? 250 : 650);
            break;
          case 'dice':
            dice.push(e);
            break;
          case 'combat':
            await showCombat(e, dice.splice(0));
            break;
          case 'destroy':
            sfx('destroy');
            break;
          case 'lp': {
            sfx(e.delta < 0 ? 'hit' : 'heal');
            render();
            const bar = (e.p === me ? myBar : topBar).querySelector('.lp') as HTMLElement | null;
            if (bar) {
              const r = bar.getBoundingClientRect();
              const rr = root().getBoundingClientRect();
              const f = h('div', { class: `float ${e.delta > 0 ? 'heal' : ''}`, style: { left: `${r.left - rr.left + 30}px`, top: `${r.top - rr.top - 6}px` } }, `${e.delta > 0 ? '+' : ''}${e.delta}`);
              root().append(f);
              setTimeout(() => f.remove(), 1000);
              bar.classList.add('shake');
            }
            await sleep(fast() ? 150 : 350);
            break;
          }
          case 'guard':
            sfx('ok');
            if (e.p === op) toast(`「${card(findMon(s, e.uid)?.id ?? 'f01').name}」はまもりをかためた`, 1200);
            break;
          case 'turn':
            if (s.winner === null) {
              toast(e.p === me ? '▶ あなたのターン' : `▶ ${s.players[op].name}のターン`, 1100);
              await sleep(fast() ? 200 : 450);
            }
            break;
          case 'end':
            break;
        }
      }
    }

    function dieFace(v: number, cls = '') {
      const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
      const d = h('div', { class: `die ${cls}` });
      for (let i = 0; i < 9; i++) d.append(h('i', { style: { visibility: pips[v]?.includes(i) ? 'visible' : 'hidden' } }));
      return d;
    }

    function showCombat(e: Extract<BattleEvent, { k: 'combat' }>, dice: Extract<BattleEvent, { k: 'dice' }>[]): Promise<void> {
      return new Promise((resolve) => {
        const att = card(findMonAny(e.atkUid) ?? 'f01');
        const defName = e.defUid === null ? s.players[e.p === 0 ? 1 : 0].name : card(findMonAny(e.defUid) ?? 'f01').name;
        const dA = dice.find((d) => d.who === 'atk');
        const dD = dice.find((d) => d.who === 'def');
        sfx('dice');
        const rollRow = h('div', { class: 'dice-row' }, h('div', {}, dieFace(1 + Math.floor(Math.random() * 6), 'rolling'), h('div', { class: 'die-label' }, '攻撃側')), e.defUid !== null ? h('div', {}, dieFace(1 + Math.floor(Math.random() * 6), 'def rolling'), h('div', { class: 'die-label' }, '守備側')) : null);
        const box = h('div', { class: 'combat' }, h('h3', {}, `${att.name} の攻撃 → ${defName}`), rollRow);
        let closed = false;
        const close = overlay(box, { closeOnBg: false });
        const finish2 = () => {
          if (closed) return;
          closed = true;
          close();
          resolve();
        };
        const line = (p: { label: string; v: number }) => h('div', { class: 'line' }, h('span', {}, p.label), h('b', {}, `${p.v >= 0 && p.label !== '攻撃' && p.label !== '守備' ? '+' : ''}${p.v}`));
        setTimeout(
          () => {
            sfx('attack');
            const labA = dA ? `出目 ${dA.v}（${DICE_BONUS[dA.v] >= 0 ? '+' : ''}${DICE_BONUS[dA.v]}）${dA.extra ? `　※2回振った：${dA.extra}と${dA.v}` : ''}` : '';
            const labD = dD ? `出目 ${dD.v}（${DICE_BONUS[dD.v] >= 0 ? '+' : ''}${DICE_BONUS[dD.v]}）${dD.extra ? `　※2回振った：${dD.extra}と${dD.v}` : ''}` : '';
            rollRow.replaceChildren(h('div', {}, dieFace(dA?.v ?? 1), h('div', { class: 'die-label' }, labA)), e.defUid !== null ? h('div', {}, dieFace(dD?.v ?? 1, 'def'), h('div', { class: 'die-label' }, labD)) : h('span'));
            const calc = h('div', { class: 'calc' }, h('div', { class: 'side' }, h('b', {}, '攻撃力'), e.atkCalc.map(line), h('div', { class: 'line tot' }, h('span', {}, '合計'), h('span', {}, e.atkTotal))), e.defUid !== null ? h('div', { class: 'side d' }, h('b', {}, '守備力'), e.defCalc.map(line), h('div', { class: 'line tot' }, h('span', {}, '合計'), h('span', {}, e.defTotal))) : h('div', { class: 'side d' }, h('b', {}, '直接攻撃'), h('div', {}, '相手のLPに'), h('div', { class: 'line tot' }, h('span', {}, 'ダメージ'), h('span', {}, e.dmg))));
            const res = e.result === 'direct' ? `直接攻撃！ ${e.dmg}ダメージ` : e.result === 'win' ? `攻撃成功！ ${defName}を倒した！ 相手に${e.dmg}ダメージ` : e.result === 'tie' ? '互角！ 何も起きなかった' : `はね返された！ 攻撃した側に${e.dmg}ダメージ`;
            const good = (e.result === 'win' || e.result === 'direct') === (e.p === me);
            box.append(calc, h('div', { class: `result ${good ? 'win' : 'lose'}` }, res), h('div', { class: 'tapnext' }, 'タップで次へ'));
            box.addEventListener('click', finish2);
            const st = tutStep();
            if (!(o.tutorial && st)) setTimeout(finish2, fast() ? 1100 : 2600);
          },
          fast() ? 300 : 750,
        );
      });
    }
    function findMonAny(uid: number): string | null {
      const m = findMon(s, uid);
      if (m) return m.id;
      for (const p of s.players) {
        const g = p.grave.find((c) => c.uid === uid) ?? p.hand.find((c) => c.uid === uid);
        if (g) return g.id;
      }
      return null;
    }

    function showLog() {
      sfx('menu');
      overlay(h('div', { class: 'modal' }, h('h3', { style: { marginTop: 0 } }, 'バトルログ'), h('div', { class: 'log' }, s.log.slice(-120).reverse().map((l) => h('div', {}, l)))));
    }
    function showGrave(p: 0 | 1) {
      const g = s.players[p].grave;
      overlay(h('div', { class: 'modal' }, h('h3', { style: { marginTop: 0 } }, `墓地（${g.length}枚）`), g.length ? h('div', { class: 'grid' }, g.map((c) => miniCard(c.id, { onClick: () => openCard(card(c.id)) }))) : h('p', {}, 'まだありません')));
    }
    function showHelp() {
      sfx('menu');
      overlay(
        h(
          'div',
          { class: 'modal', style: { fontSize: '15px', lineHeight: '1.6' } },
          h('h3', { style: { marginTop: 0 } }, 'バトルのルール'),
          h('p', {}, '相手のLPを0にすれば勝ち。相手の山札がなくなってドローできなくても勝ち。30ターンたったらLPが多い方の勝ち。'),
          h('p', {}, '1ターンに：召喚1回・魔法1枚・アイテム1枚。場の各モンスターは1回攻撃か「まもる」。'),
          h('p', {}, 'Lv1〜3はそのまま召喚。Lv4〜5は生け贄1体、Lv6〜7は生け贄2体。'),
          h('p', {}, '攻撃力（攻撃＋サイコロ補正＋属性）と守備力（守備＋サイコロ補正＋属性）を比べる。勝てば相手を倒して差の分ダメージ、負ければ差の分自分にダメージ。'),
          h('p', {}, 'サイコロ補正：1→−1　2・3→±0　4・5→+1　6→+2'),
          elementChart(),
        ),
      );
    }

    async function quit() {
      if (await confirmBox('こうさんしますか？（負けになります）')) {
        o.remote?.quit();
        finish(op);
      }
    }

    async function checkEnd(): Promise<boolean> {
      if (s.winner === null) return false;
      await sleep(fast() ? 300 : 700);
      finish(s.winner);
      return true;
    }
    function finish(w: BattleResult['winner']) {
      if (finished) return;
      finished = true;
      busy = true;
      document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl'));
      resolve({ winner: w, state: s });
    }

    // 開始
    void startEvents;
    o.remote?.bind?.(s, (w) => finish(w));
    render();
    showGuide();
    if (o.intro) toast(o.intro, 2200);
    toast(s.active === me ? 'あなたの先攻！' : `${s.players[op].name}の先攻！`, 1600);
    void maybeOpponent();
  });
}

export function elementChart(): HTMLElement {
  const box = h('div', { style: { background: '#fff', color: '#2a2140', borderRadius: '12px', padding: '8px', marginTop: '8px', textAlign: 'center', fontSize: '15px', fontWeight: '800' } });
  box.append(
    h('div', {}, `${EL_ICON.fire}炎 → ${EL_ICON.wind}風 → ${EL_ICON.earth}地 → ${EL_ICON.water}水 → ${EL_ICON.fire}炎`),
    h('div', { style: { margin: '4px 0' } }, `${EL_ICON.light}光 ⇄ ${EL_ICON.dark}闇（おたがいに強い・攻撃した側が+2）`),
    h('div', { style: { fontSize: '13px', color: '#6b6385' } }, `矢印の先の属性に強い。有利なら +2（${EL_NAME.fire}は${EL_NAME.wind}に強い など）`),
  );
  return box;
}
