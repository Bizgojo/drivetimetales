#!/usr/bin/env python3
"""
Targeted fixes for home page:
1. Add rating and created_at to Story interface
2. Add Continue Listening section
3. Add Released date to NEW RELEASES
4. Add Star ratings to RECOMMENDED

This script will NOT touch news briefings.
"""

import os
import re
from datetime import datetime

file_path = os.path.expanduser('~/Projects/drivetimetales/app/home/page.tsx')

# Read the current file
with open(file_path, 'r') as f:
    content = f.read()

# Create backup
backup_path = file_path + f'.backup.{datetime.now().strftime("%Y%m%d_%H%M%S")}'
with open(backup_path, 'w') as f:
    f.write(content)
print(f"Backup created: {backup_path}")

# Fix 1: Add rating and created_at to Story interface
old_interface = '''interface Story {
  id: string
  title: string
  description: string
  genre: string
  duration_mins: number
  cover_url: string
  audio_url: string
  credits: number
  author: string
}'''

new_interface = '''interface Story {
  id: string
  title: string
  description: string
  genre: string
  duration_mins: number
  cover_url: string
  audio_url: string
  credits: number
  author: string
  rating?: number
  created_at?: string
}'''

if old_interface in content:
    content = content.replace(old_interface, new_interface)
    print("✓ Added rating and created_at to Story interface")
else:
    print("⚠ Could not find Story interface to update")

# Fix 2: Find the state variables section and add continueStory state
# Look for the stories state and add continueStory after it
old_stories_state = "const [stories, setStories] = useState<Story[]>([])"
new_stories_state = """const [stories, setStories] = useState<Story[]>([])
  const [continueStory, setContinueStory] = useState<Story | null>(null)"""

if old_stories_state in content and "continueStory" not in content:
    content = content.replace(old_stories_state, new_stories_state)
    print("✓ Added continueStory state variable")
else:
    if "continueStory" in content:
        print("⚠ continueStory state already exists")
    else:
        print("⚠ Could not find stories state to add continueStory")

# Fix 3: Add star rating helper function after STATE_NAMES
# Find a good place to add it - after the NEWS_CATEGORIES array
star_function = '''
// Helper function to render Amazon-style star ratings
const renderStars = (rating: number) => {
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.5
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0)
  return (
    <span className="text-yellow-400 text-xs">
      {'★'.repeat(fullStars)}
      {hasHalfStar && '½'}
      {'☆'.repeat(emptyStars)}
      <span className="text-white ml-1">({rating.toFixed(1)})</span>
    </span>
  )
}
'''

# Add after NEWS_CATEGORIES closing bracket if not already present
if "renderStars" not in content:
    # Find the end of NEWS_CATEGORIES array
    news_cat_end = content.find("export default function HomePage()")
    if news_cat_end > 0:
        content = content[:news_cat_end] + star_function + "\n" + content[news_cat_end:]
        print("✓ Added renderStars helper function")
    else:
        print("⚠ Could not find location to add renderStars function")
else:
    print("⚠ renderStars function already exists")

# Fix 4: Add Continue Listening section before NEW RELEASES
# Find the {/* Stories */} comment and add Continue Listening before it
old_stories_comment = '''{/* Stories */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>'''

new_with_continue = '''{/* Continue Listening - only shows if there's an uncompleted story */}
        {continueStory && (
          <section className="mb-8">
            <h2 className="text-lg font-bold mb-4">CONTINUE LISTENING</h2>
            <Link href={`/story/${continueStory.id}`} className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition">
              <div className="w-24 h-24 flex-shrink-0">
                {continueStory.cover_url ? (
                  <img src={continueStory.cover_url} alt={continueStory.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                )}
              </div>
              <div className="flex-1 p-3 flex flex-col justify-center">
                <h3 className="text-sm font-bold text-white line-clamp-1">{continueStory.title}</h3>
                <p className="text-white text-xs">{continueStory.genre} • {continueStory.author}</p>
                <p className="text-orange-400 text-xs font-medium">▶ Resume where you left off</p>
              </div>
            </Link>
          </section>
        )}

        {/* Stories */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>'''

if old_stories_comment in content and "CONTINUE LISTENING" not in content:
    content = content.replace(old_stories_comment, new_with_continue)
    print("✓ Added Continue Listening section")
else:
    if "CONTINUE LISTENING" in content:
        print("⚠ Continue Listening section already exists")
    else:
        print("⚠ Could not find Stories section to add Continue Listening before it")

# Fix 5: Add Released date to NEW RELEASES cards
old_new_releases_card = '''<h3 className="mt-2 text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                  <p className="text-white text-xs">{story.genre}</p>
                  <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                </Link>'''

new_new_releases_card = '''<h3 className="mt-2 text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                  <p className="text-white text-xs">{story.genre}</p>
                  <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                  {story.created_at && (
                    <p className="text-white text-xs">Released {new Date(story.created_at).toLocaleDateString()}</p>
                  )}
                </Link>'''

if old_new_releases_card in content:
    content = content.replace(old_new_releases_card, new_new_releases_card)
    print("✓ Added Released date to NEW RELEASES")
else:
    print("⚠ Could not find NEW RELEASES card to add Released date")

# Fix 6: Add star ratings to RECOMMENDED section
old_recommended_card = '''<h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                    <p className="text-white text-xs">{story.genre}</p>
                    <p className="text-white text-xs">{story.author}</p>
                    <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>'''

new_recommended_card = '''<h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                    <p className="text-white text-xs">{story.genre} • {story.author}</p>
                    <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                    {story.rating && renderStars(story.rating)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>'''

if old_recommended_card in content:
    content = content.replace(old_recommended_card, new_recommended_card)
    print("✓ Added star ratings to RECOMMENDED")
else:
    print("⚠ Could not find RECOMMENDED card to add star ratings")

# Write the updated content
with open(file_path, 'w') as f:
    f.write(content)

print("\nDone! Review changes with: git diff ~/Projects/drivetimetales/app/home/page.tsx")
print(f"If something went wrong, restore from backup:\n  cp {backup_path} {file_path}")
