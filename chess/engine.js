const ChessEngine = (() => {
  const order = ["r","n","b","q","k","b","n","r"];

  function initialBoard(){
    const board = Array.from({length:8},()=>Array(8).fill(null));
    for(let c=0;c<8;c++){
      board[0][c]={color:"b",type:order[c]};
      board[1][c]={color:"b",type:"p"};
      board[6][c]={color:"w",type:"p"};
      board[7][c]={color:"w",type:order[c]};
    }
    return board;
  }

  function cloneBoard(board){
    return JSON.parse(JSON.stringify(board));
  }

  return { initialBoard, cloneBoard };
})();
