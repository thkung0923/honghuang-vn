/* ============================================================
   洪荒：我腦內有小艾，天道化作手機 — engine.js
   純前端視覺小說引擎（file:// 可直接開啟，無 fetch / import）
   v0.3 — 多劇本支援（序章 + 第一卷 + 第二卷），分開存檔，新 phone 事件
   ============================================================ */

'use strict';

/* ============================================================
   1. 劇本倉庫
   SCRIPTS['prologue'] = 序章（index.html inline）
   SCRIPTS['volume1']  = 第一卷（volume1.json 非同步載入）
   ============================================================ */
const SCRIPTS = {};
let volume1Status = 'pending'; // 'pending' | 'loading' | 'ready' | 'error'
let volume1LoadCallbacks = []; // pending callbacks while status === 'loading'
let volume2Status = 'pending'; // 'pending' | 'loading' | 'ready' | 'error'
let volume2LoadCallbacks = [];

/* 讀取 inline 序章 */
(function loadPrologue() {
  try {
    SCRIPTS['prologue'] = JSON.parse(document.getElementById('script-data').textContent);
  } catch (e) {
    console.error('[VN] 序章解析失敗', e);
    SCRIPTS['prologue'] = null;
  }
})();

/* 非同步嘗試載入第一卷（優先使用 window.VOLUME1_DATA，fallback XHR） */
function loadVolume1(callback) {
  if (volume1Status === 'ready') { callback(true); return; }
  if (volume1Status === 'error') { callback(false); return; }
  // If already loading, queue the callback instead of sending another XHR
  if (volume1Status === 'loading') { volume1LoadCallbacks.push(callback); return; }

  volume1Status = 'loading';
  volume1LoadCallbacks.push(callback);

  // 優先使用 <script> 預載的 window.VOLUME1_DATA（file:// 相容）
  if (typeof window !== 'undefined' && window.VOLUME1_DATA) {
    SCRIPTS['volume1'] = window.VOLUME1_DATA;
    volume1Status = 'ready';
    const cbs = volume1LoadCallbacks.splice(0);
    cbs.forEach(cb => cb(true));
    return;
  }

  // fallback：XHR（http:// 環境）
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'script/volume1.json', true);
  xhr.onload = function () {
    if (xhr.status === 200 || xhr.status === 0) { // status 0 = file://
      try {
        SCRIPTS['volume1'] = JSON.parse(xhr.responseText);
        volume1Status = 'ready';
        const cbs = volume1LoadCallbacks.splice(0);
        cbs.forEach(cb => cb(true));
      } catch (e) {
        console.warn('[VN] volume1.json 解析失敗', e);
        volume1Status = 'error';
        const cbs = volume1LoadCallbacks.splice(0);
        cbs.forEach(cb => cb(false));
      }
    } else {
      console.warn('[VN] volume1.json 載入失敗 status=' + xhr.status);
      volume1Status = 'error';
      const cbs = volume1LoadCallbacks.splice(0);
      cbs.forEach(cb => cb(false));
    }
  };
  xhr.onerror = function () {
    console.warn('[VN] volume1.json 無法存取（尚未製作或路徑不存在）');
    volume1Status = 'error';
    const cbs = volume1LoadCallbacks.splice(0);
    cbs.forEach(cb => cb(false));
  };

  try {
    xhr.send();
  } catch (e) {
    // 某些嚴格 file:// 環境會直接 throw
    console.warn('[VN] volume1.json XHR 例外', e);
    volume1Status = 'error';
    const cbs = volume1LoadCallbacks.splice(0);
    cbs.forEach(cb => cb(false));
  }
}

/* 非同步嘗試載入第二卷（優先使用 window.VOLUME2_DATA，fallback XHR） */
function loadVolume2(callback) {
  if (volume2Status === 'ready') { callback(true); return; }
  if (volume2Status === 'error') { callback(false); return; }
  if (volume2Status === 'loading') { volume2LoadCallbacks.push(callback); return; }

  volume2Status = 'loading';
  volume2LoadCallbacks.push(callback);

  // 優先使用 <script> 預載的 window.VOLUME2_DATA（file:// 相容）
  if (typeof window !== 'undefined' && window.VOLUME2_DATA) {
    SCRIPTS['volume2'] = window.VOLUME2_DATA;
    volume2Status = 'ready';
    const cbs = volume2LoadCallbacks.splice(0);
    cbs.forEach(cb => cb(true));
    return;
  }

  // fallback：XHR（http:// 環境）
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'script/volume2.json', true);
  xhr.onload = function () {
    if (xhr.status === 200 || xhr.status === 0) {
      try {
        SCRIPTS['volume2'] = JSON.parse(xhr.responseText);
        volume2Status = 'ready';
        const cbs = volume2LoadCallbacks.splice(0);
        cbs.forEach(cb => cb(true));
      } catch (e) {
        console.warn('[VN] volume2.json 解析失敗', e);
        volume2Status = 'error';
        const cbs = volume2LoadCallbacks.splice(0);
        cbs.forEach(cb => cb(false));
      }
    } else {
      volume2Status = 'error';
      const cbs = volume2LoadCallbacks.splice(0);
      cbs.forEach(cb => cb(false));
    }
  };
  xhr.onerror = function () {
    console.warn('[VN] volume2.json 無法存取（尚未製作或路徑不存在）');
    volume2Status = 'error';
    const cbs = volume2LoadCallbacks.splice(0);
    cbs.forEach(cb => cb(false));
  };

  try {
    xhr.send();
  } catch (e) {
    console.warn('[VN] volume2.json XHR 例外', e);
    volume2Status = 'error';
    const cbs = volume2LoadCallbacks.splice(0);
    cbs.forEach(cb => cb(false));
  }
}

