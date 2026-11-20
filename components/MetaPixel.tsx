import Script from 'next/script'

// PIXEL-SUPPRESS-001 (Marc, 2026-11-20): when ?et_test= is in the URL or the
// session is a known test session, NOTHING may reach Meta's pixel — not
// PageView, not any trackClientEvent call. Ad links never carry et_test, so
// there is no risk to real traffic.
//
// The suppression is three-layered and must stay consistent:
//   1. this component's __etTestSession guard (kills PageView + fbevents.js),
//   2. lib/tracking/client.ts isTestSessionClient() (kills every named event),
//   3. no <noscript> PageView fallback (see note at the bottom).
export default function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  if (!pixelId) return null

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          // AMENDMENT-1 Gap 8.4: test sessions (et_test=<run_id> in the URL,
          // or carried in sessionStorage for later pages in the same tab)
          // must NEVER fire production pixel events. No waiver.
          // Gap 8.4b: logged-in test accounts (is_test_account=true) are
          // suppressed too, via the et_test_account cookie (set server-side
          // at login in /auth/callback) or localStorage flag (set on
          // /auth/confirm + AuthContext). Keep this predicate identical in
          // TikTokPixel and lib/tracking/client.ts isTestSessionClient.
          window.__etTestSession = (function() {
            try {
              var s = window.location.search || '';
              if (/(^|[?&])et_test=/.test(s)) { try { sessionStorage.setItem('et_test', '1'); } catch (e) {} return true; }
              try { if (sessionStorage.getItem('et_test')) return true; } catch (e) {}
              try { if (localStorage.getItem('et_test_account') === '1') return true; } catch (e) {}
              try {
                var parts = (';' + (document.cookie || '')).split(';');
                for (var i = 0; i < parts.length; i++) {
                  if (parts[i].trim() === 'et_test_account=1') return true;
                }
              } catch (e) {}
            } catch (e) { return true; }
            return false;
          })();
          if (!window.__etTestSession) {
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
          }
        `}
      </Script>
      {/* PIXEL-SUPPRESS-001: no <noscript> fallback.
          The old fallback fired a PageView for EVERY visit, not just
          JS-disabled ones — browsers request <noscript> images regardless of
          whether scripting is on. That leaked a PageView at Meta for test
          sessions (?et_test=...) that the JS guard above had correctly
          suppressed, so a test visit was still visible in Events Manager.
          The JS guard is the only path to the pixel now: real visitors get
          PageView from the init block above. A JS-disabled visitor is not a
          listener we can bill or optimise against, so losing that PageView
          costs nothing. Do not restore this block. */}
    </>
  )
}
