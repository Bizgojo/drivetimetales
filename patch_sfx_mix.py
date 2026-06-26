import sys, shutil
FILE = "app/api/asc3/render-final-mix/core.ts"
OLD = r"""    // Concatenate and normalize all story segments in one pass
    const rawConcatFile = path.join(tmpDir, 'raw_concat.txt')
    await fs.writeFile(rawConcatFile, segPaths.map(p => `file '${p}'`).join('\n'))"""
NEW = r"""    // ── SFX clips (anchor sound effects) ───────────────────────────────────
    // generate-voices emits each [SFX:] cue as sfx_NNNN.mp3, where NNNN is the
    // same global line index used for segment_NNNN.mp3 voice clips. Discover the
    // SFX clips, reformat them to the common spec, and interleave them with the
    // voice segments BY INDEX so each effect lands in the gap on its own line —
    // between spoken lines, never under dialogue. No per-clip loudnorm; the body
    // loudnorm pass below levels the whole stream (per-SFX gain trims can be
    // added later if an effect sits too hot or too quiet).
    const sfxPattern = /^sfx_(\d{4})\.mp3$/
    const parsedSfx = files
      .map(f => { const m = f.name.match(sfxPattern); return m ? { file: f, sfxNumber: Number(m[1]) } : null })
      .filter((item): item is { file: typeof files[number], sfxNumber: number } => item !== null)
      .sort((a, b) => a.sfxNumber - b.sfxNumber)
    const preparedSfx: Array<{ name: string; sfxNumber: number; path: string }> = []
    for (const item of parsedSfx) {
      try {
        const rawSfxPath = path.join(tmpDir, 'raw_' + item.file.name)
        const sfxPath = path.join(tmpDir, item.file.name)
        await download(`${BASE_STORAGE}/asc3/${storyId}/${item.file.name}`, rawSfxPath)
        const stat = await fs.stat(rawSfxPath)
        if (stat.size <= 100) throw new Error(`SFX file too small (${stat.size} bytes)`)
        await execFileAsync(FFMPEG_PATH, ['-i', rawSfxPath, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', sfxPath])
        preparedSfx.push({ name: item.file.name, sfxNumber: item.sfxNumber, path: sfxPath })
        await fs.unlink(rawSfxPath).catch(() => {})
      } catch (e) {
        console.error(`  SFX clip ${item.file.name} failed (skipping):`, e)
      }
    }
    console.log(`  SFX clips prepared: ${preparedSfx.length}/${parsedSfx.length}`)

    // Concatenate and normalize the body in one pass — voice segments and SFX
    // clips interleaved by global line index.
    const bodyTimeline = [
      ...preparedSegments.map(s => ({ idx: s.segmentNumber, path: s.path })),
      ...preparedSfx.map(s => ({ idx: s.sfxNumber, path: s.path })),
    ].sort((a, b) => a.idx - b.idx)
    const rawConcatFile = path.join(tmpDir, 'raw_concat.txt')
    await fs.writeFile(rawConcatFile, bodyTimeline.map(t => `file '${t.path}'`).join('\n'))"""
src = open(FILE, encoding="utf-8").read()
n = src.count(OLD)
if n != 1:
    print(f"ABORT: expected exactly 1 match of the anchor, found {n}. No changes made.")
    sys.exit(1)
shutil.copyfile(FILE, FILE + ".bak")
open(FILE, "w", encoding="utf-8").write(src.replace(OLD, NEW, 1))
print(f"Patched OK. Backup saved at {FILE}.bak")
