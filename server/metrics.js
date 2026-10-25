// Usage counters (texts in/out, AI calls). Safe to import anywhere: it does nothing until the server plugs in a sink.
let sink = () => {};
export const setMetricSink = (fn) => { sink = fn; };
export const bump = (key, n = 1) => { try { sink(key, n); } catch { /* counting must never break a request */ } };
