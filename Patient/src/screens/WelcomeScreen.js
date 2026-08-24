// PhysioAI · Version-2 — Welcome / intro (entry before login).

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t, getLang, setLang } from '../core/i18n.js';
import { continueAsGuest } from '../core/auth.js';
import { isDemoEnabled } from '../core/api.js';
import { colors } from '../core/theme.js';
import Logo from '../components/Logo.js';

export default function WelcomeScreen({ navigation }) {
  const [lang, setLangState] = useState(getLang());
  const toggleLang = () => { const n = lang === 'th' ? 'en' : 'th'; setLang(n); setLangState(n); };

  const guest = async () => {
    try {
      await continueAsGuest();
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch {}
  };
  const showDemo = isDemoEnabled();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <Pressable style={styles.langBtn} onPress={toggleLang} accessibilityRole="button">
        <Text style={styles.langTxt}>{lang === 'th' ? 'EN' : 'ไทย'}</Text>
      </Pressable>

      <View style={styles.hero}>
        <Logo size={96} />
        <Text style={styles.title}>{t('welcomeTitle')}</Text>
        <Text style={styles.sub}>{t('welcomeSub')}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.primary]} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.primaryTxt}>{t('login')}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.ghost]} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.ghostTxt}>{t('register')}</Text>
        </Pressable>
        {showDemo ? (
          <Pressable style={styles.guest} onPress={guest}>
            <Text style={styles.guestTxt}>{t('guest')}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingVertical: 20 },
  langBtn: {
    alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  langTxt: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  hero: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 20 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, color: colors.ink, textAlign: 'center' },
  sub: { maxWidth: 320, fontSize: 15, color: colors.ink2, textAlign: 'center', lineHeight: 22 },
  actions: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 10, paddingBottom: 12 },
  btn: { minHeight: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  primary: { backgroundColor: colors.brand, borderWidth: 1, borderColor: colors.brand },
  primaryTxt: { color: colors.inverse, fontWeight: '800', fontSize: 17 },
  ghost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  ghostTxt: { color: colors.brand, fontWeight: '800', fontSize: 17 },
  guest: { paddingVertical: 14, alignItems: 'center' },
  guestTxt: { color: colors.ink2, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
});
