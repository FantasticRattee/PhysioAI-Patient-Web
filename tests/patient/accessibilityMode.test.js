import {
  PRESENTATION_MODE,
  normalizePresentationMode,
  shouldSpeak,
  getSpokenFeedback,
  getVisualGuidance,
} from '../../Patient/src/core/accessibilityMode.js';

const cue = { id: 'right_shoulder:inc', text: 'Raise your right arm higher', tone: 'warn' };

const offShoulder = (live, ref = 120) => ({
  cue,
  gate: { ok: true },
  comparison: {
    primary: {
      joint: 'right_shoulder',
      label: 'Right shoulder',
      labelTh: 'ไหล่ขวา',
      live,
      ref,
      delta: Math.abs(ref - live),
      status: 'bad',
    },
  },
});

describe('accessibility presentation modes', () => {
  it('keeps presentation separate from a live or demo session source', () => {
    expect(normalizePresentationMode('audio')).toBe(PRESENTATION_MODE.AUDIO);
    expect(normalizePresentationMode('visual')).toBe(PRESENTATION_MODE.VISUAL);
    expect(normalizePresentationMode('standard')).toBe(PRESENTATION_MODE.STANDARD);
    expect(normalizePresentationMode('live')).toBe(PRESENTATION_MODE.STANDARD);
    expect(normalizePresentationMode()).toBe(PRESENTATION_MODE.STANDARD);
  });

  it('forces speech for Audio-Only, mutes Visual-Only, and preserves the standard setting', () => {
    expect(shouldSpeak(PRESENTATION_MODE.AUDIO, false)).toBe(true);
    expect(shouldSpeak(PRESENTATION_MODE.VISUAL, true)).toBe(false);
    expect(shouldSpeak(PRESENTATION_MODE.STANDARD, true)).toBe(true);
    expect(shouldSpeak(PRESENTATION_MODE.STANDARD, false)).toBe(false);
  });

  it('uses the blocking gate hint before a form cue for Audio-Only', () => {
    const snapshot = {
      ...offShoulder(80),
      gate: { ok: false, hint: 'Move inside the frame', hintTh: 'ขยับตัวให้อยู่ในกรอบ' },
    };
    expect(getSpokenFeedback(snapshot, PRESENTATION_MODE.AUDIO, 'th')).toEqual({
      id: 'gate:ขยับตัวให้อยู่ในกรอบ',
      text: 'ขยับตัวให้อยู่ในกรอบ',
    });
    expect(getSpokenFeedback(snapshot, PRESENTATION_MODE.STANDARD, 'en')).toEqual(cue);
    expect(getSpokenFeedback(snapshot, PRESENTATION_MODE.VISUAL, 'en')).toBeNull();
  });
});

describe('Visual-Only arrow guidance', () => {
  it('points up when a live angle needs to increase toward its reference', () => {
    expect(getVisualGuidance(offShoulder(80), 'en')).toMatchObject({
      state: 'adjust', arrow: '↑', direction: 'increase', joint: 'right_shoulder', label: 'Right shoulder', delta: 40,
    });
  });

  it('points down when a live angle needs to decrease toward its reference', () => {
    expect(getVisualGuidance(offShoulder(150), 'th')).toMatchObject({
      state: 'adjust', arrow: '↓', direction: 'decrease', joint: 'right_shoulder', label: 'ไหล่ขวา', delta: 30,
    });
  });

  it('prioritizes a framing instruction and gives it a non-directional arrow', () => {
    const snapshot = {
      ...offShoulder(80),
      gate: { ok: false, hint: 'Move inside the frame', hintTh: 'ขยับตัวให้อยู่ในกรอบ' },
    };
    expect(getVisualGuidance(snapshot, 'en')).toMatchObject({
      state: 'reframe', arrow: '↔', direction: 'reframe', text: 'Move inside the frame',
    });
  });

  it('shows a check when the tracked joint is already within tolerance', () => {
    const snapshot = {
      ...offShoulder(118),
      comparison: {
        primary: { ...offShoulder(118).comparison.primary, delta: 2, status: 'ok' },
      },
    };
    expect(getVisualGuidance(snapshot, 'en')).toMatchObject({
      state: 'hold', arrow: '✓', direction: 'hold', text: cue.text,
    });
  });
});
