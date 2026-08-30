// components/site/tracking-scripts.tsx
import Script from 'next/script';
import { headers } from 'next/headers';
import type { SiteSettings } from '@/lib/db/queries';

/**
 * Injects the tracking snippets configured in Settings > tracking codes.
 *
 * CSP: middleware sets `script-src 'self' 'nonce-…' 'strict-dynamic'`. Every tag
 * below carries that nonce, and 'strict-dynamic' then extends trust to whatever
 * those loaders inject (gtag.js, fbevents.js, …) without needing a host
 * allow-list for scripts.
 *
 * The IDs are regex-validated in lib/settings-schema.ts before they are stored,
 * so they cannot break out of the template literals here.
 */
export async function TrackingScripts({ settings }: { settings: SiteSettings | null }) {
  if (!settings) return null;

  // Never load trackers in development — it pollutes real analytics data.
  if (process.env.NODE_ENV !== 'production') return null;

  const nonce = (await headers()).get('x-nonce') ?? undefined;

  const { gtmId, ga4Id, metaPixelId, tiktokPixelId, snapPixelId } = settings;

  return (
    <>
      {gtmId && (
        <Script id="gtm" nonce={nonce} strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
var n=d.querySelector('[nonce]');n&&j.setAttribute('nonce',n.nonce||n.getAttribute('nonce'));
f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      )}

      {ga4Id && (
        <>
          <Script
            id="ga4-src"
            nonce={nonce}
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
          />
          <Script id="ga4" nonce={nonce} strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${ga4Id}');`}
          </Script>
        </>
      )}

      {metaPixelId && (
        <Script id="meta-pixel" nonce={nonce} strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,
'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${metaPixelId}');fbq('track','PageView');`}
        </Script>
      )}

      {tiktokPixelId && (
        <Script id="tiktok-pixel" nonce={nonce} strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";
o.async=!0;o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];
a.parentNode.insertBefore(o,a)};ttq.load('${tiktokPixelId}');ttq.page();
}(window,document,'ttq');`}
        </Script>
      )}

      {snapPixelId && (
        <Script id="snap-pixel" nonce={nonce} strategy="afterInteractive">
          {`(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){
a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
a.queue=[];var s='script',r=t.createElement(s);r.async=!0;r.src=n;
var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);
})(window,document,'https://sc-static.net/scevent.min.js');
snaptr('init','${snapPixelId}');snaptr('track','PAGE_VIEW');`}
        </Script>
      )}
    </>
  );
}

/**
 * GTM's <noscript> iframe fallback. Must sit immediately inside <body>, so it is
 * rendered separately from the script block above.
 */
export function TrackingNoScript({ gtmId }: { gtmId?: string | null }) {
  if (!gtmId || process.env.NODE_ENV !== 'production') return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
