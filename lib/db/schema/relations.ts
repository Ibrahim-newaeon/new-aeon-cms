// lib/db/schema/relations.ts
import { relations } from 'drizzle-orm';
import { users, refreshTokens } from './auth';
import {
  contentTypes,
  content,
  contentI18n,
  contentTags,
  categories,
  categoryI18n,
  tags,
  tagI18n,
} from './content';
import { mediaFolders, mediaAssets } from './media';
import {
  products,
  productVariants,
  productImages,
  productOptions,
  productSpecs,
  productCategories,
  productI18n,
  brands,
  orders,
  orderItems,
} from './commerce';

export const usersRelations = relations(users, ({ many }) => ({
  content: many(content),
  refreshTokens: many(refreshTokens),
}));

export const contentTypesRelations = relations(contentTypes, ({ many }) => ({
  content: many(content),
}));

export const contentRelations = relations(content, ({ one, many }) => ({
  type: one(contentTypes, { fields: [content.typeId], references: [contentTypes.id] }),
  author: one(users, { fields: [content.authorId], references: [users.id] }),
  i18n: many(contentI18n),
  tags: many(contentTags),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  children: many(categories),
  i18n: many(categoryI18n),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  content: many(contentTags),
  i18n: many(tagI18n),
}));

export const tagI18nRelations = relations(tagI18n, ({ one }) => ({
  tag: one(tags, { fields: [tagI18n.tagId], references: [tags.id] }),
}));

export const mediaFoldersRelations = relations(mediaFolders, ({ one, many }) => ({
  parent: one(mediaFolders, { fields: [mediaFolders.parentId], references: [mediaFolders.id] }),
  children: many(mediaFolders),
  assets: many(mediaAssets),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  categories: many(productCategories),
  i18n: many(productI18n),
  variants: many(productVariants),
  images: many(productImages),
  specs: many(productSpecs),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  images: many(productImages),
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
}));
