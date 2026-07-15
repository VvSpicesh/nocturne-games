import {renderGame,renderLog,renderExchange,showReaction,hideReaction,showWin,showRoundEnd,showPlayerActionEffect,playDiceAnimation,flashDealCaption,clearDealCaption,hideStartOverlay,showLobby,showMissingSuitModal,hideMissingSuitModal} from "./render.js";
import {saveState,loadState,clearState} from "./storage.js";
import {loadRules,saveRules,loadLastDealer,saveLastDealer,loadNames,saveNames,defaultRules,mergeDeep} from "./config.js";
import {tileName} from "./tiles.js";
import {canPlayerWin} from "./hu.js";
import {
  getLegalDiscardIndexes,
  isLegalDiscard,
  canClaimTileSuit,
  pickAiMissingSuit,
  emptyRoundSettlement,
  SUIT_LABEL
} from "./rules-guard.js";
import {
  loadSessionScores,
  saveSessionScores,
  ensureSessionClock,
  checkEyeWarn,
  formatPoints,
  settleSelfDraw,
  settleDiscardWins,
  settleMingGang,
  settleAnOrBuGang,
  settleFlowerPigs,
  roundSummary
} from "./score.js";
import {runRuleTests} from "./rule-tests.js";

function snapshotRules(source=rules){
  return mergeDeep(defaultRules,source||{});
}

let names=loadNames();
/* 相对自己：左=上家，上=对家，右=下家 */
const seatLabels=["自己","上家","对家","下家"];
const AI_THINK_MS=1000;
let rules=loadRules();
let state=loadState();
let aiTimer=null;
let exchangeSelection=[];
let openingSeq=0;

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function seatWho(playerIndex){
  const name=state.players[playerIndex].name;
  return name?`${seatLabels[playerIndex]} ${name}`:seatLabels[playerIndex];
}

function playerCall(playerIndex){
  const name=state.players[playerIndex]?.name;
  return name||seatLabels[playerIndex];
}

function formatWinLine(playerIndex,fanName){
  return `${seatWho(playerIndex)} ${fanName}`;
}

/** 胡家主文案。点炮类不写「某人点炮」，避免像是胡家在放炮。 */
function formatWinHeadline(playerIndex,fanName,manner){
  if(manner==="点炮"||manner==="杠上炮"){
    return `${seatWho(playerIndex)} · ${fanName}`;
  }
  if(manner==="抢杠胡"){
    return `${seatWho(playerIndex)} 抢杠胡 · ${fanName}`;
  }
  return `${seatWho(playerIndex)} ${manner} · ${fanName}`;
}

