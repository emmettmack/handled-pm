// Turns rows into a spreadsheet file (CSV). Opens cleanly in Excel, Numbers and Google Sheets.
// Text that starts with = + - or @ gets a leading apostrophe, so a tenant's message can never run as a spreadsheet formula.
export const EXPORT_COLUMNS = [
  ['work_order', 'Work order #'], ['status', 'Status'], ['opened', 'Opened'], ['closed', 'Closed'],
  ['property', 'Property'], ['address', 'Address'], ['unit', 'Unit'], ['tenant', 'Tenant'], ['tenant_phone', 'Tenant phone'],
  ['issue', 'Issue'], ['category', 'Category'], ['urgency', 'Urgency'], ['summary', 'Summary'],
  ['vendor', 'Vendor'], ['vendor_phone', 'Vendor phone'], ['scheduled_for', 'Scheduled for'],
  ['estimate_usd', 'Estimate (USD)'], ['estimate_source', 'Estimate source'], ['photos', 'Photos'],
];

const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns = EXPORT_COLUMNS) {
  const lines = [columns.map(([, label]) => cell(label)).join(',')];
  for (const r of rows) lines.push(columns.map(([key]) => cell(r[key])).join(','));
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A plain-text block a PM can paste into any other system's work order. */
export function workOrderSummary(t, unitLabel) {
  const lines = [
    `Work order #${t.id}: ${t.title}`,
    `Status: ${t.status}${t.urgency ? ` · ${t.urgency}` : ''}`,
    unitLabel ? `Where: ${unitLabel}` : '',
    t.tenant ? `Tenant: ${t.tenant.name}${t.tenant.phone ? ` (${t.tenant.phone})` : ''}` : '',
    t.summary ? `Problem: ${t.summary}` : '',
    t.vendor ? `Vendor: ${t.vendor.name}${t.vendor.phone ? ` (${t.vendor.phone})` : ''}` : '',
    t.scheduled_for ? `Scheduled: ${t.scheduled_for}` : '',
    t.cost_estimate != null ? `Estimate: $${Number(t.cost_estimate).toLocaleString()} (${t.view?.estimateLabel || 'estimate'})` : '',
    `Opened: ${String(t.created_at || '').slice(0, 10)}${t.resolved_at ? ` · Closed: ${String(t.resolved_at).slice(0, 10)}` : ''}`,
  ];
  return lines.filter(Boolean).join('\n');
}
