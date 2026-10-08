/** Public room-901 demo only. Production routing always uses hotel configuration. */
export function validDemoTimeZone(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  try { new Intl.DateTimeFormat('en', {timeZone:value}).format(); return value; } catch { return null; }
}
export function browserDemoTimeZone() {
  return validDemoTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
}
export function demoRoutingApplies(slug, isTest, room) {
  return slug === 'demo' && isTest === true && String(room) === '901';
}
export function demoDepartmentWorking(timeZone, now = new Date()) {
  const zone=validDemoTimeZone(timeZone);
  if (!zone) return false;
  const parts=new Intl.DateTimeFormat('en',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const minutes=Number(parts.find(p=>p.type==='hour')?.value)*60+Number(parts.find(p=>p.type==='minute')?.value);
  return minutes >= 480 && minutes < 1020;
}
export function demoRequestReady(request, timeZone, now = new Date()) {
  if (!demoDepartmentWorking(timeZone,now)) return false;
  if (request.serviceTime !== 'tomorrow') return true;
  const date=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  return date.format(new Date(request.createdAtIso)) !== date.format(now);
}
