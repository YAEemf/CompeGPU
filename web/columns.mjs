import {metricValue} from './model.mjs?v=20261119-model-number';

export const GPU_DETAIL_COLUMNS = ['field:/model_number', 'field:/architecture', 'field:/connection_type', 'field:/cooling_type', 'field:/board_variant', 'field:/slot_count'];
export const APU_COLUMNS = ['matrix_fp16_acc16_dense','field:/cpu_cores','field:/cpu_threads','npu_ai_tops','platform_ai_tops'];
export const ACCELERATOR_COLUMNS = ['matrix_fp32_dense','vector_bf16'];
export const DEFAULT_COLUMNS = ['cc', 'memory_gb', 'bandwidth_gbs', 'gpu_fp64', 'gpu_fp32', 'gpu_fp16',
  'matrix_fp64_dense', 'matrix_tf32_acc32_dense', 'matrix_fp16_acc32_dense', 'matrix_bf16_acc32_dense',
  'matrix_fp8_acc32_dense', 'matrix_int8_acc32_dense', 'price_jpy', ...GPU_DETAIL_COLUMNS];
// 2026-11-19: vendor-specific rows (CUDA/Tensor) were merged into vendor-neutral rows.
// Saved column lists, sort keys and range filters from older versions are mapped here.
export const METRIC_ALIASES = {
  cuda_fp64:'gpu_fp64', cuda_fp32:'gpu_fp32', cuda_fp16:'gpu_fp16',
  gpu_fp32_single_issue:'gpu_fp32', gpu_fp16_single_issue:'gpu_fp16', gpu_fp32_packed:'gpu_fp32',
  tensor_fp64_dense:'matrix_fp64_dense', tensor_fp64_sparse:'matrix_fp64_dense',
  tensor_fp32_dense:'matrix_fp32_dense', tensor_fp32_sparse:'matrix_fp32_dense',
  tensor_tf32_dense:'matrix_tf32_acc32_dense', tensor_tf32_sparse:'matrix_tf32_acc32_sparse',
  tensor_fp16_dense:'matrix_fp16_acc32_dense', tensor_fp16_sparse:'matrix_fp16_acc32_sparse',
  tensor_fp16_acc16_dense:'matrix_fp16_acc16_dense', tensor_fp16_acc16_sparse:'matrix_fp16_acc16_sparse',
  gpu_matrix_fp16_acc16_dense:'matrix_fp16_acc16_dense', gpu_ai_fp16_advertised:'matrix_fp16_acc16_dense',
  tensor_bf16_dense:'matrix_bf16_acc32_dense', tensor_bf16_sparse:'matrix_bf16_acc32_sparse',
  tensor_fp8_dense:'matrix_fp8_acc32_dense', tensor_fp8_sparse:'matrix_fp8_acc32_sparse',
  tensor_fp8_acc16_dense:'matrix_fp8_acc16_dense', tensor_fp8_acc16_sparse:'matrix_fp8_acc16_sparse',
  tensor_fp4_dense:'matrix_fp4_dense', tensor_fp4_sparse:'matrix_fp4_sparse',
  tensor_int8_dense:'matrix_int8_acc32_dense', tensor_int8_sparse:'matrix_int8_acc32_sparse',
  tensor_int4_dense:'matrix_int4_dense', tensor_int4_sparse:'matrix_int4_sparse', vendor_int4_tops_advertised:'matrix_int4_dense',
  tensor_fp16_unspecified_dense:'matrix_fp16_acc32_dense', tensor_fp16_unspecified_sparse:'matrix_fp16_acc32_sparse',
  tensor_fp8_unspecified_dense:'matrix_fp8_acc32_dense', tensor_fp8_unspecified_sparse:'matrix_fp8_acc32_sparse',
  tensor_fp4_unspecified_dense:'matrix_fp4_dense', tensor_fp4_unspecified_sparse:'matrix_fp4_sparse',
  ...Object.fromEntries(['4096_tensor_hw','4096_tensor_sw','4096_channel_sw','6144_tensor_hw','6144_tensor_sw','6144_channel_sw','8192_tensor_hw','8192_tensor_sw','8192_channel_sw'].map(s=>['gaudi_paper_v1_fp8_gemm_'+s,'gemm_fp8_1gpu'])),
  gaudi_author_bf16_gemm_4096:'gemm_bf16_1gpu', gaudi_author_bf16_gemm_8192:'gemm_bf16_1gpu',
  ...Object.fromEntries(['8192_eager','8192_compiled','16384_eager','16384_compiled'].map(s=>['gaudi124_fp16_gemm_'+s,'gemm_fp16_1gpu'])),
  dell2022_dgemm_single:'gemm_fp64_1gpu', dell2022_sgemm_single:'gemm_fp32_1gpu', dell2022_hpl_single:'hpl_fp64_1gpu',
};
export const migrateId = id => METRIC_ALIASES[id] ?? id;
const names = {id:'GPU ID', model_number:'型番', architecture:'世代（アーキテクチャ）', category:'カテゴリ', form_factor:'構成（元の表記）',
  connection_type:'接続形式', cooling_type:'冷却方式', board_variant:'ボード仕様', slot_count:'占有スロット数', notes:'GPUメモ',
  sources:'出典一覧 (JSON)', performance:'理論性能一覧 (JSON)', results:'実測結果一覧 (JSON)',purchase_url:'購入リンク',reference_url:'GPU名から開く出典URL',
  cpu_cores:'CPUコア数',cpu_threads:'CPUスレッド数',cpu_architecture:'CPU世代',cpu_base_clock_ghz:'CPUベースクロック',cpu_max_boost_ghz:'CPU最大Boost',
  compute_units:'GPU CU数',gpu_model:'内蔵GPU',llvm_target:'ROCmターゲット',memory_scope:'メモリの対象範囲',power_scope:'電力の対象範囲',power_min_w:'電力設定の下限',power_max_w:'電力設定の上限'};
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
  return [...new Set((Array.isArray(saved) ? saved : DEFAULT_COLUMNS).map(migrateId).filter(id=>allowed.has(id)))];
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
