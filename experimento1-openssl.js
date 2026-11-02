'use strict';
// Benchmark EVP AEAD con OpenSSL CLI. Sin dependencias NPM.
const {spawnSync}=require('node:child_process');
const {OUT,fs,path,median,csv,metadata,svg}=require('./common');
const sizes=[64,256,1024,16384,65536];
const algs=['chacha20-poly1305','aes-128-gcm','aes-256-gcm'];
const repeats=Number(process.env.REPETICIONES||3),seconds=Number(process.env.SEGUNDOS||1);
const binary=process.env.OPENSSL_BIN||'openssl';
if(!Number.isInteger(repeats)||repeats<1||repeats>50||!Number.isInteger(seconds)||seconds<1||seconds>60)throw Error('REPETICIONES 1..50 y SEGUNDOS 1..60');
function cmd(args,env=process.env){const r=spawnSync(binary,args,{encoding:'utf8',env,timeout:(seconds+20)*1000});if(r.error)throw r.error;if(r.status!==0)throw Error(`${binary} ${args.join(' ')}: ${r.stderr}`);return r.stdout+'\n'+r.stderr}
let ver;
try { ver=cmd(['version','-a']); }
catch(e) { throw Error('No se encontró OpenSSL CLI. Node incluye la biblioteca OpenSSL, pero no necesariamente openssl.exe. Instalá OpenSSL CLI y agregalo al PATH, o iniciá el servidor con OPENSSL_BIN apuntando al ejecutable. Detalle: '+e.message); }
const hardware=metadata();hardware.openssl_cli=ver.split('\n')[0];hardware.configuracion='predeterminada';
// Modo OPCIONAL de comparación con AES-NI deshabilitado, solo en CPU x86: configurar OPENSSL_ia32cap y correr nuevamente.
let raw=[];
for(let s of sizes)for(let alg of algs)for(let rep=1;rep<=repeats;rep++){
  const out=cmd(['speed','-elapsed','-aead','-mr','-seconds',String(seconds),'-bytes',String(s),'-evp',alg]);
  const lines=out.split(/\r?\n/);const row=lines.find(l=>l.startsWith('+F:'));
  if(!row)throw Error('No se encontró +F en salida OpenSSL: '+out);
  const fields=row.trim().split(':');const n=Number(fields[fields.length-1]);
  if(!Number.isFinite(n)||n<=0)throw Error('Valor de throughput inválido: '+row);
  const mbps=n/1e6;
  raw.push({algoritmo:alg,bytes:s,repeticion:rep,mbps:+mbps.toFixed(4),bytes_por_segundo:n});
  console.log(alg,s+' B','rep '+rep,mbps.toFixed(2)+' MB/s');
}
const summary=[];for(let alg of algs)for(let s of sizes){const sample=raw.filter(r=>r.algoritmo===alg&&r.bytes===s).map(r=>r.mbps);summary.push({algoritmo:alg,bytes:s,mbps:+median(sample).toFixed(4),min_mbps:Math.min(...sample),max_mbps:Math.max(...sample),n:sample.length})}
const stamp=new Date().toISOString();csv('openssl-detalle.csv',raw);csv('openssl-resumen.csv',summary);fs.writeFileSync(path.join(OUT,'openssl-datos.json'),JSON.stringify({metadatos:hardware,fecha:stamp,parametros:{repeats,seconds,sizes,algs,modo:'-aead -elapsed'},detalle:raw,resumen:summary},null,2));svg('openssl-grafico.svg',summary,'OpenSSL · rendimiento AEAD');console.log('Guardado en:',OUT);
