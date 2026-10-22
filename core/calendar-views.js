/* Bounded calendar projections; dates are wall-calendar days, not 24-hour timers. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./occur'):root.TTOccur);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TTCalendarViews=api;})(typeof globalThis!=='undefined'?globalThis:this,function(core){
 'use strict';
 const modes=[{id:'days3',name:'3日',days:3},{id:'days5',name:'5日',days:5},{id:'weeks2',name:'2周',days:14},{id:'weeks4',name:'4周',days:28},{id:'year',name:'年'}],weekdays=['一','二','三','四','五','六','日'];
 const fail=message=>{throw new Error(message);};
 function valid(date){if(!core.isDateStr(date))fail('请选择有效的日历日期');return date;}
 function parts(date){valid(date);return date.split('-').map(Number);}
 function wall(date){const [y,m,d]=parts(date);return new Date(y,m-1,d);}
 function add(date,days){const [y,m,d]=parts(date),value=new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);return valid(value);}
 function monday(date){return add(date,-((wall(date).getDay()+6)%7));}
 function bounds(anchor,mode){valid(anchor);const choice=modes.find(m=>m.id===mode);if(!choice)fail('日历视图不存在');if(mode==='year')return {from:anchor.slice(0,4)+'-01-01',to:anchor.slice(0,4)+'-12-31',days:Number(anchor.slice(0,4))%4===0&&(Number(anchor.slice(0,4))%100!==0||Number(anchor.slice(0,4))%400===0)?366:365};const from=mode.startsWith('weeks')?monday(anchor):anchor;return {from,to:add(from,choice.days-1),days:choice.days};}
 function shift(anchor,mode,delta){if(![-1,1].includes(delta))fail('翻页方向无效');const range=bounds(anchor,mode);if(mode!=='year')return add(anchor,delta*range.days);const [y,m,d]=parts(anchor),end=new Date(Date.UTC(y+delta,m,0)).getUTCDate();return valid(String(y+delta).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(d,end)).padStart(2,'0'));}
 function context(schedule,records,hideDone){return {events:(schedule.events||[]).map(event=>{const task=event.type==='task',timing=task?core.taskTiming(event):null;return {event,planned:task?core.taskPlannedDate(event):'',timing,start:core.parseHHMM(task?timing?.start:event.start),end:core.parseHHMM(task?timing?.end:event.end),match:task?null:core.occurrenceMatcher(event)};}),done:new Set((records||[]).map(r=>r.key)),hideDone:!!hideDone};}
 const compare=(a,b)=>a.rank-b.rank||a.startMinute-b.startMinute||a.eventId.localeCompare(b.eventId)||a.key.localeCompare(b.key);
 function collect(ctx,date,limit){
  const day=wall(date),prior=add(date,-1),priorDay=wall(prior),rows=[];let count=0,timed=0,planned=0,deadlines=0,completed=0;
  function offer(e,source,kind,start,end,continued=false){const done=ctx.done.has(e.type==='task'?'task:'+e.id:e.id+':'+source);if(ctx.hideDone&&done)return;count++;if(done)completed++;if(kind==='deadline')deadlines++;else if(start===null)planned++;else timed++;
   if(limit===0)return;
   const row={key:e.id+':'+source+':'+date+':'+kind,eventId:e.id,sourceDate:source,displayDate:date,title:e.title,note:(e.note||'').slice(0,120),location:e.location||'',type:e.type,kind,done,continued,repeated:['weekly','custom'].includes(e.type),start:start===null?'':String(Math.floor(start/60)).padStart(2,'0')+':'+String(start%60).padStart(2,'0'),end:end===null?'':end===1440?'24:00':String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0'),startMinute:start===null?-1:start,rank:kind==='deadline'?0:start===null?1:2,deadline:e.deadline||'',deadlineToday:e.type==='task'&&e.deadline===date};
   if(limit===Infinity)rows.push(row);else{rows.push(row);rows.sort(compare);if(rows.length>limit)rows.pop();}
  }
  for(const prepared of ctx.events){
   const {event:e,start,end}=prepared;
   if(e.deferred)continue;
   if(e.type==='task'){
    const datePlanned=prepared.planned,timing=prepared.timing,onDay=datePlanned===date&&!(e.skip||[]).includes(date),continued=timing&&datePlanned===prior&&!(e.skip||[]).includes(prior)&&end>0&&end<start;
    if(onDay){if(timing)offer(e,date,'task',start,end>start?end:1440);else offer(e,date,'task',null,null);}
    if(continued)offer(e,prior,'task',0,end,true);
    if(e.deadline===date&&!onDay&&!continued)offer(e,date,'deadline',null,null);
   }else{
    if(start===end)continue;
    if(prepared.match(day))offer(e,date,'schedule',start,end>start?end:1440);
    if(end>0&&end<start&&prepared.match(priorDay))offer(e,prior,'schedule',0,end,true);
   }
  }
  if(limit===Infinity)rows.sort(compare);return {date,shortDate:date.slice(5),number:Number(date.slice(8)),weekday:weekdays[(day.getDay()+6)%7],count,timed,planned,deadlines,completed,level:count===0?0:count<=2?1:count<=5?2:3,rows,hidden:count-rows.length};
 }
 function day(schedule,records,date,options={}){return collect(context(schedule,records,options.hideDone),valid(date),Infinity);}
 function project(schedule,records,options){const {anchor,mode,today,hideDone=false}=options;valid(today);const range=bounds(anchor,mode),ctx=context(schedule,records,hideDone),days=[];let cursor=range.from;for(let i=0;i<range.days;i++){days.push({...collect(ctx,cursor,mode==='year'?0:3),today:cursor===today});if(i<range.days-1)cursor=add(cursor,1);}
  const months=[];if(mode==='year')for(let month=1;month<=12;month++){const prefix=anchor.slice(0,4)+'-'+String(month).padStart(2,'0'),inMonth=days.filter(d=>d.date.startsWith(prefix)),offset=(wall(inMonth[0].date).getDay()+6)%7,cells=Array.from({length:offset},(_,i)=>({key:prefix+'-blank-'+i,blank:true})).concat(inMonth.map(d=>({...d,key:d.date})));while(cells.length%7)cells.push({key:prefix+'-blank-'+cells.length,blank:true});months.push({id:prefix,label:month+'月',cells,activeDays:inMonth.filter(d=>d.count).length});}
  return {...range,mode,anchor,days,months,activeDays:days.filter(d=>d.count).length,marks:days.reduce((n,d)=>n+d.count,0)};
 }
 function resolve(schedule,records,displayDate,key,options={}){const row=day(schedule,records,displayDate,options).rows.find(r=>r.key===key);if(!row)fail('这项安排已变化，请刷新后重新选择');return row;}
 return {modes,weekdays,valid,add,monday,bounds,shift,project,day,resolve};
});
