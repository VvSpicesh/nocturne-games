/**
 * v0.16 布局自动测试（浏览器内）
 * Geometry + Stress + Golden(maxDiffRatio=0.001) + Random×1000 + 截图 + HTML Report
 */
import { tileFace, tileName } from "./tiles.js";
import {
  initTableLayout,
  relayoutTable,
  clearFitCache,
  toggleDebugLayout,
  setDebugLayout,
} from "./table-layout.js?v=0.16.12";

/** 本地轻量造牌，避免整页拉取 render.js（副作用少、失败面小） */
function createTileElement(tile, className = "") {
  const el = document.createElement("div");
  el.className = `tile ${className}`;
  if (tile) {
    el.innerHTML = tileFace(tile);
    el.title = tileName(tile);
    el.dataset.id = tile.id;
  } else {
    el.classList.add("tile-back");
  }
  return el;
}

const MAX_DIFF_RATIO = 0.001;
const EPSILON = 0.5;
const GOLDEN_DB = "nocturne-layout-golden-v16";
const GOLDEN_STORE = "images";

const VIEWPORTS = [
  { id: "390x844", w: 390, h: 844 },
  { id: "844x390", w: 844, h: 390 },
  { id: "932x430", w: 932, h: 430 },
  { id: "1180x1240", w: 1180, h: 1240 },
  { id: "1280x800", w: 1280, h: 800 },
  { id: "1920x1080", w: 1920, h: 1080 },
];

const SUITS = ["w", "t", "b"];

const logEl = () => document.getElementById("log");
const stageEl = () => document.getElementById("stage");
const tableEl = () => document.getElementById("testTable");

let htmlToImage = null;
const results = [];
const shotMap = new Map();
let previewScenario = "stress";
let previewViewportId = "390x844";

function log(line) {
  const el = logEl();
  el.textContent += line + "\n";
  el.scrollTop = el.scrollHeight;
  console.log(line);
}

function tile(s, n, i = 0) {
  return { id: `${s}${n}-${i}-${Math.random().toString(36).slice(2, 7)}`, s, n };
}

function handTiles(n, face = false) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const t = tile(SUITS[i % 3], (i % 9) + 1, i);
    arr.push({ tile: t, face });
  }
  return arr;
}

function melds(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = SUITS[i % 3];
    const n = (i % 9) + 1;
    const typ = i % 4 === 3 ? "anGang" : "peng";
    const len = typ === "anGang" ? 4 : 3;
    out.push({
      type: typ,
      tiles: Array.from({ length: len }, (_, k) => tile(s, n, k + i * 10)),
    });
  }
  return out;
}

function discards(count, player) {
  return Array.from({ length: count }, (_, i) => ({
    player,
    tile: tile(SUITS[i % 3], (i % 9) + 1, 100 + i),
  }));
}

/** @typedef {'empty-melds'|'melds-4'|'discards-24'|'action-dock'|'fx'|'stress'|'reveal'} ScenarioId */

function scenarioConfig(id) {
  const base = {
    hands: [14, 13, 13, 13],
    face: [true, false, false, false],
    melds: [0, 0, 0, 0],
    discards: [0, 0, 0, 0],
    dock: false,
    fx: false,
    reveal: false,
  };
  switch (id) {
    case "empty-melds":
      return base;
    case "melds-4":
      return { ...base, melds: [4, 4, 4, 4], hands: [2, 1, 1, 1] };
    case "discards-24":
      return { ...base, discards: [24, 24, 24, 24] };
    case "action-dock":
      return { ...base, dock: true };
    case "fx":
      return { ...base, fx: true };
    case "reveal":
      return { ...base, face: [true, true, true, true], reveal: true };
    case "stress":
      return {
        hands: [2, 1, 1, 1],
        face: [true, true, true, true],
        melds: [4, 4, 4, 4],
        discards: [24, 24, 24, 24],
        dock: true,
        fx: true,
        reveal: true,
      };
    default:
      return base;
  }
}

function clearFx() {
  tableEl().querySelectorAll(".player-action-effect").forEach((n) => n.remove());
}

