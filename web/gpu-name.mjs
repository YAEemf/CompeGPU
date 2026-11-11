// Presentation only: never write abbreviated names back to GPU records.
export function displayGPUName(name) {
  const original=String(name ?? '').trim();
  return original.replace(/\b(?:NVIDIA|GeForce)\b[®™]?/gi,'').replace(/\s+/g,' ').trim() || original;
}
