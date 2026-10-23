import { useState } from 'react';
import { Plus, Star, Phone, Mail, Pencil, X, User } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../ctx.jsx';
import { usePoll, TRADES, TRADE_LABELS, TRADE_OPTION_LABELS } from '../util.js';

const BLANK = { name: '', trade: 'plumber', phone: '', personal_phone: '', email: '', rate: '', preferred: false, notes: '', primary_company: 1, primary_personal: 0, primary_email: 0 };

// Each way of reaching a vendor, and the flag that marks it as a primary contact.
const CHANNELS = [
  { key: 'phone', flag: 'primary_company', label: 'Company phone', hint: 'The main line of their business', Icon: Phone },
  { key: 'personal_phone', flag: 'primary_personal', label: 'Personal phone', hint: 'A person’s own number, if you work with someone at a company', Icon: User },
  { key: 'email', flag: 'primary_email', label: 'Email', hint: '', Icon: Mail },
];

function VendorForm({ vendor, onClose, onSaved }) {
  const { toast } = useApp();
  const [v, setV] = useState({ ...BLANK, ...vendor });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const primaries = CHANNELS.filter((c) => v[c.flag]);

  const togglePrimary = (c) => (e) => {
    const on = e.target.checked;
    if (!on && primaries.length === 1) { toast('Keep at least one primary contact selected.', 'err'); return; }
    if (on && primaries.length >= 1 && !window.confirm('More than one primary contact is selected, so Handled will contact all of them at the same time. Uncheck one if you only want one contacted.\n\nContact them all at once?')) return;
    setV({ ...v, [c.flag]: on ? 1 : 0 });
  };

  const save = async () => {
    try {
      if (v.id) await api.put(`/vendors/${v.id}`, v); else await api.post('/vendors', v);
      toast(v.id ? 'Vendor updated' : 'Vendor added');
      onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };
  const remove = async () => {
    try { await api.del(`/vendors/${v.id}`); toast('Vendor removed'); onSaved(); } catch (e) { toast(e.message, 'err'); }
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
            <div className="field"><label>Trade</label><select value={v.trade} onChange={set('trade')}>{TRADES.map((t) => <option key={t} value={t}>{TRADE_OPTION_LABELS[t]}</option>)}</select></div>
          </div>

          <div className="contact-box">
            <div className="contact-title">How to reach them</div>
            {CHANNELS.map((c) => (
              <div className="contact-row" key={c.key}>
                <div className="field">
                  <label>{c.label}</label>
                  <input value={v[c.key] || ''} onChange={set(c.key)} placeholder={c.hint} />
                </div>
                <label className={`check primary-check ${v[c.flag] ? 'on' : ''}`}>
                  <input type="checkbox" checked={!!v[c.flag]} onChange={togglePrimary(c)} /> Primary contact
                </label>
              </div>
            ))}
            <p className="contact-note">
              {primaries.length > 1
                ? `Handled will contact ${primaries.map((c) => c.label.toLowerCase()).join(' and ')} at the same time. Uncheck one to contact only one.`
                : 'Handled sends dispatches to every contact marked primary. At least one must stay selected.'}
            </p>
          </div>

          <div className="field"><label>Typical rate</label><input value={v.rate} onChange={set('rate')} placeholder="e.g. $95/hr" /></div>
          <label className="check"><input type="checkbox" checked={!!v.preferred} onChange={set('preferred')} /> Preferred vendor (tried first)</label>
          <div className="field"><label>Notes for the assistant</label><textarea rows={3} value={v.notes} onChange={set('notes')} placeholder="e.g. 24/7 emergency line, speaks Spanish, great with drain clogs" /></div>

          {v.id && (
            <div className="remove-zone">
              {confirmRemove ? (
                <div className="remove-confirm">
                  <b>Remove {v.name}?</b>
                  <span>They'll be taken off your vendor list and won't be picked for future jobs.</span>
                  <div className="btn-row">
                    <button className="btn danger" onClick={remove}>Yes, remove vendor</button>
                    <button className="btn" onClick={() => setConfirmRemove(false)}>Keep vendor</button>
                  </div>
                </div>
              ) : (
                <button className="btn link danger-link" onClick={() => setConfirmRemove(true)}>Remove this vendor…</button>
              )}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!v.name.trim()} onClick={save}>{v.id ? 'Save changes' : 'Add vendor'}</button>
        </div>
      </div>
    </div>
  );
}

function Contact({ v, c }) {
  if (!v[c.key]) return null;
  return (
    <div className="line">
      <c.Icon size={14} /> {v[c.key]}
      <span className="chan-label">{c.label}</span>
      {v[c.flag] ? <span className="primary-tag">Primary</span> : null}
    </div>
  );
}

export default function Vendors() {
  const [vendors, reload] = usePoll(() => api.get('/vendors'), 10000);
  const [editing, setEditing] = useState(null);
  if (!vendors) return null;
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
                  {CHANNELS.map((c) => <Contact key={c.key} v={v} c={c} />)}
                  {v.notes && <div className="notes">{v.notes}</div>}
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button className="btn sm" onClick={() => setEditing(v)}><Pencil size={13} /> Edit</button>
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
