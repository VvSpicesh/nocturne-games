/* Demonstration levels plus a fully scrambled, verified challenge puzzle.
 * '.' is neutral background; A-D are colored groups. All levels are validated
 * against the real TurnBeansEngine in levels-tests.js. No random shuffling. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TurnBeansLevels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLOR = Object.freeze({
    '.': '#F2EDE4',
    A: '#E57C92', B: '#73A9D1', C: '#F0CE97', D: '#463D40', E: '#D98B88',
    F: '#F4C83A', // cat fur
    G: '#463D40', // outline / dark details
    H: '#A8ADB4', // gray patch
    I: '#FF4FA0', // bright pink yarn
    J: '#7A4CC2', // purple yarn
    K: '#344C96', // navy yarn
    L: '#F48A29', // orange accent
    M: '#F5F5F5', // white yarn
    N: '#31B4E8', // blue bowl
    Q: '#F5C420',
    R: '#33343B',
    S: '#92969E',
    T: '#F23F92',
    U: '#7541BE',
    V: '#37388D',
    W: '#F78022',
    X: '#21A7E4',
    Z: '#F1F1EE'
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
    },
    {
      id: '05', name: '可爱黄猫与毛线', difficulty: '挑战',
      // 56×40 verified pixel art; full-outline recolor with 181-click verified solution.
      palette: {"K":"#44302C","Y":"#FFD33F","O":"#F4A433","P":"#F7A4C4","R":"#EA4D86","U":"#AE71CD","V":"#7044A1","G":"#A6ABB4","W":"#FFF7E8","B":"#2DAEE4","N":"#2678C4"},
      rows: [
        '........................................................',
        '................K.....................KK................',
        '................KK..................KKYK................',
        '................KPKK...............KYYYPK...............',
        '...............KYPPYK.............KYYYPPK...............',
        '...............KYPPPYK...........KYYYYPPK...............',
        '...............KYPPPYYK.........KYYYYPPPYK..............',
        '...............KYPPPPYYKKKKKKKKKYYYYPPPPPK..............',
        '..............KYYPPPPPYYYGGYYGGYYYYYPPPPPK..............',
        '..............KYYYPPPPYYYGGYYGGYYYYPPPPPPYK.............',
        '..............KYYYPPPPPYYGGYYGGYYYYPPPPPPYK.............',
        '..RRR..RR....KYYYYYYYYYYYYGGYGGYYYYYPPPPPYK.............',
        '.RPPP.RRRR...KYYYYYYYYYYYYGGYGGYYYYYYYYYYYYK............',
        '.RPPPRRRRR..KYYYYYYYYYYYYYGGYGGYYYYYYYYYYYYK............',
        '.RRRRRRRRR..KYYYYYYKKYYYYYYYYYYYYYYKKYYYYYYKKKKK........',
        '.RRRRRRRRR..KYYYYYKKKKKKYYYYYYYYKKKKKKYYYYYKYYYYK.......',
        '..RRRRRRR...KYYYYKKKYYKKYYYYYYYYKKYYYKKKYYYKYYYYYGK.....',
        '...RRRRR....KYYYYYKYYYYKKYYYYYYKKYYYYYKYYYYKYYYYGGGK....',
        '....RRR.....KKKKKPPPYYYYYYYYYYYYYYYYYPPPYYKYYYYYYGYYK...',
        '.....R....KKVVVVVKKPPPYYYYYYYYYYYYYPPPPPPPKYYYYGYYYYK...',
        '.........KVVVVVVVVVKPPYYWWWWYYWWWWYPPPPPPPKYYYYGGGYYGK..',
        '........KVVVVVVVVVVVKPYWWWWRRRRWWWWPPPPPPPKYYYYGGGYGGG..',
        '.......KVVVVUVVVVVVVVKWWWWWRRRWWWWWWYPPPYKYYYYGGGYYYGYK.',
        '.....KKUVVVVUUVVVVVVVKKWWWWWKRWWWWWKKKKKKKYYYYGGGYYYYYK.',
        '....KUUKUVVUVVUVVVVVVKWWWWWWKWWWWWWWYYYYKYYYYYGGYYYYYYK.',
        '...KUUUKVUVUVVVUVVVVVKKKKWWWKWWWWWWKKKYYKYYYYYYYYYGYYYK.',
        '..KUUUUKVVUVVVVVVVVKRRPPPPKKWKKWWWWYYYKKKYOYYYYYYGGGKYK.',
        '..KUUUUUKVVVVVVVVUKRRPPPPPRKYYWWWWYYYYKYYYOOOYYYYKGYYKK.',
        '.KNNNNNNNNNNNNNNNNNNNNNNNRRRNKYYYYYYYKYYYOOOOKKYKYYYYYK.',
        '.KNNNNNNNNNNNNNNNNNNNNNNNNRRRRYYYYYYKYYYYOOOKYYKKYYYYYK.',
        '..KBBBBBBBBBBBBBBBBBBBBBBBBBRRRKKKKKWKYYKKKKYYYYYGYYYYK.',
        '..KBNNNNNNNNNWWWWNNNNNNNNNNNKRRKWWWWWWKKWWWWKKYYGGGYYK..',
        '...KNNNNNNNWWWWWWWWNNNNNNNNNK.RRWWWWWWKWWWWWWKKKYGYKKK..',
        '...KBBBBBBBWWBWWBWWBBBBBBBBBK.RRWWGWGWKWGWGWWKYKKKKK....',
        '....KBBBBBBBBWWWWBBBBBBBBBBK..RRRWGWGK.KGWGWKKK.........',
        '....KBBBBBBBBWWWWBBBBBBBBBBK....RRRRRR..KKKK............',
        '.....KKBBBBBBBWWBBBBBBBBBBBK.....RRRRRRR................',
        '.......NNNNNNNNNNNNNNNNNNKK............RRR..............',
        '.......NNNNNNNNNNNNNNNNNN................R..............',
        '........................................................'
      ],
      // 34 independent swaps of connected ten-bead color groups; visually coherent.
      // Exact same-color/base connected regions; each pair is solved in three clicks.
      groupedSwaps: [[1993,1994,2049,1992,1995,2050,1936,1996,2051,1935,2080,2081,2136,2079,2082,2137,2135,2083,2138,2084],[1096,1040,1097,1095,1041,1039,1098,1094,985,1042,1105,1161,1104,1217,1160,1103,1216,1159,1047,1102],[1214,1158,1215,1270,1213,1157,1271,1269,1212,1101,1621,1677,1620,1733,1676,1564,1619,1732,1675,1563],[1695,1696,1694,1697,1693,1698,1692,1699,1691,1700,1012,956,1013,900,957,955,1014,1069,844,901],[1362,1306,1363,1418,1361,1250,1307,1305,1364,1419,634,635,690,633,636,691,746,689,577,632],[373,374,429,318,375,430,485,428,262,319,464,408,520,463,352,521,576,519,296,575],[486,487,542,431,488,543,598,541,432,544,1226,1170,1282,1114,1171,1283,1338,1281,1058,1115],[744,688,745,800,743,687,801,856,799,742,1633,1577,1634,1632,1578,1576,1635,1631,1579,1575],[1766,1710,1822,1765,1709,1823,1878,1653,1708,1879,1659,1603,1658,1547,1604,1602,1657,1491,1548,1546],[921,865,922,977,920,809,866,864,923,978,474,530,473,586,529,642,585,643,698,699],[1191,1135,1192,1247,1190,1079,1136,1134,1193,1248,623,624,679,680,735,678,681,736,791,734],[1637,1581,1638,1636,1582,1580,1639,1583,1640,1584,1515,1459,1516,1460,1517,1404,1461,1518,1405,1462],[1440,1384,1496,1328,1495,1329,1327,1494,1273,1326,1417,1473,1416,1474,1472,1360,1528,1471,1304,1359],[242,298,241,299,354,297,185,355,410,353,1302,1246,1303,1245,1189,1133,1188,1077,1132,1187],[1395,1339,1396,1451,1394,1340,1397,1452,1393,1341,1398,1342,1454,1286,1510,1566,1622,1565,1678,1734],[1264,1208,1265,1320,1263,1152,1209,1207,1266,1321,1798,1742,1799,1797,1743,1741,1800,1796,1744,1740],[1772,1716,1773,1828,1771,1829,1827,1770,1885,1883,1165,1109,1166,1221,1164,1053,1110,1108,1222,1277],[2145,2089,2146,2144,2090,2088,2147,2143,2091,2087,1892,1836,1891,1835,1947,1779,1834,1778,1833,1777],[545,601,657,713,714,769,712,770,825,768,2026,1970,2027,2025,1914,1971,1969,2028,2024,1858],[475,476,531,532,587,588,644,700,756,812,1526,1470,1527,1525,1414,1469,1524,1413,1468,1523],[527,471,528,583,526,472,470,584,639,414,1759,1760,1815,1758,1761,1816,1814,1757,1762,1817],[1092,1036,1093,1148,1091,980,1037,1035,1149,1090,928,872,929,984,873,983,874,875,819,876],[480,424,481,536,479,425,482,537,592,535,1855,1856,1911,1854,1857,1912,1967,1910,1853,1913],[1376,1377,1432,1375,1378,1433,1488,1431,1319,1374,1981,1925,1982,2037,1980,1869,1926,1924,1983,2038],[790,846,789,847,902,845,733,788,848,903,1929,1873,1930,1985,1928,1874,1872,1986,2041,1984],[715,771,827,828,883,829,939,830,995,831,427,371,483,426,315,372,370,259,316,314],[1627,1571,1628,1626,1572,1570,1629,1573,1630,1574,1895,1839,1896,1838,1897,1837,1898,1781,1893,1899],[1087,1031,1088,1143,1086,1032,1030,1089,1142,1033,803,804,859,860,915,858,861,914,862,970],[1447,1448,1503,1446,1392,1449,1504,1559,1502,1445,1023,1024,1022,1021,1020,964,908,852,796,740],[910,854,911,966,909,798,855,853,912,967,1975,1919,1976,2031,1974,1863,1920,1918,2030,1973],[1280,1224,1336,1279,1168,1225,1223,1335,1278,1169,655,599,656,654,600,653,597,652,596,540],[1808,1752,1809,1807,1751,1810,1865,1806,1750,1866,694,638,695,750,693,637,696,751,806,749],[887,943,886,944,999,942,885,1055,998,941,1366,1367,1311,1368,1255,1312,1369,1199,1256,1254],[412,468,411,469,524,467,525,580,523,466,1553,1497,1552,1441,1608,1551,1385,1442,1664,1607]],
      expectedMisplaced: 680,
      expectedMoves: 102
    }

    ,{
      id: '06', name: '黑猫与小鱼', difficulty: '普通',
      palette: {"A":"#20232B","B":"#747C87","C":"#A3AAB5","D":"#D2D8E0","E":"#F8F7F2","F":"#ED2C8A","G":"#DAD6EF","H":"#198764","I":"#A1C923","J":"#F4BE1D","K":"#F2D6C6"},
      rows: [
        '..DBBBCK.............GKKK........',
        '.GCCDDDCK..........EDCBBBG.......',
        '.DBBBBCCCK.DDD....DCCCDCBD.......',
        '.DBBFBBCCCCCBBD..DCCCCBBCBE......',
        '.DBBFFBBBCCCCCBCCCCCCBBBBBE......',
        '.DBBFFBCCCCCCCCBBBBBBFFBBBE......',
        '.DBBBBCDDCCCCCCCCCBBFFFBBBE......',
        '.DBCBCCCCCCCCCCCCCCCBFFBBBE......',
        '.DBBCCCCCCCCCCCCCCCCBBFBBBE......',
        '.DBCCDKKDCCCCCCCDDDCCBBBCBE......',
        '.DCCBCCCCBCCCCBCKKKDCBBCBD.......',
        '.DCCBAAAAABCCBABCCCBBCBBBG.......',
        '.DBBAAABAABBBAAAAAAAABBBBG.......',
        'KBAAAABCAAABBAABBAAAAAABD........',
        'DBAAAAABAAABBAABBAAAAAAD.........',
        'CBAAAAAAABBBBBAAAAAAAAAD.........',
        'AABBBBAABDCABDCAAAAAAAACG........',
        'ABCCFFBCDGDBCKDCABBBAAABK........',
        'BCCFFFFCKDDBDCKDCCCCCCBBD........',
        'BCCFFFCCKKCBBDKDCFFFCCCBBG.......',
        'ABCCCCCCDKDFFKDCCFFFCCCBBG.......',
        'CCBBBBCCCDDDDDCCCCFFBBAACG.......',
        '..DCBABBBBCCCCCCBBBAABCCG........',
        '....DDCBAABBBBBBBABCDD....DCCCG..',
        '...DD.ECBAAAAAAAABD.....GCCCCCCCG',
        '...CBDKBHBBBBIBAHBD....GCDDGGCBBC',
        '...CABCBBBIIIIBHHBBD...CDDKGGKBAA',
        '...CBBCJIBIBBBBHBHHBD.KCCBBDKGDBA',
        '...CCKKKJIBDCBBBBIIIBDCCBAAACDDBA',
        '...CBDKKKJCCBAABIIIBAACDBAAAACDBB',
        '...KBBKKJJBAAABIIBBAAACGDDCAACCDD',
        '....DBJJJJJBABIIBBBBAACKGGKCBBBG.',
        '.....CBJJJJIBBBBBBBBAABBDGGKCBD..',
        '.....GCBICBBBDCCCCBBABBABDGGCBD..',
        '......GCBBCDDCCCCCCBACCAABDDDCG..',
        '........DBBCCBBCCCBABDCAABCDCD...',
        '........DCCBABCBBCBACGDBAABCCG...',
        '........KCCBABGCBBAABDDBAABCG....',
        '.......DBBABAB.CBBBABBBBBBCG.....',
        '......GBBBBBBC.DBBBBCGGGGGG......'
      ],
      groupedSwaps: [
        [67,100,133,166,199,232,265,298,331,364,941,942,974,943,975,973,1006,1005,1038,1037],
        [368,369,401,370,402,434,400,371,467,433,966,999,1032,998,1033,1065,1031,1066,1064,1030],
        [40,73,74,106,72,107,108,109,141,110,377,410,411,443,409,412,476,442,413,509],
        [54,87,120,86,119,85,152,118,151,117,767,768,801,802,803,804,805,806,807,808],
        [563,564,596,629,595,662,628,663,664,665,977,978,1010,1011,1043,1009,1044,1076,1077,1109],
        [68,69,101,70,102,134,71,135,167,104,610,611,643,612,676,613,709,675,614,710],
        [121,122,154,155,153,156,188,157,189,221,786,787,819,788,820,818,821,817,822,854],
        [373,406,407,408,440,441,473,474,506,507,1103,1104,1136,1105,1137,1135,1106,1138,1170,1139]
      ],
      expectedMisplaced: 160,
      expectedMoves: 24
    }


  ];
  function getLevel(id) {
    const def = definitions.find(d => d.id === String(id));
    if (!def) return null;
    const targetRows = def.rows;
    const initialRows = def.initialRows || def.rows;
    const scrambledRows = initialRows.map(row => [...row]);
    if (def.rectangleSwaps) {
      // Organic step-shaped color regions, not rigid rectangular patches.
      // Each swap uses the SAME connected mask in both original-color areas.
      // This preserves per-color totals and allows the solution to be verified.
      for (const [r1,c1,r2,c2,h,w] of def.rectangleSwaps) {
        const color1 = targetRows[r1][c1], color2 = targetRows[r2][c2];
        for (let dr=0;dr<h;dr++) for (let dc=0;dc<w;dc++) {
          const included = (dr === 0 || dc > 0) && !(dr === h-1 && dc === 0 && h>1);
          if (!included) continue;
          scrambledRows[r1+dr][c1+dc] = color2;
          scrambledRows[r2+dr][c2+dc] = color1;
        }
      }
    }
    if (def.swaps) {
      for (const [[r1,c1],[r2,c2]] of def.swaps) {
        const color1 = targetRows[r1][c1], color2 = targetRows[r2][c2];
        for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
          scrambledRows[r1+dr][c1+dc] = color2;
          scrambledRows[r2+dr][c2+dc] = color1;
        }
      }
    }
    if (def.groupedSwaps) {
      const width = targetRows[0].length;
      for (const pair of def.groupedSwaps) {
        if (pair.length !== 20) throw new Error('Invalid grouped color swap');
        const first=pair.slice(0,10),second=pair.slice(10);
        const colorA=targetRows[Math.floor(first[0]/width)][first[0]%width];
        const colorB=targetRows[Math.floor(second[0]/width)][second[0]%width];
        for (const index of first) scrambledRows[Math.floor(index/width)][index%width]=colorB;
        for (const index of second) scrambledRows[Math.floor(index/width)][index%width]=colorA;
      }
    }
    if (def.groupedCycles) {
      const width = targetRows[0].length;
      for (const cycle of def.groupedCycles) {
        if (!Array.isArray(cycle) || cycle.length < 2) throw new Error('Invalid grouped cycle');
        const sizes = new Set(cycle.map(group => group.length));
        if (sizes.size !== 1) throw new Error('Grouped cycle sizes must match');
        for (let i = 0; i < cycle.length; i++) {
          const from = cycle[i], to = cycle[(i + 1) % cycle.length];
          const nextColor = targetRows[Math.floor(to[0] / width)][to[0] % width];
          for (const index of from) scrambledRows[Math.floor(index/width)][index%width] = nextColor;
        }
      }
    }
    const palette = def.palette || COLOR;
    if (def.fullScramble) {
      const groups = new Map();
      for (let r=0;r<targetRows.length;r++) for(let c=0;c<targetRows[r].length;c++) {
        const symbol=targetRows[r][c];
        if(symbol==='.')continue;
        if(!groups.has(symbol))groups.set(symbol,[]);
        groups.get(symbol).push([r,c]);
      }
      const positions=[...groups.values()].flat();
      const colors=[...groups.entries()].flatMap(([symbol,cells])=>Array(cells.length).fill(symbol));
      const offset=Math.max(...[...groups.values()].map(cells=>cells.length));
      // Offset by the largest color group. As it occupies at most half the
      // board, all destinations receive a different color and counts balance.
      if(offset*2>colors.length)throw new Error('Cannot derange: dominant color exceeds half');
      for(let i=0;i<positions.length;i++) {
        const [r,c]=positions[i];
        scrambledRows[r][c]=colors[(i+offset)%colors.length];
        if(scrambledRows[r][c]===targetRows[r][c])throw new Error('Unexpected matching color');
      }
    }
    const mapping = def.cycle ? Object.fromEntries(def.cycle.map((color, i) => [color, def.cycle[(i + 1) % def.cycle.length]])) : null;
    const targetBoard = targetRows.map(row => [...row].map(symbol => symbol === '.'
      ? { active: false, baseColor: null, beanColor: null }
      : { active: true, baseColor: palette[symbol], beanColor: palette[symbol] }));
    const initialBoard = scrambledRows.map((row, rowIndex) => [...row].map((beanSymbol, colIndex) => {
      const baseSymbol = targetRows[rowIndex][colIndex];
      if (baseSymbol === '.') return { active: false, baseColor: null, beanColor: null };
      const resolvedBean = mapping ? (mapping[baseSymbol] || baseSymbol) : beanSymbol;
      return { active: true, baseColor: palette[baseSymbol], beanColor: palette[resolvedBean] };
    }));
    return {
      id: def.id, name: def.name, difficulty: def.difficulty,
      width: targetRows[0].length, height: targetRows.length,
      targetBoard, initialBoard,
      testSolution: (def.groupedCycles ? def.groupedCycles.flatMap(cycle => { const width=targetRows[0].length; return [...cycle.map(group => group[0]), cycle[0][0]].map(index => [Math.floor(index/width), index%width]); }) : def.groupedSwaps ? def.groupedSwaps.flatMap(pair => { const width=targetRows[0].length; return [pair[0],pair[10],pair[0]].map(index=>[Math.floor(index/width),index%width]); }) : def.verifiedSolution ? [...def.verifiedSolution.matchAll(/../g)].map(([pair]) =>
        ['0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(pair[0]),
         '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(pair[1])]) :
        def.rectangleSwaps ? def.rectangleSwaps.flatMap(([r1,c1,r2,c2]) => [[r1,c1],[r2,c2],[r1,c1]]) : def.swaps ? def.swaps.flatMap(([a,b]) => [a,b,a]) : (def.testSolution || def.clickSequence || [])).map(p => p.slice())
    };
  }
  return { getLevel, listLevels: () => definitions.map(d => ({ id:d.id, name:d.name, difficulty:d.difficulty })) };
});
