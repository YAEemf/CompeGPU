import {metricValue} from './model.mjs';

export const GPU_DETAIL_COLUMNS = ['field:/architecture', 'field:/connection_type', 'field:/cooling_type', 'field:/board_variant', 'field:/slot_count'];
export const DEFAULT_COLUMNS = ['cc', 'memory_gb', 'bandwidth_gbs', 'cuda_fp64', 'cuda_fp32', 'cuda_fp16',
  'tensor_fp32_dense', 'tensor_tf32_dense', 'tensor_fp16_dense', 'tensor_bf16_dense', 'price_jpy', ...GPU_DETAIL_COLUMNS];
const names = {id:'GPU ID', architecture:'世代（アーキテクチャ）', category:'カテゴリ', form_factor:'構成（元の表記）',
  connection_type:'接続形式', cooling_type:'冷却方式', board_variant:'ボード仕様', slot_count:'占有スロット数', notes:'GPUメモ',
  sources:'出典一覧 (JSON)', performance:'理論性能一覧 (JSON)', results:'実測結果一覧 (JSON)',purchase_url:'購入リンク'};
const pointer = path => 'field:' + path.map(part => '/' + part.replaceAll('~','~0').replaceAll('/','~1')).join('');
export function fieldValue(gpu, path) {
  let value = gpu;
  for (const part of path) {
    if (value == null || !Object.hasOwn(value, part)) return null;
    value = value[part];
  }
  return value ?? null;
}

export function discoverColumns(gpus, metrics, {includeCC = true} = {}) {
  const columns = [...(includeCC ? [{id:'cc',name:'CC',type:'cc',unit:'',direction:'higher'}] : []),
    ...metrics.map(m => ({...m, type:'number'})),
    {id:'ratio',name:'基準比（選択指標）',type:'number',unit:'×',direction:'higher'}];
  const ids = new Set(columns.map(c=>c.id));
  const fields = new Map();
  function visit(value, path) {
    const id = pointer(path), name = names[path.join('.')] || path.join(' / ');
    if (!fields.has(id)) fields.set(id, {id, name, path, type:typeof value === 'number' ? 'number' : 'text', unit:'',direction:'higher'});
    else if (typeof value === 'number') fields.get(id).type = 'number';
    if (value && typeof value === 'object') {
      fields.get(id).type = 'json';
      for (const [key, child] of Object.entries(value)) visit(child, [...path,key]);
    }
  }
  for (const gpu of gpus) {
    for (const [key, value] of Object.entries(gpu)) {
      if (['name', 'cc', ...metrics.map(m=>m.id)].includes(key)) continue;
      visit(value, [key]);
    }
  }
  for (const column of fields.values()) if (!ids.has(column.id)) columns.push(column);
  return columns;
}

export function columnValue(gpu, column) {
  if (!column) return null;
  if (column.path) return fieldValue(gpu, column.path);
  if (column.id === 'cc') return gpu.cc;
  return metricValue(gpu, column.id);
}

export function cleanColumns(saved, available) {
  const allowed = new Set(available.map(c=>c.id));
  return [...new Set((Array.isArray(saved) ? saved : DEFAULT_COLUMNS).filter(id=>allowed.has(id)))];
}

export function moveColumn(ids, source, target) {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return [...ids];
  const next = ids.filter(id=>id !== source);
  next.splice(ids.indexOf(target), 0, source);
  return next;
}

export function orderGPUs(gpus, ids) {
  const ranks = new Map(ids.map((id,index)=>[id,index]));
  return [...gpus].sort((a,b)=>(ranks.get(a.id) ?? Infinity)-(ranks.get(b.id) ?? Infinity));
}

export function mergeVisibleOrder(fullOrder, visibleOrder) {
  const visible = new Set(visibleOrder);
  let index = 0;
  return fullOrder.map(id=>visible.has(id)?visibleOrder[index++]:id);
}
