/**
 * GROUP MODE — hub avec trois modes :
 *   • Créer une session collaborative (code partageable + salle de vote)
 *   • Rejoindre une session via un code à 6 caractères
 *   • Quick Search (recherche rapide non-collaborative)
 */
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useLocation } from '../lib/useLocation';
import { useAuth } from '../lib/auth-context';
import { useSaved } from '../lib/useSaved';
import { searchPlaces } from '../lib/search-api';
import { createGroupRequest, joinGroupRequest } from '../lib/groups-api';
import { placeStore } from '../lib/place-store';
import { recordVisit } from '../lib/passport-api';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import { FREE_LIMITS } from '../lib/constants/plan-limits';
import { SuggestionCard } from '../components/SuggestionCard';
import type { Top3Response } from '../lib/api';

type Tab = 'session' | 'quick';

const THEMES = [
  { key: 'afterwork', emoji: '🍻', label: 'Afterwork' },
  { key: 'birthday', emoji: '🎂', label: 'Anniversaire' },
  { key: 'sport', emoji: '⚽', label: 'Après le sport' },
  { key: 'friends', emoji: '💑', label: 'Soirée entre amis' },
  { key: 'family', emoji: '👨‍👩‍👧', label: 'Sortie famille' },
  { key: 'business', emoji: '💼', label: "Repas d'affaires" },
];

const SIZES = [2, 3, 4, 5, 6, 8, 10, 15, 20];

