import { useEffect, useState } from 'react';
import { Sparkles, Send, X, Loader2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';

/** "Write your own" tenant text. The demo stand-in for a tenant texting the maintenance line. */
export default function SimulateModal({ onClose }) {
  const { refresh, toast, status } = useApp();
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(false);

  useEffect(() => { api.get('/tenants').then(setTenants).catch(() => {}); }, []);

  const surprise = async () => {
    setGen(true);
    try {
      const r = await api.post('/simulate/generate');
      setTenantId(r.tenantId ? String(r.tenantId) : '');
      setBody(r.body);
    } catch (e) { toast(e.message, 'err'); } finally { setGen(false); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post('/simulate/incoming', { tenantId: tenantId ? Number(tenantId) : null, body });
      await refresh();
      toast(`Text received from ${r.tenant_name}`, 'ok', r.ticketId);
      onClose();
      go(`/tickets/${r.ticketId}`);
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Simulate a tenant text</h3>
            <p>Pretend to be a tenant texting your maintenance line{status?.mock ? '' : ''}.</p>
          </div>
          <button className="btn link" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Who is texting?</label>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Unrecognized number (not a tenant on file)</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} · Unit {t.unit_number}, {t.property_name}{t.language === 'es' ? ' · Spanish' : ''}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Message</label>
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={'e.g. "my sink is broken", "huele a gas", or "I’m locked out"'} autoFocus />
          </div>
          <div><button className="btn sm" onClick={surprise} disabled={gen}>{gen ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Write one for me</button></div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !body.trim()} onClick={send}><Send size={15} /> Send text</button>
        </div>
      </div>
    </div>
  );
}
