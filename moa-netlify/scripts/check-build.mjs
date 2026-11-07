import {access,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const required=['netlify.toml','public/index.html','public/app.js','public/styles.css','public/transport.js','public/sw.js','public/manifest.webmanifest','public/images/game-night-hero.jpg','public/images/icon-192.png','public/images/icon-512.png','netlify/functions/game.mjs','netlify/functions/qr.mjs','server/room-service.js'];
for(const file of required)await access(file);
for(const file of ['public/app.js','public/transport.js','public/sw.js','netlify/functions/game.mjs','netlify/functions/qr.mjs','server/room-service.js']){
 const check=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(check.status!==0)process.exit(check.status||1);
}
// Import handlers now, so broken function dependencies fail the build.
await import('../netlify/functions/game.mjs');await import('../netlify/functions/qr.mjs');
const tests=(await readdir('test')).filter(x=>x.endsWith('.test.js')).map(x=>`test/${x}`);
const run=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit'});if(run.status!==0)process.exit(run.status||1);
console.log('MOA: files, function imports and rule tests are ready for Netlify.');
