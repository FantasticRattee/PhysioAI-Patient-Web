import fs from 'fs';
import path from 'path';
import { getCatalog, getExercise } from '../../Patient/src/core/exercises.js';

const appRoot = path.resolve(__dirname, '../..');
const source = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), 'utf8');

describe('App V7.3.3 combined Patient PWA experiment', () => {
  test('exposes independent Bottle Grab and Sit-to-Stand experimental modules', () => {
    expect(getCatalog().map((exercise) => exercise.id)).toEqual([
      'bottle_grab',
      'sit_to_stand',
    ]);
    expect(getExercise('sit_to_stand')).toMatchObject({
      trackingProfile: 'pose_only',
      experimentalOnly: true,
      counterAuthority: 'parallel_geometry_counter',
    });
  });

  test('keeps exercise-specific browser cameras and tracker setup isolated', () => {
    const screen = source('Patient', 'src', 'screens', 'PracticeScreen.js');
    const hook = source('Patient', 'src', 'pose', 'usePractice.js');
    const home = source('Patient', 'src', 'screens', 'HomeScreen.js');

    expect(screen).toContain("require('../pose/SitToStandCamera.web.js')");
    expect(screen).toContain('Bottle Detector Diagnostics');
    expect(hook).toContain('createBundledSitToStandPwaTracker');
    expect(hook).toContain('createBottleGrabV7PwaTracker');
    expect(home).toContain('experimentalOnly');
    expect(home).toContain('Experimental');
  });

  test('declares a Railway build that exports the production PWA', () => {
    const rootPackage = JSON.parse(source('package.json'));
    const patientPackage = JSON.parse(source('Patient', 'package.json'));
    const railway = JSON.parse(source('railway.json'));

    expect(patientPackage.scripts['export:web']).toContain('expo export --platform web --output-dir dist');
    expect(rootPackage.scripts.build).toContain('Patient run export:web');
    expect(railway.build.buildCommand).toBe('npm run build');
  });
});
