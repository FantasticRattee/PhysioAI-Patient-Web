// Presentation-only accessibility policy for Patient Practice.
//
// This module deliberately has no React, camera, or clinical-pipeline imports.
// It converts an already-computed session snapshot into output decisions only.

export const PRESENTATION_MODE = Object.freeze({
  STANDARD: 'standard',
  AUDIO: 'audio',
  VISUAL: 'visual',
});

export function normalizePresentationMode(mode) {
  return Object.values(PRESENTATION_MODE).includes(mode)
    ? mode
    : PRESENTATION_MODE.STANDARD;
}

export function shouldSpeak(mode, savedVoiceEnabled = true) {
  switch (normalizePresentationMode(mode)) {
    case PRESENTATION_MODE.AUDIO:
      return true;
    case PRESENTATION_MODE.VISUAL:
      return false;
    default:
      return savedVoiceEnabled !== false;
  }
}

/**
 * Pick the feedback a speech presentation should announce. Audio-Only puts
 * safety/framing guidance first; Standard keeps its existing form-cue order.
 */
export function getSpokenFeedback(snapshot, mode, lang = 'en') {
  const presentation = normalizePresentationMode(mode);
  if (presentation === PRESENTATION_MODE.VISUAL || !snapshot) return null;

  const gate = snapshot.gate;
  if (presentation === PRESENTATION_MODE.AUDIO && gate && !gate.ok) {
    const text = lang === 'th' ? gate.hintTh : gate.hint;
    if (text) return { id: `gate:${text}`, text };
  }

  const cue = snapshot.cue;
  return cue && cue.tone !== 'none' && cue.text ? cue : null;
}

/**
 * Translate the explainable comparator primary joint into one visual direction.
 * `↑` means increase the tracked angle; `↓` means decrease it. The visual
 * overlay also carries a textual state so it never relies on colour alone.
 */
export function getVisualGuidance(snapshot, lang = 'en') {
  const fallbackText = snapshot?.cue?.text || '';
  const gate = snapshot?.gate;
  if (gate && !gate.ok) {
    const text = (lang === 'th' ? gate.hintTh : gate.hint) || fallbackText;
    return { state: 'reframe', arrow: '↔', direction: 'reframe', text, joint: null, label: '', delta: null };
  }

  const primary = snapshot?.comparison?.primary;
  if (!primary || !Number.isFinite(primary.live) || !Number.isFinite(primary.ref)) {
    return { state: 'waiting', arrow: '•', direction: 'waiting', text: fallbackText, joint: null, label: '', delta: null };
  }

  const label = lang === 'th' ? (primary.labelTh || primary.label || primary.joint) : (primary.label || primary.joint);
  const delta = Number.isFinite(primary.delta) ? Math.round(primary.delta) : null;
  if (primary.status === 'ok') {
    return { state: 'hold', arrow: '✓', direction: 'hold', text: fallbackText, joint: primary.joint, label, delta };
  }

  const increase = primary.live < primary.ref;
  return {
    state: 'adjust',
    arrow: increase ? '↑' : '↓',
    direction: increase ? 'increase' : 'decrease',
    text: fallbackText,
    joint: primary.joint,
    label,
    delta,
  };
}
