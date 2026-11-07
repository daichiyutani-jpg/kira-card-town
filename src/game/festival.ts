// 星まつりの開催判定。端末の現地時刻（タイムゾーン込み）で判定するのでオフラインでも動く。
import shops from '../data/shops.json';

const S = shops.festival.schedule as { days: number[]; start: number; end: number };
export const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export function isFestivalOpen(now: Date): boolean {
  const h = now.getHours();
  return S.days.includes(now.getDay()) && h >= S.start && h < S.end;
}

/** 次に始まる日時（開催中なら今回の終わり） */
export function nextFestival(now: Date): { open: boolean; at: Date } {
  if (isFestivalOpen(now)) {
    const end = new Date(now);
    end.setHours(S.end, 0, 0, 0);
    return { open: true, at: end };
  }
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(S.start, 0, 0, 0);
    if (S.days.includes(d.getDay()) && d.getTime() > now.getTime()) return { open: false, at: d };
  }
  throw new Error('開催日が見つかりません');
}

export function scheduleText(): string {
  const days = [...S.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d]);
  return `毎週 ${days.join('・')}曜日の ${S.start}:00〜${S.end}:00`;
}

export function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日（${DAY_NAMES[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 開発・テスト用に時刻を差し替える（URL に ?now=2026-11-09T18:30 を付けると、その時刻として扱う。本番でも害はない） */
export function clockNow(): Date {
  try {
    const q = new URLSearchParams(location.search).get('now');
    if (q) {
      const d = new Date(q);
      if (!Number.isNaN(d.getTime())) return d;
    }
  } catch {
    /* node */
  }
  return new Date();
}

export function todayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
