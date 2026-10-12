"""Admin consent reporting through real HTTP; no gateway, payments or real users."""
from datetime import datetime,timedelta
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import time

from playwright.sync_api import Error,expect,sync_playwright

root=Path(__file__).resolve().parents[1]
engine=Path(os.environ.get('TRADING_MASTER_ENGINE_ROOT','/workspace/trading-master-engine'))
sys.path.insert(0,str(engine/'services/trading-master-members'))
from trading_master_members.administration import Administration,KST
from trading_master_members.preferences import CONSENT_VERSION,SmsPreferences,record
from trading_master_members.server import make_server
from trading_master_members.service import MemberService,MockSms

temp=TemporaryDirectory(prefix='admin-consent-browser-')
now=[time.time()];service=MemberService(Path(temp.name)/'members.sqlite3',sms=MockSms(),clock=lambda:now[0])
admin=Administration(service);admin.bootstrap('01000000090','test operator password')
operator=service.login(phone='01000000090',password='test operator password',session=service.ensure_session()[0],client='fixture')
prefs=SmsPreferences(service);members=[]
today=datetime.fromtimestamp(now[0],KST).date()
for number in ('01000000001','01000000002','01000000003'):
    anonymous=service.ensure_session()[0];code=service.request_code(phone=number,purpose='signup',session=anonymous,client=number)
    member=service.signup(phone=number,password='test member password',challenge=code['challenge_id'],code=code['mock_code'],session=anonymous);members.append(member)
    admin.set_period(operator,member.member_id,start_date=(today-timedelta(days=5)).isoformat(),end_date=(today-timedelta(days=1) if number.endswith('3') else today+timedelta(days=29)).isoformat(),expected_version=0)
with service.connection() as db:
    db.execute('BEGIN IMMEDIATE')
    for version in range(1,48):record(db,service,members[0].member_id,'01000000001',bool(version%2),version,version,'consented' if version%2 else 'withdrawn')
    db.execute('UPDATE sms_consent_audit SET consent_text=? WHERE member_id=? AND version=47',('<img src=x onerror="alert(1)"> 당시 문구',members[0].member_id));db.commit()
prefs.set(members[2],enabled=True,expected_version=0,consent=True,consent_version=CONSENT_VERSION)
server=make_server(service,static_dir=root/'build/site',port=0,base_path='/beta/')
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
url=f'http://127.0.0.1:{server.server_port}/beta/'
screens=Path('/workspace/work/admin-consent-review/qa');screens.mkdir(parents=True,exist_ok=True)
errors=[]

def login(page):
    page.locator('#admin-phone').fill('01000000090');page.locator('#admin-password').fill('test operator password');page.locator('#admin-login-submit').click()
    expect(page.locator('#admin-dashboard')).to_be_visible();expect(page.locator('#count-total')).to_have_text('4')

def choose(page,suffix):
    page.locator('#member-filter-reset').click()
    page.locator('#member-search').fill(suffix);page.locator('#admin-search-form').get_by_role('button',name='검색',exact=True).click()
    expect(page.locator('#member-total')).to_have_text('1명')
    page.get_by_role('button',name=f'010-****-{suffix} 상세',exact=True).click()
    expect(page.locator('.detail-phone')).to_have_text(f'010-0000-{suffix}')

