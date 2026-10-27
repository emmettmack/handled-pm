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
        : <p><b>Texting isn't connected yet.</b> Your number will show here once it's ready.</p>}
      <p className="hint-small" style={{ marginTop: 8 }}>Account ID (used once to link your number to this account): <code>{a.id}</code></p>
    </div>
  );
}

function PublicPageCard() {
  const { toast } = useApp();
  const [p, setP] = useState(null);
  const [slug, setSlug] = useState('');
  useEffect(() => { api.get('/public-page').then((x) => { setP(x); setSlug(x.slug || ''); }).catch(() => {}); }, []);
  if (!p) return null; // the browser demo has no public pages
  const save = async () => {
    try { const x = await api.put('/public-page', { slug }); setP(x); setSlug(x.slug); toast('Link saved'); } catch (e) { toast(e.message, 'err'); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(p.url); toast('Link copied'); } catch { toast('Select the link and copy it', 'err'); } };
  return (
    <div className="card card-pad">
      <h3 style={{ marginTop: 0 }}>Your text-us page</h3>
      <p className="hint-small">A public page that shows tenants the number to text and the consent wording. Use it for your carrier registration, and print it as a flyer.</p>
      {!p.slug ? <p>Confirm your company name above and your page link will appear here.</p> : (
        <>
          <p>Number shown: <b>{p.number}</b>{p.usingDefaultNumber && <span className="hint-small"> (Macalisto's shared number until your own is connected)</span>}</p>
          <div className="field"><label>Link name</label>
            <div className="btn-row"><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} /><button className="btn" onClick={save} disabled={slug === p.slug}>Save</button></div>
          </div>
          <p><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></p>
          <div className="btn-row"><button className="btn" onClick={copy}>Copy link</button><a className="btn" href={p.flyerUrl} target="_blank" rel="noreferrer">Open printable flyer</a></div>
        </>
      )}
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
          <div className="field" key={k}><label>{label}</label><input value={c[k] || ''} onChange={(e) => setC({ ...c, [k]: e.target.value })} autoComplete={k === 'name' ? 'organization' : 'off'} data-lpignore="true" data-1p-ignore="true" /></div>
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
  const { toast, refresh, demo, status } = useApp();
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

      {!demo && status?.company && !status.company.name_confirmed && !status.homeMode && (
        <div className="admin-alert warn" style={{ marginBottom: 12 }}>Add your company name below. Until you do, vendors only see your own name on messages.</div>
      )}
      <div className="group-title">Your company</div>
      <CompanyCard />

      <div className="group-title">Texting</div>
      <TextingCard />
      <PublicPageCard />

      <div className="group-title">What goes in your vendor drafts</div>
      <DraftCard prefs={prefs} setPrefs={setPrefs} save={save} dirty={dirty} />

      <div className="group-title">What tenants are told about timing</div>
      <div className="card card-pad">
        <p className="hint-small" style={{ marginTop: 0 }}>After a tenant has described the problem, the assistant says you are reviewing it and a vendor will confirm a day and time. These are the words it uses for how soon they will hear back. It never invents its own.</p>
        <div className="field-row">
          <div className="field"><label>Routine requests: you’ll hear back</label><input value={prefs.timing_routine ?? ''} onChange={(e) => setPrefs({ ...prefs, timing_routine: e.target.value })} /></div>
          <div className="field"><label>Urgent requests: you’ll hear back</label><input value={prefs.timing_urgent ?? ''} onChange={(e) => setPrefs({ ...prefs, timing_urgent: e.target.value })} /></div>
        </div>
        <button className="btn primary" disabled={!dirty} onClick={save}><Check size={15} /> Save</button>
      </div>

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

      {demo && <><div className="group-title">Demo tools</div>
      <div className="card card-pad btn-row">
        <button className="btn" onClick={reset}><RotateCcw size={15} /> Reset demo data</button>
        <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>Puts the sample work orders back to how they looked on first launch, with fresh timestamps.</span>
      </div></>}
    </>
  );
}
