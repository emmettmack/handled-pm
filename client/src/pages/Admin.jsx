import { useEffect, useState } from 'react';
import { RefreshCw, Download, Trash2, Ban, CircleCheck, TriangleAlert, Info, Siren } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../ctx.jsx';
import { usePoll, timeAgo } from '../util.js';

const TABS = ['Overview', 'Accounts', 'Texting', 'Backups', 'System', 'Activity', 'Announcement'];
const usd = (n) => '$' + (n || 0).toFixed(2);
const when = (v) => (v ? timeAgo(typeof v === 'number' ? new Date(v).toISOString() : v) : 'never');
const ICON = { bad: Siren, warn: TriangleAlert, info: Info };

function Stat({ n, label, tone, sub }) {
  return <div className={`card stat ${tone || ''}`}><span className="num">{n}</span><span className="lbl">{label}</span>{sub && <span className="lbl" style={{ opacity: 0.7 }}>{sub}</span>}</div>;
}

function Overview() {
  const [d, reload] = usePoll(() => api.get('/admin/overview'), 20000);
  if (!d) return <p className="empty">Loading…</p>;
  const t = d.totals, u = d.usage30d, c = d.cost30d;
  const days = [...new Set(d.byDay.map((x) => x.day))].sort().reverse();
  const cell = (day, key) => d.byDay.find((x) => x.day === day && x.key === key)?.n || 0;
  return (
    <>
      {d.alerts.length > 0 ? (
        <div className="admin-alerts">
          {d.alerts.map((a, i) => { const Icon = ICON[a.level] || Info; return <div key={i} className={`admin-alert ${a.level}`}><Icon size={16} /> {a.text}</div>; })}
        </div>
      ) : <div className="admin-alert ok"><CircleCheck size={16} /> Everything looks healthy.</div>}

      <div className="group-title">Customers</div>
      <div className="stats">
        <Stat n={t.users} label="Accounts" sub={`${t.newThisWeek} new this week`} />
        <Stat n={t.active7d} label="Active in 7 days" tone="good" />
        <Stat n={`${t.setupDone}/${t.opened}`} label="Finished setup" sub={`${t.neverOpened} never opened the app`} />
        <Stat n={t.suspended} label="Suspended" tone={t.suspended ? 'hot' : ''} />
      </div>

      <div className="group-title">Work</div>
      <div className="stats">
        <Stat n={t.openOrders} label="Open work orders" sub={`${t.allOrders} ever`} />
        <Stat n={t.awaiting} label="Waiting on a landlord" tone="wait" />
        <Stat n={t.emergencies} label="Open emergencies" tone={t.emergencies ? 'hot' : ''} />
        <Stat n={`${t.properties} / ${t.tenants} / ${t.vendors}`} label="Properties / tenants / vendors" sub={`${t.homeMode} home owners, ${t.managerMode} managers`} />
      </div>

      <div className="group-title">Usage, last 30 days</div>
      <div className="stats">
        <Stat n={u.inbound_sms || 0} label="Texts received" />
        <Stat n={u.outbound_sms || 0} label="Texts sent" sub={`${u.failed_sms || 0} failed`} tone={u.failed_sms ? 'wait' : ''} />
        <Stat n={u.ai_calls || 0} label="AI model calls" />
        <Stat n={usd(c.sms + c.ai + c.server)} label="Estimated cost" sub="texts + AI + server" />
      </div>
      <p className="hint-small">Cost is an estimate: {usd(c.rates.sms)} per text sent, {usd(c.rates.ai)} per AI call, {usd(c.rates.server)} a month for the server. Check Twilio, Anthropic and Render for real bills.</p>

      {days.length > 0 && (
        <div className="card" style={{ overflow: 'hidden', marginTop: 12 }}>
          <table className="plain"><thead><tr><th>Day</th><th>Received</th><th>Sent</th><th>Failed</th><th>AI calls</th></tr></thead>
            <tbody>{days.map((day) => <tr key={day}><td>{day}</td><td>{cell(day, 'inbound_sms')}</td><td>{cell(day, 'outbound_sms')}</td><td>{cell(day, 'failed_sms')}</td><td>{cell(day, 'ai_calls')}</td></tr>)}</tbody></table>
        </div>
      )}
      <div className="btn-row" style={{ marginTop: 12 }}><button className="btn sm" onClick={reload}><RefreshCw size={13} /> Refresh</button></div>
    </>
  );
}