/* ---------- 2. 當前執行中的劇本 ---------- */
let activeScriptKey = 'prologue'; // 'prologue' | 'volume1' | 'volume2'

function getActiveScript() { return SCRIPTS[activeScriptKey]; }
function getMeta()       { const s = getActiveScript(); return s ? s.meta       : {}; }
function getCharacters() { const s = getActiveScript(); return s ? s.characters : {}; }
function getScenes()     { const s = getActiveScript(); return s ? s.scenes     : {}; }

/* ---------- 3. 狀態 ---------- */
let currentScene = null;
let currentStep = 0;
let isTyping = false;
let isChoiceActive = false;
let typingInterval = null;
let fullText = '';
let phoneTimer = null;
let bgActiveLayer = 'b';

/* ---------- 4. SPRITE_MAP ---------- */
const SPRITE_MAP = { power: 'silhouette_power' };
function getSpriteFilename(key) { return SPRITE_MAP[key] || key; }

const TYPE_SPEED   = 28;
const PHONE_AUTO_MS = 1500;

/* ============================================================
   5. 存檔 / 讀檔 — 序章與第一卷分開 key
   ============================================================ */
const SAVE_KEYS = {
  prologue: 'honghuang-vn-save-prologue',
  volume1:  'honghuang-vn-save-volume1',
  volume2:  'honghuang-vn-save-volume2'
};
/* 向下相容：舊版存在 'honghuang-vn-save' 的讀取 */
const LEGACY_SAVE_KEY = 'honghuang-vn-save';

function getSaveKey(scriptKey) {
  return SAVE_KEYS[scriptKey] || ('honghuang-vn-save-' + scriptKey);
}

function saveGame() {
  try {
    localStorage.setItem(getSaveKey(activeScriptKey), JSON.stringify({
      sceneId:   currentScene,
      stepIndex: currentStep
    }));
  } catch (e) {}
}

function loadGame(scriptKey) {
  try {
    const key = getSaveKey(scriptKey || activeScriptKey);
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    // 向下相容：序章嘗試讀舊 key
    if ((scriptKey || activeScriptKey) === 'prologue') {
      const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
      return legacy ? JSON.parse(legacy) : null;
    }
    return null;
  } catch (e) { return null; }
}

function hasSave(scriptKey) {
  try {
    const key = getSaveKey(scriptKey || activeScriptKey);
    if (localStorage.getItem(key)) return true;
    if ((scriptKey || activeScriptKey) === 'prologue') {
      return !!localStorage.getItem(LEGACY_SAVE_KEY);
    }
    return false;
  } catch (e) { return false; }
}

function clearSave(scriptKey) {
  try {
    localStorage.removeItem(getSaveKey(scriptKey || activeScriptKey));
    if ((scriptKey || activeScriptKey) === 'prologue') {
      localStorage.removeItem(LEGACY_SAVE_KEY);
    }
  } catch (e) {}
}

/* ---------- DOM 快捷 ---------- */
const $ = (id) => document.getElementById(id);

/* ============================================================
   6. 標題畫面 init
   ============================================================ */
function initTitle() {
  const prologueMeta = SCRIPTS['prologue'] ? SCRIPTS['prologue'].meta : {};

  if (prologueMeta.title)   $('game-title').textContent   = prologueMeta.title;
  // 副標顯示通用標語，不依賴任何單一卷
  $('game-subtitle').textContent = '洪荒紀元 · 天道化作手機';
  if (prologueMeta.version) $('title-version').textContent = 'version ' + prologueMeta.version;

  // 序章「繼續」
  $('btn-continue').style.display = hasSave('prologue') ? 'block' : 'none';

  // 第一卷按鈕可見性（volume1Status 可能還是 pending，不影響顯示，先亮出來）
  updateVol1TitleBtn();

  // 第二卷按鈕可見性
  updateVol2TitleBtn();

  $('title-screen').style.display  = 'flex';
  $('title-screen').style.opacity  = '1';
  $('game-screen').style.display   = 'none';
  $('ending-screen').classList.remove('visible');
  $('ending-screen').style.display = 'none';
}

