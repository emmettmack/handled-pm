import { useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../ctx.jsx';
import { usePoll, unitName } from '../util.js';

const BLANK = { name: '', phone: '', language: 'en', unit_id: '' };
const pretty = (p) => String(p || '').replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3');

function TenantForm({ tenant, units, onClose, onSaved }) {
  const { toast } = useApp();
  const [t, setT] = useState({ ...BLANK, ...tenant, phone: pretty(tenant.phone), unit_id: tenant.unit_id || (units.length === 1 ? units[0].id : '') });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (k) => (e) => setT({ ...t, [k]: e.target.value });
  const save = async () => {
    try {
      const body = { ...t, unit_id: Number(t.unit_id) };
      if (t.id) await api.put(`/tenants/${t.id}`, body); else await api.post('/tenants', body);
      toast(t.id ? 'Tenant updated' : 'Tenant added');
      onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };
  const remove = async () => { try { await api.del(`/tenants/${t.id}`); toast('Tenant removed'); onSaved(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div><h3>{t.id ? 'Edit tenant' : 'Add a tenant'}</h3><p>Macalisto recognizes your tenants by their phone number.</p></div>
          <button className="btn link" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field"><label>Name</label><input value={t.name} onChange={set('name')} autoFocus /></div>
          <div className="field-row">
            <div className="field"><label>Phone number</label><input value={t.phone} onChange={set('phone')} placeholder="(805) 555-0100" /></div>
            <div className="field"><label>Language</label><select value={t.language} onChange={set('language')}><option value="en">English</option><option value="es">Spanish</option></select></div>
          </div>
          <div className="field"><label>Unit</label>
            <select value={t.unit_id} onChange={set('unit_id')}><option value="">Choose…</option>{units.map((u) => <option key={u.id} value={u.id}>{u.property_name} · {unitName(u.number)}</option>)}</select>
            {!units.length && <span className="hint-small">Add a property first, so there's a place for them to live.</span>}
          </div>
          {t.id && (
            <div className="remove-zone">
              {confirmRemove ? (
                <div className="remove-confirm">
                  <b>Remove {t.name}?</b>
                  <span>Their past work orders stay. Texts from their number will be treated as an unknown number.</span>
                  <div className="btn-row"><button className="btn danger" onClick={remove}>Yes, remove tenant</button><button className="btn" onClick={() => setConfirmRemove(false)}>Keep tenant</button></div>
                </div>
              ) : <button className="btn link danger-link" onClick={() => setConfirmRemove(true)}>Remove this tenant…</button>}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!t.name.trim() || !t.phone.trim() || !t.unit_id} onClick={save}>{t.id ? 'Save changes' : 'Add tenant'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Tenants() {
  const [tenants, reload] = usePoll(() => api.get('/tenants'), 10000);
  const [units] = usePoll(() => api.get('/units'), 30000);
  const [editing, setEditing] = useState(null);
  if (!tenants || !units) return null;
  return (
    <>
      <div className="page-head">
        <div><h1>Tenants</h1><p>The people who text your maintenance line. Anyone not on this list gets an identity check before anything is sent out.</p></div>
        <button className="btn primary lg" onClick={() => setEditing({})}><Plus size={16} /> Add tenant</button>
      </div>
      {tenants.length === 0 ? (
        <div className="card empty"><b>No tenants yet</b>Add the people who live in your properties so Macalisto knows who's texting.</div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="plain">
            <thead><tr><th>Name</th><th>Phone</th><th>Home</th><th>Language</th><th /></tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td>{pretty(t.phone)}</td>
                  <td>{t.property_name} · {unitName(t.unit_number)}</td>
                  <td>{t.language === 'es' ? 'Spanish' : 'English'}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => setEditing(t)}><Pencil size={13} /> Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <TenantForm tenant={editing} units={units} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
