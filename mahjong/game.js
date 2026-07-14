import {renderGame,renderLog,renderExchange,showReaction,showWin} from "./render.js";
import {saveState,loadState,clearState} from "./storage.js";
import {loadRules,saveRules} from "./config.js";
import {tileName} from "./tiles.js";
import {getWinInfo} from "./hu.js";

const names=["你","阿麻","小川","幺鸡"];
let rules=loadRules();
let state=loadState();
let aiTimer=null;
let exchangeSelection=[];

function compatible(candidate){
  return Boolean(
    candidate &&
    candidate.version==="0.8" &&
    Array.isArray(candidate.players) &&
    candidate.players.length===4 &&
    candidate.players.every(p=>Array.isArray(p.hand)&&Array.isArray(p.melds)) &&
    Array.isArray(candidate.wall) &&
    Array.isArray(candidate.discards)
  );
}

if(!compatible(state)){
  clearState();
  state=createInitialState();
}

const ruleExchange=document.getElementById("ruleExchange");
const ruleGang=document.getElementById("ruleGang");
ruleExchange.checked=rules.exchangeThree;
ruleGang.checked=rules.gangRain;

ruleExchange.addEventListener("change",()=>{
  rules.exchangeThree=ruleExchange.checked;
  saveRules(rules);
});
ruleGang.addEventListener("change",()=>{
  rules.gangRain=ruleGang.checked;
  saveRules(rules);
});

function createInitialState(){
  return {
    version:"0.8",
    phase:"准备",
    wall:[],
    players:names.map(name=>({name,hand:[],won:false,melds:[]})),
    turn:0,
    discards:[],
    logs:["欢迎来到 Nocturne Mahjong。"],
    drawnTileId:null,
    selectedTileIndex:null,
    activeRules:{...rules},
    lastAction:null,
    lastDiscard:null,
    pendingGang:null
  };
}

function createWall(){
  const wall=[];
  for(const suit of ["w","t","b"]){
    for(let number=1;number<=9;number++){
      for(let copy=0;copy<4;copy++){
        wall.push({s:suit,n:number,id:`${suit}${number}-${copy}`});
      }
    }
  }
  for(let i=wall.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [wall[i],wall[j]]=[wall[j],wall[i]];
  }
  return wall;
}

function sortHand(hand){
  const order={w:0,t:1,b:2};
  hand.sort((a,b)=>order[a.s]-order[b.s]||a.n-b.n);
}

function sameTile(a,b){
  return a&&b&&a.s===b.s&&a.n===b.n;
}

function matchingIndexes(hand,tile){
  const result=[];
  hand.forEach((item,index)=>{if(sameTile(item,tile))result.push(index)});
  return result;
}

function cloneTile(tile){
  return {s:tile.s,n:tile.n,id:tile.id||`${tile.s}${tile.n}-${Math.random()}`};
}

function newGame(){
  clearTimeout(aiTimer);
  rules=loadRules();

  const wall=createWall();
  const players=names.map(name=>({name,hand:[],won:false,melds:[]}));

  for(let round=0;round<13;round++){
    for(let player=0;player<4;player++){
      players[player].hand.push(wall.pop());
    }
  }
  players.forEach(player=>sortHand(player.hand));

  state={
    version:"0.8",
    phase:rules.exchangeThree?"换三张":"摸牌",
    wall,players,turn:0,discards:[],
    logs:[`新牌局开始。换三张：${rules.exchangeThree?"开启":"关闭"}；刮风下雨：${rules.gangRain?"开启":"关闭"}。`],
    drawnTileId:null,
    selectedTileIndex:null,
    activeRules:{...rules},
    lastAction:null,
    lastDiscard:null,
    pendingGang:null
  };

  commit();

  if(rules.exchangeThree)openExchange();
  else scheduleAutoDraw();
}

function openExchange(){
  exchangeSelection=[];
  renderExchange(state.players[0].hand,exchangeSelection,toggleExchangeTile);
  document.getElementById("exchangeModal").classList.add("show");
}

