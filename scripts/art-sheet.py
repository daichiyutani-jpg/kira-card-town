"""候補画像の一覧シートを作る（目で確認するため）。

  python scripts/art-sheet.py <出力名> <ID> [<ID> ...]
  → design/leonardo/sheets/<出力名>.png
各IDの候補（design/leonardo/candidates/<ID>_a.jpg, _b.jpg ...）を、ゲームと同じ4:3切り抜きで並べる。
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arttrim import crop43  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / 'design' / 'leonardo' / 'candidates'
OUT = ROOT / 'design' / 'leonardo' / 'sheets'
TW, TH = 400, 300




def main():
    name, ids = sys.argv[1], sys.argv[2:]
    rows = []
    for cid in ids:
        files = sorted(CAND.glob(f'{cid}_*.jpg'))
        rows.append((cid, files))
    cols = max((len(f) for _, f in rows), default=1)
    sheet = Image.new('RGB', (cols * (TW + 6) + 6, len(rows) * (TH + 6) + 6), (20, 16, 40))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('arial.ttf', 22)
    except OSError:
        font = ImageFont.load_default()
    for r, (cid, files) in enumerate(rows):
        for c, f in enumerate(files):
            im = crop43(Image.open(f).convert('RGB')).resize((TW, TH), Image.LANCZOS)
            x, y = 6 + c * (TW + 6), 6 + r * (TH + 6)
            sheet.paste(im, (x, y))
            label = f.stem
            draw.rectangle((x, y, x + 12 * len(label) + 10, y + 28), fill=(0, 0, 0))
            draw.text((x + 5, y + 2), label, fill=(255, 255, 0), font=font)
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f'{name}.png'
    sheet.save(p)
    print(p)


if __name__ == '__main__':
    main()
