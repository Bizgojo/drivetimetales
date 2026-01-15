#!/usr/bin/env python3
"""
Fix play_history column names in story player.
Table has: current_time_seconds, progress_percent
Code was using: progress_seconds (wrong!)
"""

import os
from datetime import datetime

file_path = os.path.expanduser('~/Projects/drivetimetales/app/story/[id]/page.tsx')

# Read the current file
with open(file_path, 'r') as f:
    content = f.read()

# Create backup
backup_path = file_path + f'.backup.{datetime.now().strftime("%Y%m%d_%H%M%S")}'
with open(backup_path, 'w') as f:
    f.write(content)
print(f"Backup created: {backup_path}")

changes_made = 0

# Fix 1: Change progress_seconds to current_time_seconds in update
old_update = """await supabase
          .from('play_history')
          .update({
            progress_seconds: Math.floor(seconds),
            completed: completed,
            last_played_at: new Date().toISOString()
          })
          .eq('id', existing.id)"""

new_update = """await supabase
          .from('play_history')
          .update({
            current_time_seconds: Math.floor(seconds),
            completed: completed,
            last_played_at: new Date().toISOString()
          })
          .eq('id', existing.id)"""

if old_update in content:
    content = content.replace(old_update, new_update)
    print("✓ Fixed update query: progress_seconds → current_time_seconds")
    changes_made += 1
else:
    print("⚠ Could not find update query to fix")

# Fix 2: Change progress_seconds to current_time_seconds in insert
old_insert = """await supabase
          .from('play_history')
          .insert({
            user_id: user.id,
            story_id: storyId,
            progress_seconds: Math.floor(seconds),
            completed: completed,
            last_played_at: new Date().toISOString()
          })"""

new_insert = """await supabase
          .from('play_history')
          .insert({
            user_id: user.id,
            story_id: storyId,
            current_time_seconds: Math.floor(seconds),
            completed: completed,
            last_played_at: new Date().toISOString(),
            started_at: new Date().toISOString()
          })"""

if old_insert in content:
    content = content.replace(old_insert, new_insert)
    print("✓ Fixed insert query: progress_seconds → current_time_seconds, added started_at")
    changes_made += 1
else:
    print("⚠ Could not find insert query to fix")

# Write the updated content
with open(file_path, 'w') as f:
    f.write(content)

print(f"\n=== SUMMARY ===")
print(f"Total changes made: {changes_made}")

# Verification
with open(file_path, 'r') as f:
    final_content = f.read()

if "current_time_seconds" in final_content and "progress_seconds" not in final_content:
    print("✓ VERIFIED: Using correct column name 'current_time_seconds'")
elif "current_time_seconds" in final_content:
    print("✓ VERIFIED: 'current_time_seconds' is present")
else:
    print("⚠ WARNING: 'current_time_seconds' not found")

print(f"\nIf something went wrong, restore from backup:")
print(f"  cp '{backup_path}' '{file_path}'")
