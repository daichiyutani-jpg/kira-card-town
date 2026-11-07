// 自分の部屋の机：デッキ編集・切り替え・所持カード・図鑑・セーブ
import { CARD_LIST, CARDS, deckProblems, DECK_SIZE, EL_ICON, EL_NAME, MAX_COPIES, MAX_UR_COPIES, RARITY_NAME } from '../engine/cards';
import type { CardDef, Element, Rarity } from '../engine/types';
import { exportCode, importCode } from '../game/save';
import { sfx } from '../audio/sound';
import { choose, confirmBox, game, h, overlay, save, showScreen, titleBar, toast } from './app';
import { miniCard, openCard } from './cardView';
import { openDex } from './dex';
import { pager } from './pager';

export async function openDesk(back: () => void): Promise<void> {
  const c = await choose(
    '自分の机だ。何をする？',
    [
      { label: '🛠 デッキ編集', value: 'edit', cls: 'primary' },
      { label: '🔁 デッキ切り替え', value: 'switch' },
      { label: '🃏 所持カード一覧', value: 'cards' },
      { label: '📖 カード図鑑', value: 'dex' },
      { label: '💾 セーブ・引き継ぎ', value: 'save' },
      { label: 'やめる', value: 'no', cls: 'gray' },
    ],
    '机',
  );
  if (c === 'edit') return openDeckEditor(game.d.activeDeck, back);
  if (c === 'switch') return openDeckSwitch(back);
  if (c === 'cards') return openCollection(null, '所持カード一覧', back);
  if (c === 'dex') return openDex(back);
  if (c === 'save') return saveMenu(back);
}

async function saveMenu(back: () => void) {
  const c = await choose('セーブ', [
    { label: 'いまの状態をセーブする', value: 'save', cls: 'primary' },
    { label: '引き継ぎコードを作る（ほかの端末へ）', value: 'export' },
    { label: '引き継ぎコードを読みこむ', value: 'import' },
    { label: 'やめる', value: 'no', cls: 'gray' },
  ]);
  if (c === 'save') {
    save();
    sfx('ok');
    toast('セーブしました（ふだんも自動でセーブしています）');
  }
  if (c === 'export') await showExport();
  if (c === 'import') await showImport(back);
}

export async function showExport(): Promise<void> {
  save();
  const code = await exportCode(game.d);
  const ta = h('textarea', { readonly: true, style: { width: '100%', height: '120px', fontSize: '12px', borderRadius: '10px', padding: '8px' } }) as HTMLTextAreaElement;
  ta.value = code;
  overlay(
    h(
      'div',
      { class: 'modal col' },
      h('h3', { style: { margin: 0 } }, '引き継ぎコード'),
      h('p', { class: 'muted', style: { margin: 0 } }, 'このコードをコピーして、新しい端末（またはホーム画面のアプリ）のタイトル画面「引き継ぎ」に貼りつけると、今の記録が移ります。コードは他の人に見せないでね。'),
      ta,
      h('button', {
        class: 'btn primary',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(code);
            toast('コピーしました');
          } catch {
            ta.select();
            toast('コードを長押ししてコピーしてください');
          }
        },
      }, 'コピーする'),
    ),
  );
}

export function showImport(back: () => void): Promise<void> {
  return new Promise((resolve) => {
    const ta = h('textarea', { placeholder: 'KIRA1- で始まるコードを貼りつけ', style: { width: '100%', height: '120px', fontSize: '12px', borderRadius: '10px', padding: '8px' } }) as HTMLTextAreaElement;
    let close = () => {};
    close = overlay(
      h(
        'div',
        { class: 'modal col' },
        h('h3', { style: { margin: 0 } }, '引き継ぎコードを読みこむ'),
        h('p', { class: 'muted', style: { margin: 0 } }, '読みこむと、この端末の今の記録は上書きされます。'),
        ta,
        h('button', {
          class: 'btn primary',
          onclick: async () => {
            try {
              const d = await importCode(ta.value);
              if (!(await confirmBox(`「${d.name}」の記録（コイン${d.money}・カード${Object.keys(d.dex).length}種）を読みこみます。今の記録は消えます。よろしいですか？`))) return;
              game.d = d;
              save();
              close();
              toast('読みこみました');
              back();
              resolve();
            } catch (e) {
              toast(`読みこめませんでした：${(e as Error).message}`, 3000);
            }
          },
        }, '読みこむ'),
      ),
      { onClose: () => resolve() },
    );
  });
}