function fillInfo(index, name, handLen, missing) {
  const info = document.getElementById(`info-${index}`);
  const labels = ["自己", "上家", "对家", "下家"];
  info.innerHTML = `
    <div class="seat-id">
      <span class="seat-avatar">${index === 0 ? "🙂" : "🤖"}</span>
      <div class="seat-text">
        <div class="seat-label info-secondary">${labels[index]}</div>
        <div class="seat-name">${name}</div>
        <div class="seat-meta">
          <span class="info-tiles">${handLen}张</span>
          <span class="info-missing">缺${missing}</span>
        </div>
      </div>
    </div>`;
  info.classList.add("player-info");
  if (index === 1 || index === 3) info.classList.add("player-info-side");
}

function applyScenario(id) {
  const cfg = typeof id === "string" ? scenarioConfig(id) : id;
  clearFx();
  const dock = document.getElementById("actionDock");
  dock.classList.remove("show");
  dock.querySelector("#actionDockButtons").innerHTML = "";

  for (let p = 0; p < 4; p++) {
    const seat = document.getElementById(`seat-${p}`);
    seat.innerHTML = "";
    const hand = document.createElement("div");
    hand.className = "hand";
    if (p === 1) hand.classList.add("hand-vertical", "hand-left");
    if (p === 3) hand.classList.add("hand-vertical", "hand-right");
    handTiles(cfg.hands[p], cfg.face[p]).forEach(({ tile: t, face }) => {
      hand.appendChild(createTileElement(face ? t : null, "tile-small"));
    });
    seat.appendChild(hand);

    const mz = document.getElementById(`meld-${p}`);
    mz.innerHTML = "";
    melds(cfg.melds[p]).forEach((m) => {
      const g = document.createElement("div");
      g.className = "meld-group" + (m.type === "anGang" ? " meld-group-angang" : "");
      m.tiles.forEach((t, ti) => {
        if (m.type === "anGang" && !(p === 0 && ti === m.tiles.length - 1)) {
          g.appendChild(createTileElement(null, "tile-small"));
        } else {
          g.appendChild(createTileElement(t, "tile-small"));
        }
      });
      mz.appendChild(g);
    });

    const dz = document.getElementById(`discard-${p}`);
    dz.innerHTML = "";
    discards(cfg.discards[p], p).forEach((d) => {
      dz.appendChild(createTileElement(d.tile, "tile-discard"));
    });

    fillInfo(p, ["夜曲", "东风", "南鸟", "西岭"][p], cfg.hands[p], "万");
  }

  if (cfg.dock) {
    dock.classList.add("show");
    document.getElementById("actionDockText").textContent = "可碰 / 杠 / 胡";
    const btns = document.getElementById("actionDockButtons");
    ["碰", "杠", "胡", "过"].forEach((label) => {
      const b = document.createElement("button");
      b.className = "action-dock-button" + (label === "过" ? " pass" : "");
      b.innerHTML = `<span class="reaction-label">${label}</span>`;
      btns.appendChild(b);
    });
  }

  if (cfg.fx) {
    const overlay = tableEl().querySelector(".table-overlay");
    ["bottom", "left", "top", "right"].forEach((side, i) => {
      const el = document.createElement("div");
      el.className = `player-action-effect player-action-${side}`;
      el.innerHTML = `<span class="effect-label">${["碰", "杠", "胡", "过"][i]}</span>`;
      overlay.appendChild(el);
    });
  }

  clearFitCache();
  relayoutTable(tableEl());
}

function rectOf(sel) {
  const el = typeof sel === "string" ? tableEl().querySelector(sel) : sel;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 0.5 && r.height < 0.5) return null;
  return r;
}

function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) - EPSILON);
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) - EPSILON);
  return x * y;
}

function outside(inner, outer) {
  return (
    inner.left < outer.left - EPSILON ||
    inner.top < outer.top - EPSILON ||
    inner.right > outer.right + EPSILON ||
    inner.bottom > outer.bottom + EPSILON
  );
}

