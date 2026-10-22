// Shared by Web, native miniapp and the authenticated workspace API.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TTPeriodTracker=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const symptoms=['腹痛','腰酸','疲倦','头痛','乳房胀痛','情绪变化','腹胀'];
 const flows=['未记录','少量','适中','较多'];
 const copy=x=>JSON.parse(JSON.stringify(x));
 const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2100-12-31')return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
 const day=value=>Date.parse(value+'T00:00:00Z')/86400000;
 const distance=(a,b)=>Math.round(day(b)-day(a));
 const add=(value,n)=>new Date((day(value)+n)*86400000).toISOString().slice(0,10);
 const active=tracker=>(tracker?.records||[]).filter(r=>!r.deletedAt).slice().sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
 function overlaps(records){const sorted=records.filter(r=>!r.deletedAt).slice().sort((a,b)=>a.start.localeCompare(b.start));for(let i=1;i<sorted.length;i++)if(!sorted[i-1].end||sorted[i].start<=sorted[i-1].end)return [[sorted[i-1].id,sorted[i].id]];return [];}
 function validate(tracker,maxDate){
  const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(!plain(tracker)||!Array.isArray(tracker.records)||tracker.records.length>2000)return '经期记录格式不正确或数量超过上限。';
  if(tracker.predictionPaused!==undefined&&typeof tracker.predictionPaused!=='boolean')return '预估设置格式不正确。';
  if(tracker.phaseCycleDays!==undefined&&(!Number.isInteger(tracker.phaseCycleDays)||tracker.phaseCycleDays<21||tracker.phaseCycleDays>45))return '周期示意长度请选择 21–45 天。';
  const ids=new Set();
  for(const r of tracker.records){
   if(!plain(r)||typeof r.id!=='string'||!/^period-[A-Za-z0-9_-]{1,80}$/.test(r.id)||ids.has(r.id))return '经期记录编号重复或格式不正确。';ids.add(r.id);
   if(!validDate(r.start)||r.end!==''&&!validDate(r.end))return '请选择有效的开始和结束日期。';
   if(r.end&&r.end<r.start)return '结束日期不能早于开始日期。';
   if(maxDate&&(r.start>maxDate||r.end&&r.end>maxDate))return '实际记录的日期不能晚于今天。';
   if(!flows.includes(r.flow)||!Array.isArray(r.symptoms)||r.symptoms.length>symptoms.length||new Set(r.symptoms).size!==r.symptoms.length||!r.symptoms.every(s=>symptoms.includes(s)))return '请从现有选项选择经量和症状。';
   if(typeof r.note!=='string'||r.note.length>1000)return '备注最多填写 1000 个字。';
   if(r.excludeFromPrediction!==undefined&&typeof r.excludeFromPrediction!=='boolean')return '间隔预估选项格式不正确。';
   if(r.planEnd!==undefined&&r.planEnd!==''&&(!validDate(r.planEnd)||r.planEnd<r.start||distance(r.start,r.planEnd)>14))return '预填结束日期应在首日起 1–15 天内。';
   if(r.quickOpen!==undefined&&typeof r.quickOpen!=='boolean')return '经期结束状态格式不正确。';
   if(r.dayEntries!==undefined){
    if(!Array.isArray(r.dayEntries)||r.dayEntries.length>2000)return '逐日记录格式不正确。';
    const dates=new Set();for(const d of r.dayEntries){if(!plain(d)||!validDate(d.date)||dates.has(d.date)||d.date<r.start||r.end&&d.date>r.end||maxDate&&d.date>maxDate||!flows.includes(d.flow)||!Array.isArray(d.symptoms)||new Set(d.symptoms).size!==d.symptoms.length||!d.symptoms.every(s=>symptoms.includes(s)))return '逐日经量或症状格式不正确。';dates.add(d.date);}
   }
   if(r.omittedDates!==undefined&&(!Array.isArray(r.omittedDates)||r.omittedDates.length>2000||new Set(r.omittedDates).size!==r.omittedDates.length||r.omittedDates.some(d=>!validDate(d)||d<=r.start||r.end&&d>=r.end||maxDate&&d>maxDate||r.dayEntries?.some(e=>e.date===d))))return '清除的日期格式不正确。';
   for(const field of ['updatedAt','deletedAt'])if(r[field]!==undefined&&(typeof r[field]!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(r[field])||!Number.isFinite(Date.parse(r[field]))))return '记录时间格式不正确。';
  }
  if(overlaps(tracker.records).length)return '日期与已有记录重叠；请先调整已有记录，未结束的记录需先填结束日期。';
  return '';
 }
 function save(tracker,entry,maxDate=today()){
  const next=copy(tracker||{records:[]});const record={id:entry.id,start:entry.start,end:entry.end||'',flow:entry.flow||flows[0],symptoms:entry.symptoms||[],note:entry.note||'',updatedAt:new Date().toISOString()};
  if(entry.excludeFromPrediction!==undefined)record.excludeFromPrediction=entry.excludeFromPrediction;
  const index=next.records.findIndex(r=>r.id===record.id),previous=next.records[index];
  for(const field of ['dayEntries','omittedDates','quickOpen','planEnd'])if(entry[field]!==undefined)record[field]=copy(entry[field]);else if(previous?.[field]!==undefined)record[field]=copy(previous[field]);
  if(record.dayEntries)record.dayEntries=record.dayEntries.filter(d=>d.date>=record.start&&(!record.end||d.date<=record.end));
  if(record.omittedDates)record.omittedDates=record.omittedDates.filter(d=>d>record.start&&(!record.end||d<record.end)&&!record.dayEntries?.some(e=>e.date===d));
  if(index<0)next.records.push(record);else next.records[index]=record;
  const error=validate(next,maxDate);if(error)throw new Error(error);return next;
 }
 function remove(tracker,id){const next=copy(tracker),r=next.records.find(r=>r.id===id);if(!r||r.deletedAt)throw new Error('这条记录已不存在，请刷新。');r.deletedAt=new Date().toISOString();r.updatedAt=r.deletedAt;return next;}
 function restore(tracker,id,maxDate=today()){const next=copy(tracker),r=next.records.find(r=>r.id===id);if(!r||!r.deletedAt)throw new Error('这条记录无需恢复。');delete r.deletedAt;r.updatedAt=new Date().toISOString();const error=validate(next,maxDate);if(error)throw new Error(error);return next;}
 const recordDays=r=>distance(r.start,r.end)+1-(r.omittedDates?.length||0);
 const recordSymptoms=r=>symptoms.filter(s=>r.symptoms.includes(s)||r.dayEntries?.some(d=>d.symptoms.includes(s)));
 function dayAt(tracker,date,maxDate=today()){
  const record=(tracker?.records||[]).find(r=>!r.deletedAt&&r.start<=date&&date<=(r.end||maxDate)&&!r.omittedDates?.includes(date));
  if(!record)return {date,recordId:'',actual:false,flow:'未记录',symptoms:[]};
  const detail=record.dayEntries?.find(d=>d.date===date);
  return {date,recordId:record.id,actual:true,flow:detail?.flow||record.flow,symptoms:copy(detail?.symptoms||record.symptoms)};
 }
 function logDay(tracker,date,options={},maxDate=today()){
  if(!validDate(date)||date>maxDate)throw new Error('只能记录今天或过去的实际日期。');
  const next=copy(tracker||{records:[]}),records=active(next),old=dayAt(next,date,maxDate);
  let r=records.find(r=>r.start<=date&&date<=(r.end||maxDate));
  const planned=!r&&records.find(r=>r.quickOpen&&r.planEnd&&date>=r.start&&date<=r.planEnd);
  if(planned){r=next.records.find(x=>x.id===planned.id);if(date>r.end){for(let d=add(r.end,1);d<date;d=add(d,1))r.omittedDates=[...(r.omittedDates||[]),d];r.end=date;}}
  if(!r){
   const left=records.find(r=>r.end&&add(r.end,1)===date),right=records.find(r=>add(date,1)===r.start);
   if(left){r=next.records.find(x=>x.id===left.id);r.end=date;r.quickOpen=true;}
   else if(right){r=next.records.find(x=>x.id===right.id);r.start=date;}
   else{let id='period-day-'+date.replaceAll('-',''),n=1;while(next.records.some(x=>x.id===id))id='period-day-'+date.replaceAll('-','')+'-'+n++;r={id,start:date,end:date,flow:'未记录',symptoms:[],note:'',quickOpen:true};if(options.autoPlan){const following=records.find(x=>x.start>date);r.planEnd=following&&following.start<=add(date,6)?add(following.start,-1):add(date,6);}next.records.push(r);}
   if(left&&right){
    if(distance(right.start,right.end||maxDate)>1990)throw new Error('这次记录跨度较长，请从历史记录编辑日期。');
    const secondary=next.records.find(x=>x.id===right.id),rightEntries=[];
    for(let d=right.start;d<=(right.end||maxDate);d=add(d,1)){const detail=dayAt(tracker,d,maxDate);if(detail.actual)rightEntries.push({date:d,flow:detail.flow,symptoms:detail.symptoms});}
    r.dayEntries=[...(r.dayEntries||[]),...rightEntries];r.omittedDates=[...(r.omittedDates||[]),...(right.omittedDates||[])];r.end=right.end;r.quickOpen=!!(r.quickOpen||right.quickOpen);if(right.note&&right.note!==r.note)r.note=[r.note,right.note].filter(Boolean).join('\n');
    if(right.planEnd&&(!r.planEnd||r.planEnd<right.planEnd))r.planEnd=distance(r.start,right.planEnd)<=14?right.planEnd:'';
    secondary.deletedAt=new Date().toISOString();secondary.updatedAt=secondary.deletedAt;secondary.mergedInto=r.id;
   }
  }else r=next.records.find(x=>x.id===r.id);
  if(r.planEnd&&r.planEnd<r.start)r.planEnd='';
  const flow=options.cycleFlow?flows[Math.min(3,Math.max(0,flows.indexOf(old.flow))+1)]:options.flow??(old.actual?old.flow:'少量');
  r.dayEntries=(r.dayEntries||[]).filter(d=>d.date!==date);r.dayEntries.push({date,flow,symptoms:copy(options.symptoms??old.symptoms)});r.dayEntries.sort((a,b)=>a.date.localeCompare(b.date));r.omittedDates=(r.omittedDates||[]).filter(d=>d!==date);r.updatedAt=new Date().toISOString();
  const error=validate(next,maxDate);if(error)throw new Error(error);return next;
 }
 // A range confirms actual days once; existing daily details and episode metadata survive.
 function logRange(tracker,from,to,maxDate=today()){
  if(!validDate(from)||!validDate(to)||from>maxDate||to>maxDate)throw new Error('只能选择今天或过去的实际日期。');
  const start=from<to?from:to,end=from<to?to:from;
  if(distance(start,end)>30)throw new Error('一次最多选择 31 天；更长的范围请在历史记录中编辑。');
  const next=copy(tracker||{records:[]}),records=active(next);
  const affected=records.filter(r=>r.start<=add(end,1)&&add(r.end||maxDate,1)>=start||r.quickOpen&&r.planEnd&&r.start<=end&&r.planEnd>=start);
  if(affected.length>1)throw new Error('选区涉及两次经期，请分别选择，或从历史记录调整。');
  let r=affected[0];
  if(!r){let id='period-range-'+start.replaceAll('-',''),n=1;while(next.records.some(x=>x.id===id))id='period-range-'+start.replaceAll('-','')+'-'+n++;r={id,start,end,flow:'未记录',symptoms:[],note:'',quickOpen:true,dayEntries:[],omittedDates:[]};const following=records.find(x=>x.start>end);r.planEnd=distance(start,end)<=14?(following&&following.start<=add(start,6)?add(following.start,-1):end>add(start,6)?end:add(start,6)):'';next.records.push(r);}
  else{
   const oldStart=r.start,oldEnd=r.end||maxDate;
   // Selecting inside a prefill may leave earlier unconfirmed days as gaps.
   if(start>add(oldEnd,1))for(let d=add(oldEnd,1);d<start;d=add(d,1))r.omittedDates=[...(r.omittedDates||[]),d];
   r.start=start<oldStart?start:oldStart;if(r.end)r.end=end>oldEnd?end:oldEnd;
   if(r.planEnd&&r.end&&r.planEnd<r.end)r.planEnd=distance(r.start,r.end)<=14?r.end:'';
   if(r.planEnd&&(distance(r.start,r.planEnd)>14||r.planEnd<r.start))r.planEnd='';
  }
  const entries=r.dayEntries||[];
  for(let d=start;d<=end;d=add(d,1))if(!dayAt(tracker,d,maxDate).actual)entries.push({date:d,flow:'少量',symptoms:[]});
  r.dayEntries=entries.sort((a,b)=>a.date.localeCompare(b.date));r.omittedDates=(r.omittedDates||[]).filter(d=>d<start||d>end);r.updatedAt=new Date().toISOString();
  const error=validate(next,maxDate);if(error)throw new Error(error);return next;
 }
 function removeDay(tracker,date,maxDate=today()){
  const next=copy(tracker),detail=dayAt(next,date,maxDate),r=next.records.find(r=>r.id===detail.recordId);if(!r)throw new Error('这一天还没有记录。');
  r.dayEntries=(r.dayEntries||[]).filter(d=>d.date!==date);r.omittedDates=r.omittedDates||[];
  if(r.start===date&&(r.end||maxDate)===date)return remove(next,r.id);
  if(date===r.start){r.start=add(date,1);while(r.omittedDates.includes(r.start))r.start=add(r.start,1);}
  else if(date===(r.end||maxDate)){r.end=add(date,-1);while(r.omittedDates.includes(r.end))r.end=add(r.end,-1);}
  else r.omittedDates.push(date);
  r.omittedDates=r.omittedDates.filter(d=>d>r.start&&(!r.end||d<r.end));r.updatedAt=new Date().toISOString();const error=validate(next,maxDate);if(error)throw new Error(error);return next;
 }
 function finish(tracker,id,maxDate=today()){const next=copy(tracker),r=next.records.find(x=>x.id===id&&!x.deletedAt);if(!r)throw new Error('这条记录已不存在。');r.quickOpen=false;r.planEnd='';if(!r.end)r.end=maxDate;r.updatedAt=new Date().toISOString();const error=validate(next,maxDate);if(error)throw new Error(error);return next;}
 function summary(tracker,date=today()){
  const records=active(tracker),history=records.slice(1).map((r,i)=>({id:r.id,start:records[i].start,end:r.start,days:distance(records[i].start,r.start),excluded:!!r.excludeFromPrediction})).slice(-6);
  const recent=history.filter(r=>!r.excluded).map(r=>r.days),mean=recent.length?Math.round(recent.reduce((a,b)=>a+b,0)/recent.length):null;
  const minimum=recent.length?Math.min(...recent):null,maximum=recent.length?Math.max(...recent):null,spread=recent.length?maximum-minimum:null;
  const durations=records.filter(r=>r.end&&!r.quickOpen).slice(-6).map(recordDays),duration=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null;
  const last=records[records.length-1],current=last&&(!last.end||last.quickOpen)?last:null;
  let estimate=null,estimateStatus='insufficient',estimateText='需要至少 3 次开始记录，形成 2 个可用间隔后再预估。';
  if(tracker?.predictionPaused){estimateStatus='paused';estimateText='已暂停日期预估，实际记录和历史回顾继续保留。';}
  else if(current){estimateStatus='ongoing';estimateText='本次经期尚未记录结束，先按实际日期记录。';}
  else if(recent.length>=2){
   if(recent.some(n=>n<15||n>90)||spread>14){estimateStatus='variable';estimateText='开始日期间隔差异较大，暂不显示日期预估。请核对是否有漏记或特殊情况。';}
   else{
    const candidate={center:add(last.start,mean),start:add(last.start,minimum-2),end:add(last.start,maximum+2)};
    if(candidate.end<date){estimateStatus='stale';estimateText='预估日期已过，补充实际记录后重新计算；不会自动顺延。';}
    else if(last.end>=candidate.start){estimateStatus='review';estimateText='记录的结束日期接近预估范围，请先核对记录。';}
    else{estimate=candidate;estimateStatus='ready';estimateText='根据最近 '+recent.length+' 个可用开始间隔估算，实际日期可能不同。';}
   }
  }
  const recentRecords=records.slice(-6),symptomCounts=symptoms.map(name=>({name,count:recentRecords.filter(r=>recordSymptoms(r).includes(name)).length})).filter(s=>s.count).sort((a,b)=>b.count-a.count);
  return {records:records.slice().reverse(),count:records.length,current,currentDay:current?distance(current.start,current.quickOpen?current.end:date)+1:null,cycleDays:mean,durationDays:duration,estimate,estimateText,estimateStatus,predictionPaused:!!tracker?.predictionPaused,history,minimum,maximum,spread,sampleSize:recent.length,excludedCount:history.length-recent.length,symptomCounts,symptomSampleSize:recentRecords.length,trash:(tracker?.records||[]).filter(r=>r.deletedAt&&!r.mergedInto).slice().sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt))};
 }
 function report(tracker,date=today()){
  const s=summary(tracker,date),records=s.records.slice(0,12);
  return '经期记录回顾 · '+date+'\n最近 '+records.length+' 次实际记录（最多 12 次，不含回收站）\n\n'+
   '可用开始间隔：'+s.sampleSize+' 个；平均 '+(s.cycleDays??'—')+' 天；范围 '+(s.minimum===null?'—':s.minimum+'–'+s.maximum)+' 天\n平均已结束经期：'+(s.durationDays??'—')+' 天\n'+s.estimateText+'\n\n'+
   records.map(r=>describe(r)+(r.excludeFromPrediction?'\n从上次开始到本次开始的间隔由用户排除预估':'')).join('\n\n')+'\n\n仅供记录回顾，不用于诊断或避孕。症状未选择不代表未发生。';
 }
 const phaseNames={menstrual:'经期',follicular:'卵泡期（经后）',ovulatory:'排卵参考窗口',luteal:'黄体期'};
 function phaseInfo(tracker,date=today()){
  const info=summary(tracker,date),last=active(tracker).at(-1);
  const stable=info.sampleSize>=2&&info.minimum>=15&&info.maximum<=90&&info.spread<=14;
  const blocked=info.sampleSize>=2&&!stable;
  const cycleDays=stable?info.cycleDays:(tracker?.phaseCycleDays||28);
  return {enabled:!!last&&!tracker?.predictionPaused&&!blocked,cycleDays,source:stable?'history':tracker?.phaseCycleDays?'custom':'default',text:tracker?.predictionPaused?'已暂停周期阶段估算。':blocked?'开始间隔差异较大，暂不标注周期阶段。':!last?'选择一次经期首日后显示周期阶段。':stable?'周期阶段参考最近 '+info.sampleSize+' 个实际间隔（平均 '+cycleDays+' 天）。':'周期示意暂按 '+cycleDays+' 天'+(tracker?.phaseCycleDays?'（你设置的长度）':'（默认值，可调整）')+'，尚非个人预测。'};
 }
 function phaseAt(tracker,value,date=today(),basis=phaseInfo(tracker,date)){
  const detail=dayAt(tracker,value,date),records=active(tracker);
  const planned=records.find(r=>r.quickOpen&&r.planEnd&&value>=r.start&&value<=r.planEnd);
  if(detail.actual)return {phase:'menstrual',phaseLabel:'已记录经期',planned:false};
  if(planned)return {phase:'menstrual',phaseLabel:'预填经期 · 待确认',planned:true,planRecordId:planned.id};
  if(!basis.enabled)return {phase:'',phaseLabel:'',planned:false};
  const r=records.filter(r=>r.start<=value).at(-1);if(!r)return {phase:'',phaseLabel:'',planned:false};
  const next=records.find(x=>x.start>r.start),nextStart=next?.start||add(r.start,basis.cycleDays);
  const nextEnd=add(nextStart,6);
  if(value>=nextStart){if(!next&&value<=nextEnd&&nextEnd>=date)return {phase:'menstrual',phaseLabel:'下次经期参考 · 未确认',planned:false};return {phase:'',phaseLabel:'',planned:false};}
  const periodEnd=r.quickOpen&&r.planEnd?r.planEnd:r.end||date;
  // NHS: ovulation commonly occurs 10–16 days before the next period; no exact ovulation day.
  const windowStart=add(nextStart,-16),windowEnd=add(nextStart,-10);
  if(periodEnd>=windowStart)return {phase:'',phaseLabel:'',planned:false};
  const phase=value<=periodEnd?'':value<windowStart?'follicular':value<=windowEnd?'ovulatory':'luteal';
  return {phase,phaseLabel:phase?phaseNames[phase]+' · '+(basis.source==='history'?'估算':'示意'):'',planned:false};
 }
 function setPlanEnd(tracker,id,value,maxDate=today()){
  const next=copy(tracker),r=next.records.find(x=>x.id===id&&!x.deletedAt);if(!r||!r.quickOpen)throw new Error('这次经期已结束，请重新查看记录。');
  if(!validDate(value)||value<r.start||distance(r.start,value)>14)throw new Error('预填结束日期应在首日起 1–15 天内。');
  if(r.end&&value<r.end)throw new Error('预填范围不能早于已经确认的日期；实际结束请用“记录结束”。');
  const nextRecord=active(next).find(x=>x.start>r.start);if(nextRecord&&value>=nextRecord.start)throw new Error('预填范围与另一次经期重叠，请缩短范围。');
  r.planEnd=value;r.updatedAt=new Date().toISOString();const error=validate(next,maxDate);if(error)throw new Error(error);return next;
 }
 function month(tracker,value,date=today()){
  const first=value+'-01';if(!validDate(first))throw new Error('月份不正确。');
  const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),length=new Date(Date.UTC(year,month,0)).getUTCDate(),offset=(new Date(first+'T00:00:00Z').getUTCDay()+6)%7;
  const info=summary(tracker,date),basis=phaseInfo(tracker,date);
  const cells=Array.from({length:offset},(_,i)=>({key:'empty-'+i,blank:true}));
  for(let n=1;n<=length;n++){const value=first.slice(0,8)+String(n).padStart(2,'0'),detail=dayAt(tracker,value,date),phase=phaseAt(tracker,value,date,basis),predicted=!detail.actual&&info.estimate&&value>=info.estimate.start&&value<=info.estimate.end;cells.push({key:value,date:value,day:n,today:value===date,...detail,...phase,flowLevel:flows.indexOf(detail.flow),symptomCount:detail.symptoms.length,predicted:!!predicted,label:value+(detail.actual?' · 经量'+detail.flow+(detail.symptoms.length?' · '+detail.symptoms.join('、'):''):phase.phaseLabel?' · '+phase.phaseLabel:predicted?' · 预估开始范围':'')+(value===date?' · 今天':'')});}
  return cells;
 }
 function describe(value){if(value===undefined)return '已删除';if(Array.isArray(value))return value.length?value.map(describe).join('\n'):'没有记录';return value.start+' — '+(value.end||'尚未结束')+(value.quickOpen?'（待确认结束）':'')+(value.deletedAt?'（回收站）':'')+'\n整次默认经量：'+value.flow+(value.symptoms?.length?'；症状：'+value.symptoms.join('、'):'')+(value.dayEntries?.length?'\n逐日记录：\n'+value.dayEntries.map(d=>d.date+' · '+d.flow+(d.symptoms.length?' · '+d.symptoms.join('、'):'')).join('\n'):'')+(value.omittedDates?.length?'\n未记录经期的日期：'+value.omittedDates.join('、'):'')+(value.planEnd?'\n预填至 '+value.planEnd+'（未确认日期不计为实际）':'')+(value.note?'\n备注：'+value.note:'');}
 return {symptoms,flows,today,validDate,distance,add,active,overlaps,validate,save,remove,restore,summary,month,describe,report,dayAt,logDay,logRange,removeDay,finish,recordDays,recordSymptoms,phaseInfo,phaseAt,setPlanEnd,phaseNames};
});
