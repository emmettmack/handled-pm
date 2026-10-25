import { useEffect, useState } from 'react';
import { Check, Home as HomeIcon, Building2, ArrowRight, ArrowLeft } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../ctx.jsx';
import { TRADES, TRADE_OPTION_LABELS } from '../util.js';

const STEPS = ['Welcome', 'About you', 'Your property', 'A vendor', 'Texting'];

function Field({ label, children, hint }) {
  return <div className="field"><label>{label}</label>{children}{hint && <span className="hint-small">{hint}</span>}</div>;
}

/** First-run tutorial for a new real account. Every step can be skipped; everything it creates can be edited later. */
export default function Setup({ setup, onDone }) {
  const { toast, status, refreshStatus, refresh } = useApp();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState(setup.mode || 'manager');
  const [busy, setBusy] = useState(false);
  const home = mode === 'home';

  const co = status?.company || {};
  const [me, setMe] = useState({ pm_name: '', name: '', phone: '', email: '' });
  const [prop, setProp] = useState({ name: '', address: '', owner_name: '', owner_email: '', company: '', approval_limit: '500', units: '' });
  const [ven, setVen] = useState({ name: '', trade: 'plumber', phone: '', email: '', rate: '' });
  const [account, setAccount] = useState(null);
  useEffect(() => { api.get('/account').then(setAccount).catch(() => {}); }, []);
  // Start from what the sign-in already knows (name, email), plus anything saved earlier under Preferences.
  const clerkUser = window.Clerk?.user;
  const filled = !!co.pm_name && co.pm_name !== 'You' && !!(co.phone || co.email);
  useEffect(() => { setMe((m) => ({ ...m, pm_name: m.pm_name || clerkUser?.fullName || '', email: m.email || clerkUser?.primaryEmailAddress?.emailAddress || '' })); }, [clerkUser?.id]);
  useEffect(() => { setMe((m) => ({ ...m, pm_name: m.pm_name || (co.pm_name === 'You' ? '' : co.pm_name) || '', name: m.name || (co.name === 'My rentals' ? '' : co.name) || '', phone: m.phone || co.phone || '', email: m.email || co.email || '' })); }, [co.pm_name, co.name]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); return true; } catch (e) { toast(e.message, 'err'); return false; } finally { setBusy(false); }
  };

  const next = () => setStep((s) => s + 1);
  const saveMode = () => run(async () => { await api.put('/setup', { mode }); await refreshStatus(); setStep(filled ? 2 : 1); }); // skip "About you" if it's already filled in
  const saveMe = () => run(async () => {
    if (!me.pm_name.trim()) throw new Error('Please enter your name.');
    await api.put('/company', { ...co, ...me, name: home ? `${me.pm_name.trim()}'s rentals` : me.name || co.name });
    await refreshStatus(); next();
  });
  const saveProp = () => run(async () => {
    const p = { ...prop, name: home ? prop.name || prop.address.split(',')[0] : prop.name, units: home ? [] : prop.units };
    await api.post('/properties', p);
    next();
  });
  const saveVen = () => run(async () => {
    await api.post('/vendors', { name: ven.name, trade: ven.trade, phone: ven.phone, email: ven.email, rate: ven.rate, primary_company: ven.phone ? 1 : 0, primary_email: !ven.phone && ven.email ? 1 : 0 });
    next();
  });
  const finish = () => run(async () => { await api.put('/setup', { done: true }); await refresh(); onDone(); });

  const Nav = ({ onNext, skip, nextLabel = 'Continue', disabled }) => (
    <div className="setup-nav">
      {step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /> Back</button> : <span />}
      <span style={{ flex: 1 }} />
      {skip && <button className="btn link" onClick={next}>Skip for now</button>}
      <button className="btn primary lg" disabled={busy || disabled} onClick={onNext}>{nextLabel} <ArrowRight size={16} /></button>
    </div>
  );

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="setup-brand"><div className="brand-mark"><Check size={16} strokeWidth={3} /></div> Macalisto</div>
        <div className="setup-steps">{STEPS.map((s, i) => <span key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{i < step ? <Check size={12} /> : i + 1}<em>{s}</em></span>)}</div>

        {step === 0 && (
          <>
            <h1>Welcome. Let's set up your maintenance line.</h1>
            <p className="lead">This takes about five minutes. Here's how Macalisto works:</p>
            <ol className="howto">
              <li><b>A tenant texts your number</b> with a problem, and photos if they have them.</li>
              <li><b>Macalisto handles it:</b> it works out what's wrong, asks anything it's missing, and drafts a message to the right vendor.</li>
              <li><b>You approve.</b> Nothing goes to a vendor until you say so.</li>
            </ol>
            <div className="field"><label>Which describes you?</label></div>
            <div className="mode-pick">
              <button className={!home ? 'on' : ''} onClick={() => setMode('manager')}><Building2 size={22} /><b>I manage properties for others</b><span>Owners, spending limits, several buildings</span></button>
              <button className={home ? 'on' : ''} onClick={() => setMode('home')}><HomeIcon size={22} /><b>I rent out my own home</b><span>Simple: one house, you're the owner</span></button>
            </div>
            <Nav onNext={saveMode} nextLabel="Get started" />
          </>
        )}

        {step === 1 && (
          <>
            <h2>About you</h2>
            <p className="lead">We started from what we already know. This is how you sign messages to vendors.</p>
            <Field label="Your name"><input value={me.pm_name} onChange={(e) => setMe({ ...me, pm_name: e.target.value })} autoFocus /></Field>
            {!home && <Field label="Company name"><input value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} /></Field>}
            <div className="field-row">
              <Field label="Your phone"><input value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} /></Field>
              <Field label="Your email"><input value={me.email} onChange={(e) => setMe({ ...me, email: e.target.value })} /></Field>
            </div>
            <Nav onNext={saveMe} disabled={!me.pm_name.trim()} />
          </>
        )}

        {step === 2 && (
          <>
            <h2>{home ? 'Your home' : 'Your first property'}</h2>
            <p className="lead">{home ? 'The address vendors will be sent to.' : 'You can add the rest later under Properties.'}</p>
            {!home && <Field label="Property name"><input value={prop.name} onChange={(e) => setProp({ ...prop, name: e.target.value })} placeholder="e.g. Rosewood Gardens" autoFocus /></Field>}
            <Field label="Address"><input value={prop.address} onChange={(e) => setProp({ ...prop, address: e.target.value })} placeholder="123 Main St, City, CA 90000" autoFocus={home} /></Field>
            {!home && (
              <>
                <Field label="Unit names" hint="Separate with commas, like 1A, 1B, 2A. Leave blank if it's a single home."><input value={prop.units} onChange={(e) => setProp({ ...prop, units: e.target.value })} /></Field>
                <div className="field-row">
                  <Field label="Owner's name"><input value={prop.owner_name} onChange={(e) => setProp({ ...prop, owner_name: e.target.value })} /></Field>
                  <Field label="Owner's email"><input value={prop.owner_email} onChange={(e) => setProp({ ...prop, owner_email: e.target.value })} /></Field>
                </div>
                <Field label="Check with the owner above this repair cost" hint="You'll get a heads-up before approving anything over this amount."><span className="money-input">$<input inputMode="numeric" value={prop.approval_limit} onChange={(e) => setProp({ ...prop, approval_limit: e.target.value.replace(/[^0-9]/g, '') })} /></span></Field>
              </>
            )}
            <Nav onNext={saveProp} skip disabled={!prop.address.trim() || (!home && !prop.name.trim())} />
          </>
        )}

        {step === 3 && (
          <>
            <h2>Add a vendor you trust</h2>
            <p className="lead">Macalisto only ever picks from your list, and always asks you first. Add more any time under Vendors.</p>
            <div className="field-row">
              <Field label="Company or person"><input value={ven.name} onChange={(e) => setVen({ ...ven, name: e.target.value })} autoFocus /></Field>
              <Field label="Trade"><select value={ven.trade} onChange={(e) => setVen({ ...ven, trade: e.target.value })}>{TRADES.map((t) => <option key={t} value={t}>{TRADE_OPTION_LABELS[t]}</option>)}</select></Field>
            </div>
            <div className="field-row">
              <Field label="Phone (we text this)"><input value={ven.phone} onChange={(e) => setVen({ ...ven, phone: e.target.value })} /></Field>
              <Field label="Email (optional)"><input value={ven.email} onChange={(e) => setVen({ ...ven, email: e.target.value })} /></Field>
            </div>
            <Field label="Preferred rate (optional)"><span className="money-input rate-input">$<input inputMode="decimal" value={ven.rate.match(/\d+(\.\d+)?/)?.[0] || ''} placeholder="95" onChange={(e) => { const n = e.target.value.replace(/[^0-9.]/g, ''); setVen({ ...ven, rate: n ? `$${n} per hour` : '' }); }} /> per hour</span></Field>
            <Nav onNext={saveVen} skip disabled={!ven.name.trim() || (!ven.phone.trim() && !ven.email.trim())} />
          </>
        )}

        {step === 4 && (
          <>
            <h2>Your texting line</h2>
            {account?.texting?.connected ? (
              <p className="lead">Texting is connected. Tell your tenants to text <b>{account.texting.number}</b>. Save it in their phone as something like “Home repairs.”</p>
            ) : (
              <p className="lead">Your texting number isn't connected yet. Until it is, you can still add everything and explore, but no real texts will arrive. We'll let you know when it's ready.</p>
            )}
            <div className="tip">
              <b>How to use your dashboard</b>
              <ul>
                <li>Add your tenants under <b>Properties</b>, each one assigned to the home they live in.</li>
                <li>New texts show up under <b>Ready for your OK</b> as finished drafts.</li>
                <li>Read the draft, edit it if you like, then <b>Approve &amp; send</b>.</li>
                <li>Emergencies show a red bar at the top. <b>Preferences</b> controls what goes in your drafts.</li>
              </ul>
            </div>
            <Nav onNext={finish} nextLabel="Open my dashboard" />
          </>
        )}
      </div>
    </div>
  );
}
