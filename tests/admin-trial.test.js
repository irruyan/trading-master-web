const assert=require('node:assert/strict');
const test=require('node:test');
const {Demo,PHONE,PASSWORD}=require('../dist/admin-demo-model.js');
const initial=Date.parse('2026-10-13T14:27:39+09:00')/1000;
function fixture(){let now=initial;const demo=new Demo({clock:()=>now});demo.request('auth/login',{phone:PHONE,password:PASSWORD});return {demo,time:value=>{now=value;}};}
test('trial and paid filters intersect status and immutable usage including converted members',()=>{
  const {demo}=fixture();const all=demo.request('admin/members');
  const trial=demo.request('admin/members?kind=trial');assert.equal(trial.total,3);
  assert.equal(trial.summary.trial_active,1);assert.equal(trial.summary.trial_expired,1);
  assert.equal(demo.request('admin/members?trial_usage=used').total,4);
  const converted=demo.request('admin/members?trial_usage=used&kind=paid');assert.equal(converted.total,1);assert.equal(converted.members[0].phone_masked,'010-****-0017');
  assert.deepEqual(converted.summary,all.summary);
  for(const query of ['kind=invalid','trial_usage=invalid'])assert.throws(()=>demo.request('admin/members?'+query),e=>e.status===400);
});
test('trial ends at the exact second and cannot be edited, extended or reissued',()=>{
  const {demo,time}=fixture(),member=demo.members.find(m=>m.index===9),url='admin/members/'+member.id;
  const original=structuredClone(member.trial);assert.equal(original.ends_at-original.starts_at,604800);
  for(const [action,data] of [['extend',{days:7}],['subscription',{start_date:'2026-10-13',end_date:'2026-10-19'}],['subscription',{start_date:'2026-10-13',end_date:'2026-10-19',kind:'trial'}]]){
    assert.throws(()=>demo.request(url+'/'+action,{...data,expected_version:1}));
  }
  assert.equal(member.subscription.version,1);assert.deepEqual(member.trial,original);
  time(original.ends_at-.001);assert.equal(demo.request(url).member.subscription.status,'active');
  time(original.ends_at);assert.equal(demo.request(url).member.subscription.status,'expired');assert.equal(demo.request(url).member.signal_sms.sms_ready,false);
});
test('paid conversion, pause and resume retain usage and deadlines; signup does not issue access',()=>{
  const {demo}=fixture(),member=demo.members.find(m=>m.index===9),url='admin/members/'+member.id,original=structuredClone(member.trial);
  demo.request(url+'/state',{state:'paused',expected_version:1});assert.equal(demo.request(url).member.signal_sms.app_ready,false);
  assert.equal(member.subscription.ends_at,original.ends_at);
  demo.request(url+'/state',{state:'enabled',expected_version:2});
  demo.request(url+'/subscription',{start_date:'2026-10-13',end_date:'2026-11-12',kind:'paid',expected_version:3});
  assert.equal(member.history[0].before.kind,'trial');assert.equal(member.history[0].after.kind,'paid');
  assert.deepEqual(member.trial,original);
  assert.equal(demo.request('admin/members?kind=paid&trial_usage=used').total,2);
  assert.throws(()=>demo.request('auth/signup',{}),e=>e.status===404);
  assert.equal(new Demo({clock:()=>initial}).members.find(m=>m.index===9).subscription.kind,'trial');
});
