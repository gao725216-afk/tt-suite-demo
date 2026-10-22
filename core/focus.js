/* Account focus clock. Only the server applies commands; clients display its time. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TTFocus=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX=12*3600000,clone=x=>JSON.parse(JSON.stringify(x));
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
 const empty=()=>({version:0,sessions:[],reviews:[],commands:[]});
 const active=state=>state.sessions.find(s=>s.status==='running'||s.status==='paused');
 const limit=s=>s.mode==='stopwatch'?MAX:s.targetMs;
 function elapsed(s,now){return Math.min(limit(s),s.segments.reduce((sum,p)=>sum+Math.max(0,(p.end===null?now:p.end)-p.start),0));}
 function close(s,now){const p=s.segments.at(-1);if(p?.end===null){const previous=s.segments.slice(0,-1).reduce((sum,p)=>sum+p.end-p.start,0);p.end=Math.max(p.start,Math.min(now,p.start+limit(s)-previous));}}
 function zone(value){try{if(typeof value!=='string'||value.length>80)return false;new Intl.DateTimeFormat('en',{timeZone:value}).format(0);return true;}catch{return false;}}
 const dateFormatters=new Map();
 function dateAt(ms,tz){if(!dateFormatters.has(tz))dateFormatters.set(tz,new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}));const parts=dateFormatters.get(tz).formatToParts(ms),get=key=>parts.find(p=>p.type===key).value;return get('year')+'-'+get('month')+'-'+get('day');}
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 function bounds(today,period){if(!validDate(today))fail('日期无效。');const d=new Date(today+'T12:00:00Z');if(period==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);else if(period==='month')d.setUTCDate(1);const from=period==='all'?'':d.toISOString().slice(0,10);return {from,to:today};}
 function apply(state,input,{now,owner,device,task}={}){
  if(!Number.isSafeInteger(now)||now<0)fail('计时服务时间无效。');
  if(!input||!id(input.commandId))fail('操作标识无效。');
  if(JSON.stringify(input).length>5000||Object.keys(input).some(k=>!['commandId','version','action','sessionId','eventId','mode','minutes','timezone','seconds','reason','period','date','text'].includes(k)))fail('专注操作包含无效字段。');
  if(input.eventId!==undefined&&(typeof input.eventId!=='string'||input.eventId!==''&&!id(input.eventId)))fail('事项标识无效。');
  const fingerprint=JSON.stringify(Object.keys(input).sort().filter(k=>k!=='version').map(k=>[k,input[k]]));
  const done=state.commands.find(c=>c.id===input.commandId);
  if(done){if(done.fingerprint!==fingerprint)fail('操作标识已用于其他请求。');return clone(state);}
  if(!Number.isSafeInteger(input.version)||input.version!==state.version)fail('专注状态已在另一端更新，请查看最新状态后再操作。',409);
  const next=clone(state),current=active(next),action=input.action;
  if(action==='start'){
   if(current)fail('已有计时，请先结束或接管当前计时。',409);
   if(next.sessions.length>=10000)fail('专注记录已达上限，请联系管理员归档。');
   if(!id(input.sessionId)||next.sessions.some(s=>s.id===input.sessionId))fail('计时标识已存在。');
   if(!['pomodoro','stopwatch','break'].includes(input.mode)||!zone(input.timezone))fail('计时方式或时区无效。');
   if(input.mode!=='stopwatch'&&(!Number.isInteger(input.minutes)||input.minutes<1||input.minutes>180))fail('倒计时请填 1–180 分钟。');
   if(input.eventId&&(!task||task.id!==input.eventId))fail('事项已删除或尚未同步，请先保存事项。');
   next.sessions.push({id:input.sessionId,eventId:task?.id||'',title:task?.title||'自由专注',mode:input.mode,timezone:input.timezone,targetMs:input.mode==='stopwatch'?MAX:input.minutes*60000,status:'running',owner,device,startedAt:now,finishedAt:null,segments:[{start:now,end:null}],corrections:[]});
  }else if(['pause','resume','takeover','finish'].includes(action)){
   if(!current||input.sessionId!==current.id)fail('该计时已结束，请查看最新记录。',409);
   if(action!=='takeover'&&current.owner!==owner)fail('此计时由另一台设备控制，请先接管。',409);
   if(action==='takeover'){current.owner=owner;current.device=device;}
   if(action==='pause'){if(current.status!=='running')fail('计时已经暂停。',409);close(current,now);current.status='paused';}
   if(action==='resume'){
    if(current.status!=='paused')fail('计时已经开始。',409);
    if(elapsed(current,now)>=limit(current))fail('已达到计时上限，请结束并保存。');
    if(current.segments.length>=1000)fail('暂停次数已达上限，请结束并保存。');
    current.segments.push({start:now,end:null});current.status='running';
   }
   if(action==='finish'){close(current,now);current.status='finished';current.finishedAt=now;}
  }else if(action==='correct'){
   const s=next.sessions.find(s=>s.id===input.sessionId&&s.status==='finished'&&s.mode!=='break');
   if(!s)fail('找不到可修正的专注记录。');
   if(!Number.isInteger(input.seconds)||input.seconds<0||input.seconds>MAX/1000)fail('修正时长须在 0–720 分钟之间。');
   if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>200)fail('请填写不超过 200 字的修正原因。');
   if(s.corrections.length>=100)fail('这条记录的修正次数已达上限。');
   s.corrections.push({at:now,fromMs:actual(s),toMs:input.seconds*1000,reason:input.reason.trim()});
  }else if(action==='review'){
   if(!['day','week'].includes(input.period)||!validDate(input.date)||!zone(input.timezone)||input.date>dateAt(now,input.timezone))fail('回顾日期或时区无效。');
   const key=input.period+':'+bounds(input.date,input.period).from;
   if(typeof input.text!=='string'||input.text.length>2000)fail('回顾最多 2000 字。');
   const row={id:key,text:input.text.trim(),updatedAt:now};const index=next.reviews.findIndex(r=>r.id===key);
   if(index<0){if(next.reviews.length>=5000)fail('回顾记录已达上限。');next.reviews.push(row);}else next.reviews[index]=row;
  }else fail('不支持的专注操作。');
  next.version++;next.commands.push({id:input.commandId,fingerprint});if(next.commands.length>500)next.commands.shift();return next;
 }
 function actual(s){return s.corrections.length?s.corrections.at(-1).toMs:elapsed(s,s.finishedAt);}
 // Split real intervals at local midnight (also handles 23/25-hour DST days).
 function daily(s){
  const map=new Map();for(const p of s.segments){let start=p.start,end=p.end;if(end===null)continue;
   while(start<end){const date=dateAt(start,s.timezone);let boundary=end;
    if(dateAt(end-1,s.timezone)!==date){let lo=start+1,hi=end;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(dateAt(mid,s.timezone)===date)lo=mid+1;else hi=mid;}boundary=lo;}
    map.set(date,(map.get(date)||0)+boundary-start);start=boundary;
   }
  }
  const raw=[...map.values()].reduce((a,b)=>a+b,0),total=actual(s);if(!raw)return total?[{date:dateAt(s.finishedAt,s.timezone),ms:total}]:[];
  let allocated=0;return [...map].map(([date,ms],i)=>{const value=i===map.size-1?total-allocated:Math.floor(ms/raw*total);allocated+=value;return {date,ms:value};});
 }
 function report(state,{from='',to='9999-12-31'}={}){
  const days=new Map(),items=new Map();let totalMs=0,count=0,corrected=0;
  for(const s of state.sessions){if(s.status!=='finished'||s.mode==='break')continue;const entries=daily(s).filter(d=>d.date>=from&&d.date<=to),ms=entries.reduce((n,d)=>n+d.ms,0);if(!entries.length)continue;count++;totalMs+=ms;if(s.corrections.length)corrected++;
   const key=s.eventId||'free';let row=items.get(key);if(!row){row={id:key,title:s.title,ms:0,count:0};items.set(key,row);}row.ms+=ms;row.count++;
   for(const e of entries)days.set(e.date,(days.get(e.date)||0)+e.ms);
  }return {totalMs,count,corrected,items:[...items.values()].sort((a,b)=>b.ms-a.ms),days:[...days].sort(([a],[b])=>b.localeCompare(a)).map(([date,ms])=>({date,ms}))};
 }
 function format(ms){const seconds=Math.max(0,Math.floor(ms/1000));return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');}
 function compare(state,records,{from='',to='9999-12-31',group='item'}={}){
  const result=report(state,{from,to}),rows=new Map(),seen=new Set();
  for(const r of records){if(seen.has(r.key)||r.date<from||r.date>to)continue;seen.add(r.key);const key=group==='day'?r.date:r.eventId||'free',row=rows.get(key)||{id:key,title:group==='day'?r.date:r.title,planned:0,ms:0,count:0};row.planned+=Number.isFinite(r.minutes)?r.minutes:0;rows.set(key,row);}
  for(const item of group==='day'?result.days:result.items){const key=group==='day'?item.date:item.id,row=rows.get(key)||{id:key,title:group==='day'?item.date:item.title,planned:0,ms:0,count:0};row.ms=item.ms;row.count=item.count||0;rows.set(key,row);}
  return [...rows.values()].sort((a,b)=>group==='day'?b.id.localeCompare(a.id):b.ms-a.ms||b.planned-a.planned);
 }
 function csv(rows){const cell=value=>'"'+String(value).replace(/^[\u0000-\u0020]*[=+\-@]/,"'$&").replace(/"/g,'""')+'"';return '\ufeff'+[['事项或日期','完成计划（分钟）','实际专注（分钟）'],...rows.map(r=>[r.title,r.planned.toFixed(2),(r.ms/60000).toFixed(2)])].map(r=>r.map(cell).join(',')).join('\r\n');}
 // Persist the exact pending command: a lost response can safely be retried after restart.
 function controller({request,loadPending=()=>null,savePending=()=>{},onChange=()=>{},monotonic=()=>Date.now(),uuid}={}){
  let state=null,pending=loadPending(),busy=false,anchor=0,serverTime=0,message='',online=false,conflict='';
  const view=()=>({state,pending:!!pending,busy,message,online,conflict,now:state?serverTime+Math.max(0,monotonic()-anchor):Date.now()});
  const publish=()=>onChange(view());
  function accept(data){state=data;serverTime=data.serverTime;anchor=monotonic();online=true;}
  async function refresh(){if(busy)return;busy=true;try{accept(await request());message=pending?'上次操作尚未确认，请重试。':'';}catch(e){online=false;message='暂时离线，计时按本地状态继续；联网后可操作。';}finally{busy=false;publish();}}
  async function send(action,fields={}){
   if(busy)return false;if(!state){await refresh();return false;}
   if(pending&&action!=='retry'){message='请先确认上次操作结果。';publish();return false;}
   if(!pending){pending={...fields,action,version:fields.version??state.version,commandId:uuid()};savePending(pending);}
   busy=true;conflict='';publish();let success=false;
   try{accept(await request(pending));pending=null;savePending(null);message='已保存到本地';success=true;}
   catch(e){message=e.message||'操作尚未确认，请重试。';if(e.status){if(e.status===409)conflict=pending.action;if(e.current||e.result?.current)accept(e.current||e.result.current);pending=null;savePending(null);}else online=false;}
   finally{busy=false;publish();}return success;
  }
  return {view,refresh,send};
 }
 return {empty,active,elapsed,actual,daily,report,compare,csv,apply,dateAt,bounds,format,controller,limit};
});
