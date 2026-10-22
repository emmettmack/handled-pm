import { useState } from 'react';
import { Plus, Star, Phone, Mail, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../ctx.jsx';
import { usePoll, TRADES, TRADE_LABELS } from '../util.js';

const BLANK = { name: '', trade: 'plumber', phone: '', email: '', rate: '', preferred: false, notes: '' };

function VendorForm({ vendor, onClose, onSaved }) {
  const { toast } = useApp();
  const [v, setV] = useState({ ...BLANK, ...vendor });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    try {
      if (v.id) await api.put(`/vendors/${v.id}`, v); else await api.post('/vendors', v);
      toast(v.id ? 'Vendor updated' : 'Vendor added');
      onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div><h3>{v.id ? 'Edit vendor' : 'Add a vendor'}</h3><p>The assistant matches jobs to vendors using the trade, your preferred list, and your notes.</p></div>
          <button className="btn link" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field"><label>Company name</label><input value={v.name} onChange={set('name')} autoFocus /></div>
            <div className="field"><label>Trade</label><select value={v.trade} onChange={set('trade')}>{TRADES.map((t) => <option key={t} value={t}>{TRADE_LABELS[t]}</option>)}</select></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Phone</label><input value={v.phone} onChange={set('phone')} /></div>
            <div className="field"><label>Email</label><input value={v.email} onChange={set('email')} /></div>
          </div>
          <div className="field"><label>Typical rate</label><input value={v.rate} onChange={set('rate')} placeholder="e.g. $95/hr" /></div>
          <label className="check"><input type="checkbox" checked={!!v.preferred} onChange={set('preferred')} /> Preferred vendor (tried first)</label>
          <div className="field"><label>Notes for the assistant</label><textarea rows={3} value={v.notes} onChange={set('notes')} placeholder="e.g. 24/7 emergency line, speaks Spanish, great with drain clogs" /></div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!v.name.trim()} onClick={save}>{v.id ? 'Save changes' : 'Add vendor'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Vendors() {
  const { toast } = useApp();
  const [vendors, reload] = usePoll(() => api.get('/vendors'), 10000);
  const [editing, setEditing] = useState(null);
  if (!vendors) return null;
  const remove = async (v) => {
    if (!window.confirm(`Remove ${v.name} from your vendor list?`)) return;
    try { await api.del(`/vendors/${v.id}`); toast('Vendor removed'); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <>
      <div className="page-head">
        <div><h1>Vendors</h1><p>Your go-to pros. The assistant picks from this list every time, and always asks you first.</p></div>
        <button className="btn primary lg" onClick={() => setEditing({})}><Plus size={16} /> Add vendor</button>
      </div>
      {TRADES.map((trade) => {
        const list = vendors.filter((v) => v.trade === trade);
        if (!list.length) return null;
        return (
          <section key={trade}>
            <div className="group-title">{TRADE_LABELS[trade]}</div>
            <div className="vendor-grid">
              {list.map((v) => (
                <div key={v.id} className="card vendor">
                  <h3>{v.name} {v.preferred ? <span className="star"><Star size={11} fill="currentColor" /> Preferred</span> : null}</h3>
                  <div className="trade">{v.rate}</div>
                  <div className="line"><Phone size={14} /> {v.phone}</div>
                  <div className="line"><Mail size={14} /> {v.email}</div>
                  {v.notes && <div className="notes">{v.notes}</div>}
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button className="btn sm" onClick={() => setEditing(v)}><Pencil size={13} /> Edit</button>
                    <button className="btn sm danger" onClick={() => remove(v)}><Trash2 size={13} /> Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {editing && <VendorForm vendor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
