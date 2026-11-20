// AegisROM Quick Test player (runs inside an iframe of the app window).
// Протокол / protocol (postMessage, same origin only):
//   app -> player: { type: 'aegis-qt-load', file: File, core: 'fceumm', gameName, language, color, biosFile?: File, biosName? }
//   player -> app: { type: 'aegis-qt', state: 'waiting' | 'ready' | 'started' | 'error', message? }
// Сохранения на диске (если в aegis-qt-load пришло saves: { srm?: Blob }) / disk saves:
//   player -> app: { type: 'aegis-qt-save', kind: 'srm' | 'state', data: Uint8Array }
//   player -> app: { type: 'aegis-qt-need-state' }      нажата «Загрузить состояние» / load state pressed
//   app -> player: { type: 'aegis-qt-state', data: Blob | null, message? }
//   app -> player: { type: 'aegis-qt-toast', message }   подпись поверх игры / on-screen note
//   app -> player: { type: 'aegis-qt-flush' }           перед закрытием окна / before the window closes
//   player -> app: { type: 'aegis-qt', state: 'flushed' }
(function () {
  'use strict';
  var started = false;
  var diskSaves = false;
  var initialSrm = null;

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
    if (msg.type === 'aegis-qt-flush') {
      flushSaves();
      return;
    }
    if (msg.type === 'aegis-qt-state') {
      applyState(msg.data, msg.message);
      return;
    }
    if (msg.type === 'aegis-qt-toast') {
      toast(msg.message);
      return;
    }
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
    if (msg.saves && typeof msg.saves === 'object') {
      diskSaves = true;
      initialSrm = msg.saves.srm instanceof Blob ? msg.saves.srm : null;
      // SRAM пишется на диск каждые 30 с (по умолчанию у EmulatorJS 5 минут) и при закрытии окна.
      window.EJS_defaultOptions = { 'save-save-interval': '30' };
      setupDiskSaves();
    }
    if (typeof msg.language === 'string' && msg.language) {
      window.EJS_language = msg.language;
    } else {
      window.EJS_disableAutoLang = true;
    }
    if (msg.biosFile instanceof Blob) {
      biosFromFile(msg.biosFile, typeof msg.biosName === 'string' ? msg.biosName : '')
        .then(function (url) {
          window.EJS_biosUrl = url;
          start();
        })
        .catch(function () {
          start();
        });
    } else {
      start();
    }
  });

  function start() {
    window.EJS_ready = function () {
      report('ready');
    };
    window.EJS_onGameStart = function () {
      var w = document.getElementById('wait');
      if (w) w.remove();
      if (initialSrm) {
        var srm = initialSrm;
        initialSrm = null;
        loadSrm(srm).then(function () {
          report('started');
        });
        return;
      }
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
  }

  function post(msg, transfer) {
    try {
      window.parent.postMessage(msg, location.origin, transfer || []);
    } catch (e) {}
  }

  function gm() {
    var emu = window.EJS_emulator;
    return emu && emu.gameManager ? emu.gameManager : null;
  }

  function sendBytes(kind, bytes) {
    if (!bytes || !bytes.length) return;
    var copy = new Uint8Array(bytes); // копия: HEAP и FS эмулятора нельзя отдавать как transferable
    post({ type: 'aegis-qt-save', kind: kind, data: copy }, [copy.buffer]);
  }

  // Подписки EmulatorJS: SRAM пишется по таймеру и при выходе (событие saveSaveFiles),
  // кнопки «Сохранить состояние / Загрузить состояние / Сохранить файл» уводим на диск.
  function setupDiskSaves() {
    window.EJS_onSaveState = function (data) {
      sendBytes('state', data && data.state);
    };
    window.EJS_onLoadState = function () {
      post({ type: 'aegis-qt-need-state' });
    };
    window.EJS_onSaveSave = function (data) {
      sendBytes('srm', data && data.save);
    };
    var hook = setInterval(function () {
      var emu = window.EJS_emulator;
      if (!emu || typeof emu.on !== 'function') return;
      clearInterval(hook);
      emu.on('saveSaveFiles', function (bytes) {
        sendBytes('srm', bytes);
      });
    }, 50);
  }

  function loadSrm(blob) {
    return blob.arrayBuffer().then(
      function (buf) {
        var g = gm();
        if (!g) return;
        try {
          var path = g.getSaveFilePath();
          var parts = path.split('/');
          var cp = '';
          for (var i = 0; i < parts.length - 1; i++) {
            if (!parts[i]) continue;
            cp += '/' + parts[i];
            if (!g.FS.analyzePath(cp).exists) g.FS.mkdir(cp);
          }
          if (g.FS.analyzePath(path).exists) g.FS.unlink(path);
          g.FS.writeFile(path, new Uint8Array(buf));
          g.loadSaveFiles();
          // Ядро уже прочитало пустую SRAM при загрузке игры: перезапускаем игру, чтобы она
          // увидела сохранение с самого старта (сброс SRAM не трогает).
          // The core already read an empty SRAM on load: reset so the game sees the save from boot.
          g.restart();
        } catch (e) {
          report('error', 'save load failed: ' + String((e && e.message) || e));
        }
      },
      function () {}
    );
  }

  function toast(text) {
    var emu = window.EJS_emulator;
    if (typeof text === 'string' && text && emu && typeof emu.displayMessage === 'function') {
      try {
        emu.displayMessage(text);
      } catch (e) {}
    }
  }

  function applyState(blob, message) {
    var g = gm();
    if (!g || !(blob instanceof Blob)) {
      toast(message);
      return;
    }
    toast(message);
    blob.arrayBuffer().then(function (buf) {
      try {
        g.loadState(new Uint8Array(buf));
      } catch (e) {}
    });
  }

  function flushSaves() {
    var g = gm();
    var emu = window.EJS_emulator;
    if (diskSaves && g && emu && emu.started && !emu.failedToStart) {
      try {
        g.saveSaveFiles(); // вызывает событие saveSaveFiles -> aegis-qt-save
      } catch (e) {}
    }
    report('flushed');
  }

  // EmulatorJS 4.2.3 падает на File в EJS_biosUrl (зовёт .split у объекта), а у blob-ссылки
  // теряет имя файла. Поэтому кладём BIOS в zip без сжатия: при распаковке ядро получает
  // файл с правильным именем (например bios_CD_U.bin) в своей папке system.
  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function biosFromFile(blob, nameHint) {
    var name = (nameHint || (blob instanceof File ? blob.name : '') || 'bios.bin').replace(/[\\/]/g, '_');
    return blob.arrayBuffer().then(function (buf) {
      var data = new Uint8Array(buf);
      var nameBytes = new TextEncoder().encode(name);
      var crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 имя
      local.setUint16(8, 0, true); // без сжатия
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      var central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, nameBytes.length, true);
      var centralOffset = 30 + nameBytes.length + data.length;
      var end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, 1, true);
      end.setUint16(10, 1, true);
      end.setUint32(12, 46 + nameBytes.length, true);
      end.setUint32(16, centralOffset, true);
      var zip = new Blob([local, nameBytes, data, central, nameBytes, end], { type: 'application/zip' });
      return URL.createObjectURL(zip);
    });
  }

  report('waiting');
})();
