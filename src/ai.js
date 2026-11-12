export async function generateText(config, prompt) {
  if (!config.baseUrl || !config.apiKey || !config.model) throw new Error('Chưa cấu hình AI_BASE_URL, AI_API_KEY và AI_MODEL');
  const url = new URL(config.baseUrl.replace(/\/$/, '') + '/chat/completions');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname))) throw new Error('AI_BASE_URL phải dùng HTTPS (trừ localhost)');
  const res = await fetch(url, {method:'POST', headers:{'content-type':'application/json', authorization:`Bearer ${config.apiKey}`}, body:JSON.stringify({model:config.model, messages:[{role:'user', content:prompt}]}), signal:AbortSignal.timeout(60000)});
  if (!res.ok) throw new Error(`Nhà cung cấp AI trả về HTTP ${res.status}`);
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI không trả về nội dung');
  return content.trim();
}
