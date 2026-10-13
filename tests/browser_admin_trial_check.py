"""Trial-aware admin UI against development HTTP and isolated fictional demo."""
from datetime import datetime,timedelta
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import time
from playwright.sync_api import expect,sync_playwright

root=Path(__file__).resolve().parents[1]
engine=Path(os.environ.get('TRADING_MASTER_ENGINE_ROOT',str(root.parent/'engine')))
sys.path.insert(0,str(engine/'services/trading-master-members'))
from trading_master_members.administration import Administration,KST
from trading_master_members.server import make_server
from trading_master_members.service import MemberService,MockSms,digest,signal_time

temp=TemporaryDirectory(prefix='admin-trial-browser-');now=time.time()
service=MemberService(Path(temp.name)/'members.sqlite3',sms=MockSms(),clock=lambda:now)
admin=Administration(service);admin.bootstrap('01000000090','test operator password')
operator=service.login(phone='01000000090',password='test operator password',session=service.ensure_session()[0],client='operator')
ids=[]
for index in range(1,4):
    number='0100000000'+str(index);anonymous=service.ensure_session()[0]
    code=service.request_code(phone=number,purpose='signup',session=anonymous,client=number)
    session=service.signup(phone=number,password='test member password',challenge=code['challenge_id'],code=code['mock_code'],session=anonymous)
    ids.append(session.member_id)
    if index==3:continue
    start=now-(2 if index==1 else 12)*86400;end=start+604800
    with service.connection() as db:
        db.execute('INSERT INTO subscriptions VALUES(?,?,?,?,?,?,?)',(session.member_id,'tm-common-signals',start,end,'enabled',1,now))
        db.execute('INSERT INTO subscription_labels VALUES(?,?,?)',(session.member_id,'trial',now))
        db.execute('INSERT INTO trial_usage VALUES(?,?,?,?,?)',(session.member_id,digest(number),start,end,now))
        db.execute('INSERT INTO signal_entitlements VALUES(?,?,?)',(session.member_id,1,signal_time(now)))
        db.commit()
server=make_server(service,static_dir=root/'dist',port=0);thread=Thread(target=server.serve_forever,daemon=True);thread.start()
base='http://127.0.0.1:'+str(server.server_port)+'/'
class QuietStatic(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
static=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietStatic,directory=os.environ.get('TRADING_MASTER_DEMO_ROOT',str(root/'dist'))))
static_thread=Thread(target=static.serve_forever,daemon=True);static_thread.start()
demo_base='http://127.0.0.1:'+str(static.server_port)+'/'
errors=[];today=datetime.fromtimestamp(now,KST).date()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        for demo,width in [(False,1440),(True,1440),(True,390)]:
            context=browser.new_context(viewport={'width':width,'height':1000},locale='ko-KR');page=context.new_page()
            page.on('pageerror',lambda e:errors.append(str(e)));requests=[];page.on('request',lambda r:requests.append(r.url))
            page.goto((demo_base if demo else base)+('admin-demo.html' if demo else 'admin.html'),wait_until='networkidle')
            if not demo:
                page.locator('#admin-phone').fill('01000000090');page.locator('#admin-password').fill('test operator password')
            page.locator('#admin-login-submit').click();expect(page.locator('#admin-dashboard')).to_be_visible()
            expect(page.locator('#count-trial_active')).to_have_text('1');expect(page.locator('#count-trial_expired')).to_have_text('1')
            page.locator('[data-member-kind="trial"][data-member-status="active"]').click();expect(page.locator('#member-total')).to_have_text('1명')
            page.locator('#admin-members [data-member]').click();expect(page.locator('#subscription-kind')).to_have_value('trial')
            expect(page.locator('#trial-usage')).to_contain_text('사용 이력 · 있음')
            expect(page.locator('#subscription-exact-end')).to_contain_text('KST')
            expect(page.locator('#subscription-start')).to_be_disabled();expect(page.locator('#admin-period-form button')).to_be_disabled()
            expect(page.locator('#admin-extension-form button')).to_be_disabled()
            page.locator('[data-state="paused"]').click();expect(page.locator('#detail-content .status-paused')).to_be_visible()
            expect(page.locator('#subscription-start')).to_be_disabled();original=page.locator('#trial-usage').text_content()
            page.locator('[data-state="enabled"]').click();expect(page.locator('#detail-content .status-active')).to_be_visible()
            expect(page.locator('#trial-usage')).to_have_text(original)
            page.locator('#subscription-kind').select_option('paid');expect(page.locator('#subscription-start')).to_be_enabled()
            page.locator('#subscription-start').fill(today.isoformat());page.locator('#subscription-end').fill((today+timedelta(days=29)).isoformat())
            page.locator('#admin-period-form button').click();expect(page.locator('#admin-feedback')).to_contain_text('저장했습니다')
            expect(page.locator('#subscription-kind')).to_have_value('paid');expect(page.locator('#trial-usage')).to_have_text(original)
            expect(page.locator('#admin-extension-form button')).to_be_enabled()
            page.locator('#member-filter-reset').click();page.locator('#member-kind').select_option('paid');page.locator('#member-trial').select_option('used')
            expect(page.locator('#member-total')).to_have_text('2명' if demo else '1명')
            assert all('체험 사용 이력 있음' in text for text in page.locator('#admin-members tr').all_inner_texts())
            page.locator('[data-admin-tab="messaging"]').click();expect(page.locator('#admin-messaging-pane')).to_be_visible()
            page.locator('[data-admin-tab="members"]').click();expect(page.locator('#member-kind')).to_have_value('paid')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(demo,width)
            if width==390:
                out=root.parent/'qa';out.mkdir(exist_ok=True);page.screenshot(path=str(out/'trial-admin-mobile.png'),full_page=True)
            page.locator('#admin-logout').click();expect(page.locator('#admin-login')).to_be_visible()
            expect(page.locator('#member-kind')).to_have_value('all');expect(page.locator('#member-trial')).to_have_value('all')
            assert page.locator('#detail-content').inner_text()==''
            if demo:assert not [r for r in requests if '/api/' in r],requests
            context.close()
        browser.close();assert not errors,errors
    print(json.dumps({'real_http_and_demo':True,'viewports':[1440,390],'trial_filters_exact_times_read_only_conversion_history':True,'logout_clears_data':True,'demo_api_requests':0,'real_sms':0}))
finally:
    server.shutdown();server.server_close();thread.join(timeout=2);static.shutdown();static.server_close();static_thread.join(timeout=2);temp.cleanup()
