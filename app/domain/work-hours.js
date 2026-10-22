// Planned work hours from completion snapshots (the "计划时长" side of the
// 工作时长 report). Pure functions with the same behaviour as the mini program
// (apps/wechat-miniapp/lib/work-hours.js): records are never rebuilt from the
// current events, so later edits do not rewrite history. Task durations that
// were never planned stay "unknown" instead of being guessed.
export function workHoursBounds(today,period){
 const d=new Date(today+'T12:00:00');
 const format=value=>[value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
 if(period==='all')return {from:'',to:today};
 if(period==='today')return {from:today,to:today};
 if(period==='week'){d.setDate(d.getDate()-(d.getDay()+6)%7);return {from:format(d),to:today};}
 d.setDate(1);return {from:format(d),to:today};
}
export function workHoursUsage(records,{from='',to='',group='item'}={}){
 const seen=new Set(),groups=new Map();let totalMinutes=0,recordCount=0,trackedCount=0,unknownCount=0;
 for(const record of records){
  if(!record||typeof record.key!=='string'||seen.has(record.key)||!['event','task'].includes(record.kind))continue;
  const date=record.date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
  const parsed=new Date(date+'T12:00:00');
  if(Number.isNaN(parsed.getTime())||[parsed.getFullYear(),String(parsed.getMonth()+1).padStart(2,'0'),String(parsed.getDate()).padStart(2,'0')].join('-')!==date)continue;
  if(from&&date<from||to&&date>to)continue;
  seen.add(record.key);recordCount++;
  const tracked=record.kind==='event'&&Number.isFinite(record.minutes)&&record.minutes>=0;
  if(tracked){totalMinutes+=record.minutes;trackedCount++;}else unknownCount++;
  const key=group==='day'?date:record.kind+':'+record.eventId;
  let row=groups.get(key);
  if(!row){row={key,title:group==='day'?date:record.title,count:0,minutes:0,tracked:0,unknown:0,firstDate:date,lastDate:date};groups.set(key,row);}
  row.count++;
  if(date<row.firstDate)row.firstDate=date;
  if(date>=row.lastDate){row.lastDate=date;if(group!=='day')row.title=record.title;}
  if(tracked){row.minutes+=record.minutes;row.tracked++;}else row.unknown++;
 }
 const rows=Array.from(groups.values()).sort((a,b)=>group==='day'?b.lastDate.localeCompare(a.lastDate):b.minutes-a.minutes||b.lastDate.localeCompare(a.lastDate)||String(a.title).localeCompare(String(b.title),'zh-CN'));
 return {rows,totalMinutes,recordCount,trackedCount,unknownCount};
}
export function workHoursCsv(rows,username,group){
 const cell=value=>'"'+String(value).replace(/^[\u0000-\u0020]*[=+\-@]/,"'$&").replaceAll('"','""')+'"';
 const body=[['人员',group==='day'?'完成日期':'事项','完成次数','累计计划时长（小时）','未记录时长的项数'],...rows.map(row=>[username,row.title,row.count,row.tracked?(row.minutes/60).toFixed(2):'',row.unknown])];
 return '\ufeff'+body.map(row=>row.map(cell).join(',')).join('\r\n');
}
