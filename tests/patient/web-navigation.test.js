import fs from 'fs';
import path from 'path';

const appRoot = path.resolve(__dirname, '../..');
const source = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

describe('Patient web navigation and PWA shell', () => {
  test('shared BackButton uses stack history with a safe direct-URL fallback', () => {
    const back = source('Patient', 'src', 'components', 'BackButton.js');

    expect(back).toContain('navigation?.canGoBack?.()');
    expect(back).toContain('navigation.goBack()');
    expect(back).toContain("navigation.replace(fallback)");
    expect(back).toContain('minHeight: 44');
  });

  test('web navigation is mapped to browser history', () => {
    const app = source('Patient', 'App.js');

    expect(app).toContain('const webLinking');
    expect(app).toContain("Login: 'login'");
    expect(app).toContain("Register: 'register'");
    expect(app).toContain('linking={Platform.OS === \'web\' ? webLinking : undefined}');
  });

  test('patient flows expose the shared back affordance', () => {
    const home = source('Patient', 'src', 'screens', 'HomeScreen.js');
    const login = source('Patient', 'src', 'screens', 'LoginScreen.js');
    const register = source('Patient', 'src', 'screens', 'RegisterScreen.js');
    const practice = source('Patient', 'src', 'screens', 'PracticeScreen.js');

    expect(home).toContain('<BackButton navigation={navigation} />');
    expect(login).toContain('<BackButton navigation={navigation} />');
    expect(register).toContain('<BackButton navigation={navigation} />');
    expect(practice).toContain('<BackButton onPress={onBack} />');
    expect(practice).toContain('<BackButton onPress={onExit} variant="glass"');
    expect(practice).toMatch(/<BackButton[\s\S]*?onPress=\{onExit\}[\s\S]*?variant="ghost"/);
  });

  test('web template is mobile/PWA-ready without claiming offline inference', () => {
    const html = source('Patient', 'public', 'index.html');
    const manifest = JSON.parse(source('Patient', 'public', 'manifest.webmanifest'));
    const config = JSON.parse(source('Patient', 'app.json')).expo;

    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('manifest.webmanifest');
    expect(html).toContain('apple-touch-icon.png');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(manifest).toMatchObject({
      name: 'PhysioAI Patient',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '.',
    });
    expect(manifest.icons[0].src).toBe('./icon.svg');
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: './apple-touch-icon.png', type: 'image/png' }),
    ]));
    expect(config.web).toMatchObject({ output: 'single', shortName: 'PhysioAI' });
  });

  test('phone content has a bounded readable width on wider browser windows', () => {
    const home = source('Patient', 'src', 'screens', 'HomeScreen.js');
    const login = source('Patient', 'src', 'screens', 'LoginScreen.js');
    const practice = source('Patient', 'src', 'screens', 'PracticeScreen.js');

    expect(home).toContain("maxWidth: 560");
    expect(login).toContain("maxWidth: 480");
    expect(practice).toContain("maxWidth: 560");
  });
});
