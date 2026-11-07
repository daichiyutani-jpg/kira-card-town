"""docs/art/MONSTERS.md（モンスターの絵の対応表）を作り直す。

  python scripts/art-table.py
材料：src/data/cards.json（ID・名前・属性・レア・art.img）、design/leonardo/subjects.json（特徴3つ・英語の題材）、
design/leonardo/picks.json（選んだ候補）、public/art/monsters/（実ファイル）。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding='utf-8')
EL = {'fire': '炎', 'water': '水', 'wind': '風', 'earth': '地', 'light': '光', 'dark': '闇'}


def main():
    cards = [c for c in json.loads((ROOT / 'src/data/cards.json').read_text(encoding='utf-8'))['cards'] if c['type'] == 'monster']
    subj = json.loads((ROOT / 'design/leonardo/subjects.json').read_text(encoding='utf-8'))
    pk = ROOT / 'design/leonardo/picks.json'
    picks = json.loads(pk.read_text(encoding='utf-8')) if pk.exists() else {}
    rows, done = [], 0
    for c in cards:
        img = c['art'].get('img')
        ok = bool(img) and (ROOT / 'public' / img).exists()
        done += ok
        feat = subj.get(c['id'], ['', ''])[0]
        src = picks.get(c['id'], '')
        how = f'Leonardo Lucid Origin（Essential・非公開）候補 {src}' if src else ('Leonardo（無料プラン）' if ok else '')
        rows.append(f"| {c['id']} | {c['name']} | {EL.get(c['el'], c['el'])} | {c['r']} | {feat} | {img if ok else ''} | {how} | {'完成' if ok else '未'} |")
    out = [
        '# モンスターの絵の対応表',
        '',
        '自動生成：`python scripts/art-table.py`（手で直さない）。検査は `python scripts/import-art.py --check`。',
        '完成＝画像がゲームに入っている／未＝まだプログラムの絵（色替え）のまま。',
        f'画像になっているモンスター：**{done} / {len(cards)} 体**',
        '',
        '| ID | 名前 | 属性 | レア | 特徴（3つ） | ファイル（public/ から） | 作り方・候補 | 状態 |',
        '|---|---|---|---|---|---|---|---|',
        *rows,
        '',
    ]
    (ROOT / 'docs/art/MONSTERS.md').write_text('\n'.join(out), encoding='utf-8')
    print(f'{done}/{len(cards)} 体')


if __name__ == '__main__':
    main()
