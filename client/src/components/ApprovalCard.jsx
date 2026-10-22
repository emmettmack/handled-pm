import { useState } from 'react';
import { Check, Pencil, X, Sparkles, Building2, Wrench, Phone, Hourglass, Send, FileText } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';
import { UrgencyBadge } from './Badges.jsx';
import { timeAgo, CATEGORY_LABELS, money } from '../util.js';

/** One drafted message waiting for the PM: vendor dispatch or owner approval request. Nothing sends until Approve. */
export default function ApprovalCard({ item, compact = false }) {
  const { refresh, toast } = useApp();
  const t = item.ticket;
  const isOwner = item.kind === 'owner';
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg); await refresh(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const approve = () => run(
    () => api.post(`/dispatches/${item.id}/approve`, { text: editing ? text : undefined }),
    isOwner ? 'Owner request approved and sent (demo)' : `Dispatched to ${item.vendor_name} (demo)`,
  );
  const reject = () => run(() => api.post(`/dispatches/${item.id}/reject`, { note }), 'Draft rejected. Nothing was sent.');

  const redispatch = t.flags?.some((f) => f.type === 'no_response' && !f.resolved);
  const unit = t.unit ? `Unit ${t.unit.number} · ${t.unit.property_name}` : 'Unit not confirmed';

  return (
    <div className={`card approval ${t.urgency === 'emergency' ? 'emergency' : ''}`}>
      <div className="approval-top">
        <UrgencyBadge urgency={t.urgency} />
        <div>
          <h3><a href={`#/tickets/${t.id}`}>{t.title}</a></h3>
          <div className="meta">{unit}{t.tenant ? ` · ${t.tenant.name}` : ' · Unrecognized number'} · {CATEGORY_LABELS[t.category]}</div>
        </div>
        <div className="right">Work order #{t.id} · {timeAgo(item.created_at)}</div>
      </div>

      {isOwner && (
        <div className="kind-bar owner">
          <Building2 size={17} />
          OWNER APPROVAL REQUEST: the estimate ({money(t.cost_estimate)}) is over this property's {money(t.unit?.approval_limit)} limit. Nothing goes to the vendor until the owner approves.
        </div>
      )}
      {redispatch && !isOwner && (
        <div className="kind-bar redispatch">
          <Hourglass size={17} />
          The first vendor didn't respond in 15 minutes. This is a new dispatch to the next best vendor.
        </div>
      )}

      <div className="approval-grid">
        <div>
          <h4>What's going on</h4>
          <p>{t.summary}</p>
          {!compact && t.next_steps?.length > 0 && (
            <>
              <h4 style={{ marginTop: 12 }}>Likely fix</h4>
              <p>{t.diagnosis}</p>
            </>
          )}
          <div className="why">
            <h4><Sparkles size={13} /> Why this {isOwner ? 'request' : 'vendor'}</h4>
            <p>{item.reasoning}</p>
          </div>
        </div>
        <div>
          <h4>Draft {isOwner ? 'to the owner' : 'to the vendor'}</h4>
          <div className="recipient">
            {isOwner ? <Building2 size={16} /> : <Wrench size={16} />}
            <span>
              {isOwner ? <><b>{t.unit?.owner_name}</b> · {t.unit?.owner_email}</> : <><b>{item.vendor_name}</b> · {item.vendor_trade}{item.vendor_phone ? ` · ${item.vendor_phone}` : ''}{item.vendor_rate ? ` · ${item.vendor_rate}` : ''}</>}
            </span>
          </div>
          {editing ? (
            <textarea className="draft" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          ) : (
            <div className="draft">{item.text}</div>
          )}
        </div>
      </div>

      <div className="approval-actions">
        {rejecting ? (
          <div className="reject-box">
            <input placeholder="Why? (e.g. use a different plumber)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && reject()} />
            <button className="btn danger" disabled={busy} onClick={reject}>Reject draft</button>
            <button className="btn" onClick={() => setRejecting(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <button className="btn primary lg" disabled={busy} onClick={approve}>
              <Check size={17} /> {editing ? 'Save & approve' : isOwner ? 'Approve & send to owner' : 'Approve & send'}
            </button>
            {editing
              ? <button className="btn" onClick={() => { setEditing(false); setText(item.text); }}><X size={15} /> Cancel edit</button>
              : <button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>}
            <button className="btn danger" onClick={() => setRejecting(true)}><X size={15} /> Reject</button>
            <span className="note"><Send size={12} style={{ verticalAlign: -1 }} /> Nothing is sent until you approve</span>
          </>
        )}
      </div>
    </div>
  );
}
