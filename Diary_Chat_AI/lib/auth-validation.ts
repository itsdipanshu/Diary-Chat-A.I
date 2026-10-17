export function validEmail(value:unknown){const email=String(value||'').trim().toLowerCase();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw Error('Enter a valid email address.');return email;}
export function validPassword(value:unknown){const password=String(value||'');if(password.length<12||password.length>128)throw Error('Use a password with 12–128 characters.');return password;}
export function appOrigin(){const raw=process.env.APP_URL;if(!raw)throw Error('APP_URL is not configured.');const url=new URL(raw);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('APP_URL must use HTTPS.');return url.origin;}
export function sameOrigin(origin:string|null){return origin===appOrigin();}
