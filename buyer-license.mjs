import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {getFirestore,doc,getDocFromServer} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import {buyerConfig,buyerAdmin} from './buyer-config.mjs';
export const buyerApp=initializeApp(buyerConfig,'buyer-license');
export const buyerAuth=getAuth(buyerApp),buyerDb=getFirestore(buyerApp);
const emailOf=u=>(u?.email||'').trim().toLowerCase();
export async function buyerLogin(){const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});return (await signInWithPopup(buyerAuth,provider)).user;}
export async function buyerLogout(){await signOut(buyerAuth);}
let cached=null,pending=null;
function askSignIn(email){if(pending)return pending;pending=new Promise((resolve,reject)=>{
 const box=document.createElement('dialog');box.style.cssText='max-width:480px;padding:28px;border:0;border-radius:18px;color:#14213d;font:18px system-ui';
 const title=document.createElement('h2');title.textContent='Xác nhận quyền sử dụng';
 const text=document.createElement('p');text.textContent='Bấm nút bên dưới và chọn đúng Gmail '+email+' để kiểm tra quyền mua game.';
 const button=document.createElement('button');button.textContent='Đăng nhập để kiểm tra quyền';button.style.cssText='padding:14px;font:inherit;cursor:pointer';
 const cancel=document.createElement('button');cancel.textContent='Đóng';cancel.style.cssText='margin-left:12px;padding:14px';
 const done=()=>{box.close();box.remove();};
 button.onclick=async()=>{button.disabled=true;try{const u=await buyerLogin();if(emailOf(u)!==email){await buyerLogout();throw Error('Cô hãy chọn đúng Gmail '+email);}done();resolve();}catch(e){text.textContent=e.message;button.disabled=false;}};
 cancel.onclick=()=>{done();reject(Error('Chưa xác nhận quyền sử dụng.'));};
 box.addEventListener('cancel',e=>{e.preventDefault();cancel.click();});box.append(title,text,button,cancel);document.body.append(box);box.showModal();
 }).finally(()=>{pending=null;});return pending;}
export async function requireBuyer(email){email=email.trim().toLowerCase();await buyerAuth.authStateReady();
 if(emailOf(buyerAuth.currentUser)!==email)await askSignIn(email);
 const user=buyerAuth.currentUser;
 if(!user?.emailVerified||emailOf(user)!==email)throw Error('Gmail kiểm tra quyền không khớp.');
 if(email===buyerAdmin)return;
 if(cached?.email===email&&Date.now()-cached.at<60000)return;
 let snap;try{snap=await getDocFromServer(doc(buyerDb,'buyerLicenses',email));}catch{throw Error('Chưa kiểm tra được quyền sử dụng. Kiểm tra mạng hoặc liên hệ cô Ly.');}
 if(snap.data()?.enabled!==true){cached=null;throw Error('Gmail '+email+' chưa được cấp quyền hoặc đã bị khóa. Vui lòng liên hệ cô Ly.');}
 cached={email,at:Date.now()};
}
