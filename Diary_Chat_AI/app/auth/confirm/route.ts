import {NextResponse} from 'next/server';
import {authClient} from '../../../lib/supabase/server';
import {appOrigin} from '../../../lib/auth-validation';
export async function GET(req:Request){const url=new URL(req.url),hash=url.searchParams.get('token_hash'),type=url.searchParams.get('type');if(hash&&(type==='signup'||type==='recovery')){const client=await authClient();const {error}=await client.auth.verifyOtp({token_hash:hash,type});if(!error)return NextResponse.redirect(appOrigin()+(type==='recovery'?'/auth/update-password':'/'));}return NextResponse.redirect(appOrigin()+'/login?error=callback');}
