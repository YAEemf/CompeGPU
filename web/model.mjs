import {displayGPUName} from './gpu-name.mjs';

export function compareCC(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  return x[0] - y[0] || x[1] - y[1];
}

export function metricValue(gpu, key) {
  if (key === 'fp32_per_w') {
    const value = gpu.performance.cuda_fp32?.value;
    return value != null && gpu.power_w > 0 ? value / gpu.power_w : null;
  }
  if (key === 'fp32_per_10k_jpy') {
    const value = gpu.performance.cuda_fp32?.value;
    return value != null && gpu.price_jpy > 0 ? value / gpu.price_jpy * 10000 : null;
  }
  if (key in gpu && (typeof gpu[key] === 'number' || gpu[key] === null)) return gpu[key];
  return gpu.performance[key]?.value ?? gpu.results[key]?.value ?? null;
}

export function missingMetricMarker(gpu, key) {
  return (gpu.metric_status?.[key] || gpu.field_status?.[key])?.status === 'not_supported' ? 'x' : '—';
}

export function matchesRange(value, range, isCC = false) {
  if (range?.invalid) return false;
  const hasMin = range?.min != null && range.min !== '';
  const hasMax = range?.max != null && range.max !== '';
  if (!hasMin && !hasMax) return true;
  if (value == null) return false;
  if (isCC) {
    if (![value, ...(hasMin ? [range.min] : []), ...(hasMax ? [range.max] : [])].every(v => /^\d+\.\d+$/.test(String(v)))) return false;
    return (!hasMin || compareCC(value, String(range.min)) >= 0) && (!hasMax || compareCC(value, String(range.max)) <= 0);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return (!hasMin || (Number.isFinite(Number(range.min)) && value >= Number(range.min))) &&
    (!hasMax || (Number.isFinite(Number(range.max)) && value <= Number(range.max)));
}

export function selectGPUs(gpus, filters, key, direction = 'desc', getValue = metricValue) {
  const rows = gpus.filter(g =>
    (!filters.query || `${g.name} ${displayGPUName(g.name)} ${g.architecture} ${g.form_factor} ${g.connection_type||''} ${g.cooling_type||''} ${g.board_variant||''}`.toLowerCase().includes(filters.query.toLowerCase())) &&
    (!filters.architecture || g.architecture === filters.architecture) &&
    (!filters.category || g.category === filters.category) &&
    (!filters.cc || (g.cc != null && compareCC(g.cc, filters.cc) >= 0)) &&
    (!filters.exactCC || g.cc === filters.exactCC) &&
    (!(filters.memory > 0) || (g.memory_gb != null && g.memory_gb >= filters.memory)) &&
    (!(filters.power > 0) || (g.power_w != null && g.power_w <= filters.power)) &&
    (!filters.known || getValue(g, filters.metric) != null) &&
    Object.entries(filters.ranges || {}).every(([id, range]) => matchesRange(id === 'cc' ? g.cc : getValue(g, id), range, id === 'cc'))
  );
  return rows.sort((a, b) => {
    const x = key === 'name' ? a.name : key === 'cc' ? a.cc : getValue(a, key);
    const y = key === 'name' ? b.name : key === 'cc' ? b.cc : getValue(b, key);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    const diff = key === 'cc' ? compareCC(x, y) : typeof x === 'string' ? x.localeCompare(y) : x - y;
    return diff * (direction === 'asc' ? 1 : -1);
  });
}

export function speedup(value, baseline, direction) {
  if (!(value > 0) || !(baseline > 0)) return null;
  return direction === 'lower' ? baseline / value : value / baseline;
}

export function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(cell => {
    let s = cell == null ? '' : String(cell);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
