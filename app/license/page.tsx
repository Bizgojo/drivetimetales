import LegalDocument from '@/components/legal/LegalDocument';
export default function License() {
  return <LegalDocument title="Audio Content License Agreement" sections={[
    { heading: 'What this license covers', paragraphs: [
      'This agreement covers stories, serialized episodes, narrations, music, sound effects, cover art, written scripts, and other audio or creative content made available through Endless Tales. It supplements the Terms and Conditions of Use.'
    ]},
    { heading: 'Limited listening license', paragraphs: [
      'While you have authorized access, Wonder Books Press and its licensors grant you a limited, revocable, nonexclusive, nontransferable license to stream and listen to available content for your own private, personal, noncommercial enjoyment using Endless Tales-supported interfaces.',
      'A subscription grants access, not ownership or a sale of the audio files or associated intellectual property. All rights not expressly granted are reserved to the applicable rights holders, to the extent those rights exist under law.'
    ]},
    { heading: 'Offline listening', paragraphs: [
      'If an offline feature is offered, you may temporarily download eligible content to your device using the Endless Tales app or supported web application solely for private playback. Offline files are licensed, not purchased, and may be protected, refreshed, automatically removed, or made unavailable when a subscription expires, you sign out, catalog rights change, or app storage is cleared.',
      'Do not export downloaded files, share them with other accounts, copy them to unauthorized services, or attempt to bypass access controls. Internet access may periodically be needed to verify licensing and refresh content.'
    ]},
    { heading: 'Restrictions', paragraphs: [
      'Except where law expressly permits it, you may not reproduce, upload, distribute, sell, rent, sublicense, broadcast, publicly perform, republish, or commercially exploit the content. You may not extract voices or audio to train, clone, or build a competing voice or content service without separate written permission.',
      'You may not remove copyright or other rights notices or circumvent technical protections. Nothing in this license limits rights that cannot lawfully be waived, including permitted statutory uses.'
    ]},
    { heading: 'Ownership and AI-assisted content', paragraphs: [
      'Copyright and related rights in content belong to Wonder Books Press and/or the respective writers, performers, artists, and other licensors as applicable. AI-assisted production does not by itself establish copyright ownership in elements that are ineligible for protection. This agreement does not claim exclusive rights in unprotectable subject matter.',
      'Names, branding, original arrangements, recorded performances, contracts, and other protected elements may be covered by separate rights.'
    ]},
    { heading: 'Availability, termination, and permissions', paragraphs: [
      'We may add, modify, replace, or remove titles or technical features, consistent with consumer law. This license ends when your authorized access ends or when we terminate it for a material breach; any locally stored content must then no longer be accessed except as required by law.',
      'For public performance, licensing, educational, commercial, press, accessibility, or other requested uses beyond this agreement, contact hello@endless-tales.com. This agreement does not prevent uses authorized by applicable law.'
    ]}
  ]} />;
}
