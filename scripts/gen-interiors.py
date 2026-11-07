"""建物の中（室内マップ）を作る。

使い方（kira-card-town フォルダで）:
  python scripts/gen-interiors.py          # maps.json と story.json に室内を作る（もう入っていれば作り直す）

- 町の建物（屋台・社・じぶんの家をのぞく）の act を「中へ入る（warp）」に変え、
  もとの act（ショップ・大会・アルバイト・会話）は室内のカウンターや人に移す。
- 出口のマットを踏むと、町の扉の前（扉の1マス下）に出る。
- 配達のアルバイト中は、家の扉の前で荷物をわたす（world.ts。中には入らない）。
"""
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
MAPS = ROOT / 'src' / 'data' / 'maps.json'
STORY = ROOT / 'src' / 'data' / 'story.json'

# 人の色（髪・服・肌・ズボン・帽子・エプロン）
def look(hair, shirt, skin='#f3c9a4', pants='#34495e', **kw):
    d = {'hair': hair, 'shirt': shirt, 'skin': skin, 'pants': pants}
    d.update(kw)
    return d

def npc(id, x, y, dir, lk, name, talk):
    return {'id': id, 'x': x, 'y': y, 'dir': dir, 'look': lk, 'name': name, 'talk': talk}

def obj(id, x, y, kind, label, act=None, w=None, h=None):
    o = {'id': id, 'x': x, 'y': y}
    if w:
        o['w'] = w
    if h:
        o['h'] = h
    o.update({'kind': kind, 'label': label, 'act': act or {}})
    return o

T = lambda key: {'talk': key}

def deco(id, x, kind, label, talk, w=1, color=None):
    """奥の壁（y=0〜1）に付けるかざり"""
    o = obj(id, x, 0, kind, label, T(talk), w=w if w > 1 else None, h=2)
    if color:
        o['color'] = color
    return o


def col(o, color):
    o['color'] = color
    return o


# 壁紙・床の組み合わせ
TH = {
    'cardshop': {'wall': '#fff4d6', 'wall2': '#ffe9b0', 'pattern': 'stripe', 'base': '#b9763a', 'floor': 'tile', 'f1': '#f4f7fb', 'f2': '#dde7f1', 'rug': '#2e86de', 'rug2': '#bfe0ff'},
    'mega': {'wall': '#fff3e0', 'wall2': '#ffe0b2', 'pattern': 'check', 'base': '#e67e22', 'floor': 'tile', 'f1': '#fafafa', 'f2': '#e8ecef', 'rug': '#e67e22', 'rug2': '#ffe0b2'},
    'forestshop': {'wall': '#d7b98e', 'wall2': '#c49a6c', 'pattern': 'wood', 'base': '#6d4c2f', 'floor': 'wood', 'f1': '#a8794a', 'f2': '#9c6e40', 'rug': '#6b8e23', 'rug2': '#d4e7a8'},
    'hall_purple': {'wall': '#efe6ff', 'wall2': '#e2d3ff', 'pattern': 'stripe', 'base': '#6c3483', 'floor': 'wood', 'f1': '#d9a86a', 'f2': '#cf9b5d', 'rug': '#8e44ad', 'rug2': '#f1d9ff'},
    'hall_red': {'wall': '#ffe9ec', 'wall2': '#ffd3da', 'pattern': 'stripe', 'base': '#922b21', 'floor': 'wood', 'f1': '#d39b62', 'f2': '#c98e55', 'rug': '#c0392b', 'rug2': '#ffd23b'},
    'hall_forest': {'wall': '#d7b98e', 'wall2': '#c8a675', 'pattern': 'wood', 'base': '#4e342e', 'floor': 'wood', 'f1': '#b08050', 'f2': '#a37445', 'rug': '#2e7d32', 'rug2': '#c5e1a5'},
    'post': {'wall': '#eaf7ea', 'wall2': '#d6eed6', 'pattern': 'stripe', 'base': '#27ae60', 'floor': 'tile', 'f1': '#f3f6f2', 'f2': '#e1e9de'},
    'warehouse': {'wall': '#cfd8dc', 'wall2': '#b8c4c9', 'pattern': 'brick', 'base': '#546e7a', 'floor': 'concrete', 'f1': '#b9c0c6', 'f2': '#a6aeb5'},
    'ramen': {'wall': '#fff8e1', 'wall2': '#f3e2b3', 'pattern': 'wood', 'base': '#5d4037', 'floor': 'tile', 'f1': '#e9dcc4', 'f2': '#dccdb0'},
    'boutique': {'wall': '#fce4ec', 'wall2': '#f8cbdc', 'pattern': 'stripe', 'base': '#ad1457', 'floor': 'wood', 'f1': '#e8c9a8', 'f2': '#dfbd99', 'rug': '#f48fb1', 'rug2': '#ffffff'},
    'cabin': {'wall': '#d7b98e', 'wall2': '#c49a6c', 'pattern': 'wood', 'base': '#5d4037', 'floor': 'wood', 'f1': '#9c6e40', 'f2': '#916537'},
    'house_red': {'wall': '#fff0f0', 'wall2': '#ffd9d9', 'pattern': 'dots', 'base': '#a0522d', 'floor': 'wood', 'f1': '#d9a86a', 'f2': '#d09c5e', 'rug': '#e57373', 'rug2': '#ffffff'},
    'house_blue': {'wall': '#eef6ff', 'wall2': '#dcebff', 'pattern': 'stripe', 'base': '#1565c0', 'floor': 'wood', 'f1': '#b07a44', 'f2': '#a46f3b', 'rug': '#3949ab', 'rug2': '#c5cae9'},
    'house_jp': {'wall': '#f5ecd7', 'pattern': 'plain', 'base': '#6d4c41', 'floor': 'tatami', 'f1': '#cfd69a', 'f2': '#c3cb8a'},
    'house_green': {'wall': '#eef8e8', 'wall2': '#dcefd2', 'pattern': 'check', 'base': '#5d4037', 'floor': 'wood', 'f1': '#d8b07c', 'f2': '#cfa470'},
    'house_purple': {'wall': '#f7f0ff', 'wall2': '#e8dcff', 'pattern': 'dots', 'base': '#6a1b9a', 'floor': 'wood', 'f1': '#d9a86a', 'f2': '#cf9b5d', 'rug': '#7e57c2', 'rug2': '#ede7f6'},
}

