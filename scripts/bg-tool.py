"""画面の背景の絵（Leonardo で作った縦長の絵）を扱う。

  python scripts/bg-tool.py fetch <results.json>      # {名前: [URL, ...]} を design/leonardo/bg/<名前>_a.jpg ... に保存
  python scripts/bg-tool.py sheet <出力名> <名前> ...   # 候補を並べたシート design/leonardo/sheets/<出力名>.png
  python scripts/bg-tool.py pick <名前>=<文字> ...      # 選んだ候補を public/art/bg/<名前>.webp（横720px）にする
選んだ記録は design/leonardo/bg/picks.json。
"""
import json
import string
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / 'design' / 'leonardo' / 'bg'
OUT = ROOT / 'public' / 'art' / 'bg'
sys.stdout.reconfigure(encoding='utf-8')


def trim_white(im):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from arttrim import trim_white as t
    return t(im)


def fetch(path):
    res = json.loads(Path(path).read_text(encoding='utf-8'))
    DIR.mkdir(parents=True, exist_ok=True)
    n = 0
    for name, urls in res.items():
        for url in urls:
            tag = DIR / f"{name}~{url.rsplit('/', 2)[-2]}~{url.rsplit('-', 1)[-1].replace('.jpg', '')}.src"
            if tag.exists():
                continue
            used = {p.stem.rsplit('_', 1)[-1] for p in DIR.glob(f'{name}_*.jpg')}
            letter = next(c for c in string.ascii_lowercase if c not in used)
            subprocess.run(['curl', '-sSf', '-o', str(DIR / f'{name}_{letter}.jpg'), url], check=True)
            tag.write_text(url, encoding='utf-8')
            n += 1
    print(f'保存 {n} 枚')


def sheet(out, names):
    W, H = 270, 480
    rows = [(n, sorted(DIR.glob(f'{n}_*.jpg'))) for n in names]
    cols = max(len(f) for _, f in rows)
    sh = Image.new('RGB', (cols * (W + 6) + 6, len(rows) * (H + 6) + 6), (20, 16, 40))
    d = ImageDraw.Draw(sh)
    font = ImageFont.truetype('arial.ttf', 20)
    for r, (n, files) in enumerate(rows):
        for c, f in enumerate(files):
            x, y = 6 + c * (W + 6), 6 + r * (H + 6)
            sh.paste(Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS), (x, y))
            d.rectangle((x, y, x + 12 * len(f.stem) + 8, y + 26), fill=(0, 0, 0))
            d.text((x + 4, y + 2), f.stem, fill=(255, 255, 0), font=font)
    p = ROOT / 'design' / 'leonardo' / 'sheets' / f'{out}.png'
    sh.save(p)
    print(p)


def pick(args):
    OUT.mkdir(parents=True, exist_ok=True)
    pk = DIR / 'picks.json'
    picks = json.loads(pk.read_text(encoding='utf-8')) if pk.exists() else {}
    for a in args:
        name, letter = a.split('=')
        src = DIR / f'{name}_{letter}.jpg'
        im = trim_white(Image.open(src).convert('RGB'))
        w, h = im.size
        im = im.resize((720, round(720 * h / w)), Image.LANCZOS)
        im.save(OUT / f'{name}.webp', 'WEBP', quality=78, method=6)
        picks[name] = src.name
        print(f'{src.name} → public/art/bg/{name}.webp {im.size} {(OUT / f"{name}.webp").stat().st_size // 1024}KB')
    pk.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'fetch':
        fetch(sys.argv[2])
    elif cmd == 'sheet':
        sheet(sys.argv[2], sys.argv[3:])
    elif cmd == 'pick':
        pick(sys.argv[2:])