function compatible(candidate){
  return Boolean(
    candidate &&
    candidate.version==="0.10" &&
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
}else{
  if(!Number.isInteger(state.dealer)){
    state.dealer=Number.isInteger(state.turn)?state.turn:0;
    state.dealing=false;
  }
  if(!Array.isArray(state.scores)||state.scores.length!==4){
    state.scores=loadSessionScores();
  }
  if(!Array.isArray(state.roundDelta)||state.roundDelta.length!==4){
    state.roundDelta=[0,0,0,0];
  }
  if(!Array.isArray(state.scoreLog))state.scoreLog=[];
  state.players.forEach((player,index)=>{
    if(player&&names[index]&&player.name!==names[index])player.name=names[index];
    if(player&&player.missingSuit===undefined)player.missingSuit=null;
  });
  if(!state.roundSettlement)state.roundSettlement=emptyRoundSettlement();
  state.activeRules=snapshotRules(state.activeRules||rules);
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
  const scores=loadSessionScores();
  return {
    version:"0.10",
    phase:"准备",
    wall:[],
    players:names.map(name=>({name,hand:[],won:false,melds:[],missingSuit:null})),
    turn:0,
    dealer:0,
    dealing:false,
    discards:[],
    logs:["欢迎来到 Nocturne Mahjong。"],
    drawnTileId:null,
    selectedTileIndex:null,
    activeRules:snapshotRules(rules),
    lastAction:null,
    lastDiscard:null,
    pendingGang:null,
    scores,
    roundDelta:[0,0,0,0],
    scoreLog:[],
    roundSettlement:emptyRoundSettlement()
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

function nextDealerSeat(){
  const last=loadLastDealer();
  return last<0?0:(last+1)%4;
}

function newGame(){
  clearTimeout(aiTimer);
  hideReaction();
  hideStartOverlay();
  document.getElementById("exchangeModal")?.classList.remove("show");
  document.getElementById("winModal")?.classList.remove("show");
  document.getElementById("roundEndModal")?.classList.remove("show");
  document.getElementById("newGameModal")?.classList.remove("show");
  document.getElementById("namesModal")?.classList.remove("show");
  hideMissingSuitModal();
  rules=loadRules();
  names=loadNames();

  const dealer=nextDealerSeat();
  saveLastDealer(dealer);

  const wall=createWall();
  const players=names.map(name=>({name,hand:[],won:false,melds:[],missingSuit:null}));

  const scores=loadSessionScores();
  state={
    version:"0.10",
    phase:"开局",
    wall,
    players,
    turn:dealer,
    dealer,
    dealing:false,
    discards:[],
    logs:[
      `新牌局开始。${seatWho(dealer)} 坐庄。`,
      `换三张：${rules.exchangeThree?"开启":"关闭"}；刮风下雨：${rules.gangRain?"开启":"关闭"}。`,
      `本局起始分：${scores.map((n,i)=>`${playerCall(i)} ${n}`).join(" / ")}。`
    ],
    drawnTileId:null,
    selectedTileIndex:null,
    activeRules:snapshotRules(rules),
    lastAction:null,
    lastDiscard:null,
    pendingGang:null,
    scores:[...scores],
    roundDelta:[0,0,0,0],
    scoreLog:[],
    roundSettlement:emptyRoundSettlement()
  };

  ensureSessionClock();
  commit();
  runOpeningSequence();
}

async function runOpeningSequence(){
  const seq=++openingSeq;
  const dealer=state.dealer;

  await playDiceAnimation({
    caption:"掷骰定庄…",
    resultCaption:(a,b,c)=>`点数 ${a}+${b}+${c}=${a+b+c} · ${seatWho(dealer)} 坐庄`
  });
  if(seq!==openingSeq||!state||state.phase!=="开局")return;

  await flashDealCaption("发牌中…");
  state.dealing=true;
  commit();

  for(let round=0;round<13;round++){
    if(seq!==openingSeq||state.phase!=="开局")return;
    for(let step=0;step<4;step++){
      const player=(dealer+step)%4;
      state.players[player].hand.push(state.wall.pop());
    }
    commit();
    await wait(70);
  }

  if(seq!==openingSeq||state.phase!=="开局")return;

  state.players.forEach(player=>sortHand(player.hand));
  state.dealing=false;
  state.phase=rules.exchangeThree?"换三张":"定缺";
  state.turn=dealer;
  state.logs.push("发牌完成。");
  clearDealCaption();
  commit();

  if(rules.exchangeThree)openExchange();
  else beginMissingSuitPhase();
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
  state.phase="定缺";
  document.getElementById("exchangeModal").classList.remove("show");
  commit();
  beginMissingSuitPhase();
});

function beginMissingSuitPhase(){
  state.phase="定缺";
  state.players.forEach(p=>{p.missingSuit=null;});
  commit();
  showMissingSuitModal(state.players[0].hand,suit=>{
    confirmMissingSuits(suit);
  });
}

function confirmMissingSuits(humanSuit){
  if(!["w","t","b"].includes(humanSuit))return;
  state.players[0].missingSuit=humanSuit;
  for(let i=1;i<4;i++){
    state.players[i].missingSuit=pickAiMissingSuit(state.players[i].hand);
  }
  const line=state.players
    .map((p,i)=>`${playerCall(i)}缺${SUIT_LABEL[p.missingSuit]}`)
    .join(" · ");
  state.logs.push(`定缺完成：${line}。`);
  hideMissingSuitModal();
  state.phase="摸牌";
  state.turn=state.dealer;
  commit();
  scheduleAutoDraw();
}

function chooseExchangeTiles(hand){
  return hand.map((tile,index)=>({index,score:keepScore(tile,hand)}))
    .sort((a,b)=>a.score-b.score).slice(0,3).map(x=>x.index);
}

function scheduleAutoDraw(delay){
  clearTimeout(aiTimer);
  if(state.phase!=="摸牌")return;
  aiTimer=setTimeout(autoDraw,delay??(state.turn===0?260:AI_THINK_MS));
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
  state.logs.push(`${playerCall(state.turn)}摸牌。`);
  state.phase="出牌";

  const info=canPlayerWin(player,player.hand,player.melds,{
    gangFlower:state.lastAction?.type==="gang"&&state.lastAction.player===state.turn,
    lastTile:state.wall.length===0
  },state.activeRules);

  if(info.canWin){
    if(state.turn===0){
      commit();
      showReaction("可以胡牌","",[
        {label:"胡",tile,primary:true,run:()=>declareSelfWin(0,info)},
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
      if(concealed)actions.push({label:"暗杠",tile:concealed.tile,primary:true,run:()=>doConcealedGang(0,concealed)});
      if(added)actions.push({label:"补杠",tile:added.tile,primary:!concealed,run:()=>attemptAddedGang(0,added)});
      actions.push({label:"过",run:()=>{commit()}});
      commit();
      showReaction("可以杠牌","请选择操作",actions);
      return;
    }

    if(concealed){doConcealedGang(state.turn,concealed);return}
    if(added){attemptAddedGang(state.turn,added);return}
  }

  commit();
  if(state.turn!==0)aiTimer=setTimeout(aiDiscard,AI_THINK_MS);
}

function findConcealedGang(player){
  const map=new Map();
  player.hand.forEach(tile=>{
    if(!canClaimTileSuit(player,tile))return;
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
    if(!canClaimTileSuit(player,tile))continue;
    const index=player.hand.findIndex(item=>sameTile(item,tile));
    if(index>=0)return {meld,tile,index};
  }
  return null;
}

function handleTileClick(tileIndex){
  if(state.turn!==0||state.phase!=="出牌")return;
  if(!isLegalDiscard(state.players[0],tileIndex)){
    return toast("请先打完缺门牌");
  }
  if(state.selectedTileIndex===tileIndex){
    discard(0,tileIndex);
    return;
  }
  state.selectedTileIndex=tileIndex;
  commit();
}

function discard(playerIndex,tileIndex){
  const player=state.players[playerIndex];
  if(!isLegalDiscard(player,tileIndex)){
    if(playerIndex===0)toast("请先打完缺门牌");
    return;
  }
  const [tile]=player.hand.splice(tileIndex,1);

  state.discards.push({player:playerIndex,tile});
  state.lastDiscard={player:playerIndex,tile};
  state.logs.push(`${playerCall(playerIndex)}打出 ${tileName(tile)}。`);
  state.drawnTileId=null;
  state.selectedTileIndex=null;
  state.phase="等待操作";
  commit();

  resolveDiscard(tile,playerIndex);
}

function resolveDiscard(tile,fromPlayer){
  const candidates=activePlayersAfter(fromPlayer);
  const gangDiscard=state.lastAction?.type==="gang"&&state.lastAction.player===fromPlayer;
  const lastTile=state.wall.length===0;

  /* 先算好各家胡牌信息，结算时复用，避免再次判定失败导致某家 0 番 */
  const winChecks=candidates.map(index=>{
    const p=state.players[index];
    const info=canPlayerWin(
      p,
      p.hand.concat([cloneTile(tile)]),
      p.melds,
      {gangDiscard,lastTile},
      state.activeRules
    );
    return {index,info};
  }).filter(item=>item.info.canWin);

  if(winChecks.length){
    if(winChecks.some(item=>item.index===0)){
      showReaction("可以点炮胡","",[
        {label:"胡",tile,primary:true,run:()=>declareDiscardWins(winChecks,tile,fromPlayer)},
        {label:"过",run:()=>{
          const rest=winChecks.filter(item=>item.index!==0);
          if(rest.length)declareDiscardWins(rest,tile,fromPlayer);
          else resolveClaims(tile,fromPlayer,candidates.filter(i=>i!==0));
        }}
      ]);
      return;
    }

    declareDiscardWins(winChecks,tile,fromPlayer);
    return;
  }

  resolveClaims(tile,fromPlayer,candidates);
}

function resolveClaims(tile,fromPlayer,candidates){
  const humanMatches=matchingIndexes(state.players[0].hand,tile).length;
  const humanEligible=candidates.includes(0)&&canClaimTileSuit(state.players[0],tile);
  const canGang=state.activeRules.gangRain&&humanEligible&&humanMatches>=3;
  const canPeng=humanEligible&&humanMatches>=2;

  if(canGang||canPeng){
    const actions=[];
    if(canGang)actions.push({label:"杠",tile,primary:true,run:()=>claimMingGang(0,tile,fromPlayer)});
    if(canPeng)actions.push({label:"碰",tile,primary:!canGang,run:()=>claimPeng(0,tile,fromPlayer)});
    actions.push({label:"过",run:()=>resolveAiClaims(tile,fromPlayer,candidates.filter(i=>i!==0))});

    showReaction("可以操作","请选择碰、杠或过",actions);
    return;
  }

  resolveAiClaims(tile,fromPlayer,candidates);
}

function resolveAiClaims(tile,fromPlayer,candidates){
  for(const index of candidates){
    if(index===0)continue;
    const player=state.players[index];
    if(!canClaimTileSuit(player,tile))continue;
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
  if(!canClaimTileSuit(player,tile)){
    if(playerIndex===0)toast("定缺花色不能碰");
    resolveAiClaims(tile,fromPlayer,activePlayersAfter(fromPlayer).filter(i=>i!==playerIndex));
    return;
  }
  const player2=player;
  removeMatching(player2,tile,2);
  removeLastDiscard();
  player2.melds.push({type:"peng",from:fromPlayer,tiles:Array.from({length:3},()=>cloneTile(tile))});
  state.turn=playerIndex;
  state.phase="出牌";
  state.lastAction={type:"peng",player:playerIndex};
  state.logs.push(`${playerCall(playerIndex)}碰 ${tileName(tile)}。`);
  showPlayerActionEffect(playerIndex,"碰",tile);
  commit();

  if(playerIndex!==0)aiTimer=setTimeout(aiDiscard,AI_THINK_MS);
}

function claimMingGang(playerIndex,tile,fromPlayer){
  const player=state.players[playerIndex];
  if(!canClaimTileSuit(player,tile)){
    if(playerIndex===0)toast("定缺花色不能杠");
    resolveAiClaims(tile,fromPlayer,activePlayersAfter(fromPlayer).filter(i=>i!==playerIndex));
    return;
  }
  removeMatching(player,tile,3);
  removeLastDiscard();
  player.melds.push({type:"mingGang",from:fromPlayer,tiles:Array.from({length:4},()=>cloneTile(tile))});
  state.turn=playerIndex;
  state.lastAction={type:"gang",player:playerIndex,kind:"mingGang"};
  const settled=settleMingGang(state,playerIndex,fromPlayer);
  state.logs.push(settled?`${playerCall(playerIndex)}杠 ${tileName(tile)} · ${settled.logText}`:`${playerCall(playerIndex)}杠 ${tileName(tile)}。`);
  showPlayerActionEffect(playerIndex,"杠",tile,settled?formatPoints(settled.pts):"");
  drawSupplement(playerIndex);
}

function doConcealedGang(playerIndex,entry){
  const player=state.players[playerIndex];
  removeMatching(player,entry.tile,4);
  player.melds.push({type:"anGang",from:playerIndex,tiles:Array.from({length:4},()=>cloneTile(entry.tile))});
  state.turn=playerIndex;
  state.lastAction={type:"gang",player:playerIndex,kind:"anGang"};
  const settled=settleAnOrBuGang(state,playerIndex,"暗杠");
  state.logs.push(
    settled
      ?`${playerCall(playerIndex)}暗杠 ${tileName(entry.tile)} · ${settled.logText}`
      :`${playerCall(playerIndex)}暗杠 ${tileName(entry.tile)}。`
  );
  showPlayerActionEffect(
    playerIndex,
    "暗杠",
    null,
    settled?formatPoints(settled.deltas[playerIndex]):""
  );
  drawSupplement(playerIndex);
}

function attemptAddedGang(playerIndex,entry){
  const tile=entry.tile;
  const robbers=activePlayersAfter(playerIndex).filter(index=>{
    const player=state.players[index];
    const test=player.hand.concat([cloneTile(tile)]);
    return canPlayerWin(player,test,player.melds,{robGang:true},state.activeRules).canWin;
  });

  if(robbers.length){
    if(robbers.includes(0)){
      showReaction("可以抢杠胡","",[
        {label:"胡",tile,primary:true,run:()=>declareRobGangWins(robbers,tile,playerIndex)},
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
  const settled=settleAnOrBuGang(state,playerIndex,"补杠");
  state.logs.push(
    settled
      ?`${playerCall(playerIndex)}补杠 ${tileName(entry.tile)} · ${settled.logText}`
      :`${playerCall(playerIndex)}补杠 ${tileName(entry.tile)}。`
  );
  showPlayerActionEffect(
    playerIndex,
    "补杠",
    entry.tile,
    settled?formatPoints(settled.deltas[playerIndex]):""
  );
  drawSupplement(playerIndex);
}

function drawSupplement(playerIndex){
  state.turn=playerIndex;
  state.phase="摸牌";
  commit();
  scheduleAutoDraw(320);
}

function markWinTile(player,tile){
  player.won=true;
  if(!tile){
    player.winTile=null;
    return;
  }
  player.winTile={s:tile.s,n:tile.n,id:tile.id};
  let index=player.hand.findIndex(item=>item.id===tile.id);
  if(index<0)index=player.hand.findIndex(item=>item.s===tile.s&&item.n===tile.n);
  if(index<0)return;
  const [moved]=player.hand.splice(index,1);
  player.hand.push(moved);
}

function declareSelfWin(playerIndex,info){
  const player=state.players[playerIndex];
  const winTile=
    player.hand.find(tile=>tile.id===state.drawnTileId)||
    player.hand[player.hand.length-1]||
    null;
  const afterGang=state.lastAction?.type==="gang"&&state.lastAction.player===playerIndex;
  const manner=afterGang?"杠上开花":"自摸";
  markWinTile(player,winTile);
  const settled=settleSelfDraw(state,playerIndex,info,{
    selfDraw:true,
    gangFlower:afterGang
  });
  state.logs.push(
    `${formatWinHeadline(playerIndex,info.name,manner)} · ${settled.fan}番 ${formatPoints(settled.deltas[playerIndex])}。`
  );
  state.lastAction={type:"win",player:playerIndex,kind:"self",manner};
  showPlayerActionEffect(playerIndex,"胡",winTile,formatPoints(settled.deltas[playerIndex]));
  commit();

  showWin(
    formatWinHeadline(playerIndex,info.name,manner),
    {
      ...info,
      fan:settled.fan,
      multiplier:settled.multiplier,
      scoreDelta:settled.deltas[playerIndex],
      scoreTotal:state.scores[playerIndex],
      breakdown:settled.breakdown,
      scoreLine:buildWinScoreLine(info,settled.breakdown,settled.deltas[playerIndex],true,state.scores[playerIndex])
    },
    ()=>continueAfterWin(playerIndex),
    afterGang?"杠后补牌自摸":"自己摸牌胡牌",
    winTile
  );
}

function buildWinScoreLine(info,breakdown,delta,selfDraw,total){
  const b=breakdown||info||{};
  const parts=[
    `基础：${b.basePattern||info.basePattern||info.name||"平胡"} ${b.baseFan??"?"}番`,
    `根：${b.rootCount||0}`,
    `总番：${b.totalFan||info.totalFan||"?"}×${b.multiplier||info.multiplier||1}`
  ];
  if(selfDraw&&state.activeRules?.selfDrawAddsBase!==false)parts.push("自摸加底");
  parts.push(`本局 ${formatPoints(delta)}`);
  if(total!=null)parts.push(`总分 ${total}`);
  return parts.join(" · ");
}

function declareDiscardWins(winChecks,tile,fromPlayer){
  removeLastDiscard();
  const gangPaohu=state.lastAction?.type==="gang"&&state.lastAction.player===fromPlayer;
  const manner=gangPaohu?"杠上炮":"点炮";

  const checks=winChecks.map(item=>({
    index:item.index,
    info:item.info?.canWin?item.info:canPlayerWin(
      state.players[item.index],
      state.players[item.index].hand.concat([cloneTile(tile)]),
      state.players[item.index].melds,
      {gangDiscard:gangPaohu,lastTile:state.wall.length===0},
      state.activeRules
    )
  })).filter(item=>item.info.canWin);

  if(!checks.length){
    nextTurnFrom(fromPlayer);
    return;
  }

  checks.forEach(({index})=>{
    const player=state.players[index];
    const winTile=cloneTile(tile);
    player.hand.push(winTile);
    sortHand(player.hand);
    markWinTile(player,winTile);
  });

  const winners=checks.map(item=>item.index);
  const winInfos=checks.map(item=>item.info);
  const settled=settleDiscardWins(state,winners,fromPlayer,winInfos,{
    gangDiscard:gangPaohu
  });

  winners.forEach((index,i)=>{
    state.logs.push(
      `${formatWinHeadline(index,winInfos[i].name,manner)}（${seatWho(fromPlayer)} 放炮）`+
      ` · ${settled.fans[i]}番 ${formatPoints(settled.deltas[index])} · 胡 ${tileName(tile)}。`
    );
    showPlayerActionEffect(index,"胡",tile,formatPoints(settled.deltas[index]));
  });

  state.lastAction={type:"win",players:winners,kind:"discard",from:fromPlayer,manner};
  commit();

  const multi=winners.length>1;
  const headline=multi
    ?`一炮多响 · ${winners.map((index,i)=>`${seatWho(index)} ${winInfos[i].name}`).join("、")}`
    :formatWinHeadline(winners[0],winInfos[0].name,manner);
  const first=winInfos[0];
  const scoreBits=winners.map((index,i)=>
    `${playerCall(index)}${settled.fans[i]}番${formatPoints(settled.deltas[index])}`
  ).join(" · ");
  showWin(
    headline,
    {
      ...first,
      name:multi?`一炮多响·${first.name}`:first.name,
      fan:settled.fans[0],
      scoreDelta:settled.deltas[winners[0]],
      scoreTotal:state.scores[winners[0]],
      scoreLine:`${scoreBits} · ${playerCall(fromPlayer)} ${formatPoints(settled.deltas[fromPlayer])}`
    },
    ()=>continueAfterWin(fromPlayer),
    `${seatWho(fromPlayer)} 放炮${gangPaohu?"（杠上炮）":""}`,
    tile
  );
}

function declareRobGangWins(winners,tile,fromPlayer){
  const winChecks=winners.map(index=>{
    const player=state.players[index];
    const info=canPlayerWin(
      player,
      player.hand.concat([cloneTile(tile)]),
      player.melds,
      {robGang:true},
      state.activeRules
    );
    return {index,info};
  }).filter(item=>item.info.canWin);

  if(!winChecks.length)return;

  winChecks.forEach(({index})=>{
    const player=state.players[index];
    const winTile=cloneTile(tile);
    player.hand.push(winTile);
    sortHand(player.hand);
    markWinTile(player,winTile);
  });

  const winnerIndexes=winChecks.map(item=>item.index);
  const winInfos=winChecks.map(item=>item.info);
  const settled=settleDiscardWins(state,winnerIndexes,fromPlayer,winInfos,{robGang:true});
  winnerIndexes.forEach((index,i)=>{
    state.logs.push(
      `${formatWinHeadline(index,winInfos[i].name,"抢杠胡")}（抢 ${seatWho(fromPlayer)}）`+
      ` · ${settled.fans[i]}番 ${formatPoints(settled.deltas[index])} · 胡 ${tileName(tile)}。`
    );
    showPlayerActionEffect(index,"胡",tile,formatPoints(settled.deltas[index]));
  });

  commit();

  const multi=winnerIndexes.length>1;
  const headline=multi
    ?`一炮多响 · ${winnerIndexes.map((index,i)=>`${seatWho(index)} 抢杠胡 · ${winInfos[i].name}`).join("、")}`
    :formatWinHeadline(winnerIndexes[0],winInfos[0].name,"抢杠胡");
  const first=winInfos[0];
  const scoreBits=winnerIndexes.map((index,i)=>
    `${playerCall(index)}${settled.fans[i]}番${formatPoints(settled.deltas[index])}`
  ).join(" · ");
  showWin(
    headline,
    {
      ...first,
      name:multi?`一炮多响·${first.name}`:first.name,
      fan:settled.fans[0],
      scoreDelta:settled.deltas[winnerIndexes[0]],
      scoreTotal:state.scores[winnerIndexes[0]],
      scoreLine:`${scoreBits} · ${playerCall(fromPlayer)} ${formatPoints(settled.deltas[fromPlayer])}`
    },
    ()=>continueAfterWin(fromPlayer),
    `抢 ${seatWho(fromPlayer)} 的补杠`,
    tile
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
  const player=state.players[state.turn];
  const legal=new Set(getLegalDiscardIndexes(player));
  const ranked=hand
    .map((tile,index)=>({index,score:keepScore(tile,hand),legal:legal.has(index)}))
    .filter(x=>x.legal)
    .sort((a,b)=>a.score-b.score);
  return (ranked[0]||{index:0}).index;
}

function keepScore(tile,hand){
  const same=hand.filter(t=>sameTile(t,tile)).length;
  const near1=hand.filter(t=>t.s===tile.s&&Math.abs(t.n-tile.n)===1).length;
  const near2=hand.filter(t=>t.s===tile.s&&Math.abs(t.n-tile.n)===2).length;
  return same*5+near1*3+near2;
}

function endRound(reason){
  state.phase="结束";
  settleFlowerPigs(state);
  state.logs.push(`牌局结束：${reason}。`);
  if(Array.isArray(state.scores))saveSessionScores(state.scores);
  commit();
  toast(`牌局结束：${reason}`);
  const summary=roundSummary(state,reason);
  showRoundEnd(reason,summary,()=>{
    clearTimeout(aiTimer);
    clearState();
    newGame();
  },state.roundSettlement);
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

function isLocalDevHost(){
  const host=location.hostname;
  return host==="localhost"||host==="127.0.0.1";
}

function pullTile(wall,suit,number){
  const index=wall.findIndex(tile=>tile.s===suit&&tile.n===number);
  if(index<0)throw new Error(`规则测试缺牌：${suit}${number}`);
  return wall.splice(index,1)[0];
}

function pullTiles(wall,suit,number,count){
  return Array.from({length:count},()=>pullTile(wall,suit,number));
}

function loadRuleTestScenario(){
  openingSeq++;
  clearTimeout(aiTimer);
  hideReaction();
  hideStartOverlay();
  document.getElementById("exchangeModal").classList.remove("show");
  document.getElementById("winModal").classList.remove("show");
  document.getElementById("roundEndModal").classList.remove("show");

  rules.gangRain=true;
  ruleGang.checked=true;
  saveRules(rules);

  const wall=createWall();
  const selfMelds=[
    {type:"peng",from:2,tiles:pullTiles(wall,"t",1,3)},
    {type:"mingGang",from:2,tiles:pullTiles(wall,"t",2,4)}
  ];
  const hand0=[
    ...pullTiles(wall,"w",5,3),
    pullTile(wall,"b",1),
    pullTile(wall,"b",2),
    pullTile(wall,"b",3),
    pullTile(wall,"t",9)
  ];
  const leftMelds=[
    {type:"peng",from:0,tiles:pullTiles(wall,"w",1,3)},
    {type:"peng",from:0,tiles:pullTiles(wall,"w",2,3)},
    {type:"peng",from:0,tiles:pullTiles(wall,"w",3,3)}
  ];
  const hand1=[
    pullTile(wall,"b",4),
    pullTile(wall,"b",5),
    pullTile(wall,"b",6),
    pullTile(wall,"t",8)
  ];
  const hand2=[
    pullTile(wall,"w",6),
    pullTile(wall,"w",7),
    pullTile(wall,"w",8),
    pullTile(wall,"b",7),
    pullTile(wall,"b",8),
    pullTile(wall,"b",9),
    pullTile(wall,"t",3)
  ];
  const rightMelds=[
    {type:"peng",from:0,tiles:pullTiles(wall,"t",4,3)},
    {type:"peng",from:0,tiles:pullTiles(wall,"t",5,3)},
    {type:"peng",from:0,tiles:pullTiles(wall,"t",6,3)}
  ];
  const hand3=[
    pullTile(wall,"w",9),
    pullTile(wall,"b",3),
    pullTile(wall,"t",7),
    pullTile(wall,"w",4)
  ];
  const discardTile=pullTile(wall,"w",5);

  [hand0,hand1,hand2,hand3].forEach(sortHand);

  function suitAbsent(hand,melds){
    const used=new Set([...(hand||[]),...((melds||[]).flatMap(m=>m.tiles||[]))].map(t=>t.s));
    return ["w","t","b"].find(s=>!used.has(s))||"w";
  }

  state={
    version:"0.10",
    phase:"等待操作",
    turn:0,
    dealer:0,
    dealing:false,
    wall,
    discards:[{player:3,tile:discardTile}],
    lastDiscard:{player:3,tile:discardTile},
    lastAction:null,
    pendingGang:null,
    drawnTileId:null,
    selectedTileIndex:null,
    players:[
      {name:names[0],hand:hand0,melds:selfMelds,won:false,missingSuit:suitAbsent(hand0,selfMelds)},
      {name:names[1],hand:hand1,melds:leftMelds,won:false,missingSuit:suitAbsent(hand1,leftMelds)},
      {name:names[2],hand:hand2,melds:[],won:false,missingSuit:suitAbsent(hand2,[])},
      {name:names[3],hand:hand3,melds:rightMelds,won:false,missingSuit:suitAbsent(hand3,rightMelds)}
    ],
    logs:["【规则测试】左右各3组副露 / 自己碰+杠 / 下家出五万可碰可明杠。"],
    activeRules:snapshotRules({...rules,exchangeThree:false,gangRain:true}),
    scores:loadSessionScores(),
    roundDelta:[0,0,0,0],
    scoreLog:[],
    roundSettlement:emptyRoundSettlement()
  };

  commit();
  toast("规则测试场景已加载");
  resolveClaims(discardTile,3,activePlayersAfter(3));
}

function setupRuleTestButton(){
  if(!isLocalDevHost())return;
  const actions=document.querySelector(".topbar-actions")||document.querySelector(".topbar");
  if(!actions||document.getElementById("ruleTestBtn"))return;

  const suiteBtn=document.createElement("button");
  suiteBtn.type="button";
  suiteBtn.id="ruleTestBtn";
  suiteBtn.className="btn btn-dev";
  suiteBtn.textContent="规则测试";
  suiteBtn.title="跑固定断言套件";
  actions.appendChild(suiteBtn);
  suiteBtn.addEventListener("click",()=>{
    const result=runRuleTests();
    console.log("[mahjong rule-tests]\n"+result.lines.join("\n"));
    toast(result.ok
      ?`规则测试通过 ${result.passed}/${result.passed+result.failed}`
      :`规则测试失败 ${result.failed} 项，见控制台`);
  });

  const sceneBtn=document.createElement("button");
  sceneBtn.type="button";
  sceneBtn.id="ruleSceneBtn";
  sceneBtn.className="btn btn-dev";
  sceneBtn.textContent="碰杠场景";
  sceneBtn.title="加载固定碰杠桌面";
  actions.appendChild(sceneBtn);
  sceneBtn.addEventListener("click",loadRuleTestScenario);
}

document.getElementById("newGameBtn").addEventListener("click",()=>{
  openNewGameConfirm();
});

function openNamesModal(){
  names=loadNames();
  for(let i=0;i<4;i++){
    const input=document.getElementById(`nameInput${i}`);
    if(input)input.value=names[i]||"";
  }
  document.getElementById("namesModal").classList.add("show");
}

document.getElementById("editNamesBtn")?.addEventListener("click",openNamesModal);

document.getElementById("namesCancel")?.addEventListener("click",()=>{
  document.getElementById("namesModal").classList.remove("show");
});

document.getElementById("namesSave")?.addEventListener("click",()=>{
  const next=[0,1,2,3].map(i=>document.getElementById(`nameInput${i}`)?.value||"");
  names=saveNames(next);
  state.players.forEach((player,index)=>{
    player.name=names[index];
  });
  document.getElementById("namesModal").classList.remove("show");
  commit();
  toast("名字已保存");
});

function openNewGameConfirm(){
  const detail=document.getElementById("newGameDetail");
  if(detail){
    detail.textContent=
      state.phase==="准备"||state.phase==="结束"
        ?"将轮流坐庄，并掷骰后发牌。"
        :"当前牌局将结束，下一局轮流坐庄并重新掷骰发牌。";
  }
  document.getElementById("newGameModal").classList.add("show");
}

document.getElementById("newGameCancel").addEventListener("click",()=>{
  document.getElementById("newGameModal").classList.remove("show");
});

document.getElementById("newGameConfirm").addEventListener("click",()=>{
  document.getElementById("newGameModal").classList.remove("show");
  clearState();
  newGame();
});

document.addEventListener("visibilitychange",()=>{
  if(document.hidden)saveState(state);
});
window.addEventListener("pagehide",()=>saveState(state));

setupRuleTestButton();

document.getElementById("lobbyStartBtn")?.addEventListener("click",()=>{
  ensureSessionClock();
  clearState();
  newGame();
});

ensureSessionClock();
setInterval(()=>checkEyeWarn(toast),30000);
checkEyeWarn(toast);

function enterLobby(){
  openingSeq++;
  clearTimeout(aiTimer);
  hideReaction();
  document.getElementById("exchangeModal")?.classList.remove("show");
  document.getElementById("winModal")?.classList.remove("show");
  document.getElementById("roundEndModal")?.classList.remove("show");
  document.getElementById("newGameModal")?.classList.remove("show");
  state=createInitialState();
  commit();
  showLobby();
}

if(state.phase==="开局"||state.players.every(p=>p.hand.length===0)||state.phase==="准备"){
  enterLobby();
}else{
  hideStartOverlay();
  commit();
  if(state.phase==="定缺"){
    showMissingSuitModal(state.players[0].hand,suit=>confirmMissingSuits(suit));
  }else if(state.phase==="换三张"){
    openExchange();
  }else if(state.phase==="摸牌")scheduleAutoDraw();
  else if(state.phase==="出牌"&&state.turn!==0)aiTimer=setTimeout(aiDiscard,AI_THINK_MS);
}
