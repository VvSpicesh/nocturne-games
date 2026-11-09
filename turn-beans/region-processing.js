/* Region planning and pair-component quality. No game rules or pixel RNG. */
(function(root,factory){
  const api=factory(typeof module!=='undefined'&&module.exports?require('./image-processing.js'):root.TurnBeansImage,
    typeof module!=='undefined'&&module.exports?require('./color-processing.js'):root.TurnBeansColor);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TurnBeansRegions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(image,color){
  'use strict';
  const ALGORITHM='regions-v1',MAX_ATTEMPTS=6;
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  function segment(board,pairs=false){
    const height=board.length,width=board[0].length,flat=board.flat(),seen=new Uint8Array(flat.length),labels=new Int32Array(flat.length).fill(-1),regions=[];
    for(let start=0;start<flat.length;start++){
      if(!flat[start].active||seen[start])continue;
      const cell=flat[start],positions=[start],id=regions.length;seen[start]=1;
      for(let head=0;head<positions.length;head++)for(const next of image.neighbors(positions[head],width,height)){
        const other=flat[next];
        if(!seen[next]&&other.active&&other.baseColor===cell.baseColor&&(!pairs||other.beanColor===cell.beanColor)){
          seen[next]=1;positions.push(next);
        }
      }
      positions.forEach(index=>{labels[index]=id;});
      regions.push({id,baseColor:cell.baseColor,beanColor:cell.beanColor,size:positions.length,positions,contacts:{}});
    }
    flat.forEach((cell,index)=>{
      if(!cell.active)return;
      const r=labels[index];
      for(const next of image.neighbors(index,width,height)){
        const n=labels[next];if(n>=0&&n!==r)regions[r].contacts[n]=(regions[r].contacts[n]||0)+1;
      }
    });
    return {regions,labels,width,height};
  }
  function mergeSmall(segmentation,threshold=6){
    assert(Number.isInteger(threshold)&&threshold>=2,'无效小区域阈值');
    const {regions}=segmentation,parent=regions.map(r=>r.id),groups=new Map(regions.map(r=>[r.id,{id:r.id,size:r.size,members:[r.id],baseColor:r.baseColor}]));
    const root=id=>{while(parent[id]!==id){parent[id]=parent[parent[id]];id=parent[id];}return id;};
    let mergedSmallRegions=0;
    for(const small of regions.slice().sort((a,b)=>a.size-b.size||a.id-b.id)){
      const own=root(small.id);if(small.size>=threshold||groups.get(own).size>=threshold)continue;
      const candidates=new Map();
      for(const id of groups.get(own).members)for(const [neighbor,edge]of Object.entries(regions[id].contacts)){
        const other=root(Number(neighbor));if(other!==own)candidates.set(other,(candidates.get(other)||0)+edge);
      }
      const ranked=[...candidates].sort((a,b)=>b[1]-a[1]||
        color.deltaE(color.rgb(small.baseColor),color.rgb(groups.get(a[0]).baseColor))-
        color.deltaE(color.rgb(small.baseColor),color.rgb(groups.get(b[0]).baseColor))||
        groups.get(b[0]).size-groups.get(a[0]).size||a[0]-b[0]);
      if(!ranked.length)continue; // Never bridge an inactive gap.
      const other=ranked[0][0],destination=groups.get(other),source=groups.get(own);
      parent[own]=other;destination.members.push(...source.members);destination.size+=source.size;groups.delete(own);mergedSmallRegions++;
    }
    return {groups:[...groups.values()].sort((a,b)=>a.id-b.id),mergedSmallRegions,
      groupOf:regions.map(r=>root(r.id)),protectedRegions:regions.filter(r=>r.size<threshold).map(r=>r.id)};
  }
  function blockSize(segmentation,tier,attempt){
    const largest=new Map();
    for(const region of segmentation.regions)if(region.size>=tier.minRegionSize)
      largest.set(region.baseColor,Math.max(largest.get(region.baseColor)||0,region.size));
    const sizes=[...largest.values()].sort((a,b)=>b-a),arity=Math.min(tier.cycle,sizes.length);
    if(arity<2)return tier.minRegionSize;
    const basis=sizes[arity-1];
    const total=segmentation.regions.reduce((sum,r)=>sum+r.size,0);
    return Math.max(tier.minRegionSize,Math.floor(Math.min(tier.blockMax,total/tier.areaDivisor,basis/tier.regionDivisor)*
      (attempt>=4?.8:1)));
  }
  function tiles(region,size,width,height,orientation){
    const left=new Set(region.positions),units=[];
    const order=index=>{
      const r=Math.floor(index/width),c=index%width;
      return (orientation&2?height-1-r:r)*width+(orientation&1?width-1-c:c);
    };
    const ordered=region.positions.slice().sort((a,b)=>order(a)-order(b));
    for(const start of ordered){
      if(!left.has(start))continue;
      const positions=[],frontier=[start],seen=new Set(frontier);
      while(frontier.length&&positions.length<size){
        let first=0;
        for(let i=1;i<frontier.length;i++)if(order(frontier[i])<order(frontier[first]))first=i;
        const index=frontier.splice(first,1)[0];positions.push(index);
        for(const neighbor of image.neighbors(index,width,height))if(left.has(neighbor)&&!seen.has(neighbor)){
          seen.add(neighbor);frontier.push(neighbor);
        }
      }
      // A remainder is kept correct, never filled with scattered pixels.
      positions.forEach(index=>left.delete(index));
      if(positions.length===size)units.push({baseColor:region.baseColor,sourceRegion:region.id,positions,size});
    }
    return units;
  }
  function scramble(target,tier,attempt=0){
    const segmentation=segment(target.targetBoard),plan=mergeSmall(segmentation,tier.minRegionSize);
    const size=blockSize(segmentation,tier,attempt),pools=new Map(),assignments=[],cycles=[];
    const flat=target.targetBoard.flat(),initialBoard=target.targetBoard.map(row=>row.map(cell=>({...cell})));
    const groupSizes=new Map(plan.groups.map(g=>[g.id,g.size]));
    const sorted=segmentation.regions.slice().sort((a,b)=>
      groupSizes.get(plan.groupOf[b.id])-groupSizes.get(plan.groupOf[a.id])||b.size-a.size||a.id-b.id);
    for(const region of sorted){
      if(region.size<tier.minRegionSize)continue;
      const units=tiles(region,size,target.width,target.height,attempt%4);
      if(!pools.has(region.baseColor))pools.set(region.baseColor,[]);
      pools.get(region.baseColor).push(...units);
    }
    const active=flat.filter(cell=>cell.active).length,budget=Math.floor(active*tier.fraction);
    let changed=0;
    while(changed+size*2<=budget){
      const colors=[...pools.keys()].filter(c=>pools.get(c).length).sort((a,b)=>
        pools.get(b).length-pools.get(a).length||a.localeCompare(b));
      const arity=Math.min(tier.cycle,colors.length,Math.floor((budget-changed)/size));
      if(arity<2)break;
      let selected=colors.slice(0,arity);
      // Vary whole-region cycles, never individual cell positions.
      if((cycles.length+attempt)%2)selected=selected.slice().reverse();
      for(let i=0;i<selected.length;i++){
        const unit=pools.get(selected[i]).shift(),beanColor=selected[(i+1)%selected.length];
        for(const index of unit.positions)initialBoard[Math.floor(index/target.width)][index%target.width].beanColor=beanColor;
        assignments.push({...unit,beanColor});changed+=size;
      }
      cycles.push({colors:selected,size});
    }
    return {initialBoard,cycles,assignments,plan:{algorithm:ALGORITHM,baseRegionCount:segmentation.regions.length,
      planningRegionCount:plan.groups.length,mergedSmallRegions:plan.mergedSmallRegions,
      protectedSmallCells:segmentation.regions.filter(r=>r.size<tier.minRegionSize).reduce((sum,r)=>sum+r.size,0),
      blockSize:size,usedRegionCount:assignments.length}};
  }
  function metrics(target,board){
    const segmentation=segment(board,true),wrong=segmentation.regions.filter(r=>r.baseColor!==r.beanColor);
    const activeBeans=segmentation.regions.reduce((sum,r)=>sum+r.size,0),changedBeans=wrong.reduce((sum,r)=>sum+r.size,0);
    const sizes=wrong.map(r=>r.size),single=wrong.filter(r=>r.size===1).length,double=wrong.filter(r=>r.size===2).length;
    const small=wrong.filter(r=>r.size<6).reduce((sum,r)=>sum+r.size,0),pairs=new Map();
    for(const region of segmentation.regions){
      const key=region.baseColor+'|'+region.beanColor;
      if(!pairs.has(key))pairs.set(key,{baseColor:region.baseColor,beanColor:region.beanColor,wrong:region.baseColor!==region.beanColor,sizes:[]});
      pairs.get(key).sizes.push(region.size);
    }
    const histogram={'1':0,'2':0,'3-5':0,'6-11':0,'12-23':0,'24-47':0,'48+':0};
    for(const n of sizes)histogram[n===1?'1':n===2?'2':n<6?'3-5':n<12?'6-11':n<24?'12-23':n<48?'24-47':'48+']++;
    return {activeBeans,changedBeans,recolorRate:changedBeans/activeBeans,
      colorCount:new Set(board.flat().filter(c=>c.active).map(c=>c.beanColor)).size,
      componentCount:sizes.length,meanComponentSize:sizes.length?changedBeans/sizes.length:0,
      largestComponent:sizes.length?Math.max(...sizes):0,minimumWrongComponentSize:sizes.length?Math.min(...sizes):0,
      singletonComponentCount:single,doubletonComponentCount:double,
      singleDoubleComponentRatio:sizes.length?(single+double)/sizes.length:0,
      singleDoubleBeanRatio:changedBeans?(single+double*2)/changedBeans:0,
      smallComponentBeanRatio:changedBeans?small/changedBeans:0,wrongComponentSizeHistogram:histogram,
      pairComponentDistribution:[...pairs.values()].sort((a,b)=>a.baseColor.localeCompare(b.baseColor)||a.beanColor.localeCompare(b.beanColor))
        .map(pair=>({...pair,sizes:pair.sizes.sort((a,b)=>b-a)}))};
  }
  function quality(metrics,tier){
    const singleLimits={easy:.005,normal:.01,hard:.02},limit=singleLimits[tier.id],reasons=[];
    if(!metrics.changedBeans)reasons.push('无法生成足够大的错色区域，请简化碎色或编辑主体');
    if(metrics.singleDoubleBeanRatio>limit||metrics.singleDoubleComponentRatio>limit)
      reasons.push('单点/双点碎块比例超标');
    if(metrics.smallComponentBeanRatio>limit)reasons.push('小于6格的错色碎块比例超标');
    if(metrics.changedBeans&&metrics.meanComponentSize<tier.minRegionSize)reasons.push('平均错色连通块过小，存在噪声化');
    return {algorithm:ALGORITHM,passed:reasons.length===0,reasons,
      thresholds:{minimumMeanSize:tier.minRegionSize,maxSingleDoubleRatio:limit,maxSmallBeanRatio:limit}};
  }
  return {ALGORITHM,MAX_ATTEMPTS,segment,mergeSmall,tiles,scramble,metrics,quality};
});
