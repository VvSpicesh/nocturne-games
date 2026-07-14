import {tileFace,tileName} from "./tiles.js";

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
  document.getElementById("turn").textContent=`轮到：${state.players[state.turn].name}`;
  document.getElementById("statPhase").textContent=state.phase;
  document.getElementById("statTurn").textContent=state.players[state.turn].name;
  document.getElementById("statWall").textContent=state.wall.length;
  document.getElementById("statStatus").textContent=state.players[0].won?"已胡":"未胡";

  state.players.forEach((player,index)=>renderSeat(state,player,index,handlers));
  renderDiscards(state);
  renderActions(state);
}

function renderSeat(state,player,index,handlers){
  const seat=document.getElementById(`seat-${index}`);
  seat.innerHTML="";

  const header=document.createElement("div");
  header.className="seat-header";
  header.innerHTML=`
    <div>
      <div class="seat-name">${index===0?"🙂":"🤖"} ${player.name}</div>
      <div class="seat-meta">${player.hand.length}张 · ${player.melds.length}组副露</div>
    </div>
    <div class="seat-meta">${player.won?"已胡":"进行中"}</div>
  `;
  seat.appendChild(header);

  const hand=document.createElement("div");
  hand.className="hand";

  if(index===1)hand.classList.add("hand-vertical","hand-left");
  if(index===3)hand.classList.add("hand-vertical","hand-right");

  player.hand.forEach((tile,tileIndex)=>{
    const el=index===0?createTileElement(tile):createTileElement(null,"tile-small");

    if(index===0){
      if(tile.id===state.drawnTileId)el.classList.add("tile-drawn");
      if(tileIndex===state.selectedTileIndex)el.classList.add("tile-selected");

      if(state.turn===0&&state.phase==="出牌"){
        el.addEventListener("click",()=>handlers.onTileClick(tileIndex));
      }
    }

    hand.appendChild(el);
  });

  seat.appendChild(hand);

  if(player.melds.length){
    const melds=document.createElement("div");
    melds.className="melds";

    player.melds.forEach(meld=>{
      const group=document.createElement("div");
      group.className="meld";
      group.title={peng:"碰",mingGang:"明杠",anGang:"暗杠",buGang:"补杠"}[meld.type]||meld.type;
      meld.tiles.forEach(tile=>group.appendChild(createTileElement(tile,"tile-small")));
      melds.appendChild(group);
    });

    seat.appendChild(melds);
  }
}

function renderDiscards(state){
  for(let index=0;index<4;index++){
    const zone=document.getElementById(`discard-${index}`);
    zone.innerHTML="";

    state.discards
      .filter(item=>item.player===index)
      .forEach(item=>zone.appendChild(createTileElement(item.tile,"tile-small")));
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
  }else{
    actions.textContent="电脑正在自动摸牌和出牌。";
  }
}

export function renderLog(messages){
  const el=document.getElementById("log");
  el.innerHTML="";

  [...messages].reverse().forEach(message=>{
    const p=document.createElement("p");
    p.textContent=message;
    el.appendChild(p);
  });
}

export function renderExchange(hand,selectedIndexes,onToggle){
  const box=document.getElementById("exchangeHand");
  box.innerHTML="";

  hand.forEach((tile,index)=>{
    const el=createTileElement(tile);
    if(selectedIndexes.includes(index))el.classList.add("tile-selected");
    el.addEventListener("click",()=>onToggle(index));
    box.appendChild(el);
  });

  document.getElementById("exchangeConfirm").disabled=selectedIndexes.length!==3;
}

export function showReaction(title,text,actions){
  document.getElementById("reactionTitle").textContent=title;
  document.getElementById("reactionText").textContent=text;

  const box=document.getElementById("reactionButtons");
  box.innerHTML="";

  actions.forEach(action=>{
    const button=document.createElement("button");
    button.className="btn "+(action.primary?"btn-primary":"");
    button.textContent=action.label;
    button.onclick=()=>{
      document.getElementById("reactionModal").classList.remove("show");
      action.run();
    };
    box.appendChild(button);
  });

  document.getElementById("reactionModal").classList.add("show");
}

export function showWin(playerName,info,onContinue){
  document.getElementById("winTitle").textContent=`${playerName}：${info.name}`;
  document.getElementById("winDetail").textContent=info.detail;
  document.getElementById("winModal").classList.add("show");

  const button=document.getElementById("winContinue");
  button.onclick=()=>{
    document.getElementById("winModal").classList.remove("show");
    onContinue();
  };
}
