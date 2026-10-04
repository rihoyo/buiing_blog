// Public, already published records. Static HTML remains available during outages.
export function mergePosts(staticPosts,livePosts){
 const posts=new Map(staticPosts.map(p=>[p.id,p]));
 for(const p of livePosts){const old=posts.get(p.id);if(p.visibility==='withdrawn'||!old||(p.updatedAt||'')>=(old.updatedAt||''))posts.set(p.id,p)}
 return [...posts.values()].filter(p=>p.visibility!=='withdrawn').sort((a,b)=>b.date.localeCompare(a.date)||(b.updatedAt||'').localeCompare(a.updatedAt||''));
}
export async function loadLivePosts(){
 try{
  const config=await(await fetch(new URL('config.json',document.baseURI))).json();
  if(!config.supabaseUrl||!config.supabasePublishableKey)return [];
  const result=[];
  const signal=AbortSignal.timeout(5000);
  for(let offset=0;;offset+=1000){
   const url=new URL('/rest/v1/published_posts',config.supabaseUrl);
   url.search=new URLSearchParams({select:'post,source_file',order:'id',limit:'1000',offset:String(offset)});
   const response=await fetch(url,{headers:{apikey:config.supabasePublishableKey},cache:'no-store',signal});
   if(!response.ok)return [];
   const rows=await response.json();if(!Array.isArray(rows))return [];
   for(const row of rows){const p=row.post;if(p?.visibility==='withdrawn'&&/^[\w-]{1,160}$/.test(p.id)){result.push({id:p.id,visibility:'withdrawn',updatedAt:p.updatedAt||''});continue}if(p&&/^[\w-]{1,160}$/.test(p.id)&&typeof p.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&Array.isArray(p.blocks))result.push({...p,sourceFile:row.source_file})}
   if(rows.length<1000)return result;
  }
 }catch{return []}
}
