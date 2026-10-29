import LegalDocument from '@/components/legal/LegalDocument';
export default function PrivacyPolicy() {
  return <LegalDocument title="Privacy Policy" sections={[
    { heading: 'Scope and information we collect', paragraphs: [
      'This policy describes how Wonder Books Press handles personal information when you use Endless Tales, including its website, player, subscriptions, downloads, and account features.',
      'We collect information you give us, such as your name, email address, account details, profile photo if provided, preferences, feedback, referrals, story ideas, and support messages. Our payment provider processes payment credentials; we may receive transaction identifiers, subscription status, billing history, and limited payment details.',
      'We collect device and browser information, IP address, approximate location inferred from network data, sign-in information, listening progress and history, playlists, downloads and associated status, usage events, and technical logs. Certain app features may save data on your device.'
    ]},
    { heading: 'Travel Insights and personalization', paragraphs: [
      'If you enable Travel Insights, the app may use device location or motion signals to infer broad listening context for story recommendations. The Account page provides Always, Never, and Only While Using This App choices. Permission settings on your device also apply. We do not intend to retain exact routes or detailed GPS history through this feature.',
      'We may use your listening activity, story selections, preferences, and account details to tailor recommendations and improve the stories we offer. Personalized audio greetings may use your first name and a synthetic voice service.'
    ]},
    { heading: 'Why we use information', paragraphs: [
      'We use information to create and secure accounts, provide playback and offline features, process and administer subscriptions, deliver recommendations, provide customer support, send service notices, measure performance, prevent abuse, and meet legal obligations.',
      'We may send marketing messages where permitted. You may opt out of promotional emails through their unsubscribe links; necessary account and transaction emails may continue.'
    ]},
    { heading: 'Service providers and advertising', paragraphs: [
      'We use vendors to support authentication and storage (including Supabase), billing (Stripe), infrastructure and hosting, email delivery, analytics, and synthetic audio services (including ElevenLabs where enabled). Service providers receive information needed for their services under applicable arrangements.',
      'We may measure advertising and campaign performance using advertising platforms such as Meta. Depending on implementation, cookies, device identifiers, or event data may be used. We will provide additional notice or choices where law requires. We do not claim that every service provider named here receives every type of data.',
      'We do not sell personal information for money. Certain targeted advertising disclosures may qualify as sharing or a sale under applicable state privacy laws even without a monetary sale; requests to opt out will be handled as required by law.'
    ]},
    { heading: 'Cookies, local storage, and security', paragraphs: [
      'We use cookies and local storage for login sessions, player state, downloads, saved preferences, and service operation. Third-party technologies, where deployed, are subject to applicable notice and choice requirements.',
      'We use technical and organizational safeguards designed to protect data, but no system is completely secure.'
    ]},
    { heading: 'Retention and deletion', paragraphs: [
      'We retain personal information for the period needed to provide services and for legitimate business, security, legal, tax, and dispute-resolution purposes. Retention depends on the data category, and backup or legally required records may persist after an account is closed.',
      'You can request account or data deletion at hello@endless-tales.com. We will verify requests and respond within applicable legal deadlines. Deletion may affect access to listening history and downloads.'
    ]},
    { heading: 'Your choices and privacy rights', paragraphs: [
      'You may update certain account settings, disable Travel Insights, opt out of promotional email, and contact us to request access, correction, deletion, or information about processing. Depending on your state, you may have additional rights to opt out of targeted advertising, profiling, or certain data disclosures, and to appeal a denied request. We will honor applicable rights after reasonable verification.',
      'You may also control some cookies and location permissions through your browser or device. Turning off certain permissions may affect optional features.'
    ]},
    { heading: 'Children', paragraphs: [
      'Endless Tales is not directed to children under 13, and we do not knowingly collect their personal information. If you believe a child under 13 provided information, contact us for review and deletion.'
    ]},
    { heading: 'Changes and contact', paragraphs: [
      'We will update the date and provide additional notice when required if this policy changes materially. Contact hello@endless-tales.com for privacy questions or to exercise rights. Operator: Wonder Books Press, Elloree, South Carolina, USA.'
    ]}
  ]} />;
}
