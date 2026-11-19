import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCC, metricValue, selectGPUs, speedup, csv, matchesRange, missingMetricMarker, missingMetricDetail} from '../web/model.mjs';
import {discoverColumns, cleanColumns, columnValue, moveColumn, DEFAULT_COLUMNS, GPU_DETAIL_COLUMNS, orderGPUs, mergeVisibleOrder, migrateId} from '../web/columns.mjs';
import {scopedGPU, modeMetrics, gpuReferenceURL} from '../web/value-modes.mjs';
import {formatNumericValue} from '../web/number-format.mjs';

const gpu = (id, cc, value, power=100) => ({id,name:id,cc,architecture:'A',category:'test',form_factor:'PCIe',memory_gb:16,power_w:power,price_jpy:null,performance:value == null ? {} : {gpu_fp32:{value}},results:{}});
const gpus = [gpu('old','8.9',10),gpu('new','12.0',100),gpu('unknown','9.0',null),gpu('minor','8.10',50)];

test('missing values expose researched reasons without changing the numeric marker',()=>{
  const card={metric_status:{fp16:{status:'not_published',supported:true,reason:'公称ピーク未公表',checked_on:'2026-11-12'}},field_status:{slot_count:{status:'not_applicable',reason:'OAM'}}};
  assert.equal(missingMetricMarker(card,'fp16'),'—');
  assert.match(missingMetricDetail(card,'fp16'),/型の対応は確認済み/);
  assert.match(missingMetricDetail(card,'fp16'),/2026-11-12/);
  assert.match(missingMetricDetail(card,'field:/slot_count'),/対象外：OAM/);
});

test('non-CUDA APU has no invented CC and is excluded by CC filters in either ordering', () => {
  const apu={...gpu('apu',null,null),field_status:{cc:{status:'not_supported'}}};
  const mixed=[...gpus,apu];
  assert.equal(missingMetricMarker(apu,'cc'),'x');
  for (const direction of ['asc','desc']) {
    assert.equal(selectGPUs(mixed,{},'cc',direction).at(-1).id,'apu');
    assert.ok(!selectGPUs(mixed,{cc:'8.0'},'cc',direction).some(g=>g.id==='apu'));
    assert.ok(!selectGPUs(mixed,{ranges:{cc:{min:'0.0'}}},'cc',direction).some(g=>g.id==='apu'));
    assert.ok(!selectGPUs(mixed,{exactCC:'8.9'},'cc',direction).some(g=>g.id==='apu'));
  }
});

test('GPU reference URL is stable across metrics/modes while per-value provenance stays intact', () => {
  const reference='https://www.techpowerup.com/gpu-specs/geforce-rtx-4090.c3889';
  const sample={...gpu('test','8.9',1),reference_url:reference,
    sources:[{id:'spec',url:'https://example.org/spec'}, {id:'measurement',url:'https://example.org/measurement'}],
    performance:{gpu_fp32:{value:1,kind:'published',source:'spec'}},
    results:{bench:{value:2,kind:'measured',source:'measurement'}}};
  assert.equal(gpuReferenceURL(sample,'gpu_fp32','nominal'),reference);
  assert.equal(gpuReferenceURL(sample,'bench','measured'),reference);
  assert.equal(sample.performance.gpu_fp32.source,'spec');
  assert.equal(gpuReferenceURL({...sample,reference_url:null},'bench','measured'),'https://example.org/measurement');
  assert.equal(gpuReferenceURL({...sample,reference_url:null},'missing','nominal'),'https://example.org/spec');
  assert.equal(gpuReferenceURL({...sample,reference_url:'javascript:alert(1)'},'gpu_fp32','nominal'),null);
});

