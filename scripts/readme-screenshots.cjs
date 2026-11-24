// RU: Скриншоты для README (docs/screenshots, 1920x1080, EN).
//     1) npm run dev:api  2) npx vite --port 5179  3) node scripts/readme-screenshots.cjs
//     Нужен Playwright с Chromium. Обложки thumbnails.libretro.com берутся с зеркала
//     github.com/libretro-thumbnails (на случай, если сайт недоступен), Wikidata заглушена.
// EN: README screenshots. Run the Go API and Vite on port 5179, then this script.
//     Needs Playwright with Chromium. Box art from thumbnails.libretro.com is served from the
//     github.com/libretro-thumbnails mirror; Wikidata is stubbed.
const { chromium } = require('playwright');
const open = async (lang='ru') => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  await ctx.route(/thumbnails\.libretro\.com/, async route => {
    const u = new URL(route.request().url());
    const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
    const repo = parts[0].replace(/ /g, '_');
    const rest = parts.slice(1).map(encodeURIComponent).join('/');
    const gh = `https://raw.githubusercontent.com/libretro-thumbnails/${encodeURIComponent(repo)}/master/${rest}`;
    try { const r = await route.fetch({ url: gh }); await route.fulfill({ response: r }); } catch (e) { await route.abort(); }
  });
  await ctx.route(/wikidata\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ search: [], entities: {} }) }));
  await ctx.addInitScript((lang) => { try { localStorage.setItem('aegisrom_setup_v1', '2026-11-20'); localStorage.setItem('aegisrom_lang', lang); } catch {} }, lang);
  const p = await ctx.newPage();
  await p.goto('http://localhost:5179/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);
  return { b, p };
};

const out = process.argv[2] || 'docs/screenshots';
(async () => {
  const { b, p } = await open('en');
  const shot = async (n) => { await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/${n}.png` }); console.log('ok', n); };
  const click = async (txt, opts={}) => { await p.getByRole('button', { name: txt, exact: true, ...opts }).first().click(); };
  await shot('library');
  await click('List'); await shot('compact');
  await click('Editor'); await shot('editor');
  await click('Tiles');
  await click(/^Tools/, {exact:false}); await shot('tools');
  await click(/^Builds/, {exact:false}); await shot('builds');
  const vb = p.getByRole('button', { name: /View build/ });
  console.log('viewbuild buttons', await vb.count());
  if (await vb.count()) { await vb.first().click(); await shot('build-view'); await p.keyboard.press('Escape'); await p.waitForTimeout(500); }
  await click(/^Environment/, {exact:false}); await shot('environment');
  const bios = p.getByRole('button', { name: /^BIOS/ });
  console.log('bios', await bios.count());
  if (await bios.count()) { await bios.first().click(); await shot('bios'); }

  // Окна новых функций / Dialogs of newer features (0.6.0).
  const esc = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(600); };
  await click(/^Library/, {exact:false}); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /^Settings$/ }).first().click(); await shot('settings'); await esc();
  await p.getByRole('button', { name: /^Media/ }).first().click(); await shot('library-media'); await esc();
  await p.getByRole('button', { name: /^Groups/ }).first().click(); await shot('library-groups'); await esc();
  // Предложения ручных коллекций и серий / Manual collection and series suggestions.
  const sug = p.getByRole('button', { name: /^Suggestions/ });
  if (await sug.count()) { await sug.first().click(); await shot('manual-groups'); await esc(); }
  // Окно области показывается для своей базы, не для встроенного примера: сохраняем пример и открываем как файл.
  // The scope window shows for a user database, not the built-in sample: save the sample and open it as a file.
  const fs = require('fs'), os = require('os'), path = require('path');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Save DB File/ }).click()]);
  const dbPath = path.join(os.tmpdir(), 'aegis-readme-db.json');
  await dl.saveAs(dbPath);
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  db.databaseName = 'My library'; db.libraryPath = 'D:/ROMs/aegisrom_db.json';
  fs.writeFileSync(dbPath, JSON.stringify(db));
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: /Open DB/ }).click()]);
  await fc.setFiles(dbPath); await p.waitForTimeout(2500);
  await click(/^Tools/, {exact:false}); await p.waitForTimeout(800);
  await p.locator('[data-tool="scraper"]').first().click(); await shot('scope-scraper'); await esc();
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
