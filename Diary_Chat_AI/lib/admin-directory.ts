export type AccountSummary={access?:string;protected?:boolean;id:string;email:string;name:string;username:string;country:string;language:string;timezone:string;createdAt:string|null;lastSignInAt:string|null;verified:boolean;profileComplete:boolean;providers:string[]};
const text=(value:unknown,limit=120)=>typeof value==='string'?value.slice(0,limit):'';
// Explicit allowlist: never return raw auth users, metadata, identities or tokens.
export function summarizeAccount(user:any,profile:any):AccountSummary{return {
 id:text(user.id),email:text(user.email,254),name:text(profile?.name||user.user_metadata?.full_name||user.user_metadata?.name,80),username:text(profile?.username,24),country:text(profile?.country,100),language:text(profile?.language,100),timezone:text(profile?.timezone,100),createdAt:text(user.created_at)||null,lastSignInAt:text(user.last_sign_in_at)||null,verified:!!user.email_confirmed_at,profileComplete:!!(profile?.username&&profile?.country&&profile?.language&&profile?.timezone),providers:Array.isArray(user.app_metadata?.providers)?user.app_metadata.providers.filter((v:unknown)=>typeof v==='string').map((v:string)=>v.slice(0,40)):[]
};}
export async function loadAllAccounts(listUsers:(p:{page:number;perPage:number})=>Promise<any>){
 const users=new Map<string,any>();
 for(let page=1;page<=50;page++){
  const {data,error}=await listUsers({page,perPage:1000});
  if(error||!Array.isArray(data?.users))throw Error('Account provider unavailable. Please retry.');
  for(const user of data.users)users.set(user.id,user);
  if(data.users.length<1000)return [...users.values()];
 }
 throw Error('Account directory is too large for this dashboard edition. No partial totals are shown.');
}
export function directoryView(accounts:AccountSummary[],params:URLSearchParams,now=Date.now()){
 const q=(params.get('q')||'').trim().toLowerCase().slice(0,150),status=params.get('status')||'all',country=params.get('country')||'',access=params.get('access')||'';
 const raw=Number(params.get('page')||1),pageNumber=Number.isSafeInteger(raw)&&raw>0?raw:1;
 const countries=[...new Set(accounts.map(u=>u.country).filter(Boolean))].sort();
 const stats={total:accounts.length,verified:accounts.filter(u=>u.verified).length,new7Days:accounts.filter(u=>{const t=Date.parse(u.createdAt||'');return t>=now-7*86400000&&t<=now;}).length,profileComplete:accounts.filter(u=>u.profileComplete).length};
 const filtered=accounts.filter(u=>(!access||(u.access||'active')===access)&&(!q||[u.email,u.name,u.username,u.id].some(v=>v.toLowerCase().includes(q)))&&(!country||u.country===country)&&(status==='verified'?u.verified:status==='unverified'?!u.verified:true)).sort((a,b)=>(Date.parse(b.createdAt||'')||0)-(Date.parse(a.createdAt||'')||0)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(filtered.length/25)),page=Math.min(pageNumber,pages);
 return {stats,countries,matched:filtered.length,page,pages,users:filtered.slice((page-1)*25,page*25),refreshedAt:new Date(now).toISOString()};
}
