// 用本机 Chrome 抓 AIDigest 各 view 的截图，存到 docs/screenshots/
// 用法：node scripts/capture-screens.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs', 'screenshots');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_BASE = 'http://localhost:3003';

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

// 等指定文本出现
async function waitForText(page, text, timeout = 5000) {
  await page.waitForFunction(
    t => document.body.innerText.includes(t),
    { timeout },
    text,
  );
}

// 点击 nav 中的某个 tab
async function clickNav(page, label) {
  await page.evaluate(label => {
    const btn = Array.from(document.querySelectorAll('nav button'))
      .find(b => b.innerText.trim() === label);
    if (btn) btn.click();
  }, label);
  await new Promise(r => setTimeout(r, 600));
}

async function shoot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, type: 'png' });
  console.log('✓', name);
}

(async () => {
  if (!existsSync(CHROME)) {
    console.error('Chrome not at', CHROME);
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: VIEWPORT,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  page.setDefaultTimeout(8000);

  try {
    // ── 01 解析空态
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('textarea', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 600));
    await shoot(page, '01-triage-empty.png');

    // ── 01b 粘贴假链接后（带模型切换）
    await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'https://example.com/a\nhttps://example.com/b\nhttps://example.com/c');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 400));
    await shoot(page, '01-triage-empty-with-urls.png');

    // ── 04 Wiki 分类
    await clickNav(page, 'Wiki');
    await new Promise(r => setTimeout(r, 800));
    await shoot(page, '04-wiki-categories.png');

    // 进入第一个分类（如有）
    const enteredCategory = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return false;
      const btns = Array.from(main.querySelectorAll('button'));
      const cat = btns.find(b => !b.closest('nav') && b.innerText.length > 0 && b.innerText.length < 50);
      if (cat) { cat.click(); return true; }
      return false;
    });
    if (enteredCategory) {
      await new Promise(r => setTimeout(r, 700));
      await shoot(page, '04-wiki-items.png');

      // 进入第一个条目
      const enteredItem = await page.evaluate(() => {
        const main = document.querySelector('main');
        const btns = Array.from(main.querySelectorAll('button'));
        // 跳过返回按钮
        const item = btns.find(b => !b.closest('nav') && !b.innerText.includes('←'));
        if (item) { item.click(); return true; }
        return false;
      });
      if (enteredItem) {
        await new Promise(r => setTimeout(r, 700));
        await shoot(page, '04-wiki-detail.png');
      }
    }

    // ── 05 沙盒
    await clickNav(page, '沙盒');
    await new Promise(r => setTimeout(r, 800));
    await shoot(page, '05-sandbox-select.png');

    // ── 06 实验
    await clickNav(page, '实验');
    await new Promise(r => setTimeout(r, 800));
    await shoot(page, '06-experiment.png');

    // ── 07 经验列表（折叠态）
    await clickNav(page, '经验');
    await new Promise(r => setTimeout(r, 800));
    await shoot(page, '07-experience-list.png');

    // 展开第一条
    const expanded = await page.evaluate(() => {
      const main = document.querySelector('main');
      const btns = Array.from(main.querySelectorAll('button'));
      const row = btns.find(b => !b.closest('nav') && b.innerText.length > 30);
      if (row) { row.click(); return true; }
      return false;
    });
    if (expanded) {
      await new Promise(r => setTimeout(r, 800));
      await shoot(page, '07-experience-expanded.png');
    }

    console.log('\nAll done. Files in:', OUT);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
