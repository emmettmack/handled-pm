import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';

const COMPANY_FIELDS = [
  ['name', 'Company name'], ['pm_name', 'Your name'], ['phone', 'Your phone'], ['email', 'Your email'],
  ['address', 'Office address'], ['maintenance_line', 'Maintenance line (tenants text this number)'],
];

// What can go into a vendor draft. Switched-off items never appear; switched-on items always do.
const DRAFT_FIELDS = [
  ['work_order', 'Work order number'], ['priority', 'Priority (emergency, urgent, routine)'], ['cause', 'Likely cause'],
  ['address', 'Address and unit'], ['tenant_name', 'Tenant name'], ['tenant_phone', 'Tenant phone number'],
  ['language', 'Tenant’s preferred language'], ['access', 'Access instructions'], ['photos', 'Note that photos or videos are attached'],
  ['signature', 'Your name and number at the end'],
];

function TextingCard() {
  const [a, setA] = useState(null);
  useEffect(() => { api.get('/account').then(setA).catch(() => {}); }, []);
  if (!a) return null;
  return (
    <div className="card card-pad">
      {a.texting.connected
        ? <p><b>Texting is connected.</b> Tenants text <b>{a.texting.number}</b>.</p>
        : <p><b>Texting isn't connected on this server.</b> Messages in the demo are simulated.</p>}
      <p className="hint-small" style={{ marginTop: 8 }}>Account ID (used once to link your number to this account): <code>{a.id}</code></p>
    </div>
  );
}

function CompanyCard() {
  const { status, toast, refreshStatus } = useApp();
  const [c, setC] = useState(null);
  useEffect(() => { if (status?.company && !c) setC(status.company); }, [status, c]);
  if (!c) return null;
  const save = async () => {
    try { await api.put('/company', c); await refreshStatus(); toast('Company details saved'); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="card card-pad">
      <div className="pref-grid">
        {COMPANY_FIELDS.map(([k, label]) => (
          <div className="field" key={k}><label>{label}</label><input value={c[k] || ''} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 14 }}><button className="btn primary" onClick={save}><Check size={15} /> Save company</button></div>
    </div>
  );
}

function DraftCard({ prefs, setPrefs, save, dirty }) {
  const [preview, setPreview] = useState('');
  const timer = useRef();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => api.post('/prefs/preview', { draft: prefs.draft }).then((r) => setPreview(r.text)).catch(() => {}), 150);
    return () => clearTimeout(timer.current);
  }, [prefs.draft]);
  const d = prefs.draft;
  const set = (k, v) => setPrefs({ ...prefs, draft: { ...d, [k]: v } });
  return (
    <div className="card card-pad prefs-draft">
      <div>
        <div className="toggles">
          {DRAFT_FIELDS.map(([k, label]) => (
            <label key={k} className="check"><input type="checkbox" checked={!!d[k]} onChange={(e) => set(k, e.target.checked)} /> {label}</label>
          ))}
          <label className="check"><input type="checkbox" checked={!!d.cost_cap} onChange={(e) => set('cost_cap', e.target.checked)} /> Ask the vendor to call before going over an amount</label>
          {d.cost_cap && (
            <div className="field indent"><label>Amount (leave blank to use the job estimate)</label>
              <span className="money-input">$<input inputMode="numeric" value={d.cost_cap_amount} onChange={(e) => set('cost_cap_amount', e.target.value.replace(/[^0-9]/g, ''))} /></span>
            </div>
          )}
        </div>
        <div className="field"><label>Opening line (added after the greeting)</label><input value={d.intro} onChange={(e) => set('intro', e.target.value)} placeholder="e.g. Thanks for always being quick on these." /></div>
        <div className="field"><label>Always include this line</label><textarea rows={2} value={d.footer} onChange={(e) => set('footer', e.target.value)} placeholder="e.g. Please send a photo of the finished work. Invoices go to billing@yourcompany.com." /></div>
        <p className="hint-small">Every new draft is written with these settings before you ever see it. You can still edit any single draft.</p>
        <div className="btn-row"><button className="btn primary" disabled={!dirty} onClick={save}><Check size={15} /> Save draft preferences</button></div>
      </div>
      <div>
        <div className="label">Sample draft with these settings</div>
        <div className="draft sample">{preview}</div>
      </div>
    </div>
  );
}

export default function Preferences() {
  const { toast, refresh } = useApp();
  const [saved, setSaved] = useState(null);
  const [prefs, setPrefs] = useState(null);
  useEffect(() => { api.get('/prefs').then((p) => { setSaved(p); setPrefs(p); }); }, []);
  if (!prefs) return null;
  const dirty = JSON.stringify(prefs) !== JSON.stringify(saved);
  const save = async () => {
    try { const p = await api.put('/prefs', prefs); setSaved(p); setPrefs(p); toast('Preferences saved'); } catch (e) { toast(e.message, 'err'); }
  };
  const reset = async () => {
    if (!window.confirm('Reset all demo data? This replaces every work order with the sample set.')) return;
    try { await api.post('/demo/reset'); await refresh(); toast('Demo data reset'); go('/'); } catch (e) { toast(e.message, 'err'); }
  };
  const hours = prefs.vendor_followup_hours;
  return (
    <>
      <div className="page-head"><div><h1>Preferences</h1><p>Set things up once. Macalisto follows them every time.</p></div></div>

      <div className="group-title">Your company</div>
      <CompanyCard />

      <div className="group-title">Texting</div>
      <TextingCard />

      <div className="group-title">What goes in your vendor drafts</div>
      <DraftCard prefs={prefs} setPrefs={setPrefs} save={save} dirty={dirty} />

      <div className="group-title">When a vendor goes quiet</div>
      <div className="card card-pad">
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <span>Bring a work order back to the top of my list if the vendor hasn't replied in</span>
          <span className="money-input"><input inputMode="numeric" value={hours} onChange={(e) => setPrefs({ ...prefs, vendor_followup_hours: e.target.value.replace(/[^0-9]/g, '') })} style={{ width: 54 }} /></span>
          <span>{Number(hours) === 1 ? 'hour' : 'hours'}</span>
          <button className="btn primary" disabled={!dirty} onClick={save}><Check size={15} /> Save</button>
        </div>
        <p className="hint-small" style={{ marginTop: 10 }}>Nothing is sent automatically. You'll see it flagged and can call the vendor or draft a message to a different one.</p>
      </div>

      <div className="group-title">Demo tools</div>
      <div className="card card-pad btn-row">
        <button className="btn" onClick={reset}><RotateCcw size={15} /> Reset demo data</button>
        <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>Puts the sample work orders back to how they looked on first launch, with fresh timestamps.</span>
      </div>
    </>
  );
}
