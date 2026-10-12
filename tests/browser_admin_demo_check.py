"""External static demo: UI parity, isolated fiction, no real auth/admin/send requests."""
from datetime import datetime,timedelta
import json
from pathlib import Path
import sys
from zoneinfo import ZoneInfo
from playwright.sync_api import expect,sync_playwright

url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18744/'
screens=Path('/workspace/work/admin-external-review/qa');screens.mkdir(parents=True,exist_ok=True)
today=datetime.now(ZoneInfo('Asia/Seoul')).date();errors=[];requests=[]

def enter(page):
    expect(page.locator('#admin-phone')).to_have_value('01000009999')
    expect(page.locator('#admin-password')).to_have_value('demo')
    page.locator('#admin-login-submit').click();expect(page.locator('#admin-dashboard')).to_be_visible()

def choose(page,number):
    page.locator('[data-admin-tab="members"]').click()
    page.locator('#member-filter-reset').click();page.locator('#member-search').fill(number)
    page.locator('#admin-search-form').get_by_role('button',name='검색',exact=True).click()
    expect(page.locator('#member-total')).to_have_text('1명')
    page.get_by_role('button',name=f'010-****-{number} 상세',exact=True).click()
    expect(page.locator('.detail-phone')).to_have_text(f'010-5555-{number}')

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    context=browser.new_context(viewport={'width':1440,'height':1100},locale='ko-KR');page=context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
    try:
        page.goto(url+'admin.html#members',wait_until='networkidle')
        assert page.url.endswith('admin-demo.html#members')
        expect(page.locator('.demo-banner')).to_contain_text('가상 데이터');expect(page.locator('#admin-login h1')).to_have_text('관리자 화면 체험')
        page.screenshot(path=str(screens/'entry-desktop.png'),full_page=True)
        enter(page);expect(page.locator('#count-total')).to_have_text('241');expect(page.locator('#count-sms_ready')).to_have_text('30')
        expect(page.locator('#admin-members tr[data-id]')).to_have_count(20)
        page.locator('#page-next').click();expect(page.locator('#page-label')).to_have_text('2 / 13')
        choose(page,'0001');expect(page.locator('#consent-count')).to_contain_text('전체 47건');expect(page.locator('#consent-results li')).to_have_count(20)
        page.locator('#consent-next').click();expect(page.locator('#consent-count')).to_contain_text('2페이지')
        page.locator('#consent-next').click();expect(page.locator('#consent-results li')).to_have_count(7);expect(page.locator('#consent-next')).to_be_disabled()
        page.locator('#consent-previous').click();expect(page.locator('#consent-count')).to_contain_text('2페이지')
        page.locator('#consent-refresh').click();expect(page.locator('#consent-count')).to_contain_text('1페이지')
        page.locator('#consent-results summary').first.click();expect(page.locator('#consent-results')).to_contain_text('문자 수신 중단은 이용권·정기결제 해지와 별도')
        before=page.locator('#subscription-end').input_value()
        page.get_by_role('button',name='기간 연장',exact=True).click()
        expect(page.locator('#subscription-end')).to_have_value((datetime.fromisoformat(before)+timedelta(days=30)).date().isoformat())
        page.get_by_role('button',name='일시정지',exact=True).click();expect(page.locator('#detail-content .status-pill')).to_have_text('일시정지')
        expect(page.locator('.sms-overview')).to_contain_text('문자 켜짐');expect(page.locator('.sms-overview')).to_contain_text('신규 제공 없음')
        expect(page.locator('#count-sms_ready')).to_have_text('29')
        page.get_by_role('button',name='이용 재개',exact=True).click();expect(page.locator('#count-sms_ready')).to_have_text('30')
        page.locator('#subscription-note').fill('<img src=x onerror="alert(1)"> 체험')
        page.get_by_role('button',name='이용 기간 저장',exact=True).click();expect(page.locator('.history')).to_contain_text('<img src=x onerror="alert(1)"> 체험')
        assert page.locator('#detail-content img').count()==0
        choose(page,'0003');page.get_by_role('button',name='기간 연장',exact=True).click()
        expect(page.locator('#subscription-start')).to_have_value(today.isoformat());expect(page.locator('#count-sms_ready')).to_have_text('31')
        page.locator('#member-status').select_option('expired');page.locator('#member-sms').select_option('on')
        page.locator('#member-search').fill('');page.locator('#admin-search-form').get_by_role('button',name='검색',exact=True).click();expect(page.locator('#member-total')).to_have_text('29명')
        page.screenshot(path=str(screens/'members-desktop.png'),full_page=True)
        for width in (320,360,390,414,768,1280):
            page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.set_viewport_size({'width':390,'height':1000});page.screenshot(path=str(screens/'members-mobile.png'),full_page=True)
        page.locator('[data-admin-tab="messaging"]').click();expect(page.locator('#message-count-total')).to_have_text('43,200')
        expect(page.locator('#message-results tbody tr')).to_have_count(50)
        page.locator('#message-last').click();expect(page.locator('#message-results tbody tr')).to_have_count(30);expect(page.locator('#message-next')).to_be_disabled()
        page.locator('#message-first').click();expect(page.locator('#message-results tbody tr')).to_have_count(50)
        page.locator('[data-signal-detail]').first.click();expect(page.locator('#message-detail')).to_be_visible()
        expect(page.locator('#message-detail-body pre')).to_contain_text('가상 매매 신호');page.locator('#message-detail-close').click()
        page.locator('[data-attention]').first.click();expect(page.locator('[data-message-view="deliveries"]')).to_have_attribute('aria-pressed','true')
        expect(page.locator('#message-results')).to_contain_text('실패');page.locator('[data-delivery-detail]').first.click()
        expect(page.locator('#message-detail-body')).to_contain_text('010-5555-');page.locator('#message-detail-close').click()
        page.locator('#message-reset').click();expect(page.locator('#message-count-total')).to_have_text('43,200')
        page.locator('#message-limit').select_option('200');expect(page.locator('#message-results tbody tr')).to_have_count(200)
        page.locator('#message-next').click();expect(page.locator('#message-results tbody tr')).to_have_count(200)
        page.screenshot(path=str(screens/'messages-mobile.png'),full_page=True)
        for width in (320,390,768,1440):
            page.set_viewport_size({'width':width,'height':1100});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
        page.set_viewport_size({'width':1440,'height':1100});page.screenshot(path=str(screens/'messages-desktop.png'),full_page=True)
        page.locator('#admin-logout').click();expect(page.locator('#admin-login')).to_be_visible()
        assert page.locator('#admin-members').inner_text()=='';assert page.locator('#message-results').inner_text()==''
        enter(page);choose(page,'0001');expect(page.locator('#subscription-end')).to_have_value((datetime.fromisoformat(before)+timedelta(days=30)).date().isoformat())
        page.locator('#demo-reset').click();expect(page.locator('#admin-login')).to_be_visible();enter(page);choose(page,'0001');expect(page.locator('#subscription-end')).to_have_value(before)
        assert page.evaluate('localStorage.length+sessionStorage.length')==0
        assert not [r for r in requests if '/api/auth/' in r or '/api/admin/' in r],requests
        # Another tab starts with its own fixture and no remembered administrator.
        other=context.new_page();other.goto(url+'admin-demo.html#messaging',wait_until='networkidle');expect(other.locator('#admin-login')).to_be_visible();other.close()
        # Failed fixture loading must never fall through to a real authentication API.
        isolated=browser.new_context();blocked=isolated.new_page();blocked_requests=[]
        blocked.on('request',lambda r:blocked_requests.append(r.url));blocked.route('**/admin-demo-model.js',lambda route:route.abort())
        blocked.goto(url+'admin-demo.html',wait_until='networkidle');expect(blocked.locator('#admin-login-message')).to_contain_text('체험 화면을 불러오지 못했습니다')
        assert not [r for r in blocked_requests if '/api/' in r];isolated.close()
        # Existing beta and shared payment prototype still have their old entrance.
        page.goto(url,wait_until='networkidle');expect(page.locator('#app h1')).to_have_text('관심종목')
        assert page.locator('#admin-login').count()==0
        expect(page.locator('.product-demo-entry a')).to_have_attribute('href','payment-demo.html#products')
        assert not errors,errors
        print(json.dumps({'static_external_entry':True,'prefilled_fictional_login':True,'member_and_consent_paging':True,'period_extension_pause_resume':True,
                          'fictional_deliveries':43200,'delivery_pages_50_200_and_drilldowns':True,'reset_and_new_tab_isolation':True,
                          'no_real_auth_admin_requests':True,'missing_fixture_fails_closed':True,'beta_open_and_payment_link_preserved':True,
                          'widths':[320,360,390,414,768,1280,1440],'real_sms':0,'javascript_errors':errors},ensure_ascii=False))
    finally:context.close();browser.close()
