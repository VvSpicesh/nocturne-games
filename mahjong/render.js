import {tileFace,tileName,tileDisplayName} from "./tiles.js?v=0.14.49";
import {getLegalDiscardIndexes,SUIT_LABEL} from "./rules-guard.js";
import {buildSelfHandDisplayOrder,buildMeldTilePlan} from "./meld-view.js?v=0.14.53";
import {
  RELATIVE_SEAT_LABELS,
  getPlayerDisplayName,
  isValidPlayerName
} from "./player-name.js?v=0.14.46";

const SEAT_LABELS=RELATIVE_SEAT_LABELS;
const SEAT_SIDE=["bottom","left","top","right"];
const EVENT_PRIORITY={
  discard:1,
  peng:2,
  mingGang:2,
  anGang:2,
  buGang:2,
  hu:3
};

function seatDisplayName(index,name,players){
  if(players)return getPlayerDisplayName(index,0,players);
  return isValidPlayerName(name)?name.trim():SEAT_LABELS[index];
}

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

export function createTileElement(tile,className=""){
  const el=document.createElement("div");
  el.className=`tile ${className}`;

  const face=document.createElement("div");
  face.className="tile-face";

  if(tile){
    face.innerHTML=tileFace(tile);
    el.title=tileName(tile);
    el.dataset.id=tile.id;
  }else{
    el.classList.add("tile-back");
  }

  el.appendChild(face);
  return el;
}

export function renderGame(state,handlers){
  document.getElementById("remaining").textContent=state.wall.length;
  document.getElementById("phase").textContent=state.phase;
  const turnIndex=state.turn;
  const turnName=state.players[turnIndex]
    ?seatDisplayName(turnIndex,state.players[turnIndex].name,state.players)
    :"—";
  const dealerName=state.players[state.dealer]
    ?seatDisplayName(state.dealer,state.players[state.dealer].name,state.players)
    :"—";
  document.getElementById("turn").textContent=
    state.phase==="开局"?`庄：${dealerName}`:`轮到：${turnName}`;
  document.getElementById("statPhase").textContent=state.phase;
  document.getElementById("statTurn").textContent=
    state.phase==="开局"?`${dealerName}（庄）`:turnName;
  document.getElementById("statWall").textContent=state.wall.length;
  document.getElementById("statStatus").textContent=state.players[0].won?"已胡":"未胡";

  state.players.forEach((player,index)=>renderSeat(state,player,index,handlers));
  renderDiscards(state);
  renderMelds(state);
  renderActions(state);
  renderScores(state);
}

function renderScores(state){
  const board=document.getElementById("scoreBoard");
  const feed=document.getElementById("scoreFeed");
  if(!board)return;

  const scores=Array.isArray(state.scores)?state.scores:[0,0,0,0];
  const deltas=Array.isArray(state.roundDelta)?state.roundDelta:[0,0,0,0];

  board.innerHTML="";
  state.players.forEach((player,index)=>{
    const row=document.createElement("div");
    row.className="score-row"+(scores[index]<0?" score-row-neg":"");
    const delta=deltas[index]||0;
    row.innerHTML=`
      <div class="score-name">${seatDisplayName(index,player.name,state.players)}${player.won?'<span class="score-won">已胡</span>':""}</div>
      <div class="score-total">${scores[index]}</div>
      <div class="score-delta">${delta>0?"+"+delta:String(delta)}</div>
    `;
    board.appendChild(row);
  });

  if(feed){
    feed.innerHTML="";
    feed.hidden=true;
  }
}

