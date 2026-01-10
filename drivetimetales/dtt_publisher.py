#!/usr/bin/env python3
"""
Drive Time Tales Publisher
Integrates with Audio Drama Maker to publish stories to Drive Time Tales

Usage:
    from dtt_publisher import publish_to_dtt
    
    result = publish_to_dtt(
        audio_path="output/my-story.mp3",
        title="My Story",
        author="Author Name",
        genre="Mystery",
        duration_mins=30,
        description="A thrilling mystery...",
        sample_path="output/my-story-sample.mp3"  # Optional
    )
"""

import requests
import os
from pathlib import Path

# Configuration - Update these or use environment variables
DTT_API_URL = os.getenv("DTT_API_URL", "http://localhost:3000/api/publish")

# Genre mappings (Audio Drama Maker style -> DTT style)
GENRE_MAP = {
    "stephen_king": "Horror",
    "james_patterson": "Mystery",
    "agatha_christie": "Mystery",
    "horror": "Horror",
    "mystery": "Mystery",
    "thriller": "Mystery",
    "drama": "Drama",
    "comedy": "Comedy",
    "romance": "Romance",
    "sci-fi": "Sci-Fi",
    "scifi": "Sci-Fi",
    "trucker": "Trucker Stories",
}

# Color mappings by genre
GENRE_COLORS = {
    "Mystery": "from-purple-600 to-purple-900",
    "Horror": "from-red-600 to-red-900",
    "Drama": "from-orange-600 to-orange-900",
    "Comedy": "from-yellow-600 to-yellow-900",
    "Romance": "from-pink-600 to-pink-900",
    "Sci-Fi": "from-cyan-600 to-cyan-900",
    "Trucker Stories": "from-amber-700 to-amber-900",
}


def publish_to_dtt(
    audio_path: str,
    title: str,
    author: str,
    genre: str,
    duration_mins: int,
    description: str = None,
    sample_path: str = None,
    promo_text: str = None,
    is_featured: bool = False,
    credits: int = None,
    color: str = None,
    api_url: str = None
) -> dict:
    """
    Publish a story to Drive Time Tales.
    
    Args:
        audio_path: Path to the full audio MP3 file
        title: Story title
        author: Author name
        genre: Genre (will be mapped to DTT genres)
        duration_mins: Duration in minutes
        description: Story description (optional)
        sample_path: Path to 2-minute sample MP3 (optional)
        promo_text: Promotional badge text like "New Release!" (optional)
        is_featured: Whether to feature on homepage (default: False)
        credits: Override credit cost (default: calculated from duration)
        color: Override card gradient color (default: based on genre)
        api_url: Override API URL (default: DTT_API_URL)
    
    Returns:
        dict with success status and story data or error message
    """
    
    # Validate audio file exists
    audio_file = Path(audio_path)
    if not audio_file.exists():
        return {"success": False, "error": f"Audio file not found: {audio_path}"}
    
    # Map genre
    mapped_genre = GENRE_MAP.get(genre.lower(), genre.title())
    
    # Get color for genre if not provided
    if not color:
        color = GENRE_COLORS.get(mapped_genre, "from-slate-600 to-slate-800")
    
    # Build metadata
    metadata = {
        "title": title,
        "author": author,
        "genre": mapped_genre,
        "duration_mins": duration_mins,
        "description": description,
        "promo_text": promo_text,
        "is_featured": is_featured,
        "color": color,
    }
    
    if credits:
        metadata["credits"] = credits
    
    # Prepare files
    files = {
        "metadata": (None, str(metadata).replace("'", '"').replace("None", "null").replace("True", "true").replace("False", "false")),
        "audio": (audio_file.name, open(audio_file, "rb"), "audio/mpeg"),
    }
    
    # Add sample if provided
    if sample_path:
        sample_file = Path(sample_path)
        if sample_file.exists():
            files["sample"] = (sample_file.name, open(sample_file, "rb"), "audio/mpeg")
    
    # Make request
    url = api_url or DTT_API_URL
    
    try:
        # Use proper multipart form data
        import json
        
        files_for_request = []
        files_for_request.append(("metadata", (None, json.dumps(metadata), "application/json")))
        files_for_request.append(("audio", (audio_file.name, open(audio_file, "rb"), "audio/mpeg")))
        
        if sample_path:
            sample_file = Path(sample_path)
            if sample_file.exists():
                files_for_request.append(("sample", (sample_file.name, open(sample_file, "rb"), "audio/mpeg")))
        
        response = requests.post(url, files=files_for_request, timeout=300)  # 5 min timeout for large files
        
        if response.status_code in [200, 201]:
            return {"success": True, **response.json()}
        else:
            return {"success": False, "error": response.text, "status_code": response.status_code}
            
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": f"Could not connect to {url}. Is Drive Time Tales running?"}
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Request timed out. File may be too large."}
    except Exception as e:
        return {"success": False, "error": str(e)}


