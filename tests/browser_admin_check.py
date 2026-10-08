"""Admin HTTP/UI integration; fictional members, no SMS/payment, beta remains open."""
from datetime import datetime, timedelta
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright

root=Path(__file__).resolve().parent.parent
sys.path.insert(0,"/workspace/trading-master-engine/services/trading-master-members")
from trading_master_members.administration import Administration,KST
from trading_master_members.server import make_server
from trading_master_members.service import MemberService,MockSms

temp=TemporaryDirectory(prefix="admin-browser-")
service=MemberService(Path(temp.name)/"members.sqlite3",sms=MockSms())
administration=Administration(service)
administration.bootstrap("01000000090","test admin password")
session=service.ensure_session()[0]
operator=service.login(phone="01000000090",password="test admin password",session=session,client="test-admin",remember=False)
members=[]
for phone in ("01000000001","01000000002","01000000003"):
    session=service.ensure_session()[0]
    code=service.request_code(phone=phone,purpose="signup",session=session,client="test-signup")
    member=service.signup(phone=phone,password="test member password",challenge=code["challenge_id"],code=code["mock_code"],session=session)
    members.append(member.member_id)
today=datetime.now(KST).date()
administration.set_period(operator,members[1],start_date=(today-timedelta(days=90)).isoformat(),end_date=(today-timedelta(days=60)).isoformat(),expected_version=0)
administration.set_period(operator,members[2],start_date=today.isoformat(),end_date=(today+timedelta(days=29)).isoformat(),expected_version=0)
administration.set_state(operator,members[2],state="paused",expected_version=1)
server=make_server(service,static_dir=root/"build/site",port=0,base_path="/beta/")
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
url=f"http://127.0.0.1:{server.server_port}/beta/"
screens=Path('/workspace/work/admin-review');screens.mkdir(parents=True,exist_ok=True)
errors=[]

