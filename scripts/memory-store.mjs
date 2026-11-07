// Development/testing only: implements the subset of Netlify Blobs used by the app.
export class MemoryStore {
 constructor(){this.values=new Map();this.counter=0;}
 async getWithMetadata(key){const entry=this.values.get(key);return entry?{data:structuredClone(entry.data),etag:entry.etag,metadata:{}}:null;}
 async setJSON(key,value,options={}){
  const prior=this.values.get(key);
  if(options.onlyIfNew&&prior)return {modified:false};
  if(options.onlyIfMatch&&prior?.etag!==options.onlyIfMatch)return {modified:false};
  const etag=`"${++this.counter}"`;this.values.set(key,{data:structuredClone(value),etag});return {modified:true,etag};
 }
}
