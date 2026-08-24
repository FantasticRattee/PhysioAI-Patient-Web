import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { t } from '../core/i18n.js';
import { colors } from '../core/theme.js';

/**
 * Shared, phone-sized back/exit affordance.
 *
 * `onPress` is used by live-session overlays where leaving the session is
 * already owned by the parent. Otherwise the navigation stack is used, with a
 * safe fallback for a direct web URL that has no history entry.
 */
export default function BackButton({ navigation, onPress, fallback = 'Welcome', variant = 'plain', label }) {
  const goBack = () => {
    if (onPress) return onPress();
    if (navigation?.canGoBack?.()) return navigation.goBack();
    if (fallback && navigation?.replace) return navigation.replace(fallback);
    return undefined;
  };

  const text = label || t('back');
  const glass = variant === 'glass';
  const ghost = variant === 'ghost';
  return (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        glass && styles.glass,
        ghost && styles.ghost,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.text, glass && styles.glassText, ghost && styles.ghostText]}>‹ {text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    minWidth: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  text: { color: colors.brand, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  glass: {
    position: 'relative',
    alignSelf: 'auto',
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(251,247,239,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(18,36,30,0.10)',
  },
  glassText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  ghost: {
    alignSelf: 'stretch',
    minHeight: 48,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghostText: { color: colors.brand, fontSize: 15 },
  pressed: { opacity: 0.72 },
});
