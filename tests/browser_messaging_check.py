"""500,000 fictional records through the real admin HTTP/UI, with no sends."""
from datetime import datetime,timezone
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import Error as PlaywrightError,expect,sync_playwright

root=Path(__file__).resolve().parent.parent
modules=Path('/workspace/trading-master-engine/services')
sys.path[:0]=[str(modules/'trading-master-members'),str(modules/'trading-master-members/tests')]
from messaging_fixture import seed_history
from trading_master_members.administration import Administration
from trading_master_members.service import MemberService,MockSms
from trading_master_members.server import make_server
from trading_master_sms.demo import sample_signal
from trading_master_sms.models import iso

temp=TemporaryDirectory(prefix='messaging-browser-');directory=Path(temp.name)
members=MemberService(directory/'members.sqlite3',sms=MockSms())
Administration(members).bootstrap('01000000090','test operator password')
sms_path=directory/'history.sqlite3';sms=seed_history(sms_path)
server=make_server(members,static_dir=root/'build/site',port=0,base_path='/beta/',sms_database=sms_path)
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
url=f'http://127.0.0.1:{server.server_port}/beta/'
screens=Path('/workspace/work/messaging-review');screens.mkdir(parents=True,exist_ok=True)
errors=[]

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--lang=ko-KR'])
        context=browser.new_context(locale='ko-KR',viewport={'width':1440,'height':1100})
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        responses=[]
        page.on('response',lambda response:responses.append({'path':response.url.split('/api/admin/messaging/')[-1][:160],'status':response.status}) if '/api/admin/messaging/' in response.url else None)
        try:
            page.goto(url,wait_until='networkidle')
            expect(page.locator('#app h1')).to_have_text('관심종목')
            assert page.evaluate("TRADING_MASTER_CONFIG.membersEnabled") is False
            assert page.evaluate("fetch(new URL('api/v2/snapshot',document.baseURI)).then(r=>r.status)")==200
            page.goto(url+'admin.html',wait_until='networkidle')
            assert page.evaluate("fetch(new URL('api/admin/messaging/signals',document.baseURI)).then(r=>r.status)")==401
            page.locator('#admin-phone').fill('01000000090');page.locator('#admin-password').fill('test operator password');page.locator('#admin-login-submit').click()
            expect(page.locator('#admin-dashboard')).to_be_visible()
            page.get_by_role('button',name='문자 발송 이력',exact=True).click()
            expect(page.locator('#message-count-total')).to_have_text('500,000')
            expect(page.locator('#message-results tbody tr')).to_have_count(50)
            expect(page.locator('#message-mode')).to_contain_text('모의 발송')
            page.screenshot(path=str(screens/'signals-desktop.png'),full_page=True)
            # A problem batch opens only its failed/unknown recipient records.
            page.locator('#message-results [data-attention]').first.click()
            expect(page.locator('#message-result-total')).to_have_text('검색 결과 624건')
            expect(page.locator('#message-status')).to_have_value('attention')
            expect(page.locator('#message-signal-scope')).to_be_visible()
            expect(page.locator('#message-results tbody tr')).to_have_count(50)
            unknown=page.locator('#message-results tbody tr').filter(has=page.locator('.message-status-unknown')).first
            unknown.locator('[data-delivery-detail]').click()
            expect(page.locator('#message-detail')).to_be_visible()
            expect(page.locator('#message-detail-body')).to_contain_text('자동 재발송하지 않습니다')
            expect(page.locator('#message-detail-body')).to_contain_text('1차 시도')
            expect(page.locator('#message-detail-body')).to_contain_text('회원번호')
            page.screenshot(path=str(screens/'unknown-detail-desktop.png'),full_page=True)
            page.locator('#message-detail-close').click()
            page.locator('#message-reset').click();expect(page.locator('#message-count-total')).to_have_text('500,000')
            page.locator('#message-recipient').fill('0001');page.locator('#message-search-form').get_by_role('button',name='검색',exact=True).click()
            expect(page.locator('#message-result-total')).to_have_text('검색 결과 200건')
            expect(page.locator('#message-count-total')).to_have_text('200')
            expect(page.locator('#message-results tbody tr')).to_have_count(50)
            assert page.locator('#message-results tbody').inner_text().count('010-****-0001')==50
            page.locator('#message-reset').click();expect(page.locator('#message-count-total')).to_have_text('500,000')
            page.locator('#message-limit').select_option('100')
            expect(page.locator('#message-results tbody tr')).to_have_count(100)
            page.locator('#message-limit').select_option('200')
            expect(page.locator('#message-results tbody tr')).to_have_count(200)
            first_id=page.locator('#message-results [data-delivery-detail]').first.get_attribute('data-delivery-detail')
            page.locator('#message-next').click();expect(page.locator('#message-results [data-delivery-detail]').first).not_to_have_attribute('data-delivery-detail',first_id)
            second_id=page.locator('#message-results [data-delivery-detail]').first.get_attribute('data-delivery-detail')
            page.locator('[data-admin-tab="members"]').click();expect(page.locator('#admin-members-pane')).to_be_visible()
            page.locator('[data-admin-tab="messaging"]').click()
            expect(page.locator('#message-results [data-delivery-detail]').first).to_have_attribute('data-delivery-detail',second_id)
            page.locator('#message-previous').click();expect(page.locator('#message-results [data-delivery-detail]').first).to_have_attribute('data-delivery-detail',first_id)
            # New rows cannot move the current first/next/last page selection.
            now=datetime.now(timezone.utc);signal=sample_signal(now,source_event_id='new-event',position_id='new-position')
            signal['name']='<img src=x onerror="globalThis.reportXss=1">'
            with sms._transaction() as db:
                original=dict(db.execute('SELECT * FROM signals WHERE id=200').fetchone())
                original.update(id=201,source_event_id='new-event',position_id='new-position',observed_at=iso(now),created_at=iso(now),payload_json=json.dumps(signal),message='[가상] '+signal['name'])
                db.execute('INSERT INTO signals('+','.join(original)+') VALUES('+','.join('?' for _ in original)+')',list(original.values()))
                delivery=dict(db.execute("SELECT * FROM deliveries WHERE status='queued' LIMIT 1").fetchone())
                delivery.update(id='f'*32,signal_id=201,created_at=iso(now),updated_at=iso(now))
                db.execute('INSERT INTO deliveries('+','.join(delivery)+') VALUES('+','.join('?' for _ in delivery)+')',list(delivery.values()))
            page.locator('#message-last').click();expect(page.locator('#message-next')).to_be_disabled()
            expect(page.locator('#message-count-total')).to_have_text('500,000')
            page.locator('#message-first').click();expect(page.locator('#message-count-total')).to_have_text('500,000')
            expect(page.locator('#message-results [data-delivery-detail]').first).to_have_attribute('data-delivery-detail',first_id)
            page.locator('#message-refresh').click();expect(page.locator('#message-count-total')).to_have_text('500,001')
            expect(page.locator('#message-results [data-delivery-detail]').first).to_have_attribute('data-delivery-detail','f'*32)
            assert page.locator('#message-results img').count()==0 and page.evaluate('globalThis.reportXss') is None
            # Query failure retains an explicitly marked previous result.
            held=sms_path.with_suffix('.held');sms_path.rename(held)
            try:
                page.locator('#message-refresh').click();expect(page.locator('#message-feedback')).to_contain_text('마지막으로 조회한 결과')
                expect(page.locator('#message-count-total')).to_have_text('500,001')
            finally:held.rename(sms_path)
            page.locator('#message-refresh').click();expect(page.locator('#message-feedback')).to_have_text('')
            page.locator('#message-limit').select_option('50');expect(page.locator('#message-results tbody tr')).to_have_count(50)
            page.locator('[data-message-view="signals"]').click();expect(page.locator('#message-result-total')).to_have_text('검색 결과 201개 신호')
            page.locator('[data-signal-detail="201"]').click();expect(page.locator('#message-detail-body')).to_contain_text('<img src=x')
            assert page.locator('#message-detail-body img').count()==0
            page.locator('#message-detail-close').click()
            # Restore the fictional display name after proving HTML remains inert.
            signal['name']='S-Oil'
            with sms._transaction() as db:db.execute('UPDATE signals SET payload_json=?,message=? WHERE id=201',(json.dumps(signal),'[가상] S-Oil'))
            page.locator('#message-refresh').click()
            expect(page.locator('#message-results tbody tr').first).to_contain_text('S-Oil')
            for width in (320,360,390,414,768,1280):
                page.set_viewport_size({'width':width,'height':900})
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
            page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(screens/'history-mobile.png'),full_page=True)
            page.set_viewport_size({'width':1440,'height':1100})
            # A late history response cannot repopulate information after logout.
            parked=[]
            page.route('**/api/admin/messaging/signals?*',lambda route:parked.append((route,route.fetch())))
            page.locator('#message-refresh').click()
            for _ in range(100):
                if parked:break
                page.wait_for_timeout(20)
            assert parked
            page.locator('#admin-logout').click();expect(page.locator('#admin-login')).to_be_visible()
            route,response=parked.pop()
            try:route.fulfill(response=response)
            except PlaywrightError:pass
            page.wait_for_timeout(200)
            assert page.locator('#message-results').inner_text()==''
            expect(page.locator('#message-count-total')).to_have_text('—')
            assert page.evaluate("fetch(new URL('api/admin/messaging/signals',document.baseURI)).then(r=>r.status)")==401
            assert page.evaluate("fetch(new URL('api/v2/snapshot',document.baseURI)).then(r=>r.status)")==200
            keys=page.evaluate("caches.keys().then(names=>Promise.all(names.map(n=>caches.open(n).then(c=>c.keys().then(keys=>keys.map(k=>k.url)))))).then(all=>all.flat())")
            assert not any('/api/' in key or 'admin' in key for key in keys)
            assert not errors,errors;assert sms.gateway.calls==[]
            print(json.dumps({'fictional_records':500000,'signal_batches':200,'server_pagination':[50,100,200],
                              'problem_signal_drilldown':True,'phone_suffix_search':True,'anchored_new_records':True,
                              'explicit_failure_preserves_previous_result':True,'detail_xss_escaped':True,
                              'late_response_after_logout_discarded':True,'beta_without_login':True,
                              'responsive_widths':[320,360,390,414,768,1280],'real_sms':0,'javascript_errors':errors},ensure_ascii=False))
        except Exception:
            print(json.dumps({'feedback':page.locator('#message-feedback').inner_text(),'errors':errors,'responses':responses[-6:]},ensure_ascii=False))
            page.screenshot(path=str(screens/'failure.png'),full_page=True)
            raise
        finally:context.close();browser.close()
finally:server.shutdown();server.server_close();thread.join(timeout=2);temp.cleanup()