function renderSeat(state,player,index,handlers){
  const seat=document.getElementById(`seat-${index}`);
  seat.innerHTML="";

  const isDealer=Number.isInteger(state.dealer)&&state.dealer===index;
  const isSide=index===1||index===3;
  const avatar=index===0?"🙂":"🤖";
  const header=document.createElement("div");
  header.className="seat-header"+(isSide?" seat-header-side":"");
  const statusClass=player.won?"seat-status seat-status-won":"seat-status seat-status-play";
  const statusText=player.won?"已胡":"进行中";
  const dealerBadge=isDealer?'<span class="dealer-badge">庄</span>':"";
  if(isSide){
    const nameLine=player.name
      ?`<div class="seat-name">${player.name}${dealerBadge}</div>`
      :(dealerBadge?`<div class="seat-name">${dealerBadge}</div>`:"");
    header.innerHTML=`
      <div class="seat-id">
        <span class="seat-avatar" aria-hidden="true">${avatar}</span>
        <div class="seat-text">
          <div class="seat-label">${SEAT_LABELS[index]}</div>
          ${nameLine}
          <div class="seat-meta">${player.hand.length}张${player.missingSuit?` · 缺${SUIT_LABEL[player.missingSuit]}`:""}</div>
          <div class="${statusClass}">${statusText}</div>
        </div>
      </div>
    `;
  }else{
    const namePart=player.name?` ${player.name}`:"";
    header.innerHTML=`
      <div class="seat-id">
        <span class="seat-avatar" aria-hidden="true">${avatar}</span>
        <div class="seat-text">
          <div class="seat-name">${SEAT_LABELS[index]}${namePart}${dealerBadge}</div>
          <div class="seat-meta">${player.hand.length}张${player.missingSuit?` · 缺${SUIT_LABEL[player.missingSuit]}`:""}${player.melds.length?` · 碰/杠×${player.melds.length}`:""}</div>
        </div>
      </div>
      <div class="${statusClass}">${statusText}</div>
    `;
  }
  seat.appendChild(header);

  const hand=document.createElement("div");
  hand.className="hand";

  if(index===1)hand.classList.add("hand-vertical","hand-left");
  if(index===3)hand.classList.add("hand-vertical","hand-right");

  const dealing=state.phase==="开局"&&state.dealing===true;
  const winTile=player.won?player.winTile:null;
  const lastIndex=player.hand.length-1;
  const legalSelf=
    index===0&&state.phase==="出牌"&&state.turn===0
      ?new Set(getLegalDiscardIndexes(player))
      :null;

  const handItems=
    index===0&&!player.won
      ?buildSelfHandDisplayOrder(player.hand,state.drawnTileId)
      :player.hand.map((tile,tileIndex)=>({tile,tileIndex,isDraw:false}));

  handItems.forEach(({tile,tileIndex,isDraw})=>{
    const isWinFace=
      Boolean(winTile) &&
      tileIndex===lastIndex &&
      tile.s===winTile.s &&
      tile.n===winTile.n;

    let el;
    if(index===0){
      el=createTileElement(tile);
      if(legalSelf&&!legalSelf.has(tileIndex))el.classList.add("tile-illegal");
    }else if(isWinFace){
      el=createTileElement(tile,"tile-small");
    }else{
      el=createTileElement(null,"tile-small");
    }

    if(isWinFace)el.classList.add("tile-win-show");
    if(dealing&&tileIndex===lastIndex)el.classList.add("tile-deal-in");

    if(index===0&&!player.won){
      if(isDraw||tile.id===state.drawnTileId)el.classList.add("tile-drawn");
      if(tileIndex===state.selectedTileIndex)el.classList.add("tile-selected");

      if(state.turn===0&&state.phase==="出牌"){
        el.addEventListener("click",()=>handlers.onTileClick(tileIndex));
      }
    }

    /* 新摸牌在最右侧：间隔插在已整理手牌与新摸牌之间 */
    if(index===0&&isDraw){
      const gap=document.createElement("div");
      gap.className="hand-draw-gap";
      gap.setAttribute("aria-hidden","true");
      hand.appendChild(gap);
    }

    hand.appendChild(el);
  });

  seat.appendChild(hand);

}

function renderMeldTile(item){
  const wrap=document.createElement("div");
  wrap.className="meld-tile-wrap";
  if(item.isSource)wrap.classList.add("meld-source");
  wrap.appendChild(
    item.face==="back"
      ?createTileElement(null,"tile-small")
      :createTileElement(item.tile,"tile-small")
  );
  return wrap;
}

/**
 * 统一副露 DOM：碰 / 明杠 / 补杠 / 暗杠
 * @param {object} meld
 * @param {number} ownerSeat
 */
export function renderMeld(meld,ownerSeat){
  const plan=buildMeldTilePlan(meld,ownerSeat);
  const group=document.createElement("div");
  group.className=`meld-group meld-type-${plan.type||"unknown"}`;
  if(plan.sourcePosition)group.classList.add(`meld-source-${plan.sourcePosition}`);
  group.style.setProperty("--meld-width-scale",String(plan.widthScale??1));

  const top=plan.layers?.top;
  const base=plan.layers?.base||[];

  if(top&&top.length){
    const stack=document.createElement("div");
    stack.className="meld-stack";

    const topLayer=document.createElement("div");
    topLayer.className="meld-layer meld-layer-top";
    top.forEach(item=>topLayer.appendChild(renderMeldTile(item)));

    const baseLayer=document.createElement("div");
    baseLayer.className="meld-layer meld-layer-base";
    base.forEach(item=>baseLayer.appendChild(renderMeldTile(item)));

    stack.appendChild(topLayer);
    stack.appendChild(baseLayer);
    group.appendChild(stack);
  }else{
    const flat=document.createElement("div");
    flat.className="meld-layer meld-layer-flat";
    base.forEach(item=>flat.appendChild(renderMeldTile(item)));
    group.appendChild(flat);
  }

  return group;
}

