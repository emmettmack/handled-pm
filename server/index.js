import 'dotenv/config';
import * as S from './store.js';
import * as ai from './ai.js';
import * as A from './actions.js';
import { seed } from './seed.js';
import { isDemo } from './mode.js';
import { startBackups } from './admin.js';
import { moveLegacyMedia } from './files.js';
import { app } from './app.js';

if (isDemo() && !S.getCompany()) seed(); // sample data is for local development only; real accounts start empty

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  const s = ai.aiStatus();
  console.log(`\n  Macalisto API running on http://localhost:${port}`);
  console.log(s.mock ? '  AI: DEMO MODE (no ANTHROPIC_API_KEY set, using canned responses)' : `  AI: live, model ${s.model}`);
});
A.startScheduler();
if (!isDemo()) { const n = moveLegacyMedia(); if (n) console.log(`[files] moved ${n} photos out of the database`); }
if (!isDemo() || process.env.BACKUPS === '1') startBackups(); // daily copies of every account's data

// Public demo hosting: wipe visitor changes and restore the sample data every N hours.
if (isDemo() && Number(process.env.DEMO_RESET_HOURS) > 0) setInterval(() => seed(), Number(process.env.DEMO_RESET_HOURS) * 3600000);
