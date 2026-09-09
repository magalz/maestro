// Development evidence only: expected identities are taken from the separately reviewed assembly result.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {TrustedDshClosure} from '../../dist/packages/contracts/src/dsh.js';
import {VerifiedRelease} from '../../dist/packages/contracts/src/release.js';
const directory=resolve(process.argv[2]),result=JSON.parse(readFileSync(join(directory,'assembly-result.json')));
const start=performance.now();
const closure=TrustedDshClosure.verify(readFileSync(join(directory,'REVIEWED-DSH-CLOSURE.json')),result.closure_sha256,result.lock_sha256);
const stage=join(directory,'staged');
const release=VerifiedRelease.verify(readFileSync(join(stage,'release.manifest.json')),readFileSync(join(stage,'release.signature.json')),readFileSync(join(directory,'DEVELOPMENT-ONLY-root.json')),stage,closure);
const measurement={consumer:'node-typescript',identity:release.identity,elapsed_ms:performance.now()-start,process_peak_rss_kib:process.resourceUsage().maxRSS,memory_method:'process.resourceUsage maxRSS, dedicated child process; includes contract module loading'};
writeFileSync(join(directory,'node-admission-metrics.json'),JSON.stringify(measurement,null,2)+'\n');
console.log(JSON.stringify(measurement,null,2));
