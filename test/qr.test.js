import test from 'node:test';import assert from 'node:assert/strict';import qr from '../netlify/functions/qr.mjs';
test('QR only generates for same-site, eight-character room links',async()=>{
 const good='https://moa.example/?room=ABCD2345';let r=await qr(new Request('https://moa.example/api/qr?url='+encodeURIComponent(good)));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.ok((await r.arrayBuffer()).byteLength>1000);
 for(const link of ['https://evil.example/?room=ABCD2345','https://moa.example/foo?room=ABCD2345','https://moa.example/?room=BAD','https://moa.example/?room=ABC12345']){r=await qr(new Request('https://moa.example/api/qr?url='+encodeURIComponent(link)));assert.equal(r.status,400);}
});
