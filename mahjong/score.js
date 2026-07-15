/**
 * 计分：倍数 = 2^(totalFan-1)；底金 baseStake（默认 1）
 * 自摸：每家付 baseStake×multiplier + baseStake×1（加底，非 +1 番）
 * 杠分独立：暗杠未胡各 2 底、直杠放杠 2 底、弯杠未胡各 1 底
 * 花猪：向其余每位玩家各付 baseStake×2^(flowerPigFan-1)
 */

import {emptyRoundSettlement,isFlowerPig,SUIT_LABEL} from "./rules-guard.js";
import {fanMultiplier} from "./hu.js";

export const START_SCORE=20000;

const SCORE_KEY="nocturne_mahjong_session_score_v10";
const SESSION_START_KEY="nocturne_mahjong_session_started_v10";
const EYE_WARN_KEY="nocturne_mahjong_eye_warned_v10";
export const EYE_WARN_MS=2*60*60*1000;

export function defaultScores(){
  return [START_SCORE,START_SCORE,START_SCORE,START_SCORE];
}

export function loadSessionScores(){
  try{
    const raw=JSON.parse(localStorage.getItem(SCORE_KEY)||"null");
    if(raw&&Array.isArray(raw.scores)&&raw.scores.length===4){
      return raw.scores.map(n=>Number(n)||0);
    }
  }catch{/* ignore */}
  return defaultScores();
}

export function saveSessionScores(scores){
  localStorage.setItem(SCORE_KEY,JSON.stringify({scores:scores.map(n=>Number(n)||0)}));
}

export function ensureSessionClock(){
  if(!sessionStorage.getItem(SESSION_START_KEY)){
    sessionStorage.setItem(SESSION_START_KEY,String(Date.now()));
  }
  return Number(sessionStorage.getItem(SESSION_START_KEY))||Date.now();
}

export function checkEyeWarn(toastFn){
  const started=ensureSessionClock();
  if(sessionStorage.getItem(EYE_WARN_KEY)==="1")return;
  if(Date.now()-started<EYE_WARN_MS)return;
  sessionStorage.setItem(EYE_WARN_KEY,"1");
  toastFn("已连续游玩超过2小时，请注意用眼休息");
}

export function formatPoints(n){
  const value=Number(n)||0;
  if(value>0)return `+${value}`;
  return String(value);
}

function baseStakeOf(state){
  const n=Number(state?.activeRules?.baseStake);
  return Number.isFinite(n)&&n>0?n:1;
}

function selfDrawAddsBase(state){
  return state?.activeRules?.selfDrawAddsBase!==false;
}

/** 从 getWinInfo 结构或回退解析得到 totalFan / multiplier */
export function computeFan(info,manner={}){
  if(info?.canWin&&Number.isFinite(info.totalFan)){
    return Math.max(1,info.totalFan);
  }
  if(!info?.canWin&&!info?.name)return 0;
  // 兜底：旧字符串结果
  const name=info.name||"";
  let fan=1;
  if(name.includes("清龙七对"))fan=6;
  else if(name.includes("清七对"))fan=5;
  else if(name.includes("清大对")||name.includes("清一色·对对"))fan=4;
  else if(name.includes("龙七对"))fan=4;
  else if(name.includes("暗七对")||name.includes("七对"))fan=3;
  else if(name.includes("清一色"))fan=3;
  else if(name.includes("金钩钓"))fan=3;
  else if(name.includes("大对子")||name.includes("对对胡"))fan=2;
  if(manner.robGang||name.includes("抢杠胡"))fan+=1;
  if(manner.gangFlower||name.includes("杠上花"))fan+=1;
  if(manner.gangDiscard||name.includes("杠上炮"))fan+=1;
  // 自摸不加番
  return Math.max(1,fan);
}

export function computeMultiplier(info,manner={}){
  if(info?.canWin&&Number.isFinite(info.multiplier))return info.multiplier;
  return fanMultiplier(computeFan(info,manner));
}

