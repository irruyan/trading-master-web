/* Installation and app lifecycle; account data is owned by the existing loader. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const installButton = byId('app-install');
  const retryButton = byId('data-retry');
  const updateButton = byId('app-update');
  const guide = byId('install-guide');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;
  let registration = null;
  let updateRequested = false;
  let reloading = false;
  let pendingReconnect = false;

  function installed() {
    return standalone.matches || navigator.standalone === true;
  }

  function paintInstall() {
    installButton.hidden = installed();
    installButton.textContent = installPrompt ? '앱 설치' : '설치 안내';
  }

  function paintConnection(state = window.TRADING_MASTER_DATA_STATE?.() || {}) {
    const offline = navigator.onLine === false;
    const note = byId('connection-note');
    const basis = state.hasData ? ' 표시 기준 ' + state.generatedAt + ' KST.' : '';
    note.hidden = !offline && !state.refreshFailed && !state.awaitingNewData;
    byId('connection-copy').textContent = offline
      ? (state.hasData ? '인터넷 연결이 끊겼습니다.' + basis + ' 연결되면 다시 확인합니다.'
                       : '인터넷 연결이 필요합니다. 연결되면 운용 기록을 불러옵니다.')
      : state.refreshFailed ? (state.hasData ? '새 운용 기록을 불러오지 못했습니다.' + basis
                                            : '운용 기록을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.')
      : state.awaitingNewData ? '새 운용 기록을 기다리고 있습니다.' + basis : '';
    retryButton.disabled = offline || Boolean(state.loading);
    if (offline) {
      byId('status-tag').textContent = '인터넷 끊김';
      document.querySelector('.status').classList.remove('live');
    }
  }

  function refresh(force = false) {
    const state = window.TRADING_MASTER_DATA_STATE?.() || {};
    if (navigator.onLine === false || document.hidden) return;
    if (state.loading) {
      if (force && !pendingReconnect) {
        pendingReconnect = true;
        Promise.resolve(window.TRADING_MASTER_REFRESH?.()).then(() => {
          pendingReconnect = false;
          refresh(true);
        }, () => { pendingReconnect = false; });
      }
      return;
    }
    if (!force && !state.refreshFailed && Date.now() - (state.lastAttemptAt || 0) < 15000) return;
    window.TRADING_MASTER_REFRESH?.();
  }

  window.TRADING_MASTER_APP = Object.freeze({ setDataState: paintConnection });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    paintInstall();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
  });
  standalone.addEventListener?.('change', paintInstall);
  installButton.addEventListener('click', async () => {
    if (!installPrompt) {
      guide.showModal();
      return;
    }
    const prompt = installPrompt;
    installPrompt = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') installButton.hidden = true;
      else paintInstall();
    } catch {
      paintInstall();
      guide.showModal();
    } finally {
      installButton.disabled = false;
    }
  });
  guide.addEventListener('click', event => {
    if (event.target !== guide) return;
    const box = guide.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) guide.close();
  });
  retryButton.addEventListener('click', () => refresh(true));
  window.addEventListener('offline', () => {
    paintConnection();
    window.TRADING_MASTER_CONNECTION_CHANGED?.();
  });
  window.addEventListener('online', () => {
    window.TRADING_MASTER_CONNECTION_CHANGED?.();
    paintConnection();
    refresh(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refresh();
      registration?.update().catch(() => {});
    }
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) refresh();
  });

  function showUpdate() {
    byId('app-update-note').hidden = !registration?.waiting || !navigator.serviceWorker.controller;
  }

  updateButton.addEventListener('click', () => {
    if (!registration?.waiting) return;
    updateRequested = true;
    updateButton.disabled = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      showUpdate();
      if (!updateRequested || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './', updateViaCache: 'none' })
      .then(value => {
        registration = value;
        showUpdate();
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            showUpdate();
          });
        });
      })
      .catch(() => {
        // The browser website remains usable if installation is unavailable.
      });
  }
  paintInstall();
  paintConnection();
})();
