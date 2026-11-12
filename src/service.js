import {generateText} from './ai.js';
import {nextDaily,parseVietnamDateTime} from './time.js';

function required(value,label,max=4000) {
  if (typeof value !== 'string' || !value.trim() || value.length>max) throw new Error(`${label} không hợp lệ`);
  return value.trim();
}
export function validateMessage(body) {
  const recipient=required(body?.recipient,'ID người nhận',100);
  if (!/^\d+$/.test(recipient)) throw new Error('ID người nhận phải là ID Zalo dạng số');
  const mode=body?.mode ?? 'text'; if (!['text','ai'].includes(mode)) throw new Error('Kiểu nội dung không hợp lệ');
  return {recipient,mode,content:required(body?.content,mode==='ai'?'Yêu cầu cho AI':'Nội dung'),label:String(body?.label ?? '').slice(0,120)};
}
export function validateSchedule(body, now=Date.now()) {
  const message=validateMessage(body); const recurrence=body.recurrence;
  if (recurrence==='once') { const nextAt=parseVietnamDateTime(body.datetime); if(nextAt<=now) throw new Error('Lịch một lần phải ở tương lai'); return {...message,recurrence,nextAt}; }
  if (recurrence==='daily') return {...message,recurrence,time:body.time,nextAt:nextDaily(body.time,now)};
  throw new Error('Kiểu lịch không hợp lệ');
}
export class BridgeService {
  constructor(store,zalo,ai) { this.store=store; this.zalo=zalo; this.ai=ai; this.running=false; }
  async deliver(item,id) {
    let content=item.content; let sending=false;
    try {
      if (this.zalo.status && this.zalo.status().status !== 'connected') throw new Error('Chưa kết nối Zalo');
      if(item.mode==='ai') content=await generateText(this.ai,content);
      sending=true; const zaloId=await this.zalo.send(item.recipient,content);
      this.store.finish(id,'sent',content,zaloId,null); return {id,status:'sent',zaloId,content};
    } catch(e) {
      // After network dispatch, delivery may have succeeded despite a timeout.
      const status=sending?'unknown':'failed'; this.store.finish(id,status,content,null,e.message); return {id,status,error:e.message};
    }
  }
  async send(body) { const item=validateMessage(body); const id=this.store.addMessage(item.recipient,item.mode,item.content); return this.deliver(item,id); }
  async tick() {
    if(this.running) return; this.running=true;
    try { if (this.zalo.status && this.zalo.status().status !== 'connected') return; let item; while((item=this.store.claimDue())) await this.deliver(item,item.messageId); } finally { this.running=false; }
  }
}
