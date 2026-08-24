const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const rootPackage = require('../../package.json');

const tempPwaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'physioai-pwa-static-'));
fs.writeFileSync(path.join(tempPwaDir, 'index.html'), '<!doctype html><title>PhysioAI Patient PWA V7.3.3</title>');
fs.writeFileSync(path.join(tempPwaDir, 'manifest.webmanifest'), '{"name":"PhysioAI Patient PWA V7.3.3"}');
process.env.PATIENT_WEB_DIR = tempPwaDir;

const app = require('../../backend/server');

describe('Patient PWA static hosting', () => {
  afterAll(async () => {
    await app.prisma.$disconnect();
  });

  test('serves the built PWA at root and supports a browser-history route', async () => {
    const root = await request(app).get('/').set('Accept', 'text/html');
    const historyRoute = await request(app).get('/practice').set('Accept', 'text/html');

    expect(root.status).toBe(200);
    expect(root.text).toContain('PhysioAI Patient PWA V7.3.3');
    expect(historyRoute.status).toBe(200);
    expect(historyRoute.text).toContain('PhysioAI Patient PWA V7.3.3');
  });

  test('serves the PWA manifest without intercepting the API health route', async () => {
    const manifest = await request(app).get('/manifest.webmanifest');
    const health = await request(app).get('/health');

    expect(manifest.status).toBe(200);
    expect(manifest.text).toContain('PhysioAI Patient PWA V7.3.3');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');
  });

  test('declares a Node version compatible with the Expo web export', () => {
    expect(rootPackage.engines.node).toBe('>=20.19.4');
  });
});
