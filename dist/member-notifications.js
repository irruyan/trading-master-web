/* Customer-controlled service SMS. Subscription and app access stay separate. */
(() => {
  'use strict';
  if(!window.TRADING_MASTER_CONFIG?.membersEnabled)return;
  const app=document.getElementById('app'),element=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const phone=value=>String(value).replace(/^(\d{3})(\d{4})(\d{4})$/,'$1-$2-$3');
  let owner='',number='',member=null,data=null,sequence=0,busy=false,trusted=false;
  const route=()=>location.hash.slice(1).split('?')[0]==='/notification-settings';
  const readable=()=>Boolean(owner&&route()&&window.TRADING_MASTER_MEMBERS?.canRead());
  function leave(){sequence++;busy=false;}
  function reset(){leave();owner='';number='';member=null;data=null;trusted=false;const checkbox=element('sms-consent');if(checkbox)checkbox.checked=false;}
  function feedback(text,error=false){const node=element('sms-setting-feedback');if(node){node.textContent=text;node.classList.toggle('error',error);}}
  function shell(){
    app.innerHTML='<section class="member-card notification-card"><span class="member-kicker">TRADING MASTER · 알림 설정</span><h1 id="main-content" tabindex="-1">문자 알림 설정</h1><p class="member-lede">매수·매도 정보를 문자로도 받을지 선택하세요.</p>'+
      (window.TRADING_MASTER_MEMBERS.verificationMode()==='mock'?'<p class="member-test-note">테스트 화면입니다. 실제 문자는 발송되지 않습니다.</p>':'')+
      '<dl class="member-details"><div><dt>등록한 번호</dt><dd id="sms-setting-phone"></dd></div><div><dt>문자 수신</dt><dd id="sms-setting-status" role="status" aria-live="polite"></dd></div></dl><p id="sms-setting-access" class="member-help"></p>'+
      '<div id="sms-consent-section"><label class="sms-consent-label"><input type="checkbox" id="sms-consent"><span id="sms-consent-text"></span></label><button type="button" class="member-primary" id="sms-enable" disabled>동의하고 문자 수신 켜기</button></div>'+
      '<button type="button" class="member-secondary" id="sms-disable" hidden>문자 수신 끄기</button><p class="member-feedback" id="sms-setting-feedback" role="status" aria-live="polite"></p>'+
      '<div class="sms-setting-notes"><p>문자를 꺼도 이용 중인 앱에서 새 알림을 확인할 수 있습니다. 이용권과 정기결제는 별도로 관리됩니다.</p><p>다시 켜면 그 이후의 새 알림부터 받습니다. 꺼져 있던 동안의 알림은 문자로 소급 발송하지 않습니다.</p><p>이미 발송 처리가 시작된 문자는 도착할 수 있습니다. 번호를 변경하면 새 번호에서 다시 동의해야 합니다.</p></div>'+
      '<button type="button" class="member-secondary" id="sms-setting-refresh">설정 새로고침</button><a class="member-secondary" href="#/signals">앱 알림 내역 보기</a><div class="member-links"><a href="#/member">내 계정으로</a></div></section>';
  }
  function paint(){
    if(!readable()||!element('sms-setting-status'))return;
    const enabled=Boolean(data?.enabled);
    element('sms-setting-phone').textContent=phone(number);
    element('sms-setting-status').textContent=data?(enabled?'켜짐':'꺼짐'):'확인 중';
    element('sms-setting-status').className='sms-setting-status '+(enabled?'on':'off');
    element('sms-setting-access').textContent=member.subscription?.status==='active'?(enabled?'이용 기간 동안 새 매수·매도 알림을 문자와 앱에서 받습니다.':'이용 기간 동안 새 매수·매도 알림을 앱에서 확인합니다.'):(enabled?'문자 수신은 켜져 있지만 현재 이용 기간에 해당하지 않아 새 알림은 받지 않습니다.':'현재 이용 기간에 해당하지 않습니다. 이전 앱 알림 내역은 확인할 수 있습니다.');
    element('sms-consent-section').hidden=enabled;
    element('sms-disable').hidden=!enabled;
    element('sms-consent-text').textContent=data?.consent_text||'문자 수신 안내를 확인하고 있습니다.';
    element('sms-consent').disabled=busy||!trusted;
    element('sms-enable').disabled=busy||!trusted||!element('sms-consent').checked;
    element('sms-disable').disabled=busy||!trusted;
    element('sms-setting-refresh').disabled=busy;
  }
  function valid(value){if(typeof value?.enabled!=='boolean'||!Number.isInteger(value.version)||typeof value.consent_version!=='string'||typeof value.consent_text!=='string')throw Error('문자 수신 설정을 확인하지 못했습니다.');return value;}
  async function refresh(){
    if(!readable()||busy)return;
    const id=++sequence,who=owner;busy=true;paint();feedback('설정을 확인하고 있습니다.');
    try{
      const result=valid(await window.TRADING_MASTER_MEMBERS.request('members/sms-preference'));
      if(id!==sequence||who!==owner||!readable())return;
      if(data?.version!==result.version)element('sms-consent').checked=false;
      data=result;trusted=true;feedback('');
    }catch(error){
      if(id!==sequence||who!==owner||!readable())return;
      trusted=false;feedback(error.message+(data?' 마지막으로 확인한 설정입니다.':''),true);
      if(error.status===401){reset();window.TRADING_MASTER_MEMBERS.refresh();}
    }finally{if(id===sequence){busy=false;paint();}}
  }
  async function change(enabled){
    if(!readable()||busy||!trusted||enabled&&!element('sms-consent').checked)return;
    const id=++sequence,who=owner;busy=true;paint();feedback('문자 수신 설정을 저장하고 있습니다.');
    try{
      const result=valid(await window.TRADING_MASTER_MEMBERS.request('members/sms-preference',{enabled,expected_version:data.version,...(enabled?{consent:true,consent_version:data.consent_version}:{})}));
      if(id!==sequence||who!==owner||!readable())return;
      data=result;trusted=true;element('sms-consent').checked=false;
      feedback(enabled?'문자 수신을 켰습니다. 이용 중이면 지금부터 발생하는 새 알림부터 받습니다.':'문자 수신을 껐습니다. 이용권과 앱 알림 확인 권한은 유지됩니다.');
      await window.TRADING_MASTER_MEMBERS.refreshAfterWrite();
    }catch(error){
      if(id!==sequence||who!==owner||!readable())return;
      trusted=false;feedback(error.message+' 설정 새로고침으로 현재 상태를 확인해 주세요.',true);
      if(error.status===401){reset();window.TRADING_MASTER_MEMBERS.refresh();}
    }finally{if(id===sequence){busy=false;paint();}}
  }
  function render(current){
    if(owner!==current.id||number!==current.phone){reset();owner=current.id;number=current.phone;}
    member=current;
    const entering=!element('sms-setting-status');if(entering)shell();
    if(!busy&&current.signal_sms&&(!data||current.signal_sms.version>data.version)){
      data=valid(current.signal_sms);trusted=true;element('sms-consent').checked=false;
    }
    paint();if(entering)refresh();
  }
  app.addEventListener('change',event=>{if(event.target.id==='sms-consent')paint();});
  app.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!readable())return;
    if(button.id==='sms-enable')change(true);else if(button.id==='sms-disable')change(false);else if(button.id==='sms-setting-refresh')refresh();
  });
  window.addEventListener('hashchange',()=>{if(!route())leave();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&readable())refresh();});
  window.addEventListener('online',()=>{if(readable())refresh();});
  window.TRADING_MASTER_NOTIFICATIONS=Object.freeze({render,reset,leave});
  window.TRADING_MASTER_RENDER();
})();
