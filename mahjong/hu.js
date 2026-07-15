import {hasMissingSuit} from "./rules-guard.js";

function countsOf(hand){
  const counts={w:Array(10).fill(0),t:Array(10).fill(0),b:Array(10).fill(0)};
  hand.forEach(tile=>counts[tile.s][tile.n]++);
  return counts;
}

function exactMelds(counts,groupsNeeded){
  function dfs(left){
    let suit=null,number=0;
    outer:
    for(const s of ["w","t","b"]){
      for(let n=1;n<=9;n++){
        if(counts[s][n]>0){
          suit=s;number=n;break outer;
        }
      }
    }
    if(suit===null)return left===0;
    if(left<=0)return false;

    if(counts[suit][number]>=3){
      counts[suit][number]-=3;
      if(dfs(left-1)){
        counts[suit][number]+=3;
        return true;
      }
      counts[suit][number]+=3;
    }

    if(
      number<=7 &&
      counts[suit][number+1]>0 &&
      counts[suit][number+2]>0
    ){
      counts[suit][number]--;
      counts[suit][number+1]--;
      counts[suit][number+2]--;
      if(dfs(left-1)){
        counts[suit][number]++;
        counts[suit][number+1]++;
        counts[suit][number+2]++;
        return true;
      }
      counts[suit][number]++;
      counts[suit][number+1]++;
      counts[suit][number+2]++;
    }
    return false;
  }
  return dfs(groupsNeeded);
}

/**
 * 约束面子搜索：pongOk / chowOk / pairOk 返回 true 才允许该面子
 */
function exactMeldsConstrained(counts,groupsNeeded,pongOk,chowOk){
  function dfs(left){
    let suit=null,number=0;
    outer:
    for(const s of ["w","t","b"]){
      for(let n=1;n<=9;n++){
        if(counts[s][n]>0){
          suit=s;number=n;break outer;
        }
      }
    }
    if(suit===null)return left===0;
    if(left<=0)return false;

    if(counts[suit][number]>=3&&pongOk(suit,number)){
      counts[suit][number]-=3;
      if(dfs(left-1)){
        counts[suit][number]+=3;
        return true;
      }
      counts[suit][number]+=3;
    }

    if(
      number<=7 &&
      counts[suit][number+1]>0 &&
      counts[suit][number+2]>0 &&
      chowOk(suit,number)
    ){
      counts[suit][number]--;
      counts[suit][number+1]--;
      counts[suit][number+2]--;
      if(dfs(left-1)){
        counts[suit][number]++;
        counts[suit][number+1]++;
        counts[suit][number+2]++;
        return true;
      }
      counts[suit][number]++;
      counts[suit][number+1]++;
      counts[suit][number+2]++;
    }
    return false;
  }
  return dfs(groupsNeeded);
}

function standardWin(hand,meldCount){
  const groupsNeeded=4-meldCount;
  if(hand.length!==groupsNeeded*3+2)return false;
  const counts=countsOf(hand);
  for(const suit of ["w","t","b"]){
    for(let number=1;number<=9;number++){
      if(counts[suit][number]>=2){
        counts[suit][number]-=2;
        const ok=exactMelds(counts,groupsNeeded);
        counts[suit][number]+=2;
        if(ok)return true;
      }
    }
  }
  return false;
}

function standardWinConstrained(hand,melds,pairOk,pongOk,chowOk){
  const groupsNeeded=4-(melds||[]).length;
  if(hand.length!==groupsNeeded*3+2)return false;
  for(const meld of melds||[]){
    const tile=(meld.tiles||[])[0];
    if(!tile)return false;
    if(meld.type==="peng"||meld.type==="mingGang"||meld.type==="anGang"||meld.type==="buGang"){
      if(!pongOk(tile.s,tile.n))return false;
    }else{
      return false;
    }
  }
  const counts=countsOf(hand);
  for(const suit of ["w","t","b"]){
    for(let number=1;number<=9;number++){
      if(counts[suit][number]>=2&&pairOk(suit,number)){
        counts[suit][number]-=2;
        const ok=exactMeldsConstrained(counts,groupsNeeded,pongOk,chowOk);
        counts[suit][number]+=2;
        if(ok)return true;
      }
    }
  }
  return false;
}

