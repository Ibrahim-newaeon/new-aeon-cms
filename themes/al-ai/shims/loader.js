/*
 * The loader dismissal, lifted from the inline <script> at the foot of
 * index.html. Nothing else removes #al-loader, which covers the viewport at
 * z-index 999999 — so if this is dropped, every page renders as a black screen.
 *
 * Two departures from the original, both because this now runs inside React.
 *
 * The class goes on <html>, not on the loader element. React re-renders the
 * pack's markup on a hydration mismatch, replacing #al-loader with a fresh
 * node — and a reference captured at startup then points at a detached
 * element. The original put the class on that reference, so the page kept a
 * brand new loader over it forever. An ancestor React never touches survives
 * any number of re-mounts, and loader.css carries the matching rule.
 *
 * The element is also looked up at reveal time rather than at startup, for the
 * same reason: whatever is in the document then is what needs removing.
 *
 * The #mainBanner iframe it waits on is stripped by the sanitiser — iframe is
 * in no paste mode's tag list — so whenIframeLoaded() resolves immediately.
 * Left in place because the page it was written for may regain one.
 */
/* --- al-ai pack: loader dismissal (was inline in index.html) --- */
(function () {
  var iframe = document.getElementById('mainBanner');
  var MIN_MS = 900, MAX_MS = 20000, start = Date.now(), done = false;

  function reveal() {
    if (done) return; done = true;
    document.body.style.visibility = 'visible';
    document.documentElement.classList.add('al-loaded');

    // Looked up now, not at startup: a re-render may have replaced it.
    var el = document.getElementById('al-loader');
    if (el) {
      el.classList.add('al-hide');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
    }
  }

  function whenWindowLoaded() {
    return new Promise(function (resolve) {
      if (document.readyState === 'complete') return resolve();
      window.addEventListener('load', resolve, { once: true });
    });
  }

  function whenIframeLoaded() {
    return new Promise(function (resolve) {
      if (!iframe) { resolve(); return; }
      var settled = false;
      function mark() { if (settled) return; settled = true; resolve(); }
      iframe.addEventListener('load', mark, { once: true });
      setTimeout(mark, 15000);
    });
  }

  Promise.all([whenWindowLoaded(), whenIframeLoaded()]).then(function () {
    setTimeout(reveal, Math.max(0, MIN_MS - (Date.now() - start)));
  });

  setTimeout(reveal, MAX_MS);
})();
