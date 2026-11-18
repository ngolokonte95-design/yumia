/**
 * SEARCH — écran de recherche conversationnelle.
 * L'utilisateur tape en langage naturel ; l'IA mood interprète et renvoie
 * les 3 meilleures adresses contextuelles.
 *
 * DA (18/11/2026) : recherche en pilule vitrée (liseré de marque au focus),
 * filtres d'univers en pastilles qui se remplissent du dégradé, historique en
 * groupe vitré, idées en pastilles en cascade, explication de l'IA en carte
 * ✨, résultats en cascade. Logique inchangée.
 */
import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import type { TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UNIVERSES, UNIVERSE_META } from '@yumia/shared';
import type { Universe } from '@yumia/shared';
import { universeLabel } from '../lib/universeMeta';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { useI18n } from '../lib/useI18n';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import { useSaved } from '../lib/useSaved';
import { searchPlaces } from '../lib/search-api';
import { recordVisit } from '../lib/passport-api';
import { placeStore } from '../lib/place-store';
import { useSearchHistory } from '../lib/useSearchHistory';
import { SuggestionCard } from '../components/SuggestionCard';
import type { Top3Response } from '../lib/api';
import type { TranslationKey } from '../lib/translations';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { BrandButton, BrandChip, GlassIconButton, SocialEmpty } from '../components/social/SocialChrome';
import { GlassGroup, SectionLabel } from '../components/profile/ProfileChrome';
import { BACK_ICON, GLASS_CARD, IconMedal, SearchPill } from '../components/p2a/P2Chrome';
import { haptics } from '../lib/useHaptics';

