import {NextResponse} from 'next/server';
import {authClient} from '../../../lib/supabase/server';
import {appOrigin} from '../../../lib/auth-validation';
export async function GET(req:Request){const url=new URL(req.url),code=url.searchParams.get('code');if(code){const client=await authClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(appOrigin()+(url.searchParams.get('flow')==='recovery'?'/auth/update-password':'/'));}return NextResponse.redirect(appOrigin()+'/login?error=callback');}
