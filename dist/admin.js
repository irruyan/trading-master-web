(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {none:'미등록',scheduled:'시작 예정',active:'이용 중',expired:'만료',paused:'일시정지',cancelled:'이용 중단'};
  let csrf='', actor=null, selected=null, page=1, pages=1, query='', filter='all', smsFilter='all', deliveryFilter='all', kindFilter='all', trialFilter='all', mutating=false, epoch=0, listSequence=0, detailSequence=0, lastSession=0;
  let consentData=null, consentPage=1, consentLoading=false, consentSequence=0, consentController=null, listTime=null;
  const dateTime = seconds => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(seconds*1000));
  const day = seconds => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000));
  const exactTime = seconds => seconds == null ? '—' : new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(seconds*1000))+' KST';
  const kinds = {none:'미등록',manual:'운영자 부여',paid:'유료',trial:'무료체험'};
  const phone = value => String(value).replace(/^(\d{3})(\d{4})(\d{4})$/,'$1-$2-$3');
  const pill = status => '<span class="status-pill status-'+escape(status)+'">'+escape(labels[status]||'확인 중')+'</span>';
  const channel = {ready:'앱 + 문자',app_only:'앱만 이용',inactive:'신규 제공 없음',not_ready:'제공 설정 확인 필요'};
  const smsBadge = sms => '<span class="sms-badge '+(sms.enabled?'sms-on':'sms-off')+'">문자 '+(sms.enabled?'켜짐':'꺼짐')+'</span>';

  function feedback(text, error=false, login=false) {
    const target=el(login?'admin-login-message':'admin-feedback');
    target.textContent=text; target.classList.toggle('error',error);
  }
  function clearPrivate() {
    epoch++; actor=null; selected=null; detailSequence++; listSequence++;
    consentController?.abort();consentSequence++;consentData=null;consentLoading=false;consentPage=1;listTime=null;
    query='';filter=smsFilter=deliveryFilter=kindFilter=trialFilter='all';page=pages=1;
    el('member-search').value='';['member-status','member-sms','member-delivery','member-kind','member-trial'].forEach(id=>{el(id).value='all';});
    el('admin-dashboard').hidden=true; el('admin-login').hidden=false; el('admin-logout').hidden=true;
    el('admin-members').innerHTML=''; el('detail-content').innerHTML=''; el('detail-content').hidden=true;
    el('detail-empty').hidden=false; el('detail-refresh').hidden=true;
    ['total','active','expired','none','sms_ready','app_only','trial_active','trial_expired','paid_active'].forEach(key=>{el('count-'+key).textContent='—';});
    el('member-total').textContent='—';el('member-as-of').textContent='';el('page-label').textContent='1 / 1';
    el('page-prev').disabled=el('page-next').disabled=true;
    window.dispatchEvent(new CustomEvent('tm-admin-session',{detail:{authorized:false}}));
  }
  async function request(path, data, signal) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    const cancel=()=>controller.abort();
    if(signal){if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});}
    try {
      const options={method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:data===undefined?{}:{'Content-Type':'application/json','X-Trading-Master-Members':'1','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data)};
      const isDemo=document.documentElement.dataset.tmAdminDemo==='true',demo=window.TRADING_MASTER_ADMIN_DEMO;
      if(isDemo&&!demo)throw new Error('체험 화면을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
      const response=isDemo?await demo.fetch(path,options):await fetch(new URL('api/'+path,document.baseURI),options);
      let body;
      try{body=await response.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid response');}
      catch{
        const message=isDemo?'체험 화면의 응답을 읽지 못했습니다. 새로고침한 뒤 다시 입장해 주세요.':'서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        if(path.startsWith('admin/')&&(response.status===401||response.status===403)){clearPrivate();feedback('관리자 계정으로 다시 로그인해 주세요.',true,true);}
        throw new Error(message);
      }
      if(!response.ok){
        if(path.startsWith('admin/')&&(response.status===401||response.status===403)){clearPrivate();feedback(body.error,true,true);}
        throw new Error(body.error||'다시 시도해 주세요.');
      }
      return body;
    } catch(error){
      if(error.name==='AbortError'||error instanceof TypeError)throw new Error('연결을 확인한 뒤 다시 시도해 주세요.');
      throw error;
    } finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  function applySession(state) {
    csrf=state.csrf_token;
    if(state.member?.role!=='admin'){
      clearPrivate(); feedback(state.member?'관리자 권한이 필요한 화면입니다. 관리자 계정으로 로그인하세요.':'관리자 계정으로 로그인해 주세요.',Boolean(state.member),true);
      el('admin-logout').hidden=!state.member; return false;
    }
    actor=state.member; el('admin-login').hidden=true; el('admin-dashboard').hidden=false; el('admin-logout').hidden=false;
    el('admin-test-note').hidden=false;
    window.dispatchEvent(new CustomEvent('tm-admin-session',{detail:{authorized:true}}));
    return true;
  }
  async function checkSession(force=false) {
    if(!force&&Date.now()-lastSession<30000)return;
    lastSession=Date.now(); const captured=epoch;
    try{
      const state=await request('auth/session');
      if(captured!==epoch)return;
      if(applySession(state))await loadList();
      el('admin-session-retry').hidden=true;
    }catch(error){if(captured===epoch){clearPrivate();feedback(error.message,true,true);el('admin-session-retry').hidden=false;}}
  }
  async function loadList() {
    if(!actor)return;
    const captured=epoch,seq=++listSequence;
    el('admin-refresh').disabled=true;
    try{
      const params=new URLSearchParams({q:query,status:filter,sms:smsFilter,delivery:deliveryFilter,kind:kindFilter,trial_usage:trialFilter,page:String(page),limit:'20'});
      const result=await request('admin/members?'+params);
      if(captured!==epoch||seq!==listSequence)return;
      page=result.page;pages=result.pages;
      ['total','active','expired','none','sms_ready','app_only','trial_active','trial_expired','paid_active'].forEach(key=>{el('count-'+key).textContent=(result.summary[key]||0).toLocaleString('ko-KR');});
      listTime=result.as_of;el('member-as-of').textContent=dateTime(listTime)+' 조회 기준 · 전체 회원 집계는 검색 조건과 별도입니다.';
      el('admin-members').classList.remove('is-stale');
      el('member-total').textContent=result.total.toLocaleString('ko-KR')+'명';
      el('admin-members').innerHTML=result.members.length?result.members.map(member=>'<tr'+(selected?.member.id===member.id?' class="selected"':'')+' data-id="'+escape(member.id)+'"><td data-label="회원">'+escape(member.phone_masked)+(member.role==='admin'?'<small>관리자</small>':'')+'</td><td data-label="이용 상태">'+pill(member.subscription.status)+'<small>'+escape(kinds[member.subscription.kind]||kinds.manual)+(member.trial?.used?' · 체험 사용 이력 있음':'')+'</small></td><td data-label="문자 / 제공 상태">'+smsBadge(member.signal_sms)+'<small>'+escape(channel[member.signal_sms.state])+'</small></td><td data-label="이용 종료 시각">'+escape(exactTime(member.subscription.ends_at))+'</td><td><button type="button" data-member="'+escape(member.id)+'" aria-label="'+escape(member.phone_masked)+' 상세">상세</button></td></tr>').join(''):'<tr><td colspan="5">검색 조건에 맞는 회원이 없습니다.</td></tr>';
      el('page-label').textContent=page+' / '+pages; el('page-prev').disabled=page<=1;el('page-next').disabled=page>=pages;
    }catch(error){if(captured===epoch&&seq===listSequence){el('admin-members').classList.add('is-stale');el('member-as-of').textContent=listTime?'이전 조회 결과 · '+dateTime(listTime)+' 기준입니다. 새로고침해 주세요.':'조회하지 못했습니다. 다시 시도해 주세요.';feedback(error.message,true);}}
    finally{if(seq===listSequence)el('admin-refresh').disabled=false;}
  }
  function renderDetail(result) {
    if(selected?.member.id!==result.member.id){consentController?.abort();consentSequence++;consentData=null;consentPage=1;}
    selected=result;
    const member=result.member,sub=member.subscription,exists=sub.version>0;
    el('detail-empty').hidden=true;el('detail-content').hidden=false;el('detail-refresh').hidden=false;
    el('detail-content').innerHTML='<div class="detail-body"><p class="detail-phone">'+escape(phone(member.phone))+'</p><p class="detail-id">회원번호 '+escape(member.id)+'</p><div class="detail-info"><span>'+escape(sub.product?.name||'트마 공통 매매 알림')+'</span>'+pill(sub.status)+'</div>'+trialOverview(member)+smsOverview(member)+'<form id="admin-period-form" class="period-form">'+kindField(sub)+'<div class="date-fields"><div><label for="subscription-start">이용 시작일</label><input id="subscription-start" type="date" min="2000-01-01" max="2100-12-31" value="'+escape(sub.start_date||day(Date.now()/1000))+'" required></div><div><label for="subscription-end">이용 종료일 · 해당일 포함</label><input id="subscription-end" type="date" min="2000-01-01" max="2100-12-31" value="'+escape(sub.end_date||'')+'" required></div></div><p class="help">한국 시간 기준으로 종료일이 끝날 때까지 이용할 수 있습니다.</p><div class="admin-note"><label for="subscription-note">변경 사유 · 선택</label><textarea id="subscription-note" maxlength="300" placeholder="예: 베타 이용 기간 부여"></textarea></div><button type="submit" class="primary">이용 기간 저장</button></form><div class="detail-section"><h3>기간 연장</h3><form id="admin-extension-form" class="extension-form"><label for="extension-days" class="sr-only">연장 일수</label><input id="extension-days" type="number" min="1" max="3650" step="1" value="30" required><span>일</span><button type="submit" '+(!exists?'disabled':'')+'>기간 연장</button></form><p class="help">이용 중이면 기존 종료일에 더하고, 만료됐다면 오늘부터 시작합니다. 일시정지·이용 중단 상태는 연장해도 유지됩니다.</p></div><div class="detail-section"><h3>이용 상태</h3><div class="state-actions"><button type="button" data-state="enabled" '+(!exists||sub.state==='enabled'?'disabled':'')+'>이용 재개</button><button type="button" data-state="paused" '+(!exists||sub.state==='paused'?'disabled':'')+'>일시정지</button><button type="button" data-state="cancelled" '+(!exists||sub.state==='cancelled'?'disabled':'')+'>이용 중단</button></div><p class="help">일시정지해도 종료 시각은 유지됩니다. 만료된 무료체험은 이용 재개로 다시 시작되지 않습니다.</p></div>'+consentSection()+'<div class="detail-section"><h3>이용 기간 변경 이력 · 최근 20건</h3>'+history(result.history)+'</div></div>';
    el('admin-members').querySelectorAll('tr[data-id]').forEach(row=>row.classList.toggle('selected',row.dataset.id===member.id));
    periodControls();renderConsent();loadConsent();
    if(mutating)el('detail-content').querySelectorAll('button,input,textarea,select').forEach(node=>{node.disabled=true;});
  }
  function trialOverview(member) {
    const trial=member.trial||{used:false},sub=member.subscription;
    return '<section class="trial-overview" aria-label="이용권과 무료체험"><b>현재 이용권 · '+escape(kinds[sub.kind]||kinds.manual)+'</b><p>현재 이용 종료 시각 <strong id="subscription-exact-end">'+escape(exactTime(sub.ends_at))+'</strong></p><p class="help">이 시각부터 새 매매 알림 제공이 종료됩니다.</p><div id="trial-usage"><b>무료체험 사용 이력 · '+(trial.used?'있음':'없음')+'</b>'+(trial.used?'<p>최초 시작 '+escape(exactTime(trial.starts_at))+'<br>최초 종료 '+escape(exactTime(trial.ends_at))+'</p><p class="help">이용권 전환·일시정지 후에도 최초 체험 이력이 유지됩니다.</p>':'<p class="help">체험권 발급은 다음 단계에서 연결합니다.</p>')+'</div></section>';
  }
  function kindField(sub) {
    return '<div class="kind-field"><label for="subscription-kind">이용권 종류</label><select id="subscription-kind">'+(sub.kind==='trial'?'<option value="trial" selected disabled>무료체험 · 기간 변경 불가</option>':'')+['manual','paid'].map(kind=>'<option value="'+kind+'" '+((sub.kind===kind||kind==='manual'&&sub.kind==='none')?'selected':'')+'>'+kinds[kind]+'</option>').join('')+'</select><p class="help">유료는 운영자가 확인한 이용권 분류이며, 결제 처리 기능은 아닙니다. 무료체험은 여기서 발급하거나 연장할 수 없습니다.</p><p id="trial-period-note" class="help"></p></div>';
  }
  function periodControls() {
    if(!selected||mutating)return;
    const trial=selected.member.subscription.kind==='trial',locked=el('subscription-kind').value==='trial';
    ['subscription-start','subscription-end'].forEach(id=>{el(id).disabled=locked;});
    el('admin-period-form').querySelector('button').disabled=locked;
    el('extension-days').disabled=trial||!selected.member.subscription.version;
    el('admin-extension-form').querySelector('button').disabled=trial||!selected.member.subscription.version;
    el('trial-period-note').textContent=locked?'무료체험 최초 기간은 고정됩니다. 일시정지해도 종료 시각은 늘어나지 않습니다.':trial?'다른 이용권으로 전환합니다. 최초 체험 이력은 유지됩니다.':'';
  }
  function smsOverview(member) {
    const sms=member.signal_sms;
    const explanation=sms.state==='ready'?'앞으로 발생하는 새 매매 알림은 앱과 문자로 제공됩니다.':sms.state==='app_only'?'새 매매 알림은 앱으로 제공됩니다. 문자 수신이 꺼져 있습니다.':sms.state==='inactive'?'현재 이용 상태에서는 새 매매 알림이 제공되지 않습니다. 기존 앱 내역은 유지됩니다.':'이용 권한과 문자 수신 설정의 최신 정보를 확인해 주세요.';
    return '<section class="sms-overview" aria-label="문자 수신과 앱 이용 상태"><div>'+smsBadge(sms)+'<b>'+escape(channel[sms.state])+'</b></div><p>'+escape(explanation)+'</p><p class="help">수신 설정 변경 '+(sms.updated_at?escape(dateTime(sms.updated_at)):'이력 없음')+' · 고객이 직접 변경합니다.</p></section>';
  }
  function consentSection() {
    return '<section class="detail-section" aria-labelledby="consent-title"><div class="consent-heading"><h3 id="consent-title">문자 수신 동의·해지 이력</h3><button id="consent-refresh" type="button">최신 내역</button></div><p class="help">조회 전용입니다. 문자를 켜거나 끄는 것은 고객의 수신 설정에서 처리합니다.</p><p id="consent-count" class="help"></p><p id="consent-feedback" class="feedback" role="status" aria-live="polite"></p><div id="consent-results" role="region" aria-label="문자 수신 동의 이력 목록" tabindex="0"></div><div class="consent-pagination"><button id="consent-previous" type="button" disabled>이전 20건</button><button id="consent-next" type="button" disabled>다음 20건</button></div></section>';
  }
  function consentControls() {
    if(!el('consent-refresh'))return;
    el('consent-refresh').disabled=consentLoading||mutating;
    el('consent-previous').disabled=consentLoading||mutating||!consentData?.page.previous;
    el('consent-next').disabled=consentLoading||mutating||!consentData?.page.next;
  }
  function renderConsent() {
    if(!el('consent-results'))return;
    const data=consentData,actions={consented:'문자 수신 동의',withdrawn:'문자 수신 해지',phone_changed:'번호 변경 · 문자 수신 꺼짐'};
    const auditTime=seconds=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(seconds*1000));
    el('consent-count').textContent=data?'전체 '+data.page.total.toLocaleString('ko-KR')+'건 · '+consentPage+'페이지 · '+data.page.shown+'건 표시 · 현재 번호 '+data.current_phone_masked:'';
    el('consent-results').innerHTML=!data?'<p class="help">동의 이력을 불러오는 중입니다.</p>':data.items.length?'<ol class="consent-history">'+data.items.map(item=>'<li><div class="history-head"><b>'+escape(actions[item.action]||'문자 수신 설정 변경')+'</b><time>'+escape(auditTime(item.created_at))+'</time></div><p>변경 #'+escape(item.version)+' · '+(item.current_number?'현재 번호 기준':'이전 번호 기준')+' · 문자 '+(item.enabled?'켜짐':'꺼짐')+'</p><details><summary>안내 문구 보기 · '+escape(item.consent_version)+'</summary><p>'+escape(item.consent_text)+'</p></details></li>').join('')+'</ol>':'<p class="help">아직 수신 설정 변경 이력이 없습니다. 문자는 기본으로 꺼져 있습니다.</p>';
    consentControls();
  }
  async function loadConsent(cursor='',index=1) {
    if(!actor||!selected)return;
    consentController?.abort();consentController=new AbortController();
    const captured=epoch,memberId=selected.member.id,seq=++consentSequence;
    consentLoading=true;consentControls();
    el('consent-feedback').textContent='동의 이력을 조회하고 있습니다.';el('consent-feedback').classList.remove('error');
    try{
      const params=new URLSearchParams(cursor?{cursor}:{});
      const data=await request('admin/members/'+memberId+'/sms-consents'+(cursor?'?'+params:''),undefined,consentController.signal);
      if(captured!==epoch||seq!==consentSequence||memberId!==selected?.member.id)return;
      consentData=data;consentPage=index;renderConsent();el('consent-results').classList.remove('is-stale');
      el('consent-feedback').textContent=data.new_records_available?'새 변경 이력이 있습니다. 최신 내역을 누르면 포함됩니다.':'';
    }catch(error){
      if(captured!==epoch||seq!==consentSequence||memberId!==selected?.member.id)return;
      el('consent-results').classList.add('is-stale');
      if(!consentData)el('consent-results').innerHTML='<p class="help">동의 이력을 불러오지 못했습니다.</p>';
      el('consent-feedback').textContent=error.message+(consentData?' 이전 조회 결과가 표시되어 있습니다.':'');el('consent-feedback').classList.add('error');
    }finally{if(captured===epoch&&seq===consentSequence){consentLoading=false;consentControls();}}
  }
  function history(rows) {
    if(!rows.length)return '<p class="help">아직 변경 이력이 없습니다.</p>';
    const action={set_period:'이용 기간 설정',extend:'기간 연장',set_state:'이용 상태 변경'};
    const describe=row=>row&&row.ends_at?(kinds[row.kind]||kinds.manual)+' · '+day(row.starts_at)+' ~ '+day(row.ends_at-0.001)+' · '+({enabled:'이용 허용',paused:'일시정지',cancelled:'이용 중단'}[row.state]||''):'미등록';
    return '<ol class="history">'+rows.map(row=>'<li><div class="history-head"><b>'+escape(action[row.action]||'변경')+'</b><time>'+escape(dateTime(row.created_at))+'</time></div><p>'+escape(describe(row.before))+' → '+escape(describe(row.after))+'</p><p>'+escape(row.operator)+(row.note?' · '+escape(row.note):'')+'</p></li>').join('')+'</ol>';
  }
  async function openDetail(id) {
    if(mutating)return;
    const captured=epoch,seq=++detailSequence;
    try{
      const result=await request('admin/members/'+encodeURIComponent(id));
      if(captured===epoch&&seq===detailSequence){renderDetail(result);feedback('');}
    }catch(error){if(captured===epoch&&seq===detailSequence)feedback(error.message,true);}
  }
  async function mutate(action,data) {
    if(mutating||!selected)return;
    const memberId=selected.member.id,captured=epoch;
    data.expected_version=selected.member.subscription.version;
    data.note=el('subscription-note').value;
    mutating=true;el('detail-content').querySelectorAll('button,input,textarea,select').forEach(node=>{node.disabled=true;});
    feedback('저장 중입니다.');
    try{
      const result=await request('admin/members/'+memberId+'/'+action,data);
      if(captured!==epoch)return;
      renderDetail(result);feedback('회원 이용 정보를 저장했습니다.');await loadList();
    }catch(error){if(captured===epoch)feedback(error.message,true);}
    finally{
      mutating=false;
      if(selected&&selected.member.id===memberId){
        el('detail-content').querySelectorAll('button,input,textarea,select').forEach(node=>{node.disabled=false;});
        const sub=selected.member.subscription;
        periodControls();
        el('detail-content').querySelectorAll('[data-state]').forEach(node=>{node.disabled=!sub.version||node.dataset.state===sub.state;});
        consentControls();
      }
    }
  }
  el('admin-login-form').addEventListener('submit',async event=>{
    event.preventDefault();el('admin-login-submit').disabled=true;
    const captured=epoch;
    try{
      if(!csrf){const session=await request('auth/session');csrf=session.csrf_token;}
      const result=await request('auth/login',{phone:el('admin-phone').value,password:el('admin-password').value,remember:false});
      el('admin-password').value='';
      if(captured===epoch&&applySession(result))await loadList();
    }catch(error){feedback(error.message,true,true);}
    finally{el('admin-login-submit').disabled=false;}
  });
  function searchMembers(){query=el('member-search').value;filter=el('member-status').value;smsFilter=el('member-sms').value;deliveryFilter=el('member-delivery').value;kindFilter=el('member-kind').value;trialFilter=el('member-trial').value;page=1;loadList();}
  el('admin-search-form').addEventListener('submit',event=>{event.preventDefault();searchMembers();});
  ['member-status','member-sms','member-delivery','member-kind','member-trial'].forEach(id=>el(id).addEventListener('change',searchMembers));
  el('member-filter-reset').addEventListener('click',()=>{el('member-search').value='';['member-status','member-sms','member-delivery','member-kind','member-trial'].forEach(id=>{el(id).value='all';});searchMembers();});
  document.querySelectorAll('[data-member-delivery]').forEach(button=>button.addEventListener('click',()=>{el('member-search').value='';el('member-status').value=el('member-sms').value=el('member-kind').value=el('member-trial').value='all';el('member-delivery').value=button.dataset.memberDelivery;searchMembers();el('members-title').scrollIntoView({block:'start'});}));
  document.querySelectorAll('[data-member-kind]').forEach(button=>button.addEventListener('click',()=>{el('member-search').value='';['member-status','member-sms','member-delivery','member-kind','member-trial'].forEach(id=>{el(id).value='all';});el('member-kind').value=button.dataset.memberKind;el('member-status').value=button.dataset.memberStatus;searchMembers();el('members-title').scrollIntoView({block:'start'});}));
  el('detail-content').addEventListener('change',event=>{if(event.target.id==='subscription-kind')periodControls();});
  el('admin-refresh').addEventListener('click',loadList);
  el('detail-refresh').addEventListener('click',async()=>{if(selected&&!mutating){await openDetail(selected.member.id);await loadList();}});
  el('page-prev').addEventListener('click',()=>{if(page>1){page--;loadList();}});
  el('page-next').addEventListener('click',()=>{if(page<pages){page++;loadList();}});
  el('admin-members').addEventListener('click',event=>{const button=event.target.closest('[data-member]');if(button)openDetail(button.dataset.member);});
  el('detail-content').addEventListener('submit',event=>{
    event.preventDefault();
    if(event.target.id==='admin-period-form')mutate('subscription',{start_date:el('subscription-start').value,end_date:el('subscription-end').value,kind:el('subscription-kind').value});
    else if(event.target.id==='admin-extension-form')mutate('extend',{days:Number(el('extension-days').value)});
  });
  el('detail-content').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.state)mutate('state',{state:button.dataset.state});
    else if(button.id==='consent-refresh')loadConsent();
    else if(button.id==='consent-previous'&&consentData?.page.previous)loadConsent(consentData.page.previous,Math.max(1,consentPage-1));
    else if(button.id==='consent-next'&&consentData?.page.next)loadConsent(consentData.page.next,consentPage+1);
  });
  el('admin-logout').addEventListener('click',async()=>{
    try{const result=await request('auth/logout',{});clearPrivate();csrf=result.csrf_token;feedback('로그아웃했습니다.',false,true);}
    catch(error){feedback(error.message,true);}
  });
  el('admin-session-retry').addEventListener('click',()=>checkSession(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkSession();});
  window.addEventListener('pageshow',event=>{if(event.persisted)checkSession(true);});
  window.TRADING_MASTER_ADMIN=Object.freeze({request,isAdmin:()=>Boolean(actor),epoch:()=>epoch});
  checkSession(true);
})();