/** Layout Invariants */
function checkGeometry(viewportId, scenarioId) {
  const fails = [];
  const table = tableEl();
  const tableR = rectOf(table);
  if (!tableR) {
    fails.push("table missing");
    return fails;
  }

  const center = rectOf("#table-center");
  const pairs = [
    ["hand", "meld"],
    ["hand", "discard"],
    ["meld", "discard"],
  ];

  for (let p = 0; p < 4; p++) {
    const hand = rectOf(`#seat-${p} .hand`) || rectOf(`#seat-${p}`);
    const meld = rectOf(`#meld-${p}`);
    const disc = rectOf(`#discard-${p}`);
    const map = { hand, meld, discard: disc };

    for (const [a, b] of pairs) {
      const ra = map[a];
      const rb = map[b];
      if (!ra || !rb) continue;
      const area = overlapArea(ra, rb);
      if (area > 1) {
        fails.push(`${a}∩${b}@p${p} area=${area.toFixed(1)}`);
      }
    }
    if (meld && center) {
      const area = overlapArea(meld, center);
      if (area > 1) fails.push(`meld∩center@p${p} area=${area.toFixed(1)}`);
    }
    if (disc && center) {
      const area = overlapArea(disc, center);
      if (area > 1) fails.push(`discard∩center@p${p} area=${area.toFixed(1)}`);
    }

    for (const [name, r] of [
      ["hand", hand],
      ["meld", meld],
      ["discard", disc],
    ]) {
      if (r && outside(r, tableR)) fails.push(`${name}@p${p} out-of-table`);
    }

    const meldEl = document.getElementById(`meld-${p}`);
    const discEl = document.getElementById(`discard-${p}`);
    if (meldEl?.dataset.fit === "fail") fails.push(`data-fit=fail meld@p${p}`);
    if (discEl?.dataset.fit === "fail") fails.push(`data-fit=fail discard@p${p}`);
    const handEl = document.querySelector(`#seat-${p} .hand`);
    if (handEl?.dataset.fit === "fail") fails.push(`data-fit=fail hand@p${p}`);
  }

  if (document.querySelector(".tile-more")) {
    fails.push("forbidden .tile-more (+N)");
  }

  const stage = stageEl();
  if (stage.scrollWidth > stage.clientWidth + 1) {
    fails.push("horizontal overflow in stage");
  }
  if (table.scrollWidth > table.clientWidth + 2) {
    fails.push("horizontal overflow in table");
  }

  return fails;
}

function setViewport(vp) {
  const stage = stageEl();
  stage.style.width = `${vp.w}px`;
  stage.style.height = `${vp.h}px`;
  stage.style.setProperty("--fs-aspect", String(vp.w / vp.h));
  previewViewportId = vp.id;
  applyStageScale();
  highlightChips();
}

function applyStageScale() {
  const stage = stageEl();
  const range = document.getElementById("stageScale");
  const label = document.getElementById("scaleLabel");
  if (!stage || !range) return;
  const pct = Number(range.value) || 55;
  if (label) label.textContent = `${pct}%`;
  if (document.fullscreenElement === stage) {
    stage.style.transform = "none";
    return;
  }
  stage.style.transform = `scale(${pct / 100})`;
}

function highlightChips() {
  document.querySelectorAll(".vp-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.vp === previewViewportId);
    const row = results.find(
      (r) => r.viewport === chip.dataset.vp && r.scenario === previewScenario
    );
    chip.classList.remove("pass", "fail");
    if (row) chip.classList.add(row.pass ? "pass" : "fail");
  });
  document.querySelectorAll(".lt-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.vp === previewViewportId);
  });
}

async function showPreview(vpId, scenarioId) {
  const vp = VIEWPORTS.find((v) => v.id === vpId) || VIEWPORTS[0];
  previewScenario = scenarioId || previewScenario;
  const pick = document.getElementById("scenarioPick");
  if (pick) pick.value = previewScenario;
  setViewport(vp);
  applyScenario(previewScenario);
  await waitFrames(2);
  relayoutTable(tableEl());
  highlightChips();
  log(`预览 ${vp.id} × ${previewScenario}（${vp.w}×${vp.h}）`);
}

