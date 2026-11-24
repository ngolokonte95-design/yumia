/**
 * Générateur d'itinéraire IA — Date, Famille, Voyage, Amis, Solo.
 * Chaque mode a un prompt contextuel côté backend. Les étapes sont liées aux
 * vrais lieux YUMIA quand disponibles.
 *
 * Mise en scène (17/11/2026) : une seule couleur d'accent, le dégradé de
 * marque (plus de couleur par humeur) ; grandes cartes d'humeur, attente IA
 * animée (GeneratingView), résultat en frise verticale dont la ligne se
 * dessine étape après étape (ItineraryTimeline).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView,
  Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../lib/auth-context';
import { colors, elevation, gradients, radius, spacing, typography } from '../theme/tokens';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { haptics } from '../lib/useHaptics';
import { BUDGETS, DURATIONS, WEEK_DURATION, findBudget, type Budget, type Duration } from '../components/itinerary/options';
import { ItinerarySummary, ItineraryTimeline, stepsTimeRange } from '../components/itinerary/ItineraryTimeline';
import { GeneratingView } from '../components/itinerary/GeneratingView';
import { API_BASE_URL } from '../lib/config';
import { placeStore } from '../lib/place-store';
import { resolvePlaceByName } from '../lib/places-api';
import { saveItinerary } from '../lib/itinerary-api';
import { MOOD_META, MOODS, type Mood } from '../lib/itinerary-meta';
import { useCitySearch } from '../lib/useCitySearch';
import { useI18n } from '../lib/useI18n';
import { usePlanLimits } from '../lib/usePlanLimits';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import { DayDetailModal, type DayMoment } from '../components/DayDetailModal';
import { itineraryMoodLabel, itineraryMoodSub } from '../lib/labelHelpers';
import type { CitySuggestion } from '../lib/services/weather';
import { FeatureTip } from '../components/FeatureTip';
import { useKeyboardReveal } from '../lib/useKeyboardReveal';
import { ensureAiConsent } from '../lib/ai-consent';

const API = API_BASE_URL;

interface Step {
  time: string;
  type: string;
  name: string;
  description: string;
  duration: string;
  emoji: string;
  tips?: string;
  placeId?: string;
  placeRating?: number;
  placePhoto?: string;
  placeLat?: number;
  placeLng?: number;
  placeName?: string;
  noPlace?: boolean;
  moments?: DayMoment[];
}

export default function ItineraryScreen() {
  const { accessToken } = useAuth();
  // Alias `tr` : ce fichier a déjà une variable locale `t` (handle de
  // setTimeout) plus bas, qui masquerait le `t` de useI18n.
  const { t: tr } = useI18n();

  // Journée ouverte dans le panneau flottant — `null` quand il est fermé.
  const [openDay, setOpenDay] = useState<Step | null>(null);
  // Journée à rouvrir au retour de l'écran d'un lieu ouvert depuis elle :
  // « retour » doit ramener à la journée complète, pas à la semaine.
  // Avec sa position de défilement : on revient au moment d'où l'on est parti.
  const dayToReopen = useRef<{ day: Step; scrollY: number } | null>(null);
  const [reopenScrollY, setReopenScrollY] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!dayToReopen.current) return;
      setReopenScrollY(dayToReopen.current.scrollY);
      setOpenDay(dayToReopen.current.day);
      dayToReopen.current = null;
    }, []),
  );
  const [upsell, setUpsell] = useState<string | null>(null);
  const { checkLimit, recordUsage, quotaMessage } = usePlanLimits();
  // Étape dont on cherche le lieu — le bouton doit montrer qu'il travaille,
  // la recherche par nom passant par le réseau.
  const [openingStep, setOpeningStep] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mood?: string }>();
  const initialMood: Mood = MOODS.includes(params.mood as Mood) ? (params.mood as Mood) : 'amis';

  const [mood, setMood] = useState<Mood>(initialMood);
  const [duration, setDuration] = useState<Duration>('soirée');
  const [budget, setBudget] = useState<Budget>('moyen');
  const [city, setCity] = useState('');
  const [citySuggestOpen, setCitySuggestOpen] = useState(false);
  const { results: citySuggestions, loading: citySearching } = useCitySearch(citySuggestOpen ? city : '');
  const scrollRef = useRef<ScrollViewInstance>(null);
  // « Contraintes » est en bas du formulaire : sans ça, le clavier le
  // recouvrait et l'on écrivait sans voir le texte.
  const kb = useKeyboardReveal(scrollRef);
  const cityFieldY = useRef(0);
  const [constraints, setConstraints] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ itinerary: string; steps: Step[]; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Photos des moments d'une journée, cherchées à son ouverture : les
  // chercher à la génération coûterait une recherche par moment de la
  // semaine, pour deux ou trois journées réellement ouvertes. Une seule
  // tentative par moment (`photoTried`).
  const photoTried = useRef(new Set<string>());
  useEffect(() => {
    const day = openDay;
    const moments = day?.moments ?? [];
    const todo = moments
      .map((m, i) => ({ m, i, key: `${day?.time}|${m.time}|${m.name}` }))
      .filter(({ m, key }) => !m.placePhoto && !photoTried.current.has(key));
    if (!day || todo.length === 0) return;
    todo.forEach(({ key }) => photoTried.current.add(key));

    void Promise.all(
      todo.map(({ m }) => resolvePlaceByName(m.name, city || 'Paris', m.type as never, true)),
    ).then((found) => {
      if (found.every((f) => !f)) return;
      const nextMoments = moments.map((m) => ({ ...m }));
      todo.forEach(({ i }, k) => {
        const f = found[k];
        if (!f) return;
        Object.assign(nextMoments[i], {
          // Le nom du lieu trouvé : pour un intitulé générique (« Un café
          // cosy »), le serveur propose un vrai endroit, et titre et photo
          // doivent désigner le même.
          name: f.name,
          placeName: f.name,
          placeId: f.id,
          placeRating: f.rating,
          placePhoto: f.photoUrls[0],
          placeLat: f.lat,
          placeLng: f.lng,
        });
      });
      const nextDay = { ...day, moments: nextMoments };
      setOpenDay((current) => (current === day ? nextDay : current));
      setResult((r) => (r ? { ...r, steps: r.steps.map((s) => (s === day ? nextDay : s)) } : r));
    });
  }, [openDay, city]);

  const meta = MOOD_META[mood];

  // Fait remonter automatiquement le champ Ville (et ses suggestions) au-dessus
  // du clavier dès qu'elles s'affichent — sans ça l'utilisateur doit scroller
  // manuellement pour les voir.
  useEffect(() => {
    if (citySuggestOpen && city.trim().length >= 2) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, cityFieldY.current - 12), animated: true });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [citySuggestOpen, city, citySuggestions, citySearching]);

  const generate = async () => {
    if (loading) return;

    // L'itinéraire est rédigé par Claude (Anthropic) : accord explicite
    // demandé avant le premier envoi (Apple 5.1.2(i)), et avant le quota.
    if (!(await ensureAiConsent())) {
      setResult({ itinerary: '', steps: [], error: tr('ai_consent_feature_off') });
      return;
    }

    // Quota compté PAR MODE : trois itinéraires en Date n'entament pas les
    // trois de Voyage. C'est la portée passée en troisième argument.
    const { allowed } = await checkLimit('itineraryPerModePerDay', undefined, mood);
    if (!allowed) {
      // Les autres modes gardent leurs trois itinéraires : le message le dit.
      setUpsell(quotaMessage('itineraryPerModePerDay', itineraryMoodLabel(tr, mood, meta.label), true));
      return;
    }

    setCitySuggestOpen(false);
    setLoading(true);
    setResult(null);
    setSaved(false);
    try {
      const res = await fetch(`${API}/itinerary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          mood,
          duration,
          budget,
          city: city.trim() || 'Paris',
          constraints: constraints.trim() || undefined,
        }),
      });
      if (res.ok) {
        setResult(await res.json());
        await recordUsage('itineraryPerModePerDay', mood);
      } else {
        setResult({ itinerary: '', steps: [], error: tr('itin_error_status' as never).replace('{n}', String(res.status)) });
      }
    } catch {
      setResult({ itinerary: '', steps: [], error: tr('itin_error_connection') });
    } finally {
      setLoading(false);
    }
  };

  const shareItinerary = async () => {
    if (!result) return;
    const text = [
      `${meta.emoji} ${tr('itin_share_header')} ${itineraryMoodLabel(tr, mood, meta.label)} — ${city || 'Paris'}`,
      '',
      result.itinerary,
      '',
      ...result.steps.map((s) => `${s.time} ${s.emoji} ${s.name} (${s.duration})\n  ${s.description}`),
      '',
      tr('itin_generated_by'),
    ].join('\n');
    await Share.share({ message: text }).catch(() => undefined);
  };

  const handleSave = async () => {
    if (!result || result.steps.length === 0 || saving || saved || !accessToken) return;
    setSaving(true);
    try {
      await saveItinerary(accessToken, {
        mood, duration, budget, city: city.trim() || 'Paris',
        summary: result.itinerary, steps: result.steps,
      });
      setSaved(true);
    } catch {
      Alert.alert(tr('itin_error_title'), tr('itin_error_save'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Ouvre le lieu d'une étape.
   *
   * Une étape n'arrive avec un `placeId` que si son intitulé correspondait à
   * un lieu déjà en base, ou s'il était assez générique pour qu'on lui en
   * substitue un. Quand l'IA nomme un endroit précis que nous n'avons pas, le
   * backend n'attache plus rien — c'était la source des fiches qui ne
   * parlaient pas du lieu décrit. On le cherche donc ici, au clic.
   */
  const openStepPlace = async (step: Step) => {
    if (step.placeId) { navigateToPlace(step); return; }
    const key = `${step.time}-${step.name}`;
    if (openingStep !== null) return;
    setOpeningStep(key);
    try {
      const found = await resolvePlaceByName(step.name, city || 'Paris', step.type as never);
      if (!found) {
        Alert.alert(tr('itin_place_not_found_title'), tr('itin_place_not_found_body'));
        return;
      }
      navigateToPlace({
        ...step,
        placeName: found.name,
        placeId: found.id,
        placeRating: found.rating,
        placePhoto: found.photoUrls[0],
        placeLat: found.lat,
        placeLng: found.lng,
      });
    } finally {
      setOpeningStep(null);
    }
  };

  const navigateToPlace = (step: Step) => {
    if (!step.placeId) return;
    placeStore.set({
      place: {
        id: step.placeId,
        name: step.placeName || step.name,
        universe: step.type as never,
        location: { lat: step.placeLat ?? 0, lng: step.placeLng ?? 0 },
        city: city || 'Paris',
        countryCode: 'FR',
        rating: step.placeRating ?? 0,
        priceTier: budget === 'premium' ? 4 : budget === 'moyen' ? 2 : 1,
        photoUrls: step.placePhoto ? [step.placePhoto] : [],
        tags: [],
      },
      compatibility: 0,
      distanceMeters: 0,
      reason: `${step.emoji} Étape de votre itinéraire ${itineraryMoodLabel(tr, mood, meta.label)}`,
      engine: 'mood',
    });
    router.push('/place');
  };

  const stepsLabel = tr('si_steps_count').replace('{n}', '').trim();
  const budgetOpt = findBudget(budget);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />

      {/* En-tête sobre : retour, humeur en grand, accès aux itinéraires
          enregistrés et partage. Une seule couleur : celle de la marque. */}
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} style={styles.glassBtn} hitSlop={6}>
          <Text style={styles.glassBtnText}>←</Text>
        </PressableScale>
        <View style={styles.headerText}>
          <Text style={styles.headerKicker} numberOfLines={1}>{meta.emoji}  {itineraryMoodSub(tr, mood, meta.sub)}</Text>
          <GradientText style={styles.headerTitle}>{itineraryMoodLabel(tr, mood, meta.label)}</GradientText>
        </View>
        <PressableScale onPress={() => router.push('/saved-itineraries' as never)} style={styles.savedLink} hitSlop={6}>
          <View style={styles.glassBtn}>
            <Text style={styles.glassBtnText}>📚</Text>
          </View>
          {/* Même libellé que le titre de l'écran, sans son emoji. */}
          <Text style={styles.savedLinkTxt} numberOfLines={1}>
            {tr('si_title').replace(/^[^\p{L}]+/u, '')}
          </Text>
        </PressableScale>
        {result && result.steps.length > 0 ? (
          <PressableScale onPress={() => void shareItinerary()} style={styles.glassBtn} hitSlop={6}>
            <Text style={styles.glassBtnText}>↑</Text>
          </PressableScale>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        onScroll={kb.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 100 + kb.bottomInset }}
      >

        {/* Pour qui ? — grandes cartes, l'active au dégradé de marque. */}
        <Reveal index={0}>
          <Text style={styles.label}>{tr('itin_label_forwho')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moodRow}>
            {MOODS.map((m) => {
              const mm = MOOD_META[m];
              const active = mood === m;
              return (
                <PressableScale
                  key={m}
                  style={[styles.moodCard, active && styles.moodCardActive]}
                  scaleTo={0.94}
                  onPress={() => {
                    if (m !== mood) haptics.select();
                    setMood(m);
                    setCitySuggestOpen(false);
                    // "Semaine" n'a de sens que pour le Voyage — on retombe sur
                    // "journée" si l'utilisateur change de mood en l'ayant choisie.
                    if (m !== 'touriste' && duration === 'semaine') setDuration('journée');
                  }}
                >
                  {active ? (
                    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  ) : null}
                  <Text style={styles.moodEmoji}>{mm.emoji}</Text>
                  <Text style={[styles.moodLabel, active && styles.labelActive]} numberOfLines={1}>{m === 'touriste'
                    // « Mode Voyage » : le premier mot serait « Mode ».
                    ? tr('itinmood_touriste_short')
                    : itineraryMoodLabel(tr, m, mm.label).split(' ')[0]}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </Reveal>

        {/* Durée */}
        <Reveal index={1}>
          <Text style={styles.label}>{tr('itin_label_duration')}</Text>
          <View style={styles.chipGrid}>
            {(mood === 'touriste' ? [...DURATIONS, WEEK_DURATION] : DURATIONS).map((d) => {
              const active = duration === d.key;
              return (
                <PressableScale
                  key={d.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => { if (!active) haptics.select(); setDuration(d.key); setCitySuggestOpen(false); }}
                >
                  {active ? (
                    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  ) : null}
                  <Text style={styles.chipEmoji}>{d.emoji}</Text>
                  <Text style={[styles.chipLabel, active && styles.labelActive]}>{tr(d.labelKey as never)}</Text>
                </PressableScale>
              );
            })}
          </View>
        </Reveal>

        {/* Budget */}
        <Reveal index={2}>
          <Text style={styles.label}>{tr('itin_label_budget')}</Text>
          <View style={styles.chipGrid}>
            {BUDGETS.map((b) => {
              const active = budget === b.key;
              return (
                <PressableScale
                  key={b.key}
                  style={[styles.budgetCard, active && styles.chipActive]}
                  onPress={() => { if (!active) haptics.select(); setBudget(b.key); setCitySuggestOpen(false); }}
                >
                  {active ? (
                    <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  ) : null}
                  <Text style={styles.budgetEmoji}>{b.emoji}</Text>
                  <Text
                    style={[styles.budgetLabel, active && styles.labelActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {tr(b.labelKey as never)}
                  </Text>
                  <Text style={[styles.budgetDesc, active && { color: 'rgba(255,255,255,0.85)' }]}>{b.desc}</Text>
                </PressableScale>
              );
            })}
          </View>
        </Reveal>

        {/* Ville. onLayout sur l'enfant direct du contenu défilant : y est
            alors mesuré depuis le haut du formulaire. Posé sur le libellé
            (dans Reveal), il valait ~0 et chaque lettre tapée faisait
            remonter l'écran tout en haut, le champ passant sous le clavier. */}
        <View onLayout={(e) => { cityFieldY.current = e.nativeEvent.layout.y; }}>
        <Reveal index={3}>
          <Text style={styles.label}>{tr('itin_label_city')}</Text>
          <View>
            <View style={styles.inputWrap}>
              <Text style={styles.inputIcon}>📍</Text>
              <TextInput
                style={styles.input}
                value={city}
                onChangeText={(t) => { setCity(t); setCitySuggestOpen(true); }}
                onFocus={() => setCitySuggestOpen(true)}
                placeholder={tr('itin_city_placeholder')}
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={() => setCitySuggestOpen(false)}
                autoCorrect={false}
              />
            </View>
            {citySuggestOpen && city.trim().length >= 2 ? (
              <View style={styles.citySuggestBox}>
                {citySearching ? (
                  <ActivityIndicator color={colors.brand} size="small" style={{ padding: 12 }} />
                ) : citySuggestions.length === 0 ? (
                  <Text style={styles.citySuggestEmpty}>{tr('itin_no_city_found')}</Text>
                ) : (
                  citySuggestions.map((c: CitySuggestion) => (
                    <Pressable
                      key={c.id}
                      style={styles.citySuggestRow}
                      onPress={() => { setCity(c.name); setCitySuggestOpen(false); }}
                    >
                      <Text style={styles.citySuggestName}>{c.name}</Text>
                      <Text style={styles.citySuggestRegion} numberOfLines={1}>
                        {[c.admin1, c.country].filter(Boolean).join(', ')}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}
          </View>
        </Reveal>
        </View>

        {/* Contraintes */}
        <Reveal index={4}>
          <Text style={styles.label}>{tr('itin_label_constraints')}</Text>
          <TextInput
            style={[styles.inputBox, { height: 72 }]}
            value={constraints}
            onChangeText={setConstraints}
            onFocus={() => setCitySuggestOpen(false)}
            placeholder={tr('itin_constraints_placeholder')}
            placeholderTextColor={colors.textMuted}
            multiline
          />
        </Reveal>

        {/* Bouton générer */}
        <Reveal index={5}>
          <PressableScale
            style={[styles.generateBtn, loading && { opacity: 0.75 }]}
            onPress={() => void generate()}
            disabled={loading}
            scaleTo={0.97}
            haptic
          >
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={gradients.glassSheen} style={StyleSheet.absoluteFill} />
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.generateBtnText}>{tr('itin_generating')}</Text>
              </View>
            ) : (
              <Text style={styles.generateBtnText}>{tr('itin_generate_btn')}</Text>
            )}
          </PressableScale>
        </Reveal>

        {/* Attente de l'IA */}
        {loading ? <GeneratingView label={tr('itin_generating')} /> : null}

        {/* Résultat */}
        {result?.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {result.error}</Text>
            <PressableScale onPress={() => void generate()} style={styles.retryBtn}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.retryText}>{tr('itin_retry')}</Text>
            </PressableScale>
          </View>
        ) : result && result.steps.length > 0 ? (
          <View style={styles.result}>
            <ItinerarySummary
              summary={result.itinerary}
              stepCount={result.steps.length}
              timeRange={stepsTimeRange(result.steps)}
              stepsLabel={stepsLabel}
              budget={budgetOpt ? { emoji: budgetOpt.emoji, label: tr(budgetOpt.labelKey as never) } : undefined}
            />

            <ItineraryTimeline
              steps={result.steps}
              renderActions={(step) => (
                <>
                  {/* Journée de séjour (mode semaine) : ce n'est pas un lieu,
                      on n'en propose pas — « voir la journée complète » mène à
                      ses moments, qui eux en sont. */}
                  {/* Une balade dans un quartier n'est pas un lieu : chercher
                      un lieu à son nom ouvrait une fiche au hasard. */}
                  {!step.moments?.length && !step.noPlace ? (
                    <PressableScale
                      style={[styles.placeBtn, openingStep !== null && { opacity: 0.6 }]}
                      onPress={() => void openStepPlace(step)}
                      disabled={openingStep !== null}
                    >
                      {openingStep === `${step.time}-${step.name}` ? (
                        <ActivityIndicator size="small" color={colors.brand} />
                      ) : (
                        <Text style={styles.placeBtnText}>{tr('itin_see_place')}</Text>
                      )}
                    </PressableScale>
                  ) : null}

                  {/* Mode semaine : la description couvre la journée entière,
                      ce bouton la déroule moment par moment. */}
                  {step.moments?.length ? (
                    <PressableScale style={styles.dayBtn} onPress={() => setOpenDay(step)}>
                      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <Text style={styles.dayBtnText}>{tr('itin_see_full_day')}</Text>
                    </PressableScale>
                  ) : null}
                </>
              )}
            />

            {/* Actions en bas */}
            <View style={styles.bottomActions}>
              <PressableScale
                style={[styles.actionBtn, saving && { opacity: 0.7 }]}
                onPress={() => void handleSave()}
                disabled={saving || saved}
                haptic
              >
                {saved ? (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.success }]} />
                ) : (
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                )}
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionBtnText}>{saved ? tr('itin_saved') : tr('itin_save')}</Text>
                )}
              </PressableScale>
              <PressableScale style={[styles.actionBtn, styles.actionBtnGlass]} onPress={() => void shareItinerary()}>
                <Text style={styles.actionBtnText}>{tr('itin_share')}</Text>
              </PressableScale>
            </View>
            <PressableScale style={styles.actionBtnOutline} onPress={() => { setResult(null); void generate(); }}>
              <GradientText style={styles.actionBtnOutlineText}>{tr('itin_new')}</GradientText>
            </PressableScale>
          </View>
        ) : null}
      </ScrollView>
      <DayDetailModal
        visible={openDay !== null}
        onClose={() => { setOpenDay(null); setReopenScrollY(0); }}
        restoreScrollY={reopenScrollY}
        day={openDay}
        accent={colors.brand}
        seePlaceLabel={tr('itin_see_place')}
        closeLabel={tr('itin_close_day')}
        onOpenPlace={async (moment, scrollY) => {
          // Un moment n'a un `placeId` que si son nom correspondait à un lieu
          // déjà en base. Sinon on le cherche maintenant, par son nom : le
          // faire à la génération coûterait une vingtaine de recherches par
          // itinéraire, pour deux ou trois réellement consultées.
          let target = moment as Step;
          if (!moment.placeId) {
            const found = await resolvePlaceByName(moment.name, city, moment.type as never);
            if (!found) {
              Alert.alert(tr('itin_place_not_found_title'), tr('itin_place_not_found_body'));
              return;
            }
            target = {
              ...(moment as Step),
              placeName: found.name,
              placeId: found.id,
              placeRating: found.rating,
              placePhoto: found.photoUrls[0],
              placeLat: found.lat,
              placeLng: found.lng,
            };
          }
          // On ferme avant de naviguer (une feuille ouverte resterait par-dessus
          // l'écran du lieu), et on la rouvre au retour.
          if (openDay) dayToReopen.current = { day: openDay, scrollY };
          setOpenDay(null);
          navigateToPlace(target);
        }}
      />

      <FeatureTip feature="itinerary" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // En-tête
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  glassBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  glassBtnText: { fontSize: 18, color: colors.textPrimary, fontWeight: '800' },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  headerKicker: { ...typography.caption, color: colors.textSecondary },
  headerTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  savedLink: { alignItems: 'center', gap: 3, maxWidth: 84 },
  savedLinkTxt: { fontSize: 10, color: colors.textSecondary, fontWeight: '700', textAlign: 'center' },

  label: {
    ...typography.label, color: colors.textSecondary, fontSize: 12, letterSpacing: 1.6,
    textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: 10,
  },
  labelActive: { color: '#fff' },

  // Pour qui ?
  moodRow: { gap: 10, paddingRight: spacing.md },
  moodCard: {
    width: 92, height: 92, borderRadius: radius.lg, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  moodCardActive: { borderColor: 'rgba(255,255,255,0.35)', ...elevation.glowBrand },
  moodEmoji: { fontSize: 28 },
  moodLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '800', paddingHorizontal: 4 },

  // Durée & budget
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden',
    backgroundColor: colors.surface, borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  chipActive: { borderColor: 'rgba(255,255,255,0.35)' },
  chipEmoji: { fontSize: 16 },
  chipLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  budgetCard: {
    flexGrow: 1, flexBasis: '30%', overflow: 'hidden',
    alignItems: 'center', gap: 3, paddingVertical: 12, paddingHorizontal: 8,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  budgetEmoji: { fontSize: 22 },
  budgetLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '800' },
  budgetDesc: { fontSize: 10, color: colors.textMuted },

  // Champs
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  inputIcon: { fontSize: 15 },
  input: { flex: 1, paddingVertical: 13, paddingRight: 12, color: colors.text, fontSize: 15 },
  inputBox: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 13,
    color: colors.text, fontSize: 15, textAlignVertical: 'top',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  citySuggestBox: {
    marginTop: 6, maxHeight: 220, overflow: 'hidden',
    backgroundColor: colors.surfaceElevated, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  citySuggestEmpty: { padding: 12, fontSize: 13, color: colors.textMuted },
  citySuggestRow: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  citySuggestName: { fontSize: 14, fontWeight: '700', color: colors.text },
  citySuggestRegion: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  // Générer
  generateBtn: {
    marginTop: spacing.xl, borderRadius: radius.pill, overflow: 'hidden',
    paddingVertical: 17, alignItems: 'center', justifyContent: 'center',
    ...elevation.glowBrand,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  generateBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 0.2 },

  // Erreur
  errorBox: {
    marginTop: spacing.lg, padding: spacing.md, gap: 12, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: `${colors.danger}66`,
  },
  errorText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  retryBtn: { borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', overflow: 'hidden' },
  retryText: { color: '#fff', fontWeight: '800' },

  // Résultat
  result: { marginTop: spacing.xl },
  placeBtn: {
    marginTop: 6, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: `${colors.brand}88`,
  },
  placeBtnText: { fontSize: 13, fontWeight: '800', color: colors.brandSoft },
  dayBtn: { borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: 6, overflow: 'hidden' },
  dayBtnText: { ...typography.label, color: '#fff', fontSize: 13, fontWeight: '800' },

  bottomActions: { flexDirection: 'row', gap: 12, marginTop: spacing.sm },
  actionBtn: {
    flex: 1, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  actionBtnGlass: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  actionBtnOutline: {
    marginTop: spacing.sm, marginBottom: spacing.lg, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: colors.surface,
  },
  actionBtnOutlineText: { fontWeight: '800', fontSize: 15 },
});
