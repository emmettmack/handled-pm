import { useState } from 'react';
import { Zap, PenLine, Loader2, ChevronRight, ShieldAlert, DollarSign, MessageSquare, TriangleAlert, Inbox, PartyPopper } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';
import ApprovalCard from '../components/ApprovalCard.jsx';
import SimulateModal from '../components/SimulateModal.jsx';
import { UrgencyBadge, StatusPill, FlagChip } from '../components/Badges.jsx';
import { timeAgo, CATEGORY_LABELS } from '../util.js';

const FILTERS = [
  ['open', 'All open', (t) => !['resolved', 'closed'].includes(t.status)],
  ['needs_info', 'Needs info', (t) => t.status === 'needs_info'],
  ['approval', 'Awaiting approval', (t) => t.status === 'awaiting_approval'],
  ['motion', 'In motion', (t) => ['dispatched', 'scheduled', 'in_progress'].includes(t.status)],
  ['done', 'Resolved & closed', (t) => ['resolved', 'closed'].includes(t.status)],
];
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const ATTN_ICON = { identity: ShieldAlert, compensation: DollarSign, update: MessageSquare, no_vendor: TriangleAlert };
const ATTN_TITLE = { identity: 'Confirm who this is', compensation: 'Tenant asked about compensation', update: 'Tenant sent a new message', no_vendor: 'No vendor left to try' };

function Stat({ n, label, tone }) {
  return <div className={`card stat ${tone || ''}`}><span className="num">{n}</span><span className="lbl">{label}</span></div>;
}

export default function Home() {
  const { dash, refresh, toast, status } = useApp();
  const [filter, setFilter] = useState('open');
  const [showSim, setShowSim] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const { stats, approvals, attention, tickets } = dash;

  const quickSimulate = async () => {
    setSimulating(true);
    try {
      const r = await api.post('/simulate/incoming');
      await refresh();
      toast(`New text from ${r.tenant_name}: “${r.body.length > 70 ? r.body.slice(0, 70) + '…' : r.body}”`);
    } catch (e) { toast(e.message, 'err'); } finally { setSimulating(false); }
  };

  const active = FILTERS.find((f) => f[0] === filter);
  const rank = { emergency: 0, urgent: 1, routine: 2 };
  const rows = tickets
    .filter(active[2])
    .sort((a, b) => (filter === 'done' ? 0 : rank[a.urgency] - rank[b.urgency]) || new Date(b.updated_at) - new Date(a.updated_at));

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
        <div className="btn-row">
          <button className="btn" onClick={() => setShowSim(true)}><PenLine size={15} /> Write your own</button>
          <button className="btn primary lg" onClick={quickSimulate} disabled={simulating}>
            {simulating ? <Loader2 size={16} className="spin" /> : <Zap size={16} />} Simulate incoming text
          </button>
        </div>
      </div>

      <div className="stats">
        <Stat n={stats.open} label="Open work orders" />
        <Stat n={stats.awaiting} label="Awaiting your approval" tone="wait" />
        <Stat n={stats.emergencies} label="Active emergencies" tone={stats.emergencies ? 'hot' : ''} />
        <Stat n={stats.resolved_this_week} label="Resolved this week" tone="good" />
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Ready for your OK</h2>
          {waiting > 0 && <span className="n">{waiting}</span>}
          <span className="sub">Review, edit if you like, and approve. Nothing goes out until you do.</span>
        </div>
        {waiting === 0 ? (
          <div className="card empty"><PartyPopper size={26} style={{ color: 'var(--brand)' }} /><b>You're all caught up</b>New tenant texts will show up here as drafts, ready to approve.</div>
        ) : (
          approvals.map((a) => <ApprovalCard key={a.id} item={a} />)
        )}
      </section>

      {attention.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Needs your attention</h2><span className="n">{attention.length}</span><span className="sub">The assistant stopped here on purpose. These need a person.</span></div>
          {attention.map((t) => {
            const f = t.flags.find((x) => x.type !== 'no_response');
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

      <section className="section">
        <div className="section-head"><h2>All work orders</h2></div>
        <div className="filters">
          {FILTERS.map(([key, label, fn]) => (
            <button key={key} className={`filter ${filter === key ? 'on' : ''}`} onClick={() => setFilter(key)}>
              {label} <span className="c">{tickets.filter(fn).length}</span>
            </button>
          ))}
        </div>
        <div className="card rows">
          {rows.length === 0 && <div className="empty"><Inbox size={22} /><b>Nothing here</b></div>}
          {rows.map((t) => (
            <div key={t.id} className={`row ${t.urgency}`} onClick={() => go(`/tickets/${t.id}`)}>
              <div className="bar" />
              <div className="main">
                <div className="title">
                  <UrgencyBadge urgency={t.urgency} /> {t.title}
                  {t.language === 'es' && <span className="chip-flag" style={{ background: '#e8eefc', color: '#2457c5' }}>Spanish</span>}
                  {t.flags.map((f) => <FlagChip key={f.type} flag={f} />)}
                </div>
                <div className="sub">
                  {t.unit_label || 'Unrecognized number'} · {t.tenant_name || 'Unknown texter'} · {CATEGORY_LABELS[t.category]}
                  {t.last_message ? ` · “${t.last_message}”` : ''}
                </div>
              </div>
              <div className="side">
                <StatusPill status={t.status} ownerState={t.owner_state} />
                <span className="age">{timeAgo(t.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showSim && <SimulateModal onClose={() => setShowSim(false)} />}
    </>
  );
}
