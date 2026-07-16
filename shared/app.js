import {getSettings,subscribe} from "./settings.js";
import {setupFullscreenButton} from "./fullscreen.js";

function applySharedSettings(){
  const settings=getSettings();
  document.documentElement.dataset.ready="true";
  document.documentElement.dataset.theme=settings.appearance.theme;
  document.documentElement.dataset.soundEnabled=settings.common.soundEnabled?"1":"0";
  document.documentElement.dataset.animationEnabled=settings.common.animationEnabled?"1":"0";
}

applySharedSettings();
subscribe(applySharedSettings);

setupFullscreenButton({
  button:"#fullscreenBtn",
  target:document.documentElement
});
