const MahjongRender = {
  render(state, options = {}) {
    state.players.forEach((player, index) => {
      this.renderSeat(player, index, options);
      this.renderDiscards(player, index);
    });

    document.getElementById("wallCount").textContent = state.wall.length;
    document.getElementById("phaseText").textContent = state.phase;
  },

  renderSeat(player, index, options = {}) {
    const seat = document.getElementById(`seat${index}`);
    const vertical = index === 1 || index === 3;

    seat.innerHTML = `
      <div class="seat-header">
        <div class="seat-title">
          <div class="avatar">${index === 0 ? "🙂" : "🤖"}</div>
          <div>
            <div class="player-name">${player.name}</div>
            <div class="player-meta">${player.missingSuit ? `缺：${player.missingSuit}` : "等待定缺"}</div>
          </div>
        </div>
        <span class="player-meta">${player.hand.length}张</span>
      </div>

      <div class="hand ${vertical ? `vertical ${index === 1 ? "left-facing" : "right-facing"}` : ""}"></div>
    `;

    const handElement = seat.querySelector(".hand");

    player.hand.forEach((tile, tileIndex) => {
      const tileElement = document.createElement("div");
      tileElement.className = index === 0 ? "tile" : "tile back";

      if (options.animateDeal) {
        tileElement.classList.add("dealing");
        tileElement.style.animationDelay = `${tileIndex * 35}ms`;

        const motion = this.getDealMotion(index);
        tileElement.style.setProperty("--deal-x", motion.x);
        tileElement.style.setProperty("--deal-y", motion.y);
        tileElement.style.setProperty("--deal-r", motion.rotation);
        tileElement.style.setProperty("--final-r", motion.finalRotation);
      }

      if (index === 0) {
        tileElement.innerHTML = MahjongTiles.faceSvg(tile);
      }

      handElement.appendChild(tileElement);
    });
  },

  renderDiscards(player, index) {
    const discardElement = document.getElementById(`discard${index}`);
    discardElement.innerHTML = "";

    player.discards.forEach((tile) => {
      const tileElement = document.createElement("div");
      tileElement.className = "tile";
      tileElement.innerHTML = MahjongTiles.faceSvg(tile);
      discardElement.appendChild(tileElement);
    });
  },

  getDealMotion(index) {
    const motions = {
      0: { x: "0px", y: "-220px", rotation: "0deg", finalRotation: "0deg" },
      1: { x: "220px", y: "0px", rotation: "0deg", finalRotation: "90deg" },
      2: { x: "0px", y: "220px", rotation: "180deg", finalRotation: "0deg" },
      3: { x: "-220px", y: "0px", rotation: "0deg", finalRotation: "-90deg" }
    };

    return motions[index];
  }
};