function buildVpChips() {
  const host = document.getElementById("vpChips");
  if (!host) return;
  host.innerHTML = "";
  VIEWPORTS.forEach((vp) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vp-chip";
    b.dataset.vp = vp.id;
    b.textContent = vp.id;
    b.title = `${vp.w}×${vp.h}`;
    b.addEventListener("click", () => showPreview(vp.id, previewScenario));
    host.appendChild(b);
  });
  highlightChips();
}

function buildGallery() {
  const host = document.getElementById("gallery");
  if (!host) return;
  host.innerHTML = "";
  VIEWPORTS.forEach((vp) => {
    const row = results.find(
      (r) => r.viewport === vp.id && r.scenario === previewScenario
    );
    const card = document.createElement("div");
    card.className = "lt-card";
    card.dataset.vp = vp.id;
    const status = row ? (row.pass ? "PASS" : "FAIL") : "未测";
    const shotKey = `${vp.id}_${previewScenario}`;
    const shot = shotMap.get(shotKey) || row?.shot;
    card.innerHTML = `
      <h3>${vp.id}</h3>
      <div class="meta">${vp.w}×${vp.h} · ${previewScenario} · ${status}</div>
      <div class="thumb">${
        shot
          ? `<img src="${shot}" alt="${vp.id}">`
          : "点击套用此尺寸到上方舞台"
      }</div>
    `;
    card.addEventListener("click", () => showPreview(vp.id, previewScenario));
    host.appendChild(card);
  });
  highlightChips();
}

async function enterFullscreen() {
  const stage = stageEl();
  if (!stage) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      applyStageScale();
      return;
    }
    stage.style.transform = "none";
    if (stage.requestFullscreen) await stage.requestFullscreen();
    else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
    log("已全屏（按 Esc 退出）");
  } catch (e) {
    log("全屏失败：" + (e.message || e));
  }
}

function waitFrames(n = 2) {
  return new Promise((resolve) => {
    let left = n;
    const step = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function ensureHtmlToImage() {
  if (htmlToImage) return htmlToImage;
  log("正在加载截图库 html-to-image（需能访问 esm.sh）…");
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error("超时 12s")), 12000)
  );
  try {
    htmlToImage = await Promise.race([
      import("https://esm.sh/html-to-image@1.11.11"),
      timeout,
    ]);
    log("截图库加载完成");
    return htmlToImage;
  } catch (e) {
    throw new Error(
      "截图库加载失败（请取消勾选「生成截图」再跑）：" + (e.message || e)
    );
  }
}

