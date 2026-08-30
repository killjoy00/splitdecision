import { expect, test } from '@playwright/test';

test('mobile setup exposes options and full card rules through the split', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Split Decision' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One case. Six rounds. Two contests.' })).toBeVisible();
  await expect(page.getByText('Compare each side’s lower firm score.')).toBeVisible();

  const rules = page.locator('#rules-reference');
  await rules.locator('summary').click();
  await expect(rules).toHaveAttribute('open', '');
  await expect(rules.getByRole('heading', { name: 'Your partner is part of your score.' })).toBeVisible();
  await expect(rules.getByText('min(Firm 1, Firm 2)')).toBeVisible();
  await expect(rules.getByText('More Joint Work wins a tied Hearing.', { exact: false })).toBeVisible();

  const seed = page.getByLabel('Case seed').first();
  const originalSeed = await seed.inputValue();
  await page.getByRole('button', { name: 'Randomize seed' }).first().click();
  await expect(seed).not.toHaveValue(originalSeed);

  await page.getByLabel('Use Specialties').first().uncheck();
  await page.getByLabel('Bot pace').selectOption('step');
  await page.getByRole('button', { name: 'Call the case' }).click();

  await page.getByRole('button', { name: /^I am / }).click();
  const splitRules = page.locator('.docket-choice-rules');
  await expect(splitRules).toHaveCount(6);
  for (const rule of await splitRules.all()) await expect(rule).not.toBeEmpty();

  const firstSplitCards = page.locator('.docket-choice');
  await firstSplitCards.nth(0).click();
  await firstSplitCards.nth(1).click();
  await firstSplitCards.nth(2).click();
  await page.getByRole('button', { name: 'Lock the split' }).click();

  await page.getByRole('button', { name: /^I am / }).click();
  const secondSplitCards = page.locator('.docket-choice');
  await secondSplitCards.nth(0).click();
  await secondSplitCards.nth(1).click();
  await secondSplitCards.nth(2).click();
  await page.getByRole('button', { name: 'Lock the split' }).click();

  await page.getByRole('button', { name: /^I am / }).click();
  const briefRules = page.locator('.brief-card-list small');
  await expect(briefRules).toHaveCount(6);
  for (const rule of await briefRules.all()) await expect(rule).not.toBeEmpty();
});
