const NUM_CN=["","一","二","三","四","五","六","七","八","九"];

const FONT="Noto Serif SC,Songti SC,SimSun,serif";
const INK="#1a1a1a";
const RED="#c4282a";
const GREEN="#2d8a4e";
const BLUE="#2a6aad";
const STROKE="#174a32";

function svg(content){
  return `<svg viewBox="0 0 100 140" aria-hidden="true">${content}</svg>`;
}

/** 传统圆饼：加粗同心环 + 花心，便于远观 */
function dotAt(x,y,r,color){
  const r2=Math.max(r*0.58,4);
  const r3=Math.max(r*0.28,2.5);
  const hub=color===RED?"#f0d070":"#fff8e8";
  return `<g transform="translate(${x} ${y})">
    <circle r="${r}" fill="${color}" stroke="${STROKE}" stroke-width="2.4"/>
    <circle r="${r2}" fill="none" stroke="${hub}" stroke-width="2.2"/>
    <circle r="${r3}" fill="${hub}" stroke="${STROKE}" stroke-width="1.4"/>
  </g>`;
}

/** 一筒：中央大花筒 */
function bigFlowerDot(x,y,r){
  return `<g transform="translate(${x} ${y})">
    <circle r="${r}" fill="${GREEN}" stroke="${STROKE}" stroke-width="3"/>
    <circle r="${r*0.82}" fill="none" stroke="#e8f6ec" stroke-width="2.4"/>
    <circle r="${r*0.62}" fill="${RED}" stroke="${STROKE}" stroke-width="2.2"/>
    <circle r="${r*0.42}" fill="none" stroke="#f6e2a0" stroke-width="2.2"/>
    <circle r="${r*0.22}" fill="#f6e2a0" stroke="${STROKE}" stroke-width="1.6"/>
    <path d="M0 ${-r*0.55} Q ${r*0.2} ${-r*0.2} 0 ${-r*0.08} Q ${-r*0.2} ${-r*0.2} 0 ${-r*0.55}"
      fill="#3cbc74" stroke="${STROKE}" stroke-width="1.2"/>
  </g>`;
}

/** 竹节条，偏粗，老人易认 */
function bambooAt(x,y,color=GREEN,rotate=0){
  return `<g transform="translate(${x} ${y}) rotate(${rotate})">
    <rect x="-7.5" y="-22" width="15" height="44" rx="7" fill="${color}" stroke="${STROKE}" stroke-width="2.2"/>
    <line x1="-4.5" y1="-11" x2="4.5" y2="-11" stroke="#e8f6ec" stroke-width="2.4" stroke-linecap="round"/>
    <line x1="-4.5" y1="0" x2="4.5" y2="0" stroke="#e8f6ec" stroke-width="2.4" stroke-linecap="round"/>
    <line x1="-4.5" y1="11" x2="4.5" y2="11" stroke="#e8f6ec" stroke-width="2.4" stroke-linecap="round"/>
  </g>`;
}

/** 幺鸡：竹枝上的简化竹鸟（非 emoji） */
function birdBamboo(){
  return `
    <rect x="46" y="26" width="8" height="92" rx="4" fill="${GREEN}" stroke="${STROKE}" stroke-width="2.2"/>
    <line x1="48" y1="48" x2="52" y2="48" stroke="#e8f6ec" stroke-width="2.2"/>
    <line x1="48" y1="70" x2="52" y2="70" stroke="#e8f6ec" stroke-width="2.2"/>
    <line x1="48" y1="92" x2="52" y2="92" stroke="#e8f6ec" stroke-width="2.2"/>
    <ellipse cx="40" cy="62" rx="16" ry="12" fill="#3aaa62" stroke="${STROKE}" stroke-width="2.2"/>
    <circle cx="28" cy="54" r="8.5" fill="#3aaa62" stroke="${STROKE}" stroke-width="2.2"/>
    <path d="M19 54 L9 52 L19 49 Z" fill="#e0a040" stroke="#9a650f" stroke-width="1.2"/>
    <path d="M26 47 L24 39 L32 45 Z" fill="${RED}"/>
    <circle cx="25.5" cy="53" r="1.8" fill="${INK}"/>
    <path d="M48 68 Q60 60 66 48" fill="none" stroke="${GREEN}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M34 72 L31 84 M46 72 L50 84" stroke="#e0a040" stroke-width="2.4" stroke-linecap="round"/>
  `;
}

/**
 * 筒子固定布局（坐标 + 半径 + 颜色）
 * 3筒：上1下2（三角形），全项目唯一
 */
