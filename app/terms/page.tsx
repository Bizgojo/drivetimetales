import LegalDocument from '@/components/legal/LegalDocument';
import { MONTHLY_PRICE_LABEL, ANNUAL_PRICE_LABEL } from '@/lib/pricing';
export default function Terms() {
  return <LegalDocument title="Terms and Conditions of Use" sections={[
    { heading: 'Agreement and eligibility', paragraphs: [
      'These terms govern your use of Endless Tales, an audio storytelling service operated by Wonder Books Press. By creating an account, subscribing, or using the service, you agree to these terms and our Content License. Our Privacy Policy describes how we handle data.',
      'You must be at least 13 to create an account; if you are under the age of majority where you live, your parent or legal guardian must approve your use. Keep account credentials secure and provide accurate registration information.'
    ]},
    { heading: 'Memberships and pricing', paragraphs: [
      'Endless Tales offers recurring subscription plans. The currently advertised standard prices are ' + MONTHLY_PRICE_LABEL + ' monthly and ' + ANNUAL_PRICE_LABEL + ' annually. The price, billing interval, taxes, trial terms if any, and any eligible promotional or legacy rate shown at checkout control your particular purchase.',
      'Your plan automatically renews for another billing period unless canceled before renewal. We charge the payment method on file through our payment processor. We may change prices with any legally required advance notice; changes affecting an existing plan take effect as disclosed and subject to law.',
      'Trial or referral benefits, including any free listening period, apply only when explicitly offered and may have eligibility, expiration, or conversion conditions displayed at enrollment. Do not assume every registration includes a trial.'
    ]},
    { heading: 'Cancellation and refunds', paragraphs: [
      'You may cancel your subscription in Account → Billing & Subscription through the available management flow. Cancellation stops future renewal charges, and paid access ordinarily continues through the end of the current paid billing period. For a trial, cancel before the disclosed conversion time to avoid a charge.',
      'Fees are generally nonrefundable and we do not ordinarily prorate partial periods, except where the law requires a refund or a specific offer states otherwise. Contact hello@endless-tales.com if you believe you were billed in error. Cancellation does not automatically delete your account.'
    ]},
    { heading: 'Access and catalog changes', paragraphs: [
      'An active subscription provides personal listening access to the available catalog, subject to the Content License and any disclosed feature limits. The service, catalog, narrations, series, and features may change. A particular title is not guaranteed to remain available indefinitely.',
      'Offline downloads are temporary licensed copies for playback through supported Endless Tales features, not permanent purchases. Access may end after cancellation, expiration, rights changes, or technical revalidation.'
    ]},
    { heading: 'Permitted use and conduct', paragraphs: [
      'Do not share accounts outside allowed household or account functionality; distribute, sell, rebroadcast, or copy stories; bypass content protection; scrape or bulk-download content; impersonate others; interfere with service security; or use the service unlawfully.',
      'We may investigate abuse and suspend or terminate accounts for material violations, subject to applicable law. We will not deny statutory rights through these terms.'
    ]},
    { heading: 'Story submissions, feedback, and AI', paragraphs: [
      'You retain rights you own in story ideas or other material you submit. By submitting material through a feature expressly inviting story suggestions or feedback, you grant Wonder Books Press a nonexclusive, worldwide, royalty-free license to review, store, adapt, develop, publish, and promote that material in connection with Endless Tales, to the extent you have rights to grant. Submission does not guarantee selection, compensation, or credit; any specific commitment requires a separate agreement. Do not submit confidential material or material you lack authority to share.',
      'Endless Tales stories may be produced with AI-assisted scripts, synthetic narration, music, sound effects, or imagery. Characters and events may be fictional. We do not guarantee that every element generated solely by AI qualifies for copyright protection.'
    ]},
    { heading: 'Disclaimers and liability', paragraphs: [
      'We seek to provide a dependable service, but availability may be interrupted by maintenance, connectivity, or third parties. To the maximum extent permitted by law, the service is provided as available without implied warranties. Nothing in these terms excludes nonwaivable consumer rights.',
      'To the maximum extent permitted by law, Wonder Books Press is not responsible for indirect or consequential losses. Its aggregate liability arising from the service is limited to amounts you paid for the service in the three months preceding the claim, except where this limitation is prohibited by law.'
    ]},
    { heading: 'Applicable law, changes, and support', paragraphs: [
      'South Carolina law governs these terms except where mandatory consumer-protection laws require otherwise. Any court proceedings will be brought in a court with lawful jurisdiction, subject to applicable venue and consumer rules.',
      'We may revise these terms, with advance notice and renewed consent when legally required. Material changes will not retroactively eliminate accrued consumer rights. Questions, billing issues, and legal notices: hello@endless-tales.com, Wonder Books Press, Elloree, South Carolina, USA.'
    ]}
  ]} />;
}
