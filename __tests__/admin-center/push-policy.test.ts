import {validPushSubscription} from '../../lib/admin-center/push-policy'
const keys={p256dh:'a'.repeat(87),auth:'b'.repeat(22)}
test.each(['https://fcm.googleapis.com/push/1','https://web.push.apple.com/Q123','https://updates.push.services.mozilla.com/wpush/1'])('supported provider %s',endpoint=>expect(validPushSubscription({endpoint,keys})).toBe(true))
test.each(['http://fcm.googleapis.com/','https://fcm.googleapis.com.evil.invalid/','https://127.0.0.1/','https://evil.invalid/','https://user:pass@fcm.googleapis.com/','https://fcm.googleapis.com:8443/'])('reject SSRF endpoint %s',endpoint=>expect(validPushSubscription({endpoint,keys})).toBe(false))
test('malformed keys cannot be stored',()=>expect(validPushSubscription({endpoint:'https://fcm.googleapis.com/push',keys:{auth:'x',p256dh:'y'}})).toBe(false))
