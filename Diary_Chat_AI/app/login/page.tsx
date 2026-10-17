import {accessState} from '../../lib/account-access';
import AuthForm from './auth-form';
import {authConfigured,getIdentity} from '../../lib/supabase/server';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){const p=await searchParams;const user=await getIdentity();return <AuthForm configured={authConfigured()} google={process.env.GOOGLE_AUTH_ENABLED==='true'} callbackError={!!p.error} restricted={!!user&&accessState(user.userId)!=='active'}/>;}
