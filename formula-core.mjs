// The saved bank keeps plain text plus opaque math tokens, never arbitrary HTML.
const tokenPattern=/\[\[(MATH|IMG|PIC):([A-Za-z0-9+/=]+)\]\]/g;
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const mathNode=(tag,...children)=>[tag,{},...children];
export function packMath(tree){return '[[MATH:'+btoa(unescape(encodeURIComponent(JSON.stringify(tree))))+']]';}
const tags=new Set(['mrow','mi','mn','mo','mtext','mfrac','msqrt','mroot','msup','msub','msubsup','mover','munder','munderover','mtable','mtr','mtd','menclose']);
const attrs={stretchy:['true','false'],accent:['true','false'],accentunder:['true','false'],movablelimits:['true','false'],mathvariant:['normal','italic','bold','bold-italic'],displaystyle:['true','false'],columnalign:['left','center','right'],notation:['box','top','bottom','updiagonalstrike','downdiagonalstrike','horizontalstrike','updiagonalstrike downdiagonalstrike']};
function validateTree(tree,depth=0,budget={n:0}){
 if(++budget.n>5000||depth>48)throw Error('Công thức quá phức tạp');
 if(typeof tree==='string'){if(tree.length>12000)throw Error('Công thức quá dài');return;}
 if(!Array.isArray(tree)||!tags.has(tree[0])||!tree[1]||typeof tree[1]!=='object'||Array.isArray(tree[1]))throw Error('Cấu trúc công thức không hợp lệ');
 for(const [key,value]of Object.entries(tree[1]))if(!attrs[key]?.includes(value))throw Error('Thuộc tính công thức không hợp lệ');
 for(const child of tree.slice(2))validateTree(child,depth+1,budget);
}
export function unpackMath(encoded){if(encoded.length>48000)throw Error('Công thức quá dài');const tree=JSON.parse(decodeURIComponent(escape(atob(encoded))));validateTree(tree);return tree;}
function treeHtml(tree){if(typeof tree==='string')return escapeHtml(tree);return '<'+tree[0]+Object.entries(tree[1]).map(([k,v])=>' '+k+'="'+escapeHtml(v)+'"').join('')+'>'+tree.slice(2).map(treeHtml).join('')+'</'+tree[0]+'>';}
export function mathPlain(tree){if(typeof tree==='string')return tree;const c=tree.slice(2).map(mathPlain);switch(tree[0]){case 'mfrac':return '('+c[0]+')/('+c[1]+')';case 'msqrt':return '√('+c.join('')+')';case 'mroot':return 'root['+c[1]+']('+c[0]+')';case 'msup':return c[0]+'^('+c[1]+')';case 'msub':return c[0]+'_('+c[1]+')';case 'msubsup':return c[0]+'_('+c[1]+')^('+c[2]+')';case 'mover':return c[0]+' [trên: '+c[1]+']';case 'munder':return c[0]+' [dưới: '+c[1]+']';case 'munderover':return c[0]+' [dưới: '+c[1]+'; trên: '+c[2]+']';default:return c.join('');}}
export function plainRichText(value){return String(value??'').replace(tokenPattern,(_,kind,e)=>{if(kind==='IMG')return '[Công thức dạng ảnh]';if(kind==='PIC')return '[Hình minh họa]';try{return mathPlain(unpackMath(e));}catch{return '[Công thức cần kiểm tra]';}});}
// Keep delimiters and all original bytes in the stored question. A rendered
// wrapper carries the exact source through the editable review screen.
export function latexRanges(value){
 const s=String(value??''),ranges=[];
 for(let i=0;i<s.length;){let open='',close='',display=false;
  if(s.startsWith('$$',i)){open='$$';close='$$';display=true;}
  else if(s.startsWith('\\(',i)){open='\\(';close='\\)';}
  else if(s.startsWith('\\[',i)){open='\\[';close='\\]';display=true;}
  else if(s[i]==='$'&&(i===0||s[i-1]!=='\\')&&s[i+1]&&!/\s/.test(s[i+1])){open='$';close='$';}
  if(!open){i++;continue;}
  let end=i+open.length;
  for(;end<s.length;end++){if(s.startsWith(close,end)&&(close[0]!=='$'||s[end-1]!=='\\')&&(close!=='$'||!/[\s$]/.test(s[end-1])))break;}
  if(end>=s.length){i+=open.length;continue;}
  const stop=end+close.length;ranges.push({start:i,end:stop,raw:s.slice(i,stop),tex:s.slice(i+open.length,end),display});i=stop;
 }
 return ranges;
}
function renderTex(r, inline = false){
 try{if(!globalThis.katex)throw Error('Bộ đọc LaTeX chưa tải');const html=globalThis.katex.renderToString(r.tex,{displayMode:inline?false:r.display,output:'mathml',throwOnError:true,trust:false,maxExpand:100,maxSize:50});return '<span class="latex-formula" contenteditable="false" data-tex-raw="'+escapeHtml(r.raw)+'">'+html+'</span>';}
 catch{return '<span class="formula-warning" contenteditable="false" data-tex-raw="'+escapeHtml(r.raw)+'">⚠ Công thức LaTeX cần kiểm tra: '+escapeHtml(r.raw)+'</span>';}
}
export function latexWarnings(value){const results=[],source=String(value??''),ranges=latexRanges(source);for(const r of ranges){try{if(!globalThis.katex)throw Error('Bộ đọc chưa sẵn sàng');globalThis.katex.renderToString(r.tex,{displayMode:r.display,output:'mathml',throwOnError:true,trust:false,maxExpand:100,maxSize:50});}catch{results.push('Có công thức LaTeX chưa được hỗ trợ hoặc sai cú pháp; kiểm tra nội dung gốc.');}}let plain='',at=0;for(const r of ranges){plain+=source.slice(at,r.start);at=r.end;}plain+=source.slice(at);if(/\\[()[\]]|\$\$/.test(plain))results.push('Dấu mở hoặc đóng LaTeX chưa khớp; kiểm tra nội dung gốc.');return results;}
export function renderRichText(value, {game = false} = {}){
 const source=String(value??'');let out='',offset=0;
 const matches=[...source.matchAll(tokenPattern)].map(m=>({start:m.index,end:m.index+m[0].length,kind:m[1],encoded:m[2]}));
 for(const r of latexRanges(source))if(!matches.some(m=>r.start<m.end&&r.end>m.start))matches.push(r);
 matches.sort((a,b)=>a.start-b.start);
 for(const match of matches){
  const before=source.slice(offset,match.start);
  if(game&&match.kind==='MATH'){
   try{
    const tree=unpackMath(match.encoded);
    const tag={msup:'sup',msub:'sub'}[tree[0]];
    const base=tree[2],script=tree[3];
    const attached=before.match(/[\p{L}\p{N})\]}]+$/u)?.[0];
    if(tag&&base?.[0]==='mrow'&&base.length===2&&script?.[0]==='mtext'&&typeof script[2]==='string'&&attached){
     out+=escapeHtml(before.slice(0,-attached.length));
     out+='<span class="game-script">'+escapeHtml(attached)+'<'+tag+'>'+escapeHtml(script[2])+'</'+tag+'></span>';
     offset=match.end;
     continue;
    }
   }catch{/* The standard renderer below handles invalid tokens. */}
  }
  out+=escapeHtml(before);
  const formulaStart=out.length;
  if(match.raw!==undefined)out+=renderTex(match,game);else if(match.kind==='IMG'||match.kind==='PIC'){const e=match.encoded,mime=e.startsWith('iVBORw0KGgo')?'image/png':e.startsWith('/9j/')?'image/jpeg':e.startsWith('UklGR')&&atob(e.slice(0,16)).slice(8,12)==='WEBP'?'image/webp':null;if(e.length<=180000&&mime)out+='<img class="'+(match.kind==='PIC'?'question-image':'formula-image')+'" contenteditable="false" alt="'+(match.kind==='PIC'?'Hình minh họa câu hỏi':'Công thức MathType')+'" data-formula-image="'+e+'" data-image-kind="'+match.kind+'" src="data:'+mime+';base64,'+e+'">';else out+='<span class="formula-warning">[Ảnh cần kiểm tra]</span>';}else try{const tree=unpackMath(match.encoded);out+='<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" contenteditable="false" data-formula="'+escapeHtml(match.encoded)+'" aria-label="'+escapeHtml(mathPlain(tree))+'">'+treeHtml(tree)+'</math>';}catch{out+='<span class="formula-warning">[Công thức cần kiểm tra]</span>';}
  if(game&&(match.kind==='MATH'||match.kind==='IMG'||match.raw!==undefined)){
   out=out.slice(0,formulaStart)+'<span class="game-formula">'+out.slice(formulaStart)+'</span>';
  }
  offset=match.end;
 }
 return out+escapeHtml(source.slice(offset));
}
