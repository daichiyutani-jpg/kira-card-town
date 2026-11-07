"""建物の中（室内マップ）を作る。

使い方（kira-card-town フォルダで）:
  python scripts/gen-interiors.py          # maps.json と story.json に室内を足す（もう入っていれば何もしない）

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

# 室内の決まり：外周は壁、上から2段目も壁（奥の壁）。出口は下の真ん中。
INTERIORS = [
    # ---- ひだまり町
    dict(bld='shop1', town='town1', name='カードショップ ひだまり', bgm='shop', w=11, h=9, floor='g',
         rects=[(5, 4, 1, 4, 'k')],
         objects=[obj('counter', 4, 3, 'counter', 'レジ', {'shop': 'shop1'}, w=3),
                  obj('case1', 1, 2, 'showcase', 'ショーケース', T('in_showcase'), w=2),
                  obj('case2', 8, 2, 'showcase', 'ショーケース', T('in_showcase'), w=2),
                  obj('table1', 2, 6, 'table', '対戦テーブル', T('in_playtable')),
                  obj('table2', 8, 6, 'table', '対戦テーブル', T('in_playtable')),
                  obj('plant1', 1, 7, 'plant', '観葉植物', T('in_plant')),
                  obj('plant2', 9, 7, 'plant', '観葉植物', T('in_plant'))],
         npcs=[npc('clerk', 5, 2, 'down', look('#2f8f5b', '#69c28e', pants='#3b4a6b'), 'ミドリ店長', 'in_clerk'),
               npc('shopkid', 8, 5, 'down', look('#5a3a1a', '#ff8a65', pants='#455a64'), 'カード好きの子', 'in_shopkid')]),
    dict(bld='hall1', town='town1', name='ひだまり大会会場', bgm='cup', w=13, h=10, floor='g',
         rects=[(6, 2, 1, 7, 'k')],
         objects=[obj('counter', 5, 3, 'counter', '受付', {'cup': 'cup1'}, w=3),
                  obj('trophy1', 1, 2, 'trophy', 'トロフィーの棚', T('in_trophy'), w=3),
                  obj('trophy2', 9, 2, 'trophy', 'トロフィーの棚', T('in_trophy'), w=3),
                  obj('bench1', 2, 5, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench2', 8, 5, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench3', 2, 7, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench4', 8, 7, 'bench', '観客席', T('in_bench'), w=3)],
         npcs=[npc('hallstaff1', 6, 2, 'down', look('#3a2a1a', '#8e44ad', pants='#2c3e50'), '受付の人', 'in_hallstaff'),
               npc('fan1', 9, 4, 'left', look('#c0392b', '#f1c40f', pants='#2c3e50'), '大会ファン', 'in_fan1')]),
    dict(bld='post', town='town1', name='ひだまり配達センター', bgm='town1', w=11, h=9, floor='g',
         rects=[],
         objects=[obj('counter', 4, 3, 'counter', '受付', {'job': 'delivery'}, w=3),
                  obj('crate1', 1, 2, 'crate', '荷物', T('in_parcel'), w=2, h=2),
                  obj('crate2', 8, 2, 'crate', '荷物', T('in_parcel'), w=2),
                  obj('crate3', 9, 5, 'crate', '荷物', T('in_parcel'), h=2),
                  obj('plant1', 1, 7, 'plant', '観葉植物', T('in_plant'))],
         npcs=[npc('poststaff', 5, 2, 'down', look('#222', '#27ae60', pants='#1e5631', hat='#1e5631'), '配達センターの人', 'in_poststaff')]),
    dict(bld='d1', town='town1', name='赤い屋根の家', bgm='home', w=9, h=7, floor='_',
         rects=[(3, 3, 3, 2, 'k')],
         objects=[obj('kitchen', 1, 2, 'kitchen', '台所', T('in_d1_kitchen'), w=2),
                  obj('shelf', 6, 2, 'shelf', '本だな', T('in_d1_shelf'), w=2),
                  obj('table', 4, 3, 'table', 'テーブル', T('in_d1_table'))],
         npcs=[npc('satou', 6, 4, 'left', look('#6d4c41', '#e57373', pants='#5d4037', apron='#ffffff'), 'さとうさん', 'in_d1')]),
    dict(bld='d2', town='town1', name='青い屋根の家', bgm='home', w=9, h=7, floor='_',
         rects=[(2, 4, 5, 1, 'k')],
         objects=[obj('piano', 4, 2, 'piano', 'ピアノ', T('in_piano'), w=3),
                  obj('shelf', 1, 2, 'shelf', '楽譜のたな', T('in_d2_shelf'), w=2),
                  obj('plant', 7, 4, 'plant', '観葉植物', T('in_plant'))],
         npcs=[npc('pianist', 5, 3, 'up', look('#1a237e', '#90caf9', pants='#1565c0'), 'ピアノのお姉さん', 'in_d2')]),
    dict(bld='d3', town='town1', name='黄色い屋根の家', bgm='home', w=9, h=7, floor='_',
         rects=[(1, 4, 3, 2, 'k')],
         objects=[obj('cat', 2, 4, 'cat', 'ねこ', T('in_cat')),
                  obj('shelf', 1, 2, 'shelf', '本だな', T('in_d3_shelf'), w=2),
                  obj('kitchen', 6, 2, 'kitchen', '台所', T('in_d3_kitchen'), w=2),
                  obj('table', 6, 4, 'table', 'テーブル', T('in_d3_table'))],
         npcs=[npc('catgrandpa', 4, 3, 'down', look('#e0e0e0', '#ffca28', skin='#efc9a0', pants='#6d4c41'), 'ねこ好きのおじいさん', 'in_d3')]),
    dict(bld='d4', town='town1', name='緑の屋根の家', bgm='home', w=9, h=7, floor='_',
         rects=[],
         objects=[obj('plant1', 1, 2, 'plant', 'トマトのなえ', T('in_d4_plant')),
                  obj('plant2', 2, 2, 'plant', 'きゅうりのなえ', T('in_d4_plant')),
                  obj('plant3', 7, 2, 'plant', 'なすのなえ', T('in_d4_plant')),
                  obj('crate', 6, 4, 'crate', '野菜のかご', T('in_d4_crate')),
                  obj('table', 2, 4, 'table', 'テーブル', T('in_d4_table'))],
         npcs=[npc('farmer', 4, 2, 'down', look('#5d4037', '#66bb6a', skin='#e0b48a', pants='#3e2723', hat='#f9a825'), '野菜づくりのおじさん', 'in_d4')]),
    dict(bld='d5', town='town1', name='紫の屋根の家', bgm='home', w=9, h=7, floor='_',
         rects=[(2, 2, 5, 3, 'k')],
         objects=[obj('table', 3, 3, 'table', 'カードを広げたテーブル', T('in_cardtable'), w=3),
                  obj('shelf', 6, 2, 'shelf', 'カードファイルのたな', T('in_d5_shelf'), w=2)],
         npcs=[npc('cardbro', 2, 3, 'right', look('#4a148c', '#ce93d8', pants='#311b92'), 'カード好きの兄', 'in_d5_bro'),
               npc('cardsis', 6, 3, 'left', look('#4a148c', '#f8bbd0', pants='#6a1b9a'), 'カード好きの妹', 'in_d5_sis')]),
    # ---- にぎわい通り
    dict(bld='shop2', town='town2', name='メガカードショップ にぎわい', bgm='shop', w=15, h=10, floor='g',
         rects=[(7, 4, 1, 5, 'k')],
         objects=[obj('counter', 6, 3, 'counter', 'レジ', {'shop': 'shop2'}, w=3),
                  obj('case1', 1, 2, 'showcase', 'ショーケース', T('in_showcase'), w=4),
                  obj('case2', 10, 2, 'showcase', 'ショーケース', T('in_showcase'), w=4),
                  obj('case3', 1, 5, 'showcase', 'ショーケース', T('in_showcase2'), w=2),
                  obj('case4', 12, 5, 'showcase', 'ショーケース', T('in_showcase2'), w=2),
                  obj('table1', 3, 7, 'table', '対戦テーブル', T('in_playtable')),
                  obj('table2', 11, 7, 'table', '対戦テーブル', T('in_playtable'))],
         npcs=[npc('megaclerk', 7, 2, 'down', look('#222', '#e67e22', pants='#2c3e50'), 'メガショップの店員', 'in_megaclerk'),
               npc('megakid', 4, 7, 'left', look('#3e2723', '#42a5f5', pants='#263238'), '対戦中の男の子', 'in_megakid'),
               npc('megagirl', 10, 4, 'down', look('#ad1457', '#fff59d', pants='#ad1457'), 'カードを選ぶ女の子', 'in_megagirl')]),
    dict(bld='hall2', town='town2', name='にぎわいアリーナ', bgm='cup', w=13, h=10, floor='g',
         rects=[(6, 2, 1, 7, 'k')],
         objects=[obj('counter', 5, 3, 'counter', '受付', {'cup': 'cup2'}, w=3),
                  obj('trophy1', 1, 2, 'trophy', 'トロフィーの棚', T('in_trophy'), w=3),
                  obj('trophy2', 9, 2, 'trophy', 'トロフィーの棚', T('in_trophy'), w=3),
                  obj('bench1', 2, 5, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench2', 8, 5, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench3', 2, 7, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench4', 8, 7, 'bench', '観客席', T('in_bench'), w=3)],
         npcs=[npc('hallstaff2', 6, 2, 'down', look('#3a2a1a', '#c0392b', pants='#2c3e50'), '受付の人', 'in_hallstaff'),
               npc('fan2', 3, 4, 'right', look('#f39c12', '#2980b9', pants='#2c3e50'), 'アリーナの常連', 'in_fan2')]),
    dict(bld='warehouse', town='town2', name='にぎわい倉庫', bgm='town2', w=13, h=10, floor='g',
         rects=[],
         objects=[obj('counter', 5, 3, 'counter', '受付', {'job': 'sorting'}, w=3),
                  obj('crate1', 1, 2, 'crate', '荷物の山', T('in_parcel'), w=3, h=2),
                  obj('crate2', 9, 2, 'crate', '荷物の山', T('in_parcel'), w=3, h=2),
                  obj('crate3', 1, 6, 'crate', '荷物の山', T('in_parcel'), w=2, h=2),
                  obj('crate4', 10, 6, 'crate', '荷物の山', T('in_parcel'), w=2, h=2)],
         npcs=[npc('whstaff', 6, 2, 'down', look('#333', '#7f8c8d', skin='#e0b48a', pants='#34495e', hat='#ffc107'), '倉庫の人', 'in_whstaff')]),
    dict(bld='ramen', town='town2', name='ラーメン こがね', bgm='town2', w=11, h=8, floor='_',
         rects=[],
         objects=[obj('counter', 2, 3, 'counter', 'カウンター', T('in_ramen'), w=7),
                  obj('stool1', 2, 4, 'stool', 'いす', T('in_stool')),
                  obj('stool2', 4, 4, 'stool', 'いす', T('in_stool')),
                  obj('stool3', 6, 4, 'stool', 'いす', T('in_stool')),
                  obj('stool4', 8, 4, 'stool', 'いす', T('in_stool'))],
         npcs=[npc('ramenmaster', 5, 2, 'down', look('#222', '#ffffff', skin='#e0b48a', pants='#455a64'), 'ラーメン屋の大将', 'in_ramenmaster'),
               npc('ramenguest', 8, 5, 'up', look('#4e342e', '#78909c', pants='#37474f'), 'お客さん', 'in_ramenguest')]),
    dict(bld='cloth', town='town2', name='ブティック ルル', bgm='town2', w=9, h=8, floor='_',
         rects=[(2, 4, 5, 3, 'k')],
         objects=[obj('counter', 3, 3, 'counter', 'レジ', T('in_boutique'), w=3),
                  obj('rack1', 1, 2, 'rack', '服のラック', T('in_rack'), w=2),
                  obj('rack2', 6, 2, 'rack', '服のラック', T('in_rack'), w=2),
                  obj('mirror', 7, 5, 'mirror', '鏡', T('in_mirror'), h=2)],
         npcs=[npc('boutiquestaff', 4, 2, 'down', look('#e86b9a', '#fce4ec', pants='#e91e63'), 'お店の人', 'in_boutiquestaff')]),
    # ---- みどりの森町
    dict(bld='shop3', town='town3', name='森のカード屋 こもれび', bgm='shop', w=11, h=9, floor='_',
         rects=[(4, 4, 3, 4, 'k')],
         objects=[obj('counter', 4, 3, 'counter', 'レジ', {'shop': 'shop3'}, w=3),
                  obj('shelf', 1, 2, 'shelf', '木のたな', T('in_forestshelf'), w=2),
                  obj('case1', 8, 2, 'showcase', 'ショーケース', T('in_showcase'), w=2),
                  obj('table', 2, 5, 'table', '対戦テーブル', T('in_playtable')),
                  obj('plant1', 1, 7, 'plant', '森の草花', T('in_forestplant')),
                  obj('plant2', 9, 7, 'plant', '森の草花', T('in_forestplant'))],
         npcs=[npc('forestclerk', 5, 2, 'down', look('#6d4c2f', '#a1887f', skin='#efc9a0', pants='#4e342e', apron='#558b2f'), 'こもれびの店主', 'in_forestclerk')]),
    dict(bld='hall3', town='town3', name='みどりの森ステージ', bgm='cup', w=13, h=10, floor='_',
         rects=[(6, 2, 1, 7, 'k')],
         objects=[obj('counter', 5, 3, 'counter', '受付', {'cup': 'cup3'}, w=3),
                  obj('trophy1', 1, 2, 'trophy', 'トロフィーの棚', T('in_trophy'), w=3),
                  obj('trophy2', 9, 2, 'trophy', 'トロフィーの棚', T('in_trophy'), w=3),
                  obj('bench1', 2, 5, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench2', 8, 5, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench3', 2, 7, 'bench', '観客席', T('in_bench'), w=3),
                  obj('bench4', 8, 7, 'bench', '観客席', T('in_bench'), w=3),
                  obj('plant1', 1, 4, 'plant', '森の草花', T('in_forestplant')),
                  obj('plant2', 11, 4, 'plant', '森の草花', T('in_forestplant'))],
         npcs=[npc('hallstaff3', 6, 2, 'down', look('#3a2a1a', '#2e7d32', pants='#1b5e20'), '受付の人', 'in_hallstaff'),
               npc('fan3', 9, 4, 'left', look('#795548', '#aed581', pants='#33691e'), '森のステージのファン', 'in_fan3')]),
    dict(bld='ranger', town='town3', name='森の案内所', bgm='town3', w=11, h=8, floor='_',
         rects=[],
         objects=[obj('counter', 4, 3, 'counter', '受付', {'job': 'nature'}, w=3),
                  obj('board', 1, 2, 'board', '森の地図', T('in_forestmap'), w=2),
                  obj('plant1', 9, 2, 'plant', '森の草花', T('in_forestplant')),
                  obj('plant2', 1, 6, 'plant', '森の草花', T('in_forestplant')),
                  obj('plant3', 9, 6, 'plant', '森の草花', T('in_forestplant'))],
         npcs=[npc('rangerstaff', 5, 2, 'down', look('#5a3a1a', '#689f38', skin='#e0b48a', pants='#3e2723', hat='#33691e'), '案内所の人', 'in_rangerstaff')]),
]

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
        print('室内はもう入っています。何もしません。')
        return
    blocks = []
    for it in INTERIORS:
        town = data['maps'][it['town']]
        b = next(x for x in town['buildings'] if x['id'] == it['bld'])
        mid = f"in_{it['bld']}"
        w, h = it['w'], it['h']
        ex = w // 2
        out = {'x': b['door']['x'], 'y': b['door']['y'] + 1}
        rects = [{'x': 1, 'y': 1, 'w': w - 2, 'h': 1, 't': 'W'}] + [{'x': x, 'y': y, 'w': rw, 'h': rh, 't': t} for (x, y, rw, rh, t) in it['rects']]
        rects.append({'x': ex, 'y': h - 1, 'w': 1, 'h': 1, 't': it['floor']})
        objs = it['objects'] + [obj('exit', ex, h - 1, 'doormat', '出口', {'warp': it['town'], 'tx': out['x'], 'ty': out['y']})]
        objs[-1]['walk'] = True
        m = {'name': it['name'], 'bgm': it['bgm'], 'indoor': True, 'w': w, 'h': h, 'fill': it['floor'], 'border': 'W'}
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
                    assert 1 <= xx <= w - 2 and 2 <= yy <= h - 1, (mid, o['id'], 'かべの中')
        for n in it['npcs']:
            assert (n['x'], n['y']) not in cells, (mid, n['id'])
            cells[(n['x'], n['y'])] = n['id']
        for yy in range(3, h - 1):
            assert (ex, yy) not in cells or yy == 3, (mid, '出口から奥へ歩けない', yy, cells.get((ex, yy)))
    end = text.rstrip().rfind('}')
    end = text.rstrip()[:end].rstrip().rfind('}')  # "maps" を閉じる }
    text = text[:end].rstrip() + ',\n' + ',\n'.join(blocks) + '\n  }\n}\n'
    json.loads(text)
    MAPS.write_text(text, encoding='utf-8')

    st = STORY.read_text(encoding='utf-8')
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
