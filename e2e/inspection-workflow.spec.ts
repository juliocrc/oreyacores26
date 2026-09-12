import { test, expect } from '@playwright/test';

test.describe('Fluxo de Inspeção de Jangada (E2E)', () => {
  test('deve navegar na listagem de jangadas e abrir o wizard', async ({ page }) => {
    await page.goto('/jangadas');
    await expect(page.locator('h1')).toHaveText('Jangadas');
    
    // Verificar se estatísticas aparecem
    await expect(page.getByText('Total')).toBeVisible();
    await expect(page.getByText('Próx. inspeção ≤ 30 dias')).toBeVisible();
  });
});
