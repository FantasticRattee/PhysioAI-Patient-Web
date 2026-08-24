import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const appRoot = path.resolve(__dirname, '../..');
const modelRoot = path.resolve(appRoot, '../../models/AI_Models/NN_ExerciseClassifier/experiments/sit_to_stand_pose_only_v1');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('Sit-to-Stand PWA asset provenance', () => {
  test('pins the browser mirror to the model-owned PWA contract and exact Float32 export', () => {
    const appAssetRoot = path.join(appRoot, 'Patient', 'assets', 'models', 'sit_to_stand');
    const appManifest = readJson(path.join(appAssetRoot, 'sit_to_stand_pwa_v7_3_3.manifest.json'));
    const modelContract = readJson(path.join(modelRoot, 'integration_bundle', 'contracts', 'sit_to_stand_phasenet_v1_pwa.contract.json'));
    const modelManifest = readJson(path.join(modelRoot, 'integration_bundle', 'manifests', 'sit_to_stand_phasenet_v1_pwa_v7_3_3.manifest.json'));

    expect(appManifest).toMatchObject({
      schema: 'physioai.app_v7_3_3.sit_to_stand_pwa_assets.v1',
      status: 'experimental_local_pwa_only',
      appIntegrationAuthorized: false,
      patientFacingApproved: false,
    });
    expect(modelContract).toMatchObject({
      schema: 'physioai.sit_to_stand.phasenet_v1.pwa_contract.v1',
      trackingProfile: 'pose_only',
      repetitionAuthority: 'parallel_geometry_counter',
      phaseNetAuthority: 'phase_comment_context_only',
    });
    expect(modelManifest.appMirror).toMatchObject({
      path: 'App/App-V5/Patient/assets/models/sit_to_stand',
      appIntegrationAuthorized: false,
    });

    for (const asset of appManifest.weights) {
      const appAsset = path.join(appAssetRoot, asset.file);
      const sourceAsset = path.join(modelRoot, 'integration_bundle', 'artifacts', 'weights', asset.file);
      expect(fs.existsSync(appAsset)).toBe(true);
      expect(sha256(appAsset)).toBe(asset.sha256);
      expect(sha256(appAsset)).toBe(sha256(sourceAsset));
    }
    const profile = path.join(appAssetRoot, appManifest.referenceProfile.file);
    expect(sha256(profile)).toBe(appManifest.referenceProfile.sha256);
  });
});
