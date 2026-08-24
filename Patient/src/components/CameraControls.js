import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { getLang } from '../core/i18n.js';
import { colors } from '../core/theme.js';

/** Compact native camera controls; unavailable hardware is never represented. */
export default function CameraControls({
  position = 'front',
  lenses = [],
  selectedLens = 'wide',
  onSwitch,
  onLensSelect,
}) {
  const lang = getLang();
  const back = position === 'back';
  const switchLabel = lang === 'th' ? 'สลับกล้องหน้าและกล้องหลัง' : 'Switch front and back camera';
  const lensLabel = lang === 'th' ? 'เลือกเลนส์และซูม' : 'Select lens and zoom';
  if (!lenses.length && !onSwitch) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.panel}>
        <Pressable
          onPress={onSwitch}
          accessibilityRole="button"
          accessibilityLabel={switchLabel}
          style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={styles.switchIcon}>↺</Text>
          <Text style={styles.switchText}>{back ? 'Front' : 'Back'}</Text>
        </Pressable>
        {lenses.length > 1 ? (
          <View style={styles.lensGroup} accessibilityLabel={lensLabel}>
            {lenses.map((lens) => (
              <Pressable
                key={lens.id}
                onPress={() => onLensSelect?.(lens.id)}
                accessibilityRole="radio"
                accessibilityLabel={`${lensLabel}: ${lens.label}`}
                accessibilityState={{ selected: selectedLens === lens.id }}
                style={({ pressed }) => [
                  styles.lensButton,
                  selectedLens === lens.id && styles.lensButtonSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.lensText, selectedLens === lens.id && styles.lensTextSelected]}>
                  {lens.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    // Keep clear of the practice HUD's top row and the bottom cue/score cards.
    // The old top-right placement sat on top of the live-mode pill.
    justifyContent: 'flex-end',
    paddingBottom: 186,
    paddingRight: 16,
    zIndex: 12,
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 5,
    borderRadius: 18,
    backgroundColor: 'rgba(18,36,30,0.76)',
    borderWidth: 1,
    borderColor: 'rgba(245,241,232,0.35)',
  },
  switchButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 13,
  },
  switchIcon: { color: colors.inverse, fontSize: 19, fontWeight: '800' },
  switchText: { color: colors.inverse, fontSize: 12, fontWeight: '800' },
  lensGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    padding: 2,
    borderRadius: 13,
    backgroundColor: 'rgba(245,241,232,0.15)',
  },
  lensButton: {
    minWidth: 38,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderRadius: 10,
  },
  lensButtonSelected: { backgroundColor: colors.inverse },
  lensText: { color: colors.inverse, fontSize: 11, fontWeight: '800' },
  lensTextSelected: { color: colors.brand },
  pressed: { opacity: 0.72 },
});
