import { demonstrations } from './hosts.mjs';
process.stdout.write(JSON.stringify(demonstrations(), null, 2) + '\n');
