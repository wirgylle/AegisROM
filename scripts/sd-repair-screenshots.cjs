// RU: Скриншоты окна «Починка флешки» (план). Флешку изображает папка OPFS с частью папок dArkOS.
//     npm run dev:api и npx vite --port 5179 (или AEGIS_URL=http://127.0.0.1:38471/ после vite build), затем node scripts/sd-repair-screenshots.cjs [папка] [ru|en]
// EN: Screenshots of the "Flash drive repair" plan. The card is an OPFS folder with part of
//     the dArkOS layout. Run the Go API and Vite on port 5179, then this script.
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
  await p.goto(process.env.AEGIS_URL || 'http://localhost:5179/', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  const tools = lang === 'ru' ? /^Инструменты/ : /^Tools/;
  await p.getByRole('button', { name: tools }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: lang === 'ru' ? /Флешка/ : /Flash Drive/ }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: lang === 'ru' ? /Выбрать флешку/ : /Select|Choose|Pick/ }).first().click();
  await p.waitForTimeout(1500);
  await p.locator('select').filter({ has: p.locator('option[value="r36s_darkos"]') }).first().selectOption(process.env.FW || 'r36s_darkos');
  await p.waitForTimeout(400);
  const card = p.locator('[data-tool="sdRepair"]').first();
  await card.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/sd-repair-tools-${lang}.png` });
  await card.click();
  await p.waitForSelector('[data-modal="sd-repair"] h3');
  await p.waitForTimeout(800);
  await p.locator('[data-modal="sd-repair"] > div').screenshot({ path: `${out}/sd-repair-plan-${lang}.png` });
  // Каталог тем (нужен Go API: npm run dev:api). / Theme catalog (needs the Go API).
  await p.locator('[data-modal="sd-repair"] button', { hasText: lang === 'ru' ? 'Скачать темы' : 'Download themes' }).last().click();
  await p.waitForSelector('[data-modal="themes"] img', { timeout: 30000 });
  await p.waitForTimeout(6000);
  await p.locator('[data-modal="themes"] > div').screenshot({ path: `${out}/sd-repair-themes-${lang}.png` });
  console.log('ok');
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