function toggleExchangeTile(index){
  const pos=exchangeSelection.indexOf(index);
  if(pos>=0)exchangeSelection.splice(pos,1);
  else{
    if(exchangeSelection.length>=3)return toast("只能选择三张");
    exchangeSelection.push(index);
  }
  renderExchange(state.players[0].hand,exchangeSelection,toggleExchangeTile);
}

document.getElementById("exchangeConfirm").addEventListener("click",()=>{
  if(exchangeSelection.length!==3)return;

  const outgoing=exchangeSelection.sort((a,b)=>b-a).map(i=>state.players[0].hand.splice(i,1)[0]);
  const all=[outgoing];

  for(let p=1;p<4;p++){
    const chosen=chooseExchangeTiles(state.players[p].hand);
    all[p]=chosen.sort((a,b)=>b-a).map(i=>state.players[p].hand.splice(i,1)[0]);
  }

  for(let p=0;p<4;p++){
    state.players[p].hand.push(...all[(p+3)%4]);
    sortHand(state.players[p].hand);
  }

  state.logs.push("换三张完成。");
  state.phase="摸牌";
  document.getElementById("exchangeModal").classList.remove("show");
  commit();
  scheduleAutoDraw();
});

function chooseExchangeTiles(hand){
  return hand.map((tile,index)=>({index,score:keepScore(tile,hand)}))
    .sort((a,b)=>a.score-b.score).slice(0,3).map(x=>x.index);
}

function scheduleAutoDraw(delay){
  clearTimeout(aiTimer);
  if(state.phase!=="摸牌")return;
  aiTimer=setTimeout(autoDraw,delay??(state.turn===0?260:420));
}

function autoDraw(){
  if(state.phase!=="摸牌"||!state.wall.length){
    if(!state.wall.length)endRound("牌墙摸完");
    return;
  }

  const player=state.players[state.turn];
  const tile=state.wall.pop();
  player.hand.push(tile);
  sortHand(player.hand);

  state.drawnTileId=tile.id;
  state.selectedTileIndex=null;
  state.logs.push(`${player.name}摸牌。`);
  state.phase="出牌";

  const info=getWinInfo(player.hand,player.melds,{
    gangFlower:state.lastAction?.type==="gang"&&state.lastAction.player===state.turn
  });

  if(info.canWin){
    if(state.turn===0){
      commit();
      showReaction("可以胡牌",info.name,[
        {label:"胡",primary:true,run:()=>declareSelfWin(0,info)},
        {label:"过",run:()=>afterDrawActions()}
      ]);
      return;
    }

    declareSelfWin(state.turn,info);
    return;
  }

  afterDrawActions();
}

function afterDrawActions(){
  const player=state.players[state.turn];
  const concealed=findConcealedGang(player);
  const added=findAddedGang(player);

  if(state.activeRules.gangRain&&(concealed||added)){
    if(state.turn===0){
      const actions=[];
      if(concealed)actions.push({label:"暗杠",primary:true,run:()=>doConcealedGang(0,concealed)});
      if(added)actions.push({label:"补杠",primary:!concealed,run:()=>attemptAddedGang(0,added)});
      actions.push({label:"过",run:()=>{commit()}});
      commit();
      showReaction("可以杠牌","请选择操作",actions);
      return;
    }

    if(concealed){doConcealedGang(state.turn,concealed);return}
    if(added){attemptAddedGang(state.turn,added);return}
  }

  commit();
  if(state.turn!==0)aiTimer=setTimeout(aiDiscard,500);
}

function findConcealedGang(player){
  const map=new Map();
  player.hand.forEach(tile=>{
    const key=tile.s+tile.n;
    const entry=map.get(key)||{tile,count:0};
    entry.count++;
    map.set(key,entry);
  });
  return [...map.values()].find(x=>x.count===4)||null;
}

