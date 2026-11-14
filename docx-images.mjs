import {equationNative} from './ole-reader.mjs?v=30.2.mathtype';
import {packMath} from './formula-core.mjs?v=30.2.mathtype';
import {mtefFromWmf,readMtef} from './mathtype-reader.mjs?v=30.2.mathtype';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A='http://schemas.openxmlformats.org/drawingml/2006/main';
const V='urn:schemas-microsoft-com:vml';
const O='urn:schemas-microsoft-com:office:office';
const descendants=(n,ns,name)=>Array.from(n.getElementsByTagNameNS(ns,name));
function mediaPath(target){
 const stack=target.startsWith('/')?[]:['word'];
 for(const part of target.split('/')){if(!part||part==='.')continue;if(part==='..')stack.pop();else stack.push(part);}
 const path=stack.join('/');return /^word\/(?:media|embeddings)\/[^/]+$/i.test(path)?path:null;
}
const MAX_ENCODED_IMAGE=180000;

function encodeCanvas(source){
 const png=source.toDataURL('image/png').split(',')[1];
 if(png&&png.length<=130000)return png;
 const scaled=document.createElement('canvas'), flattened=document.createElement('canvas');
 for(const scale of [1,0.8,0.64,0.5,0.375,0.25,0.125]){
  const canvas=scale===1?source:scaled;
  if(scale!==1){
   canvas.width=Math.max(1,Math.round(source.width*scale));
   canvas.height=Math.max(1,Math.round(source.height*scale));
   canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
   const smallerPng=canvas.toDataURL('image/png').split(',')[1];
   if(smallerPng&&smallerPng.length<=MAX_ENCODED_IMAGE)return smallerPng;
  }
  let jpegCanvas;
  for(const quality of [0.88,0.72,0.55]){
   const webp=canvas.toDataURL('image/webp',quality);
   if(webp.startsWith('data:image/webp;base64,')&&webp.length-'data:image/webp;base64,'.length<=MAX_ENCODED_IMAGE)return webp.split(',')[1];
   if(!jpegCanvas){
    // JPEG needs an opaque background for transparent diagrams and equation previews.
    flattened.width=canvas.width;
    flattened.height=canvas.height;
    const ctx=flattened.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(canvas,0,0);
    jpegCanvas=flattened;
   }
   const jpeg=jpegCanvas.toDataURL('image/jpeg',quality);
   if(jpeg.startsWith('data:image/jpeg;base64,')&&jpeg.length-'data:image/jpeg;base64,'.length<=MAX_ENCODED_IMAGE)return jpeg.split(',')[1];
  }
  if(scale===1&&png&&png.length<=MAX_ENCODED_IMAGE)return png;
 }
 throw Error('Không thể nén ảnh trong giới hạn lưu đề.');
}

