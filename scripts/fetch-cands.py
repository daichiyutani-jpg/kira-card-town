"""Leonardo で作った候補画像を保存する。

  python scripts/fetch-cands.py design/leonardo/results.json
results.json は {"<カードID>": ["<画像URL>", ...]}。
design/leonardo/candidates/<ID>_a.jpg, _b.jpg ... に保存する（すでにある番号は飛ばして後ろに足す）。
"""
import json
import re
import string
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / 'design' / 'leonardo' / 'candidates'
sys.stdout.reconfigure(encoding='utf-8')
PREFIX = 'https://cdn.leonardo.ai/users/942bec89-7c2f-4b70-a4e5-1d117e0d809d/generations/'


SUBJ = ROOT / 'design' / 'leonardo' / 'subjects.json'
SUBJ_GI = ROOT / 'design' / 'leonardo' / 'subjects-gi.json'


def expand(cid, tok):
    # 「生成ID/ファイル名」ならそのまま。生成IDだけ（末尾 :0 / :1）なら、subjects.json の文からファイル名を作る
    # （Leonardo のファイル名＝ lucid-origin_ ＋プロンプトの英数字以外を _ にした先頭80字）
    if '/' in tok:
        return PREFIX + tok
    gen, idx = tok.split(':')
    mons = json.loads(SUBJ.read_text(encoding='utf-8'))
    if cid in mons:
        head = 'Original creature design: ' + mons[cid][1]
    else:  # 魔法・アイテム（subjects-gi.json）
        subj = json.loads(SUBJ_GI.read_text(encoding='utf-8'))[cid][1]
        head = ('Magical item illustration: ' if cid.startswith('i') or cid == 'mom5' else 'Magic spell effect illustration: ') + subj
    name = 'lucid-origin_' + re.sub(r'[^A-Za-z0-9-]+', '_', head)[:80]
    return f'{PREFIX}{gen}/{name}-{idx}.jpg'


def main():
    src = Path(sys.argv[1])
    if src.suffix == '.txt':
        # 短い形式：1行に「ID 生成ID/ファイル名 生成ID/ファイル名 ...」
        res = {}
        for line in src.read_text(encoding='utf-8').splitlines():
            parts = line.split()
            if parts:
                res.setdefault(parts[0], []).extend(expand(parts[0], x) for x in parts[1:])
    else:
        res = json.loads(src.read_text(encoding='utf-8'))
    CAND.mkdir(parents=True, exist_ok=True)
    seen = {p.name for p in CAND.glob('*.src')}
    n = 0
    for cid, urls in res.items():
        for url in urls:
            tag = (cid + '_' + url.rsplit('/', 2)[-2] + '_' + url.rsplit('-', 1)[-1]).replace('.jpg', '') + '.src'
            if tag in seen:
                continue
            used = {p.stem.split('_')[-1] for p in CAND.glob(f'{cid}_*.jpg')}
            letter = next(ch for ch in string.ascii_lowercase if ch not in used)
            dst = CAND / f'{cid}_{letter}.jpg'
            # urllib は 403 になるので curl を使う
            subprocess.run(['curl', '-sSf', '-o', str(dst), url], check=True)
            (CAND / tag).write_text(url, encoding='utf-8')
            seen.add(tag)
            n += 1
    print(f'保存 {n} 枚')


if __name__ == '__main__':
    main()
