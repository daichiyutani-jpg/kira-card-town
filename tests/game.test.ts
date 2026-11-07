import { describe, expect, it } from 'vitest';
import { CARD_LIST, CARDS, deckProblems } from '../src/engine/cards';
import { addCard, checkPrizes, choreRoll, drawOne, GACHA, KUJI, MOM_CARDS, OPPONENTS, PACKS, poolOf, sourcesOf, STARTERS, giveStarter } from '../src/game/collection';
import { isFestivalOpen, nextFestival } from '../src/game/festival';
import { BACKUP_KEY, deserialize, loadSave, migrate, newSave, SAVE_KEY, serialize, writeSave, exportCode, importCode } from '../src/game/save';
import { afterFinal, afterSemi, CUPS, cpuVsCpu, lcg, startCup } from '../src/game/tournament';
import maps from '../src/data/maps.json';
import story from '../src/data/story.json';

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('対戦相手と初期デッキ', () => {
  it('対戦相手のデッキはすべて使えるデッキ', () => {
    for (const o of Object.values(OPPONENTS)) expect(deckProblems(o.deck), o.id).toEqual([]);
  });
  it('初期デッキ3種は使えるデッキで、無料で手に入る', () => {
    for (const s of Object.values(STARTERS)) expect(deckProblems(s.deck)).toEqual([]);
    const d = newSave();
    giveStarter(d, 'power');
    expect(d.money).toBe(500);
    expect(d.decks[0].cards.length).toBe(20);
  });
  it('3つの大会にそれぞれ10人、合計30人の別々のCPU', () => {
    const all = Object.values(CUPS).flatMap((c) => c.entrants);
    expect(Object.keys(CUPS).length).toBe(3);
    for (const c of Object.values(CUPS)) expect(c.entrants.length).toBe(10);
    expect(new Set(all).size).toBe(30);
    for (const id of all) expect(OPPONENTS[id]).toBeDefined();
  });
});

describe('トーナメント', () => {
  it('参加費を払い、準決勝→決勝→優勝で賞金が入る', () => {
    const d = newSave();
    d.money = 1000;
    const run = startCup(d, 'cup1', lcg(1))!;
    expect(d.money).toBe(800);
    expect(new Set(run.players).size).toBe(3);
    afterSemi(run, true, 5);
    expect(run.stage).toBe('final');
    expect(run.players.slice(1)).toContain(run.finalOpp);
    afterFinal(d, run, true);
    expect(run.stage).toBe('won');
    expect(d.money).toBe(800 + CUPS.cup1.prize);
    expect(d.cupWins.cup1).toBe(1);
  });
  it('準決勝で負けると終了。参加費は戻らない', () => {
    const d = newSave();
    const run = startCup(d, 'cup1', lcg(2))!;
    afterSemi(run, false, 1);
    expect(run.stage).toBe('lost');
    expect(d.money).toBe(300);
  });
  it('お金が足りないと参加できない・何度でも参加できる', () => {
    const d = newSave();
    d.money = 100;
    expect(startCup(d, 'cup1', lcg(3))).toBeNull();
    d.money = 10000;
    for (let i = 0; i < 3; i++) expect(startCup(d, 'cup1', lcg(i))).not.toBeNull();
    expect(d.cupPlays.cup1).toBe(3);
  });
  it('CPUどうしの試合が決着する', () => {
    const w = cpuVsCpu('n1', 'n5', 9);
    expect(['n1', 'n5']).toContain(w);
  });
});

describe('抽選（表示した確率と一致）', () => {
  const tables = { ...PACKS, kuji: KUJI, gacha: GACHA };
  it('表示しているレアリティには必ずカードがある', () => {
    for (const [k, t] of Object.entries(tables)) {
      const pool = poolOf(t);
      for (const r of Object.keys(t.rates)) expect(pool[r as 'N'].length, `${k}:${r}`).toBeGreaterThan(0);
    }
  });
  it('10万回引いた割合が表示の確率に近い（±1%）', () => {
    for (const t of [KUJI, GACHA, PACKS.pack3]) {
      const rand = lcg(77);
      const count: Record<string, number> = {};
      const N = 100000;
      for (let i = 0; i < N; i++) {
        const c = drawOne(t, rand);
        count[c.r] = (count[c.r] ?? 0) + 1;
        expect(c.get.some((g) => t.tags.includes(g))).toBe(true);
      }
      const total = Object.values(t.rates).reduce((a, b) => a + (b ?? 0), 0);
      for (const [r, w] of Object.entries(t.rates)) expect(Math.abs((count[r] ?? 0) / N - (w ?? 0) / total)).toBeLessThan(0.01);
    }
  });
  it('期間限定カードはお祭りのくじ・ガチャにしか入っていない', () => {
    const fest = CARD_LIST.filter((c) => c.get.includes('fest'));
    expect(fest.length).toBeGreaterThan(0);
    for (const p of Object.values(PACKS)) for (const c of fest) expect(c.get.some((g) => p.tags.includes(g))).toBe(false);
  });
});

