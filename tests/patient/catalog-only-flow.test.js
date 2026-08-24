import fs from 'fs';
import path from 'path';

const appRoot = path.resolve(__dirname, '../..');
const source = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

describe('catalog-only patient care flow', () => {
  test('practice sessions do not load or apply stored therapist references', () => {
    const hook = source('Patient', 'src', 'pose', 'usePractice.js');

    expect(hook).not.toContain('getReference');
    expect(hook).not.toContain('getAllReferences');
    expect(hook).toContain('reference: null, allRefs: {}');
  });

  test('the practice ready screen presents catalog targets only', () => {
    const screen = source('Patient', 'src', 'screens', 'PracticeScreen.js');

    expect(screen).not.toContain('getReference');
    expect(screen).not.toContain("t('referencePose')");
  });
});
