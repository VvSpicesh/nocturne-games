import {getSetting,subscribe,updateSettings} from "../shared/settings.js";

/**
 * 本地预录语音（优先）+ Web Speech 回退 + Web Audio 音效
 * 语音文件：./sounds/voice/*.mp3
 */

const AUDIO_KEY="nocturne_mahjong_audio_v1";
const NUM_CN=["","一","二","三","四","五","六","七","八","九"];
const SUIT_CN={w:"万",t:"条",b:"筒"};
const VOICE_BASE=new URL("./sounds/voice/",import.meta.url);

const ACTION_SPEECH={
  碰:"碰",
  杠:"杠",
  胡:"胡",
  自摸:"自摸",
  抢杠胡:"抢杠胡",
  暗杠:"杠",
  补杠:"杠",
  明杠:"杠",
  牌局结束:"牌局结束"
};

const ACTION_CLIP={
  碰:"act_peng",
  杠:"act_gang",
  胡:"act_hu",
  自摸:"act_zimo",
  抢杠胡:"act_qiangganghu",
  暗杠:"act_gang",
  补杠:"act_gang",
  明杠:"act_gang",
  牌局结束:"act_round_end",
  杠上开花:"act_gskh"
};

const PATTERN_CLIP={
  平胡:"pat_pinghu",
  清龙七对:"pat_qld",
  清七对:"pat_qqd",
  龙七对:"pat_lqd",
  暗七对:"pat_aqd",
  七对:"pat_qd",
  清大对:"pat_qdd",
  清一色:"pat_qys",
  大对子:"pat_ddz",
  对对胡:"pat_ddh",
  金钩钓:"pat_jgd",
  将对:"pat_jd",
  清带幺:"pat_qdy",
  带幺:"pat_dy",
  清一色对对:"pat_qysdd"
};

/** 中文短语 → 本地 clip key（按长度降序匹配） */
const TEXT_CLIPS=(()=>{
  const map=new Map();
  for(const s of["w","t","b"]){
    for(let n=1;n<=9;n++)map.set(`${NUM_CN[n]}${SUIT_CN[s]}`,`tile_${s}${n}`);
  }
  for(const [text,key] of Object.entries(ACTION_CLIP))map.set(text,key);
  for(const [text,key] of Object.entries(PATTERN_CLIP))map.set(text,key);
  map.set("自己","seat_0");
  map.set("上家","seat_1");
  map.set("对家","seat_2");
  map.set("下家","seat_3");
  map.set("放炮","shot_pao");
  map.set("杠上炮","shot_gsp");
  map.set("一炮多响","shot_ypdx");
  map.set("抢","word_qiang");
  return [...map.entries()].sort((a,b)=>b[0].length-a[0].length);
})();

let enabled=true;
let unlocked=false;
let supported=typeof globalThis!=="undefined"&&"speechSynthesis" in globalThis;
/** 本会话内 speechSynthesis 不可用 */
let speechDead=false;
let voicesKnownEmpty=false;
let cachedVoice=null;
let voicesHooked=false;
let voicesReadyPromise=null;
let audioCtx=null;
let diceMaster=null;
let voiceMaster=null;
let diceGen=0;
let speechQueue=[];
let speechSpeaking=false;
let speechGen=0;
let pendingTileName=null;
let pendingTileTimer=0;
/** @type {Map<string, AudioBuffer|null>} */
const clipCache=new Map();
let localBusy=false;
let localGen=0;
/** @type {string[]} */
let localKeyQueue=[];
let warmStarted=false;

function readStoredEnabled(){
  const sound=getSetting("common.soundEnabled");
  const speech=getSetting("common.speechEnabled");
  if(typeof sound==="boolean"||typeof speech==="boolean"){
    return (sound!==false)&&(speech!==false);
  }
  try{
    const raw=localStorage.getItem(AUDIO_KEY);
    if(raw===null||raw==="")return true;
    return raw==="1"||raw==="true";
  }catch{
    return true;
  }
}

enabled=readStoredEnabled();