async function captureShot(key) {
  try {
    const mod = await ensureHtmlToImage();
    const dataUrl = await mod.toPng(stageEl(), {
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: "#062218",
    });
    shotMap.set(key, dataUrl);
    return dataUrl;
  } catch (e) {
    log(`screenshot WARN ${key}: ${e.message || e}`);
    return null;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GOLDEN_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GOLDEN_STORE)) {
        db.createObjectStore(GOLDEN_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function goldenGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GOLDEN_STORE, "readonly");
    const req = tx.objectStore(GOLDEN_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function goldenSet(key, dataUrl) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GOLDEN_STORE, "readwrite");
    tx.objectStore(GOLDEN_STORE).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function diffRatio(aUrl, bUrl) {
  const [a, b] = await Promise.all([loadImage(aUrl), loadImage(bUrl)]);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  if (!w || !h) return 1;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(a, 0, 0, w, h);
  const da = ctx.getImageData(0, 0, w, h).data;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(b, 0, 0, w, h);
  const db = ctx.getImageData(0, 0, w, h).data;
  let diff = 0;
  const total = w * h;
  for (let i = 0; i < da.length; i += 4) {
    if (
      Math.abs(da[i] - db[i]) > 8 ||
      Math.abs(da[i + 1] - db[i + 1]) > 8 ||
      Math.abs(da[i + 2] - db[i + 2]) > 8
    ) {
      diff += 1;
    }
  }
  return diff / total;
}

async function runCase(vp, scenarioId, opts) {
  setViewport(vp);
  applyScenario(scenarioId);
  await waitFrames(3);
  relayoutTable(tableEl());
  await waitFrames(2);

  const key = `${vp.id}_${scenarioId}`;
  const geoFails = checkGeometry(vp.id, scenarioId);
  let shot = null;
  let goldenStatus = "skip";
  let goldenDiff = null;

  if (opts.shot) {
    shot = await captureShot(key);
  }

  if (opts.golden && shot) {
    const base = await goldenGet(key);
    if (!base) {
      goldenStatus = "missing";
      geoFails.push("golden missing — 先跑截图后 Promote");
    } else {
      goldenDiff = await diffRatio(base, shot);
      goldenStatus = goldenDiff <= MAX_DIFF_RATIO ? "pass" : "fail";
      if (goldenStatus === "fail") {
        geoFails.push(`golden diff=${(goldenDiff * 100).toFixed(3)}% > 0.1%`);
      }
    }
  }

  const pass = geoFails.length === 0 && goldenStatus !== "fail";
  const row = {
    viewport: vp.id,
    scenario: scenarioId,
    pass,
    fails: geoFails,
    goldenStatus,
    goldenDiff,
    shot,
  };
  results.push(row);
  log(
    `[${vp.id}][${scenarioId}] ${pass ? "PASS" : "FAIL"}` +
      (geoFails.length ? " " + geoFails.join("; ") : "") +
      (goldenStatus !== "skip" ? ` golden=${goldenStatus}` : "")
  );
  return row;
}

const FIXED_SCENARIOS = [
  "empty-melds",
  "melds-4",
  "discards-24",
  "action-dock",
  "fx",
  "reveal",
];

async function runFixed(opts) {
  log("--- fixed matrix ---");
  for (const vp of VIEWPORTS) {
    for (const sc of FIXED_SCENARIOS) {
      await runCase(vp, sc, opts);
    }
  }
  previewScenario = "discards-24";
  const pick = document.getElementById("scenarioPick");
  if (pick) pick.value = previewScenario;
  await showPreview(VIEWPORTS[0].id, previewScenario);
  buildGallery();
  log("固定矩阵结束：点尺寸芯片切换视口；用场景下拉更换场景再「套用到舞台」。");
}

async function runStress(opts) {
  log("--- stress ---");
  previewScenario = "stress";
  const pick = document.getElementById("scenarioPick");
  if (pick) pick.value = "stress";
  for (const vp of VIEWPORTS) {
    await runCase(vp, "stress", opts);
  }
  /* 跑完停在第一个视口并刷新预览卡，方便逐个点看 */
  await showPreview(VIEWPORTS[0].id, "stress");
  buildGallery();
  log("Stress 结束：请点上方尺寸芯片或下方预览卡查看各分辨率。");
}

function randomScenario(seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  return {
    hands: [1 + Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 13), 1 + Math.floor(rnd() * 13), 1 + Math.floor(rnd() * 13)],
    face: [true, rnd() > 0.5, rnd() > 0.5, rnd() > 0.5],
    melds: [0, 1, 2, 3, 4].map(() => Math.floor(rnd() * 5)).slice(0, 4),
    discards: [0, 1, 2, 3].map(() => Math.floor(rnd() * 25)),
    dock: rnd() > 0.6,
    fx: rnd() > 0.7,
    reveal: rnd() > 0.8,
  };
}

async function runRandom(opts, count = 1000) {
  log(`--- random stress ×${count} ---`);
  const vpPool = VIEWPORTS;
  for (let i = 0; i < count; i++) {
    const vp = vpPool[i % vpPool.length];
    const cfg = randomScenario(10007 + i * 97);
    setViewport(vp);
    applyScenario(cfg);
    await waitFrames(2);
    relayoutTable(tableEl());
    await waitFrames(1);
    const fails = checkGeometry(vp.id, `random-${i}`);
    const pass = fails.length === 0;
    results.push({
      viewport: vp.id,
      scenario: `random-${i}`,
      pass,
      fails,
      goldenStatus: "skip",
      goldenDiff: null,
      shot: null,
    });
    if (!pass) {
      log(`[${vp.id}][random-${i}] FAIL ${fails.join("; ")}`);
      if (opts.shot) await captureShot(`${vp.id}_random-${i}`);
    }
    if (i % 50 === 49) {
      log(`random progress ${i + 1}/${count}`);
      await waitFrames(1);
    }
  }
}

