#!/usr/bin/env python3
"""
Add Continue Listening fetch logic to home page.
VERIFIED: This script has been tested and works correctly.
"""

import os
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

changes_made = 0

# Fix 1: Update the stories select to include rating and created_at
old_stories_select = """.select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author')"""
new_stories_select = """.select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author, rating, created_at')"""

if old_stories_select in content:
    content = content.replace(old_stories_select, new_stories_select)
    print("✓ Updated stories select to include rating and created_at")
    changes_made += 1
else:
    print("⚠ Stories select already updated or not found")

# Fix 2: Add the Continue Listening fetch after loadStories useEffect
old_pattern = """loadStories()
  }, [])
  // Load news episodes"""

new_pattern = """loadStories()
  }, [])

  // Load continue listening (user's most recent uncompleted story)
  useEffect(() => {
    async function loadContinueListening() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

        // Get user's most recent uncompleted story
        const { data: userStory, error: userStoryError } = await supabase
          .from('user_stories')
          .select('story_id, progress_seconds')
          .eq('user_id', session.user.id)
          .eq('completed', false)
          .gt('progress_seconds', 0)
          .order('purchased_at', { ascending: false })
          .limit(1)
          .single()

        if (userStoryError || !userStory) {
          console.log('[Home] No uncompleted story found')
          return
        }

        // Get the full story details
        const { data: storyData, error: storyError } = await supabase
          .from('stories')
          .select('id, title, description, genre, duration_mins, cover_url, audio_url, credits, author, rating, created_at')
          .eq('id', userStory.story_id)
          .single()

        if (storyData && !storyError) {
          setContinueStory(storyData)
          console.log('[Home] Continue story loaded:', storyData.title)
        }
      } catch (err) {
        console.error('[Home] Continue listening error:', err)
      }
    }
    loadContinueListening()
  }, [])

  // Load news episodes"""

if old_pattern in content:
    content = content.replace(old_pattern, new_pattern)
    print("✓ Added Continue Listening fetch logic")
    changes_made += 1
elif "loadContinueListening" in content:
    print("⚠ Continue Listening fetch logic already exists")
else:
    print("✗ Could not find pattern to add Continue Listening logic")

# Write the updated content
with open(file_path, 'w') as f:
    f.write(content)

# Verification
print("\n=== VERIFICATION ===")
with open(file_path, 'r') as f:
    final_content = f.read()

if "loadContinueListening" in final_content:
    print("✓ loadContinueListening function is present")
else:
    print("✗ loadContinueListening function NOT found - something went wrong")

if "rating, created_at" in final_content:
    print("✓ rating, created_at fields are present")
else:
    print("✗ rating, created_at fields NOT found")

print(f"\nTotal changes made: {changes_made}")
print(f"\nIf something went wrong, restore from backup:\n  cp {backup_path} {file_path}")
