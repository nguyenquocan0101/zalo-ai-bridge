// Adapted from zca-bridge (Copyright 2026 Tom), Apache-2.0; redesigned for this bridge.
import {Zalo, ThreadType, LoginQRCallbackEventType} from 'zca-js';
import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

export class ZaloConnection {
  constructor(file, key) { this.file=file; this.key=key; this.api=null; this.state='disconnected'; this.qr=null; this.generation=0; }
  async save(credentials) {
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',this.key,iv);
    const data=Buffer.concat([cipher.update(JSON.stringify(credentials),'utf8'),cipher.final()]);
    await mkdir(dirname(this.file),{recursive:true});
    await writeFile(this.file,Buffer.concat([iv,cipher.getAuthTag(),data]),{mode:0o600});
  }
  async restore() {
    try {
      const b=await readFile(this.file); const cipher=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12)); cipher.setAuthTag(b.subarray(12,28));
      const credentials=JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8'));
      const api=await new Zalo({selfListen:true}).login(credentials); this.attach(api);
    } catch (err) { if (err.code !== 'ENOENT') { this.state='expired'; console.error('Không khôi phục được phiên Zalo:',err.message); } }
  }
  attach(api) {
    if (this.api) { try { this.api.listener.stop(); } catch {} }
    this.api=api; this.state='connected'; this.qr=null;
    // Listening is not required for outbound messages. It also avoids taking over the Zalo Web listener.
  }
  startLogin() {
    if (this.state === 'waiting_qr' || this.state === 'scanned') return;
    this.state='waiting_qr'; this.qr=null; const generation=++this.generation;
    const client=new Zalo({selfListen:true}); let savePromise=Promise.resolve();
    client.loginQR({}, (event) => {
      if (generation !== this.generation) return;
      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) this.qr=event.data.image.startsWith('data:') ? event.data.image : `data:image/png;base64,${event.data.image}`;
      if (event.type === LoginQRCallbackEventType.QRCodeScanned) this.state='scanned';
      if (event.type === LoginQRCallbackEventType.QRCodeExpired) { this.state='expired'; this.qr=null; }
      if (event.type === LoginQRCallbackEventType.QRCodeDeclined) { this.state='declined'; this.qr=null; }
      if (event.type === LoginQRCallbackEventType.GotLoginInfo) savePromise=this.save({imei:event.data.imei,cookie:event.data.cookie,userAgent:event.data.userAgent,language:'vi'});
    }).then(async api => { await savePromise; if (generation === this.generation) this.attach(api); }).catch(err => { if (generation === this.generation) { this.state='error'; this.qr=null; console.error('Đăng nhập Zalo thất bại:',err.message); } });
  }
  status() { return {status:this.state, qr:this.qr}; }
  async friends() {
    if (!this.api) throw new Error('Chưa kết nối Zalo');
    const friends=await this.api.getAllFriends();
    return friends.map(f=>({id:String(f.userId ?? f.user_id ?? f.uid ?? ''),name:f.displayName ?? f.zaloName ?? f.name ?? ''})).filter(f=>f.id);
  }
  async send(recipient, text) {
    if (!this.api) throw new Error('Chưa kết nối Zalo');
    const result=await this.api.sendMessage(text,recipient,ThreadType.User);
    const id=String(result?.message?.msgId ?? '');
    if (!id) throw new Error('Zalo không trả về mã tin nhắn; cần kiểm tra trước khi gửi lại');
    return id;
  }
}
