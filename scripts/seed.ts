// scripts/seed.ts
// Run with: npm run db:seed  ->  tsx scripts/seed.ts
// NOTE: relative imports, not '@/...'. tsx does NOT resolve tsconfig `paths`
// by default, so the alias form fails with "Cannot find module '@/lib/db'".
import { db } from '../lib/db';
import {
  users, settings, categories, categoryI18n, contentTypes, content, contentI18n,
  brands, products, productI18n, productImages, productOptions, productVariants,
  variantOptionValues, shippingZones, tags,
} from '../lib/db/schema';
import { hashPassword } from '../lib/auth/password';
import { eq, sql } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Seeding database...');

  /**
   * Mirrors migration 0006. `drizzle-kit push` syncs the schema but never runs
   * the SQL migration files, so a database built the documented dev way
   * (db:push then db:seed) had no order_number_seq — and checkout died on
   * `SELECT nextval('order_number_seq')` with a 500 that looked like a bug in
   * pricing rather than a missing object. IF NOT EXISTS, so this is a no-op on
   * a database built with db:migrate.
   */
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1000`);

  const [pageType] = await db
    .insert(contentTypes)
    .values({
      slug: 'page',
      name: 'Page',
      hasArchive: false,
      hasCategories: false,
      hasTags: false,
      hasFeaturedImage: true,
      isActive: true,
    })
    .onConflictDoNothing()
    .returning();

  await db
    .insert(contentTypes)
    .values({
      slug: 'post',
      name: 'Post',
      hasArchive: true,
      hasCategories: true,
      hasTags: true,
      hasFeaturedImage: true,
      isActive: true,
    })
    .onConflictDoNothing()
    .returning();

  // onConflictDoNothing returns [] when the row already exists, so re-read.
  const pageTypeRow =
    pageType ??
    (await db.select().from(contentTypes).where(eq(contentTypes.slug, 'page')).limit(1))[0];

  const existingAdmin = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@newaeon.com'))
    .limit(1);

  let adminId = existingAdmin[0]?.id;

  if (!adminId) {
    const passwordHash = await hashPassword('admin123456');
    const [admin] = await db
      .insert(users)
      .values({
        email: 'admin@newaeon.com',
        passwordHash,
        name: 'مدير النظام',
        role: 'admin',
      })
      .returning();
    adminId = admin?.id;
    console.log('✅ Admin user created: admin@newaeon.com / admin123456');
    console.log('⚠️  Change this password before exposing the app.');
  }

  const existingSettings = await db.select().from(settings).limit(1);
  if (!existingSettings.length) {
    await db.insert(settings).values({
      siteName: 'New Aeon',
      siteDescription: 'نظام إدارة محتوى متقدم',
      comingSoonMode: false,
      eCommerceEnabled: false,
      currency: 'JOD',
    });
    console.log('✅ Default settings created');
  }

  /**
   * Contact details, only when they are still empty.
   *
   * Two things depend on them: the footer's "contact us" column renders an
   * empty list without them, and order alerts fall back to settings.contactEmail
   * when MAIL_ADMIN_TO is unset — the source of "[mail] no store recipient
   * configured" on every seeded order.
   *
   * Guarded on null rather than written unconditionally: this runs against
   * databases that already have real values, and a seed must never overwrite
   * the address a live store actually uses. The placeholder is an example.com
   * address on purpose, so a misconfigured staging box cannot mail a person.
   */
  const [currentSettings] = await db.select().from(settings).limit(1);
  if (currentSettings && !currentSettings.contactEmail && !currentSettings.contactPhone) {
    await db
      .update(settings)
      .set({ contactEmail: 'store@example.com', contactPhone: '+962 7 9000 0000' })
      .where(eq(settings.id, currentSettings.id));
    console.log('✅ Placeholder contact details set');
  }

  const existingCategory = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, 'general'))
    .limit(1);

  if (!existingCategory.length) {
    const [category] = await db
      .insert(categories)
      .values({ slug: 'general', sortOrder: 1, isActive: true })
      .returning();

    if (category) {
      await db.insert(categoryI18n).values({
        categoryId: category.id,
        locale: 'ar',
        name: 'عام',
        description: 'التصنيف العام',
      });
      console.log('✅ Sample category created');
    }
  }

  // The public homepage does getContentBySlug('home', locale). Without this
  // row a fresh install renders the fallback hero forever.
  const existingHome = await db.select().from(content).where(eq(content.slug, 'home')).limit(1);

  if (!existingHome.length && pageTypeRow) {
    const [home] = await db
      .insert(content)
      .values({
        typeId: pageTypeRow.id,
        slug: 'home',
        authorId: adminId,
        status: 'published',
        publishedAt: new Date(),
      })
      .returning();

    if (home) {
      await db.insert(contentI18n).values([
        {
          contentId: home.id,
          locale: 'ar',
          title: 'الصفحة الرئيسية',
          excerpt: 'نظام إدارة محتوى متقدم',
          // Block array — matches what ContentRenderer expects.
          body: [
            {
              type: 'slider',
              variant: 'main',
              autoplay: true,
              intervalMs: 6000,
              height: 'medium',
              slides: [
                {
                  kind: 'image',
                  src: '/seed/slide-1.png',
                  alt: 'عنبر وعود',
                  eyebrow: 'العطر المميّز',
                  title: 'عنبر وعود',
                  text: 'عطر شرقي دافئ بثبات طويل.',
                  buttonText: 'تسوّق الآن',
                  buttonUrl: '/ar/shop',
                },
                {
                  kind: 'image',
                  src: '/seed/slide-2.png',
                  alt: 'مجموعة جديدة',
                  eyebrow: 'وصل حديثاً',
                  title: 'مجموعة جديدة',
                  text: 'اكتشف الإصدارات الأحدث.',
                },
                {
                  kind: 'image',
                  src: '/seed/slide-3.png',
                  alt: 'توصيل سريع',
                  eyebrow: 'خدماتنا',
                  title: 'توصيل سريع',
                  text: 'خلال يومَي عمل داخل المحافظات المركزية.',
                },
              ],
            },
            { type: 'heading', level: 2, text: 'مرحباً بك' },
            { type: 'paragraph', text: 'هذا محتوى تجريبي يمكنك تعديله من لوحة التحكم.' },
          ],
        },
        {
          contentId: home.id,
          locale: 'en',
          title: 'Home',
          excerpt: 'An advanced content management system',
          body: [
            {
              type: 'slider',
              variant: 'main',
              autoplay: true,
              intervalMs: 6000,
              height: 'medium',
              slides: [
                {
                  kind: 'image',
                  src: '/seed/slide-1.png',
                  alt: 'Amber Oud',
                  eyebrow: 'Signature scent',
                  title: 'Amber Oud',
                  text: 'A warm oriental blend with long wear.',
                  buttonText: 'Shop now',
                  buttonUrl: '/en/shop',
                },
                {
                  kind: 'image',
                  src: '/seed/slide-2.png',
                  alt: 'New arrivals',
                  eyebrow: 'Just landed',
                  title: 'New arrivals',
                  text: 'See the latest releases.',
                },
                {
                  kind: 'image',
                  src: '/seed/slide-3.png',
                  alt: 'Fast delivery',
                  eyebrow: 'What we do',
                  title: 'Fast delivery',
                  text: 'Two working days across the central governorates.',
                },
              ],
            },
            { type: 'heading', level: 2, text: 'Welcome' },
            { type: 'paragraph', text: 'This is placeholder content. Edit it from the admin panel.' },
          ],
        },
      ]);
      console.log('✅ Home page created (ar + en)');
    }
  }

  /**
   * A second published page. The public-site specs read it, and more
   * importantly a CMS seeded with exactly one page gives no way to see how a
   * list of pages, a nav link or a slug route behaves.
   */
  const existingAbout = await db
    .select()
    .from(content)
    .where(eq(content.slug, 'about-us'))
    .limit(1);

  if (!existingAbout.length && pageTypeRow) {
    const [about] = await db
      .insert(content)
      .values({
        typeId: pageTypeRow.id,
        slug: 'about-us',
        authorId: adminId,
        status: 'published',
        publishedAt: new Date(),
      })
      .returning();

    if (about) {
      await db.insert(contentI18n).values([
        {
          contentId: about.id,
          locale: 'ar',
          title: 'من نحن',
          excerpt: 'تعرّف على القصة خلف نيو إيون.',
          body: [
            // First block, so it sits directly under the page title and above
            // the prose. The page's own <header> renders the title, and blocks
            // start below it — putting the slider first is what places it
            // between the two.
            //
            // The inner-page placement: images only, two slides. Seeded so the
            // difference between the two variants is visible without building
            // one by hand.
            {
              type: 'slider',
              variant: 'inner',
              autoplay: true,
              intervalMs: 7000,
              height: 'short',
              slides: [
                { kind: 'image', src: '/seed/slide-2.png', alt: 'ورشة العمل', title: 'ورشة العمل' },
                { kind: 'image', src: '/seed/slide-3.png', alt: 'الفريق', title: 'الفريق' },
              ],
            },
            { type: 'heading', level: 2, text: 'قصتنا' },
            { type: 'paragraph', text: 'نبني أدوات محتوى وتجارة تعمل بالعربية أولاً.' },
          ],
        },
        {
          contentId: about.id,
          locale: 'en',
          title: 'About us',
          excerpt: 'The story behind New Aeon.',
          body: [
            {
              type: 'slider',
              variant: 'inner',
              autoplay: true,
              intervalMs: 7000,
              height: 'short',
              slides: [
                { kind: 'image', src: '/seed/slide-2.png', alt: 'The workshop', title: 'The workshop' },
                { kind: 'image', src: '/seed/slide-3.png', alt: 'The team', title: 'The team' },
              ],
            },
            { type: 'heading', level: 2, text: 'Our story' },
            { type: 'paragraph', text: 'We build content and commerce tools that work in Arabic first.' },
          ],
        },
      ]);
      console.log('✅ About page created (ar + en)');
    }
  }

  /**
   * Deliberately left untranslated. tags.name is a reference name that renders
   * when a locale has no tag_i18n row, and a seed where every tag is fully
   * translated would never exercise that fallback.
   */
  const existingTag = await db.select().from(tags).where(eq(tags.slug, 'announcements')).limit(1);
  if (!existingTag.length) {
    await db.insert(tags).values({ slug: 'announcements', name: 'Announcements' });
    console.log('✅ Sample tag created (untranslated, exercises the name fallback)');
  }

  /**
   * Commerce fixtures.
   *
   * These were missing, which made the browser suite unrunnable from a clean
   * database: e2e/global-setup.ts refuses to start without an active shipping
   * zone covering "amman", and e2e/fixtures.ts points every commerce spec at a
   * product slug that nothing created. The error message even said "Run
   * npm run db:seed" — the command that did not create them.
   *
   * A shop with no catalogue is also a poor thing to develop against: /shop
   * renders empty, so nothing about the storefront can be judged.
   *
   * Prices are in MINOR units (see lib/money.ts). Seed currency is JOD, whose
   * minor unit is fils, so 129000 is 129.000 JOD.
   */
  const [generalCategory] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, 'general'))
    .limit(1);

  const existingZone = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.name, 'Central'))
    .limit(1);

  if (!existingZone.length) {
    await db.insert(shippingZones).values({
      name: 'Central',
      // Checkout refuses a governorate no active zone covers, and the browser
      // suite selects "amman", so that value has to be in here verbatim.
      governorates: ['amman', 'zarqa', 'balqa', 'madaba'],
      flatRate: 3000,
      freeOver: 100000,
      etaDays: 2,
      isActive: true,
      sortOrder: 1,
    });
    console.log('✅ Shipping zone created (amman, zarqa, balqa, madaba)');
  }

  const existingProduct = await db
    .select()
    .from(products)
    .where(eq(products.slug, 'amber-oud'))
    .limit(1);

  if (!existingProduct.length) {
    const [brand] = await db
      .insert(brands)
      .values({ slug: 'aeon-atelier', name: 'Aeon Atelier', isActive: true, sortOrder: 1 })
      .onConflictDoNothing()
      .returning();

    const [product] = await db
      .insert(products)
      .values({
        slug: 'amber-oud',
        brandId: brand?.id,
        categoryId: generalCategory?.id,
        basePrice: 129000,
        isActive: true,
        sortOrder: 1,
      })
      .returning();

    if (product) {
      // Both locales, so /ar/shop is not an empty grid on a site whose default
      // locale is Arabic. The specs pin `en` for stable assertions.
      await db.insert(productI18n).values([
        {
          productId: product.id,
          locale: 'ar',
          name: 'عنبر وعود',
          shortDesc: 'عطر شرقي دافئ بالعنبر والعود.',
          description: 'عطر شرقي دافئ يجمع العنبر والعود، بثبات طويل.',
        },
        {
          productId: product.id,
          locale: 'en',
          name: 'Amber Oud',
          shortDesc: 'A warm oriental blend of amber and oud.',
          description: 'A warm oriental fragrance built on amber and oud, with long wear.',
        },
      ]);

      const [sizeOption] = await db
        .insert(productOptions)
        .values({ productId: product.id, name: 'Size', position: 0 })
        .returning();

      // Two variants so the option picker on the product page has something to
      // pick, which is what the add-to-cart spec drives.
      const variantRows = await db
        .insert(productVariants)
        .values([
          { productId: product.id, sku: 'AMBER-OUD-50', price: 129000, stock: 50, weightGrams: 220 },
          { productId: product.id, sku: 'AMBER-OUD-100', price: 199000, stock: 50, weightGrams: 350 },
        ])
        .returning();

      if (sizeOption) {
        await db.insert(variantOptionValues).values(
          variantRows.map((variant) => ({
            variantId: variant.id,
            optionId: sizeOption.id,
            value: variant.sku.endsWith('-50') ? '50ml' : '100ml',
          }))
        );
      }

      console.log('✅ Sample product created: amber-oud (2 variants, ar + en)');
    }
  }

  /**
   * Keyed on the image rather than the product, so a database seeded before
   * this existed picks it up too. Every block above guards on "does the parent
   * row exist", which silently skips anything added to an existing branch
   * later — this one has to stand on its own.
   *
   * A committed placeholder under public/seed, NOT public/uploads: that
   * directory is gitignored user content, so anything referenced from there is
   * missing on every other machine. The shop grid renders it through
   * next/image, which is also what proves the optimiser is wired up.
   */
  const [seededProduct] = await db
    .select()
    .from(products)
    .where(eq(products.slug, 'amber-oud'))
    .limit(1);

  if (seededProduct) {
    const existingImages = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, seededProduct.id))
      .limit(1);

    if (!existingImages.length) {
      await db.insert(productImages).values({
        productId: seededProduct.id,
        url: '/seed/amber-oud.png',
        alt: 'Amber Oud',
        sortOrder: 0,
      });
      console.log('✅ Product image attached: /seed/amber-oud.png');
    }
  }

  console.log('✅ Seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
