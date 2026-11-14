const byId=id=>document.getElementById(id);
function tableRows(players){const table=document.createElement('table');for(const p of players){const tr=document.createElement('tr');for(const value of [p.name,p.level+'/15',p.score+' điểm',p.speedPoints+' điểm tốc độ']){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}return table;}
const classKey=a=>(a.className||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('vi');
const gradeKey=label=>/^(?:LỚP |KHỐI )?(1[012]|[1-9])(?!\d)/u.exec(label)?.[1];

function setupHomeworkReport(solo){
 const workSelect=byId('homework-select'),classSelect=byId('homework-class');
 const previousWork=workSelect.value,previousClass=classSelect.value;
 const works=[...solo.homework].sort((a,b)=>b.created-a.created);
 byId('homework-filters').hidden=!works.length;
 byId('homework-status').textContent=works.length
  ?works.length+' bài đã giao · Chọn bài và lớp để xem kết quả.'
  :'Chưa có bài đã giao. Vào Chơi cá nhân, nhập tên bài rồi bấm Tạo link bài tập.';
 workSelect.replaceChildren(...works.map(work=>new Option(
  work.name+' · '+new Date(work.created).toLocaleString('vi-VN')+' · '+work.id.slice(0,8),work.id)));
 if(!works.length)return;
 const target=location.hash.startsWith('#homework-')?location.hash.slice(10):'';
 if(works.some(work=>work.id===previousWork))workSelect.value=previousWork;
 else if(works.some(work=>work.id===target))workSelect.value=target;

 function render(){
  const work=works.find(entry=>entry.id===workSelect.value);
  const selection=classSelect.value;
  const attempts=solo.attempts.filter(a=>a.bankId===work.id&&(
   selection==='all'||selection==='missing'&&!classKey(a)||
   selection==='class:'+classKey(a)||selection.startsWith('grade:')&&selection.slice(6)===gradeKey(classKey(a))));
  renderHomework(work,attempts);
 }
 function updateClasses(selection){
  const attempts=solo.attempts.filter(a=>a.bankId===workSelect.value);
  const labels=[...new Set(attempts.map(classKey).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  const grades=[...new Set(labels.map(gradeKey).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  classSelect.replaceChildren(new Option('Tất cả lớp','all'),
   ...grades.map(grade=>new Option('Khối '+grade,'grade:'+grade)),
   ...labels.map(label=>new Option(label,'class:'+label)));
  if(attempts.some(a=>!classKey(a)))classSelect.add(new Option('Chưa ghi lớp','missing'));
  if([...classSelect.options].some(option=>option.value===selection))classSelect.value=selection;
  render();
 }
 workSelect.onchange=()=>updateClasses('all');
 classSelect.onchange=render;
 updateClasses(previousWork===workSelect.value?previousClass:'all');
}

function renderHomework(work,attempts){
   const article=document.createElement('article'),heading=document.createElement('h2');
   article.id='homework-'+work.id;heading.textContent=work.name;
   const completed=attempts.filter(a=>a.status==='finished').sort((a,b)=>b.level-a.level||b.score-a.score);
   const summary=document.createElement('p');summary.textContent=completed.length+' đã nộp · '+(attempts.length-completed.length)+' đang làm';
   if(!attempts.length)summary.textContent='Chưa có lượt làm trong nhóm này.';
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
    for(const value of [rank,a.name,a.className||'—',done?'Đã nộp':'Đang làm',count+'/15',a.level+'/15',a.score])row.insertCell().textContent=value;
   }
   scroll.append(table);article.append(heading,summary,link,scroll);byId('homework-results').replaceChildren(article);
}

async function load(){
 const [rooms,results]=await Promise.allSettled([window.sparkApi('my-rooms',{}),window.sparkApi('my-solo-results',{})]);
 byId('rooms').replaceChildren();
 byId('homework-results').replaceChildren();
 byId('homework-filters').hidden=true;
 if(rooms.status==='rejected')byId('status').textContent='Chưa tải được phòng trực tiếp: '+rooms.reason.message;
 if(results.status==='rejected')byId('homework-status').textContent='Chưa tải được báo cáo: '+results.reason.message;
 if(rooms.status==='fulfilled'){
  const live=rooms.value;
  byId('status').textContent=live.rooms.length+' phòng trực tiếp';
  for(const room of live.rooms){const a=document.createElement('article'),h=document.createElement('h2');h.textContent='Phòng trực tiếp · '+new Date(room.created).toLocaleString('vi-VN')+' · '+room.phase;a.append(h,tableRows(room.players));if(room.phase!=='finished'){const link=document.createElement('a');link.href='./game.html?teacher='+encodeURIComponent(room.pin);link.textContent='Mở lại phòng';link.onclick=()=>sessionStorage.setItem('millionaireTeacher',JSON.stringify({pin:room.pin,token:'firebase-uid-authorization'}));a.append(link);const end=document.createElement('button');end.textContent='⏹ Kết thúc phòng';end.style.marginLeft='16px';end.onclick=async()=>{if(!confirm('Kết thúc phòng này cho tất cả học sinh? Kết quả hiện có vẫn được giữ.'))return;end.disabled=true;try{await window.sparkApi('end-room',{pin:room.pin});await load();}catch(e){byId('status').textContent=e.message;end.disabled=false;}};a.append(end);}byId('rooms').append(a);}
 }
 if(results.status==='fulfilled'){
  const solo=results.value;
  setupHomeworkReport(solo);
  const homeworkIds=new Set(solo.homework.map(work=>work.id));
  for(const attempt of solo.attempts.filter(a=>!homeworkIds.has(a.bankId))){const a=document.createElement('article'),h=document.createElement('h2');h.textContent='Chơi cá nhân · '+new Date(attempt.created).toLocaleString('vi-VN')+' · '+(attempt.status==='finished'?'Hoàn thành':'Chưa hoàn thành');a.append(h,tableRows([attempt]));byId('rooms').append(a);}
 }
 if(location.hash.startsWith('#homework'))byId(location.hash.slice(1))?.scrollIntoView();
}
byId('login-history').onclick=async()=>{if(await window.googleTeacherSignIn())load();};
load();
