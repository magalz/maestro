import {openSync,closeSync,lstatSync,fstatSync,readSync,constants} from 'node:fs';
import {deny,MAX_BYTES} from './index.js';
/** Never request more than the selected limit plus one, even if the file grows. */
export function readBoundedDescriptor(fd:number,limit:number):Buffer {
 if(!Number.isSafeInteger(limit)||limit<0)deny('BYTES');
 const chunks:Buffer[]=[];let total=0;
 while(total<=limit){const chunk=Buffer.alloc(Math.min(65536,limit+1-total));const count=readSync(fd,chunk,0,chunk.length,null);if(!count)break;chunks.push(chunk.subarray(0,count));total+=count;}
 if(total>limit)deny('BYTES');
 return Buffer.concat(chunks,total);
}
export function readRegularFile(path:string,limit=MAX_BYTES):Buffer {
 const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.size>limit)deny('FILE');
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
 try{const opened=fstatSync(fd);if(!opened.isFile()||opened.size>limit||opened.dev!==before.dev||opened.ino!==before.ino)deny('FILE');return readBoundedDescriptor(fd,limit);}finally{closeSync(fd);}
}
