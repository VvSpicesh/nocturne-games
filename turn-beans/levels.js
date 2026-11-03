/* Demonstration levels: static, intentionally solvable FIFO color cycles.
 * '.' is neutral background; A-D are colored groups. All levels are validated
 * against the real TurnBeansEngine in levels-tests.js. No random shuffling. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TurnBeansLevels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLOR = Object.freeze({
    '.': '#F2EDE4', A: '#E57C92', B: '#73A9D1', C: '#F0CE97', D: '#463D40', E: '#D98B88'
  });
  const definitions = [
    {
      id: '01', name: '双莓方糖', difficulty: '简单',
      rows: [
        '..........',
        '..........',
        '..AAA.BBB.',
        '..AAA.BBB.',
        '..AAA.BBB.',
        '..........',
        '..........',
        '..........',
        '..........',
        '..........'
      ],
      cycle: ['A', 'B'],
      clickSequence: [[2,2],[2,6],[2,2]]
    },
    {
      id: '02', name: '三色风车', difficulty: '普通',
      rows: [
        '............',
        '............',
        '..AAA.......',
        '..AAA.......',
        '..AAA.......',
        '............',
        '.......BBB..',
        '..CCC..BBB..',
        '..CCC..BBB..',
        '..CCC.......',
        '............',
        '............'
      ],
      cycle: ['A','B','C'],
      clickSequence: [[2,2],[6,7],[7,2],[2,2]]
    },
    {
      id: '03', name: '四色花园', difficulty: '普通',
      rows: [
        '..............',
        '.AAA......BBB.',
        '.AAA......BBB.',
        '.AAA......BBB.',
        '..............',
        '..............',
        '..............',
        '..............',
        '..............',
        '.DDD......CCC.',
        '.DDD......CCC.',
        '.DDD......CCC.',
        '..............',
        '..............'
      ],
      cycle: ['A','B','C','D'],
      clickSequence: [[1,1],[1,10],[9,10],[9,1],[1,1]]
    },
    {
      id: '04', name: '小猫咪', difficulty: '简单',
      // Transparent outer cells form the cat silhouette; eyes and nose stay intact.
      // Two 3x3 ear patches are swapped using a verified FIFO solution.
      rows: [
        '................',
        '...CC......CC...',
        '..CAAA....BBBC..',
        '..CAAAC..CBBBC..',
        '..CAAAC..CBBBC..',
        '..CCCCCCCCCCCC..',
        '..CCCCCCCCCCCC..',
        '.CCCCCCCCCCCCCC.',
        '.CCCCDCCCCDCCCC.',
        '.CCCCCCCCCCCCCC.',
        '.CCCCCCEECCCCCC.',
        '..CCCCCDDCCCCC..',
        '..CCCCCCCCCCCC..',
        '...CCCCCCCCCC...',
        '.....CCCCCC.....',
        '................'
      ],
      cycle: ['A','B'],
      clickSequence: [[2,3],[2,10],[2,3]]
    }
  ];
  function getLevel(id) {
    const def = definitions.find(d => d.id === String(id));
    if (!def) return null;
    const mapping = Object.fromEntries(def.cycle.map((color, i) => [color, def.cycle[(i+1)%def.cycle.length]]));
    const toCell = (symbol, scrambled) => symbol === '.'
      ? {active: false, baseColor: null, beanColor: null}
      : {active: true, baseColor: COLOR[symbol], beanColor: COLOR[scrambled ? (mapping[symbol] || symbol) : symbol]};
    const targetBoard = def.rows.map(row => [...row].map(symbol => toCell(symbol, false)));
    const initialBoard = def.rows.map(row => [...row].map(symbol => toCell(symbol, true)));
    return {
      id: def.id, name: def.name, difficulty: def.difficulty,
      width: def.rows[0].length, height: def.rows.length,
      targetBoard, initialBoard,
      // Internal test fixture only; the game UI does not render this.
      testSolution: def.clickSequence.map(p => p.slice())
    };
  }
  return { getLevel, listLevels: () => definitions.map(d => ({ id:d.id, name:d.name, difficulty:d.difficulty })) };
});
