import {DatabaseSync} from 'node:sqlite';
import {nextDaily} from './time.js';

export class Store {
  constructor(path) {
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY, recipient TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', mode TEXT NOT NULL,
      content TEXT NOT NULL, recurrence TEXT NOT NULL, time TEXT, next_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, schedule_id INTEGER, recipient TEXT NOT NULL,
      content TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, zalo_id TEXT, error TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    // An interrupted network call may have reached Zalo. Never send it again automatically.
    this.db.prepare("UPDATE messages SET status='unknown', error='Tiến trình bị gián đoạn; kiểm tra Zalo trước khi gửi lại', updated_at=? WHERE status='sending'").run(Date.now());
  }
  schedules() { return this.db.prepare('SELECT * FROM schedules ORDER BY created_at DESC, id DESC').all(); }
  messages() { return this.db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 100').all(); }
  createSchedule(s) { return this.db.prepare('INSERT INTO schedules (recipient,label,mode,content,recurrence,time,next_at,created_at) VALUES (?,?,?,?,?,?,?,?)').run(s.recipient,s.label,s.mode,s.content,s.recurrence,s.time ?? null,s.nextAt,Date.now()).lastInsertRowid; }
  deleteSchedule(id) { return this.db.prepare('DELETE FROM schedules WHERE id=?').run(id).changes; }
  toggle(id,active) {
    const s=this.db.prepare('SELECT * FROM schedules WHERE id=?').get(id); if (!s) return false;
    if (active && s.recurrence === 'once' && s.next_at <= Date.now()) throw new Error('Lịch một lần đã qua; hãy tạo lịch mới');
    const next=active && s.recurrence === 'daily' ? nextDaily(s.time) : s.next_at;
    this.db.prepare('UPDATE schedules SET active=?,next_at=? WHERE id=?').run(active?1:0,next,id); return true;
  }
  addMessage(recipient,mode,content,scheduleId=null) { const t=Date.now(); return this.db.prepare("INSERT INTO messages (schedule_id,recipient,mode,content,status,created_at,updated_at) VALUES (?,?,?,?, 'sending',?,?)").run(scheduleId,recipient,mode,content,t,t).lastInsertRowid; }
  finish(id,status,content,zaloId,error) { this.db.prepare('UPDATE messages SET status=?,content=?,zalo_id=?,error=?,updated_at=? WHERE id=?').run(status,content,zaloId,error,Date.now(),id); }
  claimDue(now=Date.now()) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const s=this.db.prepare('SELECT * FROM schedules WHERE active=1 AND next_at<=? ORDER BY next_at,id LIMIT 1').get(now);
      if (!s) { this.db.exec('COMMIT'); return null; }
      const next=s.recurrence === 'daily' ? nextDaily(s.time,now) : s.next_at;
      this.db.prepare('UPDATE schedules SET active=?,next_at=? WHERE id=?').run(s.recurrence === 'daily'?1:0,next,s.id);
      const id=this.addMessage(s.recipient,s.mode,s.content,s.id);
      this.db.exec('COMMIT'); return {...s, messageId:id};
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  close() { this.db.close(); }
}
