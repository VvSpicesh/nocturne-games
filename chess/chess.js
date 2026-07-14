const PIECES={
  w:{k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙"},
  b:{k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"}
};

const ChessApp={
  board:null,turn:"w",selected:null,legal:[],flipped:false,history:[],moves:[],
  mode:"local",difficulty:"normal",last:null,aiBusy:false,

  init(){
    this.board=ChessEngine.initialBoard();
    this.mode=localStorage.getItem("ng-chess-mode")||"local";
    this.difficulty=localStorage.getItem("ng-chess-difficulty")||"normal";
    document.getElementById("modeSelect").value=this.mode;
    document.getElementById("difficultySelect").value=this.difficulty;

    document.getElementById("modeSelect").onchange=e=>{
      this.mode=e.target.value;
      localStorage.setItem("ng-chess-mode",this.mode);
      if(this.mode==="ai"&&this.turn==="b")this.scheduleAi();
    };
    document.getElementById("difficultySelect").onchange=e=>{
      this.difficulty=e.target.value;
      localStorage.setItem("ng-chess-difficulty",this.difficulty);
    };
    document.getElementById("resetChess").onclick=()=>this.reset();
    document.getElementById("undoChess").onclick=()=>this.undo();
    document.getElementById("flipChess").onclick=()=>{this.flipped=!this.flipped;this.render()};
    this.render();
  },

  reset(){
    this.board=ChessEngine.initialBoard();this.turn="w";this.selected=null;this.legal=[];
    this.history=[];this.moves=[];this.last=null;this.aiBusy=false;this.render();
  },

  handleSquare(r,c){
    if(this.aiBusy||(this.mode==="ai"&&this.turn==="b"))return;
    const piece=this.board[r][c];

    if(this.selected){
      const move=this.legal.find(m=>m.r===r&&m.c===c);
      if(move){this.makeMove(this.selected.r,this.selected.c,move);return}
      if(piece?.color===this.turn){
        this.selected={r,c};this.legal=ChessEngine.pseudoMoves(this.board,r,c);this.render();return;
      }
      this.selected=null;this.legal=[];this.render();return;
    }

    if(piece?.color===this.turn){
      this.selected={r,c};this.legal=ChessEngine.pseudoMoves(this.board,r,c);this.render();
    }
  },

  makeMove(fr,fc,m){
    this.history.push({board:ChessEngine.clone(this.board),turn:this.turn,last:this.last,moves:[...this.moves]});
    const captured=this.board[m.r][m.c];
    const piece=this.board[fr][fc];
    this.board[m.r][m.c]=piece;this.board[fr][fc]=null;
    if(piece.type==="p"&&(m.r===0||m.r===7))piece.type="q";
    this.moves.push(`${PIECES[piece.color][piece.type]} ${String.fromCharCode(97+fc)}${8-fr}→${String.fromCharCode(97+m.c)}${8-m.r}${captured?" ×":""}`);
    this.last={fr,fc,tr:m.r,tc:m.c};
    this.turn=this.turn==="w"?"b":"w";this.selected=null;this.legal=[];this.render();
    if(this.mode==="ai"&&this.turn==="b")this.scheduleAi();
  },

  undo(){
    if(!this.history.length)return;
    let prev=this.history.pop();
    this.board=prev.board;this.turn=prev.turn;this.last=prev.last;this.moves=prev.moves;
    if(this.mode==="ai"&&this.turn==="b"&&this.history.length){
      prev=this.history.pop();
      this.board=prev.board;this.turn=prev.turn;this.last=prev.last;this.moves=prev.moves;
    }
    this.selected=null;this.legal=[];this.render();
  },

  scheduleAi(){
    if(this.aiBusy)return;
    this.aiBusy=true;
    document.getElementById("statusText").textContent="电脑正在思考…";
    setTimeout(()=>{this.aiMove();this.aiBusy=false},450);
  },

  aiMove(){
    const moves=ChessEngine.allMoves(this.board,"b");
    if(!moves.length)return;
    let chosen;

    if(this.difficulty==="easy"){
      chosen=moves[Math.floor(Math.random()*moves.length)];
    }else{
      const ranked=moves.map(m=>{
        const target=this.board[m.r][m.c];
        let score=target?ChessEngine.evaluate(this.board)-ChessEngine.evaluate(ChessEngine.apply(this.board,m)):0;
        score+=Math.random()*20;
        return {m,score};
      }).sort((a,b)=>b.score-a.score);

      if(this.difficulty==="hard"){
        chosen=ranked[0].m;
      }else{
        chosen=ranked[Math.floor(Math.random()*Math.min(4,ranked.length))].m;
      }
    }

    this.makeMove(chosen.fr,chosen.fc,chosen);
  },

  render(){
    const el=document.getElementById("chessBoard");el.innerHTML="";
    const rows=this.flipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
    const cols=this.flipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];

    for(const r of rows)for(const c of cols){
      const sq=document.createElement("div");
      sq.className=`square ${(r+c)%2?"dark":"light"}`;
      if(this.selected?.r===r&&this.selected?.c===c)sq.classList.add("selected");
      if(this.last&&((this.last.fr===r&&this.last.fc===c)||(this.last.tr===r&&this.last.tc===c)))sq.classList.add("last");
      const legal=this.legal.find(m=>m.r===r&&m.c===c);
      if(legal)sq.classList.add(this.board[r][c]?"capture":"move");

      const p=this.board[r][c];
      if(p){
        const pe=document.createElement("span");
        pe.className=`piece ${p.color==="w"?"white":"black"} ${p.color==="b"?"face-black":""}`;
        pe.textContent=PIECES[p.color][p.type];
        sq.appendChild(pe);
      }
      sq.onclick=()=>this.handleSquare(r,c);
      el.appendChild(sq);
    }

    document.getElementById("turnText").textContent=this.turn==="w"?"白方回合":"黑方回合";
    document.getElementById("statusText").textContent=this.aiBusy?"电脑正在思考…":"点击棋子开始走棋。";
    document.getElementById("moveList").innerHTML=this.moves.length?this.moves.map((m,i)=>`<div>${i+1}. ${m}</div>`).join(""):"暂无棋谱";
  }
};

ChessApp.init();
