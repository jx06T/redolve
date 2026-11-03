import { spawnSync } from 'node:child_process';
import { cpSync,existsSync,mkdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPersonalStarSchema,personalStarSchemaStatus } from './personal-star-schema.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
if(args.some(arg=>!['--local','--remote','--check'].includes(arg))||args.includes('--local')===args.includes('--remote'))throw new Error('Choose --local or --remote, optionally --check.');
process.env.WRANGLER_SEND_METRICS='false';process.env.WRANGLER_LOG_PATH=path.join(root,'.wrangler/qa/logs');
const local=args.includes('--local');
const run=args=>{
  const result=spawnSync(process.execPath,[path.join(root,'node_modules/wrangler/bin/wrangler.js'),...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(result.error)throw result.error;if(result.status!==0)throw new Error(result.stderr||result.stdout||'Wrangler failed; stopped.');return result.stdout;
};
const execute=options=>{
  const result=JSON.parse(run(['d1','execute','redolve-db',...(local?['--local','--persist-to',path.join(root,'.wrangler/state')]:['--remote']),...options,'--json']));
  if(!Array.isArray(result)||result.some(row=>!row.success||!Array.isArray(row.results)))throw new Error('Invalid D1 response; stopped.');return result;
};
console.log('Target: '+(local?'LOCAL .wrangler/state':'REMOTE redolve-db'));
const before=personalStarSchemaStatus(execute);console.log('Missing: '+(before.missing.join(', ')||'none'));
if(!args.includes('--check')&&before.missing.length){
  const folder=path.join(root,'.wrangler/local-db-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-before-personal-stars');mkdirSync(folder,{recursive:true});
  if(local){const state=path.join(root,'.wrangler/state/v3/d1');if(!existsSync(state))throw new Error('Local state missing; stopped.');cpSync(state,path.join(folder,'d1'),{recursive:true});}
  else{const bookmark=run(['d1','time-travel','info','redolve-db']);if(!/bookmark/i.test(bookmark)||!/[0-9a-f]{8}-[0-9a-f-]+/i.test(bookmark))throw new Error('Time Travel bookmark missing; stopped.');writeFileSync(path.join(folder,'remote-bookmark.txt'),bookmark);console.log(bookmark.trim());}
  console.log('Backup: '+path.relative(root,folder));applyPersonalStarSchema(execute);console.log('0020 ready. Existing question/work/progress data preserved.');
}else console.log(args.includes('--check')?'Read-only check; no writes.':'0020 already applied; no writes.');