# 室内の決まり：外周は壁、上から2段（y=0〜1）が奥の壁。かざりは奥の壁に、家具は y=2 から。出口は下の真ん中。
HALL_COMMON = lambda cup, th, staff, fan, plant=False: dict(
    w=13, h=10, theme=th, rects=[(6, 2, 1, 7, 'k')],
    objects=[deco('win1', 1, 'window', '窓', 'in_window', color='#8e44ad' if th == 'hall_purple' else '#c0392b' if th == 'hall_red' else '#558b2f'),
             deco('poster1', 3, 'poster', '大会のポスター', 'in_cuposter', color='#ff7a3c'),
             deco('board', 5, 'scoreboard', '電光掲示板', 'in_scoreboard', w=3),
             deco('poster2', 9, 'poster', '大会のポスター', 'in_cuposter', color='#3c8dff'),
             deco('win2', 11, 'window', '窓', 'in_window', color='#8e44ad' if th == 'hall_purple' else '#c0392b' if th == 'hall_red' else '#558b2f'),
             obj('counter', 5, 3, 'counter', '受付', {'cup': cup}, w=3),
             obj('trophy1', 1, 2, 'trophy', 'トロフィーの棚', T('in_trophy'), w=3),
             obj('trophy2', 9, 2, 'trophy', 'トロフィーの棚', T('in_trophy'), w=3),
             obj('light1', 1, 4, 'spotlight', 'ライト', T('in_spotlight')),
             obj('light2', 11, 4, 'spotlight', 'ライト', T('in_spotlight')),
             obj('bench1', 2, 5, 'bench', '観客席', T('in_bench'), w=3),
             obj('bench2', 8, 5, 'bench', '観客席', T('in_bench'), w=3),
             obj('bench3', 2, 7, 'bench', '観客席', T('in_bench'), w=3),
             obj('bench4', 8, 7, 'bench', '観客席', T('in_bench'), w=3)]
    + ([obj('plant1', 1, 8, 'plant', '観葉植物', T('in_forestplant')), obj('plant2', 11, 8, 'plant', '観葉植物', T('in_forestplant'))] if plant else
       [obj('plant1', 1, 8, 'plant', '観葉植物', T('in_plant')), obj('plant2', 11, 8, 'plant', '観葉植物', T('in_plant'))]),
    npcs=[staff, fan])

