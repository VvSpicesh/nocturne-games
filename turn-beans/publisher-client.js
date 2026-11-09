/* Session credentials travel only as HttpOnly cookies; CSRF stays in memory. */
(function(root,factory){
  const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.TurnBeansPublisher=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createClient({endpoint='',fetch:fetcher=globalThis.fetch,inspectTimeoutMs=10000}={}){
    if(!Number.isSafeInteger(inspectTimeoutMs)||inspectTimeoutMs<1||inspectTimeoutMs>60000)throw new Error('授权检查超时须为 1–60000 毫秒');
    let latestInspection=0;
    let access={configured:false,authorized:false,reason:'尚未配置 GitHub OAuth/App 发布后端'};
    const base=endpoint?new URL(endpoint):null;
    if(base&&(!base.href.startsWith('https://')||base.username||base.password||base.search||base.hash))throw new Error('发布接口必须为无凭据的 HTTPS 地址');
    async function inspect(){
      if(!base)return {...access};
      const ticket=++latestInspection;
      access={configured:true,authorized:false,reason:'正在检查仓库管理员授权'};
      const controller=typeof AbortController==='function'?new AbortController():null;
      let timer,result;
      const invalid=()=>({configured:true,authorized:false,reason:'发布授权响应无效，请检查服务配置后重试'});
      try{
        result=await Promise.race([
          (async()=>{
            const response=await fetcher(new URL('/capabilities',base).href,{credentials:'include',cache:'no-store',
              ...(controller?{signal:controller.signal}:{})});
            let data;try{data=await response.json();}catch{return {configured:true,authorized:false,reason:'发布授权响应不是有效 JSON，请检查服务地址'};}
            if(!response.ok)return {configured:true,authorized:false,
              reason:(typeof data?.error==='string'?data.error:'请通过 GitHub 登录管理员账户')+'（HTTP '+response.status+'）'};
            if(!data||Array.isArray(data)||typeof data.configured!=='boolean'||typeof data.authorized!=='boolean')return invalid();
            if(data.authorized&&(!data.configured||typeof data.csrfToken!=='string'||data.csrfToken.length<32||(!Number.isSafeInteger(data.revision)||data.revision<0)))return invalid();
            return {...data,reason:typeof data.reason==='string'?data.reason:
              data.configured?'需要 GitHub 仓库管理员登录':'尚未配置 GitHub OAuth/App 发布后端'};
          })(),
          new Promise(resolve=>{timer=setTimeout(()=>{
            controller?.abort();resolve({configured:true,authorized:false,reason:'授权检查超时，请确认发布服务可访问后重试'});
          },inspectTimeoutMs);})
        ]);
      }catch{result={configured:true,authorized:false,reason:'发布后端网络异常，请检查连接后重试'};}
      finally{clearTimeout(timer);}
      if(ticket===latestInspection)access=result;
      return {...access};
    }
    async function publish(document,{confirmOverwrite=false,expectedVersion}={}){
      if(!base||!access.authorized)throw new Error('尚未获得仓库管理员发布权限');
      const response=await fetcher(new URL('/publish',base).href,{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json','X-CSRF-Token':access.csrfToken},
        body:JSON.stringify({document,expectedRevision:access.revision,confirmOverwrite,
          ...(expectedVersion!==undefined?{expectedVersion}:{})})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'上传未成功');
      if(result.id!==document.id||result.version!==document.version||result.upload?.status!=='committed'||
        !/^[a-f0-9]{40}$/.test(result.upload.commit||'')||!/^[a-f0-9]{64}$/.test(result.sha256||'')||
        result.deployment?.status!=='pending'||result.online?.status!=='unconfirmed')throw new Error('上传响应无效，不能确认成功');
      access.revision=result.revision;return result;
    }
    return {inspect,publish,loginURL:base?new URL('/auth/login',base).href:null};
  }
  return {createClient};
});
