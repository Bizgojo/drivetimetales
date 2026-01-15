#!/usr/bin/env python3
"""
Add play_history save logic to story player page.
This saves playback progress so Continue Listening works on home page.
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

# Fix 1: Add createClient import if not present
if "import { createClient } from '@supabase/supabase-js'" not in content:
    # Find the imports section and add it
    if "import { getStory" in content:
        old_import = "import { getStory"
        new_import = """import { createClient } from '@supabase/supabase-js'
import { getStory"""
        content = content.replace(old_import, new_import)
        print("✓ Added createClient import")
        changes_made += 1
    else:
        print("⚠ Could not find import location")

# Fix 2: Add supabase client creation after imports (before genreColors)
if "const supabase = createClient" not in content:
    if "const genreColors" in content:
        old_genre = "const genreColors"
        new_genre = """// Supabase client for saving play history
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const genreColors"""
        content = content.replace(old_genre, new_genre)
        print("✓ Added supabase client creation")
        changes_made += 1
    else:
        print("⚠ Could not find genreColors to add supabase client before")

# Fix 3: Add saveProgress function and state
# Look for the audioRef line and add after it
if "const [lastSavedTime, setLastSavedTime]" not in content:
    if "const audioRef = useRef<HTMLAudioElement>(null)" in content:
        old_audio_ref = "const audioRef = useRef<HTMLAudioElement>(null)"
        new_audio_ref = """const audioRef = useRef<HTMLAudioElement>(null)
  const [lastSavedTime, setLastSavedTime] = useState(0)
  
  // Save progress to play_history table
  const saveProgress = async (seconds: number, completed: boolean = false) => {
    if (!user || !storyId) return
    try {
      // Only save if we've progressed at least 5 seconds since last save
      if (Math.abs(seconds - lastSavedTime) < 5 && !completed) return
      
      const { data: existing } = await supabase
        .from('play_history')
        .select('id')
        .eq('user_id', user.id)
        .eq('story_id', storyId)
        .single()
      
      if (existing) {
        // Update existing record
        await supabase
          .from('play_history')
          .update({
            progress_seconds: Math.floor(seconds),
            completed: completed,
            last_played_at: new Date().toISOString()
          })
          .eq('id', existing.id)
      } else {
        // Insert new record
        await supabase
          .from('play_history')
          .insert({
            user_id: user.id,
            story_id: storyId,
            progress_seconds: Math.floor(seconds),
            completed: completed,
            last_played_at: new Date().toISOString()
          })
      }
      setLastSavedTime(seconds)
      console.log('[Story] Progress saved:', Math.floor(seconds), 'seconds, completed:', completed)
    } catch (err) {
      console.error('[Story] Error saving progress:', err)
    }
  }"""
        content = content.replace(old_audio_ref, new_audio_ref)
        print("✓ Added saveProgress function and lastSavedTime state")
        changes_made += 1
    else:
        print("⚠ Could not find audioRef to add saveProgress after")

# Fix 4: Update handleTimeUpdate to call saveProgress
if "saveProgress(audioRef.current.currentTime)" not in content:
    old_time_update = """const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }"""
    new_time_update = """const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
      // Save progress every 5 seconds
      saveProgress(audioRef.current.currentTime)
    }
  }"""
    if old_time_update in content:
        content = content.replace(old_time_update, new_time_update)
        print("✓ Updated handleTimeUpdate to save progress")
        changes_made += 1
    else:
        print("⚠ Could not find handleTimeUpdate to update")

# Fix 5: Update onEnded to mark as completed
if "saveProgress(duration, true)" not in content:
    # Look for onEnded handler
    if "onEnded={() => setIsPlaying(false)}" in content:
        old_ended = "onEnded={() => setIsPlaying(false)}"
        new_ended = """onEnded={() => {
                  setIsPlaying(false)
                  saveProgress(duration, true)
                }}"""
        content = content.replace(old_ended, new_ended)
        print("✓ Updated onEnded to mark story as completed")
        changes_made += 1
    else:
        print("⚠ Could not find onEnded handler to update")

# Fix 6: Save progress when pausing
if "saveProgress(audioRef.current.currentTime)" not in content or changes_made < 4:
    old_play_pause = """const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }"""
    new_play_pause = """const handlePlayPause = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      // Save progress when pausing
      saveProgress(audioRef.current.currentTime)
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }"""
    if old_play_pause in content:
        content = content.replace(old_play_pause, new_play_pause)
        print("✓ Updated handlePlayPause to save progress on pause")
        changes_made += 1
    else:
        print("⚠ Could not find handlePlayPause to update (may already be updated)")

# Write the updated content
with open(file_path, 'w') as f:
    f.write(content)

print(f"\n=== SUMMARY ===")
print(f"Total changes made: {changes_made}")

# Verification
with open(file_path, 'r') as f:
    final_content = f.read()

checks = [
    ("createClient import", "import { createClient }" in final_content),
    ("supabase client", "const supabase = createClient" in final_content),
    ("saveProgress function", "const saveProgress = async" in final_content),
    ("lastSavedTime state", "lastSavedTime" in final_content),
]

print("\n=== VERIFICATION ===")
all_passed = True
for name, passed in checks:
    status = "✓" if passed else "✗"
    print(f"{status} {name}")
    if not passed:
        all_passed = False

if all_passed:
    print("\n✓ All checks passed! Deploy with:")
    print("  cd ~/Projects/drivetimetales")
    print("  git add -A && git commit -m 'Add play_history save to story player' && git push")
else:
    print(f"\n⚠ Some checks failed. Restore from backup:")
    print(f"  cp '{backup_path}' '{file_path}'")
