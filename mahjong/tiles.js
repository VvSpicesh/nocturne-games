const MahjongTiles=(()=>{
  function makeTile(suit,rank,copy){
    return {id:`${suit}-${rank}-${copy}`,suit,rank};
  }

  function createWall(){
    const wall=[];
    for(const suit of MahjongConfig.suits){
      for(let rank=1;rank<=9;rank++){
        for(let copy=0;copy<4;copy++){
          wall.push(makeTile(suit,rank,copy));
        }
      }
    }
    return shuffle(wall);
  }

  function shuffle(items){
    const arr=[...items];
    for(let i=arr.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }

  function faceSvg(tile){
    const label={wan:"萬",bamboo:"条",dot:"筒"}[tile.suit];
    const color={wan:"#d64540",bamboo:"#2d9a60",dot:"#2e75ad"}[tile.suit];
    return `
      <svg viewBox="0 0 100 140" aria-hidden="true">
        <text x="50" y="62" text-anchor="middle" font-size="34" font-weight="800" fill="${color}">${tile.rank}</text>
        <text x="50" y="103" text-anchor="middle" font-size="28" font-weight="800" fill="${color}">${label}</text>
      </svg>`;
  }

  return {createWall,faceSvg};
})();
