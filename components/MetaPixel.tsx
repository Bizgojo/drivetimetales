import Script from 'next/script'

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
      {/* noscript fallback: test sessions always run with JS enabled, so the
          __etTestSession guard above covers them; this img only fires for
          real visitors with JS disabled. */}
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  )
}
