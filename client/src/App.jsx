import { useCallback, useEffect, useState } from 'react';
import { Check, Siren } from 'lucide-react';
import { api } from './api.js';
import { AppCtx, useApp, go } from './ctx.jsx';
import { usePoll, useTick, timeAgo } from './util.js';
import Home from './pages/Home.jsx';
import Ticket from './pages/Ticket.jsx';
import Vendors from './pages/Vendors.jsx';
import Properties from './pages/Properties.jsx';

function useHash() {
  const [h, setH] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => { setH(window.location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return h;
}

function EmergencyBanner({ emergencies, company }) {
  const { refresh, toast } = useApp();
  if (!emergencies.length) return null;
  const ack = async (id) => {
    try { await api.post(`/tickets/${id}/ack-emergency`); await refresh(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="emergency-banner" role="alert">
      {emergencies.map((t) => (
        <div className="inner" key={t.id}>
          <span className="siren"><Siren size={22} /></span>
          <strong>EMERGENCY</strong>
          <div className="msg">
            {t.title}{t.unit_label ? ` · ${t.unit_label}` : ''}
            <small>
              Reported {timeAgo(t.created_at)}. Demo only: in the live product this pages {company?.pm_name || 'you'} by phone until someone acknowledges.
              {t.emergency_ack ? ' Acknowledged, being handled.' : ''}
            </small>
          </div>
          <button className="btn sm ghost" onClick={() => go(`/tickets/${t.id}`)}>Open work order</button>
          {!t.emergency_ack && <button className="btn sm" onClick={() => ack(t.id)}><Check size={14} /> I'm on it</button>}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  useTick();
  const route = useHash();
  const [dash, refresh] = usePoll(() => api.get('/dashboard'), 3000);
  const [status] = usePoll(() => api.get('/status'), 30000);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, kind = 'ok', ticketId) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind, ticketId }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const ctx = { dash, refresh, toast, status: status || dash?.ai ? { ...status, ...dash?.ai } : null };

  const mock = ctx.status?.mock;
  const parts = route.split('/').filter(Boolean);
  let page;
  if (parts[0] === 'tickets' && parts[1]) page = <Ticket key={parts[1]} id={Number(parts[1])} />;
  else if (parts[0] === 'vendors') page = <Vendors />;
  else if (parts[0] === 'properties') page = <Properties />;
  else page = <Home />;
  const section = parts[0] === 'vendors' ? 'vendors' : parts[0] === 'properties' ? 'properties' : 'home';

  return (
    <AppCtx.Provider value={ctx}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            <div className="brand-mark"><Check size={18} strokeWidth={3} /></div>
            <div>
              <div className="brand-name">Handled</div>
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
          </nav>
          {ctx.status && (
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
      {dash && <EmergencyBanner emergencies={dash.emergencies} company={status?.company} />}
      <main className="page">{dash ? page : <p className="empty">Loading your maintenance line…</p>}</main>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>{t.msg}</div>
        ))}
      </div>
    </AppCtx.Provider>
  );
}