test('one-decimal rounding applies only to compute performance and its comparisons', () => {
  const performance={id:'gpu_fp32',unit:'TFLOPS'};
  assert.equal(formatNumericValue(104.8832,performance),'104.9');
  assert.equal(formatNumericValue(125,performance),'125');
  assert.equal(formatNumericValue(1.26,{unit:'TOPS'}),'1.3');
  assert.equal(formatNumericValue(0.1234,{unit:'TFLOPS/W'}),'0.1');
  assert.equal(formatNumericValue(2.407,{id:'ratio'},performance),'2.4');
  assert.equal(formatNumericValue(2.407,{id:'ratio'},{id:'price_jpy',unit:'円'}),'2.407');
  for (const column of [{id:'price_jpy',unit:'円'},{id:'memory_gb',unit:'GB'},{id:'bandwidth_gbs',unit:'GB/s'},{id:'field:/version'}]) {
    assert.equal(formatNumericValue(1234.56789,column),'1,234.56789');
  }
  assert.equal(formatNumericValue('12.0',{id:'cc'}),'12.0');
  assert.equal(formatNumericValue('8.10',{id:'cc'}),'8.10');
  assert.equal(formatNumericValue('PCIe 4.0 x16',{id:'field:/connection_type'}),'PCIe 4.0 x16');
});

test('only confirmed unsupported functions use x; unknowns stay missing numerically', () => {
  const sample = {...gpu('unsupported','7.5',null),sources:[],metric_status:{
    tensor_bf16_dense:{status:'not_supported'}, gpu_fp32:{status:'not_verified'},
    tensor_fp16_dense:{status:'not_published'}, tensor_fp8_dense:{status:'not_applicable'}}};
  assert.equal(missingMetricMarker(sample,'tensor_bf16_dense'),'x');
  for (const key of ['gpu_fp32','tensor_fp16_dense','tensor_fp8_dense','price_jpy']) {
    assert.equal(missingMetricMarker(sample,key),'—');
  }
  assert.equal(metricValue(sample,'tensor_bf16_dense'),null);
  assert.equal(matchesRange(metricValue(sample,'tensor_bf16_dense'),{min:0}),false);
  assert.equal(missingMetricMarker(scopedGPU(sample,'measured'),'tensor_bf16_dense'),'—');
});
test('CC is a major/minor pair, including 12.0 and multi-digit minor', () => {
  assert.ok(compareCC('12.0','9.0') > 0); assert.ok(compareCC('8.10','8.9') > 0);
  assert.deepEqual(selectGPUs(gpus,{cc:'9.0'},'cc','asc').map(g=>g.id), ['unknown','new']);
  assert.deepEqual(selectGPUs(gpus,{exactCC:'8.9'},'name').map(g=>g.id), ['old']);
});
test('unknowns sort last in both directions and are excluded by known filter', () => {
  for(const direction of ['asc','desc']) assert.equal(selectGPUs(gpus,{},'gpu_fp32',direction).at(-1).id,'unknown');
  assert.equal(selectGPUs(gpus,{known:true,metric:'gpu_fp32'},'gpu_fp32').length,3);
  assert.equal(selectGPUs(gpus,{memory:32},'gpu_fp32').length,0);
});
test('ratios respect latency direction and never divide by zero', () => {
  assert.equal(speedup(5,10,'lower'),2); assert.equal(speedup(20,10,'higher'),2);
  assert.equal(speedup(0,10,'higher'),null); assert.equal(speedup(10,null,'higher'),null);
  assert.equal(metricValue(gpu('zero','9.0',10,0),'fp32_per_w'),null);
  assert.equal(metricValue(gpus[0],'fp32_per_10k_jpy'),null);
});
test('CSV handles quotes, line breaks, UTF-8 BOM and spreadsheet formulas', () => {
  assert.equal(csv([['a"b','line\nnext','=CMD()',null]]), '\uFEFF"a""b","line\nnext","\'=CMD()",""');
});

test('ranges include endpoints, accept zero and combine bounds across hidden metrics', () => {
  assert.equal(matchesRange(0,{min:'0',max:'0'}),true);
  assert.equal(matchesRange(null,{max:'0'}),false);
  assert.equal(matchesRange(null,{min:'',max:''}),true);
  assert.equal(matchesRange(10,{min:'11',max:'9'}),false);
  assert.equal(matchesRange(10,{min:'garbage'}),false);
  assert.equal(matchesRange('8.10',{min:'8.9',max:'9.0'},true),true);
  assert.equal(matchesRange('12.0',{max:'9.0'},true),false);
  assert.deepEqual(selectGPUs(gpus,{ranges:{gpu_fp32:{min:'10',max:'50'},power_w:{min:'100',max:'100'}}},'gpu_fp32','asc').map(g=>g.id),['old','minor']);
});