INTERIORS = [
    # ---- ひだまり町
    dict(bld='shop1', town='town1', name='カードショップ ひだまり', bgm='shop', w=11, h=9, theme='cardshop',
         rects=[(4, 4, 3, 4, 'k')],
         objects=[deco('win1', 1, 'window', '窓', 'in_window', w=2, color='#2e86de'),
                  deco('poster1', 3, 'poster', 'カードのポスター', 'in_poster', color='#ff7a3c'),
                  deco('clock', 5, 'clock', '時計', 'in_clock'),
                  deco('poster2', 7, 'poster', 'カードのポスター', 'in_poster', color='#2ead5b'),
                  deco('win2', 8, 'window', '窓', 'in_window', w=2, color='#2e86de'),
                  obj('counter', 4, 3, 'counter', 'レジ', {'shop': 'shop1'}, w=3),
                  obj('case1', 1, 2, 'showcase', 'ショーケース', T('in_showcase'), w=2),
                  obj('case2', 8, 2, 'showcase', 'ショーケース', T('in_showcase'), w=2),
                  obj('pack1', 1, 4, 'packstand', 'パックの台', T('in_packstand')),
                  obj('pack2', 9, 4, 'packstand', 'パックの台', T('in_packstand')),
                  obj('table1', 1, 6, 'cardtable', '対戦テーブル', T('in_playtable'), w=2),
                  col(obj('chair1', 3, 6, 'chair', 'いす', T('in_chair')), '#e57373'),
                  obj('table2', 8, 6, 'cardtable', '対戦テーブル', T('in_playtable'), w=2),
                  col(obj('chair2', 7, 6, 'chair', 'いす', T('in_chair')), '#64b5f6'),
                  obj('plant1', 1, 7, 'plant', '観葉植物', T('in_plant')),
                  obj('plant2', 9, 7, 'plant', '観葉植物', T('in_plant'))],
         npcs=[npc('clerk', 5, 2, 'down', look('#2f8f5b', '#69c28e', pants='#3b4a6b'), 'ミドリ店長', 'in_clerk'),
               npc('shopkid', 8, 5, 'down', look('#5a3a1a', '#ff8a65', pants='#455a64'), 'カード好きの子', 'in_shopkid')]),
    dict(bld='hall1', town='town1', name='ひだまり大会会場', bgm='cup',
         **HALL_COMMON('cup1', 'hall_purple', npc('hallstaff1', 6, 2, 'down', look('#3a2a1a', '#8e44ad', pants='#2c3e50'), '受付の人', 'in_hallstaff'),
                       npc('fan1', 9, 4, 'left', look('#c0392b', '#f1c40f', pants='#2c3e50'), '大会ファン', 'in_fan1'))),
    dict(bld='post', town='town1', name='ひだまり配達センター', bgm='town1', w=11, h=9, theme='post',
         rects=[],
         objects=[deco('holes', 1, 'pigeonhole', '手紙の仕分けだな', 'in_pigeonhole', w=3),
                  deco('clock', 5, 'clock', '時計', 'in_clock'),
                  deco('cal', 7, 'calendar', 'カレンダー', 'in_calendar'),
                  deco('win', 8, 'window', '窓', 'in_window', w=2, color='#27ae60'),
                  obj('counter', 4, 3, 'counter', '受付', {'job': 'delivery'}, w=3),
                  obj('shelf1', 1, 2, 'shelfmetal', '荷物のたな', T('in_parcel'), w=2),
                  obj('shelf2', 8, 2, 'shelfmetal', '荷物のたな', T('in_parcel'), w=2),
                  obj('scale', 7, 4, 'scale', 'はかり', T('in_scale')),
                  obj('crate1', 9, 5, 'crate', '荷物', T('in_parcel'), h=2),
                  obj('crate2', 1, 5, 'crate', '荷物', T('in_parcel')),
                  obj('mailbox', 1, 7, 'mailbox', 'ポスト', T('in_mailbox')),
                  obj('plant1', 9, 7, 'plant', '観葉植物', T('in_plant'))],
         npcs=[npc('poststaff', 5, 2, 'down', look('#222', '#27ae60', pants='#1e5631', hat='#1e5631'), '配達センターの人', 'in_poststaff')]),
    dict(bld='d1', town='town1', name='赤い屋根の家', bgm='home', w=9, h=7, theme='house_red',
         rects=[(3, 3, 3, 2, 'k')],
         objects=[deco('dishes', 1, 'wallshelf', 'お皿の棚', 'in_d1_kitchen', w=2),
                  deco('clock', 4, 'clock', '時計', 'in_clock'),
                  deco('win', 6, 'window', '窓', 'in_window', w=2, color='#e57373'),
                  obj('kitchen', 1, 2, 'kitchen', '台所', T('in_d1_kitchen'), w=2),
                  obj('fridge', 3, 2, 'fridge', '冷ぞう庫', T('in_fridge')),
                  obj('shelf', 6, 2, 'shelf', '本だな', T('in_d1_shelf'), w=2),
                  obj('table', 4, 3, 'table', 'テーブル', T('in_d1_table')),
                  col(obj('chair1', 3, 3, 'chair', 'いす', T('in_chair')), '#e57373'),
                  col(obj('chair2', 5, 3, 'chair', 'いす', T('in_chair')), '#e57373'),
                  obj('vase', 7, 5, 'vase', '花びん', T('in_vase'))],
         npcs=[npc('satou', 6, 4, 'left', look('#6d4c41', '#e57373', pants='#5d4037', apron='#ffffff'), 'さとうさん', 'in_d1')]),
    dict(bld='d2', town='town1', name='青い屋根の家', bgm='home', w=9, h=7, theme='house_blue',
         rects=[(2, 4, 5, 1, 'k')],
         objects=[deco('paint', 1, 'painting', '絵', 'in_painting', w=2),
                  deco('win', 4, 'window', '窓', 'in_window', w=3, color='#3949ab'),
                  deco('clock', 7, 'clock', '時計', 'in_clock'),
                  obj('piano', 4, 2, 'piano', 'ピアノ', T('in_piano'), w=3),
                  obj('shelf', 1, 2, 'shelf', '楽譜のたな', T('in_d2_shelf'), w=2),
                  obj('lamp', 7, 2, 'lamp', 'スタンド', T('in_lamp')),
                  col(obj('sofa', 1, 4, 'sofa', 'ソファ', T('in_sofa'), w=2), '#3949ab'),
                  obj('plant', 7, 4, 'plant', '観葉植物', T('in_plant'))],
         npcs=[npc('pianist', 5, 3, 'up', look('#1a237e', '#90caf9', pants='#1565c0'), 'ピアノのお姉さん', 'in_d2')]),
    dict(bld='d3', town='town1', name='黄色い屋根の家', bgm='home', w=9, h=7, theme='house_jp',
         rects=[],
         objects=[deco('win', 1, 'window', '窓', 'in_window', w=2, color='#d7ccc8'),
                  deco('scroll', 4, 'hangscroll', '掛け軸', 'in_hangscroll'),
                  deco('clock', 6, 'clock', '時計', 'in_clock'),
                  obj('tansu', 1, 2, 'shelf', 'たんす', T('in_d3_shelf'), w=2),
                  obj('kitchen', 6, 2, 'kitchen', '台所', T('in_d3_kitchen'), w=2),
                  obj('cat', 2, 4, 'cat', 'ねこ', T('in_cat')),
                  col(obj('kotatsu', 6, 4, 'kotatsu', 'こたつ', T('in_kotatsu')), '#c62828'),
                  obj('vase', 7, 5, 'vase', '花びん', T('in_vase'))],
         npcs=[npc('catgrandpa', 4, 3, 'down', look('#e0e0e0', '#ffca28', skin='#efc9a0', pants='#6d4c41'), 'ねこ好きのおじいさん', 'in_d3')]),
    dict(bld='d4', town='town1', name='緑の屋根の家', bgm='home', w=9, h=7, theme='house_green',
         rects=[],
         objects=[deco('shelfw', 1, 'wallshelf', '棚', 'in_d4_shelf', w=2),
                  deco('win', 3, 'window', '窓', 'in_window', w=2, color='#66bb6a'),
                  deco('cal', 6, 'calendar', 'カレンダー', 'in_calendar'),
                  col(obj('plant1', 1, 2, 'veggie', 'トマトのなえ', T('in_d4_plant')), '#e53935'),
                  col(obj('plant2', 2, 2, 'veggie', 'きゅうりのなえ', T('in_d4_plant')), '#7cb342'),
                  col(obj('plant3', 7, 2, 'veggie', 'なすのなえ', T('in_d4_plant')), '#6a1b9a'),
                  obj('basket', 6, 4, 'basket', '野菜のかご', T('in_d4_crate')),
                  obj('table', 2, 4, 'table', 'テーブル', T('in_d4_table')),
                  col(obj('chair', 1, 4, 'chair', 'いす', T('in_chair')), '#8d6e63')],
         npcs=[npc('farmer', 4, 2, 'down', look('#5d4037', '#66bb6a', skin='#e0b48a', pants='#3e2723', hat='#f9a825'), '野菜づくりのおじさん', 'in_d4')]),
    dict(bld='d5', town='town1', name='紫の屋根の家', bgm='home', w=9, h=7, theme='house_purple',
         rects=[(2, 2, 5, 3, 'k')],
         objects=[deco('poster1', 1, 'poster', 'モンスターのポスター', 'in_poster', color='#b05dff'),
                  deco('poster2', 2, 'poster', 'モンスターのポスター', 'in_poster', color='#e5484d'),
                  deco('win', 4, 'window', '窓', 'in_window', w=2, color='#7e57c2'),
                  deco('clock', 7, 'clock', '時計', 'in_clock'),
                  obj('tv', 1, 2, 'tv', 'テレビ', T('in_tv')),
                  obj('table', 3, 3, 'cardtable', 'カードを広げたテーブル', T('in_cardtable'), w=3),
                  obj('shelf', 6, 2, 'shelf', 'カードファイルのたな', T('in_d5_shelf'), w=2),
                  col(obj('sofa', 1, 5, 'sofa', 'ソファ', T('in_sofa'), w=2), '#7e57c2')],
         npcs=[npc('cardbro', 2, 3, 'right', look('#4a148c', '#ce93d8', pants='#311b92'), 'カード好きの兄', 'in_d5_bro'),
               npc('cardsis', 6, 3, 'left', look('#4a148c', '#f8bbd0', pants='#6a1b9a'), 'カード好きの妹', 'in_d5_sis')]),
    # ---- にぎわい通り
    dict(bld='shop2', town='town2', name='メガカードショップ にぎわい', bgm='shop', w=15, h=10, theme='mega',
         rects=[(6, 4, 3, 5, 'k')],
         objects=[deco('win1', 1, 'window', '窓', 'in_window', w=2, color='#e67e22'),
                  deco('poster1', 3, 'poster', 'カードのポスター', 'in_poster', color='#e5484d'),
                  deco('poster2', 4, 'poster', 'カードのポスター', 'in_poster', color='#3c8dff'),
                  deco('banner', 5, 'banner', '旗のかざり', 'in_banner', w=5),
                  deco('poster3', 10, 'poster', 'カードのポスター', 'in_poster', color='#ffcc33'),
                  deco('poster4', 11, 'poster', 'カードのポスター', 'in_poster', color='#2ead5b'),
                  deco('win2', 12, 'window', '窓', 'in_window', w=2, color='#e67e22'),
                  obj('counter', 6, 3, 'counter', 'レジ', {'shop': 'shop2'}, w=3),
                  obj('case1', 1, 2, 'showcase', 'ショーケース', T('in_showcase'), w=4),
                  obj('case2', 10, 2, 'showcase', 'ショーケース', T('in_showcase'), w=4),
                  obj('case3', 1, 5, 'showcase', 'ショーケース', T('in_showcase2'), w=2),
                  obj('case4', 12, 5, 'showcase', 'ショーケース', T('in_showcase2'), w=2),
                  obj('pack1', 4, 4, 'packstand', 'パックの台', T('in_packstand')),
                  obj('pack2', 12, 4, 'packstand', 'パックの台', T('in_packstand')),
                  obj('table1', 2, 7, 'cardtable', '対戦テーブル', T('in_playtable'), w=2),
                  col(obj('chair1', 1, 7, 'chair', 'いす', T('in_chair')), '#e57373'),
                  obj('table2', 11, 7, 'cardtable', '対戦テーブル', T('in_playtable'), w=2),
                  col(obj('chair2', 10, 7, 'chair', 'いす', T('in_chair')), '#64b5f6'),
                  col(obj('chair3', 13, 7, 'chair', 'いす', T('in_chair')), '#64b5f6')],
         npcs=[npc('megaclerk', 7, 2, 'down', look('#222', '#e67e22', pants='#2c3e50'), 'メガショップの店員', 'in_megaclerk'),
               npc('megakid', 4, 7, 'left', look('#3e2723', '#42a5f5', pants='#263238'), '対戦中の男の子', 'in_megakid'),
               npc('megagirl', 10, 4, 'down', look('#ad1457', '#fff59d', pants='#ad1457'), 'カードを選ぶ女の子', 'in_megagirl')]),
    dict(bld='hall2', town='town2', name='にぎわいアリーナ', bgm='cup',
         **HALL_COMMON('cup2', 'hall_red', npc('hallstaff2', 6, 2, 'down', look('#3a2a1a', '#c0392b', pants='#2c3e50'), '受付の人', 'in_hallstaff'),
                       npc('fan2', 3, 4, 'right', look('#f39c12', '#2980b9', pants='#2c3e50'), 'アリーナの常連', 'in_fan2'))),
    dict(bld='warehouse', town='town2', name='にぎわい倉庫', bgm='town2', w=13, h=10, theme='warehouse',
         rects=[],
         objects=[deco('win1', 1, 'window', '窓', 'in_window', w=2, color='#78909c'),
                  deco('clock', 6, 'clock', '時計', 'in_clock'),
                  deco('cal', 8, 'calendar', 'カレンダー', 'in_calendar'),
                  deco('win2', 10, 'window', '窓', 'in_window', w=2, color='#78909c'),
                  obj('counter', 5, 3, 'counter', '受付', {'job': 'sorting'}, w=3),
                  obj('rack1', 1, 2, 'shelfmetal', '荷物のたな', T('in_parcel'), w=3),
                  obj('rack2', 9, 2, 'shelfmetal', '荷物のたな', T('in_parcel'), w=3),
                  obj('crate1', 1, 5, 'crate', '荷物の山', T('in_parcel'), w=2, h=2),
                  obj('belt', 8, 6, 'conveyor', 'ベルトコンベア', T('in_conveyor'), w=4),
                  obj('crate2', 10, 4, 'crate', '荷物の山', T('in_parcel'), w=2),
                  obj('crate3', 1, 8, 'crate', '荷物', T('in_parcel'), w=2)],
         npcs=[npc('whstaff', 6, 2, 'down', look('#333', '#7f8c8d', skin='#e0b48a', pants='#34495e', hat='#ffc107'), '倉庫の人', 'in_whstaff')]),
    dict(bld='ramen', town='town2', name='ラーメン こがね', bgm='town2', w=11, h=8, theme='ramen',
         rects=[],
         objects=[deco('menu1', 1, 'menuboard', 'お品書き', 'in_menuboard', w=3),
                  deco('noren', 4, 'noren', 'のれん', 'in_noren', w=3, color='#283593'),
                  deco('menu2', 7, 'menuboard', 'お品書き', 'in_menuboard', w=2),
                  deco('clock', 9, 'clock', '時計', 'in_clock'),
                  obj('stove1', 2, 2, 'stove', '大なべ', T('in_stove'), w=2),
                  obj('stove2', 7, 2, 'stove', '大なべ', T('in_stove'), w=2),
                  obj('counter', 2, 3, 'counter', 'カウンター', T('in_ramen'), w=7),
                  obj('stool1', 2, 4, 'stool', 'いす', T('in_stool')),
                  obj('stool2', 4, 4, 'stool', 'いす', T('in_stool')),
                  obj('stool3', 6, 4, 'stool', 'いす', T('in_stool')),
                  obj('stool4', 8, 4, 'stool', 'いす', T('in_stool')),
                  obj('plant1', 1, 6, 'plant', '観葉植物', T('in_plant')),
                  obj('plant2', 9, 6, 'plant', '観葉植物', T('in_plant'))],
         npcs=[npc('ramenmaster', 5, 2, 'down', look('#222', '#ffffff', skin='#e0b48a', pants='#455a64'), 'ラーメン屋の大将', 'in_ramenmaster'),
               npc('ramenguest', 8, 5, 'up', look('#4e342e', '#78909c', pants='#37474f'), 'お客さん', 'in_ramenguest')]),
    dict(bld='cloth', town='town2', name='ブティック ルル', bgm='town2', w=9, h=8, theme='boutique',
         rects=[(2, 4, 5, 3, 'k')],
         objects=[deco('win', 1, 'window', '窓', 'in_window', w=2, color='#ec407a'),
                  deco('paint', 4, 'painting', '絵', 'in_painting'),
                  deco('poster', 6, 'poster', 'ファッションのポスター', 'in_fashionposter', w=2, color='#ec407a'),
                  obj('counter', 3, 3, 'counter', 'レジ', T('in_boutique'), w=3),
                  obj('rack1', 1, 2, 'rack', '服のラック', T('in_rack'), w=2),
                  obj('rack2', 6, 2, 'rack', '服のラック', T('in_rack'), w=2),
                  col(obj('man1', 1, 4, 'mannequin', 'マネキン', T('in_mannequin')), '#ab47bc'),
                  col(obj('man2', 1, 5, 'mannequin', 'マネキン', T('in_mannequin')), '#26a69a'),
                  col(obj('fit', 7, 3, 'fitting', '試着室', T('in_fitting')), '#7b1fa2'),
                  obj('mirror', 7, 5, 'mirror', '鏡', T('in_mirror'), h=2)],
         npcs=[npc('boutiquestaff', 4, 2, 'down', look('#e86b9a', '#fce4ec', pants='#e91e63'), 'お店の人', 'in_boutiquestaff')]),
    # ---- みどりの森町
    dict(bld='shop3', town='town3', name='森のカード屋 こもれび', bgm='shop', w=11, h=9, theme='forestshop',
         rects=[(4, 4, 3, 4, 'k')],
         objects=[deco('win1', 1, 'window', '窓', 'in_window', w=2, color='#6b8e23'),
                  deco('paint', 3, 'painting', '森の絵', 'in_painting'),
                  deco('clock', 5, 'clock', '時計', 'in_clock'),
                  deco('poster', 7, 'poster', 'カードのポスター', 'in_poster', color='#2ead5b'),
                  deco('win2', 8, 'window', '窓', 'in_window', w=2, color='#6b8e23'),
                  obj('counter', 4, 3, 'counter', 'レジ', {'shop': 'shop3'}, w=3),
                  obj('shelf', 1, 2, 'shelf', '木のたな', T('in_forestshelf'), w=2),
                  obj('case1', 8, 2, 'showcase', 'ショーケース', T('in_showcase'), w=2),
                  obj('stove', 9, 4, 'woodstove', 'まきストーブ', T('in_woodstove')),
                  obj('pack', 1, 4, 'packstand', 'パックの台', T('in_packstand')),
                  obj('table', 1, 6, 'cardtable', '対戦テーブル', T('in_playtable'), w=2),
                  col(obj('chair', 3, 6, 'chair', 'いす', T('in_chair')), '#8d6e63'),
                  obj('plant1', 9, 6, 'plant', '森の草花', T('in_forestplant')),
                  obj('plant2', 9, 7, 'plant', '森の草花', T('in_forestplant'))],
         npcs=[npc('forestclerk', 5, 2, 'down', look('#6d4c2f', '#a1887f', skin='#efc9a0', pants='#4e342e', apron='#558b2f'), 'こもれびの店主', 'in_forestclerk')]),
    dict(bld='hall3', town='town3', name='みどりの森ステージ', bgm='cup',
         **HALL_COMMON('cup3', 'hall_forest', npc('hallstaff3', 6, 2, 'down', look('#3a2a1a', '#2e7d32', pants='#1b5e20'), '受付の人', 'in_hallstaff'),
                       npc('fan3', 9, 4, 'left', look('#795548', '#aed581', pants='#33691e'), '森のステージのファン', 'in_fan3'), plant=True)),
    dict(bld='ranger', town='town3', name='森の案内所', bgm='town3', w=11, h=8, theme='cabin',
         rects=[],
         objects=[deco('map', 1, 'mapwall', '森の地図', 'in_forestmap', w=3),
                  deco('clock', 5, 'clock', '時計', 'in_clock'),
                  deco('win', 7, 'window', '窓', 'in_window', w=2, color='#6b8e23'),
                  deco('paint', 9, 'painting', '森の絵', 'in_painting'),
                  obj('counter', 4, 3, 'counter', '受付', {'job': 'nature'}, w=3),
                  obj('specimen', 1, 2, 'specimen', '標本のケース', T('in_specimen'), w=2),
                  obj('shelf', 7, 2, 'shelf', '図かんのたな', T('in_rangershelf'), w=2),
                  obj('stove', 9, 2, 'woodstove', 'まきストーブ', T('in_woodstove')),
                  obj('bench', 1, 4, 'bench', 'ベンチ', T('in_bench2'), w=2),
                  obj('plant1', 1, 6, 'plant', '森の草花', T('in_forestplant')),
                  obj('plant2', 9, 6, 'plant', '森の草花', T('in_forestplant'))],
         npcs=[npc('rangerstaff', 5, 2, 'down', look('#5a3a1a', '#689f38', skin='#e0b48a', pants='#3e2723', hat='#33691e'), '案内所の人', 'in_rangerstaff')]),
]

