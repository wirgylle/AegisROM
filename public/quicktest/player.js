// AegisROM Quick Test player (runs inside an iframe of the app window).
// Протокол / protocol (postMessage, same origin only):
//   app -> player: { type: 'aegis-qt-load', file: File, core: 'fceumm', gameName, language, color, biosFile? }
//   player -> app: { type: 'aegis-qt', state: 'waiting' | 'ready' | 'started' | 'error', message? }
(function () {
  'use strict';
  var started = false;

  function report(state, message) {
    try {
      window.parent.postMessage({ type: 'aegis-qt', state: state, message: message || '' }, location.origin);
    } catch (e) {}
  }

  window.addEventListener('error', function (ev) {
    report('error', String((ev && ev.message) || 'error'));
  });

  window.addEventListener('message', function (ev) {
    if (ev.origin !== location.origin || ev.source !== window.parent) return;
    var msg = ev.data || {};
    if (msg.type !== 'aegis-qt-load' || started) return;
    if (!(msg.file instanceof Blob) || typeof msg.core !== 'string' || !/^[a-z0-9_]+$/.test(msg.core)) {
      report('error', 'bad request');
      return;
    }
    started = true;
    var name = typeof msg.gameName === 'string' && msg.gameName ? msg.gameName : 'game';
    var file = msg.file instanceof File ? msg.file : new File([msg.file], name);

    window.EJS_player = '#game';
    window.EJS_core = msg.core;
    window.EJS_gameUrl = file;
    window.EJS_gameName = name.replace(/\.[^.]+$/, '');
    window.EJS_pathtodata = '../emulatorjs/data/';
    window.EJS_startOnLoaded = true;
    window.EJS_threads = false;
    window.EJS_disableDatabases = true;
    window.EJS_color = typeof msg.color === 'string' ? msg.color : '#06b6d4';
    window.EJS_backgroundColor = '#000000';
    if (typeof msg.language === 'string' && msg.language) {
      window.EJS_language = msg.language;
    } else {
      window.EJS_disableAutoLang = true;
    }
    if (msg.biosFile instanceof Blob) {
      window.EJS_biosUrl =
        msg.biosFile instanceof File ? msg.biosFile : new File([msg.biosFile], 'bios.bin');
    }
    window.EJS_ready = function () {
      report('ready');
    };
    window.EJS_onGameStart = function () {
      var w = document.getElementById('wait');
      if (w) w.remove();
      report('started');
    };

    var s = document.createElement('script');
    s.src = '../emulatorjs/data/loader.js';
    s.onerror = function () {
      report('error', 'EmulatorJS files are missing (run npm run fetch:emulatorjs)');
    };
    document.body.appendChild(s);

    // EmulatorJS не шлёт событие об ошибке старта: следим за флагом failedToStart.
    var poll = setInterval(function () {
      var emu = window.EJS_emulator;
      if (!emu) return;
      if (emu.failedToStart) {
        clearInterval(poll);
        report('error', (emu.textElem && emu.textElem.innerText) || 'failed to start');
      } else if (emu.started) {
        clearInterval(poll);
      }
    }, 500);
  });

  report('waiting');
})();
