/* Conservative regular-bead recognition. No AI/API and no saturation enhancement. */
(function(root,factory){
  const api=factory(typeof module!=='undefined'&&module.exports?require('./color-processing.js'):root.TurnBeansColor,
    typeof module!=='undefined'&&module.exports?require('./subject-extraction.js'):root.TurnBeansSubject);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TurnBeansGrid=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(color,subject){
  'use strict';
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const median=list=>{const values=list.slice().sort((a,b)=>a-b);return values.length?values[Math.floor(values.length/2)]:0;};
  const at=(source,x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=source.width||y>=source.height)return null;
    const i=(y*source.width+x)*4;return source.data[i+3]<64?null:[source.data[i],source.data[i+1],source.data[i+2]];};
  const inside=(mask,w,h,x,y)=>{x=Math.round(x);y=Math.round(y);return x>=0&&y>=0&&x<w&&y<h?mask[y*w+x]:0;};
  function validateSource(source){
    assert(source&&Number.isInteger(source.width)&&Number.isInteger(source.height)&&source.width>=16&&source.height>=16&&
      source.width<=1600&&source.height<=1600&&source.width*source.height<=1600000&&source.data?.length===source.width*source.height*4,'豆阵分析像素无效或过大');
  }
  function centerSample(source,x,y,px,py){
    const points=[],rx=px*.27,ry=py*.27;
    for(let r=Math.floor(y-ry);r<=Math.ceil(y+ry);r++)for(let c=Math.floor(x-rx);c<=Math.ceil(x+rx);c++){
      const radius=((c-x)/rx)**2+((r-y)/ry)**2;
      if(radius>1||radius<.12)continue; // ignore a tiny center hole as well as the outside rim
      const value=at(source,c,r);if(value)points.push(value);
    }
    if(!points.length)return null;
    const chromatic=points.filter(value=>color.hsl(value).chroma>.09);
    let usable=points;
    if(chromatic.length>=points.length*.4){
      const brightness=median(chromatic.map(value=>color.hsl(value).v));
      usable=chromatic.filter(value=>color.hsl(value).v>=brightness*.55);
    }
    const bins=new Map();
    for(const value of usable){const key=value.map(v=>v>>4).join(',');if(!bins.has(key))bins.set(key,[]);bins.get(key).push(value);}
    const group=[...bins.values()].sort((a,b)=>b.length-a.length)[0];
    const labMean=[0,1,2].map(k=>group.reduce((sum,value)=>sum+color.lab(value)[k],0)/group.length);
    const representative=group.slice().sort((a,b)=>color.lab(a).reduce((sum,n,k)=>sum+(n-labMean[k])**2,0)-
      color.lab(b).reduce((sum,n,k)=>sum+(n-labMean[k])**2,0))[0];
    const spread=median(usable.map(value=>color.deltaE(value,representative)));
    return {rgb:representative,spread,support:group.length/Math.max(1,usable.length)};
  }
  function signals(source,region={x:0,y:0,width:source.width,height:source.height}){
    const x=new Float64Array(region.width),y=new Float64Array(region.height),{data,width}=source;
    for(let r=1;r<region.height;r++)for(let c=1;c<region.width;c++){
      const i=((r+region.y)*width+c+region.x)*4,left=i-4,up=i-width*4;
      const dx=Math.abs(data[i]-data[left])+Math.abs(data[i+1]-data[left+1])+Math.abs(data[i+2]-data[left+2]);
      const dy=Math.abs(data[i]-data[up])+Math.abs(data[i+1]-data[up+1])+Math.abs(data[i+2]-data[up+2]);
      x[c]+=Math.min(dx,180);y[r]+=Math.min(dy,180);
    }
    return {x,y};
  }
  function periods(signal){
    const mean=signal.reduce((s,n)=>s+n,0)/signal.length,values=Array.from(signal,n=>n-mean),scores=[];
    const max=Math.min(96,Math.floor(signal.length/5));
    for(let lag=6;lag<=max;lag++){
      let sum=0,a=0,b=0;
      for(let i=lag;i<values.length;i++){sum+=values[i]*values[i-lag];a+=values[i]**2;b+=values[i-lag]**2;}
      scores[lag]=a&&b?sum/Math.sqrt(a*b):0;
    }
    const peaks=scores.map((score,lag)=>({lag,score})).filter(value=>value.score>=.24&&
      value.score>=(scores[value.lag-1]??-1)&&value.score>=(scores[value.lag+1]??-1)).sort((a,b)=>b.score-a.score).slice(0,6);
    function refine(lag){
      let sum=0,weight=0;
      for(let k=1;k*lag<=max;k++){
        let peak=k*lag;
        for(let p=Math.max(6,k*lag-2);p<=Math.min(max,k*lag+2);p++)if(scores[p]>scores[peak])peak=p;
        if(scores[peak]<.2)continue;
        const a=scores[peak-1]??scores[peak],b=scores[peak],c=scores[peak+1]??scores[peak],den=a-2*b+c;
        const shift=den?Math.max(-.45,Math.min(.45,.5*(a-c)/den)):0,w=k*k*b;
        sum+=(peak+shift)/k*w;weight+=w;
      }
      const estimate=weight?sum/weight:lag;let best=estimate,power=-Infinity;
      for(let step=estimate-.2;step<=estimate+.2;step+=.02){
        const bins=Math.max(8,Math.round(step*2)),fold=new Float64Array(bins),count=new Float64Array(bins);
        signal.forEach((value,i)=>{const q=(i/step%1)*bins,l=Math.floor(q),f=q-l;
          fold[l]+=value*(1-f);count[l]+=1-f;fold[(l+1)%bins]+=value*f;count[(l+1)%bins]+=f;});
        const value=fold.reduce((s,n,i)=>s+(count[i]?n*n/count[i]:0),0);
        if(value>power){power=value;best=step;}
      }
      return best;
    }
    return peaks.map(value=>({step:refine(value.lag),score:value.score}));
  }
  function phase(signal,step){
    const bins=Math.max(8,Math.round(step*8)),fold=new Float64Array(bins),count=new Float64Array(bins);
    signal.forEach((value,i)=>{const q=(i/step%1)*bins,l=Math.floor(q),f=q-l;
      fold[l]+=value*(1-f);count[l]+=1-f;fold[(l+1)%bins]+=value*f;count[(l+1)%bins]+=f;});
    fold.forEach((v,i)=>{fold[i]=count[i]?v/count[i]:0;});
    const f=value=>{const q=(((value/step)%1)+1)%1*bins,l=Math.floor(q),part=q-l;return fold[l]*(1-part)+fold[(l+1)%bins]*part;};
    let best=0,score=-Infinity;
    for(let p=0;p<step;p+=.125){const value=(f(p-step*.36)+f(p+step*.36))/2-f(p)*.35-f(p+step*.5)*.2;
      if(value>score){score=value;best=p;}}
    return best;
  }
  function componentGrids(mask,width,height,allGroups){
    const groups=(allGroups||subject.components(mask,width,height)).filter(group=>group.area>=12&&group.box.width>=4&&
      group.box.width<=96&&group.box.height>=4&&group.box.height<=96&&group.box.width/group.box.height>.72&&
      group.box.width/group.box.height<1.4&&group.area/(group.box.width*group.box.height)>.35);
    if(groups.length<16)return [];
    const size=median(groups.map(group=>(group.box.width+group.box.height)/2));
    const beads=groups.filter(group=>Math.abs((group.box.width+group.box.height)/2-size)<size*.25).map(group=>({
      x:group.positions.reduce((s,i)=>s+i%width,0)/group.area,y:group.positions.reduce((s,i)=>s+Math.floor(i/width),0)/group.area}));
    if(beads.length<16)return [];
    const dx=[],dy=[];
    for(const a of beads)for(const b of beads){
      const x=b.x-a.x,y=b.y-a.y;
      if(x>size*.9&&x<size*1.8&&Math.abs(y)<size*.2)dx.push(x);
      if(y>size*.9&&y<size*1.8&&Math.abs(x)<size*.2)dy.push(y);
    }
    if(dx.length<8||dy.length<8)return [];
    const px=median(dx),py=median(dy);
    const circularPhase=(values,step)=>{
      const angles=values.map(v=>v/step*Math.PI*2);
      return ((Math.atan2(angles.reduce((s,a)=>s+Math.sin(a),0),angles.reduce((s,a)=>s+Math.cos(a),0))/(Math.PI*2)*step)%step+step)%step;
    };
    return [{px,py,ox:circularPhase(beads.map(b=>b.x),px),oy:circularPhase(beads.map(b=>b.y),py),periodicity:.98,method:'component-centers'}];
  }
  function cellGroups(cells,cols,rows){
    const mask=Uint8Array.from(cells,cell=>cell.active?1:0);
    return subject.components(mask,cols,rows);
  }
  function evaluate(source,mask,candidate){
    const {px,py,ox,oy}=candidate,region=candidate.region||{x:0,y:0,width:source.width,height:source.height};
    const cols=Math.floor((region.x+region.width-1-ox)/px)+1,rows=Math.floor((region.y+region.height-1-oy)/py)+1;
    if(cols<5||rows<5||cols*rows>20000)return null;
    const cells=[];let geometric=0,stable=0,texture=0;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const x=ox+c*px,y=oy+r*py,inner=[],corners=[],rim=[];
      for(let k=0;k<8;k++){
        const angle=k*Math.PI/4;
        inner.push(inside(mask,source.width,source.height,x+Math.cos(angle)*px*.23,y+Math.sin(angle)*py*.23));
        const value=at(source,x+Math.cos(angle)*px*.39,y+Math.sin(angle)*py*.39);if(value)rim.push(value);
      }
      for(const dr of [-.43,.43])for(const dc of [-.43,.43])corners.push(inside(mask,source.width,source.height,x+dc*px,y+dr*py));
      const coverage=inner.reduce((s,n)=>s+n,0)/8,corner= corners.reduce((s,n)=>s+n,0)/4;
      const sample=coverage>=.5?centerSample(source,x,y,px,py):null;
      const active=!!sample&&coverage>=.625;
      const circular=active&&coverage-corner>=.35;
      const rimDifference=sample&&rim.length?median(rim.map(value=>color.deltaE(value,sample.rgb))):0;
      const textured=active&&rimDifference>=3&&rimDifference<=38;
      if(active){if(circular)geometric++;if(sample.spread<=12)stable++;if(textured)texture++;}
      cells.push({active,rgb:sample?.rgb||null,spread:sample?.spread||0,review:active&&(sample.spread>10||coverage<.875),circular,textured});
    }
    const active=cells.filter(cell=>cell.active).length;
    if(active<16)return null;
    const groups=cellGroups(cells,cols,rows),main=groups[0],share=main?.area/active||0;
    const circleRatio=geometric/active,textureRatio=texture/active,stableRatio=stable/active;
    const shape=Math.max(circleRatio,textureRatio*.9);
    const confidence=Math.min(1,candidate.periodicity*.27+Math.min(1,share/.8)*.23+stableRatio*.25+shape*.25);
    if(share<.55||shape<.3||stableRatio<.65||confidence<.8)return null;
    const selected=new Set(main.positions);
    cells.forEach((cell,i)=>{if(!selected.has(i))cell.active=false;});
    return {...candidate,cols,rows,cells,confidence,active:main.area,shape,stableRatio,
      score:main.area*confidence,removedCells:active-main.area,subjectComponents:groups.length,method:candidate.method};
  }
  function detect(source){
    validateSource(source);
    let model,mask;
    try{model=subject.estimateBackground(source);mask=subject.backgroundMask(source,model);}
    catch(error){return {reliable:false,reason:'不能分离背景：'+error.message,confidence:0};}
    const groups=subject.components(mask,source.width,source.height),candidates=componentGrids(mask,source.width,source.height,groups);
    const regions=[{x:0,y:0,width:source.width,height:source.height}];
    if(groups[0]?.area>source.width*source.height*.05&&groups[0].box.width>=40&&groups[0].box.height>=40)regions.unshift(groups[0].box);
    for(const region of regions){
      const signal=signals(source,region),xs=periods(signal.x),ys=periods(signal.y);
      for(const x of xs)for(const y of ys){
        if(Math.abs(x.step-y.step)>Math.max(x.step,y.step)*.15)continue;
        candidates.push({px:x.step,py:y.step,ox:region.x+phase(signal.x,x.step),oy:region.y+phase(signal.y,y.step),region,
          periodicity:(x.score+y.score)/2,method:'periodic-texture'});
      }
    }
    const evaluated=candidates.map(candidate=>evaluate(source,mask,candidate)).filter(Boolean).sort((a,b)=>b.score-a.score);
    const best=evaluated[0];
    if(!best)return {reliable:false,confidence:0,reason:'没有找到足够稳定的豆阵间距、中心与纹理，请调整裁剪或改用普通图片'};
    return {reliable:true,...best,background:model};
  }
  function classify(source){
    validateSource(source);
    const grid=detect(source);
    if(grid.reliable)return {type:'beads',confidence:grid.confidence,grid,reason:'规则位置、中心颜色及圆形/纹理证据一致'};
    const histogram=new Map(),total=Math.ceil(source.width*source.height/8);
    for(let i=0;i<source.width*source.height;i+=8){
      const key=[source.data[i*4],source.data[i*4+1],source.data[i*4+2]].map(v=>v>>4).join(',');
      histogram.set(key,(histogram.get(key)||0)+1);
    }
    const coverage=[...histogram.values()].sort((a,b)=>b-a).slice(0,16).reduce((s,n)=>s+n,0)/total;
    return {type:coverage>.6?'illustration':coverage<.35?'photo':'uncertain',
      confidence:coverage>.6?.7:coverage<.35?.65:.4,grid:null,reason:grid.reason};
  }
  function cluster(samples,tolerance=6){
    assert(Number.isFinite(tolerance)&&tolerance>=1&&tolerance<=12,'中心色聚类容差须为 1–12');
    const groups=[];
    const histogram=new Map();
    samples.forEach(value=>{const key=color.hex(value);const item=histogram.get(key)||{rgb:value,count:0};item.count++;histogram.set(key,item);});
    for(const item of [...histogram.values()].sort((a,b)=>b.count-a.count)){
      let best=null,distance=Infinity;
      for(const group of groups){const d=color.deltaE(item.rgb,group.rgb);if(d<distance){distance=d;best=group;}}
      if(best&&distance<=tolerance)best.count+=item.count;
      else groups.push({rgb:item.rgb,count:item.count});
    }
    assert(groups.length<=color.MAX_COLORS,'中心色不稳定或过多，可能混入高光/纹理；请调整裁剪或中心聚类容差后重试');
    return groups.map(group=>color.hex(group.rgb));
  }
  function restore(source,options={}){
    const detection=options.detection||detect(source);
    assert(detection.reliable,'拼豆识别失败：'+detection.reason);
    const {cells,cols,rows}=detection,positions=cells.map((cell,i)=>cell.active?i:-1).filter(i=>i>=0);
    const left=Math.min(...positions.map(i=>i%cols)),right=Math.max(...positions.map(i=>i%cols));
    const top=Math.min(...positions.map(i=>Math.floor(i/cols))),bottom=Math.max(...positions.map(i=>Math.floor(i/cols)));
    const nativeWidth=right-left+1,nativeHeight=bottom-top+1;
    const width=options.width||Math.max(8,nativeWidth),height=options.height||Math.max(8,nativeHeight);
    assert(width>=nativeWidth&&height>=nativeHeight,'原豆阵为 '+nativeWidth+'×'+nativeHeight+'，当前画布放不下；请选择按原豆阵或更大尺寸，禁止缩并豆子');
    assert(width<=80&&height<=80&&width*height<=4096,'原豆阵过大，请缩小裁剪范围');
    const samples=positions.map(i=>cells[i].rgb),palette=cluster(samples,options.centerTolerance??6),paletteRGB=palette.map(color.rgb);
    const offsetX=Math.floor((width-nativeWidth)/2),offsetY=Math.floor((height-nativeHeight)/2),sourceColors=[];
    const board=Array.from({length:height},()=>Array.from({length:width},()=>({active:false,baseColor:null,beanColor:null})));
    const reviewCells=[];
    positions.forEach(i=>{
      const r=Math.floor(i/cols)-top+offsetY,c=i%cols-left+offsetX,entry=cells[i];
      const mapped=palette[color.nearest(entry.rgb,paletteRGB)];
      board[r][c]={active:true,baseColor:mapped,beanColor:mapped};sourceColors.push({row:r,col:c,color:color.hex(entry.rgb)});
      if(entry.review)reviewCells.push({row:r,col:c,reason:'中心颜色或边界需要检查'});
    });
    const used=palette.filter(value=>board.some(row=>row.some(cell=>cell.beanColor===value)));
    const target={width,height,palette:used,targetBoard:board,locked:true,sourcePalette:used.slice(),beadSourceColors:sourceColors,
      colorOptions:{colorMode:'original',saturationBoost:0,contrastBoost:0},
      colorStrategy:'preserve',
      subject:{mode:'bead-grid',outputActiveCells:positions.length,keptComponents:1,removedComponents:Math.max(0,(detection.subjectComponents||1)-1),removedCells:detection.removedCells||0,
        sourceWidth:source.width,sourceHeight:source.height,boundingBox:{x:left,y:top,width:nativeWidth,height:nativeHeight}},
      beadGrid:{columns:nativeWidth,rows:nativeHeight,pitchX:detection.px,pitchY:detection.py,offsetX:detection.ox,offsetY:detection.oy,
        confidence:detection.confidence,method:detection.method,startCol:left,startRow:top,paddingX:offsetX,paddingY:offsetY,reviewCells},
      imageRecognition:{type:'beads',mode:'bead-lock',confidence:detection.confidence,reason:'原豆阵中心采样；未进行饱和度或亮度增强'}};
    return refresh(target);
  }
  function refresh(target){
    target.subjectMask=[];target.subjectPixels=[];
    target.targetBoard.forEach(row=>row.forEach(cell=>{
      target.subjectMask.push(cell.active?1:0);target.subjectPixels.push(...(cell.active?[...color.rgb(cell.beanColor),255]:[0,0,0,0]));
    }));
    const refs=target.beadSourceColors.map(item=>color.rgb(item.color));
    const output=target.beadSourceColors.map(item=>target.targetBoard[item.row][item.col].beanColor);
    target.paletteStatus=color.paletteStatus(target.palette.length);
    target.recognitionReady=true;
    target.imageRecognition.colorBudgetReady=target.recognitionReady;
    target.colorQuality=color.report(refs,refs,output,target.palette,target.colorOptions);
    target.colorQuality.reference='detected-bead-centers';
    target.subject.outputActiveCells=target.subjectMask.reduce((s,n)=>s+n,0);
    return target;
  }
  function edit(target,{paletteChanges={},cellChanges=[]}={}){
    assert(target.locked,'只有锁定的豆阵可以手动修正');
    const edited=JSON.parse(JSON.stringify(target));
    for(const [original,replacement]of Object.entries(paletteChanges))assert(edited.palette.includes(original)&&/^#[A-Fa-f0-9]{6}$/.test(replacement),'无效调色板修正');
    for(const row of edited.targetBoard)for(const cell of row)if(cell.active&&paletteChanges[cell.beanColor]){
      cell.beanColor=paletteChanges[cell.beanColor].toUpperCase();cell.baseColor=cell.beanColor;
    }
    for(const {row,col,color:replacement}of cellChanges){
      assert(Number.isInteger(row)&&Number.isInteger(col)&&edited.targetBoard[row]?.[col]?.active&&/^#[A-Fa-f0-9]{6}$/.test(replacement),'只能修改有效豆子颜色');
      edited.targetBoard[row][col].beanColor=replacement.toUpperCase();edited.targetBoard[row][col].baseColor=replacement.toUpperCase();
    }
    edited.palette=[...new Set(edited.targetBoard.flat().filter(cell=>cell.active).map(cell=>cell.beanColor))];
    assert(edited.palette.length<=color.MAX_COLORS,'修正后超过候选色上限，请先合并调色板');
    edited.beadGrid.reviewCells=edited.beadGrid.reviewCells.filter(item=>!cellChanges.some(cell=>cell.row===item.row&&cell.col===item.col));
    edited.colorStrategy='manual';
    edited.manualCorrectionCount=(edited.manualCorrectionCount||0)+Object.keys(paletteChanges).length+cellChanges.length;
    return refresh(edited);
  }
  function merge(target,limit=color.RECOMMENDED_COLORS){
    const counts={};
    target.targetBoard.flat().filter(cell=>cell.active).forEach(cell=>{counts[cell.beanColor]=(counts[cell.beanColor]||0)+1;});
    const result=color.mergeFamilies(target.palette,counts,limit),edited=edit(target,{paletteChanges:result.mapping});
    edited.colorStrategy='family-16';edited.colorMerge={fromColors:result.fromColors,toColors:result.toColors};
    return edited;
  }
  return {detect,classify,centerSample,cluster,restore,edit,merge};
});
