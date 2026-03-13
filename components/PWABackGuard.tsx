'use client';

/**
 * PWABackGuard
 *
 * Fixes the blank black page that appears when a user presses the iOS
 * "back" button after launching the app from the home screen icon.
 *
 * Problem: PWA launches with zero browser history. One back press sends
 * the user to the empty void before any history existed.
 *
 * Fix: On launch, place a sentinel entry at the bottom of the history
 * stack. When the user pops back to it, we catch it and redirect to /home
 * instead of letting iOS show a blank page.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PWABackGuard() {
  const router = useRouter();

  useEffect(() => {
    // Only activate in standalone (home screen) mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (!isStandalone) return;

    // Place sentinel at the very bottom of the history stack
    // replaceState replaces the current (empty) entry, then we push
    // the real current page on top so normal navigation is unaffected.
    if (!history.state?.etPWASentinel) {
      history.replaceState({ etPWASentinel: true }, '');
      history.pushState({ etPWATop: true }, '', window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.etPWASentinel) {
        // User hit bottom — push forward and send them home
        history.pushState({ etPWATop: true }, '', '/home');
        router.push('/home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [router]);

  return null;
}
