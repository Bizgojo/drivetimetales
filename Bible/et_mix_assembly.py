# ── ASSEMBLE & MIX ──────────────────────────────────────────
# ET Mix Spec v2.3.67 — LOCKED. Do not modify without Marc's approval.
#
# Mix structure:
#   [STING] → overlapping [BELLE B INTRO] (Belle B starts at 1200ms into sting)
#   → sting continues fading under Belle B → sting inaudible by end of Belle B line
#   → 500ms silence
#   → [STORY BODY] with background music ducked to -28dB under voice
#   → music swells +8dB over 2 seconds at end of story
#   → 500ms silence
#   → [BELLE B OUTRO] with music ducked to -60dB (nearly silent)
#   → music fades to complete silence
#
# Assets:
#   ET_Signature_Sting_v6.mp3 — 3.5s, 150ms fade in, 2.8s fade out tail
#   Belle B voice ID: KWDD3Wyq30ZF5NEL01EJ
#   Target: -14 LUFS, stereo, 44.1kHz, 192kbps

print("\n── STAGE 6: MIX & EXPORT ──")
output_path = os.path.join(dirs["output"], f"[ASC] {safe_title}_final.mp3")

try:
    from pydub import AudioSegment
    from pydub.effects import normalize

    TARGET_LUFS = -14.0
    BEAT_MS = 1000
    PAUSE_UNIT_MS = 1000

    def load_norm(path):
        seg = AudioSegment.from_file(path)
        diff = TARGET_LUFS - seg.dBFS
        return seg.apply_gain(diff)

    # ── Split lines into intro / story / outro ───────────────
    intro_indices, outro_indices, story_indices = [], [], []
    in_story = False

    ann_alias = header.get("ANNOUNCER", "").strip().upper() or "ANNOUNCER"
    announcer_line_indices = [i for i, (s, t) in enumerate(script_lines)
                              if s in ("ANNOUNCER", ann_alias)]

    for i, (speaker, text) in enumerate(script_lines):
        if announcer_line_indices and i == announcer_line_indices[0]:
            intro_indices.append(i)
            in_story = True
        elif (announcer_line_indices and len(announcer_line_indices) > 1
              and i == announcer_line_indices[-1]):
            outro_indices.append(i)
            in_story = False
        elif in_story:
            story_indices.append(i)

    def build_segment(indices, label):
        seg = AudioSegment.empty()
        for idx in indices:
            speaker, text = script_lines[idx]
            if speaker == "BEAT":
                seg += AudioSegment.silent(duration=BEAT_MS)
            elif speaker == "PAUSE":
                seg += AudioSegment.silent(duration=int(text) * PAUSE_UNIT_MS)
            elif speaker == "SFX":
                sfx_path = sfx_files.get(idx)
                if sfx_path and os.path.exists(sfx_path):
                    sfx_seg = AudioSegment.from_file(sfx_path) - 10
                    seg = seg.overlay(sfx_seg, position=max(0, len(seg) - 500))
                    seg += AudioSegment.silent(duration=500)
            else:
                vf = voice_files.get(idx)
                if vf and os.path.exists(vf):
                    seg += load_norm(vf)
                    seg += AudioSegment.silent(duration=200)
        return seg

    print("  Building voice segments...")
    intro_audio = build_segment(intro_indices, "intro")
    story_audio = build_segment(story_indices, "story")
    outro_audio = build_segment(outro_indices, "outro")

    # ── Load ET Signature Sting ──────────────────────────────
    # ET_Signature_Sting_v6.mp3: 3.5s total, 150ms fade in, 2.8s fade out tail
    # Belle B starts at 1200ms — sting continues fading underneath her
    sting = None
    sting_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ET_Signature_Sting_v6.mp3")
    if not os.path.exists(sting_path):
        sting_path = os.path.expanduser("~/Projects/ASC/Assets/ET_Signature_Sting_v6.mp3")
    if os.path.exists(sting_path):
        sting = AudioSegment.from_file(sting_path)
        # Normalize sting to -14 LUFS then pull back 4dB so it sits under Belle B
        diff = TARGET_LUFS - sting.dBFS
        sting = sting.apply_gain(diff - 4)
        print(f"  Loaded sting: {len(sting)}ms")
    else:
        print("  WARNING: ET_Signature_Sting_v6.mp3 not found — mix will have no sting")

    # ── Build background music bed ───────────────────────────
    story_duration_ms = len(story_audio)
    bg_music = None
    if music_file and os.path.exists(music_file):
        bg_raw = AudioSegment.from_file(music_file)
        # Loop music to cover story duration
        if len(bg_raw) < story_duration_ms + 4000:
            loops = (story_duration_ms // len(bg_raw)) + 3
            bg_raw = bg_raw * loops
        # Duck music 22dB below target so voice is clearly on top
        bg_ducked = bg_raw - 22
        # Trim to story length
        bg_music = bg_ducked[:story_duration_ms]
        print(f"  Loaded music bed: {len(bg_music)}ms")

    # ── ASSEMBLE FINAL MIX ───────────────────────────────────
    print("  Assembling final mix (ET Mix Spec v2.3.67)...")
    final = AudioSegment.empty()

    # ── SECTION 1: STING + BELLE B INTRO ─────────────────────
    # Sting fires first. Belle B starts at 1200ms into sting.
    # Sting continues fading under Belle B — never hard stops.
    # Result: sting is inaudible by the time Belle B finishes her line.

    if sting is not None:
        # Build sting+intro overlay:
        # 1. Start with full sting
        # 2. Extend sting with a very long fade-out tail that covers Belle B's line
        sting_duration = len(sting)  # ~3500ms
        belle_b_duration = len(intro_audio)

        # Total intro block = max(sting, 1200ms + belle_b_duration)
        # We overlay Belle B starting at 1200ms into the sting
        intro_block_duration = max(sting_duration, 1200 + belle_b_duration + 500)

        # Create silent base of intro block length
        intro_block = AudioSegment.silent(duration=intro_block_duration)

        # Place sting at position 0, apply a long fade out that extends past sting end
        # Fade out starts at 1200ms (Belle B entry) and fades over full Belle B duration
        sting_fade_duration = belle_b_duration + 1000  # fade over Belle B + 1 extra second
        sting_with_tail = sting + AudioSegment.silent(duration=max(0, sting_fade_duration - sting_duration))
        # Apply fade out starting at 1200ms
        sting_with_tail = sting_with_tail.fade(
            to_gain=-60,
            start=1200,
            duration=sting_fade_duration
        )
        intro_block = intro_block.overlay(sting_with_tail, position=0)

        # Place Belle B intro voice at 1200ms
        intro_block = intro_block.overlay(intro_audio, position=1200)

        final += intro_block
    else:
        # No sting — just Belle B intro
        final += intro_audio

    final += AudioSegment.silent(duration=500)

    # ── SECTION 2: STORY WITH BACKGROUND MUSIC ───────────────
    # Background music ducked -22dB under voice
    if bg_music is not None:
        story_with_music = bg_music.overlay(story_audio)
    else:
        story_with_music = story_audio
    final += story_with_music

    # ── SECTION 3: MUSIC SWELL BEFORE OUTRO ──────────────────
    # Music rises +8dB over 2 seconds to signal story end
    SWELL_DURATION_MS = 2000
    if bg_music is not None:
        swell_start = len(bg_music) - SWELL_DURATION_MS
        if swell_start >= 0:
            swell_segment = (bg_raw - 14)[swell_start:swell_start + SWELL_DURATION_MS]
            swell_segment = swell_segment.fade_in(SWELL_DURATION_MS).fade_out(300)
            final += swell_segment
    final += AudioSegment.silent(duration=500)

    # ── SECTION 4: BELLE B OUTRO ─────────────────────────────
    # Music nearly silent (-60dB from target) under Belle B outro
    # Music fades completely to silence
    outro_duration_ms = len(outro_audio)
    if bg_music is not None and len(bg_raw) > outro_duration_ms:
        outro_music = (bg_raw - 60)[:outro_duration_ms]
        outro_music = outro_music.fade_out(outro_duration_ms)
        outro_block = outro_music.overlay(outro_audio)
    else:
        outro_block = outro_audio
    final += outro_block

    # ── NORMALIZE FINAL MIX TO -14 LUFS ──────────────────────
    diff = TARGET_LUFS - final.dBFS
    final = final.apply_gain(diff)

    # ── EXPORT ───────────────────────────────────────────────
    final = final.set_frame_rate(44100).set_channels(2)
    final.export(output_path, format="mp3", bitrate="192k")
    print(f"  ✅ Final mix exported: {output_path}")
    print(f"  Duration: {len(final)/1000:.1f}s | Level: {final.dBFS:.1f} dBFS")

except Exception as e:
    print(f"  ❌ Mix failed: {e}")
    import traceback
    traceback.print_exc()
    raise