function updateVol1TitleBtn() {
  const btn = $('btn-volume1');
  if (!btn) return;

  if (volume1Status === 'error') {
    btn.disabled = true;
    btn.textContent = '第一卷：人族火種（製作中）';
    btn.style.opacity = '0.5';
    btn.style.cursor  = 'not-allowed';
    return;
  }

  btn.disabled = false;
  btn.textContent = '第一卷：人族火種';
  btn.style.opacity = '';
  btn.style.cursor  = '';

  // 第一卷「繼續」
  const hasSaveV1 = hasSave('volume1');
  const btnContV1 = $('btn-continue-v1');
  if (btnContV1) {
    btnContV1.style.display = (volume1Status === 'ready' && hasSaveV1) ? 'block' : 'none';
  }
}

function updateVol2TitleBtn() {
  const btn = $('btn-volume2');
  if (!btn) return;

  if (volume2Status === 'error') {
    btn.disabled = true;
    btn.textContent = '第二卷：巫妖大劫（製作中）';
    btn.style.opacity = '0.5';
    btn.style.cursor  = 'not-allowed';
    const btnContV2 = $('btn-continue-v2');
    if (btnContV2) btnContV2.style.display = 'none';
    return;
  }

  btn.disabled = false;
  btn.textContent = '第二卷：巫妖大劫';
  btn.style.opacity = '';
  btn.style.cursor  = '';

  const hasSaveV2 = hasSave('volume2');
  const btnContV2 = $('btn-continue-v2');
  if (btnContV2) {
    btnContV2.style.display = (volume2Status === 'ready' && hasSaveV2) ? 'block' : 'none';
  }
}

/* ============================================================
   7. 開始遊戲（通用入口）
   ============================================================ */
function startPrologue(fromSave) {
  activeScriptKey = 'prologue';
  _startGame(fromSave);
}

function startVolume1(fromSave) {
  if (volume1Status === 'pending' || volume1Status === 'loading') {
    // 還沒載過，先載再啟動
    setVol1BtnLoading(true);
    loadVolume1(function(ok) {
      setVol1BtnLoading(false);
      updateVol1TitleBtn();
      if (ok) {
        activeScriptKey = 'volume1';
        _startGame(fromSave);
      } else {
        alert('第一卷尚未製作完成，敬請期待！');
      }
    });
    return;
  }
  if (volume1Status === 'error') {
    alert('第一卷尚未製作完成，敬請期待！');
    return;
  }
  activeScriptKey = 'volume1';
  _startGame(fromSave);
}

function setVol1BtnLoading(loading) {
  const btn = $('btn-volume1');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.textContent = '載入中…';
  }
}

function startVolume2(fromSave) {
  if (volume2Status === 'pending' || volume2Status === 'loading') {
    setVol2BtnLoading(true);
    loadVolume2(function(ok) {
      setVol2BtnLoading(false);
      updateVol2TitleBtn();
      if (ok) {
        activeScriptKey = 'volume2';
        _startGame(fromSave);
      } else {
        alert('第二卷尚未製作完成，敬請期待！');
      }
    });
    return;
  }
  if (volume2Status === 'error') {
    alert('第二卷尚未製作完成，敬請期待！');
    return;
  }
  activeScriptKey = 'volume2';
  _startGame(fromSave);
}

function setVol2BtnLoading(loading) {
  const btn = $('btn-volume2');
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.textContent = '載入中…';
  }
}

function _startGame(fromSave) {
  const meta   = getMeta();
  const scenes = getScenes();

  const title = $('title-screen');
  title.style.opacity = '0';

  setTimeout(() => {
    title.style.display = 'none';

    const game = $('game-screen');
    game.style.display = 'block';
    game.classList.add('fade-active');

    resetStage();

    if (fromSave && hasSave(activeScriptKey)) {
      const save = loadGame(activeScriptKey);
      if (save && save.sceneId && scenes[save.sceneId]) {
        replayTo(save.sceneId, save.stepIndex || 0);
        return;
      }
    }

    const startId = (meta && meta.start) ? meta.start : Object.keys(scenes)[0];
    gotoScene(startId);
  }, 600);
}

/* 向下相容：舊版 onclick="startGame(false)" 呼叫 → 等同啟動序章 */
function startGame(fromSave) { startPrologue(fromSave); }

