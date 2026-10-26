// Writes the default public opt-in page to site/text/index.html. Run after editing server/optinPage.js.
import fs from 'node:fs';
import { renderOptinPage } from '../server/optinPage.js';
fs.mkdirSync('site/text', { recursive: true });
fs.writeFileSync('site/text/index.html', renderOptinPage());
console.log('wrote site/text/index.html');
