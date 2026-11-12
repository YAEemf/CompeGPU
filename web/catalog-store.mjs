// Static hosting uses browser storage; the local Python server keeps file storage.
export function validateCatalog(data) {
  const require=(condition,message)=>{if (!condition) throw new Error(message);};
  const nonempty=value=>typeof value==='string' && Boolean(value.trim());
  const number=value=>typeof value==='number' && Number.isFinite(value) && value>=0;
  const url=value=>{try {const parsed=new URL(value); return ['http:','https:'].includes(parsed.protocol) && Boolean(parsed.hostname);} catch {return false;}};
  require(data && typeof data==='object' && data.schema_version===1,'schema_version は 1 が必要です');
  require(Array.isArray(data.metrics) && data.metrics.length>0,'metrics が必要です');
  require(Array.isArray(data.benchmarks) && Array.isArray(data.gpus),'benchmarks / gpus は配列です');
  const metricIds=new Set(), benchIds=new Set(), gpuIds=new Set();
  const reserved=new Set(['name','cc','memory_gb','bandwidth_gbs','power_w','price_jpy','purchase_url','fp32_per_w','fp32_per_10k_jpy','ratio']);
  for (const [collection,ids] of [[data.metrics,metricIds],[data.benchmarks,benchIds]]) {
    for (const item of collection) {
      require(item && nonempty(item.id) && !ids.has(item.id) && !reserved.has(item.id) && !item.id.startsWith('field:'),'指標 ID が空欄・重複・予約済みです');
      ids.add(item.id);
      require(nonempty(item.name) && nonempty(item.unit),'指標名と単位が必要です');
      require(['higher','lower'].includes(item.direction),'direction は higher / lower です');
      if (collection===data.benchmarks) require(nonempty(item.conditions),'ベンチマークの条件が必要です');
    }
  }
  require(![...metricIds].some(id=>benchIds.has(id)),'理論指標と実測指標の ID は分けてください');
  for (const gpu of data.gpus) {
    require(gpu && nonempty(gpu.id) && !gpuIds.has(gpu.id),'GPU ID が空欄または重複しています'); gpuIds.add(gpu.id);
    for (const key of ['name','architecture','category','form_factor']) require(nonempty(gpu[key]),`${gpu.id}: ${key} が必要です`);
    require(gpu.cc==null || (typeof gpu.cc==='string' && /^\d+\.\d+$/.test(gpu.cc)),'CC は 8.9 のような文字列、CUDA非対応機種は null です');
    for (const key of ['memory_gb','bandwidth_gbs','power_w','price_jpy']) require(gpu[key]==null || number(gpu[key]),`${key} は非負の数値か null です`);
    for (const key of ['purchase_url','reference_url']) require(gpu[key]==null || gpu[key]==='' || url(gpu[key]),`${key} は http(s) URL を1件指定してください`);
    require(Array.isArray(gpu.sources),'sources は配列です');
    const sourceIds=new Set();
    for (const source of gpu.sources) {
      require(source && nonempty(source.id) && !sourceIds.has(source.id),'出典 ID が不正です'); sourceIds.add(source.id);
      require(nonempty(source.title) && url(source.url),'出典名と http(s) URL が必要です');
      const date=source.checked_on;
      require(typeof date==='string' && /^\d{4}-\d\d-\d\d$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date,'出典の確認日は YYYY-MM-DD です');
    }
    for (const [key,allowed] of [['performance',metricIds],['results',benchIds]]) {
      require(gpu[key] && typeof gpu[key]==='object' && !Array.isArray(gpu[key]),`${key} はオブジェクトです`);
      for (const [id,record] of Object.entries(gpu[key])) {
        require(allowed.has(id),`未定義の指標: ${id}`);
        require(record && number(record.value),`${id}: value は非負の数値です`);
        require(sourceIds.has(record.source),`${id}: 有効な source ID が必要です`);
        require((key==='results'?['measured','aggregate']:['published','derived','measured','aggregate']).includes(record.kind),`${id}: kind が不正です`);
      }
    }
  }
  require(new TextEncoder().encode(JSON.stringify(data)).length<=5_000_000,'ファイルサイズの上限は 5 MB です');
  return data;
}

export class CatalogStore {
  constructor({staticHosting=false, baseURL, storage, fetcher=globalThis.fetch.bind(globalThis)}={}) {
    this.staticHosting=staticHosting;
    this.baseURL=new URL(baseURL || './',globalThis.location?.href || 'http://localhost/');
    this.storage=storage;
    this.fetcher=fetcher;
    this.key=`gpu-compare.catalog.v1:${this.baseURL.pathname}`;
  }
  async request(path,body) {
    const response=await this.fetcher(new URL(path,this.baseURL),body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    let result;
    try {result=await response.json();} catch {throw new Error(`データを読み込めませんでした（HTTP ${response.status}）`);}
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }
  readSaved() {
    const raw=this.storage.getItem(this.key);
    if (!raw) return null;
    const saved=JSON.parse(raw);
    if (typeof saved.revision!=='string' || typeof saved.publicRevision!=='string') throw new Error('この端末の保存データ形式が不正です');
    validateCatalog(saved.data);
    return saved;
  }
  async load() {
    if (!this.staticHosting) return this.request('api/data');
    const published=validateCatalog(await this.request('data/gpus.json'));
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(published)));
    this.publicRevision='public-'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    this.published=published;
    let saved;
    try {saved=this.readSaved();} catch(error) {this.storageWarning=`端末の保存内容を読み込めないため公開データを表示します。${error.message}`;}
    return saved?{data:saved.data,revision:saved.revision,saved:true,publicUpdated:saved.publicRevision!==this.publicRevision}
      :{data:structuredClone(published),revision:this.publicRevision,saved:false};
  }
  async validate(data) {
    if (!this.staticHosting) return this.request('api/validate',{data});
    validateCatalog(data); return {ok:true};
  }
  async save(data,revision) {
    if (!this.staticHosting) return this.request('api/data',{data,revision});
    validateCatalog(data);
    const write=()=>{
      const current=this.readSaved();
      if ((current?.revision || this.publicRevision)!==revision) throw new Error('別の画面で保存内容が更新されています。JSONを出力してから再読込してください。');
      const next={data,revision:crypto.randomUUID(),publicRevision:this.publicRevision,savedAt:new Date().toISOString()};
      try {
        if (current) this.storage.setItem(this.key+':backup',JSON.stringify(current));
        this.storage.setItem(this.key,JSON.stringify(next));
      } catch {throw new Error('この端末に保存できませんでした。ブラウザの保存容量・設定を確認するか、JSON出力で保存してください。');}
      return {revision:next.revision};
    };
    return globalThis.navigator?.locks?globalThis.navigator.locks.request(this.key,async()=>write()):write();
  }
  restorePublished() {
    this.storage.removeItem(this.key);
    return {data:structuredClone(this.published),revision:this.publicRevision};
  }
}
