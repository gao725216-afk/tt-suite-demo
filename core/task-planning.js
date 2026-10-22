/* Same task identity in the pool, calendar, completion records and sync. */
(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./occur'):root.TTOccur,node?require('./calendar-views'):root.TTCalendarViews);if(node)module.exports=api;if(root)root.TTTaskPlanning=api;})(typeof globalThis!=='undefined'?globalThis:this,function(core,calendar){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const fail=message=>{throw new Error(message);};
 const minute=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
 const clock=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
 const keys=event=>event.type==='task'?['plannedDate','plannedStart','plannedEnd','start','deferred']:['date','start','end','deferred'];
 const stamp=event=>JSON.stringify(keys(event).map(key=>[key,event[key]??null]));
 function completed(event,records){return (records||[]).some(r=>r.key===(event.type==='task'?'task:'+event.id:event.id+':'+event.date));}
 function pool(schedule,records){
  const parents=new Set((schedule.events||[]).filter(e=>e.type==='task'&&e.parentId).map(e=>e.parentId));
  return (schedule.events||[]).filter(e=>e.type==='task'&&!parents.has(e.id)&&!core.taskTiming(e)&&!completed(e,records))
   .slice().sort((a,b)=>(b.priority||0)-(a.priority||0)||(a.deadline||'9999').localeCompare(b.deadline||'9999')||a.title.localeCompare(b.title));
 }
 function preview(schedule,records,input){
  const before=(schedule.events||[]).find(e=>e.id===input.id);
  if(!before||!['task','once'].includes(before.type))fail('请选择任务或单次日程；重复安排请用编辑器修改。');
  if(completed(before,records))fail('这项已经完成，请先撤销完成再调整排期。');
  if(before.type==='task'&&(schedule.events||[]).some(e=>e.parentId===before.id))fail('请安排具体子任务，避免父任务重复占用时间。');
  const after=clone(before);
  if(input.remove){
   if(before.type!=='task')fail('只有任务可以移回待规划池。');
   after.plannedDate='';after.plannedStart='';after.plannedEnd='';delete after.start;
  }else{
   if(!core.isDateStr(input.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start||''))fail('请选择有效日期和开始时间。');
   const duration=input.duration??(before.type==='task'?core.taskTiming(before)?.minutes:undefined)??before.estimatedMinutes??30;
   if(!Number.isInteger(duration)||duration<1||duration>1439)fail('一次排期须为 1–1439 分钟，较长任务请继续拆解。');
   const end=clock((minute(input.start)+duration)%1440);
   if(before.type==='task'){Object.assign(after,{plannedDate:input.date,plannedStart:input.start,plannedEnd:end,deferred:false});delete after.start;}
   else Object.assign(after,{date:input.date,start:input.start,end,deferred:false});
  }
  const invalid=core.validateEvent(after);if(invalid.length)fail(invalid[0]);
  const conflicts=new Map(),timing=after.type==='task'?core.taskTiming(after):{date:after.date,start:after.start,end:after.end};
  if(timing){
   const start=minute(timing.start),end=minute(timing.end)+(minute(timing.end)<start?1440:0);
   for(let offset=0;offset<=(end>1440?1:0);offset++){
    const date=calendar.add(timing.date,offset),lo=offset?0:start,hi=offset?end-1440:Math.min(end,1440);
    for(const row of calendar.day(schedule,records,date).rows){
     if(row.eventId===before.id||!row.start)continue;
     const rEnd=row.end==='24:00'?1440:minute(row.end);
     if(lo<rEnd&&hi>minute(row.start))conflicts.set(row.eventId,{id:row.eventId,title:row.title,date});
    }
   }
  }
  return {id:before.id,title:before.title,before:clone(before),after,conflicts:[...conflicts.values()],late:!!(timing&&after.deadline&&timing.date>after.deadline),remove:!!input.remove};
 }
 function apply(schedule,records,plan,reverse=false){
  const next=clone(schedule),event=next.events.find(e=>e.id===plan.id),expected=reverse?plan.after:plan.before,replacement=reverse?plan.before:plan.after;
  if(!event||event.type!==expected.type||stamp(event)!==stamp(expected))fail('排期已在其他操作或设备中改变，请重新选择时间。');
  if(completed(event,records))fail('任务已经完成，无法覆盖它的排期。');
  if(event.type==='task'&&next.events.some(e=>e.parentId===event.id))fail('此任务已有子任务，请安排具体子任务。');
  for(const key of keys(event)){if(Object.hasOwn(replacement,key))event[key]=replacement[key];else delete event[key];}
  const invalid=core.validateSchedule(next);if(invalid.length)fail(invalid[0].errors?.[0]||'排期格式无效。');
  return next;
 }
 return {pool,preview,apply};
});