// ---------- 絞り込み ----------
interface Filter {
  q: string;
  el: Element | '';
  r: Rarity | '';
  t: CardDef['type'] | '';
}
function filterBar(f: Filter, onChange: () => void): HTMLElement {
  const sel = (key: keyof Filter, opts: [string, string][]) => {
    const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v }, l))) as HTMLSelectElement;
    s.value = f[key];
    s.addEventListener('change', () => {
      (f as unknown as Record<string, string>)[key] = s.value;
      onChange();
    });
    return s;
  };
  const q = h('input', { placeholder: '🔍 名前', value: f.q }) as HTMLInputElement;
  q.addEventListener('input', () => {
    f.q = q.value;
    onChange();
  });
  return h(
    'div',
    { class: 'filters' },
    q,
    sel('el', [['', '全属性'], ...(Object.keys(EL_NAME) as Element[]).map((e) => [e, `${EL_ICON[e]}${EL_NAME[e]}`] as [string, string])]),
    sel('r', [['', '全レア'], ...(Object.keys(RARITY_NAME) as Rarity[]).map((r) => [r, RARITY_NAME[r]] as [string, string])]),
    sel('t', [['', '全種類'], ['monster', 'モンスター'], ['magic', '魔法'], ['item', 'アイテム']]),
  );
}
export function matches(c: CardDef, f: Filter, hideSecretName = false): boolean {
  if (f.el && c.el !== f.el) return false;
  if (f.r && c.r !== f.r) return false;
  if (f.t && c.type !== f.t) return false;
  if (f.q && (hideSecretName || !c.name.includes(f.q))) return false;
  return true;
}
const sortCards = (a: CardDef, b: CardDef) => ({ monster: 0, magic: 1, item: 2 })[a.type] - ({ monster: 0, magic: 1, item: 2 })[b.type] || a.lv - b.lv || a.id.localeCompare(b.id);

// ---------- 所持カード ----------
export function openCollection(ids: string[] | null, title: string, back: () => void, readonly = false): void {
  const f: Filter = { q: '', el: '', r: '', t: '' };
  const el = h('div', { class: 'screen', style: { background: 'var(--bg)' } });
  const pg = pager({ body: 'grid', uniform: true, shrinkTo: 0.78 });
  const count = h('div', { class: 'deckbar' });
  const render = () => {
    const list = ids ? [...new Set(ids)].map((id) => CARDS[id]) : CARD_LIST.filter((c) => (game.d.cards[c.id] ?? 0) > 0);
    const shown = list.filter((c) => matches(c, f)).sort(sortCards);
    const total = ids ? ids.length : Object.values(game.d.cards).reduce((a, b) => a + b, 0);
    count.textContent = ids ? `${ids.length}枚（${list.length}種類）` : `所持 ${total}枚・${list.length}種類　表示 ${shown.length}種類`;
    pg.set(shown.map((c) => miniCard(c, { count: ids ? ids.filter((x) => x === c.id).length : game.d.cards[c.id], onClick: () => openCard(c, { showSource: !readonly }) })), { empty: 'カードがありません' });
  };
  el.append(titleBar(title, back), filterBar(f, render), count, pg.el);
  render();
  showScreen(el);
}

// ---------- デッキ切り替え ----------
export function openDeckSwitch(back: () => void): void {
  const el = h('div', { class: 'screen', style: { background: 'var(--bg)' } });
  const pg = pager({ body: 'list' });
  const render = () => {
    const list: HTMLElement[] = [];
    game.d.decks.forEach((dk, i) => {
      const probs = deckProblems(dk.cards);
      const active = i === game.d.activeDeck;
      list.push(
        h(
          'div',
          { class: 'item-row' },
          h('div', { class: 'grow' }, h('h4', {}, `${active ? '⭐ ' : ''}${dk.name}`), h('div', { class: 'rates', style: { color: probs.length ? 'var(--bad)' : 'var(--good)' } }, probs.length ? `使えません：${probs[0]}` : `${dk.cards.length}枚・使えます`)),
          h('button', { class: 'btn small gray', onclick: () => openDeckEditor(i, () => openDeckSwitch(back)) }, '編集'),
          h('button', {
            class: 'btn small primary',
            disabled: active || probs.length > 0,
            onclick: () => {
              game.d.activeDeck = i;
              save();
              sfx('ok');
              toast(`「${dk.name}」を使うデッキにしました`);
              render();
            },
          }, active ? '使用中' : '使う'),
        ),
      );
    });
    list.push(
      h('div', { class: 'row' }, h('button', {
        class: 'btn grow',
        onclick: () => {
          game.d.decks.push({ name: `デッキ${game.d.decks.length + 1}`, cards: [] });
          save();
          openDeckEditor(game.d.decks.length - 1, () => openDeckSwitch(back));
        },
      }, '＋ 新しいデッキ'), h('button', {
        class: 'btn grow',
        disabled: !game.d.decks.length,
        onclick: () => {
          const src = game.d.decks[game.d.activeDeck];
          game.d.decks.push({ name: `${src.name}のコピー`, cards: [...src.cards] });
          save();
          render();
        },
      }, '使用中をコピー')),
    );
    pg.set(list, { keepPage: true });
  };
  el.append(titleBar('デッキ切り替え', back), pg.el);
  render();
  showScreen(el);
}

