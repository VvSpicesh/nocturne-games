/**
 * 计分：倍数 = 2^(totalFan-1)；底金 baseStake（默认 1）
 * 自摸：每家付 baseStake×multiplier + baseStake×1（加底，非 +1 番）
 * 杠分独立：暗杠未胡各 2 底、直杠放杠 2 底、弯杠未胡各 1 底
 * 花猪 / 未下叫：向其余每位各付 baseStake×2^(capFan-1)（封顶番，默认 8）
 */

import {emptyRoundSettlement,isFlowerPig,SUIT_LABEL} from "./rules-guard.js";
import {fanMultiplier,getReadyHandInfo} from "./hu.js";

export const START_SCORE=20000;

const SCORE_KEY="nocturne_mahjong_session_score_v10";
const SESSION_START_KEY="nocturne_mahjong_session_started_v10";
const EYE_WARN_KEY="nocturne_mahjong_eye_warned_v10";
export const EYE_WARN_MS=2*60*60*1000;

/** 封顶番：花猪 / 未下叫共用 */
export function capFanOf(state){
  const sr=state?.activeRules?.settlementRules||{};
  let fan=Number(sr.capFan);
  if(!Number.isFinite(fan)||fan<1)fan=Number(sr.flowerPigFan);
  if(!Number.isFinite(fan)||fan<1)fan=Number(sr.noReadyFan);
  if(!Number.isFinite(fan)||fan<1)fan=8;
  return Math.max(1,Math.min(16,Math.round(fan)));
}

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
  const fan=capFanOf(state);
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

  if(!results.length)return {deltas:[0,0,0,0],results};

  const text=results
    .map(r=>`${r.name}花猪(${r.missingSuitLabel}) ${formatPoints(deltas[r.playerIndex])}`)
    .join("；");
  const applied=applyDeltas(state,deltas,`花猪结算：${text}`);
  return {deltas,results,logText:applied.logText};
}

/**
 * 除当前玩家手牌外的全桌牌（他人手牌、所有副露、牌河、牌墙）。
 * 用于查叫「已出现 4 张」判定。
 */
export function collectVisibleTilesForReady(state,playerIndex){
  const tiles=[];
  (state.players||[]).forEach((p,i)=>{
    if(i!==playerIndex){
      (p.hand||[]).forEach(t=>tiles.push(t));
    }
    (p.melds||[]).forEach(m=>{
      (m.tiles||[]).forEach(t=>tiles.push(t));
    });
  });
  (state.discards||[]).forEach(item=>{
    if(item?.tile)tiles.push(item.tile);
  });
  (state.wall||[]).forEach(t=>tiles.push(t));
  return tiles;
}

/**
 * 查叫 / 未下叫：优先花猪；默认不叠罚。
 * 未下叫付款模型与花猪相同：向其余每位玩家各付一份。
 */
export function settleReadyHands(state){
  ensureScoreFields(state);
  const sr=state.activeRules?.settlementRules||{};
  const pigSet=new Set(
    (state.roundSettlement.flowerPigResults||[])
      .filter(r=>r.isFlowerPig)
      .map(r=>r.playerIndex)
  );
  const stack=sr.stackFlowerPigAndNoReady===true;
  const enabled=sr.noReadyEnabled!==false;
  const fan=capFanOf(state);
  const stake=baseStakeOf(state);
  const mult=fan>=1?fanMultiplier(fan):0;
  const unit=enabled&&mult>0?stake*mult:0;
  const deltas=[0,0,0,0];
  const results=[];
  const rules=state.activeRules||null;

  state.players.forEach((p,i)=>{
    if(p.won)return;
    const isPig=pigSet.has(i)||isFlowerPig(p).isFlowerPig;
    if(isPig&&!stack)return;

    const visible=collectVisibleTilesForReady(state,i);
    const ready=getReadyHandInfo(p,visible,rules);
    const payments=[];

    if(!ready.isReady&&enabled&&unit>0){
      for(let j=0;j<4;j++){
        if(j===i)continue;
        deltas[i]-=unit;
        deltas[j]+=unit;
        payments.push({from:i,to:j,amount:unit});
      }
    }

    results.push({
      playerIndex:i,
      name:p.name,
      isReady:ready.isReady,
      waitingTiles:ready.waitingTiles||[],
      maxWinInfo:ready.maxWinInfo,
      fan:ready.isReady?null:(Number.isFinite(fan)?fan:null),
      multiplier:ready.isReady?null:(mult||null),
      unit:ready.isReady?0:unit,
      payments,
      paid:!ready.isReady&&payments.length>0,
      reason:ready.isReady?"已下叫":"未下叫"
    });
  });

  state.roundSettlement.readyHandResults=results;

  if(!results.some(r=>!r.isReady&&r.paid)){
    return {deltas:[0,0,0,0],results};
  }

  const text=results
    .filter(r=>!r.isReady&&r.paid)
    .map(r=>`${r.name}未下叫 ${formatPoints(deltas[r.playerIndex])}`)
    .join("；");
  const applied=applyDeltas(state,deltas,`查叫结算：${text}`);
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
  const readyMap=new Map(
    (state.roundSettlement?.readyHandResults||[])
      .map(r=>[r.playerIndex,r])
  );
  return state.players.map((player,i)=>{
    const ready=readyMap.get(i);
    let status="留局";
    if(player.won)status="已胡";
    else if(pigs.has(i))status="花猪";
    else if(ready?.isReady)status="已下叫";
    else if(ready&&ready.isReady===false)status="未下叫";
    else if(reason.includes("流")||reason.includes("摸完")||reason.includes("三家"))status="未胡";
    return {
      name:player.name,
      won:!!player.won,
      delta:state.roundDelta[i]||0,
      total:state.scores[i]||0,
      missingSuit:player.missingSuit||null,
      missingSuitLabel:player.missingSuit?SUIT_LABEL[player.missingSuit]:null,
      flowerPig:pigs.has(i),
      isReady:ready?!!ready.isReady:null,
      waitingTiles:ready?.waitingTiles||[],
      status,
      bits:playerSettlementBits(state,i)
    };
  });
}

