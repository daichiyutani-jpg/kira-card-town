// WebRTC のデータチャンネルで端末どうしを直接つなぐ。サーバーは使わない。
// つながる道を探すために、Google が無料で公開している STUN サーバーにだけ問い合わせる（ゲームの中身は送らない）。
import { packSdp, unpackSdp } from './protocol';

const ICE: RTCConfiguration = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

export interface Link {
  send(text: string): void;
  onMessage: (text: string) => void;
  onClose: () => void;
  close(): void;
}

function waitIce(pc: RTCPeerConnection, ms = 5000): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, ms); // 全部そろわなくても、集まった分で進める
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

function wrap(pc: RTCPeerConnection, ch: RTCDataChannel): Promise<Link> {
  return new Promise((resolve, reject) => {
    let closed = false;
    const link: Link = {
      send: (t) => {
        if (ch.readyState === 'open') ch.send(t);
      },
      onMessage: () => {},
      onClose: () => {},
      close: () => {
        closed = true;
        try {
          ch.close();
          pc.close();
        } catch {
          /* もう閉じている */
        }
      },
    };
    const lost = () => {
      if (closed) return;
      closed = true;
      link.onClose();
    };
    ch.addEventListener('message', (e) => link.onMessage(String(e.data)));
    ch.addEventListener('close', lost);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') lost();
    });
    const t = setTimeout(() => reject(new Error('時間内につながりませんでした')), 60000);
    if (ch.readyState === 'open') {
      clearTimeout(t);
      resolve(link);
    } else
      ch.addEventListener('open', () => {
        clearTimeout(t);
        resolve(link);
      });
  });
}

/** 部屋を作る側：招待コードを作り、相手の返事コードを待つ */
export async function host(): Promise<{ code: string; accept(reply: string): Promise<Link>; cancel(): void }> {
  const pc = new RTCPeerConnection(ICE);
  const ch = pc.createDataChannel('kira', { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await waitIce(pc);
  const code = await packSdp(pc.localDescription!.sdp);
  return {
    code,
    async accept(reply: string) {
      const sdp = await unpackSdp(reply);
      await pc.setRemoteDescription({ type: 'answer', sdp });
      return wrap(pc, ch);
    },
    cancel: () => pc.close(),
  };
}

/** 招待された側：招待コードから返事コードを作り、つながるのを待つ */
export async function join(invite: string): Promise<{ reply: string; ready: Promise<Link>; cancel(): void }> {
  const pc = new RTCPeerConnection(ICE);
  const chP = new Promise<RTCDataChannel>((r) => pc.addEventListener('datachannel', (e) => r(e.channel)));
  const sdp = await unpackSdp(invite);
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIce(pc);
  const reply = await packSdp(pc.localDescription!.sdp);
  return { reply, ready: chP.then((ch) => wrap(pc, ch)), cancel: () => pc.close() };
}
