import { readFileSync } from 'node:fs';
export const personalStarMigration='worker/migrations/0020_personal_question_stars.sql';
const tables=['items','saved_refs','collection_item_progress'];
const objects=['idx_items_personal_star','idx_saved_personal_star','personal_star_source_update'];
export function personalStarSchemaStatus(execute){
  const result=execute(['--command',tables.map(table=>`PRAGMA table_info(${table});`).join(' ')+` SELECT name FROM sqlite_master WHERE name IN (${objects.map(name=>`'${name}'`).join(',')});`]);
  const missing=[],columns=[];
  tables.forEach((table,index)=>{
    if(!result[index].results.length)missing.push(table);
    const column=result[index].results.find(row=>row.name==='starred');columns.push(!!column);
    if(column&&(column.type.toUpperCase()!=='INTEGER'||column.notnull!==1||String(column.dflt_value)!=='0'))throw new Error('Unexpected '+table+'.starred definition; stopped.');
    if(!column)missing.push(table+'.starred');
  });
  const names=new Set(result[3].results.map(row=>row.name));
  objects.filter(name=>!names.has(name)).forEach(name=>missing.push(name));
  return {missing,columns};
}
export function applyPersonalStarSchema(execute){
  const state=personalStarSchemaStatus(execute);
  if(tables.some(table=>state.missing.includes(table)))throw new Error('Apply the base sharing/study migrations first; stopped.');
  const versionTable=execute(['--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='collection_search_user_versions';"])[0].results;
  if(versionTable.length!==1)throw new Error('Apply shared-search cache migration first; stopped.');
  tables.forEach((table,index)=>{if(!state.columns[index])execute(['--command',`ALTER TABLE ${table} ADD COLUMN starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1));`]);});
  const ddl=readFileSync(new URL('../'+personalStarMigration,import.meta.url),'utf8').replace(/^\s*--[^\r\n]*$/gm,'').replace(/^ALTER TABLE[^;]+;/gm,'').trim();
  execute(['--command',ddl]);
  const after=personalStarSchemaStatus(execute);if(after.missing.length)throw new Error('Personal star schema incomplete: '+after.missing.join(', '));
}
