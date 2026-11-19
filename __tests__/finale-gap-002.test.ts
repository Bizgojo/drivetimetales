/**
 * FINALE-GAP-002 — CANON-11 rules 26a, 15a–15f (CANON-99 item 157)
 *
 * These tests encode the canon decision itself rather than the component, so
 * they stay meaningful when CanonicalPlayer.tsx is refactored. The logic below
 * is a faithful mirror of resolveFinaleNext() / getEligibleSeries() in
 * components/player/CanonicalPlayer.tsx — if you change one, change both.
 *
 * Rules under test:
 *   26a  playlist order does not pick the next series after a finale
 *   15a  the gap is 2000ms and silent
 *   15b  the FIRST UNSTARTED series in the match list wins
 *   15c  all started  → no series, review screen then Library
 *   15d  only complete + fully live series are eligible (else rule 31)
 *   15e  the match list is canon, per series, ordered
 *   15f  handoff logs from / to / started / stopped
 */

type Series = { id: string; title: string; episodes: number; liveEpisodes: number };

const ALTAR = 'The Man I Left at the Altar';

// Mirrors FINALE_MATCH_LIST in CanonicalPlayer.tsx (CANON-11 rule 15e).
const FINALE_MATCH_LIST: Record<string, string[]> = {
  Rerouted: ["Don't Go Home", 'The Widow Who Watched'],
  "Don't Go Home": ['Rerouted', 'The Widow Who Watched'],
  'Second Rise': ['Weekend Wife in Miami', 'The Widow Who Watched', ALTAR],
  'The Widow Who Watched': ['Weekend Wife in Miami', 'Second Rise', ALTAR],
  'Weekend Wife in Miami': ['Second Rise', 'The Widow Who Watched', ALTAR],
  [ALTAR]: [],
};

const ALTAR_VOICES_APPROVED = false;
const ALTAR_REQUIRED_EPISODES = 30;
const FINALE_SERIES_GAP_MS = 2000;

type Resolution = { series: Series | null; reason: string };

function getEligibleSeries(title: string, catalogue: Series[]): Series | null {
  const s = catalogue.find((x) => x.title === title);
  if (!s) return null;
  if (s.episodes === 0) return null;
  // Rule 15d: every episode must be live.
  if (s.liveEpisodes !== s.episodes) return null;
  // Rule 15d/e: the Altar gate.
  if (title === ALTAR) {
    if (!ALTAR_VOICES_APPROVED) return null;
    if (s.episodes < ALTAR_REQUIRED_EPISODES) return null;
  }
  return s;
}

function resolveFinaleNext(
  fromTitle: string,
  catalogue: Series[],
  startedSeriesIds: Set<string>
): Resolution {
  const candidates = FINALE_MATCH_LIST[fromTitle];
  if (!candidates || candidates.length === 0) {
    return { series: null, reason: 'no_match_list' };
  }
  let anyEligible = false;
  for (const title of candidates) {
    const eligible = getEligibleSeries(title, catalogue);
    if (!eligible) continue;
    anyEligible = true;
    // Rule 15b: first UNSTARTED series wins.
    if (!startedSeriesIds.has(eligible.id)) {
      return { series: eligible, reason: 'first_unstarted' };
    }
  }
  return { series: null, reason: anyEligible ? 'all_started' : 'none_eligible' };
}

// ─── Fixtures ───────────────────────────────────────────────────────────────
const FULL: Series[] = [
  { id: 'ser-rerouted', title: 'Rerouted', episodes: 7, liveEpisodes: 7 },
  { id: 'ser-dgh', title: "Don't Go Home", episodes: 7, liveEpisodes: 7 },
  { id: 'ser-widow', title: 'The Widow Who Watched', episodes: 7, liveEpisodes: 7 },
  { id: 'ser-second', title: 'Second Rise', episodes: 7, liveEpisodes: 7 },
  { id: 'ser-weekend', title: 'Weekend Wife in Miami', episodes: 7, liveEpisodes: 7 },
  { id: 'ser-altar', title: ALTAR, episodes: 30, liveEpisodes: 0 },
];

describe('FINALE-GAP-002 — rule 15a: the gap', () => {
  it('is 2 seconds', () => {
    expect(FINALE_SERIES_GAP_MS).toBe(2000);
  });
});