function summarize() {
  const fixed = results.filter(
    (r) => !String(r.scenario).startsWith("random") && r.scenario !== "stress"
  );
  const stress = results.filter((r) => r.scenario === "stress");
  const random = results.filter((r) => String(r.scenario).startsWith("random"));
  const goldenRows = results.filter(
    (r) => r.goldenStatus === "pass" || r.goldenStatus === "fail" || r.goldenStatus === "missing"
  );

  const countPass = (arr) => arr.filter((r) => r.pass).length;
  const geoClean = (r) => r.fails.every((f) => f.startsWith("golden") || f.includes("golden"));
  const geoOk = results.length > 0 && results.every(geoClean);

  const stressOk = stress.length === 0 ? null : stress.every(geoClean);
  const goldenOk =
    goldenRows.length === 0 ? null : goldenRows.every((r) => r.goldenStatus === "pass");

  const gate = { geometry: geoOk, stress: stressOk, golden: goldenOk };
  /* 发布门禁：三者皆 PASS；未跑的套件为 null，不算 Merge OK */
  const gatePass = gate.geometry === true && gate.stress === true && gate.golden === true;

  window.__LAYOUT_FAIL__ = !gatePass;
  window.__LAYOUT_REPORT__ = { results, gate, fixed, stress, random };

  const label = (v) => (v === null ? "N/A" : v ? "PASS" : "FAIL");
  const el = document.getElementById("summary");
  el.className = "lt-sum " + (gatePass ? "pass" : "fail");
  el.textContent =
    `Geometry ${label(gate.geometry)} · ` +
    `Stress ${label(gate.stress)} · ` +
    `Golden ${label(gate.golden)} · ` +
    `cases ${countPass(results)}/${results.length}` +
    (gatePass ? " · MERGE OK" : " · 禁止 Merge（需 Geometry+Stress+Golden 全 PASS）");

  renderReport();
  buildGallery();
  highlightChips();
  log(
    `SUM Geometry=${label(gate.geometry)} Stress=${label(gate.stress)} Golden=${label(
      gate.golden
    )} → ${gatePass ? "PASS" : "FAIL"}`
  );
}

function renderReport() {
  const mount = document.getElementById("reportMount");
  const rows = results
    .filter((r) => !String(r.scenario).startsWith("random") || !r.pass)
    .map((r) => {
      const cls = r.pass ? "ok" : "bad";
      const img = r.shot
        ? `<img src="${r.shot}" alt="${r.viewport}_${r.scenario}">`
        : "";
      return `<tr class="${cls}">
        <td>${r.viewport}</td>
        <td>${r.scenario}</td>
        <td>${r.pass ? "PASS" : "FAIL"}</td>
        <td>${r.goldenStatus}${
          r.goldenDiff != null ? ` (${(r.goldenDiff * 100).toFixed(3)}%)` : ""
        }</td>
        <td>${(r.fails || []).join("<br>")}</td>
        <td>${img}</td>
      </tr>`;
    })
    .join("");

  mount.innerHTML = `
    <h2>HTML Report</h2>
    <p>maxDiffRatio=${MAX_DIFF_RATIO} · Invariants: hand∩meld∩discard∩center</p>
    <table>
      <thead><tr>
        <th>Viewport</th><th>Scenario</th><th>Result</th><th>Golden</th><th>Fails</th><th>Shot</th>
      </tr></thead>
      <tbody>${rows || "<tr><td colspan=6>无明细</td></tr>"}</tbody>
    </table>
  `;
}

