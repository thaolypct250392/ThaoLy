import {mathNode as N,packMath,latexRanges,latexWarnings} from './formula-core.mjs?v=30.2.mathtype';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const children=n=>Array.from(n?.childNodes||[]).filter(x=>x.nodeType===1);
const is=(n,ns,tag)=>n?.namespaceURI===ns&&n.localName===tag;
const child=(n,tag,ns=M)=>children(n).find(x=>is(x,ns,tag));
const value=n=>n?.getAttributeNS?.(n.namespaceURI,'val')??null;
const prop=(n,group,name,fallback)=>value(child(child(n,group),name))??fallback;
const on=v=>v!==null&&!['0','false','off','none'].includes(v);
const textMath=t=>{const pieces=String(t).match(/\s+|[0-9]+(?:[.,][0-9]+)?|[A-Za-zÀ-ỹΑ-ω]+|./gu)||[];return N('mrow',...pieces.map(x=>N(/^\s/.test(x)?'mtext':/^\d/.test(x)?'mn':/^[A-Za-zÀ-ỹΑ-ω]/u.test(x)?'mi':'mo',x)));};
export function ommlToMath(node,warnings=[]){
 const row=n=>N('mrow',...children(n).filter(x=>!x.localName.endsWith('Pr')).map(x=>ommlToMath(x,warnings)));
 const arg=name=>row(child(node,name));
 if(!node)return N('mrow');
 if(node.namespaceURI!==M){if(is(node,W,'t'))return N('mtext',node.textContent);return row(node);}
 switch(node.localName){
  case 't':return textMath(node.textContent);
  case 'r':{const r=row(node),style=prop(node,'rPr','sty','i');if(style==='p')r[1].mathvariant='normal';return r;}
  case 'oMath':case 'oMathPara':case 'e':case 'num':case 'den':case 'deg':case 'sub':case 'sup':case 'lim':case 'fName':case 'box':return row(node);
  case 'f':{const type=prop(node,'fPr','type','bar');if(type==='noBar')return N('mtable',N('mtr',N('mtd',arg('num'))),N('mtr',N('mtd',arg('den'))));if(type==='lin'||type==='skw')return N('mrow',arg('num'),N('mo','/'),arg('den'));return N('mfrac',arg('num'),arg('den'));}
  case 'rad':return on(prop(node,'radPr','degHide',null))||!child(node,'deg')||!child(node,'deg').textContent?N('msqrt',arg('e')):N('mroot',arg('e'),arg('deg'));
  case 'sSup':return N('msup',arg('e'),arg('sup'));
  case 'sSub':return N('msub',arg('e'),arg('sub'));
  case 'sSubSup':return N('msubsup',arg('e'),arg('sub'),arg('sup'));
  case 'sPre':return N('mrow',N('msubsup',N('mrow'),arg('sub'),arg('sup')),arg('e'));
  case 'limUpp':return N('mover',arg('e'),arg('lim'));
  case 'limLow':return N('munder',arg('e'),arg('lim'));
  case 'acc':{return ['mover',{accent:'true'},arg('e'),['mo',{stretchy:'true'},prop(node,'accPr','chr','̂')]];}
  case 'bar':return [prop(node,'barPr','pos','bot')==='top'?'mover':'munder',{},arg('e'),['mo',{stretchy:'true'},'¯']];
  case 'groupChr':{const chr=prop(node,'groupChrPr','chr','⏟'),pos=prop(node,'groupChrPr','pos','bot');
   // Group character sits below/above its argument; an arrow below a label is a reaction arrow with an upper condition.
   return /[→←↔⇄⇌⇒⇔⟶⟵⟷]/u.test(chr)?[pos==='bot'?'mover':'munder',{},['mo',{stretchy:'true'},chr],arg('e')]:[pos==='bot'?'munder':'mover',{},arg('e'),['mo',{stretchy:'true'},chr]];}
  case 'nary':{const symbol=prop(node,'naryPr','chr','∫'),location=prop(node,'naryPr','limLoc',symbol==='∫'?'subSup':'undOvr');let op=['mo',{movablelimits:'false'},symbol];const sub=!on(prop(node,'naryPr','subHide',null))&&!!child(node,'sub')?.textContent;const sup=!on(prop(node,'naryPr','supHide',null))&&!!child(node,'sup')?.textContent;
   if(sub&&sup)op=N(location==='undOvr'?'munderover':'msubsup',op,arg('sub'),arg('sup'));else if(sub)op=N(location==='undOvr'?'munder':'msub',op,arg('sub'));else if(sup)op=N(location==='undOvr'?'mover':'msup',op,arg('sup'));return N('mrow',op,arg('e'));}
  case 'd':{const es=children(node).filter(x=>is(x,M,'e')),sep=prop(node,'dPr','sepChr','|');return N('mrow',N('mo',prop(node,'dPr','begChr','(')),...es.flatMap((x,i)=>i?[N('mo',sep),row(x)]:[row(x)]),N('mo',prop(node,'dPr','endChr',')')));}
  case 'func':return N('mrow',arg('fName'),arg('e'));
  case 'm':return N('mtable',...children(node).filter(x=>is(x,M,'mr')).map(r=>N('mtr',...children(r).filter(x=>is(x,M,'e')).map(e=>N('mtd',row(e))))));
  case 'eqArr':return N('mtable',...children(node).filter(x=>is(x,M,'e')).map(e=>N('mtr',N('mtd',row(e)))));
  case 'borderBox':return ['menclose',{notation:'box'},arg('e')];
  case 'phant':warnings.push('Có công thức ẩn (phantom); cần kiểm tra bố cục.');return arg('e');
  default:if(node.localName.endsWith('Pr'))return N('mrow');warnings.push('Chưa hỗ trợ đầy đủ Equation: '+node.localName+'.');return row(node);
 }
}
function rProps(pr){const o={};for(const key of ['u','vertAlign']){const n=child(pr,key,W);if(n)o[key]=value(n)??(key==='u'?'single':'baseline');}return o;}
function stylesOf(xml){const styles=new Map();let defaultParagraph;if(!xml)return {styles,defaults:{}};for(const s of Array.from(xml.getElementsByTagNameNS(W,'style'))){if(s.getAttributeNS(W,'type')==='paragraph'&&on(s.getAttributeNS(W,'default')))defaultParagraph=s.getAttributeNS(W,'styleId');styles.set(s.getAttributeNS(W,'styleId'),{base:value(child(s,'basedOn',W)),...rProps(child(s,'rPr',W))});}const defaults=rProps(child(child(child(xml.documentElement,'docDefaults',W),'rPrDefault',W),'rPr',W));return {styles,defaults,defaultParagraph};}
function styleProps(id,styles,seen=new Set()){if(!id||seen.has(id))return {};seen.add(id);const s=styles.get(id);return s?{...styleProps(s.base,styles,seen),...s}:{};}
function underlined(props){return props.u!==undefined&&on(props.u);}
function paragraphParts(p,styleData,images=new WeakMap()){
 const paragraphStyle=value(child(child(p,'pPr',W),'pStyle',W))||styleData.defaultParagraph;const base={...styleData.defaults,...styleProps(paragraphStyle,styleData.styles)};
 let text='';const marks=[],warnings=[];
 const append=(s,u)=>{if(u&&s)marks.push({start:text.length,end:text.length+s.length});text+=s;};
 const runProps=n=>{const pr=child(n,'rPr',W);return {...base,...styleProps(value(child(pr,'rStyle',W)),styleData.styles),...rProps(pr)};};
 const walk=n=>{
  if(is(n,M,'oMath')){const runs=Array.from(n.getElementsByTagNameNS(M,'r')).filter(r=>r.textContent.trim()),flags=runs.map(r=>underlined(runProps(r)));if(flags.some(Boolean)&&!flags.every(Boolean))warnings.push('Gạch chân một phần công thức; cần xác nhận đáp án.');const parts=children(n).filter(c=>c.namespaceURI===M&&!c.localName.endsWith('Pr'));const raw=runs.map(r=>r.textContent).join('');const linear=parts.every(c=>c.localName==='r')&&/\\(?:frac|sqrt|int|vec|lim|begin|ce|rightarrow)\b/.test(raw);append(linear?'\\('+raw+'\\)':packMath(ommlToMath(n,warnings)),flags.length>0&&flags.every(Boolean));return;}
  if(is(n,W,'del')||is(n,W,'instrText')||is(n,W,'pPr'))return;
  if(is(n,W,'drawing')||is(n,W,'object')||is(n,W,'pict')){const image=images.get(n);if(image?.token){append(image.token,underlined(runProps(n.parentNode)));if(image.warning)warnings.push(image.warning);}else{warnings.push(image?.error||'Có ảnh/MathType/OLE chưa đọc được thành công thức; cần kiểm tra.');append(' [ẢNH/CÔNG THỨC CHƯA HỖ TRỢ] ',false);}return;}
  if(n.localName==='AlternateContent'){const choices=children(n),usable=branch=>['drawing','object','pict'].some(tag=>Array.from(branch.getElementsByTagNameNS(W,tag)).some(x=>images.get(x)?.token))||branch.getElementsByTagNameNS(M,'oMath').length>0,selected=choices.find(usable)||choices.find(x=>x.localName==='Choice')||choices.find(x=>x.localName==='Fallback');if(selected)for(const c of children(selected))walk(c);return;}
  if(is(n,W,'r')){const props=runProps(n);let t='';for(const c of children(n)){if(is(c,W,'t'))t+=c.textContent;else if(is(c,W,'tab'))t+='\t';else if(is(c,W,'br')||is(c,W,'cr'))t+='\n';else if(is(c,W,'sym')){const code=c.getAttributeNS(W,'char');warnings.push('Ký hiệu từ phông Symbol cần kiểm tra.');t+='[Symbol '+code+']';}else if(is(c,W,'drawing')||is(c,W,'object')||is(c,W,'pict')||c.localName==='AlternateContent'||is(c,M,'oMath')){if(t){append(t,underlined(props));t='';}walk(c);}}
   if((props.vertAlign==='superscript'||props.vertAlign==='subscript')&&t.trim()){const leading=t.match(/^\s*/)[0],trailing=t.match(/\s*$/)[0];append(leading,underlined(props));append(packMath(N(props.vertAlign==='superscript'?'msup':'msub',N('mrow'),N('mtext',t.trim()))),underlined(props));append(trailing,underlined(props));}else append(t,underlined(props));return;}
  for(const c of children(n))walk(c);
 };
 for(const c of children(p))walk(c);
 return {text,marks,warnings};
}
export function readDocxXml(xml,stylesXml,images=new WeakMap()){
 if(xml.getElementsByTagName('parsererror').length)throw Error('Không đọc được XML của Word.');
 const styleData=stylesOf(stylesXml),paragraphs=Array.from(xml.getElementsByTagNameNS(W,'p')).map(p=>paragraphParts(p,styleData,images));
 let source='',marks=[],warnings=[];
 for(const p of paragraphs){if(/^(?:TOÁN(?: HỌC)?|VẬT L[IÍ]|H[OÓ]A(?: HỌC)?)$/iu.test(p.text.trim()))continue;const offset=source.length;source+=p.text+'\n';marks.push(...p.marks.map(m=>({start:m.start+offset,end:m.end+offset})));warnings.push(...p.warnings.map(message=>({start:offset,end:source.length,message})));}
 const headers=[...source.matchAll(/(?:^|\n)\s*(?:Câu|Question)\s*(\d+)\s*[.:)]\s*/gi)];if(!headers.length)throw Error('Không tìm thấy Câu 1, Câu 2… trong Word. Cô dùng nhãn câu hỏi và A. B. C. D. dạng chữ.');
 const covered=(a,b)=>{let count=0,total=0;for(let i=a;i<b;i++){if(/\s/.test(source[i]))continue;total++;if(marks.some(m=>i>=m.start&&i<m.end))count++;}return {count,total};};
 return headers.map((h,i)=>{
  const start=h.index+h[0].length,end=i+1<headers.length?headers[i+1].index:source.length;const block=source.slice(start,end),mathSpans=latexRanges(block),allPositions=[...block.matchAll(/(?:^|\s)([A-D])\s*[.):]\s*/g)].filter(m=>!mathSpans.some(r=>m.index>=r.start&&m.index<r.end));
  const groups=allPositions.map((_,j)=>allPositions.slice(j,j+4)).filter(g=>g.length===4&&g.map(x=>x[1]).join('')==='ABCD');
  const positions=groups.length===1?groups[0]:[];
  const notices=warnings.filter(w=>w.start<end&&w.end>start).map(w=>w.message);let correct=-1;
  if(positions.length!==4||positions.map(x=>x[1]).join('')!=='ABCD')return {text:block.trim(),options:['','','',''],correct:-1,warning:'Không xác định chắc chắn đủ A, B, C, D; cô kiểm tra bố cục.',needsReview:true};
  const explicit=[...block.matchAll(/(?:Đáp\s*án(?:\s*đúng)?|ĐA|Answer|Correct)\s*[:：\-]\s*([A-D])\b/gi)].map(x=>'ABCD'.indexOf(x[1].toUpperCase()));
  const candidates=[],options=[];let partial=false;
  positions.forEach((m,j)=>{const a=start+m.index+m[0].length,b=start+(j+1<positions.length?positions[j+1].index:block.length);let raw=source.slice(a,b);const key=raw.search(/(?:Đáp\s*án(?:\s*đúng)?|ĐA|Answer|Correct)\s*[:：\-]/i),stop=key<0?b:a+key;
   options.push(source.slice(a,stop).trim());const body=covered(a,stop),label=start+m.index+m[0].indexOf(m[1]),labelMark=covered(label,label+1).count>0;
   if(labelMark||(body.total>0&&body.count===body.total))candidates.push(j);else if(body.count>0)partial=true;
  });
  const signals=[...new Set([...explicit,...candidates])];if(!partial&&signals.length===1)correct=signals[0];
  if(partial)notices.push('Có gạch chân một phần lựa chọn; cô xác nhận đáp án.');
  if(signals.length>1)notices.push('Có nhiều đáp án được đánh dấu hoặc đáp án chữ khác phần gạch chân.');
  if(correct<0)notices.push('Chưa xác định chắc chắn đáp án; cô phải chọn A, B, C hoặc D.');
  if(notices.some(n=>n.includes('Gạch chân một phần công thức')))correct=-1;
  if(!options.every(Boolean))notices.push('Có lựa chọn trống.');
  notices.push(...latexWarnings(block));
  return {text:block.slice(0,positions[0].index).trim(),options,correct,warning:[...new Set(notices)].join(' '),needsReview:notices.length>0};
 });
}
export async function readDocxFile(file,Zip=globalThis.JSZip){
 if(!Zip)throw Error('Chưa tải được bộ đọc DOCX.');const zip=await Zip.loadAsync(await file.arrayBuffer()),entry=zip.file('word/document.xml');if(!entry)throw Error('File DOCX không có word/document.xml.');
 const parse=s=>new DOMParser().parseFromString(s,'application/xml');
 const xml=parse(await entry.async('string')), images=new WeakMap();
 const {readDocxImages}=await import('./docx-images.mjs?v=30.5.images.1');
 const embedded=await readDocxImages(xml,zip,parse);
 return readDocxXml(xml,zip.file('word/styles.xml')?parse(await zip.file('word/styles.xml').async('string')):undefined,embedded);
}
