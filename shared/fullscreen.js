import {getSetting,setSetting,subscribe} from "./settings.js";

function resolveElement(target){
  if(typeof target==="string")return document.querySelector(target);
  return target||document.documentElement;
}

export function isFullscreenSupported(){
  return !!(
    document.fullscreenEnabled &&
    document.documentElement?.requestFullscreen &&
    document.exitFullscreen
  );
}

function syncButton(button,active){
  const preferred=getSetting("common.fullscreenPreferred")===true;
  button.hidden=false;
  button.disabled=false;
  button.dataset.fullscreenActive=active?"1":"0";
  button.dataset.fullscreenPreferred=preferred?"1":"0";
  button.setAttribute("aria-pressed",active?"true":"false");
  button.textContent=active?"🗗 退出全屏":"⛶ 全屏";
  button.title=active?"退出浏览器全屏":"进入浏览器全屏";
}

export function setupFullscreenButton({
  button,
  target,
  onError
}={}){
  const el=resolveElement(button);
  const fullscreenTarget=resolveElement(target);
  if(!el)return null;
  if(!isFullscreenSupported()){
    el.hidden=true;
    el.disabled=true;
    el.dataset.fullscreenUnsupported="1";
    return {
      supported:false,
      destroy(){}
    };
  }

  const handleChange=()=>{
    const active=!!document.fullscreenElement;
    syncButton(el,active);
    const preferred=getSetting("common.fullscreenPreferred")===true;
    if(preferred!==active)setSetting("common.fullscreenPreferred",active);
  };

  const handleClick=async()=>{
    try{
      if(document.fullscreenElement){
        await document.exitFullscreen();
      }else{
        await (fullscreenTarget||document.documentElement).requestFullscreen();
      }
    }catch(error){
      if(typeof onError==="function")onError(error);
      else console.warn("[fullscreen] toggle failed",error);
      handleChange();
    }
  };

  const unsubscribe=subscribe(()=>syncButton(el,!!document.fullscreenElement));
  document.addEventListener("fullscreenchange",handleChange);
  el.addEventListener("click",handleClick);
  syncButton(el,!!document.fullscreenElement);

  return {
    supported:true,
    destroy(){
      unsubscribe();
      document.removeEventListener("fullscreenchange",handleChange);
      el.removeEventListener("click",handleClick);
    }
  };
}