function syncEnabledFromSharedSettings(){
  const sound=getSetting("common.soundEnabled");
  const speech=getSetting("common.speechEnabled");
  if(typeof sound!=="boolean"&&typeof speech!=="boolean")return;
  enabled=(sound!==false)&&(speech!==false);
  if(!enabled)stopSpeech();
}

function persistEnabled(){
  try{
    localStorage.setItem(AUDIO_KEY,enabled?"1":"0");
  }catch{/* ignore */}
}

function hasWebAudio(){
  return !!(globalThis.AudioContext||globalThis.webkitAudioContext);
}

function listVoices(){
  if(!supported)return [];
  try{
    return speechSynthesis.getVoices?.()||[];
  }catch{
    return [];
  }
}

function pickVoice(){
  if(!supported)return null;
  try{
    const list=listVoices();
    if(!list.length)return cachedVoice;
    const zh=
      list.find(v=>/^zh-CN/i.test(v.lang)&&!/online|network|google/i.test(v.name||""))||
      list.find(v=>/^zh-CN/i.test(v.lang))||
      list.find(v=>/^zh/i.test(v.lang))||
      list.find(v=>/chinese|中文|汉语|普通话/i.test(v.name||""))||
      list.find(v=>v.default)||
      list[0];
    cachedVoice=zh||null;
    return cachedVoice;
  }catch{
    return null;
  }
}

function markSpeechDead(reason){
  if(speechDead)return;
  speechDead=true;
  speechQueue=[];
  speechSpeaking=false;
  try{speechSynthesis.cancel();}catch{/* ignore */}
  console.warn("[audio] speechSynthesis disabled for this session:",reason||"");
}

/** 报牌通道是否可用（本地预录或系统 TTS） */
export function isSpeechAvailable(){
  return hasWebAudio()||(supported&&!speechDead);
}

/** 本地预录是否作为主播报通道 */
export function isLocalVoiceEnabled(){
  return hasWebAudio();
}

export function waitForVoices(timeoutMs=900){
  if(!supported||speechDead)return Promise.resolve([]);
  if(voicesKnownEmpty)return Promise.resolve([]);
  const now=listVoices();
  if(now.length){
    voicesKnownEmpty=false;
    pickVoice();
    return Promise.resolve(now);
  }
  if(voicesReadyPromise)return voicesReadyPromise;
  voicesReadyPromise=new Promise(resolve=>{
    let settled=false;
    const finish=()=>{
      if(settled)return;
      settled=true;
      const list=listVoices();
      if(!list.length)voicesKnownEmpty=true;
      else{
        voicesKnownEmpty=false;
        pickVoice();
      }
      resolve(list);
      setTimeout(()=>{voicesReadyPromise=null;},0);
    };
    try{
      speechSynthesis.addEventListener?.("voiceschanged",finish,{once:true});
    }catch{/* ignore */}
    const started=Date.now();
    const tick=()=>{
      if(settled)return;
      if(listVoices().length||Date.now()-started>=timeoutMs){
        finish();
        return;
      }
      setTimeout(tick,60);
    };
    setTimeout(tick,30);
  });
  return voicesReadyPromise;
}

function hookVoices(){
  if(!supported||voicesHooked)return;
  voicesHooked=true;
  try{
    speechSynthesis.addEventListener?.("voiceschanged",()=>{
      cachedVoice=null;
      const list=listVoices();
      if(list.length){
        voicesKnownEmpty=false;
        speechDead=false;
        pickVoice();
      }
    });
    pickVoice();
    waitForVoices(900);
  }catch{/* ignore */}
}

function resumeSpeechEngine(){
  if(!supported||speechDead)return;
  try{
    if(speechSynthesis.paused)speechSynthesis.resume();
  }catch{/* ignore */}
}

function clearStuckSpeechEngine(){
  if(!supported)return;
  try{
    if(speechSynthesis.speaking||speechSynthesis.pending||speechSynthesis.paused){
      speechSynthesis.cancel();
    }
  }catch{/* ignore */}
}

function ensureAudioCtx(){
  const AC=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!AC)return null;
  try{
    if(!audioCtx)audioCtx=new AC();
    return audioCtx;
  }catch{
    return null;
  }
}

