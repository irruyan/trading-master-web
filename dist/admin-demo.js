/* Browser-only adapter, loaded exclusively by the explicitly labeled demo page. */
(() => {
  'use strict';
  if(!location.pathname.endsWith('/admin-demo.html')||!window.TradingMasterAdminDemo)return;
  const model=new window.TradingMasterAdminDemo.Demo();
  window.TRADING_MASTER_ADMIN_DEMO=Object.freeze({
    async fetch(path,options){
      if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
      await new Promise(resolve=>setTimeout(resolve,60));
      if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
      try{
        const data=options.method==='POST'?JSON.parse(options.body):undefined;
        return new Response(JSON.stringify(model.request(path,data)),{status:200,headers:{'Content-Type':'application/json'}});
      }catch(error){return new Response(JSON.stringify({error:error.message||'체험 화면을 다시 열어 주세요.'}),{status:error.status||500,headers:{'Content-Type':'application/json'}});}
    }
  });
  const phone=document.getElementById('admin-phone'),password=document.getElementById('admin-password');
  phone.value=window.TradingMasterAdminDemo.PHONE;password.value=window.TradingMasterAdminDemo.PASSWORD;
  document.getElementById('demo-reset').addEventListener('click',()=>location.reload());
  document.getElementById('admin-logout').addEventListener('click',()=>{
    // Restore only the published fictional fixture credentials for another try.
    setTimeout(()=>{phone.value=window.TradingMasterAdminDemo.PHONE;password.value=window.TradingMasterAdminDemo.PASSWORD;},0);
  });
  const note=document.getElementById('admin-test-note');
  note.textContent='가상 회원과 가상 발송 기록을 이용한 관리자 체험입니다. 기간·상태 변경은 이 탭에만 반영되며 새로고침하면 초기화됩니다.';
})();
