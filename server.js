'use strict';
const http=require('node:http'), fs=require('node:fs/promises'), crypto=require('node:crypto');
const cookie=require('cookie'), mariadb=require('mariadb');
const pool=mariadb.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,connectionLimit:2,connectTimeout:3000,acquireTimeout:5000,bigIntAsNumber:true});
const ready=(async()=>{if(process.env.FILES_DIR!=='/files')throw Error('files unavailable');await fs.mkdir('/files/node-web',{recursive:true,mode:0o700});await pool.query('CREATE TABLE IF NOT EXISTS node_web_users (id INT PRIMARY KEY AUTO_INCREMENT, login VARCHAR(40) UNIQUE NOT NULL, salt CHAR(32) NOT NULL, password_hash CHAR(128) NOT NULL)');})();ready.catch(()=>{});
const sessions=new Map(), random=()=>crypto.randomBytes(24).toString('hex');
const hash=(password,salt)=>new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(error,result)=>error?reject(error):resolve(result.toString('hex'))));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function send(r,status,body,type='text/html; charset=utf-8'){r.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});r.end(body);}
async function body(q){let size=0,parts=[];for await(const part of q){size+=part.length;if(size>16384)throw Error('body too large');parts.push(part);}return new URLSearchParams(Buffer.concat(parts).toString());}
http.createServer(async(q,r)=>{try{
 await ready; const url=new URL(q.url,'http://localhost');
 if(url.pathname==='/healthz'){send(r,200,'ok','text/plain');return;}
 let sid=cookie.parse(q.headers.cookie||'').node_web_session,session=sessions.get(sid),now=Date.now();
 for(const [id,item] of sessions)if(item.until<now)sessions.delete(id);
 if(!session||session.until<now){if(sessions.size>=500){send(r,503,'暫時無法建立 Session');return;}sid=random();session={csrf:random(),until:now+1800000};sessions.set(sid,session);}
 r.setHeader('Set-Cookie',cookie.serialize('node_web_session',sid,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:1800}));
 let error='';
 if(q.method==='POST'){
  const form=await body(q),action=form.get('action');
  if(form.get('csrf')!==session.csrf){send(r,403,'表單已過期');return;}
  if(action==='register'||action==='login'){
   const login=form.get('login')||'',password=form.get('password')||'';
   if(!/^[A-Za-z0-9_-]{3,40}$/.test(login)||password.length<8||password.length>128)throw Error('invalid account');
   if(action==='register'){const salt=crypto.randomBytes(16).toString('hex');await pool.query('INSERT INTO node_web_users (login,salt,password_hash) VALUES (?,?,?)',[login,salt,await hash(password,salt)]);}
   const users=await pool.query('SELECT id,salt,password_hash FROM node_web_users WHERE login=?',[login]);
   if(!users[0]||!crypto.timingSafeEqual(Buffer.from(users[0].password_hash,'hex'),Buffer.from(await hash(password,users[0].salt),'hex'))){error='帳號或密碼不正確';}
   else{sessions.delete(sid);sid=random();session={csrf:random(),until:now+1800000,user:users[0].id,login};sessions.set(sid,session);r.setHeader('Set-Cookie',cookie.serialize('node_web_session',sid,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:1800}));}
  }else if(action==='logout'){sessions.delete(sid);r.setHeader('Set-Cookie',cookie.serialize('node_web_session','',{path:'/',maxAge:0,secure:true,httpOnly:true,sameSite:'lax'}));}
  else if(action==='save'&&session.user){await fs.writeFile('/files/node-web/note-'+session.user+'.txt',(form.get('note')||'').slice(0,4000),{mode:0o600});}
  if(!error){r.writeHead(303,{Location:'/'});r.end();return;}
 }
 let note='';if(session.user){try{note=await fs.readFile('/files/node-web/note-'+session.user+'.txt','utf8');}catch(e){if(e.code!=='ENOENT')throw e;}}
 const csrf='<input type="hidden" name="csrf" value="'+session.csrf+'">';
 send(r,200,'<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>Node.js 完整網站</title><style>body{font:18px system-ui;max-width:780px;margin:40px auto;padding:20px}input,textarea,button{font:inherit;margin:8px;padding:8px}section{padding:20px;background:#edf5fa}</style></head><body><h1>Node.js 登入與永久筆記</h1><p>npm cookie 套件、個人 MariaDB、/files 永久檔案。請使用虛構測試資料。</p><p role="alert">'+escape(error)+'</p>'+(session.user?'<h2>已登入：'+escape(session.login)+'</h2><section><form action="/" method="post">'+csrf+'<label>永久筆記<textarea name="note">'+escape(note)+'</textarea></label><button name="action" value="save">保存筆記</button><button name="action" value="logout">登出</button></form></section>':'<form action="/" method="post">'+csrf+'<label>帳號<input name="login" required></label><label>密碼<input name="password" type="password" minlength="8" required></label><button name="action" value="register">註冊並登入</button><button name="action" value="login">登入</button></form>')+'<p>帳號與筆記在重新部署後保留；記憶體 Session 暫存會清除。</p></body></html>');
 }catch(e){send(r,503,'服務暫時無法使用，請確認帳號沒有重複、資料庫與檔案空間可用。','text/plain; charset=utf-8');}
}).listen(Number(process.env.PORT||8080),'0.0.0.0');
