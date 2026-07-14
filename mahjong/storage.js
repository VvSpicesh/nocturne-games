const MahjongStorage={
  key:"nocturne-mahjong-save-v1",
  save(state){
    localStorage.setItem(this.key,JSON.stringify(state));
  },
  load(){
    try{return JSON.parse(localStorage.getItem(this.key)||"null")}
    catch{return null}
  },
  clear(){
    localStorage.removeItem(this.key);
  }
};
