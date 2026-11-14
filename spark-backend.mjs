import {requireBuyer,buyerLogout} from './buyer-license.mjs';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInAnonymously,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';
import {initializeFirestore,getFirestore,doc,collection,getDoc,getDocs,getDocsFromServer,setDoc,updateDoc,writeBatch,query,where,serverTimestamp,onSnapshot,runTransaction,orderBy,limit,arrayUnion,arrayRemove} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import {levels} from './samples.mjs';
import {loadConnection} from './connection.mjs?v=30.5.homework-scan.9';
const connection=await loadConnection();
const OWNER=connection.ownerEmail;
const config=connection.config;
const app=initializeApp(config),studentApp=initializeApp(config,'students');
const auth=getAuth(app),guestAuth=getAuth(studentApp),db=getFirestore(app),studentDb=initializeFirestore(studentApp,{experimentalForceLongPolling:true,experimentalLongPollingOptions:{timeoutSeconds:15}});
const snapshots=new Map(),answerRecovery=new Map();
const millis=t=>t?.toMillis?.()??0;
const pathId=s=>{if(!/^[\w-]{1,128}$/.test(s||''))throw Error('Mã không hợp lệ.');return s;};
const clean=(s,n=80)=>String(s??'').trim().slice(0,n);
onAuthStateChanged(auth,user=>{window.teacherUid=user?.uid||'';const label=document.getElementById('google-identity');if(label)label.textContent=user?.email||'Chưa đăng nhập';window.dispatchEvent(new Event('teacher-identity-changed'));});
function reset(){answerRecovery.clear();for(const entry of snapshots.values()){entry.cancel?.();entry.off?.();}snapshots.clear();}
window.addEventListener('online',reset);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reset();});
async function teacher(){await auth.authStateReady();const u=auth.currentUser;if(!u||!u.emailVerified||!u.providerData.some(p=>p.providerId==='google.com'))throw Error('Cần đăng nhập bằng Google.');await requireBuyer(u.email);if(u.email!==OWNER){const g=await getDoc(doc(db,'sparkAccess',u.email));if(!g.data()?.enabled)throw Error('Gmail chưa được cấp quyền hoặc đã khóa.');}return u;}
let guestSigningIn;
async function student(){await guestAuth.authStateReady();if(!guestAuth.currentUser){guestSigningIn??=signInAnonymously(guestAuth).finally(()=>{guestSigningIn=null;});await guestSigningIn;}return guestAuth.currentUser;}
export async function login(){try{await auth.authStateReady();if(!auth.currentUser){const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}const u=await teacher();window.teacherUid=u.uid;window.dispatchEvent(new Event('teacher-identity-changed'));return true;}catch(e){alert(e.message);return false;}}
export async function logout(){reset();await Promise.all([signOut(auth),buyerLogout()]);sessionStorage.removeItem('millionaireTeacher');location.assign('./game.html');}
function connectionEvent(state,code=''){
 if(typeof window==='undefined'||typeof CustomEvent==='undefined')return;
 window.dispatchEvent(new CustomEvent('spark-connection',{detail:{state,code,at:Date.now()}}));
}
function watch(key,ref,isQuery=false){
 let entry=snapshots.get(key);if(entry?.error){entry.off?.();snapshots.delete(key);entry=null;}if(entry)return entry.ready;
 entry={value:null,error:null,fromCache:true};snapshots.set(key,entry);
 const roomKey=/^(teacher|student):/.test(key);let initialTimer,cacheTimer,rawOff,closed=false;
 const stop=()=>{if(closed)return;closed=true;clearTimeout(initialTimer);clearTimeout(cacheTimer);rawOff?.();};entry.off=stop;
 entry.ready=new Promise((resolve,reject)=>{
  let settled=false;
  const fail=error=>{if(closed)return;entry.error=error;stop();if(roomKey)connectionEvent('retrying',error.code||'unavailable');if(!settled){settled=true;reject(error);}};
  initialTimer=setTimeout(()=>fail(Object.assign(Error('Kết nối nhận dữ liệu quá lâu. Đang thử kết nối lại…'),{code:'unavailable'})),8000);
  entry.cancel=()=>fail(Object.assign(Error('Đang kết nối lại phòng…'),{code:'unavailable'}));
  rawOff=onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
   if(closed)return;
   entry.value=isQuery?snapshot.docs.map(d=>({id:d.id,...d.data()})):snapshot.data();
   entry.fromCache=snapshot.metadata?.fromCache===true;
   if(entry.fromCache){
    if(roomKey)connectionEvent('cache');
    // Metadata-only offline transitions matter even after the first snapshot.
    // Retry a stale cache listener, not every healthy poll or quiet classroom.
    if(!cacheTimer)cacheTimer=setTimeout(()=>fail(Object.assign(Error('Chưa nhận được dữ liệu mới từ máy chủ. Đang kết nối lại…'),{code:'unavailable'})),12000);
   }else{clearTimeout(cacheTimer);cacheTimer=null;if(roomKey)connectionEvent('connected');}
   if(!settled){settled=true;clearTimeout(initialTimer);resolve(entry);}
  },fail);
  if(closed)rawOff?.();
 });return entry.ready;
}
// Restore an acknowledged answer after reload without delaying room/question rendering.
// At most one read in flight per current question; no answer collection listener.
function recoverAnswer(pin,index,uid){
 const key=pin+':'+index;for(const old of answerRecovery.keys())if(old!==key)answerRecovery.delete(old);
 const previous=answerRecovery.get(key);if(previous===true||previous>Date.now())return;
 answerRecovery.set(key,true);
 getDoc(doc(studentDb,'liveRooms',pin,'answers',uid+'_'+index)).then(snap=>{
  if(snap.metadata?.fromCache===true){answerRecovery.set(key,Date.now()+15000);return;}
  const answer=snap.data()?.answer;
  if(Number.isInteger(answer)&&answer>=0&&answer<=3){sessionStorage.setItem('spark-answer:'+key,String(answer));connectionEvent('answer-restored');}
 }).catch(error=>{answerRecovery.set(key,Date.now()+15000);connectionEvent('answer-restore-error',error.code||'unknown');});
}
async function bank(uid){const snap=await getDoc(doc(db,'sparkTeachers',uid,'settings','active'));const questions=snap.data()?.questions;if(!questions)throw Error('Cô hãy tải và lưu bộ đề trước khi tạo phòng.');return questions;}
function validate(raw){
 if(!Array.isArray(raw)||raw.length!==15)throw Error('Cần đúng 15 câu hỏi.');
 const field=(value,max,i)=>{if(typeof value!=='string'||!value.trim())throw Error('Câu '+(i+1)+' có nội dung trống.');if(value.length>max)throw Error('Câu '+(i+1)+' có ảnh/công thức quá dài; chưa lưu để tránh mất nội dung.');return value.trim();};
 const result=raw.map((q,i)=>{if(!q||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3)throw Error('Câu '+(i+1)+' chưa chọn đáp án hợp lệ.');const seconds=q.seconds??30;if(!Number.isInteger(seconds)||seconds<5||seconds>300)throw Error('Câu '+(i+1)+': thời gian phải là số nguyên từ 5 đến 300 giây.');return {text:field(q.text,220000,i),options:q.options.map(x=>field(x,220000,i)),correct:q.correct,...timing({seconds})};});
 if(new TextEncoder().encode(JSON.stringify(result)).length>750000)throw Error('Bộ đề chứa quá nhiều dữ liệu ảnh/công thức; chưa lưu để tránh vượt giới hạn.');return result;
}
const timing=q=>q?.seconds!=null&&q.seconds!==30?{seconds:q.seconds}:{};
const publicQuestion=q=>q?{text:q.text,options:q.options,...timing(q)}:null;
const answerKey=q=>({correct:q.correct,...timing(q)});
async function roomData(pin,teacherMode){
 const conn=teacherMode?db:studentDb;
 if(teacherMode)await teacher();else await student();
 const entry=await watch((teacherMode?'teacher:':'student:')+pin,doc(conn,'liveRooms',pin));
 if(entry.error)throw entry.error;if(!entry.value)throw Error('Không tìm thấy phòng.');return {...entry.value,_connection:entry.fromCache?'cache':'connected'};
}
async function roster(pin){return (await watch('roster:'+pin,collection(db,'liveRooms',pin,'players'),true)).value;}
async function answers(pin,index){
 const key='answers:'+pin+':'+index;
 for(const [old,entry]of snapshots)if(old.startsWith('answers:'+pin+':')&&old!==key){entry.off?.();snapshots.delete(old);}
 return (await watch(key,query(collection(db,'liveRooms',pin,'answers'),where('index','==',index)),true)).value;
}
function renderState(r,pin,players,answerList,studentUid){
 const a=Object.fromEntries(answerList.map(x=>[x.studentUid,x.answer]));
 return {connection:r._connection||'connected',pin,mode:r.mode||'sync',phase:r.phase,index:r.index,total:15,levels,phaseStartedAt:millis(r.phaseStartedAt)||null,timeLimitMs:(r.question?.seconds??30)*1000,serverNow:Date.now(),questionSet:'custom',questionPreview:r.question?.text||'',question:r.question,correct:r.phase==='revealed'?r.correct:null,
  players:players.map(p=>({...p,answered:Object.hasOwn(a,p.id)||(r.phase==='revealed'&&p.answeredIndex===r.index),correctNow:r.phase==='revealed'?(p.correctNow??(Object.hasOwn(a,p.id)?a[p.id]===r.correct:null)):null})).sort((x,y)=>y.level-x.level||y.score-x.score||x.name.localeCompare(y.name,'vi')),
  myAnswer:Object.hasOwn(a,studentUid)?a[studentUid]:null,answersCount:answerList.length,closed:r.phase==='finished'};
}
function initialPlayer(player){
 const {id,name,gender,avatar}=player;
 const className=player.className||'';
 return {id,name,gender,avatar,...(className?{className}:{}),level:0,score:0,speedPoints:0};
}
function mergeRaceProgress(player,attempt){
 if(!attempt)return player;
 return {...player,level:attempt.level,score:attempt.score,speedPoints:attempt.speedPoints,
  done:attempt.status==='finished',completed:attempt.index+(attempt.status==='answered'||attempt.status==='finished'?1:0)};
}
export async function api(action,body={}){
 if(action==='reconnect'){reset();return {ok:true};}
 if(action.startsWith('admin-')){
  const u=await teacher();if(u.email!==OWNER)throw Error('Chỉ chủ sở hữu được quản trị.');
  if(action==='admin-list')return {teachers:(await getDocs(collection(db,'sparkAccess'))).docs.map(d=>d.data())};
  const email=clean(body.email,254).toLowerCase();if(!/^[a-z0-9!#$%&'*+\-=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-=?^_`{|}~]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)||email===OWNER)throw Error('Địa chỉ email không hợp lệ hoặc là tài khoản chủ sở hữu.');
  if(!['admin-grant','admin-lock'].includes(action))throw Error('Thao tác không hợp lệ.');
  const ref=doc(db,'sparkAccess',email),old=(await getDoc(ref)).data();
  await setDoc(ref,{email,label:clean(body.label||old?.label||email,100),enabled:action==='admin-grant'?true:!body.locked,updatedAt:serverTimestamp()});return {ok:true};
 }
 const teacherActions=['create-homework','teacher-link','bank-info','read-bank','list-banks','publish-bank','activate-bank','create','my-rooms','my-solo-results','homework-results','questions','start','reveal','next','end-room','prepare-solo'];
 const u=teacherActions.includes(action)?await teacher():null;
 if(action==='teacher-link')return {tenant:u.uid,email:u.email};
 if(action==='bank-info'){const q=(await getDoc(doc(db,'sparkTeachers',u.uid,'settings','active'))).data()?.questions;return {count:q?.length||0,preview:q?.[0]?.text||'Chưa lưu bộ đề',custom:!!q};}
 if(action==='read-bank'){const snap=await getDoc(doc(db,'sparkTeachers',u.uid,'banks',pathId(body.id)));if(!snap.exists())throw Error('Không tìm thấy bộ đề.');const {questions,name}=snap.data();return {questions,name};}
 if(action==='list-banks')return {banks:(await getDocs(query(collection(db,'sparkTeachers',u.uid,'banks'),orderBy('createdAt','desc')))).docs.map(d=>({id:d.id,name:d.data().name,createdAt:millis(d.data().createdAt),count:15}))};
 if(action==='publish-bank'||action==='activate-bank'){
  const archiveId=action==='publish-bank'?crypto.randomUUID():pathId(body.id),existing=action==='activate-bank'?(await getDoc(doc(db,'sparkTeachers',u.uid,'banks',archiveId))).data():null;
  if(action==='activate-bank'&&!existing)throw Error('Không tìm thấy bộ đề.');
  const questions=validate(existing?.questions||body.questions),name=existing?.name||clean(body.name,110)||'Bộ đề chưa đặt tên';
  const batch=writeBatch(db);if(action==='publish-bank')batch.set(doc(db,'sparkTeachers',u.uid,'banks',archiveId),{name,questions,createdAt:serverTimestamp()});
  batch.set(doc(db,'sparkTeachers',u.uid,'settings','active'),{questions,archiveId});
  // Solo publication uses immutable bank versions. Keys remain unreadable until a submitted choice.
  batch.set(doc(db,'soloBanks',archiveId),{teacherUid:u.uid,teacherEmail:u.email,questions:questions.map(publicQuestion)});
  for(let i=0;i<15;i++)batch.set(doc(db,'soloBanks',archiveId,'keys',String(i)),answerKey(questions[i]));
  batch.set(doc(db,'soloLinks',u.uid),{teacherUid:u.uid,teacherEmail:u.email,archiveId});
  await batch.commit();return {ok:true,name,count:15,preview:questions[0].text};
 }
 if(action==='create-homework'){
  const settings=(await getDoc(doc(db,'sparkTeachers',u.uid,'settings','active'))).data();
  if(!settings?.questions)throw Error('Cô hãy lưu hoặc chọn bộ đề trước.');
  const questions=validate(settings.questions),id=crypto.randomUUID(),batch=writeBatch(db);
  const name=clean(body.name,110)||'Bài tập về nhà';
  batch.set(doc(db,'soloBanks',id),{teacherUid:u.uid,teacherEmail:u.email,questions:questions.map(publicQuestion),homework:true,name});
  for(let i=0;i<questions.length;i++)batch.set(doc(db,'soloBanks',id,'keys',String(i)),answerKey(questions[i]));
  batch.set(doc(db,'sparkTeachers',u.uid,'homework',id),{id,name,created:serverTimestamp()});
  await batch.commit();return {id,name};
 }
 if(action==='create'){
  const settings=(await getDoc(doc(db,'sparkTeachers',u.uid,'settings','active'))).data();if(!settings?.questions)throw Error('Cô hãy tải và lưu bộ đề trước khi tạo phòng.');
  const questions=settings.questions,bankId=settings.archiveId,pin=crypto.randomUUID(),batch=writeBatch(db);
  batch.set(doc(db,'sparkTeachers',u.uid,'rooms',pin),{questions,bankId,created:serverTimestamp()});
  const mode=body.mode==='race'?'race':'sync';
  if(mode==='race'){
   batch.set(doc(db,'soloBanks',pin),{teacherUid:u.uid,teacherEmail:u.email,questions:questions.map(publicQuestion)});
   for(let i=0;i<15;i++)batch.set(doc(db,'soloBanks',pin,'keys',String(i)),answerKey(questions[i]));
  }
  batch.set(doc(db,'soloLocks',bankId),{teacherUid:u.uid,teacherEmail:u.email,activeRooms:arrayUnion(pin)},{merge:true});
  batch.set(doc(db,'liveRooms',pin),{teacherUid:u.uid,teacherEmail:u.email,...(mode==='race'?{mode}:{}),phase:'lobby',index:0,question:null,correct:null,players:[],phaseStartedAt:null,created:serverTimestamp()});
  await batch.commit();return {pin,token:'firebase-uid-authorization'};
 }
 if(action==='my-rooms'){
  const snaps=await getDocs(query(collection(db,'liveRooms'),where('teacherUid','==',u.uid),where('teacherEmail','==',u.email),orderBy('created','desc'),limit(100)));
  return {rooms:snaps.docs.map(d=>({pin:d.id,phase:d.data().phase,created:millis(d.data().created),players:d.data().players})).sort((a,b)=>b.created-a.created)};
 }
 if(action==='homework-results'){
  const id=pathId(body.homework);
  const assignment=await getDoc(doc(db,'sparkTeachers',u.uid,'homework',id));
  if(!assignment.exists())throw Error('Không tìm thấy bài tập của tài khoản này.');
  const rows=await getDocsFromServer(query(collection(db,'soloAttempts'),
   where('teacherUid','==',u.uid),where('teacherEmail','==',u.email)));
  return {attempts:rows.docs.flatMap(row=>{
   const attempt=row.data();
   return attempt.bankId===id?[{...attempt,id:row.id,created:millis(attempt.created)}]:[];
  }).sort((a,b)=>b.created-a.created)};
 }
 if(action==='my-solo-results'){
  const snaps=await getDocs(query(collection(db,'soloAttempts'),where('teacherUid','==',u.uid),where('teacherEmail','==',u.email)));
  const homework=(await getDocs(collection(db,'sparkTeachers',u.uid,'homework'))).docs.map(d=>({...d.data(),created:millis(d.data().created)}));
  return {homework,attempts:snaps.docs.map(d=>({id:d.id,...d.data(),created:millis(d.data().created)})).filter(a=>a.id!==a.bankId+'_'+a.studentUid).sort((a,b)=>b.created-a.created)};
 }
 if(action==='prepare-solo'){
  const settings=(await getDoc(doc(db,'sparkTeachers',u.uid,'settings','active'))).data();
  if(!settings?.archiveId)throw Error('Cô hãy chọn bộ đề trước.');
  const lockRef=doc(db,'soloLocks',pathId(settings.archiveId));
  return runTransaction(db,async tx=>{
   const lock=(await tx.get(lockRef)).data();if(!lock)return {remaining:0};
   if(lock.teacherUid!==u.uid||lock.teacherEmail!==u.email)throw Error('Không có quyền mở bộ đề.');
   const pins=[...new Set(lock.activeRooms||[])];if(pins.length>200)throw Error('Có quá nhiều phòng cũ. Cô hãy kết thúc bớt trong trang quản lý phòng.');
   const refs=pins.map(p=>doc(db,'liveRooms',pathId(p)));
   const rooms=await Promise.all(refs.map(ref=>tx.get(ref)));
   const remaining=[];
   rooms.forEach((snap,i)=>{
    const r=snap.data();if(!r||r.teacherUid!==u.uid||r.teacherEmail!==u.email)throw Error('Không thể xác minh phòng cũ. Chưa thay đổi khóa bộ đề.');
    if(r.phase!=='finished'){
     if(body.closeRooms===true&&r.mode==='race')throw Error('Hãy kết thúc phòng thi theo tiến độ riêng trong mục quản lý phòng để chốt bảng xếp hạng.');
     if(body.closeRooms===true)tx.update(refs[i],{phase:'finished',question:null,correct:null});
     else remaining.push(pins[i]);
    }
   });
   // Read the lock and every room before writing; concurrent room creation retries.
   tx.update(lockRef,{activeRooms:remaining});return {remaining:remaining.length};
  });
 }
 if(action==='solo-questions'){
  const s=await student(),name=clean(body.name),gender=body.gender==='female'?'female':'male',className=clean(body.className,40);if(name.length<2)throw Error('Em hãy nhập tên trước khi bắt đầu.');
  const homeworkId=body.homework?pathId(body.homework):null;
  const link=homeworkId?{archiveId:homeworkId}:(await getDoc(doc(studentDb,'soloLinks',pathId(body.tenant)))).data();
  if(!link)throw Error('Giáo viên cần lưu hoặc chọn bộ đề trước khi chia sẻ link cá nhân.');
  const published=(await getDoc(doc(studentDb,'soloBanks',link.archiveId))).data();
  if(!published||Boolean(published.homework)!==Boolean(homeworkId))throw Error('Không tìm thấy bộ đề theo link này.');
  const lock=(await getDoc(doc(studentDb,'soloLocks',link.archiveId))).data();
  if(lock?.activeRooms?.length)throw Error('Bộ đề còn '+lock.activeRooms.length+' phòng chưa được gỡ khóa. Giáo viên vào kho đề, bấm MỞ CHẾ ĐỘ CÁ NHÂN để kiểm tra và kết thúc các phòng còn lại.');
  const firstId=homeworkId?homeworkId+'_home_'+s.uid:null;
  const retry=firstId&&body.replayId?pathId(body.replayId):null;
  const attemptId=retry?firstId+'_retry_'+retry:firstId||crypto.randomUUID();
  const ref=doc(studentDb,'soloAttempts',attemptId);
  const initial={studentUid:s.uid,teacherUid:published.teacherUid,teacherEmail:published.teacherEmail,bankId:link.archiveId,name,gender,...(className?{className}:{}),created:serverTimestamp(),index:0,currentStartedAt:null,level:0,score:0,speedPoints:0,status:'intro'};
  let progress;
  if(homeworkId){
   progress=await runTransaction(studentDb,async tx=>{
    if(retry){
     const first=(await tx.get(doc(studentDb,'soloAttempts',firstId))).data();
     if(first?.status!=='finished')throw Error('Em cần nộp lượt đầu trước khi làm lại.');
    }
    const prior=(await tx.get(ref)).data();
    if(prior)return prior;
    tx.set(ref,initial);return initial;
   });
  }else{await setDoc(ref,initial);progress=initial;}
  const {status,index,level,score,speedPoints}=progress;
  const current=status==='answered'?index+1:index;
  window.sparkSoloAttempt=attemptId;window.sparkSoloBank=link.archiveId;
  sessionStorage.setItem('spark-solo-attempt',attemptId);
  return {questions:published.questions,levels,attemptId,name:progress.name,gender:progress.gender,status,index:current,level,score,speedPoints,homework:homeworkId,title:published.name||''};
 }
 if(action==='solo-open'){
  await student();const attemptId=pathId(body.attemptId||window.sparkSoloAttempt),ref=doc(studentDb,'soloAttempts',attemptId);
  await runTransaction(studentDb,async tx=>{
   const a=(await tx.get(ref)).data();
   if(a.status==='playing'&&a.index===body.index)return;
   if(a.status==='intro'&&body.index===0)tx.update(ref,{status:'playing',currentStartedAt:serverTimestamp()});
   else if(a.status==='answered'&&body.index===a.index+1)tx.update(ref,{status:'playing',index:a.index+1,currentStartedAt:serverTimestamp()});
   else throw Error('Lượt chơi không ở câu hỏi này.');
  });const opened=(await getDoc(ref)).data();return {ok:true,started:millis(opened.currentStartedAt),serverNow:Date.now()};
 }
 if(action==='solo-answer'){
  const s=await student(),attemptId=pathId(body.attemptId||window.sparkSoloAttempt),ref=doc(studentDb,'soloAttempts',attemptId),attempt=(await getDoc(ref)).data(),archiveId=pathId(attempt.bankId),index=Number(body.index);
  if(!Number.isInteger(index)||index<0||index>14)throw Error('Câu hỏi không hợp lệ.');
  if(attempt.index!==index)throw Error('Không phải câu đang chơi.');
  const answerRef=doc(studentDb,'soloAttempts',attemptId,'answers',String(index)),unlockRef=doc(studentDb,'soloBanks',archiveId,'unlocks',s.uid+'_'+index),keyRef=doc(studentDb,'soloBanks',archiveId,'keys',String(index));
  // Commit the immutable choice BEFORE revealing or grading. Atomic speculative
  // grading would otherwise create an oracle for guessing hidden answers.
  try{await setDoc(answerRef,{answer:Number(body.answer),submittedAt:serverTimestamp()});}catch(e){if(!(await getDoc(answerRef)).exists())throw e;}
  try{await setDoc(unlockRef,{studentUid:s.uid,index,attemptId});}catch(e){if(!(await getDoc(unlockRef)).exists())throw e;}
  await runTransaction(studentDb,async tx=>{
   const a=(await tx.get(ref)).data();if(a.status!=='playing')return;
   if(attemptId===a.bankId+'_'+a.studentUid){
    const room=(await tx.get(doc(studentDb,'liveRooms',a.bankId))).data();
    if(room?.mode!=='race'||room.phase!=='question')throw Error('Phòng thi đã kết thúc.');
   }
   const choice=(await tx.get(answerRef)).data(),key=(await tx.get(keyRef)).data(),elapsed=millis(choice.submittedAt)-millis(a.currentStartedAt),right=choice.answer===key.correct&&elapsed>=0&&elapsed<(key.seconds??30)*1000;
   const bonus=Math.max(0,Math.min(500,500-Math.floor(elapsed/1000)*25));
   const level=a.level+(right?1:0),score=a.score+(right?1000+bonus:0);
   tx.update(ref,{status:index===14?'finished':'answered',level,score,speedPoints:a.speedPoints+(right?bonus:0)});
   if(index===14&&attemptId===archiveId+'_home_'+s.uid)
    tx.set(doc(studentDb,'soloBanks',archiveId,'ranking',s.uid),{level,score});
  });
  const result=(await getDoc(ref)).data(),choice=(await getDoc(answerRef)).data(),key=(await getDoc(keyRef)).data();
  return {correct:key.correct,timeLimitMs:(key.seconds??30)*1000,answer:choice.answer,level:result.level,score:result.score,speedPoints:result.speedPoints,elapsed:millis(choice.submittedAt)-millis(result.currentStartedAt)};
 }
 if(action==='homework-ranking'){
  const s=await student(),id=pathId(body.homework),attemptId=id+'_home_'+s.uid;
  const attempt=(await getDoc(doc(studentDb,'soloAttempts',attemptId))).data();
  if(attempt?.status!=='finished')throw Error('Em cần hoàn thành bài để xem xếp hạng.');
  const entries=await getDocs(collection(studentDb,'soloBanks',id,'ranking'));
  return {players:entries.docs.map(row=>({mine:row.id===s.uid,level:row.data().level,score:row.data().score})).sort((a,b)=>b.level-a.level||b.score-a.score)};
 }
 if(action==='solo-history'){
  const s=await student(),tenant=pathId(body.tenant),link=(await getDoc(doc(studentDb,'soloLinks',tenant))).data();
  const snaps=await getDocs(query(collection(studentDb,'soloAttempts'),where('studentUid','==',s.uid),where('teacherUid','==',tenant),where('teacherEmail','==',link.teacherEmail),orderBy('created','desc'),limit(100)));
  return {attempts:snaps.docs.map(d=>({id:d.id,...d.data(),created:millis(d.data().created)})).filter(a=>a.id!==a.bankId+'_'+a.studentUid).sort((a,b)=>b.created-a.created)};
 }
 const pin=pathId(body.pin);
 if(action==='race-resume'){
  const user=await student(),room=await roomData(pin,false);
  if(room.mode!=='race'||room.phase!=='question')throw Error('Phòng chưa mở hoặc đã kết thúc.');
  const attemptId=pin+'_'+user.uid;
  const [attempt,bank]=await Promise.all([
   getDoc(doc(studentDb,'soloAttempts',attemptId)),getDoc(doc(studentDb,'soloBanks',pin))
  ]);
  if(!attempt.exists()||!bank.exists())throw Error('Chưa tìm thấy lượt thi của em.');
  const a=attempt.data();
  return {attemptId,questions:bank.data().questions,index:a.index,status:a.status,started:millis(a.currentStartedAt),level:a.level,score:a.score,speedPoints:a.speedPoints};
 }
 if(action==='join'){
  const s=await student(),name=clean(body.name),gender=body.gender==='female'?'female':'male',className=clean(body.className,40);if(name.length<2)throw Error('Vui lòng nhập họ tên.');
  const ref=doc(studentDb,'liveRooms',pin,'players',s.uid),existing=(await getDoc(ref)).data();
  if(!existing){
   try{await setDoc(ref,{id:s.uid,name,gender,...(className?{className}:{}),avatar:(gender==='female'?4:0)+Math.floor(Math.random()*4),joinedAt:serverTimestamp()});}
   catch(error){if(error.code==='permission-denied')throw Object.assign(Error('Chưa thể vào phòng: phòng có thể đã bắt đầu, đã đóng hoặc quyền giáo viên bị khóa. Học sinh đã tham gia hãy dùng lại đúng trình duyệt; giáo viên kiểm tra phòng đang chờ.'),{code:error.code});throw error;}
  }
  return {id:s.uid,name:existing?.name||name,className:existing?existing.className||'':className,secret:'firebase-anonymous-session'};
 }
 if(action==='state'){
  const isTeacher=!!body.token,r=await roomData(pin,isTeacher);
  if(r.mode==='race'){
   if(r.phase==='finished')return renderState(r,pin,r.players,[],body.id);
   if(isTeacher){
    if(r.phase==='lobby'||r.phase==='preparing'){
     const rows=await roster(pin);
     return renderState(r,pin,rows.map(p=>({...p,joinedAt:undefined,level:0,score:0,speedPoints:0})),[],'');
    }
    const attempts=query(collection(db,'soloAttempts'),where('teacherUid','==',r.teacherUid),where('teacherEmail','==',r.teacherEmail),where('bankId','==',pin));
    const rows=(await watch('race-attempts:'+pin,attempts,true)).value;
    const progress=new Map(rows.map(a=>[a.studentUid,a]));
    const players=r.players.map(p=>mergeRaceProgress(p,progress.get(p.id)));
    return renderState(r,pin,players,players.filter(p=>p.done).map(p=>({studentUid:p.id,answer:-1})),'');
   }
   const self=r.players.find(p=>p.id===body.id)||(await watch('own-player:'+pin,doc(studentDb,'liveRooms',pin,'players',body.id))).value;
   return renderState(r,pin,self?[{level:0,score:0,speedPoints:0,...self}]:[],[],body.id);
  }
  if(isTeacher){const rows=await roster(pin),answerList=r.phase==='lobby'?[]:await answers(pin,r.index),previous=new Map(r.players.map(p=>[p.id,p]));return renderState(r,pin,rows.map(p=>({...p,joinedAt:undefined,...(previous.get(p.id)||{level:0,score:0,speedPoints:0})})),answerList,'');}
  const s=await student();if(s.uid!==body.id)throw Error('Phiên học sinh không hợp lệ.');
  // Submission acknowledgements are local UI state; authoritative answers stay in Firestore.
  // Avoid one listener per student answer, which would consume free reads unnecessarily.
  const stored=sessionStorage.getItem('spark-answer:'+pin+':'+r.index);
  if(stored===null&&r.phase==='question')recoverAnswer(pin,r.index,s.uid);
  const own=stored===null?null:{studentUid:s.uid,index:r.index,answer:Number(stored)};
  // Once started, the room already carries the authoritative roster and scores.
  // Do not let an unrelated own-player listener hold up each question update.
  const self=r.players.length?null:(await watch('own-player:'+pin,doc(studentDb,'liveRooms',pin,'players',s.uid))).value;
  return renderState(r,pin,r.players.length?r.players:[{...self,level:0,score:0,speedPoints:0}],own?[own]:[],s.uid);
 }
 if(action==='answer'){
  const s=await student(),r=await roomData(pin,false);if(s.uid!==body.id)throw Error('Phiên học sinh không hợp lệ.');
  if(body.index!==r.index)throw Error('Câu hỏi trước đã khóa. Em hãy chờ câu mới.');
  await setDoc(doc(studentDb,'liveRooms',pin,'answers',s.uid+'_'+body.index),{studentUid:s.uid,index:body.index,answer:Number(body.answer),submittedAt:serverTimestamp()});sessionStorage.setItem('spark-answer:'+pin+':'+body.index,String(body.answer));return {ok:true};
 }
 if(!u)throw Error('Thao tác không hợp lệ.');
 const ref=doc(db,'liveRooms',pin),privateRef=doc(db,'sparkTeachers',u.uid,'rooms',pin);
 const privateRoom=(await getDoc(privateRef)).data(),q=privateRoom?.questions;if(!q)throw Error('Không có quyền truy cập phòng.');
 if(action==='questions'){const r=(await getDoc(ref)).data();if(r.phase!=='lobby')throw Error('Phòng đã bắt đầu.');await updateDoc(privateRef,{questions:validate(body.questions)});return {ok:true,count:15,preview:body.questions[0].text};}
 if(action==='end-room'){
  const initial=(await getDoc(ref)).data();
  let waitingPlayers=null;
  if(initial?.mode==='race'&&['lobby','preparing'].includes(initial.phase)){
   await runTransaction(db,async tx=>{
    const room=(await tx.get(ref)).data();
    if(room.phase==='lobby')tx.update(ref,{phase:'preparing'});
   });
   waitingPlayers=(await getDocs(collection(db,'liveRooms',pin,'players'))).docs.map(d=>initialPlayer(d.data()));
  }
  await runTransaction(db,async tx=>{
   const r=(await tx.get(ref)).data();if(!r||r.teacherUid!==u.uid||r.teacherEmail!==u.email)throw Error('Không phải phòng của cô.');
   // Close and release only this room's immutable bank, in the same commit.
   // Retrying also repairs an old finished room whose lock was left behind.
   const attempts=r.mode==='race'&&r.phase==='question'
    ?await Promise.all(r.players.map(p=>tx.get(doc(db,'soloAttempts',pin+'_'+p.id))))
    :null;
   const players=attempts?r.players.map((p,i)=>mergeRaceProgress(p,attempts[i].data()))
    :r.mode==='race'&&r.phase==='preparing'&&waitingPlayers?waitingPlayers:r.players;
   tx.update(ref,{phase:'finished',question:null,correct:null,players});
   if(privateRoom.bankId)tx.update(doc(db,'soloLocks',privateRoom.bankId),{activeRooms:arrayRemove(pin)});
  });return {ok:true};
 }
 // Freeze admission before reading the roster, so a successful join cannot be lost.
 if(action==='start'){
  const current=(await getDoc(ref)).data();
  if(current?.mode==='race'&&current.phase==='lobby'&&(await getDocs(collection(db,'liveRooms',pin,'players'))).empty)
   throw Error('Cần ít nhất một học sinh đã vào phòng.');
 }
 if(action==='start')await runTransaction(db,async tx=>{const r=(await tx.get(ref)).data();if(r.phase==='preparing')return;if(r.phase!=='lobby')throw Error('Phòng đã bắt đầu.');tx.update(ref,{phase:'preparing'});});
 const rows=action==='start'?await getDocs(collection(db,'liveRooms',pin,'players')):null;
 await runTransaction(db,async tx=>{
  const r=(await tx.get(ref)).data();if(r.teacherUid!==u.uid)throw Error('Không phải phòng của cô.');
  if(action==='start'){
   if(r.phase!=='preparing')throw Error('Phòng đã bắt đầu.');
   const players=rows.docs.map(d=>initialPlayer(d.data()));
   if(r.mode==='race'){
    if(!players.length)throw Error('Cần ít nhất một học sinh đã vào phòng.');
    for(const p of players)tx.set(doc(db,'soloAttempts',pin+'_'+p.id),{
     studentUid:p.id,teacherUid:u.uid,teacherEmail:u.email,bankId:pin,name:p.name,gender:p.gender,...(p.className?{className:p.className}:{}),
     created:serverTimestamp(),index:0,currentStartedAt:null,level:0,score:0,speedPoints:0,status:'intro'
    });
   }
   tx.update(ref,{phase:'question',index:0,question:r.mode==='race'?null:publicQuestion(q[0]),correct:null,players,phaseStartedAt:serverTimestamp()});
  }else if(action==='reveal'){
   if(r.mode==='race')throw Error('Học sinh tự chuyển câu trong phòng này.');
   if(r.phase!=='question')throw Error('Câu hỏi đã chốt.');
   // Read every possible answer (including missing docs) in the closing transaction.
   // Concurrent accepted submissions cause retries instead of disappearing from scoring.
   const submitted=await Promise.all(r.players.map(p=>tx.get(doc(db,'liveRooms',pin,'answers',p.id+'_'+r.index))));
   const answerMap=new Map(submitted.filter(d=>d.exists()).map(d=>[d.data().studentUid,d.data()]));
   const players=r.players.map(previous=>{const a=answerMap.get(previous.id);const p={...previous,answeredIndex:a?r.index:null};if(!a||a.answer!==q[r.index].correct)return {...p,correctNow:false};const elapsed=Math.max(0,millis(a.submittedAt)-millis(r.phaseStartedAt));if(elapsed>=(r.question?.seconds??30)*1000)return {...p,correctNow:false};const bonus=Math.max(0,500-Math.floor(elapsed/1000)*25);return {...p,correctNow:true,level:p.level+1,score:p.score+1000+bonus,speedPoints:p.speedPoints+bonus};});
   tx.update(ref,{phase:'revealed',correct:q[r.index].correct,players});
  }else if(action==='next'){
   if(r.phase!=='revealed')throw Error('Cần công bố đáp án trước.');const index=r.index+1;tx.update(ref,{index,phase:index===15?'finished':'question',question:publicQuestion(q[index]),correct:null,phaseStartedAt:serverTimestamp()});
   if(index===15&&privateRoom.bankId)tx.update(doc(db,'soloLocks',privateRoom.bankId),{activeRooms:arrayRemove(pin)});
  }else throw Error('Thao tác không hợp lệ.');
 });return {ok:true};
}
