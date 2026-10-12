const assert=require('node:assert/strict');
const test=require('node:test');
const {Demo,PHONE,PASSWORD}=require('../dist/admin-demo-model.js');
const now=Date.parse('2026-10-12T16:00:00+09:00')/1000;
const login=demo=>demo.request('auth/login',{phone:PHONE,password:PASSWORD});

test('the standalone demo uses only fictional credentials, no real account and no send endpoints',()=>{
  const demo=new Demo({clock:()=>now});
  assert.equal(demo.request('auth/session').member,null);
  assert.throws(()=>demo.request('admin/members'),e=>e.status===401);
  assert.throws(()=>demo.request('auth/login',{phone:PHONE,password:'wrong'}),e=>e.status===401);
  assert.equal(login(demo).member.role,'admin');
  for(const path of ['auth/signup','admin/dispatch','admin/retry','members/sms-preference'])assert.throws(()=>demo.request(path,{}),e=>e.status===404);
  demo.request('auth/logout',{});assert.equal(demo.request('auth/session').member,null);
  assert.equal(new Demo({clock:()=>now}).request('auth/session').member,null);
});

test('consent and current entitlement remain separate in search, summary and period edits',()=>{
  const demo=new Demo({clock:()=>now});login(demo);
  const all=demo.request('admin/members?limit=20');assert.equal(all.total,241);assert.equal(all.members.length,20);
  const onExpired=demo.request('admin/members?sms=on&status=expired');assert.equal(onExpired.total,30);
  assert.equal(onExpired.members[0].signal_sms.state,'inactive');assert.deepEqual(onExpired.summary,all.summary);
  const app=demo.request('admin/members?delivery=app_only');assert.equal(app.total,60);
  const one=demo.request('admin/members?q=0001');assert.equal(one.total,1);
  const member=demo.member(one.members[0].id),originalSms=JSON.stringify(member.sms);
  demo.request('admin/members/'+member.id+'/extend',{days:30,expected_version:1,note:'trial'});
  assert.equal(member.subscription.version,2);assert.equal(JSON.stringify(member.sms),originalSms);
  assert.throws(()=>demo.request('admin/members/'+member.id+'/extend',{days:30,expected_version:1}),e=>e.status===409);
  demo.request('admin/members/'+member.id+'/state',{state:'paused',expected_version:2});assert.equal(demo.memberView(member).signal_sms.state,'inactive');
  demo.request('admin/members/'+member.id+'/extend',{days:10,expected_version:3});assert.equal(member.subscription.state,'paused');
  assert.equal(new Demo({clock:()=>now}).members[0].subscription.version,1,'another tab/refresh has an independent fixture');
});

test('consent pages preserve exact wording and target scope; admin cannot change customer consent',()=>{
  const demo=new Demo({clock:()=>now});login(demo);const member=demo.members[0],path='admin/members/'+member.id+'/sms-consents';
  const first=demo.request(path),second=demo.request(path+'?cursor='+first.page.next),third=demo.request(path+'?cursor='+second.page.next);
  assert.equal(first.page.total,47);assert.equal(first.items.length,20);assert.equal(second.items.length,20);assert.equal(third.items.length,7);
  assert.deepEqual(demo.request(path+'?cursor='+third.page.previous).items,second.items);
  assert.match(first.items[0].consent_text,/언제든 문자 수신을 끌 수 있습니다/);
  assert.throws(()=>demo.request('admin/members/'+demo.members[1].id+'/sms-consents?cursor='+first.page.next),e=>e.status===409);
  assert.throws(()=>demo.request(path,{enabled:true}),e=>e.status===404);
  const changed=demo.request('admin/members/'+demo.members[7].id+'/sms-consents');assert.equal(changed.items[0].action,'phone_changed');assert.equal(changed.items[1].current_number,false);
});

test('large virtual delivery pages and drilldowns match global and filtered counts',()=>{
  const demo=new Demo({clock:()=>now});login(demo);
  const groups=demo.request('admin/messaging/signals?limit=50');assert.equal(groups.page.total,180);assert.equal(groups.totals.deliveries,43200);
  const rows=demo.request('admin/messaging/deliveries?limit=200');assert.equal(rows.items.length,200);assert.equal(rows.page.total,43200);
  const next=demo.request('admin/messaging/deliveries?limit=200&cursor='+rows.page.next);assert.equal(new Set([...rows.items,...next.items].map(x=>x.id)).size,400);
  const last=demo.request('admin/messaging/deliveries?limit=200&cursor='+rows.page.last);assert.equal(last.page.next,null);
  const issues=demo.request('admin/messaging/deliveries?status=attention');assert.equal(issues.page.total,issues.totals.attention);
  assert.deepEqual(issues.totals,rows.totals);assert(issues.items.every(x=>['failed','unknown'].includes(x.status)));
  const signal=groups.items[0],details=demo.request('admin/messaging/signals/'+signal.id);assert.equal(details.totals.deliveries,240);
  const scoped=demo.request('admin/messaging/deliveries?signal_id='+signal.id+'&recipient=0001');assert.equal(scoped.page.total,1);
  const delivery=demo.request('admin/messaging/deliveries/'+scoped.items[0].id).delivery;
  assert.equal(delivery.phone,'01055550001');assert.equal(delivery.message,signal.message);
  assert.match(delivery.message,/가상 매매 신호/);
  assert.throws(()=>demo.request('admin/messaging/signals?start=2026-10-12&end=2026-10-11'));
});
