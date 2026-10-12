(function () {
  'use strict';
  const M=window.PaymentDemoModel, $=id=>document.getElementById(id);
  const KEY='trma-payment-demo-v1';
  const nf=new Intl.NumberFormat('ko-KR'), won=n=>nf.format(n)+'원', date=s=>s.replaceAll('-','.');
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function todayKST() {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
  }
  const realToday=todayKST();
  let state=M.create(realToday), storageAvailable=true, pending=null, toastTimer;
  try {const raw=localStorage.getItem(KEY);if(raw)state=M.normalize(JSON.parse(raw),realToday);}catch(e){storageAvailable=false;}
  const params=new URLSearchParams(location.search);
  const selection={tier:M.TIERS[params.get('tier')]?params.get('tier'):'basic',plan:['credit','subscription'].includes(params.get('plan'))?params.get('plan'):'subscription'};
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){storageAvailable=false;}}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);}
  function rememberSelection(){try{const u=new URL(location.href);u.searchParams.set('tier',selection.tier);u.searchParams.set('plan',selection.plan);history.replaceState(null,'',u);}catch(e){}}
  function renderSelection(){
    const tier=M.TIERS[selection.tier], monthly=selection.plan==='subscription', price=monthly?tier.monthlyPrice:tier.packPrice;
    document.querySelectorAll('[data-tier]').forEach(b=>{const on=b.dataset.tier===selection.tier;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));b.querySelector('.tier-action').textContent=on?'선택됨':'선택하기';});
    $('grade-selection-feedback').textContent='현재 선택: '+tier.name;
    document.querySelectorAll('[data-plan]').forEach(b=>{const on=b.dataset.plan===selection.plan;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
    $('monthly-price').textContent=nf.format(tier.monthlyPrice);$('credit-price').textContent=nf.format(tier.packPrice);$('pack-pill').textContent=tier.packCount+'건 구매';
    $('order-title').textContent=tier.name+' '+(monthly?'월정액':'충전권 '+tier.packCount+'건');
    $('order-description').textContent=monthly?'해당 등급의 공통 운용 현황과 새 매수·매도 신호를 이용 기간 동안 받아보세요.':'해당 등급의 신호가 발생하면 정보 1건씩 사용합니다. 남은 건수는 다음에도 사용할 수 있어요.';
    $('order-tier').textContent=tier.name;$('order-benefit').textContent=monthly?'기간 내 모든 신호':tier.packCount+'건 · 남은 건수 보관';$('order-method').textContent=monthly?'매월 자동갱신':'한 번 결제 · 자동 재결제 없음';
    $('order-total').innerHTML=nf.format(price)+'<small>원</small>';
    const active=M.isSubscriptionActive(state), blocked=monthly && active;
    $('checkout-open').disabled=blocked;
    $('checkout-open').innerHTML=blocked?(state.subscription.tier===selection.tier?'이 월정액을 이용 중이에요':'월정액 종료 체험 후 선택'):(won(price)+' 모의 결제 <span aria-hidden="true">→</span>');
    $('checkout-note').textContent=blocked?'중복 구독을 만들지 않아요. 아래 내 이용권에서 구독 종료 상황을 체험한 뒤 다른 등급을 선택하세요.':monthly?'매월 '+won(price)+' 자동갱신. 갱신을 해지해도 결제한 기간까지 이용합니다.':active?'현재 월정액이 우선 적용되며, 구매한 충전권은 차감 없이 보관됩니다.':tier.packCount+'건을 모두 사용하면 수신이 중단됩니다. 추가 구매는 직접 선택합니다.';
    renderComparison();
  }
  function renderComparison(){
    const r=M.compare(selection.tier,$('usage-input').value);
    $('comparison-credit').textContent=won(r.creditCost);$('comparison-month').textContent=won(r.monthlyCost);
    $('comparison-left').textContent=r.packs+'개 묶음 구매 · '+r.left+'건 보관';
    const delta=r.creditCost-r.monthlyCost;
    $('comparison-result').textContent=delta<0?'이 수신량에서는 충전 구매액이 '+won(-delta)+' 적어요.':delta>0?'이 수신량에서는 월정액 결제액이 '+won(delta)+' 적어요.':r.left?'이번 달 구매액은 같고, 충전형은 '+r.left+'건이 남아 다음에도 쓸 수 있어요.':'이번 달 구매액은 같아요. 기간과 잔여 건수 기준으로 선택하세요.';
  }
  function renderAccount(){
    const active=M.isSubscriptionActive(state), tier=M.TIERS[state.activeTier], credit=state.mode==='credit' && state.credits[state.activeTier]>0;
    const ended=state.history.length>0 && !active && !credit;
    $('account-status').textContent=active?'월정액 이용 중':credit?'충전형 수신 중':ended?'신규 수신 중단':'이용권 없음';
    $('account-status').className='status-badge'+(active||credit?' active':ended?' ended':'');
    $('virtual-date').textContent='체험 날짜 '+date(state.today);
    $('account-product').textContent=active?tier.name+' 월정액':credit?tier.name+' 충전형':ended?'다음 이용 방식을 선택해주세요':'이용권을 먼저 선택해보세요';
    $('account-description').textContent=active?'새 공통 신호를 건수 차감 없이 받습니다. 기존 충전권은 보관 중이에요.':credit?'앞으로 발생하는 '+tier.name+' 신호마다 1건씩 자동 사용합니다.':ended?'매수·매도 모두 중단된 상태예요. 구매하거나 남은 충전권으로 수신을 재개할 수 있어요.':'위에서 모의 결제를 완료하면 신호 수신을 체험할 수 있어요.';
    $('account-facts').innerHTML=active?'<div><span>'+(state.subscription.autoRenew?'다음 갱신일':'이용 종료일')+'</span><strong>'+date(state.subscription.expires)+'</strong></div><div><span>자동갱신</span><strong>'+(state.subscription.autoRenew?'켜짐 · '+won(tier.monthlyPrice):'꺼짐 · 기간까지 이용')+'</strong></div>':credit?'<div><span>현재 남은 정보</span><strong>'+state.credits[state.activeTier]+'건</strong></div><div><span>추가 결제</span><strong>직접 구매 선택</strong></div>':'';
    $('balance-grid').innerHTML=Object.keys(M.TIERS).map(key=>'<div class="balance-cell'+(key===state.activeTier?' on':'')+'"><span>'+M.TIERS[key].name+'</span><strong>'+state.credits[key]+'<small>건</small></strong></div>').join('');
    let actions='';
    if(active){
      actions+='<button class="secondary" data-account="renewal">'+(state.subscription.autoRenew?'다음 결제 중단':'자동갱신 다시 켜기')+'</button><button class="secondary" data-account="advance">다음 결제일로 이동</button><button class="secondary" data-account="end">구독 종료 상황 보기</button>';
    }else{
      actions+='<button class="secondary" data-account="buy">이용권 선택하기</button>';
      for(const key of Object.keys(M.TIERS))if(state.credits[key]>0 && !(credit && key===state.activeTier))actions+='<button class="secondary resume" data-resume="'+key+'">'+M.TIERS[key].name+' '+state.credits[key]+'건으로 수신 재개</button>';
      if(credit)actions+='<button class="secondary" data-account="topup">다시 충전하기</button><button class="secondary" data-account="monthly">월정액으로 전환하기</button>';
    }
    actions+='<p class="account-help">'+(storageAvailable?'체험 기록은 이 브라우저에만 저장됩니다.':'이 브라우저에서는 저장이 제한되어 새로고침하면 체험이 초기화됩니다.')+'</p>';
    $('account-actions').innerHTML=actions;
    renderMessage();
    $('history-count').textContent=state.history.length+'건';
    $('history-list').innerHTML=state.history.length?state.history.map(h=>'<li><span>'+date(h.date).slice(5)+'</span><div><p>'+escape(h.title)+'</p><small>'+escape(h.detail)+'</small></div></li>').join(''):'<li class="history-empty">아직 체험 이력이 없습니다.</li>';
  }
  function renderMessage(){
    const msg=state.lastMessage;
    $('message-stage').innerHTML=msg?'<div class="message-time">'+date(msg.date)+' · 체험 신호 #'+msg.id+'</div><div class="message-bubble"><b>[트마 · '+M.TIERS[msg.tier].name+' · 예시 '+msg.type+']</b><p>샘플종목 A의 '+msg.type+' 정보입니다.<br>트마 공통 운용 기준으로 안내합니다.</p><small>실제 종목·투자 판단과 무관한 체험용 메시지입니다.</small></div>':'<p class="message-empty">신호를 발생시키면<br>문자 예시가 여기에 나타나요.</p>';
  }
  function render(){save();renderAccount();renderSelection();}
  function scrollToAccount(){document.querySelector('#account').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('account-title').focus({preventScroll:true});}
  function choose(tier,plan){if(M.TIERS[tier])selection.tier=tier;if(['credit','subscription'].includes(plan))selection.plan=plan;rememberSelection();renderSelection();}
  document.querySelectorAll('[data-tier]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.tier,selection.plan)));
  document.querySelectorAll('[data-plan]').forEach(b=>b.addEventListener('click',()=>choose(selection.tier,b.dataset.plan)));
  $('usage-input').addEventListener('input',()=>{$('usage-range').value=Math.min(120,Number($('usage-input').value)||0);renderComparison();});
  $('usage-input').addEventListener('change',()=>{$('usage-input').value=M.compare(selection.tier,$('usage-input').value).count;renderComparison();});
  $('usage-range').addEventListener('input',()=>{$('usage-input').value=$('usage-range').value;renderComparison();});
  const checkout=$('checkout-dialog');
  $('checkout-open').addEventListener('click',()=>{
    const tier=M.TIERS[selection.tier], monthly=selection.plan==='subscription', price=monthly?tier.monthlyPrice:tier.packPrice;
    if(monthly && M.isSubscriptionActive(state))return;
    pending={tier:selection.tier,plan:selection.plan};
    $('dialog-store').textContent=document.querySelector('input[name=store]:checked').value+' · 화면 체험';
    $('checkout-title').textContent=tier.name+' '+(monthly?'월정액':'충전권 '+tier.packCount+'건');
    $('dialog-amount').innerHTML=won(price)+'<small>'+(monthly?'매월 · 자동갱신':'1회 구매')+'</small>';
    $('dialog-terms').innerHTML=monthly?'<p><strong>'+tier.name+' 등급에서 발생하는 모든 확정 신호</strong>와 공통 운용 현황을 이용합니다.</p><p>다음 모의 결제일: '+date(M.nextMonth(state.today))+'<br>매월 '+won(price)+' 자동갱신 · 갱신 해지 가능</p><p>남은 충전권은 보관하며 추가 차감하지 않습니다. 월 신호 수를 보장하지 않습니다.</p>':'<p><strong>'+tier.name+' 정보 '+tier.packCount+'건</strong>을 구매합니다. 앞으로 발생하는 공통 매수·매도 신호마다 자동으로 1건씩 사용합니다.</p><p>남은 건수는 보관됩니다. 소진하면 매수·매도 모두 중단되며 추가 구매는 직접 선택합니다.</p><p>'+(M.isSubscriptionActive(state)?'현재 월정액을 유지하고 충전권은 보관합니다.':'현재 수신 등급이 '+tier.name+'으로 바뀝니다. 다른 등급의 남은 건수는 보관됩니다.')+'</p>';
    $('checkout-consent').checked=false;$('checkout-confirm').disabled=true;checkout.showModal();
  });
  $('checkout-consent').addEventListener('change',()=>{$('checkout-confirm').disabled=!$('checkout-consent').checked;});
  $('checkout-form').addEventListener('submit',e=>{
    e.preventDefault();if(!pending || !$('checkout-consent').checked)return;
    try{M.buy(state,pending.tier,pending.plan);const bought=M.TIERS[pending.tier];pending=null;checkout.close();render();$('signal-feedback').textContent='모의 결제가 완료됐어요. 신호 발생 버튼으로 수신을 체험해보세요.';toast(bought.name+' 이용권 모의 결제가 완료됐어요.');scrollToAccount();}catch(err){toast(err.message);}
  });
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>checkout.close()));
  checkout.addEventListener('close',()=>{pending=null;});
  checkout.addEventListener('click',e=>{if(e.target===checkout){const r=checkout.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)checkout.close();}});
  function simulate(n){const r=M.signals(state,n);render();$('signal-feedback').textContent=n+'건 발생 → '+r.delivered+'건 제공 · '+r.used+'건 사용'+(r.skipped?' · '+r.skipped+'건 수신 중단':'');if(r.skipped)toast('이용권이 없는 신호는 제공되지 않아요. 추가 이용을 선택해주세요.');}
  $('signal-one').addEventListener('click',()=>simulate(1));$('signal-ten').addEventListener('click',()=>simulate(10));
  $('account-actions').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    try{
      if(b.dataset.resume){M.resume(state,b.dataset.resume);render();toast('충전형 수신을 재개했어요.');return;}
      const a=b.dataset.account;
      if(a==='renewal'){M.toggleRenewal(state);render();toast(state.subscription.autoRenew?'자동갱신을 다시 켰어요.':'다음 결제만 중단했어요. 남은 기간은 계속 이용해요.');}
      else if(a==='advance'||a==='end'){M.advanceToRenewal(state,a==='end');render();$('signal-feedback').textContent=state.mode==='subscription'?'월정액이 모의 갱신됐어요. 충전권은 그대로 보관돼요.':'기간이 끝나 수신이 중단됐어요. 남은 충전권은 자동 사용하지 않아요.';toast(state.mode==='subscription'?'월정액 자동갱신을 체험했어요.':'구독 종료 상태로 이동했어요.');}
      else if(['buy','topup','monthly'].includes(a)){choose(state.activeTier,a==='monthly'?'subscription':a==='topup'?'credit':selection.plan);document.querySelector('#products').scrollIntoView({behavior:'smooth',block:'start'});$('checkout-open').focus({preventScroll:true});}
    }catch(err){toast(err.message);}
  });
  function scenario(name){
    state=M.create(realToday);M.buy(state,'basic','credit');
    if(name==='exhaust'){M.signals(state,10);choose('basic','credit');$('signal-feedback').textContent='10건을 모두 사용해 수신이 중단됐어요. 다시 충전하거나 월정액을 선택할 수 있어요.';}
    else{M.signals(state,8);M.buy(state,'basic','subscription');choose('basic','subscription');if(name==='expire'){M.advanceToRenewal(state,true);$('signal-feedback').textContent='월정액이 끝나도 2건은 보관돼요. 충전형 수신 재개는 직접 선택해요.';}else{$('signal-feedback').textContent='기존 2건은 보관 중이에요. 신호를 추가로 발생시켜도 월정액이라 차감되지 않아요.';}}
    render();scrollToAccount();toast('선택한 사례로 체험 상태를 바꿨어요.');
  }
  document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',()=>scenario(b.dataset.scenario)));
  $('reset-demo').addEventListener('click',()=>{state=M.create(realToday);render();$('signal-feedback').textContent='초기화했어요. 다른 상품을 모의 결제해보세요.';toast('체험 이력을 초기화했어요.');});
  const share=$('share-dialog');
  $('share-link').addEventListener('click',async()=>{
    const u=new URL(location.href);u.hash='';u.search='';u.searchParams.set('tier',selection.tier);u.searchParams.set('plan',selection.plan);
    try{await navigator.clipboard.writeText(u.href);toast('링크를 복사했어요. 동업자에게 공유해주세요.');}catch(err){$('share-url').value=u.href;share.showModal();$('share-url').select();}
  });
  document.querySelectorAll('[data-close-share]').forEach(b=>b.addEventListener('click',()=>share.close()));
  window.addEventListener('storage',e=>{if(e.key===KEY){try{state=e.newValue?M.normalize(JSON.parse(e.newValue),realToday):M.create(realToday);renderAccount();renderSelection();toast('다른 창의 체험 상태를 반영했어요.');}catch(err){}}});
  render();
})();
