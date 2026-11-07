/**
 * ブラウザでの総合テスト（本番ビルドを使用）。
 *  - dist/ をサブディレクトリ（/kira-sub/）で配信し、GitHub Pages と同じ条件にする
 *  - はじめから → 家 → カードショップ → 初期デッキ → チュートリアル（実際にタップして最後まで）
 *  - 机のデッキ編集・パック購入・CPU戦・バイト・お手伝い・図鑑・星まつり（時刻を指定）
 *  - オフライン（サーバー停止＋オフライン化）で起動・つづきから
 *  - 2つのブラウザ画面で、招待URL → 返事コード → オンライン対戦の開始とターンの同期
 *  - オンライン以外では外部への通信が一度も起きないことを確認
 *
 * 実行: npm run build && npm run test:e2e
 * ブラウザはインストール済みの Microsoft Edge（なければ Chrome）。画面写真は test-results/ に保存。
 * ※ 歩行は矢印キー、ボタンは実際のクリック。時間短縮のため一部の画面は ?e2e の入口（window.__kira）から直接開く。
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const DIST = 'dist';
const BASE = '/kira-sub/';
const PORT = 4214;
const ORIGIN = `http://localhost:${PORT}`;
const URL0 = `${ORIGIN}${BASE}?e2e`;
const SHOTS = process.env.E2E_SCREENSHOTS || 'test-results';
mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
if (!existsSync(join(DIST, 'sw.js'))) {
  console.error('dist/sw.js がありません。先に npm run build を実行してください。');
  process.exit(1);
}
let serverOn = true;
const server = createServer((req, res) => {
  if (!serverOn) {
    req.socket.destroy();
    return;
  }
  const url = new URL(req.url, ORIGIN);
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404);
    return res.end('not found');
  }
  const rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
  const file = normalize(join(DIST, rel));
  if (!file.startsWith(normalize(DIST)) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ channel: 'msedge', headless: true }).catch(() => chromium.launch({ channel: 'chrome', headless: true }));
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };
const context = await browser.newContext(ctxOpts);
// 画面なしのブラウザには音の出力先がなく、Web Audio でブラウザが落ちることがあるため、テスト中だけ音を止める
const noAudio = () => {
  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
};
await context.addInitScript(noAudio);
const external = [];
context.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
});
const page = await context.newPage();
const pageErrors = [];
const watch = (p, tag) => {
  p.on('pageerror', (e) => pageErrors.push(`${tag}: ${e}`));
  p.on('console', (m) => m.type() === 'error' && pageErrors.push(`${tag}: ${m.text()}`));
};
watch(page, 'A');

const shot = async (name, p = page) => {
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${SHOTS}/${name}.png` });
};
/** 会話を全部送る（選択肢が出たら止まる） */
async function talkAll(p = page, max = 60) {
  for (let i = 0; i < max; i++) {
    const t = p.locator('.talk');
    if (!(await t.count())) return;
    if (await p.locator('.talk .choices').count()) return;
    await t.first().click({ force: true });
    await p.waitForTimeout(80);
  }
}
async function clickText(text, p = page, sel = 'button') {
  const b = p.locator(`${sel}:not([disabled])`, { hasText: text }).last();
  await b.waitFor({ timeout: 15000 });
  await b.click({ force: true });
  await p.waitForTimeout(150);
}
/** 手札や場のカードを、詳細（またはモード）が開くまでタップする（演出中は反応しないため） */
async function tap(sel, p = page) {
  for (let i = 0; i < 30; i++) {
    const before = await p.evaluate(() => document.querySelector('.mid .info')?.textContent ?? '');
    await p.locator(sel).first().click({ force: true }).catch(() => {});
    await p.waitForTimeout(250);
    const opened = await p.evaluate((b) => !!document.querySelector('.card-actions') || (document.querySelector('.mid .info')?.textContent ?? '') !== b, before);
    if (opened) return;
    await p.waitForTimeout(250);
  }
  throw new Error(`タップできません: ${sel}`);
}
async function hold(key, ms, p = page) {
  await p.keyboard.down(key);
  await p.waitForTimeout(ms);
  await p.keyboard.up(key);
  await p.waitForTimeout(150);
}
const mapPos = (p = page) => p.evaluate(() => window.__kira.game.d.pos);
/** 矢印キーを押しっぱなしにして、x か y が目標に着いたら離す */
async function walk(key, axis, target, p = page) {
  for (let i = 0; i < 20; i++) {
    const pos = await mapPos(p);
    if (pos[axis] === target || pos.map !== 'home') return;
    await p.keyboard.down(key);
    await p.waitForTimeout(40);
    await p.keyboard.up(key);
    await p.waitForTimeout(350);
  }
}
async function waitFor(fn, ms = 20000, p = page) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn).catch(() => false)) return true;
    await p.waitForTimeout(150);
  }
  return false;
}
/** バトル画面で、相手のターンが終わって自分が操作できるまで待つ */
async function myTurn(p = page) {
  return waitFor(() => {
    const b = document.querySelector('#bt-end');
    return b && !b.disabled && !document.querySelector('.combat');
  }, 30000, p);
}
async function tapCombat(p = page) {
  if (await waitFor(() => !!document.querySelector('.combat .tapnext'), 8000, p)) {
    await p.locator('.combat').first().click({ force: true });
    await p.waitForTimeout(300);
  }
}