function ensureDiceMaster(ctx){
  if(!diceMaster||diceMaster.context!==ctx){
    diceMaster=ctx.createGain();
    diceMaster.gain.value=1;
    diceMaster.connect(ctx.destination);
  }
  return diceMaster;
}

function ensureVoiceMaster(ctx){
  if(!voiceMaster||voiceMaster.context!==ctx){
    voiceMaster=ctx.createGain();
    voiceMaster.gain.value=1;
    voiceMaster.connect(ctx.destination);
  }
  return voiceMaster;
}

function kickSilent(ctx){
  try{
    const buf=ctx.createBuffer(1,1,ctx.sampleRate||22050);
    const src=ctx.createBufferSource();
    src.buffer=buf;
    src.connect(ctx.destination);
    src.start(0);
  }catch{/* ignore */}
}

function resumeCtx(ctx){
  if(!ctx||ctx.state!=="suspended")return Promise.resolve(ctx);
  try{
    return ctx.resume().then(()=>ctx).catch(()=>ctx);
  }catch{
    return Promise.resolve(ctx);
  }
}

function withLiveAudio(fn){
  if(!enabled||!unlocked)return;
  const ctx=ensureAudioCtx();
  if(!ctx)return;
  const run=()=>{
    if(!enabled||!unlocked)return;
    try{
      const master=ensureDiceMaster(ctx);
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(1,ctx.currentTime);
      fn(ctx,master);
    }catch{/* ignore */}
  };
  if(ctx.state==="suspended"){
    kickSilent(ctx);
    resumeCtx(ctx).then(run);
    return;
  }
  run();
}

let gestureUnlockArmed=false;
export function armAudioGestureUnlock(){
  if(gestureUnlockArmed)return;
  gestureUnlockArmed=true;
  const unlock=()=>{
    if(enabled)initAudio();
  };
  for(const type of["pointerdown","touchstart","keydown"]){
    document.addEventListener(type,unlock,{capture:true,passive:true});
  }
}

export function isAudioSupported(){
  return hasWebAudio()||supported;
}

export function isAudioEnabled(){
  return enabled&&isAudioSupported();
}

export function isAudioUnlocked(){
  return unlocked;
}

async function loadClip(key){
  if(!key)return null;
  if(clipCache.has(key))return clipCache.get(key);
  const ctx=ensureAudioCtx();
  if(!ctx){
    clipCache.set(key,null);
    return null;
  }
  try{
    await resumeCtx(ctx);
    const url=new URL(`${key}.mp3`,VOICE_BASE).href;
    const res=await fetch(url,{cache:"force-cache"});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const raw=await res.arrayBuffer();
    const buf=await ctx.decodeAudioData(raw.slice(0));
    clipCache.set(key,buf);
    return buf;
  }catch(err){
    console.warn("[audio] clip miss",key,err?.message||err);
    clipCache.set(key,null);
    return null;
  }
}

function warmVoiceClips(){
  if(warmStarted||!hasWebAudio())return;
  warmStarted=true;
  const keys=[];
  for(const s of["w","t","b"]){
    for(let n=1;n<=9;n++)keys.push(`tile_${s}${n}`);
  }
  keys.push(
    "act_peng","act_gang","act_hu","act_zimo","act_qiangganghu",
    "act_round_end","act_gskh",
    "seat_0","seat_1","seat_2","seat_3",
    "shot_pao","shot_gsp","shot_ypdx","word_qiang",
    "pat_pinghu","pat_ddz","pat_ddh","pat_qys","pat_lqd","pat_qd"
  );
  (async()=>{
    for(const key of keys){
      if(!enabled)return;
      await loadClip(key);
    }
  })();
}

/**
 * @param {string[]} keys
 * @param {{interrupt?:boolean}} [opts]
 */
function enqueueLocalKeys(keys,opts={}){
  const list=(keys||[]).filter(Boolean);
  if(!list.length||!enabled||!unlocked||!hasWebAudio())return false;
  if(opts.interrupt){
    localGen++;
    localKeyQueue=[];
    localBusy=false;
    if(voiceMaster){
      try{
        const now=voiceMaster.context.currentTime;
        voiceMaster.gain.cancelScheduledValues(now);
        voiceMaster.gain.setValueAtTime(0.0001,now);
        voiceMaster.gain.setValueAtTime(1,now+0.03);
      }catch{/* ignore */}
    }
  }
  localKeyQueue.push(...list);
  pumpLocalQueue();
  return true;
}

