import 'server-only'
import { accountUser } from '@/lib/server/accountUser'
const admins = new Set(['marc@endless-tales.com','hello.endlesstales@gmail.com','williampostlewaite@icloud.com','m.postlewaite@gmail.com'])
export async function feedbackAdmin() {
 const user = await accountUser()
 return user?.email && admins.has(user.email.toLowerCase()) ? user : null
}
