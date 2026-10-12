/* One-way common-signal history. No client-side entitlement or phone-based lookup. */
(() => {
  'use strict';
  if (!window.TRADING_MASTER_CONFIG?.membersEnabled) return;
  const app=document.getElementById('app');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actions={buy:'매수',add_buy:'추가 매수',partial_sell:'일부 매도',sell:'매도'};
  const statuses={queued:'문자 발송 대기',sending:'문자 발송 처리 중',accepted:'문자업체 접수',delivered:'문자 전달 완료',failed:'문자 발송 실패',unknown:'문자 결과 미확인',skipped:'문자 발송 제외',expired:'문자 발송 기한 종료',not_requested:'앱으로 제공',stopped:'문자 수신 중단'};
  const dateText=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  const day=offset=>{
    const now=new Date(Date.now()+9*3600000+offset*86400000);
    return now.toISOString().slice(0,10);
  };
  const defaults=()=>({start:day(-29),end:day(0),stock:'',action:'all',limit:20});
  let owner='',subscription='none',filters=defaults(),data=null,loadedAt=0;
  let listController=null,detailController=null,sequence=0,detailSequence=0,loading=false;
  const route=()=>location.hash.slice(1).split('?')[0]==='/signals';
  const readable=()=>Boolean(owner&&window.TRADING_MASTER_MEMBERS?.canRead()&&route());
  const element=id=>document.getElementById(id);
  function leave(){sequence++;detailSequence++;listController?.abort();detailController?.abort();loading=false;element('signal-detail')?.close();}
  function reset(){
    sequence++;detailSequence++;listController?.abort();detailController?.abort();
    owner='';data=null;loadedAt=0;loading=false;filters=defaults();
    element('signal-detail')?.close();
    element('signal-results')?.replaceChildren();
    element('signal-message')?.replaceChildren();
  }
  async function request(endpoint,controller){
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(new URL('api/members/signals'+endpoint,document.baseURI),{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      const body=await response.json();
      if(!response.ok){const error=new Error(body.error||'알림 내역을 불러오지 못했습니다.');error.status=response.status;throw error;}
      return body;
    }finally{clearTimeout(timer);}
  }
  function formValues(){
    return {start:element('signal-start').value,end:element('signal-end').value,stock:element('signal-stock').value.trim(),action:element('signal-action').value,limit:20};
  }
  function fillForm(values){
    for(const key of ['start','end','stock','action'])element('signal-'+key).value=values[key];
  }
  function shell(){
    app.innerHTML='<section class="member-signals"><div class="signal-heading"><div><span class="member-kicker">TRADING MASTER · 공통 매매 정보</span><h1 id="main-content" tabindex="-1">알림 내역</h1><p>이용 중 제공 대상으로 배정된 매수·매도 알림을 다시 확인하세요.</p></div><a href="#/member" class="signal-back">내 계정</a></div>'+
      '<p id="signal-membership-note" class="signal-policy"></p><form id="signal-filter" class="signal-filter"><div class="signal-dates"><label>시작일<input id="signal-start" type="date" required></label><label>종료일<input id="signal-end" type="date" required></label></div><label>종목명·종목코드<input id="signal-stock" type="search" maxlength="80" placeholder="예: 삼성전자, 005930"></label><label>매매 구분<select id="signal-action"><option value="all">전체</option><option value="buy">매수·추가 매수</option><option value="sell">매도·일부 매도</option></select></label><button type="submit" class="signal-button">조회</button></form>'+
      '<div class="signal-toolbar"><div class="signal-periods"><button type="button" data-signal-days="1">오늘</button><button type="button" data-signal-days="7">7일</button><button type="button" data-signal-days="30">30일</button></div><button type="button" class="signal-button secondary" id="signal-refresh">새로고침</button></div>'+
      '<p class="signal-feedback" id="signal-feedback" role="status" aria-live="polite"></p><p class="signal-count" id="signal-count"></p><ul class="signal-results" id="signal-results" aria-label="매수·매도 알림"></ul>'+
      '<nav class="signal-pages" aria-label="알림 목록 페이지"><button type="button" class="signal-button secondary" id="signal-previous" disabled>이전</button><span>한 번에 20건</span><button type="button" class="signal-button secondary" id="signal-next" disabled>다음</button></nav>'+
      '<p class="signal-footnote">가입 전 알림은 소급 제공하지 않습니다. 문자업체 접수와 휴대전화 전달 완료는 구분해 표시합니다. 내역 확인은 주문 실행이나 개인별 자문으로 연결되지 않습니다.</p>'+
      '<dialog id="signal-detail" class="signal-dialog" aria-labelledby="signal-detail-title"><div class="signal-dialog-top"><h2 id="signal-detail-title">알림 상세</h2><button type="button" id="signal-detail-close" class="signal-button secondary">닫기</button></div><p id="signal-detail-meta" class="signal-detail-meta"></p><p id="signal-detail-feedback" role="status" aria-live="polite"></p><pre id="signal-message"></pre><p class="signal-footnote">당시 트마 공통 운용 기준의 정보입니다. 현재의 새 매매 신호를 의미하지 않습니다.</p></dialog></section>';
    fillForm(filters);
  }
  function paint(){
    if(!element('signal-results')||!readable())return;
    element('signal-membership-note').textContent=subscription==='active'?'현재 이용 중입니다. 새 매수·매도 알림의 수신 대상입니다.':'새 알림 수신은 이용 상태에 따라 중단됩니다. 이전에 제공 대상으로 배정된 알림 내역은 계속 확인할 수 있습니다.';
    element('signal-previous').disabled=loading||!data?.page.previous;
    element('signal-next').disabled=loading||!data?.page.next;
    element('signal-results').setAttribute('aria-busy',String(loading));
    if(!data){element('signal-count').textContent='';return;}
    element('signal-count').textContent=data.available?'전체 '+data.page.total.toLocaleString('ko-KR')+'건 · 현재 '+data.items.length+'건':'';
    element('signal-results').innerHTML=!data.available?'<li class="signal-empty">알림 내역 연결을 준비 중입니다.</li>':!data.items.length?'<li class="signal-empty">선택한 조건에 알림이 없습니다. 날짜나 종목을 바꿔보세요.</li>':data.items.map(item=>'<li><button type="button" class="signal-row" data-signal-id="'+esc(item.id)+'"><span class="signal-row-main"><span class="signal-action '+(item.action.includes('buy')?'buy':'sell')+'">'+esc(actions[item.action]||'매매')+'</span><strong>'+esc(item.stock.name)+'</strong><small>'+esc(item.stock.symbol)+'</small></span><span class="signal-row-meta"><time datetime="'+esc(item.observed_at)+'">'+esc(dateText(item.observed_at))+' KST</time><span>'+esc(statuses[item.sms_status]||'문자 상태 확인 중')+(item.mock?' · 모의':'')+'</span></span><span class="signal-row-arrow" aria-hidden="true">→</span></button></li>').join('');
  }
  async function load(values=filters,cursor=''){
    if(!readable())return;
    const id=++sequence,member=owner;
    listController?.abort();listController=new AbortController();
    const controller=listController;
    filters={...values};loading=true;paint();element('signal-feedback').textContent='알림 내역을 불러오는 중입니다.';
    const query=new URLSearchParams({...values,...(cursor?{cursor}:{})});
    try{
      const result=await request('?'+query,controller);
      if(id!==sequence||member!==owner||!readable())return;
      data=result;loadedAt=Date.now();filters={...result.filters};fillForm(filters);
      element('signal-feedback').textContent=result.items.some(item=>item.mock)?'모의 알림 기록입니다. 실제 문자가 발송된 기록이 아닙니다.':'';
    }catch(error){
      if(id!==sequence||member!==owner||!readable())return;
      if(error.status===401){reset();element('signal-feedback').textContent='로그인을 다시 확인하고 있습니다.';window.TRADING_MASTER_MEMBERS.refresh();return;}
      element('signal-feedback').textContent=(error.name==='AbortError'?'연결을 확인한 뒤 다시 시도해 주세요.':error.message)+(data?' 이전 조회 결과를 표시하고 있습니다.':'');
    }finally{if(id===sequence){loading=false;paint();}}
  }
  async function showDetail(identifier){
    if(!readable())return;
    const id=++detailSequence,member=owner;
    detailController?.abort();detailController=new AbortController();
    const dialog=element('signal-detail'),controller=detailController;
    element('signal-detail-title').textContent='알림 상세';element('signal-detail-meta').textContent='';element('signal-message').textContent='';element('signal-detail-feedback').textContent='알림을 불러오는 중입니다.';dialog.showModal();
    try{
      const result=await request('/'+encodeURIComponent(identifier),controller);
      if(id!==detailSequence||member!==owner||!readable()||!dialog.open)return;
      const s=result.signal;
      element('signal-detail-title').textContent=s.stock.name+' · '+actions[s.action];
      element('signal-detail-meta').textContent=dateText(s.observed_at)+' KST · '+statuses[s.sms_status]+(s.mock?' · 모의':'');
      element('signal-message').textContent=s.message;element('signal-detail-feedback').textContent='';
    }catch(error){
      if(id!==detailSequence||member!==owner||!readable()||!dialog.open)return;
      if(error.status===401){reset();window.TRADING_MASTER_MEMBERS.refresh();return;}
      element('signal-detail-feedback').textContent=error.name==='AbortError'?'연결을 확인한 뒤 다시 시도해 주세요.':error.message;
    }
  }
  function render(member){
    if(owner!==member.id){reset();owner=member.id;}
    subscription=member.subscription?.status||'none';
    const entering=!element('signal-results');
    if(entering)shell();paint();
    if(!loading&&(!data||entering))load();
  }
  app.addEventListener('submit',event=>{
    if(event.target.id!=='signal-filter')return;
    event.preventDefault();load(formValues());
  });
  app.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!readable())return;
    if(button.dataset.signalId)showDetail(button.dataset.signalId);
    else if(button.dataset.signalDays){const n=Number(button.dataset.signalDays);const values={...formValues(),start:day(1-n),end:day(0)};fillForm(values);load(values);}
    else if(button.id==='signal-refresh')load(formValues());
    else if(button.id==='signal-previous'&&data?.page.previous)load(data.filters,data.page.previous);
    else if(button.id==='signal-next'&&data?.page.next)load(data.filters,data.page.next);
    else if(button.id==='signal-detail-close')element('signal-detail').close();
  });
  app.addEventListener('close',event=>{if(event.target.id==='signal-detail'){detailSequence++;detailController?.abort();}},true);
  window.addEventListener('hashchange',()=>{if(!route())leave();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&readable()&&!loading&&Date.now()-loadedAt>30000)load();});
  window.addEventListener('online',()=>{if(readable())load();});
  window.TRADING_MASTER_SIGNALS=Object.freeze({render,reset,leave});
  window.TRADING_MASTER_RENDER();
})();
