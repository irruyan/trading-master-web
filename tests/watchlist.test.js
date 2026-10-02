const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=new URL('../', 'file://'+__filename);
const html=fs.readFileSync(new URL('dist/index.html',root),'utf8');
const script=html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1].replace("window.addEventListener('hashchange',render);loadData();",'');
const payload=JSON.parse(fs.readFileSync(new URL('dist/api/v2-portfolio.json',root),'utf8'));
const original=JSON.stringify(payload),els=new Map(),handlers=new Map();
function el(id){if(!els.has(id))els.set(id,{innerHTML:'',textContent:'',attrs:{},classList:{toggle(){},add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},querySelectorAll(){return []},focus(){}});return els.get(id)}
const c={payload,document:{getElementById:el,querySelector:()=>el('status'),addEventListener(k,v){handlers.set(k,v)}},window:{scrollY:0,scrollTo(x,y){this.scrollY=y},addEventListener(){}},location:{hash:'#/'},URLSearchParams,console};
vm.createContext(c);vm.runInContext(script,c);const run=s=>vm.runInContext(s,c),page=()=>el('app').innerHTML;
run("setData(payload,'live')");
assert.equal(run('WATCHLIST.cycle_id'),payload.portfolio.meta.cycle_id);
assert.match(page(),/관심종목/);assert.match(page(),/선정 근거/);
assert.doesNotMatch(page(),/NaN|undefined/);
assert.equal(el('nav-home').attrs['aria-current'],'page');
let checked=0;
for(const market of ['KOSPI','KOSDAQ']){
 for(const filter of ['all','held','unheld'])for(const sort of ['rank','turnover','gap']){
  c.market=market;c.filter=filter;c.sort=sort;run('renderWatchlist(new URLSearchParams({market,filter,sort}))');assert.doesNotMatch(page(),/NaN|undefined/);checked++;
 }
 const rows=payload.watchlist.items.filter(x=>x.market===market&&!x.retired);
 c.market=market;
 assert.equal(run("watchRows({market,filter:'held',sort:'rank'}).length"),rows.filter(x=>x.position_status==='held').length);
 for(const row of rows){
  c.row=row;c.location.hash='#'+run("watchStockPath(row,'/?market='+row.market+'&filter=held&sort=turnover')");run('render()');
  assert.ok(page().includes(run('esc(row.name)')));
  assert.match(page(),/모의계좌 운용 조건/);
  assert.doesNotMatch(page(),/NaN|undefined|기록을 찾을 수 없습니다/);
  const back=run('watchBack(parseRoute().query,row.market)');assert.equal(back,'/?market='+row.market+'&filter=held&sort=turnover');
  if(row.position_status==='held'){
   const trade=run('stockPath({code:row.code},row.account_id,routePath())');c.trade=trade;c.location.hash='#'+trade;
   assert.match(run('stockBack(row.account_id,true,parseRoute().query)'),/^\/watch\//);
  }
  checked++;
 }
}
// Corrupt or mismatched refreshes cannot replace the displayed account/watchlist pair.
c.bad=structuredClone(payload);c.bad.watchlist.cycle_id='other';
assert.throws(()=>run("setData(bad,'live')"),/Invalid product/);
assert.equal(run('WATCHLIST.cycle_id'),payload.watchlist.cycle_id);
c.bad=structuredClone(payload);c.bad.watchlist.items.push(c.bad.watchlist.items[0]);
assert.throws(()=>run("setData(bad,'live')"),/Invalid product/);
c.old=structuredClone(payload);c.old.portfolio.meta.generated_at='2026-09-01 10:00:00';c.old.watchlist.generated_at=c.old.portfolio.meta.generated_at;for(const row of c.old.watchlist.items)delete row.analysis;
run("setData(old,'snapshot')");assert.equal(run('WATCHLIST.generated_at'),payload.watchlist.generated_at);
// Unheld candidates, failed observations and entry limits have distinct rendering.
const row=structuredClone(payload.watchlist.items.find(x=>x.selected));row.position_status='not_held';delete row.position;row.plans.addition=null;row.plans.exit=null;c.row=row;
run('WATCHLIST={...payload.watchlist,items:[row]};renderWatchStock(row.market,row.code,new URLSearchParams())');
assert.match(page(),/모의계좌 편입 후 산출/);assert.doesNotMatch(page(),/모의계좌 거래 상세/);
row.entry_condition_status='blocked';assert.equal(run('watchState(row).label'),'진입 상단 초과');
row.selection_status='unavailable';row.selected=false;assert.equal(run('watchState(row).label'),'계산 확인 중');assert.equal(run('entryGap(row)'),null);
assert.match(run("watchPath({market:'KOSDAQ',history:true})"),/history=all/);
assert.equal(run("watchOptions(new URLSearchParams('history=all')).history"),true);
run('WATCHLIST=payload.watchlist');
assert.equal(JSON.stringify(payload),original,'rendering must not mutate engine values');
console.log('watchlist tests passed: '+checked+' live views, stock/account links, unheld/failed states, same-cycle rejection, freshness and immutability');
