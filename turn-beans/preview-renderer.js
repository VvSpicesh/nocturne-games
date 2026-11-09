/* Shared preview renderer: exact palette fills with very light relief only. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TurnBeansPreview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function drawBoard(canvas,board,{beads=true,cell=12}={}){
    canvas.width=board[0].length*cell;canvas.height=board.length*cell;
    const ctx=canvas.getContext('2d');
    ctx.globalAlpha=1;ctx.filter='none';ctx.shadowBlur=0;ctx.shadowColor='transparent';
    board.forEach((row,r)=>row.forEach((item,c)=>{
      if(!item.active)return;
      const x=c*cell,y=r*cell;
      // Never mix a wrong bean with its target backing color in these previews.
      ctx.fillStyle=item.beanColor;ctx.fillRect(x,y,cell,cell);
      if(!beads)return;
      ctx.beginPath();ctx.arc(x+cell/2,y+cell/2,cell*.44,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.lineWidth=.45;ctx.stroke();
      ctx.beginPath();ctx.arc(x+cell*.36,y+cell*.33,cell*.065,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.10)';ctx.fill();
    }));
  }
  return {drawBoard};
});
