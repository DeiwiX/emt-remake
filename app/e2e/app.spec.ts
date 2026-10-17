import { expect, test } from './fixtures';

/** Recorrido por las pantallas principales con los datos incluidos en la app. */

test('inicio: buscar una parada y abrir su detalle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '¿A dónde vas?' })).toBeVisible();
  await page.getByRole('searchbox').fill('postas');
  await page
    .getByRole('link', { name: /Postas/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/stops\/\w+/);
  await expect(page.getByRole('heading', { name: 'Líneas y próximos buses' })).toBeVisible();
});

test('guardar una parada en favoritos y verla en el inicio', async ({ page }) => {
  await page.goto('/stops/152');
  await page.getByRole('button', { name: /Guardar la parada .* en favoritos/ }).click();
  await page.getByRole('link', { name: 'Inicio' }).click();
  await expect(page.getByRole('heading', { name: 'Mis favoritos' })).toBeVisible();
  await expect(page.locator('app-favorite-stop-tile')).toHaveCount(1);
});

test('detalle de línea con sus paradas', async ({ page }) => {
  await page.goto('/lines/1');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Parque del Sur');
  const stops = page.getByRole('list', { name: 'Paradas en orden' });
  await expect(stops.getByRole('link', { name: /^1\. Postas/ })).toBeVisible();
  // El otro sentido cambia la lista.
  await page.getByRole('button', { name: 'Hacia Parque del Sur' }).click();
  await expect(page.getByRole('heading', { name: /Hacia Parque del Sur/ })).toBeVisible();
});

test('cómo llegar entre dos paradas de la misma línea', async ({ page }) => {
  await page.goto('/plan?from=stop:152&to=stop:1209');
  await expect(page.getByText('Recomendada', { exact: true })).toBeVisible();
  await expect(page.getByText('Línea 1', { exact: false }).first()).toBeVisible();
});

test('la barra inferior cambia de pantalla', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Cómo llegar' }).last().click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.getByRole('link', { name: 'Favoritos' }).click();
  await expect(page).toHaveURL(/\/favorites$/);
});

test('ajustes: cambiar el idioma a inglés', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('banner').getByText('Settings')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'High contrast' })).toBeVisible();
});