/** @returns {{ok:boolean,quads:number}|null} */
function sevenPairsInfo(hand,melds){
  if((melds||[]).length!==0)return null;
  if(hand.length!==14)return null;
  const counts=countsOf(hand);
  let units=0,quads=0;
  for(const suit of ["w","t","b"]){
    for(let number=1;number<=9;number++){
      const value=counts[suit][number];
      if(value===4){units+=2;quads++;}
      else if(value===2)units++;
      else if(value!==0)return null;
    }
  }
  if(units!==7)return null;
  return {ok:true,quads};
}

function allTriplets(hand,melds){
  const groupsNeeded=4-melds.length;
  if(hand.length!==groupsNeeded*3+2)return false;
  const counts=countsOf(hand);
  for(const suit of ["w","t","b"]){
    for(let number=1;number<=9;number++){
      if(counts[suit][number]>=2){
        counts[suit][number]-=2;
        let groups=0,ok=true;
        for(const s of ["w","t","b"]){
          for(let n=1;n<=9;n++){
            const value=counts[s][n];
            if(value%3!==0)ok=false;
            groups+=Math.floor(value/3);
          }
        }
        counts[suit][number]+=2;
        if(ok&&groups===groupsNeeded)return true;
      }
    }
  }
  return false;
}

function isQing(hand,melds){
  const allTiles=hand.concat((melds||[]).flatMap(m=>m.tiles||[]));
  const suits=[...new Set(allTiles.map(t=>t.s))];
  return suits.length===1;
}

/**
 * 根：最终牌组中每种「四张同牌」计 1 根（含杠与手牌四张，不重复）
 */
export function countRoots(hand,melds=[]){
  const counts={w:Array(10).fill(0),t:Array(10).fill(0),b:Array(10).fill(0)};
  (hand||[]).forEach(t=>counts[t.s][t.n]++);
  (melds||[]).forEach(m=>{
    (m.tiles||[]).forEach(t=>counts[t.s][t.n]++);
  });
  let roots=0;
  for(const s of ["w","t","b"]){
    for(let n=1;n<=9;n++){
      if(counts[s][n]>=4)roots+=Math.floor(counts[s][n]/4);
    }
  }
  return roots;
}

/** 可选：金钩钓 — 副露满且手牌仅剩将 */
function isGoldenHook(hand,melds){
  if((melds||[]).length!==4)return false;
  return hand.length===2;
}

const isYao=(s,n)=>n===1||n===9;
const is258=(s,n)=>n===2||n===5||n===8;
const chowHasYao=(s,n)=>n===1||n===7; // 123 或 789

function isTerminalInEveryGroup(hand,melds){
  return standardWinConstrained(
    hand,melds,
    isYao,
    isYao,
    chowHasYao
  );
}

function isAll258Triplets(hand,melds){
  if(!allTriplets(hand,melds))return false;
  const all=hand.concat((melds||[]).flatMap(m=>m.tiles||[]));
  return all.every(t=>is258(t.s,t.n));
}

/**
 * 识别基础牌型（互斥：在匹配中取番最高，同番按优先级靠前）
 */
