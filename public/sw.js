const CACHE='moa-netlify-v2';
const SHELL=['/','/styles.css','/app.js','/manifest.webmanifest','/images/icon-192.png','/images/icon-512.png','/images/game-night-hero.jpg','/transport.js'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
  // The game needs a network connection anyway: prefer updated files after Git deploys.
  event.respondWith(fetch(event.request).then(async response=>{
    if(response.ok){try{const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}catch{ /* Cache failure must not break online play. */ }}
    return response;
  }).catch(async()=>await caches.match(event.request)||(event.request.mode==='navigate'?await caches.match('/'):null)||Response.error()));
});
