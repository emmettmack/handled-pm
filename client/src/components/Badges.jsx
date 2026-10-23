import { Siren, TriangleAlert, ShieldAlert, Hourglass, MessageSquare, DollarSign, RefreshCw } from 'lucide-react';
import { STATUS_LABELS } from '../util.js';

export function UrgencyBadge({ urgency }) {
  if (urgency === 'emergency') return <span className="badge emergency"><Siren size={13} /> Emergency</span>;
  if (urgency === 'urgent') return <span className="badge urgent">Urgent</span>;
  return <span className="badge routine">Routine</span>;
}

export function StatusPill({ status }) {
  const label = STATUS_LABELS[status] || status;
  return <span className={`pill ${status}`}>{label}</span>;
}

const FLAG = {
  identity: { label: 'Identity check needed', icon: ShieldAlert, red: true },
  compensation: { label: 'Compensation request', icon: DollarSign, red: false },
  update: { label: 'New tenant message', icon: MessageSquare, red: false },
  no_response: { label: 'Vendor hasn’t replied', icon: Hourglass, red: true },
  over_limit: { label: 'Over owner’s limit', icon: DollarSign, red: false },
  vendor_reply: { label: 'Vendor replied', icon: MessageSquare, red: false },
  no_vendor: { label: 'No vendor available', icon: TriangleAlert, red: true },
};
export function FlagChip({ flag }) {
  const f = FLAG[flag.type] || { label: flag.type, icon: TriangleAlert };
  const Icon = f.icon;
  return <span className={`chip-flag ${f.red ? 'red' : ''}`}><Icon size={12} /> {f.label}</span>;
}
export const flagMeta = FLAG;
export { RefreshCw };
