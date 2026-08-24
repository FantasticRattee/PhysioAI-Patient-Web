import { apiGet, apiPost } from './api.js';

export const LIVE_ASSIST_POLL_MS = 2000;

export function patientCueText(event, lang = 'en') {
  const cue = event?.cue || {};
  return (lang === 'th' ? cue.th : cue.en) || cue.en || cue.th || '';
}

export function correctionSymbol(event) {
  return {
    increase_angle: '↑',
    decrease_angle: '↓',
    straighten: '↗',
    bend: '↘',
    hold: '✓',
    reset: '↺',
  }[event?.correction] || '•';
}

export function selectActiveTherapistCue(gateBlocked, cue) {
  return gateBlocked ? null : (cue || null);
}

export function correctionMatchesExercise(event, exerciseId) {
  const target = String(event?.exerciseId || '').trim();
  return !target || target === String(exerciseId || '').trim();
}

export function isLiveAssistEventExpired(event, now = Date.now()) {
  const expiresAt = Number(event?.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Number(now);
}

export function buildLiveAssistPath(cursor = '', exerciseId = '') {
  const query = [];
  if (cursor) query.push(`after=${encodeURIComponent(cursor)}`);
  if (exerciseId) query.push(`exerciseId=${encodeURIComponent(exerciseId)}`);
  return `/live-assist/corrections${query.length ? `?${query.join('&')}` : ''}`;
}

export function buildLiveAssistAckPath(id) {
  return `/live-assist/corrections/${encodeURIComponent(String(id || ''))}/ack`;
}

export async function fetchLiveAssistBatch(cursor = '', exerciseId = '', get = apiGet) {
  return get(buildLiveAssistPath(cursor, exerciseId));
}

export async function acknowledgeLiveAssist(id, post = apiPost) {
  return post(buildLiveAssistAckPath(id));
}

export function createLiveAssistPoller({ fetchBatch, onCorrection, onError = () => {} }) {
  let stopped = false;
  let inFlight = false;
  let cursor = '';
  const seen = new Set();

  async function pollNow() {
    if (stopped || inFlight) return false;
    inFlight = true;
    try {
      const batch = await fetchBatch(cursor);
      if (stopped) return false;
      for (const event of batch?.items || []) {
        if (!event?.id || seen.has(event.id)) continue;
        seen.add(event.id);
        await onCorrection(event);
      }
      if (batch?.cursor) cursor = batch.cursor;
      if (seen.size > 200) {
        const keep = Array.from(seen).slice(-100);
        seen.clear();
        keep.forEach((id) => seen.add(id));
      }
      return true;
    } catch (err) {
      onError(err);
      return false;
    } finally {
      inFlight = false;
    }
  }

  return {
    pollNow,
    stop() { stopped = true; },
    getCursor() { return cursor; },
  };
}