/* 清空舞台 */
function resetStage() {
  $('bg-a').style.backgroundImage = '';
  $('bg-b').style.backgroundImage = '';
  $('bg-a').classList.remove('visible');
  $('bg-b').classList.remove('visible');
  bgActiveLayer = 'b';

  $('sprite-layer').innerHTML = '';
  hideItem();

  const phone = $('phone-panel');
  phone.className = '';
  $('phone-label').textContent = '';

  $('dialog-box').classList.remove('visible');
  $('dialog-name').textContent = '';
  $('dialog-text').textContent = '';
  $('dialog-arrow').classList.remove('show');

  $('choice-layer').style.display = 'none';
  $('choice-layer').innerHTML = '';
  isChoiceActive = false;
  isTyping = false;
  if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
  if (phoneTimer)     { clearTimeout(phoneTimer);      phoneTimer = null; }
}

/* 讀檔重播 */
function replayTo(sceneId, targetStep) {
  const scenes = getScenes();
  currentScene = sceneId;
  const scene = scenes[sceneId];
  const stop = Math.min(targetStep, scene.steps.length);

  for (let i = 0; i < stop; i++) {
    const step = scene.steps[i];
    if      (step.bg     !== undefined) applyBgInstant(step.bg);
    else if (step.sprite !== undefined) applySpriteInstant(step.sprite);
    else if (step.item   !== undefined) handleItem(step);
    else if (step.phone  !== undefined) applyPhoneInstant(step);
  }

  currentStep = stop;
  processStep();
}

/* ============================================================
   8. 場景跳轉
   ============================================================ */
function gotoScene(id) {
  const scenes = getScenes();
  if (!scenes[id]) { showEnding(); return; }
  currentScene = id;
  currentStep  = 0;
  processStep();
}

/* ============================================================
   9. step 處理
   ============================================================ */

/* 所有合法的 phone 模式 */
const PHONE_MODES = ['boot', 'radar_alert', 'cloak_on', 'merit_gain', 'patch_unlock', 'calamity_alert'];

function processStep() {
  if (!currentScene) return;
  const scenes = getScenes();
  const scene  = scenes[currentScene];

  if (currentStep >= scene.steps.length) {
    if (scene.next) { gotoScene(scene.next); }
    else            { showEnding(); }
    return;
  }

  const step = scene.steps[currentStep];
  saveGame();

  if      (step.bg     !== undefined) { handleBg(step);     advanceStep(); }
  else if (step.sprite !== undefined) { handleSprite(step);  advanceStep(); }
  else if (step.item   !== undefined) { handleItem(step);    advanceStep(); }
  else if (step.who    !== undefined) { handleDialog(step);  /* 等點擊 */ }
  else if (step.phone  !== undefined) { handlePhone(step);   /* 自動 1.5s */ }
  else if (step.choice !== undefined) { handleChoice(step);  /* 等選擇 */ }
  else { advanceStep(); }
}

function advanceStep() {
  currentStep++;
  processStep();
}

/* ============================================================
   10. onAdvance（點擊 / Enter / 空白鍵）
   ============================================================ */
function onAdvance() {
  if (isChoiceActive) return;

  if (isTyping) {
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
    isTyping = false;
    $('dialog-text').textContent = fullText;
    $('dialog-arrow').classList.add('show');
    return;
  }

  advanceStep();
}

/* ============================================================
   11. handleBg
   ============================================================ */
function handleBg(step) {
  const targetId = (bgActiveLayer === 'a') ? 'b' : 'a';
  const target   = $('bg-' + targetId);
  const current  = $('bg-' + bgActiveLayer);

  const img = new Image();
  img.onload  = () => { target.style.backgroundImage = `url("${img.src}")`; crossfadeBg(target, current, targetId); };
  img.onerror = () => { target.style.backgroundImage  = fallbackBg(step.bg); crossfadeBg(target, current, targetId); };
  img.src = `assets/backgrounds/${step.bg}.png`;
}

function crossfadeBg(target, current, targetId) {
  target.classList.add('visible');
  if (current) current.classList.remove('visible');
  bgActiveLayer = targetId;
}

function applyBgInstant(bgName) {
  const targetId = (bgActiveLayer === 'a') ? 'b' : 'a';
  const target   = $('bg-' + targetId);
  const current  = $('bg-' + bgActiveLayer);
  target.style.transition = 'none';
  const img = new Image();
  img.onload  = () => { target.style.backgroundImage = `url("${img.src}")`; };
  img.onerror = () => { target.style.backgroundImage  = fallbackBg(bgName); };
  img.src = `assets/backgrounds/${bgName}.png`;
  target.style.backgroundImage = fallbackBg(bgName);
  target.classList.add('visible');
  if (current) current.classList.remove('visible');
  bgActiveLayer = targetId;
  requestAnimationFrame(() => { target.style.transition = ''; });
}

