// Only call with identity returned by the server's verified getUser().
// Never derive this decision from profile fields or user-editable metadata.
export type AdminIdentity={userId:string;email:string;emailVerified:boolean};
export function isAdmin(user:AdminIdentity|null){
 const id=process.env.ADMIN_USER_ID?.trim(),email=process.env.ADMIN_EMAIL?.trim().toLowerCase();
 return !!(user&&user.emailVerified&&id&&email&&user.userId===id&&user.email.toLowerCase()===email);
}
