/**
 * 游戏事件轻量 Toast（单例替换，不排队）
 * 可供麻将 / 象棋等复用：出牌、碰、杠、胡…
 */

let activeHost=null;
let activeEl=null;
let hideTimer=0;
let rafId=0;

function resolveHost(host){
  if(!host)return document.body;
  if(typeof host==="string")return document.querySelector(host)||document.body;
  return host;
}

function clearTimers(){
  if(hideTimer){
    clearTimeout(hideTimer);
    hideTimer=0;
  }
  if(rafId){
    cancelAnimationFrame(rafId);
    rafId=0;
  }
}

/**
 * 立即移除当前 Toast（无动画）
 */
export function clearGameToast(){
  clearTimers();
  if(activeEl?.parentNode)activeEl.remove();
  activeEl=null;
  activeHost=null;
}

/**
 * @param {object} options
 * @param {string|HTMLElement} [options.host] 挂载点（建议牌桌容器）
 * @param {string} [options.label] 前缀，如「上家打出：」
 * @param {string} [options.value] 加粗主信息，如「六万」
 * @param {string} [options.text] 整句兜底（无 label/value 时使用）
 * @param {HTMLElement|null} [options.media] 右侧小图（如小麻将）
 * @param {number} [options.durationMs=1500]
 * @param {boolean} [options.progress=true] 底部倒计时条
 */
export function showGameToast(options={}){
  const host=resolveHost(options.host);
  const duration=Math.max(400,Number(options.durationMs)||1500);
  const showProgress=options.progress!==false;

  /* 直接替换：永不堆叠、不排队 */
  clearGameToast();

  const el=document.createElement("div");
  el.className="ng-game-toast";
  el.setAttribute("role","status");
  el.setAttribute("aria-live","polite");

  const row=document.createElement("div");
  row.className="ng-game-toast-row";

  const text=document.createElement("div");
  text.className="ng-game-toast-text";
  const label=String(options.label??"");
  const value=String(options.value??"");
  if(label||value){
    if(label)text.append(document.createTextNode(label));
    if(value){
      const strong=document.createElement("strong");
      strong.textContent=value;
      text.appendChild(strong);
    }
  }else{
    text.textContent=String(options.text||"").trim();
  }
  row.appendChild(text);

  if(options.media instanceof HTMLElement){
    const media=document.createElement("div");
    media.className="ng-game-toast-media";
    media.appendChild(options.media);
    row.appendChild(media);
  }

  el.appendChild(row);

  if(showProgress){
    const bar=document.createElement("div");
    bar.className="ng-game-toast-progress";
    bar.setAttribute("aria-hidden","true");
    const fill=document.createElement("i");
    fill.style.animationDuration=`${duration}ms`;
    bar.appendChild(fill);
    el.appendChild(bar);
  }

  host.appendChild(el);
  activeHost=host;
  activeEl=el;

  rafId=requestAnimationFrame(()=>{
    rafId=0;
    el.classList.add("is-show");
  });

  hideTimer=setTimeout(()=>{
    hideTimer=0;
    dismissGameToast();
  },duration);
}

/**
 * 淡出后移除
 */
export function dismissGameToast(){
  clearTimers();
  const el=activeEl;
  if(!el)return;
  el.classList.remove("is-show");
  el.classList.add("is-hide");
  const done=()=>{
    if(activeEl===el){
      el.remove();
      activeEl=null;
      activeHost=null;
    }
  };
  el.addEventListener("transitionend",done,{once:true});
  setTimeout(done,220);
}
