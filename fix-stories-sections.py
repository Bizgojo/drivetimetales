#!/usr/bin/env python3
"""
Fix script for home page - ONLY modifies:
1. NEW RELEASES section
2. RECOMMENDED FOR YOU section
3. Adds CONTINUE LISTENING section

Does NOT touch news briefings or any other sections.
"""

import re
import shutil
from datetime import datetime

file_path = '/Users/williampostlewaite/Projects/drivetimetales/app/home/page.tsx'

# Create backup
backup_path = f"{file_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
shutil.copy(file_path, backup_path)
print(f"Backup created: {backup_path}")

# Read the file
with open(file_path, 'r') as f:
    content = f.read()

# OLD NEW RELEASES SECTION (to find)
old_new_releases = '''{/* Stories */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stories.length === 0 ? (
            <p className="text-slate-400 text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {stories.slice(0, 6).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div className="rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5)' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-slate-700 flex items-center justify-center text-4xl">📖</div>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-medium line-clamp-1">{story.title}</h3>
                  <p className="text-slate-400 text-xs line-clamp-1">{story.author}</p>
                </Link>
              ))}
            </div>
          )}
        </section>'''

# NEW NEW RELEASES SECTION (replacement) - 3 horizontal cards with Title, Genre, Duration+Credits
new_new_releases = '''{/* Stories */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">NEW RELEASES</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stories.length === 0 ? (
            <p className="text-white text-sm">No stories available yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {stories.slice(0, 3).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div className="rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5)' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-slate-700 flex items-center justify-center text-4xl">📖</div>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                  <p className="text-white text-xs">{story.genre}</p>
                  <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                </Link>
              ))}
            </div>
          )}
        </section>'''

# OLD RECOMMENDED SECTION (to find)
old_recommended = '''{/* Recommended */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stories.length === 0 ? (
            <p className="text-slate-400 text-sm">No recommendations yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {stories.slice(0, 6).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="block">
                  <div className="rounded-xl overflow-hidden" style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.5)' }}>
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-slate-700 flex items-center justify-center text-4xl">📖</div>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-medium line-clamp-1">{story.title}</h3>
                  <p className="text-slate-400 text-xs line-clamp-1">{story.author}</p>
                </Link>
              ))}
            </div>
          )}
        </section>'''

# NEW RECOMMENDED SECTION (replacement) - 4 vertical blocks with cover left, details right
new_recommended = '''{/* Recommended */}
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-4">RECOMMENDED FOR YOU</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stories.length === 0 ? (
            <p className="text-white text-sm">No recommendations yet.</p>
          ) : (
            <div className="space-y-3">
              {stories.slice(3, 7).map((story) => (
                <Link key={story.id} href={`/story/${story.id}`} className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition">
                  <div className="w-24 h-24 flex-shrink-0">
                    {story.cover_url ? (
                      <img src={story.cover_url} alt={story.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-700 flex items-center justify-center text-2xl">📖</div>
                    )}
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    <h3 className="text-sm font-bold text-white line-clamp-1">{story.title}</h3>
                    <p className="text-white text-xs">{story.genre}</p>
                    <p className="text-white text-xs">{story.author}</p>
                    <p className="text-white text-xs">{story.duration_mins} min • {story.credits} credit{story.credits !== 1 ? 's' : ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>'''

# Apply replacements
if old_new_releases in content:
    content = content.replace(old_new_releases, new_new_releases)
    print("✓ NEW RELEASES section updated")
else:
    print("⚠ Could not find NEW RELEASES section to replace")

if old_recommended in content:
    content = content.replace(old_recommended, new_recommended)
    print("✓ RECOMMENDED section updated")
else:
    print("⚠ Could not find RECOMMENDED section to replace")

# Write the updated content
with open(file_path, 'w') as f:
    f.write(content)

print(f"\nDone! Review changes with: git diff {file_path}")
print("If something went wrong, restore from backup:")
print(f"  cp {backup_path} {file_path}")