function ensureScoreFields(state){
  if(!Array.isArray(state.scores)||state.scores.length!==4){
    state.scores=loadSessionScores();
  }
  if(!Array.isArray(state.roundDelta)||state.roundDelta.length!==4){
    state.roundDelta=[0,0,0,0];
  }
  if(!Array.isArray(state.scoreLog))state.scoreLog=[];
  if(!state.roundSettlement){
    state.roundSettlement=emptyRoundSettlement();
  }
}

function applyDeltas(state,deltas,logText){
  ensureScoreFields(state);
  for(let i=0;i<4;i++){
    const d=deltas[i]||0;
    state.scores[i]+=d;
    state.roundDelta[i]+=d;
    state.roundSettlement.playerDeltas[i]=
      (state.roundSettlement.playerDeltas[i]||0)+d;
  }
  saveSessionScores(state.scores);
  if(logText){
    state.scoreLog.unshift({text:logText,at:Date.now()});
    if(state.scoreLog.length>16)state.scoreLog.length=16;
  }
  return {deltas,logText};
}

function unpaidPlayers(state,exceptIndex){
  const list=[];
  for(let i=0;i<4;i++){
    if(i===exceptIndex)continue;
    if(state.players[i]?.won)continue;
    list.push(i);
  }
  return list;
}

function huBreakdown(info,manner={}){
  return {
    basePattern:info.basePattern||info.name||"平胡",
    baseFan:info.baseFan??computeFan(info,manner),
    rootCount:info.rootCount||0,
    extraFans:info.extraFans||[],
    totalFan:computeFan(info,manner),
    multiplier:computeMultiplier(info,manner)
  };
}

/** 自摸：每未胡家付 stake×倍 + 可选 1 份底 */
export function settleSelfDraw(state,winnerIndex,info,manner={}){
  ensureScoreFields(state);
  const stake=baseStakeOf(state);
  const breakdown=huBreakdown(info,{...manner,selfDraw:true});
  const huUnit=stake*breakdown.multiplier;
  const baseExtra=selfDrawAddsBase(state)?stake:0;
  const unit=huUnit+baseExtra;
  const deltas=[0,0,0,0];
  const payers=unpaidPlayers(state,winnerIndex);
  const payments=[];
  payers.forEach(i=>{
    deltas[i]-=unit;
    deltas[winnerIndex]+=unit;
    payments.push({
      from:i,to:winnerIndex,
      huAmount:huUnit,
      selfDrawBase:baseExtra,
      amount:unit
    });
  });
  state.roundSettlement?.huPayments.push({
    kind:"selfDraw",
    winner:winnerIndex,
    ...breakdown,
    selfDrawBase:baseExtra,
    payments
  });
  const text=
    `${state.players[winnerIndex].name}胡（${breakdown.basePattern} ${breakdown.totalFan}番×${breakdown.multiplier}`+
    `${baseExtra?`+底${baseExtra}`:""}）`+
    ` · ${manner.gangFlower?"杠上开花":"自摸"} ${formatPoints(deltas[winnerIndex])}`;
  const applied=applyDeltas(state,deltas,text);
  return {
    fan:breakdown.totalFan,
    multiplier:breakdown.multiplier,
    deltas,
    unit,
    breakdown,
    logText:applied.logText
  };
}

