import {writeFileSync} from 'node:fs';
export function persistAssemblyResult(path,result){
 writeFileSync(path,JSON.stringify(result,null,2)+'\n');
 if(!result.admission.ok)process.exitCode=1;
}
