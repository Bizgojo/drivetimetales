export type PlayerMode = 'story' | 'series' | 'playlist';

export type PlayerQueueItemType = 'intro' | 'story' | 'outro';

export interface PlayerStory {
  id: string;
  title: string;
  author?: string | null;
  description?: string | null;
  genre?: string | null;
  duration_mins?: number | null;
  cover_url?: string | null;
  audio_url?: string | null;
  story_audio_url?: string | null;
  intro_audio_url?: string | null;
  intro_before_url?: string | null;
  intro_after_url?: string | null;
  outro_audio_url?: string | null;
  background_music_url?: string | null;
  intro_end_seconds?: number | null;
  episode_number?: number | null;
  series_id?: string | null;
  series_name?: string | null;
  is_free?: boolean | null;
  prose_text?: string | null;
  author_id?: string | null;
  narrator_voice_id?: string | null;
  narrator_voice_name?: string | null;
  status?: string | null;
  is_hidden?: boolean | null;
  published_on?: string | null;
  avg_rating?: number | null;
}

export interface PlayerQueueItem {
  storyId?: string;
  url: string;
  type: PlayerQueueItemType;
  label: string;
  durationSeconds?: number | null;
}

export type AutoAdvanceReason =
  | 'next_series_episode'
  | 'same_genre_duration_match'
  | 'same_genre'
  | 'user_taste_duration_match'
  | 'user_taste'
  | 'untouched_catalog';

export interface AutoAdvanceCandidate {
  story: PlayerStory;
  reason: AutoAdvanceReason;
  reasonLabel: string;
  score?: number;
}

export type AutoAdvanceDisabledReason =
  | 'manual_pause'
  | 'stop'
  | 'skip'
  | 'close'
  | 'navigation'
  | 'not_for_me'
  | 'timeout';

export interface PlayerSessionState {
  mode: PlayerMode;
  autoAdvanceEnabled: boolean;
  isAdvancing: boolean;
  isMounted: boolean;
  unrequestedAutoStarts: number;
  stillListeningRequired: boolean;
  autoAdvanceDisabledReason?: AutoAdvanceDisabledReason;
  pendingAutoAdvanceStoryId?: string | null;
  countdownTimerId?: ReturnType<typeof setTimeout> | null;
  stillListeningTimerId?: ReturnType<typeof setTimeout> | null;
}
