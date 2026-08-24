let Speech;
let tts;

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
  Speech = require('expo-speech');
  jest.spyOn(Speech, 'speak');
  jest.spyOn(Speech, 'stop');
  tts = require('../../Patient/src/core/tts.js').tts;
  tts.cancel();
  Speech.speak.mockClear();
  Speech.stop.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('Therapist-priority TTS', () => {
  it('speaks the Therapist correction immediately and blocks normal AI speech during the priority window', () => {
    expect(tts.speakPriority('Straighten your right elbow.', 'en', 5000)).toBe(true);
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    expect(Speech.speak.mock.calls[0][1]).toMatchObject({
      useApplicationAudioSession: false,
    });

    jest.advanceTimersByTime(1000);
    expect(tts.speakNow('AI cue', 'en')).toBe(false);
    tts.say('ai:cue', 'AI cue', 'en', 0);
    expect(Speech.speak).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(4001);
    expect(tts.speakNow('AI cue after lock', 'en')).toBe(true);
    expect(Speech.speak).toHaveBeenCalledTimes(2);
  });

  it('cancel clears the priority lock', () => {
    tts.speakPriority('Therapist cue', 'en', 5000);
    tts.cancel();
    expect(tts.speakNow('Normal cue', 'en')).toBe(true);
    expect(Speech.speak).toHaveBeenLastCalledWith('Normal cue', expect.any(Object));
  });

  it('lets an essential countdown or completion announcement interrupt a Therapist cue', () => {
    tts.speakPriority('Therapist cue', 'en', 5000);
    jest.advanceTimersByTime(500);

    expect(tts.speakEssential('3', 'en')).toBe(true);
    expect(Speech.speak).toHaveBeenLastCalledWith('3', expect.any(Object));
    expect(tts.speakNow('Routine AI cue', 'en')).toBe(false);
  });
});
