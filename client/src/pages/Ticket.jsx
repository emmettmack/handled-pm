import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, Send, Siren, Phone, Wrench, Hourglass, ShieldAlert, DollarSign, MessageSquare, TriangleAlert, Check, Info, Sparkles, Play, CircleCheck, Archive, FastForward, Languages, Camera, Plus, Play as PlayIcon, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';
import ApprovalCard from '../components/ApprovalCard.jsx';
import { UrgencyBadge, StatusPill } from '../components/Badges.jsx';
import { usePoll, timeAgo, clock, dayTime, CATEGORY_LABELS, STATUS_LABELS, money, unitName, languageName } from '../util.js';
import { workOrderSummary } from '../csv.js';

const QUICK = {
  plumbing: ["Kitchen sink, it's leaking under the cabinet", 'Bathroom sink, just draining slowly. No leak.'],
  HVAC: ["It's blowing warm air and the thermostat is on", "Nothing at all, it won't turn on"],
  electrical: ['The bedroom outlet. Nothing sparking, just no power', "It's buzzing and warm to the touch"],
  appliance: ["The refrigerator, it's not cold anymore"],
  other: ["It's in the hallway closet, started last week"],
  lockout: [],
};

function Thread({ t }) {
  const end = useRef(null);
  const sms = t.messages.filter((m) => m.kind === 'sms');
  const last = sms[sms.length - 1];
  const processing = last?.sender === 'tenant' && ['new', 'needs_info'].includes(t.status);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [t.messages.length, processing]);
  const who = { tenant: t.tenant?.name || 'Tenant', ai: 'Maintenance line (AI)', pm: 'You' };
  return (
    <div className="thread">
      {t.messages.map((m) =>
        m.kind === 'note' ? (
          <div key={m.id} className={`sysnote ${m.body.startsWith('EMERGENCY') ? 'red' : ''}`}>
            {m.body.startsWith('EMERGENCY') ? <Siren size={14} style={{ flex: 'none', marginTop: 2 }} /> : <Info size={14} style={{ flex: 'none', marginTop: 2 }} />}
            <span>{m.body}</span>
          </div>
        ) : (
          <div key={m.id} className={`bubble-wrap ${m.sender}`}>
            <div className="who">{who[m.sender]} · {clock(m.created_at)}</div>
            <div className="bubble">{m.body}</div>
          </div>
        ),
      )}
      {processing && <div className="typing"><Bot size={14} /> Reading the text <i /><i /><i /></div>}
      <div ref={end} />
    </div>
  );
}

