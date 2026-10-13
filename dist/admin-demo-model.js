/* Fictional, in-memory UI fixtures. This module is not authentication or a gateway. */
(function(root,factory){
  const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.TradingMasterAdminDemo=value;
})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  const PHONE='01000009999',PASSWORD='demo';
  const PRODUCT={code:'tm-common-signals',name:'트마 공통 매매 알림',price:null};
  const STATUS=['queued','sending','accepted','delivered','failed','unknown','skipped','expired'];
  const ACTIONS=['buy','add_buy','partial_sell','sell'];
  const WORDING='등록한 휴대폰 번호로 트마 공통 매수·매도 알림을 받는 데 동의합니다. 언제든 문자 수신을 끌 수 있습니다. 문자 수신 중단은 이용권·정기결제 해지와 별도이며, 이용 중인 앱 알림 확인 권한은 유지됩니다.';
  const STOCKS=[['010950','S-Oil'],['005930','삼성전자'],['000660','SK하이닉스'],['096770','SK이노베이션'],['035420','NAVER'],['035720','카카오'],['005380','현대차'],['000270','기아'],['006400','삼성SDI'],['051910','LG화학']];
  const mask=p=>p.slice(0,3)+'-****-'+p.slice(-4),id=n=>n.toString(16).padStart(32,'0');
  const memberId=n=>[0x85ebca6b,0xc2b2ae35,0x27d4eb2f,0x165667b1].map(s=>((Math.imul(n+1,s)^0x9e3779b9)>>>0).toString(16).padStart(8,'0')).join('');
  const copy=value=>JSON.parse(JSON.stringify(value));
  const day=seconds=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000));
  class DemoError extends Error{constructor(message,status=400){super(message);this.status=status;}}
  function date(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new DemoError('시작일과 종료일을 확인해 주세요.');
    const t=Date.parse(value+'T00:00:00+09:00')/1000;
    if(!Number.isFinite(t)||day(t)!==value||Number(value.slice(0,4))<2000||Number(value.slice(0,4))>2100)throw new DemoError('올바른 이용 날짜를 입력해 주세요.');
    return t;
  }
  class Demo{
    constructor({clock=()=>Date.now()/1000}={}){
      this.clock=clock;this.authorized=false;this.cursors=new Map();this.cursorNumber=0;
      const now=clock(),today=date(day(now));this.members=[];
      this.actor={id:memberId(9999),phone:PHONE,role:'admin'};
      for(let i=1;i<=240;i++){
        const type=i%8,exists=type!==5,enabled=[1,3,4,6,7].includes(type);
        let starts=today-15*86400,ends=today+30*86400,state='enabled';
        if(type===3)ends=today;if(type===6){starts=today+86400;ends=starts+30*86400;}
        if(type===4)state='paused';if(type===7)state='cancelled';
        const member={id:memberId(i),phone:'0105555'+String(i).padStart(4,'0'),role:'member',created_at:now-i*600,
          subscription:exists?{product_code:PRODUCT.code,kind:'manual',starts_at:starts,ends_at:ends,state,version:1}:null,
          sms:{enabled,updated_at:exists?now-86400:null},history:[],consents:[],index:i};
        member.trial={used:false,starts_at:null,ends_at:null};
        // Explicit fictional fixtures; constructing the demo never issues a real trial.
        if([9,11,12,17].includes(i)){
          const start=i===9||i===12?now-2*86400:now-12*86400,end=start+7*86400;
          member.trial={used:true,starts_at:start,ends_at:end};
          if(i===17)member.subscription.kind='paid';
          else Object.assign(member.subscription,{kind:'trial',starts_at:start,ends_at:end});
        }else if(exists&&i%10===0)member.subscription.kind='paid';
        if(exists)member.history.push({id:id(10000+i),action:'set_period',before:{},after:copy(member.subscription),note:'가상 회원의 샘플 이용 기간',created_at:now-2*86400,operator:mask(PHONE)});
        const count=i===1?47:i===8?3:exists?2:0;
        for(let v=1;v<=count;v++)member.consents.unshift({id:id(20000+i*100+v),enabled:v===count?enabled:Boolean(v%2),version:v,
          action:i===8&&v===3?'phone_changed':v===count?(enabled?'consented':'withdrawn'):v%2?'consented':'withdrawn',
          consent_version:'2026-10-12',consent_text:WORDING,created_at:now-(count-v+1)*3600,current_number:!(i===8&&v<3)});
        this.members.push(member);
      }
      this.members.push({...this.actor,created_at:now-365*86400,subscription:null,sms:{enabled:false,updated_at:null},history:[],consents:[],index:9999});
      this.signals=[];
      for(let i=1;i<=180;i++){
        const stock=STOCKS[(i-1)%STOCKS.length],action=ACTIONS[(i-1)%4];
        const observed=Math.min(now-i*60,today-Math.floor((i-1)/26)*86400+9*3600+((i-1)%26)*600);
        const message='[관리자 체험 · 가상 매매 신호]\n'+stock[1]+'\n'+({buy:'신규매수',add_buy:'추가매수',partial_sell:'부분매도',sell:'전량청산'}[action])+' 알림 문구 예시입니다.\n실제 운용 신호나 투자 권유가 아닙니다.';
        this.signals.push({id:i,stock:{symbol:stock[0],name:stock[1]},action,observed_at:new Date(observed*1000).toISOString(),created_at:observed,
          valid_until:new Date((observed+300)*1000).toISOString(),message,source:'fictional-admin-demo',source_event_id:'demo-event-'+i});
      }
      this.signals.sort((a,b)=>b.created_at-a.created_at||b.id-a.id);
    }
    access(member){
      const sub=member.subscription,now=this.clock();
      const status=!sub?'none':sub.state!=='enabled'?sub.state:now<sub.starts_at?'scheduled':now>=sub.ends_at?'expired':'active';
      const app=status==='active',ready=app&&member.sms.enabled;
      return {status,app,ready,state:ready?'ready':app?'app_only':'inactive'};
    }
    memberView(member,full=false){
      const a=this.access(member),s=member.subscription;
      const subscription=s?{status:a.status,kind:s.kind||'manual',state:s.state,product:PRODUCT,starts_at:s.starts_at,ends_at:s.ends_at,start_date:day(s.starts_at),end_date:day(s.ends_at-1),version:s.version}:
        {status:'none',kind:'none',state:null,product:null,starts_at:null,ends_at:null,start_date:null,end_date:null,version:0};
      return {id:member.id,[full?'phone':'phone_masked']:full?member.phone:mask(member.phone),role:member.role,created_at:member.created_at,subscription,trial:copy(member.trial||{used:false,starts_at:null,ends_at:null}),
        access:{paid_signals:a.app},signal_sms:{enabled:member.sms.enabled,updated_at:member.sms.updated_at,state:a.state,app_ready:a.app,sms_ready:a.ready}};
    }
    detail(member){return {member:this.memberView(member,true),history:copy(member.history.slice(0,20))};}
    member(key){const member=this.members.find(m=>m.id===key);if(!member)throw new DemoError('가상 회원을 찾을 수 없습니다.',404);return member;}
    integer(value,min,max){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new DemoError('조회 범위를 확인해 주세요.');return n;}
    cursor(value){const key='demo-cursor-'+(++this.cursorNumber);this.cursors.set(key,value);return key;}
    position(key,scope){if(!key)return null;const value=this.cursors.get(key);if(!value||value.scope!==scope)throw new DemoError('최신 내역을 다시 불러와 주세요.',409);return value;}
    page(items,limit,offset,scope){
      const total=items.length,last=Math.max(0,Math.floor((total-1)/limit)*limit);offset=Math.max(0,Math.min(offset,last));
      const token=n=>this.cursor({scope,offset:n});
      return {items:copy(items.slice(offset,offset+limit)),page:{total,shown:Math.min(limit,Math.max(0,total-offset)),limit,
        previous:offset>0?token(Math.max(0,offset-limit)):null,next:offset+limit<total?token(offset+limit):null,first:token(0),last:token(last)}};
    }
    listMembers(p){
      const q=(p.get('q')||'').replace(/[\s()-]/g,'').replace(/^\+82/,'0').toLowerCase(),status=p.get('status')||'all',sms=p.get('sms')||'all',delivery=p.get('delivery')||'all',kind=p.get('kind')||'all',trial=p.get('trial_usage')||'all';
      if(q.length>80||!['all','none','scheduled','active','expired','paused','cancelled'].includes(status)||!['all','on','off'].includes(sms)||!['all','ready','app_only','inactive'].includes(delivery)||!['all','none','manual','paid','trial'].includes(kind)||!['all','used','never'].includes(trial))throw new DemoError('검색 조건을 확인해 주세요.');
      const all=this.members.map(m=>this.memberView(m)),summary={total:all.length,none:0,scheduled:0,active:0,expired:0,paused:0,cancelled:0,sms_ready:0,app_only:0,trial_active:0,trial_expired:0,paid_active:0};
      for(const m of all){summary[m.subscription.status]++;if(m.signal_sms.sms_ready)summary.sms_ready++;if(m.signal_sms.state==='app_only')summary.app_only++;if(m.subscription.kind==='trial'&&m.subscription.status==='active')summary.trial_active++;if(m.subscription.kind==='trial'&&m.subscription.status==='expired')summary.trial_expired++;if(m.subscription.kind==='paid'&&m.subscription.status==='active')summary.paid_active++;}
      const rows=this.members.filter(m=>{const a=this.access(m);return (m.phone.includes(q)||m.id.includes(q))&&(status==='all'||a.status===status)&&(sms==='all'||m.sms.enabled===(sms==='on'))&&(delivery==='all'||a.state===delivery)&&(kind==='all'||(m.subscription?.kind||'none')===kind)&&(trial==='all'||Boolean(m.trial?.used)===(trial==='used'));});
      const limit=this.integer(p.get('limit')||20,1,100),pages=Math.max(1,Math.ceil(rows.length/limit)),page=Math.min(this.integer(p.get('page')||1,1,100000),pages);
      return {members:rows.slice((page-1)*limit,page*limit).map(m=>this.memberView(m)),total:rows.length,limit,page,pages,summary,product:PRODUCT,as_of:this.clock()};
    }
    audit(member,p){
      const scope='consent:'+member.id,position=this.position(p.get('cursor'),scope);
      const result=this.page(member.consents,20,position?.offset||0,scope);
      return {...result,current_phone_masked:mask(member.phone),as_of:this.clock(),new_records_available:false};
    }
    update(member,action,data){
      if(typeof data.expected_version!=='number'||!Number.isInteger(data.expected_version)||data.expected_version!==(member.subscription?.version||0))throw new DemoError('다른 화면에서 정보가 바뀌었습니다. 최신 정보를 불러와 주세요.',409);
      if(typeof (data.note||'')!=='string'||(data.note||'').length>300)throw new DemoError('변경 사유는 300자 이하로 입력해 주세요.');
      const before=member.subscription?copy(member.subscription):{},now=this.clock();let sub=member.subscription?copy(member.subscription):{state:'enabled',version:0,product_code:PRODUCT.code,kind:'manual'};
      if(action==='subscription'){
        if(data.kind!=null&&!['manual','paid'].includes(data.kind))throw new DemoError('관리자는 운영자 부여 또는 유료 이용권만 설정할 수 있습니다. 무료체험 재발급은 지원하지 않습니다.');
        if(sub.kind==='trial'&&data.kind==null)throw new DemoError('무료체험 기간은 변경할 수 없습니다. 다른 이용권으로 전환하려면 종류를 선택해 주세요.',409);
        sub.kind=data.kind||sub.kind;
        sub.starts_at=date(data.start_date);sub.ends_at=date(data.end_date)+86400;
        if(sub.ends_at<=sub.starts_at||sub.ends_at-sub.starts_at>3651*86400)throw new DemoError('이용 기간은 종료일 포함 최대 10년으로 입력해 주세요.');
      }else{
        if(!member.subscription)throw new DemoError('먼저 이용 기간을 설정해 주세요.',409);
        if(action==='extend'){
          if(sub.kind==='trial')throw new DemoError('무료체험은 기간을 연장하거나 재시작할 수 없습니다.',409);
          if(typeof data.days!=='number'||!Number.isInteger(data.days)||data.days<1||data.days>3650)throw new DemoError('연장 일수는 1일부터 3650일까지 입력해 주세요.');
          if(sub.ends_at<=now){sub.starts_at=date(day(now));sub.ends_at=sub.starts_at+data.days*86400;}else sub.ends_at+=data.days*86400;
          if(Number(day(sub.ends_at-1).slice(0,4))>2100||sub.ends_at-sub.starts_at>3651*86400)throw new DemoError('이용 기간은 2100년 이내, 최대 10년으로 설정해 주세요.');
        }else if(action==='state'){
          if(!['enabled','paused','cancelled'].includes(data.state))throw new DemoError('이용 상태를 확인해 주세요.');sub.state=data.state;
        }else throw new DemoError('체험 기능을 찾을 수 없습니다.',404);
      }
      sub.version++;member.subscription=sub;
      member.history.unshift({id:'demo-edit-'+sub.version+'-'+member.id,action:{subscription:'set_period',extend:'extend',state:'set_state'}[action],before,after:copy(sub),note:(data.note||'').trim(),operator:mask(PHONE),created_at:now});
      return this.detail(member);
    }
    delivery(signal,member){
      // Virtual rows keep large-page interaction light; no SMS worker runs here.
      const n=(signal.id*17+member.index)%100;
      const status=n<80?'delivered':n<88?'accepted':n<91?'queued':n<92?'sending':n<95?'failed':n<96?'unknown':n<99?'skipped':'expired';
      return {id:id(100000+signal.id*1000+member.index),signal_id:signal.id,member_id:member.id,phone_masked:mask(member.phone),stock:signal.stock,action:signal.action,status,
        mode:'mock',attempts:['queued','skipped','expired'].includes(status)?0:status==='failed'?2:1,
        last_error:status==='failed'?'delivery_failed':status==='unknown'?'gateway_result_unknown':status==='skipped'?'sms_opted_out':status==='expired'?'signal_expired':null,
        created_at:signal.created_at,updated_at:signal.created_at+10};
    }
    totals(rows){const by_status=Object.fromEntries(STATUS.map(s=>[s,0]));for(const r of rows)by_status[r.status]++;return {deliveries:rows.length,by_status,attention:by_status.failed+by_status.unknown};}
    messaging(kind,p){
      const start=p.get('start')||day(this.clock()-6*86400),end=p.get('end')||day(this.clock()),from=date(start),to=date(end)+86400;
      if(to<=from||to-from>366*86400)throw new DemoError('조회 기간은 최대 366일까지 입력해 주세요.');
      const stock=(p.get('stock')||'').trim().toLowerCase(),recipient=(p.get('recipient')||'').replace(/[\s()-]/g,''),action=p.get('action')||'all',status=p.get('status')||'all',signal_id=p.get('signal_id');
      if(!['all','attention',...STATUS].includes(status)||!['all','protection_update',...ACTIONS].includes(action))throw new DemoError('조회 조건을 확인해 주세요.');
      const signals=this.signals.filter(s=>s.created_at>=from&&s.created_at<to&&(!stock||s.stock.name.toLowerCase().includes(stock)||s.stock.symbol.includes(stock))&&(action==='all'||s.action===action)&&(!signal_id||String(s.id)===signal_id));
      const recipients=this.members.filter(m=>m.role!=='admin'&&(!recipient||m.phone.includes(recipient)||m.id===recipient));
      const overview=[],items=[];
      const fits=row=>status==='all'||(status==='attention'?['failed','unknown'].includes(row.status):row.status===status);
      for(const signal of signals){
        const rows=recipients.map(m=>this.delivery(signal,m));overview.push(...rows);
        if(kind==='signals'){if(status==='all'||rows.some(fits))items.push({...signal,totals:this.totals(rows)});}
        else items.push(...rows.filter(fits));
      }
      const filters={start,end,stock,recipient,action,status,signal_id:signal_id||'',limit:this.integer(p.get('limit')||50,1,200)};
      if(![50,100,200].includes(filters.limit))throw new DemoError('한 번에 50·100·200건을 선택해 주세요.');
      const scope='messages:'+kind+':'+JSON.stringify(filters),position=this.position(p.get('cursor'),scope);
      const offset=position?.offset||(p.get('edge')==='last'?Math.max(0,Math.floor((items.length-1)/filters.limit)*filters.limit):0);
      return {...this.page(items,filters.limit,offset,scope),totals:{...this.totals(overview),signals:signals.length},filters,available:true,mode:'mock',as_of:this.clock()};
    }
    messageDetail(kind,key){
      if(kind==='signals'){
        const signal=this.signals.find(s=>String(s.id)===key);if(!signal)throw new DemoError('가상 신호를 찾을 수 없습니다.',404);
        return {signal:copy(signal),totals:this.totals(this.members.filter(m=>m.role!=='admin').map(m=>this.delivery(signal,m))),mode:'mock'};
      }
      if(!/^[a-f0-9]{32}$/.test(key))throw new DemoError('발송 기록을 확인해 주세요.');
      const number=parseInt(key,16)-100000,signal=this.signals.find(s=>s.id===Math.floor(number/1000)),member=this.members.find(m=>m.index===number%1000);
      if(!signal||!member)throw new DemoError('가상 발송 기록을 찾을 수 없습니다.',404);
      const row=this.delivery(signal,member);return {delivery:{...row,phone:member.phone,message:signal.message,attempt_history:Array.from({length:row.attempts},(_,i)=>({number:i+1,status:row.status,started_at:row.created_at,finished_at:row.updated_at,provider_id:'DEMO-'+row.signal_id+'-'+member.index+'-'+i,error:row.last_error}))},mode:'mock'};
    }
    request(path,data){
      const [route,query='']=path.split('?'),p=new URLSearchParams(query);
      if(route==='auth/session'&&data===undefined)return {member:this.authorized?copy(this.actor):null,csrf_token:'demo-only',verification_mode:'demo',expires_at:this.clock()+3600};
      if(route==='auth/login'&&data!==undefined){
        if(String(data.phone).replace(/\D/g,'')!==PHONE||data.password!==PASSWORD)throw new DemoError('체험 계정만 사용할 수 있습니다. 입력된 테스트 계정으로 입장해 주세요.',401);
        this.authorized=true;return this.request('auth/session');
      }
      if(route==='auth/logout'&&data!==undefined){this.authorized=false;this.cursors.clear();return this.request('auth/session');}
      if(!route.startsWith('admin/'))throw new DemoError('이 링크에서는 관리자 화면 체험만 제공됩니다.',404);
      if(!this.authorized)throw new DemoError('테스트 계정으로 입장해 주세요.',401);
      if(route==='admin/members'&&data===undefined)return this.listMembers(p);
      let match=route.match(/^admin\/members\/([a-f0-9]{32})(?:\/(sms-consents|subscription|extend|state))?$/);
      if(match){const member=this.member(match[1]),action=match[2];if(!action&&data===undefined)return this.detail(member);if(action==='sms-consents'&&data===undefined)return this.audit(member,p);if(data!==undefined&&['subscription','extend','state'].includes(action))return this.update(member,action,data);}
      match=route.match(/^admin\/messaging\/(signals|deliveries)(?:\/([a-f0-9]+))?$/);
      if(match&&data===undefined)return match[2]?this.messageDetail(match[1],match[2]):this.messaging(match[1],p);
      throw new DemoError('이 체험 화면에서 제공하지 않는 기능입니다.',404);
    }
  }
  return Object.freeze({Demo,DemoError,PHONE,PASSWORD});
});