export function renderMelds(state){
  for(let index=0;index<4;index++){
    const zone=document.getElementById(`meld-${index}`);
    if(!zone)continue;
    zone.innerHTML="";

    const player=state.players[index];
    if(!player)continue;

    (player.melds||[]).forEach(meld=>{
      zone.appendChild(renderMeld(meld,index));
    });
  }
}

function resolveLatestDiscard(state){
  const tip=state.discards?.length?state.discards[state.discards.length-1]:null;
  const claim=state.lastDiscard;
  if(!tip||!claim)return null;
  if(tip.player!==claim.player||tip.tile?.id!==claim.tile?.id)return null;
  return tip;
}

function renderDiscards(state){
  const latest=resolveLatestDiscard(state);
  const cueKey=latest?`${latest.player}:${latest.tile?.id}:${state.discards.length}`:"";
  const shouldAnimate=Boolean(cueKey&&cueKey!==lastDiscardCueKey);
  if(cueKey)lastDiscardCueKey=cueKey;
  else lastDiscardCueKey="";

  for(let index=0;index<4;index++){
    const zone=document.getElementById(`discard-${index}`);
    if(!zone)continue;
    zone.innerHTML="";

    state.discards
      .filter(item=>item.player===index)
      .forEach(item=>{
        const isLatest=latest&&item===latest;
        const wrap=document.createElement("div");
        wrap.className="discard-tile-wrap";
        if(isLatest){
          wrap.classList.add("discard-tile-latest");
          if(shouldAnimate)wrap.classList.add("discard-tile-latest-animate");
        }
        wrap.appendChild(createTileElement(item.tile,"tile-discard discard-tile"));
        zone.appendChild(wrap);
      });
  }

  updateDiscardCue(latest,shouldAnimate,state.players);
}

let lastDiscardCueKey="";
let activePlayerEvent=null;
let activePlayerEventTimer=0;
let activePlayerEventRaf=0;
let activePlayerEventPriority=0;

function clearPlayerEventTimers(){
  if(activePlayerEventTimer){
    clearTimeout(activePlayerEventTimer);
    activePlayerEventTimer=0;
  }
  if(activePlayerEventRaf){
    cancelAnimationFrame(activePlayerEventRaf);
    activePlayerEventRaf=0;
  }
}

/** 立即移除当前座位事件提示（无动画） */
export function clearPlayerEvent(){
  clearPlayerEventTimers();
  if(activePlayerEvent?.parentNode)activePlayerEvent.remove();
  activePlayerEvent=null;
  activePlayerEventPriority=0;
}

function dismissPlayerEvent(){
  clearPlayerEventTimers();
  const el=activePlayerEvent;
  if(!el)return;
  el.classList.remove("is-show");
  el.classList.add("is-hide");
  const done=()=>{
    if(activePlayerEvent===el){
      el.remove();
      activePlayerEvent=null;
      activePlayerEventPriority=0;
    }
  };
  el.addEventListener("transitionend",done,{once:true});
  setTimeout(done,220);
}

function buildPlayerEventCopy({
  action,
  playerIndex,
  sourcePlayerIndex=null,
  sourcePengFrom=null,
  tile=null,
  players=[],
  viewerIndex=0
}){
  const actor=getPlayerDisplayName(playerIndex,viewerIndex,players);
  const tileLabel=tile?tileDisplayName(tile):"";
  switch(action){
    case "discard":
      return{name:actor,actionWord:"打出",tileLabel,detail:null,tone:"discard",layout:"stack"};
    case "peng":
      return{name:actor,actionWord:"碰",tileLabel,detail:null,tone:"claim",layout:"stack"};
    case "mingGang":
      return{name:actor,actionWord:"直杠",tileLabel,detail:null,tone:"claim",layout:"stack"};
    case "anGang":
      return{name:actor,actionWord:"暗杠",tileLabel,detail:null,tone:"claim",layout:"stack"};
    case "buGang":
      return{name:actor,actionWord:"补杠",tileLabel,detail:null,tone:"claim",layout:"stack"};
    case "hu":
      return{name:actor,actionWord:"胡",tileLabel,detail:null,tone:"hu",layout:"stack"};
    default:
      return{name:actor,actionWord:String(action||""),tileLabel,detail:null,tone:"claim",layout:"stack"};
  }
}

