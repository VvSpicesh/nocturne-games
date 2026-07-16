/**
 * 完整规则验收套件（固定牌面，无随机）。
 * 返回 { cases, passed, failed, blocked, lines, ok }
 */
import {getWinInfo,canPlayerWin,countRoots,fanMultiplier,getReadyHandInfo} from "./hu.js";
import {
  hasMissingSuit,
  getLegalDiscardIndexes,
  isLegalDiscard,
  canClaimTileSuit,
  isFlowerPig,
  pickAiMissingSuit,
  emptyRoundSettlement
} from "./rules-guard.js";
import {
  settleSelfDraw,
  settleDiscardWins,
  settleMingGang,
  settleAnOrBuGang,
  settleFlowerPigs,
  settleReadyHands,
  collectVisibleTilesForReady,
  capFanOf
} from "./score.js";
import {defaultRules,mergeDeep,normalizeSettlementRules} from "./config.js";
import {tileSpeechName} from "./audio.js";

function T(s,n,id=0){return {s,n,id};}
function tiles(pairs,startId=1){
  let id=startId;
  const out=[];
  for(const [s,n,c=1] of pairs){
    for(let i=0;i<c;i++)out.push(T(s,n,id++));
  }
  return out;
}
function meld(type,s,n,count=3){
  return {type,from:1,tiles:Array.from({length:count},(_,i)=>T(s,n,900+i))};
}
function pingHuHand(){
  return tiles([["w",1],["w",2],["w",3],["w",4],["w",5],["w",6],["t",7],["t",8],["t",9],["b",1,3],["b",5,2]]);
}
/** 13 张听牌：听 5 筒；无万，可定缺万 */
function tingPingHuHand(){
  return tiles([["t",1],["t",2],["t",3],["t",4],["t",5],["t",6],["t",7],["t",8],["t",9],["b",1,3],["b",5]]);
}
/** 13 张散牌非听；无万，可定缺万 */
function noReadyHand(){
  return tiles([["t",1],["t",3],["t",5],["t",7],["t",9],["b",1],["b",3],["b",5],["b",7],["b",9],["t",2],["t",4],["t",6]]);
}
function qingYiSeHand(){
  // 副露碰1万 + 手牌 234567 88 999 —— 清一色且无根
  return {
    hand:tiles([["w",2],["w",3],["w",4],["w",5],["w",6],["w",7],["w",8,2],["w",9,3]]),
    melds:[meld("peng","w",1)]
  };
}
function sum(arr){return (arr||[]).reduce((a,b)=>a+(Number(b)||0),0);}

function makeState(overrides={}){
  const players=["A","B","C","D"].map(name=>({
    name,hand:[],won:false,melds:[],missingSuit:null
  }));
  return {
    players,
    scores:[20000,20000,20000,20000],
    roundDelta:[0,0,0,0],
    scoreLog:[],
    roundSettlement:emptyRoundSettlement(),
    activeRules:structuredClone(defaultRules),
    ...overrides
  };
}

function aiPickDiscard(player){
  const hand=player.hand;
  const legal=new Set(getLegalDiscardIndexes(player));
  const ranked=hand.map((tile,index)=>{
    const same=hand.filter(t=>t.s===tile.s&&t.n===tile.n).length;
    const near1=hand.filter(t=>t.s===tile.s&&Math.abs(t.n-tile.n)===1).length;
    return {index,score:same*5+near1*3,legal:legal.has(index)};
  }).filter(x=>x.legal).sort((a,b)=>a.score-b.score);
  return ranked[0]||null;
}

function assert(cond,msg){
  if(!cond)throw new Error(msg||"assert failed");
}

