import { redirect } from 'next/navigation'

export default function StoryCreationLegacyRedirectPage() {
  redirect('/admin/story-production-v2')
}
