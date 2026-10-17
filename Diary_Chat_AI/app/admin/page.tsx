import {getUser} from '../../lib/supabase/server';
import {isAdmin} from '../../lib/admin-access';
import {redirect,notFound} from 'next/navigation';
import AdminDashboard from './dashboard';
export const dynamic='force-dynamic';
export default async function AdminPage(){const user=await getUser();if(!user)redirect('/login');if(!isAdmin(user))notFound();return <AdminDashboard/>;}
