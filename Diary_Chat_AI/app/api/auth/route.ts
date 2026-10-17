import {accessState} from '../../../lib/account-access';
import {authClient} from '../../../lib/supabase/server';
import {validEmail,validPassword,appOrigin,sameOrigin} from '../../../lib/auth-validation';
export async function POST(req:Request){try{
 if(!sameOrigin(req.headers.get('origin')))return Response.json({error:'Invalid origin.'},{status:403});
 const raw=await req.text();if(raw.length>8192)return Response.json({error:'Request too large.'},{status:413});
 const b=JSON.parse(raw),client=await authClient(),origin=appOrigin();let result:any;
 if(b.action==='google'){if(process.env.GOOGLE_AUTH_ENABLED!=='true')throw Error('Google sign-in setup is pending. Use email instead.');result=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:origin+'/auth/callback',skipBrowserRedirect:true}});if(result.error)throw result.error;return Response.json({url:result.data.url});}
 if(b.action==='signup'){const full_name=String(b.name||'').trim();if(!full_name||full_name.length>80)throw Error('Enter your name (up to 80 characters).');result=await client.auth.signUp({email:validEmail(b.email),password:validPassword(b.password),options:{data:{full_name},emailRedirectTo:origin+'/auth/callback'}});}
 else if(b.action==='login'){result=await client.auth.signInWithPassword({email:validEmail(b.email),password:String(b.password||'')});if(result.error)return Response.json({error:'Unable to sign in. Check your email/password and verify your email first.'},{status:400});}
 else if(b.action==='forgot'){result=await client.auth.resetPasswordForEmail(validEmail(b.email),{redirectTo:origin+'/auth/callback?flow=recovery'});}
 else if(b.action==='resend'){result=await client.auth.resend({type:'signup',email:validEmail(b.email),options:{emailRedirectTo:origin+'/auth/callback'}});}
 else if(b.action==='update'){const {data:{user}}=await client.auth.getUser();if(!user)return Response.json({error:'Open a valid password reset link or sign in first.'},{status:401});result=await client.auth.updateUser({password:validPassword(b.password)});}
 else if(b.action==='logout'){result=await client.auth.signOut({scope:'local'});}
 else if(b.action!=='google')throw Error('Unknown action.');
 if(b.action==='login'&&!result?.error&&result?.data?.user&&accessState(result.data.user.id)!=='active'){await client.auth.signOut({scope:'local'});return Response.json({error:'Your account access is paused or blocked. Contact the app administrator.'},{status:403});}
 if(result?.error)throw Error(result.error.status===429?'Too many attempts. Please wait before trying again.':b.action==='signup'?'Could not create the account. Try signing in or resetting your password.':b.action==='update'?'Password update failed. Request a fresh reset link.':'Request failed. Please wait and retry.');
 return Response.json({ok:true,redirect:b.action==='login'||b.action==='update'?'/' : b.action==='logout'?'/login':undefined,message:b.action==='signup'?'Check your email to verify your account. If already registered, sign in or reset your password.':b.action==='forgot'?'If an account exists, a password reset email will arrive shortly.':b.action==='resend'?'If eligible, a fresh verification email will arrive shortly.':undefined});
 }catch(e:any){return Response.json({error:e.message||'Authentication failed.'},{status:400});}}
