'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { metadata } = require('./common');
const ROOT = __dirname;
const OUT = path.join(ROOT, 'resultados');
const PORT = Number(process.env.PORT || 3000);
const tasks = {
  openssl: { script: 'experimento1-openssl.js', json: 'openssl-datos.json', svg: 'openssl-grafico.svg', csv: 'openssl-resumen.csv', detail: 'openssl-detalle.csv' },
  custom: { script: 'experimento2-custom.js', json: 'custom-datos.json', svg: 'custom-grafico.svg', csv: 'custom-resumen.csv', detail: 'custom-detalle.csv' }
};
let active = null, state = { running:false, experiment:null, log:[], error:null, started:null, ended:null };
function send(res,status,data,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(type.startsWith('application/json')?JSON.stringify(data):data);
}
function getBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',b=>{s+=b;if(s.length>4096){reject(new Error('Solicitud demasiado grande'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch(e){reject(e);}});req.on('error',reject);});}
function validInteger(n,min,max){return Number.isInteger(n)&&n>=min&&n<=max;}
function readResult(id){const t=tasks[id];const p=path.join(OUT,t.json);if(!fs.existsSync(p))return null;return JSON.parse(fs.readFileSync(p,'utf8'));}
function opensslStatus(){
  const binary=process.env.OPENSSL_BIN||'openssl';
  const r=spawnSync(binary,['version'],{encoding:'utf8',timeout:3000,windowsHide:true});
  return {disponible:!r.error&&r.status===0,ejecutable:binary,version:(!r.error&&r.status===0)?r.stdout.trim():null};
}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&u.pathname==='/')return send(res,200,fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),'text/html; charset=utf-8');
  if(req.method==='GET'&&u.pathname==='/api/info')return send(res,200,{hardware:metadata(),openssl_cli:opensslStatus(),experiments:Object.keys(tasks)});
  if(req.method==='GET'&&u.pathname==='/api/status')return send(res,200,state);
  if(req.method==='GET'&&u.pathname==='/api/results'){
    const all={};for(const id of Object.keys(tasks)){try{all[id]=readResult(id);}catch(e){all[id]={error:e.message};}}return send(res,200,all);
  }
  if(req.method==='GET'&&u.pathname.startsWith('/resultados/')){
    const filename=u.pathname.slice('/resultados/'.length);
    const allowed=Object.values(tasks).flatMap(t=>[t.json,t.svg,t.csv,t.detail]);
    if(!allowed.includes(filename))return send(res,404,{error:'Archivo no disponible'});
    const p=path.join(OUT,filename);if(!fs.existsSync(p))return send(res,404,{error:'Todavía no se generó'});
    const ext=path.extname(filename);const type=ext==='.svg'?'image/svg+xml':ext==='.csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Content-Disposition':`attachment; filename="${filename}"`});return fs.createReadStream(p).pipe(res);
  }
  if(req.method==='POST'&&u.pathname==='/api/run'){
    if(active)return send(res,409,{error:'Ya hay una prueba ejecutándose'});
    let body;try{body=await getBody(req);}catch(e){return send(res,400,{error:e.message});}
    const id=body.experiment;const repeats=Number(body.repeats), duration=Number(body.duration);
    if(!tasks[id])return send(res,400,{error:'Experimento inválido'});
    if(!validInteger(repeats,1,id==='openssl'?20:30))return send(res,400,{error:'Repeticiones fuera de rango'});
    if(!validInteger(duration,id==='openssl'?1:20,id==='openssl'?20:10000))return send(res,400,{error:'Duración fuera de rango'});
    // El backend ejecuta únicamente scripts predefinidos. No recibe comandos arbitrarios.
    const env={...process.env,REPETICIONES:String(repeats)};
    if(id==='openssl')env.SEGUNDOS=String(duration);else env.DURACION_MS=String(duration);
    state={running:true,experiment:id,log:[],error:null,started:new Date().toISOString(),ended:null};
    try{
      const child=spawn(process.execPath,[path.join(ROOT,tasks[id].script)],{cwd:ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      active=child;
      const record=(data,prefix)=>{const lines=String(data).split(/\r?\n/).filter(Boolean);state.log.push(...lines.map(x=>prefix+x));if(state.log.length>180)state.log=state.log.slice(-180);};
      child.stdout.on('data',b=>record(b,''));child.stderr.on('data',b=>record(b,'ERROR: '));
      child.on('error',err=>{state.error=err.message;state.running=false;state.ended=new Date().toISOString();active=null;});
      child.on('close',code=>{if(code!==0&&!state.error)state.error=`El proceso terminó con código ${code}. Revisá el registro.`;state.running=false;state.ended=new Date().toISOString();active=null;});
      return send(res,202,{ok:true});
    }catch(e){active=null;state.running=false;state.error=e.message;return send(res,500,{error:e.message});}
  }
  return send(res,404,{error:'Ruta no encontrada'});
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Laboratorio disponible en http://localhost:${PORT}`));
