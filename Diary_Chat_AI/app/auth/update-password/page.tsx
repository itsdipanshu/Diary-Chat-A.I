import AuthForm from '../../login/auth-form';
import {getUser} from '../../../lib/supabase/server';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function UpdatePassword(){if(!await getUser())redirect('/login?error=reset');return <AuthForm initial="update" configured google={false}/>;}
