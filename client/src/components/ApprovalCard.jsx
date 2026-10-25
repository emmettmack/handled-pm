import { useState } from 'react';
import { Check, Pencil, X, Sparkles, Wrench, Send, DollarSign, Camera } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';
import { UrgencyBadge } from './Badges.jsx';
import { timeAgo, CATEGORY_LABELS, unitName } from '../util.js';

/** One drafted vendor message waiting for the PM. Nothing sends until Approve. */
export default function ApprovalCard({ item, compact = false }) {
  const { refresh, toast } = useApp();
  const t = item.ticket;
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
    `Dispatched to ${item.vendor_name} (demo)`,
  );
  const reject = () => run(() => api.post(`/dispatches/${item.id}/reject`, { note }), 'Draft rejected. Nothing was sent.');

  const overLimit = t.flags?.find((f) => f.type === 'over_limit' && !f.resolved);
  const unit = t.unit ? `${unitName(t.unit.number)} · ${t.unit.property_name}` : 'Unit not confirmed';

  return (
    <div className={`card approval ${t.urgency === 'emergency' ? 'emergency' : ''}`}>
      <div className="approval-top">
        <UrgencyBadge urgency={t.urgency} />
        <div>
          <h3><a href={`#/tickets/${t.id}`}>{t.title}</a></h3>
          <div className="meta">{unit}{t.tenant ? ` · ${t.tenant.name}` : ' · Unrecognized number'} · {CATEGORY_LABELS[t.category]}{t.media?.length ? <> · <Camera size={12} style={{ verticalAlign: -1 }} /> {t.media.length}</> : null}</div>
        </div>
        <div className="right">Work order #{t.id} · {timeAgo(item.created_at)}</div>
      </div>

      {overLimit && (
        <div className="kind-bar owner">
          <DollarSign size={17} />
          {overLimit.reason}
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
            <h4><Sparkles size={13} /> Why this vendor</h4>
            <p>{item.reasoning}</p>
          </div>
        </div>
        <div>
          <h4>Draft to the vendor</h4>
          <div className="recipient">
            <Wrench size={16} />
            <span>
              <b>{item.vendor_name}</b> · {item.vendor_trade}{item.vendor_rate ? ` · ${item.vendor_rate}` : ''}
              {item.vendor_channels?.length > 0 && <small className="sends-to">Sends to {item.vendor_channels.map((c) => `${c.label.toLowerCase()} ${c.value}`).join(' and ')}</small>}
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
              <Check size={17} /> {editing ? 'Save & approve' : 'Approve & send'}
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
