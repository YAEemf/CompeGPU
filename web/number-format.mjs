const performanceFormat = new Intl.NumberFormat('ja-JP', {minimumFractionDigits:0, maximumFractionDigits:1});
const generalFormat = new Intl.NumberFormat('ja-JP', {maximumSignificantDigits:21});
const isComputePerformance = column => /(?:flops|tops)/i.test(column?.unit || '');

export function formatNumericValue(value, column, comparisonMetric) {
  // Version strings and identifiers retain their exact spelling, including .0.
  if (typeof value !== 'number') return String(value);
  const performance = isComputePerformance(column) || (column?.id === 'ratio' && isComputePerformance(comparisonMetric));
  return (performance ? performanceFormat : generalFormat).format(value);
}
