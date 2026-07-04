import { redirect } from 'next/navigation'

export default function ProductionApprovalRedirect() {
  redirect('/admin/production/approval')
}
