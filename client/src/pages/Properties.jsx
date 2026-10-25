import { Fragment, useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import TenantForm from '../components/TenantForm.jsx';
import { api } from '../api.js';
import { useApp } from '../ctx.jsx';
import { usePoll, unitName, languageName } from '../util.js';

function LimitEditor({ p, onSaved }) {
  const { toast } = useApp();
  const [val, setVal] = useState(String(p.approval_limit));
  const dirty = Number(val) !== p.approval_limit;
  const save = async () => {
    try { await api.put(`/properties/${p.id}`, { approval_limit: Number(val) }); toast('Owner limit updated'); onSaved(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="btn-row">
      <span className="money-input">$<input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))} /></span>
      {dirty && <button className="btn sm primary" onClick={save}>Save</button>}
    </div>
  );
}

const BLANK = { name: '', address: '', neighborhood: '', owner_name: '', owner_email: '', company: '', approval_limit: 500, units: '' };

function PropertyForm({ property, home, onClose, onSaved }) {
  const { toast } = useApp();
  const [p, setP] = useState({ ...BLANK, ...property });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const save = async () => {
    try {
      if (p.id) await api.put(`/properties/${p.id}`, p); else await api.post('/properties', p);
      toast(p.id ? 'Property updated' : 'Property added');
      onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };
  const remove = async () => { try { await api.del(`/properties/${p.id}`); toast('Property removed'); onSaved(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head"><div><h3>{p.id ? 'Edit property' : home ? 'Add a home' : 'Add a property'}</h3></div><button className="btn link" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field"><label>Name</label><input value={p.name} onChange={set('name')} autoFocus placeholder={home ? 'e.g. The Carpinteria house' : 'e.g. Rosewood Gardens'} /></div>
            <div className="field"><label>Neighborhood (optional)</label><input value={p.neighborhood} onChange={set('neighborhood')} /></div>
          </div>
          <div className="field"><label>Address</label><input value={p.address} onChange={set('address')} placeholder="123 Main St, City, CA 90000" /></div>
          <div className="field"><label>{p.id ? 'Add more units' : 'Units'}</label><input value={p.units} onChange={set('units')} placeholder={home ? 'Leave blank for a single home' : 'e.g. 1A, 1B, 2A'} /><span className="hint-small">Separate with commas. {home ? '' : 'Leave blank for a single building.'}</span></div>
          {!home && (
            <>
              <div className="field-row">
                <div className="field"><label>Owner</label><input value={p.owner_name} onChange={set('owner_name')} /></div>
                <div className="field"><label>Owner's email</label><input value={p.owner_email} onChange={set('owner_email')} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label>Owning company (optional)</label><input value={p.company} onChange={set('company')} /></div>
                <div className="field"><label>Check with owner above</label><span className="money-input">$<input inputMode="numeric" value={p.approval_limit} onChange={(e) => setP({ ...p, approval_limit: e.target.value.replace(/[^0-9]/g, '') })} /></span></div>
              </div>
            </>
          )}
          {p.id && (
            <div className="remove-zone">
              {confirmRemove ? (
                <div className="remove-confirm">
                  <b>Remove {p.name}?</b><span>Its units and tenants are removed too. This only works if there are no work orders for it.</span>
                  <div className="btn-row"><button className="btn danger" onClick={remove}>Yes, remove property</button><button className="btn" onClick={() => setConfirmRemove(false)}>Keep property</button></div>
                </div>
              ) : <button className="btn link danger-link" onClick={() => setConfirmRemove(true)}>Remove this property…</button>}
            </div>
          )}
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!p.name.trim() || !p.address.trim()} onClick={save}>{p.id ? 'Save changes' : 'Add'}</button></div>
      </div>
    </div>
  );
}

// "4521 Rosewood Ave, Los Angeles, CA 90004" -> street "Rosewood Ave", city "Los Angeles"
const street = (p) => (p.address.split(',')[0] || '').replace(/^\d+\s*/, '').replace(/^[NSEW]\s+/i, '');
const city = (p) => (p.address.split(',')[1] || '').trim();

const SORTS = [
  ['street', 'Street', street],
  ['city', 'City', city],
  ['company', 'Company', (p) => p.company || 'No company'],
  ['owner', 'Owner', (p) => p.owner_name || 'No owner'],
];

const pretty = (p) => String(p || '').replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3');

export default function Properties() {
  const [props, reload] = usePoll(() => api.get('/properties'), 15000);
  const [units, reloadUnits] = usePoll(() => api.get('/units'), 15000);
  const [tenants, reloadTenants] = usePoll(() => api.get('/tenants'), 15000);
  const { status } = useApp();
  const home = !!status?.homeMode;
  const [sort, setSort] = useState('street');
  const [editing, setEditing] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null); // { tenant, units }
  if (!props || !units || !tenants) return null;
  const by = SORTS.find((s) => s[0] === sort)[2];
  const rows = [...props].sort((a, b) => by(a).localeCompare(by(b)) || street(a).localeCompare(street(b)));
  const grouped = sort !== 'street';
  const refresh = () => { reload(); reloadUnits(); reloadTenants(); };

  return (
    <>
      <div className="page-head">
        <div><h1>{home ? 'Your home' : 'Properties'}</h1><p>{home ? 'The place you rent out, and who lives there. Vendors are sent to this address.' : 'Every building you manage, and the tenants in each unit. Texts from these phone numbers are recognized automatically.'}</p></div>
        <button className="btn primary lg" onClick={() => setEditing({})}><Plus size={16} /> {home ? 'Add a home' : 'Add property'}</button>
      </div>
      {props.length === 0 && <div className="card empty"><b>No properties yet</b>Add your first one, then add the tenants who live there.</div>}
      {props.length > 1 && (
        <div className="sortbar">
          <span>Sort by</span>
          {SORTS.map(([key, label]) => <button key={key} className={`filter ${sort === key ? 'on' : ''}`} onClick={() => setSort(key)}>{label}</button>)}
        </div>
      )}
      {rows.map((p, i) => {
        const mine = units.filter((u) => u.property_id === p.id);
        const single = mine.length === 1 && /^main( house)?$/i.test(mine[0].number);
        return (
          <Fragment key={p.id}>
            {grouped && by(p) !== (i ? by(rows[i - 1]) : null) && <div className="group-title">{by(p)}</div>}
            <div className="card property">
              <div className="property-head">
                <div>
                  <h3>{p.name}</h3>
                  <div className="addr">{p.address}</div>
                  {!home && <div className="addr">{[p.company, p.owner_name && `Owner: ${p.owner_name}`].filter(Boolean).join(' · ')}</div>}
                </div>
                <div className="btn-row">
                  {!home && <LimitEditor key={p.approval_limit} p={p} onSaved={reload} />}
                  <button className="btn sm" onClick={() => setEditing(p)}><Pencil size={13} /> Edit</button>
                </div>
              </div>
              {mine.map((u) => {
                const people = tenants.filter((t) => t.unit_id === u.id);
                return (
                  <div key={u.id} className="unit-row">
                    {!single && <div className="unit-name">{unitName(u.number)}</div>}
                    <div className="unit-people">
                      {people.length === 0 && <span className="none">No tenant yet</span>}
                      {people.map((t) => (
                        <button key={t.id} className="person" onClick={() => setEditingTenant({ tenant: t, units: mine })} title="Edit tenant">
                          <b>{t.name}</b> {pretty(t.phone)}{t.language && t.language !== 'en' ? ` · ${languageName(t.language)}` : ''}
                        </button>
                      ))}
                      <button className="btn sm" onClick={() => setEditingTenant({ tenant: { unit_id: u.id }, units: mine })}><Plus size={13} /> Add tenant</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Fragment>
        );
      })}
      {editing && <PropertyForm property={editing} home={home} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {editingTenant && <TenantForm tenant={editingTenant.tenant} units={editingTenant.units} onClose={() => setEditingTenant(null)} onSaved={() => { setEditingTenant(null); refresh(); }} />}
      {!home && <p style={{ color: 'var(--muted)', marginTop: 12, fontSize: 13.5 }}>When a repair is estimated above a property's limit, the work order is flagged so you can check with the owner first. Macalisto never contacts owners on its own.</p>}
    </>
  );
}