function pumpLocalQueue(){
  if(localBusy||!localKeyQueue.length||!enabled||!unlocked)return;
  const gen=localGen;
  const batch=localKeyQueue.splice(0,localKeyQueue.length);
  localBusy=true;
  (async()=>{
    const ctx=ensureAudioCtx();
    if(!ctx||gen!==localGen){
      localBusy=false;
      return;
    }
    await resumeCtx(ctx);
    if(gen!==localGen){
      localBusy=false;
      return;
    }
    const master=ensureVoiceMaster(ctx);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(1,ctx.currentTime);
    let t=ctx.currentTime+0.01;
    for(const key of batch){
      if(gen!==localGen||!enabled)break;
      const buf=await loadClip(key);
      if(gen!==localGen)break;
      if(!buf)continue;
      const src=ctx.createBufferSource();
      src.buffer=buf;
      src.connect(master);
      src.start(t);
      t+=buf.duration+0.04;
    }
    const waitMs=Math.max(80,(t-ctx.currentTime)*1000+40);
    setTimeout(()=>{
      if(gen!==localGen)return;
      localBusy=false;
      pumpLocalQueue();
    },waitMs);
  })();
}

/** 把自由中文切成本地 clip keys；无法识别的片段返回 null 槽位 */
export function tokenizeToClips(text){
  let rest=String(text||"").replace(/[，,、\s]+/g," ").trim();
  const keys=[];
  while(rest.length){
    if(rest[0]===" "){
      rest=rest.slice(1);
      continue;
    }
    let hit=null;
    for(const [phrase,key] of TEXT_CLIPS){
      if(rest.startsWith(phrase)){
        hit=key;
        rest=rest.slice(phrase.length);
        break;
      }
    }
    if(!hit){
      /* 跳过一个字符，尽量吞掉无法识别部分 */
      rest=rest.slice(1);
      continue;
    }
    keys.push(hit);
  }
  return keys;
}

function canUseTts(){
  return supported&&!speechDead&&enabled&&unlocked;
}

export function initAudio(){
  unlocked=true;
  if(supported){
    clearStuckSpeechEngine();
    hookVoices();
    resumeSpeechEngine();
    waitForVoices(900).then(list=>{
      if(!list.length)markSpeechDead("getVoices empty");
    });
  }
  const ctx=ensureAudioCtx();
  if(ctx){
    kickSilent(ctx);
    if(diceMaster&&diceMaster.context===ctx){
      try{
        diceMaster.gain.cancelScheduledValues(ctx.currentTime);
        diceMaster.gain.setValueAtTime(1,ctx.currentTime);
      }catch{/* ignore */}
    }
    resumeCtx(ctx).then(()=>warmVoiceClips());
  }
  return true;
}

export function setAudioEnabled(next){
  enabled=!!next;
  persistEnabled();
  updateSettings({
    common:{
      soundEnabled:enabled,
      speechEnabled:enabled
    }
  });
  if(!enabled){
    stopSpeech();
    return;
  }
  initAudio();
}

export function stopSpeech(){
  diceGen++;
  speechGen++;
  localGen++;
  localBusy=false;
  localKeyQueue=[];
  speechQueue=[];
  speechSpeaking=false;
  pendingTileName=null;
  if(pendingTileTimer){
    clearTimeout(pendingTileTimer);
    pendingTileTimer=0;
  }
  if(supported){
    try{speechSynthesis.cancel();}catch{/* ignore */}
  }
  if(diceMaster){
    try{
      const ctx=diceMaster.context;
      const now=ctx.currentTime;
      diceMaster.gain.cancelScheduledValues(now);
      diceMaster.gain.setValueAtTime(0.0001,now);
    }catch{/* ignore */}
  }
  if(voiceMaster){
    try{
      const ctx=voiceMaster.context;
      const now=ctx.currentTime;
      voiceMaster.gain.cancelScheduledValues(now);
      voiceMaster.gain.setValueAtTime(0.0001,now);
      setTimeout(()=>{
        try{voiceMaster.gain.setValueAtTime(1,voiceMaster.context.currentTime);}catch{/* ignore */}
      },30);
    }catch{/* ignore */}
  }
}

