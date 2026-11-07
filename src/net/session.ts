// つながった後の流れ：あいさつ（版・名前・デッキ）→ シードを一緒に決める → 対戦中の行動のやりとり
import { stateHash, type BattleSetup } from '../engine/battle';
import type { Action, BattleState } from '../engine/types';
import type { Remote } from '../ui/battleView';
import { checkReveal, combineSeed, helloProblem, makeCommit, NET_VERSION, parseMsg, randomU32, type NetMsg } from './protocol';
import type { Link } from './rtc';

export interface Match {
  setup: BattleSetup;
  me: 0 | 1;
  oppName: string;
  remote: Remote;
}

const HEARTBEAT_MS = 4000;
const TIMEOUT_MS = 25000;

export function startSession(link: Link, isHost: boolean, mine: { name: string; deck: string[]; app: string }): Promise<Match> {
  return new Promise((resolve, reject) => {
    const myR = randomU32();
    let peerHello: Extract<NetMsg, { t: 'hello' }> | null = null;
    let peerCommit: string | null = null;
    let revealed = false;
    let myCommitSent = false;
    let started = false;
    let lastHeard = Date.now();
    const queue: Action[] = [];
    let waiter: ((v: Action | { t: 'quit' } | { t: 'lost' }) => void) | null = null;
    let endState: { t: 'quit' } | { t: 'lost' } | null = null;
    let st: BattleState | null = null;
    let endCb: ((w: 0 | 1 | 'lost') => void) | null = null;
    let sent = 0;
    let got = 0;
    let expectHash: string | null = null;
    const me: 0 | 1 = isHost ? 0 : 1;

    const send = (m: NetMsg) => link.send(JSON.stringify(m));
    const stop = () => {
      clearInterval(beat);
      link.close();
    };
    const end = (kind: 'quit' | 'lost', why: string) => {
      if (endState) return;
      const es = { t: kind } as { t: 'quit' } | { t: 'lost' };
      endState = es;
      stop();
      console.warn('online end:', why);
      if (!started) return reject(new Error(why));
      if (waiter) {
        const w = waiter;
        waiter = null;
        w(es);
      } else endCb?.(kind === 'quit' ? me : 'lost');
    };
    /** 前に受け取った行動のあと、自分の状態が相手と同じか */
    const verify = () => {
      if (expectHash && st && stateHash(st) !== expectHash) {
        end('lost', '二人の対戦の状態がずれました');
        return false;
      }
      expectHash = null;
      return true;
    };

    const beat = setInterval(() => {
      if (Date.now() - lastHeard > TIMEOUT_MS) end('lost', '相手からの通信が途切れました');
      else send({ t: 'ping' });
    }, HEARTBEAT_MS);

    const tryStart = async () => {
      if (!peerHello || !peerCommit || !myCommitSent) return;
      if (!revealed) {
        revealed = true;
        send({ t: 'reveal', r: myR });
      }
    };
    const onReveal = async (r: number) => {
      if (!peerHello || !peerCommit) return end('lost', '手順がおかしい通信です');
      if (!(await checkReveal(peerCommit, r))) return end('lost', 'シードの確認に失敗しました（不正の可能性）');
      const seed = combineSeed(myR, r);
      const hostSide = isHost ? mine : peerHello;
      const guestSide = isHost ? peerHello : mine;
      started = true;
      const remote: Remote = {
        bind(s, cb) {
          st = s;
          endCb = cb;
        },
        send(a) {
          if (endState) return;
          verify();
          sent++;
          send({ t: 'act', n: sent, a, h: st ? stateHash(st) : '' });
        },
        next() {
          if (endState) return Promise.resolve(endState);
          if (!verify()) return Promise.resolve({ t: 'lost' as const });
          const a = queue.shift();
          if (a) return Promise.resolve(a);
          return new Promise((r) => (waiter = r));
        },
        quit() {
          send({ t: 'quit' });
          endState = { t: 'quit' };
          setTimeout(stop, 300);
        },
      };
      resolve({ setup: { seed, decks: [hostSide.deck, guestSide.deck], names: [hostSide.name, guestSide.name] }, me, oppName: peerHello.name, remote });
    };

    link.onClose = () => end('lost', '接続が切れました');
    link.onMessage = (raw) => {
      lastHeard = Date.now();
      const m = parseMsg(raw);
      if (!m) return end('lost', '読めない通信が届きました');
      switch (m.t) {
        case 'ping':
          return;
        case 'hello': {
          const p = helloProblem(m);
          if (p) return end('lost', p);
          peerHello = m;
          return void tryStart();
        }
        case 'commit':
          peerCommit = m.h;
          return void tryStart();
        case 'reveal':
          return void onReveal(m.r);
        case 'quit':
          return end('quit', '相手がこうさんしました');
        case 'act': {
          if (!started) return end('lost', '手順がおかしい通信です');
          got++;
          if (m.n !== got) return end('lost', '通信の順番がずれました');
          const a = m.a as Action;
          if (waiter) {
            const w = waiter;
            waiter = null;
            // 受け取った行動を適用したあとのハッシュを、次に確かめる
            expectHash = m.h;
            w(a);
          } else {
            queue.push(a);
            pendingHashes.push(m.h);
          }
          return;
        }
      }
    };
    // 順番待ちの行動に対応するハッシュ
    const pendingHashes: string[] = [];
    const origShift = queue.shift.bind(queue);
    queue.shift = () => {
      const a = origShift();
      if (a) expectHash = pendingHashes.shift() ?? null;
      return a;
    };

    void (async () => {
      send({ t: 'hello', v: NET_VERSION, app: mine.app, name: mine.name, deck: mine.deck });
      send({ t: 'commit', h: await makeCommit(myR) });
      myCommitSent = true;
      void tryStart();
    })();
  });
}
