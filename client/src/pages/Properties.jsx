import { Fragment, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../ctx.jsx';
import { usePoll } from '../util.js';

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

// "4521 Rosewood Ave, Los Angeles, CA 90004" -> street "Rosewood Ave", city "Los Angeles"
const street = (p) => (p.address.split(',')[0] || '').replace(/^\d+\s*/, '').replace(/^[NSEW]\s+/i, '');
const city = (p) => (p.address.split(',')[1] || '').trim();

const SORTS = [
  ['street', 'Street', street],
  ['city', 'City', city],
  ['company', 'Company', (p) => p.company || 'No company'],
  ['owner', 'Owner', (p) => p.owner_name || 'No owner'],
];

export default function Properties() {
  const [props, reload] = usePoll(() => api.get('/properties'), 15000);
  const [sort, setSort] = useState('street');
  if (!props) return null;
  const by = SORTS.find((s) => s[0] === sort)[2];
  const rows = [...props].sort((a, b) => by(a).localeCompare(by(b)) || street(a).localeCompare(street(b)));
  const grouped = sort !== 'street';

  return (
    <>
      <div className="page-head">
        <div><h1>Properties</h1><p>Every building you manage. Set how much a repair can cost before you want to check with the owner.</p></div>
      </div>
      <div className="sortbar">
        <span>Sort by</span>
        {SORTS.map(([key, label]) => (
          <button key={key} className={`filter ${sort === key ? 'on' : ''}`} onClick={() => setSort(key)}>{label}</button>
        ))}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="plain">
          <thead><tr><th>Property</th><th>City</th><th>Company</th><th>Owner</th><th>Units</th><th>Owner limit</th></tr></thead>
          <tbody>
            {rows.map((p, i) => (
              <Fragment key={p.id}>
                {grouped && by(p) !== (i ? by(rows[i - 1]) : null) && (
                  <tr className="group-row"><td colSpan={6}>{by(p)}</td></tr>
                )}
                <tr>
                  <td><b>{p.name}</b><div style={{ color: 'var(--muted)', fontSize: 13 }}>{p.address}</div></td>
                  <td>{city(p)}</td>
                  <td>{p.company || <span style={{ color: 'var(--muted)' }}>None</span>}</td>
                  <td>{p.owner_name}<div style={{ color: 'var(--muted)', fontSize: 13 }}>{p.owner_email}</div></td>
                  <td>{p.unit_count}</td>
                  <td><LimitEditor key={p.approval_limit} p={p} onSaved={reload} /></td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 12, fontSize: 13.5 }}>When a repair is estimated above a property's limit, the work order is flagged so you can check with the owner first. Macalisto never contacts owners on its own.</p>
    </>
  );
}
