import Studio from './studio';
import {isAdmin} from '../lib/admin-access';
import {getUser} from '../lib/supabase/server';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getUser();if(!user)redirect('/login');return <Studio isAdmin={isAdmin(user)}/>;}
