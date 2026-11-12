const KEY='millionaire.connection.v31';
export function validate(value){
 if(!value || typeof value!=='object')throw Error('Cấu hình chưa hợp lệ.');
 const {config,ownerEmail}=value;
 if(!config||!/^[-a-z0-9]+$/.test(config.projectId||'')||typeof config.apiKey!=='string'||!config.apiKey||!config.appId||!config.authDomain)throw Error('Cần đủ apiKey, projectId, authDomain và appId.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail||''))throw Error('Gmail chủ sở hữu chưa hợp lệ.');
 const safe={};for(const k of ['apiKey','projectId','authDomain','appId','messagingSenderId','storageBucket'])if(typeof config[k]==='string')safe[k]=config[k];
 return {config:safe,ownerEmail:ownerEmail.trim().toLowerCase()};
}
export function parseConfig(text){
 let s=text.trim();const start=s.indexOf('{'),end=s.lastIndexOf('}');if(start<0||end<start)throw Error('Hãy dán nguyên khối firebaseConfig.');s=s.slice(start,end+1);
 try{return JSON.parse(s);}catch{}
 const cfg={};const re=/(?:["']?)(apiKey|projectId|authDomain|appId|messagingSenderId|storageBucket)(?:["']?)\s*:\s*(["'])(.*?)\2/g;let m;while((m=re.exec(s)))cfg[m[1]]=m[3];return cfg;
}
export function encode(value){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(validate(value))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function decode(s){if(s.length>12000)throw Error('Link cấu hình quá dài.');s=s.replaceAll('-','+').replaceAll('_','/');return validate(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s),x=>x.charCodeAt(0)))));}
export function getConnection(){
 const h=new URLSearchParams(location.hash.slice(1));if(h.has('cfg'))return decode(h.get('cfg'));
 const value=localStorage.getItem(KEY);return value?validate(JSON.parse(value)):null;
}
export function saveConnection(value){localStorage.setItem(KEY,JSON.stringify(validate(value)));}
export function shareLink(url){const u=new URL(url,location.origin);const c=getConnection();if(c)u.hash='cfg='+encode(c);return u.href;}
export async function loadConnection(){const c=getConnection();if(c)return c;location.replace('./setup.html');throw Error('Mở mục Thiết lập Firebase để bắt đầu.');}
