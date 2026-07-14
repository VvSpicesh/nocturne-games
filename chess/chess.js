const PIECES={
  w:{k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙"},
  b:{k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"}
};

const ChessApp={
  board:ChessEngine.initialBoard(),
  turn:"w",
  selected:null,
  flipped:false,

  init(){
    document.getElementById("resetChess").onclick=()=>this.reset();
    document.getElementById("flipChess").onclick=()=>{this.flipped=!this.flipped;this.render()};
    this.render();
  },

  reset(){
    this.board=ChessEngine.initialBoard();
    this.turn="w";
    this.selected=null;
    this.render();
  },

  handleSquare(row,col){
    const piece=this.board[row][col];
    if(piece?.color===this.turn){
      this.selected={row,col};
      this.render();
    }
  },

  render(){
    const el=document.getElementById("chessBoard");
    el.innerHTML="";
    const rows=this.flipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
    const cols=this.flipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];

    for(const row of rows){
      for(const col of cols){
        const sq=document.createElement("div");
        sq.className=`square ${(row+col)%2?"dark":"light"}`;
        if(this.selected?.row===row&&this.selected?.col===col) sq.classList.add("selected");
        const piece=this.board[row][col];
        if(piece) sq.textContent=PIECES[piece.color][piece.type];
        sq.onclick=()=>this.handleSquare(row,col);
        el.appendChild(sq);
      }
    }

    document.getElementById("turnText").textContent=this.turn==="w"?"白方回合":"黑方回合";
  }
};

ChessApp.init();
