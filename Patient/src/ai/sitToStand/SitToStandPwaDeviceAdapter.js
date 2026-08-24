// Browser asset adapter for the experimental Sit-to-Stand PWA module.
//
// The causal TCN remains phase/comment context only.  This adapter only loads
// the exact little-endian Float32 mirror from the model-owned export; the
// geometry tracker remains the sole repetition authority in SitToStandPwaTracker.

import { Image } from 'react-native';
import {
  createSitToStandPhaseNetFromBytes,
} from './SitToStandPhaseNet.js';
import { createSitToStandPwaTracker } from './SitToStandPwaTracker.js';

const REFERENCE_PROFILE = require('../../../assets/models/sit_to_stand/sit_to_stand_front_normal_reference_profile_v1_expanded_development.json');

const BUNDLED_WEIGHT_ASSETS = Object.freeze({
  causal_tcn_dilation_1__0: require('../../../assets/models/sit_to_stand/causal_tcn_dilation_1__0.f32'),
  causal_tcn_dilation_1__1: require('../../../assets/models/sit_to_stand/causal_tcn_dilation_1__1.f32'),
  residual_projection__0: require('../../../assets/models/sit_to_stand/residual_projection__0.f32'),
  residual_projection__1: require('../../../assets/models/sit_to_stand/residual_projection__1.f32'),
  causal_tcn_dilation_2__0: require('../../../assets/models/sit_to_stand/causal_tcn_dilation_2__0.f32'),
  causal_tcn_dilation_2__1: require('../../../assets/models/sit_to_stand/causal_tcn_dilation_2__1.f32'),
  causal_tcn_dilation_4__0: require('../../../assets/models/sit_to_stand/causal_tcn_dilation_4__0.f32'),
  causal_tcn_dilation_4__1: require('../../../assets/models/sit_to_stand/causal_tcn_dilation_4__1.f32'),
  phase_probabilities__0: require('../../../assets/models/sit_to_stand/phase_probabilities__0.f32'),
  phase_probabilities__1: require('../../../assets/models/sit_to_stand/phase_probabilities__1.f32'),
});

let runtimePromise = null;

async function loadBundledRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const entries = await Promise.all(Object.entries(BUNDLED_WEIGHT_ASSETS).map(async ([key, asset]) => {
        const resolved = Image.resolveAssetSource(asset);
        if (!resolved?.uri) throw new Error(`Sit-to-Stand weight asset URI is unavailable: ${key}`);
        const response = await fetch(resolved.uri);
        if (!response.ok) throw new Error(`Sit-to-Stand weight request failed for ${key}: ${response.status}`);
        return [key, await response.arrayBuffer()];
      }));
      return createSitToStandPhaseNetFromBytes(Object.fromEntries(entries));
    })();
  }
  return runtimePromise;
}

export function preloadSitToStandPwaPhaseNet() {
  return loadBundledRuntime();
}

// The wrapper provides an honest transition while assets load.  It never
// invents phase probabilities or a comment; the phase/comment path will move
// from `model_loading` to real inference once the exact assets are ready.
export function createBundledSitToStandPhaseNetAdapter() {
  let runtime = null;
  let loadError = null;
  loadBundledRuntime().then((loaded) => { runtime = loaded; }).catch((error) => { loadError = error; });
  return {
    predict(window) {
      if (runtime) return runtime.predict(window);
      return {
        status: loadError ? 'model_unavailable' : 'model_loading',
        phase: null,
        probabilities: null,
        reason: loadError ? 'phase_net_asset_load_failed' : 'phase_net_asset_loading',
      };
    },
    get status() { return loadError ? 'model_unavailable' : runtime ? 'ready' : 'model_loading'; },
    get error() { return loadError ? String(loadError.message || loadError) : null; },
  };
}

export function createBundledSitToStandPwaTracker() {
  return createSitToStandPwaTracker({
    phaseNet: createBundledSitToStandPhaseNetAdapter(),
    referenceProfile: REFERENCE_PROFILE,
  });
}