/**
 * 座位锚定的事件提示（单例替换）。
 * @param {object} options
 * @param {number} options.playerIndex 事件主角（出牌者 / 碰杠者 / 胡者）
 * @param {"discard"|"peng"|"mingGang"|"anGang"|"buGang"|"hu"} options.action
 * @param {object|null} [options.tile]
 * @param {number|null} [options.sourcePlayerIndex] 碰/直杠的出牌来源
 * @param {number|null} [options.sourcePengFrom] 补杠原碰来源
 * @param {Array} [options.players]
 * @param {number} [options.viewerIndex=0]
 * @param {number} [options.duration]
 * @param {string} [options.scoreText]
 * @param {boolean} [options.showSelfDiscard=false]
 */
export function showPlayerEvent(options={}){
  const playerIndex=Number(options.playerIndex);
  const action=options.action||"discard";
  if(!Number.isInteger(playerIndex)||playerIndex<0||playerIndex>3)return;

  if(action==="discard"&&playerIndex===0&&!options.showSelfDiscard)return;

  const priority=EVENT_PRIORITY[action]||1;
  if(activePlayerEvent&&priority<activePlayerEventPriority)return;

  const table=document.querySelector(".table");
  if(!table)return;

  const players=options.players||[];
  const viewerIndex=Number.isInteger(options.viewerIndex)?options.viewerIndex:0;
  const defaultDuration=
    action==="discard"
      ?1600
      :action==="peng"||action==="mingGang"||action==="buGang"||action==="anGang"
        ?1000
        :2200;
  const duration=Math.max(400,Number(options.duration)||defaultDuration);
  const copy=buildPlayerEventCopy({
    action,
    playerIndex,
    sourcePlayerIndex:options.sourcePlayerIndex??null,
    sourcePengFrom:options.sourcePengFrom??null,
    tile:options.tile||null,
    players,
    viewerIndex
  });
  const side=SEAT_SIDE[playerIndex]||"bottom";

  clearPlayerEvent();

  const el=document.createElement("div");
  el.className=`player-event-toast player-event-${side} player-event-${copy.tone}`;
  el.setAttribute("role","status");
  el.setAttribute("aria-live","polite");

  const nameEl=document.createElement("div");
  nameEl.className="player-event-name";
  nameEl.textContent=copy.name;
  el.appendChild(nameEl);

  const main=document.createElement("div");
  main.className="player-event-main";

  const actionEl=document.createElement("span");
  actionEl.className="player-event-action";
  actionEl.textContent=copy.actionWord;
  main.appendChild(actionEl);

  if(
    copy.tileLabel&&
    (action==="discard"||
      action==="peng"||
      action==="mingGang"||
      action==="anGang"||
      action==="buGang"||
      action==="hu")
  ){
    const tileNameEl=document.createElement("span");
    tileNameEl.className="player-event-tile-name";
    tileNameEl.textContent=copy.tileLabel;
    main.appendChild(tileNameEl);
  }

  if(options.tile){
    const mini=document.createElement("div");
    mini.className="player-event-mini-tile";
    mini.appendChild(createTileElement(options.tile,"tile-event-mini"));
    main.appendChild(mini);
  }

  el.appendChild(main);

  if(copy.detail){
    const detail=document.createElement("div");
    detail.className="player-event-detail";
    detail.textContent=copy.detail;
    el.appendChild(detail);
  }

  if(options.scoreText){
    const score=document.createElement("div");
    score.className="player-event-score";
    score.textContent=options.scoreText;
    el.appendChild(score);
  }

  table.appendChild(el);
  activePlayerEvent=el;
  activePlayerEventPriority=priority;

  activePlayerEventRaf=requestAnimationFrame(()=>{
    activePlayerEventRaf=0;
    el.classList.add("is-show");
  });

  activePlayerEventTimer=setTimeout(()=>{
    activePlayerEventTimer=0;
    dismissPlayerEvent();
  },duration);
}

function updateDiscardCue(latest,animate,players){
  if(!latest?.tile||!animate)return;
  showPlayerEvent({
    playerIndex:latest.player,
    action:"discard",
    tile:latest.tile,
    players:players||[],
    duration:1600
  });
}

/**
 * 兼容旧调用：碰/杠/胡座位飘字 → 统一走 showPlayerEvent
 */
export function showPlayerActionEffect(playerIndex,actionName,tile,scoreText=""){
  const map={
    碰:"peng",
    杠:"mingGang",
    明杠:"mingGang",
    直杠:"mingGang",
    暗杠:"anGang",
    补杠:"buGang",
    胡:"hu"
  };
  showPlayerEvent({
    playerIndex,
    action:map[actionName]||actionName||"peng",
    tile:tile||null,
    scoreText:scoreText||"",
    players:[],
    duration:1000
  });
}

