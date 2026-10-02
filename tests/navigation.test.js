const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(new URL('../dist/index.html','file://'+__filename),'utf8');
const script=html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1].replace("window.addEventListener('hashchange',render);loadData();",'');
const bundle=JSON.parse(fs.readFileSync(new URL('../dist/api/v2-portfolio.json','file://'+__filename),'utf8'));
const payload=bundle.portfolio||bundle;
const original=JSON.stringify(payload),elements=new Map(),events=new Map(),clicks=new Map();
const el=id=>{
 if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',open:false,attrs:{},classes:new Set(),classList:{toggle(k,v){v?this.owner.classes.add(k):this.owner.classes.delete(k)},add(k){this.owner.classes.add(k)},remove(k){this.owner.classes.delete(k)}},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},removeAttribute(k){delete this.attrs[k]},focus(){this.focused=true},querySelectorAll(){return []}});
 const e=elements.get(id);e.classList.owner=e;return e;
};
const location={hash:'#/'},stack=[{url:'#/',state:null}];let at=0,backCalls=0;
const window={scrollY:0,scrollTo(x,y){this.scrollY=y},addEventListener(k,v){events.set(k,v)}};
window.history={scrollRestoration:'auto',get state(){return stack[at].state},
 replaceState(state,unused,url){stack[at]={state,url};location.hash=url},
 pushState(state,unused,url){stack.splice(at+1);stack.push({state,url});at++;location.hash=url},
 back(){backCalls++;if(at){at--;location.hash=stack[at].url;events.get('popstate')?.()}},
 forward(){if(at<stack.length-1){at++;location.hash=stack[at].url;events.get('popstate')?.()}}
};
const document={title:'',activeElement:null,getElementById:el,querySelector:()=>el('status'),addEventListener(k,v){clicks.set(k,v)}};
const c={payload,window,document,location,URLSearchParams,console};vm.createContext(c);vm.runInContext(script,c);
const run=s=>vm.runInContext(s,c),page=()=>el('app').innerHTML;
run('DATA=payload;render()');
assert.match(page(),/운용 현황/);
assert.equal(window.history.scrollRestoration,'manual');
run("go('/account/ks_mid?tab=closed')");
window.scrollY=480;
const closed=payload.accounts.ks_mid.forward.closed[0];
c.closed=closed;
const path=run("stockPath(closed,'ks_mid','/account/ks_mid?tab=closed',true)");
c.path=path;run('go(path)');
assert.match(page(),/청산 기록/);
assert.match(page(),/실현손익/);
assert.match(page(),/청산 목록/);
assert.equal(window.scrollY,0);
run("go('/account/ks_mid?tab=closed',{restore:true})");
assert.equal(backCalls,1);
assert.equal(window.scrollY,480);
assert.match(page(),/aria-current="page">청산/);
assert.equal(el('nav-ks_mid').attrs.href,'#/account/ks_mid?tab=closed');
window.history.forward();
assert.match(page(),/청산 기록/);
window.history.back();
assert.equal(window.scrollY,480);
window.scrollY=615;
el('app').querySelectorAll=selector=>selector==='details[open]'?[{id:'capital-basis'}]:[];
el('capital-basis').open=true;
run("setData(payload,'live')");
assert.equal(window.scrollY,615,'refresh must preserve reading position');
assert.match(page(),/aria-current="page">청산/);
assert.equal(el('capital-basis').open,true);
c.older={...payload,meta:{...payload.meta,generated_at:'2026-09-30 15:30:00'}};
run("setData(older,'snapshot')");
assert.equal(run("DATA.meta.generated_at"),payload.meta.generated_at,'older fallback must not replace newer financial data');
assert.equal(window.scrollY,615);
run("go('/account/kq_mid?tab=performance')");
assert.equal(el('nav-kq_mid').attrs['aria-current'],'page');
assert.equal(el('nav-ks_mid').attrs['aria-current'],undefined);
run("go('/account/unknown')");
assert.match(page(),/계좌를 찾을 수 없습니다/);
run("go('/not-a-route')");
assert.match(page(),/페이지를 찾을 수 없습니다/);
run("go('/account/ks_mid/stock/999999')");
assert.match(page(),/이 거래 기록을 찾을 수 없습니다/);

// A closed transaction must not resolve to the currently held lot of the same stock.
const held=payload.accounts.ks_mid.forward.open[0];
const lot={...held,entry_date:'2026-09-05',entry_at:'2026-09-05 09:00',exit_date:'2026-09-10',exit_at:'2026-09-10 13:00',exit_price:77,pnl_won:-12345,pnl_pct:-8};
payload.accounts.ks_mid.forward.closed.push(lot);c.lot=lot;
const lotPath=run("stockPath(lot,'ks_mid','/account/ks_mid?tab=closed',true)");c.lotPath=lotPath;run('go(lotPath)');
assert.match(page(),/청산 기록/);
assert.match(page(),/-12,345원/);
assert.match(page(),/>77</);
assert.equal(run("findStock('ks_mid',lot.code,tradeKey(lot))===lot"),true);
payload.accounts.ks_mid.forward.closed.pop();

// Every real holding and forward closed transaction has a valid, distinct destination.
let routes=0;
for(const id of ['ks_mid','kq_mid']){
 for(const tab of ['hold','closed','performance']){c.id=id;c.tab=tab;run('go(accountPath(id,tab))');assert.doesNotMatch(page(),/NaN|undefined|페이지를 찾을/);routes++}
 for(const [type,rows] of Object.entries({open:payload.accounts[id].forward.open,closed:payload.accounts[id].forward.closed})){
  for(const row of rows){c.row=row;c.id=id;c.closedFlag=type==='closed';run("go(stockPath(row,id,accountPath(id,closedFlag?'closed':'hold'),closedFlag))");assert.doesNotMatch(page(),/NaN|undefined|이 거래 기록을 찾을/);assert.match(page(),type==='open'?/보유 중/:/청산 기록/);routes++}
 }
}
run("go('/performance')");assert.match(page(),/종잣돈 대비 손익률/);routes++;
run("go('/overview')");assert.match(page(),/현재 총자산/);routes++;
run("go('/')");assert.match(page(),/관심종목/);routes++;
assert.equal(JSON.stringify(payload),original,'navigation and rendering must not mutate financial data');
assert.match(run("chartSvg([{d:'2026-10-01',p:100},{d:'2026-10-02',p:110,s:90}],100,90)"),/viewBox/);
assert.doesNotMatch(run("chartSvg([{p:100},{p:110,s:90}],100,90)"),/NaN|undefined/);
// Native modifier-clicks must retain browser new-tab behavior.
let prevented=false;clicks.get('click')({button:0,ctrlKey:true,preventDefault(){prevented=true},target:{closest(){throw Error('modifier click was intercepted')}}});assert.equal(prevented,false);
console.log('navigation tests passed: '+routes+' real routes, closed-lot identity, history, scroll, refresh and data immutability');
