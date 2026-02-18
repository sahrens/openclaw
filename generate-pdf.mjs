import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, 'index.html'), 'utf8');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle0' });

// Hide header buttons and footer for PDF
await page.addStyleTag({ content: `
  .header { display: none !important; }
  .footer { display: none !important; }
  .hero { margin-top: 2rem !important; }
  article { padding-bottom: 2rem !important; }
  body { background: white !important; color: #1c1917 !important; }
  article pre { background: #f5f5f5 !important; color: #1e1e1e !important; border: 1px solid #ccc !important; }
  article code { border-color: #ccc !important; background: #f5f5f5 !important; }
  article blockquote { background: #fef9ee !important; color: #57534e !important; }
  article h2 { border-color: #e7e5e4 !important; }
`});

await page.pdf({
  path: join(dir, 'blog-post-calder.pdf'),
  format: 'A4',
  margin: { top: '1.5cm', bottom: '1.5cm', left: '1.5cm', right: '1.5cm' },
  printBackground: true,
});

await browser.close();
console.log('PDF generated.');
