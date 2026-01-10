'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface UseAudioPlayerOptions {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}

export function useAudioPlayer(audioUrl: string | null, options?: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize audio element
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setLoading(false);
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
      options?.onTimeUpdate?.(audio.currentTime, audio.duration);
    });

    audio.addEventListener('progress', () => {
      if (audio.buffered.length > 0) {
        setBuffered(audio.buffered.end(audio.buffered.length - 1));
      }
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      options?.onEnded?.();
    });

    audio.addEventListener('error', () => {
      const err = new Error('Failed to load audio');
      setError(err);
      setLoading(false);
      options?.onError?.(err);
    });

    audio.addEventListener('waiting', () => setLoading(true));
    audio.addEventListener('canplay', () => setLoading(false));

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioUrl]);

  // Play/Pause
  const play = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      setError(err as Error);
    }
  }, []);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  // Seek
  const seek = useCallback((time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);

  const seekRelative = useCallback((seconds: number) => {
    if (!audioRef.current) return;
    seek(currentTime + seconds);
  }, [currentTime, seek]);

  // Skip forward/backward
  const skipForward = useCallback((seconds: number = 30) => {
    seekRelative(seconds);
  }, [seekRelative]);

  const skipBackward = useCallback((seconds: number = 15) => {
    seekRelative(-seconds);
  }, [seekRelative]);

  // Playback rate
  const changePlaybackRate = useCallback((rate: number) => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  // Volume
  const changeVolume = useCallback((vol: number) => {
    if (!audioRef.current) return;
    audioRef.current.volume = Math.max(0, Math.min(1, vol));
    setVolume(vol);
  }, []);

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  return {
    // State
    isPlaying,
    currentTime,
    duration,
    buffered,
    playbackRate,
    volume,
    error,
    loading,
    progress,
    bufferedProgress,
    
    // Controls
    play,
    pause,
    togglePlay,
    seek,
    seekRelative,
    skipForward,
    skipBackward,
    changePlaybackRate,
    changeVolume,
    
    // Helpers
    formatTime,
    formattedCurrentTime: formatTime(currentTime),
    formattedDuration: formatTime(duration),
    formattedRemaining: formatTime(duration - currentTime),
  };
}

// Playback rate options
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