describe('お手伝い', () => {
  it('5回つづけてはずれたら次は必ず当たり、限定5種のどれか', () => {
    const d = newSave();
    const never = () => 0.99;
    for (let i = 0; i < 5; i++) expect(choreRoll(d, never)).toBeNull();
    const got = choreRoll(d, never);
    expect(MOM_CARDS).toContain(got);
    expect(d.chores.misses).toBe(0);
  });
  it('お手伝い限定カードはパック・くじ・ガチャ・CPUから出ない', () => {
    for (const id of MOM_CARDS) {
      for (const t of [...Object.values(PACKS), KUJI, GACHA]) expect(CARDS[id].get.some((g) => t.tags.includes(g))).toBe(false);
      for (const o of Object.values(OPPONENTS)) expect(o.deck).not.toContain(id);
    }
  });
});

describe('カードの入手', () => {
  it('CPUに勝ってカードを選んでも、CPUのデッキは変わらない', () => {
    const d = newSave();
    const before = [...OPPONENTS.h1.deck];
    addCard(d, OPPONENTS.h1.deck[0]);
    expect(OPPONENTS.h1.deck).toEqual(before);
    expect(d.cards[before[0]]).toBe(1);
  });
  it('すべてのカードに入手方法がある', () => {
    for (const c of CARD_LIST) expect(sourcesOf(c.id).length, c.id).toBeGreaterThan(0);
  });
  it('特別な条件のカード：大会3回優勝で手に入る', () => {
    const d = newSave();
    d.cupWins.cup1 = 3;
    expect(checkPrizes(d)).toContain('pr2');
    expect(checkPrizes(d)).toEqual([]);
  });
});

describe('お祭りの出現', () => {
  it('月・水・金・日の18:00〜19:59だけ', () => {
    expect(isFestivalOpen(new Date(2026, 10, 9, 18, 0))).toBe(true); // 11/9 月
    expect(isFestivalOpen(new Date(2026, 10, 9, 19, 59))).toBe(true);
    expect(isFestivalOpen(new Date(2026, 10, 9, 20, 0))).toBe(false);
    expect(isFestivalOpen(new Date(2026, 10, 9, 17, 59))).toBe(false);
    expect(isFestivalOpen(new Date(2026, 10, 10, 18, 30))).toBe(false); // 火
    expect(isFestivalOpen(new Date(2026, 10, 11, 18, 30))).toBe(true); // 水
    expect(isFestivalOpen(new Date(2026, 10, 13, 18, 30))).toBe(true); // 金
    expect(isFestivalOpen(new Date(2026, 10, 14, 18, 30))).toBe(false); // 土
    expect(isFestivalOpen(new Date(2026, 10, 15, 18, 30))).toBe(true); // 日
  });
  it('次の開催日時', () => {
    const n = nextFestival(new Date(2026, 10, 10, 12, 0)); // 火 → 水18時
    expect(n.open).toBe(false);
    expect(n.at.getDate()).toBe(11);
    expect(n.at.getHours()).toBe(18);
  });
});

