// Strict MTEF v5 reader. Unsupported structures fail explicitly so the caller
// can retain the original preview instead of silently dropping symbols.
import {mathNode as N,packMath,unpackMath} from './formula-core.mjs?v=30.2.mathtype';
export function readMtef(data){
 let at=0,count=0;
 const byte=()=>{if(at>=data.length)throw Error('MTEF bị cắt ngắn');return data[at++];};
 const word=()=>byte()|(byte()<<8),uint=()=>{const n=byte();return n===255?word():n;};
 const str=()=>{let s='';for(let b;(b=byte())!==0;)s+=String.fromCharCode(b);return s;};
 const nudge=o=>{if(o&8){const x=byte(),y=byte();if(x===128&&y===128){word();word();}}};
 const ruler=()=>{const n=byte();for(let i=0;i<n;i++){byte();word();}};
 const dims=n=>{let done=0;while(done<n){const b=byte();if((b&15)===15)done++;if((b>>4)===15)done++;}};
 if(byte()!==5)throw Error('Chưa hỗ trợ phiên bản MTEF này');byte();byte();byte();byte();str();byte();
 const list=(depth=0)=>{if(depth>40)throw Error('MathType quá phức tạp');const out=[];
  while(true){if(++count>10000)throw Error('MathType quá dài');const type=byte();if(type===0)return out;
   if(type===1){const o=byte();nudge(o);if(o&4)word();if(o&2)ruler();out.push(N('mrow',...(o&1?[]:list(depth+1))));}
   else if(type===2){const o=byte();nudge(o);const face=byte();if(face===255)word();let code=o&32?null:word();if(o&32)throw Error('Ký tự thiếu mã Unicode; dùng ảnh xem trước.');if(o&4){const c=byte();code??=c;}if(o&16){const c=word();code??=c;}if(face===152){code=0x2009;}if(code===null||code===0||code>=0xe000&&code<=0xf8ff)throw Error('Ký tự MathType cần ảnh xem trước '+String(code));let tree=N(/[0-9]/.test(String.fromCharCode(code))?'mn':/[A-Za-zÀ-ỹΑ-ω]/u.test(String.fromCharCode(code))?'mi':'mo',String.fromCharCode(code));if(o&1){const embell=list(depth+1);for(const e of embell){if(!e.embell)throw Error('Dấu trang trí không hợp lệ');tree=decorate(tree,e.embell);}}out.push(tree);}
   else if(type===3){const o=byte();nudge(o);const selector=byte();let variation=byte();if(variation&128)variation=(variation&127)|(byte()<<8);byte();const slots=list(depth+1);out.push(template(selector,variation,slots,out));}
   else if(type===4){const o=byte();nudge(o);byte();byte();if(o&2)ruler();out.push(N('mtable',...list(depth+1).map(x=>N('mtr',N('mtd',x)))));}
   else if(type===5){const o=byte();nudge(o);byte();const align=byte();byte();const rows=byte(),cols=byte();if(!rows||!cols||rows*cols>400)throw Error('Ma trận quá lớn.');const parts=n=>{const a=[];for(let i=0;i<Math.ceil((n+1)/4);i++)a.push(byte());return a;};const rp=parts(rows),cp=parts(cols);if([...rp,...cp].some(Boolean))throw Error('Ma trận có đường phân cách cần ảnh xem trước.');const cells=list(depth+1);if(cells.length!==rows*cols)throw Error('Thiếu ô ma trận.');const table=N('mtable',...Array.from({length:rows},(_,r)=>N('mtr',...cells.slice(r*cols,(r+1)*cols).map(x=>N('mtd',x)))));table[1].columnalign=align===1?'left':align===3?'right':'center';out.push(table);}
   else if(type===6){const o=byte();nudge(o);out.push({embell:byte()});}
   else if(type===7)ruler();
   else if(type===8){uint();byte();}
   else if(type===9){const n=byte();if(n===101)word();else if(n===100){byte();word();}else byte();}
   else if(type>=10&&type<=14){}
   else if(type===15)uint();
   else if(type===16){const o=byte();for(let i=0;i<(o&1?4:3);i++)word();if(o&4)str();}
   else if(type===17){uint();str();}
   else if(type===18){byte();dims(byte());dims(byte());const n=byte();for(let i=0;i<n;i++){if(uint()!==0)byte();}}
   else if(type===19)str();
   else throw Error('Chưa hỗ trợ bản ghi MathType '+type);
  }
 };
 const result=N('mrow',...list());if(at!==data.length&&data.slice(at).some(b=>b!==0))throw Error('MathType còn dữ liệu chưa đọc');unpackMath(packMath(result).slice(7,-2));return result;
}
function template(s,v,a,previous){
 const slot=i=>a[i]||N('mrow');
 if(s>=27&&s<=29){if(v&1)throw Error('Chỉ số đặt trước cần ảnh xem trước');const base=previous.pop();if(!base)throw Error('Thiếu cơ số MathType');return s===27?N('msub',base,slot(0)):s===28?N('msup',base,slot(1)):N('msubsup',base,slot(0),slot(1));}
 if(s===10)return v===0?N('msqrt',slot(0)):N('mroot',slot(0),slot(1));
 if(s===11)return v&2?N('mrow',slot(0),N('mo','/'),slot(1)):N('mfrac',slot(0),slot(1));
 if(s===12||s===13)return N(s===12?'munder':'mover',slot(0),N('mo',v&1?'═':'¯'));
 if(s===14){if((v&12)===12)throw Error('Mũi tên có hai nhãn cần ảnh xem trước');let arrow=N('mo',v&2?'⇌':v&1?'⇄':(v&48)===48?'↔':v&16?'←':'→');let i=0;if(v&4){const top=slot(i++);if(top.length>2)arrow=N('mover',arrow,top);}if(v&8){const bottom=slot(i++);if(bottom.length>2)arrow=N('munder',arrow,bottom);}return arrow;}
 if(s<=9){const interval=['(',')','[',']'];const brackets=s===9?[interval[v&15],interval[(v>>4)&15]]:[['⟨','⟩'],['(',')'],['{','}'],['[',']'],['|','|'],['‖','‖'],['⌊','⌋'],['⌈','⌉'],['⟦','⟧']][s];if(!brackets||brackets.some(x=>!x))throw Error('Ngoặc chưa hỗ trợ.');if(s===9)return N('mrow',N('mo',brackets[0]),slot(0),N('mo',brackets[1]));return N('mrow',...(v&1?[N('mo',brackets[0])]:[]),slot(0),...(v&2?[N('mo',brackets[1])]:[]));}
 if(s>=15&&s<=22){const symbols={16:'∑',17:'∏',18:'∐',19:'⋃',20:'⋂'};let op=a[3]||N('mo',symbols[s]||'');if(!a[3])throw Error('Thiếu ký hiệu toán tử lớn.');const lower=slot(2),upper=slot(1),low=lower.length>2,up=upper.length>2,stack=s===22||s!==15&&s!==21||!!(v&64);if(low&&up)op=N(stack?'munderover':'msubsup',op,lower,upper);else if(low)op=N(stack?'munder':'msub',op,lower);else if(up)op=N(stack?'mover':'msup',op,upper);return N('mrow',op,slot(0));}
 if(s===23){let op=slot(0);if(slot(1).length>2)op=N('munder',op,slot(1));if(slot(2).length>2)op=N('mover',op,slot(2));return op;}
 if(s===24||s===25){const upper=!!(v&1),brace=a[2]||N('mo',s===24?(upper?'⏞':'⏟'):(upper?'⎴':'⎵'));let tree=N(upper?'mover':'munder',slot(0),brace);if(slot(1).length>2)tree=N(upper?'mover':'munder',tree,slot(1));return tree;}
 if(s===31){const arrow=(v&3)===3?'↔':v&1?'←':'→';return N(v&4?'munder':'mover',slot(0),N('mo',arrow));}
 if(s===32||s===33||s===34)return N('mover',slot(0),N('mo',s===32?'~':s===33?'^':'⌢'));
 if(s===36){if(v&1)return ['menclose',{notation:'horizontalstrike'},slot(0)];if(v&2&&!(v&4))return ['menclose',{notation:'updiagonalstrike'},slot(0)];if(v&4&&!(v&2))return ['menclose',{notation:'downdiagonalstrike'},slot(0)];return ['menclose',{notation:'updiagonalstrike downdiagonalstrike'},slot(0)];}
 if(s===37){if((v&30)!==30)throw Error('Khung hở cần ảnh xem trước');return ['menclose',{notation:'box'},slot(0)];}
 throw Error('Chưa hỗ trợ mẫu MathType '+s);
}
export function mtefFromWmf(parsed){
 let chunks=[],wanted=0,total=0;
 for(const r of parsed.records||[]){if(r.type!=='META_ESCAPE')continue;const d=r.data;if(d.length<23)continue;const n=d[2]|d[3]<<8,c=d.slice(4,4+n);if(String.fromCharCode(...c.slice(0,8))!=='AppsMFCC')continue;const view=new DataView(c.buffer,c.byteOffset,c.byteLength),size=view.getUint32(10,true),len=view.getUint32(14,true);let offset=18;while(offset<c.length&&c[offset]!==0)offset++;offset++;if(!size||size>1000000||offset+len>c.length)continue;const payload=c.slice(offset,offset+len);
  if(!chunks.length){wanted=size;if(payload[0]!==5)continue;}
  chunks.push(payload);total+=len;if(total>wanted){chunks=[];total=0;continue;}
  if(total===wanted){const all=new Uint8Array(total);let at=0;for(const part of chunks){all.set(part,at);at+=part.length;}return readMtef(all);}
 }
 throw Error('Không có dữ liệu MathType MTEF v5 đầy đủ');
}

function decorate(base,id){
 const primes={5:'′',6:'″',18:'‴'};if(primes[id])return N('msup',base,N('mo',primes[id]));
 const glyph={2:'˙',3:'¨',4:'⃛',8:'~',9:'^',11:'→',12:'←',13:'↔',14:'⇀',15:'↼',17:'¯',19:'⌢',20:'⌣',24:'⃜',25:'˙',26:'¨',27:'⃛',28:'⃜',29:'¯',30:'~',31:'⌢',32:'⌣',33:'→',34:'←',35:'↔',36:'⇀',37:'↼'}[id];
 if(glyph)return N(id>=25?'munder':'mover',base,N('mo',glyph));
 if(id===10||id===22)return ['menclose',{notation:'updiagonalstrike'},base];
 if(id===23)return ['menclose',{notation:'downdiagonalstrike'},base];
 if(id===21)return ['menclose',{notation:'updiagonalstrike downdiagonalstrike'},base];
 throw Error('Dấu trang trí MathType chưa hỗ trợ: '+id);
}