try {
  // ---------- 起動・オフライン準備 ----------
  await page.goto(URL0);
  await page.waitForSelector('.title');
  check('タイトル画面が表示される', true);
  const swReady = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 60; i++) {
      const st = await new Promise((r) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => r(e.data);
        reg.active.postMessage({ type: 'GET_STATUS' }, [ch.port2]);
        setTimeout(() => r(null), 1000);
      });
      if (st && st.complete) return st;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  });
  check('オフライン用に全ファイルを保存した', swReady?.complete, swReady ? `${swReady.cached}/${swReady.total}` : '');
  await shot('01-title');

  // ---------- はじめから ----------
  await clickText('はじめから');
  await page.locator('.modal input').fill('テスト');
  await clickText('けってい');
  await page.waitForSelector('.field canvas');
  await page.waitForTimeout(500);
  await shot('02-home-intro');
  await talkAll();
  check('家（自分の部屋）からはじまる', (await mapPos()).map === 'home');
  // 家の出口まで歩く（ドアマット 6,9）
  await walk('ArrowDown', 'y', 8);
  await walk('ArrowRight', 'x', 6);
  await walk('ArrowDown', 'y', 9);
  await page.waitForTimeout(600);
  check('歩いて家から街へ出られる', (await mapPos()).map === 'town1', JSON.stringify(await mapPos()));
  await shot('03-town1');

  // ---------- カードショップ → 初期デッキ ----------
  await page.evaluate(() => window.__kira.enterMap('town1', { x: 16, y: 6, dir: 'up' }));
  await page.waitForTimeout(300);
  await hold('ArrowUp', 400);
  await page.waitForTimeout(400);
  await talkAll();
  await page.waitForSelector('text=最初のデッキをえらぼう', { timeout: 10000 });
  await shot('04-choose-starter');
  check('初期デッキが3種類から選べる', (await page.locator('button', { hasText: 'これにする！' }).count()) === 3);
  await page.locator('button', { hasText: 'これにする！' }).nth(1).click({ force: true });
  await clickText('はい');
  await page.waitForTimeout(300);
  await talkAll();
  check('バランスデッキを無料でもらった', await page.evaluate(() => window.__kira.game.d.decks.length === 1 && window.__kira.game.d.decks[0].cards.length === 20));

  // ---------- チュートリアル（実際にタップする） ----------
  await page.waitForSelector('.battle');
  await shot('05-tutorial-start');
  const guideNext = async () => clickText('つぎへ');
  await guideNext();
  await tap('.hand [data-id=f01]');
  await shot('06-tutorial-card');
  await clickText('召喚する');
  await page.waitForTimeout(600);
  await page.locator('#bt-end').click({ force: true });
  await myTurn();
  await tap('.lane.me .slot[data-id=f01]');
  await clickText('攻撃する');
  await page.locator('.lane.opp .slot[data-id=a01]').click({ force: true });
  await page.waitForTimeout(1500);
  await shot('07-tutorial-combat');
  await tapCombat();
  await guideNext();
  await shot('08-tutorial-element');
  await guideNext();
  await tap('.hand [data-id=g01]');
  await clickText('使う');
  await page.waitForTimeout(600);
  await tap('.hand [data-id=i01]');
  await clickText('使う');
  await tap('.lane.me .slot[data-id=f01]');
  await page.waitForTimeout(600);
  await tap('.hand [data-id=f02]');
  await clickText('召喚する');
  await page.waitForTimeout(800);
  await guideNext();
  await page.locator('#bt-end').click({ force: true });
  await myTurn();
  await tap('.hand [data-id=f12]');
  await clickText('召喚する');
  await tap('.lane.me .slot[data-id=f02]');
  await shot('09-tutorial-tribute');
  await clickText('生け贄にして召喚');
  await page.waitForTimeout(1000);
  await tap('.lane.me .slot[data-id=f12]');
  await clickText('攻撃する');
  await page.locator('.lane.opp .slot[data-id=e04]').click({ force: true });
  await page.waitForTimeout(1500);
  await tapCombat();
  await tap('.lane.me .slot[data-id=f01]');
  await clickText('攻撃する');
  await page.waitForTimeout(1500);
  await tapCombat();
  await page.waitForSelector('.talk', { timeout: 10000 });
  await talkAll();
  await page.waitForTimeout(800);
  await talkAll();
  check('チュートリアルを最後まで操作して勝てた', await page.evaluate(() => window.__kira.game.d.flags.tutorial === true && window.__kira.game.d.pos.map === 'town1'));
  await shot('10-after-tutorial');

  // ---------- 机でデッキ編集 ----------
  await page.evaluate(() => window.__kira.enterMap('home', { x: 1, y: 3, dir: 'up' }));
  await page.waitForTimeout(400);
  await page.locator('.abtn').click({ force: true });
  await page.waitForSelector('.talk .choices');
  await clickText('デッキ編集');
  await page.waitForSelector('.deck-strip');
  await shot('11-deck-edit');
  const before = await page.evaluate(() => window.__kira.game.d.decks[0].cards.length);
  await page.locator('.deck-strip .mini').first().click({ force: true });
  await clickText('デッキから外す');
  const after = await page.evaluate(() => window.__kira.game.d.decks[0].cards.length);
  check('デッキからカードを外せる（19枚では使えない表示）', before === 20 && after === 19 && (await page.locator('.deckbar .cnt.ng').count()) === 1);
  await page.locator('.grid .mini:not(.dim)').first().click({ force: true });
  await clickText('デッキに入れる');
  check('デッキにカードを入れて20枚に戻せる', (await page.evaluate(() => window.__kira.game.d.decks[0].cards.length)) === 20);
  await clickText('もどる');

  // ---------- パックを買う ----------
  await page.evaluate(() => { setTimeout(() => window.__kira.openShop('shop1', () => window.__kira.enterMap()), 0); });
  await page.waitForSelector('.item-row');
  await shot('12-shop');
  const money0 = await page.evaluate(() => window.__kira.game.d.money);
  const cards0 = await page.evaluate(() => Object.values(window.__kira.game.d.cards).reduce((a, b) => a + b, 0));
  await page.locator('.item-row button').first().click({ force: true });
  await clickText('はい');
  await page.locator('.pack').click({ force: true });
  await page.waitForTimeout(1500);
  await shot('13-pack-open');
  await clickText('OK');
  await page.waitForTimeout(300);
  const money1 = await page.evaluate(() => window.__kira.game.d.money);
  const cards1 = await page.evaluate(() => Object.values(window.__kira.game.d.cards).reduce((a, b) => a + b, 0));
  check('パックを買うとコインが減り、カードが5枚増える', money0 - money1 === 300 && cards1 - cards0 === 5, `${money0}→${money1}, ${cards0}→${cards1}`);
  await clickText('もどる');

  // ---------- CPU戦（演出短く・ターン終了を押し続ける → 決着） ----------
  await page.evaluate(() => {
    window.__kira.game.d.settings.fastAnim = true;
    window.__kira.fightCpu('h1', { money: 50, back: () => window.__kira.enterMap() });
  });
  await page.waitForSelector('.battle');
  let rounds = 0;
  let lastTurn = '';
  let tries = 0;
  while (rounds++ < 400) {
    if (!(await page.locator('.battle').count())) break;
    if (await page.locator('.combat').count()) {
      await page.locator('.combat').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(200);
      continue;
    }
    const can = await page.evaluate(() => {
      const b = document.querySelector('#bt-end');
      return !!b && !b.disabled;
    });
    if (rounds === 6) await shot('14-cpu-battle');
    if (can) {
      // 1ターンに3回まで、使えるカードを使ってみる（対象が必要なら光っている物を選ぶ）
      const turnNo = await page.evaluate(() => (document.querySelector('.mid .info')?.textContent ?? '').match(/（(\d+)\//)?.[1] ?? '');
      if (turnNo !== lastTurn) {
        lastTurn = turnNo;
        tries = 0;
      }
      const hand = page.locator('.hand .mini.playable');
      if (tries < 3 && (await hand.count())) {
        tries++;
        await hand.first().click({ force: true });
        const b = page.locator('.card-actions button.primary:not([disabled])');
        if (await b.count()) {
          await b.first().click({ force: true });
          await page.waitForTimeout(300);
          const pick = page.locator('.lane .slot.target, .lane.me .slot.can');
          if (await page.locator('.bt-actions button', { hasText: 'やめる' }).count()) {
            if (await pick.count()) await pick.first().click({ force: true });
            const go = page.locator('.bt-actions button.primary:not([disabled])');
            if (await go.count()) await go.first().click({ force: true });
          }
          const cancel = page.locator('.bt-actions button', { hasText: 'やめる' });
          if (await cancel.count()) await cancel.click({ force: true });
        } else await page.locator('.card-actions button', { hasText: 'とじる' }).click({ force: true });
        await page.waitForTimeout(300);
        continue;
      }
      // 攻撃できるモンスターがいたら攻撃
      const atk = page.locator('.lane.me .slot.can');
      if (await atk.count()) {
        await atk.first().click({ force: true });
        const ab = page.locator('.card-actions button:not([disabled])', { hasText: '攻撃する' });
        if (await ab.count()) {
          await ab.first().click({ force: true });
          await page.waitForTimeout(300);
          const tg = page.locator('.lane.opp .slot.target');
          if (await tg.count()) await tg.first().click({ force: true });
          else {
            const direct = page.locator('.bt-actions button', { hasText: '直接攻撃' });
            if (await direct.count()) await direct.click({ force: true });
          }
        } else await page.locator('.card-actions button', { hasText: 'とじる' }).click({ force: true });
        await page.waitForTimeout(400);
        continue;
      }
      await page.locator('#bt-end').click({ force: true });
    }
    await page.waitForTimeout(500);
    if (await page.locator('.talk').count()) break;
  }
  await page.waitForSelector('.talk', { timeout: 60000 });
  await shot('15-cpu-battle-end');
  await talkAll();
  if (await page.locator('text=カードをえらぶ').count()) {
    await page.locator('.grid .mini').first().click({ force: true });
    await clickText('このカードにする');
    await clickText('やったね');
  }
  const st = await page.evaluate(() => window.__kira.game.d.stats);
  check('CPU戦が最後まで進み、記録される', st.battles >= 1, JSON.stringify(st));

  // ---------- バイト（商品仕分け） ----------
  await page.waitForTimeout(500);
  await page.evaluate(() => { setTimeout(() => window.__kira.openSorting(() => window.__kira.enterMap()), 0); });
  await clickText('はじめる');
  await page.waitForTimeout(2300);
  const sortT0 = Date.now();
  while (Date.now() - sortT0 < 31000) {
    const nm = await page.locator('.goods .nm').textContent().catch(() => '');
    const shelf = /トレカ|花札|カードケース|ファイル/.test(nm) ? 'カード' : /くま|ヨーヨー|たこ|サイコロ/.test(nm) ? 'おもちゃ' : /おにぎり|ドーナツ|りんご|クッキー/.test(nm) ? '食べもの' : '文房具';
    const b = page.locator('.shelves button', { hasText: shelf });
    if (!(await b.count())) break;
    await b.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    if (Date.now() - sortT0 > 6000 && (await page.locator('text=おつかれさま').count())) break;
  }
  await page.waitForSelector('text=おつかれさま', { timeout: 10000 });
  await shot('16-job-sorting');
  const job = await page.evaluate(() => window.__kira.game.d.jobs.sorting);
  check('仕分けのバイトで給料がもらえる（上限300）', job && job.best > 0 && job.best <= 300, JSON.stringify(job));
  await clickText('もどる');

  // ---------- 自然探索（画面だけ確認） ----------
  await page.evaluate(() => { setTimeout(() => window.__kira.openNature(() => window.__kira.enterMap()), 0); });
  await clickText('はじめる');
  await page.waitForTimeout(2500);
  await shot('17-job-nature');
  check('自然探索で探す物が森の中にある', (await page.locator('.nature-field button').count()) >= 10);
  await page.evaluate(() => window.__kira.enterMap());

  // ---------- お手伝い ----------
  await page.evaluate(() => { setTimeout(() => window.__kira.openChores(() => window.__kira.enterMap()), 0); });
  await page.waitForSelector('.talk .choices');
  check('お手伝いの確率が表示される', (await page.locator('.talk').textContent()).includes('30%'));
  await clickText('お皿あらい');
  for (let i = 0; i < 27; i++) await page.locator('.plates button').nth(i % 9).click({ force: true });
  await page.waitForTimeout(800);
  await talkAll();
  if (await page.locator('text=やったね').count()) await clickText('やったね');
  check('お手伝いを最後までできる（回数が記録される）', (await page.evaluate(() => window.__kira.game.d.chores.plays)) === 1);

  // ---------- 図鑑 ----------
  await page.evaluate(() => { setTimeout(() => window.__kira.openDex(() => window.__kira.enterMap()), 0); });
  await page.waitForSelector('.grid .mini');
  await shot('18-dex');
  check('図鑑に200種類が並び、未入手はシルエット', (await page.locator('.grid .mini').count()) === 200 && (await page.locator('.grid .mini.locked').count()) > 100);
  await clickText('もどる');

  // ---------- 星まつり（時刻を指定して確認） ----------
  const fest = await context.newPage();
  watch(fest, 'F');
  await fest.goto(`${URL0}&now=2026-11-06T18:30:00`);
  await fest.waitForSelector('.title');
  await fest.evaluate(() => {
    window.__kira.game.d.money = 5000;
    window.__kira.enterMap('festival', { x: 10, y: 15, dir: 'up' });
  });
  await fest.waitForTimeout(700);
  check('金曜18:30は星まつりに入れる', (await fest.evaluate(() => window.__kira.game.d.pos.map)) === 'festival');
  await shot('19-festival', fest);
  await fest.evaluate(() => { setTimeout(() => window.__kira.openGacha(() => window.__kira.enterMap()), 0); });
  await fest.waitForSelector('text=確率');
  check('ガチャに確率が表示される', (await fest.locator('.rates').first().textContent()).includes('%'));
  await clickText('1回ひく', fest);
  await clickText('はい', fest);
  // 「演出を短く」が入っていると結果がすぐ出る（ハンドルは出ない）
  await fest.waitForTimeout(300);
  if (await fest.locator('.gm-handle').count()) await fest.locator('.gm-handle').click({ force: true });
  await fest.waitForSelector('text=OK', { timeout: 15000 });
  await fest.waitForTimeout(1200);
  await shot('20-gacha', fest);
  await clickText('OK', fest);
  check('ガチャを1回ひける', (await fest.evaluate(() => window.__kira.game.d.stats.gacha)) === 1);
  await fest.close();
  const closed = await context.newPage();
  await closed.goto(`${URL0}&now=2026-11-07T18:30:00`);
  await closed.waitForSelector('.title');
  await closed.evaluate(() => window.__kira.enterMap('festival', { x: 10, y: 15 }));
  await closed.waitForTimeout(500);
  check('土曜は星まつりに入れない（街へ戻る）', (await closed.evaluate(() => window.__kira.game.d.pos.map)) === 'town1');
  await closed.close();

  check('ひとり用では外部への通信が0件', external.length === 0, external.slice(0, 3).join(' '));

  // ---------- オフライン ----------
  serverOn = false;
  await context.setOffline(true);
  await page.goto(URL0).catch(() => {});
  await page.reload().catch(() => {});
  await page.waitForSelector('.title', { timeout: 15000 });
  check('オフラインでも起動できる', true);
  await clickText('つづきから');
  await page.waitForSelector('.field canvas');
  check('オフラインでもつづきから遊べる', (await page.evaluate(() => window.__kira.game.d.name)) === 'テスト');
  await shot('21-offline-continue');
  await context.setOffline(false);
  serverOn = true;

  // ---------- オンライン対戦（2つの画面） ----------
  const ctxB = await browser.newContext(ctxOpts);
  await ctxB.addInitScript(noAudio);
  const pa = await context.newPage();
  const pb = await ctxB.newPage();
  watch(pa, 'host');
  watch(pb, 'guest');
  await pa.goto(URL0);
  await pa.waitForSelector('.title');
  // 招待される側：先にゲームを始めてデッキを持っておく
  await pb.goto(URL0);
  await pb.waitForSelector('.title');
  await pb.evaluate(() => {
    const d = window.__kira.game.d;
    d.name = 'ゲスト';
    d.flags.starter = true;
    d.decks = [{ name: 'テスト', cards: ['f01', 'f01', 'f02', 'f02', 'f03', 'f03', 'f04', 'f04', 'f05', 'f05', 'a01', 'a01', 'a02', 'a02', 'g01', 'g01', 'g02', 'i01', 'i01', 'i02'] }];
    d.activeDeck = 0;
    localStorage.setItem('x', '1');
  });
  await pb.evaluate(() => window.__kira.enterMap('town1', { x: 10, y: 10 }));
  await clickText('友達と対戦', pa);
  await clickText('部屋をつくって招待する', pa);
  await pa.waitForSelector('text=招待URLを友達に送る', { timeout: 20000 });
  const invite = await pa.evaluate(() => [...document.querySelectorAll('.panel div')].map((d) => d.textContent).find((t) => t.includes('#join=')));
  check('招待URLが作られる', !!invite && invite.includes(BASE), invite?.slice(0, 60));
  await shot('22-online-host', pa);
  await pb.goto(invite.replace(`${BASE}#`, `${BASE}?e2e#`));
  await pb.waitForSelector('text=返事コードを', { timeout: 20000 });
  const reply = await pb.evaluate(() => [...document.querySelectorAll('.panel div')].map((d) => d.textContent).find((t) => t.startsWith('KIRAR1-')));
  check('招待URLを開くと返事コードが作られる', !!reply);
  await shot('23-online-guest', pb);
  await pa.locator('textarea').fill(`返事だよ\n${reply}`);
  await clickText('つなぐ', pa);
  const both = (await pa.waitForSelector('.battle', { timeout: 30000 }).then(() => true).catch(() => false)) && (await pb.waitForSelector('.battle', { timeout: 30000 }).then(() => true).catch(() => false));
  check('2台がつながり、同じ対戦が始まる', both);
  if (both) {
    await pa.waitForTimeout(2000);
    const lpA = await pa.locator('.battle').textContent();
    const lpB = await pb.locator('.battle').textContent();
    const hostFirst = await pa.evaluate(() => !document.querySelector('#bt-end')?.disabled);
    const [first, second] = hostFirst ? [pa, pb] : [pb, pa];
    await first.locator('#bt-end').click({ force: true });
    const synced = await waitFor(() => !document.querySelector('#bt-end')?.disabled, 15000, second);
    check('ターン終了が相手の画面に届く（交代する）', synced);
    await shot('24-online-battle-a', pa);
    await shot('25-online-battle-b', pb);
    // こうさん → 相手側は勝ち
    await second.locator('button', { hasText: 'こうさん' }).click({ force: true });
    await clickText('はい', second);
    const won = await waitFor(() => !!document.querySelector('.talk') && document.querySelector('.talk').textContent.includes('勝った'), 15000, first);
    check('こうさんすると相手の画面で勝ちになる', won);
    void lpA;
    void lpB;
  }
  await ctxB.close();
} catch (e) {
  check('テストが途中で止まらない', false, String(e).slice(0, 300));
  await shot('zz-error').catch(() => {});
} finally {
  check('ページでエラーが起きない', pageErrors.length === 0, pageErrors.slice(0, 3).join(' / '));
  await browser.close();
  server.close();
  const ng = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ng.length}/${results.length} 件 OK`);
  process.exit(ng.length ? 1 : 0);
}