describe('セーブ', () => {
  it('保存して読み込める', () => {
    const st = new MemStore();
    const d = newSave('テスト');
    d.money = 1234;
    addCard(d, 'f01', 2);
    writeSave(st, d);
    const r = loadSave(st);
    expect(r.data!.money).toBe(1234);
    expect(r.data!.cards.f01).toBe(2);
  });
  it('壊れていたら予備から復元する', () => {
    const st = new MemStore();
    const d = newSave();
    d.money = 1;
    writeSave(st, d);
    d.money = 2;
    writeSave(st, d);
    st.setItem(SAVE_KEY, st.getItem(SAVE_KEY)!.replace('"money\\":2', '"money\\":999'));
    const r = loadSave(st);
    expect(r.data!.money).toBe(1);
    expect(r.note).toMatch(/復元/);
    expect(st.getItem(BACKUP_KEY)).not.toBeNull();
  });
  it('両方壊れていたら新規扱いで、理由を出す', () => {
    const st = new MemStore();
    st.setItem(SAVE_KEY, 'こわれた');
    const r = loadSave(st);
    expect(r.data).toBeNull();
    expect(r.note).toMatch(/壊れて/);
  });
  it('古い版・知らないカードがあっても補って読める', () => {
    const d = migrate({ v: 1, name: 'A', money: 5, cards: { f01: 1, zzz: 3 }, decks: [{ name: 'x', cards: ['f01', 'zzz'] }] });
    expect(d.cards).toEqual({ f01: 1 });
    expect(d.decks[0].cards).toEqual(['f01']);
    expect(d.settings.bgmOn).toBe(true);
  });
  it('引き継ぎコードで書き出し・読み込み', async () => {
    const d = newSave('引継');
    addCard(d, 'l21');
    const code = await exportCode(d);
    expect(code.startsWith('KIRA1-')).toBe(true);
    const back = await importCode(code);
    expect(back.name).toBe('引継');
    expect(back.cards.l21).toBe(1);
    expect(deserialize(serialize(back)).name).toBe('引継');
  });
});

describe('マップと会話のデータ', () => {
  const M = (maps as { maps: Record<string, { w: number; h: number; npcs: { talk?: string; opp?: string }[]; objects: { act: Record<string, unknown> }[]; buildings: { act: Record<string, unknown> }[] }> }).maps;
  it('会話・対戦相手・移動先がすべて存在する', () => {
    const talk = (story as { talk: Record<string, unknown> }).talk;
    for (const [mid, m] of Object.entries(M)) {
      for (const n of m.npcs) {
        if (n.talk) expect(talk[n.talk], `${mid}:${n.talk}`).toBeDefined();
        if (n.opp) expect(OPPONENTS[n.opp], n.opp).toBeDefined();
      }
      for (const o of [...m.objects, ...m.buildings]) {
        if (o.act.talk) expect(talk[o.act.talk as string], `${mid}:${o.act.talk}`).toBeDefined();
        if (o.act.warp) expect(M[o.act.warp as string]).toBeDefined();
      }
    }
  });
});

describe('主人公の見た目', () => {
  it('はじめから選んだ男女が保存され、古いデータは男の子になる', () => {
    expect(newSave('A', 'girl').hero).toBe('girl');
    expect(newSave('A').hero).toBe('boy');
    expect(migrate({ v: 1, name: 'A' }).hero).toBe('boy');
    expect(migrate({ v: 1, name: 'A', hero: 'girl' }).hero).toBe('girl');
    expect(migrate({ v: 1, name: 'A', hero: 'x' }).hero).toBe('boy');
    expect(deserialize(serialize(newSave('B', 'girl'))).hero).toBe('girl');
  });
});

describe('町の人の見た目', () => {
  it('地図の人と対戦相手の全員に髪型・服の形が決まっている', async () => {
    const { PEOPLE, personSpec } = await import('../src/ui/people');
    const maps = (await import('../src/data/maps.json')).default as unknown as Record<string, { npcs?: { id: string; opp?: string; look?: object }[] }>;
    const opps = (await import('../src/data/opponents.json')).default as unknown as { id: string; look: { hair: string; shirt: string; skin: string; pants: string } }[];
    const M = (maps as unknown as { maps?: typeof maps }).maps ?? maps;
    const ids = [...Object.values(M).flatMap((m) => (m.npcs ?? []).filter((n) => n.look).map((n) => n.id)), ...(Array.isArray(opps) ? opps : ((opps as unknown as { opponents?: typeof opps }).opponents ?? (Object.values(opps) as { id: string }[]))).map((o: { id: string }) => o.id)];
    expect(ids.length).toBeGreaterThan(50);
    for (const id of ids) expect(PEOPLE[id], id).toBeDefined();
    const sp = personSpec('obaachan', { hair: '#ddd', shirt: '#a0522d', skin: '#efc9a0', pants: '#6b4a2a' });
    expect(sp.age).toBe('elder');
    expect(sp.hair).toBe('#ddd');
  });
});

