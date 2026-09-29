import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {existsSync,chmodSync} from 'node:fs';
import path from 'node:path';

// Run with the service stopped; never create a missing database.
const args=process.argv.slice(2);
if(args.length!==2||!['--check','--apply'].includes(args[0])){
 console.error('Usage: node scripts/shorten-ledger-codes.mjs --check|--apply /absolute/path/calendar.sqlite');
 process.exit(1);
}
const file=args[1];
if(!path.isAbsolute(file)||!existsSync(file))throw Error('Database must be an existing absolute path');
process.umask(0o077);
const db=new DatabaseSync(file,{readOnly:args[0]==='--check'});
try{
 db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
 const rows=db.prepare('SELECT id,code FROM ledgers ORDER BY id').all();
 const pending=rows.filter(r=>r.code.length>10);
 console.log(`Found ${pending.length} ledger(s) with codes longer than 10 characters.`);
 if(args[0]==='--apply'&&pending.length){
  const backup=file+'.before-short-codes-'+Date.now()+'-'+randomBytes(4).toString('hex')+'.sqlite';
  db.prepare('VACUUM INTO ?').run(backup);
  chmodSync(backup,0o600);
  console.log('Backup: '+backup);
  db.exec('BEGIN IMMEDIATE');
  try{
   const used=new Set(db.prepare('SELECT code FROM ledgers').all().map(r=>r.code.toUpperCase()));
   const update=db.prepare('UPDATE ledgers SET code=? WHERE id=? AND code=?');
   for(const row of pending){
    let code;do{code=randomBytes(5).toString('hex').toUpperCase();}while(used.has(code));
    used.add(code);
    if(update.run(code,row.id,row.code).changes!==1)throw Error('Ledger changed during conversion; transaction rolled back');
   }
   db.exec('COMMIT');
   console.log(`Converted ${pending.length} ledger(s). View new codes in personal settings. Existing IDs and memberships are unchanged.`);
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
}finally{db.close();}
