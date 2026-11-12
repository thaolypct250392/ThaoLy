// Read-only bounded Compound File reader for the Equation Native stream.
export function equationNative(bytes){
 if(bytes.length<512||bytes.length>8000000||Array.from(bytes.slice(0,8)).join(',')!=='208,207,17,224,161,177,26,225')throw Error('Đối tượng OLE không hợp lệ.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=o=>{if(o<0||o+4>bytes.length)throw Error('OLE bị cắt ngắn.');return v.getUint32(o,true);};
 const shift=v.getUint16(30,true),miniShift=v.getUint16(32,true);if(![9,12].includes(shift)||miniShift!==6||v.getUint16(28,true)!==0xfffe)throw Error('OLE chưa hỗ trợ.');
 const size=2**shift,total=Math.floor(bytes.length/size)-1,sector=id=>{if(id>=total)throw Error('Số sector OLE không hợp lệ.');return bytes.slice((id+1)*size,(id+2)*size);};
 const end=0xfffffffe,free=0xffffffff,fatIds=[];for(let i=0;i<109;i++){const id=u(76+i*4);if(id!==free)fatIds.push(id);}
 if(u(72)!==0||u(44)!==fatIds.length)throw Error('Bảng DIFAT OLE ngoài phạm vi hỗ trợ.');
 const fat=[];for(const id of fatIds){const b=sector(id),d=new DataView(b.buffer,b.byteOffset,b.byteLength);for(let i=0;i<b.length;i+=4)fat.push(d.getUint32(i,true));}
 const chain=(start,table,get,unit,maxBytes)=>{const chunks=[],seen=new Set();let length=0;while(start!==end){if(start===free||seen.has(start)||start>=table.length)throw Error('Chuỗi OLE bị hỏng.');seen.add(start);const b=get(start);chunks.push(b);length+=b.length;if(length>maxBytes+unit||seen.size>total*8+1)throw Error('Chuỗi OLE quá dài.');start=table[start];}const all=new Uint8Array(length);let offset=0;for(const b of chunks){all.set(b,offset);offset+=b.length;}return all;};
 const readNormal=(id,max)=>chain(id,fat,sector,size,max);
 const dir=readNormal(u(48),8000000);let root,eq;
 for(let o=0;o+128<=dir.length;o+=128){const d=new DataView(dir.buffer,dir.byteOffset+o,128),n=d.getUint16(64,true);if(n<2||n>64||n%2)continue;let name='';for(let i=0;i<n-2;i+=2)name+=String.fromCharCode(d.getUint16(i,true));const type=dir[o+66],entry={id:d.getUint32(116,true),size:d.getUint32(120,true)};if(d.getUint32(124,true))throw Error('Luồng OLE quá lớn.');if(type===5)root=entry;if(type===2&&name==='Equation Native')eq=entry;}
 if(!root||!eq||eq.size<6||eq.size>1000000)throw Error('Không có Equation Native hợp lệ.');
 let stream;
 if(eq.size>=u(56))stream=readNormal(eq.id,eq.size).slice(0,eq.size);
 else {const miniRoot=readNormal(root.id,root.size).slice(0,root.size),miniFatBytes=readNormal(u(60),u(64)*size),miniFat=[];const d=new DataView(miniFatBytes.buffer,miniFatBytes.byteOffset,miniFatBytes.byteLength);for(let i=0;i<miniFatBytes.length;i+=4)miniFat.push(d.getUint32(i,true));stream=chain(eq.id,miniFat,id=>{if(id*64+64>miniRoot.length)throw Error('Mini sector OLE bị hỏng.');return miniRoot.slice(id*64,id*64+64);},64,eq.size).slice(0,eq.size);}
 const hdr=new DataView(stream.buffer,stream.byteOffset,stream.byteLength).getUint16(0,true);if(hdr<4||hdr>=stream.length)throw Error('Header Equation Native không hợp lệ.');return stream.slice(hdr);
}