function Composer({ t, reload }) {
  const { toast, demo } = useApp();
  const [mode, setMode] = useState(demo ? 'tenant' : 'pm'); // real accounts only message the tenant as themselves
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const closed = ['resolved', 'closed'].includes(t.status);
  const waiting = t.status === 'needs_info';
  const idCheck = waiting && t.verification_asked && !t.verified;
  const quick = idCheck
    ? ['Grace Liu, unit 204', 'Mike Johnson, unit 204']
    : t.language === 'es' ? ['La cocina, y gotea debajo del gabinete'] : QUICK[t.category] || [];

  const send = async (body) => {
    const msg = (body ?? text).trim();
    if (!msg) return;
    setBusy(true);
    try {
      await api.post(`/tickets/${t.id}/${mode === 'tenant' ? 'tenant-reply' : 'pm-message'}`, { body: msg });
      setText('');
      await reload();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  if (closed) return <div className="composer">This work order is {STATUS_LABELS[t.status].toLowerCase()}.</div>;
  return (
    <div className={`composer ${waiting && mode === 'tenant' ? 'waiting' : ''}`}>
      <div className="tabs">
        {demo && <button className={`tab ${mode === 'tenant' ? 'on' : ''}`} onClick={() => setMode('tenant')}>Reply as {t.tenant?.name?.split(' ')[0] || 'the texter'} <span className="demo-tag">demo</span></button>}
        <button className={`tab ${mode === 'pm' ? 'on' : ''}`} onClick={() => setMode('pm')}>Message tenant as you</button>
      </div>
      {demo && waiting && mode === 'tenant' && (
        <div className="hint"><MessageSquare size={14} /> {idCheck ? 'Waiting for the texter to give their name and unit.' : `Waiting on ${t.tenant?.name?.split(' ')[0] || 'the tenant'}.`} Type their reply to keep the demo going.</div>
      )}
      {mode === 'tenant' && quick.length > 0 && (
        <div className="quick">{quick.map((q) => <button key={q} disabled={busy} onClick={() => send(q)}>{q}</button>)}</div>
      )}
      <div className="composer-row">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={mode === 'tenant' ? 'Type what the tenant would text back…' : 'Write a message to the tenant…'} />
        <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send()}><Send size={15} /> Send</button>
      </div>
    </div>
  );
}

/** Record the time the vendor actually confirmed (from their text or a call); the tenant is told right away. */
function ConfirmTime({ t, reload }) {
  const { toast } = useApp();
  const [when, setWhen] = useState('');
  const confirm = async () => {
    try { await api.post(`/tickets/${t.id}/vendor-accepted`, { when }); toast('Scheduled. The tenant has been told.'); await reload(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="timer" style={{ marginBottom: 10 }}>
      <div className="label">Did the vendor confirm a time?</div>
      <div className="composer-row" style={{ marginTop: 6 }}>
        <input value={when} onChange={(e) => setWhen(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && when.trim() && confirm()} placeholder="e.g. Tuesday, 9 to 11 AM" />
        <button className="btn sm primary" disabled={!when.trim()} onClick={confirm}><Check size={14} /> Confirm &amp; tell tenant</button>
      </div>
    </div>
  );
}

/** Fold this work order into another one (for duplicates). Two steps. */
function MergeTicket({ t }) {
  const { toast, refresh, dash } = useApp();
  const [open, setOpen] = useState(false);
  const [into, setInto] = useState('');
  const options = dash.tickets.filter((x) => x.id !== t.id && !['resolved', 'closed'].includes(x.status)).sort((a, b) => (b.from_phone === t.from_phone) - (a.from_phone === t.from_phone) || b.id - a.id);
  if (!options.length) return null;
  const merge = async () => {
    try { await api.post(`/tickets/${t.id}/merge`, { into: Number(into) }); await refresh(); toast(`Merged into work order #${into}`); go(`/tickets/${into}`); } catch (e) { toast(e.message, 'err'); }
  };
  return open ? (
    <div className="remove-confirm" style={{ marginTop: 12 }}>
      <b>Merge this into another work order?</b>
      <span>Messages, photos and history move over, and this one goes away.</span>
      <select value={into} onChange={(e) => setInto(e.target.value)}><option value="">Choose a work order…</option>{options.map((o) => <option key={o.id} value={o.id}>#{o.id} · {o.title}{o.from_phone === t.from_phone ? ' · same number' : ''}</option>)}</select>
      <div className="btn-row"><button className="btn primary" disabled={!into} onClick={merge}>Merge them</button><button className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  ) : <button className="btn link" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>A duplicate? Merge into another work order…</button>;
}

/** Two-step delete for a finished work order. */
function DeleteTicket({ t }) {
  const { toast, refresh } = useApp();
  const [sure, setSure] = useState(false);
  const del = async () => {
    try { await api.del(`/tickets/${t.id}`); await refresh(); toast('Work order deleted'); go('/'); } catch (e) { toast(e.message, 'err'); }
  };
  return sure ? (
    <div className="remove-confirm" style={{ marginTop: 12 }}>
      <b>Delete this work order?</b>
      <span>Its messages, photos and history are removed for good.</span>
      <div className="btn-row"><button className="btn danger" onClick={del}>Yes, delete it</button><button className="btn" onClick={() => setSure(false)}>Keep it</button></div>
    </div>
  ) : <button className="btn link danger-link" style={{ marginTop: 8 }} onClick={() => setSure(true)}>Delete this work order…</button>;
}

function VendorTimer({ t, reload }) {
  const { toast, demo } = useApp();
  const d = t.active_dispatch;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const act = async (path, msg) => { try { await api.post(`/tickets/${t.id}/${path}`); toast(msg); await reload(); } catch (e) { toast(e.message, 'err'); } };
  const total = Math.max(60, Math.round((new Date(d.response_due_at) - new Date(d.decided_at)) / 1000));
  const left = Math.max(0, Math.round((new Date(d.response_due_at).getTime() - now) / 1000));
  const pct = Math.min(100, ((total - left) / total) * 100);
  return (
    <div className="timer">
      <div className="label" style={{ color: 'var(--violet)' }}>Waiting for {d.vendor_name} to confirm</div>
      <div className="big mono">{String(Math.floor(left / 3600)).padStart(2, '0')}:{String(Math.floor((left % 3600) / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</div>
      <div className="bar-track"><div style={{ width: `${pct}%` }} /></div>
      <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>If they haven't replied by then, this work order comes back to the top of your list. Nothing is sent automatically. You can change the wait in Preferences.</p>
      {demo && <div className="btn-row">
        <button className="btn sm primary" onClick={() => act('vendor-accepted', 'Vendor confirmed')}><Check size={14} /> Simulate: vendor says YES</button>
        <button className="btn sm" onClick={() => act('skip-timer', 'Skipped ahead')}><FastForward size={14} /> Simulate: no reply in time</button>
      </div>}
    </div>
  );
}

const SOURCE_LABEL = { text: 'Text message', email: 'Email', upload: 'Website upload' };
const isRealVideo = (m) => m.kind === 'video' && m.url.startsWith('data:video');

function MediaCard({ t, reload }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(null);
  const input = useRef();
  const add = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast('That file is over 8 MB. Try a smaller one.', 'err'); return; }
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    try { await api.post(`/tickets/${t.id}/media`, { kind: f.type.startsWith('video') ? 'video' : 'photo', name: f.name, url, source: 'upload' }); toast('Added'); await reload(); } catch (err) { toast(err.message, 'err'); }
  };
  return (
    <div className="card card-pad">
      <div className="panel-title"><Camera size={14} /> Photos &amp; videos {t.media.length > 0 && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>({t.media.length})</span>}</div>
      {t.media.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Nothing yet. Photos and videos a tenant sends by text or email, or uploads on your tenant website, show up here.</p>
      ) : (
        <div className="media-grid">
          {t.media.map((m) => (
            <button key={m.id} className="media-tile" onClick={() => setOpen(m)} title={m.name}>
              <img src={m.url} alt={m.name} />
              {m.kind === 'video' && <span className="play"><PlayIcon size={16} fill="currentColor" /></span>}
              <span className="src">{SOURCE_LABEL[m.source] || m.source}</span>
            </button>
          ))}
        </div>
      )}
      <input ref={input} type="file" accept="image/*,video/*" hidden onChange={add} />
      <button className="btn sm" style={{ marginTop: 10 }} onClick={() => input.current.click()}><Plus size={14} /> Add a photo or video</button>
      {open && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="lightbox">
            <button className="btn link close" onClick={() => setOpen(null)}><X size={18} /></button>
            {isRealVideo(open) ? <video src={open.url} controls autoPlay /> : <img src={open.url} alt={open.name} />}
            <div className="cap">{open.name} · {SOURCE_LABEL[open.source] || open.source} · {dayTime(open.created_at)}{open.kind === 'video' && !isRealVideo(open) ? ' · sample video (poster shown)' : ''}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const FLAG_UI = {
  identity: { icon: ShieldAlert, title: 'Identity not verified', tone: 'identity' },
  compensation: { icon: DollarSign, title: 'Tenant asked about compensation', tone: '' },
  update: { icon: MessageSquare, title: 'Tenant sent a new message', tone: '' },
  no_vendor: { icon: TriangleAlert, title: 'No vendor left to try', tone: 'identity' },
  no_response: { icon: Hourglass, title: 'Vendor hasn’t replied', tone: 'identity' },
  over_limit: { icon: DollarSign, title: 'Over the owner’s limit', tone: '' },
  vendor_reply: { icon: MessageSquare, title: 'Vendor replied', tone: '' },
  callback: { icon: TriangleAlert, title: 'Callback: the repair may not have held', tone: 'identity' },
  possible_duplicate: { icon: TriangleAlert, title: 'Possible duplicate', tone: '' },
  language: { icon: Languages, title: 'The tenant wrote in another language', tone: 'identity' },
};

function FlagCards({ t, reload }) {
  const { toast } = useApp();
  const act = async (type, action, msg) => { try { await api.post(`/tickets/${t.id}/flags/${type}`, { action }); toast(msg); await reload(); } catch (e) { toast(e.message, 'err'); } };
  const redraft = async () => { try { await api.post(`/tickets/${t.id}/redraft`, {}); toast('Drafting a dispatch to a different vendor…'); await reload(); } catch (e) { toast(e.message, 'err'); } };
  return t.flags.filter((f) => !f.resolved).map((f) => {
    const ui = FLAG_UI[f.type] || { icon: TriangleAlert, title: f.type, tone: '' };
    const Icon = ui.icon;
    return (
      <div key={f.type} className={`card attention ${ui.tone}`} style={{ marginBottom: 0 }}>
        <span className="ic"><Icon size={20} /></span>
        <div style={{ flex: 1 }}>
          <h4>{ui.title}</h4>
          <p>{f.reason}</p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            {f.type === 'identity' ? (
              <>
                <button className="btn sm primary" onClick={() => act('identity', 'cleared', 'Identity confirmed. Drafting dispatch.')}><Check size={14} /> I confirmed it's the tenant</button>
                <button className="btn sm danger" onClick={() => act('identity', 'cannot_verify', 'Ticket closed. No one was dispatched.')}>Can't verify, close it</button>
              </>
            ) : (
              <>
                {f.type === 'no_response' && <button className="btn sm primary" onClick={() => redraft()}><Sparkles size={14} /> Draft to a different vendor</button>}
                <button className="btn sm" onClick={() => act(f.type, 'dismiss', 'Marked as handled')}><Check size={14} /> Mark as handled</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  });
}

export default function Ticket({ id }) {
  const { refresh, toast, demo } = useApp();
  const [t, reloadDetail, error] = usePoll(() => api.get(`/tickets/${id}`), 2000, [id]);
  const [notes, setNotes] = useState(null);
  const reload = async () => { await Promise.all([reloadDetail(), refresh()]); };
  useEffect(() => { if (t && notes === null) setNotes(t.internal_notes || ''); }, [t, notes]);

  if (error && !t) return <div className="card empty"><b>Couldn't find that work order</b><button className="btn" onClick={() => go('/')}>Back to work orders</button></div>;
  if (!t) return <p className="empty">Loading…</p>;

  const act = async (path, body, msg) => { try { await api.post(`/tickets/${id}/${path}`, body); if (msg) toast(msg); await reload(); } catch (e) { toast(e.message, 'err'); } };
  const pending = t.pending_dispatch;
  const openFlags = t.flags.filter((f) => !f.resolved);
  const blocked = openFlags.some((f) => f.type === 'identity' || f.type === 'no_vendor');
  const needsRedraft = t.status === 'triaged' && !pending && !blocked && t.dispatches.length > 0 && t.dispatches[t.dispatches.length - 1].state === 'rejected';
  const isEmergency = t.urgency === 'emergency' && !['resolved', 'closed'].includes(t.status);
  const vendorAttempts = t.dispatches.filter((d) => d.kind === 'vendor');
  const unit = t.unit ? `${unitName(t.unit.number)} · ${t.unit.property_name}${t.unit.neighborhood ? `, ${t.unit.neighborhood}` : ''}` : 'Unit not confirmed';

  return (
    <>
      <button className="back" onClick={() => go('/')}><ArrowLeft size={16} /> All work orders</button>
      <div className="ticket-head">
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="btn-row" style={{ marginBottom: 8 }}>
            <UrgencyBadge urgency={t.urgency} />
            <StatusPill status={t.status} />
            {t.language && t.language !== 'en' && <span className="chip-flag" style={{ background: '#e8eefc', color: '#2457c5' }}><Languages size={12} /> {languageName(t.language)}-speaking tenant</span>}
          </div>
          <h1>{t.title}</h1>
          <div className="sub">Work order #{t.id} · {CATEGORY_LABELS[t.category]} · {unit} · opened {timeAgo(t.created_at)}</div>
        </div>
        <button className="btn sm" title="Copies a plain summary you can paste into any other system" onClick={async () => { try { await navigator.clipboard.writeText(workOrderSummary(t, t.unit ? unit : '')); toast('Summary copied'); } catch { toast('Could not copy. Select the text and copy it yourself.', 'err'); } }}>Copy summary</button>
      </div>

      <div className="ticket-cols">
        <div className="stack">
          {isEmergency && (
            <div className="card card-pad escalation">
              <div className="panel-title"><Siren size={14} /> Emergency {demo && <span className="demo-tag">demo only</span>}</div>
              <ol>
                {demo && <li><b>Page the property manager by phone</b>, repeating until acknowledged. <span style={{ opacity: 0.75 }}>(Demo: no call is placed.)</span></li>}
                <li>Tenant was sent safety instructions.</li>
                <li>{pending ? 'A dispatch is drafted below. Approve it to send help.' : 'Dispatch is on its way.'}</li>
              </ol>
              {!t.emergency_ack && <button className="btn sm primary" style={{ marginTop: 10, background: 'var(--emergency)', borderColor: 'var(--emergency)' }} onClick={() => act('ack-emergency', {}, 'Acknowledged')}><Check size={14} /> I'm on it</button>}
            </div>
          )}

          <FlagCards t={t} reload={reload} />

          {pending && <ApprovalCard compact item={{ ...pending, ticket: t }} />}

          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="card-pad" style={{ paddingBottom: 0 }}><div className="panel-title"><MessageSquare size={14} /> Conversation with {t.tenant?.name || 'unrecognized number'}{t.from_phone ? ` · ${t.from_phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}` : ''}</div></div>
            <Thread t={t} />
            <Composer t={t} reload={reload} />
          </div>
        </div>

        <div className="stack">
          <MediaCard t={t} reload={reload} />

          <div className="card card-pad">
            <div className="panel-title"><Sparkles size={14} /> AI summary</div>
            {!t.view.verifiedTexter && <p className="unconfirmed">Unconfirmed: this texter hasn't been verified, so treat the details below as a first read.</p>}
            <p>{t.summary || 'The assistant is reading this text…'}</p>
            {t.diagnosis && <><div className="label" style={{ marginTop: 12 }}>Likely cause</div><p style={{ color: 'var(--ink-2)' }}>{t.diagnosis}</p></>}
            {t.next_steps.length > 0 && <><div className="label" style={{ marginTop: 12 }}>Proposed next steps</div><ol className="steps">{t.next_steps.map((s) => <li key={s}>{s}</li>)}</ol></>}
            {t.reasoning && <><div className="label" style={{ marginTop: 12 }}>Why {t.urgency}</div><p style={{ color: 'var(--ink-2)' }}>{t.reasoning}</p></>}
          </div>

          <div className="card card-pad">
            <div className="panel-title">Next step</div>
            {t.status === 'dispatched' && <ConfirmTime t={t} reload={reload} />}
            {t.status === 'dispatched' && t.active_dispatch && <VendorTimer t={t} reload={reload} />}
            {t.status === 'scheduled' && (
              <div><p style={{ marginBottom: 10 }}>{vendorAttempts.at(-1)?.vendor_name} is scheduled for <b>{t.scheduled_for}</b>.</p><button className="btn primary" onClick={() => act('status', { status: 'in_progress' })}><Play size={15} /> Work has started</button></div>
            )}
            {t.status === 'in_progress' && <button className="btn primary" onClick={() => act('status', { status: 'resolved' }, 'Marked resolved. Tenant notified.')}><CircleCheck size={15} /> Mark resolved</button>}
            {t.status === 'resolved' && <button className="btn" onClick={() => act('status', { status: 'closed' })}><Archive size={15} /> Close work order</button>}
            {needsRedraft && (
              <div><p style={{ marginBottom: 10 }}>You rejected the last draft. The assistant can try again{t.dispatches.at(-1).pm_note ? ` using your note ("${t.dispatches.at(-1).pm_note}")` : ''}.</p><button className="btn primary" onClick={() => act('redraft', {}, 'Drafting a new dispatch…')}><Sparkles size={15} /> Draft a new dispatch</button></div>
            )}
            {t.status === 'needs_info' && <p>Waiting on the tenant's reply. {t.followup_rounds > 0 && <span style={{ color: 'var(--muted)' }}>(Follow-up {t.followup_rounds} of 2 asked.)</span>}</p>}
            {pending && <p>Review the draft on the left and approve it to move this forward.</p>}
            {blocked && <p>Held for you: see the alert on the left.</p>}
            {t.status === 'closed' && <p>This work order is closed.</p>}
            {['resolved', 'closed'].includes(t.status) ? <DeleteTicket t={t} /> : <MergeTicket t={t} />}
            {!['dispatched', 'scheduled', 'in_progress', 'resolved', 'closed', 'needs_info'].includes(t.status) && !pending && !needsRedraft && !blocked && <p>The assistant is working on this…</p>}
          </div>

          <div className="card card-pad">
            <div className="panel-title"><Wrench size={14} /> Vendor</div>
            {t.view.showVendor && t.vendor ? (
              <>
                <div style={{ fontWeight: 600 }}>{t.vendor.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>{t.vendor.trade} · {t.vendor.rate}</div>
                {t.vendor_channels?.map((c) => <div key={c.label} style={{ fontSize: 13.5 }}>{c.label}: {c.value} <span className="primary-tag">Primary</span></div>)}
                {t.vendor.notes && <p style={{ fontSize: 13.5, marginTop: 6, color: 'var(--ink-2)' }}>{t.vendor.notes}</p>}
              </>
            ) : <p style={{ color: 'var(--muted)' }}>{t.view.notice || 'Not matched yet.'}</p>}
            {vendorAttempts.length > 1 && (
              <div style={{ marginTop: 12 }}>
                <div className="label">Dispatch attempts</div>
                {vendorAttempts.map((d) => (
                  <div key={d.id} className="attempt">
                    <span style={{ flex: 1 }}>{d.vendor_name}</span>
                    <span className={`pill ${d.state === 'no_response' ? 'awaiting_approval' : d.state === 'pending' ? 'needs_info' : 'dispatched'}`}>{{ no_response: 'No response', pending: 'Draft', approved: 'Sent', accepted: 'Confirmed', rejected: 'Rejected' }[d.state]}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="kv" style={{ marginTop: 14 }}>
              {t.view.showEstimate && (
                <><dt>Estimate</dt><dd>{money(t.cost_estimate)}{t.unit && t.cost_estimate > t.unit.approval_limit ? <span className="chip-flag" style={{ marginLeft: 8 }}>over {money(t.unit.approval_limit)} limit</span> : null}<small className="est-src">{t.view.estimateLabel}</small></dd></>
              )}
              <dt>{t.tenant ? 'Tenant' : 'Texter'}</dt><dd>{t.tenant ? `${t.tenant.name} · ${t.tenant.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}` : `Unverified · ${String(t.from_phone || '').replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}`}</dd>
              {t.view.showAccess && <><dt>Access</dt><dd>{t.access_notes || 'Not discussed yet'}</dd></>}
            </div>
          </div>

          <div className="card card-pad">
            <div className="panel-title">Status history</div>
            <ul className="timeline">
              {t.history.map((h) => (
                <li key={h.id}><span className="pt" /><div><b>{STATUS_LABELS[h.status]}</b>{h.note ? <span style={{ color: 'var(--ink-2)' }}> · {h.note}</span> : null}<div className="t">{dayTime(h.created_at)}</div></div></li>
              ))}
            </ul>
          </div>

          <div className="card card-pad">
            <div className="panel-title">Your notes <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>(private, never sent)</span></div>
            <textarea className="notes" value={notes ?? ''} placeholder="Anything to remember about this one…" onChange={(e) => setNotes(e.target.value)}
              onBlur={() => api.post(`/tickets/${id}/notes`, { notes }).catch(() => {})} />
          </div>
        </div>
      </div>
    </>
  );
}
