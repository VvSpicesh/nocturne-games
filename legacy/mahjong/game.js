const MahjongGame={
  state:null,

  init(){
    document.getElementById("newMahjongGame").onclick=()=>this.newGame();
    const saved=MahjongStorage.load();
    if(saved){
      this.state=saved;
      this.state.selectedTiles=[];
      this.state.pendingMissing=null;
      MahjongRender.render(this.state);
      if(this.state.phase==="出牌"&&this.state.currentPlayer!==0)setTimeout(()=>this.aiTurn(),500);
    }else{
      this.createEmpty();
    }
  },

  createEmpty(){
    this.state={
      phase:"准备",
      wall:MahjongTiles.createWall(),
      players:["你","阿麻","小川","幺鸡"].map(name=>({
        name,hand:[],discards:[],missingSuit:null,won:false
      })),
      currentPlayer:0,
      selectedTiles:[],
      pendingMissing:null
    };
    MahjongRender.render(this.state);
  },

  newGame(){
    this.createEmpty();
    for(let round=0;round<13;round++){
      for(const player of this.state.players)player.hand.push(this.state.wall.pop());
    }
    this.state.players[0].hand.push(this.state.wall.pop());
    this.sortAll();
    this.state.phase="换三张";
    this.saveRender();
  },

  sortAll(){
    const order=MahjongConfig.suits;
    for(const player of this.state.players){
      player.hand.sort((a,b)=>order.indexOf(a.suit)-order.indexOf(b.suit)||a.rank-b.rank);
    }
  },

  handleHumanTile(index){
    const tile=this.state.players[0].hand[index];

    if(this.state.phase==="换三张"){
      const selected=this.state.selectedTiles;
      const pos=selected.indexOf(tile.id);

      if(pos>=0){
        selected.splice(pos,1);
      }else{
        if(selected.length>=3)return this.toast("只能选择三张牌");
        if(selected.length){
          const first=this.state.players[0].hand.find(t=>t.id===selected[0]);
          if(first.suit!==tile.suit)return this.toast("三张牌必须同一花色");
        }
        selected.push(tile.id);
      }
      MahjongRender.render(this.state);
      return;
    }

    if(this.state.phase==="出牌"&&this.state.currentPlayer===0){
      const p=this.state.players[0];
      const hasMissing=p.missingSuit&&p.hand.some(t=>t.suit===p.missingSuit);
      if(hasMissing&&tile.suit!==p.missingSuit)return this.toast("必须先打完定缺花色");
      p.hand.splice(index,1);
      p.discards.push(tile);
      this.nextPlayer();
    }
  },

  confirmExchange(){
    if(this.state.selectedTiles.length!==3)return;
    const exchanged=[];

    for(let i=0;i<4;i++){
      const p=this.state.players[i];
      let chosen;
      if(i===0){
        chosen=p.hand.filter(t=>this.state.selectedTiles.includes(t.id));
      }else{
        const groups={wan:[],bamboo:[],dot:[]};
        p.hand.forEach(t=>groups[t.suit].push(t));
        const suit=Object.keys(groups).sort((a,b)=>groups[b].length-groups[a].length)[0];
        chosen=groups[suit].slice(0,3);
      }
      exchanged[i]=chosen;
      p.hand=p.hand.filter(t=>!chosen.some(c=>c.id===t.id));
    }

    for(let i=0;i<4;i++){
      const from=(i+3)%4;
      this.state.players[i].hand.push(...exchanged[from]);
    }

    this.sortAll();
    this.state.selectedTiles=[];
    this.state.phase="定缺";
    this.saveRender();
  },

  chooseMissing(suit){
    this.state.pendingMissing=suit;
    MahjongRender.render(this.state);
  },

  confirmMissing(){
    if(!this.state.pendingMissing)return;
    this.state.players[0].missingSuit=this.state.pendingMissing;

    for(let i=1;i<4;i++){
      const counts={wan:0,bamboo:0,dot:0};
      this.state.players[i].hand.forEach(t=>counts[t.suit]++);
      this.state.players[i].missingSuit=Object.keys(counts).sort((a,b)=>counts[a]-counts[b])[0];
    }

    this.state.phase="出牌";
    this.state.currentPlayer=0;
    this.state.pendingMissing=null;
    this.saveRender();
  },

  nextPlayer(){
    this.state.currentPlayer=(this.state.currentPlayer+1)%4;
    this.saveRender();

    if(this.state.wall.length===0){
      this.state.phase="结束";
      this.saveRender();
      return;
    }

    setTimeout(()=>{
      const p=this.state.players[this.state.currentPlayer];
      p.hand.push(this.state.wall.pop());
      this.sortAll();
      this.saveRender();

      if(this.state.currentPlayer!==0)setTimeout(()=>this.aiTurn(),450);
    },300);
  },

  aiTurn(){
    if(this.state.phase!=="出牌"||this.state.currentPlayer===0)return;
    const p=this.state.players[this.state.currentPlayer];
    let candidates=p.hand.map((tile,index)=>({tile,index}));
    if(p.missingSuit&&p.hand.some(t=>t.suit===p.missingSuit)){
      candidates=candidates.filter(x=>x.tile.suit===p.missingSuit);
    }
    const pick=candidates[Math.floor(Math.random()*candidates.length)];
    p.hand.splice(pick.index,1);
    p.discards.push(pick.tile);
    this.nextPlayer();
  },

  saveRender(){
    MahjongStorage.save(this.state);
    MahjongRender.render(this.state);
  },

  toast(message){
    const el=document.getElementById("toast");
    el.textContent=message;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t=setTimeout(()=>el.classList.remove("show"),1600);
  }
};

MahjongGame.init();
