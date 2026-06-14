# 洪荒：我腦內有小艾，天道化作手機

一款單檔網頁**視覺小說（VN）**。半導體工程師 Jack 帶著腦內 AI「小艾」穿越洪荒，天道核心化作一台手機與他綁定。兩人以工程思維（觀測 → 建模 → 驗證 → 修正）拆解洪荒玄學，小艾最終證成前所未有的「科學道」。

母題：**不逆天，只證明天也會有 bug。**

## 怎麼玩

直接用瀏覽器**雙擊 `index.html`** 即可（file:// 免架站）。
- 開場播放「混沌開天」片頭（可跳過 / 可解除靜音聽配樂）
- 標題畫面選 **序章** 或 **第一卷**
- 點畫面任意處（或空白鍵 / Enter）推進對話，遇到選擇就點按鈕
- 進度自動存檔，可「繼續」

> 部分瀏覽器在 file:// 下對動態載入較嚴格，本作已用 `<script>` 內嵌方式規避，雙擊即可正常遊玩。

## 目前內容

| 章節 | 場景 | 規模 |
|---|---|---|
| 序章 · 異數入洪荒 | 9 場 | 96 step |
| 第一卷 · 人族火種 | 7 場 | 698 step |

第二卷「巫妖大劫」製作中。

## 專案結構

```
honghuang-vn/
├─ index.html / engine.js / style.css   自製 VN 引擎
├─ script/
│   ├─ prologue.json        序章劇本（inline）
│   ├─ volume1.json         第一卷劇本（source of truth）
│   ├─ volume1.data.js      第一卷 file:// 載入用
│   ├─ scenes/              第一卷分場原稿
│   └─ volume1_outline.md   劇情大綱
├─ assets/  characters / backgrounds / items / ui   美術素材
└─ video/   intro_chaos.mp4   開場片頭
```

## 製作

- 引擎：純前端 HTML/CSS/JS，劇情用「step 序列」JSON 驅動
- 立繪 / 背景 / UI：gpt-image-2（國風玄幻半寫實 + 青藍科技清光）
- 片頭影片：Grok 影片生成
- 劇情：Claude
