"""Static-host clean URL regression: mounted aliases, fixture startup and bad responses."""
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
from threading import Thread
from urllib.parse import urlsplit
from playwright.sync_api import expect,sync_playwright

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(os.environ.get('TRADING_MASTER_DEMO_ROOT','/workspace/work/admin-external-review/site/dist'))
before='--expect-before-bug' in sys.argv
requests=[]

class CleanHost(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        parsed=urlsplit(self.path);requests.append(parsed.path)
        prefix='/beta' if parsed.path.startswith('/beta/') else ''
        path=parsed.path[len(prefix):]
        if path=='/admin-demo.html':
            self.send_response(302);self.send_header('Location',prefix+'/admin-demo'+('?'+parsed.query if parsed.query else ''));self.end_headers();return
        if path.startswith('/api/auth/') or path.startswith('/api/admin/'):
            # Replicate an empty response when the old demo falls into a real API.
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length','0');self.end_headers();return
        if path in ('/admin-demo','/admin-demo/'):
            path='/admin-demo.html'
        self.path=path+('?'+parsed.query if parsed.query else '')
        super().do_GET()

server=ThreadingHTTPServer(('127.0.0.1',0),partial(CleanHost,directory=str(root)))
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
base=f'http://127.0.0.1:{server.server_port}/'
aliases=['admin-demo.html','admin-demo','admin-demo/','beta/admin-demo.html','beta/admin-demo','beta/admin-demo/']
errors=[]
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            if before:
                context=browser.new_context();page=context.new_page();page.goto(base+'admin-demo.html',wait_until='networkidle')
                assert urlsplit(page.url).path=='/admin-demo'
                expect(page.locator('#admin-phone')).to_have_value('');expect(page.locator('#admin-password')).to_have_value('')
                expect(page.locator('#admin-login-message')).to_contain_text('Unexpected end of JSON input')
                assert any('/api/auth/' in r for r in requests)
                print(json.dumps({'before_bug_reproduced':True,'clean_path':'/admin-demo','fixture_missing':True,'empty_json_error':True}));context.close()
            else:
                for alias in aliases:
                    start=len(requests);context=browser.new_context(viewport={'width':390,'height':1000},locale='ko-KR');page=context.new_page()
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    page.goto(base+alias+'#members',wait_until='networkidle')
                    expect(page.locator('#admin-phone')).to_have_value('01000009999');expect(page.locator('#admin-password')).to_have_value('demo')
                    assert page.evaluate('document.documentElement.dataset.tmAdminDemo')=='true'
                    assert page.evaluate('document.baseURI')==base+('beta/' if alias.startswith('beta/') else '')
                    page.locator('#admin-login-submit').click();expect(page.locator('#count-total')).to_have_text('241')
                    page.get_by_role('button',name='010-****-0001 상세',exact=True).click();expect(page.locator('#consent-count')).to_contain_text('전체 47건')
                    page.get_by_role('button',name='기간 연장',exact=True).click();expect(page.locator('#admin-feedback')).to_contain_text('저장했습니다')
                    page.locator('[data-admin-tab="messaging"]').click();expect(page.locator('#message-count-total')).to_have_text('43,200')
                    page.locator('#admin-logout').click();expect(page.locator('#admin-login')).to_be_visible()
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    assert not [r for r in requests[start:] if '/api/auth/' in r or '/api/admin/' in r]
                    context.close()
                # A bad response must be readable and unauthorized responses clear private UI.
                context=browser.new_context();page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(base+'admin-demo',wait_until='networkidle');page.locator('#admin-login-submit').click();expect(page.locator('#count-total')).to_have_text('241')
                page.evaluate("window.TRADING_MASTER_ADMIN_DEMO={fetch:async()=>new Response('',{status:200})}")
                page.locator('#admin-refresh').click();expect(page.locator('#admin-feedback')).to_contain_text('체험 화면의 응답을 읽지 못했습니다')
                assert 'Unexpected end' not in page.locator('#admin-feedback').inner_text()
                page.evaluate("window.TRADING_MASTER_ADMIN_DEMO={fetch:async()=>new Response('',{status:401})}")
                page.locator('#admin-refresh').click();expect(page.locator('#admin-login')).to_be_visible();assert page.locator('#admin-members').inner_text()==''
                context.close()
                # If demo assets fail, the document marker still blocks native API fallback.
                context=browser.new_context();page=context.new_page();start=len(requests)
                page.route('**/admin-demo-model.js*',lambda route:route.abort())
                page.goto(base+'beta/admin-demo/',wait_until='networkidle')
                expect(page.locator('#admin-login-message')).to_contain_text('체험 화면을 불러오지 못했습니다')
                assert not [r for r in requests[start:] if '/api/' in r];context.close()
                assert not errors,errors
                print(json.dumps({'clean_url_aliases':aliases,'prefilled_fixture_login':True,'member_consent_period_and_message_views':True,
                                  'mounted_and_trailing_slash_assets':True,'no_real_api_fallback':True,'empty_response_korean_error':True,
                                  'empty_unauthorized_clears_ui':True,'missing_fixture_fails_closed':True,'javascript_errors':errors,'real_sms':0},ensure_ascii=False))
        finally:browser.close()
finally:server.shutdown();server.server_close();thread.join(timeout=2)
