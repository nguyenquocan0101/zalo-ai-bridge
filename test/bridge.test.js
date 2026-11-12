import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseVietnamDateTime,nextDaily} from '../src/time.js';
import {Store} from '../src/store.js';
import {BridgeService,validateSchedule} from '../src/service.js';
import {generateText} from '../src/ai.js';

test('lịch 7h theo giờ Việt Nam và kiểm tra ngày sai',()=>{
  assert.equal(new Date(parseVietnamDateTime('2026-11-12T07:00')).toISOString(),'2026-11-12T00:00:00.000Z');
  assert.equal(new Date(nextDaily('07:00',Date.parse('2026-11-12T00:00:00Z'))).toISOString(),'2026-11-13T00:00:00.000Z');
  assert.throws(()=>parseVietnamDateTime('2026-02-30T07:00'));
  assert.throws(()=>validateSchedule({recipient:'abc',content:'hi',recurrence:'daily',time:'07:00'}));
});
test('lịch gửi một lần thực thi đúng một lần, lịch hằng ngày được chuyển sang ngày sau',async()=>{
  const store=new Store(':memory:'); const calls=[]; const service=new BridgeService(store,{send:async (id,text)=>{calls.push([id,text]);return 'zalo-1';}},{});
  const due=Date.now()-1000;
  store.createSchedule({recipient:'123',label:'A',mode:'text',content:'Chào',recurrence:'once',nextAt:due});
  store.createSchedule({recipient:'456',label:'B',mode:'text',content:'Sáng',recurrence:'daily',time:'07:00',nextAt:due});
  await service.tick(); await service.tick();
  assert.deepEqual(calls,[['123','Chào'],['456','Sáng']]);
  const schedules=store.schedules();assert.equal(schedules.find(s=>s.recipient==='123').active,0);assert.ok(schedules.find(s=>s.recipient==='456').next_at>Date.now());
  assert.deepEqual(store.messages().map(m=>m.status),['sent','sent']);store.close();
});
test('gián đoạn khi đang gửi được đánh dấu không chắc chắn và không gửi lại',()=>{
  const dir=mkdtempSync(join(tmpdir(),'zalo-bridge-')); const file=join(dir,'db');
  try{const first=new Store(file);first.addMessage('123','text','Chào');first.close();const second=new Store(file);assert.equal(second.messages()[0].status,'unknown');second.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('lỗi sau khi thử gửi được ghi là không chắc chắn',async()=>{
  const store=new Store(':memory:');const svc=new BridgeService(store,{send:async()=>{throw Error('timeout');}},{});
  const result=await svc.send({recipient:'123',content:'Chào'});assert.equal(result.status,'unknown');assert.equal(store.messages()[0].status,'unknown');store.close();
});
test('lịch đến hạn được giữ lại khi Zalo đang mất kết nối',async()=>{
  const store=new Store(':memory:');let connected=false;let count=0;
  const svc=new BridgeService(store,{status:()=>({status:connected?'connected':'disconnected'}),send:async()=>{count++;return '1';}},{});
  store.createSchedule({recipient:'123',label:'',mode:'text',content:'Chào',recurrence:'once',nextAt:Date.now()-1000});
  await svc.tick();assert.equal(store.messages().length,0);assert.equal(store.schedules()[0].active,1);
  connected=true;await svc.tick();assert.equal(count,1);assert.equal(store.messages()[0].status,'sent');store.close();
});
test('AI dùng Chat Completions với cấu hình đã chọn',async()=>{
  const original=globalThis.fetch;let observed;
  globalThis.fetch=async (url,options)=>{observed={url:String(url),...options};return new Response(JSON.stringify({choices:[{message:{content:'Xin chào'}}]}),{status:200,headers:{'content-type':'application/json'}});};
  try{assert.equal(await generateText({baseUrl:'https://example.test/v1',model:'ag/model',apiKey:'test-key'},'lời chào'),'Xin chào');assert.equal(observed.url,'https://example.test/v1/chat/completions');assert.equal(JSON.parse(observed.body).model,'ag/model');}finally{globalThis.fetch=original;}
});
