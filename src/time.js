// Vietnam is UTC+07:00; the application intentionally supports this timezone only.
const OFFSET = 7 * 60 * 60 * 1000;
export function parseVietnamDateTime(value) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value || '')) throw new Error('Ngày giờ không hợp lệ');
  const date = new Date(value + ':00+07:00');
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + OFFSET).toISOString().slice(0,16) !== value) throw new Error('Ngày giờ không hợp lệ');
  return date.getTime();
}
export function nextDaily(time, now = Date.now()) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw new Error('Giờ không hợp lệ');
  const today = new Date(now + OFFSET).toISOString().slice(0,10);
  let result = parseVietnamDateTime(`${today}T${time}`);
  if (result <= now) result += 86400000;
  return result;
}
