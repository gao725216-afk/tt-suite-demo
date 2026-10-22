// Shared task organization. Inbox membership is independent of execution dates.
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TTOrganizer=api;})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 var ID=/^[A-Za-z0-9_-]{1,100}$/;
 var fields=['listId','tagIds','priority','inbox'];
 function empty(){return {version:1,folders:[],lists:[],tags:[]};}
 function get(schedule){return schedule.organizer||empty();}
 function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;var d=new Date(value+'T12:00:00');return isFinite(d)&&d.getFullYear()===+value.slice(0,4)&&d.getMonth()+1===+value.slice(5,7)&&d.getDate()===+value.slice(8);}
 function addDays(value,offset){var d=new Date(value+'T12:00:00');d.setDate(d.getDate()+offset);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function metadataErrors(event){
  var errors=[];
  if(event.listId!==undefined&&(typeof event.listId!=='string'||event.listId!==''&&!ID.test(event.listId)))errors.push('清单 ID 格式不正确');
  if(event.inbox!==undefined&&typeof event.inbox!=='boolean')errors.push('收集箱状态必须是布尔值');
  if(event.priority!==undefined&&(!Number.isInteger(event.priority)||event.priority<0||event.priority>3))errors.push('优先级必须是 0–3 的整数');
  if(event.tagIds!==undefined&&(!Array.isArray(event.tagIds)||event.tagIds.length>20||event.tagIds.some(id=>typeof id!=='string'||!ID.test(id))||new Set(event.tagIds).size!==event.tagIds.length))errors.push('标签最多 20 项，ID 必须有效且不能重复');
  return errors;
 }
 function validate(schedule){
  var errors=[],org=get(schedule),plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(!plain(org)||org.version!==1)return ['分类数据版本不正确'];
  var limits={folders:100,lists:300,tags:500},sets={};
  Object.keys(limits).forEach(kind=>{
   sets[kind]=new Set();
   if(!Array.isArray(org[kind])||org[kind].length>limits[kind]){errors.push(kind+' 数量或格式不正确');return;}
   org[kind].forEach(item=>{
    if(!plain(item)||typeof item.id!=='string'||!ID.test(item.id)||sets[kind].has(item.id)){errors.push('分类 ID 必须有效且唯一');return;}
    sets[kind].add(item.id);
    if(typeof item.name!=='string'||!item.name.trim()||item.name.length>80)errors.push('分类名称须为 1–80 字');
    if(item.archived!==undefined&&typeof item.archived!=='boolean')errors.push('分类归档状态不正确');
    if(kind==='lists'&&item.folderId!==undefined&&(typeof item.folderId!=='string'||item.folderId!==''&&!ID.test(item.folderId)))errors.push('文件夹 ID 格式不正确');
   });
  });
  (Array.isArray(org.lists)?org.lists:[]).forEach(item=>{if(item&&item.folderId&&!sets.folders.has(item.folderId))errors.push('清单引用的文件夹不存在');});
  var events=(Array.isArray(schedule.events)?schedule.events:[]).concat((Array.isArray(schedule.trash)?schedule.trash:[]).map(row=>row&&row.event));
  events.forEach(event=>{
   if(!plain(event))return;
   errors=errors.concat(metadataErrors(event));
   if(event.listId&&!sets.lists.has(event.listId))errors.push('事项引用的清单不存在');
   if(Array.isArray(event.tagIds)&&event.tagIds.some(id=>!sets.tags.has(id)))errors.push('事项引用的标签不存在');
  });
  return errors;
 }
 function isInbox(event){return !event.listId&&event.inbox!==false;}
 function planned(event){return event.deferred?'':date(event.plannedDate)?event.plannedDate:date(event.start)?event.start:'';}
 function selectTasks(schedule,records,today,options){
  options=options||{};var view=options.view||'todo',doneKeys=new Set((records||[]).map(r=>r.key)),query=String(options.query||'').trim().toLocaleLowerCase(),last=addDays(today,6);
  return (schedule.events||[]).filter(event=>{
   if(event.type!=='task'&&!(event.type==='once'&&event.deferred))return false;
   var done=doneKeys.has(event.type==='task'?'task:'+event.id:event.id+':'+(event.date||today));
   if(view==='done'?!done:view!=='all'&&done)return false;
   if(view==='inbox'&&!isInbox(event))return false;
   var execution=planned(event),anchor=execution||event.deadline||'';
   if(view==='today'&&(event.deferred||anchor!==today))return false;
   if(view==='tomorrow'&&(event.deferred||anchor!==addDays(today,1)))return false;
   if(view==='next7'&&(event.deferred||!anchor||anchor<today||anchor>last))return false;
   if(view==='overdue'&&(!event.deadline||event.deadline>=today))return false;
   if(view==='unscheduled'&&execution)return false;
   if(view.startsWith('list:')&&event.listId!==view.slice(5))return false;
   if(view.startsWith('tag:')&&!(event.tagIds||[]).includes(view.slice(4)))return false;
   if(options.tagId&&!(event.tagIds||[]).includes(options.tagId))return false;
   if(options.priority!==undefined&&options.priority!==''&&Number(options.priority)!==(event.priority||0))return false;
   return !query||(event.title+' '+(event.note||'')).toLocaleLowerCase().includes(query);
  }).slice().sort((a,b)=>(options.sort==='priority'?(b.priority||0)-(a.priority||0):0)||String(planned(a)||a.deadline||'9999').localeCompare(String(planned(b)||b.deadline||'9999'))||a.id.localeCompare(b.id));
 }
 function upsert(schedule,kind,item){
  if(!['folders','lists','tags'].includes(kind))throw new Error('分类类型不正确');
  var org=get(schedule),next=Object.assign({},org),rows=org[kind].slice(),index=rows.findIndex(row=>row.id===item.id);
  var value=Object.assign({},index<0?{}:rows[index],item,{name:String(item.name||'').trim()});
  if(index<0)rows.push(value);else rows[index]=value;next[kind]=rows;
  var result=Object.assign({},schedule,{organizer:next}),errors=validate(result);if(errors.length)throw new Error(errors[0]);return result;
 }
 // Preserve optional fields when older cached clients save unrelated changes.
 // Current clients clear a value explicitly rather than omitting it.
 function preserve(prior,incoming){
  if(incoming.organizer===undefined)incoming.organizer=JSON.parse(JSON.stringify(get(prior)));
  var all=s=>(s.events||[]).concat((s.trash||[]).map(row=>row.event)),previous=new Map(all(prior).map(event=>[event.id,event]));
  all(incoming).forEach(event=>{var before=previous.get(event.id);if(before)fields.forEach(field=>{if(event[field]===undefined&&before[field]!==undefined)event[field]=JSON.parse(JSON.stringify(before[field]));});});
  return incoming;
 }
 return {empty:empty,get:get,validate:validate,metadataErrors:metadataErrors,isInbox:isInbox,selectTasks:selectTasks,upsert:upsert,preserve:preserve,fields:fields};
});