function findAddedGang(player){
  for(const meld of player.melds){
    if(meld.type!=="peng")continue;
    const tile=meld.tiles[0];
    const index=player.hand.findIndex(item=>sameTile(item,tile));
    if(index>=0)return {meld,tile,index};
  }
  return null;
}

function handleTileClick(tileIndex){
  if(state.turn!==0||state.phase!=="出牌")return;
  if(state.selectedTileIndex===tileIndex){
    discard(0,tileIndex);
    return;
  }
  state.selectedTileIndex=tileIndex;
  commit();
}

function discard(playerIndex,tileIndex){
  const player=state.players[playerIndex];
  const [tile]=player.hand.splice(tileIndex,1);

  state.discards.push({player:playerIndex,tile});
  state.lastDiscard={player:playerIndex,tile};
  state.logs.push(`${player.name}打出 ${tileName(tile)}。`);
  state.drawnTileId=null;
  state.selectedTileIndex=null;
  state.phase="等待操作";
  commit();

  resolveDiscard(tile,playerIndex);
}

function resolveDiscard(tile,fromPlayer){
  const candidates=activePlayersAfter(fromPlayer);

  const winners=candidates.filter(index=>{
    const p=state.players[index];
    const test=p.hand.concat([cloneTile(tile)]);
    return getWinInfo(test,p.melds,{
      gangDiscard:state.lastAction?.type==="gang"&&state.lastAction.player===fromPlayer
    }).canWin;
  });

  if(winners.length){
    if(winners.includes(0)){
      const info=getWinInfo(
        state.players[0].hand.concat([cloneTile(tile)]),
        state.players[0].melds,
        {gangDiscard:state.lastAction?.type==="gang"&&state.lastAction.player===fromPlayer}
      );

      showReaction("可以点炮胡",info.name,[
        {label:"胡",primary:true,run:()=>declareDiscardWins(winners,tile,fromPlayer)},
        {label:"过",run:()=>resolveClaims(tile,fromPlayer,candidates.filter(i=>i!==0))}
      ]);
      return;
    }

    declareDiscardWins(winners,tile,fromPlayer);
    return;
  }

  resolveClaims(tile,fromPlayer,candidates);
}

function resolveClaims(tile,fromPlayer,candidates){
  const humanMatches=matchingIndexes(state.players[0].hand,tile).length;
  const humanEligible=candidates.includes(0);
  const canGang=state.activeRules.gangRain&&humanEligible&&humanMatches>=3;
  const canPeng=humanEligible&&humanMatches>=2;

  if(canGang||canPeng){
    const actions=[];
    if(canGang)actions.push({label:"杠",primary:true,run:()=>claimMingGang(0,tile,fromPlayer)});
    if(canPeng)actions.push({label:"碰",primary:!canGang,run:()=>claimPeng(0,tile,fromPlayer)});
    actions.push({label:"过",run:()=>resolveAiClaims(tile,fromPlayer,candidates.filter(i=>i!==0))});

    showReaction("可以操作",`对方打出 ${tileName(tile)}`,actions);
    return;
  }

  resolveAiClaims(tile,fromPlayer,candidates);
}

function resolveAiClaims(tile,fromPlayer,candidates){
  for(const index of candidates){
    if(index===0)continue;
    const player=state.players[index];
    const matches=matchingIndexes(player.hand,tile).length;

    if(state.activeRules.gangRain&&matches>=3){
      claimMingGang(index,tile,fromPlayer);
      return;
    }

    if(matches>=2&&keepScore(tile,player.hand)>=9){
      claimPeng(index,tile,fromPlayer);
      return;
    }
  }

  nextTurnFrom(fromPlayer);
}

function claimPeng(playerIndex,tile,fromPlayer){
  const player=state.players[playerIndex];
  removeMatching(player,tile,2);
  removeLastDiscard();
  player.melds.push({type:"peng",from:fromPlayer,tiles:Array.from({length:3},()=>cloneTile(tile))});
  state.turn=playerIndex;
  state.phase="出牌";
  state.lastAction={type:"peng",player:playerIndex};
  state.logs.push(`${player.name}碰 ${tileName(tile)}。`);
  commit();

  if(playerIndex!==0)aiTimer=setTimeout(aiDiscard,420);
}

