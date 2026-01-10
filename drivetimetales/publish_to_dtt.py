#!/usr/bin/env python3
"""
Drive Time Tales Publisher
Publishes AudioDramaMaker projects to the DTT website

Usage:
    python publish_to_dtt.py /path/to/project/folder
    
Or drag a project folder onto this script.
"""

import os
import sys
import json
import requests
import hashlib
from pathlib import Path
from datetime import datetime

# ===========================================
# CONFIGURATION - Your DTT credentials
# ===========================================
SUPABASE_URL = "https://vmyhlfeouzslixtkmddy.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0"

# Cloudflare R2 settings (for audio files)
R2_ACCOUNT_ID = "0ff37c0c5ce5e60bd57b359a04355fa5"
R2_ACCESS_KEY = "62cacc03e1691e0566555779dde12700"
R2_SECRET_KEY = "7378a161d65726923fc9f407a8c03fe7d15a299e5093cd9dba5f3cfb869234b5"
R2_BUCKET = "drivetimetales-audio"
R2_PUBLIC_URL = "https://pub-068725074f9e4d21acf65a98a2315686.r2.dev"

# Genre color mapping
GENRE_COLORS = {
    "horror": "from-red-600 to-red-900",
    "mystery": "from-purple-600 to-purple-900",
    "thriller": "from-purple-600 to-purple-900",
    "mystery / thriller": "from-purple-600 to-purple-900",
    "drama": "from-orange-600 to-orange-900",
    "comedy": "from-yellow-600 to-yellow-900",
    "romance": "from-pink-600 to-pink-900",
    "sci-fi": "from-cyan-600 to-cyan-900",
    "science fiction": "from-cyan-600 to-cyan-900",
    "trucker stories": "from-amber-700 to-amber-900",
    "trucker": "from-amber-700 to-amber-900",
    "children": "from-green-600 to-green-900",
    "western": "from-amber-600 to-amber-900",
    "default": "from-slate-600 to-slate-800"
}

def get_duration_label(seconds):
    """Convert seconds to readable duration label"""
    minutes = seconds // 60
    if minutes <= 15:
        return "15 min"
    elif minutes <= 30:
        return "30 min"
    elif minutes <= 45:
        return "45 min"
    elif minutes <= 60:
        return "1 hr"
    elif minutes <= 90:
        return "90 min"
    elif minutes <= 120:
        return "2 hr"
    else:
        hours = minutes // 60
        return f"{hours} hr"

def get_price_cents(minutes):
    """Get price in cents based on duration"""
    if minutes <= 15:
        return 69
    elif minutes <= 30:
        return 129
    elif minutes <= 60:
        return 249
    else:
        return 699

def upload_to_r2(file_path, destination_key):
    """Upload a file to Cloudflare R2"""
    try:
        import boto3
        from botocore.config import Config
        
        s3 = boto3.client(
            's3',
            endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name='auto'
        )
        
        # Determine content type
        ext = Path(file_path).suffix.lower()
        content_types = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg'
        }
        content_type = content_types.get(ext, 'application/octet-stream')
        
        print(f"  Uploading {Path(file_path).name}...")
        s3.upload_file(
            file_path, 
            R2_BUCKET, 
            destination_key,
            ExtraArgs={'ContentType': content_type}
        )
        
        url = f"{R2_PUBLIC_URL}/{destination_key}"
        print(f"  ✓ Uploaded: {url}")
        return url
        
    except ImportError:
        print("ERROR: boto3 not installed. Run: pip install boto3")
        return None
    except Exception as e:
        print(f"ERROR uploading to R2: {e}")
        return None

def add_to_supabase(story_data):
    """Add story to Supabase database"""
    url = f"{SUPABASE_URL}/rest/v1/stories"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    response = requests.post(url, headers=headers, json=story_data)
    
    if response.status_code in [200, 201]:
        result = response.json()
        print(f"  ✓ Added to database: {result[0]['id']}")
        return result[0]
    else:
        print(f"ERROR adding to database: {response.status_code} - {response.text}")
        return None

