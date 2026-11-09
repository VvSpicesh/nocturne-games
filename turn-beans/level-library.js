/* Anonymous static catalog reader. A failed refresh never masquerades as empty. */
(function(root,factory){
  const api=factory(typeof module!=='undefined'&&module.exports?require('./level-document.js'):root.TurnBeansDocument);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TurnBeansLibrary=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(schema){
  'use strict';
  class LibraryError extends Error{constructor(code,message){super(message);this.code=code;}}
  function createReader({baseURL,fetch:fetcher=globalThis.fetch,hash=schema.digest}={}){
    const base=new URL(baseURL||'./level-library/',globalThis.location?.href||'https://local.invalid/turn-beans/');
    let catalog=null,serial=0;const cache=new Map();
    async function request(url){
      let response;
      try{response=await fetcher(url.href,{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});}
      catch{throw new LibraryError('network','网络异常，云端目录未能读取；内置六关仍可使用');}
      if(!response.ok)throw new LibraryError('http','关卡资源读取失败（HTTP '+response.status+'）');
      let text;try{text=await response.text();}catch{throw new LibraryError('network','关卡资源读取中断，请重试');}
      if(text.length>600000)throw new LibraryError('invalid','关卡资源超过大小限制');
      return text;
    }
    async function refresh(){
      const ticket=++serial;
      try{
        const url=new URL('index.json',base);url.searchParams.set('refresh',String(Date.now())+'-'+ticket);
        const next=schema.validateIndex(JSON.parse(await request(url)));
        if(ticket!==serial)return {status:'superseded'};
        const valid=new Set(next.levels.map(e=>e.id+':'+e.version+':'+e.sha256));
        for(const key of cache.keys())if(!valid.has(key))cache.delete(key);
        catalog=next;return {status:next.levels.length?'ready':'empty',catalog:structuredClone(next)};
      }catch(error){
        if(ticket===serial){catalog=null;cache.clear();}
        if(error instanceof LibraryError)throw error;
        throw new LibraryError('invalid','云端目录格式错误：'+error.message);
      }
    }
    async function load(id){
      if(!catalog)throw new LibraryError('catalog','请先刷新有效目录');
      const entry=catalog.levels.find(e=>e.id===id);if(!entry)throw new LibraryError('missing','目录中没有此关卡');
      const key=entry.id+':'+entry.version+':'+entry.sha256;
      if(cache.has(key))return structuredClone(cache.get(key));
      try{
        const url=new URL(entry.path,base);url.searchParams.set('v',entry.version);url.searchParams.set('sha',entry.sha256);
        const text=await request(url);
        if(await hash(text)!==entry.sha256)throw new Error('资源摘要与目录不符，请刷新后重试');
        const doc=schema.validate(JSON.parse(text));
        if(doc.id!==entry.id||doc.version!==entry.version||doc.name!==entry.name||doc.width!==entry.width||doc.height!==entry.height)throw new Error('关卡与目录记录不符');
        if(!catalog?.levels.some(e=>e.id===id&&e.version===entry.version&&e.sha256===entry.sha256))throw new Error('目录已经更新，请重新选择关卡');
        cache.set(key,doc);return structuredClone(doc);
      }catch(error){if(error instanceof LibraryError)throw error;throw new LibraryError('invalid','关卡校验失败：'+error.message);}
    }
    return {refresh,load};
  }
  return {createReader,LibraryError};
});