const SEAT_SHORT=["自己","上家","对家","下家"];

function seatShort(state,index){
  const name=state.players[index]?.name;
  return name?`${SEAT_SHORT[index]} ${name}`:SEAT_SHORT[index];
}

/**
 * 从本局流水提炼短文案：如「平胡 1番 +2」「放炮 对家 -2」
 */
export function playerSettlementBits(state,playerIndex){
  ensureScoreFields(state);
  const rs=state.roundSettlement||emptyRoundSettlement();
  const bits=[];

  (rs.huPayments||[]).forEach(h=>{
    if(h.winner===playerIndex){
      const gained=(h.payments||[])
        .filter(p=>p.to===playerIndex)
        .reduce((s,p)=>s+(Number(p.amount)||0),0);
      const kind=
        h.kind==="selfDraw"?"自摸":
        h.kind==="robGang"?"抢杠胡":
        h.kind==="gangDiscard"?"杠上炮":"";
      const pattern=h.basePattern||"平胡";
      const fan=h.totalFan??"?";
      bits.push(
        `${kind?kind+" ":""}${pattern} ${fan}番 ${formatPoints(gained)}`.trim()
      );
    }
    (h.payments||[]).forEach(pay=>{
      if(pay.from!==playerIndex)return;
      if(h.winner===playerIndex)return;
      const amt=-(Number(pay.amount)||0);
      if(h.kind==="selfDraw"){
        bits.push(`被自摸 ${seatShort(state,h.winner)} ${formatPoints(amt)}`);
      }else if(h.kind==="robGang"){
        bits.push(`被抢杠 ${seatShort(state,h.winner)} ${formatPoints(amt)}`);
      }else{
        bits.push(`放炮 ${seatShort(state,h.winner)} ${formatPoints(amt)}`);
      }
    });
  });

  (rs.gangPayments||[]).forEach(g=>{
    if(g.actor===playerIndex){
      const gained=(g.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0);
      bits.push(`${g.label||"杠"} ${formatPoints(gained)}`);
    }
    let paid=0;
    (g.payments||[]).forEach(pay=>{
      if(pay.from===playerIndex)paid+=Number(pay.amount)||0;
    });
    if(paid){
      bits.push(`付${g.label||"杠"} ${seatShort(state,g.actor)} ${formatPoints(-paid)}`);
    }
  });

  (rs.flowerPigResults||[]).forEach(f=>{
    if(f.playerIndex===playerIndex&&f.paid){
      const lost=(f.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0);
      bits.push(`花猪 ${f.fan||"?"}番 ${formatPoints(-lost)}`);
    }
    let got=0;
    (f.payments||[]).forEach(pay=>{
      if(pay.to===playerIndex)got+=Number(pay.amount)||0;
    });
    if(got){
      const pigIncome=`收花猪 ${formatPoints(got)}`;
      if(bits.length)bits[bits.length-1]+=` · ${pigIncome}`;
      else bits.push(pigIncome);
    }
  });

  (rs.readyHandResults||[]).forEach(r=>{
    if(r.playerIndex===playerIndex){
      if(!r.isReady&&r.paid){
        const lost=(r.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0);
        bits.push(`未下叫 ${r.fan||"?"}番 ${formatPoints(-lost)}`);
      }
    }
    let got=0;
    if(!r.isReady){
      (r.payments||[]).forEach(pay=>{
        if(pay.to===playerIndex)got+=Number(pay.amount)||0;
      });
    }
    if(got)bits.push(`查叫收入 ${formatPoints(got)}`);
  });

  return bits;
}