def create_sample(audio_path: str, output_path: str = None, duration_seconds: int = 120) -> str:
    """
    Create a 2-minute sample from the full audio.
    Requires ffmpeg installed.
    
    Args:
        audio_path: Path to full audio
        output_path: Where to save sample (default: adds -sample before extension)
        duration_seconds: Sample length in seconds (default: 120 = 2 minutes)
    
    Returns:
        Path to the sample file
    """
    import subprocess
    
    audio_file = Path(audio_path)
    if not output_path:
        output_path = audio_file.parent / f"{audio_file.stem}-sample{audio_file.suffix}"
    
    # Use ffmpeg to extract sample
    cmd = [
        "ffmpeg", "-y",
        "-i", str(audio_file),
        "-t", str(duration_seconds),
        "-acodec", "copy",
        str(output_path)
    ]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return str(output_path)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Failed to create sample: {e.stderr.decode()}")
    except FileNotFoundError:
        raise RuntimeError("ffmpeg not found. Please install ffmpeg.")


# CLI interface
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Publish audio drama to Drive Time Tales")
    parser.add_argument("audio", help="Path to audio file")
    parser.add_argument("--title", "-t", required=True, help="Story title")
    parser.add_argument("--author", "-a", required=True, help="Author name")
    parser.add_argument("--genre", "-g", required=True, help="Genre")
    parser.add_argument("--duration", "-d", type=int, required=True, help="Duration in minutes")
    parser.add_argument("--description", help="Story description")
    parser.add_argument("--sample", "-s", help="Path to sample audio (will create if not provided)")
    parser.add_argument("--promo", help="Promotional text (e.g., 'New Release!')")
    parser.add_argument("--featured", action="store_true", help="Mark as featured")
    parser.add_argument("--api-url", default=DTT_API_URL, help="API URL")
    parser.add_argument("--create-sample", action="store_true", help="Auto-create 2-min sample")
    
    args = parser.parse_args()
    
    # Auto-create sample if requested
    sample_path = args.sample
    if args.create_sample and not sample_path:
        print("Creating 2-minute sample...")
        try:
            sample_path = create_sample(args.audio)
            print(f"Sample created: {sample_path}")
        except Exception as e:
            print(f"Warning: Could not create sample: {e}")
    
    print(f"Publishing '{args.title}' to Drive Time Tales...")
    
    result = publish_to_dtt(
        audio_path=args.audio,
        title=args.title,
        author=args.author,
        genre=args.genre,
        duration_mins=args.duration,
        description=args.description,
        sample_path=sample_path,
        promo_text=args.promo,
        is_featured=args.featured,
        api_url=args.api_url
    )
    
    if result["success"]:
        print("✅ Published successfully!")
        print(f"   Story ID: {result.get('story', {}).get('id')}")
        print(f"   Audio URL: {result.get('audio_url')}")
        if result.get('sample_url'):
            print(f"   Sample URL: {result.get('sample_url')}")
    else:
        print(f"❌ Failed to publish: {result.get('error')}")
        exit(1)
