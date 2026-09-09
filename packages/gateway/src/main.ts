import { readRegularFile as readFileSync } from '../../contracts/src/io.js';
import { join } from 'node:path';
import { VerifiedRelease } from '../../contracts/src/release.js';
import { TrustedDshClosure } from '../../contracts/src/dsh.js';
try {
 const [root,stage,...extra]=process.argv.slice(2);
 if(!root || !stage || ![0,3].includes(extra.length)) throw new Error('arguments');
 const closure=extra.length?TrustedDshClosure.verify(readFileSync(extra[0]),extra[1],extra[2]):undefined;
 const release=VerifiedRelease.verify(readFileSync(join(stage,'release.manifest.json')),readFileSync(join(stage,'release.signature.json')),readFileSync(root),stage,closure);
 process.stdout.write(`Verified development release ${release.identity}; runtime activation requires route acceptance\n`);
} catch {process.stderr.write('Release admission rejected\n');process.exitCode=1;}
