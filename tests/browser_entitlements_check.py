"""Admin -> customer profile -> member-authorized SMS outbox, entirely mocked."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import time

from playwright.sync_api import expect, sync_playwright

root=Path(__file__).resolve().parent.parent
engine=Path('/workspace/trading-master-engine/services')
sys.path[:0]=[str(engine/'trading-master-members'),str(engine/'trading-master-sms')]
from trading_master_members.administration import Administration,KST
from trading_master_members.service import MemberService,MockSms
from trading_master_members.server import make_server
from trading_master_sms.audience import MemberAudience
from trading_master_sms.demo import sample_signal
from trading_master_sms.gateway import MockGateway
from trading_master_sms.service import MessagingService

temp=TemporaryDirectory(prefix='entitlements-browser-')
now=[time.time()]
members=MemberService(Path(temp.name)/'members.sqlite3',sms=MockSms(),clock=lambda:now[0])
administration=Administration(members)
administration.bootstrap('01000000090','test operator password')
session=members.ensure_session()[0]
code=members.request_code(phone='01000000001',purpose='signup',session=session,client='test-signup')
member=members.signup(phone='01000000001',password='test member password',challenge=code['challenge_id'],code=code['mock_code'],session=session)
gateway=MockGateway()
sms=MessagingService(Path(temp.name)/'signals.sqlite3',gateway=gateway,clock=lambda:datetime.fromtimestamp(now[0],timezone.utc),audience=MemberAudience(members.db_path))
server=make_server(members,static_dir=root/'build/site',port=0,base_path='/beta/',members_enabled=True)
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
url=f'http://127.0.0.1:{server.server_port}/beta/'
screens=Path('/workspace/work/entitlements-review');screens.mkdir(parents=True,exist_ok=True)
errors=[]

try:
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--lang=ko-KR'])
        operator=browser.new_context(locale='ko-KR')
        customer=browser.new_context(locale='ko-KR',viewport={'width':390,'height':844})
        admin=operator.new_page();page=customer.new_page()
        for tab in (admin,page):tab.on('pageerror',lambda error:errors.append(str(error)))
        try:
            admin.goto(url+'admin.html',wait_until='networkidle')
            admin.locator('#admin-phone').fill('01000000090');admin.locator('#admin-password').fill('test operator password')
            admin.locator('#admin-login-submit').click()
            expect(admin.locator('#admin-dashboard')).to_be_visible()
            admin.get_by_role('button',name='010-****-0001 상세',exact=True).click()
            page.goto(url+'#/member',wait_until='networkidle')
            page.locator('#member-phone').fill('01000000001');page.locator('#member-password').fill('test member password');page.locator('#member-submit').click()
            expect(page.locator('#member-menu')).to_have_text('내 계정')
            page.locator('#member-menu').click()
            expect(page.locator('#member-subscription-status')).to_have_text('이용 기간 미등록')
            today=datetime.fromtimestamp(now[0],KST).date()
            admin.locator('#subscription-start').fill(today.isoformat());admin.locator('#subscription-end').fill((today+timedelta(days=29)).isoformat())
            admin.get_by_role('button',name='이용 기간 저장',exact=True).click()
            expect(admin.locator('#detail-content .status-pill')).to_have_text('이용 중')
            page.get_by_role('button',name='이용 상태 새로고침',exact=True).click()
            expect(page.locator('#member-subscription-status')).to_have_text('이용 중')
            expect(page.locator('#member-subscription-period')).to_contain_text((today+timedelta(days=29)).isoformat())
            signal=sample_signal(datetime.fromtimestamp(now[0],timezone.utc))
            assert sms.ingest(signal)['recipient_count']==1
            admin.get_by_role('button',name='일시정지',exact=True).click()
            expect(admin.locator('#detail-content .status-pill')).to_have_text('일시정지')
            page.get_by_role('button',name='이용 상태 새로고침',exact=True).click()
            expect(page.locator('#member-subscription-status')).to_have_text('일시정지')
            assert sms.dispatch()==[] and gateway.calls==[]
            admin.get_by_role('button',name='이용 재개',exact=True).click()
            expect(admin.locator('#detail-content .status-pill')).to_have_text('이용 중')
            page.evaluate("dispatchEvent(new Event('online'))")
            expect(page.locator('#member-subscription-status')).to_have_text('이용 중')
            page.get_by_role('link',name='휴대폰 번호 변경',exact=True).click()
            page.locator('#member-phone').fill('01000000002')
            with page.expect_response(lambda response:response.url.endswith('/api/auth/code')) as pending:page.locator('#member-send-code').click()
            verify=pending.value.json()['mock_code'];page.locator('#member-code').fill(verify)
            # An admin extension and live session refresh must preserve verification input.
            admin.get_by_role('button',name='기간 연장',exact=True).click()
            expect(admin.locator('#subscription-end')).to_have_value((today+timedelta(days=59)).isoformat())
            with page.expect_response(lambda response:response.url.endswith('/api/auth/session')):page.evaluate("dispatchEvent(new Event('online'))")
            expect(page.locator('#member-code')).to_have_value(verify)
            page.locator('#member-submit').click()
            expect(page.locator('#member-subscription-status')).to_have_text('이용 중')
            expect(page.locator('.member-details')).to_contain_text('010-0000-0002')
            now[0]+=1
            assert sms.ingest(sample_signal(datetime.fromtimestamp(now[0],timezone.utc)))['recipient_count']==1
            assert len(sms.dispatch())==1 and gateway.calls[0]['phone']=='01000000002'
            assert sms.ingest(signal)['duplicate'] is True
            for width in (320,360,390,414,768,1280):
                page.set_viewport_size({'width':width,'height':900})
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
            page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path=str(screens/'member-active-mobile.png'),full_page=True)
            # Future period assignment and exact server boundary activation / expiry.
            admin.locator('#subscription-start').fill((today+timedelta(days=1)).isoformat());admin.locator('#subscription-end').fill((today+timedelta(days=1)).isoformat())
            admin.get_by_role('button',name='이용 기간 저장',exact=True).click()
            expect(admin.locator('#detail-content .status-pill')).to_have_text('시작 예정')
            page.get_by_role('button',name='이용 상태 새로고침',exact=True).click()
            expect(page.locator('#member-subscription-status')).to_have_text('시작 예정')
            sub=members.profile(member)['subscription']
            now[0]=sub['starts_at'];page.evaluate("dispatchEvent(new Event('online'))")
            expect(page.locator('#member-subscription-status')).to_have_text('이용 중')
            now[0]=sub['ends_at'];page.evaluate("dispatchEvent(new Event('online'))")
            expect(page.locator('#member-subscription-status')).to_have_text('기간 만료')
            assert sms.ingest(sample_signal(datetime.fromtimestamp(now[0],timezone.utc)))['recipient_count']==0
            # A late pre-logout session response must not restore the old member.
            parked=[]
            page.route('**/api/auth/session',lambda route:parked.append((route,route.fetch())))
            page.evaluate("dispatchEvent(new Event('online'))")
            for _ in range(50):
                if parked:break
                page.wait_for_timeout(20)
            assert parked
            page.get_by_role('button',name='로그아웃',exact=True).click()
            expect(page.locator('#app h1')).to_have_text('회원 로그인')
            route,response=parked.pop();route.fulfill(response=response)
            page.wait_for_timeout(200)
            expect(page.locator('#app h1')).to_have_text('회원 로그인')
            assert page.evaluate('TRADING_MASTER_DATA_STATE().hasData') is False
            caches=page.evaluate("caches.keys().then(names=>Promise.all(names.map(n=>caches.open(n).then(c=>c.keys().then(keys=>keys.map(k=>k.url)))))).then(all=>all.flat())")
            assert not any('/api/' in key or 'admin.' in key for key in caches),caches
            assert not errors,errors
            print(json.dumps({'browser':'Chromium','profile_states':['none','active','paused','scheduled','expired'],
                              'admin_to_profile_to_sms':True,'changed_phone':'new_verified_only','verification_input_preserved':True,
                              'late_session_after_logout_discarded':True,'responsive_widths':[320,360,390,414,768,1280],
                              'mock_gateway_acceptances':len(gateway.calls),'real_sms':0,'javascript_errors':errors},ensure_ascii=False))
        finally:
            customer.close();operator.close();browser.close()
finally:
    server.shutdown();server.server_close();thread.join(timeout=2);temp.cleanup()
