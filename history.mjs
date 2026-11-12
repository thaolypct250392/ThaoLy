const byId=id=>document.getElementById(id);
function tableRows(players){const table=document.createElement('table');for(const p of players){const tr=document.createElement('tr');for(const value of [p.name,p.level+'/15',p.score+' điểm',p.speedPoints+' điểm tốc độ']){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}return table;}
async function load(){
 try{
  const [live,solo]=await Promise.all([window.sparkApi('my-rooms',{}),window.sparkApi('my-solo-results',{})]);
  byId('status').textContent=live.rooms.length+' phòng trực tiếp · '+solo.attempts.length+' lượt chơi cá nhân';byId('rooms').replaceChildren();
  for(const room of live.rooms){const a=document.createElement('article'),h=document.createElement('h2');h.textContent='Phòng trực tiếp · '+new Date(room.created).toLocaleString('vi-VN')+' · '+room.phase;a.append(h,tableRows(room.players));if(room.phase!=='finished'){const link=document.createElement('a');link.href='./game.html?teacher='+encodeURIComponent(room.pin);link.textContent='Mở lại phòng';link.onclick=()=>sessionStorage.setItem('millionaireTeacher',JSON.stringify({pin:room.pin,token:'firebase-uid-authorization'}));a.append(link);const end=document.createElement('button');end.textContent='⏹ Kết thúc phòng';end.style.marginLeft='16px';end.onclick=async()=>{if(!confirm('Kết thúc phòng này cho tất cả học sinh? Kết quả hiện có vẫn được giữ.'))return;end.disabled=true;try{await window.sparkApi('end-room',{pin:room.pin});await load();}catch(e){byId('status').textContent=e.message;end.disabled=false;}};a.append(end);}byId('rooms').append(a);}
  for(const attempt of solo.attempts){const a=document.createElement('article'),h=document.createElement('h2');h.textContent='Chơi cá nhân · '+new Date(attempt.created).toLocaleString('vi-VN')+' · '+(attempt.status==='finished'?'Hoàn thành':'Chưa hoàn thành');a.append(h,tableRows([attempt]));byId('rooms').append(a);}
 }catch(e){byId('status').textContent=e.message;}
}
byId('login-history').onclick=async()=>{if(await window.googleTeacherSignIn())load();};
load();
