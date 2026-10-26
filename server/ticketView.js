// What a work order's detail page may show. Vendor, estimate and access details are only meaningful once the texter
// has been verified AND something was drafted or sent; showing them earlier (or on a ticket closed without ever
// being dispatched) misleads the PM. Pure logic so it is easy to check.
export const ESTIMATE_SOURCES = {
  ai_model: 'AI estimate, not a quote',
  sample_rules: 'Sample estimate (demo only)',
  vendor_quote: 'Vendor quote',
  invoice: 'Invoice',
};

export function ticketView(t) {
  const verifiedTexter = !!(t.verified || t.identity_cleared);
  const dispatched = (t.dispatches || []).some((d) => d.kind === 'vendor');
  const closed = ['resolved', 'closed'].includes(t.status);
  const showDetails = verifiedTexter && dispatched;
  return {
    verifiedTexter,
    dispatched,
    showVendor: showDetails,
    showAccess: showDetails,
    showEstimate: showDetails && t.cost_estimate != null,
    estimateSource: t.cost_estimate_source || (t.cost_estimate != null ? 'ai_model' : null),
    estimateLabel: ESTIMATE_SOURCES[t.cost_estimate_source || 'ai_model'],
    // shown in place of the hidden sections
    notice: !showDetails
      ? (closed && !verifiedTexter ? 'Closed without a dispatch: the texter was never verified.'
        : closed ? 'Closed without a dispatch.'
        : !verifiedTexter ? 'Waiting on identity: nothing is dispatched until the texter is verified.'
        : 'No dispatch has been drafted yet.')
      : null,
  };
}
