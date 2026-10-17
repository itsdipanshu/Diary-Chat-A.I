import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Diary Chat A.I — Your everyday creative space',description:'A thoughtful home for your diary, AI content calendar and conversations. Built by Dipanshu.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
