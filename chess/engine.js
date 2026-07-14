const ChessEngine=(()=>{
  const order=["r","n","b","q","k","b","n","r"];
  const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;

  function initialBoard(){
    const b=Array.from({length:8},()=>Array(8).fill(null));
    for(let c=0;c<8;c++){
      b[0][c]={color:"b",type:order[c]};
      b[1][c]={color:"b",type:"p"};
      b[6][c]={color:"w",type:"p"};
      b[7][c]={color:"w",type:order[c]};
    }
    return b;
  }

  function clone(board){return JSON.parse(JSON.stringify(board))}

  function pseudoMoves(board,r,c){
    const p=board[r][c],moves=[];
    if(!p)return moves;
    const add=(rr,cc)=>{
      if(!inside(rr,cc))return;
      if(!board[rr][cc]||board[rr][cc].color!==p.color)moves.push({r:rr,c:cc});
    };

    if(p.type==="p"){
      const d=p.color==="w"?-1:1,start=p.color==="w"?6:1;
      if(inside(r+d,c)&&!board[r+d][c]){
        moves.push({r:r+d,c});
        if(r===start&&!board[r+2*d][c])moves.push({r:r+2*d,c});
      }
      for(const dc of [-1,1]){
        const rr=r+d,cc=c+dc;
        if(inside(rr,cc)&&board[rr][cc]&&board[rr][cc].color!==p.color)moves.push({r:rr,c:cc});
      }
    }

    if(p.type==="n"){
      for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);
    }

    if(["b","r","q"].includes(p.type)){
      const dirs=p.type==="b"?[[1,1],[1,-1],[-1,1],[-1,-1]]:
        p.type==="r"?[[1,0],[-1,0],[0,1],[0,-1]]:
        [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dr,dc] of dirs){
        let rr=r+dr,cc=c+dc;
        while(inside(rr,cc)){
          if(!board[rr][cc])moves.push({r:rr,c:cc});
          else{
            if(board[rr][cc].color!==p.color)moves.push({r:rr,c:cc});
            break;
          }
          rr+=dr;cc+=dc;
        }
      }
    }

    if(p.type==="k"){
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);
    }

    return moves;
  }

  function evaluate(board){
    const value={p:100,n:320,b:330,r:500,q:900,k:20000};
    let score=0;
    for(const row of board)for(const p of row)if(p)score+=(p.color==="b"?1:-1)*value[p.type];
    return score;
  }

  function allMoves(board,color){
    const result=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
      if(board[r][c]?.color===color){
        for(const m of pseudoMoves(board,r,c))result.push({fr:r,fc:c,...m});
      }
    }
    return result;
  }

  function apply(board,m){
    const b=clone(board);
    b[m.r][m.c]=b[m.fr][m.fc];
    b[m.fr][m.fc]=null;
    if(b[m.r][m.c].type==="p"&&(m.r===0||m.r===7))b[m.r][m.c].type="q";
    return b;
  }

  return {initialBoard,clone,pseudoMoves,allMoves,apply,evaluate};
})();
