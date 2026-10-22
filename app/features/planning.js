import {html,attr} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {occur,taskPlanning as rules} from '../core.js';
import {frame} from '../shell/overlays.js';
import {clock,minutes,isDate} from '../lib/dates.js';

const timing=e=>e.type==='task'?occur.taskTiming(e):{date:e.date,start:e.start,end:e.end,minutes:(minutes(e.end)-minutes(e.start)+1440)%1440};
const duration=e=>timing(e)?.minutes||e.estimatedMinutes||30;
export function registerPlanning(app){
 let undo=[],redo=[],pending=null,drag=null,suppressUntil=0;
 const records=()=>app.state.doc.progress.records;
 const refresh=()=>app.setUi('planning',{undo:undo.length,redo:redo.length});
 const current=id=>app.state.doc.schedule.events.find(e=>e.id===id);
 function renderPool(state,date){
  const tasks=rules.pool(state.doc.schedule,state.doc.progress.records),parents=new Map(state.doc.schedule.events.map(e=>[e.id,e]));
  return html`<section class="planning-pool panel panel-pad" aria-label="待规划池">
   <div class="section-title"><h2>${icon('tasks')}待规划池</h2><span class="count">${tasks.length}</span></div><div class="planning-history"><button type="button" class="btn btn-quiet btn-sm" data-act="planning.undo"${attr('disabled',!undo.length)}>${icon('undo')}撤销</button><button type="button" class="btn btn-quiet btn-sm" data-act="planning.redo"${attr('disabled',!redo.length)}>重做</button></div>
   <p class="hint">拖动任务把手放进日历；也可点击“排期”选择时间。预计耗时可调整。</p>
   <form class="planning-goal row" data-submit="planning.goal"><label class="sr-only" for="planningGoal">要拆解的目标</label><input class="input" id="planningGoal" name="goal" maxlength="160" placeholder="输入目标，体验本地拆解示例" required data-uncontrolled><button class="btn btn-primary" type="submit">${icon('steps')}AI 拆解</button></form>
   <div class="planning-tasks">${tasks.slice(0,60).map(e=>html`<article class="planning-task" data-key="${'pool-'+e.id}"><button type="button" class="planning-handle icon-btn" data-plan-drag="${e.id}" data-act="planning.edit" data-id="${e.id}" aria-label="${'拖动或选择排期：'+e.title}">${icon('move')}</button><button type="button" class="planning-task-title" data-act="editor.openTask" data-id="${e.id}"><b>${e.title}</b><small>${e.parentId?parents.get(e.parentId)?.title||'上级任务':''}${e.estimatedMinutes?' · 预计 '+e.estimatedMinutes+' 分钟':''}${e.deadline?' · 截止 '+e.deadline:''}</small></button><button type="button" class="btn btn-quiet btn-sm" data-act="planning.edit" data-id="${e.id}" data-date="${date}">排期</button></article>`)}</div>
   ${tasks.length>60?html`<p class="hint">先显示 60 项，其余可在任务列表选择排期。</p>`:''}${!tasks.length?html`<p class="planning-empty">没有待排期的具体任务。可在任务列表添加待办。</p>`:''}
  </section>`;
 }
 function edit(id,date){
  const e=current(id);if(!e)return;const t=timing(e);app.setUi('planning',{error:''});
  app.overlays.show('planning-edit',{size:'small',label:'安排执行时间',render:()=>frame({title:'安排执行时间',subtitle:e.title,body:html`<form id="planningForm" class="stack" data-submit="planning.save" data-id="${id}" data-key="${'planform-'+id}"><label class="field">执行日期<input class="input" name="date" type="date" required value="${t?.date||date||app.state.route.params.date||app.today}" data-uncontrolled></label><div class="field-row"><label class="field">开始时间<input class="input" name="start" type="time" required value="${t?.start||'09:00'}" data-uncontrolled></label><label class="field">计划时长（分钟）<input class="input" name="duration" type="number" min="1" max="1439" required value="${duration(e)}" data-uncontrolled></label></div><p class="hint">只调整执行计划；截止日期、预计耗时和完成记录保留。超过午夜的部分会显示在次日。</p><p class="form-error" role="alert">${app.ui('planning').error||''}</p></form>`,foot:html`${e.type==='task'&&t?html`<button type="button" class="btn btn-quiet" data-act="planning.remove" data-id="${id}">移回待规划池</button>`:''}<button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="submit" form="planningForm" class="btn btn-primary">保存排期</button>`})});
 }
 function stage(input,operation='new',original=null){
  const plan=rules.preview(app.state.doc.schedule,records(),input);
  const restored=operation==='undo'?original?.before:operation==='redo'?original?.after:null;
  if(restored&&!timing(restored))plan.after=structuredClone(restored);
  pending={plan,input,operation,original};
  if(plan.conflicts.length||plan.late){
   app.overlays.show('planning-conflict',{size:'small',label:'核对排期',render:()=>frame({title:'核对这次排期',subtitle:plan.title,body:html`<div class="stack">${plan.conflicts.length?html`<p>这个时段与以下安排重叠：</p><ul>${plan.conflicts.map(e=>html`<li>${e.date} · ${e.title}</li>`)}</ul>`:''}${plan.late?html`<p class="callout callout-warn">执行日期晚于截止日期。原截止日期保持不变。</p>`:''}<p class="hint">可以保留重叠，也可以取消后选择其他时段。</p></div>`,foot:html`<button type="button" class="btn btn-quiet" data-act="planning.cancel">取消</button><button type="button" class="btn btn-primary" data-act="planning.accept">确认这个时段</button>`})});
  }else accept();
 }
 function accept(){
  if(!pending)return;const p=pending;
  const fresh=rules.preview(app.state.doc.schedule,records(),p.input);
  if(JSON.stringify(fresh.conflicts)!==JSON.stringify(p.plan.conflicts)||fresh.late!==p.plan.late){stage(p.input,p.operation,p.original);return;}
  app.commit(doc=>{doc.schedule=rules.apply(doc.schedule,doc.progress.records,p.plan);},{message:p.operation==='undo'?'已撤销排期':p.operation==='redo'?'已重做排期':p.plan.remove?'已移回待规划池':'已保存排期',detail:p.plan.title});
  if(p.operation==='undo'){undo.pop();redo.push(p.original);}else if(p.operation==='redo'){redo.pop();undo.push(p.original);}else{undo.push(p.plan);undo=undo.slice(-20);redo=[];}
  pending=null;app.overlays.close('planning-conflict');app.overlays.close('planning-edit');refresh();
 }
 function history(reverse){
  const original=(reverse?undo:redo).at(-1);if(!original)return;
  rules.apply(app.state.doc.schedule,records(),original,reverse);
  const target=reverse?original.before:original.after,t=timing(target);
  stage(t?{id:target.id,date:t.date,start:t.start,duration:t.minutes}:{id:target.id,remove:true},reverse?'undo':'redo',original);
 }
 app.view('planning',{renderPool,edit});
 app.on('planning.goal',form=>{const text=new FormData(form).get('goal').trim();if(text)app.getView('assistant').decompose('',text);});
 app.on('planning.edit',el=>edit(el.dataset.id,el.dataset.date));
 app.on('planning.save',form=>{try{const f=new FormData(form);stage({id:form.dataset.id,date:f.get('date'),start:f.get('start'),duration:Number(f.get('duration'))});}catch(error){app.setUi('planning',{error:error.message});}});
 app.on('planning.remove',el=>stage({id:el.dataset.id,remove:true}));
 app.on('planning.accept',accept);
 app.on('planning.cancel',()=>{pending=null;app.overlays.close('planning-conflict');});
 app.on('planning.undo',()=>history(true));app.on('planning.redo',()=>history(false));
 document.addEventListener('click',event=>{if(Date.now()<suppressUntil&&event.target.closest?.('[data-plan-drag],[data-plan-resize],.tgrid-col')){event.preventDefault();event.stopImmediatePropagation();}},true);
 function stop(){if(drag){cancelAnimationFrame(drag.frame);drag.ghost.remove();try{drag.handle.releasePointerCapture(drag.pointerId);}catch{}drag=null;}}
 function autoScroll(){
  const d=drag;if(!d?.active)return;
  if(d.lastY>innerHeight-80)window.scrollBy(0,10);else if(d.lastY<90)window.scrollBy(0,-10);
  updateDrag(d,d.lastX,d.lastY);d.frame=requestAnimationFrame(autoScroll);
 }
 function updateDrag(d,x,y){
  const col=document.elementFromPoint(x,y)?.closest?.('.tgrid-col');
  if(d.resize&&d.t){const span=Math.max(15,Math.min(1439,Math.round((d.minutes+(y-d.y+window.scrollY-d.scrollY)/d.hourH*60)/15)*15));d.input={id:d.id,date:d.t.date,start:d.t.start,duration:span};}
  else if(col){const r=col.getBoundingClientRect(),start=Math.max(0,Math.min(1425,Math.round(((y-r.top)/Number(col.dataset.hourH)*60+Number(col.dataset.first)*60)/15)*15));d.input={id:d.id,date:col.dataset.slotDate,start:clock(start),duration:d.minutes};}
  else d.input=null;
  d.ghost.textContent=d.input?d.input.date+' '+d.input.start+' · '+d.input.duration+' 分钟':'移到日历时段后松开';
  d.ghost.style.left=Math.max(8,Math.min(innerWidth-260,x+12))+'px';d.ghost.style.top=Math.max(8,y-50)+'px';
 }
 document.addEventListener('pointerdown',event=>{
  if(event.button!==0||app.state.route.view!=='calendar'||app.overlays.any())return;
  const handle=event.target.closest?.('[data-plan-drag],[data-plan-resize]');if(!handle)return;
  const id=handle.dataset.planDrag||handle.dataset.planResize,e=current(id);if(!e)return;
  const t=timing(e),col=handle.closest('.tgrid-col'),ghost=document.createElement('div');
  ghost.className='planning-ghost';ghost.hidden=true;ghost.setAttribute('aria-hidden','true');document.body.append(ghost);
  drag={id,handle,ghost,pointerId:event.pointerId,x:event.clientX,y:event.clientY,scrollY:window.scrollY,resize:!!handle.dataset.planResize,t,minutes:duration(e),hourH:Number(col?.dataset.hourH)||48,active:false,input:null,stamp:JSON.stringify(e)};
  handle.setPointerCapture(event.pointerId);event.stopPropagation();
 },{capture:true});
 document.addEventListener('pointermove',event=>{
  const d=drag;if(!d||d.pointerId!==event.pointerId)return;
  if(!d.active&&Math.hypot(event.clientX-d.x,event.clientY-d.y)<6)return;
  if(!d.active){d.active=true;d.frame=requestAnimationFrame(autoScroll);}event.preventDefault();d.ghost.hidden=false;d.lastX=event.clientX;d.lastY=event.clientY;
  updateDrag(d,event.clientX,event.clientY);
 },{passive:false});
 document.addEventListener('pointerup',event=>{
  const d=drag;if(!d||d.pointerId!==event.pointerId)return;
  const input=d.input,moved=d.active;stop();if(!moved)return;suppressUntil=Date.now()+650;event.preventDefault();event.stopPropagation();
  if(!input)return;
  app.attempt(()=>{if(JSON.stringify(current(d.id))!==d.stamp)throw new Error('拖动期间任务已改变，请重新拖动。');stage(input);});
 });
 document.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')stop();});
 app.onRender(state=>{if(state.route.view!=='calendar')stop();});
}
