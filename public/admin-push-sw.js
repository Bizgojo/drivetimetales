/* Admin push only. No fetch/cache handlers; subscriber offline playback is unaffected. */
self.addEventListener('push', event => {
 let p; try { p=event.data.json() } catch { return }
 if(typeof p.href!=='string'||!/^\/admin(?:[/?#]|$)/.test(p.href)||/[\\\r\n]/.test(p.href))return
 event.waitUntil(self.registration.showNotification('Endless Tales Admin',{body:String(p.body||'An Admin action is waiting.').slice(0,300),icon:'/icons/icon-192.png',tag:`admin-${p.id}`,data:{href:p.href},renotify:false}))
})
self.addEventListener('notificationclick',event=>{
 event.notification.close()
 const href=event.notification.data?.href
 if(typeof href!=='string'||!/^\/admin(?:[/?#]|$)/.test(href)||/[\\\r\n]/.test(href))return
 const url=new URL(href,self.location.origin).href
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const admin=windows.find(w=>w.url.startsWith(self.location.origin+'/admin'))
  if(admin){await admin.navigate(url);return admin.focus()}
  return clients.openWindow(url)
 }))
})
