// ---------------------------------------------------------------------------
// Google Analytics (GA4). One source of truth for the Measurement ID; injected
// once per page. Guarded to the live host so local dev traffic isn't counted.
//
// To wire up: create a GA4 web data stream for https://flab.world and paste its
// Measurement ID (G-XXXXXXXXXX) into GA_ID below. Until then it's a no-op.
// ---------------------------------------------------------------------------
const GA_ID = 'G-BWHL3162PJ';     // GA4 web stream "FLABsite" (flab.world)
const LIVE_HOSTS = ['flab.world', 'www.flab.world'];

export function initAnalytics() {
  if (!GA_ID) return;                                   // not configured yet
  if (!LIVE_HOSTS.includes(location.hostname)) return;  // skip localhost/dev

  // Load the gtag library.
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  // Standard GA4 bootstrap.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', GA_ID);
}
