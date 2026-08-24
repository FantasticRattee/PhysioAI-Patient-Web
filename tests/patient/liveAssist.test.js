import {
  acknowledgeLiveAssist,
  buildLiveAssistAckPath,
  buildLiveAssistPath,
  correctionMatchesExercise,
  correctionSymbol,
  createLiveAssistPoller,
  isLiveAssistEventExpired,
  patientCueText,
  selectActiveTherapistCue,
} from '../../Patient/src/core/liveAssist.js';

describe('Patient live assist', () => {
  it('chooses the Patient language and never reads Therapist-only fields', () => {
    const event = {
      id: 'evt_1',
      cue: { th: 'เหยียดศอกขวาให้ตรง', en: 'Straighten your right elbow.' },
      clinicalNote: 'private',
    };
    expect(patientCueText(event, 'th')).toBe('เหยียดศอกขวาให้ตรง');
    expect(patientCueText(event, 'en')).toBe('Straighten your right elbow.');
    expect(patientCueText({ cue: { en: 'English fallback' } }, 'th')).toBe('English fallback');
  });

  it('maps a structured correction to a visual-only symbol without using score data', () => {
    expect(correctionSymbol({ correction: 'increase_angle' })).toBe('↑');
    expect(correctionSymbol({ correction: 'decrease_angle' })).toBe('↓');
    expect(correctionSymbol({ correction: 'straighten' })).toBe('↗');
    expect(correctionSymbol({ correction: 'hold' })).toBe('✓');
    expect(correctionSymbol({ correction: 'reset' })).toBe('↺');
    expect(correctionSymbol({ correction: 'unknown' })).toBe('•');
  });

  it('keeps camera safety guidance ahead of a Therapist correction', () => {
    const cue = { id: 'evt_1', text: 'Straighten your right elbow.' };
    expect(selectActiveTherapistCue(true, cue)).toBeNull();
    expect(selectActiveTherapistCue(false, cue)).toBe(cue);
  });

  it('accepts generic corrections and rejects a correction for another exercise', () => {
    expect(correctionMatchesExercise({ exerciseId: null }, 'shoulder')).toBe(true);
    expect(correctionMatchesExercise({ exerciseId: 'shoulder' }, 'shoulder')).toBe(true);
    expect(correctionMatchesExercise({ exerciseId: 'knee' }, 'shoulder')).toBe(false);
  });

  it('does not present a queued correction after its server TTL', () => {
    expect(isLiveAssistEventExpired({ expiresAt: 1000 }, 1000)).toBe(true);
    expect(isLiveAssistEventExpired({ expiresAt: 1001 }, 1000)).toBe(false);
    expect(isLiveAssistEventExpired({}, 1000)).toBe(false);
  });

  it('builds an encoded cursor query without accepting a patient id', () => {
    expect(buildLiveAssistPath('')).toBe('/live-assist/corrections');
    expect(buildLiveAssistPath('172:evt/1')).toBe('/live-assist/corrections?after=172%3Aevt%2F1');
    expect(buildLiveAssistAckPath('evt/1')).toBe('/live-assist/corrections/evt%2F1/ack');
  });

  it('acknowledges a delivered event through the injected API client', async () => {
    const post = jest.fn(async () => ({ ok: true }));
    await expect(acknowledgeLiveAssist('evt/1', post)).resolves.toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith('/live-assist/corrections/evt%2F1/ack');
  });

  it('emits each correction exactly once and advances the cursor', async () => {
    const fetchBatch = jest.fn()
      .mockResolvedValueOnce({
        items: [{ id: 'evt_1' }, { id: 'evt_1' }, { id: 'evt_2' }],
        cursor: '200:evt_2',
      })
      .mockResolvedValueOnce({ items: [{ id: 'evt_2' }, { id: 'evt_3' }], cursor: '300:evt_3' });
    const onCorrection = jest.fn();
    const poller = createLiveAssistPoller({ fetchBatch, onCorrection });

    await poller.pollNow();
    await poller.pollNow();

    expect(fetchBatch.mock.calls).toEqual([[''], ['200:evt_2']]);
    expect(onCorrection.mock.calls.map(([event]) => event.id)).toEqual(['evt_1', 'evt_2', 'evt_3']);
    expect(poller.getCursor()).toBe('300:evt_3');
  });

  it('prevents overlapping polls and stops permanently after cleanup', async () => {
    let resolveFetch;
    const fetchBatch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    const onCorrection = jest.fn();
    const poller = createLiveAssistPoller({ fetchBatch, onCorrection });

    const first = poller.pollNow();
    const overlapping = poller.pollNow();
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    await expect(overlapping).resolves.toBe(false);

    resolveFetch({ items: [{ id: 'evt_1' }], cursor: '100:evt_1' });
    await first;
    poller.stop();

    await expect(poller.pollNow()).resolves.toBe(false);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(onCorrection).toHaveBeenCalledTimes(1);
  });
});