describe('建物の中', () => {
  type M = { w: number; h: number; fill: string; border: string; rects: { x: number; y: number; w: number; h: number; t: string }[]; points: { x: number; y: number; t: string }[]; buildings: { id: string; x: number; y: number; w: number; h: number; kind: string; door: { x: number; y: number }; act: Record<string, unknown> }[]; objects: { id: string; x: number; y: number; w?: number; h?: number; walk?: boolean; act: Record<string, unknown> }[]; npcs: { x: number; y: number }[]; spawn: { x: number; y: number } };
  const MAPS = (maps as unknown as { maps: Record<string, M> }).maps;
  const tile = (m: M, x: number, y: number) => {
    let t = x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1 ? m.border : m.fill;
    for (const r of m.rects) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) t = r.t;
    for (const p of m.points) if (p.x === x && p.y === y) t = p.t;
    return t;
  };
  const free = (m: M, x: number, y: number) => {
    const o = m.objects.find((o) => x >= o.x && x < o.x + (o.w ?? 1) && y >= o.y && y < o.y + (o.h ?? 1));
    if (o?.walk) return true;
    if ('TW~fx'.includes(tile(m, x, y))) return false;
    if (o || m.buildings.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)) return false;
    return !m.npcs.some((n) => n.x === x && n.y === y);
  };
  const towns = ['town1', 'town2', 'town3'];
  it('町の建物（屋台・社のほか）はすべて中に入れて、出口から扉の前へ戻れる', () => {
    for (const t of towns)
      for (const b of MAPS[t].buildings) {
        const w = b.act.warp as string;
        expect(w, b.id).toBeTruthy();
        const inside = MAPS[w];
        expect(inside, b.id).toBeDefined();
        expect(free(inside, b.act.tx as number, b.act.ty as number), `${b.id} 入った所`).toBe(true);
        const exit = inside.objects.find((o) => o.walk && o.act.warp === t);
        expect(exit, `${w} 出口`).toBeDefined();
        expect([exit!.act.tx, exit!.act.ty], `${w} 出口の先`).toEqual([b.door.x, b.door.y + 1]);
        expect(free(MAPS[t], b.door.x, b.door.y + 1), `${b.id} 扉の前`).toBe(true);
      }
  });
  it('どの建物の扉の前にも、町の入り口から歩いて行ける・室内では入った所から受付や人の前まで歩ける', () => {
    const reach = (m: M, sx: number, sy: number) => {
      const seen = new Set([`${sx},${sy}`]);
      const q = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${y + dy}`;
          if (!seen.has(k) && x + dx > 0 && y + dy > 0 && x + dx < m.w && y + dy < m.h && free(m, x + dx, y + dy)) {
            seen.add(k);
            q.push([x + dx, y + dy]);
          }
        }
      }
      return seen;
    };
    for (const t of towns) {
      const r = reach(MAPS[t], MAPS[t].spawn.x, MAPS[t].spawn.y);
      for (const b of MAPS[t].buildings) expect(r.has(`${b.door.x},${b.door.y + 1}`), `${t}/${b.id}`).toBe(true);
    }
    for (const [id, m] of Object.entries(MAPS)) {
      if (!id.startsWith('in_')) continue;
      const r = reach(m, m.spawn.x, m.spawn.y);
      for (const o of m.objects.filter((o) => !o.walk && (o.act.shop || o.act.cup || o.act.job || o.id === 'counter')))
        expect([...Array(o.w ?? 1).keys()].some((i) => r.has(`${o.x + i},${o.y + (o.h ?? 1)}`)), `${id}/${o.id}`).toBe(true);
    }
  });
  it('ショップ・大会・アルバイトの受付は、建物の中に1つずつある', () => {
    const acts = Object.values(MAPS).flatMap((m) => m.objects.map((o) => o.act)).concat(Object.values(MAPS).flatMap((m) => m.buildings.map((b) => b.act)));
    for (const [k, v] of [['shop', 'shop1'], ['shop', 'shop2'], ['shop', 'shop3'], ['cup', 'cup1'], ['cup', 'cup2'], ['cup', 'cup3'], ['job', 'delivery'], ['job', 'sorting'], ['job', 'nature']])
      expect(acts.filter((a) => a[k] === v).length, `${k}:${v}`).toBe(1);
  });
  it('室内の会話がすべて story.json にある', () => {
    const talk = (story as unknown as { talk: Record<string, unknown> }).talk;
    for (const [id, m] of Object.entries(MAPS)) {
      if (!id.startsWith('in_')) continue;
      for (const o of m.objects) if (o.act.talk) expect(talk[o.act.talk as string], `${id}/${o.id}`).toBeDefined();
      for (const n of m.npcs as { talk?: string; id?: string }[]) if (n.talk) expect(talk[n.talk], `${id}/${n.id}`).toBeDefined();
    }
  });
});
