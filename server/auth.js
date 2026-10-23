// Sign-in check for the API. Clerk issues a signed token to the browser; this verifies it and runs the rest of the
// request as that user's account (see accounts.js / db.js), so each account only ever sees its own database.
import { verifyToken } from '@clerk/backend';
import { runAs, LOCAL_ACCOUNT } from './accounts.js';

export const authEnabled = () => !!process.env.CLERK_SECRET_KEY?.trim();

export async function authenticate(req, res, next) {
  if (!authEnabled()) {
    // Local development without Clerk keys. A hosted server must never fall back to this.
    if (process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Sign-in is not set up on this server yet.' });
    return runAs(LOCAL_ACCOUNT, next);
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please sign in.' });
  try {
    const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map((s) => s.trim()).filter(Boolean);
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY, ...(authorizedParties?.length ? { authorizedParties } : {}) });
    return runAs(payload.sub, next);
  } catch {
    return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
  }
}
