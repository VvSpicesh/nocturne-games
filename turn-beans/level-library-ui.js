/* Mount beside built-in cards; loading a catalog does not eagerly load levels. */
(function(root){
  'use strict';
  root.TurnBeansLibraryUI={mount({openLevel}){
    const section=document.createElement('section'),heading=document.createElement('h2'),note=document.createElement('p'),
      refresh=document.createElement('button'),cards=document.createElement('div');
    heading.textContent='云端关卡';note.setAttribute('role','status');note.setAttribute('aria-live','polite');
    refresh.type='button';refresh.className='text-button';refresh.textContent='刷新云端目录';
    cards.className='level-cards';section.className='cloud-level-library';
    section.append(heading,refresh,note,cards);document.getElementById('levelHome').append(section);
    const reader=root.TurnBeansLibrary.createReader({baseURL:new URL('./level-library/',root.location.href).href});
    let ticket=0;
    async function loadCatalog(){
      const id=++ticket;cards.replaceChildren();refresh.disabled=true;note.textContent='正在读取公开关卡目录…';
      if(root.location.protocol==='file:'){note.textContent='云端关卡需从网站或本地 HTTP 服务读取；内置六关仍可使用。';refresh.disabled=false;return;}
      try{
        const result=await reader.refresh();if(id!==ticket||result.status==='superseded')return;
        note.textContent=result.status==='empty'?'公开目录暂时没有关卡。':'已读取公开目录；选择难度后加载并验证关卡。';
        for(const entry of result.catalog.levels){
          const item=document.createElement('article'),name=document.createElement('strong'),buttons=document.createElement('div');
          item.className='level-card';name.textContent=entry.name;buttons.className='cloud-variants';item.append(name,buttons);
          for(const [key,label] of [['easy','简单'],['medium','普通'],['hard','困难']]){
            const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent=label;
            button.addEventListener('click',async()=>{
              button.disabled=true;note.textContent='正在加载并回放验证 '+entry.name+'…';
              try{const doc=await reader.load(entry.id);if(id!==ticket)return;openLevel(root.TurnBeansDocument.toGameLevel(doc,key));note.textContent='关卡验证通过。';}
              catch(error){if(id===ticket)note.textContent=error.message;}
              finally{button.disabled=false;}
            });buttons.append(button);
          }
          cards.append(item);
        }
      }catch(error){if(id===ticket)note.textContent=error.message;}
      finally{if(id===ticket)refresh.disabled=false;}
    }
    refresh.addEventListener('click',loadCatalog);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void loadCatalog();});
    void loadCatalog();return {refresh:loadCatalog};
  }};
})(typeof globalThis!=='undefined'?globalThis:this);
