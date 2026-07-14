const MahjongStorage={
  key:"nocturne-mahjong-v022",
  save(state){localStorage.setItem(this.key,JSON.stringify(state))},
  load(){try{return JSON.parse(localStorage.getItem(this.key)||"null")}catch{return null}},
  clear(){localStorage.removeItem(this.key)}
};
