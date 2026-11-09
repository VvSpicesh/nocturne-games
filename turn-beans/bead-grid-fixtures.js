'use strict';
const COLORS=[[255,205,35],[240,65,135],[45,145,225],[145,65,215]];
function scene({columns=8,rows=8,pitch=18,holes=[],noise=true,centerHoles=true,palette=COLORS,blockSize=1}={}){
  const width=columns*pitch+32,height=rows*pitch+32,data=new Uint8ClampedArray(width*height*4),expected=[];
  const missing=new Set(holes.map(([r,c])=>r+','+c));
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)if(!missing.has(r+','+c))expected.push({r,c,x:25+c*pitch,y:25+r*pitch,rgb:palette[(Math.floor(r/blockSize)*Math.ceil(columns/blockSize)+Math.floor(c/blockSize))%palette.length]});
  const byPosition=new Map(expected.map(bead=>[bead.r+','+bead.c,bead]));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let value=[253,245,249];
    const bead=byPosition.get(Math.round((y-25)/pitch)+','+Math.round((x-25)/pitch));
    if(bead){
      const dx=x-bead.x,dy=y-bead.y,radius=Math.hypot(dx,dy);
      if(radius<pitch*.4){
        value=bead.rgb;
        if(radius>pitch*.34)value=[55,45,50];
        if(Math.hypot(dx+2,dy+2)<1.3)value=[255,255,255];
        if(centerHoles&&radius<1)value=[20,20,20];
      }
    }
    if(noise&&x>=2&&x<=5&&y>=4&&y<=6)value=[15,230,100];
    data.set([...value,255],(y*width+x)*4);
  }
  return {source:{width,height,data},expected,columns,rows,pitch};
}

module.exports={COLORS,scene};
