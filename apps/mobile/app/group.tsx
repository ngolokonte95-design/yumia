/**
 * GROUP MODE — hub avec trois modes :
 *   • Créer une session collaborative (code partageable + salle de vote)
 *   • Rejoindre une session via un code à 6 caractères
 *   • Quick Search (recherche rapide non-collaborative)
 *
 * Habillage du 18/11/2026 : sobre (verre sombre, blanc), le dégradé de marque
 * réservé à l'action principale de chaque onglet et au trait de l'onglet actif.
 */
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, elevation, gradients, radius, spacing, typography } from '../theme/tokens';
import { useLocation } from '../lib/useLocation';
import { useAuth } from '../lib/auth-context';
import { useSaved } from '../lib/useSaved';
import { searchPlaces } from '../lib/search-api';
import { createGroupRequest, joinGroupRequest } from '../lib/groups-api';
import { placeStore } from '../lib/place-store';
import { recordVisit } from '../lib/passport-api';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import { SuggestionCard } from '../components/SuggestionCard';
import type { Top3Response } from '../lib/api';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';
import { FeatureTip } from '../components/FeatureTip';
import { PressableScale, Reveal } from '../components/ui';
import { BrandButton } from '../components/social/SocialChrome';
import {
  PB_CHEVRON, PB_GLASS, PbButton, PbChip, PbHeader, PbLabel, PbTabs,
} from '../components/pb1/PbChrome';

type Tab = 'session' | 'quick';

const THEMES: { key: string; emoji: string; labelKey: TranslationKey }[] = [
  { key: 'afterwork', emoji: '🍻', labelKey: 'group_theme_afterwork' },
  { key: 'birthday', emoji: '🎂', labelKey: 'group_theme_birthday' },
  { key: 'sport', emoji: '⚽', labelKey: 'group_theme_sport' },
  { key: 'friends', emoji: '💑', labelKey: 'group_theme_friends' },
  { key: 'family', emoji: '👨‍👩‍👧', labelKey: 'group_theme_family' },
  { key: 'business', emoji: '💼', labelKey: 'group_theme_business' },
];

const SIZES = [2, 3, 4, 5, 6, 8, 10, 15, 20];