# かざり・家具の言葉
TALK_MORE = {
    'in_window': '窓から外が見える。いい天気だ。',
    'in_clock': '時計の針が、カチカチと動いている。',
    'in_poster': 'かっこいいモンスターのポスターだ。',
    'in_cuposter': '大会のポスターだ。「優勝めざして、いざ勝負！」',
    'in_scoreboard': '電光掲示板だ。大会の日は、ここに対戦する選手が映るらしい。',
    'in_spotlight': '会場を照らすライトだ。まぶしい！',
    'in_packstand': 'パックが山のように積んである。どれにしようかな？',
    'in_chair': 'いすだ。すわって対戦できる。',
    'in_pigeonhole': '手紙がたくさん仕分けしてある。町じゅうの家あてだ。',
    'in_calendar': 'カレンダーに、星まつりの日がしるしてある。',
    'in_scale': '荷物のおもさをはかる、はかりだ。',
    'in_mailbox': '赤いポストだ。手紙を出すと、ここから町じゅうへ届けられる。',
    'in_fridge': '冷ぞう庫だ。……勝手に開けるのはやめておこう。',
    'in_vase': 'きれいな花がかざってある。',
    'in_painting': 'すてきな絵がかざってある。',
    'in_lamp': 'やわらかい光のスタンドだ。',
    'in_sofa': 'ふかふかのソファだ。すわりたくなる。',
    'in_hangscroll': '山と月の掛け軸だ。おじいさんのお気に入りらしい。',
    'in_kotatsu': 'こたつの上に、みかんがある。あったかそう……。',
    'in_d4_shelf': '種の袋がたくさん並んでいる。',
    'in_tv': 'テレビでカードバトルの番組をやっている！',
    'in_banner': 'カラフルな旗が飾ってある。お店はいつもにぎやかだ。',
    'in_conveyor': 'ベルトコンベアの上を、荷物が流れていく。',
    'in_menuboard': 'お品書きの札だ。しょうゆ・みそ・しお……どれもおいしそう。',
    'in_noren': '台所の入口ののれんだ。おいしそうなにおいがする。',
    'in_stove': '大なべで、スープがぐつぐつ煮えている。',
    'in_fashionposter': 'おしゃれな服のポスターだ。',
    'in_mannequin': 'マネキンが、新しい服を着ている。',
    'in_fitting': '試着室だ。カーテンがしまっている。',
    'in_woodstove': 'まきストーブが、パチパチと燃えている。あったかい。',
    'in_specimen': '森で見つかった葉っぱや虫の標本だ。',
    'in_rangershelf': '植物や虫の図かんが並んでいる。',
    'in_bench2': '木のベンチだ。森を歩いたあとにひと休みできる。',
}