const DOT_LAYOUT={
  1:null, /* 特殊大花筒 */
  2:[[50,40,16,GREEN],[50,100,16,BLUE]],
  3:[[50,36,14,GREEN],[32,102,14,RED],[68,102,14,BLUE]],
  4:[[32,40,13,GREEN],[68,40,13,GREEN],[32,100,13,BLUE],[68,100,13,BLUE]],
  5:[[30,34,12,GREEN],[70,34,12,BLUE],[50,70,13,RED],[30,106,12,BLUE],[70,106,12,GREEN]],
  6:[[34,32,12,GREEN],[66,32,12,GREEN],[34,70,12,RED],[66,70,12,RED],[34,108,12,RED],[66,108,12,RED]],
  /* 上：左上→右下三点绿；下：红 2×2 */
  7:[
    [26,26,11,GREEN],[50,48,11,GREEN],[74,70,11,GREEN],
    [32,98,11,RED],[68,98,11,RED],
    [32,122,11,RED],[68,122,11,RED]
  ],
  8:[
    [34,24,10,BLUE],[66,24,10,BLUE],
    [34,52,10,BLUE],[66,52,10,BLUE],
    [34,80,10,BLUE],[66,80,10,BLUE],
    [34,108,10,BLUE],[66,108,10,BLUE]
  ],
  9:[
    [28,26,10,GREEN],[50,26,10,GREEN],[72,26,10,GREEN],
    [28,70,10,RED],[50,70,10,RED],[72,70,10,RED],
    [28,114,10,BLUE],[50,114,10,BLUE],[72,114,10,BLUE]
  ]
};

/**
 * 条子固定布局（坐标 + 颜色 + 可选旋转）
 * 3条：上1下2
 * 6条：2行×3条
 * 7条：上1红 + 中3绿 + 下3绿
 * 8条：上 W（\/\/）+ 下 M（/\/\）
 * 9条：中列红，左右列绿
 */
/** W 形：\/\/ */
function bambooW(cy,color){
  return [
    [28,cy,color,-32],
    [40,cy,color,32],
    [60,cy,color,-32],
    [72,cy,color,32]
  ];
}
/** M 形：/\/\ */
function bambooM(cy,color){
  return [
    [28,cy,color,32],
    [40,cy,color,-32],
    [60,cy,color,32],
    [72,cy,color,-32]
  ];
}

const BAMBOO_LAYOUT={
  1:null,
  2:[[50,40,GREEN,0],[50,100,GREEN,0]],
  3:[[50,36,GREEN,0],[32,102,GREEN,-6],[68,102,GREEN,6]],
  4:[[32,40,GREEN,-4],[68,40,GREEN,4],[32,100,BLUE,4],[68,100,BLUE,-4]],
  5:[[30,34,GREEN,-6],[70,34,GREEN,6],[50,70,RED,0],[30,106,BLUE,6],[70,106,BLUE,-6]],
  /* 2 行 × 3 条 */
  6:[
    [28,40,GREEN,-4],[50,40,GREEN,0],[72,40,GREEN,4],
    [28,100,GREEN,4],[50,100,GREEN,0],[72,100,GREEN,-4]
  ],
  /* 第1行红，第2、3行绿 */
  7:[
    [50,24,RED,0],
    [28,62,GREEN,-5],[50,62,GREEN,0],[72,62,GREEN,5],
    [28,108,GREEN,-5],[50,108,GREEN,0],[72,108,GREEN,5]
  ],
  /* 上 W + 下 M */
  8:[...bambooW(40,GREEN),...bambooM(100,GREEN)],
  /* 中列红，两边绿 */
  9:[
    [28,24,GREEN,-4],[50,24,RED,0],[72,24,GREEN,4],
    [28,70,GREEN,-2],[50,70,RED,0],[72,70,GREEN,2],
    [28,116,GREEN,4],[50,116,RED,0],[72,116,GREEN,-4]
  ]
};

function faceWan(n){
  return svg(`
    <text x="50" y="58" text-anchor="middle" dominant-baseline="middle"
      font-size="48" font-weight="900" font-family="${FONT}" fill="${INK}"
  stroke="${INK}"
  stroke-width="0.8"
  paint-order="stroke fill">${NUM_CN[n]}</text>
    <text x="50" y="108" text-anchor="middle" dominant-baseline="middle"
      font-size="34" font-weight="800" font-family="${FONT}" fill="${RED}">萬</text>
  `);
}

function faceDot(n){
  if(n===1)return svg(bigFlowerDot(50,70,30));
  const layout=DOT_LAYOUT[n];
  return svg(layout.map(([x,y,r,c])=>dotAt(x,y,r,c)).join(""));
}

function faceBamboo(n){
  if(n===1)return svg(birdBamboo());
  const layout=BAMBOO_LAYOUT[n];
  return svg(layout.map(([x,y,c,rot=0])=>bambooAt(x,y,c,rot)).join(""));
}

export function tileName(tile){
  return `${tile.n}${{w:"万",t:"条",b:"筒"}[tile.s]}`;
}

export function tileFace(tile){
  if(tile.s==="w")return faceWan(tile.n);
  if(tile.s==="b")return faceDot(tile.n);
  return faceBamboo(tile.n);
}
