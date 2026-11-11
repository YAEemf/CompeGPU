const measuredKinds = new Set(['measured','aggregate']);
export const isMeasured = record => measuredKinds.has(record?.kind);

export function gpuReferenceURL(gpu, metricId, mode) {
  const scoped = scopedGPU(gpu, mode);
  const record = scoped.performance[metricId] || scoped.results[metricId];
  const source = scoped.sources.find(s=>s.id===record?.source) || scoped.sources[0];
  const candidate = gpu.reference_url || source?.url;
  try {
    const parsed = new URL(candidate);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

export function scopedGPU(gpu, mode) {
  const measured = mode === 'measured';
  const performance = Object.fromEntries(Object.entries(gpu.performance).filter(([,record])=>isMeasured(record)===measured));
  const results = measured ? Object.fromEntries(Object.entries(gpu.results).filter(([,record])=>isMeasured(record))) : {};
  const measuredSources = new Set([...Object.values(gpu.performance),...Object.values(gpu.results)].filter(isMeasured).map(r=>r.source));
  const ownSources = new Set([...Object.values(performance),...Object.values(results)].map(r=>r.source));
  const sources = gpu.sources.filter(s=>measured ? ownSources.has(s.id) : ownSources.has(s.id)||!measuredSources.has(s.id));
  const base = measured ? Object.fromEntries(['id','name','architecture','category','form_factor'].filter(key=>key in gpu).map(key=>[key,gpu[key]])) : {...gpu};
  return {...base,performance,results,sources};
}

export function modeMetrics(data, baseMetrics, mode) {
  const measured = mode === 'measured';
  const metrics = data.metrics.filter(metric=>{
    const records = data.gpus.map(g=>g.performance[metric.id]).filter(Boolean);
    return measured ? records.some(isMeasured) : !records.length || records.some(r=>!isMeasured(r));
  });
  return measured ? [...metrics,...data.benchmarks] : [...metrics,...baseMetrics];
}