test('column discovery includes custom numbers, nested sources and per-value metadata', () => {
  const sample = {...gpus[0], custom:{watts:0, list:[{url:'https://example.org'}]}};
  const columns = discoverColumns([sample],[{id:'gpu_fp32',name:'FP32',unit:'TFLOPS'}]);
  const custom = columns.find(c=>c.id==='field:/custom/watts');
  assert.equal(custom.type,'number'); assert.equal(columnValue(sample,custom),0);
  assert.equal(columnValue(sample,columns.find(c=>c.id==='field:/custom/list/0/url')),'https://example.org');
  assert.equal(columnValue(sample,columns.find(c=>c.id==='gpu_fp32')),10);
  assert.equal(columnValue({},custom),null);
  assert.deepEqual(cleanColumns(['cc','cc','missing'],columns),['cc']);
  assert.deepEqual(cleanColumns([],columns),[]);
  assert.deepEqual(moveColumn(['a','b','c'],'a','c'),['b','c','a']);
  assert.deepEqual(moveColumn(['a','b','c'],'c','a'),['c','a','b']);
  assert.deepEqual(DEFAULT_COLUMNS,['cc','memory_gb','bandwidth_gbs','gpu_fp64','gpu_fp32','gpu_fp16','matrix_fp64_dense','matrix_tf32_acc32_dense','matrix_fp16_acc32_dense','matrix_bf16_acc32_dense','matrix_fp8_acc32_dense','matrix_int8_acc32_dense','price_jpy',...GPU_DETAIL_COLUMNS]);
  // Saved selections from before the 2026-11-19 merge map to the merged vendor-neutral rows.
  const merged=[{id:'gpu_fp32'},{id:'matrix_fp16_acc32_dense'},{id:'gemm_fp8_1gpu'}];
  assert.deepEqual(cleanColumns(['cuda_fp32','gpu_fp32','tensor_fp16_dense','gaudi_paper_v1_fp8_gemm_8192_tensor_hw','gpu_fp32_packed'],merged),['gpu_fp32','matrix_fp16_acc32_dense','gemm_fp8_1gpu']);
  assert.equal(migrateId('tensor_int8_sparse'),'matrix_int8_acc32_sparse');
});

test('manual GPU order preserves hidden positions and appends new GPUs', () => {
  assert.deepEqual(mergeVisibleOrder(['a','b','c','d'],['d','b']),['a','d','c','b']);
  const values=[{id:'a'},{id:'b'},{id:'new'}];
  assert.deepEqual(orderGPUs(values,['b','deleted','a']).map(g=>g.id),['b','a','new']);
  assert.deepEqual(values.map(g=>g.id),['a','b','new']);
});

test('nominal and measured values, containers and sources are isolated', () => {
  const sample={...gpus[0],price_jpy:1000,notes:'spec note',sources:[{id:'spec'},{id:'run'}],performance:{
    gpu_fp32:{value:10,kind:'derived',source:'spec'},custom:{value:8,kind:'measured',source:'run'}},
    results:{latency:{value:3,kind:'aggregate',source:'run'}}};
  const nominal=scopedGPU(sample,'nominal'), measured=scopedGPU(sample,'measured');
  assert.deepEqual(Object.keys(nominal.performance),['gpu_fp32']);
  assert.deepEqual(nominal.results,{}); assert.deepEqual(nominal.sources,[{id:'spec'}]);
  assert.deepEqual(Object.keys(measured.performance),['custom']);
  assert.equal(measured.results.latency.value,3); assert.deepEqual(measured.sources,[{id:'run'}]);
  assert.equal(measured.memory_gb,undefined); assert.equal(measured.cc,undefined);
  assert.equal(measured.price_jpy,undefined); assert.equal(measured.notes,undefined);
  const data={gpus:[sample],metrics:[{id:'gpu_fp32'},{id:'custom'},{id:'uncollected'}],benchmarks:[{id:'latency'}]};
  assert.deepEqual(modeMetrics(data,[{id:'power_w'}],'nominal').map(m=>m.id),['gpu_fp32','uncollected','power_w']);
  assert.deepEqual(modeMetrics(data,[{id:'power_w'}],'measured').map(m=>m.id),['custom','latency']);
  assert.equal(sample.results.latency.value,3);
});
