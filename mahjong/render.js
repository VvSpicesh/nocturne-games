import {tileFace,tileName} from "./tiles.js?v=0.14.22";

const SEAT_LABELS=["自己","上家","对家","下家"];

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

export function createTileElement(tile,className=""){
  const el=document.createElement("div");
  el.className=`tile ${className}`;

  if(tile){
    el.innerHTML=tileFace(tile);
    el.title=tileName(tile);
    el.dataset.id=tile.id;
  }else{
    el.classList.add("tile-back");
  }

  return el;
}

export function renderGame(state,handlers){
  document.getElementById("remaining").textContent=state.wall.length;
  document.getElementById("phase").textContent=state.phase;
  const turnIndex=state.turn;
  const turnName=state.players[turnIndex]
    ?`${SEAT_LABELS[turnIndex]} ${state.players[turnIndex].name}`
    :"—";
  const dealerName=state.players[state.dealer]
    ?`${SEAT_LABELS[state.dealer]} ${state.players[state.dealer].name}`
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
      <div class="score-name">${SEAT_LABELS[index]} ${player.name}${player.won?'<span class="score-won">已胡</span>':""}</div>
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
    header.innerHTML=`
      <div class="seat-id">
        <span class="seat-avatar" aria-hidden="true">${avatar}</span>
        <div class="seat-text">
          <div class="seat-label">${SEAT_LABELS[index]}</div>
          <div class="seat-name">${player.name}${dealerBadge}</div>
          <div class="seat-meta">${player.hand.length}张</div>
          <div class="${statusClass}">${statusText}</div>
        </div>
      </div>
    `;
  }else{
    header.innerHTML=`
      <div class="seat-id">
        <span class="seat-avatar" aria-hidden="true">${avatar}</span>
        <div class="seat-text">
          <div class="seat-name">${SEAT_LABELS[index]} ${player.name}${dealerBadge}</div>
          <div class="seat-meta">${player.hand.length}张${player.melds.length?` · 碰/杠×${player.melds.length}`:""}</div>
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

  player.hand.forEach((tile,tileIndex)=>{
    const isWinFace=
      Boolean(winTile) &&
      tileIndex===lastIndex &&
      tile.s===winTile.s &&
      tile.n===winTile.n;

    let el;
    if(index===0){
      el=createTileElement(tile);
    }else if(isWinFace){
      el=createTileElement(tile,"tile-small");
    }else{
      el=createTileElement(null,"tile-small");
    }

    if(isWinFace)el.classList.add("tile-win-show");
    if(dealing&&tileIndex===lastIndex)el.classList.add("tile-deal-in");

    if(index===0&&!player.won){
      if(tile.id===state.drawnTileId)el.classList.add("tile-drawn");
      if(tileIndex===state.selectedTileIndex)el.classList.add("tile-selected");

      if(state.turn===0&&state.phase==="出牌"){
        el.addEventListener("click",()=>handlers.onTileClick(tileIndex));
      }
    }

    hand.appendChild(el);
  });

  seat.appendChild(hand);

}

function renderMelds(state){
  for(let index=0;index<4;index++){
    const zone=document.getElementById(`meld-${index}`);
    zone.innerHTML="";

    const player=state.players[index];

    player.melds.forEach(meld=>{
      const group=document.createElement("div");
      group.className="meld-group"+(meld.type==="anGang"?" meld-group-angang":"");
      group.title={
        peng:"碰",
        mingGang:"杠",
        anGang:"暗杠",
        buGang:"补杠"
      }[meld.type]||meld.type;

      const tiles=meld.tiles||[];
      tiles.forEach((tile,tileIndex)=>{
        /* 暗杠：他家全牌背；自家露一张让自己认得 */
        if(meld.type==="anGang"){
          const showFace=index===0&&tileIndex===tiles.length-1;
          group.appendChild(
            showFace
              ?createTileElement(tile,"tile-small")
              :createTileElement(null,"tile-small")
          );
        }else{
          group.appendChild(createTileElement(tile,"tile-small"));
        }
      });

      zone.appendChild(group);
    });
  }
}

function renderDiscards(state){
  for(let index=0;index<4;index++){
    const zone=document.getElementById(`discard-${index}`);
    zone.innerHTML="";

    state.discards
      .filter(item=>item.player===index)
      .forEach(item=>zone.appendChild(createTileElement(item.tile,"tile-discard")));
  }
}

function renderActions(state){
  const actions=document.getElementById("actions");

  if(state.phase==="出牌"&&state.turn===0){
    actions.textContent=state.selectedTileIndex===null
      ?"请先点一张牌，选中后会抬高。"
      :"再点一次同一张牌即可打出。";
  }else if(state.phase==="换三张"){
    actions.textContent="请选择任意三张牌进行交换。";
  }else if(state.phase==="等待操作"){
    actions.textContent="请选择碰、杠、胡或过。";
  }else if(state.phase==="开局"){
    actions.textContent=state.dealing?"正在从庄家起按顺序发牌…":"正在掷骰定庄…";
  }else if(state.phase==="准备"){
    actions.textContent="点击桌面中央「开始」进入新牌局。";
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

/**
 * Non-blocking floating cue near a player seat.
 * Does not pause game flow.
 */
export function showPlayerActionEffect(playerIndex,actionName,tile,scoreText=""){
  const table=document.querySelector(".table");
  if(!table)return;

  const sides=["bottom","left","top","right"];
  const el=document.createElement("div");
  el.className=`player-action-effect player-action-${sides[playerIndex]||"bottom"}`;
  el.setAttribute("aria-hidden","true");

  const label=document.createElement("div");
  label.className="effect-label";
  label.textContent=actionName;
  el.appendChild(label);

  if(scoreText){
    const score=document.createElement("div");
    score.className="effect-score";
    score.textContent=scoreText;
    el.appendChild(score);
  }

  if(tile){
    const tileWrap=document.createElement("div");
    tileWrap.className="effect-tile";
    tileWrap.appendChild(createTileElement(tile,"tile-effect"));
    el.appendChild(tileWrap);
  }

  table.appendChild(el);

  const cleanup=()=>{
    if(el.parentNode)el.remove();
  };

  el.addEventListener("animationend",cleanup,{once:true});
  window.setTimeout(cleanup,3200);
}

export function showWin(headline,info,onContinue,mannerNote="",winTile=null){
  document.getElementById("winHeading").textContent="胡牌";
  document.getElementById("winTitle").textContent=headline;
  const parts=[mannerNote,info?.detail].filter(Boolean);
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

export function showRoundEnd(reason,summary,onNewGame){
  document.getElementById("roundEndTitle").textContent=reason;
  document.getElementById("roundEndDetail").textContent="本局战况如下，可再看一眼桌面，或直接开下一局。";

  const list=document.getElementById("roundEndSummary");
  if(list){
    list.innerHTML="";
    (summary||[]).forEach(row=>{
      const el=document.createElement("div");
      el.className="round-sum-row"+(row.total<0?" score-row-neg":"");
      const delta=row.delta||0;
      el.innerHTML=`
        <div class="round-sum-name">${row.name}</div>
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
