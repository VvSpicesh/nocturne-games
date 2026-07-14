const MahjongGame={
  state:null,

  init(){
    document.getElementById("newMahjongGame").onclick=()=>this.newGame();
    const saved=MahjongStorage.load();
    if(saved){
      this.state=saved;
      MahjongRender.render(this.state);
    }else{
      this.createEmptyState();
    }
  },

  createEmptyState(){
    this.state={
      phase:"准备",
      wall:MahjongTiles.createWall(),
      players:["你","阿麻","小川","幺鸡"].map(name=>({
        name,
        hand:[],
        discards:[],
        missingSuit:null,
        won:false
      })),
      currentPlayer:0
    };
    MahjongRender.render(this.state);
  },

  newGame(){
    this.createEmptyState();
    for(let round=0;round<13;round++){
      for(const player of this.state.players){
        player.hand.push(this.state.wall.pop());
      }
    }
    this.state.players[0].hand.push(this.state.wall.pop());
    this.state.phase="换三张";
    MahjongStorage.save(this.state);
    MahjongRender.render(this.state);
  }
};

MahjongGame.init();