function renderActions(state){
  const actions=document.getElementById("actions");

  if(state.phase==="出牌"&&state.turn===0){
    actions.textContent=state.selectedTileIndex===null
      ?"请先点一张牌，选中后会抬高。"
      :"再点一次同一张牌即可打出。";
  }else if(state.phase==="换三张"){
    actions.textContent="请选择任意三张牌进行交换。";
  }else if(state.phase==="定缺"){
    actions.textContent="请选择本局要打缺的一门。";
  }else if(state.phase==="等待操作"){
    actions.textContent="请选择碰、杠、胡或过。";
  }else if(state.phase==="开局"){
    actions.textContent=state.dealing?"正在从庄家起按顺序发牌…":"正在掷骰定庄…";
  }else if(state.phase==="准备"){
    actions.textContent="点击桌面中央「开始」进入新牌局。";
  }else if(state.phase==="结束"){
    actions.textContent="本局已结束。";
  }else{
    actions.textContent="电脑正在自动摸牌和出牌。";
  }
}

export function renderLog(messages){
  const el=document.getElementById("log");
  el.innerHTML="";

  /* 出牌流水不刷屏；只留碰/杠/胡/阶段等最近几条 */
  const discardLine=/打出\s|摸牌/;
  const filtered=(messages||[]).filter(message=>!discardLine.test(message));
  filtered.slice(-7).reverse().forEach(message=>{
    const p=document.createElement("p");
    p.textContent=message;
    el.appendChild(p);
  });
}

export function renderExchange(hand,selectedIndexes,onToggle){
  const box=document.getElementById("exchangeHand");
  const count=document.getElementById("exchangeCount");
  const confirm=document.getElementById("exchangeConfirm");

  box.innerHTML="";

  hand.forEach((tile,index)=>{
    const el=createTileElement(tile);
    el.dataset.exchangeIndex=String(index);

    const order=selectedIndexes.indexOf(index);
    if(order>=0){
      el.classList.add("exchange-selected");
      el.dataset.order=String(order+1);
    }

    box.appendChild(el);
  });

  count.textContent=`已选 ${selectedIndexes.length}/3`;
  confirm.disabled=selectedIndexes.length!==3;

  box.onclick=(event)=>{
    const tile=event.target.closest(".tile[data-exchange-index]");
    if(!tile||!box.contains(tile))return;
    const index=Number(tile.dataset.exchangeIndex);
    if(Number.isInteger(index))onToggle(index);
  };
}

export function showReaction(title,text,actions){
  const dock=document.getElementById("actionDock");
  const textBox=document.getElementById("actionDockText");
  const buttonBox=document.getElementById("actionDockButtons");

  textBox.textContent=text?`${title}：${text}`:title;
  buttonBox.innerHTML="";

  actions.forEach(action=>{
    const button=document.createElement("button");
    button.type="button";
    button.className=
      "action-dock-button" +
      (action.primary?" primary":"") +
      (action.label==="过"?" pass":"");

    if(action.tile&&action.label!=="过"){
      const tileWrap=document.createElement("div");
      tileWrap.className="reaction-tile";
      tileWrap.appendChild(createTileElement(action.tile,"tile-reaction"));
      button.appendChild(tileWrap);
    }

    const label=document.createElement("div");
    label.className="reaction-label";
    label.textContent=action.label;
    button.appendChild(label);

    button.onclick=()=>{
      dock.classList.remove("show");
      buttonBox.innerHTML="";
      action.run();
    };
    buttonBox.appendChild(button);
  });

  dock.classList.add("show");
}

export function hideReaction(){
  const dock=document.getElementById("actionDock");
  const buttonBox=document.getElementById("actionDockButtons");
  dock.classList.remove("show");
  buttonBox.innerHTML="";
}

export function showWin(headline,info,onContinue,mannerNote="",winTile=null){
  document.getElementById("winHeading").textContent="胡牌";
  document.getElementById("winTitle").textContent=headline;
  const breakdownBits=[];
  if(info?.basePattern){
    breakdownBits.push(`基础牌型：${info.basePattern} ${info.baseFan??"?"}番`);
  }
  if(info?.rootCount!=null)breakdownBits.push(`根：${info.rootCount}`);
  (info?.extraFans||[]).forEach(e=>breakdownBits.push(`${e.label}+${e.fan}番`));
  if(info?.totalFan!=null)breakdownBits.push(`总番 ${info.totalFan} · ×${info.multiplier??1}`);
  const parts=[mannerNote,info?.detail,...breakdownBits].filter(Boolean);
  document.getElementById("winDetail").textContent=parts.join(" · ");

  const face=document.getElementById("winTileFace");
  if(face){
    face.innerHTML="";
    if(winTile){
      face.hidden=false;
      face.appendChild(createTileElement(winTile,"tile-win"));
    }else{
      face.hidden=true;
    }
  }

  const scoreEl=document.getElementById("winScore");
  if(scoreEl){
    scoreEl.textContent=info?.scoreLine||"";
    scoreEl.hidden=!info?.scoreLine;
  }
  document.getElementById("winContinue").textContent="继续血战";
  document.getElementById("winModal").classList.add("show");

  const button=document.getElementById("winContinue");
  button.onclick=()=>{
    document.getElementById("winModal").classList.remove("show");
    onContinue();
  };
}

