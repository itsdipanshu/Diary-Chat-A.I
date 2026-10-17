import {accessState} from '../account-access';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export function authConfigured(){return !!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);}
export async function authClient(){
 if(!authConfigured())throw Error('Authentication setup is pending. Add the Supabase URL and publishable key.');
 const jar=await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll(){return jar.getAll();},setAll(items){try{items.forEach(({name,value,options})=>jar.set(name,value,options));}catch{/* Server component: proxy refreshes cookies. */}}}});
}
export async function getIdentity(){if(!authConfigured())return null;const client=await authClient();const {data:{user},error}=await client.auth.getUser();if(error){console.error('[Supabase getIdentity error]',error.message);return null;}if(!user||!user.email_confirmed_at)return null;return {userId:user.id,emailVerified:true,email:user.email||'',fullName:user.user_metadata?.full_name||user.user_metadata?.name||null};}

export async function getUser(){const user=await getIdentity();return user&&accessState(user.userId)==='active'?user:null;}
