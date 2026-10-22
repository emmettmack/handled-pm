import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';
import { usePoll } from '../util.js';

function LimitEditor({ p, onSaved }) {
  const { toast } = useApp();
  const [val, setVal] = useState(String(p.approval_limit));
  const dirty = Number(val) !== p.approval_limit;
  const save = async () => {
    try { await api.put(`/properties/${p.id}`, { approval_limit: Number(val) }); toast('Approval limit updated'); onSaved(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="btn-row">
      <span className="money-input">$<input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))} /></span>
      {dirty && <button className="btn sm primary" onClick={save}>Save</button>}
    </div>
  );
}

export default function Properties() {
  const { toast, refresh, status } = useApp();
  const [props, reload] = usePoll(() => api.get('/properties'), 15000);
  const reset = async () => {
    if (!window.confirm('Reset all demo data? This replaces every work order with the sample set.')) return;
    try { await api.post('/demo/reset'); await refresh(); toast('Demo data reset'); go('/'); } catch (e) { toast(e.message, 'err'); }
  };
  if (!props) return null;
  const co = status?.company;
  return (
    <>
      <div className="page-head">
        <div><h1>Properties</h1><p>Set how much you're comfortable spending on a repair before the owner has to sign off.</p></div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="plain">
          <thead><tr><th>Property</th><th>Neighborhood</th><th>Units</th><th>Owner</th><th>Owner approval limit</th></tr></thead>
          <tbody>
            {props.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b><div style={{ color: 'var(--muted)', fontSize: 13 }}>{p.address}</div></td>
                <td>{p.neighborhood}</td>
                <td>{p.unit_count}</td>
                <td>{p.owner_name}<div style={{ color: 'var(--muted)', fontSize: 13 }}>{p.owner_email}</div></td>
                <td><LimitEditor key={p.approval_limit} p={p} onSaved={reload} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 12, fontSize: 13.5 }}>When a repair is estimated above a property's limit, the assistant drafts a request to the owner instead of a dispatch, and nothing goes to a vendor until the owner approves.</p>

      <div className="group-title">Your company</div>
      <div className="card card-pad kv">
        <dt>Company</dt><dd>{co?.name}</dd>
        <dt>Contact</dt><dd>{co?.pm_name} · {co?.phone} · {co?.email}</dd>
        <dt>Maintenance line</dt><dd>{co?.maintenance_line} <span style={{ color: 'var(--muted)' }}>(tenants text this number)</span></dd>
      </div>

      <div className="group-title">Demo tools</div>
      <div className="card card-pad btn-row">
        <button className="btn" onClick={reset}><RotateCcw size={15} /> Reset demo data</button>
        <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>Puts the sample work orders back to how they looked on first launch, with fresh timestamps.</span>
      </div>
    </>
  );
}
