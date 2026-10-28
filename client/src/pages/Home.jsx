import { useState } from 'react';
import { Zap, PenLine, Loader2, ChevronRight, ShieldAlert, DollarSign, MessageSquare, TriangleAlert, Inbox, PartyPopper, Siren, Hourglass, Camera, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';
import ApprovalCard from '../components/ApprovalCard.jsx';
import SimulateModal from '../components/SimulateModal.jsx';
import { UrgencyBadge, StatusPill, FlagChip } from '../components/Badges.jsx';
import { timeAgo, CATEGORY_LABELS, URGENCY_RANK, languageName } from '../util.js';
import { toCsv, downloadCsv } from '../csv.js';

const FILTERS = [
  ['open', 'All open', (t) => !['resolved', 'closed'].includes(t.status)],
  ['emergency', 'Emergencies', (t) => t.urgency === 'emergency' && !['resolved', 'closed'].includes(t.status)],
  ['needs_info', 'Needs info', (t) => t.status === 'needs_info'],
  ['approval', 'Awaiting approval', (t) => t.status === 'awaiting_approval'],
  ['motion', 'In motion', (t) => ['dispatched', 'scheduled', 'in_progress'].includes(t.status)],
  ['done', 'Resolved & closed', (t) => ['resolved', 'closed'].includes(t.status)],
];
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const ATTN_ICON = { identity: ShieldAlert, compensation: DollarSign, update: MessageSquare, no_vendor: TriangleAlert, over_limit: DollarSign, no_response: Hourglass, vendor_reply: MessageSquare, callback: RefreshCw, possible_duplicate: TriangleAlert, language: TriangleAlert };
const ATTN_TITLE = { identity: 'Confirm who this is', compensation: 'Tenant asked about compensation', update: 'Tenant sent a new message', no_vendor: 'No vendor left to try', over_limit: 'Over the owner’s limit, check with them', no_response: 'Vendor hasn’t replied', vendor_reply: 'Vendor replied', callback: 'Callback: the repair may not have held', possible_duplicate: 'Possible duplicate', language: 'Needs a reply in another language' };
const SORTS = [['urgency', 'Urgency'], ['newest', 'Newest request'], ['oldest', 'Oldest request']];

/** Orders any list by urgency or by when the request came in. `get` returns { urgency, created_at } for an item. */
const sorter = (mode, get) => (a, b) => {
  const x = get(a), y = get(b);
  const byTime = new Date(y.created_at) - new Date(x.created_at);
  if (mode === 'newest') return byTime;
  if (mode === 'oldest') return -byTime;
  return URGENCY_RANK[x.urgency] - URGENCY_RANK[y.urgency] || byTime;
};

function SortBar({ sort, setSort }) {
  return (
    <div className="sortbar">
      <span>Sort by</span>
      {SORTS.map(([k, label]) => <button key={k} className={`filter ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{label}</button>)}
    </div>
  );
}

function Stat({ n, label, tone, onClick }) {
  return <button type="button" className={`card stat ${tone || ''}`} onClick={onClick}><span className="num">{n}</span><span className="lbl">{label}</span></button>;
}

const scrollTo = (id) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);

export default function Home() {
  const { dash, refresh, toast, status, bannerHidden, demo, setup } = useApp();
  const [filter, setFilter] = useState('open');
  const [sort, setSort] = useState('urgency');
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const { stats, approvals, attention, tickets, emergencies } = dash;

  const quickSimulate = async () => {
    setSimulating(true);
    try {
      const r = await api.post('/simulate/incoming');
      await refresh();
      toast(`New text from ${r.tenant_name}: “${r.body.length > 70 ? r.body.slice(0, 70) + '…' : r.body}”`);
    } catch (e) { toast(e.message, 'err'); } finally { setSimulating(false); }
  };

  const active = FILTERS.find((f) => f[0] === filter);
  const needsAttention = (t) => t.flags.some((f) => f.type === 'no_response');
  const rows = tickets
    .filter(active[2])
    .sort((a, b) => (filter === 'done' ? 0 : needsAttention(b) - needsAttention(a)) || sorter(sort, (x) => x)(a, b));
  const queue = [...approvals].sort(sorter(sort, (a) => a.ticket));

  const waiting = approvals.length;
  const sub = waiting
    ? `${waiting} ${waiting === 1 ? 'thing needs' : 'things need'} your OK. Everything else is already handled.`
    : 'Nothing needs your OK right now. The maintenance line is handling everything else.';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}, {status?.company?.pm_name?.split(' ')[0] || 'there'}</h1>
          <p>{sub}</p>
        </div>
        {demo && <div className="btn-row">
          <button className="btn" onClick={() => setShowSim(true)}><PenLine size={15} /> Write your own</button>
          <button className="btn primary lg" onClick={quickSimulate} disabled={simulating}>
            {simulating ? <Loader2 size={16} className="spin" /> : <Zap size={16} />} Simulate incoming text
          </button>
        </div>}
      </div>

      {!demo && setup && (setup.counts.properties === 0 || setup.counts.tenants === 0 || setup.counts.vendors === 0) && (
        <div className="card checklist">
          <h3>Finish setting up</h3>
          <ul>
            <li className={setup.counts.properties ? 'done' : ''}><a href="#/properties">Add your {status?.homeMode ? 'home' : 'first property'}</a></li>
            <li className={setup.counts.tenants ? 'done' : ''}><a href="#/properties">Add the tenants who live there</a></li>
            <li className={setup.counts.vendors ? 'done' : ''}><a href="#/vendors">Add a vendor you trust</a></li>
          </ul>
        </div>
      )}

      {bannerHidden && emergencies.map((t) => (
        <div key={t.id} className="card headline-emergency" onClick={() => go(`/tickets/${t.id}`)}>
          <Siren size={22} />
          <div><b>Emergency: {t.title}</b><span>{t.unit_label} · reported {timeAgo(t.created_at)}{t.emergency_ack ? ' · acknowledged' : ''}</span></div>
          <button className="btn sm">Open <ChevronRight size={14} /></button>
        </div>
      ))}

      <div className="stats">
        <Stat n={stats.open} label="Open work orders" onClick={() => { setFilter('open'); scrollTo('all-orders'); }} />
        <Stat n={stats.awaiting} label="Awaiting your approval" tone="wait" onClick={() => scrollTo('ready-for-ok')} />
        <Stat n={stats.emergencies} label="Active emergencies" tone={stats.emergencies ? 'hot' : ''} onClick={() => { setFilter('emergency'); scrollTo('all-orders'); }} />
        <Stat n={stats.resolved_this_week} label="Resolved this week" tone="good" onClick={() => { setFilter('done'); scrollTo('all-orders'); }} />
      </div>

      <section className="section" id="ready-for-ok">
        <div className="section-head">
          <h2>Ready for your OK</h2>
          {waiting > 0 && <span className="n">{waiting}</span>}
          <span className="sub">Review, edit if you like, and approve. Nothing goes out until you do.</span>
        </div>
        {waiting === 0 ? (
          <div className="card empty"><PartyPopper size={26} style={{ color: 'var(--brand)' }} /><b>You're all caught up</b>{demo ? 'New tenant texts will show up here as drafts, ready to approve.' : 'When a tenant texts your line, a finished draft will show up here for you to approve.'}</div>
        ) : (
          <>
            {approvals.length > 1 && <SortBar sort={sort} setSort={setSort} />}
            {queue.map((a) => <ApprovalCard key={a.id} item={a} />)}
          </>
        )}
      </section>

      {attention.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Needs your attention</h2><span className="n">{attention.length}</span><span className="sub">These need a person. Nothing was sent automatically.</span></div>
          {attention.map((t) => {
            const f = t.flags[0];
            const Icon = ATTN_ICON[f.type] || TriangleAlert;
            return (
              <div key={t.id} className={`card attention ${f.type}`}>
                <span className="ic"><Icon size={20} /></span>
                <div>
                  <h4>{ATTN_TITLE[f.type] || 'Needs a look'}: {t.title}</h4>
                  <p>{f.reason}</p>
                </div>
                <button className="btn sm go" onClick={() => go(`/tickets/${t.id}`)}>Open <ChevronRight size={14} /></button>
              </div>
            );
          })}
        </section>
      )}

      <section className="section" id="all-orders">
        <div className="section-head"><h2>All work orders</h2><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setExporting((v) => !v)}>Export…</button></div>
        {exporting && <ExportPanel onDone={() => setExporting(false)} />}
        <SortBar sort={sort} setSort={setSort} />
        <div className="filters">
          {FILTERS.map(([key, label, fn]) => (
            <button key={key} className={`filter ${filter === key ? 'on' : ''}`} onClick={() => setFilter(key)}>
              {label} <span className="c">{tickets.filter(fn).length}</span>
            </button>
          ))}
        </div>
        {filter === 'done' && rows.length > 0 && (
          <div style={{ margin: '0 0 10px' }}>
            {clearing ? (
              <div className="remove-confirm">
                <b>Delete all {rows.length} resolved and closed work orders?</b>
                <span>Their messages, photos and history are removed for good. Open work orders are never touched.</span>
                <div className="btn-row">
                  <button className="btn danger" onClick={async () => { try { await api.del('/tickets/closed'); await refresh(); toast('Cleared'); } catch (e) { toast(e.message, 'err'); } setClearing(false); }}>Yes, delete them all</button>
                  <button className="btn" onClick={() => setClearing(false)}>Keep them</button>
                </div>
              </div>
            ) : <button className="btn sm danger" onClick={() => setClearing(true)}>Delete all resolved &amp; closed…</button>}
          </div>
        )}
        <div className="card rows">
          {rows.length === 0 && <div className="empty"><Inbox size={22} /><b>Nothing here</b></div>}
          {rows.map((t) => (
            <div key={t.id} className={`row ${t.urgency}`} onClick={() => go(`/tickets/${t.id}`)}>
              <div className="bar" />
              <div className="main">
                <div className="title">
                  <UrgencyBadge urgency={t.urgency} /> {t.title}
                  {t.language && t.language !== 'en' && <span className="chip-flag" style={{ background: '#e8eefc', color: '#2457c5' }}>{languageName(t.language)}</span>}
                  {t.media_count > 0 && <span className="chip-flag"><Camera size={12} /> {t.media_count}</span>}
                  {t.flags.map((f) => <FlagChip key={f.type} flag={f} />)}
                </div>
                <div className="sub">
                  {t.unit_label || 'Unrecognized number'} · {t.tenant_name || 'Unknown texter'} · {CATEGORY_LABELS[t.category]}
                  {t.last_message ? ` · “${t.last_message}”` : ''}
                </div>
              </div>
              <div className="side">
                <StatusPill status={t.status} />
                <span className="age">{timeAgo(t.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {demo && showSim && <SimulateModal onClose={() => setShowSim(false)} />}
    </>
  );
}

const RANGES = [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['year', 'This year'], ['all', 'All time']];
function ExportPanel({ onDone }) {
  const { toast } = useApp();
  const [scope, setScope] = useState('closed');
  const [range, setRange] = useState('30');
  const [busy, setBusy] = useState(false);
  const go_ = async () => {
    setBusy(true);
    try {
      const today = new Date();
      const from = range === 'all' ? '' : range === 'year' ? `${today.getFullYear()}-01-01` : new Date(today.getTime() - Number(range) * 86400000).toISOString().slice(0, 10);
      const rows = await api.post('/export/work-orders', { scope, from, to: today.toISOString().slice(0, 10) });
      if (!rows.length) { toast('No work orders match that choice.', 'err'); return; }
      downloadCsv(`macalisto-work-orders-${today.toISOString().slice(0, 10)}.csv`, toCsv(rows));
      toast(`Exported ${rows.length} work order${rows.length === 1 ? '' : 's'}`);
      onDone();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="card card-pad" style={{ marginBottom: 12 }}>
      <b>Send your work orders to another system</b>
      <p className="hint-small" style={{ margin: '4px 0 10px' }}>Downloads a spreadsheet you can open in Excel or Sheets, or upload into the software you use for rent and accounting. Your private notes are never included.</p>
      <div className="btn-row" style={{ alignItems: 'center' }}>
        <select value={scope} onChange={(e) => setScope(e.target.value)}><option value="closed">Finished jobs</option><option value="all">All jobs</option></select>
        <select value={range} onChange={(e) => setRange(e.target.value)}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn primary" disabled={busy} onClick={go_}>{busy ? 'Preparing…' : 'Download spreadsheet'}</button>
        <button className="btn" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
