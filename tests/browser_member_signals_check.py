"""Authenticated customer history over real SQLite/HTTP; fictional data, no sends."""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import time
from playwright.sync_api import expect, sync_playwright

root=Path(__file__).resolve().parents[1]
engine=Path(os.environ.get('TRADING_MASTER_ENGINE_ROOT','/workspace/trading-master-engine'))
sys.path[:0]=[str(engine/'services/trading-master-members'),str(engine/'services/trading-master-sms')]
from trading_master_members.administration import Administration,KST
from trading_master_members.server import make_server
from trading_master_members.service import MemberService,MockSms
from trading_master_members.preferences import SmsPreferences,CONSENT_VERSION
from trading_master_sms.audience import MemberAudience
from trading_master_sms.demo import sample_signal
from trading_master_sms.service import MessagingService

screens=Path('/workspace/work/member-signals-review/qa');screens.mkdir(parents=True,exist_ok=True)
temp=TemporaryDirectory(prefix='member-signals-browser-');now=[time.time()]
members=MemberService(Path(temp.name)/'members.sqlite3',sms=MockSms(),clock=lambda:now[0])
admin=Administration(members);admin.bootstrap('01000000090','test operator password')
operator=members.login(phone='01000000090',password='test operator password',session=members.ensure_session()[0],client='fixture')
def signup(phone):
    session=members.ensure_session()[0];code=members.request_code(phone=phone,purpose='signup',session=session,client='fixture')
    member=members.signup(phone=phone,password='test member password',challenge=code['challenge_id'],code=code['mock_code'],session=session)
    SmsPreferences(members).set(member,enabled=True,expected_version=0,consent=True,consent_version=CONSENT_VERSION)
    return member
member=signup('01000000001');other=signup('01000000002')
today=datetime.fromtimestamp(now[0],KST).date()
sms=MessagingService(Path(temp.name)/'sms.sqlite3',clock=lambda:datetime.fromtimestamp(now[0],timezone.utc),audience=MemberAudience(members.db_path))
sms.ingest(sample_signal(datetime.fromtimestamp(now[0],timezone.utc)))
for account in (member,other):
    admin.set_period(operator,account.member_id,start_date=today.isoformat(),end_date=(today+timedelta(days=29)).isoformat(),expected_version=0)
for number in range(45):
    now[0]+=1;sms.ingest(sample_signal(datetime.fromtimestamp(now[0],timezone.utc),action=('buy','add_buy','partial_sell','sell')[number%4]))
now[0]+=1
bad=sample_signal(datetime.fromtimestamp(now[0],timezone.utc),action='buy');bad.update(symbol='900000',name='<img src=x onerror=alert(1)>',reason='가상 분석 내용 '*20)
sms.ingest(bad)
admin.set_state(operator,member.member_id,state='paused',expected_version=1)
now[0]+=1;sms.ingest(sample_signal(datetime.fromtimestamp(now[0],timezone.utc)))
admin.set_state(operator,member.member_id,state='enabled',expected_version=2)
with sms._transaction() as db:
    for index,row in enumerate(db.execute('SELECT id FROM deliveries ORDER BY rowid').fetchall()):
        db.execute('UPDATE deliveries SET status=? WHERE id=?',(('queued','accepted','delivered','failed','unknown','skipped','expired')[index%7],row['id']))