function speakUtterance(phrase,gen,finish){
  resumeSpeechEngine();
  const utter=new SpeechSynthesisUtterance(phrase);
  utter.lang="zh-CN";
  utter.rate=1.05;
  utter.pitch=1;
  utter.volume=1;
  const voice=pickVoice();
  if(voice){
    utter.voice=voice;
    if(voice.lang)utter.lang=voice.lang;
  }
  let started=false;
  utter.onstart=()=>{started=true;};
  utter.onend=finish;
  utter.onerror=()=>{
    markSpeechDead("utterance onerror");
    finish();
  };
  speechSynthesis.speak(utter);
  const expectMs=Math.min(2200,Math.max(500,phrase.length*280));
  setTimeout(()=>{
    if(gen!==speechGen)return;
    if(!started){
      try{speechSynthesis.cancel();}catch{/* ignore */}
      markSpeechDead("speak hung without onstart");
    }
    finish();
  },expectMs);
}

function flushSpeechQueue(){
  if(speechSpeaking)return;
  if(!canUseTts()){
    speechQueue=[];
    speechSpeaking=false;
    return;
  }
  if(voicesKnownEmpty&&!listVoices().length){
    markSpeechDead("no voices");
    speechQueue=[];
    return;
  }
  const phrase=speechQueue.shift();
  if(!phrase)return;
  speechSpeaking=true;
  const gen=speechGen;
  let finished=false;
  const finish=()=>{
    if(finished||gen!==speechGen)return;
    finished=true;
    speechSpeaking=false;
    setTimeout(()=>{
      if(gen!==speechGen)return;
      flushSpeechQueue();
    },40);
  };

  waitForVoices(900).then(voices=>{
    if(gen!==speechGen)return;
    if(speechDead){
      finish();
      return;
    }
    if(!voices.length){
      markSpeechDead("getVoices empty at speak");
      finish();
      return;
    }
    try{
      speakUtterance(phrase,gen,finish);
    }catch{
      markSpeechDead("speak throw");
      finish();
    }
  });
}

function enqueueInterruptTts(phrase){
  if(!canUseTts())return;
  speechGen++;
  const gen=speechGen;
  speechQueue=[];
  speechSpeaking=false;
  clearStuckSpeechEngine();
  speechQueue.push(phrase);
  setTimeout(()=>{
    if(gen!==speechGen)return;
    resumeSpeechEngine();
    flushSpeechQueue();
  },80);
}

function enqueueFollowTts(phrase){
  if(!canUseTts())return;
  speechQueue.push(phrase);
  flushSpeechQueue();
}

function isSpeechActive(){
  if(localBusy||localKeyQueue.length)return true;
  if(pendingTileName)return true;
  if(speechSpeaking||speechQueue.length>0)return true;
  return false;
}

export function waitUntilSpeechIdle(timeoutMs=2500){
  if(!enabled||!unlocked)return Promise.resolve();
  if(!isSpeechActive())return Promise.resolve();
  return new Promise(resolve=>{
    const started=Date.now();
    const tick=()=>{
      if(!isSpeechActive()){
        resolve();
        return;
      }
      if(Date.now()-started>=timeoutMs){
        clearStuckSpeechEngine();
        speechSpeaking=false;
        speechQueue=[];
        localBusy=false;
        resolve();
        return;
      }
      setTimeout(tick,40);
    };
    setTimeout(tick,20);
  });
}

subscribe(syncEnabledFromSharedSettings);

export function tileSpeechName(tile){
  if(!tile||!SUIT_CN[tile.s]||!NUM_CN[tile.n])return "";
  return `${NUM_CN[tile.n]}${SUIT_CN[tile.s]}`;
}

function tileClipKey(tile){
  if(!tile||!SUIT_CN[tile.s]||tile.n<1||tile.n>9)return "";
  return `tile_${tile.s}${tile.n}`;
}

function patternClipKey(name){
  const clean=String(name||"平胡").replace(/[·・]/g,"").trim()||"平胡";
  return PATTERN_CLIP[clean]||null;
}

