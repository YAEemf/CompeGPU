import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CatalogStore,validateCatalog} from '../web/catalog-store.mjs';

const original=JSON.parse(readFileSync(new URL('../data/gpus.json',import.meta.url),'utf8'));
class Storage {
  values=new Map();
  getItem(key) {return this.values.get(key)??null;}
  setItem(key,value) {this.values.set(key,value);}
  removeItem(key) {this.values.delete(key);}
}
const fixture=(storage=new Storage(),published=original)=>new CatalogStore({
  staticHosting:true,storage,baseURL:'https://example.github.io/CompeGPU/',
  fetcher:async url=>{assert.equal(url.pathname,'/CompeGPU/data/gpus.json'); return {ok:true,json:async()=>structuredClone(published)};},
});
test('the published mixed-vendor catalog passes browser validation; invalid imported values fail',()=>{
  validateCatalog(original);
  for (const change of [d=>d.gpus[0].memory_gb=-1,d=>d.gpus[0].cc=8.9,
    d=>d.gpus[0].sources[0].url='javascript:alert(1)',d=>d.gpus[0].sources[0].checked_on='2026-02-30',
    d=>d.metrics.push(d.metrics[0]),d=>d.gpus[0].results.unknown={value:1,source:'spec',kind:'measured'}]) {
    const data=structuredClone(original); change(data); assert.throws(()=>validateCatalog(data));
  }
});
test('static save persists on one browser, checks revisions and preserves published data separately',async()=>{
  const storage=new Storage(), store=fixture(storage), loaded=await store.load();
  assert.equal(loaded.data.gpus.length,original.gpus.length); assert.equal(loaded.saved,false);
  const other=fixture(storage), stale=await other.load();
  loaded.data.gpus[0].price_jpy=12345;
  const saved=await store.save(loaded.data,loaded.revision);
  assert.notEqual(saved.revision,loaded.revision);
  await assert.rejects(()=>other.save(stale.data,stale.revision),/別の画面/);
  const reopened=await fixture(storage).load();
  assert.equal(reopened.saved,true); assert.equal(reopened.data.gpus[0].price_jpy,12345);
  assert.equal(store.published.gpus[0].price_jpy,original.gpus[0].price_jpy);
  const restored=store.restorePublished();
  assert.equal(restored.data.gpus[0].price_jpy,original.gpus[0].price_jpy);
  assert.equal((await fixture(storage).load()).saved,false);
});
test('a new deployment preserves saved edits and signals an updated public catalog',async()=>{
  const storage=new Storage(), store=fixture(storage), loaded=await store.load();
  await store.save(loaded.data,loaded.revision);
  const changed=structuredClone(original); changed.research_date='2026-11-14';
  const reopened=fixture(storage,changed), result=await reopened.load();
  assert.equal(result.publicUpdated,true); assert.equal(result.data.research_date,original.research_date);
  assert.equal(reopened.restorePublished().data.research_date,'2026-11-14');
});
test('corrupt or blocked browser storage leaves public viewing available',async()=>{
  const storage=new Storage(),store=fixture(storage);
  storage.setItem(store.key,'invalid JSON');
  assert.equal((await store.load()).saved,false); assert.ok(store.storageWarning);
  const blocked=fixture({getItem(){throw new Error('blocked');}});
  const loaded=await blocked.load(); assert.equal(loaded.data.gpus.length,original.gpus.length);
  const quota=fixture({getItem(){return null;},setItem(){throw new Error('quota');}});
  const initial=await quota.load(); await assert.rejects(()=>quota.save(initial.data,initial.revision),/保存できません/);
});
test('local mode keeps the Python API and file revision contract',async()=>{
  const calls=[];
  const store=new CatalogStore({baseURL:'http://127.0.0.1:8765/',fetcher:async(url,options)=>{
    calls.push([url.pathname,options]); return {ok:true,json:async()=>({data:original,revision:'server-revision'})};
  }});
  await store.load(); await store.validate(original); await store.save(original,'old-revision');
  assert.deepEqual(calls.map(c=>c[0]),['/api/data','/api/validate','/api/data']);
  assert.equal(JSON.parse(calls[2][1].body).revision,'old-revision');
});
