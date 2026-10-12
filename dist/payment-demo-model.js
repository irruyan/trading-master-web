(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.PaymentDemoModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TIERS = Object.freeze({
    basic: Object.freeze({key:'basic', name:'기본', packPrice:10000, packCount:10, monthlyPrice:30000}),
    advanced: Object.freeze({key:'advanced', name:'심화', packPrice:100000, packCount:40, monthlyPrice:100000}),
    premium: Object.freeze({key:'premium', name:'프리미엄', packPrice:300000, packCount:30, monthlyPrice:300000})
  });
  const TYPES = ['매수', '추가매수', '부분매도', '전량매도'];
  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
  }
  function nextMonth(value) {
    const d = new Date(value + 'T00:00:00Z'), year=d.getUTCFullYear(), month=d.getUTCMonth()+1;
    const last = new Date(Date.UTC(year,month+1,0)).getUTCDate();
    return new Date(Date.UTC(year,month,Math.min(d.getUTCDate(),last))).toISOString().slice(0,10);
  }
  function create(today) {
    if (!validDate(today)) throw new Error('잘못된 체험 날짜입니다.');
    return {version:1, today, credits:{basic:0,advanced:0,premium:0}, mode:'off', activeTier:'basic', subscription:null, history:[], lastMessage:null, signalSequence:0, payments:0};
  }
  function log(state, title, detail) {
    state.history.unshift({date:state.today,title,detail});
    state.history=state.history.slice(0,80);
  }
  function isSubscriptionActive(state) {
    return !!(state.subscription && state.today < state.subscription.expires);
  }
  function buy(state, tierKey, plan) {
    const tier = TIERS[tierKey];
    if (!tier || !['credit','subscription'].includes(plan)) throw new Error('상품을 다시 선택해주세요.');
    if (plan === 'subscription' && isSubscriptionActive(state)) throw new Error('이미 이용 중인 월정액이 있어요. 구독 종료 체험 후 다른 월정액을 선택해주세요.');
    if (plan === 'credit') {
      state.credits[tierKey] += tier.packCount;
      state.payments += tier.packPrice;
      if (!isSubscriptionActive(state)) { state.activeTier=tierKey;state.mode='credit'; }
      log(state,tier.name+' 충전권 '+tier.packCount+'건 모의 구매',tier.packPrice.toLocaleString('ko-KR')+'원 · 남은 '+state.credits[tierKey]+'건'+(isSubscriptionActive(state)?' 보관 · 월정액 우선 이용':' · 앞으로 발생하는 신호부터 수신'));
    } else {
      state.activeTier=tierKey;state.mode='subscription';
      state.subscription={tier:tierKey,starts:state.today,expires:nextMonth(state.today),autoRenew:true};
      state.payments+=tier.monthlyPrice;
      log(state,tier.name+' 월정액 모의 구매',tier.monthlyPrice.toLocaleString('ko-KR')+'원 · 다음 갱신 '+state.subscription.expires+' · 기존 충전권 보관');
    }
    return state;
  }
  function signals(state, count) {
    const amount = Math.max(0,Math.min(100,Math.floor(Number(count)||0)));
    let delivered=0, used=0;
    for (let i=0;i<amount;i++) {
      state.signalSequence++;
      if (isSubscriptionActive(state)) {
        state.activeTier=state.subscription.tier;state.mode='subscription';delivered++;
      } else if (state.mode==='credit' && state.credits[state.activeTier]>0) {
        state.credits[state.activeTier]--;used++;delivered++;
        if (!state.credits[state.activeTier]) state.mode='off';
      } else continue;
      state.lastMessage={date:state.today, tier:state.activeTier, type:TYPES[(state.signalSequence-1)%4], id:state.signalSequence, source:used>0?'credit':'subscription'};
    }
    const skipped=amount-delivered;
    log(state,'공통 신호 '+amount+'건 발생',delivered+'건 제공 · '+used+'건 사용'+(skipped?' · 이용권 없음으로 '+skipped+'건 중단':''));
    return {delivered,used,skipped};
  }
  function toggleRenewal(state) {
    if (!isSubscriptionActive(state)) throw new Error('이용 중인 월정액이 없어요.');
    state.subscription.autoRenew=!state.subscription.autoRenew;
    log(state,state.subscription.autoRenew?'자동갱신 다시 켜기':'다음 결제 중단',state.subscription.autoRenew?'다음 갱신일에 동일 월정액으로 갱신되는 체험입니다.':state.subscription.expires+'까지 계속 이용 · 충전권 보관');
  }
  function advanceToRenewal(state, forceEnd) {
    if (!isSubscriptionActive(state)) throw new Error('이용 중인 월정액이 없어요.');
    const sub=state.subscription;
    if (forceEnd) sub.autoRenew=false;
    state.today=sub.expires;
    if (sub.autoRenew) {
      sub.starts=state.today;sub.expires=nextMonth(state.today);
      const tier=TIERS[sub.tier];state.payments+=tier.monthlyPrice;state.mode='subscription';
      log(state,tier.name+' 월정액 자동갱신 체험',tier.monthlyPrice.toLocaleString('ko-KR')+'원 모의 결제 · 다음 갱신 '+sub.expires);
    } else {
      state.mode='off';
      log(state,'월정액 이용 기간 종료','모든 신규 신호 수신 중단 · 남은 충전권 자동 사용 없음');
    }
  }
  function resume(state,tierKey) {
    if (!TIERS[tierKey]) throw new Error('정보 등급을 다시 선택해주세요.');
    if (isSubscriptionActive(state)) throw new Error('월정액 이용 중에는 충전권을 사용하지 않아요.');
    if (state.credits[tierKey]<=0) throw new Error('남은 충전권이 없어요. 추가 구매를 선택해주세요.');
    state.activeTier=tierKey;state.mode='credit';
    log(state,TIERS[tierKey].name+' 충전형 수신 재개','앞으로 발생하는 신규 신호부터 사용 · 남은 '+state.credits[tierKey]+'건');
  }
  function compare(tierKey, count) {
    const tier=TIERS[tierKey];
    const n=Math.max(0,Math.min(300,Math.floor(Number(count)||0)));
    const packs=Math.ceil(n/tier.packCount);
    return {count:n,packs,creditCost:packs*tier.packPrice,monthlyCost:tier.monthlyPrice,left:packs*tier.packCount-n};
  }
  function normalize(value,today) {
    if (!value || value.version!==1 || !validDate(value.today) || !TIERS[value.activeTier] || !['off','credit','subscription'].includes(value.mode)) return create(today);
    const state=create(value.today);
    for(const key of Object.keys(TIERS)) {
      const n=value.credits && value.credits[key];
      if (!Number.isSafeInteger(n) || n<0 || n>1000000) return create(today);
      state.credits[key]=n;
    }
    state.activeTier=value.activeTier;state.mode=value.mode;
    if (value.subscription) {
      const s=value.subscription;
      if (!TIERS[s.tier] || !validDate(s.starts) || !validDate(s.expires) || s.starts>=s.expires || typeof s.autoRenew!=='boolean') return create(today);
      state.subscription={tier:s.tier,starts:s.starts,expires:s.expires,autoRenew:s.autoRenew};
    }
    if (state.mode==='subscription' && !isSubscriptionActive(state)) state.mode='off';
    if (isSubscriptionActive(state)) {state.activeTier=state.subscription.tier;state.mode='subscription';}
    if (state.mode==='credit' && !state.credits[state.activeTier]) state.mode='off';
    state.payments=Number.isSafeInteger(value.payments)&&value.payments>=0?value.payments:0;
    state.signalSequence=Number.isSafeInteger(value.signalSequence)&&value.signalSequence>=0?value.signalSequence:0;
    state.history=Array.isArray(value.history)?value.history.filter(x=>x && validDate(x.date) && typeof x.title==='string' && typeof x.detail==='string').slice(0,80).map(x=>({date:x.date,title:x.title.slice(0,150),detail:x.detail.slice(0,250)})):[];
    const msg=value.lastMessage;
    if(msg && validDate(msg.date) && TIERS[msg.tier] && TYPES.includes(msg.type) && Number.isSafeInteger(msg.id) && ['credit','subscription'].includes(msg.source)) state.lastMessage={date:msg.date,tier:msg.tier,type:msg.type,id:msg.id,source:msg.source};
    return state;
  }
  return Object.freeze({TIERS,TYPES,create,buy,signals,toggleRenewal,advanceToRenewal,resume,compare,normalize,nextMonth,isSubscriptionActive});
});
