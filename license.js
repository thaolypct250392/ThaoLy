function shareConnectionLink(url){const u=new URL(url,location.origin);const h=new URLSearchParams(location.hash.slice(1));if(h.has('cfg'))u.hash='cfg='+h.get('cfg');else{const raw=localStorage.getItem('millionaire.connection.v31');if(raw)u.hash='cfg='+btoa(String.fromCharCode(...new TextEncoder().encode(raw))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}return u.href;}
function homeworkShareLink(id){
 const url=new URL('./game.html',location.href);
 url.searchParams.set('solo','1');
 url.searchParams.set('homework',id);
 return shareConnectionLink(url.href);
}

const connectionReady=import('./connection.mjs');
window.teacherUid='';
const formulaReady=import('./formula-core.mjs?v=30.5.race').then(m=>{window.renderFormulaText=value=>m.renderRichText(value,{game:true});window.plainFormulaText=m.plainRichText;});
const firebaseReady=import('./spark-backend.mjs?v=30.5.assignment-results.6');
firebaseReady.catch(()=>{});
async function googleTeacherSignIn(){return (await firebaseReady).login();}
async function googleTeacherSignOut(){return (await firebaseReady).logout();}
async function signedHeaders(){return {};}
async function copySoloTeacherLink(){if(!await googleTeacherSignIn())return;try{await navigator.clipboard.writeText(shareConnectionLink(new URL('./game.html?solo=1&teacher='+encodeURIComponent(window.teacherUid),location.href).href));alert('Đã sao chép link chơi cá nhân.');}catch{alert('Cô hãy sao chép link trong mục giáo viên.');}}
async function sparkApi(action,body){await formulaReady;return (await firebaseReady).api(action,body);}

Object.assign(window,{sparkApi,googleTeacherSignIn,googleTeacherSignOut});
