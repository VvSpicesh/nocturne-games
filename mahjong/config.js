const KEY="nocturne_mahjong_rules_v10";
const DEALER_KEY="nocturne_mahjong_dealer_v10";
const NAMES_KEY="nocturne_mahjong_names_v11";

export const defaultRules={
  exchangeThree:true,
  gangRain:true,
  baseStake:1,
  selfDrawAddsBase:true,
  settlementRules:{
    flowerPigEnabled:true,
    flowerPigFan:8,
    noReadyEnabled:true,
    noReadyFan:8,
    stackFlowerPigAndNoReady:false
  },
  patterns:{
    goldenHook:false,
    terminalInEveryGroup:false,
    pureTerminalInEveryGroup:false,
    all258Triplets:false
  },
  extraPatterns:{
    gangFlower:true,
    gangDiscard:true,
    robGang:true,
    lastTile:false,
    lastAvailableTile:false
  },
  gangRules:{
    drizzleMode:false,
    transferGangOnDiscardWin:false,
    cancelGangIfNotReadyAtDraw:false
  }
};

export function mergeDeep(base,patch){
  if(!patch||typeof patch!=="object")return {...base};
  const out={...base};
  for(const key of Object.keys(patch)){
    const value=patch[key];
    if(
      value &&
      typeof value==="object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key]==="object" &&
      !Array.isArray(base[key])
    ){
      out[key]=mergeDeep(base[key],value);
    }else if(value!==undefined){
      out[key]=value;
    }
  }
  return out;
}

export const defaultNames=["","","",""];

export function loadRules(){
  try{
    return mergeDeep(defaultRules,JSON.parse(localStorage.getItem(KEY)||"{}"));
  }catch{
    return mergeDeep(defaultRules,{});
  }
}

export function saveRules(rules){
  localStorage.setItem(KEY,JSON.stringify(rules));
}

export function loadNames(){
  try{
    const raw=JSON.parse(localStorage.getItem(NAMES_KEY)||"null");
    if(Array.isArray(raw)&&raw.length===4){
      return raw.map((name)=>{
        return String(name??"").trim().slice(0,8);
      });
    }
  }catch{/* ignore */}
  return [...defaultNames];
}

export function saveNames(list){
  const next=list.map((name)=>{
    return String(name??"").trim().slice(0,8);
  });
  localStorage.setItem(NAMES_KEY,JSON.stringify(next));
  return next;
}

/** 上一局庄家座位 0-3；首局返回 -1 表示尚未坐庄记录 */
export function loadLastDealer(){
  const raw=localStorage.getItem(DEALER_KEY);
  if(raw===null||raw==="")return -1;
  const value=Number(raw);
  return Number.isInteger(value)&&value>=0&&value<=3?value:-1;
}

export function saveLastDealer(dealer){
  localStorage.setItem(DEALER_KEY,String(dealer));
}
