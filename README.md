# DTT Working Auth and Home Page - January 10, 2026

## What This Fixes

These files fix the following issues that have occurred multiple times:

### 1. Signin Page Hanging / "Signing In..." Forever
**Symptoms:** 
- Click "Sign In with Email" button
- Button turns gray, shows "Signing In..."
- Never completes, browser console shows "Auth timeout"

**Fixed by:** `app/signin/page.tsx`
- Fixed password toggle causing form fields to clear
- Changed redirect from `router.push()` to `window.location.href`
- Non-blocking last_login update

### 2. Auth Timeout Errors
**Symptoms:**
- Console shows `[Auth] Error checking user: Error: Auth timeout`
- Pages hang waiting for authentication
- User appears logged out even after signing in

**Fixed by:** `contexts/AuthContext.tsx`
- Non-blocking auth - doesn't wait for `getSession()`
- Uses `onAuthStateChange` listener instead
- Sets loading=false quickly (1 second) so pages render
- Includes `signIn` and `refreshCredits` functions required by other pages

### 3. Home Page Spinner Forever / Stories Not Loading
**Symptoms:**
- Home page shows "Welcome back, there!"
- NEW RELEASES shows loading bar
- RECOMMENDED FOR YOU shows spinner indefinitely
- Console shows `[Home] Stories loading timeout`

**Fixed by:** `app/home/page.tsx`
- Uses `/api/stories` endpoint instead of direct Supabase queries
- Direct client-side Supabase queries hang, API route works
- 10-second timeout with friendly error message

## How to Use

If these issues happen again:

```bash
cd ~/Downloads
unzip -o DTT-Working-Auth-and-Home-Jan10-2026.zip -d ~/Projects/drivetimetales/
cd ~/Projects/drivetimetales
git add .
git commit -m "Restore working auth and home page"
git push
```

## File Structure

```
contexts/
  AuthContext.tsx    # Non-blocking auth with signIn/refreshCredits

app/
  signin/
    page.tsx         # Fixed signin with proper password toggle
  home/
    page.tsx         # Uses API route for stories, has timeout
```

## Key Technical Details

### AuthContext.tsx
- Timeout: Sets `loading=false` after 1 second (non-blocking)
- Uses `onAuthStateChange` for auth state updates
- `getSession()` runs in background, doesn't block
- Exports: `user`, `loading`, `signIn`, `signOut`, `refreshUser`, `refreshCredits`

### signin/page.tsx
- Uses `window.location.href = '/home'` for redirect (not router.push)
- Password toggle uses `useCallback` to prevent re-renders
- SVG icons instead of emoji for eye toggle
- `tabIndex={-1}` on eye button

### home/page.tsx
- Fetches stories via `fetch('/api/stories')` 
- NOT direct `supabase.from('stories').select('*')`
- 10-second timeout protection
- Console logs: `[Home] Loading stories via API...`

## Root Cause

The underlying issue is that **client-side Supabase queries hang** on this project, but **server-side API routes work fine**. This is likely related to:
- Supabase connection pooling
- RLS (Row Level Security) policies
- Network/CORS configuration

The welcome page was already using `/api/stories` which is why it worked while the home page didn't.