/**
 * 播本地 clips；失败则可选 TTS 整句回退
 * @param {string[]} keys
 * @param {string} [ttsFallback]
 * @param {{interrupt?:boolean}} [opts]
 */
function speakLocalOrTts(keys,ttsFallback="",opts={}){
  if(!enabled||!unlocked)return;
  const list=(keys||[]).filter(Boolean);
  if(list.length&&hasWebAudio()){
    enqueueLocalKeys(list,{interrupt:!!opts.interrupt});
    return;
  }
  if(ttsFallback){
    if(opts.interrupt)enqueueInterruptTts(ttsFallback);
    else enqueueFollowTts(ttsFallback);
  }
}

export function speakTile(tile){
  const name=tileSpeechName(tile);
  const key=tileClipKey(tile);
  if(!name||!enabled||!unlocked)return;
  const startFresh=!isSpeechActive();
  if(pendingTileTimer)clearTimeout(pendingTileTimer);
  pendingTileName=name;
  pendingTileTimer=setTimeout(()=>{
    pendingTileTimer=0;
    if(pendingTileName!==name)return;
    pendingTileName=null;
    speakLocalOrTts(
      key?[key]:[],
      name,
      {interrupt:startFresh&&!isSpeechActive()}
    );
  },0);
}

export function speakPhrase(text){
  const phrase=String(text||"").trim();
  if(!phrase||!enabled||!unlocked)return;
  if(pendingTileName){
    const combo=`${pendingTileName}，${phrase}`;
    pendingTileName=null;
    if(pendingTileTimer){
      clearTimeout(pendingTileTimer);
      pendingTileTimer=0;
    }
    const keys=tokenizeToClips(combo);
    speakLocalOrTts(keys,combo,{interrupt:!isSpeechActive()});
    return;
  }
  const keys=tokenizeToClips(phrase);
  speakLocalOrTts(keys,phrase,{interrupt:false});
}

export function speakAction(action){
  const key=String(action||"").trim();
  const clip=ACTION_CLIP[key];
  const phrase=ACTION_SPEECH[key]||key;
  if(!phrase||!enabled||!unlocked)return;
  if(pendingTileName){
    const tileName=pendingTileName;
    pendingTileName=null;
    if(pendingTileTimer){
      clearTimeout(pendingTileTimer);
      pendingTileTimer=0;
    }
    const tileKey=tokenizeToClips(tileName)[0];
    speakLocalOrTts(
      [tileKey,clip].filter(Boolean),
      `${tileName}，${phrase}`,
      {interrupt:!isSpeechActive()}
    );
    return;
  }
  speakLocalOrTts(clip?[clip]:[],phrase,{interrupt:false});
}