export default function GroupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { coords } = useLocation();
  const { accessToken } = useAuth();
  const { savedIds, save, unsave } = useSaved(accessToken);
  const { isPremium } = usePlanLimits();
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
    if (!accessToken) { Alert.alert('Connexion requise', 'Connecte-toi pour créer une session.'); return; }
    setSessionLoading(true);
    setSessionError(null);
    try {
      const session = await createGroupRequest(accessToken);
      router.push(`/group-session?id=${session.id}`);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Impossible de créer la session.');
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleJoin() {
    if (!accessToken) { Alert.alert('Connexion requise', 'Connecte-toi pour rejoindre une session.'); return; }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setSessionError('Le code doit contenir 6 caractères.'); return; }
    setSessionLoading(true);
    setSessionError(null);
    try {
      const session = await joinGroupRequest(accessToken, code);
      router.push(`/group-session?id=${session.id}`);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Code invalide ou session introuvable.');
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
      const themeLabel = THEMES.find((t) => t.key === theme)?.label;
      const query = [themeLabel, `groupe de ${size} personnes`, note.trim() || null]
        .filter(Boolean).join(', ');
      const data = await searchPlaces(accessToken, { lat: coords.lat, lng: coords.lng, query, locale: 'fr' });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de recherche.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>👥 Sortie en groupe</Text>
            <Text style={styles.subtitle}>Planifiez ensemble, sans prise de tête.</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, tab === 'session' && styles.tabActive]}
            onPress={() => setTab('session')}
          >
            <Text style={[styles.tabText, tab === 'session' && styles.tabTextActive]}>
              🗳 Session vote
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === 'quick' && styles.tabActive]}
            onPress={() => setTab('quick')}
          >
            <Text style={[styles.tabText, tab === 'quick' && styles.tabTextActive]}>
              ⚡ Recherche rapide
            </Text>
          </Pressable>
        </View>

        {tab === 'session' ? (
          <View style={styles.section}>
            {/* Créer */}
            <Pressable
              style={[styles.createBtn, sessionLoading && styles.btnDisabled]}
              onPress={handleCreate}
              disabled={sessionLoading}
            >
              {sessionLoading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Text style={styles.createBtnIcon}>🎯</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.createBtnTitle}>Créer une session</Text>
                      <Text style={styles.createBtnSub}>Obtiens un code à partager avec tes amis</Text>
                    </View>
                    <Text style={styles.createBtnChevron}>›</Text>
                  </>
              }
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou rejoindre</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Rejoindre */}
            <View style={styles.joinBox}>
              <TextInput
                style={styles.codeInput}
                placeholder="Code à 6 lettres"
                placeholderTextColor={colors.textMuted}
                value={joinCode}
                onChangeText={(v) => setJoinCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                returnKeyType="join"
                onSubmitEditing={handleJoin}
              />
              <Pressable
                style={[styles.joinBtn, (joinCode.length !== 6 || sessionLoading) && styles.btnDisabled]}
                onPress={handleJoin}
                disabled={joinCode.length !== 6 || sessionLoading}
              >
                <Text style={styles.joinBtnText}>Rejoindre</Text>
              </Pressable>
            </View>

            {sessionError ? <Text style={styles.error}>{sessionError}</Text> : null}

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                💡 Dans une session, chaque membre vote pour ou contre chaque lieu proposé.
                Le lieu avec le plus de 👍 est sélectionné automatiquement.
              </Text>
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.section}>
              <Text style={styles.label}>Occasion</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {THEMES.map((th) => (
                  <Pressable
                    key={th.key}
                    style={[styles.chip, theme === th.key && styles.chipActive]}
                    onPress={() => setTheme((prev) => (prev === th.key ? null : th.key))}
                  >
                    <Text style={styles.chipEmoji}>{th.emoji}</Text>
                    <Text style={[styles.chipLabel, theme === th.key && styles.chipLabelActive]}>
                      {th.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Nombre de personnes</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {SIZES.map((n) => {
                  const locked = !isPremium && n > FREE_LIMITS.circleMaxMembers;
                  return (
                    <Pressable
                      key={n}
                      style={[styles.sizeChip, size === n && !locked && styles.chipActive, locked && styles.sizeChipLocked]}
                      onPress={() => {
                        if (locked) {
                          setUpsell(`Ton cercle est limité à ${FREE_LIMITS.circleMaxMembers} personnes. Invite jusqu'à 20 proches pour seulement 2.99€/mois avec le forfait Premium. 👑`);
                          return;
                        }
                        setSize(n);
                      }}
                    >
                      <Text style={[styles.sizeText, size === n && !locked && styles.chipLabelActive, locked && styles.sizeTextLocked]}>
                        {n}{locked ? ' 👑' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Précisions (optionnel)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex : festif mais pas trop bruyant"
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={[styles.section, { marginTop: spacing.sm }]}>
              <Pressable
                style={[styles.searchBtn, loading && styles.btnDisabled]}
                onPress={handleQuickSearch}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.searchBtnText}>🤖 Trouver le bon endroit</Text>
                }
              </Pressable>
            </View>

            {error ? <View style={styles.section}><Text style={styles.error}>{error}</Text></View> : null}

            {result ? (
              <View style={styles.section}>
                {result.reason ? <Text style={styles.reason}>{result.reason}</Text> : null}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { paddingTop: 4 },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.brand },
  tabText: { ...typography.caption, color: colors.textMuted },
  tabTextActive: { ...typography.caption, color: colors.brand, fontWeight: '700' },

  section: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
  label: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm },

  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  btnDisabled: { opacity: 0.5 },
  createBtnIcon: { fontSize: 28 },
  createBtnTitle: { ...typography.body, color: '#fff', fontWeight: '700' },
  createBtnSub: { ...typography.caption, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  createBtnChevron: { ...typography.title, color: '#fff', lineHeight: 22 },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.caption, color: colors.textMuted },

  joinBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    ...typography.heading,
    color: colors.textPrimary,
    letterSpacing: 6,
    textAlign: 'center',
  },
  joinBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  joinBtnText: { ...typography.body, color: '#fff', fontWeight: '700' },

  error: { ...typography.caption, color: colors.danger, marginTop: spacing.md },

  infoBox: {
    marginTop: spacing.xl,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoText: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },

  chipsRow: { gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipActive: { backgroundColor: `${colors.brand}18`, borderColor: colors.brand },
  chipEmoji: { fontSize: 16 },
  chipLabel: { ...typography.caption, color: colors.textPrimary },
  chipLabelActive: { color: colors.brandSoft },
  sizeChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeChipLocked: { opacity: 0.5, borderColor: '#7C3AED44' },
  sizeText: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  sizeTextLocked: { fontSize: 11, color: '#A78BFA' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  searchBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  searchBtnText: { ...typography.body, color: '#fff', fontWeight: '700' },
  reason: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md },
});