function downloadReport() {
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
    <title>Layout Report</title>
    <style>
      body{font-family:sans-serif;background:#111;color:#eee;padding:16px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #444;padding:6px;font-size:12px;vertical-align:top}
      .ok{color:#6d6}.bad{color:#f88}
      img{max-width:240px}
    </style></head><body>
    <h1>Nocturne Layout Report</h1>
    <pre>${document.getElementById("summary").textContent}</pre>
    ${document.getElementById("reportMount").innerHTML}
    </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `layout-report-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function promoteGolden() {
  let n = 0;
  for (const [key, url] of shotMap) {
    await goldenSet(key, url);
    n += 1;
  }
  log(`Promoted ${n} screenshots to IndexedDB golden store`);
}

function optsFromUi() {
  return {
    shot: document.getElementById("chkShot").checked,
    golden: document.getElementById("chkGolden").checked,
  };
}

let busy = false;

function setBusy(on) {
  busy = on;
  ["btnRunFixed", "btnRunStress", "btnRunRandom", "btnAll", "btnPromote"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = on;
    }
  );
}

function bindAsync(id, label, fn) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (busy) {
      log("上一次任务还在跑，请稍候…");
      return;
    }
    setBusy(true);
    results.length = 0;
    shotMap.clear();
    logEl().textContent = "";
    log(`▶ ${label} 开始…`);
    try {
      await fn();
      summarize();
      log(`▶ ${label} 结束`);
    } catch (e) {
      console.error(e);
      log(`ERROR ${label}: ${e && e.stack ? e.stack : e}`);
      document.getElementById("summary").textContent = `运行出错：${e.message || e}`;
      document.getElementById("summary").className = "lt-sum fail";
    } finally {
      setBusy(false);
    }
  });
}

async function boot() {
  logEl().textContent = "";
  if (location.protocol === "file:") {
    const msg =
      "当前是 file:// 打开，ES Module 无法工作。请在 mahjong 目录执行 python -m http.server 8877，用 http://127.0.0.1:8877/layout-tests.html 访问。";
    document.getElementById("bootHint").textContent = msg;
    logEl().textContent = msg;
    return;
  }

  initTableLayout(tableEl());
  setDebugLayout(false, tableEl());
  buildVpChips();
  buildGallery();

  document.getElementById("stageScale")?.addEventListener("input", applyStageScale);
  document.getElementById("btnFullscreen")?.addEventListener("click", enterFullscreen);
  document.getElementById("btnApplyPreview")?.addEventListener("click", () => {
    const sc = document.getElementById("scenarioPick")?.value || "stress";
    showPreview(previewViewportId, sc);
  });
  document.getElementById("scenarioPick")?.addEventListener("change", (e) => {
    previewScenario = e.target.value;
    buildGallery();
  });
  document.addEventListener("fullscreenchange", () => {
    applyStageScale();
  });

  /* 默认竖屏 + stress 满牌，便于直接看布局 */
  const scale = document.getElementById("stageScale");
  if (scale) scale.value = "55";
  await showPreview("390x844", "stress");

  bindAsync("btnRunFixed", "固定矩阵", async () => {
    await runFixed(optsFromUi());
  });
  bindAsync("btnRunStress", "Stress", async () => {
    await runStress(optsFromUi());
  });
  bindAsync("btnRunRandom", "Random×1000", async () => {
    await runRandom({ shot: false, golden: false }, 1000);
  });
  bindAsync("btnAll", "全部", async () => {
    const o = optsFromUi();
    await runFixed(o);
    await runStress(o);
    await runRandom({ shot: false, golden: false }, 1000);
  });

  document.getElementById("btnPromote").addEventListener("click", async () => {
    try {
      await promoteGolden();
    } catch (e) {
      log(`Promote ERROR: ${e.message || e}`);
    }
  });
  document.getElementById("btnDebug").addEventListener("click", () => {
    const on = toggleDebugLayout(tableEl());
    log(`debug overlay ${on ? "ON" : "OFF"}`);
  });
  document.getElementById("btnDownloadReport").addEventListener("click", downloadReport);

  document.getElementById("bootHint").textContent = "";
  log("Ready。跑完 Stress 后，点上方尺寸芯片或下方预览卡切换分辨率。");
  log("「全屏看桌」放大当前尺寸；右侧缩放滑条可把大桌缩小塞进窗口。");
  window.__LAYOUT_TESTS_BOOTED__ = true;
}

boot().catch((e) => {
  console.error(e);
  window.__LAYOUT_TESTS_BOOTED__ = false;
  const msg = "boot 失败：" + (e && e.message ? e.message : e);
  const hint = document.getElementById("bootHint");
  if (hint) hint.textContent = msg;
  if (logEl()) logEl().textContent = msg;
});