export function speakWin({manner,winners,patterns,from=null}={}){
  const seats=["自己","上家","对家","下家"];
  const seat=i=>seats[i]||`玩家${i}`;
  const seatKey=i=>(i>=0&&i<=3)?`seat_${i}`:null;
  const clean=name=>String(name||"平胡").replace(/[·・]/g,"").trim()||"平胡";
  const list=Array.isArray(winners)?winners:[];
  if(!list.length)return;

  const keys=[];
  const m=String(manner||"");
  if(m==="自摸"||m==="杠上开花"){
    keys.push(seatKey(list[0]));
    keys.push(m==="杠上开花"?"act_gskh":"act_zimo");
    keys.push(patternClipKey(patterns[0]));
    speakLocalOrTts(keys,`${seat(list[0])}${m} ${clean(patterns[0])}`,{interrupt:true});
    return;
  }
  if(m==="抢杠胡"){
    if(list.length>1){
      keys.push("shot_ypdx","act_qiangganghu");
      list.forEach((w,i)=>{
        keys.push(seatKey(w),patternClipKey(patterns[i]));
      });
      const bits=list.map((w,i)=>`${seat(w)}${clean(patterns[i])}`).join(" ");
      speakLocalOrTts(keys,`一炮多响抢杠胡 ${bits}`,{interrupt:true});
    }else if(from!=null){
      keys.push(seatKey(list[0]),"act_qiangganghu",patternClipKey(patterns[0]),"word_qiang",seatKey(from));
      speakLocalOrTts(keys,`${seat(list[0])}抢杠胡 ${clean(patterns[0])}，抢${seat(from)}`,{interrupt:true});
    }else{
      keys.push(seatKey(list[0]),"act_qiangganghu",patternClipKey(patterns[0]));
      speakLocalOrTts(keys,`${seat(list[0])}抢杠胡 ${clean(patterns[0])}`,{interrupt:true});
    }
    return;
  }

  const shot=m==="杠上炮"?"shot_gsp":"shot_pao";
  const shotText=m==="杠上炮"?"杠上炮":"放炮";
  if(from==null){
    keys.push(seatKey(list[0]),"act_hu",patternClipKey(patterns[0]));
    speakLocalOrTts(keys,`${seat(list[0])}胡 ${clean(patterns[0])}`,{interrupt:true});
    return;
  }
  if(list.length>1){
    keys.push(seatKey(from),shot,"shot_ypdx");
    list.forEach((w,i)=>keys.push(seatKey(w),patternClipKey(patterns[i])));
    const bits=list.map((w,i)=>`${seat(w)}${clean(patterns[i])}`).join(" ");
    speakLocalOrTts(keys,`${seat(from)}${shotText}一炮多响 ${bits}`,{interrupt:true});
    return;
  }
  keys.push(seatKey(from),shot,seatKey(list[0]),patternClipKey(patterns[0]));
  speakLocalOrTts(keys,`${seat(from)}${shotText}${seat(list[0])} ${clean(patterns[0])}`,{interrupt:true});
}

function scheduleDiceClack(ctx,master,when){
  const dur=0.025+Math.random()*0.02;
  const bufferSize=Math.max(1,Math.floor(ctx.sampleRate*dur));
  const buffer=ctx.createBuffer(1,bufferSize,ctx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++){
    const env=Math.exp(-i/(bufferSize*0.18));
    data[i]=(Math.random()*2-1)*env;
  }
  const src=ctx.createBufferSource();
  src.buffer=buffer;
  const filter=ctx.createBiquadFilter();
  filter.type="bandpass";
  filter.frequency.value=700+Math.random()*2800;
  filter.Q.value=0.9+Math.random()*1.4;
  const gain=ctx.createGain();
  const peak=0.22+Math.random()*0.28;
  gain.gain.setValueAtTime(peak,when);
  gain.gain.exponentialRampToValueAtTime(0.001,when+dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(when);
  src.stop(when+dur+0.01);
}

export function playDiceRattle(durationMs=1100){
  withLiveAudio((ctx,master)=>{
    const gen=++diceGen;
    const now=ctx.currentTime;
    const end=now+Math.max(0.2,durationMs/1000);
    let t=now;
    while(t<end){
      if(gen!==diceGen||!enabled)break;
      scheduleDiceClack(ctx,master,t);
      const progress=(t-now)/(end-now);
      const gap=0.028+progress*0.09+Math.random()*0.035;
      t+=gap;
    }
  });
}

function scheduleTileClack(ctx,master,when){
  const dur=0.018+Math.random()*0.012;
  const bufferSize=Math.max(1,Math.floor(ctx.sampleRate*dur));
  const buffer=ctx.createBuffer(1,bufferSize,ctx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++){
    const env=Math.exp(-i/(bufferSize*0.12));
    data[i]=(Math.random()*2-1)*env;
  }
  const src=ctx.createBufferSource();
  src.buffer=buffer;
  const filter=ctx.createBiquadFilter();
  filter.type="bandpass";
  filter.frequency.value=1400+Math.random()*2200;
  filter.Q.value=0.7+Math.random()*0.9;
  const gain=ctx.createGain();
  const peak=0.16+Math.random()*0.14;
  gain.gain.setValueAtTime(peak,when);
  gain.gain.exponentialRampToValueAtTime(0.001,when+dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(when);
  src.stop(when+dur+0.01);
}

export function playDealRound(){
  withLiveAudio((ctx,master)=>{
    const now=ctx.currentTime;
    for(let i=0;i<4;i++){
      scheduleTileClack(ctx,master,now+i*0.016);
    }
  });
}
