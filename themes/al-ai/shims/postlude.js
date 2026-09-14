/*
 * Retires the contact form's POST.
 *
 * theme.js binds a submit handler that posts to "mail.php" (see
 * theme-before-minify.js around line 1600). There is no PHP runtime here, so
 * that request would 404 and the theme would show its own error styling to a
 * visitor who had just filled the form in — worse than not offering to send.
 *
 * This unbinds it and shows the direct contact routes instead. Wiring the form
 * to the CMS is a one-line change once that is wanted: POST to /api/forms.
 */
/* --- al-ai pack postlude: contact form is display-only --- */
(function ($) {
  if (typeof $ !== 'function') return;
  $(function () {
    var $form = $('#tt-contact-form');
    if (!$form.length) return;
    $form.off('submit').on('submit', function (e) {
      e.preventDefault();
      var $box = $('#tt-contact-form-messages');
      $box.find('.tt-cfm-inner').html(
        '<span class="tt-cfm-error">This form is not connected yet. ' +
        'Please email <a href="mailto:info@al-ai.ai">info@al-ai.ai</a> ' +
        'or call +(962) 659 310 29.</span>'
      );
      $box.addClass('visible');
    });
  });
})(window.jQuery);
