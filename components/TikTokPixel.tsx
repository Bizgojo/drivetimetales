// components/TikTokPixel.tsx — ATL-PIXEL-001
// TikTok base pixel, mirroring components/MetaPixel.tsx: env-gated, loads
// afterInteractive (non-blocking), fires the base Pageview. Renders nothing
// when NEXT_PUBLIC_TIKTOK_PIXEL_ID is unset (local/dev without ads config).

import Script from 'next/script'

export default function TikTokPixel() {
  const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID
  if (!pixelId) return null

  return (
    <Script id="tiktok-pixel" strategy="afterInteractive">
      {`
        // AMENDMENT-1 Gap 8.4: test sessions (et_test=<run_id> in the URL,
        // or carried in sessionStorage for later pages in the same tab)
        // must NEVER fire production pixel events. No waiver.
        // Gap 8.4b: logged-in test accounts (is_test_account=true) are
        // suppressed too, via the et_test_account cookie (set server-side
        // at login in /auth/callback) or localStorage flag (set on
        // /auth/confirm + AuthContext). Keep this predicate identical in
        // MetaPixel and lib/tracking/client.ts isTestSessionClient.
        window.__etTestSession = window.__etTestSession || (function() {
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
        !function (w, d, t) {
          w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
          ttq.load('${pixelId}');
          ttq.page();
        }(window, document, 'ttq');
        }
      `}
    </Script>
  )
}
