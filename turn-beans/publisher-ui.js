(function(root){
  'use strict';
  root.TurnBeansPublisherUI={mount({getDocument,isReady}){
    const $=id=>document.getElementById(id);
    let client,configurationError=null,reader=null;
    try{client=root.TurnBeansPublisher.createClient(root.TurnBeansPublishConfig);}
    catch(error){configurationError=error;}
    let access={authorized:false},busy=false,checking=false,published=null,inspection=null,inspectionCount=0;
    function ready(){
      $('publish').disabled=busy||checking||!access.configured||!access.authorized||!isReady();
      $('refreshPublish').disabled=busy||checking;
    }
    function inspect(){
      if(inspection)return inspection;
      if(busy)return Promise.resolve();
      const count=++inspectionCount;
      checking=true;access={authorized:false};ready();
      $('refreshPublish').textContent='正在检查…';
      $('publisherLogin').hidden=true;
      $('publishReason').textContent='第 '+count+' 次授权检查：正在检查仓库管理员权限…';
      inspection=(async()=>{
        await Promise.resolve();
        try{
          if(configurationError)throw new Error('发布服务配置无效：'+configurationError.message);
          const result=await client.inspect();
          if(!result||typeof result.configured!=='boolean'||typeof result.authorized!=='boolean')throw new Error('授权检查响应无效，请重试');
          access=result;
          const reason=access.authorized?'仓库管理员授权有效；发布前服务端会重新验证三档解法。':
            !access.configured?'尚未配置 GitHub 授权发布服务；需先完成服务配置。当前仍可导出 JSON。':
            access.reason||'请先点击 GitHub 管理员登录，再重新检查授权。';
          $('publishReason').textContent='第 '+count+' 次检查完成：'+reason;
          $('publisherLogin').hidden=!access.configured||access.authorized||!client.loginURL;
          if(client.loginURL)$('publisherLogin').href=client.loginURL;
        }catch(error){
          access={authorized:false};$('publisherLogin').hidden=true;
          $('publishReason').textContent='第 '+count+' 次授权检查失败：'+error.message;
        }finally{
          checking=false;inspection=null;$('refreshPublish').textContent='检查授权';ready();
        }
      })();
      return inspection;
    }
    $('refreshPublish').addEventListener('click',()=>inspect());
    $('publish').addEventListener('click',async()=>{
      if(busy||checking||!access.configured||!access.authorized||!isReady())return;
      busy=true;ready();$('publishUpload').textContent='上传：正在验证并提交…';
      $('publishDeploy').textContent='部署：未确认';$('publishOnline').textContent='上线：未确认';published=null;$('checkOnline').disabled=true;
      try{
        const doc=getDocument(),overwrite=$('overwriteConfirm').checked;
        published=await client.publish(doc,{confirmOverwrite:overwrite,...(overwrite?{expectedVersion:doc.version-1}:{})});
        $('publishUpload').textContent='上传：已提交 GitHub（'+published.upload.commit.slice(0,7)+'）';
        $('publishDeploy').textContent='部署：待 GitHub Pages 构建确认';
        $('publishOnline').textContent='上线：待公开目录更新';$('checkOnline').disabled=false;
      }catch(error){$('publishUpload').textContent='上传：未确认成功 · '+error.message;}
      finally{busy=false;ready();}
    });
    $('checkOnline').addEventListener('click',async()=>{
      if(!published)return;$('checkOnline').disabled=true;
      try{
        if(!reader)reader=root.TurnBeansLibrary.createReader({baseURL:new URL('./level-library/',root.location.href).href});
        const result=await reader.refresh(),entry=result.catalog?.levels.find(e=>e.id===published.id);
        if(!entry||entry.version!==published.version||entry.sha256!==published.sha256){$('publishOnline').textContent='上线：公开目录尚未出现此版本';return;}
        await reader.load(entry.id);
        $('publishOnline').textContent='上线：公开资源与本次提交内容一致，读取验证通过';
        $('publishDeploy').textContent='部署：公开资源已更新；未查询构建任务';
      }catch(error){$('publishOnline').textContent='上线：未确认 · '+error.message;}
      finally{$('checkOnline').disabled=false;}
    });
    void inspect();
    return {refreshReady:ready};
  }};
})(globalThis);
