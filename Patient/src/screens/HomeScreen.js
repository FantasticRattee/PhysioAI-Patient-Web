// PhysioAI · Version-2 — Home (patient).
//
// Two zones, by the clinical model:
//  • "My plan" — exercises the therapist prescribed (with their dosage). These
//    count toward today's adherence/progress.
//  • "Extras"  — built-in popular exercises NOT in the plan, that the patient may
//    do on their own (optional, never counted toward adherence).

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EXERCISES, getExercise, isBuiltin, getCatalog } from '../core/exercises.js';
import { getPlanFull, getSessions } from '../core/store.js';
import { getSession, logout } from '../core/auth.js';
import { t, getLang } from '../core/i18n.js';
import { colors } from '../core/theme.js';
import BackButton from '../components/BackButton.js';

const FALLBACK_PATIENT_ID = 'p1';

export default function HomeScreen({ navigation }) {
  const [plan, setPlan] = useState(null);
  const [doneIds, setDoneIds] = useState(new Set());
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    (async () => {
      const nextSession = await getSession().catch(() => null);
      const patientId = nextSession?.id || FALLBACK_PATIENT_ID;
      setSession(nextSession);
      try {
        const [nextPlan, list] = await Promise.all([
          getPlanFull(patientId),
          getSessions(patientId),
        ]);
        setLoadError(null);
        if (nextPlan) setPlan(nextPlan);
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const ms = start.getTime();
        // Count only plan exercises done today; extras (kind:'extra') never count.
        setDoneIds(new Set((list || [])
          .filter((s) => s.endedAt >= ms && s.kind !== 'extra')
          .map((s) => s.exerciseId)));
      } catch (error) {
        setLoadError(error);
        setPlan(null);
        setDoneIds(new Set());
      }
    })();
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]); // refresh after each session

  const lang = getLang();
  const doLogout = async () => { await logout(); navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] }); };

  const items = plan?.items || [];
  const planIds = items.map((i) => i.exerciseId);
  // Extras a patient can try on their own = the established catalog plus the explicitly
  // experimental Bottle Grab camera lane, minus what's already in the plan.
  const extras = getCatalog().filter((e) => !planIds.includes(e.id));
  const regularExtras = extras.filter((e) => e.category !== 'health_rom');
  const romExtras = extras.filter((e) => e.category === 'health_rom');
  const doneCount = planIds.filter((id) => doneIds.has(id)).length;
  const total = items.length;
  const patientId = session?.id || plan?.patientId || FALLBACK_PATIENT_ID;

  const go = (exId, dose, kind, exercise) => navigation.navigate('Practice', { exId, dose, kind, exercise, patientId });
  const errorText = loadError
    ? (loadError.code === 'api_not_configured' || loadError.code === 'demo_disabled'
        ? (lang === 'th' ? 'ยังไม่ได้ตั้งค่า API สำหรับ production' : 'Production API is not configured')
        : (lang === 'th' ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' : 'Could not reach the server'))
    : '';
  const exerciseName = (ex) => ex.source === 'custom' ? (lang === 'th' ? ex.labelTh : ex.label) : t('ex_' + ex.key);
  const doseLine = (e) => e.type === 'hold'
    ? `${e.holdSec}${t('sec')} ${t('hold')} · ${e.sets} ${t('sets')}`
    : `${e.reps} ${t('reps')} · ${e.sets} ${t('sets')}`;

  const PlanRow = (item) => {
    const ex = getExercise(item.exerciseId, [item.exercise]);
    const done = doneIds.has(ex.id);
    return (
      <Pressable key={ex.id} style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => go(ex.id, { reps: item.reps, sets: item.sets, holdSec: item.holdSec, tol: item.tol, countMode: item.countMode, exercise: item.exercise }, 'plan', ex)}>
        <View style={[styles.iconWrap, done && { backgroundColor: colors.good }]}>
          <Text style={[styles.iconTxt, done && { color: colors.inverse }]}>{done ? '✓' : '◷'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{exerciseName(ex)}</Text>
          <Text style={styles.hint}>{doseLine({ ...ex, ...item })}</Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </Pressable>
    );
  };

  const ExtraRow = (ex) => (
    <Pressable key={ex.id} style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => go(ex.id, undefined, 'extra', ex)}>
      <View style={styles.iconWrap}><Text style={styles.iconTxt}>＋</Text></View>
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{exerciseName(ex)}</Text>
          {ex.experimentalOnly ? <Text style={styles.experimentalBadge}>
            {lang === 'th' ? 'ทดลอง' : 'Experimental'}
          </Text> : null}
        </View>
        <Text style={styles.hint}>{doseLine(ex)}</Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <BackButton navigation={navigation} />
          <Text style={styles.brand}>Physio<Text style={{ color: colors.brand }}>AI</Text></Text>
          <Pressable style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]} onPress={doLogout} hitSlop={10} accessibilityRole="button">
            <Text style={styles.logout}>{t('logout')}</Text>
          </Pressable>
        </View>
        {session?.name ? <Text style={styles.greeting}>{t('greeting', { name: session.name })}</Text> : null}
        {loadError ? <Text style={styles.errorBox}>{errorText}</Text> : null}

        {!loadError && total > 0 ? (
          <View style={styles.progCard}>
            <View style={styles.progTop}>
              <Text style={styles.progLabel}>{t('todayProgress')}</Text>
              <Text style={styles.progCount}>
                {doneCount >= total ? t('planAllDone') : t('planDoneOf', { done: doneCount, total })}
              </Text>
            </View>
            <View style={styles.progTrack}>
              <View style={[styles.progFill, { width: `${total ? (doneCount / total) * 100 : 0}%` }]} />
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>{t('myPlan')}</Text>
        {loadError ? null : items.length ? items.map(PlanRow)
          : <Text style={styles.empty}>{lang === 'th' ? 'ยังไม่มีแผนจากนักกายภาพ' : 'No plan from your therapist yet'}</Text>}

        {regularExtras.length > 0 ? (
          <>
            <Text style={styles.section}>{t('extras')}</Text>
            <Text style={styles.sectionHint}>{t('extrasHint')}</Text>
            {regularExtras.map(ExtraRow)}
          </>
        ) : null}

        {romExtras.length > 0 ? (
          <>
            <Text style={styles.section}>{t('healthRomCategory')}</Text>
            <Text style={styles.sectionHint}>{lang === 'th' ? 'วัดช่วงการเคลื่อนไหวแบบแยกข้าง' : 'Quick range-of-motion checks by joint'}</Text>
            {romExtras.map(ExtraRow)}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 44 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  brand: { fontSize: 22, fontWeight: '800', letterSpacing: -0.7, color: colors.ink },
  logoutButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  logout: { color: colors.brand, fontSize: 13, fontWeight: '800' },
  greeting: { fontSize: 16, color: colors.ink2, lineHeight: 22, marginTop: 4 },
  errorBox: { color: colors.bad, backgroundColor: 'rgba(184,66,60,0.10)', borderColor: colors.bad, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16, fontSize: 14, fontWeight: '600', lineHeight: 20 },

  progCard: { backgroundColor: colors.brand, borderColor: colors.brand, borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 18 },
  progTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  progLabel: { fontSize: 13, fontWeight: '800', color: colors.inverse },
  progCount: { fontSize: 13, color: 'rgba(245,241,232,0.72)', fontWeight: '700', fontVariant: ['tabular-nums'] },
  progTrack: { height: 8, borderRadius: 6, backgroundColor: 'rgba(245,241,232,0.22)', overflow: 'hidden' },
  progFill: { height: 8, borderRadius: 6, backgroundColor: colors.accent },

  section: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ink3, fontWeight: '800', marginTop: 24, marginBottom: 8 },
  sectionHint: { fontSize: 12, color: colors.ink2, lineHeight: 18, marginTop: -2, marginBottom: 10 },
  empty: { color: colors.ink2, fontSize: 14, lineHeight: 20, paddingVertical: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  pressed: { opacity: 0.78 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  iconTxt: { color: colors.brand, fontSize: 20, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  experimentalBadge: { color: colors.brand, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.35, textTransform: 'uppercase', overflow: 'hidden' },
  hint: { fontSize: 13, color: colors.ink2, marginTop: 3 },
  chev: { fontSize: 24, color: colors.brand },
});
