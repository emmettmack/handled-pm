import { useCallback, useEffect, useState } from 'react';
import { Check, Siren } from 'lucide-react';
import { api } from './api.js';
import { AppCtx, useApp, go } from './ctx.jsx';
import { usePoll, useTick, timeAgo } from './util.js';
import Home from './pages/Home.jsx';
import Ticket from './pages/Ticket.jsx';
import Vendors from './pages/Vendors.jsx';
import Properties from './pages/Properties.jsx';
import Preferences from './pages/Preferences.jsx';
import Setup from './pages/Setup.jsx';
import Admin from './pages/Admin.jsx';

function useHash() {
  const [h, setH] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => { setH(window.location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return h;
}

const HIDE_MS = 10 * 60 * 1000;
const HIDE_KEY = 'handled_banner_hidden';

/** Temporary "hide for 10 minutes" for the emergency bar. A brand-new emergency always shows it again. */
function readHidden() {
  try { return JSON.parse(localStorage.getItem(HIDE_KEY) || 'null'); } catch { return null; }
}
export function bannerHidden(emergencies) {
  const h = readHidden();
  return !!h && Date.now() < h.until && emergencies.every((t) => h.ids.includes(t.id));
}

function EmergencyBanner({ emergencies, company, onHide }) {
  const { refresh, toast, demo } = useApp();
  if (!emergencies.length) return null;
  const ack = async (id) => {
    try { await api.post(`/tickets/${id}/ack-emergency`); await refresh(); } catch (e) { toast(e.message, 'err'); }
  };
  const hide = () => {
    try { localStorage.setItem(HIDE_KEY, JSON.stringify({ until: Date.now() + HIDE_MS, ids: emergencies.map((t) => t.id) })); } catch { /* hiding just won't persist */ }
    onHide();
  };
  return (
    <div className="emergency-banner" role="alert">
      {emergencies.map((t, i) => (
        <div className="inner" key={t.id}>
          <span className="siren"><Siren size={22} /></span>
          <strong>EMERGENCY</strong>
          <div className="msg">
            {t.title}{t.unit_label ? ` · ${t.unit_label}` : ''}
            <small>
              Reported {timeAgo(t.created_at)}.{demo ? ` Demo only: in the live product this pages ${company?.pm_name || 'you'} by phone until someone acknowledges.` : ''}
              {t.emergency_ack ? ' Acknowledged, being handled.' : ''}
            </small>
          </div>
          <button className="btn sm ghost" onClick={() => go(`/tickets/${t.id}`)}>Open work order</button>
          {!t.emergency_ack && <button className="btn sm" onClick={() => ack(t.id)}><Check size={14} /> I'm on it</button>}
          {i === 0 && <button className="btn sm ghost" onClick={hide} title="The bar comes back in 10 minutes. The work order stays at the top of your list.">Hide for 10 min</button>}
        </div>
      ))}
    </div>
  );
}

export default function App({ accountSlot = null }) {
  useTick();
  const route = useHash();
  const [dash, refresh, dashError] = usePoll(() => api.get('/dashboard'), 3000);
  const [status, refreshStatus] = usePoll(() => api.get('/status'), 30000);
  const [, bump] = useState(0);
  const [setup, reloadSetup] = usePoll(() => api.get('/setup'), 4000);
  const [adminInfo] = usePoll(() => api.get('/admin/me').catch(() => ({ admin: false })), 600000);
  const [notice] = usePoll(() => api.get('/announcement').catch(() => null), 60000);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, kind = 'ok', ticketId) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind, ticketId }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const hidden = dash ? bannerHidden(dash.emergencies) : false;
  const ctx = { dash, refresh, refreshStatus, toast, bannerHidden: hidden, demo: status?.demo === true, setup, reloadSetup, status: status || dash?.ai ? { ...status, ...dash?.ai } : null };

  const mock = ctx.status?.mock;
  const parts = route.split('/').filter(Boolean);
  let page;
  if (parts[0] === 'tickets' && parts[1]) page = <Ticket key={parts[1]} id={Number(parts[1])} />;
  else if (parts[0] === 'vendors') page = <Vendors />;
  else if (parts[0] === 'properties') page = <Properties />;
  else if (parts[0] === 'preferences') page = <Preferences />;
  else if (parts[0] === 'admin' && adminInfo?.admin) page = <Admin />;
  else page = <Home />;
  const section = ['vendors', 'properties', 'preferences', 'admin'].includes(parts[0]) ? parts[0] : 'home';

  // A new real account walks through setup before seeing the dashboard.
  if (ctx.status && !ctx.demo && setup && !setup.done) {
    return (
      <AppCtx.Provider value={ctx}>
        <Setup setup={setup} onDone={reloadSetup} />
      </AppCtx.Provider>
    );
  }

  return (
    <AppCtx.Provider value={ctx}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <div className="brand-mark"><Check size={18} strokeWidth={3} /></div>
            <div>
              <div className="brand-name">Macalisto</div>
              <div className="brand-sub">{status?.company?.name || 'Maintenance line'}</div>
            </div>
          </a>
          <nav className="nav">
            <a href="#/" className={section === 'home' ? 'active' : ''}>
              Work orders
              {dash?.stats.awaiting > 0 && <span className="count">{dash.stats.awaiting}</span>}
            </a>
            <a href="#/vendors" className={section === 'vendors' ? 'active' : ''}>Vendors</a>
            <a href="#/properties" className={section === 'properties' ? 'active' : ''}>Properties</a>
            <a href="#/preferences" className={section === 'preferences' ? 'active' : ''}>Preferences</a>
            {adminInfo?.admin && <a href="#/admin" className={section === 'admin' ? 'active' : ''}>Admin</a>}
            {import.meta.env.VITE_STATIC === '1' && <a href="../index.html" className="back">&larr; Back to site</a>}
            {import.meta.env.VITE_STATIC !== '1' && <a href="https://macalisto.com" className="back">&larr; Home page</a>}
            {accountSlot && <span className="account-slot">{accountSlot}</span>}
          </nav>
          {ctx.status && ctx.demo && (
            <span
              className={`mode-pill ${mock ? 'demo' : 'live'}`}
              title={mock ? 'No Anthropic API key found, so replies come from built-in sample responses. Add a key to the .env file to switch to live AI.' : `Connected to ${ctx.status.model}`}
            >
              <i className="dot" />
              {mock ? <>Demo mode<span className="long"> · sample AI replies</span></> : <>AI live<span className="long"> · {ctx.status.model}</span></>}
            </span>
          )}
        </div>
      </header>
      {notice?.active && notice.text && <div className={`site-notice ${notice.level}`}>{notice.text}</div>}
      {dash && !hidden && <EmergencyBanner emergencies={dash.emergencies} company={status?.company} onHide={() => bump((n) => n + 1)} />}
      <main className="page">
        {dash ? page : dashError ? (
          <div className="card empty"><b>We couldn't open your workspace</b>{dashError}<span style={{ marginTop: 8 }}>{accountSlot}</span></div>
        ) : <p className="empty">Loading your maintenance line…</p>}
      </main>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>{t.msg}</div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
