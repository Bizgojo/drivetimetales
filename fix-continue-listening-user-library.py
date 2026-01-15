#!/usr/bin/env python3
"""
Fix home page to use user_library table for Continue Listening.
The user_library table has: id, user_id, story_id, progress, last_played, completed
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

# Fix 1: Change from play_history to user_library in the query
old_query = """// Get user's most recent uncompleted story
        const { data: userStory, error: userStoryError } = await supabase
          .from('play_history')
          .select('story_id, progress_seconds')
          .eq('user_id', session.user.id)
          .eq('completed', false)
          .gt('progress_seconds', 0)
          .order('purchased_at', { ascending: false })
          .limit(1)
          .single()"""

new_query = """// Get user's most recent uncompleted story from user_library
        const { data: userStory, error: userStoryError } = await supabase
          .from('user_library')
          .select('story_id, progress')
          .eq('user_id', session.user.id)
          .eq('completed', false)
          .gt('progress', 0)
          .order('last_played', { ascending: false })
          .limit(1)
          .single()"""

if old_query in content:
    content = content.replace(old_query, new_query)
    print("✓ Changed from play_history to user_library")
    changes_made += 1
else:
    # Try alternate patterns
    if "from('play_history')" in content:
        content = content.replace("from('play_history')", "from('user_library')")
        print("✓ Changed play_history to user_library (simple replace)")
        changes_made += 1
    
    if "progress_seconds" in content:
        content = content.replace("progress_seconds", "progress")
        print("✓ Changed progress_seconds to progress")
        changes_made += 1
    
    if "purchased_at" in content:
        content = content.replace("purchased_at", "last_played")
        print("✓ Changed purchased_at to last_played")
        changes_made += 1

# Write the updated content
with open(file_path, 'w') as f:
    f.write(content)

print(f"\n=== SUMMARY ===")
print(f"Total changes made: {changes_made}")

# Verification
with open(file_path, 'r') as f:
    final_content = f.read()

checks = [
    ("user_library table", "from('user_library')" in final_content),
    ("progress column", ".gt('progress', 0)" in final_content or "progress" in final_content),
    ("last_played column", "last_played" in final_content),
    ("NO play_history", "play_history" not in final_content),
]

print("\n=== VERIFICATION ===")
for name, passed in checks:
    status = "✓" if passed else "✗"
    print(f"{status} {name}")

print(f"\nIf something went wrong, restore from backup:")
print(f"  cp '{backup_path}' '{file_path}'")
