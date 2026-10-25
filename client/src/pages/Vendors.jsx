import { useState } from 'react';
import { Plus, Star, Phone, Mail, Pencil, X, User } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../ctx.jsx';
import { usePoll, TRADES, TRADE_LABELS, TRADE_OPTION_LABELS, LANGUAGES } from '../util.js';

const BLANK = { name: '', trade: 'plumber', phone: '', personal_phone: '', email: '', rate: '', preferred: false, notes: '', primary_company: 1, primary_personal: 0, primary_email: 0 };

// Each way of reaching a vendor, and the flag that marks it as a primary contact.
const CHANNELS = [
  { key: 'phone', flag: 'primary_company', label: 'Company phone', hint: 'The main line of their business', Icon: Phone },
  { key: 'personal_phone', flag: 'primary_personal', label: 'Personal phone', hint: 'A person’s own number, if you work with someone at a company', Icon: User },
  { key: 'email', flag: 'primary_email', label: 'Email', hint: '', Icon: Mail },
];

// Rates are typed in dollars and stored in cents: hourly, a flat job price, and a trip or diagnostic charge.
const dollars = (cents) => (cents === null || cents === undefined || cents === '' ? '' : String(cents / 100));
const toCents = (text) => (String(text).trim() === '' ? null : Math.round(parseFloat(text) * 100));
const rateProblem = (text, label) => {
  const t = String(text).trim();
  if (!t) return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return `${label}: enter a dollar amount like 95 or 95.50.`;
  const n = parseFloat(t);
  return n < 1 || n > 10000 ? `${label}: must be between $1 and $10,000.` : null;
};

function VendorForm({ vendor, onClose, onSaved }) {
  const { toast } = useApp();
  const [v, setV] = useState({ ...BLANK, ...vendor });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [rates, setRates] = useState({ hourly: dollars(v.rate_hourly_cents), flat: dollars(v.rate_flat_cents), trip: dollars(v.rate_trip_cents) });
  const problem = rateProblem(rates.hourly, 'Hourly rate') || rateProblem(rates.flat, 'Flat rate') || rateProblem(rates.trip, 'Trip charge');
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const primaries = CHANNELS.filter((c) => v[c.flag]);

  const togglePrimary = (c) => (e) => {
    const on = e.target.checked;
    if (!on && primaries.length === 1) { toast('Keep at least one primary contact selected.', 'err'); return; }
    if (on && primaries.length >= 1 && !window.confirm('More than one primary contact is selected, so Macalisto will contact all of them at the same time. Uncheck one if you only want one contacted.\n\nContact them all at once?')) return;
    setV({ ...v, [c.flag]: on ? 1 : 0 });
  };

  const save = async () => {
    try {
      const body = { ...v, rate_hourly_cents: toCents(rates.hourly), rate_flat_cents: toCents(rates.flat), rate_trip_cents: toCents(rates.trip) };
      if (v.id) await api.put(`/vendors/${v.id}`, body); else await api.post('/vendors', body);
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
                ? `Macalisto will contact ${primaries.map((c) => c.label.toLowerCase()).join(' and ')} at the same time. Uncheck one to contact only one.`
                : 'Macalisto sends dispatches to every contact marked primary. At least one must stay selected.'}
            </p>
          </div>

          <div className="contact-box">
            <div className="contact-title">What they charge (all optional)</div>
            <div className="field-row">
              {[['hourly', 'Hourly rate', 'per hour'], ['flat', 'Flat job rate', 'per job'], ['trip', 'Trip / diagnostic charge', 'per visit']].map(([k, label, unit]) => (
                <div className="field" key={k}>
                  <label>{label}</label>
                  <span className="money-input rate-input">$<input inputMode="decimal" value={rates[k]} placeholder="0" onChange={(e) => setRates({ ...rates, [k]: e.target.value.replace(/[^0-9.]/g, '') })} /> {unit}</span>
                </div>
              ))}
            </div>
            {problem && <p className="contact-note" style={{ color: 'var(--emergency)' }}>{problem}</p>}
          </div>
          <div className="field"><label>Write messages to this vendor in</label>
            <select value={v.language || 'en'} onChange={set('language')}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
          </div>
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
          <button className="btn primary" disabled={!v.name.trim() || !!problem} onClick={save}>{v.id ? 'Save changes' : 'Add vendor'}</button>
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
