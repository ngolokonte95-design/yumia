/**
 * SEARCH — écran de recherche conversationnelle.
 * L'utilisateur tape en langage naturel ; l'IA mood interprète et renvoie
 * les 3 meilleures adresses contextuelles.
 */
import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSES, UNIVERSE_META } from '@yumia/shared';
import type { Universe } from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { useI18n } from '../lib/useI18n';
import { useSaved } from '../lib/useSaved';
import { searchPlaces } from '../lib/search-api';
import { recordVisit } from '../lib/passport-api';
import { placeStore } from '../lib/place-store';
import { useSearchHistory } from '../lib/useSearchHistory';
import { SuggestionCard } from '../components/SuggestionCard';
import { PaywallModal } from '../components/PaywallModal';
import type { Top3Response } from '../lib/api';

const PRICE_FILTERS = [
  { label: 'Tous', value: undefined },
  { label: '€', value: 1 },
  { label: '€€', value: 2 },
  { label: '€€€', value: 3 },
] as const;

const SUGGESTIONS_PROMPTS = [
  '☕ Un brunch tranquille',
  '🎨 Activité culturelle',
  '🌿 Parc avec les enfants',
  '🎵 Bar avec de la musique live',
  '🍜 Resto asiatique du quartier',
  '🌙 Sortie tardive ce soir',
];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const { coords } = useLocation();
  const { t } = useI18n();
  const { savedIds, save, unsave, limitError, clearLimitError } = useSaved(accessToken);

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Top3Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [universeFilter, setUniverseFilter] = useState<Universe | null>(null);
  const [maxPriceTier, setMaxPriceTier] = useState<number | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);
  const { history, push: pushHistory, clear: clearHistory } = useSearchHistory();

  const handleSearch = useCallback(async (q: string, uFilter = universeFilter, pFilter = maxPriceTier) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await searchPlaces(accessToken, {
        lat: coords.lat,
        lng: coords.lng,
        query: trimmed,
        locale: user?.locale ?? 'fr',
        favoriteUniverses: user?.preferences?.favoriteUniverses,
        restrictions: user?.preferences?.restrictions,
        universeFilter: uFilter ?? undefined,
        maxPriceTier: pFilter,
      });
      setResult(res);
      void pushHistory(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, coords, user, pushHistory, universeFilter, maxPriceTier]);

  function handleChip(chip: string) {
    const clean = chip.replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF} ]+/gu, '').trim();
    setQuery(clean);
    void handleSearch(clean);
  }

  const hasQuery = query.trim().length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header avec input */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={t('search_placeholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void handleSearch(query)}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
        />
        {hasQuery ? (
          <Pressable
            onPress={() => { setQuery(''); setResult(null); setError(null); inputRef.current?.focus(); }}
            style={styles.clearBtn}
          >
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Filtres : univers + budget */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {/* Universe chips */}
          {UNIVERSES.map((u) => {
            const active = universeFilter === u;
            const meta = UNIVERSE_META[u];
            return (
              <Pressable
                key={u}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => {
                  const next = active ? null : u;
                  setUniverseFilter(next);
                  if (query.trim()) void handleSearch(query, next, maxPriceTier);
                }}
              >
                <Text style={styles.filterChipText}>
                  {meta.emoji} {meta.labelFr}
                </Text>
              </Pressable>
            );
          })}
          {/* Separator */}
          <View style={styles.filterSep} />
          {/* Price chips */}
          {PRICE_FILTERS.map(({ label, value }) => {
            const active = maxPriceTier === value;
            return (
              <Pressable
                key={label}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => {
                  setMaxPriceTier(value);
                  if (query.trim()) void handleSearch(query, universeFilter, value);
                }}
              >
                <Text style={styles.filterChipText}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <PaywallModal visible={limitError !== null} onClose={clearLimitError} />

        {/* État vide — historique + chips de suggestions rapides */}
        {!loading && !result && !error ? (
          <View style={styles.idle}>
            {history.length > 0 ? (
              <View style={styles.historySection}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Récentes</Text>
                  <Pressable onPress={() => void clearHistory()} hitSlop={8}>
                    <Text style={styles.clearHistory}>Effacer</Text>
                  </Pressable>
                </View>
                {history.map((h) => (
                  <Pressable
                    key={h}
                    style={styles.historyRow}
                    onPress={() => { setQuery(h); void handleSearch(h); }}
                  >
                    <Text style={styles.historyIcon}>🕐</Text>
                    <Text style={styles.historyText} numberOfLines={1}>{h}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.hint}>{t('search_hint')}</Text>
            <View style={styles.chips}>
              {SUGGESTIONS_PROMPTS.map((chip) => (
                <Pressable key={chip} style={styles.chip} onPress={() => handleChip(chip)}>
                  <Text style={styles.chipText}>{chip}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Chargement */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.stateText}>{t('search_searching')}</Text>
          </View>
        ) : null}

        {/* Erreur */}
        {!loading && error ? (
          <View style={styles.center}>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void handleSearch(query)}>
              <Text style={styles.retryText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Résultats */}
        {!loading && result ? (
          <View style={styles.results}>
            {result.reason ? (
              <Text style={styles.reason}>{result.reason}</Text>
            ) : null}
            {result.suggestions.length === 0 ? (
              <Text style={styles.stateText}>{t('search_empty')}</Text>
            ) : (
              result.suggestions.map((s) => (
                <SuggestionCard
                  key={s.place.id}
                  suggestion={s}
                  isSaved={savedIds.has(s.place.id)}
                  onPress={() => { placeStore.set(s); router.push('/place'); }}
                  onSave={
                    accessToken
                      ? (id, willSave) => willSave ? save(id) : unsave(id)
                      : undefined
                  }
                  onVisit={
                    accessToken
                      ? async (feedback) => recordVisit(accessToken, s.place.id, feedback)
                      : undefined
                  }
                />
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 20 },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  clearBtn: { padding: spacing.xs },
  clearText: { ...typography.body, color: colors.textMuted },

  filterBar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: `${colors.brand}18`,
    borderColor: colors.brand,
  },
  filterChipText: { ...typography.caption, color: colors.textPrimary },
  filterSep: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },

  idle: { padding: spacing.lg, gap: spacing.lg },
  historySection: { gap: 2 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  historyTitle: { ...typography.label, color: colors.textSecondary },
  clearHistory: { ...typography.caption, color: colors.brandSoft },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyIcon: { fontSize: 14 },
  historyText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipText: { ...typography.caption, color: colors.textPrimary },

  center: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryText: { ...typography.caption, color: colors.textPrimary },

  results: { padding: spacing.md, gap: spacing.md },
  reason: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
});
