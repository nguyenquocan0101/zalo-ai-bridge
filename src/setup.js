import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
try {
  let env=await readFile('.env.example','utf8');
  env=env.replace('BRIDGE_API_KEY=','BRIDGE_API_KEY='+randomBytes(32).toString('hex')).replace('CREDENTIALS_KEY=','CREDENTIALS_KEY='+randomBytes(32).toString('hex'));
  await writeFile('.env',env,{flag:'wx',mode:0o600});
  console.log('Đã tạo .env với khóa riêng. Mở .env để thêm AI_API_KEY và lấy BRIDGE_API_KEY đăng nhập.');
} catch(e) { if(e.code==='EEXIST') console.error('.env đã tồn tại; giữ nguyên cấu hình.'); else throw e; }
