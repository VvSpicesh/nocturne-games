const SETTINGS_KEY="nocturne_games_settings_v1";

const LEGACY_KEYS={
  mahjongRules:"nocturne_mahjong_rules_v10",
  mahjongAudio:"nocturne_mahjong_audio_v1",
  chessSnapshot:"nocturne-chess-stable-v1",
  chessAudio:"nocturne_chess_audio_v1"
};

export const defaultSettings={
  version:1,
  common:{
    soundEnabled:true,
    speechEnabled:true,
    fullscreenPreferred:false,
    animationEnabled:true
  },
  chess:{
    defaultDifficulty:"normal",
    defaultSide:"white",
    showLegalMoves:true
  },
  mahjong:{
    exchangeThree:true,
    gangRain:true,
    autoSpeech:true,
    autoDraw:true
  },
  appearance:{
    theme:"dark"
  }
};

const listeners=new Set();

function isPlainObject(value){
  return !!value&&typeof value==="object"&&!Array.isArray(value);
}

function deepClone(value){
  return JSON.parse(JSON.stringify(value));
}

function mergePreservingUnknown(base,patch){
  if(!isPlainObject(base))return isPlainObject(patch)?deepClone(patch):patch;
  const out={...base};
  if(!isPlainObject(patch))return out;
  for(const [key,value] of Object.entries(patch)){
    if(isPlainObject(value)&&isPlainObject(out[key])){
      out[key]=mergePreservingUnknown(out[key],value);
    }else if(value!==undefined){
      out[key]=Array.isArray(value)?value.slice():value;
    }
  }
  return out;
}

function hasPath(source,path){
  const parts=Array.isArray(path)?path:String(path||"").split(".").filter(Boolean);
  let node=source;
  for(const part of parts){
    if(!isPlainObject(node)||!(part in node))return false;
    node=node[part];
  }
  return true;
}

function getPath(source,path){
  const parts=Array.isArray(path)?path:String(path||"").split(".").filter(Boolean);
  let node=source;
  for(const part of parts){
    if(node==null)return undefined;
    node=node[part];
  }
  return node;
}

function setPath(target,path,value){
  const parts=Array.isArray(path)?path:String(path||"").split(".").filter(Boolean);
  if(!parts.length)return target;
  let node=target;
  for(let i=0;i<parts.length-1;i++){
    const key=parts[i];
    if(!isPlainObject(node[key]))node[key]={};
    node=node[key];
  }
  node[parts[parts.length-1]]=value;
  return target;
}

