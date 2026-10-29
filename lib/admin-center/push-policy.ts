export function validPushSubscription(p:any){
 try{
  const u=new URL(p?.endpoint)
  const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com']
  const allowed=hosts.includes(u.hostname)||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com')
  return allowed&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&typeof p.keys?.p256dh==='string'&&/^[A-Za-z0-9_-]{87,88}=?$/.test(p.keys.p256dh)&&typeof p.keys?.auth==='string'&&/^[A-Za-z0-9_-]{22,24}={0,2}$/.test(p.keys.auth)&&p.endpoint.length<=2048
 }catch{return false}
}
