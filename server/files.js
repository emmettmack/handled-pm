// File storage for photos and videos: each file lives on disk under DATA_DIR/files/<account>/, not inside the database,
// so backups and the database stay small. Files are served through short-lived signed links (an <img> tag can't send a sign-in
// header). Node only; the browser demo keeps photos inline. A storage adapter for S3 would replace the two disk calls here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, accountIds, rawDb } from './db.js';
import { currentAccount } from './accounts.js';
import { getKv, setKv } from './registry.js';

export const FILES_DIR = path.join(DATA_DIR, 'files');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const LINK_SECONDS = 3600;

const secret = () => {
  if (process.env.FILE_SIGNING_SECRET) return process.env.FILE_SIGNING_SECRET;
  let s = getKv('file_secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setKv('file_secret', s); }
  return s;
};
const sign = (account, id, exp) => crypto.createHmac('sha256', secret()).update(`${account}.${id}.${exp}`).digest('hex');

const accountDir = (account) => path.join(FILES_DIR, account);
function writeFile(account, dataUrl) {
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const file = `${crypto.randomUUID()}.${EXT[m[1]] || 'bin'}`;
  fs.mkdirSync(accountDir(account), { recursive: true });
  fs.writeFileSync(path.join(accountDir(account), file), Buffer.from(m[2], 'base64'));
  return { file, mime: m[1] };
}

/** Used when a new photo arrives: store it and give the row a file name instead of the data URL. */
export const saveDataUrl = (dataUrl) => writeFile(currentAccount(), dataUrl);

/** A link to a photo that works for an hour, for this account's own pages. */
export function mediaLink(row) {
  const account = currentAccount();
  const exp = Math.floor(Date.now() / 1000) + LINK_SECONDS;
  return `/f/${encodeURIComponent(account)}/${row.id}?exp=${exp}&sig=${sign(account, row.id, exp)}`;
}

/** GET /f/:account/:id?exp&sig, outside sign-in: the signature is the permission. */
export function serveFile(req, res, runAs, findRow) {
  const { account, id } = req.params;
  const exp = Number(req.query.exp);
  const good = /^[A-Za-z0-9_-]{1,100}$/.test(account) && exp > Date.now() / 1000
    && String(req.query.sig || '').length === 64 && crypto.timingSafeEqual(Buffer.from(String(req.query.sig)), Buffer.from(sign(account, id, exp)));
  if (!good) return res.status(403).type('text/plain').send('This link has expired. Reload the page.');
  const row = runAs(account, () => findRow(Number(id)));
  if (!row?.file || /[\\/]/.test(row.file)) return res.status(404).type('text/plain').send('Not found');
  res.set({ 'Cache-Control': 'private, max-age=600', 'Content-Type': row.mime || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
  fs.createReadStream(path.join(accountDir(account), row.file)).on('error', () => res.status(404).end()).pipe(res);
}

/**
 * One-time move of photos that were stored inside the database. The file is written first and the row is only changed
 * after that, so a crash can't lose a photo; running it again does nothing.
 */
export function moveLegacyMedia() {
  let moved = 0;
  for (const id of accountIds()) {
    const d = rawDb(id);
    const rows = d.prepare("SELECT id, url FROM media WHERE file IS NULL AND url LIKE 'data:%'").all();
    for (const r of rows) {
      const saved = writeFile(id, r.url);
      if (!saved) continue;
      d.prepare("UPDATE media SET file = ?, mime = ?, url = '' WHERE id = ?").run(saved.file, saved.mime, r.id);
      moved++;
    }
  }
  return moved;
}
