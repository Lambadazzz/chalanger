import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', port: 4173, reuseExistingServer: false },
  reporter: 'list'
});
