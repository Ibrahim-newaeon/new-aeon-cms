<?php
// Logic-only — converter should skip this file.
function php_starter_setup() {
  add_theme_support('title-tag');
}
add_action('after_setup_theme', 'php_starter_setup');
