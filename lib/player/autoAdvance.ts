import type { AutoAdvanceCandidate, AutoAdvanceReason, PlayerStory } from '@/components/player/playerTypes';

export interface UserLibraryPlaybackState {
  story_id: string;
  completed?: boolean | null;
  not_for_me?: boolean | null;
  progress?: number | null;
  last_played?: string | null;
  story?: Pick<PlayerStory, 'genre'> | null;
}

export interface FindNextAutoAdvanceStoryInput {
  currentStory: PlayerStory;
  candidateStories: PlayerStory[];
  userLibrary: UserLibraryPlaybackState[];
}

type RankedStory = {
  story: PlayerStory;
  score: number;
};

const DURATION_WINDOW_MINUTES = 5;

export function isEligibleAutoAdvanceStory(
  story: PlayerStory,
  userLibrary: UserLibraryPlaybackState[] = [],
  currentStoryId?: string
): boolean {
  if (!story.id || story.id === currentStoryId) return false;
  if (story.status !== 'published') return false;
  if (story.is_hidden !== false) return false;

  const libraryState = userLibrary.find((row) => row.story_id === story.id);
  if (!libraryState) return true;

  if (libraryState.not_for_me) return false;
  if (libraryState.completed) return false;
  if ((libraryState.progress ?? 0) > 0) return false;
  if (libraryState.last_played) return false;

  return true;
}

export function findNextAutoAdvanceStory({
  currentStory,
  candidateStories,
  userLibrary,
}: FindNextAutoAdvanceStoryInput): AutoAdvanceCandidate | null {
  const eligibleStories = candidateStories.filter((story) =>
    isEligibleAutoAdvanceStory(story, userLibrary, currentStory.id)
  );

  const nextSeriesEpisode = pickNextSeriesEpisode(
    eligibleStories.filter(
      (story) =>
        !!currentStory.series_id &&
        story.series_id === currentStory.series_id &&
        Number.isFinite(story.episode_number) &&
        Number.isFinite(currentStory.episode_number) &&
        Number(story.episode_number) > Number(currentStory.episode_number)
    )
  );
  if (nextSeriesEpisode) {
    return candidate(nextSeriesEpisode.story, 'next_series_episode', 'Next episode', nextSeriesEpisode.score);
  }

  const sameGenreDurationMatch = pickBest(
    eligibleStories.filter((story) => sameGenre(story, currentStory) && withinDurationWindow(story, currentStory))
  );
  if (sameGenreDurationMatch) {
    return candidate(
      sameGenreDurationMatch.story,
      'same_genre_duration_match',
      'Same genre, similar length',
      sameGenreDurationMatch.score
    );
  }

  const sameGenreAnyDuration = pickBest(eligibleStories.filter((story) => sameGenre(story, currentStory)));
  if (sameGenreAnyDuration) {
    return candidate(sameGenreAnyDuration.story, 'same_genre', 'Same genre', sameGenreAnyDuration.score);
  }

  const tasteGenres = mostPlayedGenres(userLibrary, currentStory.genre);
  for (const genre of tasteGenres) {
    const tasteDurationMatch = pickBest(
      eligibleStories.filter((story) => normalizedGenre(story.genre) === genre && withinDurationWindow(story, currentStory))
    );
    if (tasteDurationMatch) {
      return candidate(
        tasteDurationMatch.story,
        'user_taste_duration_match',
        'Based on your listening, similar length',
        tasteDurationMatch.score
      );
    }
  }

  for (const genre of tasteGenres) {
    const tasteAnyDuration = pickBest(eligibleStories.filter((story) => normalizedGenre(story.genre) === genre));
    if (tasteAnyDuration) {
      return candidate(tasteAnyDuration.story, 'user_taste', 'Based on your listening', tasteAnyDuration.score);
    }
  }

  const untouchedCatalogStory = pickBest(eligibleStories);
  if (untouchedCatalogStory) {
    return candidate(untouchedCatalogStory.story, 'untouched_catalog', 'Recommended next', untouchedCatalogStory.score);
  }

  return null;
}

function candidate(
  story: PlayerStory,
  reason: AutoAdvanceReason,
  reasonLabel: string,
  score: number
): AutoAdvanceCandidate {
  return { story, reason, reasonLabel, score };
}

function pickNextSeriesEpisode(stories: PlayerStory[]): RankedStory | null {
  if (stories.length === 0) return null;

  return stories
    .map((story) => ({ story, score: rankScore(story) }))
    .sort((a, b) => {
      const aEpisode = Number(a.story.episode_number);
      const bEpisode = Number(b.story.episode_number);
      if (aEpisode !== bEpisode) return aEpisode - bEpisode;
      if (b.score !== a.score) return b.score - a.score;
      return a.story.title.localeCompare(b.story.title);
    })[0];
}

function sameGenre(story: PlayerStory, currentStory: PlayerStory): boolean {
  const storyGenre = normalizedGenre(story.genre);
  return !!storyGenre && storyGenre === normalizedGenre(currentStory.genre);
}

function withinDurationWindow(story: PlayerStory, currentStory: PlayerStory): boolean {
  if (typeof story.duration_mins !== 'number' || typeof currentStory.duration_mins !== 'number') return false;
  return Math.abs(story.duration_mins - currentStory.duration_mins) <= DURATION_WINDOW_MINUTES;
}

function mostPlayedGenres(userLibrary: UserLibraryPlaybackState[], currentGenre?: string | null): string[] {
  const current = normalizedGenre(currentGenre);
  const counts = new Map<string, number>();

  for (const row of userLibrary) {
    if (!row.completed || row.not_for_me) continue;

    const genre = normalizedGenre(row.story?.genre);
    if (!genre || genre === current) continue;

    counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([genre]) => genre);
}

function pickBest(stories: PlayerStory[]): RankedStory | null {
  if (stories.length === 0) return null;

  return stories
    .map((story) => ({ story, score: rankScore(story) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.story.title.localeCompare(b.story.title);
    })[0];
}

function rankScore(story: PlayerStory): number {
  let score = 0;

  if (!isSeriesEpisodeOne(story)) score += 1_000_000;

  if (typeof story.avg_rating === 'number') {
    score += story.avg_rating * 10_000;
  }

  score += publishedTimeScore(story.published_on);

  return score;
}

function isSeriesEpisodeOne(story: PlayerStory): boolean {
  return !!story.series_id && Number(story.episode_number) === 1;
}

function publishedTimeScore(publishedOn?: string | null): number {
  if (!publishedOn) return 0;

  const time = Date.parse(publishedOn);
  if (!Number.isFinite(time)) return 0;

  return Math.floor(time / 86_400_000);
}

function normalizedGenre(genre?: string | null): string {
  return (genre ?? '').trim().toLowerCase();
}
