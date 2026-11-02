# Laboratorio ChaCha20-Poly1305

Pruebas locales de rendimiento de cifrado autenticado. El proyecto permite ejecutar benchmarks desde una página HTML sencilla y exportar las mediciones para su análisis.

## Requisitos

- Node.js 18 o superior (Windows o Linux).
- OpenSSL CLI para el primer experimento; el segundo usa `node:crypto` y no requiere el ejecutable de OpenSSL.
- Navegador web para la interfaz.

No hay dependencias de npm.

## Ejecutar

**Windows:** abrir `iniciar.bat` o ejecutar `node servidor.js` en PowerShell.

**Linux:**

```bash
sudo apt install nodejs openssl   # Debian/Ubuntu; comprobar que Node sea 18+
./iniciar.sh
```

En distribuciones distintas, instalar Node.js y OpenSSL mediante su gestor de paquetes. En ambos sistemas, abrir **http://127.0.0.1:3000**. La terminal debe permanecer abierta. El puerto puede cambiarse con `PORT=3001 node servidor.js` en Linux o `$env:PORT='3001'; node servidor.js` en PowerShell.

Si el comando `openssl` no está en `PATH`, se puede especificar la ruta mediante `OPENSSL_BIN`:

```powershell
# Windows / PowerShell
$env:OPENSSL_BIN='C:\Program Files\OpenSSL-Win64\bin\openssl.exe'
node servidor.js
```

```bash
# Linux
OPENSSL_BIN=/usr/bin/openssl node servidor.js
```

La versión de OpenSSL mostrada por Node.js no implica que OpenSSL CLI esté instalado. Comprobarlo con `openssl version`.

## Experimentos

**1. OpenSSL.** Compara ChaCha20-Poly1305, AES-128-GCM y AES-256-GCM con `openssl speed` en modo AEAD. Mide throughput con distintos tamaños de mensaje y permite ajustar repeticiones y duración. Requiere OpenSSL CLI.

**2. Implementación didáctica.** Compara la implementación JavaScript de `src/js/chacha.js` contra la implementación nativa expuesta por `node:crypto`. Antes de medir, verifica que las salidas coincidan. No es una comparación entre dos bibliotecas igualmente optimizadas ni permite concluir qué algoritmo es más rápido.

Los parámetros se ajustan desde la interfaz. Para ejecutarlos sin navegador:

```bash
npm test
npm run bench:openssl
npm run bench:custom
```

`npm` se usa solo como lanzador de comandos; también se pueden ejecutar directamente con `node`.

En Linux se pueden ajustar parámetros así:

```bash
REPETICIONES=5 SEGUNDOS=2 node experimento1-openssl.js
REPETICIONES=5 DURACION_MS=500 node experimento2-custom.js
```

En PowerShell:

```powershell
$env:REPETICIONES='5'; $env:SEGUNDOS='2'; node experimento1-openssl.js
$env:DURACION_MS='500'; node experimento2-custom.js
```

## Resultados

Los archivos se generan en `resultados/`, carpeta excluida del repositorio:

- `*-resumen.csv`: mediana del rendimiento por algoritmo y tamaño.
- `*-detalle.csv`: cada repetición individual.
- `*-datos.json`: mediciones y entorno (CPU, sistema, RAM, versiones).
- `*-grafico.svg`: gráfico vectorial para el informe.

Cada ejecución reemplaza los resultados de ese experimento. Guardar los archivos que se quieran conservar antes de volver a medir.

## Consideraciones metodológicas

- MB/s se expresa en millones de bytes por segundo.
- Los resultados dependen de CPU, extensiones disponibles, carga del sistema, biblioteca y tamaño de los mensajes. Documentar el entorno antes de comparar máquinas.
- El primer experimento mide una ruta AEAD de OpenSSL; no representa necesariamente el rendimiento integral de una conexión TLS.
- El segundo experimento incluye los costos de JavaScript, de `BigInt` y de las APIs; no aísla el costo del cifrado matemático.
- Para evitar sesgos, repetir las pruebas con el equipo sin otras tareas exigentes y usar medianas en lugar de una sola corrida.
- Las claves y nonces utilizados en los benchmarks son exclusivamente de prueba: no reutilizar un nonce con la misma clave al cifrar datos reales.

La implementación didáctica proviene del código de la presentación del trabajo. No se diseñó para utilizarla en producción.

## Estructura

```text
index.html                 Interfaz local
servidor.js                API local y ejecución de scripts
experimento1-openssl.js    Benchmark OpenSSL CLI
experimento2-custom.js     Benchmark JS propio vs nativo
common.js                  Exportación CSV, JSON y SVG
src/js/chacha.js           Implementación didáctica
 test/chacha.test.js        Vectores de prueba y verificaciones
iniciar.bat                Inicio en Windows
iniciar.sh                 Inicio en Linux
```

El servidor escucha únicamente en `127.0.0.1`. No es necesario exponerlo a Internet.