export function showRoundEnd(reason,summary,onNewGame,settlement=null){
  document.getElementById("roundEndTitle").textContent=reason;
  const pigLines=(settlement?.flowerPigResults||[])
    .filter(r=>r.isFlowerPig)
    .map(r=>{
      const suit=r.missingSuitLabel||r.missingSuit||"";
      return r.paid
        ?`${r.name}花猪（缺${suit}）${r.note?` · ${r.note}`:""}`
        :`${r.name}花猪（缺${suit}）· 罚分待配置`;
    });
  const detail=[
    "本局战况如下，可再看一眼桌面，或直接开下一局。",
    pigLines.length?`花猪：${pigLines.join("；")}`:""
  ].filter(Boolean).join("\n");
  document.getElementById("roundEndDetail").textContent=detail;

  const list=document.getElementById("roundEndSummary");
  if(list){
    list.innerHTML="";
    (summary||[]).forEach(row=>{
      const el=document.createElement("div");
      el.className="round-sum-row"+(row.total<0?" score-row-neg":"");
      const delta=row.delta||0;
      const miss=row.missingSuitLabel?` · 缺${row.missingSuitLabel}`:"";
      el.innerHTML=`
        <div class="round-sum-name">${row.name}${miss}</div>
        <div class="round-sum-status">${row.status||(row.won?"已胡":"未胡")}</div>
        <div class="round-sum-delta">${delta>0?"+"+delta:String(delta)}</div>
        <div class="round-sum-total">总分 ${row.total}</div>
      `;
      list.appendChild(el);
    });
  }

  document.getElementById("roundEndModal").classList.add("show");

  const stay=document.getElementById("roundEndStay");
  const neu=document.getElementById("roundEndNew");
  stay.onclick=()=>{
    document.getElementById("roundEndModal").classList.remove("show");
  };
  neu.onclick=()=>{
    document.getElementById("roundEndModal").classList.remove("show");
    onNewGame();
  };
}

export function hideRoundReveal(){
  const modal=document.getElementById("roundRevealModal");
  if(modal)modal.classList.remove("show");
}

/**
 * 终局合并面板：得分说明 + 每家一行牌面（副露/手牌/听牌）
 */