function readJson(key){
  try{
    const raw=localStorage.getItem(key);
    if(!raw)return null;
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

function readBoolKey(key){
  try{
    const raw=localStorage.getItem(key);
    if(raw===null||raw==="")return undefined;
    if(raw==="0"||raw==="false")return false;
    if(raw==="1"||raw==="true")return true;
  }catch{/* ignore */}
  return undefined;
}

function normalizeDifficulty(value){
  return ["easy","normal","hard"].includes(value)?value:"normal";
}

function normalizeSide(value){
  return ["white","black","random"].includes(value)?value:"white";
}

function normalizeTheme(value){
  return value==="dark"||value==="light"?value:"dark";
}

function applyLegacyFallbacks(settings,raw){
  const next=deepClone(settings);
  const legacyMahjongRules=readJson(LEGACY_KEYS.mahjongRules)||{};
  const legacyChessSnapshot=readJson(LEGACY_KEYS.chessSnapshot)||{};
  const legacyMahjongAudio=readBoolKey(LEGACY_KEYS.mahjongAudio);
  const legacyChessAudio=readBoolKey(LEGACY_KEYS.chessAudio);

  if(!hasPath(raw,"common.soundEnabled")){
    const explicitFalse=[legacyMahjongAudio,legacyChessAudio].some(v=>v===false);
    if(explicitFalse)next.common.soundEnabled=false;
  }
  if(!hasPath(raw,"common.speechEnabled")&&legacyMahjongAudio===false){
    next.common.speechEnabled=false;
  }
  if(!hasPath(raw,"mahjong.exchangeThree")&&typeof legacyMahjongRules.exchangeThree==="boolean"){
    next.mahjong.exchangeThree=legacyMahjongRules.exchangeThree;
  }
  if(!hasPath(raw,"mahjong.gangRain")&&typeof legacyMahjongRules.gangRain==="boolean"){
    next.mahjong.gangRain=legacyMahjongRules.gangRain;
  }
  if(!hasPath(raw,"chess.defaultDifficulty")&&legacyChessSnapshot?.difficulty){
    next.chess.defaultDifficulty=normalizeDifficulty(legacyChessSnapshot.difficulty);
  }
  if(!hasPath(raw,"chess.defaultSide")){
    next.chess.defaultSide=normalizeSide(next.chess.defaultSide);
  }
  return next;
}

function normalizeSettings(raw){
  const safeRaw=isPlainObject(raw)?raw:{};
  let merged=mergePreservingUnknown(deepClone(defaultSettings),safeRaw);
  merged.version=1;
  merged=applyLegacyFallbacks(merged,safeRaw);
  merged.common.soundEnabled=merged.common.soundEnabled!==false;
  merged.common.speechEnabled=merged.common.speechEnabled!==false;
  merged.common.fullscreenPreferred=!!merged.common.fullscreenPreferred;
  merged.common.animationEnabled=merged.common.animationEnabled!==false;
  merged.chess.defaultDifficulty=normalizeDifficulty(merged.chess.defaultDifficulty);
  merged.chess.defaultSide=normalizeSide(merged.chess.defaultSide);
  merged.chess.showLegalMoves=merged.chess.showLegalMoves!==false;
  merged.mahjong.exchangeThree=merged.mahjong.exchangeThree!==false;
  merged.mahjong.gangRain=merged.mahjong.gangRain!==false;
  merged.mahjong.autoSpeech=merged.mahjong.autoSpeech!==false;
  merged.mahjong.autoDraw=merged.mahjong.autoDraw!==false;
  merged.appearance.theme=normalizeTheme(merged.appearance.theme);
  return merged;
}

function readStoredSettings(){
  return readJson(SETTINGS_KEY);
}

let currentSettings=normalizeSettings(readStoredSettings());

function persist(){
  try{
    localStorage.setItem(SETTINGS_KEY,JSON.stringify(currentSettings));
  }catch(error){
    console.warn("[settings] persist failed",error);
  }
}

function notify(){
  for(const listener of listeners){
    try{
      listener(getSettings());
    }catch(error){
      console.warn("[settings] listener failed",error);
    }
  }
}

export function getSettings(){
  return deepClone(currentSettings);
}

export function getSetting(path){
  return getPath(currentSettings,path);
}

export function setSetting(path,value){
  const next=getSettings();
  setPath(next,path,value);
  currentSettings=normalizeSettings(next);
  persist();
  notify();
  return getSettings();
}

export function updateSettings(partial){
  currentSettings=normalizeSettings(mergePreservingUnknown(currentSettings,partial));
  persist();
  notify();
  return getSettings();
}

export function resetSettings(){
  currentSettings=normalizeSettings(defaultSettings);
  persist();
  notify();
  return getSettings();
}

export function subscribe(listener){
  if(typeof listener!=="function")return ()=>{};
  listeners.add(listener);
  return ()=>listeners.delete(listener);
}

window.addEventListener("storage",(event)=>{
  if(event.key!==SETTINGS_KEY)return;
  currentSettings=normalizeSettings(readStoredSettings());
  notify();
});

globalThis.NocturneSettings={
  KEY:SETTINGS_KEY,
  defaultSettings:deepClone(defaultSettings),
  getSettings,
  getSetting,
  setSetting,
  updateSettings,
  resetSettings,
  subscribe
};
