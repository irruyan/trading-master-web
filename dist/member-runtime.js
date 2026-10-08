/* Phone membership. Session cookies are issued and verified by the member server. */
(() => {
  'use strict';
  if (!window.TRADING_MASTER_CONFIG?.membersEnabled) return;
  const app = document.getElementById('app');
  const menu = document.getElementById('member-menu');
  const state = { ready: false, member: null, csrf: '', mode: '', expires: 0, error: '', busy: false, notice: '' };
  const authPaths = new Set(['/login', '/signup', '/reset-password', '/change-phone', '/member']);
  let verification = null, verificationTimer = null, sessionTimer = null, checking = null, lastCheck = 0, returnRoute = '/';
  let renderedKey = '', sessionEpoch = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const phoneText = value => String(value).replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  const normalized = value => String(value).replace(/[\s()-]/g, '').replace(/^\+82/, '0');
  const path = () => location.hash.slice(1).split('?')[0] || '/';
  const go = value => window.TRADING_MASTER_GO(value);
  const canRead = () => Boolean(state.ready && state.member && state.expires*1000 > Date.now());
  const subscriptionKey = member => JSON.stringify(member?.subscription || null);
  const subscriptionLabels = {none:'이용 기간 미등록',scheduled:'시작 예정',active:'이용 중',expired:'기간 만료',paused:'일시정지',cancelled:'이용 중단'};
  const subscriptionCopy = {none:'이용 기간이 아직 등록되지 않았습니다.',scheduled:'시작일부터 매수·매도 알림의 수신 대상에 포함됩니다.',active:'확정된 매수·매도 알림의 수신 대상입니다.',expired:'이용 기간이 종료되어 알림 수신 대상에서 제외됩니다.',paused:'이용이 일시정지되어 알림 수신 대상에서 제외됩니다.',cancelled:'이용이 중단되어 알림 수신 대상에서 제외됩니다.'};

  async function request(endpoint, data) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL('api/'+endpoint, document.baseURI), {
        method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: data === undefined ? {} : {'Content-Type':'application/json', 'X-Trading-Master-Members':'1', 'X-CSRF-Token':state.csrf},
        body: data === undefined ? undefined : JSON.stringify(data)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '잠시 후 다시 시도해 주세요.');
      return body;
    } catch (error) {
      if (error instanceof TypeError || error.name === 'AbortError') throw new Error('연결을 확인한 뒤 다시 시도해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  function applySession(result) {
    if (typeof result.csrf_token !== 'string' || !Number.isFinite(result.expires_at)) throw new Error('로그인 정보를 확인하지 못했습니다.');
    const previous = state.member;
    state.ready = true; state.member = result.member || null; state.csrf = result.csrf_token;
    state.expires = result.expires_at; state.mode = result.verification_mode; state.error = '';
    if (!state.member || previous?.id !== state.member.id) window.TRADING_MASTER_CLEAR_DATA?.();
    menu.hidden = false;
    menu.textContent = state.member ? '내 계정' : '로그인';
    menu.href = state.member ? '#/member' : '#/login';
    clearTimeout(sessionTimer);
    // A timer longer than 2^31 ms would fire immediately in the browser.
    if (state.member) {
      const sub=state.member.subscription;
      const boundary=sub?.status==='scheduled'?sub.starts_at:sub?.status==='active'?sub.ends_at:null;
      const delay=boundary?Math.min(state.expires*1000-Date.now(),boundary*1000-Date.now()+100):state.expires*1000-Date.now();
      sessionTimer = setTimeout(() => checkSession(true), Math.min(Math.max(delay, 1000), 3600000));
    }
  }

  function checkSession(force = false) {
    if (checking) return checking;
    if (!force && Date.now()-lastCheck < 30000) return Promise.resolve();
    lastCheck = Date.now();
    const epoch=sessionEpoch;
    checking = request('auth/session').then(result => {
      if (epoch!==sessionEpoch) return false;
      const changed = !state.ready || state.member?.id !== result.member?.id || state.member?.phone !== result.member?.phone || subscriptionKey(state.member)!==subscriptionKey(result.member) || Boolean(state.error);
      applySession(result);
      if (changed) window.TRADING_MASTER_RENDER();
      if (canRead()) window.TRADING_MASTER_REFRESH?.();
      return true;
    }).catch(error => {
      if (epoch!==sessionEpoch) return false;
      // Keep a verified, unexpired session during a temporary connectivity loss.
      if (canRead()) return false;
      state.ready = false; state.member = null; state.error = error.message;
      window.TRADING_MASTER_CLEAR_DATA?.(); window.TRADING_MASTER_RENDER();
      return false;
    }).finally(() => { checking = null; });
    return checking;
  }

  function phoneField() {
    return '<label for="member-phone">휴대폰 번호</label><input id="member-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="010-1234-5678" maxlength="30" required>';
  }
  function passwordField(id, label, fresh = false) {
    return '<label for="'+id+'">'+label+'</label><div class="password-field"><input id="'+id+'" name="'+id+'" type="password" autocomplete="'+(fresh?'new-password':'current-password')+'" '+(fresh?'minlength="8" ':'')+'maxlength="128" required><button type="button" data-password="'+id+'" aria-controls="'+id+'" aria-pressed="false">보기</button></div>';
  }
  function rememberField() {
    return '<label class="member-check"><input type="checkbox" id="member-remember" checked>로그인 유지</label>';
  }
  function feedback() {
    return '<p id="member-feedback" class="member-feedback" role="status" aria-live="polite">'+escape(state.notice)+'</p>';
  }
  function frame(title, copy, contents) {
    return '<section class="member-card"><span class="member-kicker">TRADING MASTER · 회원 전용</span><h1 id="main-content" tabindex="-1">'+title+'</h1><p class="member-lede">'+copy+'</p>'+
      (state.mode==='mock'?'<p class="member-test-note">테스트 화면입니다. 실제 문자는 발송되지 않습니다.</p>':'')+contents+'</section>';
  }

  function render(requested) {
    const route = requested.split('?')[0], locked = !canRead();
    if (locked && !authPaths.has(route)) returnRoute = requested;
    const handled = locked || authPaths.has(route);
    document.body.classList.toggle('member-locked', locked);
    document.body.classList.toggle('member-view', handled);
    if (!handled) { renderedKey=''; clearInterval(verificationTimer); verification=null; return false; }
    const key = [route, state.ready, state.member?.id, state.member?.phone, state.error,route==='/member'?subscriptionKey(state.member):''].join('|');
    // A quote refresh must not erase a code/password currently being entered.
    if (key===renderedKey && !state.notice) return true;
    renderedKey=key;
    if (!state.ready) {
      app.innerHTML = frame('회원 서비스', state.error || '로그인 정보를 확인하고 있습니다.', state.error?'<button type="button" class="member-primary" data-member-action="reconnect">다시 시도</button>':'<div class="loading"><span class="loader" aria-hidden="true"></span></div>');
      return true;
    }
    clearInterval(verificationTimer); verification = null;
    if (canRead() && route === '/member') {
      const sub=state.member.subscription || {status:'none'};
      const details='<dl class="member-details"><div><dt>휴대폰 번호</dt><dd>'+escape(phoneText(state.member.phone))+'</dd></div>'+
        (sub.product?'<div><dt>이용 상품</dt><dd>'+escape(sub.product.name)+'</dd></div>':'')+
        '<div><dt>이용 상태</dt><dd id="member-subscription-status">'+escape(subscriptionLabels[sub.status]||'확인 필요')+'</dd></div>'+
        (sub.start_date&&sub.end_date?'<div><dt>이용 기간</dt><dd id="member-subscription-period">'+escape(sub.start_date)+'<br>~ '+escape(sub.end_date)+'까지</dd></div>':'')+'</dl>';
      app.innerHTML = frame('내 계정', '가입 정보와 이용 상태를 확인하세요.', details+'<p class="member-help" id="member-subscription-help">'+escape(subscriptionCopy[sub.status]||'이용 상태를 다시 확인해 주세요.')+'</p>'+
        (sub.end_date?'<p class="member-help">표시된 종료일의 밤 12시까지 이용할 수 있습니다. (한국 시간)</p>':'')+
        feedback()+'<button type="button" class="member-secondary" data-member-action="refresh-subscription">이용 상태 새로고침</button><a class="member-primary" href="#/">운용 화면 보기</a><a class="member-secondary" href="#/change-phone">휴대폰 번호 변경</a><a class="member-secondary" href="#/reset-password">비밀번호 재설정</a><button type="button" class="member-secondary" data-member-action="logout">로그아웃</button>');
    } else if (route === '/signup' || route === '/reset-password' || (route === '/change-phone' && canRead())) {
      const purpose = route === '/signup' ? 'signup' : route === '/change-phone' ? 'change_phone' : 'reset';
      const title = purpose==='signup'?'회원가입':purpose==='reset'?'비밀번호 찾기':'휴대폰 번호 변경';
      const copy = purpose==='signup'?'문자 받을 번호로 가입하세요.':purpose==='reset'?'문자 인증 후 새 비밀번호를 설정하세요.':'새 번호를 인증하면 같은 계정으로 계속 이용할 수 있습니다.';
      app.innerHTML = frame(title, copy, '<form id="member-form" data-kind="'+purpose+'">'+phoneField()+'<button type="button" class="member-secondary" id="member-send-code">인증번호 받기</button><div id="member-verification" hidden><label for="member-code">인증번호</label><input id="member-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><p id="member-code-help" class="member-help"></p>'+(purpose!=='change_phone'?passwordField('member-password', '비밀번호', true)+passwordField('member-confirm', '비밀번호 확인', true)+'<p class="member-help">비밀번호는 8자 이상 입력하세요.</p>':'')+'</div>'+(purpose==='signup'?rememberField():'')+feedback()+'<button type="submit" class="member-primary" id="member-submit" disabled>'+(purpose==='signup'?'가입하고 시작하기':purpose==='reset'?'비밀번호 변경':'번호 변경')+'</button></form><div class="member-links"><a href="'+(canRead()?'#/member':'#/login')+'">'+(canRead()?'내 계정으로':'로그인으로')+'</a></div>');
    } else {
      app.innerHTML = frame('회원 로그인', '매매 알림과 운용 기록을 한곳에서 확인하세요.', '<form id="member-form" data-kind="login">'+phoneField()+passwordField('member-password', '비밀번호')+rememberField()+feedback()+'<button type="submit" class="member-primary" id="member-submit">로그인</button></form><div class="member-links"><a href="#/signup">회원가입</a><a href="#/reset-password">비밀번호 찾기</a></div>');
    }
    state.notice = '';
    document.title = (document.getElementById('main-content')?.textContent || '회원 서비스')+' · 트레이딩 마스터';
    return true;
  }

  function message(text, error = false) {
    const target = document.getElementById('member-feedback');
    if (!target) return;
    target.textContent = text; target.classList.toggle('is-error', error);
  }
  function paintVerification() {
    const send = document.getElementById('member-send-code'), submit = document.getElementById('member-submit');
    if (!send) return;
    const wait = verification ? Math.max(0, Math.ceil((verification.resendAt-Date.now())/1000)) : 0;
    send.disabled = state.busy || wait>0;
    send.textContent = wait ? wait+'초 후 다시 받기' : verification?'인증번호 다시 받기':'인증번호 받기';
    if (submit) submit.disabled = state.busy || !verification || Date.now() >= verification.expiresAt;
    const help = document.getElementById('member-code-help');
    if (verification && help) {
      const remaining = Math.max(0, Math.ceil((verification.expiresAt-Date.now())/1000));
      help.textContent = remaining ? '유효 시간 '+Math.floor(remaining/60)+'분 '+remaining%60+'초'+(verification.mock?' · 테스트 인증번호 '+verification.mock:'') : '인증 시간이 지났습니다. 인증번호를 다시 받아 주세요.';
    }
  }
  function busy(value) {
    state.busy = value;
    app.querySelectorAll('input,button').forEach(element => { element.disabled = value; });
    paintVerification();
  }
  async function sendCode() {
    const form = document.getElementById('member-form'), phone = document.getElementById('member-phone');
    if (state.busy || !phone.reportValidity()) return;
    const value = phone.value, purpose = form.dataset.kind;
    busy(true); message('인증번호를 요청하고 있습니다.');
    try {
      const result = await request('auth/code', {phone:value, purpose});
      if (!form.isConnected) return;
      verification = {id:result.challenge_id, phone:normalized(value), expiresAt:Date.now()+result.expires_in*1000, resendAt:Date.now()+result.resend_after*1000, mock:result.mock_code};
      document.getElementById('member-verification').hidden = false;
      document.getElementById('member-code').value = '';
      message(result.mock_code ? '테스트 인증번호를 아래에 입력해 주세요.' : '문자로 받은 인증번호를 입력해 주세요.');
      clearInterval(verificationTimer); verificationTimer = setInterval(paintVerification, 1000);
      paintVerification();
    } catch (error) { message(error.message, true); }
    finally { busy(false); if (form.isConnected) document.getElementById('member-code')?.focus(); }
  }

  async function submit(form) {
    if (state.busy) return;
    const kind = form.dataset.kind, phone = document.getElementById('member-phone').value;
    const password = document.getElementById('member-password')?.value;
    const remember = document.getElementById('member-remember')?.checked ?? true;
    if (kind!=='login' && (!verification || verification.phone!==normalized(phone) || Date.now()>=verification.expiresAt)) { message('인증번호를 다시 받아 주세요.', true); return; }
    if (kind!=='login' && kind!=='change_phone' && password !== document.getElementById('member-confirm').value) { message('비밀번호가 서로 다릅니다.', true); return; }
    const data = {phone, ...(kind==='change_phone'?{}:{password})};
    let endpoint;
    if (kind==='login') { endpoint='auth/login'; data.remember=remember; }
    else {
      data.challenge=verification.id; data.code=document.getElementById('member-code').value;
      endpoint=kind==='signup'?'auth/signup':kind==='reset'?'auth/reset-password':'auth/change-phone';
      if (kind==='signup') data.remember=remember;
    }
    sessionEpoch++;
    busy(true); message('처리 중입니다.');
    try {
      const result = await request(endpoint, data);
      applySession(result);
      clearInterval(verificationTimer); verification=null;
      if (kind==='reset') { state.notice='비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.'; go('/login'); }
      else if (kind==='change_phone') { state.notice='휴대폰 번호를 변경했습니다.'; go('/member'); }
      else { go(returnRoute); returnRoute='/'; window.TRADING_MASTER_REFRESH?.(); }
    } catch (error) { message(error.message, true); }
    finally { busy(false); }
  }

  app.addEventListener('submit', event => {
    if (event.target.id!=='member-form') return;
    event.preventDefault(); submit(event.target);
  });
  app.addEventListener('input', event => {
    if (event.target.id==='member-phone' && verification && normalized(event.target.value)!==verification.phone) {
      verification=null; clearInterval(verificationTimer);
      document.getElementById('member-verification').hidden=true;
      document.getElementById('member-code').value=''; paintVerification();
      message('변경한 번호로 인증번호를 다시 받아 주세요.');
    }
  });
  app.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || state.busy) return;
    if (button.dataset.password) {
      const input = document.getElementById(button.dataset.password), show = input.type==='password';
      input.type=show?'text':'password'; button.textContent=show?'숨기기':'보기'; button.setAttribute('aria-pressed', String(show));
    } else if (button.id==='member-send-code') sendCode();
    else if (button.dataset.memberAction==='reconnect') checkSession(true);
    else if (button.dataset.memberAction==='refresh-subscription') {
      button.disabled=true;
      const refreshed=await checkSession(true);
      if (refreshed===false && canRead()) message('연결을 확인한 뒤 다시 시도해 주세요. 마지막으로 확인한 이용 상태입니다.',true);
      if (button.isConnected) button.disabled=false;
    }
    else if (button.dataset.memberAction==='logout') {
      sessionEpoch++;
      busy(true);
      try { applySession(await request('auth/logout', {})); go('/login'); }
      catch (error) { message(error.message, true); }
      finally { busy(false); }
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSession(); });
  window.addEventListener('online', () => checkSession(true));
  window.addEventListener('pageshow', event => { if (event.persisted) checkSession(true); });
  window.TRADING_MASTER_MEMBERS = Object.freeze({render, canRead});
  window.TRADING_MASTER_RENDER();
  checkSession(true);
})();
