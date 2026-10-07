// Internal helper: caller must capture stdout; credentials are never saved to disk.
import {spawnSync} from 'node:child_process';
const result=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8'});
if(result.status!==0)process.exit(result.status||1);
process.stdout.write(result.stdout);