server=make_server(members,static_dir=root/'build/site',port=0,base_path='/beta/',members_enabled=True,sms_database=sms.database)
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
url=f'http://127.0.0.1:{server.server_port}/beta/'
errors=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':1280,'height':1000},locale='ko-KR');page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(url+'#/signals',wait_until='networkidle')
        page.locator('#member-phone').fill('01000000001');page.locator('#member-password').fill('test member password');page.locator('#member-submit').click()
        expect(page.locator('#signal-count')).to_contain_text('전체 46건')
        expect(page.locator('#member-menu')).to_have_text('내 계정');page.locator('#member-menu').click()
        page.get_by_role('link',name='매수·매도 알림 내역',exact=True).click()
        expect(page.locator('#signal-count')).to_contain_text('전체 46건')
        assert page.locator('.signal-row').count()==20
        first=page.locator('.signal-row').first.get_attribute('data-signal-id')
        page.locator('#signal-next').click();expect(page.locator('.signal-row').first).not_to_have_attribute('data-signal-id',first)
        page.locator('#signal-previous').click();expect(page.locator('.signal-row').first).to_have_attribute('data-signal-id',first)
        page.locator('#signal-stock').fill('S-Oil');page.locator('#signal-action').select_option('sell');page.locator('#signal-filter').get_by_role('button',name='조회',exact=True).click()
        expect(page.locator('#signal-count')).to_contain_text('전체 22건')
        page.locator('.signal-row').first.click();expect(page.locator('#signal-detail')).to_be_visible()
        expect(page.locator('#signal-message')).to_contain_text('S-Oil')
        assert not page.locator('#signal-detail img').count()
        page.keyboard.press('Escape');expect(page.locator('#signal-detail')).not_to_be_visible()
        page.locator('.signal-back').click()
        page.get_by_role('link',name='매수·매도 알림 내역',exact=True).click()
        expect(page.locator('#signal-stock')).to_have_value('S-Oil');expect(page.locator('#signal-action')).to_have_value('sell')
        page.route('**/api/members/signals?**',lambda route:route.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'연결을 확인해 주세요.'})))
        page.locator('#signal-refresh').click();expect(page.locator('#signal-feedback')).to_contain_text('이전 조회 결과')
        assert page.locator('.signal-row').count()==20
        page.unroute('**/api/members/signals?**');page.locator('#signal-refresh').click();expect(page.locator('#signal-feedback')).not_to_contain_text('이전 조회 결과')
        page.screenshot(path=str(screens/'history-desktop.png'),full_page=True)
        page.locator('#signal-stock').fill('900000');page.locator('#signal-action').select_option('all');page.locator('#signal-filter').get_by_role('button',name='조회',exact=True).click()
        expect(page.locator('#signal-count')).to_contain_text('전체 1건')
        assert page.locator('#signal-results img').count()==0
        expect(page.locator('#signal-results')).to_contain_text('<img src=x onerror=alert(1)>')
        for width in (320,360,390,414,768,1280):
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),('list',width)
            page.locator('.signal-row').first.click();expect(page.locator('#signal-message')).to_contain_text('가상 분석 내용')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),('detail',width)
            assert page.locator('#signal-message img').count()==0
            page.locator('#signal-detail-close').click()
        page.set_viewport_size({'width':390,'height':900})
        page.screenshot(path=str(screens/'history-mobile.png'),full_page=True)
        page.locator('.signal-row').first.click();expect(page.locator('#signal-message')).to_contain_text('가상 분석 내용')
        page.screenshot(path=str(screens/'detail-mobile.png'))
        page.locator('#signal-detail-close').click()
        admin.set_period(operator,member.member_id,start_date=(today-timedelta(days=2)).isoformat(),end_date=(today-timedelta(days=1)).isoformat(),expected_version=3)
        page.evaluate("dispatchEvent(new Event('online'))")
        expect(page.locator('#signal-membership-note')).to_contain_text(' 이전에 제공')
        expect(page.locator('#signal-count')).to_contain_text('전체 1건')
        page.locator('.signal-row').first.click();expect(page.locator('#signal-message')).to_contain_text('가상 분석 내용');page.locator('#signal-detail-close').click()
        assert sms.ingest(sample_signal(datetime.fromtimestamp(now[0],timezone.utc)))['recipient_count']==1
        # Hold a successful pre-logout response; it must not restore another view.
        parked=[]
        page.route('**/api/members/signals?**',lambda route:parked.append((route,route.fetch())))
        page.locator('#signal-refresh').click()
        for _ in range(50):
            if parked:break
            page.wait_for_timeout(20)
        assert parked
        page.locator('.signal-back').click();page.get_by_role('button',name='로그아웃',exact=True).click()
        expect(page.locator('#app h1')).to_have_text('회원 로그인')
        held,response=parked.pop();held.fulfill(response=response)
        page.wait_for_timeout(100)
        expect(page.locator('#app h1')).to_have_text('회원 로그인');assert not page.locator('#signal-results').count()
        stored=page.evaluate("caches.keys().then(names=>Promise.all(names.map(n=>caches.open(n).then(c=>c.keys().then(keys=>keys.map(k=>k.url)))))).then(all=>all.flat())")
        assert not any('/api/' in key for key in stored),stored
        assert sms.gateway.calls==[] and not errors,errors
        print(json.dumps({'history_total':46,'no_retroactive_content':True,'pagination':True,'filter_retained':True,'expired_history_readable':True,'stale_logout_response_discarded':True,'html_is_text':True,'widths':[320,360,390,414,768,1280],'no_api_cache':True,'real_sms':0,'page_errors':errors},ensure_ascii=False))
        context.close();browser.close()
finally:
    server.shutdown();server.server_close();thread.join(timeout=2);temp.cleanup()