function claimMingGang(playerIndex,tile,fromPlayer){
  const player=state.players[playerIndex];
  removeMatching(player,tile,3);
  removeLastDiscard();
  player.melds.push({type:"mingGang",from:fromPlayer,tiles:Array.from({length:4},()=>cloneTile(tile))});
  state.turn=playerIndex;
  state.lastAction={type:"gang",player:playerIndex,kind:"mingGang"};
  state.logs.push(`${player.name}明杠 ${tileName(tile)}。`);
  drawSupplement(playerIndex);
}

function doConcealedGang(playerIndex,entry){
  const player=state.players[playerIndex];
  removeMatching(player,entry.tile,4);
  player.melds.push({type:"anGang",from:playerIndex,tiles:Array.from({length:4},()=>cloneTile(entry.tile))});
  state.turn=playerIndex;
  state.lastAction={type:"gang",player:playerIndex,kind:"anGang"};
  state.logs.push(`${player.name}暗杠 ${tileName(entry.tile)}。`);
  drawSupplement(playerIndex);
}

function attemptAddedGang(playerIndex,entry){
  const tile=entry.tile;
  const robbers=activePlayersAfter(playerIndex).filter(index=>{
    const player=state.players[index];
    const test=player.hand.concat([cloneTile(tile)]);
    return getWinInfo(test,player.melds,{robGang:true}).canWin;
  });

  if(robbers.length){
    if(robbers.includes(0)){
      const info=getWinInfo(
        state.players[0].hand.concat([cloneTile(tile)]),
        state.players[0].melds,
        {robGang:true}
      );

      showReaction("可以抢杠胡",info.name,[
        {label:"胡",primary:true,run:()=>declareRobGangWins(robbers,tile,playerIndex)},
        {label:"过",run:()=>completeAddedGang(playerIndex,entry)}
      ]);
      return;
    }

    declareRobGangWins(robbers,tile,playerIndex);
    return;
  }

  completeAddedGang(playerIndex,entry);
}

function completeAddedGang(playerIndex,entry){
  const player=state.players[playerIndex];
  player.hand.splice(entry.index,1);
  entry.meld.type="buGang";
  entry.meld.tiles.push(cloneTile(entry.tile));
  state.turn=playerIndex;
  state.lastAction={type:"gang",player:playerIndex,kind:"buGang"};
  state.logs.push(`${player.name}补杠 ${tileName(entry.tile)}。`);
  drawSupplement(playerIndex);
}

function drawSupplement(playerIndex){
  state.turn=playerIndex;
  state.phase="摸牌";
  commit();
  scheduleAutoDraw(320);
}

function declareSelfWin(playerIndex,info){
  const player=state.players[playerIndex];
  player.won=true;
  state.logs.push(`${player.name}自摸：${info.name}。`);
  state.lastAction={type:"win",player:playerIndex,kind:"self"};
  commit();

  showWin(player.name,info,()=>continueAfterWin(playerIndex));
}

function declareDiscardWins(winners,tile,fromPlayer){
  removeLastDiscard();

  winners.forEach(index=>{
    const player=state.players[index];
    player.hand.push(cloneTile(tile));
    sortHand(player.hand);
    player.won=true;
    const info=getWinInfo(
      player.hand,
      player.melds,
      {gangDiscard:state.lastAction?.type==="gang"&&state.lastAction.player===fromPlayer}
    );
    state.logs.push(`${player.name}点炮胡：${info.name}。`);
  });

  state.lastAction={type:"win",players:winners,kind:"discard",from:fromPlayer};
  commit();

  const first=winners[0];
  const info=getWinInfo(state.players[first].hand,state.players[first].melds,{
    gangDiscard:state.lastAction?.kind==="discard"&&state.lastAction?.from===fromPlayer
  });

  showWin(
    winners.map(i=>state.players[i].name).join("、"),
    {...info,name:(winners.length>1?"一炮多响·":"")+info.name},
    ()=>continueAfterWin(fromPlayer)
  );
}

