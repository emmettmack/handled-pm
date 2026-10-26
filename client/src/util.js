import { useEffect, useState } from 'react';
import { LANGUAGES, languageName } from '../../server/languages.js';

export { LANGUAGES, languageName };

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const dayTime = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export const STATUS_LABELS = {
  new: 'New', triaged: 'Triaged', needs_info: 'Needs info', dispatch_drafted: 'Dispatch drafted',
  awaiting_approval: 'Awaiting approval', dispatched: 'Dispatched', scheduled: 'Scheduled',
  in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed',
};
export const CATEGORY_LABELS = { plumbing: 'Plumbing', electrical: 'Electrical', HVAC: 'Heating & cooling', appliance: 'Appliance', lockout: 'Lockout', other: 'General' };
export const TRADES = ['plumber', 'electrician', 'HVAC', 'handyman', 'locksmith', 'appliance', 'general', 'other'];
export const TRADE_LABELS = { plumber: 'Plumbers', electrician: 'Electricians', HVAC: 'Heating & cooling', handyman: 'Handymen', locksmith: 'Locksmiths', appliance: 'Appliance repair', general: 'General contractors', other: 'Other' };
export const TRADE_OPTION_LABELS = { plumber: 'Plumber', electrician: 'Electrician', HVAC: 'Heating & cooling', handyman: 'Handyman', locksmith: 'Locksmith', appliance: 'Appliance repair', general: 'General contractor', other: 'Other' };
export const URGENCY_RANK = { emergency: 0, urgent: 1, routine: 2 };
/** A single home uses the unit name "Main", which reads as "Main house". */
export const unitName = (n) => (/^main( house)?$/i.test(String(n ?? '').trim()) ? 'Main house' : `Unit ${n}`);
export const money = (n) => (n == null ? 'n/a' : '$' + Number(n).toLocaleString());

/** Re-render every `ms` so "5 min ago" labels stay fresh between data polls. */
export function useTick(ms = 15000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function usePoll(fn, ms, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    try { setData(await fn()); setError(null); } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [data, load, error];
}