function detectBasePattern(hand,melds,patterns={}){
  const seven=sevenPairsInfo(hand,melds);
  const qing=isQing(hand,melds);
  const triplets=seven?false:allTriplets(hand,melds);
  const std=seven?true:standardWin(hand,melds.length);

  if(!seven&&!std)return null;

  const candidates=[];

  if(seven){
    if(qing&&seven.quads>=1){
      candidates.push({basePattern:"清龙七对",baseFan:6,priority:100,detail:`清一色七对，含${seven.quads}组四张相同牌。`});
    }else if(qing){
      candidates.push({basePattern:"清七对",baseFan:5,priority:90,detail:"清一色七对。"});
    }else if(seven.quads>=1){
      candidates.push({basePattern:"龙七对",baseFan:4,priority:80,detail:`七对牌型，含${seven.quads}组四张相同牌。`});
    }else{
      candidates.push({basePattern:"暗七对",baseFan:3,priority:70,detail:"无副露的七对。"});
    }
  }else{
    if(qing&&triplets){
      candidates.push({basePattern:"清大对",baseFan:4,priority:75,detail:"清一色且四组均为刻/杠加将。"});
    }
    if(qing){
      candidates.push({basePattern:"清一色",baseFan:3,priority:55,detail:"手牌与副露均为同一花色。"});
    }
    if(triplets){
      candidates.push({basePattern:"大对子",baseFan:2,priority:40,detail:"四组均为刻子或杠，加一对将。"});
    }
    candidates.push({basePattern:"平胡",baseFan:1,priority:10,detail:"标准四组面子加一对将。"});

    if(patterns.goldenHook&&isGoldenHook(hand,melds)){
      candidates.push({basePattern:"金钩钓",baseFan:3,priority:50,detail:"其余牌均已碰/杠，手牌单钓。"});
    }
    if(patterns.all258Triplets&&isAll258Triplets(hand,melds)){
      candidates.push({basePattern:"将对",baseFan:5,priority:85,detail:"全部刻/杠与将均为二四五八。"});
    }
    if(patterns.pureTerminalInEveryGroup&&qing&&isTerminalInEveryGroup(hand,melds)){
      candidates.push({basePattern:"清带幺",baseFan:4,priority:72,detail:"清一色，且各组与将均含幺九。"});
    }else if(patterns.terminalInEveryGroup&&isTerminalInEveryGroup(hand,melds)){
      candidates.push({basePattern:"带幺",baseFan:2,priority:35,detail:"每组面子与将均含１或９。"});
    }
  }

  candidates.sort((a,b)=>b.baseFan-a.baseFan||b.priority-a.priority);
  return candidates[0]||null;
}

function buildExtraFans(context={},extraPatterns={}){
  const extras=[];
  if(context.robGang&&extraPatterns.robGang!==false){
    extras.push({key:"robGang",label:"抢杠胡",fan:1});
  }else if(context.gangFlower&&extraPatterns.gangFlower!==false){
    extras.push({key:"gangFlower",label:"杠上花",fan:1});
  }else if(context.gangDiscard&&extraPatterns.gangDiscard!==false){
    extras.push({key:"gangDiscard",label:"杠上炮",fan:1});
  }
  if(context.lastTile&&extraPatterns.lastTile){
    extras.push({key:"lastTile",label:"海底",fan:1});
  }
  // 绝张：规则复杂，未具备全桌可见牌精确判定前绝不简化加番
  return extras;
}

function fanMultiplier(totalFan){
  const fan=Math.max(1,Number(totalFan)||1);
  return 2**(fan-1);
}

/**
 * @param {object} [rules] activeRules 快照；缺省时用保守默认（额外番开、可选牌型关）
 */
export function getWinInfo(hand,melds=[],context={},rules=null){
  if(hand.length%3!==2)return {canWin:false};

  const patterns=rules?.patterns||{};
  const extraPatterns=rules?.extraPatterns||{
    gangFlower:true,gangDiscard:true,robGang:true,lastTile:false,lastAvailableTile:false
  };

  const base=detectBasePattern(hand,melds,patterns);
  if(!base)return {canWin:false};

  const rootCount=countRoots(hand,melds);
  const extras=buildExtraFans(context,extraPatterns);
  const extraFanTotal=extras.reduce((sum,item)=>sum+item.fan,0);
  const totalFan=base.baseFan+rootCount+extraFanTotal;
  const multiplier=fanMultiplier(totalFan);

  const prefix=extras.map(e=>e.label).join("·");
  const name=prefix?`${prefix}·${base.basePattern}`:base.basePattern;
  const detailParts=[base.detail];
  if(rootCount)detailParts.push(`根×${rootCount}`);
  extras.forEach(e=>detailParts.push(e.label));

  return {
    canWin:true,
    name,
    basePattern:base.basePattern,
    baseFan:base.baseFan,
    extraFans:extras,
    rootCount,
    totalFan,
    multiplier,
    detail:detailParts.join(" · ")
  };
}

/**
 * 统一胡牌入口：缺门检查 + 牌型
 */
export function canPlayerWin(player,hand,melds,context={},rules=null){
  if(!player)return {canWin:false,reason:"no-player"};
  if(hasMissingSuit({...player,hand,melds})){
    return {canWin:false,reason:"missing-suit",detail:"请先打完缺门牌"};
  }
  const info=getWinInfo(hand,melds,context,rules);
  if(!info.canWin)return {canWin:false,reason:"not-winning"};
  return info;
}

export {fanMultiplier};
