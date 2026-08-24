// PhysioAI · Design 4 — warm clinical visual tokens.
//
// Keep these tokens presentation-only: they are shared by every Patient screen
// so the visual refresh never changes navigation, camera, or session behaviour.
export const colors = {
  bg: '#F5F1E8', surface: '#FBF7EF', surface2: '#F3EEE3', surface3: '#E9E1D3',
  line: '#DED6C7',
  ink: '#2A2823', ink2: '#6B655A', ink3: '#A79E8C', inverse: '#F5F1E8',
  brand: '#25443B', brandSoft: '#EAF1EC', accent: '#7BA88F',
  good: '#2F5D50', warn: '#9C7344', bad: '#B8423C',
};

export const scoreTone = (score) =>
  score == null ? 'none' : score >= 75 ? 'good' : score >= 50 ? 'warn' : 'bad';

export const toneColor = (tone) =>
  ({ good: colors.good, warn: colors.warn, bad: colors.bad, none: colors.ink3 }[tone] || colors.ink3);

// Skeleton stroke / joint colors per tone. The warm semantic error retains
// contrast over a live camera while the positive tone matches the new brand.
export const skeletonColors = {
  good: ['#25443B', '#7BA88F'],
  warn: ['#9C7344', '#C8955A'],
  bad: ['#B8423C', '#D98C84'],
  none: ['#8A8275', '#8A8275'],
};
