/* ===== AdSense Auto-Inject ===== */
(function () {
  'use strict';
  var PUB_ID = 'ca-pub-9450350856883249';

  // Meta tag
  if (!document.querySelector('meta[name="google-adsense-account"]')) {
    var meta = document.createElement('meta');
    meta.name = 'google-adsense-account';
    meta.content = PUB_ID;
    document.head.appendChild(meta);
  }

  // Script adsbygoogle
  if (!document.querySelector('script[src*="adsbygoogle"]')) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + PUB_ID;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }
})();
