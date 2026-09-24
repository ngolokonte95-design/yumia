/**
 * VISITES GUIDÉES — les visites les mieux notées d'une ville, réservables chez
 * nos partenaires (Viator, GetYourGuide). Branché sur GET /affiliates/tours.
 *
 * Sert aussi aux onglets « Réserve chez nos partenaires » d'Explorer
 * (`?theme=skip_the_line`, `food_tours`…) : même écran, filtré par sujet.
 *
 * Remplace les « guides locaux » : des personnes fictives, créées par un script
 * de démonstration, avec note et label « certifié » inventés, et une
 * réservation qui n'était transmise à personne.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchGuidedTours, fetchTourCities, type GuidedTours, type TourListing } from '../lib/affiliates-api';
import { useI18n } from '../lib/useI18n';
import { QUICK_FILTERS, THEME_FACETS, THEME_TITLES } from '../lib/tour-themes';
import type { TranslationKey } from '../lib/translations';

const PARTNER_NAMES: Record<string, string> = { viator: 'Viator', getyourguide: 'GetYourGuide' };


function formatDuration(min: number | null): string | null {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function formatPrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${Math.round(value)} ${currency}`;
  }
}

export default function GuidesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();
  const { city: locCity } = useLocation();
  const { city: paramCity, theme: paramTheme } = useLocalSearchParams<{ city?: string; theme?: string }>();
  const theme = paramTheme && THEME_TITLES[paramTheme] ? paramTheme : undefined;
  const title = theme ? `${THEME_TITLES[theme].emoji} ${t(THEME_TITLES[theme].labelKey)}` : t('gd_title');

  const [query, setQuery] = useState(paramCity ?? locCity ?? 'Paris');
  const [result, setResult] = useState<GuidedTours | null>(null);
  const [loading, setLoading] = useState(false);
  // Style de sortie choisi dans les puces (Spectacles : boîte de nuit,
  // cabaret…). `undefined` = tous.
  const facets = THEME_FACETS[theme ?? 'guides'];
  const [facet, setFacet] = useState<string | undefined>();
  // Filtres pratiques (budget, durée, note, annulation) : plusieurs à la fois.
  const [quick, setQuick] = useState<string[]>([]);
  // Recherche libre (« bowling ») : pour trouver ce qu'aucun filtre ne couvre.
  const [what, setWhat] = useState('');
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  // Suggestions de villes pendant la saisie. `typing` ne passe à vrai qu'à la
  // frappe : choisir une suggestion remplit le champ sans rouvrir la liste.
  const [typing, setTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; label: string }[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!typing || !accessToken || q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      fetchTourCities(q, accessToken)
        .then((c) => { if (!cancelled) setSuggestions(c); })
        .catch(() => { if (!cancelled) setSuggestions([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query, typing, accessToken]);

  const search = (city: string) => {
    setTyping(false);
    setSuggestions([]);
    void load(city);
  };

  const load = useCallback(async (
    city: string,
    f: string | undefined = facet,
    q: string[] = quick,
    w: string = what,
  ) => {
    const c = city.trim();
    if (!c || !accessToken) return;
    setLoading(true);
    setPage(1);
    try {
      setResult(await fetchGuidedTours(c, accessToken, theme, f, q, { q: w.trim() || undefined }));
    } catch {
      setResult({ city: c, tours: [], links: [], hasMore: false, alt: false });
    } finally {
      setLoading(false);
    }
  }, [accessToken, theme, facet, quick, what]);

  /** « Voir plus » : page suivante, ajoutée à la liste. */
  const loadMore = async () => {
    if (!result || !accessToken || loadingMore || !result.hasMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchGuidedTours(result.city, accessToken, theme, facet, quick, {
        q: what.trim() || undefined, page: page + 1, alt: result.alt,
      });
      const seen = new Set(result.tours.map((t) => t.url));
      setResult({ ...result, tours: [...result.tours, ...next.tours.filter((t) => !seen.has(t.url))], hasMore: next.hasMore });
      setPage(page + 1);
    } catch {
      setResult({ ...result, hasMore: false });
    } finally {
      setLoadingMore(false);
    }
  };

  /** Recherche libre : elle remplace le style choisi, qui repasse sur « Tous ». */
  const searchWhat = (w: string) => {
    setWhat(w);
    setFacet(undefined);
    void load(query, undefined, quick, w);
  };

  useEffect(() => { void load(query); /* chargement initial */ }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (url: string) => { void Linking.openURL(url); };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{t('gd_subtitle')}</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('gd_city_placeholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={(v) => { setQuery(v); setTyping(true); }}
          returnKeyType="search"
          onSubmitEditing={() => search(query)}
          autoCorrect={false}
        />
        <Pressable style={styles.searchBtn} onPress={() => search(query)}>
          <Text style={styles.searchBtnText}>{t('gd_search')}</Text>
        </Pressable>
      </View>

      <View style={styles.whatRow}>
        <Text style={styles.whatIcon}>🔍</Text>
        <TextInput
          style={styles.whatInput}
          placeholder={t(`gd_what_${theme ?? 'guides'}` as TranslationKey)}
          placeholderTextColor={colors.textMuted}
          value={what}
          onChangeText={setWhat}
          returnKeyType="search"
          onSubmitEditing={() => searchWhat(what)}
          autoCorrect={false}
        />
        {what.length > 0 && (
          <Pressable onPress={() => searchWhat('')} hitSlop={8}>
            <Text style={styles.whatClear}>✕</Text>
          </Pressable>
        )}
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestBox}>
          {suggestions.map((c, i) => (
            <Pressable
              key={c.label}
              style={[styles.suggestRow, i > 0 && styles.suggestDivider]}
              onPress={() => { setQuery(c.name); search(c.name); }}
            >
              <Text style={styles.suggestIcon}>📍</Text>
              <Text style={styles.suggestText} numberOfLines={1}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {facets && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.facetScroll}
          contentContainerStyle={styles.facetRow}
        >
          {[{ key: undefined as string | undefined, label: t('facet_all') },
            ...facets.map((f) => ({ key: f.key as string | undefined, label: `${f.emoji} ${t(f.labelKey)}` }))].map((f) => {
            const active = facet === f.key;
            return (
              <Pressable
                key={f.key ?? 'all'}
                style={[styles.facetChip, active && styles.facetChipActive]}
                onPress={() => { setFacet(f.key); setWhat(''); void load(query, f.key, quick, ''); }}
              >
                <Text style={[styles.facetTxt, active && styles.facetTxtActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.facetScroll}
        contentContainerStyle={styles.facetRow}
      >
        {QUICK_FILTERS.map((f) => {
          const active = quick.includes(f.key);
          return (
            <Pressable
              key={f.key}
              style={[styles.quickChip, active && styles.quickChipActive]}
              onPress={() => {
                const next = active ? quick.filter((k) => k !== f.key) : [...quick, f.key];
                setQuick(next);
                void load(query, facet, next);
              }}
            >
              <Text style={[styles.quickTxt, active && styles.quickTxtActive]}>{f.emoji} {t(f.labelKey)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}>
          {result && result.tours.length === 0 && (
            <Text style={styles.empty}>{t('gd_empty').replace('{city}', result.city)}</Text>
          )}

          {result?.tours.map((tour, i) => (
            <TourCard key={`${tour.url}-${i}`} tour={tour} onPress={() => open(tour.url)} />
          ))}

          {result?.hasMore && (
            <Pressable style={styles.moreBtn} onPress={() => void loadMore()} disabled={loadingMore}>
              {loadingMore
                ? <ActivityIndicator color={colors.brand} />
                : <Text style={styles.moreTxt}>{t('gd_load_more')}</Text>}
            </Pressable>
          )}

          {result && result.links.length > 0 && (
            <View style={styles.linksBlock}>
              {result.links.map((l) => (
                <Pressable key={l.provider} style={styles.partnerBtn} onPress={() => open(l.url)}>
                  <Text style={styles.partnerBtnText}>
                    {t('gd_more').replace('{partner}', PARTNER_NAMES[l.provider] ?? l.provider)} ↗
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Mention d'affiliation : l'utilisateur doit savoir que la
              réservation se fait chez un tiers, et que nous sommes rémunérés. */}
          {result && (result.tours.length > 0 || result.links.length > 0) && (
            <Text style={styles.disclosure}>{t('gd_partner_note')}</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function TourCard({ tour, onPress }: { tour: TourListing; onPress: () => void }) {
  const { t } = useI18n();
  const duration = formatDuration(tour.durationMinutes);
  const meta = [
    tour.rating != null ? `⭐ ${tour.rating.toFixed(1)} (${t('gd_reviews').replace('{count}', String(tour.reviewCount))})` : null,
    duration ? `⏱ ${duration}` : null,
    tour.freeCancellation ? `✅ ${t('quick_free_cancel')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {tour.imageUrl ? (
        <Image source={{ uri: tour.imageUrl }} style={styles.cardImage} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}><Text style={{ fontSize: 32 }}>🧭</Text></View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{tour.title}</Text>
        {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
        <View style={styles.cardFooter}>
          {tour.fromPrice != null ? (
            <Text style={styles.cardPrice}>{t('gd_from').replace('{price}', formatPrice(tour.fromPrice, tour.currency))}</Text>
          ) : <View />}
          <Text style={styles.cardPartner}>{PARTNER_NAMES[tour.provider]} ↗</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  backBtn: { paddingTop: 2 },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 24 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  searchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  searchInput: {
    flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 44, ...typography.body, color: colors.textPrimary,
  },
  searchBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  searchBtnText: { ...typography.caption, color: '#fff', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // flexShrink: 0 — sans lui, la liste en dessous (flex: 1) écrase la rangée
  // et coupe les puces à mi-hauteur.
  whatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: spacing.md,
  },
  whatIcon: { fontSize: 13 },
  whatInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 9 },
  whatClear: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },
  moreBtn: {
    alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.brand,
  },
  moreTxt: { ...typography.body, color: colors.brandSoft, fontWeight: '700' },
  facetScroll: { flexGrow: 0, flexShrink: 0, marginBottom: spacing.sm },
  facetRow: { gap: 6, paddingHorizontal: spacing.md, alignItems: 'center' },
  facetChip: {
    backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7,
  },
  facetChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  facetTxt: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  facetTxtActive: { color: '#fff' },
  // Filtres pratiques : contour plutôt que fond plein, pour les distinguer
  // d'un coup d'œil des styles (un seul choix) — ceux-ci se cumulent.
  quickChip: {
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 11, paddingVertical: 5,
  },
  quickChipActive: { borderColor: colors.brand, backgroundColor: `${colors.brand}22` },
  quickTxt: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  quickTxtActive: { color: colors.brandSoft },
  suggestBox: {
    marginHorizontal: spacing.md, marginTop: -spacing.xs, marginBottom: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 12 },
  suggestDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  suggestIcon: { fontSize: 14 },
  suggestText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  cardImage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.surfaceElevated },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: spacing.md, gap: 4 },
  cardTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  cardMeta: { ...typography.caption, color: colors.textSecondary },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  cardPrice: { ...typography.body, color: colors.brandSoft, fontWeight: '800' },
  cardPartner: { ...typography.caption, color: colors.textMuted },

  linksBlock: { gap: spacing.sm, marginTop: spacing.sm },
  partnerBtn: {
    backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center',
  },
  partnerBtnText: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  disclosure: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
});
