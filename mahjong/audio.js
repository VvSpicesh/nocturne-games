/**
 * 浏览器语音播报 + 简易音效（Web Speech / Web Audio）
 * 无音频文件、无外部依赖；不支持时静默禁用。
 */

const AUDIO_KEY="nocturne_mahjong_audio_v1";
const NUM_CN=["","一","二","三","四","五","六","七","八","九"];
const SUIT_CN={w:"万",t:"条",b:"筒"};

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

let enabled=true;
let unlocked=false;
let supported=typeof globalThis!=="undefined"&&"speechSynthesis" in globalThis;
/** 本会话内 speechSynthesis 不可用（无语音包 / speak 挂死）→ 跳过播报，不拖慢发牌 */
let speechDead=false;
let voicesKnownEmpty=false;
let cachedVoice=null;
let voicesHooked=false;
let voicesReadyPromise=null;
let audioCtx=null;
let diceMaster=null;
let diceGen=0;
let speechQueue=[];
let speechSpeaking=false;
let speechGen=0;
/** 同一次出牌后立刻碰/杠时：先凑成「三万，碰」再播，避免队列续播被浏览器吃掉 */
let pendingTileName=null;
let pendingTileTimer=0;

function readStoredEnabled(){
  try{
    const raw=localStorage.getItem(AUDIO_KEY);
    if(raw===null||raw==="")return true;
    return raw==="1"||raw==="true";
  }catch{
    return true;
  }
}

enabled=readStoredEnabled();

function persistEnabled(){
  try{
    localStorage.setItem(AUDIO_KEY,enabled?"1":"0");
  }catch{/* ignore */}
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
  pendingTileName=null;
  if(pendingTileTimer){
    clearTimeout(pendingTileTimer);
    pendingTileTimer=0;
  }
  try{speechSynthesis.cancel();}catch{/* ignore */}
  console.warn("[audio] speechSynthesis disabled for this session:",reason||"");
}

export function isSpeechAvailable(){
  return supported&&!speechDead;
}

/**
 * Android Chrome：getVoices() 常先返回 []，短等 voiceschanged / 轮询。
 * 已确认空列表则立即返回，避免每次播报卡 3～4 秒拖慢发牌。
 * @param {number} [timeoutMs=900]
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
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
    /* 后台短探测，不阻塞发牌 */
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

/** iOS / Chrome：手势内播放静音 buffer，真正解锁 AudioContext */
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

/**
 * 确保 Web Audio 已运行再执行；解决「手势里 resume 未完成就排程 → 静音」
 * @param {(ctx:AudioContext)=>void} fn
 */
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
/** 首次任意操作解锁（刷新续局时不必先点「声音」开关） */
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
  return supported||!!(globalThis.AudioContext||globalThis.webkitAudioContext);
}

export function isAudioEnabled(){
  return enabled&&(supported||!!(globalThis.AudioContext||globalThis.webkitAudioContext));
}

export function isAudioUnlocked(){
  return unlocked;
}

