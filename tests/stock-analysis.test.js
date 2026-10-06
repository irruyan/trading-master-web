const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(new URL('../dist/index.html','file://'+__filename),'utf8');
const script=html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1].replace("window.addEventListener('hashchange',render);loadData();",'');
const source=JSON.parse(fs.readFileSync(new URL('../dist/api/v2-portfolio.json','file://'+__filename),'utf8'));
function setup(){
 const payload=structuredClone(source),els=new Map(),events=new Map(),clicks=new Map();
 const el=id=>{if(!els.has(id))els.set(id,{id,innerHTML:'',textContent:'',attrs:{},classList:{toggle(){},add(){},remove(){}},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},removeAttribute(k){delete this.attrs[k]},querySelectorAll(){return []},focus(){}});return els.get(id)};
 const location={hash:'#/'},stack=[{url:'#/',state:null}];let at=0,backs=0;
 const window={scrollY:0,scrollTo(x,y){this.scrollY=y},addEventListener(k,f){events.set(k,f)}};
 window.history={get state(){return stack[at].state},replaceState(state,unused,url){stack[at]={state,url};location.hash=url},pushState(state,unused,url){stack.splice(at+1);stack.push({state,url});at++;location.hash=url},back(){backs++;if(at){at--;location.hash=stack[at].url;events.get('popstate')?.()}}};
 const document={getElementById:el,querySelector:()=>el('status'),addEventListener(k,f){clicks.set(k,f)}};
 const c={payload,window,document,location,URLSearchParams,console};vm.createContext(c);vm.runInContext(script,c);const run=s=>vm.runInContext(s,c);run("setData(payload,'live')");
 return {c,run,page:()=>el('app').innerHTML,el,clicks,stack,backs:()=>backs};
}
function extendedSetup(){
 const ctx=setup(),sample=JSON.parse(fs.readFileSync(new URL('fixtures/root-wave-contract.json','file://'+__filename),'utf8'));
 ctx.c.row={...ctx.c.payload.watchlist.items.find(x=>x.analysis?.status==='available'),...sample.items[0]};ctx.c.watch=sample;
 return ctx;
}
test('new root wave view renders exact trajectory, keeps history selection and separates legacy half structure',()=>{
 const {c,run}=extendedSetup(),f=c.row.analysis.frames.day,m=f.root_waves;c.frame=f;
 assert.equal(run('validStockAnalysis(row.analysis,row,watch)'),true);
 const html=run('structurePanel(row,new URLSearchParams())');
 assert.match(html,/뿌리·매수 파동/);assert.match(html,/중심 위에서 유지/);assert.equal(m.representative_id,'20260113');assert.match(html,/파동 중심 궤적/);assert.match(html,/소멸 이력/);assert.match(html,/고저점 절반 구조 · 기존 보조 지표/);
 assert.doesNotMatch(html,/NaN|undefined|6\.2%|절반 익절|C=|H=|L=/);
 const w=m.items[0];c.chosen=w;
 const selected=run("structurePanel(row,new URLSearchParams({wave:chosen.id}))");
 assert.match(selected,/과거 소멸 파동/);assert.match(selected,/점선은 확인 전/);
 assert.ok(selected.includes('data-wave-trajectory="'+w.id+'"'));
 assert.equal(w.trajectory.at(-1)[0],'20260111');assert.equal(w.invalidated_at,'20260112');
 const path=run("rootWavePath(row,new URLSearchParams({view:'structure',tf:'day',wave:'20260101',back:'/?market=KOSPI&filter=held'}),chosen.id)");
 const q=new URLSearchParams(path.split('?')[1]);assert.deepEqual(q.getAll('wave'),[w.id]);assert.equal(q.get('tf'),'day');assert.equal(q.get('back'),'/?market=KOSPI&filter=held');
 c.q=new URLSearchParams({view:'structure',tf:'day',wave:w.id});assert.equal(new URLSearchParams(run("stockControlPath(row,q,'war')").split('?')[1]).get('wave'),w.id);
 assert.equal(new URLSearchParams(run("stockControlPath(row,q,'structure','week')").split('?')[1]).get('wave'),null);
});
test('wave contract rejects bad timelines, execution claims, and fabricated selection',()=>{
 const {c,run}=extendedSetup();
 const mutations=[m=>m.items[0].trajectory.push(['20260112',105]),m=>m.items[0].trajectory[1][0]='20260101',m=>m.items[0].center=-1,m=>m.items[0].retreats=999,m=>m.items[0].confirmed_at=m.items[0].born_at,m=>m.execution_policy='half_exit',m=>m.representative_id='missing'];
 for(const mutate of mutations){c.bad=structuredClone(c.row.analysis);mutate(c.bad.frames.day.root_waves);assert.equal(run('validStockAnalysis(bad,row,watch)'),false)}
 c.bad=structuredClone(c.row.analysis);delete c.bad.frames.week.root_waves;assert.equal(run('validStockAnalysis(bad,row,watch)'),false);
 // An unavailable timeframe has no usable root-wave values.
 c.bad=structuredClone(c.row.analysis);Object.assign(c.bad.frames.week,{status:'unavailable',bars:[],bars_count:0,price:null,price_date:null,period_start:null,roots:[],half_wave:null,war:{status:'insufficient_history'},root_waves:{version:'root-linked-wave-v1',status:'unavailable',execution_policy:'display_only',items:[],representative_id:null}});
 assert.equal(run('validStockAnalysis(bad,row,watch)'),true);
});
test('all real stock, timeframe and paper views retain source values',()=>{
 const {c,run,page}=setup(),original=JSON.stringify(c.payload);let views=0;
 for(const row of c.payload.watchlist.items.filter(x=>!x.retired)){
  c.row=row;
  for(const view of ['diagnosis','structure','war','paper'])for(const tf of ['day','week','month']){
   c.view=view;c.tf=tf;run("renderWatchStock(row.market,row.code,new URLSearchParams({view,tf,back:'/?market='+row.market+'&filter=held&sort=turnover'}))");
   assert.ok(page().includes(run('esc(row.name)')));assert.doesNotMatch(page(),/NaN|undefined|기록을 찾을 수 없습니다/);
   if(row.analysis?.status==='available'&&(view==='structure'||view==='war')){assert.ok(page().includes(run('FRAME_NAMES[tf]')));assert.match(page(),row.analysis.frames[tf].status==='unavailable'?/분석 보류/:/완성봉/)}
   views++;
  }
 }
 assert.equal(views,c.payload.watchlist.items.filter(x=>!x.retired).length*12);assert.equal(JSON.stringify(c.payload),original);
});
test('tab and timeframe changes preserve history parent, reading position, and list filters',()=>{
 const {c,run,page,stack,backs,clicks}=setup();c.row=c.payload.watchlist.items.find(x=>x.analysis?.status==='available');
 const list='/?market='+c.row.market+'&filter=unheld&sort=turnover';c.list=list;run('go(list)');c.window.scrollY=440;run('go(watchStockPath(row,list))');c.window.scrollY=180;
 const parent=stack.at(-1).state.parent,size=stack.length;const target=run("stockControlPath(row,parseRoute().query,'structure','week')");
 let prevented=false;const anchor={getAttribute:k=>k==='href'?'#'+target:null,hasAttribute:k=>k==='data-stock-control'};
 clicks.get('click')({button:0,preventDefault(){prevented=true},target:{closest(selector){return selector==='a[href]'?anchor:null}}});assert.equal(prevented,true);
 assert.match(page(),/뿌리·파동 절반/);assert.match(page(),/주봉 완성봉/);assert.equal(c.window.scrollY,180);assert.equal(stack.length,size);assert.equal(stack.at(-1).state.parent,parent);
 run("setData(payload,'live')");assert.equal(c.window.scrollY,180);assert.equal(run('stockFrame(parseRoute().query)'),'week');
 run('go(list,{restore:true})');assert.equal(backs(),1);assert.equal(c.window.scrollY,440);assert.equal(c.location.hash,'#'+list);
});
test('malformed analysis refresh cannot replace current verified financial data',()=>{
 const {c,run}=setup();const code=c.payload.watchlist.items.find(x=>x.analysis?.status==='available').code;
 const mutations=[
  a=>a.generated_at='2026-10-01 00:00:00',
  a=>a.diagnosis.levels.max_buy+=1,
  a=>a.diagnosis.retest_status='confirmed',
  a=>a.frames.day.war.buy_share_pct=101,
  a=>a.frames.week.bars.at(-1)[0]='20261003',
  a=>a.frames.day.bars[0][2]=-1
 ];
 for(const mutate of mutations){c.bad=structuredClone(c.payload);mutate(c.bad.watchlist.items.find(x=>x.code===code).analysis);assert.throws(()=>run("setData(bad,'live')"),/Invalid product/);assert.equal(run('DATA.meta.generated_at'),c.payload.portfolio.meta.generated_at)}
 c.legacy=structuredClone(c.payload);for(const row of c.legacy.watchlist.items)delete row.analysis;assert.equal(run('validWatchlist(legacy.watchlist,legacy.portfolio)'),true);
});
test('one-sided or empty war displays unavailable center, never fabricated zero or victory',()=>{
 const {c,run,page}=setup();c.row=c.payload.watchlist.items.find(x=>x.analysis?.status==='available');const war=c.row.analysis.frames.day.war;
 Object.assign(war,{status:'one_sided',buy_average:100,sell_average:null,center:null,buy_volume:1,sell_volume:0,buy_share_pct:100,sell_share_pct:0});
 run("warPanel(row,new URLSearchParams())");assert.match(run("warPanel(row,new URLSearchParams())"),/매수 성격 <b>100.0%/);assert.match(run("warPanel(row,new URLSearchParams())"),/양쪽 평균이 모두 있어야 산출/);
 Object.assign(war,{status:'no_volume',buy_average:null,sell_average:null,center:null,buy_volume:0,sell_volume:0,buy_share_pct:null,sell_share_pct:null});
 const out=run("warPanel(row,new URLSearchParams())");assert.match(out,/비중을 산출할 거래량이 없습니다/);assert.doesNotMatch(out,/>0원|NaN|undefined|100.0%/);
 assert.match(out,/실제 투자자별 매수·매도/);assert.match(out,/승률을 뜻하지 않습니다/);
});
test('current diagnosis and completed structure keep distinct price dates and exact equality gates',()=>{
 const {c,run}=setup();c.row=c.payload.watchlist.items.find(x=>x.analysis?.status==='available');const d=c.row.analysis.diagnosis,f=c.row.analysis.frames.day;
 assert.notEqual(d.price_date,f.price_date);assert.match(run('diagnosticPlan(row)'),/진행 중인 일봉 포함/);assert.match(run("structurePanel(row,new URLSearchParams())"),/완성봉/);
 d.price=d.levels.max_buy;c.row.price=d.price;d.gates.within_daily_ceiling=true;d.gates.above_daily_stop=d.price>d.levels.stop;d.diagnostic_state=!d.gates.above_daily_stop||d.price<d.levels.gijunga_min?'risk':d.gates.reference_rising&&d.gates.buy_signal?'candidate':'observe';
 assert.equal(run('validStockAnalysis(row.analysis,row,payload.watchlist)'),true);assert.match(run('diagnosticPlan(row)'),/상단 이내 관측/);
 d.price=d.levels.stop;c.row.price=d.price;d.gates.above_daily_stop=false;d.gates.within_daily_ceiling=d.price<=d.levels.max_buy;d.diagnostic_state='risk';assert.equal(run('validStockAnalysis(row.analysis,row,payload.watchlist)'),true);assert.match(run('diagnosticPlan(row)'),/손절값 이하 관측/);
 assert.match(run("structurePanel(row,new URLSearchParams())"),/완성봉 종가.*이하/);assert.match(run("structurePanel(row,new URLSearchParams())"),/완성봉 저가.*이하/);
});
test('account detail can open current analysis and restore its exact holding',()=>{
 const {c,run,page}=setup();const row=c.payload.watchlist.items.find(x=>x.position_status==='held');c.row=row;const open=c.payload.portfolio.accounts[row.account_id].forward.open.find(x=>x.code===row.code);c.open=open;
 const origin=run("stockPath(open,row.account_id,accountPath(row.account_id))");c.origin=origin;run('go(origin)');assert.match(page(),/현재 종목 분석/);
 run('go(watchStockPath(row,origin))');assert.match(page(),/거래 기록으로/);assert.equal(run('watchBack(parseRoute().query,row.market)'),origin);
 run("go(stockControlPath(row,parseRoute().query,'war','month'),{replace:true,keepScroll:true})");run('go(origin,{restore:true})');assert.equal(c.location.hash,'#'+origin);assert.match(page(),/보유 중/);
});

test('a failed timeframe never hides verified daily diagnosis or publishes usable frame values',()=>{
 const {c,run}=setup();c.row=c.payload.watchlist.items.find(x=>x.analysis?.status==='available');const f=c.row.analysis.frames.week;
 Object.assign(f,{status:'unavailable',bars_count:0,period_start:null,price_date:null,price:null,roots:[],half_wave:null,bars:[],war:{status:'insufficient_history'}});
 assert.equal(run('validStockAnalysis(row.analysis,row,payload.watchlist)'),true);
 assert.match(run('diagnosticPlan(row)'),/일봉 관측/);
 assert.match(run("structurePanel(row,new URLSearchParams('tf=week'))"),/주봉 분석 보류/);
 assert.match(run("warPanel(row,new URLSearchParams('tf=week'))"),/주봉 분석 보류/);
 f.price=1;assert.equal(run('validStockAnalysis(row.analysis,row,payload.watchlist)'),false);
});