def publish_project(project_folder):
    """Publish an AudioDramaMaker project to DTT"""
    project_path = Path(project_folder)
    
    # Find project.json
    project_json = project_path / "project.json"
    if not project_json.exists():
        print(f"ERROR: No project.json found in {project_folder}")
        return False
    
    # Load project data
    with open(project_json, 'r') as f:
        project = json.load(f)
    
    metadata = project.get('metadata', {})
    title = metadata.get('title') or project.get('project_name', 'Untitled')
    
    print(f"\n{'='*50}")
    print(f"Publishing: {title}")
    print(f"{'='*50}\n")
    
    # Find the latest revision with audio
    audio_file = None
    for rev in reversed(project.get('revisions', [])):
        if rev.get('audio_mp3'):
            audio_file = project_path / rev['audio_mp3']
            if audio_file.exists():
                break
            audio_file = None
    
    if not audio_file:
        print("ERROR: No audio file found in project")
        return False
    
    print(f"Audio file: {audio_file.name}")
    
    # Look for cover image
    cover_file = None
    for name in ['cover.png', 'cover.jpg', 'cover.jpeg', 'Cover.png', 'Cover.jpg']:
        potential = project_path / name
        if potential.exists():
            cover_file = potential
            break
    
    if cover_file:
        print(f"Cover image: {cover_file.name}")
    else:
        print("Cover image: None (will use gradient)")
    
    # Create safe filename
    safe_name = "".join(c if c.isalnum() or c in "- " else "" for c in title)
    safe_name = safe_name.replace(" ", "-").lower()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    
    # Upload audio to R2
    audio_key = f"stories/{safe_name}-{timestamp}.mp3"
    audio_url = upload_to_r2(str(audio_file), audio_key)
    if not audio_url:
        return False
    
    # Upload cover if exists
    cover_url = None
    if cover_file:
        cover_ext = cover_file.suffix
        cover_key = f"covers/{safe_name}-{timestamp}{cover_ext}"
        cover_url = upload_to_r2(str(cover_file), cover_key)
    
    # Prepare story data
    duration_seconds = metadata.get('duration_seconds', 1800)
    duration_mins = duration_seconds // 60
    genre = metadata.get('genre', 'Drama')
    genre_lower = genre.lower()
    color = GENRE_COLORS.get(genre_lower, GENRE_COLORS['default'])
    
    story_data = {
        "title": title,
        "author": metadata.get('author') or "Drive Time Tales",
        "genre": genre,
        "description": metadata.get('description', '')[:500],
        "duration_mins": duration_mins,
        "duration_label": get_duration_label(duration_seconds),
        "credits": max(1, duration_mins // 15),
        "color": color,
        "is_new": True,
        "is_featured": False,
        "play_count": 0,
        "audio_url": audio_url,
        "price_cents": get_price_cents(duration_mins)
    }
    
    # Add cover URL if uploaded
    if cover_url:
        story_data["cover_url"] = cover_url
    
    print(f"\nStory details:")
    print(f"  Title: {story_data['title']}")
    print(f"  Author: {story_data['author']}")
    print(f"  Genre: {story_data['genre']}")
    print(f"  Duration: {story_data['duration_label']} ({duration_mins} min)")
    print(f"  Price: ${story_data['price_cents']/100:.2f}")
    
    # Add to database
    print(f"\nAdding to database...")
    result = add_to_supabase(story_data)
    
    if result:
        print(f"\n{'='*50}")
        print(f"✅ SUCCESS! Story published to Drive Time Tales")
        print(f"{'='*50}")
        print(f"\nView at: http://localhost:3000/story/{result['id']}")
        print(f"Or in library: http://localhost:3000/library")
        return True
    else:
        return False

def main():
    print("\n🚛 Drive Time Tales Publisher")
    print("=" * 40)
    
    # Get project folder from arguments or prompt
    if len(sys.argv) > 1:
        project_folder = sys.argv[1]
    else:
        print("\nUsage: python publish_to_dtt.py /path/to/project/folder")
        print("\nOr drag a project folder onto this script.")
        project_folder = input("\nEnter project folder path: ").strip()
    
    # Clean up path (handle drag-and-drop escaping)
    project_folder = project_folder.strip("'\"")
    
    if not os.path.isdir(project_folder):
        print(f"ERROR: Not a valid folder: {project_folder}")
        sys.exit(1)
    
    success = publish_project(project_folder)
    
    if not success:
        print("\n❌ Publishing failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