/** 点炮 / 杠上炮 / 抢杠：放炮者分别按倍支付 */
export function settleDiscardWins(state,winners,fromPlayer,winInfos,manner={}){
  ensureScoreFields(state);
  const stake=baseStakeOf(state);
  const deltas=[0,0,0,0];
  const fans=[];
  const unique=[];
  winners.forEach((winnerIndex,i)=>{
    if(unique.some(item=>item.winnerIndex===winnerIndex))return;
    unique.push({winnerIndex,info:winInfos[i]});
  });

  unique.forEach(({winnerIndex,info})=>{
    const breakdown=huBreakdown(info,{
      ...manner,
      selfDraw:false,
      robGang:manner.robGang===true,
      gangDiscard:manner.gangDiscard===true
    });
    fans.push(breakdown.totalFan);
    const unit=stake*breakdown.multiplier;
    deltas[fromPlayer]-=unit;
    deltas[winnerIndex]+=unit;
    state.roundSettlement?.huPayments.push({
      kind:manner.robGang?"robGang":manner.gangDiscard?"gangDiscard":"discard",
      winner:winnerIndex,
      from:fromPlayer,
      ...breakdown,
      selfDrawBase:0,
      payments:[{from:fromPlayer,to:winnerIndex,huAmount:unit,selfDrawBase:0,amount:unit}]
    });
  });

  const winnerIndexes=unique.map(u=>u.winnerIndex);
  const label=manner.robGang?"抢杠胡":manner.gangDiscard?"杠上炮":"点炮";
  const detail=winnerIndexes
    .map((w,i)=>`${state.players[w].name}${fans[i]}番${formatPoints(deltas[w])}`)
    .join("、");
  const text=`${label}：${detail}（${state.players[fromPlayer].name} ${formatPoints(deltas[fromPlayer])}）`;
  const applied=applyDeltas(state,deltas,text);
  return {fans,deltas,logText:applied.logText,winners:winnerIndexes};
}

/** 直杠 / 明杠：放杠者付 2×底（下雨）；drizzleMode 时再收其余未胡各 1 */
export function settleMingGang(state,gangster,fromPlayer){
  if(!state.activeRules?.gangRain)return null;
  ensureScoreFields(state);
  const stake=baseStakeOf(state);
  const deltas=[0,0,0,0];
  const pts=2*stake;
  deltas[fromPlayer]-=pts;
  deltas[gangster]+=pts;
  const payments=[{from:fromPlayer,to:gangster,units:2,amount:pts}];

  if(state.activeRules?.gangRules?.drizzleMode){
    unpaidPlayers(state,gangster).forEach(i=>{
      if(i===fromPlayer)return;
      const extra=stake;
      deltas[i]-=extra;
      deltas[gangster]+=extra;
      payments.push({from:i,to:gangster,units:1,amount:extra});
    });
  }

  state.roundSettlement?.gangPayments.push({
    type:"mingGang",
    actor:gangster,
    source:fromPlayer,
    payments,
    valid:true,
    label:"下雨"
  });

  const text=
    `${state.players[gangster].name}明杠 ${formatPoints(deltas[gangster])}`+
    `（${state.players[fromPlayer].name} ${formatPoints(-pts)}）`;
  const applied=applyDeltas(state,deltas,text);
  return {deltas,pts:deltas[gangster],logText:applied.logText};
}

/** 暗杠：未胡各 2×底；补杠：未胡各 1×底 */
export function settleAnOrBuGang(state,gangster,kind="暗杠"){
  if(!state.activeRules?.gangRain)return null;
  ensureScoreFields(state);
  const stake=baseStakeOf(state);
  const isAn=kind==="暗杠";
  const units=isAn?2:1;
  const deltas=[0,0,0,0];
  const payments=[];
  unpaidPlayers(state,gangster).forEach(i=>{
    const amount=units*stake;
    deltas[i]-=amount;
    deltas[gangster]+=amount;
    payments.push({from:i,to:gangster,units,amount});
  });

  state.roundSettlement?.gangPayments.push({
    type:isAn?"anGang":"buGang",
    actor:gangster,
    source:null,
    payments,
    valid:true,
    label:isAn?"下雨":"刮风"
  });

  const text=
    `${state.players[gangster].name}${kind} ${formatPoints(deltas[gangster])}`+
    `（各未胡家 -${units*stake}）`;
  const applied=applyDeltas(state,deltas,text);
  return {deltas,logText:applied.logText};
}

/**
 * 花猪：每位花猪向其余每位玩家各付一份花猪倍乘金额。
 * 同时命中「未下叫」时（配置不叠）：本轮只记花猪，不罚未下叫。
 */
