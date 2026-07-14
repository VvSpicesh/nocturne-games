const MahjongRender={
  render(state){
    state.players.forEach((player,index)=>{
      this.renderSeat(state,player,index);
      this.renderDiscards(player,index);
    });
    document.getElementById("wallCount").textContent=state.wall.length;
    document.getElementById("phaseText").textContent=state.phase;
    this.renderOperation(state);
  },

  renderSeat(state,player,index){
    const seat=document.getElementById(`seat${index}`);
    const vertical=index===1||index===3;
    seat.innerHTML=`
      <div class="seat-header">
        <div class="seat-title">
          <div class="avatar">${index===0?"🙂":"🤖"}</div>
          <div>
            <div class="player-name">${player.name}</div>
            <div class="player-meta">${player.missingSuit?`缺：${player.missingSuit}`:"等待定缺"}</div>
          </div>
        </div>
        <span class="player-meta">${player.hand.length}张</span>
      </div>
      <div class="hand ${vertical?`vertical ${index===1?"left-facing":"right-facing"}`:""}"></div>
    `;
    const hand=seat.querySelector(".hand");

    player.hand.forEach((tile,tileIndex)=>{
      const el=document.createElement("div");
      el.className=index===0?"tile":"tile back";

      if(index===0){
        el.innerHTML=MahjongTiles.faceSvg(tile);
        const selectable=
          (state.phase==="换三张")||
          (state.phase==="出牌"&&state.currentPlayer===0);
        if(selectable){
          el.classList.add("clickable");
          if(state.selectedTiles.includes(tile.id))el.classList.add("selected");
          el.onclick=()=>MahjongGame.handleHumanTile(tileIndex);
        }
      }
      hand.appendChild(el);
    });
  },

  renderDiscards(player,index){
    const box=document.getElementById(`discard${index}`);
    box.innerHTML="";
    player.discards.forEach(tile=>{
      const el=document.createElement("div");
      el.className="tile";
      el.innerHTML=MahjongTiles.faceSvg(tile);
      box.appendChild(el);
    });
  },

  renderOperation(state){
    const hint=document.getElementById("operationHint");
    const actions=document.getElementById("operationActions");
    actions.innerHTML="";

    if(state.phase==="准备"){
      hint.textContent="点击“开始新牌局”。";
      return;
    }

    if(state.phase==="换三张"){
      hint.textContent="请选择同一花色的三张牌。";
      const btn=document.createElement("button");
      btn.textContent="确认换三张";
      btn.disabled=state.selectedTiles.length!==3;
      btn.onclick=()=>MahjongGame.confirmExchange();
      actions.appendChild(btn);
      return;
    }

    if(state.phase==="定缺"){
      hint.textContent="请选择本局定缺花色。";
      for(const [suit,label] of [["wan","万"],["bamboo","条"],["dot","筒"]]){
        const btn=document.createElement("button");
        btn.className="choice-button"+(state.pendingMissing===suit?" active":"");
        btn.textContent=label;
        btn.onclick=()=>MahjongGame.chooseMissing(suit);
        actions.appendChild(btn);
      }
      const confirm=document.createElement("button");
      confirm.textContent="确认定缺";
      confirm.disabled=!state.pendingMissing;
      confirm.onclick=()=>MahjongGame.confirmMissing();
      actions.appendChild(confirm);
      return;
    }

    if(state.phase==="出牌"){
      hint.textContent=state.currentPlayer===0?"请选择一张牌打出。":"电脑正在出牌。";
    }
  }
};
