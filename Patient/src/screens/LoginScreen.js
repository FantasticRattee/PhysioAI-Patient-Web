// PhysioAI · Version-2 — Login.

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../core/i18n.js';
import { login } from '../core/auth.js';
import { colors } from '../core/theme.js';
import Logo from '../components/Logo.js';
import BackButton from '../components/BackButton.js';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      await login({ email, password });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      const key = e.code === 'required'
        ? 'errRequired'
        : (e.code === 'api_not_configured' || e.code === 'demo_disabled')
          ? 'errApiConfig'
          : e.code === 'invalid'
            ? 'errInvalid'
          : e.code === 'not_patient'
            ? 'errRole'
            : e.status
              ? 'errServer'
              : 'errInvalid';
      setError(t(key));
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <BackButton navigation={navigation} />
        <View style={styles.brand}><Logo size={72} /></View>
        <Text style={styles.title}>{t('login')}</Text>

        <View style={styles.form}>
          <Text style={styles.label}>{t('email')}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
            placeholder="you@email.com" placeholderTextColor={colors.ink3} />

          <Text style={styles.label}>{t('password')}</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword}
            secureTextEntry placeholder="••••••••" placeholderTextColor={colors.ink3} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.inverse} /> : <Text style={styles.btnTxt}>{t('login')}</Text>}
          </Pressable>
        </View>

        <View style={{ flex: 1 }} />
        <Pressable style={styles.switch} onPress={() => navigation.replace('Register')}>
          <Text style={styles.switchTxt}>{t('noAccount')} <Text style={styles.link}>{t('signUpLink')}</Text></Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20, paddingVertical: 18 },
  brand: { alignItems: 'center', marginTop: 14, marginBottom: 12 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.7, color: colors.ink, marginTop: 4, marginBottom: 20, textAlign: 'center' },
  form: {
    width: '100%', maxWidth: 480, alignSelf: 'center',
    gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: 18, padding: 18,
  },
  label: { fontSize: 12, letterSpacing: 0.3, color: colors.ink2, fontWeight: '700', marginTop: 6 },
  input: {
    minHeight: 52, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink,
  },
  error: { color: colors.bad, backgroundColor: 'rgba(184,66,60,0.10)', fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 8, padding: 10, borderRadius: 10 },
  btn: { minHeight: 54, backgroundColor: colors.brand, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  btnTxt: { color: colors.inverse, fontWeight: '800', fontSize: 17 },
  switch: { alignItems: 'center', paddingVertical: 16 },
  switchTxt: { color: colors.ink2, fontSize: 15 },
  link: { color: colors.brand, fontWeight: '800' },
});
