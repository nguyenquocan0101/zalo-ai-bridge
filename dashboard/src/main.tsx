import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CalendarClock, Check, Clock3, ContactRound, Link2, Menu, MessageCircle, MessageSquare, RefreshCw, Search, Send, Sparkles, Trash2, UserRound, X} from 'lucide-react';
import {Button} from '@/components/tailgrids/core/button';
import {Card} from '@/components/tailgrids/core/card';
import {Badge} from '@/components/tailgrids/core/badge';
import {TableRoot, TableHeader, TableBody, TableHead, TableRow, TableCell} from '@/components/tailgrids/core/table';
import {Select, SelectContent, SelectIndicator, SelectItem, SelectLabel, SelectTrigger, SelectValue} from '@/components/tailgrids/core/select';
import './globals.css';
import './dashboard.css';

type Page = 'ai' | 'tin-nhan' | 'zalo';
type Status = {status:string; qr:string|null; ai:{configured:boolean; model:string; baseUrl:string}};
type Schedule = {id:number; recipient:string; label:string; mode:string; content:string; recurrence:string; next_at:number; active:number};
type Message = {id:number; recipient:string; content:string; status:string; error:string|null; created_at:number};
type Contact = {id:string; name:string};

const token = document.querySelector<HTMLMetaElement>('meta[name="dashboard-token"]')?.content || '';
const pages: {id:Page; label:string; icon:React.ReactNode}[] = [
  {id:'ai', label:'AI', icon:<Sparkles size={18}/>},
  {id:'tin-nhan', label:'Tin nhắn', icon:<MessageSquare size={18}/>},
  {id:'zalo', label:'Zalo', icon:<MessageCircle size={18}/>},
];
function pageFromHash(): Page {
  const value = window.location.hash.slice(1);
  return value === 'ai' || value === 'zalo' || value === 'tin-nhan' ? value : 'tin-nhan';
}
async function api(path:string, method='GET', body?:unknown) {
  const response = await fetch('/api' + path, {method, headers:{Authorization:`Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {})}, body:body ? JSON.stringify(body) : undefined});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Không thể xử lý yêu cầu');
  return data;
}
const formatDate = (n:number) => new Intl.DateTimeFormat('vi-VN', {dateStyle:'short', timeStyle:'short', timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(n));
const connectionNames: Record<string,string> = {connected:'Đã kết nối', disconnected:'Chưa kết nối', waiting_qr:'Chờ quét mã QR', scanned:'Chờ xác nhận trên điện thoại', expired:'Phiên đã hết hạn', declined:'Đã từ chối đăng nhập', error:'Kết nối thất bại'};
const resultNames: Record<string,string> = {sent:'Đã gửi', sending:'Đang gửi', failed:'Thất bại', unknown:'Chưa xác định'};
const searchable = (value:string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[đĐ]/g, 'd').toLocaleLowerCase('vi').trim();

function App() {
  const [page,setPage] = useState<Page>(pageFromHash);
  const [status,setStatus] = useState<Status|null>(null);
  const [schedules,setSchedules] = useState<Schedule[]>([]);
  const [messages,setMessages] = useState<Message[]>([]);
  const [contacts,setContacts] = useState<Contact[]>([]);
  const [contactsLoaded,setContactsLoaded] = useState(false);
  const [contactsBusy,setContactsBusy] = useState(false);
  const [contactQuery,setContactQuery] = useState('');
  const [notice,setNotice] = useState('');
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [aiBusy,setAiBusy] = useState(false);
  const [navOpen,setNavOpen] = useState(false);
  const [showQR,setShowQR] = useState(false);
  const [recipient,setRecipient] = useState('');
  const [label,setLabel] = useState('');
  const [mode,setMode] = useState('text');
  const [when,setWhen] = useState('now');
  const [content,setContent] = useState('');
  const [datetime,setDatetime] = useState('');
  const [time,setTime] = useState('07:00');
  const [preview,setPreview] = useState('');
  const [aiPrompt,setAiPrompt] = useState('');
  const [aiOutput,setAiOutput] = useState('');

  const refresh = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    try {
      const [a,b,c] = await Promise.all([api('/status'), api('/schedules'), api('/messages')]);
      setStatus(a); setSchedules(b); setMessages(c);
    } catch(e) { setNotice((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(true), 10000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => { const onHash = () => { setPage(pageFromHash()); setNavOpen(false); }; window.addEventListener('hashchange',onHash); return () => window.removeEventListener('hashchange',onHash); }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); } }, [notice]);

  const filteredContacts = useMemo(() => {
    const query = searchable(contactQuery);
    return contacts.filter(c => !query || searchable(c.name).includes(query) || searchable(c.id).includes(query));
  }, [contacts,contactQuery]);
  const connected = status?.status === 'connected';
  const activePage = pages.find(item => item.id === page)!;

  function navigate(next:Page) { setPage(next); setNavOpen(false); window.location.hash = next; }
  async function connect() { try { setShowQR(true); await api('/zalo/login','POST'); setContacts([]); setContactsLoaded(false); setContactQuery(''); await refresh(true); } catch(e) { setNotice((e as Error).message); } }
  async function loadContacts() {
    if (contactsBusy) return;
    setContactsBusy(true);
    try { const data:Contact[] = await api('/contacts'); setContacts(data); setContactsLoaded(true); if (!data.length) setNotice('Không tìm thấy bạn bè.'); }
    catch(e) { setNotice((e as Error).message); }
    finally { setContactsBusy(false); }
  }
  function chooseContact(contact:Contact) { setRecipient(contact.id); setLabel(contact.name); if (page !== 'tin-nhan') navigate('tin-nhan'); }
  async function toggle(s:Schedule) { try { await api(`/schedules/${s.id}`,'PATCH',{active:!s.active}); await refresh(true); } catch(e) { setNotice((e as Error).message); } }
  async function remove(s:Schedule) { if (!window.confirm('Xóa lịch gửi này?')) return; try { await api(`/schedules/${s.id}`,'DELETE'); await refresh(true); setNotice('Đã xóa lịch gửi.'); } catch(e) { setNotice((e as Error).message); } }
  async function generate(prompt:string, target:'message'|'ai') {
    if (!prompt.trim()) { setNotice('Hãy nhập yêu cầu cho AI.'); return; }
    setAiBusy(true);
    try { const result = await api('/ai/generate','POST',{prompt}); if (target === 'message') setPreview(result.content); else setAiOutput(result.content); }
    catch(e) { setNotice((e as Error).message); }
    finally { setAiBusy(false); }
  }
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const body:Record<string,string> = {recipient,label,mode,content};
      if (when !== 'now') Object.assign(body,{recurrence:when,datetime,time});
      await api(when === 'now' ? '/messages' : '/schedules','POST',body);
      setNotice(when === 'now' ? 'Đã gửi tin nhắn.' : 'Đã tạo lịch gửi.'); setContent(''); setPreview(''); await refresh(true);
    } catch(e) { setNotice((e as Error).message); await refresh(true); }
    finally { setBusy(false); }
  }

  const picker = <ContactPicker contacts={filteredContacts} total={contacts.length} loaded={contactsLoaded} busy={contactsBusy} connected={connected} query={contactQuery} onQuery={setContactQuery} onLoad={()=>void loadContacts()} onSelect={chooseContact} selectedId={recipient}/>;
  return <div className="app-shell">
    {navOpen && <button className="sidebar-backdrop" aria-label="Đóng menu" onClick={()=>setNavOpen(false)}/>}
    <aside className={'sidebar '+(navOpen?'sidebar-open':'')}>
      <div className="brand"><div className="brand-mark"><MessageCircle size={18}/></div><span>Zalo<span className="brand-light">Bridge</span></span><button className="sidebar-close" aria-label="Đóng menu" onClick={()=>setNavOpen(false)}><X size={18}/></button></div>
      <div className="nav-caption">MENU</div>
      <nav className="section-nav" aria-label="Điều hướng chính">{pages.map(item => <a key={item.id} href={'#'+item.id} className={page===item.id?'nav-active':''} aria-current={page===item.id?'page':undefined} onClick={()=>{setPage(item.id);setNavOpen(false);}}>{item.icon}<span>{item.label}</span></a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note-icon"><Sparkles size={18}/></div><strong>Zalo Bridge</strong><p>Quản lý tin nhắn và kết nối của bạn tại một nơi.</p><a href="#tin-nhan" className="sidebar-cta" onClick={()=>navigate('tin-nhan')}>Tạo tin nhắn <Send size={15}/></a></div>
    </aside>
    <div className="main-wrap"><div className="app-surface">
      <header className="topbar"><div className="topbar-left"><button className="menu-button" aria-label="Mở menu" onClick={()=>setNavOpen(true)}><Menu size={20}/></button><span className="breadcrumb">Ứng dụng <span>/</span> <strong>{activePage.label}</strong></span></div><div className="topbar-right"><span className="timezone"><Clock3 size={15}/> Giờ Việt Nam (GMT+7)</span><div className="top-divider"/><div className="avatar"><UserRound size={17}/></div><div className="profile-name">Tài khoản của tôi <small>Zalo Bridge</small></div></div></header>
      <main className="content section-content">
        <div className="page-heading"><div><h1>{activePage.label}</h1><p>{page==='tin-nhan'?'Gửi tin nhắn và quản lý lịch gửi.':page==='zalo'?'Quản lý tài khoản gửi và tìm bạn bè.':'Kiểm tra kết nối và thử viết nội dung với AI.'}</p></div></div>

        {page==='tin-nhan' && <div className="section-grid"><div className="stack">
          <Card className="dashboard-card compose-card"><div className="card-header"><div><h2>Tạo tin nhắn</h2><p>Gửi ngay hoặc đặt lịch cho một tài khoản Zalo khác</p></div><span className="tiny-icon"><MessageSquare size={18}/></span></div><form onSubmit={submit}>
            <div className="form-grid"><label htmlFor="recipient">ID Zalo người nhận <span>*</span><input id="recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} required pattern="[0-9]+" placeholder="Nhập ID hoặc chọn bạn bè bên dưới"/></label><label htmlFor="recipient-label">Tên gợi nhớ<input id="recipient-label" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Ví dụ: Bạn An"/></label></div>
            {picker}
            <div className="form-grid select-grid">
              <Select className="compact-select" value={mode} onChange={value=>{setMode(String(value));setPreview('');}}>
                <SelectLabel>Nội dung</SelectLabel><SelectTrigger size="md" className="compact-select-trigger"><SelectValue/><SelectIndicator/></SelectTrigger>
                <SelectContent className="compact-select-popover"><SelectItem id="text" textValue="Tự viết nội dung">Tự viết nội dung</SelectItem><SelectItem id="ai" textValue="AI viết theo yêu cầu">AI viết theo yêu cầu</SelectItem></SelectContent>
              </Select>
              <Select className="compact-select" value={when} onChange={value=>setWhen(String(value))}>
                <SelectLabel>Thời điểm gửi</SelectLabel><SelectTrigger size="md" className="compact-select-trigger"><SelectValue/><SelectIndicator/></SelectTrigger>
                <SelectContent className="compact-select-popover"><SelectItem id="now" textValue="Gửi ngay">Gửi ngay</SelectItem><SelectItem id="once" textValue="Một lần">Một lần</SelectItem><SelectItem id="daily" textValue="Hằng ngày">Hằng ngày</SelectItem></SelectContent>
              </Select>
            </div>
            {when==='once' && <label htmlFor="datetime">Ngày giờ gửi<input id="datetime" type="datetime-local" required value={datetime} onChange={e=>setDatetime(e.target.value)}/></label>}
            {when==='daily' && <label htmlFor="time">Giờ gửi hằng ngày<input id="time" type="time" required value={time} onChange={e=>setTime(e.target.value)}/></label>}
            <label htmlFor="content">{mode==='ai'?'Yêu cầu cho AI':'Tin nhắn'} <span>*</span><textarea id="content" required rows={4} value={content} onChange={e=>setContent(e.target.value)} placeholder={mode==='ai'?'Ví dụ: Viết lời chào buổi sáng ngắn gọn':'Nhập nội dung tin nhắn...'}/></label>
            {preview && <div className="ai-preview"><strong>Nội dung xem trước</strong><p>{preview}</p></div>}
            <div className="form-actions"><Button type="submit" size="lg" isDisabled={busy}><Send size={16}/>{when==='now'?'Gửi tin nhắn':'Tạo lịch gửi'}</Button>{mode==='ai' && <Button type="button" appearance="outline" size="lg" isDisabled={aiBusy} onPress={()=>void generate(content,'message')}><Sparkles size={16}/>Xem trước AI</Button>}</div>
          </form></Card>
        </div><div className="stack">
          <Card className="dashboard-card schedule-card"><div className="card-header"><div><h2>Lịch gửi</h2><p>Theo dõi và quản lý các lịch đã tạo</p></div><CalendarClock className="header-icon" size={19}/></div>{schedules.length ? <TableRoot className="schedule-table" fullBleed><TableHeader><TableRow><TableHead>NGƯỜI NHẬN</TableHead><TableHead>LỊCH GỬI</TableHead><TableHead>TRẠNG THÁI</TableHead><TableHead>THAO TÁC</TableHead></TableRow></TableHeader><TableBody>{schedules.map(s=><TableRow key={s.id}><TableCell><strong>{s.label||s.recipient}</strong><small>{s.label?s.recipient:s.content}</small></TableCell><TableCell><strong>{s.recurrence==='daily'?'Hằng ngày':'Một lần'}</strong><small>{formatDate(s.next_at)}</small></TableCell><TableCell><Badge color={s.active?'success':'gray'}>{s.active?'Đang bật':'Tạm dừng'}</Badge></TableCell><TableCell><div className="table-actions"><button onClick={()=>void toggle(s)}>{s.active?'Tạm dừng':'Bật lại'}</button><button className="icon-action" aria-label={`Xóa lịch ${s.label||s.recipient}`} onClick={()=>void remove(s)}><Trash2 size={16}/></button></div></TableCell></TableRow>)}</TableBody></TableRoot> : <Empty icon={<CalendarClock/>} title="Chưa có lịch gửi" text="Tạo lịch để tin nhắn được gửi tự động."/>}</Card>
          <Card className="dashboard-card activity-card"><div className="card-header"><div><h2>Gửi gần đây</h2><p>Hoạt động mới nhất</p></div><Clock3 className="header-icon" size={19}/></div>{messages.length ? <div className="activity-list">{messages.slice(0,12).map(m=><div className="activity-row" key={m.id}><div className="activity-icon"><MessageSquare size={16}/></div><div className="activity-copy"><strong>{m.recipient}</strong><p>{m.content}</p><small>{formatDate(m.created_at)}{m.error?' · '+m.error:''}</small></div><Badge color={m.status==='sent'?'success':m.status==='sending'?'primary':'warning'}>{resultNames[m.status]||m.status}</Badge></div>)}</div> : <Empty icon={<MessageSquare/>} title="Chưa có hoạt động" text="Tin nhắn đã gửi sẽ xuất hiện tại đây."/>}</Card>
        </div></div>}

        {page==='zalo' && <div className="section-grid"><div className="stack"><Card className="dashboard-card connection-card"><div className="card-header"><div><h2>Tài khoản Zalo</h2><p>Tài khoản cá nhân dùng để gửi tin</p></div><button aria-label="Làm mới trạng thái" className="icon-button" onClick={()=>void refresh()}><RefreshCw size={16} className={loading?'spinning':''}/></button></div><div className="account-info"><div className="account-avatar"><MessageCircle size={23}/></div><div><strong>Zalo cá nhân</strong><p>{connected?'Tài khoản gửi':'Chưa có tài khoản gửi'}</p></div><span className={'status-dot '+(connected?'online':'')}/></div><div className="connection-line"><span>Trạng thái</span><Badge color={connected?'success':'warning'}>{connectionNames[status?.status||'disconnected']||status?.status}</Badge></div>{showQR && status?.qr && <div className="qr-wrap"><img src={status.qr} alt="Mã QR đăng nhập Zalo"/><p>Quét bằng ứng dụng Zalo trên điện thoại</p></div>}<Button className="connect-button" size="lg" appearance={connected?'outline':'fill'} onPress={()=>void connect()}><Link2 size={16}/>{connected?'Kết nối lại':'Kết nối Zalo'}</Button><p className="connection-note">Sử dụng tài khoản Zalo cá nhân có thể bị hạn chế do thư viện kết nối không chính thức.</p></Card></div><div className="stack"><Card className="dashboard-card"><div className="card-header"><div><h2>Danh sách bạn bè</h2><p>Tìm theo tên hoặc ID Zalo và chọn người nhận</p></div><ContactRound className="header-icon" size={19}/></div><div className="zalo-picker">{picker}</div></Card></div></div>}

        {page==='ai' && <div className="section-grid"><div className="stack"><Card className="dashboard-card"><div className="card-header"><div><h2>AI tích hợp</h2><p>Thông tin kết nối hiện tại</p></div><div className="ai-icon"><Sparkles size={18}/></div></div><div className="settings-list"><div><span>Trạng thái</span><Badge color={status?.ai.configured?'success':'gray'}>{status?.ai.configured?'Sẵn sàng':'Chưa có khóa API'}</Badge></div><div><span>Model</span><strong>{status?.ai.model||'Chưa cấu hình'}</strong></div><div><span>Base URL</span><strong>{status?.ai.baseUrl||'Chưa cấu hình'}</strong></div></div><p className="settings-hint">Thay đổi cấu hình trong file .env và khởi động lại ứng dụng.</p></Card></div><div className="stack"><Card className="dashboard-card"><div className="card-header"><div><h2>Thử viết với AI</h2><p>Xem trước nội dung trước khi tạo tin nhắn</p></div></div><div className="ai-test"><label htmlFor="ai-prompt">Yêu cầu<textarea id="ai-prompt" rows={4} value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Ví dụ: Viết lời chào buổi sáng ngắn gọn"/></label><Button size="lg" isDisabled={aiBusy} onPress={()=>void generate(aiPrompt,'ai')}><Sparkles size={16}/>Tạo nội dung</Button>{aiOutput && <div className="ai-preview"><strong>Nội dung AI</strong><p>{aiOutput}</p><button className="subtle-link use-ai" onClick={()=>{setContent(aiOutput);setMode('text');navigate('tin-nhan');}}>Dùng cho tin nhắn</button></div>}</div></Card></div></div>}
      </main><footer className="footer"><span>Zalo Bridge</span><span>Dữ liệu được cập nhật tự động</span></footer>
    </div></div>
    {notice && <div className="toast" role="status">{notice}<button aria-label="Đóng thông báo" onClick={()=>setNotice('')}><X size={16}/></button></div>}
  </div>;
}

function ContactPicker({contacts,total,loaded,busy,connected,query,onQuery,onLoad,onSelect,selectedId}:{contacts:Contact[];total:number;loaded:boolean;busy:boolean;connected:boolean;query:string;onQuery:(value:string)=>void;onLoad:()=>void;onSelect:(contact:Contact)=>void;selectedId:string}) {
  return <section className="contact-picker" aria-label="Chọn từ danh sách bạn bè"><div className="contact-heading"><div><strong>Chọn từ danh sách bạn bè</strong><p>Tìm nhanh theo tên hoặc ID Zalo</p></div><button type="button" className="subtle-link" onClick={onLoad} disabled={busy}>{busy?'Đang tải...':loaded?'Làm mới':'Tải danh sách'}</button></div><div className="contact-search"><Search size={17}/><input aria-label="Tìm bạn bè theo tên hoặc ID" value={query} onFocus={()=>{if(connected&&!loaded&&!busy)onLoad();}} onChange={e=>onQuery(e.target.value)} placeholder="Tìm bạn bè theo tên hoặc ID" /></div>{!loaded ? <p className="contacts-placeholder">{connected?'Chọn ô tìm kiếm hoặc tải danh sách bạn bè.':'Kết nối Zalo để tìm bạn bè.'}</p> : contacts.length===0 ? <p className="contacts-placeholder">{total?'Không tìm thấy bạn bè phù hợp.':'Danh sách bạn bè đang trống.'}</p> : <><ul className="contact-results" aria-label="Kết quả tìm bạn bè">{contacts.slice(0,100).map(contact=><li key={contact.id}><button type="button" className={'contact-result '+(selectedId===contact.id?'selected':'')} onClick={()=>onSelect(contact)}><span className="contact-avatar"><UserRound size={16}/></span><span className="contact-name"><strong>{contact.name||'Không có tên'}</strong><small>{contact.id}</small></span>{selectedId===contact.id && <Check size={17} className="contact-check"/>}</button></li>)}</ul>{contacts.length>100 && <p className="contact-count">Hiển thị 100/{contacts.length} kết quả. Nhập thêm để thu hẹp tìm kiếm.</p>}</>}</section>;
}
function Empty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}) { return <div className="empty-state"><div>{icon}</div><strong>{title}</strong><p>{text}</p></div>; }
createRoot(document.getElementById('root')!).render(<App/>);
