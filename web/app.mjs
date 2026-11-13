import {compareCC, selectGPUs, csv, missingMetricMarker, missingMetricDetail} from './model.mjs?v=20261113-new-devices';
import {TableUI, columnLabel} from './table-ui.mjs?v=20261113-new-devices';
import {modeMetrics, scopedGPU, gpuReferenceURL} from './value-modes.mjs?v=20261111-reference-links';
import {displayGPUName} from './gpu-name.mjs';
import {formatNumericValue} from './number-format.mjs';
import {CatalogStore} from './catalog-store.mjs?v=20261112-pages';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toLocaleDateString('sv-SE');
const staticHosting=document.documentElement.dataset.hosting==='static';
let browserStorage;
try {browserStorage=localStorage;} catch {}
const catalog=new CatalogStore({staticHosting,baseURL:new URL('.',document.baseURI),storage:browserStorage});
if (staticHosting) {
  $('restorePublished').hidden=false;
  $('storageNotice').hidden=false;
  $('save').title='編集はこの端末のブラウザーに保存します。公開データや他の端末には反映されません。';
}
function setFiltersOpen(open, persist=true) {
  const sidebar=$('filterSidebar'), focusInside=sidebar.contains(document.activeElement);
  sidebar.hidden=!open;
  sidebar.closest('.workspace').classList.toggle('filtersClosed',!open);
  $('toggleFilters').setAttribute('aria-expanded',String(open));
  $('toggleFilters').setAttribute('aria-label',open?'絞り込みを閉じる':'絞り込みを開く');
  $('toggleFilters').title=open?'絞り込みを閉じる':'絞り込みを開く';
  $('filterArrow').textContent=open?'‹':'›';
  if (!open && focusInside) $('toggleFilters').focus();
  if (persist) try {localStorage.setItem('gpu-compare.filters-open.v1',String(open));} catch {}
}
let filtersOpen=true;
try {filtersOpen=localStorage.getItem('gpu-compare.filters-open.v1')!=='false';} catch {}
setFiltersOpen(filtersOpen,false);
$('toggleFilters').onclick=()=>setFiltersOpen($('filterSidebar').hidden);
const baseMetrics = [
  {id:'memory_gb',name:'VRAM / 共有メモリ',unit:'GB',direction:'higher'},
  {id:'bandwidth_gbs',name:'メモリ帯域',unit:'GB/s',direction:'higher'},
  {id:'power_w',name:'TDP / TGP',unit:'W',direction:'lower'},
  {id:'price_jpy',name:'価格',unit:'円',direction:'lower',note:'ユーザー入力の購入・見積価格。価格をダブルクリックすると購入リンクを編集、Ctrl＋クリックで購入ページを開きます。税・時点・GPU単体/システム全体などの条件をGPUメモに記録してください。'},
  {id:'fp32_per_w',name:'CUDA FP32 / TDP・TGP',unit:'TFLOPS/W',direction:'higher',note:'CUDA FP32理論値 ÷ 公称TDP/TGP。実測電力効率ではありません。'},
  {id:'fp32_per_10k_jpy',name:'CUDA FP32 / 1万円',unit:'TFLOPS/万円',direction:'higher',note:'CUDA FP32理論値 ÷ 入力価格 × 10,000。価格条件をそろえてください。'}
];
let data, revision, dirty = false, sortKey = 'cuda_fp32', editingId = null, draft, rows = [], toastTimer, tableUI;
let metricId='cuda_fp32', baselineId='', metricByMode={nominal:'cuda_fp32',measured:''};
try {
  const saved=JSON.parse(localStorage.getItem('gpu-compare.selection.v1'));
  if (typeof saved?.baselineId==='string') baselineId=saved.baselineId;
  if (typeof saved?.sortKey==='string') sortKey=saved.sortKey;
  if (['asc','desc'].includes(saved?.direction)) $('sortDirection').value=saved.direction;
  for (const mode of ['nominal','measured']) if (typeof saved?.metrics?.[mode]==='string') metricByMode[mode]=saved.metrics[mode];
} catch {}
function saveSelection() {
  metricByMode[currentMode()]=metricId;
  try {localStorage.setItem('gpu-compare.selection.v1',JSON.stringify({baselineId,metrics:metricByMode,sortKey,direction:$('sortDirection').value}));} catch {}
}
const currentMode = () => tableUI?.mode || $('valueMode').value;
const viewGPU = gpu => scopedGPU(gpu,currentMode());
const metricDefinitions = () => modeMetrics(data,baseMetrics,currentMode());
const selectedMetric = () => tableUI?.byId?.get(metricId) || metricDefinitions().find(m=>m.id===metricId) || {id:'',name:'実測値は未登録',unit:'',direction:'higher',note:'実測定義を追加し、GPU編集画面で測定結果を登録してください。'};
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6000);
}
function markDirty() {dirty = true; $('save').disabled = false; $('saveState').textContent = '未保存の変更あり';}
async function api(path, body) {
  if (path==='/api/validate') return catalog.validate(body.data);
  if (path==='/api/data') return catalog.save(body.data,body.revision);
  throw new Error('未対応の操作です');
}
function download(name, contents, mime) {
  const link = document.createElement('a'), blob = new Blob([contents], {type:mime});
  link.href = URL.createObjectURL(blob); link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function options(id, values, label = 'すべて') {
  const old = $(id).value;
  $(id).innerHTML = `<option value="">${esc(label)}</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  if (values.includes(old)) $(id).value = old;
}
function refreshOptions() {
  options('architecture', [...new Set(data.gpus.map(g => g.architecture))].sort());
  options('category', [...new Set(data.gpus.map(g => g.category))].sort());
  const capabilities = [...new Set(data.gpus.map(g => g.cc).filter(cc=>cc!=null))].sort(compareCC);
  options('exactCC', capabilities);
  const definitions=metricDefinitions();
  tableUI.refresh();
  const desired=metricByMode[currentMode()];
  metricId=tableUI.byId.has(desired)?desired:definitions[0]?.id||'';
  $('known').disabled=!metricId;
  if (!data.gpus.some(g=>g.id===baselineId)) baselineId='';
  if (sortKey!=='name' && !tableUI.byId.has(sortKey)) sortKey=metricId;
  saveSelection();
}
function getPurchaseURL(gpu) {
  try {const parsed=new URL(viewGPU(gpu).purchase_url); return ['http:','https:'].includes(parsed.protocol)?parsed.href:null;} catch {return null;}
}
let purchaseGPUId=null;
function editPurchaseLink(id) {
  const gpu=data.gpus.find(g=>g.id===id);
  if (!gpu || currentMode()!=='nominal') return;
  purchaseGPUId=id;
  $('purchaseLinkTitle').textContent=`${displayGPUName(gpu.name)} の購入リンク`;
  $('purchaseLinkInput').value=gpu.purchase_url||'';
  $('purchaseLinkError').textContent='';
  $('purchaseLinkDialog').showModal();
  $('purchaseLinkInput').focus(); $('purchaseLinkInput').select();
}
function openPurchaseLink(id) {
  const gpu=data.gpus.find(g=>g.id===id), url=gpu && getPurchaseURL(gpu);
  if (url) window.open(url,'_blank','noopener,noreferrer');
}
function cellHTML(g, c, metric) {
  const value=tableUI.value(g,c.id);
  const text=value==null?missingMetricMarker(viewGPU(g),c.id):c.type==='number'?formatNumericValue(value,c,metric):typeof value==='object'?JSON.stringify(value):String(value);
  const isPrice=c.id==='price_jpy', purchaseURL=isPrice&&value!=null?getPurchaseURL(g):null;
  const content=purchaseURL?`<a class="priceLink" href="${esc(purchaseURL)}" tabindex="-1" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`:esc(text);
  const title=isPrice?'ダブルクリックでリンクを編集、Ctrl＋クリックで購入ページを開く':value==null?missingMetricDetail(viewGPU(g),c.id):'';
  return `<td data-cell="${esc(c.id)}" data-gpu="${esc(g.id)}" class="${g.id===baselineId?'baseline ':''}${isPrice?'priceCell ':''}${['text','json'].includes(c.type)?'textCell':''}"${isPrice?' tabindex="0"':''}${title?` title="${esc(title)}"`:''}><span class="${c.id===metric.id?'value':''}">${content}</span></td>`;
}
function gpuNameHTML(g, baseline) {
  return `<button class="gpuName gpuNameButton" data-baseline="${esc(g.id)}" aria-pressed="${g.id===baseline?.id}" title="${esc(g.name)}：クリックで基準GPUを切替、Ctrl＋クリックで出典を開く、ダブルクリックで編集">${esc(displayGPUName(g.name))}</button>${g.id===baseline?.id?'<span class="baselineMark">基準</span>':''}`;
}
function openGPUSource(id) {
  const g=data.gpus.find(g=>g.id===id); if (!g) return;
  const url=gpuReferenceURL(g,selectedMetric().id,currentMode());
  if (url) window.open(url,'_blank','noopener,noreferrer');
}
function render() {
  const metric = selectedMetric(), baseline = data.gpus.find(g=>g.id===baselineId);
  const filters = {query:$('search').value, architecture:$('architecture').value, category:$('category').value,
    exactCC:$('exactCC').value, known:$('known').checked&&!!metric.id, metric:metric.id, ranges:tableUI.ranges};
  rows = tableUI.sortGPUs(selectGPUs(data.gpus,filters,sortKey,$('sortDirection').value,(gpu,id)=>tableUI.sortValue(gpu,id)));
  $('metricNote').textContent=(currentMode()==='nominal'?'公称値表示：公開仕様と、その仕様から算出した理論値を含みます。実測値は含みません。\n':'実測値表示：測定値・測定結果の集計値のみを表示します。\n')+(metric.conditions?`実測条件：${metric.conditions}`:metric.note||'同じ条件の数値を比較してください。');
  $('showHelp').title = $('metricNote').textContent;
  $('transpose').textContent = tableUI.transposed ? 'GPUを行に表示' : 'GPUを列に表示';
  $('transpose').setAttribute('aria-pressed',String(tableUI.transposed));
  const table = $('tableHead').closest('table'), cols = tableUI.visible;
  table.classList.toggle('transposed',tableUI.transposed);
  const direction = $('sortDirection').value;
  if (tableUI.transposed) {
    $('tableHead').innerHTML = '<th scope="col">比較項目 / GPU</th>' + rows.map(g=>`<th scope="col" data-gpu="${esc(g.id)}" class="gpuHeader ${g.id===baseline?.id?'baseline':''}">${tableUI.gpuHandle(g)}${gpuNameHTML(g,baseline)}</th>`).join('');
    $('tableBody').innerHTML = !rows.length ? '<tr><td class="empty">条件に一致するGPUがありません。絞り込みを変更してください。</td></tr>' : cols.map(c=>`<tr data-column="${esc(c.id)}">${tableUI.header(c,sortKey,direction)}${rows.map(g=>cellHTML(g,c,metric)).join('')}</tr>`).join('') || `<tr><td colspan="${rows.length+1}" class="empty">${!metric.id?'実測値は未登録です。実測定義を追加して測定結果を登録してください。':'「表示項目を編集」から比較する項目を選択してください。'}</td></tr>`;
  } else {
    $('tableHead').innerHTML = `<th scope="col"${sortKey==='name'&&!tableUI.manualOrder?` aria-sort="${direction==='asc'?'ascending':'descending'}"`:''}><button data-sort="name">GPU / 構成 ${sortKey==='name'&&!tableUI.manualOrder?(direction==='asc'?'↑':'↓'):'↕'}</button></th>` + cols.map(c=>tableUI.header(c,sortKey,direction)).join('');
    $('tableBody').innerHTML = rows.map(g=>`<tr data-gpu="${esc(g.id)}" class="${g.id===baseline?.id?'baseline':''}"><td>${tableUI.gpuHandle(g)}${gpuNameHTML(g,baseline)}</td>${cols.map(c=>cellHTML(g,c,metric)).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length+1}" class="empty">条件に一致するGPUがありません。絞り込みを変更してください。</td></tr>`;
  }
}

