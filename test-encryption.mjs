import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,unlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openEncryptedDatabase} from './encrypted-db.mjs';

test('整库加密：旧数据、图片、WAL、备份及密钥丢失保护',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-encryption-')),file=path.join(dir,'calendar.sqlite');
 let db;
 try{
  db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE sample(body TEXT,photo BLOB)');
  db.prepare('INSERT INTO sample VALUES(?,?)').run('private-memory-marker',Buffer.from([1,2,3,4]));db.close();db=null;
  db=openEncryptedDatabase(file);assert.equal(db.prepare('SELECT body FROM sample').get().body,'private-memory-marker');
  assert.deepEqual(db.prepare('SELECT photo FROM sample').get().photo,Buffer.from([1,2,3,4]));
  db.pragma('journal_mode=WAL');db.prepare('INSERT INTO sample VALUES(?,?)').run('wal-private-marker',Buffer.from([5]));
  assert.equal(readFileSync(file+'-wal').includes(Buffer.from('wal-private-marker')),false);
  const backup=path.join(dir,'snapshot.sqlite');db.prepare('VACUUM INTO ?').run(backup);db.close();db=null;
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sqlite'))){
   const candidate=path.join(dir,name);assert.equal(readFileSync(candidate).includes(Buffer.from('private-memory-marker')),false);
   const native=new DatabaseSync(candidate);try{assert.throws(()=>native.prepare('SELECT * FROM sample').all());}finally{native.close();}
   const restored=openEncryptedDatabase(candidate,{readonly:true});try{assert.equal(restored.pragma('integrity_check',{simple:true}),'ok');}finally{restored.close();}
  }
  db=openEncryptedDatabase(file);assert.equal(db.prepare('SELECT count(*) AS n FROM sample').get().n,2);db.close();db=null;
  const original=readFileSync(file),keyPath=path.join(dir,'.database-key'),key=readFileSync(keyPath);
  writeFileSync(keyPath,'00'.repeat(32));assert.throws(()=>openEncryptedDatabase(file),/Cannot unlock/);
  unlinkSync(keyPath);assert.throws(()=>openEncryptedDatabase(file),/key is missing/);assert.deepEqual(readFileSync(file),original);
  writeFileSync(keyPath,key);db=openEncryptedDatabase(file);assert.equal(db.prepare('SELECT count(*) AS n FROM sample').get().n,2);
 }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('新数据库首次创建即加密，重新打开沿用密钥',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'love-new-encryption-')),file=path.join(dir,'calendar.sqlite');
 try{
  let db=openEncryptedDatabase(file);db.exec("CREATE TABLE t(x); INSERT INTO t VALUES('secret')");db.close();
  const key=readFileSync(path.join(dir,'.database-key'),'utf8');db=openEncryptedDatabase(file);assert.equal(db.prepare('SELECT x FROM t').get().x,'secret');db.close();
  assert.equal(readFileSync(path.join(dir,'.database-key'),'utf8'),key);
  assert.notEqual(readFileSync(file).subarray(0,16).toString(),'SQLite format 3\0');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