export function renderRoundReveal(state,settlement,handlers={}){
  const modal=document.getElementById("roundRevealModal");
  const list=document.getElementById("roundRevealList");
  if(!modal||!list)return;

  const reason=handlers.reason||"";
  const summary=handlers.summary||null;
  const titleEl=document.getElementById("roundRevealReason");
  const detailEl=document.getElementById("roundRevealDetail");
  if(titleEl)titleEl.textContent=reason||"本局结束";
  if(detailEl){
    detailEl.textContent="";
    detailEl.hidden=true;
  }

  const pigs=new Set(
    (settlement?.flowerPigResults||[])
      .filter(r=>r.isFlowerPig)
      .map(r=>r.playerIndex)
  );
  const readyMap=new Map(
    (settlement?.readyHandResults||[]).map(r=>[r.playerIndex,r])
  );
  const summaryMap=new Map(
    (summary||[]).map((row,i)=>[i,row])
  );

  list.innerHTML="";
  (state.players||[]).forEach((player,index)=>{
    const card=document.createElement("section");
    card.className="reveal-seat";

    const sum=summaryMap.get(index);
    const ready=readyMap.get(index);
    const tags=[];
    if(player.won||sum?.won)tags.push(["已胡","reveal-tag-won"]);
    if(pigs.has(index)||sum?.flowerPig)tags.push(["花猪","reveal-tag-pig"]);
    if(!(player.won||sum?.won)&&!(pigs.has(index)||sum?.flowerPig)){
      if(ready?.isReady||sum?.isReady)tags.push(["已下叫","reveal-tag-ready"]);
      else if(ready||sum?.isReady===false)tags.push(["未下叫","reveal-tag-noready"]);
    }
    const missLabel=sum?.missingSuitLabel||(player.missingSuit?SUIT_LABEL[player.missingSuit]:"");
    if(missLabel)tags.push([`缺${missLabel}`,"reveal-tag-miss"]);

    const bits=sum?.bits||[];
    const delta=sum?.delta??0;
    const total=sum?.total??0;

    const head=document.createElement("div");
    head.className="reveal-seat-head";
    head.innerHTML=`
      <div class="reveal-seat-top">
        <div class="reveal-seat-name">${seatDisplayName(index,player.name,state.players)}</div>
        <div class="reveal-seat-tags">${
          tags.map(([text,cls])=>`<span class="reveal-tag ${cls}">${text}</span>`).join("")
        }</div>
        <div class="reveal-seat-bits">${
          bits.length
            ?bits.map(b=>`<span class="reveal-bit">${b}</span>`).join("")
            :`<span class="reveal-bit reveal-bit-muted">${sum?.status||"本局无独立流水"}</span>`
        }</div>
        <div class="reveal-seat-score">
          <span class="reveal-delta">${delta>0?"+"+delta:String(delta)}</span>
          <span class="reveal-total">总分 ${total}</span>
        </div>
      </div>
    `;
    card.appendChild(head);

    const tilesRow=document.createElement("div");
    tilesRow.className="reveal-tiles-row";

    (player.melds||[]).forEach(meld=>{
      const group=document.createElement("div");
      group.className="reveal-meld-group";
      (meld.tiles||[]).forEach(tile=>{
        group.appendChild(createTileElement(tile,"tile-reveal"));
      });
      tilesRow.appendChild(group);
    });

    const handGroup=document.createElement("div");
    handGroup.className="reveal-hand-inline";
    const winTile=player.won?player.winTile:null;
    const hand=player.hand||[];
    let winHandIndex=-1;
    if(winTile){
      for(let i=hand.length-1;i>=0;i--){
        const t=hand[i];
        if(winTile.id&&t.id===winTile.id){winHandIndex=i;break;}
        if(t.s===winTile.s&&t.n===winTile.n){winHandIndex=i;break;}
      }
    }
    hand.forEach((tile,tileIndex)=>{
      const el=createTileElement(tile,"tile-reveal");
      if(tileIndex===winHandIndex)el.classList.add("tile-reveal-win");
      handGroup.appendChild(el);
    });
    if(hand.length)tilesRow.appendChild(handGroup);

    if(player.won&&winTile){
      const winGroup=document.createElement("div");
      winGroup.className="reveal-win-inline";
      const lab=document.createElement("span");
      lab.className="reveal-win-inline-label";
      lab.textContent="胡";
      winGroup.appendChild(lab);
      const winEl=createTileElement(
        {s:winTile.s,n:winTile.n,id:winTile.id||`reveal-hu-${index}`},
        "tile-reveal tile-reveal-win"
      );
      winGroup.appendChild(winEl);
      tilesRow.appendChild(winGroup);
    }

    const waits=ready?.waitingTiles||sum?.waitingTiles||[];
    if((ready?.isReady||sum?.isReady)&&waits.length){
      const waitGroup=document.createElement("div");
      waitGroup.className="reveal-wait-inline";
      const lab=document.createElement("span");
      lab.className="reveal-wait-inline-label";
      lab.textContent="听";
      waitGroup.appendChild(lab);
      waits.forEach((tile,ti)=>{
        waitGroup.appendChild(
          createTileElement(
            {s:tile.s,n:tile.n,id:`reveal-wait-${index}-${ti}`},
            "tile-reveal"
          )
        );
      });
      tilesRow.appendChild(waitGroup);
    }

    card.appendChild(tilesRow);
    list.appendChild(card);
  });

  modal.classList.add("show");
  document.getElementById("roundEndModal")?.classList.remove("show");

  const btnNew=document.getElementById("roundRevealNew");
  const btnSettle=document.getElementById("roundRevealSettle");
  const btnClose=document.getElementById("roundRevealClose");
  if(btnNew){
    btnNew.onclick=()=>{
      hideRoundReveal();
      handlers.onNewGame?.();
    };
  }
  if(btnSettle){
    btnSettle.hidden=true;
    btnSettle.onclick=null;
  }
  if(btnClose){
    btnClose.onclick=()=>{
      hideRoundReveal();
      handlers.onClose?.();
    };
  }
}