export default function GroupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coords } = useLocation();
  const { accessToken } = useAuth();
  const { savedIds, save, unsave } = useSaved(accessToken);
  const { getLimit } = usePlanLimits();
  const { t } = useI18n();
  const [upsell, setUpsell] = useState<string | null>(null);

  const { code: deepLinkCode } = useLocalSearchParams<{ code?: string }>();

  const [tab, setTab] = useState<Tab>('session');
  const [joinCode, setJoinCode] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Pré-remplissage depuis deep link yumia://group?code=XXXXXX
  useEffect(() => {
    if (deepLinkCode) {
      const cleaned = deepLinkCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      setJoinCode(cleaned);
      setTab('session');
    }
  }, [deepLinkCode]);

  // Quick search state
  const [theme, setTheme] = useState<string | null>(null);
  const [size, setSize] = useState(4);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<Top3Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!accessToken) { Alert.alert(t('group_login_required_title'), t('group_login_required_create')); return; }
    setSessionLoading(true);
    setSessionError(null);
    try {
      const session = await createGroupRequest(accessToken);
      router.push(`/group-session?id=${session.id}`);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : t('group_create_session_error'));
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleJoin() {
    if (!accessToken) { Alert.alert(t('group_login_required_title'), t('group_login_required_join')); return; }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setSessionError(t('group_code_length_error')); return; }
    setSessionLoading(true);
    setSessionError(null);
    try {
      const session = await joinGroupRequest(accessToken, code);
      router.push(`/group-session?id=${session.id}`);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : t('group_invalid_code_error'));
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleQuickSearch() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const themeDef = THEMES.find((th) => th.key === theme);
      const themeLabel = themeDef ? t(themeDef.labelKey) : undefined;
      const query = [themeLabel, t('group_of_people').replace('{n}', String(size)), note.trim() || null]
        .filter(Boolean).join(', ');
      const data = await searchPlaces(accessToken, { lat: coords.lat, lng: coords.lng, query, locale: 'fr' });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('group_search_error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PbHeader
          title={t('group_title')}
          subtitle={t('group_subtitle')}
          onBack={() => router.back()}
          style={{ paddingTop: insets.top + spacing.sm }}
        />

        <PbTabs
          tabs={[
            { key: 'session', label: t('group_tab_session') },
            { key: 'quick', label: t('group_tab_quick') },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'session' ? (
          <View style={styles.section}>
            {/* Créer — l'action principale, seule surface au dégradé de marque. */}
            <Reveal index={0}>
              <PressableScale
                style={[styles.createBtn, sessionLoading && styles.btnDisabled]}
                onPress={handleCreate}
                disabled={sessionLoading}
                scaleTo={0.97}
                haptic
              >
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
                {sessionLoading
                  ? <ActivityIndicator color="#fff" style={{ flex: 1 }} />
                  : <>
                      <View style={styles.createBtnMedal}>
                        <Text style={styles.createBtnIcon}>🎯</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.createBtnTitle}>{t('group_create_session_title')}</Text>
                        <Text style={styles.createBtnSub}>{t('group_create_session_sub')}</Text>
                      </View>
                      <Text style={styles.createBtnChevron}>{PB_CHEVRON}</Text>
                    </>
                }
              </PressableScale>
            </Reveal>

            <Reveal index={1}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('group_or_join')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Rejoindre */}
              <View style={styles.joinBox}>
                <TextInput
                  style={[styles.codeInput, PB_GLASS]}
                  placeholder={t('group_code_placeholder')}
                  placeholderTextColor={colors.textMuted}
                  value={joinCode}
                  onChangeText={(v) => setJoinCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  returnKeyType="join"
                  onSubmitEditing={handleJoin}
                />
                <PbButton
                  label={t('group_join_btn')}
                  onPress={handleJoin}
                  disabled={joinCode.length !== 6 || sessionLoading}
                  style={styles.joinBtn}
                />
              </View>

              {sessionError ? <Text style={styles.error}>{sessionError}</Text> : null}
            </Reveal>

            <Reveal index={2}>
              <View style={[styles.infoBox, PB_GLASS]}>
                <Text style={styles.infoText}>
                  {t('group_info_text')}
                </Text>
              </View>
            </Reveal>
          </View>
        ) : (
          <View>
            <Reveal index={0} style={styles.section}>
              <PbLabel label={t('group_occasion')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {THEMES.map((th) => (
                  <PbChip
                    key={th.key}
                    emoji={th.emoji}
                    label={t(th.labelKey)}
                    active={theme === th.key}
                    onPress={() => setTheme((prev) => (prev === th.key ? null : th.key))}
                  />
                ))}
              </ScrollView>
            </Reveal>

            <Reveal index={1} style={styles.section}>
              <PbLabel label={t('group_number_of_people')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {SIZES.map((n) => {
                  const circleLimit = getLimit('circleMaxMembers');
                  const locked = n > circleLimit;
                  return (
                    <PbChip
                      key={n}
                      round
                      label={`${n}${locked ? ' 👑' : ''}`}
                      active={size === n && !locked}
                      locked={locked}
                      onPress={() => {
                        if (locked) {
                          setUpsell(t('group_circle_limit').replace('{n}', String(circleLimit)));
                          return;
                        }
                        setSize(n);
                      }}
                    />
                  );
                })}
              </ScrollView>
            </Reveal>

            <Reveal index={2} style={styles.section}>
              <PbLabel label={t('group_precisions_label')} />
              <TextInput
                style={[styles.input, PB_GLASS]}
                placeholder={t('group_precisions_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={2}
              />
            </Reveal>

            <Reveal index={3} style={[styles.section, { marginTop: spacing.lg }]}>
              <BrandButton label={t('group_find_place')} onPress={handleQuickSearch} loading={loading} />
            </Reveal>

            {error ? <View style={styles.section}><Text style={styles.error}>{error}</Text></View> : null}

            {result ? (
              <View style={styles.section}>
                {result.reason ? (
                  <View style={[styles.reasonBox, PB_GLASS]}>
                    <Text style={styles.reasonIcon}>✨</Text>
                    <Text style={styles.reason}>{result.reason}</Text>
                  </View>
                ) : null}
                <View style={{ gap: spacing.md }}>
                  {result.suggestions.map((s) => (
                    <SuggestionCard
                      key={s.place.id}
                      suggestion={s}
                      isSaved={savedIds.has(s.place.id)}
                      onPress={() => { placeStore.set(s); router.push('/place'); }}
                      onSave={accessToken ? (id, willSave) => (willSave ? save(id) : unsave(id)) : undefined}
                      onVisit={accessToken ? async (feedback) => { await recordVisit(accessToken, s.place.id, feedback); } : undefined}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
      <FeatureTip feature="group" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.xl },

  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 96,
    overflow: 'hidden',
    ...elevation.glowBrand,
  },
  btnDisabled: { opacity: 0.6 },
  createBtnMedal: {
    width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)',
  },
  createBtnIcon: { fontSize: 26 },
  createBtnTitle: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  createBtnSub: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  createBtnChevron: { color: '#fff', fontSize: 26, fontWeight: '300' },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.16)' },
  dividerText: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.8, textTransform: 'uppercase',
  },

  joinBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
    height: 56,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
  },
  joinBtn: { height: 56 },

  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },

  infoBox: {
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  infoText: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },

  chipsRow: { gap: spacing.sm, paddingEnd: spacing.md },
  input: {
    borderRadius: radius.lg,
    padding: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  reasonBox: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  reasonIcon: { fontSize: 16 },
  reason: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 21 },
});
