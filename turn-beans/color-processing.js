/* Foreground-only, source-backed palette selection and restrained color enhancement. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TurnBeansColor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MODES=['original','balanced','soft'];
  const DEFAULTS=Object.freeze({colorMode:'original',saturationBoost:8,contrastBoost:4});
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
  const hex=rgb=>'#'+rgb.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase();
  const rgb=value=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  function hsl(color){
    const [r,g,b]=color.map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,l=(max+min)/2;
    let h=0;
    if(delta)h=60*(max===r?((g-b)/delta+6)%6:max===g?(b-r)/delta+2:(r-g)/delta+4);
    return {h,s:delta?delta/(1-Math.abs(2*l-1)):0,l,v:max,chroma:delta};
  }
  function fromHSL({h,s,l}){
    const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
    const parts=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return parts.map(v=>Math.round(clamp(v+m)*255));
  }
  function lab(color){
    const [r,g,b]=color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
    const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;
    const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047);
    const y=f(.2126729*r+.7151522*g+.0721750*b);
    const z=f((.0193339*r+.1191920*g+.9503041*b)/1.08883);
    return [116*y-16,500*(x-y),200*(y-z)];
  }
  const squared=(a,b)=>a.reduce((sum,n,i)=>sum+(n-b[i])**2,0);
  const deltaE=(a,b)=>Math.sqrt(squared(lab(a),lab(b)));
  function family(color){
    const {h,v,chroma,s}=hsl(color);
    // Neutral ramps remain neutral; hue is meaningless near the gray axis.
    if(chroma<.065||s<.12){
      return v<.14?'black':v<.38?'dark-gray':v<.8?'light-gray':'white';
    }
    if(h<15||h>=345)return 'red';
    if(h<45)return 'orange';
    if(h<80)return 'yellow';
    if(h<165)return 'green';
    if(h<210)return 'cyan';
    if(h<255)return 'blue';
    if(h<300)return 'purple';
    return 'pink';
  }
  function settings(options={}){
    const result={...DEFAULTS,...Object.fromEntries(Object.entries(options).filter(([k,v])=>Object.hasOwn(DEFAULTS,k)&&v!==undefined))};
    assert(MODES.includes(result.colorMode),'未知颜色模式');
    assert(Number.isFinite(result.saturationBoost)&&result.saturationBoost>=0&&result.saturationBoost<=40,'饱和度增强超出范围');
    assert(Number.isFinite(result.contrastBoost)&&result.contrastBoost>=0&&result.contrastBoost<=25,'对比度增强超出范围');
    return result;
  }
  function enhance(color,options={}){
    const config=settings(options),value=hsl(color),neutral=['black','dark-gray','light-gray','white'].includes(family(color));
    const satMode={original:1,balanced:.98,soft:.88}[config.colorMode];
    const contrastMode={original:1,balanced:.8,soft:.45}[config.colorMode];
    if(!neutral)value.s=clamp(value.s*satMode*(1+config.saturationBoost/100));
    // Endpoints and outlines stay stable. Do not add a hue to source grays.
    value.l=clamp(value.l+(config.contrastBoost/100)*contrastMode*(neutral?.35:1)*(value.l-.5)*Math.sin(Math.PI*value.l));
    if(!neutral&&value.l>.06&&value.l<.24)value.l+=(.24-value.l)*(config.colorMode==='soft'?.15:.1);
    if(config.colorMode==='soft'&&!neutral)value.l+=.012*(1-value.l);
    return fromHSL(value);
  }
  function histogram(samples){
    const bins=new Map();
    for(const color of samples){
      const key=color.map(v=>v>>3).join(',');
      let bin=bins.get(key);if(!bin){bin={count:0,colors:new Map()};bins.set(key,bin);}
      const exact=color.join(',');bin.count++;bin.colors.set(exact,(bin.colors.get(exact)||0)+1);
    }
    return [...bins.values()].map(bin=>{
      // Pick an actually observed color, never the RGB average of distant hues.
      const best=[...bin.colors].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0][0].split(',').map(Number);
      return {rgb:best,count:bin.count,lab:lab(best),family:family(best),hsl:hsl(best)};
    });
  }
  function quantize(samples,maxColors,options={}){
    const config=settings(options);
    assert(Number.isInteger(maxColors)&&maxColors>=2&&maxColors<=16,'调色板须为 2–16 色');
    assert(samples.length>0,'没有主体颜色');
    const entries=histogram(samples),groups=new Map(),minimum=Math.max(2,samples.length*.002);
    for(const entry of entries){if(!groups.has(entry.family))groups.set(entry.family,[]);groups.get(entry.family).push(entry);}
    const representative=group=>group.slice().sort((a,b)=>{
      const score=e=>e.count**.7*(.75+e.hsl.s*.5)*(.85+e.hsl.v*.15);
      return score(b)-score(a);
    })[0];
    const families=[...groups].map(([name,group])=>({name,group,count:group.reduce((s,e)=>s+e.count,0)}))
      .filter(group=>group.count>=minimum)
      .sort((a,b)=>{
        const score=e=>e.count*(e.name==='black'?1.5:e.name==='white'?1.15:1);
        return score(b)-score(a);
      });
    const chosen=[];
    for(const group of families.slice(0,maxColors))chosen.push(representative(group.group));
    if(!chosen.length)chosen.push(entries.slice().sort((a,b)=>b.count-a.count)[0]);
    while(chosen.length<maxColors&&chosen.length<entries.length){
      let best=null,bestScore=-1;
      for(const entry of entries){
        const d=Math.min(...chosen.map(seed=>squared(entry.lab,seed.lab)));
        if(d<9)continue;
        const score=d*Math.sqrt(entry.count)*(.8+entry.hsl.s*.35);
        if(score>bestScore){best=entry;bestScore=score;}
      }
      if(!best)break;chosen.push(best);
    }
    // Refine representatives toward occupied source clusters, while keeping
    // protected hue/neutral anchors and avoiding a drift into darker shadows.
    const initialSeeds=chosen.slice(),protectedCount=Math.min(families.length,maxColors);
    for(let iteration=0;iteration<2;iteration++){
      const clusters=chosen.map(()=>[]);
      for(const entry of entries){
        let best=0,bestDistance=Infinity;
        chosen.forEach((seed,index)=>{
          const d=squared(entry.lab,seed.lab)+(entry.family===seed.family?0:16);
          if(d<bestDistance){bestDistance=d;best=index;}
        });
        clusters[best].push(entry);
      }
      chosen.forEach((seed,index)=>{
        const cluster=clusters[index];if(!cluster.length)return;
        const count=cluster.reduce((sum,entry)=>sum+entry.count,0);
        const center=[0,1,2].map(axis=>cluster.reduce((sum,entry)=>sum+entry.lab[axis]*entry.count,0)/count);
        const candidates=cluster.filter(entry=>(index>=protectedCount||entry.family===seed.family)&&
          (seed.hsl.s<.3||entry.hsl.s>=seed.hsl.s*.85)&&(seed.hsl.v<.6||entry.hsl.v>=seed.hsl.v*.85));
        if(!candidates.length)return;
        chosen[index]=candidates.slice().sort((a,b)=>squared(a.lab,center)-squared(b.lab,center))[0];
      });
    }
    function prepare(seeds){
      const rawPalette=seeds.map(entry=>hex(entry.rgb)),corrected=seeds.map(entry=>hex(enhance(entry.rgb,config)));
      for(let i=0;i<corrected.length;i++)for(let j=0;j<i;j++){
        if(seeds[i].family===seeds[j].family&&deltaE(rgb(corrected[i]),rgb(corrected[j]))<3){
          corrected[i]=corrected[j];break;
        }
      }
      return {rawPalette,corrected};
    }
    const candidates=[prepare(initialSeeds),prepare(chosen)];
    if(JSON.stringify(candidates[0])===JSON.stringify(candidates[1]))candidates.pop();
    return {...candidates[0],candidates,entries,config};
  }
  function nearest(color,palette){
    const colorLab=lab(color),sourceFamily=family(color);
    // A soft family preference protects close hue distinctions without forcing
    // a dark, nearly neutral pixel onto a distant bright color in its hue bin.
    let best=0,distance=Infinity;
    palette.forEach((value,index)=>{
      const penalty=family(value)===sourceFamily?0:16;
      const d=squared(colorLab,lab(value))+penalty;
      if(d<distance){distance=d;best=index;}
    });
    return best;
  }
  function report(sourceSamples,references,outputColors,palette,options={}){
    const config=settings(options),errors=[],sourceS=[],outputS=[];
    let shift=0;
    references.forEach((color,i)=>{
      const target=rgb(outputColors[i]);errors.push(deltaE(color,target));
      sourceS.push(hsl(color).s);outputS.push(hsl(target).s);shift+=lab(target)[0]-lab(color)[0];
    });
    const entries=histogram(sourceSamples),groups=new Map();
    for(const entry of entries){if(!groups.has(entry.family))groups.set(entry.family,[]);groups.get(entry.family).push(entry);}
    const paletteRGB=palette.map(rgb),dominantColors=[];
    for(const [name,group]of groups){
      const count=group.reduce((s,e)=>s+e.count,0);if(count<sourceSamples.length*.01)continue;
      const original=group.slice().sort((a,b)=>b.count-a.count)[0].rgb;
      const mapped=paletteRGB[nearest(original,paletteRGB)],difference=deltaE(original,mapped);
      dominantColors.push({family:name,sourceColor:hex(original),targetColor:hex(mapped),
        share:count/sourceSamples.length,deltaE:Number(difference.toFixed(2)),
        retained:difference<=14&&(family(mapped)===name||difference<=5)});
    }
    dominantColors.sort((a,b)=>b.share-a.share);
    const mean=list=>list.reduce((s,n)=>s+n,0)/Math.max(1,list.length);
    const sourceSaturation=mean(sourceS),saturationRatio=sourceSaturation>.02?mean(outputS)/sourceSaturation:1;
    errors.sort((a,b)=>a-b);
    const meanDeltaE=mean(errors),p95DeltaE=errors[Math.min(errors.length-1,Math.floor(errors.length*.95))]||0;
    const meanLightnessShift=shift/Math.max(1,references.length),missing=dominantColors.filter(color=>!color.retained);
    const passed=meanDeltaE<=12&&p95DeltaE<=26&&meanLightnessShift>=-5&&saturationRatio>=.88&&missing.length===0;
    const warnings=missing.map(color=>'主色 '+color.family+' 保留不足，请增加颜色数或降低增强');
    if(meanDeltaE>12||p95DeltaE>26)warnings.push('部分颜色偏差较大，可增加色数或豆阵尺寸、降低增强');
    if(meanLightnessShift < -5)warnings.push('主体平均明度下降，请调整颜色模式或增强');
    if(saturationRatio < .88)warnings.push('主体饱和度下降，请优先使用原色模式');
    return {metric:'CIELAB-DeltaE76',reference:'foreground-before-enhancement',config,
      meanDeltaE:Number(meanDeltaE.toFixed(2)),p95DeltaE:Number(p95DeltaE.toFixed(2)),
      meanLightnessShift:Number(meanLightnessShift.toFixed(2)),saturationRatio:Number(saturationRatio.toFixed(3)),
      sourceMeanSaturation:Number(sourceSaturation.toFixed(3)),targetMeanSaturation:Number(mean(outputS).toFixed(3)),
      dominantColors,retainedFamilies:dominantColors.length-missing.length,majorFamilies:dominantColors.length,
      passed,warnings};
  }

  // Keep the existing save codec compatible: its 64 symbols reserve one for an empty cell.
  const RECOMMENDED_COLORS=16,AUTO_CONTINUE_COLORS=24;
  const COLOR_SYMBOLS='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-';
  const MAX_COLORS=COLOR_SYMBOLS.length;
  function paletteStatus(count,{confirmed=false}={}){
    assert(Number.isInteger(count)&&count>0&&count<=MAX_COLORS,'候选色超过 '+MAX_COLORS+' 色，请框选主体或调整中心聚类容差');
    return {detectedColors:count,recommendedColors:RECOMMENDED_COLORS,autoContinueColors:AUTO_CONTINUE_COLORS,
      overRecommended:count>RECOMMENDED_COLORS,requiresConfirmation:count>AUTO_CONTINUE_COLORS&&!confirmed,
      canGenerate:count<=AUTO_CONTINUE_COLORS||confirmed};
  }
  function mergeFamilies(palette,counts={},limit=RECOMMENDED_COLORS){
    assert(Array.isArray(palette)&&palette.length>0&&palette.length<=MAX_COLORS&&new Set(palette).size===palette.length&&
      palette.every(value=>/^#[0-9A-F]{6}$/i.test(value)),'无效源调色板');
    assert(Number.isInteger(limit)&&limit>=12&&limit<=MAX_COLORS,'色系合并目标须为 12–63 色');
    const bucket=value=>{
      const name=family(rgb(value));
      return ['black','dark-gray'].includes(name)?'dark-neutral':['white','light-gray'].includes(name)?'light-neutral':name;
    };
    const weight=value=>{const n=counts[value]??1;assert(Number.isFinite(n)&&n>0,'颜色计数无效');return n;};
    let groups=palette.map(value=>({members:[value],representative:value,count:weight(value),bucket:bucket(value)}));
    function representative(members,name){
      if(name==='dark-neutral'){
        const outlines=members.filter(value=>family(rgb(value))==='black');
        if(outlines.length)return outlines.slice().sort((a,b)=>hsl(rgb(a)).v-hsl(rgb(b)).v)[0];
      }
      return members.slice().sort((a,b)=>{
        const score=value=>{const tone=hsl(rgb(value));return weight(value)**.75*(.65+tone.s*.6)*(.8+tone.v*.2);};
        return score(b)-score(a)||a.localeCompare(b);
      })[0];
    }
    while(groups.length>limit){
      let best=null;
      for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
        const a=groups[i],b=groups[j];if(a.bucket!==b.bucket)continue;
        const d=deltaE(rgb(a.representative),rgb(b.representative));
        const score=d*d*a.count*b.count/(a.count+b.count);
        if(!best||score<best.score)best={i,j,score};
      }
      assert(best,'无法在保留关键色系的前提下合并，请人工编辑');
      const a=groups[best.i],b=groups[best.j],members=[...a.members,...b.members];
      groups[best.i]={members,representative:representative(members,a.bucket),count:a.count+b.count,bucket:a.bucket};
      groups.splice(best.j,1);
    }
    const mapping=Object.fromEntries(groups.flatMap(group=>group.members.map(value=>[value,group.representative])));
    return {palette:groups.map(group=>group.representative),mapping,fromColors:palette.length,toColors:groups.length,
      strategy:'family-16'};
  }

  return {MODES,DEFAULTS,rgb,hex,hsl,lab,deltaE,family,settings,enhance,quantize,nearest,report,
    RECOMMENDED_COLORS,AUTO_CONTINUE_COLORS,COLOR_SYMBOLS,MAX_COLORS,paletteStatus,mergeFamilies};
});