function fallbackBg(bgName) {
  switch (bgName) {
    case 'bg_chaos':
      return 'radial-gradient(circle at 50% 45%, #1b2030 0%, #11141d 55%, #0a0d14 100%)';
    case 'bg_starfield_dao':
      return 'radial-gradient(circle at 30% 25%, #1a2342 0%, #0e1428 50%, #07090f 100%)';
    case 'bg_primordial_land':
      return 'linear-gradient(to bottom, #16314a 0%, #1c4a3f 45%, #14271f 100%)';
    case 'bg_nuwa_creation':
      return 'radial-gradient(ellipse at 50% 30%, #2e1a3a 0%, #1a1028 60%, #0a0510 100%)';
    case 'bg_human_world':
      return 'linear-gradient(to bottom, #1e3a2e 0%, #2a4a1e 40%, #14281a 100%)';
    case 'bg_creation':
      return 'radial-gradient(ellipse at 50% 40%, #2a1f10 0%, #1a1208 55%, #0d0a04 100%)';
    case 'bg_tribe_day':
      return 'linear-gradient(to bottom, #3a4a2a 0%, #2a3a1a 50%, #1a2810 100%)';
    case 'bg_tribe_night':
      return 'linear-gradient(to bottom, #0d1a24 0%, #091218 55%, #050c10 100%)';
    case 'bg_merit_light':
      return 'radial-gradient(ellipse at 50% 20%, #3a2e10 0%, #1e1808 60%, #0d0e08 100%)';
    case 'bg_calamity':
      return 'radial-gradient(circle at 50% 60%, #2e1008 0%, #1a0804 55%, #0d0402 100%)';
    default:
      return 'linear-gradient(135deg, #0a0d14, #111827)';
  }
}

/* ============================================================
   12. handleSprite
   ============================================================ */
function handleSprite(step) {
  const layer = $('sprite-layer');
  const key   = step.sprite;
  const file  = getSpriteFilename(key);

  const old = layer.querySelectorAll('.sprite-img');
  old.forEach((el) => {
    el.classList.remove('visible');
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 520);
  });

  const img = document.createElement('img');
  img.className = 'sprite-img';
  img.alt = key;
  img.onerror = () => { img.style.display = 'none'; };
  img.src = `assets/characters/${file}.png`;
  layer.appendChild(img);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => img.classList.add('visible'));
  });
}

function applySpriteInstant(key) {
  const layer = $('sprite-layer');
  layer.innerHTML = '';
  const file = getSpriteFilename(key);
  const img  = document.createElement('img');
  img.className = 'sprite-img visible';
  img.style.transition = 'none';
  img.alt = key;
  img.onerror = () => { img.style.display = 'none'; };
  img.src = `assets/characters/${file}.png`;
  layer.appendChild(img);
  requestAnimationFrame(() => { img.style.transition = ''; });
}

/* ============================================================
   13. handleItem
   ============================================================ */
function handleItem(step) {
  const layer = $('item-layer');
  const img   = $('item-img');
  layer.classList.remove('placeholder');
  img.style.display = '';
  // ui_* assets live in assets/ui/, everything else in assets/items/
  const itemName = step.item;
  const itemPath = itemName.startsWith('ui_') || itemName.startsWith('ui/')
    ? `assets/ui/${itemName.replace(/^ui\//, '')}.png`
    : `assets/items/${itemName}.png`;
  img.onerror = () => {
    img.style.display = 'none';
    layer.classList.add('placeholder');
  };
  img.src = itemPath;
  img.style.animation = 'none';
  requestAnimationFrame(() => { img.style.animation = ''; });
  layer.style.display = 'flex';
}

function hideItem() {
  const layer = $('item-layer');
  layer.style.display = 'none';
  layer.classList.remove('placeholder');
}

/* ============================================================
   14. handleDialog —— 打字機
   ============================================================ */
function handleDialog(step) {
  const box    = $('dialog-box');
  const nameEl = $('dialog-name');
  const textEl = $('dialog-text');
  const arrow  = $('dialog-arrow');

  box.classList.add('visible');

  const characters = getCharacters();
  const ch = characters[step.who] || { name: step.who, color: '#e8eef5' };
  nameEl.textContent = ch.name || '';
  nameEl.style.color = ch.color || '#7fc8ff';
  nameEl.style.textShadow = `0 0 10px ${hexToGlow(ch.color)}`;

  fullText = step.text || '';
  textEl.textContent = '';
  arrow.classList.remove('show');

  if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }

  isTyping = true;
  let i = 0;
  typingInterval = setInterval(() => {
    if (i >= fullText.length) {
      clearInterval(typingInterval);
      typingInterval = null;
      isTyping = false;
      arrow.classList.add('show');
      return;
    }
    textEl.textContent += fullText.charAt(i);
    i++;
  }, TYPE_SPEED);
}