/** 用户手势内调用：解锁手机浏览器语音/音效 */
export function initAudio(){
  unlocked=true;
  if(supported){
    /* 进页时若引擎已 speaking/pending 卡住，先清掉，否则一切 speak 无声且拖节奏 */
    clearStuckSpeechEngine();
    hookVoices();
    resumeSpeechEngine();
    waitForVoices(900).then(list=>{
      if(!list.length){
        /* 无语音包：本会话不再走 TTS，保留骰子/发牌 Web Audio */
        markSpeechDead("getVoices empty");
      }
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
    resumeCtx(ctx);
  }
  return true;
}

export function setAudioEnabled(next){
  enabled=!!next;
  persistEnabled();
  if(!enabled){
    stopSpeech();
    return;
  }
  initAudio();
}

export function stopSpeech(){
  diceGen++;
  speechGen++;
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
  /* 无 onstart 且 speaking 挂起 → 本机 TTS 坏了，立刻放弃，勿等到 6s */
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
  if(!supported||!enabled||!unlocked||speechDead){
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

function enqueueInterrupt(phrase){
  if(!supported||!enabled||!unlocked||speechDead)return;
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

function enqueueFollow(phrase){
  if(!supported||!enabled||!unlocked||speechDead)return;
  speechQueue.push(phrase);
  flushSpeechQueue();
}

function isSpeechActive(){
  if(!supported||speechDead)return false;
  try{
    if(speechSpeaking||speechQueue.length>0)return true;
    /* 不把引擎 stuck 的 speaking=true 当成「还在播」——否则发牌等满超时 */
    if(speechSpeaking)return true;
  }catch{/* ignore */}
  return false;
}

/**
 * 出牌/碰杠节奏闸：仅在真正排队播报时等待；TTS 不可用则立刻放行
 * @param {number} [timeoutMs=2500]
 */
export function waitUntilSpeechIdle(timeoutMs=2500){
  if(!enabled||!unlocked||!supported||speechDead)return Promise.resolve();
  if(!speechSpeaking&&!speechQueue.length&&!pendingTileName)return Promise.resolve();
  return new Promise(resolve=>{
    const started=Date.now();
    const tick=()=>{
      if(speechDead||(!isSpeechActive()&&!pendingTileName)){
        resolve();
        return;
      }
      if(Date.now()-started>=timeoutMs){
        clearStuckSpeechEngine();
        speechSpeaking=false;
        speechQueue=[];
        resolve();
        return;
      }
      setTimeout(tick,40);
    };
    setTimeout(tick,20);
  });
}

/** 牌名：五万 / 三条 / 八筒（中文数字） */
export function tileSpeechName(tile){
  if(!tile||!SUIT_CN[tile.s]||!NUM_CN[tile.n])return "";
  return `${NUM_CN[tile.n]}${SUIT_CN[tile.s]}`;
}

export function speakTile(tile){
  const name=tileSpeechName(tile);
  if(!name||!supported||!enabled||!unlocked||speechDead)return;
  const startFresh=!isSpeechActive();
  if(pendingTileTimer)clearTimeout(pendingTileTimer);
  pendingTileName=name;
  /* 同栈内立刻碰/杠/胡会先到 speakPhrase 合并播报 */
  pendingTileTimer=setTimeout(()=>{
    pendingTileTimer=0;
    if(pendingTileName!==name)return;
    pendingTileName=null;
    if(startFresh&&!isSpeechActive())enqueueInterrupt(name);
    else enqueueFollow(name);
  },0);
}

/**
 * 任意播报文案（可与刚出的牌名同栈合并为「五万，对家放炮上家 对对胡」）
 * @param {string} text
 */
export function speakPhrase(text){
  const phrase=String(text||"").trim();
  if(!phrase||!supported||!enabled||!unlocked||speechDead)return;
  if(pendingTileName){
    const combo=`${pendingTileName}，${phrase}`;
    pendingTileName=null;
    if(pendingTileTimer){
      clearTimeout(pendingTileTimer);
      pendingTileTimer=0;
    }
    if(isSpeechActive())enqueueFollow(combo);
    else enqueueInterrupt(combo);
    return;
  }
  enqueueFollow(phrase);
}

export function speakAction(action){
  const key=String(action||"").trim();
  const phrase=ACTION_SPEECH[key]||key;
  if(phrase)speakPhrase(phrase);
}

/**
 * 胡牌播报：如「对家放炮上家 对对胡」「自己自摸 龙七对」
 * @param {{manner:string,winners:number[],patterns:string[],from?:number|null}} opts
 */
export function speakWin({manner,winners,patterns,from=null}={}){
  const seats=["自己","上家","对家","下家"];
  const seat=i=>seats[i]||`玩家${i}`;
  const clean=name=>String(name||"平胡").replace(/[·・]/g,"").trim()||"平胡";
  const list=Array.isArray(winners)?winners:[];
  if(!list.length)return;

  const m=String(manner||"");
  if(m==="自摸"||m==="杠上开花"){
    speakPhrase(`${seat(list[0])}${m} ${clean(patterns[0])}`);
    return;
  }
  if(m==="抢杠胡"){
    if(list.length>1){
      const bits=list.map((w,i)=>`${seat(w)}${clean(patterns[i])}`).join(" ");
      speakPhrase(`一炮多响抢杠胡 ${bits}`);
    }else if(from!=null){
      speakPhrase(`${seat(list[0])}抢杠胡 ${clean(patterns[0])}，抢${seat(from)}`);
    }else{
      speakPhrase(`${seat(list[0])}抢杠胡 ${clean(patterns[0])}`);
    }
    return;
  }

  const shot=m==="杠上炮"?"杠上炮":"放炮";
  if(from==null){
    speakPhrase(`${seat(list[0])}胡 ${clean(patterns[0])}`);
    return;
  }
  if(list.length>1){
    const bits=list.map((w,i)=>`${seat(w)}${clean(patterns[i])}`).join(" ");
    speakPhrase(`${seat(from)}${shot}一炮多响 ${bits}`);
    return;
  }
  speakPhrase(`${seat(from)}${shot}${seat(list[0])} ${clean(patterns[0])}`);
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

/**
 * 用 Web Audio 模拟骰子摇动声（无音频文件）
 * @param {number} [durationMs=1100] 与掷骰动画时长对齐
 */
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

/** 发牌一轮（约 4 张）的砌牌声 */
export function playDealRound(){
  withLiveAudio((ctx,master)=>{
    const now=ctx.currentTime;
    for(let i=0;i<4;i++){
      scheduleTileClack(ctx,master,now+i*0.016);
    }
  });
}
