import 'dotenv/config';
import Fastify from 'fastify';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Store} from './store.js';
import {ZaloConnection} from './zalo.js';
import {BridgeService,validateSchedule} from './service.js';
import {generateText} from './ai.js';

const key=process.env.BRIDGE_API_KEY || '';
const encryptionKey=process.env.CREDENTIALS_KEY || '';
if (key.length<32 || !/^[0-9a-f]{64}$/i.test(encryptionKey)) throw new Error('Cần BRIDGE_API_KEY (tối thiểu 32 ký tự) và CREDENTIALS_KEY (64 ký tự hex). Xem README.');
await mkdir('data',{recursive:true});
const store=new Store('data/bridge.sqlite');
const zalo=new ZaloConnection('data/zalo-session.enc',Buffer.from(encryptionKey,'hex'));
const ai={baseUrl:process.env.AI_BASE_URL || '',model:process.env.AI_MODEL || '',apiKey:process.env.AI_API_KEY || ''};
const service=new BridgeService(store,zalo,ai);
const app=Fastify({logger:{level:'info'},bodyLimit:32768});
// The browser receives a short-lived dashboard token, never the external API key.
// Anyone who can reach the dashboard has access: bind locally or protect the host upstream.
const dashboardToken=randomBytes(32).toString('base64url');
app.get('/',async (_req,reply)=>{
  const html=await readFile(fileURLToPath(new URL('../public/dashboard/index.html',import.meta.url)),'utf8');
  return reply.type('text/html; charset=utf-8').header('Cache-Control','no-store').send(html.replace('__DASHBOARD_TOKEN__',dashboardToken));
});
app.get('/assets/:file',async(req,reply)=>{
  const file=req.params.file;
  if (!/^[a-zA-Z0-9_-]+\.(js|css)$/.test(file)) return reply.code(404).send();
  try { return reply.type(file.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8').send(await readFile(fileURLToPath(new URL('../public/dashboard/assets/'+file,import.meta.url)))); }
  catch { return reply.code(404).send(); }
});
app.addHook('onRequest',async (req,reply)=>{
  if(!req.url.startsWith('/api/')) return;
  const given=Buffer.from(req.headers.authorization?.replace(/^Bearer /,'') || '');
  const valid=[key,dashboardToken].some(secret=>{const expected=Buffer.from(secret); return given.length===expected.length && timingSafeEqual(given,expected);});
  if(!valid) return reply.code(401).send({error:'Không có quyền truy cập'});
  reply.header('Cache-Control','no-store');
});
app.setErrorHandler((err,_req,reply)=>{ app.log.error({message:err.message},'request failed'); reply.code(err.statusCode || 400).send({error:err.message}); });
app.get('/api/status',async()=>({...zalo.status(),ai:{configured:!!(ai.baseUrl&&ai.apiKey&&ai.model),model:ai.model,baseUrl:ai.baseUrl}}));
app.post('/api/zalo/login',async()=>{zalo.startLogin(); return zalo.status();});
app.get('/api/contacts',async()=>zalo.friends());
app.get('/api/schedules',async()=>store.schedules());
app.post('/api/schedules',async(req,reply)=>{const id=store.createSchedule(validateSchedule(req.body)); return reply.code(201).send({id:Number(id)});});
app.patch('/api/schedules/:id',async(req,reply)=>{if(typeof req.body?.active!=='boolean') throw new Error('Trạng thái không hợp lệ'); if(!store.toggle(Number(req.params.id),req.body.active)) return reply.code(404).send({error:'Không tìm thấy lịch'}); return {ok:true};});
app.delete('/api/schedules/:id',async(req,reply)=>{if(!store.deleteSchedule(Number(req.params.id))) return reply.code(404).send({error:'Không tìm thấy lịch'}); return {ok:true};});
app.get('/api/messages',async()=>store.messages());
app.post('/api/messages',async(req,reply)=>{const result=await service.send(req.body); return reply.code(result.status==='sent'?201:502).send(result);});
app.post('/api/ai/generate',async(req)=>{if(typeof req.body?.prompt!=='string' || !req.body.prompt.trim() || req.body.prompt.length>4000) throw new Error('Yêu cầu cho AI không hợp lệ'); return {content:await generateText(ai,req.body.prompt)};});
await zalo.restore();
await app.listen({host:process.env.HOST || '127.0.0.1',port:Number(process.env.PORT || 4000)});
const timer=setInterval(()=>service.tick().catch(err=>app.log.error({err},'scheduler error')),5000);
timer.unref(); void service.tick();
for(const sig of ['SIGINT','SIGTERM']) process.once(sig,async()=>{clearInterval(timer); await app.close(); store.close(); process.exit(0);});