// ---------- デッキ編集 ----------
export function openDeckEditor(index: number, back: () => void): void {
  if (!game.d.decks[index]) {
    game.d.decks.push({ name: 'デッキ1', cards: [] });
    index = game.d.decks.length - 1;
  }
  const dk = game.d.decks[index];
  const f: Filter = { q: '', el: '', r: '', t: '' };
  const el = h('div', { class: 'screen', style: { background: 'var(--bg)' } });
  const bar = h('div', { class: 'deckbar' });
  const strip = pager({ body: 'deck-strip', side: true, uniform: true });
  const pg = pager({ body: 'grid', uniform: true, shrinkTo: 0.78 });
  const inDeck = (id: string) => dk.cards.filter((x) => x === id).length;
  const limit = (c: CardDef) => (c.r === 'UR' ? MAX_UR_COPIES : MAX_COPIES);
  const render = (keepPage = true) => {
    const probs = deckProblems(dk.cards);
    const nm = dk.cards.filter((id) => CARDS[id].type === 'monster').length;
    bar.replaceChildren(
      h('span', { class: `cnt ${probs.length ? 'ng' : 'ok'}` }, `${dk.cards.length}/${DECK_SIZE}`),
      h('span', { class: 'grow', style: { fontSize: '13px' } }, probs.length ? `⚠ ${probs[0]}` : `✅ 使えるデッキ（モンスター${nm}・魔法/アイテム${dk.cards.length - nm}）`),
      h('button', {
        class: 'btn small gray',
        onclick: async () => {
          const name = prompt('デッキの名前', dk.name);
          if (name && name.trim()) {
            dk.name = name.trim().slice(0, 16);
            save();
            render();
          }
        },
      }, '名前'),
    );
    const sorted = [...dk.cards].sort((a, b) => sortCards(CARDS[a], CARDS[b]));
    strip.set(
      sorted.map((id) =>
        miniCard(id, {
          onClick: () => {
            let close = () => {};
            close = openCard(CARDS[id], {
              actions: [
                h('button', {
                  class: 'btn primary wide',
                  onclick: () => {
                    dk.cards.splice(dk.cards.indexOf(id), 1);
                    save();
                    sfx('cancel');
                    close();
                    render();
                  },
                }, 'デッキから外す'),
              ],
            });
          },
        }),
      ),
      { empty: '下の一覧からカードをタップして入れよう', keepPage: true },
    );
    const owned = CARD_LIST.filter((c) => (game.d.cards[c.id] ?? 0) > 0 && matches(c, f)).sort(sortCards);
    const cells = owned.map((c) => {
      const left = (game.d.cards[c.id] ?? 0) - inDeck(c.id);
      const full = inDeck(c.id) >= limit(c);
      return (
        miniCard(c, {
          count: left,
          cls: left <= 0 || full ? 'dim' : '',
          onClick: () => {
            let close = () => {};
            const why = dk.cards.length >= DECK_SIZE ? `デッキはもう${DECK_SIZE}枚です` : left <= 0 ? 'もっている分は全部入っています' : full ? `同じカードは${limit(c)}枚までです` : '';
            close = openCard(c, {
              actions: [
                h('button', {
                  class: 'btn primary wide',
                  disabled: !!why,
                  onclick: () => {
                    dk.cards.push(c.id);
                    save();
                    sfx('card');
                    close();
                    render();
                  },
                }, `デッキに入れる（デッキに${inDeck(c.id)}枚）`),
                why ? h('div', { class: 'reason' }, why) : h('span'),
              ],
            });
          },
        })
      );
    });
    pg.set(cells, { empty: '条件に合うカードがありません', keepPage });
  };
  const extra = h('button', {
    class: 'btn small gray',
    onclick: async () => {
      const c = await choose('このデッキをどうする？', [
        { label: 'このデッキを使う', value: 'use', disabled: deckProblems(dk.cards).length > 0 },
        { label: '全部外す', value: 'clear' },
        { label: 'デッキを削除', value: 'del', disabled: game.d.decks.length <= 1 },
        { label: 'やめる', value: 'no', cls: 'gray' },
      ]);
      if (c === 'use') {
        game.d.activeDeck = index;
        toast('使うデッキにしました');
      }
      if (c === 'clear' && (await confirmBox('デッキのカードを全部外しますか？'))) dk.cards = [];
      if (c === 'del' && (await confirmBox(`「${dk.name}」を削除しますか？（カードはなくなりません）`))) {
        game.d.decks.splice(index, 1);
        if (game.d.activeDeck >= game.d.decks.length) game.d.activeDeck = 0;
        save();
        return back();
      }
      save();
      render();
    },
  }, '…');
  el.append(titleBar(`${dk.name}${index === game.d.activeDeck ? '（使用中）' : ''}`, back, extra), bar, strip.el, filterBar(f, () => render(false)), pg.el);
  render();
  showScreen(el);
}
