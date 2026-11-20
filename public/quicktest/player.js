// AegisROM Quick Test player (runs inside an iframe of the app window).
// Протокол / protocol (postMessage, same origin only):
//   app -> player: { type: 'aegis-qt-load', file: File, core: 'fceumm', gameName, language, color, biosFile?: File, biosName? }
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
