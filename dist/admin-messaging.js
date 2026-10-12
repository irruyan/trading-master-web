/* Bounded server-side history. Every API request requires the current admin role. */
(() => {
  'use strict';
  const api=window.TRADING_MASTER_ADMIN,el=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>Number(value||0).toLocaleString('ko-KR');
  const statusLabels={queued:'발송 대기',sending:'처리 중',accepted:'업체 접수 완료',delivered:'전달 완료',failed:'실패',unknown:'결과 미확인',skipped:'발송 제외',expired:'신호 유효시간 종료'};
  const actionLabels={buy:'신규매수',add_buy:'추가매수',partial_sell:'부분매도',sell:'전량청산',protection_update:'보호선 변경 · 문자 없음'};
  const errorLabels={subscription_inactive:'이용 기간 종료·정지·중단',subscription_changed:'이용 권한 변경 전 신호',recipient_changed:'수신번호 변경',recipient_unlinked:'회원 미연결',signal_expired:'신호 유효시간 종료',newer_position_signal:'새 운용 신호로 대체',gateway_rejected:'업체 접수 거절',gateway_result_unknown:'업체 접수 여부 확인 필요',worker_interrupted:'중단된 발송 결과 확인 필요',delivery_failed:'휴대전화 전달 실패',gateway_mode_changed:'발송 방식 변경',non_trade_signal:'매매 외 운용 기록'};
  const time=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(typeof value==='number'?value*1000:value)):'—';
  const day=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const status=value=>'<span class="status-pill message-status-'+escape(value)+'">'+escape(statusLabels[value]||value)+'</span>';
  const stock=value=>escape(value.name)+'<small>'+escape(value.symbol)+'</small>';
  let view='signals',filters={},paging=null,seq=0,detailSeq=0,loaded=false,controller=null,detailController=null,signalLabel='';
  const active=()=>location.hash==='#messaging';
  function feedback(text,error=false){el('message-feedback').textContent=text;el('message-feedback').classList.toggle('error',error);}
  function dates(days){const today=day(Date.now());const end=new Date(today+'T12:00:00+09:00');end.setUTCDate(end.getUTCDate()-days+1);el('message-start').value=day(end);el('message-end').value=today;}
  function read(){return {...filters,start:el('message-start').value,end:el('message-end').value,stock:el('message-stock').value.trim(),recipient:el('message-recipient').value.trim(),status:el('message-status').value,action:el('message-action').value,limit:el('message-limit').value};}
  function closeDetail(){detailSeq++;detailController?.abort();if(el('message-detail').open)el('message-detail').close();el('message-detail-body').innerHTML='';}
  function navigation(result){
    paging=result?.page||null;
    el('message-previous').disabled=!paging?.previous;el('message-next').disabled=!paging?.next;
    el('message-first').disabled=!paging||paging.total===0;el('message-last').disabled=!paging||paging.total===0;
    el('message-page-label').textContent=paging?number(paging.shown)+'건 표시 / 총 '+number(paging.total)+(view==='signals'?'개 신호':'건'):'—';
  }
  function render(result){
    loaded=true;el('message-results').classList.remove('is-stale');
    if(!result.available){
      ['total','delivered','accepted','failed','unknown'].forEach(key=>{el('message-count-'+key).textContent='—';});
      el('message-results').innerHTML='<p class="empty">'+escape(result.message)+'</p>';navigation(null);el('message-result-total').textContent='연결 대기';el('message-as-of').textContent='';el('message-mode').hidden=true;return;
    }
    const counts=result.totals.by_status;
    el('message-count-total').textContent=number(result.totals.deliveries);
    ['delivered','accepted','failed','unknown'].forEach(key=>{el('message-count-'+key).textContent=number(counts[key]);});
    el('message-mode').hidden=false;
    el('message-mode').textContent=result.mode==='mock'?'모의 발송 이력입니다. 실제 SMS는 발송되지 않습니다.':result.mode==='none'?'발송 기록이 아직 없습니다.':'발송 이력 조회 화면입니다. 이 화면에서는 문자를 발송하지 않습니다.';
    el('message-as-of').textContent='조회 '+time(result.as_of);
    el('message-result-total').textContent='검색 결과 '+number(result.page.total)+(view==='signals'?'개 신호':'건');
    navigation(result);
    if(!result.items.length){el('message-results').innerHTML='<p class="empty">검색 조건에 맞는 기록이 없습니다. 기간이나 검색 조건을 확인하세요.</p>';return;}
    let head,rows;
    if(view==='signals'){
      head='<tr><th>신호 발생 · 번호</th><th>종목 · 매매</th><th>발송 기록</th><th>전달 완료</th><th>접수·처리 대기</th><th>실패·미확인</th><th>제외·만료</th><th>조회</th></tr>';
      rows=result.items.map(item=>{
        const c=item.totals.by_status;
        return '<tr><td>'+escape(time(item.observed_at))+'<small>#'+item.id+'</small></td><td>'+stock(item.stock)+'<span class="message-action">'+escape(actionLabels[item.action])+'</span></td><td class="numeric">'+number(item.totals.deliveries)+'</td><td class="numeric">'+number(c.delivered)+'</td><td class="numeric">'+number(c.queued+c.sending+c.accepted)+'</td><td class="numeric '+(c.failed+c.unknown?'attention-number':'')+'">'+number(c.failed+c.unknown)+'</td><td class="numeric">'+number(c.skipped+c.expired)+'</td><td class="message-row-actions"><button type="button" data-signal-detail="'+item.id+'">내용</button><button type="button" data-signal-records="'+item.id+'" data-signal-name="'+escape(item.stock.name)+'">발송 내역</button>'+(c.failed+c.unknown?'<button type="button" class="attention-link" data-signal-records="'+item.id+'" data-signal-name="'+escape(item.stock.name)+'" data-attention="1">문제 건 보기</button>':'')+'</td></tr>';
      }).join('');
    }else{
      head='<tr><th>등록 시각</th><th>종목 · 매매</th><th>수신자</th><th>발송 상태</th><th>시도 횟수</th><th>최근 갱신</th><th>조회</th></tr>';
      rows=result.items.map(item=>'<tr><td>'+escape(time(item.created_at))+'<small>신호 #'+item.signal_id+'</small></td><td>'+stock(item.stock)+'<span class="message-action">'+escape(actionLabels[item.action])+'</span></td><td>'+escape(item.phone_masked)+(item.member_id?'<small>회원 '+escape(item.member_id.slice(0,8))+'</small>':'<small>기존 수동 수신자</small>')+'</td><td>'+status(item.status)+(item.last_error?'<small>'+escape(errorLabels[item.last_error]||item.last_error)+'</small>':'')+'</td><td class="numeric">'+item.attempts+'</td><td>'+escape(time(item.updated_at))+'</td><td><button type="button" data-delivery-detail="'+escape(item.id)+'">상세</button></td></tr>').join('');
    }
    el('message-results').innerHTML='<table class="message-table-'+view+'"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table>';
    const cellLabels=view==='signals'?['신호 발생 · 번호','종목 · 매매','발송 기록','전달 완료','접수·처리 대기','실패·미확인','제외·만료','조회']:['등록 시각','종목 · 매매','수신자','발송 상태','시도 횟수','최근 갱신','조회'];
    el('message-results').querySelectorAll('tbody tr').forEach(row=>{Array.from(row.children).forEach((cell,index)=>{cell.dataset.label=cellLabels[index];});});
  }
  async function load(cursor='',edge='first'){
    if(!api.isAdmin()||!active())return;
    const current=++seq,epoch=api.epoch();controller?.abort();controller=new AbortController();
    el('message-results').setAttribute('aria-busy','true');el('message-refresh').disabled=true;
    navigation(null);feedback('조회 중입니다.');
    el('message-signal-scope').hidden=!filters.signal_id;el('message-signal-label').textContent='신호 #'+filters.signal_id+(signalLabel?' · '+signalLabel:'');
    try{
      const params=new URLSearchParams({...filters,...(cursor?{cursor}:{edge})});
      const result=await api.request('admin/messaging/'+view+'?'+params,undefined,controller.signal);
      if(current!==seq||epoch!==api.epoch()||!api.isAdmin())return;
      render(result);feedback('');
    }catch(error){
      if(current!==seq||epoch!==api.epoch())return;
      feedback(error.message+(loaded?' 아래는 마지막으로 조회한 결과입니다.':''),true);el('message-results').classList.add('is-stale');
    }finally{if(current===seq){el('message-results').setAttribute('aria-busy','false');el('message-refresh').disabled=false;}}
  }
  function setView(next){view=next;document.querySelectorAll('[data-message-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.messageView===view)));el('message-results-title').textContent=view==='signals'?'매매 신호별 결과':'개별 발송 기록';}
  function reset(){dates(7);['stock','recipient'].forEach(key=>{el('message-'+key).value='';});el('message-status').value='all';el('message-action').value='all';filters={};signalLabel='';filters=read();}
  function clear(){
    seq++;controller?.abort();loaded=false;closeDetail();reset();navigation(null);
    el('message-results').innerHTML='';el('message-as-of').textContent='';el('message-result-total').textContent='—';el('message-mode').hidden=true;
    el('message-signal-scope').hidden=true;el('message-signal-label').textContent='';el('message-results').classList.remove('is-stale');
    ['total','delivered','accepted','failed','unknown'].forEach(key=>{el('message-count-'+key).textContent='—';});feedback('');
  }
  function tab(){
    const messaging=active();el('admin-members-pane').hidden=messaging;el('admin-messaging-pane').hidden=!messaging;
    document.querySelectorAll('[data-admin-tab]').forEach(button=>{if((button.dataset.adminTab==='messaging')===messaging)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
    document.title=(messaging?'문자 발송 이력':'회원·구독 관리')+' · 트레이딩 마스터';
    if(messaging&&api.isAdmin()){if(!loaded)load();}
    else{if(el('message-results').getAttribute('aria-busy')==='true')loaded=false;seq++;controller?.abort();closeDetail();}
  }
  async function detail(kind,id){
    const current=++detailSeq,epoch=api.epoch();detailController?.abort();detailController=new AbortController();
    el('message-detail-title').textContent=kind==='signals'?'매매 신호 상세':'개별 발송 상세';el('message-detail-body').innerHTML='<p>조회 중입니다.</p>';
    if(!el('message-detail').open)el('message-detail').showModal();
    try{
      const result=await api.request('admin/messaging/'+kind+'/'+encodeURIComponent(id),undefined,detailController.signal);
      if(current!==detailSeq||epoch!==api.epoch()||!api.isAdmin()||!el('message-detail').open)return;
      if(kind==='signals'){
        const s=result.signal,c=result.totals.by_status;
        el('message-detail-body').innerHTML='<h3>'+escape(s.stock.name)+' · '+escape(actionLabels[s.action])+'</h3><p class="help">신호 #'+s.id+' · '+escape(time(s.observed_at))+'</p><div class="message-detail-counts"><p>이 신호의 전체 발송 기록 <b>'+number(result.totals.deliveries)+'</b>건</p><p>전달 완료 '+number(c.delivered)+' · 실패 '+number(c.failed)+' · 미확인 '+number(c.unknown)+'</p><p class="help">목록의 수신자·상태 필터와 관계없는 전체 기록입니다.</p></div><pre>'+escape(s.message)+'</pre><p class="help">출처 '+escape(s.source)+' · 이벤트 '+escape(s.source_event_id)+'</p><p class="help">유효 시각 '+escape(time(s.valid_until))+'</p><button type="button" class="primary" data-signal-records="'+s.id+'" data-signal-name="'+escape(s.stock.name)+'">현재 조건으로 발송 내역 보기</button>';
      }else{
        const d=result.delivery;
        const attempts=d.attempt_history.length?'<ol class="message-attempts">'+d.attempt_history.map(a=>'<li><b>'+a.number+'차 시도</b> '+status(a.status)+'<p>'+escape(time(a.started_at))+' ~ '+escape(time(a.finished_at))+'</p><p>업체 접수번호 '+escape(a.provider_id||'없음')+'</p>'+(a.error?'<p>'+escape(errorLabels[a.error]||a.error)+'</p>':'')+'</li>').join('')+'</ol>':'<p class="help">아직 업체 요청을 시도하지 않았습니다.</p>';
        el('message-detail-body').innerHTML='<h3>'+escape(d.stock.name)+' · '+escape(actionLabels[d.action])+'</h3><p>'+escape(String(d.phone).replace(/^(\d{3})(\d{4})(\d{4})$/,'$1-$2-$3'))+' · '+status(d.status)+'</p>'+(d.status==='unknown'?'<p class="test-note">업체에 이미 접수됐을 수 있어 결과 확인이 필요합니다. 자동 재발송하지 않습니다.</p>':'')+'<p class="help">발송번호 '+escape(d.id)+'<br>회원번호 '+escape(d.member_id||'기존 수동 수신자')+'</p><pre>'+escape(d.message)+'</pre><h3>발송 시도 이력</h3>'+attempts;
      }
    }catch(error){if(current===detailSeq&&epoch===api.epoch())el('message-detail-body').innerHTML='<p class="feedback error">'+escape(error.message)+'</p>';}
  }
  function signalRecords(button){closeDetail();filters=read();filters.signal_id=button.dataset.signalRecords;signalLabel=button.dataset.signalName||'';if(button.dataset.attention)el('message-status').value='attention';filters.status=el('message-status').value;setView('deliveries');load();}
  document.querySelectorAll('[data-admin-tab]').forEach(button=>button.addEventListener('click',()=>{location.hash=button.dataset.adminTab==='messaging'?'messaging':'members';}));
  document.querySelectorAll('[data-message-view]').forEach(button=>button.addEventListener('click',()=>{filters=read();setView(button.dataset.messageView);load();}));
  document.querySelectorAll('[data-message-days]').forEach(button=>button.addEventListener('click',()=>{dates(Number(button.dataset.messageDays));filters=read();delete filters.signal_id;load();}));
  document.querySelectorAll('[data-message-status]').forEach(button=>button.addEventListener('click',()=>{el('message-status').value=button.dataset.messageStatus;filters=read();load();}));
  el('message-search-form').addEventListener('submit',event=>{event.preventDefault();filters=read();load();});
  el('message-reset').addEventListener('click',()=>{reset();load();});
  el('message-refresh').addEventListener('click',()=>{filters=read();load();});
  el('message-limit').addEventListener('change',()=>{filters=read();load();});
  el('message-first').addEventListener('click',()=>{if(paging?.first)load(paging.first);});el('message-last').addEventListener('click',()=>{if(paging?.last)load(paging.last);});
  el('message-next').addEventListener('click',()=>{if(paging?.next)load(paging.next);});
  el('message-previous').addEventListener('click',()=>{if(paging?.previous)load(paging.previous);});
  el('message-clear-signal').addEventListener('click',()=>{delete filters.signal_id;load();});
  [el('message-results'),el('message-detail-body')].forEach(target=>target.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.signalRecords)signalRecords(b);else if(b.dataset.signalDetail)detail('signals',b.dataset.signalDetail);else if(b.dataset.deliveryDetail)detail('deliveries',b.dataset.deliveryDetail);}));
  el('message-detail-close').addEventListener('click',closeDetail);
  el('message-detail').addEventListener('cancel',()=>{detailSeq++;detailController?.abort();});
  window.addEventListener('hashchange',tab);
  window.addEventListener('tm-admin-session',event=>{if(!event.detail.authorized)clear();else if(active()&&!loaded)load();});
  reset();tab();
})();