def finish(route,value):
    try:route.fulfill(json=value)
    except Error:pass  # The superseded request may already have been aborted.

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1440,'height':1050},locale='ko-KR');page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        try:
            page.goto(url,wait_until='networkidle');expect(page.locator('#app h1')).to_have_text('관심종목')
            assert page.evaluate('TRADING_MASTER_CONFIG.membersEnabled') is False
            page.goto(url+'admin.html',wait_until='networkidle');login(page)
            expect(page.locator('#count-sms_ready')).to_have_text('1');expect(page.locator('#count-app_only')).to_have_text('1')
            assert '01000000001' not in page.locator('#admin-members').inner_text()
            page.locator('[data-member-delivery="ready"]').click();expect(page.locator('#member-total')).to_have_text('1명')
            expect(page.locator('#admin-members')).to_contain_text('문자 켜짐');expect(page.locator('#admin-members')).to_contain_text('앱 + 문자')
            page.locator('[data-member-delivery="app_only"]').click();expect(page.locator('#member-total')).to_have_text('1명')
            expect(page.locator('#admin-members')).to_contain_text('문자 꺼짐');expect(page.locator('#admin-members')).to_contain_text('앱만 이용')
            page.locator('#member-filter-reset').click();page.locator('#member-sms').select_option('on');expect(page.locator('#member-total')).to_have_text('2명')
            page.locator('#member-delivery').select_option('inactive');expect(page.locator('#member-total')).to_have_text('1명')
            expect(page.locator('#admin-members')).to_contain_text('만료');expect(page.locator('#admin-members')).to_contain_text('문자 켜짐')
            page.locator('[data-admin-tab="messaging"]').click();expect(page.locator('#admin-messaging-pane')).to_be_visible()
            page.locator('[data-admin-tab="members"]').click();expect(page.locator('#member-sms')).to_have_value('on');expect(page.locator('#member-delivery')).to_have_value('inactive')
            choose(page,'0001');expect(page.locator('#consent-count')).to_contain_text('전체 47건')
            expect(page.locator('#consent-results li')).to_have_count(20);expect(page.locator('#consent-previous')).to_be_disabled()
            expect(page.locator('.sms-overview')).to_contain_text('앱 + 문자')
            page.locator('#consent-results details').first.locator('summary').click()
            expect(page.locator('#consent-results')).to_contain_text('<img src=x onerror="alert(1)"> 당시 문구')
            assert page.locator('#consent-results img').count()==0
            prefs.set(members[0],enabled=False,expected_version=47)
            page.locator('#consent-next').click();expect(page.locator('#consent-count')).to_contain_text('2페이지')
            expect(page.locator('#consent-count')).to_contain_text('전체 47건');expect(page.locator('#consent-feedback')).to_contain_text('새 변경 이력')
            page.locator('#consent-next').click();expect(page.locator('#consent-count')).to_contain_text('3페이지')
            expect(page.locator('#consent-results li')).to_have_count(7);expect(page.locator('#consent-next')).to_be_disabled()
            page.locator('#consent-previous').click();expect(page.locator('#consent-count')).to_contain_text('2페이지')
            page.locator('#consent-previous').click();expect(page.locator('#consent-count')).to_contain_text('1페이지');expect(page.locator('#consent-previous')).to_be_disabled()
            page.locator('#consent-refresh').click();expect(page.locator('#consent-count')).to_contain_text('전체 48건')
            expect(page.locator('#consent-results li').first).to_contain_text('변경 #48')
            # Updating the read-only audit must preserve the subscription draft.
            page.locator('#subscription-note').fill('저장 전 입력');page.locator('#consent-refresh').click()
            expect(page.locator('#consent-refresh')).to_be_enabled();expect(page.locator('#subscription-note')).to_have_value('저장 전 입력')
            history_path='**/api/admin/members/'+members[0].member_id+'/sms-consents*'
            page.route(history_path,lambda route:route.fulfill(status=503,json={'error':'동의 이력 연결 실패'}))
            page.locator('#consent-refresh').click();expect(page.locator('#consent-feedback')).to_contain_text('이전 조회 결과')
            expect(page.locator('#consent-results li')).to_have_count(20);assert 'is-stale' in page.locator('#consent-results').get_attribute('class')
            page.unroute(history_path);page.locator('#consent-refresh').click();expect(page.locator('#consent-feedback')).to_have_text('')
            page.locator('#detail-refresh').click();expect(page.locator('.sms-overview')).to_contain_text('앱만 이용');expect(page.locator('#consent-refresh')).to_be_enabled()
            expect(page.locator('#admin-members')).to_contain_text('문자 꺼짐');expect(page.locator('#count-sms_ready')).to_have_text('0');expect(page.locator('#count-app_only')).to_have_text('2')
            for width in (320,360,390,414,768,1280):
                page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
            page.set_viewport_size({'width':390,'height':1000});page.screenshot(path=str(screens/'admin-consents-mobile.png'),full_page=True)
            page.set_viewport_size({'width':1440,'height':1050});page.screenshot(path=str(screens/'admin-consents-desktop.png'),full_page=True)
            fixture=page.evaluate("fetch(new URL('api/admin/members/"+members[0].member_id+"/sms-consents',document.baseURI)).then(r=>r.json())")
            # A late response from the previous member must not enter the new detail.
            pending=[];page.route(history_path,lambda route:pending.append(route));page.locator('#consent-refresh').click();page.wait_for_timeout(150);assert pending
            choose(page,'0002');expect(page.locator('#consent-count')).to_contain_text('전체 0건');expect(page.locator('#consent-results')).to_contain_text('기본으로 꺼져')
            finish(pending[0],fixture);page.wait_for_timeout(150);expect(page.locator('#consent-count')).to_contain_text('전체 0건')
            page.unroute(history_path)
            choose(page,'0001');expect(page.locator('#consent-count')).to_contain_text('전체 48건')
            pending=[];page.route(history_path,lambda route:pending.append(route));page.locator('#consent-next').click();page.wait_for_timeout(150);assert pending
            page.locator('#admin-logout').click();expect(page.locator('#admin-login')).to_be_visible()
            finish(pending[0],fixture);page.wait_for_timeout(150)
            assert page.locator('#detail-content').inner_text()=='';assert page.locator('#admin-members').inner_text()==''
            expect(page.locator('#count-sms_ready')).to_have_text('—');expect(page.locator('#member-search')).to_have_value('')
            page.unroute(history_path)
            assert page.evaluate("fetch(new URL('api/admin/members/"+members[0].member_id+"/sms-consents',document.baseURI)).then(r=>r.status)")==401
            login(page);choose(page,'0001');expect(page.locator('#consent-refresh')).to_be_enabled()
            with service.connection() as db:db.execute('DELETE FROM admin_roles WHERE member_id=?',(operator.member_id,));db.commit()
            page.locator('#consent-refresh').click();expect(page.locator('#admin-login')).to_be_visible();assert page.locator('#detail-content').inner_text()==''
            assert page.evaluate('localStorage.length')==0
            keys=page.evaluate('caches.keys().then(keys=>Promise.all(keys.map(k=>caches.open(k).then(c=>c.keys())))).then(groups=>groups.flat().map(r=>r.url))')
            assert all('/api/' not in key and 'admin' not in key for key in keys),keys
            assert not errors,errors
            print(json.dumps({'filters_and_channel_counts':True,'consent_pages_and_insertion_anchor':True,'read_only_and_exact_wording':True,
                              'preserved_draft':True,'failure_keeps_labelled_previous_results':True,'late_member_and_logout_responses_discarded':True,
                              'role_revocation_clears_private_ui':True,'widths':[320,360,390,414,768,1280],'private_cache':False,'real_sms':0,'javascript_errors':errors},ensure_ascii=False))
        finally:context.close();browser.close()
finally:server.shutdown();server.server_close();thread.join(timeout=2);temp.cleanup()
