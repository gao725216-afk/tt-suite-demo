/* Projections over existing tasks. A move is an explicit, guarded field change. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./organizer'):root.TTOrganizer,typeof module==='object'&&module.exports?require('./task-workspace'):root.TTTaskWorkspace);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TTTaskViews=api;})(typeof globalThis!=='undefined'?globalThis:this,function(organizer,workspace){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),fields=['priority','deadline','listId','inbox'];
 const priorities=['未设置','低优先级','中优先级','高优先级'];
 const quadrants=[{id:'q1',name:'重要且紧急',hint:'优先处理',important:true,urgent:true},{id:'q2',name:'重要不紧急',hint:'留出时间',important:true,urgent:false},{id:'q3',name:'紧急不重要',hint:'评估投入',important:false,urgent:true},{id:'q4',name:'不紧急不重要',hint:'择时处理',important:false,urgent:false}];
 const bad=message=>{throw new Error(message);};
 function date(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
 function tomorrow(today){if(!date(today))bad('查看日期无效');return new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
 const value=(task,field)=>Object.hasOwn(task,field)?{present:true,value:copy(task[field])}:{present:false};
 const done=(records,id)=>(records||[]).some(r=>r.key==='task:'+id);
 const quadrant=(task,today)=>quadrants.find(q=>q.important===((task.priority||0)>=2)&&q.urgent===(date(task.deadline)&&task.deadline<=today)).id;
 function groups(schedule,mode,groupBy){
  if(mode==='quadrant')return copy(quadrants);
  if(mode!=='board'||!['priority','list'].includes(groupBy))bad('任务视图类型无效');
  if(groupBy==='priority')return [3,2,1,0].map(p=>({id:'p'+p,name:priorities[p],hint:p===0?'尚未设定优先级':'优先级 '+p}));
  return [{id:'@inbox',name:'收集箱',hint:'尚未整理'},{id:'@none',name:'不归清单',hint:'已整理'},...organizer.get(schedule).lists.filter(l=>!l.archived||(schedule.events||[]).some(e=>e.type==='task'&&e.listId===l.id)).map(l=>({id:'list:'+l.id,name:l.name+(l.archived?'（已归档）':''),hint:'清单',archived:!!l.archived}))];
 }
 function project(schedule,records,today,options={}){
  tomorrow(today);const mode=options.mode||'board',groupBy=options.groupBy||'priority',visible=organizer.selectTasks(schedule,records,today,options),columns=groups(schedule,mode,groupBy).map(g=>({...g,tasks:[]})),map=new Map(columns.map(g=>[g.id,g]));
  for(const info of workspace.outline(schedule,visible.filter(e=>e.type==='task'))){const e=info.event,key=mode==='quadrant'?quadrant(e,today):groupBy==='priority'?'p'+(e.priority||0):e.listId?'list:'+e.listId:organizer.isInbox(e)?'@inbox':'@none';map.get(key)?.tasks.push({...info,done:done(records,e.id)});}
  return {mode,groupBy,columns,total:columns.reduce((n,c)=>n+c.tasks.length,0),excluded:visible.filter(e=>e.type!=='task').length};
 }
 function planMove(schedule,records,today,eventId,destination){
  tomorrow(today);const task=(schedule.events||[]).find(e=>e.id===eventId&&e.type==='task');if(!task)bad('任务已不存在');if(done(records,eventId))bad('已完成的任务请先撤销完成，再移动');
  const {mode,groupBy='priority',target}=destination,group=groups(schedule,mode,groupBy).find(g=>g.id===target);if(!group||group.archived)bad('目标分组不存在或已归档');const patch={};
  if(mode==='board'&&groupBy==='priority')patch.priority=Number(target.slice(1));
  else if(mode==='board'){patch.listId=target.startsWith('list:')?target.slice(5):'';patch.inbox=target==='@inbox';}
  else {
   const important=(task.priority||0)>=2;if(important!==group.important)patch.priority=group.important?2:1;
   const urgent=date(task.deadline)&&task.deadline<=today;
   const deadline=Object.hasOwn(destination,'deadline')?destination.deadline:urgent===group.urgent?task.deadline||'':group.urgent?today:tomorrow(today);
   if(deadline!==''&&!date(deadline))bad('请选择有效的截止日期');if((!!deadline&&deadline<=today)!==group.urgent)bad(group.urgent?'紧急象限的截止日需为今天或以前':'非紧急象限的截止日需晚于今天，或留空');
   if((task.deadline||'')!==deadline)patch.deadline=deadline;
  }
  const changes=Object.entries(patch).filter(([field,v])=>!same(value(task,field),{present:true,value:v})).map(([field,v])=>({field,before:value(task,field),after:{present:true,value:v}}));
  return {version:1,eventId,title:task.title,today,target:group.name,guard:Object.fromEntries(fields.map(f=>[f,value(task,f)])),changes};
 }
 function describe(schedule,plan){
  const display=(field,state)=>{const v=state.present?state.value:undefined;if(field==='priority')return priorities[v||0];if(field==='deadline')return v||'无截止日期';if(field==='inbox')return v===false?'已整理':'尚未整理';return v?organizer.get(schedule).lists.find(l=>l.id===v)?.name||'清单已不存在':'不归清单';};
  return plan.changes.map(c=>({field:c.field,label:{priority:'优先级',deadline:'截止日期',listId:'所属清单',inbox:'整理状态'}[c.field],before:display(c.field,c.before),after:display(c.field,c.after)}));
 }
 function apply(schedule,records,plan,undo=false){
  if(!plan||plan.version!==1||!date(plan.today)||!Array.isArray(plan.changes)||!plan.changes.length||plan.changes.length>4||new Set(plan.changes.map(c=>c.field)).size!==plan.changes.length||plan.changes.some(c=>!fields.includes(c.field)||!c.before||!c.after||typeof c.before.present!=='boolean'||typeof c.after.present!=='boolean'))bad('没有可应用的任务移动');
  const next=copy(schedule),task=(next.events||[]).find(e=>e.id===plan.eventId&&e.type==='task');if(!task)bad('任务已不存在，无法应用或撤销');
  if(done(records,plan.eventId))bad('任务已完成，请先撤销完成后再整理');
  if(!undo&&(!plan.guard||fields.some(f=>!same(value(task,f),plan.guard[f]))))bad('任务的分类或截止日已变化，请重新选择移动位置');
  for(const change of plan.changes){if(!same(value(task,change.field),undo?change.after:change.before))bad('该字段已被再次修改，无法覆盖；请重新整理');const state=undo?change.before:change.after;if(state.present)task[change.field]=copy(state.value);else delete task[change.field];}
  const errors=organizer.validate(next).concat(workspace.validate(next));if(task.deadline!==undefined&&task.deadline!==''&&!date(task.deadline))errors.push('截止日期无效');if(errors.length)bad(errors[0]);return next;
 }
 return {project,planMove,apply,describe,quadrant,quadrants,priorities,tomorrow};
});