# 室内で話す言葉（このゲームのオリジナル）
TALK = {
    'in_clerk': '「カードのことなら何でも聞いてね！」',
    'in_showcase': 'ガラスのケースの中に、キラキラのカードが並んでいる。',
    'in_showcase2': '「本日入荷！」の札がついたカードが並んでいる。',
    'in_playtable': '対戦用のテーブルだ。カードのあとが少し残っている。',
    'in_plant': '葉っぱがつやつやしている。毎日お水をもらっているみたい。',
    'in_shopkid': [('カード好きの子', '新しいパック、何が入ってるかな？ 1パックだけ…いや、2パック買っちゃおうかな！')],
    'in_trophy': 'これまでの大会のトロフィーが並んでいる。いつかここに自分の名前を……！',
    'in_bench': '観客席だ。大会の日は人でいっぱいになる。',
    'in_hallstaff': '「大会の受付はこちらです」',
    'in_fan1': [('大会ファン', 'ここで優勝すると、にぎわい通りへのバスに乗れるようになるんだって！')],
    'in_fan2': [('アリーナの常連', 'このアリーナでは、強い選手ほど守りがかたい。攻めるだけじゃ勝てないぞ。')],
    'in_fan3': [('森のステージのファン', '森の選手たちは、属性の相性をよく考えて戦うんだよ。')],
    'in_parcel': 'たくさんの荷物が積んである。あて名のシールがはってある。',
    'in_poststaff': '「配達のアルバイトはこちらで受け付けています」',
    'in_d1': [('さとうさん', 'あら、いらっしゃい。表札を見てくれたのね。さとうです。'), ('さとうさん', 'うちの子もカードが大好きでね。大会に出るなら応援するわよ！')],
    'in_d1_kitchen': 'おなべから、いいにおいがする。',
    'in_d1_shelf': '料理の本がたくさん並んでいる。',
    'in_d1_table': 'テーブルの上に、おやつのクッキーがある。',
    'in_d2': [('ピアノのお姉さん', 'ピアノの音、外まで聞こえてた？ 毎日練習しているの。'), ('ピアノのお姉さん', 'カードバトルも練習が大事でしょ？ どっちも続けるのがコツよ。')],
    'in_piano': 'ぴかぴかの黒いピアノだ。そっと鍵盤をおすと、ポーンと音が鳴った。',
    'in_d2_shelf': '楽譜がたくさん並んでいる。',
    'in_d3': [('ねこ好きのおじいさん', 'よく来たね。窓辺のねこは、うちのミケじゃよ。'), ('ねこ好きのおじいさん', 'ミケは日なたが大好きでのう。ぽかぽかの日は一日中寝ておる。')],
    'in_cat': 'ねこがまるくなって寝ている。……ゴロゴロと、のどを鳴らした。',
    'in_d3_shelf': 'ねこの写真がたくさん飾ってある。',
    'in_d3_kitchen': 'ねこのごはんのお皿がある。',
    'in_d3_table': 'あたたかいお茶がおいてある。',
    'in_d4': [('野菜づくりのおじさん', '庭のトマト、見てくれたかい？ 今年はよくできたんだ。'), ('野菜づくりのおじさん', '野菜もカードも、手をかけて育てるのが楽しいのさ。')],
    'in_d4_plant': '小さなはちに、野菜のなえが育っている。',
    'in_d4_crate': 'かごいっぱいの野菜だ。つやつやしておいしそう。',
    'in_d4_table': 'テーブルの上に、とれたてのトマトがある。',
    'in_d5_bro': [('カード好きの兄', 'いま妹とデッキの見せ合いをしてたんだ。'), ('カード好きの兄', '同じカードは3枚まで。ウルトラレアは1枚までだから、よく考えて入れるんだぞ。')],
    'in_d5_sis': [('カード好きの妹', 'わたしは魔法カードが好き！ ピンチの時に、いっきにひっくり返せるもん。')],
    'in_cardtable': 'テーブルの上にカードが広げてある。デッキを組んでいる最中みたいだ。',
    'in_d5_shelf': 'カードファイルがずらりと並んでいる。',
    'in_megaclerk': '「メガカードショップへようこそ！」',
    'in_megakid': [('対戦中の男の子', 'いま練習中！ 生け贄召喚のタイミングがむずかしいんだよなあ。')],
    'in_megagirl': [('カードを選ぶ女の子', 'パックにするか、単品で買うか……まよっちゃう！ 単品なら欲しいカードがすぐ手に入るんだよね。')],
    'in_whstaff': '「仕分けのアルバイトはこちらで受け付けています」',
    'in_ramen': [('ラーメン屋の大将', 'へいらっしゃい！ ……おっと、子どもはおうちでごはんを食べな！ お母さんが待ってるぞ。')],
    'in_ramenmaster': '「へいらっしゃい！」',
    'in_ramenguest': [('お客さん', 'ここのラーメンは、町でいちばんなんだ。……カードの話？ それなら商店街の会長にくわしいよ。')],
    'in_stool': '赤い丸いすだ。くるくる回る。',
    'in_boutique': [('お店の人', 'いらっしゃいませ。店長のマダム・ルルは、ただいま大会に出ていて留守なんです。'), ('お店の人', 'マダムはカードバトルもとっても強いんですよ。')],
    'in_boutiquestaff': '「いらっしゃいませ」',
    'in_rack': 'おしゃれな服がたくさんかかっている。',
    'in_mirror': '大きな鏡だ。自分の姿がうつっている。',
    'in_forestclerk': '「森のカード屋へようこそ」',
    'in_forestshelf': '木のたなに、どんぐりや木の実が飾ってある。',
    'in_forestplant': '森で見かける草花だ。いいかおりがする。',
    'in_forestmap': '森の地図だ。キラキラ光る場所に、しるしがついている。',
    'in_rangerstaff': '「自然探索のアルバイトはこちらで受け付けています」',
}
TALK.update(TALK_MORE)

