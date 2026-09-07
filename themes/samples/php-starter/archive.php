<?php get_header(); ?>
<main class="site-main">
  <h1><?php bloginfo('name'); ?> — Archive</h1>
  <?php if ( have_posts() ) : ?>
    <?php while ( have_posts() ) : the_post(); ?>
      <h2><?php the_title(); ?></h2>
      <p><?php the_excerpt(); ?></p>
    <?php endwhile; ?>
  <?php endif; ?>
</main>
<?php get_footer(); ?>
