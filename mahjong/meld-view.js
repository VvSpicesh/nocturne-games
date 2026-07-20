/**
 * 副露展示与自家手牌展示顺序（纯函数，不写 DOM）
 */

/**
 * 相对副露拥有者的来源位：上家左 / 对家中 / 下家右
 * @param {number} ownerIndex
 * @param {number} fromPlayerIndex
 * @returns {"left"|"middle"|"right"|null}
 */
export function getRelativeSourcePosition(ownerIndex,fromPlayerIndex){
  if(!Number.isInteger(ownerIndex)||ownerIndex<0||ownerIndex>3)return null;
  if(!Number.isInteger(fromPlayerIndex)||fromPlayerIndex<0||fromPlayerIndex>3)return null;
  if(fromPlayerIndex===ownerIndex)return null;
  const diff=(fromPlayerIndex-ownerIndex+4)%4;
  if(diff===1)return "left";
  if(diff===2)return "middle";
  if(diff===3)return "right";
  return null;
}

/** @deprecated 保留供旧测试；副露 UI 已改用来源横牌 */
export function relativeSeatDirection(viewerSeat,sourceSeat){
  const pos=getRelativeSourcePosition(viewerSeat,sourceSeat);
  if(pos==="left")return "←";
  if(pos==="middle")return "↑";
  if(pos==="right")return "→";
  return null;
}

/**
 * 兼容旧存档：读取 meld.from，无效则 null
 * @param {object|null|undefined} meld
 * @returns {number|null}
 */
export function normalizeMeldFrom(meld){
  const from=meld?.from;
  if(!Number.isInteger(from)||from<0||from>3)return null;
  return from;
}

const RELATIVE_SEAT=["自己","上家","对家","下家"];

function relativeSeatName(viewerSeat,sourceSeat){
  if(!Number.isInteger(viewerSeat)||!Number.isInteger(sourceSeat))return "";
  const diff=(sourceSeat-viewerSeat+4)%4;
  return RELATIVE_SEAT[diff]||"";
}

function sourceSlotIndex(position,count){
  if(position==="left")return 0;
  if(position==="right")return Math.max(0,count-1);
  return Math.floor((count-1)/2);
}

/**
 * 副露牌展示计划：哪一张横放、是否显示补杠标记
 * @param {object|null|undefined} meld
 * @param {number} ownerSeat
 * @returns {{
 *   items:{tile:object|null,isSource:boolean,face:"show"|"back"}[],
 *   sourcePosition:"left"|"middle"|"right"|null,
 *   badge:string|null,
 *   title:string,
 *   sourceLabel:string
 * }}
 */
export function buildMeldTilePlan(meld,ownerSeat){
  const type=String(meld?.type||"");
  const tiles=Array.isArray(meld?.tiles)?meld.tiles:[];
  const from=normalizeMeldFrom(meld);
  const sourceLabel=from!=null?relativeSeatName(ownerSeat,from):"";
  const title={
    peng:"碰",
    mingGang:"杠",
    anGang:"暗杠",
    buGang:"补杠"
  }[type]||type||"副露";

  if(type==="anGang"){
    return {
      items:tiles.map((tile,tileIndex)=>({
        tile,
        isSource:false,
        face:ownerSeat===0&&tileIndex===tiles.length-1?"show":"back"
      })),
      sourcePosition:null,
      badge:null,
      title,
      sourceLabel:""
    };
  }

  const position=
    (type==="peng"||type==="mingGang"||type==="buGang")&&from!=null
      ?getRelativeSourcePosition(ownerSeat,from)
      :null;

  if(!position||tiles.length<2){
    return {
      items:tiles.map(tile=>({tile,isSource:false,face:"show"})),
      sourcePosition:null,
      badge:type==="buGang"?"补":null,
      title,
      sourceLabel:position?sourceLabel:""
    };
  }

  const n=tiles.length;
  const sourceIndex=sourceSlotIndex(position,n);
  const pool=tiles.slice();
  const sourceTile=pool.shift();
  const items=[];
  for(let i=0;i<n;i++){
    if(i===sourceIndex)items.push({tile:sourceTile,isSource:true,face:"show"});
    else items.push({tile:pool.shift(),isSource:false,face:"show"});
  }

  return {
    items,
    sourcePosition:position,
    badge:type==="buGang"?"补":null,
    title,
    sourceLabel
  };
}

/**
 * @param {object|null|undefined} meld
 * @param {number} ownerSeat
 */
export function meldDisplayInfo(meld,ownerSeat){
  const plan=buildMeldTilePlan(meld,ownerSeat);
  return {
    arrow:null,
    badge:plan.badge,
    title:plan.title,
    sourceLabel:plan.sourceLabel,
    sourcePosition:plan.sourcePosition
  };
}

/**
 * 自家手牌展示顺序：新摸牌固定最右，不参与中间视觉排序；不改变 hand 数组。
 * @param {object[]} hand
 * @param {string|null|undefined} drawnTileId
 * @returns {{tile:object,tileIndex:number,isDraw:boolean}[]}
 */
export function buildSelfHandDisplayOrder(hand,drawnTileId){
  const list=Array.isArray(hand)?hand:[];
  if(!drawnTileId){
    return list.map((tile,tileIndex)=>({tile,tileIndex,isDraw:false}));
  }

  const drawIndex=list.findIndex(tile=>tile?.id===drawnTileId);
  if(drawIndex<0){
    return list.map((tile,tileIndex)=>({tile,tileIndex,isDraw:false}));
  }

  const items=[];
  list.forEach((tile,tileIndex)=>{
    if(tileIndex!==drawIndex)items.push({tile,tileIndex,isDraw:false});
  });
  items.push({tile:list[drawIndex],tileIndex:drawIndex,isDraw:true});
  return items;
}
