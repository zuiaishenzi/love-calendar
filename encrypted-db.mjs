import Database from 'better-sqlite3-multiple-ciphers';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,renameSync,unlinkSync,chmodSync,openSync,readSync,closeSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';

function isPlain(file) {
 if(!existsSync(file))return true;
 const fd=openSync(file,'r'),header=Buffer.alloc(16);
 try {const size=readSync(fd,header,0,16,0);return size===0||header.toString()==='SQLite format 3\0';}finally{closeSync(fd);}
}
function getKey(file,plain) {
 const configured=process.env.DB_ENCRYPTION_KEY;
 if(configured){
  if(!/^[a-f0-9]{64}$/i.test(configured))throw Error('DB_ENCRYPTION_KEY must contain 64 hexadecimal characters');
  return Buffer.from(configured,'hex');
 }
 const keyFile=path.join(path.dirname(file),'.database-key');
 if(!existsSync(keyFile)){
  if(!plain)throw Error('Database key is missing. Restore .database-key; encrypted data will not be overwritten.');
  writeFileSync(keyFile,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
 }
 const value=readFileSync(keyFile,'utf8').trim();
 if(!/^[a-f0-9]{64}$/i.test(value))throw Error('Invalid database key file');
 chmodSync(keyFile,0o600);
 return Buffer.from(value,'hex');
}
function unlock(file,key,options={}) {
 const db=new Database(file,options);
 try{
  db.pragma("cipher='chacha20'");
  db.key(key);
  db.prepare('SELECT count(*) FROM sqlite_master').get();
  return db;
 }catch(error){db.close();throw Error('Cannot unlock database. Check the encryption key and database integrity.',{cause:error});}
}
// Only call at startup with the old service stopped. Publish the encrypted copy
// atomically, keeping the original intact until verification and backup succeed.
export function openEncryptedDatabase(file,{readonly=false}={}) {
 mkdirSync(path.dirname(file),{recursive:true});
 const plain=isPlain(file),key=getKey(file,plain);
 if(plain&&existsSync(file)){
  if(readonly)throw Error('Start the updated service to migrate this plaintext database first.');
  const original=new Database(file);
  try{original.pragma('wal_checkpoint(TRUNCATE)');original.pragma('journal_mode=DELETE');}finally{original.close();}
  const staging=file+'.encrypting-'+randomBytes(6).toString('hex');
  try{
   copyFileSync(file,staging);chmodSync(staging,0o600);
   const migrated=new Database(staging);
   try{migrated.pragma("cipher='chacha20'");migrated.rekey(key);}finally{migrated.close();}
   const verified=unlock(staging,key);
   try{if(verified.pragma('integrity_check',{simple:true})!=='ok')throw Error('Encrypted database verification failed');}finally{verified.close();}
   copyFileSync(staging,file+'.before-encryption-'+Date.now()+'.sqlite');
   renameSync(staging,file);
  }finally{if(existsSync(staging))unlinkSync(staging);}
 }
 const db=unlock(file,key,{readonly});
 if(!readonly)chmodSync(file,0o600);
 return db;
}
