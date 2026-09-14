/*
 * Runs FIRST in the bundle, before any vendor library.
 *
 * The CMS renders its own <body class="site-body …">, so the four classes the
 * original page carried are gone — and theme.js reads them with hasClass() to
 * decide whether to initialise the page transition, the noise overlay, the
 * magnetic cursor and smooth scrolling. Without this, all four stay off and
 * nothing reports an error.
 *
 * Making the body visible is the other half: the original set that from an
 * inline <script>, which cannot run here (see the pack README, constraint 2).
 */
/* --- al-ai pack prelude: CMS shell compatibility --- */
(function () {
  var b = document.body;
  if (!b) return;
  ['tt-transition', 'tt-noise', 'tt-magic-cursor', 'tt-smooth-scroll'].forEach(function (c) {
    b.classList.add(c);
  });
  b.style.visibility = 'visible';
})();
