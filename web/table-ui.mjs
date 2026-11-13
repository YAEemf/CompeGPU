import {compareCC, speedup} from './model.mjs?v=20261112-precision-audit';
import {discoverColumns, cleanColumns, columnValue, moveColumn, DEFAULT_COLUMNS, GPU_DETAIL_COLUMNS, APU_COLUMNS, ACCELERATOR_COLUMNS, orderGPUs, mergeVisibleOrder} from './columns.mjs?v=20261112-precision-audit';
import {displayGPUName} from './gpu-name.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey = 'gpu-compare.visible-columns.v1';
const layoutKey = 'gpu-compare.layout.v1';
const modeColumnsKey = 'gpu-compare.columns-by-mode.v1';
export const columnLabel = c => `${c.name}${c.unit ? ` (${c.unit})` : ''}`;

export class TableUI {
  constructor({getData, getDefinitions, getMetric, getBaseline, getRows, getScopedGPU, onChange}) {
    Object.assign(this, {getData, getDefinitions, getMetric, getBaseline, getRows, getScopedGPU, onChange});
    try {this.saved = JSON.parse(localStorage.getItem(storageKey));} catch {this.saved = null;}
    let layout;
    try {layout = JSON.parse(localStorage.getItem(layoutKey));} catch {layout = null;}
    this.mode = layout?.mode==='measured'?'measured':'nominal';
    try {this.modeSelections=JSON.parse(localStorage.getItem(modeColumnsKey)) || {};} catch {this.modeSelections={};}
    if (!this.modeSelections || typeof this.modeSelections!=='object' || Array.isArray(this.modeSelections)) this.modeSelections={};
    if (!Array.isArray(this.modeSelections.nominal) && Array.isArray(this.saved)) this.modeSelections.nominal=this.saved;
    this.saved=this.modeSelections[this.mode] ?? null;
    this.addPriceColumn=true;
    try {this.addPriceColumn=localStorage.getItem('gpu-compare.price-column.v1')!=='true';} catch {}
    this.addDetailColumns=true;
    try {this.addDetailColumns=localStorage.getItem('gpu-compare.detail-columns.v1')!=='true';} catch {}
    this.addAPUColumns=true;
    try {this.addAPUColumns=localStorage.getItem('gpu-compare.apu-columns.v1')!=='true';} catch {}
    this.addAcceleratorColumns=true;
    try {this.addAcceleratorColumns=localStorage.getItem('gpu-compare.accelerator-columns.v1')!=='true';} catch {}
    this.addAcceleratorMeasurements=true;
    try {this.addAcceleratorMeasurements=localStorage.getItem('gpu-compare.accelerator-measurements.v1')!=='true';} catch {}
    this.addPrecisionAuditResults=true;
    try {this.addPrecisionAuditResults=localStorage.getItem('gpu-compare.precision-audit-results.v1')!=='true';} catch {}
    this.addNewDeviceResults=true;
    try {this.addNewDeviceResults=localStorage.getItem('gpu-compare.5070ti-mi100-mi210-results.v1')!=='true';} catch {}
    $('valueMode').value=this.mode;
    this.transposed = layout?.transposed !== false;
    this.gpuOrder = Array.isArray(layout?.gpuOrder) ? layout.gpuOrder.filter(id=>typeof id==='string') : [];
    // Sorting is temporary. Restore the last explicit manual order, including
    // orders saved by older versions while the user was viewing a sort.
    this.manualOrder = this.gpuOrder.length > 0 || layout?.manualOrder === true;
    $('transpose').onclick = () => {this.transposed = !this.transposed; this.saveLayout(); this.onChange();};
    $('gpuOrderMode').value = this.manualOrder ? 'manual' : 'sorted';
    $('gpuOrderMode').onchange = () => {
      this.manualOrder = $('gpuOrderMode').value === 'manual';
      this.saveLayout(); this.onChange();
    };
    this.rangeIds = ['cc','memory_gb','power_w']; this.ranges = {}; this.columns = []; this.selected = [];
    $('showColumns').onclick = () => {this.renderColumns(); $('columnsDialog').showModal();};
    $('closeColumns').onclick = () => $('columnsDialog').close();
    $('defaultColumns').onclick = () => {this.selected = cleanColumns(this.mode==='measured'?this.getDefinitions().map(m=>m.id):this.nominalDefaults(),this.columns); this.changed();};
    $('clearColumns').onclick = () => {this.selected = []; this.changed();};
    $('columnSearch').oninput = () => this.renderAvailable();
    $('availableColumns').onchange = event => {
      const input = event.target.closest('[data-column-choice]'); if (!input) return;
      const id = input.dataset.columnChoice;
      if (input.checked) this.ensure(id, false); else this.selected = this.selected.filter(key=>key !== id);
      this.changed();
    };
    $('selectedColumns').onclick = event => {
      const button = event.target.closest('[data-move]'); if (!button) return;
      const index = this.selected.indexOf(button.dataset.id), delta = Number(button.dataset.move);
      const target = this.selected[index+delta];
      if (target) {this.selected = moveColumn(this.selected, button.dataset.id, target); this.changed();}
    };
    this.dragging = null;
    for (const root of [$('tableHead'), $('tableBody'), $('selectedColumns')]) {
      root.addEventListener('dragstart', event => {
        const handle = event.target.closest('[data-drag-column], [data-drag-gpu]'); if (!handle) return;
        this.dragging = {kind:handle.hasAttribute('data-drag-gpu')?'gpu':'column',id:handle.dataset.dragGpu ?? handle.dataset.dragColumn};
        event.dataTransfer.setData('text/plain',JSON.stringify(this.dragging)); event.dataTransfer.effectAllowed = 'move';
      });
      root.addEventListener('dragover', event => {
        if (!this.dragging) return;
        const target = event.target.closest(this.dragging.kind==='gpu'?'[data-gpu]':'[data-column]'); if (!target) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
        root.querySelectorAll('.dropTarget').forEach(el=>el.classList.remove('dropTarget'));
        target.classList.add('dropTarget');
      });
      root.addEventListener('drop', event => {
        const target = this.dragging && event.target.closest(this.dragging.kind==='gpu'?'[data-gpu]':'[data-column]');
        if (!this.dragging || !target) return;
        event.preventDefault();
        if (this.dragging.kind==='gpu') {
          this.updateGPUOrder(moveColumn(this.getRows().map(g=>g.id),this.dragging.id,target.dataset.gpu));
          this.manualOrder = true; $('gpuOrderMode').value = 'manual'; this.saveLayout();
        } else this.selected = moveColumn(this.selected,this.dragging.id,target.dataset.column);
        this.dragging = null; this.changed();
      });
      root.addEventListener('dragend', () => {this.dragging = null; root.querySelectorAll('.dropTarget').forEach(el=>el.classList.remove('dropTarget'));});
    }
    for (const root of [$('tableHead'),$('tableBody')]) root.addEventListener('keydown',event=>{
      const handle = event.target.closest('[data-drag-gpu]');
      if (!handle || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const ids = this.getRows().map(g=>g.id), index = ids.indexOf(handle.dataset.dragGpu);
      const target = ids[index + (['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)];
      if (!target) return;
      const id = handle.dataset.dragGpu;
      this.updateGPUOrder(moveColumn(ids,id,target)); this.manualOrder = true;
      $('gpuOrderMode').value = 'manual'; this.saveLayout(); this.onChange();
      [...document.querySelectorAll('[data-drag-gpu]')].find(el=>el.dataset.dragGpu===id)?.focus();
    });
    document.querySelector('.tableWrap').addEventListener('dragover', event => {
      if (!this.dragging) return;
      const wrap = event.currentTarget, box = wrap.getBoundingClientRect();
      if (event.clientX > box.right-45) wrap.scrollLeft += 24;
      if (event.clientX < box.left+45) wrap.scrollLeft -= 24;
      if (event.clientY > box.bottom-45) wrap.scrollTop += 24;
      if (event.clientY < box.top+45) wrap.scrollTop -= 24;
    });
    $('addRange').onclick = () => {
      const id = $('rangeMetric').value;
      if (!id) return;
      if (!this.rangeIds.includes(id)) this.rangeIds.push(id);
      this.renderRanges();
      [...$('rangeFilters').querySelectorAll('[data-range-id]')].find(el=>el.dataset.rangeId === id)?.querySelector('input').focus();
    };
    $('rangeFilters').oninput = event => {
      const input = event.target.closest('[data-bound]'), group = input?.closest('[data-range-id]');
      if (!group) return;
      const [min,max] = group.querySelectorAll('input'), range = {min:min.value,max:max.value};
      this.ranges[group.dataset.rangeId] = range;
      const message = this.rangeError(group.dataset.rangeId, range, min.validity.badInput || max.validity.badInput);
      range.invalid = !!message;
      group.querySelector('.rangeError').textContent = message;
      min.setAttribute('aria-invalid', String(!!message)); max.setAttribute('aria-invalid', String(!!message));
      this.onChange();
    };
    $('rangeFilters').onclick = event => {
      const button = event.target.closest('[data-remove-range]'); if (!button) return;
      const id = button.dataset.removeRange;
      delete this.ranges[id]; this.rangeIds = this.rangeIds.filter(key=>key !== id);
      this.renderRanges(); this.onChange();
    };
  }
  saveLayout() {
    try {localStorage.setItem(layoutKey,JSON.stringify({transposed:this.transposed,manualOrder:this.gpuOrder.length>0 || this.manualOrder,gpuOrder:this.gpuOrder,mode:this.mode}));} catch {}
  }
  setMode(mode) {
    this.modeSelections[this.mode]=[...this.selected];
    this.modeRanges ??= {};
    this.modeRanges[this.mode]={ranges:this.ranges,ids:this.rangeIds};
    this.mode=mode;
    this.saved=this.modeSelections[mode] ?? null;
    this.ranges=this.modeRanges[mode]?.ranges || {};
    this.rangeIds=this.modeRanges[mode]?.ids || (mode==='nominal'?['cc','memory_gb','power_w']:[]);
    this.saveLayout(); this.saveModeColumns();
  }
  saveModeColumns() {try {localStorage.setItem(modeColumnsKey,JSON.stringify(this.modeSelections));} catch {}}
  updateGPUOrder(visibleOrder) {
    const all = orderGPUs(this.getData().gpus,this.gpuOrder).map(g=>g.id);
    this.gpuOrder = mergeVisibleOrder(all,visibleOrder);
  }
  sortGPUs(gpus) {return this.manualOrder ? orderGPUs(gpus,orderGPUs(this.getData().gpus,this.gpuOrder).map(g=>g.id)) : gpus;}
  useSortedOrder() {this.manualOrder=false; $('gpuOrderMode').value='sorted'; this.saveLayout();}
  gpuHandle(gpu) {return `<span class="dragHandle" draggable="true" tabindex="0" role="button" data-drag-gpu="${esc(gpu.id)}" title="ドラッグ・矢印キーでGPUを移動" aria-label="${esc(displayGPUName(gpu.name))}の順序を変更">⠿</span>`;}
  hasAccelerators() {return this.getData().gpus.some(g=>g.category==='AI Accelerator' || g.architecture?.startsWith('CDNA'));}
  nominalDefaults() {return [...DEFAULT_COLUMNS,...(this.getData().gpus.some(g=>g.category==='APU')?APU_COLUMNS:[]),...(this.hasAccelerators()?ACCELERATOR_COLUMNS:[])];}
  refresh() {
    this.columns = discoverColumns(this.getData().gpus, this.getDefinitions(),{includeCC:this.mode!=='measured'});
    this.byId = new Map(this.columns.map(c=>[c.id,c]));
    this.selected = cleanColumns(this.saved ?? (this.mode==='measured'?this.getDefinitions().map(m=>m.id):this.nominalDefaults()), this.columns);
    if (this.mode==='nominal' && this.addPriceColumn && this.byId.has('price_jpy')) {
      if (!this.selected.includes('price_jpy')) this.selected.push('price_jpy');
      this.saved=[...this.selected]; this.modeSelections.nominal=[...this.selected]; this.saveModeColumns();
      this.addPriceColumn=false;
      try {localStorage.setItem('gpu-compare.price-column.v1','true');} catch {}
    }
    if (this.mode==='nominal' && this.addDetailColumns) {
      for (const id of GPU_DETAIL_COLUMNS) if (this.byId.has(id) && !this.selected.includes(id)) this.selected.push(id);
      this.saved=[...this.selected]; this.modeSelections.nominal=[...this.selected]; this.saveModeColumns();
      this.addDetailColumns=false;
      try {localStorage.setItem('gpu-compare.detail-columns.v1','true');} catch {}
    }
    if (this.mode==='nominal' && this.addAPUColumns && this.getData().gpus.some(g=>g.category==='APU')) {
      for (const id of APU_COLUMNS) if (this.byId.has(id) && !this.selected.includes(id)) this.selected.push(id);
      this.saved=[...this.selected]; this.modeSelections.nominal=[...this.selected]; this.saveModeColumns();
      this.addAPUColumns=false;
      try {localStorage.setItem('gpu-compare.apu-columns.v1','true');} catch {}
    }
    if (this.mode==='nominal' && this.addAcceleratorColumns && this.hasAccelerators()) {
      for (const id of ACCELERATOR_COLUMNS) if (this.byId.has(id) && !this.selected.includes(id)) this.selected.push(id);
      this.saved=[...this.selected]; this.modeSelections.nominal=[...this.selected]; this.saveModeColumns();
      this.addAcceleratorColumns=false;
      try {localStorage.setItem('gpu-compare.accelerator-columns.v1','true');} catch {}
    }
    if (this.mode==='measured' && this.addAcceleratorMeasurements && this.hasAccelerators()) {
      const ids=this.getData().gpus.filter(g=>g.category==='AI Accelerator' || g.architecture?.startsWith('CDNA')).flatMap(g=>Object.keys(g.results || {}));
      for (const id of ids) if (this.byId.has(id) && !this.selected.includes(id)) this.selected.push(id);
      this.saved=[...this.selected]; this.modeSelections.measured=[...this.selected]; this.saveModeColumns();
      this.addAcceleratorMeasurements=false;
      try {localStorage.setItem('gpu-compare.accelerator-measurements.v1','true');} catch {}
    }
    const precisionIds=Object.keys(this.getData().gpus.find(g=>g.id==='intel-gaudi2-hl225h')?.results || {}).filter(id=>id.startsWith('gaudi124_fp16_gemm_'));
    if (this.mode==='measured' && this.addPrecisionAuditResults && precisionIds.length) {
      for (const id of precisionIds) if (this.byId.has(id) && !this.selected.includes(id)) this.selected.push(id);
      this.saved=[...this.selected]; this.modeSelections.measured=[...this.selected]; this.saveModeColumns();
      this.addPrecisionAuditResults=false;
      try {localStorage.setItem('gpu-compare.precision-audit-results.v1','true');} catch {}
    }
    const newDeviceResults=this.getData().gpus.filter(g=>['rtx5070ti','amd-instinct-mi100','amd-instinct-mi210'].includes(g.id)).flatMap(g=>Object.keys(g.results || {}));
    if (this.mode==='measured' && this.addNewDeviceResults && newDeviceResults.length) {
      for (const id of newDeviceResults) if (this.byId.has(id) && !this.selected.includes(id)) this.selected.push(id);
      this.saved=[...this.selected]; this.modeSelections.measured=[...this.selected]; this.saveModeColumns();
      this.addNewDeviceResults=false;
      try {localStorage.setItem('gpu-compare.5070ti-mi100-mi210-results.v1','true');} catch {}
    }
    this.rangeIds = this.rangeIds.filter(id=>this.byId.has(id));
    for (const id of Object.keys(this.ranges)) if (!this.byId.has(id)) delete this.ranges[id];
    const old = $('rangeMetric').value;
    $('rangeMetric').innerHTML = this.columns.filter(c=>['number','cc'].includes(c.type)).map(c=>`<option value="${esc(c.id)}">${esc(columnLabel(c))}</option>`).join('');
    if (this.byId.has(old)) $('rangeMetric').value = old;
    this.renderRanges(); this.renderColumns();
  }
  get visible() {return this.selected.map(id=>this.byId.get(id)).filter(Boolean);}
  value(gpu,id) {
    if (id === 'ratio') {
      const metric = this.getMetric(), baseline = this.getBaseline();
      if (!metric || metric.type!=='number' || metric.comparable===false || ['ai_tops','ratio'].includes(metric.id) || !baseline) return null;
      return speedup(this.value(gpu,metric.id),this.value(baseline,metric.id),metric.direction);
    }
    return columnValue(this.getScopedGPU(gpu),this.byId.get(id));
  }
  sortValue(gpu,id) {const value = this.value(gpu,id); return value && typeof value === 'object' ? JSON.stringify(value) : value;}
  ensure(id, notify=true) {
    if (this.byId.has(id) && !this.selected.includes(id)) {this.selected.push(id); if (notify) this.changed();}
  }
  changed() {
    this.saved = [...this.selected];
    this.modeSelections[this.mode]=[...this.selected]; this.saveModeColumns();
    if (this.mode==='nominal') try {localStorage.setItem(storageKey,JSON.stringify(this.saved));} catch {}
    this.renderColumns(); this.onChange();
  }
  renderColumns() {
    $('selectedColumns').innerHTML = this.visible.map((c,index)=>`<li data-column="${esc(c.id)}"><span class="dragHandle" draggable="true" data-drag-column="${esc(c.id)}" title="ドラッグで項目を移動">⠿</span><span class="columnName">${esc(columnLabel(c))}</span><button data-id="${esc(c.id)}" data-move="-1" ${index===0?'disabled':''} aria-label="${esc(c.name)}を前へ">↑</button><button data-id="${esc(c.id)}" data-move="1" ${index===this.visible.length-1?'disabled':''} aria-label="${esc(c.name)}を後ろへ">↓</button></li>`).join('');
    this.renderAvailable();
  }
  renderAvailable() {
    const query = $('columnSearch').value.toLowerCase();
    $('availableColumns').innerHTML = this.columns.filter(c=>`${c.id} ${columnLabel(c)}`.toLowerCase().includes(query)).map(c=>`<label class="columnChoice"><input type="checkbox" data-column-choice="${esc(c.id)}" ${this.selected.includes(c.id)?'checked':''}><span>${esc(columnLabel(c))}</span></label>`).join('');
  }
  rangeError(id,range,badInput=false) {
    const cc = id === 'cc', bounds = [range.min,range.max].filter(v=>v !== '');
    if (badInput || bounds.some(v=>cc ? !/^\d+\.\d+$/.test(v) : !Number.isFinite(Number(v)))) return cc ? 'CCは8.9の形式で入力してください' : '有効な数値を入力してください';
    if (range.min !== '' && range.max !== '' && (cc ? compareCC(range.min,range.max)>0 : Number(range.min)>Number(range.max))) return '下限は上限以下にしてください';
    return '';
  }
  renderRanges() {
    $('rangeFilters').innerHTML = this.rangeIds.map(id=>{
      const c = this.byId.get(id), range = this.ranges[id] || {min:'',max:''};
      return `<div class="rangeGroup" data-range-id="${esc(id)}"><div class="rangeTitle"><span>${esc(columnLabel(c))}</span><button data-remove-range="${esc(id)}" aria-label="${esc(c.name)}の範囲を解除">×</button></div><div class="rangeBounds">${['min','max'].map(bound=>`<label>${bound==='min'?'以上':'以下'}<input data-bound="${bound}" type="${id==='cc'?'text':'number'}" ${id==='cc'?'inputmode="decimal"':'step="any"'} value="${esc(range[bound])}" placeholder="制限なし" aria-label="${esc(columnLabel(c))} ${bound==='min'?'以上':'以下'}"></label>`).join('')}</div><p class="rangeError error" role="alert">${esc(this.rangeError(id,range))}</p></div>`;
    }).join('');
  }
  resetRanges() {this.ranges = {}; this.rangeIds = this.mode==='nominal'?['cc','memory_gb','power_w']:[]; this.renderRanges();}
  header(c, sortKey, direction) {
    const selected=c.id===this.getMetric().id;
    return `<th scope="${this.transposed?'row':'col'}" data-column="${esc(c.id)}" class="${selected?'selectedMetric':''}"${c.id===sortKey&&!this.manualOrder?` aria-sort="${direction==='asc'?'ascending':'descending'}"`:''}><span class="dragHandle" draggable="true" data-drag-column="${esc(c.id)}" title="ドラッグで項目を移動" aria-label="${esc(c.name)}を移動">⠿</span><button data-sort="${esc(c.id)}" aria-pressed="${selected}" title="クリックで比較指標に選択、再クリックで昇降順を切替">${esc(columnLabel(c))} ${c.id===sortKey&&!this.manualOrder?(direction==='asc'?'↑':'↓'):'↕'}</button></th>`;
  }
}
