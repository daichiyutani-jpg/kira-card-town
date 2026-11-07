"""カードイラストの取り込みと検査。

使い方（kira-card-town フォルダで）:
  python scripts/import-art.py          # design/leonardo/inbox/ の画像を取り込み、そのあと検査
  python scripts/import-art.py --check  # 取り込まずに検査だけ

取り込み:
  - ファイル名の先頭がカードID（例 f21.png / f21_2.jpg / w17-best.webp）。
  - ふちの白い余白を落とし、4:3 に中央で切り抜き、800x600 の WebP にして public/art/monsters/<ID>.webp に保存する。
  - src/data/cards.json のそのカードの art に "img":"art/monsters/<ID>.webp" を書く（ID・能力値は変えない）。
  - 取り込んだ元の画像は inbox/done/ へ移す。
検査:
  - art.img のファイルが無いカード、同じ画像ファイルを使う複数のカード、中身が同じ画像。
  - 見た目が似ている組（縮小した明るさの並び＝dHash で比べる。色を変えただけの絵も近くなる）。
  - まだ画像になっていないモンスターの数。
"""
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arttrim import crop43  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
INBOX = ROOT / 'design' / 'leonardo' / 'inbox'
OUT = ROOT / 'public' / 'art' / 'monsters'
CARDS = ROOT / 'src' / 'data' / 'cards.json'
W, H = 800, 600
SIMILAR = 10  # dHash(64bit) の違いがこれ以下なら「似ている」として一覧に出す


def load_cards():
    return json.loads(CARDS.read_text(encoding='utf-8'))['cards']


def match_id(stem, ids):
    # 長いIDから先に見る（例 mom3 と m...）。IDのあとは終わりか英数字以外
    for cid in sorted(ids, key=len, reverse=True):
        if stem == cid or re.match(re.escape(cid) + r'[^0-9a-zA-Z]', stem):
            return cid
    return None


def to_card_image(src: Path, dst: Path):
    im = crop43(Image.open(src).convert('RGB'))  # 白い余白を落としてから 4:3 に切り抜く
    im = im.resize((W, H), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, 'WEBP', quality=82, method=6)


def set_img(cid, rel):
    text = CARDS.read_text(encoding='utf-8')
    lines = text.split('\n')
    hit = 0
    for i, line in enumerate(lines):
        if f'"id":"{cid}"' not in line:
            continue
        m = re.search(r'"art":\{[^}]*\}', line)
        if not m:
            raise SystemExit(f'{cid}: art が見つからない')
        art = json.loads(m.group(0)[6:])
        art['img'] = rel
        lines[i] = line[: m.start()] + '"art":' + json.dumps(art, ensure_ascii=False, separators=(',', ':')) + line[m.end():]
        hit += 1
    if hit != 1:
        raise SystemExit(f'{cid}: cards.json の行が {hit} 個見つかった（1個のはず）')
    new = '\n'.join(lines)
    json.loads(new)  # 壊していないか確認
    CARDS.write_text(new, encoding='utf-8')


def dhash(path: Path) -> int:
    im = Image.open(path).convert('L').resize((9, 8), Image.LANCZOS)
    px = list(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.getdata())
    v = 0
    for y in range(8):
        for x in range(8):
            v = (v << 1) | (px[y * 9 + x] > px[y * 9 + x + 1])
    return v


def do_import():
    ids = {c['id'] for c in load_cards()}
    files = [p for p in sorted(INBOX.glob('*')) if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')]
    if not files:
        print('inbox に画像がありません:', INBOX)
        return
    seen = {}
    for p in files:
        cid = match_id(p.stem, ids)
        if not cid:
            print(f'× {p.name}: 先頭がカードIDになっていないので飛ばしました')
            continue
        if cid in seen:
            print(f'× {p.name}: {cid} は {seen[cid]} と重なるので飛ばしました（1体1枚）')
            continue
        seen[cid] = p.name
        dst = OUT / f'{cid}.webp'
        to_card_image(p, dst)
        set_img(cid, f'art/monsters/{cid}.webp')
        (INBOX / 'done').mkdir(exist_ok=True)
        shutil.move(str(p), str(INBOX / 'done' / p.name))
        print(f'○ {p.name} → public/art/monsters/{cid}.webp')


def check():
    cards = load_cards()
    mons = [c for c in cards if c['type'] == 'monster']
    problems = 0
    by_img = {}
    for c in cards:
        img = c['art'].get('img')
        if not img:
            continue
        by_img.setdefault(img, []).append(c['id'])
        if not (ROOT / 'public' / img).exists():
            print(f'× {c["id"]}: 画像ファイルがない ({img})')
            problems += 1
    for img, owners in by_img.items():
        if len(owners) > 1:
            print(f'× 同じ画像を複数のカードが使っている: {img} ← {", ".join(owners)}')
            problems += 1
    hashes = {}
    raw = {}
    for img, owners in by_img.items():
        f = ROOT / 'public' / img
        if f.exists():
            hashes[owners[0]] = dhash(f)
            raw.setdefault(f.read_bytes(), []).append(owners[0])
    for owners in raw.values():
        if len(owners) > 1:
            print(f'× 中身が同じ画像: {", ".join(owners)}')
            problems += 1
    keys = sorted(hashes)
    pairs = []
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            d = bin(hashes[a] ^ hashes[b]).count('1')
            if d <= SIMILAR:
                pairs.append((d, a, b))
    for d, a, b in sorted(pairs):
        print(f'△ 似ている（目で確認する）: {a} と {b}（違い {d}/64）')
    done = [c for c in mons if c['art'].get('img')]
    print(f'\nモンスター {len(mons)}体のうち 画像あり {len(done)}体 / まだ {len(mons) - len(done)}体（プログラムの絵のまま）')
    print(f'問題 {problems}件・似ている組 {len(pairs)}件')
    return problems


if __name__ == '__main__':
    if '--check' not in sys.argv:
        do_import()
    sys.exit(1 if check() else 0)