export async function raster(bytes,mime){
 const blob=new Blob([bytes],{type:mime});let image,url;
 try{
  if(typeof createImageBitmap==='function'){
   try{image=await createImageBitmap(blob);}catch{/* Try the browser image element below. */}
  }
  if(!image){url=URL.createObjectURL(blob);image=new Image();image.src=url;await image.decode();}
  const width=image.width,height=image.height;
  if(!width||!height||width*height>40000000)throw Error('Ảnh quá lớn hoặc hỏng.');
  const canvas=document.createElement('canvas');const scale=Math.min(1,1200/width,1200/height);canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Không tạo được ảnh.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return '[[PIC:'+encodeCanvas(canvas)+']]';
 }finally{image?.close?.();if(url)URL.revokeObjectURL(url);}
}
export async function readDocxImages(xml,zip,parse){
 const images=new WeakMap(),relations=new Map(),relEntry=zip.file('word/_rels/document.xml.rels');
 if(relEntry)for(const rel of Array.from(parse(await relEntry.async('string')).getElementsByTagNameNS('*','Relationship'))){if(rel.getAttribute('TargetMode')==='External')continue;const path=mediaPath(rel.getAttribute('Target')||'');if(path)relations.set(rel.getAttribute('Id'),path);}
 const nodes=['object','drawing','pict'].flatMap(tag=>descendants(xml,W,tag));
 if(nodes.length>1000)throw Error('Tệp có quá nhiều ảnh/đối tượng nhúng; hãy chia nhỏ đề.');
 const cache=new Map();let renderer;
 for(const node of nodes){try{
  const blips=descendants(node,A,'blip'),vml=descendants(node,V,'imagedata');
  const ids=[...blips.map(n=>n.getAttributeNS(R,'embed')),...vml.map(n=>n.getAttributeNS(R,'id'))].filter(Boolean);
  const ole=descendants(node,O,'OLEObject')[0],isMath=!!ole&&/Equation|MathType/i.test(ole.getAttribute('ProgID')||'');
  const nativePath=ole&&relations.get(ole.getAttributeNS(R,'id'));
  if(isMath&&nativePath){const nativeAsset=zip.file(nativePath);if(nativeAsset&&nativeAsset._data?.uncompressedSize<=8000000){try{const nativeBytes=await nativeAsset.async('uint8array');images.set(node,{token:packMath(readMtef(equationNative(nativeBytes))),warning:'MathType đọc từ dữ liệu gốc; cô đối chiếu với Word.'});continue;}catch{/* Try the preview and embedded MTEF if the native structure is unsupported. */}}}
  const path=ids.map(id=>relations.get(id)).find(p=>p&&p.startsWith('word/media/'));if(!path)throw Error('Không tìm thấy ảnh nhúng hoặc công thức gốc chưa được hỗ trợ.');
  const key=path+':'+isMath;
  if(cache.has(key)){images.set(node,cache.get(key));continue;}
  const asset=zip.file(path);if(!asset||asset._data?.uncompressedSize>8000000)throw Error('Thiếu ảnh hoặc ảnh lớn hơn 8 MB.');
  const bytes=await asset.async('uint8array');if(bytes.length>8000000)throw Error('Ảnh lớn hơn 8 MB.');let result;
  if(/\.(wmf|emf)$/i.test(path)){
   renderer??=await import('./vendor/wmf-renderer.mjs');const parsed=renderer.parseMetafile(bytes);if(parsed.error||!parsed.records?.length||parsed.records.length>10000)throw Error('Ảnh WMF/EMF không hợp lệ.');
   if(isMath){try{result={token:packMath(mtefFromWmf(parsed)),warning:'MathType đã chuyển sang công thức; cô đối chiếu ký hiệu với Word.'};}catch{/* Preserve preview when the strict reader cannot fully decode MTEF. */}}
   if(!result){
    const shape=descendants(node,V,'shape')[0],style=shape?.getAttribute('style')||'';
    const w=Number(/(?:^|;)\s*width\s*:\s*([\d.]+)pt/i.exec(style)?.[1]||150),h=Number(/(?:^|;)\s*height\s*:\s*([\d.]+)pt/i.exec(style)?.[1]||45);
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Kích thước ảnh không hợp lệ.');
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Không tạo được ảnh.');
    const scale=Math.min(3,1200/w,800/h);renderer.renderToContext(bytes,ctx,{viewWidth:Math.max(32,Math.ceil(w*scale)),viewHeight:Math.max(24,Math.ceil(h*scale))});
    const encoded=encodeCanvas(canvas);
    result={token:'[['+(isMath?'IMG':'PIC')+':'+encoded+']]',warning:isMath?'MathType được giữ bằng ảnh xem trước; cô kiểm tra vì phông ký hiệu có thể khác máy gốc.':''};
   }
  }else{
   const ext=path.split('.').pop().toLowerCase(),mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp'}[ext];if(!mime)throw Error('Chưa hỗ trợ định dạng ảnh '+ext+'.');
   result={token:await raster(bytes,mime),warning:isMath?'MathType được giữ dưới dạng ảnh; cô đối chiếu với Word.':''};
  }
  cache.set(key,result);images.set(node,result);
 }catch(e){images.set(node,{error:'Không đọc được ảnh/công thức: '+e.message});}}
 return images;
}
