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
 *
 * Mise en scène (18/11/2026) : en-tête au dégradé de marque, recherche en
 * verre, visites en grandes cartes photo (partenaire, note réelle, durée,
 * annulation, prix « dès » au dégradé, bouton Réserver). Une seule couleur
 * d'accent ; aucun voile dégradé hors des photos.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, elevation, gradients, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchGuidedTours, fetchTourCities, type GuidedTours, type TourListing } from '../lib/affiliates-api';
import { useI18n } from '../lib/useI18n';
import { openExternalHttps } from '../lib/external-link';
import { QUICK_FILTERS, THEME_FACETS, THEME_TITLES } from '../lib/tour-themes';
import type { TranslationKey } from '../lib/translations';
import { haptics } from '../lib/useHaptics';
import { FeatureTip } from '../components/FeatureTip';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { BrandButton, BrandChip } from '../components/social/SocialChrome';
import {
  GLASS_SURFACE, GlassPill, P2Empty, P2Header, SkeletonCard, ToggleChip,
} from '../components/p2c/P2Visuals';

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

  /** Numéro de la dernière recherche : une réponse plus ancienne, arrivée en
   *  retard, ne doit pas écraser celle de la catégorie choisie ensuite. */
  const requestSeq = useRef(0);

  /**
   * `f` : `null` = « Tous ». Surtout pas `undefined` : un paramètre par défaut
   * s'applique quand on passe `undefined`, et « Tous » rechargeait alors la
   * catégorie précédente (Vélo restait affiché).
   */
  const load = useCallback(async (
    city: string,
    f: string | null = facet ?? null,
    q: string[] = quick,
    w: string = what,
  ) => {
    const c = city.trim();
    if (!c || !accessToken) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setPage(1);
    try {
      const next = await fetchGuidedTours(c, accessToken, theme, f ?? undefined, q, { q: w.trim() || undefined });
      if (seq === requestSeq.current) setResult(next);
    } catch {
      if (seq === requestSeq.current) setResult({ city: c, tours: [], links: [], hasMore: false, alt: false });
    } finally {
      if (seq === requestSeq.current) setLoading(false);
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
    void load(query, null, quick, w);
  };

  useEffect(() => { void load(query); /* chargement initial */ }, [accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (url: string) => { void openExternalHttps(url).catch(() => {}); };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <P2Header title={title} subtitle={t('gd_subtitle')} onBack={() => router.back()} />

      {/* Ville : pastille de verre + bouton au dégradé. */}
      <View style={styles.searchRow}>
        <View style={styles.cityField}>
          <Text style={styles.fieldIcon}>📍</Text>
          <TextInput
            style={styles.cityInput}
            placeholder={t('gd_city_placeholder')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={(v) => { setQuery(v); setTyping(true); }}
            returnKeyType="search"
            onSubmitEditing={() => search(query)}
            autoCorrect={false}
          />
        </View>
        <BrandButton label={t('gd_search')} onPress={() => search(query)} compact style={styles.searchBtn} />
      </View>

      <View style={styles.whatRow}>
        <Text style={styles.fieldIcon}>🔍</Text>
        <TextInput
          style={styles.whatInput}
          placeholder={t(`gd_what_${theme ?? 'guides'}` as TranslationKey)}
          placeholderTextColor={colors.textMuted}
          // Android : sans hauteur fixe ni numberOfLines, un placeholder plus
          // long que le champ passe à la ligne, et le haut de la 2e ligne
          // dépasse sous le padding (on voyait des « ''' » sous le texte).
          numberOfLines={1}
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

      {/* Style de sortie : un seul choix, pastille pleine au dégradé. */}
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
              <BrandChip
                key={f.key ?? 'all'}
                label={f.label}
                active={active}
                onPress={() => { haptics.select(); setFacet(f.key); setWhat(''); void load(query, f.key ?? null, quick, ''); }}
              />
            );
          })}
        </ScrollView>
      )}

      {/* Filtres pratiques : cumulables, en contour. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.facetScroll}
        contentContainerStyle={styles.facetRow}
      >
        {QUICK_FILTERS.map((f) => {
          const active = quick.includes(f.key);
          return (
            <ToggleChip
              key={f.key}
              label={`${f.emoji} ${t(f.labelKey)}`}
              active={active}
              onPress={() => {
                haptics.select();
                const next = active ? quick.filter((k) => k !== f.key) : [...quick, f.key];
                setQuick(next);
                void load(query, facet, next);
              }}
            />
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.skeletons}>
          <SkeletonCard height={300} />
          <SkeletonCard height={300} />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.lg }}
        >
          {result && result.tours.length === 0 && (
            <P2Empty emoji="🧭" text={t('gd_empty').replace('{city}', result.city)} />
          )}

          {result?.tours.map((tour, i) => (
            <Reveal key={`${tour.url}-${i}`} index={Math.min(i, 5)}>
              <TourCard tour={tour} onPress={() => open(tour.url)} />
            </Reveal>
          ))}

          {result?.hasMore && (
            <PressableScale style={styles.moreBtn} onPress={() => void loadMore()} disabled={loadingMore}>
              {loadingMore
                ? <ActivityIndicator color={colors.brand} />
                : <Text style={styles.moreTxt}>{t('gd_load_more')}</Text>}
            </PressableScale>
          )}

          {result && result.links.length > 0 && (
            <View style={styles.linksBlock}>
              {result.links.map((l) => (
                <PressableScale key={l.provider} style={styles.partnerBtn} onPress={() => open(l.url)}>
                  <Text style={styles.partnerBtnText}>
                    {t('gd_more').replace('{partner}', PARTNER_NAMES[l.provider] ?? l.provider)} ↗
                  </Text>
                </PressableScale>
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
      <FeatureTip feature="tours" />
    </View>
  );
}

/**
 * Carte de visite : grande photo (voile limité à la photo, pour lire le titre),
 * pastilles du partenaire et de la note réelle, durée et annulation, prix
 * « dès » au dégradé et bouton Réserver. Toutes les données viennent du
 * partenaire ; rien n'est affiché quand il ne l'a pas fourni.
 */
function TourCard({ tour, onPress }: { tour: TourListing; onPress: () => void }) {
  const { t } = useI18n();
  const duration = formatDuration(tour.durationMinutes);
  const rating = tour.rating != null
    ? `⭐ ${tour.rating.toFixed(1)} (${t('gd_reviews').replace('{count}', String(tour.reviewCount))})`
    : null;

  return (
    <PressableScale style={styles.card} onPress={onPress} scaleTo={0.97}>
      <View style={styles.cardPhoto}>
        {tour.imageUrl ? (
          <Image source={{ uri: tour.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        ) : (
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.cardPhotoEmpty]}>
            <Text style={styles.cardPhotoEmoji}>🧭</Text>
          </LinearGradient>
        )}
        {/* Voile confiné à la photo : lisibilité du titre posé dessus. */}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.cardTop}>
          <GlassPill label={`${PARTNER_NAMES[tour.provider] ?? tour.provider} ↗`} />
          {rating ? <GlassPill label={rating} /> : null}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>{tour.title}</Text>
      </View>

      <View style={styles.cardBody}>
        {(duration || tour.freeCancellation) ? (
          <View style={styles.cardChips}>
            {duration ? <Text style={styles.cardChip}>⏱ {duration}</Text> : null}
            {tour.freeCancellation ? <Text style={styles.cardChip}>✅ {t('quick_free_cancel')}</Text> : null}
          </View>
        ) : null}
        <View style={styles.cardFooter}>
          {tour.fromPrice != null ? (
            <GradientText style={styles.cardPrice}>
              {t('gd_from').replace('{price}', formatPrice(tour.fromPrice, tour.currency))}
            </GradientText>
          ) : <View />}
          <BrandButton label={`${t('sor_book')} ↗`} onPress={onPress} compact />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  searchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, alignItems: 'center' },
  cityField: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, ...GLASS_SURFACE,
  },
  fieldIcon: { fontSize: 14 },
  cityInput: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary, height: 46, paddingVertical: 0 },
  searchBtn: { height: 46 },
  // flexShrink: 0 — sans lui, la liste en dessous (flex: 1) écrase la rangée
  // et coupe les puces à mi-hauteur.
  whatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, ...GLASS_SURFACE,
  },
  whatInput: { flex: 1, color: colors.textPrimary, fontSize: 14, height: 42, paddingVertical: 0 },
  whatClear: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 4 },

  facetScroll: { flexGrow: 0, flexShrink: 0, marginBottom: spacing.sm },
  facetRow: { gap: 8, paddingHorizontal: spacing.md, alignItems: 'center' },

  suggestBox: {
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    borderRadius: radius.lg, overflow: 'hidden', backgroundColor: 'rgba(23,23,31,0.96)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    ...elevation.medium,
  },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 12 },
  suggestDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  suggestIcon: { fontSize: 14 },
  suggestText: { ...typography.body, color: colors.textPrimary, flex: 1 },

  skeletons: { padding: spacing.md, gap: spacing.lg },

  moreBtn: {
    alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: colors.brand, backgroundColor: 'rgba(232,98,26,0.08)',
  },
  moreTxt: { fontSize: 15, color: colors.brandSoft, fontWeight: '800' },

  card: { borderRadius: radius.xl, overflow: 'hidden', ...GLASS_SURFACE },
  cardPhoto: { height: 230, justifyContent: 'space-between', padding: spacing.md, overflow: 'hidden' },
  cardPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardPhotoEmoji: { fontSize: 56 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  cardTitle: {
    color: '#fff', fontSize: 21, fontWeight: '900', letterSpacing: -0.3, lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 1 },
  },
  cardBody: { padding: spacing.md, gap: spacing.sm },
  cardChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cardChip: {
    color: colors.textSecondary, fontSize: 12, fontWeight: '700', overflow: 'hidden',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  cardPrice: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },

  linksBlock: { gap: spacing.sm, marginTop: spacing.xs },
  partnerBtn: { borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center', ...GLASS_SURFACE },
  partnerBtnText: { fontSize: 15, color: colors.textPrimary, fontWeight: '800' },
  disclosure: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, lineHeight: 18 },
});
