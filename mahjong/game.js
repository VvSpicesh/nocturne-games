const MahjongGame = {
  state: null,

  init() {
    document.getElementById("newMahjongGame").onclick = () => this.newGame();

    const saved = MahjongStorage.load();

    if (saved) {
      this.state = saved;
      MahjongRender.render(this.state);
    } else {
      this.createEmptyState();
    }
  },

  createEmptyState() {
    this.state = {
      phase: "准备",
      wall: MahjongTiles.createWall(),
      players: ["你", "阿麻", "小川", "幺鸡"].map((name) => ({
        name,
        hand: [],
        discards: [],
        missingSuit: null,
        won: false
      })),
      currentPlayer: 0
    };

    MahjongRender.render(this.state);
  },

  newGame() {
    this.state = {
      phase: "发牌",
      wall: MahjongTiles.createWall(),
      players: ["你", "阿麻", "小川", "幺鸡"].map((name) => ({
        name,
        hand: [],
        discards: [],
        missingSuit: null,
        won: false
      })),
      currentPlayer: 0
    };

    for (let round = 0; round < 13; round++) {
      for (const player of this.state.players) {
        player.hand.push(this.state.wall.pop());
      }
    }

    this.state.players[0].hand.push(this.state.wall.pop());

    for (const player of this.state.players) {
      player.hand.sort((a, b) => {
        const suitOrder = MahjongConfig.suits.indexOf(a.suit) - MahjongConfig.suits.indexOf(b.suit);
        return suitOrder || a.rank - b.rank;
      });
    }

    MahjongRender.render(this.state, { animateDeal: true });

    window.setTimeout(() => {
      this.state.phase = "换三张";
      MahjongStorage.save(this.state);
      MahjongRender.render(this.state);
    }, 900);
  }
};

MahjongGame.init();
