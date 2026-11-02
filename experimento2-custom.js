'use strict';
// Compara el código didáctico original de la presentación con Node crypto (OpenSSL nativo).
// NO pretende comparar bibliotecas igualmente optimizadas.
const crypto=require('node:crypto');const {performance}=require('node:perf_hooks');
const {OUT,fs,path,median,csv,metadata,svg}=require('./common');
const C=require('./src/js/chacha.js');
const sizes=[64,256,1024,4096,16384];const reps=Number(process.env.REPETICIONES||5);const targetMs=Number(process.env.DURACION_MS||150);
if(!Number.isInteger(reps)||reps<1||reps>30||!Number.isFinite(targetMs)||targetMs<20||targetMs>10000)throw Error('REPETICIONES 1..30 y DURACION_MS 20..10000');
const key=crypto.randomBytes(32),nonce=crypto.randomBytes(12),aad=Buffer.from('metadatos autenticados para el experimento');
function native(pt){const e=crypto.createCipheriv('chacha20-poly1305',key,nonce,{authTagLength:16});e.setAAD(aad);return {ciphertext:Buffer.concat([e.update(pt),e.final()]),tag:e.getAuthTag()}}
function custom(pt){return C.aeadEncrypt(new Uint8Array(key),new Uint8Array(nonce),new Uint8Array(pt),new Uint8Array(aad))}
// El nonce se reutiliza SOLAMENTE para medir el costo de la función en mensajes de prueba descartados.
// No usar nunca esta práctica para proteger comunicaciones reales.
const raw=[];for(const bytes of sizes){const pt=crypto.randomBytes(bytes);const ref=native(pt),mine=custom(pt);if(!Buffer.from(mine.ciphertext).equals(ref.ciphertext)||!Buffer.from(mine.tag).equals(ref.tag))throw Error('Diferencia criptográfica en '+bytes+' bytes');for(const [name,fn] of [['Node crypto (OpenSSL)',()=>native(pt)],['JS propio didáctico',()=>custom(pt)]]){
 for(let rep=1;rep<=reps;rep++){
   // calentamiento para reducir ruido de JIT y primera inicialización
   for(let k=0;k<3;k++)fn();
   let count=0;const start=performance.now();let elapsed;
   do {fn();count++;elapsed=performance.now()-start}while(elapsed<targetMs);
   const mbps=bytes*count/(elapsed/1000)/1e6;
   raw.push({algoritmo:name,bytes,repeticion:rep,operaciones:count,ms:+elapsed.toFixed(4),mbps:+mbps.toFixed(5),microseg_por_operacion:+(elapsed*1000/count).toFixed(4)});
   console.log(name,bytes+' B',rep,mbps.toFixed(2)+' MB/s');
 }
}}
const summary=[];for(const alg of ['Node crypto (OpenSSL)','JS propio didáctico'])for(const bytes of sizes){let a=raw.filter(r=>r.algoritmo===alg&&r.bytes===bytes);summary.push({algoritmo:alg,bytes,mbps:+median(a.map(r=>r.mbps)).toFixed(5),microseg_por_operacion:+median(a.map(r=>r.microseg_por_operacion)).toFixed(4),n:a.length})}
const info=metadata();info.codigo_custom='src/js/chacha.js (tomado de la presentación adjunta)';info.advertencia='El JS usa BigInt y trazas didácticas; no es una biblioteca optimizada. Los resultados no aíslan el costo del algoritmo.';
csv('custom-detalle.csv',raw);csv('custom-resumen.csv',summary);fs.writeFileSync(path.join(OUT,'custom-datos.json'),JSON.stringify({metadatos:info,parametros:{reps,targetMs,sizes},detalle:raw,resumen:summary},null,2));svg('custom-grafico.svg',summary,'Implementación didáctica vs nativa');console.log('Guardado en:',OUT);
