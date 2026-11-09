/* Server-only Git Data adapter. Credentials belong to the GITHUB service binding. */
export const DESTINATION=Object.freeze({owner:'VvSpicesh',repo:'nocturne-games',branch:'main',prefix:'turn-beans/level-library/'});
export class PublishError extends Error{constructor(status,message){super(message);this.status=status;}}
const sha=value=>{if(!/^[a-f0-9]{40}$/.test(value))throw new PublishError(502,'GitHub 返回无效提交');return value;};
const root='/repos/'+DESTINATION.owner+'/'+DESTINATION.repo;
export function createGitHubRepository(binding){
  async function call(method,path,body){
    const response=await binding.fetch(new Request('https://api.github.com'+root+path,{
      method,headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'turn-beans-publisher','X-GitHub-Api-Version':'2026-03-10'},
      ...(body?{body:JSON.stringify(body)}:{})
    }));
    if(response.status===404)return null;
    if(!response.ok)throw new PublishError([409,422].includes(response.status)?409:502,
      [409,422].includes(response.status)?'远程分支已变化，请刷新目录后重试':'GitHub 服务未能完成请求');
    return response.json();
  }
  async function read(path,head){
    if(!/^turn-beans\/level-library\/(?:index\.json|levels\/[a-z0-9][a-z0-9-]{2,63}\.json)$/.test(path))throw new PublishError(403,'禁止写入或读取此路径');
    const file=await call('GET','/contents/'+path+'?ref='+sha(head));
    if(!file)return null;
    if(file.encoding!=='base64'||typeof file.content!=='string'||file.content.length>1000000)throw new PublishError(502,'无效仓库文件');
    return new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),char=>char.charCodeAt(0)));
  }
  return {
    async isAdmin(login){
      if(!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(login))return false;
      const result=await call('GET','/collaborators/'+encodeURIComponent(login)+'/permission');
      return result?.permission==='admin';
    },
    async snapshot(){
      const ref=await call('GET','/git/ref/heads/'+DESTINATION.branch);
      if(!ref)throw new PublishError(502,'目标分支不存在');
      const head=sha(ref.object?.sha),text=await read(DESTINATION.prefix+'index.json',head);
      if(text===null)throw new PublishError(409,'请先安装静态关卡目录，禁止自动重建索引');
      return {head,index:JSON.parse(text)};
    },
    readLevel:(id,head)=>read(DESTINATION.prefix+'levels/'+id+'.json',head),
    async commit(head,files,message){
      sha(head);
      if(files.length!==2||new Set(files.map(f=>f.path)).size!==2||files.filter(f=>f.path===DESTINATION.prefix+'index.json').length!==1||
        files.some(f=>!/^turn-beans\/level-library\/(?:index\.json|levels\/[a-z0-9][a-z0-9-]{2,63}\.json)$/.test(f.path)))throw new PublishError(403,'发布只能原子写入一个关卡与目录');
      const base=await call('GET','/git/commits/'+head);if(!base)throw new PublishError(409,'基线提交不存在');
      const tree=[];
      for(const file of files){
        const blob=await call('POST','/git/blobs',{content:file.content,encoding:'utf-8'});
        tree.push({path:file.path,mode:'100644',type:'blob',sha:sha(blob?.sha)});
      }
      const nextTree=await call('POST','/git/trees',{base_tree:sha(base.tree?.sha),tree});
      const next=await call('POST','/git/commits',{message,tree:sha(nextTree?.sha),parents:[head]});
      const commit=sha(next?.sha);
      // Non-fast-forward updates fail: no retry with force and no independent file PUTs.
      const updated=await call('PATCH','/git/refs/heads/'+DESTINATION.branch,{sha:commit,force:false});
      if(!updated)throw new PublishError(409,'分支已不可更新');
      return commit;
    }
  };
}