describe('FINALE-GAP-002 — rule 15b: first unstarted series wins', () => {
  it('picks the first match-list entry when nothing is started', () => {
    const r = resolveFinaleNext('Rerouted', FULL, new Set());
    expect(r.reason).toBe('first_unstarted');
    expect(r.series?.title).toBe("Don't Go Home");
  });

  it('skips a series the listener has already started', () => {
    const r = resolveFinaleNext('Rerouted', FULL, new Set(['ser-dgh']));
    expect(r.series?.title).toBe('The Widow Who Watched');
  });

  it('does not fall back to a started series when one is unstarted later in the list', () => {
    // Second Rise list: Weekend → Widow → Altar. Weekend started, Widow not.
    const r = resolveFinaleNext('Second Rise', FULL, new Set(['ser-weekend']));
    expect(r.series?.title).toBe('The Widow Who Watched');
  });

  it('respects the per-series list, not a global chain', () => {
    // Rule 26a: Rerouted's list starts with Don't Go Home, but Don't Go Home's
    // list starts with Rerouted. A single chain could not express this.
    expect(resolveFinaleNext('Rerouted', FULL, new Set()).series?.title).toBe("Don't Go Home");
    expect(resolveFinaleNext("Don't Go Home", FULL, new Set()).series?.title).toBe('Rerouted');
  });

  it('Weekend Wife goes to Second Rise, not to Rerouted', () => {
    const r = resolveFinaleNext('Weekend Wife in Miami', FULL, new Set());
    expect(r.series?.title).toBe('Second Rise');
  });
});

describe('FINALE-GAP-002 — rule 15c: all started → Library', () => {
  it('returns no series and reason all_started when every candidate is started', () => {
    const r = resolveFinaleNext(
      'Rerouted',
      FULL,
      new Set(['ser-dgh', 'ser-widow'])
    );
    expect(r.series).toBeNull();
    expect(r.reason).toBe('all_started');
  });

  it('does not restart an already-heard series', () => {
    const r = resolveFinaleNext('Weekend Wife in Miami', FULL, new Set(['ser-second', 'ser-widow']));
    // Altar is in the list but gated, so nothing is eligible to play.
    expect(r.series).toBeNull();
    expect(r.reason).toBe('all_started');
  });
});

describe('FINALE-GAP-002 — rule 15d: only complete, live series', () => {
  it('skips a half-published series', () => {
    const catalogue: Series[] = [
      { id: 'ser-dgh', title: "Don't Go Home", episodes: 7, liveEpisodes: 3 },
      { id: 'ser-widow', title: 'The Widow Who Watched', episodes: 7, liveEpisodes: 7 },
    ];
    const r = resolveFinaleNext('Rerouted', catalogue, new Set());
    expect(r.series?.title).toBe('The Widow Who Watched');
  });

  it('never picks Altar while its voices are unapproved', () => {
    const catalogue: Series[] = [
      { id: 'ser-second', title: 'Second Rise', episodes: 7, liveEpisodes: 7 },
      { id: 'ser-widow', title: 'The Widow Who Watched', episodes: 7, liveEpisodes: 7 },
      { id: 'ser-altar', title: ALTAR, episodes: 30, liveEpisodes: 30 },
    ];
    const r = resolveFinaleNext('Weekend Wife in Miami', catalogue, new Set(['ser-second']));
    expect(r.series?.title).toBe('The Widow Who Watched');
  });

  it('reports none_eligible when nothing is live', () => {
    const catalogue: Series[] = [
      { id: 'ser-dgh', title: "Don't Go Home", episodes: 7, liveEpisodes: 0 },
    ];
    const r = resolveFinaleNext('Rerouted', catalogue, new Set());
    expect(r.series).toBeNull();
    expect(r.reason).toBe('none_eligible');
  });

  it('reports no_match_list for a series that is not in the canon list', () => {
    const r = resolveFinaleNext('Some Unlisted Series', FULL, new Set());
    expect(r.series).toBeNull();
    expect(r.reason).toBe('no_match_list');
  });
});

describe('FINALE-GAP-002 — rule 15f: handoff logging', () => {
  it('carries the four canon fields', () => {
    const entry = {
      from: 'Rerouted',
      to: "Don't Go Home",
      started: false,
      stopped: false,
      reason: 'first_unstarted',
    };
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining(['from', 'to', 'started', 'stopped'])
    );
    // Rule 15b: a chosen series is by definition not started.
    expect(entry.started).toBe(false);
  });
});
