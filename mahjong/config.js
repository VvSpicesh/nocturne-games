import {getSetting,updateSettings} from "../shared/settings.js";

const KEY="nocturne_mahjong_rules_v10";
const DEALER_KEY="nocturne_mahjong_dealer_v10";
const NAMES_KEY="nocturne_mahjong_names_v11";

export const defaultRules={
  exchangeThree:true,
  gangRain:true,
  baseStake:1,
  selfDrawAddsBase:true,
  settlementRules:{
    capFan:8,
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
    const legacy=normalizeSettlementRules(mergeDeep(defaultRules,JSON.parse(localStorage.getItem(KEY)||"{}")));
    const exchangeThree=getSetting("mahjong.exchangeThree");
    const gangRain=getSetting("mahjong.gangRain");
    if(typeof exchangeThree==="boolean")legacy.exchangeThree=exchangeThree;
    if(typeof gangRain==="boolean")legacy.gangRain=gangRain;
    return legacy;
  }catch{
    const fallback=normalizeSettlementRules(mergeDeep(defaultRules,{}));
    const exchangeThree=getSetting("mahjong.exchangeThree");
    const gangRain=getSetting("mahjong.gangRain");
    if(typeof exchangeThree==="boolean")fallback.exchangeThree=exchangeThree;
    if(typeof gangRain==="boolean")fallback.gangRain=gangRain;
    return fallback;
  }
}

/** 封顶番：花猪 / 未下叫统一使用；与 flowerPigFan、noReadyFan 保持同步 */
export function normalizeSettlementRules(rules){
  const out=rules&&typeof rules==="object"?rules:{...defaultRules};
  const sr={...(out.settlementRules||{})};
  let cap=Number(sr.capFan);
  if(!Number.isFinite(cap)||cap<1){
    cap=Number(sr.flowerPigFan);
  }
  if(!Number.isFinite(cap)||cap<1){
    cap=Number(sr.noReadyFan);
  }
  if(!Number.isFinite(cap)||cap<1)cap=8;
  cap=Math.max(1,Math.min(16,Math.round(cap)));
  sr.capFan=cap;
  sr.flowerPigFan=cap;
  sr.noReadyFan=cap;
  out.settlementRules=sr;
  return out;
}

export function saveRules(rules){
  const next=normalizeSettlementRules(rules);
  localStorage.setItem(KEY,JSON.stringify(next));
  updateSettings({
    mahjong:{
      exchangeThree:next.exchangeThree,
      gangRain:next.gangRain
    }
  });
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