# 奥の壁（y=0〜1）に付けてよいかざり
WALL_DECO = {'window', 'clock', 'poster', 'painting', 'hangscroll', 'calendar', 'menuboard', 'noren', 'banner',
             'scoreboard', 'pigeonhole', 'wallshelf', 'mapwall'}


def strip_old(text, first_key):
    """前に作った室内（ファイルの最後にまとめて入っている）を取りのぞく"""
    i = text.find(',\n    "' + first_key + '"')
    if i < 0:
        return text
    return text[:i] + '\n  }\n}\n'


def fmt(v):
    """このファイルの書き方（{ "x": 1 } のように空白をあける）に合わせる"""
    if isinstance(v, dict):
        return '{ ' + ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {fmt(x)}' for k, x in v.items()) + ' }' if v else '{}'
    if isinstance(v, list):
        return '[' + ', '.join(fmt(x) for x in v) + ']'
    return json.dumps(v, ensure_ascii=False)


def block(items, ind):
    if not items:
        return '[]'
    pad = ' ' * ind
    return '[\n' + ',\n'.join(pad + '  ' + fmt(i) for i in items) + '\n' + pad + ']'


def main():
    text = MAPS.read_text(encoding='utf-8')
    data = json.loads(text)
    if any(k.startswith('in_') for k in data['maps']):
        text = strip_old(text, 'in_' + INTERIORS[0]['bld'])
        data = json.loads(text)
        assert not any(k.startswith('in_') for k in data['maps']), '室内をうまく取りのぞけませんでした'
        print('前の室内を作り直します')
    blocks = []
    for it in INTERIORS:
        town = data['maps'][it['town']]
        b = next(x for x in town['buildings'] if x['id'] == it['bld'])
        mid = f"in_{it['bld']}"
        w, h = it['w'], it['h']
        ex = w // 2
        out = {'x': b['door']['x'], 'y': b['door']['y'] + 1}
        rects = [{'x': 1, 'y': 1, 'w': w - 2, 'h': 1, 't': 'W'}] + [{'x': x, 'y': y, 'w': rw, 'h': rh, 't': t} for (x, y, rw, rh, t) in it['rects']]
        rects.append({'x': ex, 'y': h - 1, 'w': 1, 'h': 1, 't': '_'})
        objs = it['objects'] + [obj('exit', ex, h - 1, 'doormat', '出口', {'warp': it['town'], 'tx': out['x'], 'ty': out['y']})]
        objs[-1]['walk'] = True
        m = {'name': it['name'], 'bgm': it['bgm'], 'indoor': True, 'w': w, 'h': h, 'fill': '_', 'border': 'W', 'theme': TH[it['theme']]}
        head = ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {fmt(v)}' for k, v in m.items())
        blocks.append(
            f'    "{mid}": {{\n      {head},\n      "rects": {block(rects, 6)},\n      "points": [],\n      "buildings": [],\n'
            f'      "objects": {block(objs, 6)},\n      "npcs": {block(it["npcs"], 6)},\n      "spawn": {fmt({"x": ex, "y": h - 2, "dir": "up"})}\n    }}'
        )
        # 町の建物の act を「中へ入る」に
        old = f'"id": "{it["bld"]}",'
        line = next(l for l in text.split('\n') if old in l)
        new_line = re.sub(r'"act": \{[^}]*\}', '"act": ' + fmt({'warp': mid, 'tx': ex, 'ty': h - 2, 'dir': 'up'}), line)
        text = text.replace(line, new_line)
        # 中の人・物がぶつかっていないか、出口から受付まで歩けるか
        cells = {}
        for o in objs:
            for yy in range(o['y'], o['y'] + o.get('h', 1)):
                for xx in range(o['x'], o['x'] + o.get('w', 1)):
                    assert (xx, yy) not in cells, (mid, o['id'], cells.get((xx, yy)))
                    cells[(xx, yy)] = o['id']
                    top = 0 if o['kind'] in WALL_DECO else 2
                    assert 1 <= xx <= w - 2 and top <= yy <= h - 1, (mid, o['id'], 'かべの中')
                    assert o['kind'] not in WALL_DECO or o['y'] == 0, (mid, o['id'], 'かざりは奥の壁に')
        for n in it['npcs']:
            assert (n['x'], n['y']) not in cells, (mid, n['id'])
            cells[(n['x'], n['y'])] = n['id']
        for o in objs:
            t = o['act'].get('talk')
            assert t is None or t in TALK, (mid, o['id'], t)
        for yy in range(3, h - 1):
            assert (ex, yy) not in cells or yy == 3, (mid, '出口から奥へ歩けない', yy, cells.get((ex, yy)))
    end = text.rstrip().rfind('}')
    end = text.rstrip()[:end].rstrip().rfind('}')  # "maps" を閉じる }
    text = text[:end].rstrip() + ',\n' + ',\n'.join(blocks) + '\n  }\n}\n'
    json.loads(text)
    MAPS.write_text(text, encoding='utf-8')

    st = strip_old(STORY.read_text(encoding='utf-8'), 'in_clerk')
    lines = []
    for k, v in TALK.items():
        ls = [{'s': s, 't': t} for s, t in v] if isinstance(v, list) else [{'s': '', 't': v}]
        lines.append(f'    {json.dumps(k)}: [{fmt({"lines": ls})}]')
    end = st.rstrip().rfind('}')
    end = st.rstrip()[:end].rstrip().rfind('}')
    st = st[:end].rstrip() + ',\n' + ',\n'.join(lines) + '\n  }\n}\n'
    json.loads(st)
    STORY.write_text(st, encoding='utf-8')
    print(f'室内 {len(INTERIORS)}か所・会話 {len(TALK)}件を足しました')


if __name__ == '__main__':
    main()
