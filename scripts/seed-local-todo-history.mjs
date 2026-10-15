// Local D1 only. Seed IDs are isolated so --clear never removes real tasks.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args=process.argv.slice(2);let clear=false,requested;
for(let i=0;i<args.length;i++){
 if(args[i]==='--clear')clear=true;
 else if(args[i]==='--user'&&args[i+1]&&!args[i+1].startsWith('--'))requested=args[++i];
 else throw new Error('Usage: node scripts/seed-local-todo-history.mjs [--user ID] [--clear]');
}
const root=fileURLToPath(new URL('../',import.meta.url)),cli=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function query(sql){
 const result=spawnSync(process.execPath,[cli,'d1','execute','redolve-db','--local','--persist-to',resolve(root,'.wrangler/state'),'--command',sql,'--json'],{
  cwd:root,encoding:'utf8',env:{...process.env,WRANGLER_LOG_PATH:resolve(root,'.wrangler/qa/logs'),WRANGLER_SEND_METRICS:'false'},
 });
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(result.stderr||result.stdout);
 const response=JSON.parse(result.stdout);if(response.some(row=>row.success!==true))throw new Error('Local D1 query failed');
 return response.map(row=>row.results);
}
const [users]=query("SELECT u.id,u.name,COUNT(w.id) AS widgets FROM users u LEFT JOIN home_widget_items w ON w.user_id=u.id AND w.deleted_at IS NULL AND w.id NOT LIKE 'local-todo-history-%' GROUP BY u.id,u.name ORDER BY u.id;");
const candidates=requested?users.filter(user=>user.id===requested):users.filter(user=>user.widgets>0);
if(candidates.length!==1)throw new Error('請用 --user 指定本地帳號；目前無法唯一判定使用中的帳號。');
const user=candidates[0],owner=quote(user.id),prefix='local-todo-history-'+createHash('sha256').update(user.id).digest('hex').slice(0,12)+'-';
const [before]=query('SELECT * FROM home_widget_items WHERE user_id='+owner+' ORDER BY id;');
const now=Date.now(),stamp=new Date(now).toISOString().replace(/[:.]/g,'-'),dir=resolve(root,'.wrangler/local-db-backups');
mkdirSync(dir,{recursive:true});
const backup=resolve(dir,stamp+'-before-todo-history.json');
writeFileSync(backup,JSON.stringify({user_id:user.id,seed_prefix:prefix,items:before},null,2));
if(clear){
 query('DELETE FROM home_widget_items WHERE user_id='+owner+' AND id GLOB '+quote(prefix+'*')+';');
}else{
 const dayMs=86400000,day=Math.floor((now+8*3600000)/dayMs),statements=[];
 for(let ago=0;ago<=6;ago++){
  const start=(day-ago)*dayMs-8*3600000,date=new Date((day-ago)*dayMs).toISOString().slice(0,10);
  for(let i=0;i<(ago===0?2:3);i++){
   const completed=Math.min(now,start+9*3600000+i*30*60000),id=prefix+date+'-'+i;
   statements.push('INSERT INTO home_widget_items(id,user_id,kind,text,completed_at,created_at,updated_at,row_version) VALUES('+[quote(id),owner,"'todo'",quote('[本地測試] '+date+' 已完成事項 '+(i+1)),completed,completed-3600000,now,1].join(',')+') ON CONFLICT(id) DO NOTHING;');
  }
 }
 query(statements.join('\n'));
}
const [after,days]=query('SELECT * FROM home_widget_items WHERE user_id='+owner+' ORDER BY id; SELECT date(completed_at/1000,\'unixepoch\',\'+8 hours\') AS completed_day,COUNT(*) AS count FROM home_widget_items WHERE user_id='+owner+' AND id GLOB '+quote(prefix+'*')+' GROUP BY completed_day ORDER BY completed_day;');
const originals=rows=>rows.filter(item=>!item.id.startsWith(prefix));
if(JSON.stringify(originals(before))!==JSON.stringify(originals(after)))throw new Error('原有資料驗證未通過，請檢查備份：'+backup);
console.log('LOCAL D1 only:',user.name,'('+user.id+')');
console.log('Backup:',backup);
console.log('Original rows preserved:',originals(before).length);
console.log(clear?'Test rows cleared.':'Completed test rows: '+days.reduce((sum,row)=>sum+row.count,0));
console.log(JSON.stringify(days,null,2));
