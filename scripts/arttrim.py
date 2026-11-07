"""生成画像のふちに入る白い余白（帯）を切り落とす。art-sheet / pick / import-art で共通に使う。"""
from PIL import Image, ImageStat

LIMIT = 0.15  # 片側で最大この割合まで切る


def _blank(strip):
    # ほぼ白の画素が8割以上なら「余白」とみなす
    g = strip.convert('L').point(lambda v: 255 if v > 228 else 0)
    return ImageStat.Stat(g).mean[0] > 255 * 0.8


def trim_white(im: Image.Image) -> Image.Image:
    w, h = im.size
    l, t, r, b = 0, 0, w, h
    step = 4
    while l < w * LIMIT and _blank(im.crop((l, t, l + step, b))):
        l += step
    while w - r < w * LIMIT and _blank(im.crop((r - step, t, r, b))):
        r -= step
    while t < h * LIMIT and _blank(im.crop((l, t, r, t + step))):
        t += step
    while h - b < h * LIMIT and _blank(im.crop((l, b - step, r, b))):
        b -= step
    if (l, t, r, b) == (0, 0, w, h):
        return im
    # 帯の内側に残る細いすじも落とすため、少し余分に切る
    pad = 6
    return im.crop((min(l + (pad if l else 0), w), t + (pad if t else 0), r - (pad if r < w else 0), b - (pad if b < h else 0)))


def crop43(im: Image.Image) -> Image.Image:
    im = trim_white(im)
    w, h = im.size
    if w / h > 4 / 3:
        nw = round(h * 4 / 3)
        return im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    nh = round(w * 3 / 4)
    return im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