function AccountDetail({ id, onClose, onChanged }) {
  const { toast } = useApp();
  const [a, reload] = usePoll(() => api.get(`/admin/accounts/${id}`), 30000, [id]);
  const [step, setStep] = useState(null); // 'delete'
  const [typed, setTyped] = useState('');
  if (!a) return null;
  const act = async (fn, msg) => { try { await fn(); toast(msg); await reload(); onChanged(); } catch (e) { toast(e.message, 'err'); } };
  const download = async () => {
    try {
      const b = await api.blob(`/admin/accounts/${id}/export`);
      const url = URL.createObjectURL(b); const el = document.createElement('a'); el.href = url; el.download = `macalisto-${id}.json`; el.click(); URL.revokeObjectURL(url);
    } catch (e) { toast(e.message, 'err'); }
  };
  const remove = async () => { try { await api.del(`/admin/accounts/${id}`, { confirm: typed }); toast('Account deleted'); onClose(); onChanged(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide">
        <div className="modal-head"><div><h3>{a.company || a.name || a.email || a.id}</h3><p>{a.email} · account <code>{a.id}</code></p></div><button className="btn link" onClick={onClose}>Close</button></div>
        <div className="modal-body">
          <div className="kv">
            <dt>Joined</dt><dd>{when(a.created)}</dd>
            <dt>Last signed in</dt><dd>{when(a.lastSignIn)}</dd>
            <dt>Last work order activity</dt><dd>{a.opened ? when(a.lastActivity) : 'Has not opened the app'}</dd>
            <dt>Type</dt><dd>{a.mode === 'home' ? 'Renting out their own home' : a.mode ? 'Managing properties for others' : '—'}{a.opened && !a.setupDone ? ' · setup not finished' : ''}</dd>
            {a.contact && <><dt>Their contact</dt><dd>{[a.contact.name, a.contact.phone, a.contact.email].filter(Boolean).join(' · ') || '—'}</dd></>}
            <dt>Texting number</dt><dd>{a.numbers?.join(', ') || 'None assigned'}</dd>
            <dt>Texts, 30 days</dt><dd>{a.usage?.inbound_sms || 0} received · {a.usage?.outbound_sms || 0} sent · {a.usage?.ai_calls || 0} AI calls</dd>
            <dt>Data size</dt><dd>{a.sizeKB ?? 0} KB</dd>
          </div>
          {a.opened && (
            <>
              <div className="group-title">At a glance</div>
              <p>{a.counts.properties} properties · {a.counts.tenants} tenants · {a.counts.vendors} vendors · {a.counts.open} open of {a.counts.total} work orders</p>
              {a.propertiesList.length > 0 && <p className="hint-small">Properties: {a.propertiesList.map((p) => `${p.name} (${p.units} unit${p.units === 1 ? '' : 's'})`).join(', ')}</p>}
              {a.vendors.length > 0 && <p className="hint-small">Vendors: {a.vendors.map((v) => `${v.name} (${v.trade})`).join(', ')}</p>}
              <div className="group-title">Recent work orders</div>
              {a.recent.length === 0 ? <p className="hint-small">None yet.</p> : (
                <table className="plain"><tbody>{a.recent.map((r) => <tr key={r.id}><td>#{r.id}</td><td>{r.title}</td><td>{r.urgency}</td><td>{r.status.replace('_', ' ')}</td><td>{timeAgo(r.created_at)}</td></tr>)}</tbody></table>
              )}
              <p className="hint-small" style={{ marginTop: 8 }}>Tenant names, phone numbers and messages are never shown on this page.</p>
            </>
          )}
          <div className="group-title">Actions</div>
          <div className="btn-row">
            {a.opened && <button className="btn sm" onClick={download}><Download size={13} /> Export their data</button>}
            {a.hasUser && (a.banned
              ? <button className="btn sm" onClick={() => act(() => api.post(`/admin/accounts/${id}/unsuspend`), 'Unsuspended')}><CircleCheck size={13} /> Unsuspend</button>
              : <button className="btn sm" onClick={() => act(() => api.post(`/admin/accounts/${id}/suspend`), 'Suspended. They can no longer sign in.')}><Ban size={13} /> Suspend sign-in</button>)}
            <button className="btn sm danger" onClick={() => setStep('delete')}><Trash2 size={13} /> Delete account…</button>
          </div>
          {step === 'delete' && (
            <div className="remove-confirm" style={{ marginTop: 12 }}>
              <b>Delete this account for good?</b>
              <span>Their data and their sign-in are removed and can't be restored. Type <b>{(a.email || a.id).toLowerCase()}</b> to confirm.</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type it exactly" />
              <div className="btn-row"><button className="btn danger" disabled={!typed.trim()} onClick={remove}>Delete permanently</button><button className="btn" onClick={() => { setStep(null); setTyped(''); }}>Cancel</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Accounts() {
  const [d, reload] = usePoll(() => api.get('/admin/accounts'), 30000);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  if (!d) return <p className="empty">Loading…</p>;
  const list = d.accounts.filter((a) => `${a.email} ${a.name} ${a.company} ${a.id}`.toLowerCase().includes(q.toLowerCase())).sort((x, y) => (y.created || 0) - (x.created || 0));
  return (
    <>
      <div className="sortbar"><input className="search" placeholder="Search by name, email, company or ID" value={q} onChange={(e) => setQ(e.target.value)} /><span>{list.length} of {d.accounts.length}</span></div>
      {list.length === 0 ? <div className="card empty"><b>No accounts yet</b>They appear here once someone signs up.</div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="plain admin-table">
            <thead><tr><th>Account</th><th>Type</th><th>Setup</th><th>Props / tenants / vendors</th><th>Open</th><th>Active</th><th>Texts 30d</th><th /></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="click" onClick={() => setOpen(a.id)}>
                  <td><b>{a.company || a.name || a.email || a.id}</b><div className="sub">{a.email}</div></td>
                  <td>{a.mode === 'home' ? 'Home owner' : a.mode ? 'Manager' : '—'}</td>
                  <td>{!a.opened ? 'Not opened' : a.setupDone ? 'Done' : 'In progress'}</td>
                  <td>{a.opened ? `${a.counts.properties} / ${a.counts.tenants} / ${a.counts.vendors}` : '—'}</td>
                  <td>{a.opened ? a.counts.open : '—'}</td>
                  <td>{when(a.lastSignIn || a.lastActivity)}</td>
                  <td>{(a.usage?.inbound_sms || 0) + (a.usage?.outbound_sms || 0)}</td>
                  <td>{a.banned && <span className="chip-flag red">Suspended</span>}{a.counts?.emergencies > 0 && <span className="chip-flag red">Emergency</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <AccountDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function Texting() {
  const { toast } = useApp();
  const [d, reload] = usePoll(() => api.get('/admin/numbers'), 30000);
  const [accts] = usePoll(() => api.get('/admin/accounts'), 60000);
  const [f, setF] = useState({ number: '', account_id: '', label: '' });
  if (!d || !accts) return <p className="empty">Loading…</p>;
  const opened = accts.accounts.filter((a) => a.opened);
  const name = (id) => { const a = accts.accounts.find((x) => x.id === id); return a ? a.company || a.email || id : id; };
  const add = async () => { try { await api.post('/admin/numbers', f); toast('Number assigned'); setF({ number: '', account_id: '', label: '' }); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <>
      <div className="card card-pad">
        {d.configured ? <p><b>Twilio is connected.</b> Line: <b>{d.line}</b></p> : <p><b>Twilio isn't connected on this server.</b> Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in Render's settings.</p>}
        <p className="hint-small" style={{ marginTop: 6 }}>Each text arrives at a number, and the number decides which account it belongs to. Assign every number you buy to exactly one account. With only one account signed up, texts go to it automatically.</p>
      </div>
      <div className="group-title">Assigned numbers</div>
      {d.numbers.length === 0 ? <div className="card empty">No numbers assigned yet.</div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="plain"><thead><tr><th>Number</th><th>Account</th><th>Label</th><th /></tr></thead>
            <tbody>{d.numbers.map((n) => <tr key={n.number}><td><b>{n.number}</b></td><td>{name(n.account_id)}</td><td>{n.label}</td><td style={{ textAlign: 'right' }}><button className="btn sm danger" onClick={async () => { await api.del(`/admin/numbers/${encodeURIComponent(n.number)}`); reload(); }}>Unassign</button></td></tr>)}</tbody></table>
        </div>
      )}
      <div className="group-title">Assign a number</div>
      <div className="card card-pad">
        <div className="field-row">
          <div className="field"><label>Phone number</label><input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="+18055550100" /></div>
          <div className="field"><label>Account</label><select value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}><option value="">Choose…</option>{opened.map((a) => <option key={a.id} value={a.id}>{a.company || a.email || a.id}</option>)}</select></div>
          <div className="field"><label>Label (optional)</label><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        </div>
        <button className="btn primary" disabled={!f.number.trim() || !f.account_id} onClick={add}>Assign</button>
      </div>
    </>
  );
}

function Backups() {
  const { toast } = useApp();
  const [d, reload] = usePoll(() => api.get('/admin/backups'), 30000);
  const [busy, setBusy] = useState(false);
  if (!d) return <p className="empty">Loading…</p>;
  const run = async () => { setBusy(true); try { const r = await api.post('/admin/backups'); toast(`Backed up ${r.accounts} account(s)`); reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <>
      <div className="card card-pad">
        <p>A copy of every account's data is made automatically about once a day. The last {d.keep} are kept.</p>
        <p className="hint-small" style={{ margin: '6px 0 12px' }}>These copies live on the same disk as the live data. They protect against mistakes and bad updates, but not against losing the disk itself. Copying them off the server (for example to cloud storage) is a good next step.</p>
        <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Backing up…' : 'Back up now'}</button>
      </div>
      <div className="group-title">Backups</div>
      {d.backups.length === 0 ? <div className="card empty">None yet.</div> : (
        <div className="card" style={{ overflow: 'hidden' }}><table className="plain"><thead><tr><th>Taken</th><th>Databases</th><th>Size</th></tr></thead>
          <tbody>{d.backups.map((b) => <tr key={b.name}><td>{b.name.replace(/T(\d\d)-(\d\d)-(\d\d)-\d+Z/, ' $1:$2:$3 UTC')}</td><td>{b.files}</td><td>{b.sizeMB} MB</td></tr>)}</tbody></table></div>
      )}
    </>
  );
}

function System() {
  const [s] = usePoll(() => api.get('/admin/system'), 15000);
  if (!s) return <p className="empty">Loading…</p>;
  const yes = (v) => (v ? 'Connected' : 'Not connected');
  return (
    <div className="card card-pad kv">
      <dt>Server running for</dt><dd>{s.uptimeHours} hours</dd>
      <dt>Memory in use</dt><dd>{s.memoryMB} MB</dd>
      <dt>Disk</dt><dd>{s.disk ? `${s.disk.freeMB.toLocaleString()} MB free of ${s.disk.totalMB.toLocaleString()} MB` : 'unknown'} · data uses {s.dataMB} MB</dd>
      <dt>Version</dt><dd>{s.commit || 'local build'} · Node {s.node}</dd>
      <dt>Sign-in (Clerk)</dt><dd>{yes(s.services.sign_in)}</dd>
      <dt>Texting (Twilio)</dt><dd>{yes(s.services.texting)}{s.services.texting_number ? ` · ${s.services.texting_number}` : ''}</dd>
      <dt>AI</dt><dd>{s.services.live_ai ? `Live (${s.services.ai_model})` : 'Sample replies (no API key)'}{s.services.ai_last_error ? ` · last error: ${s.services.ai_last_error}` : ''}</dd>
      <dt>Admin emails</dt><dd>{s.services.admin_emails} configured</dd>
    </div>
  );
}

function Activity() {
  const [d] = usePoll(() => api.get('/admin/audit'), 20000);
  if (!d) return <p className="empty">Loading…</p>;
  return d.audit.length === 0 ? <div className="card empty"><b>Nothing yet</b>Every admin action is recorded here.</div> : (
    <div className="card" style={{ overflow: 'hidden' }}><table className="plain"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
      <tbody>{d.audit.map((a) => <tr key={a.id}><td>{timeAgo(a.at)}</td><td>{a.admin}</td><td>{a.action.replace('_', ' ')}</td><td>{a.target}</td><td>{a.detail}</td></tr>)}</tbody></table></div>
  );
}

function Announcement() {
  const { toast } = useApp();
  const [a, setA] = useState(null);
  useEffect(() => { api.get('/admin/announcement').then(setA); }, []);
  if (!a) return null;
  const save = async () => { try { setA(await api.put('/admin/announcement', a)); toast('Saved'); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div className="card card-pad">
      <p className="hint-small" style={{ marginBottom: 10 }}>A short notice shown at the top of the app for every signed-in user. Use it for planned downtime or news.</p>
      <div className="field"><label>Message (300 characters at most)</label><textarea rows={2} value={a.text} onChange={(e) => setA({ ...a, text: e.target.value })} /></div>
      <div className="field-row">
        <div className="field"><label>Style</label><select value={a.level} onChange={(e) => setA({ ...a, level: e.target.value })}><option value="info">Information</option><option value="warn">Warning</option></select></div>
        <label className="check" style={{ alignSelf: 'end', marginBottom: 14 }}><input type="checkbox" checked={a.active} onChange={(e) => setA({ ...a, active: e.target.checked })} /> Show it now</label>
      </div>
      <button className="btn primary" onClick={save}>Save</button>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('Overview');
  const View = { Overview, Accounts, Texting, Backups, System, Activity, Announcement }[tab];
  return (
    <>
      <div className="page-head"><div><h1>Admin</h1><p>Everything about how Macalisto is running. Only you can see this page.</p></div></div>
      <div className="filters">{TABS.map((t) => <button key={t} className={`filter ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      <View />
    </>
  );
}
