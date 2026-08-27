// scripts/seed.ts
// Run with: npm run db:seed  ->  tsx scripts/seed.ts
// NOTE: relative imports, not '@/...'. tsx does NOT resolve tsconfig `paths`
// by default, so the alias form fails with "Cannot find module '@/lib/db'".
import { db } from '../lib/db';
import { users, settings, categories, categoryI18n, contentTypes, content, contentI18n } from '../lib/db/schema';
import { hashPassword } from '../lib/auth/password';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('🌱 Seeding database...');

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
            { type: 'heading', level: 2, text: 'Welcome' },
            { type: 'paragraph', text: 'This is placeholder content. Edit it from the admin panel.' },
          ],
        },
      ]);
      console.log('✅ Home page created (ar + en)');
    }
  }

  console.log('✅ Seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