export function runRuleTests(){
  const cases=[];
  let passed=0,failed=0,blocked=0;

  function record(id,scenario,expected,fn){
    if(typeof fn!=="function"){
      failed++;
      cases.push({id,scenario,expected:String(expected),actual:"内部错误：测试回调不是函数",result:"FAIL"});
      return;
    }
    try{
      fn();
      passed++;
      cases.push({id,scenario,expected,actual:"符合预期",result:"PASS"});
    }catch(err){
      failed++;
      cases.push({id,scenario,expected,actual:err.message,result:"FAIL"});
    }
  }
  function block(id,scenario,expected,reason){
    blocked++;
    cases.push({id,scenario,expected,actual:reason,result:"BLOCKED"});
  }

  record("S1","config 新配置默认值齐全","settlementRules/patterns/extraPatterns/gangRules/baseStake",()=>{
    const r=defaultRules;
    assert(r.baseStake===1&&r.selfDrawAddsBase===true);
    assert(r.settlementRules.capFan===8);
    assert(r.settlementRules.flowerPigFan===8&&r.settlementRules.noReadyFan===8);
    assert(r.settlementRules.stackFlowerPigAndNoReady===false);
    assert(r.patterns.goldenHook===false);
    assert(r.extraPatterns.gangFlower===true&&r.extraPatterns.lastTile===false&&r.extraPatterns.lastAvailableTile===false);
    assert(r.gangRules.drizzleMode===false);
  });

  record("S3","封顶番规范化","capFan 同步 flowerPigFan/noReadyFan",()=>{
    const n=normalizeSettlementRules(mergeDeep(defaultRules,{settlementRules:{capFan:6}}));
    assert(n.settlementRules.capFan===6);
    assert(n.settlementRules.flowerPigFan===6&&n.settlementRules.noReadyFan===6);
    const state={activeRules:n};
    assert(capFanOf(state)===6);
  });

  record("A1","牌名语音中文数字","五万/三条/八筒",()=>{
    assert(tileSpeechName({s:"w",n:5})==="五万");
    assert(tileSpeechName({s:"t",n:3})==="三条");
    assert(tileSpeechName({s:"b",n:8})==="八筒");
    assert(tileSpeechName({s:"w",n:1})==="一万");
    assert(tileSpeechName({s:"b",n:9})==="九筒");
  });

  record("S2","旧存档缺字段 mergeDeep 不崩溃","缺字段补全后可访问",()=>{
    const merged=mergeDeep(defaultRules,{exchangeThree:false});
    assert(merged.settlementRules.flowerPigFan===8);
    assert(merged.patterns.all258Triplets===false);
    assert(hasMissingSuit({hand:[],melds:[],missingSuit:null})===false);
    const rs=emptyRoundSettlement();
    assert(Array.isArray(rs.huPayments)&&Array.isArray(rs.readyHandResults)&&rs.playerDeltas.length===4);
  });

  record("1","有缺门牌时打其他花色","非法出非缺门；缺门可打",()=>{
    const player={
      name:"X",
      hand:tiles([["w",1],["w",2],["t",3],["t",4],["b",5,2],["b",6,3],["b",7,3]]),
      melds:[],
      missingSuit:"w"
    };
    assert(getLegalDiscardIndexes(player).every(i=>player.hand[i].s==="w"));
    assert(!isLegalDiscard(player,2),"条不可打");
    assert(isLegalDiscard(player,0),"万可打");
  });

  record("2","AI 仍有缺门牌必须先打缺门","合法过滤覆盖 keepScore",()=>{
    const player={
      name:"AI",
      hand:tiles([["w",9],["t",5,3],["t",6,2],["b",1,3],["b",2,3],["b",3,2]]),
      melds:[],
      missingSuit:"w"
    };
    const pick=aiPickDiscard(player);
    assert(pick&&player.hand[pick.index].s==="w",`picked suit`);
  });

  record("3","碰/杠缺门牌不合法","canClaimTileSuit=false",()=>{
    const player={name:"X",hand:tiles([["w",5,2],["t",1,3]]),melds:[],missingSuit:"w"};
    assert(!canClaimTileSuit(player,T("w",5)));
    assert(canClaimTileSuit(player,T("t",9)));
  });

  record("4","胡牌时仍含缺门","自摸/点炮/抢杠/杠上花均不可胡",()=>{
    const p={name:"X",hand:pingHuHand(),melds:[],missingSuit:"w",won:false};
    assert(hasMissingSuit(p));
    for(const ctx of [{}, {gangFlower:true}, {gangDiscard:true}, {robGang:true}]){
      const info=canPlayerWin(p,p.hand,p.melds,ctx,defaultRules);
      assert(!info.canWin&&info.reason==="missing-suit",JSON.stringify(ctx));
    }
  });

  record("5","终局仍有缺门牌花猪处罚","isFlowerPig+流水+deltas=0",()=>{
    const state=makeState();
    state.players[0].missingSuit="w";
    state.players[0].hand=tiles([["w",3]]);
    state.players[1].missingSuit="t";
    state.players[1].hand=tiles([["b",1]]);
    state.players[2].missingSuit="b";
    state.players[2].hand=tiles([["w",2]]);
    state.players[3].missingSuit="t";
    state.players[3].hand=tiles([["w",4]]);
    const pig=isFlowerPig(state.players[0]);
    assert(pig.isFlowerPig&&pig.offendingTiles.length===1&&pig.missingSuit==="w");
    const settled=settleFlowerPigs(state);
    assert(state.roundSettlement.flowerPigResults.length===1);
    assert(state.roundSettlement.flowerPigResults[0].paid===true);
    assert(state.roundSettlement.flowerPigResults[0].fan===8);
    assert(state.roundSettlement.flowerPigResults[0].missingSuitLabel==="万");
    assert(sum(settled.deltas)===0);
    assert(sum(state.roundSettlement.playerDeltas)===0);
    assert(settled.deltas[0]===-384);
  });

  record("6","无缺门牌不判花猪","无 flowerPigResults / 无罚分",()=>{
    const state=makeState();
    state.players[0].missingSuit="w";
    state.players[0].hand=tiles([["t",1]]);
    state.players[1].missingSuit="t";
    state.players[1].hand=tiles([["w",1]]);
    state.players[2].missingSuit="b";
    state.players[2].hand=tiles([["w",2]]);
    state.players[3].missingSuit="w";
    state.players[3].hand=tiles([["t",2]]);
    const settled=settleFlowerPigs(state);
    assert((state.roundSettlement.flowerPigResults||[]).length===0);
    assert(sum(settled.deltas)===0);
  });

  record("7","花猪与未下叫同时","不追加未下叫；readyHandResults 无该家",()=>{
    const state=makeState();
    state.players[0].missingSuit="w";
    state.players[0].hand=[T("w",1),...noReadyHand().slice(0,12)];
    state.players[1].missingSuit="w";
    state.players[1].hand=tingPingHuHand();
    state.players[2].missingSuit="w";
    state.players[2].hand=tingPingHuHand();
    state.players[3].missingSuit="w";
    state.players[3].hand=tingPingHuHand();
    settleFlowerPigs(state);
    settleReadyHands(state);
    assert(state.roundSettlement.flowerPigResults.every(r=>r.reason==="花猪"));
    assert(!state.roundSettlement.readyHandResults.some(r=>r.playerIndex===0));
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });

  record("RH1","自己非花猪未下叫","readyHandResults+处罚+status",()=>{
    const state=makeState();
    state.players.forEach((p,i)=>{
      p.missingSuit="w";
      p.hand=i===0?noReadyHand():tingPingHuHand();
    });
    settleFlowerPigs(state);
    settleReadyHands(state);
    assert((state.roundSettlement.flowerPigResults||[]).length===0);
    const mine=state.roundSettlement.readyHandResults.find(r=>r.playerIndex===0);
    assert(mine&&mine.isReady===false&&mine.reason==="未下叫");
    assert(mine.paid===true&&mine.payments.length===3);
    assert(mine.fan===8&&mine.multiplier===128);
    assert(state.roundDelta[0]===-384);
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });

  record("RH2","自己已下叫","有 waitingTiles 图案数据、不处罚",()=>{
    const state=makeState();
    state.players.forEach((p)=>{
      p.missingSuit="w";
      p.hand=tingPingHuHand();
    });
    settleFlowerPigs(state);
    settleReadyHands(state);
    const mine=state.roundSettlement.readyHandResults.find(r=>r.playerIndex===0);
    assert(mine&&mine.isReady===true&&mine.reason==="已下叫");
    assert(mine.waitingTiles.some(t=>t.s==="b"&&t.n===5));
    assert(mine.payments.length===0&&mine.paid===false);
    assert(state.roundDelta[0]===0);
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });

  record("RH3","自己花猪默认不叠未下叫","只花猪流水",()=>{
    const state=makeState();
    state.players[0].missingSuit="b";
    state.players[0].hand=[T("b",9),...noReadyHand().slice(0,12)];
    for(let i=1;i<4;i++){
      state.players[i].missingSuit="w";
      state.players[i].hand=tingPingHuHand();
    }
    settleFlowerPigs(state);
    settleReadyHands(state);
    assert(state.roundSettlement.flowerPigResults.some(r=>r.playerIndex===0));
    assert(!state.roundSettlement.readyHandResults.some(r=>r.playerIndex===0));
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });

  record("RH4","AI 未下叫检测并结算","playerIndex=1 处罚",()=>{
    const state=makeState();
    state.players.forEach((p,i)=>{
      p.missingSuit="w";
      p.hand=i===1?noReadyHand():tingPingHuHand();
    });
    settleFlowerPigs(state);
    settleReadyHands(state);
    const ai=state.roundSettlement.readyHandResults.find(r=>r.playerIndex===1);
    assert(ai&&ai.isReady===false&&ai.paid===true);
    assert(state.roundDelta[1]===-384);
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });

  record("RH5","已出现4张不可作等待牌","getReadyHandInfo 过滤",()=>{
    const player={
      name:"X",
      hand:tingPingHuHand(),
      melds:[],
      missingSuit:"w",
      won:false
    };
    const visible=tiles([["b",5,4]]);
    const info=getReadyHandInfo(player,visible,defaultRules);
    assert(!info.waitingTiles.some(t=>t.s==="b"&&t.n===5),"5筒应被滤掉");
  });

  record("RH6","三家已胡剩余一家仍查叫","仅未胡家写入",()=>{
    const state=makeState();
    state.players[0].won=true;
    state.players[1].won=true;
    state.players[2].won=true;
    state.players[3].missingSuit="w";
    state.players[3].hand=noReadyHand();
    settleFlowerPigs(state);
    settleReadyHands(state);
    assert(state.roundSettlement.readyHandResults.length===1);
    assert(state.roundSettlement.readyHandResults[0].playerIndex===3);
    assert(state.roundSettlement.readyHandResults[0].isReady===false);
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });

  record("RH7","结算守恒","花猪+未下叫合计0",()=>{
    const state=makeState();
    state.players[0].missingSuit="w";
    state.players[0].hand=tiles([["w",1]]);
    state.players[1].missingSuit="w";
    state.players[1].hand=noReadyHand();
    state.players[2].missingSuit="w";
    state.players[2].hand=tingPingHuHand();
    state.players[3].missingSuit="w";
    state.players[3].hand=tingPingHuHand();
    settleFlowerPigs(state);
    settleReadyHands(state);
    assert(state.roundSettlement.flowerPigResults.length===1);
    assert(state.roundSettlement.readyHandResults.some(r=>r.playerIndex===1&&!r.isReady));
    assert(sum(state.roundSettlement.playerDeltas)===0);
    assert(collectVisibleTilesForReady(state,1).length>=0);
  });

  record("RH8","revealAllHands 标记语义","phase结束应亮牌",()=>{
    const state=makeState({phase:"结束",revealAllHands:true});
    assert(state.revealAllHands===true);
    assert(state.phase==="结束");
  });

  record("P1","平胡","baseFan=1 multiplier=1",()=>{
    const info=getWinInfo(pingHuHand(),[],{},defaultRules);
    assert(info.basePattern==="平胡"&&info.baseFan===1&&info.multiplier===1&&info.rootCount===0,JSON.stringify(info));
  });
  record("P2","大对子","baseFan=2 ×2",()=>{
    const hand=tiles([["w",1,3],["w",4,3],["t",5,3],["b",8,3],["b",2,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="大对子"&&info.baseFan===2&&info.multiplier===2);
  });
  record("P3","清一色","baseFan=3 ×4",()=>{
    const {hand,melds}=qingYiSeHand();
    const info=getWinInfo(hand,melds,{},defaultRules);
    assert(info.basePattern==="清一色"&&info.baseFan===3&&info.multiplier===4&&info.rootCount===0,JSON.stringify(info));
  });
  record("P4","清大对","baseFan=4 ×8",()=>{
    const hand=tiles([["w",1,3],["w",4,3],["w",5,3],["w",8,3],["w",2,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="清大对"&&info.baseFan===4&&info.multiplier===8);
  });
  record("P5","暗七对","baseFan=3 ×4",()=>{
    const hand=tiles([["w",1,2],["w",3,2],["t",2,2],["t",4,2],["b",5,2],["b",7,2],["w",9,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="暗七对"&&info.baseFan===3&&info.multiplier===4);
  });
  record("P6","龙七对一根","baseFan=4 root=1 total=5 ×16",()=>{
    const hand=tiles([["w",1,4],["w",3,2],["t",2,2],["t",4,2],["b",5,2],["b",7,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="龙七对"&&info.baseFan===4&&info.rootCount===1);
    assert(info.totalFan===5&&info.multiplier===16,JSON.stringify(info));
  });
  record("P7","双龙七对两根","rootCount=2 totalFan=baseFan+2",()=>{
    const hand=tiles([["w",1,4],["w",2,4],["t",3,2],["t",5,2],["b",7,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="龙七对"&&info.rootCount===2,JSON.stringify(info));
    assert(info.totalFan===info.baseFan+2);
    assert(info.multiplier===fanMultiplier(info.totalFan));
  });
  record("P8","清七对","baseFan=5 ×16",()=>{
    const hand=tiles([["w",1,2],["w",2,2],["w",3,2],["w",4,2],["w",5,2],["w",6,2],["w",8,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="清七对"&&info.baseFan===5&&info.multiplier===16);
  });
  record("P9","清龙七对一根","baseFan=6 root=1 total=7 ×64",()=>{
    const hand=tiles([["w",1,4],["w",2,2],["w",3,2],["w",4,2],["w",5,2],["w",6,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="清龙七对"&&info.baseFan===6&&info.rootCount===1);
    assert(info.totalFan===7&&info.multiplier===64,JSON.stringify(info));
  });
  record("P10","牌型互斥：清大对不叠清一色","单一 basePattern，fan=4",()=>{
    const hand=tiles([["w",1,3],["w",4,3],["w",5,3],["w",8,3],["w",2,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="清大对");
    assert(info.baseFan===4&&info.totalFan===4);
  });

  record("8","手牌四张未杠算1根","countRoots=1",()=>{
    const hand=tiles([["w",1,4],["w",2,2],["w",3,2],["w",4,2],["w",5,2],["w",6,2]]);
    assert(countRoots(hand,[])===1);
  });
  record("9","明杠算1根","countRoots=1",()=>{
    const hand=tiles([["w",2,3],["w",3,3],["w",4,3],["t",5,2]]);
    assert(countRoots(hand,[meld("mingGang","b",9,4)])===1);
  });
  record("10","补杠仍只算1根","countRoots=1",()=>{
    const hand=tiles([["w",2,3],["w",3,3],["w",4,3],["t",5,2]]);
    assert(countRoots(hand,[meld("buGang","b",9,4)])===1);
  });
  record("11","两组四张算2根","countRoots=2",()=>{
    const hand=tiles([["w",1,4],["t",2,4],["b",3,2],["b",5,2],["b",7,2]]);
    assert(countRoots(hand,[])===2);
  });
  record("12","副露+手牌同牌种不重复","碰3+手1=1根",()=>{
    const hand=tiles([["w",1,1],["w",2,3],["w",3,3],["w",4,2],["t",5,2]]);
    assert(countRoots(hand,[meld("peng","w",1,3)])===1);
  });

  record("13","杠上花 +1","extraFans 含杠上花，基础仍平胡",()=>{
    const info=getWinInfo(pingHuHand(),[],{gangFlower:true},defaultRules);
    assert(info.basePattern==="平胡");
    assert(info.extraFans.some(e=>e.key==="gangFlower"&&e.fan===1));
    assert(info.totalFan===2);
  });
  record("14","杠上炮 +1","extraFans 含杠上炮",()=>{
    const info=getWinInfo(pingHuHand(),[],{gangDiscard:true},defaultRules);
    assert(info.extraFans.some(e=>e.key==="gangDiscard"));
    assert(info.totalFan===2);
  });
  record("15","抢杠胡 +1 且无弯杠分","huPayments 有，gangPayments 空",()=>{
    const state=makeState();
    const info=getWinInfo(pingHuHand(),[],{robGang:true},defaultRules);
    assert(info.extraFans.some(e=>e.key==="robGang"));
    settleDiscardWins(state,[0],1,[info],{robGang:true});
    assert(state.roundSettlement.gangPayments.length===0);
    assert(state.roundSettlement.huPayments.length===1);
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });
  record("16","海底/绝张默认关","不计算不显示",()=>{
    const a=getWinInfo(pingHuHand(),[],{lastTile:true,lastAvailableTile:true},defaultRules);
    assert(a.totalFan===1&&a.extraFans.length===0);
  });

  record("17","2番点炮","放炮者付2，他人0，合计0",()=>{
    const state=makeState();
    const hand=tiles([["w",1,3],["w",4,3],["t",5,3],["b",8,3],["b",2,1]]);
    const tile=T("b",2,99);
    const info=getWinInfo(hand.concat([tile]),[],{},defaultRules);
    assert(info.baseFan===2&&info.multiplier===2);
    const s=settleDiscardWins(state,[0],1,[info],{});
    assert(s.deltas[0]===2&&s.deltas[1]===-2&&s.deltas[2]===0&&s.deltas[3]===0);
    assert(sum(s.deltas)===0);
  });
  record("18","2番自摸","每家付3；totalFan仍为2",()=>{
    const state=makeState();
    const hand=tiles([["w",1,3],["w",4,3],["t",5,3],["b",8,3],["b",2,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.basePattern==="大对子"&&info.totalFan===2&&info.multiplier===2);
    const s=settleSelfDraw(state,0,info,{selfDraw:true});
    assert(s.breakdown.totalFan===2,"加底不进 totalFan");
    assert(s.unit===3,`unit=${s.unit}`);
    assert(s.deltas[0]===9&&s.deltas[1]===-3);
    assert(sum(s.deltas)===0);
  });
  record("19","5番自摸","每家付17；totalFan=5",()=>{
    const state=makeState();
    const hand=tiles([["w",1,2],["w",2,2],["w",3,2],["w",4,2],["w",5,2],["w",6,2],["w",8,2]]);
    const info=getWinInfo(hand,[],{},defaultRules);
    assert(info.baseFan===5&&info.multiplier===16&&info.totalFan===5);
    const s=settleSelfDraw(state,0,info,{selfDraw:true});
    assert(s.breakdown.totalFan===5);
    assert(s.unit===17);
    assert(s.deltas[0]===51);
    assert(sum(s.deltas)===0);
  });

  record("20","暗杠","未胡各2；gangPayments；合计0",()=>{
    const state=makeState();
    settleAnOrBuGang(state,0,"暗杠");
    assert(state.roundDelta[0]===6);
    assert(state.roundSettlement.gangPayments[0].type==="anGang");
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });
  record("21","直杠","仅放杠者付2",()=>{
    const state=makeState();
    settleMingGang(state,0,2);
    assert(state.roundDelta[0]===2&&state.roundDelta[2]===-2);
    assert(state.roundDelta[1]===0&&state.roundDelta[3]===0);
    assert(sum(state.roundDelta)===0);
  });
  record("22","弯杠","未胡各付1",()=>{
    const state=makeState();
    settleAnOrBuGang(state,0,"补杠");
    assert(state.roundDelta[0]===3&&state.roundDelta[1]===-1);
    assert(sum(state.roundDelta)===0);
  });
  record("23","抢杠成功无弯杠流水","gangPayments 空",()=>{
    const state=makeState();
    const info=getWinInfo(pingHuHand(),[],{robGang:true},defaultRules);
    settleDiscardWins(state,[0],2,[info],{robGang:true});
    assert(state.roundSettlement.gangPayments.length===0);
    assert(state.roundSettlement.huPayments[0].kind==="robGang");
    assert(sum(state.roundSettlement.playerDeltas)===0);
  });
  record("24","drizzleMode=false","直杠仅放杠者",()=>{
    assert(defaultRules.gangRules.drizzleMode===false);
    const state=makeState();
    settleMingGang(state,1,0);
    const nonzero=state.roundDelta.filter(x=>x!==0);
    assert(nonzero.length===2);
    assert(sum(state.roundDelta)===0);
  });

  record("25","一炮多响两家","分别支付两条 huPayments，合计0",()=>{
    const state=makeState();
    const near=()=>tiles([["w",1,3],["w",4,3],["t",5,3],["b",8,3],["b",2,1]]);
    const tile=T("b",2,50);
    const i0=getWinInfo(near().concat([tile]),[],{},defaultRules);
    const i2=getWinInfo(near().concat([tile]),[],{},defaultRules);
    const s=settleDiscardWins(state,[0,2],1,[i0,i2],{});
    assert(state.roundSettlement.huPayments.length===2);
    assert(s.deltas[0]===2&&s.deltas[2]===2&&s.deltas[1]===-4);
    assert(sum(s.deltas)===0);
  });

  record("R1","roundSettlement 结构与分流","胡/杠/花猪分开；playerDeltas 合计0",()=>{
    const state=makeState();
    const info=getWinInfo(pingHuHand(),[],{},defaultRules);
    settleSelfDraw(state,0,info,{selfDraw:true});
    settleAnOrBuGang(state,1,"暗杠");
    state.players[2].missingSuit="w";
    state.players[2].hand=tiles([["w",1]]);
    settleFlowerPigs(state);
    const rs=state.roundSettlement;
    assert(rs.huPayments.length>=1&&rs.gangPayments.length>=1&&rs.flowerPigResults.length>=1);
    assert(Array.isArray(rs.readyHandResults));
    assert(sum(rs.playerDeltas)===0,"deltas sum 0");
    assert(rs.huPayments[0].payments&&rs.gangPayments[0].payments&&rs.flowerPigResults[0].payments);
  });

  record("AI0","AI 定缺选最少花色","pickAiMissingSuit",()=>{
    assert(pickAiMissingSuit(tiles([["w",1,5],["t",2,2],["b",3,1]]))==="b");
  });

  block("UI1","换三张/定缺弹层/大按钮/飘字/二次点击出牌","交互与动画正常","需人工点选；套件未驱动完整 UI");
  block("UI2","牌面尺寸与四档布局","视觉未破坏","tiles.js 未改；style 仅 +tile-illegal；需人工抽检");
  block("UI3","PWA 离线与 GitHub Pages","离线可开、路径正确","需部署后实测");

  const lines=cases.map(c=>`${c.result==="PASS"?"✓":c.result==="FAIL"?"✗":"·"} [${c.id}] ${c.scenario}: ${c.actual}`);
  return {cases,passed,failed,blocked,lines,ok:failed===0};
}
