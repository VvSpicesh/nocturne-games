/**
 * v0.16 牌桌布局
 * - data-layout: 仅 portrait | landscape
 * - fitTiles: 只算牌尺寸 / 可选 gap；Grid+换行交给 CSS
 * - 缓存 key: layout|w|h|count|orientation|kind
 * - 手牌优先单行（手机竖屏不再用「能塞进多行的最大牌」撑爆比例）
 */

const ASPECT = 1.42;
const fitCache = new Map();

function classifyLayout(w, h) {
  return h >= w ? "portrait" : "landscape";
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function limitsFor(kind, layout, boxW, boxH, orientation = "x") {
  const short = Math.min(boxW || 1, boxH || 1);
  if (kind === "hand") {
    if (layout === "landscape") {
      /* 矮横屏：行高很紧，下限/上限都再压 */
      const shortH = boxH > 0 && boxH < 100;
      return {
        minW: shortH ? 8 : 11,
        maxW: Math.min(shortH ? 22 : 36, short * 0.55),
        gapMin: 0,
        gapMax: shortH ? 1 : 2,
      };
    }
    if (orientation === "y") {
      /* 侧家：上限按列宽（旋转后视觉宽≈tileH）与堆叠高度 */
      const byCol = boxW > 0 ? boxW / ASPECT : 22;
      return { minW: 10, maxW: Math.min(26, byCol, short * 0.55), gapMin: 0, gapMax: 2 };
    }
    /* 南北：单行铺满但不贴边；窄屏再压一档，避免 390 上手牌「又大又满」 */
    const rowCap = boxW > 0 ? (boxW * 0.92) / 14.5 : 28;
    const phoneMax = boxW > 0 && boxW < 340 ? 16.5 : 28;
    return { minW: 10, maxW: Math.min(phoneMax, rowCap, short * 0.28), gapMin: 0, gapMax: 2 };
  }
  if (kind === "meld") {
    if (layout === "landscape") return { minW: 8, maxW: 22, gapMin: 0, gapMax: 2 };
    /* 窄侧栏：下限略降，避免 390 stress 直接 fail */
    const narrow = boxW > 0 && boxW < 48;
    return { minW: narrow ? 8 : 10, maxW: Math.min(28, short * 0.35), gapMin: 0, gapMax: 2 };
  }
  if (layout === "landscape") return { minW: 7, maxW: 18, gapMin: 0, gapMax: 1 };
  const narrowDisc = boxW > 0 && boxW < 48;
  return { minW: narrowDisc ? 7 : 8, maxW: Math.min(22, short * 0.28), gapMin: 0, gapMax: 1 };
}

/**
 * 估算 flex-wrap 能否在盒子内放下全部牌（与 CSS wrap 对齐）
 * orientation=y：侧家 column + rotate(90°)，按旋转后投影约束
 */
function fitsBox(availW, availH, count, tileW, tileH, gap, orientation, kind) {
  if (count <= 0) return true;
  if (tileW <= 0 || tileH <= 0) return false;

  if (orientation === "y" && kind === "hand") {
    /* 未旋转布局盒按 column 堆叠占 tileH；旋转后视觉宽≈tileH、高≈tileW */
    const needH = count * tileH + (count - 1) * gap;
    const visualW = tileH;
    return visualW <= availW + 0.5 && needH <= availH + 0.5;
  }

  const mainIsX = orientation !== "y";
  const availMain = mainIsX ? availW : availH;
  const availCross = mainIsX ? availH : availW;
  const tileMain = mainIsX ? tileW : tileH;
  const tileCross = mainIsX ? tileH : tileW;
  const cols = Math.max(1, Math.floor((availMain + gap) / (tileMain + gap)));
  const rows = Math.ceil(count / cols);
  const needCross = rows * tileCross + (rows - 1) * gap;
  const usedCols = Math.min(count, cols);
  const needMain = usedCols * tileMain + (usedCols - 1) * gap;
  return needCross <= availCross + 0.5 && needMain <= availMain + 0.5;
}

/** 南北手牌：优先单行铺满 */
function preferSingleRowHand(availW, availH, count, minW, maxW, gap) {
  if (count <= 0) return { tileW: minW, tileH: minW * ASPECT, gap, ok: true };
  const byW = (availW - (count - 1) * gap) / count;
  const byH = availH / ASPECT;
  let tileW = Math.min(byW, byH, maxW);
  if (tileW >= minW - 0.01) {
    tileW = clamp(tileW, minW, maxW);
    return { tileW, tileH: tileW * ASPECT, gap, ok: true, rows: 1 };
  }
  return null;
}

/** 侧家手牌：旋转后视觉宽=tileH ≤ 列宽 */
function preferSideHand(availW, availH, count, minW, maxW, gap) {
  if (count <= 0) return { tileW: minW, tileH: minW * ASPECT, gap, ok: true };
  const byVisualW = availW / ASPECT;
  const byStack = (availH - (count - 1) * gap) / (count * ASPECT);
  let tileW = Math.min(byVisualW, byStack, maxW);
  if (tileW >= minW - 0.01) {
    tileW = clamp(tileW, minW, maxW);
    return { tileW, tileH: tileW * ASPECT, gap, ok: true };
  }
  return null;
}

/**
 * @returns {{ tileW: number, tileH: number, gap: number, ok: boolean }}
 */
export function fitTiles({
  layout,
  containerWidth,
  containerHeight,
  tileCount,
  orientation = "x",
  kind = "discard",
}) {
  const w = Math.max(0, Math.floor(containerWidth));
  const h = Math.max(0, Math.floor(containerHeight));
  const count = Math.max(0, tileCount | 0);
  const key = `${layout}|${w}|${h}|${count}|${orientation}|${kind}`;
  if (fitCache.has(key)) return fitCache.get(key);

  const { minW, maxW, gapMin, gapMax } = limitsFor(kind, layout, w, h, orientation);

  /* 手牌：只走单行 / 侧列；绝不换行放大（390 竖屏的元凶） */
  if (kind === "hand") {
    let forced = null;
    for (const gap of [gapMax, gapMin]) {
      const preferred =
        orientation === "y"
          ? preferSideHand(w, h, count, minW, maxW, gap)
          : preferSingleRowHand(w, h, count, minW, maxW, gap);
      if (preferred) {
        fitCache.set(key, preferred);
        return preferred;
      }
    }
    /* 装不下可读下限：仍按单行压到可用宽度，标记 fail */
    const gap = gapMin;
    if (orientation === "y") {
      const byVisualW = w / ASPECT;
      const byStack = count > 0 ? (h - (count - 1) * gap) / (count * ASPECT) : minW;
      const tileW = clamp(Math.min(byVisualW, byStack, maxW), 8, maxW);
      forced = {
        tileW,
        tileH: tileW * ASPECT,
        gap,
        ok: tileW >= minW - 0.01 && fitsBox(w, h, count, tileW, tileW * ASPECT, gap, orientation, kind),
      };
    } else {
      const byW = count > 0 ? (w - (count - 1) * gap) / count : minW;
      const byH = h / ASPECT;
      const tileW = clamp(Math.min(byW, byH, maxW), 8, maxW);
      forced = {
        tileW,
        tileH: tileW * ASPECT,
        gap,
        ok: tileW >= minW - 0.01 && fitsBox(w, h, count, tileW, tileW * ASPECT, gap, orientation, kind),
      };
    }
    fitCache.set(key, forced);
    return forced;
  }

  let best = null;
  for (const gap of [gapMax, gapMin]) {
    let lo = minW;
    let hi = maxW;
    let found = null;
    while (lo <= hi) {
      const mid = (lo + hi) / 2;
      const tileH = mid * ASPECT;
      const ok = fitsBox(w, h, count, mid, tileH, gap, orientation, kind);
      if (ok) {
        found = { tileW: mid, tileH, gap, ok: true };
        lo = mid + 0.25;
      } else {
        hi = mid - 0.25;
      }
    }
    if (found) {
      best = found;
      break;
    }
  }

  if (!best) {
    best = {
      tileW: minW,
      tileH: minW * ASPECT,
      gap: gapMin,
      ok: count === 0,
    };
  }

  fitCache.set(key, best);
  return best;
}

function applyFitToEl(el, result) {
  if (!el) return;
  el.style.setProperty("--fit-tile-w", `${result.tileW.toFixed(1)}px`);
  el.style.setProperty("--fit-tile-h", `${result.tileH.toFixed(1)}px`);
  el.style.setProperty("--fit-gap", `${result.gap}px`);
  el.dataset.fit = result.ok ? "ok" : "fail";
}

function countTiles(el) {
  if (!el) return 0;
  return el.querySelectorAll(".tile").length;
}

function relayoutBox(table, el, kind, orientation) {
  if (!el) return;
  const layout = table.getAttribute("data-layout") || "portrait";
  const pad = 4;
  const result = fitTiles({
    layout,
    containerWidth: el.clientWidth - pad,
    containerHeight: el.clientHeight - pad,
    tileCount: countTiles(el),
    orientation,
    kind,
  });
  applyFitToEl(el, result);
}

/** 按实测桌面尺寸写 data-*，驱动窄屏行高/列宽（替代无效的自引用 CQ） */
function applySizeFlags(table, w, h) {
  const flags = {
    narrow: w <= 520 ? "1" : "0",
    short: h <= 480 ? "1" : "0",
    wide: w >= 1100 ? "1" : "0",
    tall: h >= 900 ? "1" : "0",
  };
  let changed = false;
  for (const [k, v] of Object.entries(flags)) {
    if (table.getAttribute(`data-${k}`) !== v) {
      table.setAttribute(`data-${k}`, v);
      changed = true;
    }
  }
  return changed;
}

/** 四家手牌用同一牌宽（取可装下尺寸的最小值），避免上下左右尺码不一 */
function unifyHandFits(handResults) {
  const ok = handResults.filter((r) => r && r.el && r.result);
  if (ok.length < 2) return;
  let tileW = Math.min(...ok.map((r) => r.result.tileW));
  const gap = Math.min(...ok.map((r) => r.result.gap));
  let allOk = ok.every((r) => r.result.ok);
  for (const { el, result } of ok) {
    if (!result._side) continue;
    const maxByCol = (el.clientWidth - 4) / ASPECT;
    if (tileW > maxByCol + 0.01) {
      tileW = Math.max(8, maxByCol);
      allOk = false;
    }
  }
  const final = { tileW, tileH: tileW * ASPECT, gap, ok: allOk };
  for (const { el } of ok) {
    applyFitToEl(el, final);
    applyFitToEl(el.parentElement, final);
  }
}

function fitAllZones(table) {
  const hands = [
    { el: table.querySelector("#seat-0 .hand"), o: "x" },
    { el: table.querySelector("#seat-1 .hand"), o: "y" },
    { el: table.querySelector("#seat-2 .hand"), o: "x" },
    { el: table.querySelector("#seat-3 .hand"), o: "y" },
  ];
  const handResults = [];
  hands.forEach(({ el, o }) => {
    if (!el) return;
    const layoutName = table.getAttribute("data-layout") || "portrait";
    const result = fitTiles({
      layout: layoutName,
      containerWidth: el.clientWidth - 4,
      containerHeight: el.clientHeight - 4,
      tileCount: countTiles(el),
      orientation: o,
      kind: "hand",
    });
    result._side = o === "y";
    applyFitToEl(el, result);
    applyFitToEl(el.parentElement, result);
    handResults.push({ el, result });
  });
  unifyHandFits(handResults);

  for (let i = 0; i < 4; i++) {
    const meld = document.getElementById(`meld-${i}`);
    const disc = document.getElementById(`discard-${i}`);
    const side = i === 1 || i === 3;
    relayoutBox(table, meld, "meld", side ? "y" : "x");
    relayoutBox(table, disc, "discard", side ? "y" : "x");
  }
}

/**
 * 对桌上所有可测区跑 fitTiles
 */
export function relayoutTable(tableEl) {
  const table = tableEl || document.querySelector(".table");
  if (!table) return;

  const w = table.clientWidth || 1;
  const h = table.clientHeight || 1;
  const layout = classifyLayout(w, h);
  let gridChanged = applySizeFlags(table, w, h);
  if (table.getAttribute("data-layout") !== layout) {
    table.setAttribute("data-layout", layout);
    gridChanged = true;
  }

  if (gridChanged) {
    /* 行高/列宽变了 → 下一帧再量区盒 */
    requestAnimationFrame(() => {
      clearFitCache();
      fitAllZones(table);
    });
  } else {
    fitAllZones(table);
  }
}

export function clearFitCache() {
  fitCache.clear();
}

export function setDebugLayout(on, tableEl) {
  const table = tableEl || document.querySelector(".table");
  if (!table) return;
  table.setAttribute("data-debug-layout", on ? "on" : "off");
}

export function toggleDebugLayout(tableEl) {
  const table = tableEl || document.querySelector(".table");
  if (!table) return;
  const on = table.getAttribute("data-debug-layout") !== "on";
  setDebugLayout(on, table);
  return on;
}

/**
 * @returns {() => void} disconnect
 */
export function initTableLayout(tableEl) {
  const table = tableEl || document.querySelector(".table");
  if (!table) return () => {};

  const run = () => {
    clearFitCache();
    relayoutTable(table);
  };
  run();

  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      clearFitCache();
      relayoutTable(table);
    });
    ro.observe(table);
  } else {
    window.addEventListener("resize", run);
  }

  const onKey = (e) => {
    if (e.altKey && (e.key === "l" || e.key === "L")) {
      toggleDebugLayout(table);
    }
  };
  window.addEventListener("keydown", onKey);

  return () => {
    if (ro) ro.disconnect();
    else window.removeEventListener("resize", run);
    window.removeEventListener("keydown", onKey);
  };
}

export { classifyLayout, ASPECT };