const basicFields = [
  ['id','GPU ID（重複不可）','text',true],['name','GPU名','text',true],
  ['architecture','世代（アーキテクチャ）','text',true],['category','カテゴリ（例：GeForce / Data Center）','text',true],
  ['cc','Compute Capability（CUDA非対応は空欄）','text'],['form_factor','構成（例：PCIe / SXM）','text',true],
  ['connection_type','接続形式（例：PCIe 4.0 x16 / SXM4）','text'],['cooling_type','冷却方式（例：アクティブ / パッシブ）','text'],
  ['board_variant','ボード仕様（例：Founders Edition）','text'],['slot_count','占有スロット数','number'],
  ['memory_gb','VRAM / 共有メモリ（GB）','number'],['bandwidth_gbs','メモリ帯域（GB/s）','number'],
  ['power_w','TDP / TGP（W）','number'],['price_jpy','価格（円）','number'],['purchase_url','購入リンク（価格のリンク先・1件）','url'],
  ['reference_url','GPU名から開く出典URL','url']
];
function fillEditor() {
  $('fields').innerHTML = basicFields.map(([key,label,type,required]) => `<label>${esc(label)}<input name="${key}" type="${type}" ${required ? 'required' : ''} ${type === 'number' ? 'min="0" step="any"' : ''} value="${esc(draft[key])}"></label>`).join('') +
    `<label class="wide">主な仕様出典URL<input name="spec_url" type="url" required value="${esc(draft.sources.find(s=>s.id === 'spec')?.url)}"></label><label>主な仕様出典名<input name="spec_title" required value="${esc(draft.sources.find(s=>s.id === 'spec')?.title || '仕様出典')}"></label><label>仕様の確認日<input name="spec_date" type="date" required value="${esc(draft.sources.find(s=>s.id === 'spec')?.checked_on || today())}"></label><label class="wide">構成・価格条件・仕様の注記<textarea name="notes" rows="3">${esc(draft.notes)}</textarea></label>` +
    `<div class="wide muted">登録済み出典：${draft.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} (${esc(s.checked_on)})</a>`).join(' / ') || 'なし'}</div>`;
  $('performanceFields').innerHTML = '<p class="muted wide">数値を変更・追加した項目は「公開値 / 主な仕様出典」として登録します。算出値や別の出典は詳細JSONで指定できます。</p>' + data.metrics.map(m => {
    const r = draft.performance[m.id];
    return `<label>${esc(m.name)} (${esc(m.unit)})<input data-performance="${esc(m.id)}" type="number" min="0" step="any" value="${esc(r?.value)}">${r?.note ? `<span class="sub">${esc(r.note)}</span>` : ''}</label>`;
  }).join('');
  $('resultFields').innerHTML = data.benchmarks.length ? data.benchmarks.map(b => {
    const record = draft.results[b.id], source = draft.sources.find(s => s.id === record?.source);
    return `<div class="wide"><label>${esc(b.name)} (${esc(b.unit)})<span class="sub">${esc(b.conditions)}</span><input data-result="${esc(b.id)}" type="number" min="0" step="any" value="${esc(record?.value)}"></label><label>この結果の出典URL（測定レポート等）<input data-result-source="${esc(b.id)}" type="url" value="${esc(source?.url)}"></label><label>結果の取得日<input data-result-date="${esc(b.id)}" type="date" value="${esc(source?.checked_on || today())}"></label></div>`;
  }).join('') : '<p class="muted wide">定義未登録。上部の「実測定義を追加」から追加してください。</p>';
  $('gpuJson').value = JSON.stringify(draft, null, 2);
}
function openEditor(id) {
  editingId = id || null;
  draft = id ? structuredClone(data.gpus.find(g => g.id === id)) : {id:'',name:'',architecture:'',category:'GeForce',cc:'',form_factor:'PCIe',memory_gb:null,bandwidth_gbs:null,power_w:null,price_jpy:null,purchase_url:null,notes:'',sources:[],performance:{},results:{}};
  $('editorTitle').textContent = id ? `${displayGPUName(draft.name)} を編集` : 'GPUを追加';
  $('deleteGpu').hidden = !id; $('editorError').textContent = '';
  fillEditor(); $('editor').showModal();
}
function readEditor() {
  const next = structuredClone(draft), form = new FormData($('gpuForm'));
  for (const [key,,type] of basicFields) next[key] = type === 'number' ? (form.get(key) === '' ? null : Number(form.get(key))) : type==='url' ? String(form.get(key)).trim()||null : String(form.get(key)).trim();
  for (const key of ['connection_type','cooling_type','board_variant']) if (!next[key]) next[key]=null;
  if (!next.cc) next.cc=null;
  next.notes = String(form.get('notes'));
  const spec = {id:'spec',title:String(form.get('spec_title')),url:String(form.get('spec_url')).trim(),checked_on:String(form.get('spec_date'))};
  next.sources = next.sources.filter(s => s.id !== 'spec'); next.sources.unshift(spec);
  $('performanceFields').querySelectorAll('[data-performance]').forEach(input => {
    const id = input.dataset.performance;
    if (input.value === '') delete next.performance[id];
    else if (next.performance[id]?.value !== Number(input.value)) next.performance[id] = {value:Number(input.value),source:'spec',kind:'published'};
  });
  for (const input of $('resultFields').querySelectorAll('[data-result]')) {
    const id = input.dataset.result, inputs = [...$('resultFields').querySelectorAll('[data-result-source]')];
    if (input.value === '') {delete next.results[id]; continue;}
    const sourceUrl = inputs.find(i=>i.dataset.resultSource === id).value.trim();
    const checked = [...$('resultFields').querySelectorAll('[data-result-date]')].find(i=>i.dataset.resultDate === id).value;
    const sourceId = `result:${id}`;
    if (!sourceUrl) throw new Error(`${id}: 結果の出典URLが必要です`);
    const unchanged = next.results[id]?.value === Number(input.value) && next.sources.find(s=>s.id === next.results[id]?.source)?.url === sourceUrl && next.sources.find(s=>s.id === next.results[id]?.source)?.checked_on === checked;
    if (!unchanged) {
      next.sources = next.sources.filter(s=>s.id !== sourceId);
      next.sources.push({id:sourceId,title:`実測結果: ${id}`,url:sourceUrl,checked_on:checked});
      next.results[id] = {value:Number(input.value),source:sourceId,kind:'measured'};
    }
  }
  return next;
}
function withGPU(gpu) {
  const next = structuredClone(data);
  const index = next.gpus.findIndex(g=>g.id === editingId);
  if (index < 0) next.gpus.push(gpu); else next.gpus[index] = gpu;
  return next;
}

for (const id of ['search','architecture','category','exactCC','known']) $(id).addEventListener('input', render);
$('valueMode').onchange=()=>{tableUI.setMode($('valueMode').value); refreshOptions(); sortKey=metricId; $('sortDirection').value=selectedMetric().direction==='lower'?'asc':'desc'; saveSelection(); render();};
$('sortDirection').addEventListener('input',()=>{tableUI.useSortedOrder(); saveSelection(); render();});
let baselineClickTimer;
function toggleBaseline(id) {
  baselineId=baselineId===id?'':id;
  if (baselineId && selectedMetric().type==='number') tableUI.ensure('ratio');
  saveSelection(); render();
}
for (const root of [$('tableHead'),$('tableBody')]) root.addEventListener('click',event=>{
  const price=event.target.closest('[data-cell="price_jpy"]');
  if (price) {event.preventDefault(); if (event.ctrlKey && event.detail<=1) openPurchaseLink(price.dataset.gpu); return;}
  const gpu=event.target.closest('[data-baseline]');
  if (gpu) {
    event.preventDefault(); clearTimeout(baselineClickTimer);
    if (event.ctrlKey) {if (event.detail<=1) openGPUSource(gpu.dataset.baseline); return;}
    // Keep the name in the DOM until a potential second click arrives.
    if (event.detail===0) toggleBaseline(gpu.dataset.baseline);
    else if (event.detail===1) baselineClickTimer=setTimeout(()=>toggleBaseline(gpu.dataset.baseline),400);
    return;
  }
  const button=event.target.closest('[data-sort]'); if (!button) return;
  const key=button.dataset.sort, column=tableUI.byId.get(key);
  const same=sortKey===key;
  if (column && key!=='ratio') metricId=key;
  $('sortDirection').value=same?($('sortDirection').value==='asc'?'desc':'asc'):(column?.direction==='lower'?'asc':'desc');
  sortKey=key; tableUI.useSortedOrder(); saveSelection(); render();
});
for (const root of [$('tableHead'),$('tableBody')]) {
  root.addEventListener('dblclick',event=>{
    const gpu=event.target.closest('[data-baseline]');
    if (gpu) {event.preventDefault(); clearTimeout(baselineClickTimer); if (!event.ctrlKey) openEditor(gpu.dataset.baseline); return;}
    const price=event.target.closest('[data-cell="price_jpy"]');
    if (price) {event.preventDefault(); if (!event.ctrlKey) editPurchaseLink(price.dataset.gpu);}
  });
  root.addEventListener('auxclick',event=>{if (event.target.closest('[data-cell="price_jpy"]')) event.preventDefault();});
  root.addEventListener('keydown',event=>{
    const price=event.target.closest('[data-cell="price_jpy"]');
    if (price && event.key==='Enter') {event.preventDefault(); if (event.ctrlKey) openPurchaseLink(price.dataset.gpu); else editPurchaseLink(price.dataset.gpu);}
  });
}
$('cancelPurchaseLink').onclick=()=>$('purchaseLinkDialog').close();
$('purchaseLinkDialog').addEventListener('close',()=>{purchaseGPUId=null;});
$('purchaseLinkForm').onsubmit=async event=>{
  event.preventDefault();
  const id=purchaseGPUId, submit=event.submitter;
  if (submit) submit.disabled=true;
  try {
    const next=structuredClone(data), gpu=next.gpus.find(g=>g.id===id);
    if (!gpu) return;
    gpu.purchase_url=$('purchaseLinkInput').value.trim()||null;
    await api('/api/validate',{data:next});
    if (!$('purchaseLinkDialog').open || purchaseGPUId!==id) return;
    data=next; markDirty(); refreshOptions(); render(); $('purchaseLinkDialog').close();
    toast('購入リンクを更新しました。「保存（Ctrl＋S）」で保存してください。');
    return true;
  } catch(error) {$('purchaseLinkError').textContent=error.message; return false;}
  finally {if (submit) submit.disabled=false;}
};
$('reset').onclick = () => {for(const id of ['search','architecture','category','exactCC']) $(id).value = ''; $('known').checked = false; tableUI.resetRanges(); render();};
$('add').onclick = () => openEditor();
$('showHelp').onclick = () => $('helpDialog').showModal();
$('closeHelp').onclick = () => $('helpDialog').close();
document.querySelector('label[for="importJson"]').addEventListener('keydown', event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); $('importJson').click();}});
$('closeEditor').onclick = () => $('editor').close();
$('gpuForm').onsubmit = async event => {
  event.preventDefault();
  try {
    const gpu = readEditor(), next = withGPU(gpu); await api('/api/validate', {data:next});
    const wasBase = baselineId === editingId, newId = gpu.id;
    data = next; markDirty(); refreshOptions(); if (wasBase) baselineId = newId; saveSelection();
    render(); $('editor').close(); toast('一覧に反映しました。「保存（Ctrl＋S）」で永続化します。');
    return true;
  } catch (error) {$('editorError').textContent = error.message; return false;}
};
$('toJson').onclick = () => {try {draft = readEditor(); $('gpuJson').value = JSON.stringify(draft,null,2); $('editorError').textContent = '';} catch(error) {$('editorError').textContent = error.message;}};
$('fromJson').onclick = async () => {try {const gpu = JSON.parse($('gpuJson').value); await api('/api/validate', {data:withGPU(gpu)}); draft = gpu; fillEditor(); $('editorError').textContent = ''; toast('JSONをフォームに適用しました。一覧に反映すると更新されます。');} catch(error) {$('editorError').textContent = error.message;}};
$('deleteGpu').onclick = () => {if (!confirm(`${displayGPUName(draft.name)} を一覧から削除しますか？`)) return; data.gpus = data.gpus.filter(g=>g.id !== editingId); markDirty(); refreshOptions(); render(); $('editor').close();};
let saving=false;
async function saveChanges() {
  if (saving || !data) return;
  saving=true;
  try {
    const form=[['editor','gpuForm'],['purchaseLinkDialog','purchaseLinkForm'],['benchmarkDialog','benchmarkForm']].find(([dialog])=>$(dialog).open)?.[1];
    if (form) {
      const element=$(form);
      if (!element.reportValidity()) return;
      const applied=await element.onsubmit({preventDefault(){},target:element,submitter:element.querySelector('button[type=submit]')});
      if (!applied) return;
    }
    const snapshot=dirty?JSON.stringify(data):null;
    const message=snapshot===null
      ?'表示設定と最後に手動で指定した並び順を保存しますか？'
      :staticHosting?'この端末のブラウザーに編集内容を上書き保存しますか？\n公開データや他の端末には反映されません。'
      :'data/gpus.json を現在の編集内容で上書き保存しますか？\n変更前の内容はバックアップされます。';
    if (!confirm(message)) return;
    tableUI.saveLayout(); tableUI.saveModeColumns();
    if (snapshot===null) {
      $('saveState').textContent='表示設定を保存済み';
      toast('最後に手動で指定した並び順・表示設定をブラウザーに保存しました。'); return;
    }
    $('save').disabled=true; $('saveState').textContent='保存中…';
    const result=await api('/api/data',{data:JSON.parse(snapshot),revision});
    revision=result.revision; dirty=snapshot!==JSON.stringify(data);
    $('saveState').textContent=dirty?'未保存の変更あり':staticHosting?'この端末に保存済み':'ファイルに保存済み';
    toast(staticHosting?'この端末のブラウザーに保存しました。別の端末へ移す場合はJSON出力を使ってください。':'data/gpus.json に保存しました。変更前のバックアップも作成しました。');
  } catch(error) {$('saveState').textContent='保存できませんでした'; toast(error.message);}
  finally {saving=false; $('save').disabled=false;}
}
$('save').onclick=saveChanges;
$('restorePublished').onclick=()=>{
  if (!catalog.published || !confirm('この端末で保存した編集内容を解除して、読み込み済みの公開データに戻しますか？\n必要な編集内容は、先にJSON出力で保存してください。')) return;
  try {
    const result=catalog.restorePublished(); data=result.data; revision=result.revision; dirty=false;
    refreshOptions(); render(); $('saveState').textContent='公開データを表示中';
    toast('この端末の編集を解除し、公開データに戻しました。');
  } catch(error) {toast(error.message);}
};
window.addEventListener('keydown',event=>{
  if (event.ctrlKey && !event.altKey && event.key.toLowerCase()==='s') {
    event.preventDefault();
    if (!event.repeat) void saveChanges();
  }
});
$('exportJson').onclick = () => download('gpus.json', JSON.stringify(data,null,2)+'\n', 'application/json;charset=utf-8');
$('importJson').onchange = async event => {
  try {const file = event.target.files[0]; if (!file) return; if (file.size > 5_000_000) throw new Error('上限は5 MBです'); const next = JSON.parse((await file.text()).replace(/^\uFEFF/,'')); await api('/api/validate', {data:next}); if (!confirm('表示中のデータを読み込んだJSONに置き換えますか？（ファイル保存前に確認できます）')) return; data = next; refreshOptions(); markDirty(); render(); toast('JSONを読み込みました。確認後にファイルへ保存してください。');} catch(error) {toast(`読込エラー: ${error.message}`);} finally {event.target.value = '';}
};
$('exportCsv').onclick = () => {
  const metric = selectedMetric(), baseline = data.gpus.find(g=>g.id === baselineId), cols = tableUI.visible;
  const exportValue = (g,c) => {
    const value=tableUI.value(g,c.id);
    if (value==null) return missingMetricMarker(viewGPU(g),c.id)==='x'?'x':null;
    return typeof value==='object'?JSON.stringify(value):value;
  };
  const records = rows.map(g=>{
    const gpu=viewGPU(g),record=gpu.performance[metric.id]||gpu.results[metric.id],source=gpu.sources.find(s=>s.id===record?.source)||gpu.sources[0];
    return [g.name,...cols.map(c=>exportValue(g,c)),record?.kind,source?.url,source?.checked_on,metric.conditions||metric.note,record?.note,gpu.notes,gpu.purchase_url];
  });
  if (tableUI.transposed) {
    const exportRows = [['比較項目 / GPU',...rows.map(g=>g.name)],...cols.map(c=>[columnLabel(c),...rows.map(g=>exportValue(g,c))])];
    exportRows.push(['比較指標',...rows.map(()=>columnLabel(metric))],['比較条件',...rows.map(()=>metric.conditions||metric.note||'')],['基準GPU',...rows.map(()=>baseline?.name||'')],['基準比の式',...rows.map(()=>metric.direction==='lower'?'基準値 / 候補値':'候補値 / 基準値')]);
    for (const [label,getter] of [['GPU ID',g=>g.id],['GPUメモ',g=>viewGPU(g).notes],['購入リンク',g=>viewGPU(g).purchase_url],['出典',g=>JSON.stringify(viewGPU(g).sources)],['値の種類',()=>currentMode()==='nominal'?'公称値':'実測値']]) exportRows.push([label,...rows.map(getter)]);
    download('gpu-comparison.csv',csv(exportRows),'text/csv;charset=utf-8'); return;
  }
  download('gpu-comparison.csv',csv([['GPU',...cols.map(c=>c.id==='ratio'?`${columnLabel(c)}: ${baseline?.name||'基準なし'}; ${metric.direction==='lower'?'基準/候補':'候補/基準'}`:columnLabel(c)),'選択指標の種別','選択指標の出典URL','確認日','指標条件','値の注記','GPUメモ','購入リンク'],...records]),'text/csv;charset=utf-8');
};
$('addBenchmark').onclick = () => {$('benchmarkError').textContent = ''; $('benchmarkDialog').showModal();};
$('closeBenchmark').onclick = () => $('benchmarkDialog').close();
$('benchmarkForm').onsubmit = async event => {
  event.preventDefault();
  try {const benchmark = Object.fromEntries(new FormData(event.target)); benchmark.id = benchmark.id.trim(); const next = structuredClone(data); next.benchmarks.push(benchmark); await api('/api/validate', {data:next}); data = next; markDirty(); tableUI.setMode('measured'); $('valueMode').value='measured'; refreshOptions(); metricId = benchmark.id; saveSelection(); sortKey = benchmark.id; tableUI.useSortedOrder(); tableUI.ensure(benchmark.id); if (baselineId) tableUI.ensure('ratio'); $('sortDirection').value = benchmark.direction === 'lower' ? 'asc' : 'desc'; saveSelection(); render(); $('benchmarkDialog').close(); event.target.reset(); toast('実測定義を追加しました。各GPUの編集画面から結果を入力できます。'); return true;} catch(error) {$('benchmarkError').textContent = error.message; return false;}
};
window.addEventListener('beforeunload', event => {if (dirty) {event.preventDefault(); event.returnValue = '';}});
try {
  const result = await catalog.load(); data = result.data; revision = result.revision;
  tableUI = new TableUI({getData:()=>({...data,gpus:data.gpus.map(viewGPU)}),getDefinitions:metricDefinitions,getMetric:selectedMetric,getBaseline:()=>data.gpus.find(g=>g.id===baselineId),getRows:()=>rows,getScopedGPU:viewGPU,onChange:render});
  refreshOptions(); render();
  $('saveState').textContent = staticHosting?(result.saved?(result.publicUpdated?'公開データ更新あり（端末の保存を表示中）':'この端末の保存を表示中'):'公開データを表示中'):'ファイルから読込済み';
  $('save').disabled=false; $('restorePublished').disabled=false;
  if (catalog.storageWarning) toast(catalog.storageWarning);
  else if (result.publicUpdated) toast('公開データが更新されています。この端末の編集は保持しています。「公開データに戻す」で最新版へ切り替えられます。');
} catch(error) {$('saveState').textContent = '読込エラー'; toast(staticHosting?`公開データを読み込めませんでした。再読み込みしてください。${error.message}`:`python server.py で起動し、http://127.0.0.1:8765 を開いてください。${error.message}`);}
