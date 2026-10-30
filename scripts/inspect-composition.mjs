// Inspect the boot plan without evaluating added native modules or starting QQ.
import { describeComposition } from '../src/kernel/composition.js';
console.log(JSON.stringify(await describeComposition(), null, 2));
