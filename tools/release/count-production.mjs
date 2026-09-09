import {readFileSync,readdirSync,lstatSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(process.argv[2]??'.cache/dsh-production');
const lock=JSON.parse(readFileSync(join(root,'package-lock.json')));
const files=[];let bytes=0;
function walk(directory,prefix='node_modules/') {for(const name of readdirSync(directory)){const path=join(directory,name),relative=prefix+name,stat=lstatSync(path);if(stat.isDirectory())walk(path,relative+'/');else{bytes+=stat.size;files.push({path:relative,role:'dsh',sha256:'0'.repeat(64),size:String(stat.size),classification:'executable'});}}}
walk(join(root,'node_modules'));
const result={scope:'npm ci --omit=dev --ignore-scripts --no-audit --no-fund, unchanged lock, native Windows',lockPackages:Object.keys(lock.packages).length-1,devMarkedPackages:Object.values(lock.packages).filter(v=>v.dev).length,files:files.length,bytes,minimumCollectionEntries:files.length*6,flatInventoryJsonBytes:Buffer.byteLength(JSON.stringify({files})),flatInventorySizeNote:'Exact path/size/role/classification shape with fixed-width placeholder hashes; excludes other manifest fields. No admission or bound change.',maxFiles:4096,maxEntries:65536};
writeFileSync(join(root,'production-inventory-evidence.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
