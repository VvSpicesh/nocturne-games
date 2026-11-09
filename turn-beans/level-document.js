/* Canonical public level document. Verified means a fresh production-engine replay passed. */
(function(root,factory){
  const api=factory(typeof module!=='undefined'&&module.exports?require('./level-generator.js'):root.TurnBeansGenerator,
    typeof module!=='undefined'&&module.exports?require('./image-processing.js'):root.TurnBeansImage);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TurnBeansDocument=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(generator,image){
  'use strict';
  const KEYS=['easy','medium','hard'], INTERNAL=['easy','normal','hard'];
  const ID=/^[a-z0-9][a-z0-9-]{2,63}$/, HASH=/^[a-f0-9]{64}$/;
  const fail=(ok,message)=>{if(!ok)throw new Error(message);};
  const clone=value=>JSON.parse(JSON.stringify(value));
  function object(value,allowed,required=allowed){
    fail(value&&typeof value==='object'&&!Array.isArray(value),'需要对象');
    fail(Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key)),'字段缺失或存在未知字段');
  }
  function date(value){fail(typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'时间必须为 UTC ISO 格式');}
  function rows(value,width,height,palette){
    fail(Array.isArray(value)&&value.length===height,'行数不符');
    for(const row of value)fail(typeof row==='string'&&row.length===width&&[...row].every(c=>c==='.'||Object.hasOwn(palette,c)),'行长或颜色符号无效');
  }
  function decode(targetRows,initialRows,palette){
    return targetRows.map((row,r)=>[...row].map((symbol,c)=>{
      fail((symbol==='.')===(initialRows[r][c]==='.'),'初始主体 mask 与 target 不同');
      return symbol==='.'?{active:false,baseColor:null,beanColor:null}:
        {active:true,baseColor:palette[symbol],beanColor:palette[initialRows[r][c]]};
    }));
  }
  function targetOf(doc){
    return {width:doc.width,height:doc.height,palette:Object.values(doc.palette),
      targetBoard:decode(doc.target.rows,doc.target.rows,doc.palette)};
  }
  function statistics(target,initial,proof,includeRegions=false){
    const measured=generator.boardMetrics(target,initial);
    const metrics=includeRegions?measured:Object.fromEntries(['activeBeans','changedBeans','recolorRate','colorCount','componentCount','meanComponentSize','largestComponent'].map(key=>[key,measured[key]]));
    return {...metrics,clicks:proof.clicks,operations:proof.engineOperations,
      automaticOperations:proof.automaticOperations,maxTransfer:proof.maxTransfer,
      peakTrayTotal:proof.peakTrayTotal,peakPerTray:proof.peakPerTray};
  }
  function validate(doc){
    object(doc,['schemaVersion','id','name','width','height','palette','target','variants','version','metadata']);
    fail(doc.schemaVersion===1&&typeof doc.id==='string'&&ID.test(doc.id),'schemaVersion 或 id 无效');
    fail(typeof doc.name==='string'&&doc.name.trim().length>0&&doc.name.length<=80,'名称无效');
    fail(Number.isSafeInteger(doc.version)&&doc.version>=1,'版本号无效');
    fail(image.supportedSize(doc.width,doc.height),'尺寸无效');
    object(doc.palette,image.COLOR_SYMBOLS.split(''),[]);
    const colors=Object.values(doc.palette);
    fail(colors.length>=2&&colors.length<=image.MAX_COLORS&&new Set(colors).size===colors.length&&colors.every(c=>/^#[A-F0-9]{6}$/.test(c)),'调色板无效');
    object(doc.target,['rows']);rows(doc.target.rows,doc.width,doc.height,doc.palette);
    object(doc.variants,KEYS);
    object(doc.metadata,['source','createdAt','updatedAt','generatorVersion','replayMode']);
    date(doc.metadata.createdAt);date(doc.metadata.updatedAt);
    fail(doc.metadata.updatedAt>=doc.metadata.createdAt,'更新时间早于创建时间');
    fail(['phase26.2','phase26.3'].includes(doc.metadata.generatorVersion)&&doc.metadata.replayMode==='click+autoFillMatchingEmpty','生成器或回放模式无效');
    object(doc.metadata.source,['type','name','subjectMode','backgroundTolerance','colorMode','saturationBoost','contrastBoost','imageMode','manualCorrections','colorStrategy','subjectRect'],['type','name']);
    fail(['local-image','generated-demo'].includes(doc.metadata.source.type)&&typeof doc.metadata.source.name==='string'&&doc.metadata.source.name.length<=180,'图片来源无效');
    if(doc.metadata.source.subjectMode!==undefined)fail(['auto','largest','all'].includes(doc.metadata.source.subjectMode),'主体模式无效');
    if(doc.metadata.source.backgroundTolerance!==undefined)fail(Number.isFinite(doc.metadata.source.backgroundTolerance)&&doc.metadata.source.backgroundTolerance>=-40&&doc.metadata.source.backgroundTolerance<=80,'背景容差无效');
    if (['colorMode','saturationBoost','contrastBoost'].some(key=>doc.metadata.source[key]!==undefined)) image.colorSettings(doc.metadata.source);
    if(doc.metadata.source.imageMode!==undefined)fail(['ordinary','bead-lock'].includes(doc.metadata.source.imageMode),'图片模式无效');
    if(doc.metadata.source.manualCorrections!==undefined)fail(Number.isSafeInteger(doc.metadata.source.manualCorrections)&&doc.metadata.source.manualCorrections>=0,'人工修正计数无效');
    if(doc.metadata.source.colorStrategy!==undefined)fail(['preserve','family-16','manual'].includes(doc.metadata.source.colorStrategy),'颜色策略无效');
    if(doc.metadata.source.subjectRect!==undefined){
      const rect=doc.metadata.source.subjectRect;object(rect,['x','y','width','height']);
      image.cropRect(1000,1000,32,32,{subjectRect:rect});
    }
    const target=targetOf(doc);generator.validateTarget(target);
    const used=new Set(doc.target.rows.join('').replace(/\./g,''));
    fail(used.size===colors.length,'调色板必须只包含有效主体颜色');
    for(const key of KEYS){
      const variant=doc.variants[key];
      object(variant,['initialRows','solution','verified','statistics']);
      rows(variant.initialRows,doc.width,doc.height,doc.palette);
      fail(variant.verified===true,'未验证版本禁止导入或发布');
      fail(Array.isArray(variant.solution)&&variant.solution.length>0&&variant.solution.length<=doc.width*doc.height*2,'解法长度无效');
      const initial=decode(doc.target.rows,variant.initialRows,doc.palette);
      const proof=generator.verifySolution(target,initial,variant.solution);
      fail(proof.passed,'真实引擎回放失败：'+(proof.reason||key));
      const regionFormat=doc.metadata.generatorVersion==='phase26.3';
      if(regionFormat)fail(generator.qualityFor(generator.boardMetrics(target,initial),INTERNAL[KEYS.indexOf(key)]).passed,'区域质量不合格，禁止导入噪声化关卡');
      const actual=statistics(target,initial,proof,regionFormat);
      object(variant.statistics,Object.keys(actual));
      for(const name of Object.keys(actual))fail(JSON.stringify(actual[name])===JSON.stringify(variant.statistics[name]),'难度统计不符：'+name);
    }
    return doc;
  }
  function create(target,levels,options={}){
    generator.validateTarget(target);
    fail(Array.isArray(levels)&&levels.length===3,'需要三个已验证版本');
    const encoded=image.rowsForBoard(target.targetBoard,target.palette),time=options.createdAt||new Date().toISOString();
    const doc={schemaVersion:1,id:options.id||'image-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),
      name:options.name||'图片主体关卡',width:target.width,height:target.height,palette:encoded.symbolPalette,
      target:{rows:encoded.rows},variants:{},version:options.version??1,
      metadata:{source:{type:options.sourceType||'local-image',name:String(options.sourceName||'local image').slice(0,180),
        ...(options.subjectMode?{subjectMode:options.subjectMode}:{}),
        ...(options.backgroundTolerance!==undefined?{backgroundTolerance:options.backgroundTolerance}:{}),
        ...(target.colorOptions ? image.colorSettings(target.colorOptions) : {}),
        ...(target.imageRecognition ? {imageMode:target.imageRecognition.mode} : {}),
        ...(target.manualCorrectionCount ? {manualCorrections:target.manualCorrectionCount} : {}),
        ...(target.colorStrategy ? {colorStrategy:target.colorStrategy} : {}),
        ...(options.subjectRect ? {subjectRect:clone(options.subjectRect)} : {})},
        createdAt:time,updatedAt:options.updatedAt||time,generatorVersion:'phase26.3',replayMode:'click+autoFillMatchingEmpty'}};
    KEYS.forEach((key,i)=>{
      const level=levels.find(l=>l.difficulty===INTERNAL[i]);fail(level?.playable===true,'三个版本必须全部验证通过');
      fail(generator.qualityFor(generator.boardMetrics(target,level.initialBoard),level.difficulty).passed,'区域质量不合格，禁止导出噪声化关卡');
      const proof=generator.verifySolution(target,level.initialBoard,level.testSolution);
      fail(proof.passed,'导出前回放失败');
      doc.variants[key]={initialRows:image.rowsForBoard(level.initialBoard,target.palette).rows,
        solution:clone(level.testSolution),verified:true,statistics:statistics(target,level.initialBoard,proof,true)};
    });
    validate(doc);return doc;
  }
  function toGameLevel(doc,tier){
    validate(doc);fail(KEYS.includes(tier),'未知难度');
    return {id:'cloud-'+doc.id+'-v'+doc.version+'-'+tier,cloud:true,name:doc.name,
      difficulty:{easy:'简单',medium:'普通',hard:'困难'}[tier],width:doc.width,height:doc.height,
      targetBoard:targetOf(doc).targetBoard,initialBoard:decode(doc.target.rows,doc.variants[tier].initialRows,doc.palette),
      testSolution:clone(doc.variants[tier].solution)};
  }
  function validateIndex(index){
    object(index,['schemaVersion','revision','updatedAt','levels']);
    fail(index.schemaVersion===1&&Number.isSafeInteger(index.revision)&&index.revision>=0,'目录版本无效');date(index.updatedAt);
    fail(Array.isArray(index.levels)&&index.levels.length<=1000,'目录数量无效');
    const seen=new Set();
    for(const entry of index.levels){
      object(entry,['id','name','width','height','version','path','sha256']);
      fail(ID.test(entry.id)&&typeof entry.id==='string'&&!seen.has(entry.id),'目录 ID 无效或重复');seen.add(entry.id);
      fail(entry.path==='levels/'+entry.id+'.json'&&HASH.test(entry.sha256),'目录路径或摘要无效');
      fail(typeof entry.name==='string'&&entry.name.length>0&&entry.name.length<=80,'目录名称无效');
      fail(Number.isSafeInteger(entry.version)&&entry.version>0&&image.supportedSize(entry.width,entry.height),'目录尺寸或版本无效');
    }
    return index;
  }
  async function digest(text){
    const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
  }
  return {KEYS,ID,validate,create,toGameLevel,targetOf,validateIndex,digest};
});
