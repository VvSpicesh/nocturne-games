const MahjongRender={
  render(state){
    state.players.forEach((player,index)=>this.renderSeat(player,index));
    document.getElementById("wallCount").textContent=state.wall.length;
    document.getElementById("phaseText").textContent=state.phase;
  },

  renderSeat(player,index){
    const seat=document.getElementById(`seat${index}`);
    seat.innerHTML=`<strong>${player.name}</strong><div class="hand ${index===1||index===3?"vertical":""}"></div>`;
    const hand=seat.querySelector(".hand");

    player.hand.forEach(tile=>{
      const el=document.createElement("div");
      el.className=index===0?"tile":"tile back";
      if(index===0) el.innerHTML=MahjongTiles.faceSvg(tile);
      hand.appendChild(el);
    });
  }
};
