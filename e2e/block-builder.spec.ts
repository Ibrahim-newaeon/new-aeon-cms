// e2e/block-builder.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { ADMIN_PATH } from './fixtures';

/**
 * The section builder: reordering, nesting, and the one bug that only shows up
 * when a wholesale replacement keeps the block count the same.
 *
 * Nothing here is saved. Every assertion is about editor state inside the form,
 * so the specs use the `new` page and never submit — which also means they
 * leave no rows to clean up.
 */

/**
 * The block types of each row, in order.
 *
 * Read from data-block-type rather than the visible header, which is
 * translated — the admin panel defaults to Arabic, so asserting on "Heading"
 * would pass or fail on the session's language rather than on the ordering
 * this spec is about.
 */
async function sectionTypes(page: Page, scope = 'block'): Promise<string[]> {
  return page
    .locator(`[data-test-id="${scope}-builder"] > ul > li`)
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-block-type') ?? ''));
}

async function addSection(page: Page, type: string, scope = 'block') {
  await page.getByTestId(`${scope}-add`).click();
  await page.getByTestId(`${scope}-add-${type}`).click();
}

test.describe('block builder', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${ADMIN_PATH}/content/pages/new`);
    await expect(page.getByTestId('page-form')).toBeVisible();
  });

  test('a section can be dragged to a new position with the keyboard', async ({ page }) => {
    for (const type of ['heading', 'image', 'quote']) await addSection(page, type);
    expect(await sectionTypes(page)).toEqual(['heading', 'image', 'quote']);

    // Adding a section expands it, which pushes the first row out of view.
    // dnd-kit's keyboard coordinate getter measures live layout, so the rows it
    // is moving between have to be on screen.
    await page.getByTestId('block-toggle-2').click();
    const handle = page.getByTestId('block-drag-0');
    await handle.scrollIntoViewIfNeeded();

    // The keyboard path is the one worth pinning: it is what a screen-reader
    // user gets, and unlike a synthetic mouse drag it does not depend on
    // pixel geometry, so it will not flake when the layout shifts.
    await handle.focus();
    await page.keyboard.press('Space');

    // dnd-kit marks the handle pressed once the pick-up registers. Waiting for
    // that rather than sleeping: sent back-to-back, the arrow key arrives
    // before the drag exists and is discarded, which made this spec fail while
    // the feature worked.
    await expect(handle).toHaveAttribute('aria-pressed', 'true');

    // Same again for the move. dnd-kit announces the new drop target into its
    // live region as it processes the arrow key, so waiting for that text to
    // change is a real signal that the key landed — the drop would otherwise
    // commit the position the item started in.
    const live = page.locator('[role="status"]').first();
    const onPickUp = await live.innerText();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => live.innerText()).not.toBe(onPickUp);

    await page.keyboard.press('Space');

    await expect.poll(() => sectionTypes(page)).toEqual(['image', 'heading', 'quote']);
  });

  test('the drag handle is a tab stop at the top level but not inside a nested list', async ({
    page,
  }) => {
    await addSection(page, 'accordion');
    await page.getByTestId('block-0-add-item').click();
    await addSection(page, 'paragraph', 'block-0-0');

    // Nested keyboard drag never activates — the outer DndContext takes the key
    // first — so the nested handle must not be a tab stop that does nothing.
    // Pointer drag still works there; up/down cover the keyboard at any depth.
    await expect(page.getByTestId('block-drag-0')).toHaveAttribute('tabindex', '0');
    await expect(page.getByTestId('block-0-0-drag-0')).toHaveAttribute('tabindex', '-1');
  });

  test('nested and outer sections do not share a test id', async ({ page }) => {
    await addSection(page, 'accordion');
    await page.getByTestId('block-0-add-item').click();
    await addSection(page, 'paragraph', 'block-0-0');

    // Both lists have a first row. Before the ids were scoped per depth, both
    // emitted `block-drag-0` and a selector could match either one.
    await expect(page.getByTestId('block-drag-0')).toHaveCount(1);
    await expect(page.getByTestId('block-0-0-drag-0')).toHaveCount(1);
  });

  test('copying sections of the same length replaces the editor contents', async ({ page }) => {
    // The regression. BlockBuilder regenerates its per-block keys only when the
    // block COUNT changes, so an equal-length copy used to leave the old keys
    // in place and TipTap kept rendering the document it already held — the
    // editor showed the text of the locale that was replaced.
    await addSection(page, 'rich-text');
    const arabicEditor = page.locator('.ProseMirror').first();
    await arabicEditor.click();
    await page.keyboard.type('ARABIC-BODY');

    await page.getByTestId('locale-tab-en').click();
    await addSection(page, 'rich-text');
    const englishEditor = page.locator('.ProseMirror').first();
    await englishEditor.click();
    await page.keyboard.type('ENGLISH-BODY');

    // One block on each side: equal length is the condition that hid the bug.
    expect(await sectionTypes(page)).toEqual(['rich-text']);

    page.once('dialog', (d) => d.accept());
    await page.getByTestId('copy-structure-ar').click();

    // The copy remounts the builder, which collapses the section again.
    await page.getByTestId('block-toggle-0').click();
    await expect(page.locator('.ProseMirror').first()).toHaveText('ARABIC-BODY');
  });
});