function declareRobGangWins(winners,tile,fromPlayer){
  winners.forEach(index=>{
    const player=state.players[index];
    player.hand.push(cloneTile(tile));
    sortHand(player.hand);
    player.won=true;
    const info=getWinInfo(player.hand,player.melds,{robGang:true});
    state.logs.push(`${player.name}抢杠胡：${info.name}。`);
  });

  const first=winners[0];
  const info=getWinInfo(state.players[first].hand,state.players[first].melds,{robGang:true});
  commit();

  showWin(
    winners.map(i=>state.players[i].name).join("、"),
    {...info,name:(winners.length>1?"一炮多响·":"")+info.name},
    ()=>continueAfterWin(fromPlayer)
  );
}

function continueAfterWin(referencePlayer){
  const active=state.players.filter(p=>!p.won).length;
  if(active<=1||!state.wall.length){
    endRound(active<=1?"三家已胡":"牌墙摸完");
    return;
  }
  nextTurnFrom(referencePlayer);
}

function nextTurnFrom(referencePlayer){
  let next=referencePlayer;
  do{
    next=(next+1)%4;
  }while(state.players[next].won);

  state.turn=next;
  state.phase="摸牌";
  state.lastAction=null;
  commit();
  scheduleAutoDraw();
}

function activePlayersAfter(fromPlayer){
  const result=[];
  for(let step=1;step<=3;step++){
    const index=(fromPlayer+step)%4;
    if(!state.players[index].won)result.push(index);
  }
  return result;
}

function removeMatching(player,tile,count){
  const indexes=matchingIndexes(player.hand,tile).slice(0,count).sort((a,b)=>b-a);
  indexes.forEach(index=>player.hand.splice(index,1));
}

function removeLastDiscard(){
  state.discards.pop();
  state.lastDiscard=null;
}

function aiDiscard(){
  if(state.turn===0||state.phase!=="出牌")return;
  const player=state.players[state.turn];
  const tileIndex=chooseDiscard(player.hand);
  discard(state.turn,tileIndex);
}

function chooseDiscard(hand){
  return hand.map((tile,index)=>({index,score:keepScore(tile,hand)}))
    .sort((a,b)=>a.score-b.score)[0].index;
}

function keepScore(tile,hand){
  const same=hand.filter(t=>sameTile(t,tile)).length;
  const near1=hand.filter(t=>t.s===tile.s&&Math.abs(t.n-tile.n)===1).length;
  const near2=hand.filter(t=>t.s===tile.s&&Math.abs(t.n-tile.n)===2).length;
  return same*5+near1*3+near2;
}

function endRound(reason){
  state.phase="结束";
  state.logs.push(`牌局结束：${reason}。`);
  commit();
  toast(`牌局结束：${reason}`);
}

function commit(){
  saveState(state);
  renderGame(state,{onTileClick:handleTileClick});
  renderLog(state.logs);
}

function toast(message){
  const el=document.getElementById("toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer=setTimeout(()=>el.classList.remove("show"),1700);
}

document.getElementById("newGameBtn").addEventListener("click",()=>{
  if(state.phase==="准备"||state.phase==="结束"||confirm("确定开始新牌局吗？")){
    clearState();
    newGame();
  }
});

document.addEventListener("visibilitychange",()=>{
  if(document.hidden)saveState(state);
});
window.addEventListener("pagehide",()=>saveState(state));

if(state.phase==="准备"||state.players.every(p=>p.hand.length===0)){
  newGame();
}else{
  commit();
  if(state.phase==="摸牌")scheduleAutoDraw();
  else if(state.phase==="出牌"&&state.turn!==0)aiTimer=setTimeout(aiDiscard,500);
}
