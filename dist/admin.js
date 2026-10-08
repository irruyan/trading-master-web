(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {none:'미등록',scheduled:'시작 예정',active:'이용 중',expired:'만료',paused:'일시정지',cancelled:'이용 중단'};
  let csrf='', actor=null, selected=null, page=1, pages=1, query='', filter='all', mutating=false, epoch=0, listSequence=0, detailSequence=0, lastSession=0;
  const dateTime = seconds => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(seconds*1000));
  const day = seconds => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000));
  const phone = value => String(value).replace(/^(\d{3})(\d{4})(\d{4})$/,'$1-$2-$3');
  const pill = status => '<span class="status-pill status-'+escape(status)+'">'+escape(labels[status]||'확인 중')+'</span>';

  function feedback(text, error=false, login=false) {
    const target=el(login?'admin-login-message':'admin-feedback');
    target.textContent=text; target.classList.toggle('error',error);
  }
  function clearPrivate() {
    epoch++; actor=null; selected=null; detailSequence++; listSequence++;
    el('admin-dashboard').hidden=true; el('admin-login').hidden=false; el('admin-logout').hidden=true;
    el('admin-members').innerHTML=''; el('detail-content').innerHTML=''; el('detail-content').hidden=true;
    el('detail-empty').hidden=false; el('detail-refresh').hidden=true;
    ['total','active','expired','none'].forEach(key=>{el('count-'+key).textContent='—';});
  }
  async function request(path, data) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(new URL('api/'+path,document.baseURI),{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:data===undefined?{}:{'Content-Type':'application/json','X-Trading-Master-Members':'1','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data)});
      const body=await response.json();
      if(!response.ok){
        if(path.startsWith('admin/')&&(response.status===401||response.status===403)){clearPrivate();feedback(body.error,true,true);}
        throw new Error(body.error||'다시 시도해 주세요.');
      }
      return body;
    } catch(error){
      if(error.name==='AbortError'||error instanceof TypeError)throw new Error('연결을 확인한 뒤 다시 시도해 주세요.');
      throw error;
    } finally{clearTimeout(timer);}
  }
  function applySession(state) {
    csrf=state.csrf_token;
    if(state.member?.role!=='admin'){
      clearPrivate(); feedback(state.member?'관리자 권한이 필요한 화면입니다. 관리자 계정으로 로그인하세요.':'관리자 계정으로 로그인해 주세요.',Boolean(state.member),true);
      el('admin-logout').hidden=!state.member; return false;
    }
    actor=state.member; el('admin-login').hidden=true; el('admin-dashboard').hidden=false; el('admin-logout').hidden=false;
    el('admin-test-note').hidden=false;
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
    }catch(error){clearPrivate();feedback(error.message,true,true);el('admin-session-retry').hidden=false;}
  }
  async function loadList() {
    if(!actor)return;
    const captured=epoch,seq=++listSequence;
    el('admin-refresh').disabled=true;
    try{
      const params=new URLSearchParams({q:query,status:filter,page:String(page),limit:'20'});
      const result=await request('admin/members?'+params);
      if(captured!==epoch||seq!==listSequence)return;
      page=result.page;pages=result.pages;
      ['total','active','expired','none'].forEach(key=>{el('count-'+key).textContent=result.summary[key].toLocaleString('ko-KR');});
      el('member-total').textContent=result.total.toLocaleString('ko-KR')+'명';
      el('admin-members').innerHTML=result.members.length?result.members.map(member=>'<tr'+(selected?.member.id===member.id?' class="selected"':'')+' data-id="'+escape(member.id)+'"><td>'+escape(member.phone_masked)+(member.role==='admin'?'<small>관리자</small>':'')+'</td><td>'+pill(member.subscription.status)+'</td><td>'+escape(member.subscription.end_date||'—')+'</td><td><button type="button" data-member="'+escape(member.id)+'" aria-label="'+escape(member.phone_masked)+' 상세">상세</button></td></tr>').join(''):'<tr><td colspan="4">검색 조건에 맞는 회원이 없습니다.</td></tr>';
      el('page-label').textContent=page+' / '+pages; el('page-prev').disabled=page<=1;el('page-next').disabled=page>=pages;
    }catch(error){feedback(error.message,true);}
    finally{if(seq===listSequence)el('admin-refresh').disabled=false;}
  }
  function renderDetail(result) {
    selected=result;
    const member=result.member,sub=member.subscription,exists=sub.version>0;
    el('detail-empty').hidden=true;el('detail-content').hidden=false;el('detail-refresh').hidden=false;
    el('detail-content').innerHTML='<div class="detail-body"><p class="detail-phone">'+escape(phone(member.phone))+'</p><p class="detail-id">회원번호 '+escape(member.id)+'</p><div class="detail-info"><span>'+escape(sub.product?.name||'트마 공통 매매 알림')+'</span>'+pill(sub.status)+'</div><form id="admin-period-form" class="period-form"><div class="date-fields"><div><label for="subscription-start">이용 시작일</label><input id="subscription-start" type="date" min="2000-01-01" max="2100-12-31" value="'+escape(sub.start_date||day(Date.now()/1000))+'" required></div><div><label for="subscription-end">이용 종료일 · 해당일 포함</label><input id="subscription-end" type="date" min="2000-01-01" max="2100-12-31" value="'+escape(sub.end_date||'')+'" required></div></div><p class="help">한국 시간 기준으로 종료일이 끝날 때까지 이용할 수 있습니다.</p><div class="admin-note"><label for="subscription-note">변경 사유 · 선택</label><textarea id="subscription-note" maxlength="300" placeholder="예: 베타 이용 기간 부여"></textarea></div><button type="submit" class="primary">이용 기간 저장</button></form><div class="detail-section"><h3>기간 연장</h3><form id="admin-extension-form" class="extension-form"><label for="extension-days" class="sr-only">연장 일수</label><input id="extension-days" type="number" min="1" max="3650" step="1" value="30" required><span>일</span><button type="submit" '+(!exists?'disabled':'')+'>기간 연장</button></form><p class="help">이용 중이면 기존 종료일에 더하고, 만료됐다면 오늘부터 시작합니다. 일시정지·이용 중단 상태는 연장해도 유지됩니다.</p></div><div class="detail-section"><h3>이용 상태</h3><div class="state-actions"><button type="button" data-state="enabled" '+(!exists||sub.state==='enabled'?'disabled':'')+'>이용 재개</button><button type="button" data-state="paused" '+(!exists||sub.state==='paused'?'disabled':'')+'>일시정지</button><button type="button" data-state="cancelled" '+(!exists||sub.state==='cancelled'?'disabled':'')+'>이용 중단</button></div><p class="help">이용 재개 후에도 이용 기간이 만료된 경우 기간 연장이 필요합니다.</p></div><div class="detail-section"><h3>변경 이력 · 최근 20건</h3>'+history(result.history)+'</div></div>';
    el('admin-members').querySelectorAll('tr[data-id]').forEach(row=>row.classList.toggle('selected',row.dataset.id===member.id));
  }
  function history(rows) {
    if(!rows.length)return '<p class="help">아직 변경 이력이 없습니다.</p>';
    const action={set_period:'이용 기간 설정',extend:'기간 연장',set_state:'이용 상태 변경'};
    const describe=row=>row&&row.ends_at?day(row.starts_at)+' ~ '+day(row.ends_at-0.001)+' · '+({enabled:'이용 허용',paused:'일시정지',cancelled:'이용 중단'}[row.state]||''):'미등록';
    return '<ol class="history">'+rows.map(row=>'<li><div class="history-head"><b>'+escape(action[row.action]||'변경')+'</b><time>'+escape(dateTime(row.created_at))+'</time></div><p>'+escape(describe(row.before))+' → '+escape(describe(row.after))+'</p><p>'+escape(row.operator)+(row.note?' · '+escape(row.note):'')+'</p></li>').join('')+'</ol>';
  }
  async function openDetail(id) {
    if(mutating)return;
    const captured=epoch,seq=++detailSequence;
    try{
      const result=await request('admin/members/'+encodeURIComponent(id));
      if(captured===epoch&&seq===detailSequence){renderDetail(result);feedback('');}
    }catch(error){feedback(error.message,true);}
  }
  async function mutate(action,data) {
    if(mutating||!selected)return;
    const memberId=selected.member.id,captured=epoch;
    data.expected_version=selected.member.subscription.version;
    data.note=el('subscription-note').value;
    mutating=true;el('detail-content').querySelectorAll('button,input,textarea').forEach(node=>{node.disabled=true;});
    feedback('저장 중입니다.');
    try{
      const result=await request('admin/members/'+memberId+'/'+action,data);
      if(captured!==epoch)return;
      renderDetail(result);feedback('회원 이용 정보를 저장했습니다.');await loadList();
    }catch(error){feedback(error.message,true);}
    finally{
      mutating=false;
      if(selected&&selected.member.id===memberId){
        el('detail-content').querySelectorAll('button,input,textarea').forEach(node=>{node.disabled=false;});
        const sub=selected.member.subscription;
        el('admin-extension-form').querySelector('button').disabled=!sub.version;
        el('detail-content').querySelectorAll('[data-state]').forEach(node=>{node.disabled=!sub.version||node.dataset.state===sub.state;});
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
  el('admin-search-form').addEventListener('submit',event=>{event.preventDefault();query=el('member-search').value;filter=el('member-status').value;page=1;loadList();});
  el('member-status').addEventListener('change',()=>{query=el('member-search').value;filter=el('member-status').value;page=1;loadList();});
  el('admin-refresh').addEventListener('click',loadList);
  el('detail-refresh').addEventListener('click',()=>{if(selected)openDetail(selected.member.id);});
  el('page-prev').addEventListener('click',()=>{if(page>1){page--;loadList();}});
  el('page-next').addEventListener('click',()=>{if(page<pages){page++;loadList();}});
  el('admin-members').addEventListener('click',event=>{const button=event.target.closest('[data-member]');if(button)openDetail(button.dataset.member);});
  el('detail-content').addEventListener('submit',event=>{
    event.preventDefault();
    if(event.target.id==='admin-period-form')mutate('subscription',{start_date:el('subscription-start').value,end_date:el('subscription-end').value});
    else if(event.target.id==='admin-extension-form')mutate('extend',{days:Number(el('extension-days').value)});
  });
  el('detail-content').addEventListener('click',event=>{const button=event.target.closest('[data-state]');if(button)mutate('state',{state:button.dataset.state});});
  el('admin-logout').addEventListener('click',async()=>{
    try{const result=await request('auth/logout',{});clearPrivate();csrf=result.csrf_token;feedback('로그아웃했습니다.',false,true);}
    catch(error){feedback(error.message,true);}
  });
  el('admin-session-retry').addEventListener('click',()=>checkSession(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkSession();});
  window.addEventListener('pageshow',event=>{if(event.persisted)checkSession(true);});
  checkSession(true);
})();