function hexToGlow(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return 'rgba(127,200,255,0.4)';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.45)`;
}

/* ============================================================
   15. handlePhone —— 支援 boot/radar_alert/cloak_on/merit_gain/patch_unlock
   ============================================================ */
function handlePhone(step) {
  const phone = $('phone-panel');
  const label = $('phone-label');

  phone.classList.add('active');
  // 移除所有模式 class
  PHONE_MODES.forEach(m => phone.classList.remove(m));

  const mode = step.phone;
  if (PHONE_MODES.includes(mode)) {
    void phone.offsetWidth; // 強制 reflow 重觸 animation
    phone.classList.add(mode);

    // merit_gain / patch_unlock 使用 icon
    updatePhoneIcon(mode, step.icon);
  } else {
    updatePhoneIcon(null, null);
  }

  label.textContent = step.label || '';

  if (phoneTimer) clearTimeout(phoneTimer);
  phoneTimer = setTimeout(() => {
    phoneTimer = null;
    advanceStep();
  }, PHONE_AUTO_MS);
}

/* 讀檔重播：瞬間套手機狀態 */
function applyPhoneInstant(step) {
  const phone = $('phone-panel');
  phone.classList.add('active');
  PHONE_MODES.forEach(m => phone.classList.remove(m));
  const mode = step.phone;
  if (PHONE_MODES.includes(mode)) {
    phone.classList.add(mode);
    updatePhoneIcon(mode, step.icon);
  } else {
    updatePhoneIcon(null, null);
  }
  $('phone-label').textContent = step.label || '';
}

/*
   根據 phone 模式更新面板 icon 顯示
   merit_gain  → assets/ui/ui_merit.png
   patch_unlock → assets/ui/ui_patch.png
   其他模式 → emoji（原有行為）
*/
function updatePhoneIcon(mode, customIcon) {
  const iconsEl = $('phone-icons');

  if (mode === 'merit_gain') {
    const src = customIcon || 'assets/ui/ui_merit.png';
    iconsEl.innerHTML = `<img class="phone-mode-icon" src="${src}" alt="merit"
      onerror="this.outerHTML='✦'">`;
  } else if (mode === 'patch_unlock') {
    const src = customIcon || 'assets/ui/ui_patch.png';
    iconsEl.innerHTML = `<img class="phone-mode-icon" src="${src}" alt="patch"
      onerror="this.outerHTML='⬡'">`;
  } else if (mode === 'calamity_alert') {
    const src = customIcon || 'assets/ui/ui_calamity.png';
    iconsEl.innerHTML = `<img class="phone-mode-icon calamity-icon" src="${src}" alt="calamity"
      onerror="this.outerHTML='<span class=\\'calamity-fallback-icon\\'>⚠</span>'">`;
  } else {
    // 預設 emoji
    iconsEl.textContent = '⚡ 📡 🌙';
  }
}

/* ============================================================
   16. handleChoice
   ============================================================ */
function handleChoice(step) {
  isChoiceActive = true;
  const layer = $('choice-layer');
  layer.innerHTML = '';
  $('dialog-arrow').classList.remove('show');

  const scenes = getScenes();
  step.choice.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = opt.text;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectChoice(opt.goto);
    });
    layer.appendChild(btn);
  });

  layer.style.display = 'flex';
}

function selectChoice(goto) {
  isChoiceActive = false;
  const layer  = $('choice-layer');
  const scenes = getScenes();
  layer.style.display = 'none';
  layer.innerHTML = '';

  if (goto && scenes[goto]) {
    gotoScene(goto);
  } else {
    const scene = scenes[currentScene];
    if (scene && scene.next) gotoScene(scene.next);
    else showEnding();
  }
}

/* ============================================================
   17. showEnding —— 顯示結局畫面，按當前劇本填入文字
   ============================================================ */
function showEnding() {
  clearSave(activeScriptKey);

  const game   = $('game-screen');
  const ending = $('ending-screen');

  game.style.transition = 'opacity 0.8s ease';
  game.style.opacity    = '0';

  setTimeout(() => {
    game.style.display  = 'none';
    game.style.opacity  = '1';

    // 依劇本更新結局畫面文字
    const meta = getMeta();
    if (activeScriptKey === 'prologue') {
      $('ending-title').textContent = '序章完';
      $('ending-sub').textContent   = '異數，已在洪荒落腳。';
      // 隱藏「進入第二卷」按鈕（序章結局只顯示進入第一卷）
      const btnEnterV2Prologue = $('btn-enter-v2');
      if (btnEnterV2Prologue) btnEnterV2Prologue.style.display = 'none';
      // 顯示「進入第一卷」按鈕
      const btnEnterV1 = $('btn-enter-v1');
      if (btnEnterV1) {
        if (volume1Status === 'ready') {
          btnEnterV1.style.display = 'inline-block';
        } else if (volume1Status === 'error') {
          btnEnterV1.style.display    = 'inline-block';
          btnEnterV1.disabled         = true;
          btnEnterV1.textContent      = '第一卷製作中 …';
          btnEnterV1.style.opacity    = '0.5';
          btnEnterV1.style.cursor     = 'not-allowed';
        } else {
          // pending 或 loading — 嘗試載入後決定
          btnEnterV1.style.display    = 'inline-block';
          btnEnterV1.textContent      = '載入中 …';
          btnEnterV1.disabled         = true;
          loadVolume1(function(ok) {
            if (ok) {
              btnEnterV1.disabled      = false;
              btnEnterV1.textContent   = '進入第一卷 ▶';
              btnEnterV1.style.opacity = '';
              btnEnterV1.style.cursor  = '';
            } else {
              btnEnterV1.textContent   = '第一卷製作中 …';
              btnEnterV1.style.opacity = '0.5';
            }
          });
        }
      }
    } else if (activeScriptKey === 'volume1') {
      $('ending-title').textContent = '第一卷完';
      $('ending-sub').textContent   = (meta && meta.endingText) || '人族火種，已在洪荒燃起。';
      const btnEnterV1 = $('btn-enter-v1');
      if (btnEnterV1) btnEnterV1.style.display = 'none';

      // 顯示「進入第二卷」按鈕
      const btnEnterV2 = $('btn-enter-v2');
      if (btnEnterV2) {
        if (volume2Status === 'ready') {
          btnEnterV2.style.display  = 'inline-block';
          btnEnterV2.disabled       = false;
          btnEnterV2.textContent    = '進入第二卷 ▶';
          btnEnterV2.style.opacity  = '';
          btnEnterV2.style.cursor   = '';
        } else if (volume2Status === 'error') {
          btnEnterV2.style.display  = 'inline-block';
          btnEnterV2.disabled       = true;
          btnEnterV2.textContent    = '第二卷製作中 …';
          btnEnterV2.style.opacity  = '0.5';
          btnEnterV2.style.cursor   = 'not-allowed';
        } else {
          // pending / loading — 嘗試載入後決定
          btnEnterV2.style.display  = 'inline-block';
          btnEnterV2.textContent    = '載入中 …';
          btnEnterV2.disabled       = true;
          loadVolume2(function(ok) {
            if (ok) {
              btnEnterV2.disabled     = false;
              btnEnterV2.textContent  = '進入第二卷 ▶';
              btnEnterV2.style.opacity = '';
              btnEnterV2.style.cursor  = '';
            } else {
              btnEnterV2.textContent  = '第二卷製作中 …';
              btnEnterV2.style.opacity = '0.5';
            }
          });
        }
      }
    } else if (activeScriptKey === 'volume2') {
      $('ending-title').textContent = '第二卷序章完';
      $('ending-sub').textContent   = (meta && meta.endingText) || '大劫將至，棋局已開。';
      const btnEnterV1 = $('btn-enter-v1');
      if (btnEnterV1) btnEnterV1.style.display = 'none';
      const btnEnterV2 = $('btn-enter-v2');
      if (btnEnterV2) btnEnterV2.style.display = 'none';
    } else {
      $('ending-title').textContent = '完';
      $('ending-sub').textContent   = '';
      const btnEnterV1 = $('btn-enter-v1');
      if (btnEnterV1) btnEnterV1.style.display = 'none';
      const btnEnterV2 = $('btn-enter-v2');
      if (btnEnterV2) btnEnterV2.style.display = 'none';
    }

    ending.style.display = 'flex';
    ending.classList.add('visible');
  }, 800);
}

/* 回到標題 */
function backToTitle() {
  const ending = $('ending-screen');
  ending.classList.remove('visible');
  setTimeout(() => {
    ending.style.display = 'none';
    resetStage();
    currentScene = null;
    currentStep  = 0;
    initTitle();
  }, 700);
}

/* 從結局進入第一卷 */
function enterVolume1FromEnding() {
  const ending = $('ending-screen');
  ending.classList.remove('visible');
  setTimeout(() => {
    ending.style.display = 'none';
    resetStage();
    currentScene = null;
    currentStep  = 0;
    startVolume1(false);
  }, 700);
}

/* 從結局進入第二卷 */
function enterVolume2FromEnding() {
  const ending = $('ending-screen');
  ending.classList.remove('visible');
  setTimeout(() => {
    ending.style.display = 'none';
    resetStage();
    currentScene = null;
    currentStep  = 0;
    startVolume2(false);
  }, 700);
}

/* ============================================================
   18. 事件綁定
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // 在 DOMContentLoaded 時就嘗試預載 volume1（背景非阻塞）
  loadVolume1(function(ok) {
    // 更新標題按鈕狀態（如果標題還在顯示）
    updateVol1TitleBtn();
    // 若結局畫面正在顯示且是序章，嘗試更新進入第一卷按鈕
    const btnEnterV1 = $('btn-enter-v1');
    if (btnEnterV1 && $('ending-screen').classList.contains('visible') && activeScriptKey === 'prologue') {
      if (ok) {
        btnEnterV1.disabled      = false;
        btnEnterV1.textContent   = '進入第一卷 ▶';
        btnEnterV1.style.opacity = '';
        btnEnterV1.style.cursor  = '';
      }
    }
  });

  // 在 DOMContentLoaded 時嘗試預載 volume2（背景非阻塞）
  loadVolume2(function(ok) {
    updateVol2TitleBtn();
    // 若結局畫面正在顯示且是第一卷，嘗試更新進入第二卷按鈕
    const btnEnterV2 = $('btn-enter-v2');
    if (btnEnterV2 && $('ending-screen').classList.contains('visible') && activeScriptKey === 'volume1') {
      if (ok) {
        btnEnterV2.disabled      = false;
        btnEnterV2.textContent   = '進入第二卷 ▶';
        btnEnterV2.style.opacity = '';
        btnEnterV2.style.cursor  = '';
      }
    }
  });

  /* ============================================================
     片頭影片控制邏輯
     ============================================================ */
  const INTRO_KEY = 'honghuang-vn-intro-seen';
  let finishIntroFired = false;
  let introFallbackTimer = null;

  // 喇叭按鈕只綁一次
  (function bindMuteBtn() {
    const video   = $('intro-video');
    const muteBtn = $('intro-mute-btn');
    if (video && muteBtn) {
      muteBtn.addEventListener('click', () => {
        video.muted = !video.muted;
        muteBtn.textContent = video.muted ? '🔇' : '🔊';
      });
    }
  })();

  function hideIntroScreen() {
    const screen = $('intro-screen');
    if (screen) screen.style.display = 'none';
  }

  function finishIntro() {
    if (finishIntroFired) return;
    finishIntroFired = true;

    if (introFallbackTimer) { clearTimeout(introFallbackTimer); introFallbackTimer = null; }

    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) {}

    const video  = $('intro-video');
    const screen = $('intro-screen');

    if (video) { try { video.pause(); } catch (e) {} }
    if (screen) { screen.classList.add('fade-out'); }

    setTimeout(() => {
      if (screen) screen.style.display = 'none';
      initTitle();
    }, 800);
  }

  function playIntro() {
    const video   = $('intro-video');
    const skipBtn = $('intro-skip-btn');
    const muteBtn = $('intro-mute-btn');

    if (!video) { finishIntro(); return; }

    video.addEventListener('ended', finishIntro, { once: true });
    video.addEventListener('error', finishIntro, { once: true });

    // 3500ms fallback：若影片未能開始播放
    introFallbackTimer = setTimeout(() => {
      if (video.readyState < 3) { finishIntro(); }
    }, 3500);

    if (skipBtn) { skipBtn.addEventListener('click', finishIntro, { once: true }); }

    video.play().catch(() => { finishIntro(); });
  }

  function replayIntro() {
    const screen  = $('intro-screen');
    const video   = $('intro-video');
    const muteBtn = $('intro-mute-btn');
    const title   = $('title-screen');

    try { localStorage.removeItem(INTRO_KEY); } catch (e) {}

    // 隱藏標題畫面
    if (title) {
      title.style.opacity = '0';
      setTimeout(() => { title.style.display = 'none'; }, 800);
    }

    // 重置 intro-screen
    if (screen) {
      screen.classList.remove('fade-out');
      screen.style.display = 'flex';
    }

    // 重置影片
    if (video) {
      video.currentTime = 0;
      video.muted = true;
    }

    // 重置喇叭圖示
    if (muteBtn) { muteBtn.textContent = '🔇'; }

    // 重置 flag
    finishIntroFired = false;

    // 重新綁定所有 intro 事件
    playIntro();
  }

  // 掛到 window 供 onclick 呼叫
  window.replayIntro = replayIntro;

  // 決定是否播片頭
  let seenIntro = false;
  try { seenIntro = !!localStorage.getItem(INTRO_KEY); } catch (e) {}

  if (seenIntro) {
    hideIntroScreen();
    initTitle();
  } else {
    playIntro();
  }

  // 點擊推進
  document.addEventListener('click', (e) => {
    if (e.target.closest('#choice-layer'))  return;
    if (e.target.closest('#title-screen'))  return;
    if (e.target.closest('#ending-screen')) return;
    if (e.target.closest('#phone-panel'))   return;
    if ($('game-screen').style.display === 'none') return;
    onAdvance();
  });

  // 鍵盤推進
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if ($('game-screen').style.display === 'none') return;
      e.preventDefault();
      onAdvance();
    }
  });
});

/* 掛到 window（嚴格模式 inline onclick 保險） */
window.startGame              = startGame;
window.startPrologue          = startPrologue;
window.startVolume1           = startVolume1;
window.startVolume2           = startVolume2;
window.backToTitle            = backToTitle;
window.enterVolume1FromEnding = enterVolume1FromEnding;
window.enterVolume2FromEnding = enterVolume2FromEnding;
