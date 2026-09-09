// Build evidence only. PE32+ import-directory reader, per Microsoft PE/COFF specification.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function imports(bytes){
 const need=(offset,size)=>{if(!Number.isSafeInteger(offset)||offset<0||offset+size>bytes.length)throw Error('Invalid PE bounds');};
 const u16=o=>{need(o,2);return bytes.readUInt16LE(o);},u32=o=>{need(o,4);return bytes.readUInt32LE(o);};
 if(u16(0)!==0x5a4d)throw Error('Not a PE image');
 const pe=u32(0x3c);if(u32(pe)!==0x4550||u16(pe+4)!==0x8664)throw Error('Expected AMD64 PE');
 const count=u16(pe+6),optional=pe+24,optionalSize=u16(pe+20);
 if(count>96||u16(optional)!==0x20b||optionalSize<112+14*8)throw Error('Unsupported PE header');
 need(optional,optionalSize+count*40);
 const sections=Array.from({length:count},(_,i)=>{const s=optional+optionalSize+i*40;return {rva:u32(s+12),size:u32(s+16),offset:u32(s+20)};});
 const offset=rva=>{const section=sections.find(s=>rva>=s.rva&&rva-s.rva<s.size);if(!section)throw Error('Unmapped import RVA');const o=section.offset+rva-section.rva;need(o,1);return o;};
 const string=rva=>{const start=offset(rva),end=bytes.indexOf(0,start);if(end<start||end-start>255)throw Error('Invalid DLL name');const name=bytes.subarray(start,end).toString('ascii');if(!/^[a-zA-Z0-9_.-]+\.dll$/i.test(name))throw Error('Unsafe DLL name');return name.toLowerCase();};
 const result=[];
 for(const [index,width,nameOffset,kind] of [[1,20,12,'import'],[13,32,4,'delay-import']]){
  if(u32(optional+108)<=index)continue;
  const rva=u32(optional+112+index*8),size=u32(optional+116+index*8);if(!rva)continue;
  const start=offset(rva);need(start,size);let ended=false;
  for(let i=0;i+width<=size;i+=width){const item=start+i;if(bytes.subarray(item,item+width).every(v=>v===0)){ended=true;break;}
   if(kind==='delay-import'&&u32(item)!==1)throw Error('Unsupported VA delay import');
   result.push({name:string(u32(item+nameOffset)),kind});
  }
  if(!ended)throw Error('Unterminated import table');
 }
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))for(const path of process.argv.slice(2))console.log(JSON.stringify({path,imports:imports(readFileSync(path))}));
