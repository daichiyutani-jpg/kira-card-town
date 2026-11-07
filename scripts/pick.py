"""選んだ候補を取り込み待ち（inbox）に置き、選んだ記録を残す。

  python scripts/pick.py f01=b f02=a ...
  → design/leonardo/candidates/<ID>_<文字>.jpg を design/leonardo/inbox/<ID>.jpg にコピー
  → design/leonardo/picks.json に {ID: "<ID>_<文字>.jpg"} を記録
  python scripts/pick.py --corners <出力名> <ID> ...
  → 選んだ絵の下側と四隅を大きめに並べたシート（署名・文字が入っていないかを見る）
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arttrim import crop43  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LEO = ROOT / 'design' / 'leonardo'
CAND = LEO / 'candidates'
INBOX = LEO / 'inbox'
PICKS = LEO / 'picks.json'
sys.stdout.reconfigure(encoding='utf-8')




def load():
    return json.loads(PICKS.read_text(encoding='utf-8')) if PICKS.exists() else {}


def pick(args):
    picks = load()
    INBOX.mkdir(parents=True, exist_ok=True)
    for a in args:
        cid, letter = a.split('=')
        src = CAND / f'{cid}_{letter}.jpg'
        if not src.exists():
            print('ない:', src.name)
            continue
        shutil.copyfile(src, INBOX / f'{cid}.jpg')
        picks[cid] = src.name
    PICKS.write_text(json.dumps(dict(sorted(picks.items())), ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'選択 {len(args)} 件（合計 {len(picks)} 体）')


def corners(name, ids):
    picks = load()
    W, H = 600, 450
    sheet = Image.new('RGB', (2 * (W + 6) + 6, len(ids) * (H // 2 + 6) + 6), (20, 16, 40))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('arial.ttf', 20)
    except OSError:
        font = ImageFont.load_default()
    for r, cid in enumerate(ids):
        im = crop43(Image.open(CAND / picks[cid]).convert('RGB')).resize((W * 2, H * 2), Image.LANCZOS)
        bottom = im.crop((0, H, W * 2, H * 2))  # 下半分
        left, right = bottom.crop((0, 0, W * 2 // 2, H)), bottom.crop((W, 0, W * 2, H))
        y = 6 + r * (H // 2 + 6)
        for c, part in enumerate((left, right)):
            part = part.resize((W, H // 2), Image.LANCZOS)
            sheet.paste(part, (6 + c * (W + 6), y))
        d.rectangle((6, y, 110, y + 24), fill=(0, 0, 0))
        d.text((10, y + 2), picks[cid][:-4], fill=(255, 255, 0), font=font)
    out = LEO / 'sheets' / f'{name}.png'
    sheet.save(out)
    print(out)


if __name__ == '__main__':
    if sys.argv[1] == '--corners':
        corners(sys.argv[2], sys.argv[3:])
    else:
        pick(sys.argv[1:])