export function showMissingSuitModal(hand,onPick){
  const modal=document.getElementById("missingSuitModal");
  if(!modal)return;

  const handBox=document.getElementById("missingSuitHand");
  if(handBox){
    handBox.innerHTML="";
    (hand||[]).forEach(tile=>{
      const el=createTileElement(tile);
      el.classList.add("tile-readonly");
      el.style.cursor="default";
      handBox.appendChild(el);
    });
  }

  const counts={w:0,t:0,b:0};
  (hand||[]).forEach(tile=>{if(counts[tile.s]!=null)counts[tile.s]++;});

  const actions=document.getElementById("missingSuitActions");
  if(actions){
    actions.innerHTML="";
    const options=[
      {suit:"w",label:"缺万",sample:{s:"w",n:5,id:"ms-w"}},
      {suit:"t",label:"缺条",sample:{s:"t",n:5,id:"ms-t"}},
      {suit:"b",label:"缺筒",sample:{s:"b",n:5,id:"ms-b"}}
    ];
    options.forEach(({suit,label,sample})=>{
      const btn=document.createElement("button");
      btn.type="button";
      btn.className="missing-suit-pick";
      btn.dataset.suit=suit;
      btn.setAttribute("aria-label",`${label}（手中${counts[suit]}张）`);

      const face=createTileElement(sample,"tile-missing-suit");
      face.style.cursor="inherit";
      btn.appendChild(face);

      const caption=document.createElement("span");
      caption.className="missing-suit-pick-label";
      caption.textContent=label;
      btn.appendChild(caption);

      const meta=document.createElement("span");
      meta.className="missing-suit-pick-meta";
      meta.textContent=`手中 ${counts[suit]} 张`;
      btn.appendChild(meta);

      btn.onclick=()=>onPick(suit);
      actions.appendChild(btn);
    });
  }

  modal.classList.add("show");
}

export function hideMissingSuitModal(){
  document.getElementById("missingSuitModal")?.classList.remove("show");
  const handBox=document.getElementById("missingSuitHand");
  if(handBox)handBox.innerHTML="";
  const actions=document.getElementById("missingSuitActions");
  if(actions)actions.innerHTML="";
}

export function hideStartOverlay(){
  const overlay=document.getElementById("startOverlay");
  if(!overlay)return;
  overlay.hidden=true;
  overlay.classList.remove("lobby-mode");
  ["dieA","dieB","dieC"].forEach(id=>{
    document.getElementById(id)?.classList.remove("rolling");
  });
}

/** 打开网页大厅：显示骰子 + 开始按钮，不自动开局 */
export function showLobby(){
  const overlay=document.getElementById("startOverlay");
  const caption=document.getElementById("startCaption");
  const btn=document.getElementById("lobbyStartBtn");
  if(!overlay)return;
  overlay.hidden=false;
  overlay.classList.add("lobby-mode");
  if(caption)caption.textContent="掷骰坐庄 · 点击开始";
  ["dieA","dieB","dieC"].forEach((id,i)=>{
    const die=document.getElementById(id);
    if(die){
      die.classList.remove("rolling");
      die.dataset.face=String(i+3); /* 静态展示 3/4/5 */
    }
  });
  if(btn)btn.hidden=false;
}

/**
 * 开局掷骰动画（3 颗）。返回三枚点数。
 * @param {{caption:string,resultCaption:(a:number,b:number,c:number)=>string}} opts
 */
export async function playDiceAnimation(opts={}){
  const overlay=document.getElementById("startOverlay");
  const dice=["dieA","dieB","dieC"].map(id=>document.getElementById(id));
  const caption=document.getElementById("startCaption");
  const btn=document.getElementById("lobbyStartBtn");
  if(!overlay||dice.some(d=>!d)||!caption)return {a:1,b:1,c:1};

  overlay.hidden=false;
  overlay.classList.remove("lobby-mode");
  if(btn)btn.hidden=true;
  caption.textContent=opts.caption||"掷骰中…";
  dice.forEach(die=>die.classList.add("rolling"));

  const rollMs=1100;
  const started=performance.now();
  while(performance.now()-started<rollMs){
    dice.forEach(die=>{
      die.dataset.face=String(1+Math.floor(Math.random()*6));
    });
    await wait(70);
  }

  const faces=dice.map(()=>1+Math.floor(Math.random()*6));
  dice.forEach((die,i)=>{
    die.dataset.face=String(faces[i]);
    die.classList.remove("rolling");
  });
  const [a,b,c]=faces;
  caption.textContent=typeof opts.resultCaption==="function"
    ?opts.resultCaption(a,b,c)
    :`骰点 ${a}+${b}+${c}=${a+b+c}`;
  await wait(900);
  return {a,b,c};
}

export async function flashDealCaption(text){
  const overlay=document.getElementById("startOverlay");
  const caption=document.getElementById("startCaption");
  const board=document.querySelector(".dice-board");
  if(!overlay||!caption)return;
  overlay.hidden=false;
  if(board)board.style.opacity="0.35";
  caption.textContent=text;
}

export function clearDealCaption(){
  const board=document.querySelector(".dice-board");
  if(board)board.style.opacity="";
  hideStartOverlay();
}
