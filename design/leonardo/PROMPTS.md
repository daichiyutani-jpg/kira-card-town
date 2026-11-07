# Leonardo AI 試作用プロンプト（代表6体）

作成：2026-11-07。方針は `docs/ART_DIRECTION.md`。

## 使い方
1. https://app.leonardo.ai を開いて、画像生成（Image Generation）を選ぶ。
2. 横長にする：比率を **4:3**（なければ 3:2 か 16:9）にする。
3. 下の「共通の後ろにつける文」を、各モンスターの文のうしろにつなげて貼る。「Negative Prompt」の欄があれば、「入れたくないもの」を貼る。
4. 1体につき2〜4枚つくり、いちばん良い1枚をダウンロードする。
5. ダウンロードした画像のファイル名を **カードID** にして（例 `f21.png`。`f21_2.jpg` のように後ろに何か付いていてもよい）、
   `kira-card-town/design/leonardo/inbox/` に入れる。
6. あとは取り込み（`python scripts/import-art.py`）をこちらで行う。

### 共通の後ろにつける文（2026-11-07 改訂）
文の先頭に `Original creature design: ` を付け、うしろに次をつなげる。
```
, epic fantasy trading card game illustration, Japanese anime fantasy art style, cel-shaded with painterly lighting, dynamic pose, dramatic rim lighting, detailed textures and materials, creature fills most of the frame, clear contrast with the background, clean image without any text, letters, numbers, signature, copyright mark, logo or watermark
```

### 試してわかったこと（2026-11-07・無料プラン・モデルAuto＝Lucid Origin）
- 1回の生成で8トークン・画像は1枚（「2枚」を選んでも1枚だった）。1日150トークンで約18体ぶん。同時に1件しか作れない。
- 「no text」だけでは、右下に作者名のような署名（例「© 2017 …」）や、翼に文字が入ることがある。**署名・文字の入った絵は使わない**（実在の作品に似ている可能性があるため）。上の改訂版の文で直った。
- 「runes（ルーン文字）」「engraved（刻まれた）」と書くと文字が出やすい。模様にしたい時は「plain」「geometric」と書く。
- 「drill horn」は円すいの角になりやすい（ドリルライノは2回ともドリルにならなかった）。

### 全143体でわかったこと（2026-11-08・Essential・Lucid Origin）
- 背景が真っ白になることがある → 共通の文の先頭に `, set inside a richly painted atmospheric scene with deep shadows and colored lighting` を足すと出なくなった。
- 画像のふちに白い帯が出ることがある → 取り込み時に自動で切る（scripts/arttrim.py）。
- 小判・盾の紋章・本に文字（漢字）が出やすい → 「plain smooth ... with no markings」「blank pages」と書く。
- 薄い透かし（URL）が出た例が1枚あった（d19）。下半分を拡大して見ること。
- 1枚目の結果のファイル名は「lucid-origin_」＋プロンプト先頭80字。fetch-cands.py は生成IDだけでURLを作れる（results-*.txt）。

### 入れたくないもの（Negative Prompt）
```
text, letters, logo, watermark, signature, card frame, border, chibi, toddler toy, simple flat shapes, round blob body, generic cute face, plain front-facing pose, blurry, low detail, extra limbs, deformed, cropped head
```

---

## f21 太陽竜ソルガドラ（炎・竜・UR）
特徴：①黒曜石の鱗に走る溶岩の亀裂 ②太陽のコロナのような金の角の冠 ③翼を広げて天へ火炎を吐く咆哮
```
Legendary sun dragon rearing up and roaring a torrent of golden fire toward the sky, low-angle heroic shot, obsidian-black scales split by glowing molten lava cracks, crown of curved golden horns radiating like a solar corona, huge wings with ember-orange translucent membranes spread wide, giant rising sun behind it, volcanic ridge at dawn, burning runic magic circle on the ground, sparks and heat haze, ultra rare legendary aura
```

## f01 ヒノコリス（炎・獣・N）
特徴：①炎そのものが渦を巻く大きな尾 ②耳先に燃える火の房 ③すすけた灰色の毛と琥珀色の鋭い目
```
Small fire squirrel spirit leaping between charred branches, dynamic side view in mid-jump, soot-grey fur with ember-orange belly, huge spiral tail made of living flame, burning tufts on the tips of its ears, sharp amber eyes, scorched forest at dusk with drifting embers, warm light from its own tail illuminating the fur
```

## w17 タイカイリュウ（水・海竜・SR）
特徴：①S字にうねる長い体 ②体側に並ぶ発光器官 ③半透明のひれ膜とえらのひれ、長いひげ
```
Colossal sea serpent dragon surging upward from the deep ocean, view from below, long S-shaped coiling body, translucent glassy scales, rows of glowing bioluminescent spots along its flanks, translucent fin membranes and gill frills, long flowing whiskers, glowing eyes, god rays piercing from the surface, bubbles and swirling currents, deep blue abyss
```

## e20 ドリルライノ（地・機械獣・SR）
特徴：①回転する角のドリル ②鋲打ちの重装甲板 ③背中の排気口から出る煙と赤い警告灯の目
```
Heavy armored mechanical rhinoceros charging straight at the viewer through a mine tunnel, three-quarter front perspective with strong foreshortening, giant spinning golden drill horn throwing sparks, riveted bronze and steel armor plates, smoking exhaust pipes on its back, red warning-light eyes, shattered rocks and dust flying, glowing crystal veins in the cave walls
```

## l21 黎明神アウロラ（光・女神・UR）
特徴：①結晶の羽根でできた翼 ②文字が刻まれた金の光輪 ③夜明けを呼ぶように広げた両腕と光る手のひら
```
Goddess of dawn floating above a sea of clouds at sunrise, arms spread wide with light blooming from her palms, wings made of crystal feather shards, golden halo engraved with glowing runes, long flowing hair blending gold into violet, white robes dissolving into light, divine sacred geometry circle behind her, pillars of light, serene closed-eye expression, sacred and majestic
```

## d20 デスサイズゴースト（闇・亡霊・SR）
特徴：①大鎌を振りかぶる瞬間 ②骨の仮面と細く光る緑の目 ③胸に巻いた鎖と錠前、霧に溶ける裂けた外套
```
Wraith reaper swinging a giant scythe mid-attack, low-angle shot, tattered hooded cloak dissolving into toxic green mist instead of legs, cracked bone mask with thin glowing green slit eyes, rusted chains and a padlock wrapped around its chest, skeletal hands, scythe blade trailing a ghostly afterimage, graveyard with dead trees under a thin crescent moon
```
