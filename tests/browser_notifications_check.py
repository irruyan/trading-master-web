"""Real member/consent/history/worker integration; only fictional users and mocks."""
from datetime import datetime,timedelta,timezone
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import time
from playwright.sync_api import expect,sync_playwright

root=Path(__file__).resolve().parents[1]
engine=Path(os.environ.get('TRADING_MASTER_ENGINE_ROOT','/workspace/trading-master-engine'))
sys.path[:0]=[str(engine/'services/trading-master-members'),str(engine/'services/trading-master-sms')]
from trading_master_members.administration import Administration,KST
from trading_master_members.preferences import CONSENT_VERSION,SmsPreferences
from trading_master_members.server import make_server
from trading_master_members.service import MemberService,MockSms
from trading_master_sms.audience import MemberAudience
from trading_master_sms.demo import sample_signal
from trading_master_sms.service import MessagingService

temp=TemporaryDirectory(prefix='notifications-browser-');now=[time.time()]
members=MemberService(Path(temp.name)/'members.sqlite3',sms=MockSms(),clock=lambda:now[0])
admin=Administration(members);admin.bootstrap('01000000090','test operator password')
operator=members.login(phone='01000000090',password='test operator password',session=members.ensure_session()[0],client='fixture')
anonymous=members.ensure_session()[0]
code=members.request_code(phone='01000000001',purpose='signup',session=anonymous,client='fixture')
member=members.signup(phone='01000000001',password='test member password',challenge=code['challenge_id'],code=code['mock_code'],session=anonymous)
today=datetime.fromtimestamp(now[0],KST).date()
admin.set_period(operator,member.member_id,start_date=today.isoformat(),end_date=(today+timedelta(days=29)).isoformat(),expected_version=0)
original_period=members.profile(member)['subscription']
prefs=SmsPreferences(members)
sms=MessagingService(Path(temp.name)/'sms.sqlite3',clock=lambda:datetime.fromtimestamp(now[0],timezone.utc),audience=MemberAudience(members.db_path))
server=make_server(members,static_dir=root/'build/site',port=0,base_path='/beta/',members_enabled=True,sms_database=sms.database)
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
url=f'http://127.0.0.1:{server.server_port}/beta/'
screens=Path('/workspace/work/sms-preferences-review/qa');screens.mkdir(parents=True,exist_ok=True)
errors=[]
def signal():
    now[0]+=1
    return sample_signal(datetime.fromtimestamp(now[0],timezone.utc),action='buy')
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':390,'height':900},locale='ko-KR');page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(url+'#/notification-settings',wait_until='networkidle')
        page.locator('#member-phone').fill('01000000001');page.locator('#member-password').fill('test member password');page.locator('#member-submit').click()
        expect(page.locator('#sms-setting-status')).to_have_text('꺼짐');expect(page.locator('#sms-setting-refresh')).to_be_enabled()
        assert not page.locator('#sms-consent').is_checked();assert page.locator('#sms-enable').is_disabled()
        assert sms.ingest(signal())['recipient_count']==0
        page.screenshot(path=str(screens/'settings-off-mobile.png'),full_page=True)
        page.locator('#sms-consent').check()
        with page.expect_response(lambda r:r.url.endswith('/api/auth/session')):page.evaluate("dispatchEvent(new Event('online'))")
        expect(page.locator('#sms-setting-refresh')).to_be_enabled();assert page.locator('#sms-consent').is_checked()
        page.locator('#sms-enable').click();expect(page.locator('#sms-setting-status')).to_have_text('켜짐')
        expect(page.locator('#sms-disable')).to_be_enabled();expect(page.locator('#sms-setting-feedback')).to_contain_text('새 알림부터')
        assert sms.ingest(signal())['recipient_count']==1
        page.locator('#sms-disable').click();expect(page.locator('#sms-setting-status')).to_have_text('꺼짐');expect(page.locator('#sms-setting-refresh')).to_be_enabled()
        assert sms.dispatch()==[] and sms.gateway.calls==[]
        assert sms.ingest(signal())['recipient_count']==0
        assert members.profile(member)['subscription']==original_period
        page.get_by_role('link',name='앱 알림 내역 보기',exact=True).click()
        expect(page.locator('#signal-count')).to_contain_text('전체 3건');expect(page.locator('#signal-results')).to_contain_text('앱으로 제공')
        page.locator('.signal-back').click();expect(page.locator('#member-sms-summary')).to_contain_text('꺼짐')
        page.get_by_role('link',name='문자 알림 설정',exact=True).click();expect(page.locator('#sms-setting-refresh')).to_be_enabled()
        assert not page.locator('#sms-consent').is_checked()
        page.locator('#sms-consent').check();page.locator('#sms-enable').click();expect(page.locator('#sms-disable')).to_be_enabled()
        assert sms.ingest(signal())['recipient_count']==1;assert len(sms.dispatch())==1;assert len(sms.gateway.calls)==1
        page.screenshot(path=str(screens/'settings-on-mobile.png'),full_page=True)
        # A different device disables SMS. The old UI must not silently overwrite it.
        prefs.set(member,enabled=False,expected_version=prefs.get(member)['version'])
        page.locator('#sms-disable').click()
        expect(page.locator('#sms-setting-feedback')).to_contain_text('다른 화면')
        assert page.locator('#sms-disable').is_disabled();assert not prefs.get(member)['enabled']
        page.locator('#sms-setting-refresh').click();expect(page.locator('#sms-setting-status')).to_have_text('꺼짐');expect(page.locator('#sms-setting-refresh')).to_be_enabled()
        # The server commits an enable but its response is lost: no automatic retry.
        def lost_response(route):
            if route.request.method=='POST':
                route.fetch();route.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'처리 결과를 확인하지 못했습니다.'}))
            else:route.continue_()
        page.route('**/api/members/sms-preference',lost_response)
        page.locator('#sms-consent').check();page.locator('#sms-enable').click();expect(page.locator('#sms-setting-feedback')).to_contain_text('설정 새로고침')
        assert prefs.get(member)['enabled'];assert page.locator('#sms-enable').is_disabled()
        page.unroute('**/api/members/sms-preference');page.locator('#sms-setting-refresh').click()
        expect(page.locator('#sms-setting-status')).to_have_text('켜짐');expect(page.locator('#sms-disable')).to_be_enabled()
        for width in (320,360,390,414,768,1280):
            page.set_viewport_size({'width':width,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        # Verified number changes require fresh consent, with the old app history kept.
        page.get_by_role('link',name='내 계정으로',exact=True).click();page.get_by_role('link',name='휴대폰 번호 변경',exact=True).click()
        page.locator('#member-phone').fill('01000000003')
        with page.expect_response(lambda r:r.url.endswith('/api/auth/code')) as pending:page.locator('#member-send-code').click()
        page.locator('#member-code').fill(pending.value.json()['mock_code']);page.locator('#member-submit').click()
        expect(page.locator('#member-sms-summary')).to_contain_text('꺼짐')
        cookie=next(c['value'] for c in context.cookies() if c['name']=='tm_member_session');member=members.session(cookie)
        page.get_by_role('link',name='문자 알림 설정',exact=True).click();expect(page.locator('#sms-setting-status')).to_have_text('꺼짐')
        expect(page.locator('#sms-setting-phone')).to_have_text('010-0000-0003');expect(page.locator('#sms-setting-refresh')).to_be_enabled()
        assert not page.locator('#sms-consent').is_checked();assert sms.ingest(signal())['recipient_count']==0
        page.get_by_role('link',name='앱 알림 내역 보기',exact=True).click();expect(page.locator('#signal-count')).to_contain_text('전체 5건')
        page.locator('.signal-back').click();page.get_by_role('link',name='문자 알림 설정',exact=True).click();expect(page.locator('#sms-setting-refresh')).to_be_enabled()
        # Hold a committed consent response across logout; it cannot recreate this UI.
        parked=[]
        def hold(route):
            if route.request.method=='POST':parked.append((route,route.fetch()))
            else:route.continue_()
        page.route('**/api/members/sms-preference',hold)
        page.locator('#sms-consent').check();page.locator('#sms-enable').click()
        for _ in range(50):
            if parked:break
            page.wait_for_timeout(20)
        assert parked
        page.get_by_role('link',name='내 계정으로',exact=True).click();page.get_by_role('button',name='로그아웃',exact=True).click()
        expect(page.locator('#app h1')).to_have_text('회원 로그인')
        held,response=parked.pop();held.fulfill(response=response);page.wait_for_timeout(100)
        expect(page.locator('#app h1')).to_have_text('회원 로그인');assert not page.locator('#sms-setting-status').count()
        stored=page.evaluate("caches.keys().then(names=>Promise.all(names.map(n=>caches.open(n).then(c=>c.keys().then(keys=>keys.map(k=>k.url)))))).then(all=>all.flat())")
        assert not any('/api/' in key for key in stored),stored
        assert len(sms.gateway.calls)==1 and not errors,errors
        print(json.dumps({'default_off':True,'explicit_consent':True,'opt_out_stops_queue':True,'app_allocations_survive':True,'period_unchanged':True,'reconsent_new_only':True,'conflict_requires_refresh':True,'lost_response_reconciled_without_retry':True,'phone_change_requires_consent':True,'late_logout_response_discarded':True,'widths':[320,360,390,414,768,1280],'real_sms':0,'page_errors':errors},ensure_ascii=False))
        context.close();browser.close()
finally:
    server.shutdown();server.server_close();thread.join(timeout=2);temp.cleanup()
