const MahjongTiles = (() => {
  const COLORS = {
    red: "#d94b45",
    green: "#2b9a60",
    blue: "#2e75ad",
    dark: "#173b2a",
    light: "#d8f1df",
    gold: "#f2d06b"
  };

  const WAN_NUMBERS = ["","一","二","三","四","五","六","七","八","九"];

  function makeTile(suit, rank, copy) {
    return {
      id: `${suit}-${rank}-${copy}`,
      suit,
      rank
    };
  }

  function createWall() {
    const wall = [];

    for (const suit of MahjongConfig.suits) {
      for (let rank = 1; rank <= 9; rank++) {
        for (let copy = 0; copy < 4; copy++) {
          wall.push(makeTile(suit, rank, copy));
        }
      }
    }

    return shuffle(wall);
  }

  function shuffle(items) {
    const arr = [...items];

    for (let index = arr.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [arr[index], arr[randomIndex]] = [arr[randomIndex], arr[index]];
    }

    return arr;
  }

  function svg(content) {
    return `
      <svg viewBox="0 0 100 140" aria-hidden="true">
        ${content}
      </svg>
    `;
  }

  function circle(x, y, radius, fill, stroke = COLORS.dark, strokeWidth = 2) {
    return `
      <circle
        cx="${x}"
        cy="${y}"
        r="${radius}"
        fill="${fill}"
        stroke="${stroke}"
        stroke-width="${strokeWidth}"
      />
    `;
  }

  function bamboo(x, y, rotation = 0, fill = COLORS.green) {
    return `
      <g transform="translate(${x} ${y}) rotate(${rotation})">
        <rect
          x="-6"
          y="-20"
          width="12"
          height="40"
          rx="6"
          fill="${fill}"
          stroke="#174f34"
          stroke-width="2"
        />
        <line x1="-3" y1="-12" x2="3" y2="-12" stroke="${COLORS.light}" stroke-width="2" />
        <line x1="-3" y1="0" x2="3" y2="0" stroke="${COLORS.light}" stroke-width="2" />
        <line x1="-3" y1="12" x2="3" y2="12" stroke="${COLORS.light}" stroke-width="2" />
      </g>
    `;
  }

  function wanFace(rank) {
    return svg(`
      <text
        x="50"
        y="57"
        text-anchor="middle"
        font-size="28"
        font-weight="700"
        font-family="Noto Serif SC, Songti SC, SimSun, serif"
        fill="${COLORS.red}"
      >${WAN_NUMBERS[rank]}</text>

      <text
        x="50"
        y="98"
        text-anchor="middle"
        font-size="25"
        font-weight="700"
        font-family="Noto Serif SC, Songti SC, SimSun, serif"
        fill="${COLORS.red}"
      >萬</text>
    `);
  }

  function dotFace(rank) {
    const layouts = {
      1: [[50,70,27,COLORS.red]],
      2: [[50,38,14,COLORS.green],[50,102,14,COLORS.blue]],
      3: [[30,32,11,COLORS.blue],[50,70,11,COLORS.red],[70,108,11,COLORS.green]],
      4: [[30,38,11,COLORS.blue],[70,38,11,COLORS.green],[30,102,11,COLORS.green],[70,102,11,COLORS.blue]],
      5: [[30,34,10,COLORS.blue],[70,34,10,COLORS.green],[50,70,11,COLORS.red],[30,106,10,COLORS.green],[70,106,10,COLORS.blue]],
      6: [[28,32,10,COLORS.green],[50,32,10,COLORS.green],[72,32,10,COLORS.green],[28,102,10,COLORS.red],[50,102,10,COLORS.red],[72,102,10,COLORS.red]],
      7: [[28,27,9,COLORS.green],[50,27,9,COLORS.green],[72,27,9,COLORS.green],[28,65,9,COLORS.red],[72,65,9,COLORS.red],[28,105,9,COLORS.red],[72,105,9,COLORS.red]],
      8: [[28,24,9,COLORS.blue],[50,24,9,COLORS.blue],[72,24,9,COLORS.blue],[28,58,9,COLORS.blue],[72,58,9,COLORS.green],[28,94,9,COLORS.green],[50,94,9,COLORS.green],[72,94,9,COLORS.green]],
      9: [[28,25,9,COLORS.blue],[50,25,9,COLORS.blue],[72,25,9,COLORS.blue],[28,67,9,COLORS.red],[50,67,9,COLORS.red],[72,67,9,COLORS.red],[28,109,9,COLORS.green],[50,109,9,COLORS.green],[72,109,9,COLORS.green]]
    };

    return svg(
      layouts[rank]
        .map(([x, y, radius, fill]) => circle(x, y, radius, fill))
        .join("")
    );
  }

  function birdFace() {
    return svg(`
      <g transform="translate(50 70)">
        <ellipse cx="0" cy="5" rx="18" ry="31" fill="${COLORS.green}" stroke="#174f34" stroke-width="3"/>
        <circle cx="0" cy="-16" r="8" fill="${COLORS.red}"/>
        <path d="M-17 3 Q0 -8 17 3 Q0 16 -17 3Z" fill="${COLORS.blue}"/>
        <path d="M-14 19 Q0 7 14 19 Q0 31 -14 19Z" fill="${COLORS.red}"/>
        <circle cx="0" cy="5" r="5" fill="${COLORS.gold}"/>
      </g>
    `);
  }

  function bambooFace(rank) {
    if (rank === 1) {
      return birdFace();
    }

    const layouts = {
      2: [[50,38,0,COLORS.green],[50,102,0,COLORS.green]],
      3: [[32,34,-10,COLORS.green],[68,34,10,COLORS.green],[50,100,0,COLORS.red]],
      4: [[30,38,-8,COLORS.green],[70,38,8,COLORS.green],[30,102,8,COLORS.green],[70,102,-8,COLORS.green]],
      5: [[30,32,-8,COLORS.green],[70,32,8,COLORS.green],[50,70,0,COLORS.red],[30,108,8,COLORS.green],[70,108,-8,COLORS.green]],
      6: [[28,30,-8,COLORS.green],[50,30,0,COLORS.green],[72,30,8,COLORS.green],[28,102,8,COLORS.green],[50,102,0,COLORS.green],[72,102,-8,COLORS.green]],
      7: [[28,26,-8,COLORS.green],[50,26,0,COLORS.green],[72,26,8,COLORS.green],[28,64,8,COLORS.green],[72,64,-8,COLORS.green],[36,106,4,COLORS.red],[64,106,-4,COLORS.red]],
      8: [[28,24,-8,COLORS.green],[50,24,0,COLORS.green],[72,24,8,COLORS.green],[28,58,8,COLORS.green],[72,58,-8,COLORS.green],[28,102,-8,COLORS.green],[50,102,0,COLORS.green],[72,102,8,COLORS.green]],
      9: [[28,23,-8,COLORS.green],[50,23,0,COLORS.green],[72,23,8,COLORS.green],[28,67,8,COLORS.green],[50,67,0,COLORS.red],[72,67,-8,COLORS.green],[28,111,-8,COLORS.green],[50,111,0,COLORS.green],[72,111,8,COLORS.green]]
    };

    return svg(
      layouts[rank]
        .map(([x, y, rotation, fill]) => bamboo(x, y, rotation, fill))
        .join("")
    );
  }

  function faceSvg(tile) {
    switch (tile.suit) {
      case "wan":
        return wanFace(tile.rank);
      case "dot":
        return dotFace(tile.rank);
      case "bamboo":
        return bambooFace(tile.rank);
      default:
        return "";
    }
  }

  return {
    createWall,
    faceSvg
  };
})();
