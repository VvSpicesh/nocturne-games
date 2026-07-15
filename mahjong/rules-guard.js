/** 定缺 / 花猪等统一规则守卫（勿在流程里重复散写） */

export const SUIT_LABEL={w:"万",t:"条",b:"筒"};

export function hasMissingSuit(player){
  if(!player?.missingSuit)return false;
  const suit=player.missingSuit;
  if((player.hand||[]).some(t=>t.s===suit))return true;
  return (player.melds||[]).some(m=>(m.tiles||[]).some(t=>t.s===suit));
}

export function tilesOfMissingSuit(player){
  if(!player?.missingSuit)return [];
  const suit=player.missingSuit;
  const list=[];
  (player.hand||[]).forEach(t=>{if(t.s===suit)list.push(t);});
  (player.melds||[]).forEach(m=>(m.tiles||[]).forEach(t=>{if(t.s===suit)list.push(t);}));
  return list;
}

/** 仍有缺门牌时，只能打缺门花色 */
export function getLegalDiscardIndexes(player){
  const hand=player?.hand||[];
  if(!player?.missingSuit)return hand.map((_,i)=>i);
  const suit=player.missingSuit;
  const missingIndexes=[];
  hand.forEach((t,i)=>{if(t.s===suit)missingIndexes.push(i);});
  if(missingIndexes.length)return missingIndexes;
  return hand.map((_,i)=>i);
}

export function isLegalDiscard(player,tileIndex){
  return getLegalDiscardIndexes(player).includes(tileIndex);
}

export function canClaimTileSuit(player,tile){
  if(!tile||!player?.missingSuit)return true;
  return tile.s!==player.missingSuit;
}

/**
 * 花猪：终局时仍持有定缺花色（手牌或副露）
 */
export function isFlowerPig(player){
  if(!player?.missingSuit){
    return {isFlowerPig:false,missingSuit:null,offendingTiles:[]};
  }
  const offendingTiles=tilesOfMissingSuit(player);
  return {
    isFlowerPig:offendingTiles.length>0,
    missingSuit:player.missingSuit,
    offendingTiles
  };
}

/** AI：选手牌张数最少的花色；平手按 w→t→b */
export function pickAiMissingSuit(hand){
  const counts={w:0,t:0,b:0};
  (hand||[]).forEach(t=>{if(counts[t.s]!=null)counts[t.s]++;});
  let best="w";
  let bestCount=Infinity;
  for(const s of ["w","t","b"]){
    if(counts[s]<bestCount){
      best=s;
      bestCount=counts[s];
    }
  }
  return best;
}

export function emptyRoundSettlement(){
  return {
    huPayments:[],
    gangPayments:[],
    flowerPigResults:[],
    readyHandResults:[],
    playerDeltas:[0,0,0,0]
  };
}
