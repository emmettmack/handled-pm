// Migration 9: remember which phone numbers have been sent the one-time program disclosure (name, frequency, rates, STOP and HELP),
// so each new person gets it on their first text and never again.
export default {
  id: 9,
  name: 'sms_disclosure',
  up(d) {
    d.exec('CREATE TABLE IF NOT EXISTS sms_disclosures (phone TEXT PRIMARY KEY, sent_at TEXT)');
  },
};
