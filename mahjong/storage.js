const KEY="nocturne_mahjong_state_v08";

export function saveState(state){
  localStorage.setItem(KEY,JSON.stringify(state));
}

export function loadState(){
  try{
    return JSON.parse(localStorage.getItem(KEY)||"null");
  }catch{
    return null;
  }
}

export function clearState(){
  localStorage.removeItem(KEY);
}
