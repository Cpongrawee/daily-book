// Build Windows icons from the project logo PNG, preserving the source artwork.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const dist = path.resolve(__dirname, '../dist'),
    pngSource = fs.readFileSync(path.join(dist, 'daily-book-logo.png'));
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 }),
      entries = [];
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        '<style>html,body{margin:0;background:transparent}img{display:block;width:100%;height:100%;object-fit:contain}</style><img src="data:image/png;base64,' +
          pngSource.toString('base64') +
          '">'
      );
      const png = await page.screenshot({ omitBackground: true });
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
      if (size !== 512) entries.push({ size, png });
    }
    const header = Buffer.alloc(6 + 16 * entries.length);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(entries.length, 4);
    let offset = header.length;
    entries.forEach(({ size, png }, i) => {
      const p = 6 + 16 * i;
      header[p] = size === 256 ? 0 : size;
      header[p + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, p + 4);
      header.writeUInt16LE(32, p + 6);
      header.writeUInt32LE(png.length, p + 8);
      header.writeUInt32LE(offset, p + 12);
      offset += png.length;
    });
    fs.writeFileSync(path.join(dist, 'daily-book.ico'), Buffer.concat([header, ...entries.map(e => e.png)]));
    console.log('PASS: supplied PNG rendered at 16/24/32/48/64/128/256px; Windows ICO created; original PNG preserved');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
