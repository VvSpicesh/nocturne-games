/* Cloudflare Worker scaffold: disabled without real trusted OAuth/App bindings.
 * No client token, role or "verified" assertion is trusted. */
import '../engine.js';
import '../subject-extraction.js';
import '../color-processing.js';
import '../bead-grid.js';
import '../image-processing.js';
import '../region-processing.js';
import '../level-generator.js';
import '../level-document.js';
import {createGitHubRepository,DESTINATION,PublishError} from './github-repository.mjs';
const schema=globalThis.TurnBeansDocument;
const configured=env=>env.ENABLED==='true'&&typeof env.AUTH?.fetch==='function'&&typeof env.GITHUB?.fetch==='function'&&
  /^https:\/\/[^/]+$/.test(env.PUBLIC_ORIGIN||'');
function response(body,status=200,origin){
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',
    ...(origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Vary':'Origin'}:{})}});
}
async function session(request,env){
  const answer=await env.AUTH.fetch(new Request('https://auth.internal/session',{headers:{Cookie:request.headers.get('Cookie')||''}}));
  if(!answer.ok)throw new PublishError(401,'请先通过 GitHub 登录');
  const user=await answer.json();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(user.login||'')||typeof user.csrfToken!=='string'||
    user.csrfToken.length<32||!(Date.parse(user.expiresAt)>Date.now()))throw new PublishError(401,'登录会话无效或已过期');
  return user;
}
export async function handle(request,env,dependencies={}){
  const url=new URL(request.url),origin=request.headers.get('Origin'),allow=origin===env.PUBLIC_ORIGIN?origin:undefined;
  if(origin&&!allow)return response({error:'来源不允许'},403);
  if(request.method==='OPTIONS'){
    if(!allow)return response({error:'来源不允许'},403);
    return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':allow,'Access-Control-Allow-Credentials':'true',
      'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type, X-CSRF-Token','Vary':'Origin'}});
  }
  if(!configured(env))return response({configured:false,authorized:false,reason:'发布后端尚未配置真实 GitHub OAuth/App 授权'},url.pathname==='/capabilities'?200:503,allow);
  try{
    if(['/auth/login','/auth/callback'].includes(url.pathname)&&request.method==='GET'){
      // AUTH is a separately configured OAuth/App gateway. It must enforce
      // state/PKCE, signed HttpOnly sessions and fixed return URLs.
      return env.AUTH.fetch(request);
    }
    const repo=dependencies.repository||createGitHubRepository(env.GITHUB);
    const user=await session(request,env);
    if(!await repo.isAdmin(user.login))throw new PublishError(403,'仅目标仓库管理员可以发布');
    if(request.method==='GET'&&url.pathname==='/capabilities'){
      const snapshot=await repo.snapshot();schema.validateIndex(snapshot.index);
      return response({configured:true,authorized:true,csrfToken:user.csrfToken,revision:snapshot.index.revision},200,allow);
    }
    if(request.method!=='POST'||url.pathname!=='/publish')throw new PublishError(404,'接口不存在');
    if(!allow||request.headers.get('X-CSRF-Token')!==user.csrfToken)throw new PublishError(403,'发布来源或 CSRF 校验失败');
    if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))throw new PublishError(415,'只接收 JSON');
    if(Number(request.headers.get('Content-Length')||0)>600000)throw new PublishError(413,'关卡数据过大');
    // Read with a hard byte limit before parsing or running costly validation.
    const reader=request.body?.getReader();if(!reader)throw new PublishError(400,'缺少发布数据');
    const chunks=[];let length=0;
    while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>600000){await reader.cancel();throw new PublishError(413,'关卡数据过大');}chunks.push(value);}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new PublishError(400,'无效 JSON');}
    if(!input||Object.keys(input).some(k=>!['document','expectedRevision','expectedVersion','confirmOverwrite'].includes(k)))throw new PublishError(400,'发布参数无效');
    // validate() reconstructs the shared target, checks all masks and counts,
    // and independently replays all three solutions with TurnBeansEngine.
    let doc;try{doc=schema.validate(input.document);}catch(error){throw new PublishError(422,error.message);}
    const snapshot=await repo.snapshot();schema.validateIndex(snapshot.index);
    if(input.expectedRevision!==snapshot.index.revision)throw new PublishError(409,'目录已更新，请刷新后重试');
    const previous=snapshot.index.levels.find(entry=>entry.id===doc.id),oldText=await repo.readLevel(doc.id,snapshot.head);
    if(!previous&&(oldText!==null||doc.version!==1))throw new PublishError(409,'ID 已存在或新增版本必须为 1');
    if(previous){
      if(input.confirmOverwrite!==true||input.expectedVersion!==previous.version||doc.version!==previous.version+1||oldText===null)
        throw new PublishError(409,'更新需要明确覆盖确认及匹配的前一版本');
      const old=schema.validate(JSON.parse(oldText));
      if(old.id!==doc.id||old.version!==previous.version)throw new PublishError(409,'旧关卡与目录不一致');
      doc=structuredClone(doc);doc.metadata.createdAt=old.metadata.createdAt;
      if(doc.metadata.updatedAt<old.metadata.updatedAt)throw new PublishError(409,'更新时间不能倒退');
      schema.validate(doc);
    }else if(input.confirmOverwrite===true||input.expectedVersion!==undefined)throw new PublishError(409,'新增关卡不能带覆盖参数');
    const text=JSON.stringify(doc,null,2)+'\n',digest=await schema.digest(text);
    const entry={id:doc.id,name:doc.name,width:doc.width,height:doc.height,version:doc.version,path:'levels/'+doc.id+'.json',sha256:digest};
    const index={schemaVersion:1,revision:snapshot.index.revision+1,updatedAt:new Date().toISOString(),
      levels:[...snapshot.index.levels.filter(e=>e.id!==doc.id),entry].sort((a,b)=>a.id.localeCompare(b.id))};
    schema.validateIndex(index);
    const commit=await repo.commit(snapshot.head,[{path:DESTINATION.prefix+entry.path,content:text},
      {path:DESTINATION.prefix+'index.json',content:JSON.stringify(index,null,2)+'\n'}],'Publish Turn Beans '+doc.id+' v'+doc.version);
    return response({id:doc.id,version:doc.version,sha256:digest,revision:index.revision,
      upload:{status:'committed',commit},deployment:{status:'pending'},online:{status:'unconfirmed'}},200,allow);
  }catch(error){
    return response({error:error instanceof PublishError?error.message:'发布服务异常；未确认发布成功'},error instanceof PublishError?error.status:502,allow);
  }
}
export default {fetch:(request,env)=>handle(request,env)};
