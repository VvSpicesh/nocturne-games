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

function sevenPairs(hand){
  if(hand.length!==14)return null;
  const counts=countsOf(hand);
  let units=0,quads=0;

  for(const suit of ["w","t","b"]){
    for(let number=1;number<=9;number++){
      const value=counts[suit][number];
      if(value===4){units+=2;quads++}
      else if(value===2)units++;
      else if(value!==0)return null;
    }
  }

  if(units!==7)return null;
  if(quads>=2)return {name:"双龙七对",detail:`七对牌型，含${quads}组四张相同牌。`};
  if(quads===1)return {name:"龙七对",detail:"七对牌型，含一组四张相同牌。"};
  return {name:"七对",detail:"由七组对子组成。"};
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

export function getWinInfo(hand,melds=[],context={}){
  if(hand.length%3!==2)return {canWin:false};

  const seven=melds.length===0?sevenPairs(hand):null;
  const allTiles=hand.concat(melds.flatMap(m=>m.tiles||[]));
  const suits=[...new Set(allTiles.map(t=>t.s))];
  const qing=suits.length===1;

  let base=null;

  if(seven){
    base=qing
      ? {canWin:true,name:"清一色·"+seven.name,detail:`全牌为同一花色。${seven.detail}`}
      : {canWin:true,...seven};
  }else{
    if(!standardWin(hand,melds.length))return {canWin:false};

    const triplets=allTriplets(hand,melds);

    if(qing&&triplets){
      base={canWin:true,name:"清一色·对对胡",detail:"全部为同一花色，并由刻子、杠和将牌组成。"};
    }else if(qing){
      base={canWin:true,name:"清一色",detail:"全部手牌和副露均为同一花色。"};
    }else if(triplets){
      base={canWin:true,name:"对对胡",detail:"由刻子、杠和一对将牌组成。"};
    }else{
      base={canWin:true,name:"平胡",detail:"标准四组面子加一对将牌。"};
    }
  }

  if(context.robGang){
    base.name="抢杠胡·"+base.name;
    base.detail="抢别人补杠的牌胡牌。"+base.detail;
  }else if(context.gangFlower){
    base.name="杠上花·"+base.name;
    base.detail="杠后补牌自摸。"+base.detail;
  }else if(context.gangDiscard){
    base.name="杠上炮·"+base.name;
    base.detail="对方杠后打出的牌点炮。"+base.detail;
  }

  return base;
}
