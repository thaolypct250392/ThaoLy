const byId=id=>document.getElementById(id);
function tableRows(players){const table=document.createElement('table');for(const p of players){const tr=document.createElement('tr');for(const value of [p.name,p.level+'/15',p.score+' điểm',p.speedPoints+' điểm tốc độ']){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}return table;}
function setupHomeworkReport(solo){
 const select=byId('homework-select'),previous=select.value;
 const works=[...solo.homework].sort((a,b)=>a.name.localeCompare(b.name,'vi')||b.created-a.created);
 const names=new Map();
 for(const work of works)names.set(work.name,(names.get(work.name)||0)+1);
 byId('homework-filters').hidden=!works.length;
 byId('homework-status').textContent=works.length?'':'Chưa có bài đã giao. Vào Chơi cá nhân rồi bấm Tạo link bài tập.';
 select.replaceChildren(new Option('— Chọn tên bài tập —',''),...works.map(work=>new Option(
  names.get(work.name)>1?work.name+' · '+new Date(work.created).toLocaleString('vi-VN')+' · '+work.id.slice(0,8):work.name,work.id)));
 const target=location.hash.startsWith('#homework-')?location.hash.slice(10):'';
 const wanted=select.dataset.initialized?previous:target;
 if(works.some(work=>work.id===wanted))select.value=wanted;
 select.dataset.initialized='true';
 select.onchange=()=>{
  const work=works.find(entry=>entry.id===select.value);
  if(!work){byId('homework-results').replaceChildren();return;}
  renderHomework(work,solo.attempts.filter(attempt=>attempt.bankId===work.id));
 };
 select.onchange();
}

function renderHomework(work,attempts){
   const article=document.createElement('article'),heading=document.createElement('h2');
   article.id='homework-'+work.id;heading.textContent=work.name;
   const completed=attempts.filter(a=>a.status==='finished').sort((a,b)=>b.level-a.level||b.score-a.score);
   const summary=document.createElement('p');
   summary.textContent='Chưa ghi nhận lượt làm qua link của bài này.';
   const link=document.createElement('a');link.href=shareConnectionLink(new URL('./game.html?solo=1&homework='+encodeURIComponent(work.id),location.href).href);link.textContent='Mở link bài tập';
   const pending=attempts.filter(a=>a.status!=='finished');
   const scroll=document.createElement('div');scroll.className='report-scroll';
   const table=document.createElement('table');
   const columns=['Hạng','Học sinh','Lớp','Trạng thái','Đã làm','Đúng','Tổng điểm'];
   const header=table.createTHead().insertRow();
   for(const label of columns){const cell=document.createElement('th');cell.scope='col';cell.textContent=label;header.append(cell);}
   const body=table.createTBody();
   for(const a of [...completed,...pending]){
    const done=a.status==='finished',rank=done?1+completed.filter(b=>b.level>a.level||b.level===a.level&&b.score>a.score).length:'—';
    const count=done?15:a.index+(a.status==='answered'?1:0);
    const row=body.insertRow();
    row.className=done?'submitted':'in-progress';
    for(const value of [rank,a.name,a.className||'—',done?'Đã nộp':'Đang làm',count+'/15',a.level+'/15',a.score])row.insertCell().textContent=value;
    row.cells[3].className=done?'done':'pending';
   }
   scroll.append(table);article.append(heading,link,attempts.length?scroll:summary);byId('homework-results').replaceChildren(article);
}

let reportLoad=0;
async function load(){
 const current=++reportLoad;
 const [rooms,results]=await Promise.allSettled([window.sparkApi('my-rooms',{}),window.sparkApi('my-solo-results',{})]);
 if(current!==reportLoad)return;
 byId('rooms').replaceChildren();
 byId('homework-results').replaceChildren();
 byId('homework-filters').hidden=true;
 if(rooms.status==='rejected')byId('status').textContent='Chưa tải được phòng trực tiếp: '+rooms.reason.message;
 if(results.status==='rejected'){
  byId('homework-status').textContent='Chưa tải được báo cáo: '+results.reason.message;
 }
 if(rooms.status==='fulfilled'){
  const live=rooms.value;
  byId('status').textContent=live.rooms.length+' phòng trực tiếp';
  for(const room of live.rooms){const a=document.createElement('article'),h=document.createElement('h2');h.textContent='Phòng trực tiếp · '+new Date(room.created).toLocaleString('vi-VN')+' · '+room.phase;a.append(h,tableRows(room.players));if(room.phase!=='finished'){const link=document.createElement('a');link.href='./game.html?teacher='+encodeURIComponent(room.pin);link.textContent='Mở lại phòng';link.onclick=()=>sessionStorage.setItem('millionaireTeacher',JSON.stringify({pin:room.pin,token:'firebase-uid-authorization'}));a.append(link);const end=document.createElement('button');end.textContent='⏹ Kết thúc phòng';end.style.marginLeft='16px';end.onclick=async()=>{if(!confirm('Kết thúc phòng này cho tất cả học sinh? Kết quả hiện có vẫn được giữ.'))return;end.disabled=true;try{await window.sparkApi('end-room',{pin:room.pin});await load();}catch(e){byId('status').textContent=e.message;end.disabled=false;}};a.append(end);}byId('rooms').append(a);}
 }
 if(results.status==='fulfilled'){
  const solo=results.value;
  setupHomeworkReport(solo);

 }
 if(current===1&&location.hash.startsWith('#homework'))byId(location.hash.slice(1))?.scrollIntoView();
}
byId('login-history').onclick=async()=>{if(await window.googleTeacherSignIn())await load();};
load();
setInterval(()=>{if(document.visibilityState==='visible')load();},30000);
