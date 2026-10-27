import { useEffect, useRef, useState } from 'react';
import { Bot, UserRound, BellOff } from 'lucide-react';
import { api } from '../api.js';
import { useApp, go } from '../ctx.jsx';
import { usePoll, timeAgo } from '../util.js';

const WHO = { tenant: 'Tenant', ai: 'Assistant', pm: 'You' };

function DeleteConversation({ id, onDeleted }) {
  const { toast } = useApp();
  const [sure, setSure] = useState(false);
  const del = async () => {
    try {
      const r = await api.post('/tickets/delete', { ids: [id] });
      if (r.skipped?.length) { toast(r.skipped[0].reason, 'err'); setSure(false); return; }
      toast('Conversation deleted'); onDeleted();
    } catch (e) { toast(e.message, 'err'); }
  };
  return sure ? (
    <div className="remove-confirm" style={{ margin: '0 18px 14px' }}>
      <b>Delete this conversation?</b>
      <span>The messages, photos and work order are removed for good.</span>
      <div className="btn-row"><button className="btn danger" onClick={del}>Yes, delete it</button><button className="btn" onClick={() => setSure(false)}>Keep it</button></div>
    </div>
  ) : <div style={{ padding: '0 18px 12px' }}><button className="btn link danger-link" onClick={() => setSure(true)}>Delete this conversation…</button></div>;
}

function Thread({ id, onChange, onDeleted }) {
  const { toast } = useApp();
  const [t, reload] = usePoll(() => api.get(`/tickets/${id}`), 3000, [id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const count = t?.messages?.length || 0;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [count, id]);
  useEffect(() => { if (t) api.post(`/tickets/${id}/read`, {}).then(onChange).catch(() => {}); }, [id, count]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return <div className="card card-pad">Loading…</div>;

  const msgs = t.messages.filter((m) => m.kind === 'sms');
  const paused = !!t.ai_paused;
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try { await api.post(`/tickets/${id}/pm-message`, { body }); setText(''); await reload(); onChange(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const toggle = async () => {
    try { await api.post(`/tickets/${id}/assistant`, { on: paused }); await reload(); onChange(); toast(paused ? 'The assistant is back on for this conversation' : 'Assistant paused'); } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="card inbox-thread">
      <div className="inbox-thread-head">
        <div><b>{t.tenant?.name || t.from_phone || 'Unknown'}</b><div className="hint-small">{t.title || 'New request'} · <a href={`#/tickets/${id}`}>Open work order #{id}</a></div></div>
        <button className={`btn sm ${paused ? 'primary' : ''}`} onClick={toggle} title={paused ? 'The assistant is not replying here. Click to hand it back.' : 'Stop the assistant from replying on this conversation'}>
          {paused ? <><Bot size={14} /> Hand back to assistant</> : <><UserRound size={14} /> I’ll take it from here</>}
        </button>
      </div>
      {paused
        ? <div className="inbox-banner paused">Assistant paused. You’re handling this conversation; new texts wait for you.</div>
        : <div className="inbox-banner">Assistant on. Replying from here pauses it automatically.</div>}
      <div className="thread">
        {msgs.map((m) => (
          <div key={m.id} className={`bubble-wrap ${m.sender}`}>
            <div className="bubble">{m.body}</div>
            <div className="bubble-meta">{WHO[m.sender] || m.sender} · {timeAgo(m.created_at)}{m.delivery_status === 'failed' ? ' · not delivered' : m.delivery_status === 'delivered' ? ' · delivered' : ''}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <DeleteConversation id={id} onDeleted={onDeleted} />
      <div className="composer">
        <textarea rows={2} placeholder="Reply to the tenant from your Macalisto number…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
        <button className="btn primary" disabled={busy || !text.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
}

export default function Inbox({ id }) {
  const { refreshInbox } = useApp();
  const { toast } = useApp();
  const [list, reload] = usePoll(() => api.get('/inbox'), 3000);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState(new Set());
  const [confirming, setConfirming] = useState(false);
  const onChange = () => { reload(); refreshInbox?.(); };
  if (!list) return null;
  const toggle = (cid) => setPicked((p) => { const n = new Set(p); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  const stop = () => { setSelecting(false); setPicked(new Set()); setConfirming(false); };
  const deleteSelected = async () => {
    try {
      const r = await api.post('/tickets/delete', { ids: [...picked] });
      toast(r.skipped?.length ? `Deleted ${r.deleted}. ${r.skipped.length} skipped: a vendor is already on ${r.skipped.length === 1 ? 'it' : 'them'}.` : `Deleted ${r.deleted} conversation${r.deleted === 1 ? '' : 's'}`, r.skipped?.length ? 'err' : undefined);
      if (id && picked.has(id)) go('/inbox');
      stop(); onChange();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <>
      <div className="page-head"><div><h1>Inbox</h1><p>Every conversation with your tenants. Reply from here and the assistant steps aside until you hand it back.</p></div>
        {list.length > 0 && (selecting
          ? <div className="btn-row">
              <button className="btn" onClick={() => setPicked(picked.size === list.length ? new Set() : new Set(list.map((c) => c.id)))}>{picked.size === list.length ? 'Select none' : 'Select all'}</button>
              <button className="btn danger" disabled={!picked.size} onClick={() => setConfirming(true)}>Delete {picked.size || ''}…</button>
              <button className="btn" onClick={stop}>Done</button>
            </div>
          : <button className="btn" onClick={() => setSelecting(true)}>Select</button>)}
      </div>
      {confirming && (
        <div className="remove-confirm" style={{ marginBottom: 12 }}>
          <b>Delete {picked.size} conversation{picked.size === 1 ? '' : 's'}?</b>
          <span>Their messages, photos and work orders are removed for good. A job a vendor is already working on is skipped.</span>
          <div className="btn-row"><button className="btn danger" onClick={deleteSelected}>Yes, delete {picked.size === 1 ? 'it' : 'them'}</button><button className="btn" onClick={() => setConfirming(false)}>Keep them</button></div>
        </div>
      )}
      {list.length === 0 ? <div className="card empty"><b>No conversations yet</b>Texts to your maintenance number will show up here.</div> : (
        <div className="inbox">
          <div className="card inbox-list">
            {list.map((c) => (
              <button key={c.id} className={`inbox-row ${c.id === id ? 'active' : ''} ${c.unread ? 'unread' : ''}`} onClick={() => (selecting ? toggle(c.id) : go(`/inbox/${c.id}`))}>
                <div className="inbox-row-top"><span className="inbox-name">{selecting && <input type="checkbox" readOnly checked={picked.has(c.id)} style={{ marginRight: 8 }} />}{c.unread && <i className="unread-dot" />}{c.contact}</span><span className="hint-small">{timeAgo(c.last_at)}</span></div>
                <div className="inbox-preview">{c.last_sender === 'tenant' ? '' : `${WHO[c.last_sender] || ''}: `}{c.last_body}</div>
                <div className="inbox-tags">
                  {c.ai_paused && <span className="tag">Assistant paused</span>}
                  {c.opted_out && <span className="tag warn"><BellOff size={11} /> Opted out of texts</span>}
                </div>
              </button>
            ))}
          </div>
          {id ? <Thread key={id} id={id} onChange={onChange} onDeleted={() => { go('/inbox'); onChange(); }} /> : <div className="card empty inbox-empty">Choose a conversation</div>}
        </div>
      )}
    </>
  );
}
