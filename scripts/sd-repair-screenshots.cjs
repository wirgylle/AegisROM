// RU: Скриншоты окна «Починка флешки» (план). Флешку изображает папка OPFS с частью папок dArkOS.
//     npx vite --port 5179, затем node scripts/sd-repair-screenshots.cjs [папка] [ru|en]
// EN: Screenshots of the "Flash drive repair" plan. The card is an OPFS folder with part of
//     the dArkOS layout. Run Vite on port 5179, then this script.
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots';
const lang = process.argv[3] || 'ru';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript((lang) => {
    try { localStorage.setItem('aegisrom_setup_v1', '2026-11-20'); localStorage.setItem('aegisrom_lang', lang); } catch {}
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry('EASYROMS', { recursive: true }); } catch {}
      const card = await root.getDirectoryHandle('EASYROMS', { create: true });
      for (const d of ['bios', 'tools', 'nes', 'snes', 'gba', 'psx', 'themes']) await card.getDirectoryHandle(d, { create: true });
      const tools = await card.getDirectoryHandle('tools');
      const fh = await tools.getFileHandle('Install.PortMaster.sh', { create: true });
      const w = await fh.createWritable(); await w.write('#!/bin/bash\n'); await w.close();
      return card;
    };
  }, lang);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5179/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const tools = lang === 'ru' ? /^Инструменты/ : /^Tools/;
  await p.getByRole('button', { name: tools }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: lang === 'ru' ? /Флешка/ : /Flash Drive/ }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: lang === 'ru' ? /Выбрать флешку/ : /Select|Choose|Pick/ }).first().click();
  await p.waitForTimeout(1500);
  await p.locator('select').filter({ has: p.locator('option[value="r36s_darkos"]') }).first().selectOption('r36s_darkos');
  await p.waitForTimeout(400);
  const card = p.locator('[data-tool="sdRepair"]').first();
  await card.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/sd-repair-tools-${lang}.png` });
  await card.click();
  await p.waitForSelector('[data-modal="sd-repair"] h3');
  await p.waitForTimeout(800);
  await p.locator('[data-modal="sd-repair"] > div').screenshot({ path: `${out}/sd-repair-plan-${lang}.png` });
  console.log('ok');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
