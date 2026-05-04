import { redirect } from 'next/navigation'

export default function AddPaymentMethodRedirectPage() {
  redirect('/account/billing')
}
