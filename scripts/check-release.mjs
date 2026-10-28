import {fileURLToPath} from 'node:url';
import {checkRelease} from './release-files.mjs';
const files=await checkRelease(fileURLToPath(new URL('../',import.meta.url)));
console.log(`Release check passed: ${files.length} source files; blank starter; runtime data excluded.`);
