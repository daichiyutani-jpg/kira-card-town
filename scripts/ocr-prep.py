"""文字・署名・透かしの見落としを減らすため、OCR（Windows 標準の文字認識）にかける画像を作る。

  python scripts/ocr-prep.py <出力フォルダ> <候補ファイル名> ...
各画像を 4:3 に切り抜き、①そのまま ②ヒストグラム平坦化（薄い透かしを濃くする）を PNG で出す。
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arttrim import crop43  # noqa: E402

CAND = Path(__file__).resolve().parent.parent / 'design' / 'leonardo' / 'candidates'


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name in sys.argv[2:]:
        im = crop43(Image.open(CAND / name).convert('L'))
        stem = Path(name).stem
        im.save(out / f'{stem}.png')
        # 小さい区画ごとに平坦化すると、平らな背景に溶けた薄い文字が浮き出る
        w, h = im.size
        eq = Image.new('L', im.size)
        T = 128
        for y in range(0, h, T):
            for x in range(0, w, T):
                box = (x, y, min(x + T, w), min(y + T, h))
                eq.paste(ImageOps.equalize(im.crop(box)), box)
        eq.save(out / f'{stem}~eq.png')


if __name__ == '__main__':
    main()