const SUGGESTIONS_PROMPT_KEYS: TranslationKey[] = [
  'srch_prompt_brunch',
  'srch_prompt_culture',
  'srch_prompt_park',
  'srch_prompt_bar',
  'srch_prompt_asian',
  'srch_prompt_night',
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
  const inputRef = useRef<TextInputInstance>(null);
  const { history, push: pushHistory, clear: clearHistory } = useSearchHistory();
  const [upsell, setUpsell] = useState<string | null>(null);
  const { checkLimit, recordUsage, quotaMessage, savedLimitMessage } = usePlanLimits();

  const handleSearch = useCallback(async (q: string, uFilter = universeFilter, pFilter = maxPriceTier) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    Keyboard.dismiss();

    // Le quota porte sur les RÉPONSES : une recherche qui échoue ne compte
    // pas, elle est décomptée seulement une fois le résultat obtenu.
    const { allowed } = await checkLimit('desirePerDay');
    if (!allowed) { setUpsell(quotaMessage('desirePerDay', t('search_title'))); return; }

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
      await recordUsage('desirePerDay');
      void pushHistory(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('srch_generic_error'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, coords, user, pushHistory, universeFilter, maxPriceTier, checkLimit, recordUsage, quotaMessage, t]);

  function handleChip(chip: string) {
    const clean = chip.replace(/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF} ]+/gu, '').trim();
    setQuery(clean);
    void handleSearch(clean);
  }

  const hasQuery = query.trim().length > 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
      {/* En-tête : retour en verre + recherche en pilule */}
      <View style={styles.header}>
        <GlassIconButton icon={BACK_ICON} onPress={() => router.back()} />
        <SearchPill
          inputRef={inputRef}
          style={styles.searchPill}
          placeholder={t('search_placeholder')}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void handleSearch(query)}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          onClear={hasQuery
            ? () => { setQuery(''); setResult(null); setError(null); inputRef.current?.focus(); }
            : undefined}
        />
      </View>

      {/* Filtres d'univers : pastilles qui se remplissent du dégradé */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.filterBar}
        contentContainerStyle={styles.filterRow}
      >
        {UNIVERSES.map((u) => {
          const active = universeFilter === u;
          const meta = UNIVERSE_META[u];
          return (
            <BrandChip
              key={u}
              active={active}
              label={`${meta.emoji} ${universeLabel(t, u)}`}
              onPress={() => {
                haptics.select();
                const next = active ? null : u;
                setUniverseFilter(next);
                if (query.trim()) void handleSearch(query, next, maxPriceTier);
              }}
            />
          );
        })}
      </ScrollView>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <PremiumUpsellModal visible={limitError !== null} message={limitError !== null ? savedLimitMessage() : ''} onClose={clearLimitError} />

        {/* État vide — historique + idées de recherche */}
        {!loading && !result && !error ? (
          <View style={styles.idle}>
            {history.length > 0 ? (
              <Reveal index={0}>
                <View style={styles.historyHeader}>
                  <SectionLabel label={t('srch_recent')} style={styles.historyLabel} />
                  <PressableScale onPress={() => void clearHistory()} hitSlop={8} scaleTo={0.92}>
                    <Text style={styles.clearHistory}>{t('srch_clear')}</Text>
                  </PressableScale>
                </View>
                <GlassGroup>
                  {history.map((h) => (
                    <PressableScale
                      key={h}
                      scaleTo={0.98}
                      style={styles.historyRow}
                      onPress={() => { setQuery(h); void handleSearch(h); }}
                    >
                      <IconMedal icon="🕐" size={34} />
                      <Text style={styles.historyText} numberOfLines={1}>{h}</Text>
                      <Text style={styles.historyArrow}>↗</Text>
                    </PressableScale>
                  ))}
                </GlassGroup>
              </Reveal>
            ) : null}

            <Reveal index={1} style={styles.ideas}>
              <GradientText style={styles.ideasTitle}>{t('search_title')}</GradientText>
              <Text style={styles.hint}>{t('search_hint')}</Text>
            </Reveal>
            <View style={styles.chips}>
              {SUGGESTIONS_PROMPT_KEYS.map((chipKey, i) => (
                <Reveal key={chipKey} index={i + 2} from="fade">
                  <PressableScale style={styles.chip} scaleTo={0.94} onPress={() => handleChip(t(chipKey))}>
                    <Text style={styles.chipText}>{t(chipKey)}</Text>
                  </PressableScale>
                </Reveal>
              ))}
            </View>
          </View>
        ) : null}

        {/* Chargement */}
        {loading ? (
          <View style={styles.center}>
            <IconMedal icon={<ActivityIndicator color="#fff" />} size={64} lit />
            <GradientText style={styles.loadingText}>{t('search_searching')}</GradientText>
          </View>
        ) : null}

        {/* Erreur */}
        {!loading && error ? (
          <SocialEmpty
            emoji="📡"
            title={error}
            action={<BrandButton label={t('retry')} onPress={() => void handleSearch(query)} compact />}
          />
        ) : null}

        {/* Résultats */}
        {!loading && result ? (
          <View style={styles.results}>
            {result.reason ? (
              <Reveal index={0} style={[styles.reasonCard, GLASS_CARD]}>
                <Text style={styles.reasonIcon}>✨</Text>
                <Text style={styles.reason}>{result.reason}</Text>
              </Reveal>
            ) : null}
            {result.suggestions.length === 0 ? (
              <SocialEmpty emoji="🧭" title={t('search_empty')} />
            ) : (
              result.suggestions.map((s, i) => (
                <Reveal key={s.place.id} index={i + 1}>
                  <SuggestionCard
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
                </Reveal>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchPill: { flex: 1 },

  filterBar: { flexGrow: 0 },
  filterRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },

  idle: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.lg },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyLabel: { marginTop: 0 },
  clearHistory: { ...typography.caption, color: colors.brandSoft, fontWeight: '700', marginBottom: spacing.sm },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  historyText: { ...typography.body, color: colors.textPrimary, fontWeight: '600', flex: 1 },
  historyArrow: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },

  ideas: { alignItems: 'center', gap: 6, marginTop: spacing.sm },
  ideasTitle: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  hint: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  chip: {
    ...GLASS_CARD,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },

  center: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md },
  loadingText: { fontSize: 18, fontWeight: '900', textAlign: 'center' },

  results: { padding: spacing.md, gap: spacing.md },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  reasonIcon: { fontSize: 18 },
  reason: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 22,
  },
});