export function settleFlowerPigs(state){
  ensureScoreFields(state);
  const sr=state.activeRules?.settlementRules||{};
  if(sr.flowerPigEnabled===false){
    state.roundSettlement.flowerPigResults=[];
    return null;
  }
  const fan=Number(sr.flowerPigFan);
  if(!Number.isFinite(fan)||fan<1){
    // 未配置有效番数：只检测展示
    const results=state.players.map((p,i)=>{
      const pig=isFlowerPig(p);
      return {
        playerIndex:i,
        name:p.name,
        ...pig,
        paid:false,
        note:pig.isFlowerPig?"花猪罚分待规则配置":null
      };
    });
    state.roundSettlement.flowerPigResults=results.filter(r=>r.isFlowerPig);
    return {deltas:[0,0,0,0],results:state.roundSettlement.flowerPigResults};
  }

  const stake=baseStakeOf(state);
  const mult=fanMultiplier(fan);
  const unit=stake*mult;
  const deltas=[0,0,0,0];
  const results=[];

  state.players.forEach((p,i)=>{
    if(p.won)return;
    const pig=isFlowerPig(p);
    if(!pig.isFlowerPig)return;
    const payments=[];
    for(let j=0;j<4;j++){
      if(j===i)continue;
      deltas[i]-=unit;
      deltas[j]+=unit;
      payments.push({from:i,to:j,amount:unit});
    }
    results.push({
      playerIndex:i,
      name:p.name,
      isFlowerPig:true,
      missingSuit:pig.missingSuit,
      missingSuitLabel:SUIT_LABEL[pig.missingSuit]||pig.missingSuit,
      offendingTiles:pig.offendingTiles,
      fan,
      multiplier:mult,
      unit,
      payments,
      paid:true,
      reason:"花猪",
      note:`花猪 ${fan}番×${mult}，向其余每位支付 ${unit}`
    });
  });

  state.roundSettlement.flowerPigResults=results;
  // 查叫占位：本轮不处罚
  state.roundSettlement.readyHandResults=state.roundSettlement.readyHandResults||[];

  if(!results.length)return {deltas:[0,0,0,0],results};

  const text=results
    .map(r=>`${r.name}花猪(${r.missingSuitLabel}) ${formatPoints(deltas[r.playerIndex])}`)
    .join("；");
  const applied=applyDeltas(state,deltas,`花猪结算：${text}`);
  return {deltas,results,logText:applied.logText};
}

export function formatHuScoreLines(info,settled,manner={}){
  const b=settled?.breakdown||huBreakdown(info,manner);
  const lines=[
    `基础牌型：${b.basePattern} ${b.baseFan}番`,
    b.rootCount?`根：${b.rootCount}根 +${b.rootCount}番`:"根：0",
    ...(b.extraFans||[]).map(e=>`${e.label}：+${e.fan}番`),
    `总番：${b.totalFan}番`,
    `倍数：×${b.multiplier}`
  ];
  if(settled?.breakdown&&manner.selfDraw!==false&&settled.unit!=null){
    const stakeExtra=settled.breakdown?null:null;
  }
  return lines;
}

export function roundSummary(state,reason){
  ensureScoreFields(state);
  const pigs=new Set(
    (state.roundSettlement?.flowerPigResults||[])
      .filter(r=>r.isFlowerPig)
      .map(r=>r.playerIndex)
  );
  return state.players.map((player,i)=>({
    name:player.name,
    won:!!player.won,
    delta:state.roundDelta[i]||0,
    total:state.scores[i]||0,
    missingSuit:player.missingSuit||null,
    missingSuitLabel:player.missingSuit?SUIT_LABEL[player.missingSuit]:null,
    flowerPig:pigs.has(i),
    status:player.won
      ?"已胡"
      :pigs.has(i)
        ?"花猪"
        :(reason.includes("流")||reason.includes("摸完")?"未胡":"留局")
  }));
}
