// Shared by App, native miniapp and server. Rewards stay attached to real completions.
(function(root){
 'use strict';
 // The first ten cell IDs stay stable for existing gardens. Water is never buildable.
 const slotPoints=[[0,1],[1,0],[-1,0],[0,2],[1,1],[-2,0],[0,-2],[1,-1],[2,0],[-2,1],[1,-2],[2,-2],[-1,-1],[2,-1],[-2,2]];
 const kinds=['tree','flower','stone'],labels={tree:'树木',flower:'花',stone:'石头'};
 const copy=value=>JSON.parse(JSON.stringify(value));
 function hash(text){let n=2166136261;for(let i=0;i<String(text).length;i++){n^=String(text).charCodeAt(i);n=Math.imul(n,16777619);}return n>>>0;}
 function random(seed){let n=seed>>>0;return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
 function shuffle(list,rng){for(let i=list.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list;}
 function plan(seed,index){const rng=random(hash(seed+':scene:'+index)),emptyCount=Math.floor(rng()*4),holes=shuffle(Array.from({length:10},(_,i)=>i),rng).slice(0,emptyCount).sort((a,b)=>a-b),bag=kinds.slice();while(bag.length<10-emptyCount)bag.push(kinds[Math.floor(rng()*3)]);shuffle(bag,rng);return {index,name:['溪边草地','林间空地','石岸小岛'][index%3],holes,capacity:bag.length,bag,counts:Object.fromEntries(kinds.map(kind=>[kind,bag.filter(k=>k===kind).length]))};}
 const materialId=key=>'r'+String(key).split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
 const unique=records=>{const seen=new Set();return records.filter(r=>r&&typeof r.key==='string'&&!seen.has(r.key)&&seen.add(r.key));};
 function collisions(progress){const placements=progress.garden?.world?.placements||{},cells=new Map();for(const [id,cell] of Object.entries(placements)){if(typeof cell!=='string')continue;if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(id);}return [...cells].filter(([,ids])=>ids.length>1);}
 function reconcile(progress,accountSeed){
  progress.garden=progress.garden&&typeof progress.garden==='object'&&!Array.isArray(progress.garden)?progress.garden:{};
  const old=progress.garden.world||{},seed=accountSeed===undefined?(Number.isInteger(old.seed)?old.seed>>>0:hash('garden-local')):hash(accountSeed),placements=old.placements&&typeof old.placements==='object'&&!Array.isArray(old.placements)?{...old.placements}:{};
  progress.garden.world={version:2,seed,placements};
  const records=unique(progress.records),plans=new Map(),getPlan=i=>{if(!plans.has(i))plans.set(i,plan(seed,i));return plans.get(i);},used=new Set();
  const sorted=records.slice().sort((a,b)=>Number(!!placements[materialId(b.key)])-Number(!!placements[materialId(a.key)])||String(a.doneAt||a.date).localeCompare(String(b.doneAt||b.date))||a.key.localeCompare(b.key));
  const missing=[];
  for(const record of sorted){const reward=record.gardenReward,valid=reward&&Number.isInteger(reward.scene)&&reward.scene>=0&&reward.scene<=records.length&&Number.isInteger(reward.index)&&reward.index>=0&&getPlan(reward.scene).bag[reward.index]===reward.kind&&!used.has(reward.scene+':'+reward.index);if(valid)used.add(reward.scene+':'+reward.index);else missing.push(record);}
  let scene=0,index=0;
  for(const record of missing){while(index>=getPlan(scene).capacity||used.has(scene+':'+index)){if(++index>=getPlan(scene).capacity){scene++;index=0;}}record.gardenReward={scene,index,kind:getPlan(scene).bag[index]};used.add(scene+':'+index);}
  const byId=new Map(records.map(r=>[materialId(r.key),r])),occupied=new Set();
  for(const id of Object.keys(placements).sort()){const r=byId.get(id),cell=placements[id],match=typeof cell==='string'&&/^(\d+):(\d+)$/.exec(cell),s=match?Number(match[1]):-1,slot=match?Number(match[2]):-1;if(!r||!match||s!==r.gardenReward.scene||slot>=slotPoints.length||occupied.has(cell))delete placements[id];else occupied.add(cell);}
  return progress;
 }
 function view(input,page=0){
  const progress=reconcile(copy(input)),world=progress.garden.world,records=unique(progress.records),byId=new Map(records.map(r=>[materialId(r.key),r]));
  const earned=Math.max(0,...records.map(r=>r.gardenReward.scene))+1,scenes=[];let unlocked=1;
  for(let i=0;i<=earned;i++){const p=plan(world.seed,i),placed=Object.entries(world.placements).filter(([,cell])=>cell.startsWith(i+':')).length,complete=placed===p.capacity;scenes.push({...p,placed,complete,locked:i>=unlocked});if(i<unlocked&&complete)unlocked=i+2;}
  page=Math.max(0,Math.min(page,unlocked-1));const scene=scenes[page]||{...plan(world.seed,page),placed:0,complete:false,locked:false};
  const items=records.filter(r=>r.gardenReward.scene===page).map(r=>({...r,materialId:materialId(r.key),materialKind:r.gardenReward.kind,materialLabel:labels[r.gardenReward.kind],cell:world.placements[materialId(r.key)]||null}));
  const slots=Array.from({length:slotPoints.length},(_,slot)=>{const cell=page+':'+slot,id=Object.keys(world.placements).find(id=>world.placements[id]===cell);return {slot,cell,empty:false,record:id?items.find(r=>r.materialId===id):null};});
  return {progress,world,records,scene,page,unlocked,scenes,items,inventory:items.filter(r=>!r.cell),slots,total:records.length,reserved:records.filter(r=>r.gardenReward.scene>=unlocked).length};
 }
 function place(progress,key,slot){reconcile(progress);const r=unique(progress.records).find(r=>r.key===key);if(!r)throw new Error('这份素材对应的完成已撤销。');const v=view(progress,r.gardenReward.scene),p=v.scene;if(r.gardenReward.scene>=v.unlocked)throw new Error('摆满当前场景后才能使用这份素材。');if(!Number.isInteger(slot)||slot<0||slot>=slotPoints.length)throw new Error('请选择岛上的陆地位置。');const cell=p.index+':'+slot,id=materialId(key);if(Object.entries(progress.garden.world.placements).some(([other,c])=>other!==id&&c===cell))throw new Error('这个位置已有素材，请选其他位置。');progress.garden.world.placements[id]=cell;return view(progress,p.index);}
 function remove(progress,key){reconcile(progress);delete progress.garden.world.placements[materialId(key)];}
 function summary(progress,date){const records=unique(progress.records).filter(r=>r.date===date),result={tree:0,flower:0,stone:0,total:records.length};for(const r of records)if(kinds.includes(r.gardenReward?.kind))result[r.gardenReward.kind]++;return result;}
 const api={slotPoints,kinds,labels,hash,plan,materialId,reconcile,view,place,remove,summary,collisions};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.TTGardenWorld=api;
})(typeof globalThis==='object'?globalThis:this);
