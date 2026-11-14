import {buyerAuth,buyerDb,buyerLogin,buyerLogout} from './buyer-license.mjs';
import {buyerAdmin} from './buyer-config.mjs';
import {collection,getDocs,doc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
const $=id=>document.getElementById(id);const status=s=>$('status').textContent=s;
function admin(){if(buyerAuth.currentUser?.email?.toLowerCase()!==buyerAdmin||!buyerAuth.currentUser.emailVerified)throw Error('Chỉ Gmail '+buyerAdmin+' được quản trị.');}
async function list(){admin();const snap=await getDocs(collection(buyerDb,'buyerLicenses'));$('list').replaceChildren();for(const d of snap.docs.sort((a,b)=>a.id.localeCompare(b.id))){const li=document.createElement('li');li.textContent=d.id+' — '+(d.data().enabled?'Được sử dụng':'Đã khóa');$('list').append(li);}}
async function run(fn){try{await fn();}catch(e){status(e.message);}}
$('login').onclick=()=>run(async()=>{await buyerLogin();admin();$('panel').hidden=false;status('Quản trị: '+buyerAdmin);await list();});
$('logout').onclick=()=>run(async()=>{await buyerLogout();$('panel').hidden=true;$('list').replaceChildren();status('Đã đăng xuất.');});
async function save(enabled){admin();const email=$('email').value.trim().toLowerCase();if(!/^[a-z0-9._%+\-]+@gmail\.com$/.test(email))throw Error('Nhập đúng địa chỉ Gmail.');if(email===buyerAdmin)throw Error('Gmail quản trị luôn có quyền sử dụng.');await setDoc(doc(buyerDb,'buyerLicenses',email),{email,enabled,updatedAt:serverTimestamp()});status((enabled?'Đã cấp quyền: ':'Đã khóa: ')+email);await list();}
$('grant').onclick=()=>run(()=>save(true));$('lock').onclick=()=>run(()=>save(false));$('refresh').onclick=()=>run(list);