try:
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=["--no-sandbox","--lang=ko-KR"])
        context=browser.new_context(viewport={"width":1440,"height":1050},locale="ko-KR")
        page=context.new_page();page.on("pageerror",lambda error:errors.append(str(error)))
        try:
            page.goto(url,wait_until="networkidle")
            expect(page.locator("#app h1")).to_have_text("관심종목")
            assert page.evaluate("TRADING_MASTER_CONFIG.membersEnabled") is False
            assert page.evaluate("fetch(new URL('api/v2/snapshot',document.baseURI)).then(r=>r.status)")==200
            page.goto(url+"admin.html",wait_until="networkidle")
            expect(page.locator("#admin-login")).to_be_visible()
            assert page.evaluate("fetch(new URL('api/admin/members',document.baseURI)).then(r=>r.status)")==401
            page.locator("#admin-phone").fill("01000000001");page.locator("#admin-password").fill("test member password")
            page.locator("#admin-login-submit").click()
            expect(page.locator("#admin-login-message")).to_contain_text("관리자 권한")
            expect(page.locator("#admin-dashboard")).not_to_be_visible()
            page.locator("#admin-phone").fill("01000000090");page.locator("#admin-password").fill("test admin password")
            page.locator("#admin-login-submit").click()
            expect(page.locator("#admin-dashboard")).to_be_visible()
            expect(page.locator("#count-total")).to_have_text("4")
            expect(page.locator("#count-expired")).to_have_text("1")
            page.locator("#member-search").fill("0001");page.locator("#admin-search-form").get_by_role("button",name="검색",exact=True).click()
            expect(page.locator("#member-total")).to_have_text("1명")
            page.get_by_role("button",name="010-****-0001 상세",exact=True).click()
            expect(page.locator(".detail-phone")).to_have_text("010-0000-0001")
            page.locator("#subscription-start").fill(today.isoformat());page.locator("#subscription-end").fill((today+timedelta(days=29)).isoformat())
            page.locator("#subscription-note").fill("베타 이용 기간 부여")
            page.get_by_role("button",name="이용 기간 저장",exact=True).click()
            expect(page.locator("#detail-content .status-pill")).to_have_text("이용 중")
            expect(page.locator("#count-active")).to_have_text("1")
            page.locator("#subscription-note").fill("베타 기간 연장")
            page.get_by_role("button",name="기간 연장",exact=True).click()
            expect(page.locator("#subscription-end")).to_have_value((today+timedelta(days=59)).isoformat())
            page.get_by_role("button",name="일시정지",exact=True).click()
            expect(page.locator("#detail-content .status-pill")).to_have_text("일시정지")
            page.get_by_role("button",name="기간 연장",exact=True).click()
            expect(page.locator("#detail-content .status-pill")).to_have_text("일시정지")
            page.get_by_role("button",name="이용 재개",exact=True).click()
            expect(page.locator("#detail-content .status-pill")).to_have_text("이용 중")
            page.locator("#member-search").fill("");page.locator("#admin-search-form").get_by_role("button",name="검색",exact=True).click()
            expect(page.locator("#member-total")).to_have_text("4명")
            expect(page.get_by_role("button",name="이용 기간 저장",exact=True)).to_be_enabled()
            page.screenshot(path=str(screens/"admin-desktop.png"),full_page=True)
            for width in (320,360,390,414,768,1280):
                page.set_viewport_size({"width":width,"height":900})
                assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),width
            page.set_viewport_size({"width":390,"height":844})
            page.screenshot(path=str(screens/"admin-mobile.png"),full_page=True)
            page.locator("#member-status").select_option("expired")
            expect(page.locator("#member-total")).to_have_text("1명")
            page.get_by_role("button",name="010-****-0002 상세",exact=True).click()
            page.get_by_role("button",name="기간 연장",exact=True).click()
            expect(page.locator("#detail-content .status-pill")).to_have_text("이용 중")
            expect(page.locator("#subscription-start")).to_have_value(today.isoformat())
            expect(page.locator("#subscription-end")).to_have_value((today+timedelta(days=29)).isoformat())
            detail=administration.detail(operator,members[1])
            administration.extend(operator,members[1],days=30,expected_version=detail["member"]["subscription"]["version"])
            page.get_by_role("button",name="기간 연장",exact=True).click()
            expect(page.locator("#admin-feedback")).to_contain_text("다른 관리자")
            assert len(administration.detail(operator,members[1])["history"])==3
            page.get_by_role("button",name="최신 정보 불러오기",exact=True).click()
            expect(page.locator("#subscription-end")).to_have_value((today+timedelta(days=59)).isoformat())
            page.locator("#subscription-note").fill('<img src=x onerror="alert(1)">')
            page.get_by_role("button",name="이용 기간 저장",exact=True).click()
            expect(page.locator(".history")).to_contain_text('<img src=x onerror="alert(1)">')
            assert page.locator("#detail-content img").count()==0
            assert page.evaluate("localStorage.length")==0
            fixture=page.evaluate("fetch(new URL('api/admin/members',document.baseURI)).then(r=>r.json())")
            pending=[]
            page.route("**/api/admin/members?*",lambda route:pending.append(route))
            page.locator("#admin-refresh").click()
            page.wait_for_timeout(150)
            assert pending
            page.locator("#admin-logout").click()
            expect(page.locator("#admin-login")).to_be_visible()
            pending[0].fulfill(json=fixture)
            page.wait_for_timeout(150)
            assert page.locator("#admin-members").inner_text()==""
            assert page.locator("#detail-content").inner_text()==""
            expect(page.locator("#count-total")).to_have_text("—")
            assert page.evaluate("fetch(new URL('api/admin/members',document.baseURI)).then(r=>r.status)")==401
            page.goto(url,wait_until="networkidle")
            expect(page.locator("#app h1")).to_have_text("관심종목")
            assert page.evaluate("TRADING_MASTER_CONFIG.membersEnabled") is False
            keys=page.evaluate("caches.keys().then(keys=>Promise.all(keys.map(k=>caches.open(k).then(c=>c.keys())))).then(groups=>groups.flat().map(r=>r.url))")
            assert all("/api/" not in key and "admin.html" not in key and "admin.js" not in key for key in keys),keys
            assert not errors,errors
            print(json.dumps({"browser":"Chromium","beta_without_login":True,"admin_only_access":True,"subscription_setup_extension_pause_resume":True,
                              "concurrent_edit_conflict":True,"audit_escapes_html":True,"logout_discards_late_response":True,
                              "widths":[320,360,390,414,768,1280],"private_api_cache":False,"real_sms":0,"javascript_errors":errors},ensure_ascii=False))
        finally:
            context.close();browser.close()
finally:
    server.shutdown();server.server_close();thread.join(timeout=2);temp.cleanup()
