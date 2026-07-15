/**
 * Générateur d'itinéraire IA — Date, Famille, Voyage, Amis, Solo.
 * Chaque mode a son identité visuelle et un prompt contextuel côté backend.
 * Les étapes sont liées aux vrais lieux YUMIA quand disponibles.
 */
import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView,
  Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { placeStore } from '../lib/place-store';

const API = API_BASE_URL;

type Mood = 'date' | 'amis' | 'famille' | 'solo' | 'touriste';
type Duration = 'soirée' | 'journée' | 'demi-journée' | 'weekend';
type Budget = 'économique' | 'moyen' | 'premium';

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
}

const MOOD_META: Record<Mood, { emoji: string; label: string; color: string; sub: string }> = {
  date: {
    emoji: '❤️', label: 'Date romantique', color: '#E8385A',
    sub: 'Une soirée inoubliable pour deux',
  },
  famille: {
    emoji: '👨‍👩‍👧', label: 'Sortie famille', color: '#FF8C00',
    sub: 'Des souvenirs pour toute la famille',
  },
  touriste: {
    emoji: '✈️', label: 'Mode Voyage', color: '#0077CC',
    sub: 'Découvre la ville comme un local',
  },
  amis: {
    emoji: '👫', label: 'Sortie entre amis', color: '#6C3FE8',
    sub: 'Une journée mémorable en groupe',
  },
  solo: {
    emoji: '🧘', label: 'Exploration solo', color: '#2AA876',
    sub: 'À ton rythme, à ta façon',
  },
};

const MOODS: Mood[] = ['date', 'amis', 'famille', 'solo', 'touriste'];

const DURATIONS: Array<{ key: Duration; label: string; emoji: string }> = [
  { key: 'demi-journée', label: 'Demi-journée', emoji: '🌤️' },
  { key: 'soirée', label: 'Soirée', emoji: '🌆' },
  { key: 'journée', label: 'Journée complète', emoji: '☀️' },
  { key: 'weekend', label: 'Weekend', emoji: '🗓️' },
];

const BUDGETS: Array<{ key: Budget; emoji: string; label: string; desc: string }> = [
  { key: 'économique', emoji: '💸', label: 'Économique', desc: '< 30€/pers.' },
  { key: 'moyen', emoji: '💶', label: 'Moyen', desc: '30-80€/pers.' },
  { key: 'premium', emoji: '💎', label: 'Premium', desc: '80€+/pers.' },
];

export default function ItineraryScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mood?: string }>();
  const initialMood: Mood = MOODS.includes(params.mood as Mood) ? (params.mood as Mood) : 'amis';

  const [mood, setMood] = useState<Mood>(initialMood);
  const [duration, setDuration] = useState<Duration>('soirée');
  const [budget, setBudget] = useState<Budget>('moyen');
  const [city, setCity] = useState('');
  const [constraints, setConstraints] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ itinerary: string; steps: Step[]; error?: string } | null>(null);

  const meta = MOOD_META[mood];

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
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
      } else {
        setResult({ itinerary: '', steps: [], error: `Erreur ${res.status}. Réessaie.` });
      }
    } catch {
      setResult({ itinerary: '', steps: [], error: 'Connexion impossible. Vérifie ta connexion.' });
    } finally {
      setLoading(false);
    }
  };

  const shareItinerary = async () => {
    if (!result) return;
    const text = [
      `${meta.emoji} Itinéraire ${meta.label} — ${city || 'Paris'}`,
      '',
      result.itinerary,
      '',
      ...result.steps.map((s) => `${s.time} ${s.emoji} ${s.name} (${s.duration})\n  ${s.description}`),
      '',
      '— Généré par YUMIA ✨',
    ].join('\n');
    await Share.share({ message: text }).catch(() => undefined);
  };

  const navigateToPlace = (step: Step) => {
    if (!step.placeId) return;
    placeStore.set({
      place: {
        id: step.placeId,
        name: step.name,
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
      reason: `${step.emoji} Étape de votre itinéraire ${meta.label}`,
      engine: 'mood',
    });
    router.push('/place');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header coloré par mode */}
      <View style={[styles.header, { backgroundColor: meta.color }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{meta.emoji}</Text>
          <View>
            <Text style={styles.headerTitle}>{meta.label}</Text>
            <Text style={styles.headerSub}>{meta.sub}</Text>
          </View>
        </View>
        {result && result.steps.length > 0 && (
          <Pressable onPress={() => void shareItinerary()} style={styles.shareBtn}>
            <Text style={styles.shareIcon}>↑</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 100 }}>

        {/* Sélection du mood */}
        <Text style={styles.label}>Pour qui ?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {MOODS.map((m) => {
            const mm = MOOD_META[m];
            return (
              <Pressable
                key={m}
                style={[styles.moodChip, mood === m && { backgroundColor: MOOD_META[m].color, borderColor: MOOD_META[m].color }]}
                onPress={() => setMood(m)}
              >
                <Text style={styles.moodEmoji}>{mm.emoji}</Text>
                <Text style={[styles.moodLabel, mood === m && styles.moodLabelActive]}>{mm.label.split(' ')[0]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Durée */}
        <Text style={styles.label}>Durée</Text>
        <View style={styles.chipGrid}>
          {DURATIONS.map((d) => (
            <Pressable
              key={d.key}
              style={[styles.durationChip, duration === d.key && { backgroundColor: meta.color, borderColor: meta.color }]}
              onPress={() => setDuration(d.key)}
            >
              <Text style={styles.durationEmoji}>{d.emoji}</Text>
              <Text style={[styles.durationLabel, duration === d.key && styles.chipLabelActive]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Budget */}
        <Text style={styles.label}>Budget</Text>
        <View style={styles.chipGrid}>
          {BUDGETS.map((b) => (
            <Pressable
              key={b.key}
              style={[styles.budgetChip, budget === b.key && { backgroundColor: meta.color, borderColor: meta.color }]}
              onPress={() => setBudget(b.key)}
            >
              <Text style={styles.budgetEmoji}>{b.emoji}</Text>
              <View>
                <Text style={[styles.budgetLabel, budget === b.key && styles.chipLabelActive]}>{b.label}</Text>
                <Text style={[styles.budgetDesc, budget === b.key && { color: 'rgba(255,255,255,0.8)' }]}>{b.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Ville */}
        <Text style={styles.label}>Ville</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="Paris (par défaut)"
          placeholderTextColor={colors.textMuted}
          returnKeyType="done"
        />

        {/* Contraintes */}
        <Text style={styles.label}>Contraintes (optionnel)</Text>
        <TextInput
          style={[styles.input, { height: 64 }]}
          value={constraints}
          onChangeText={setConstraints}
          placeholder="ex: végétarien, enfants de 5 et 8 ans, pas d'alcool…"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {/* Bouton générer */}
        <Pressable
          style={[styles.generateBtn, { backgroundColor: meta.color }, loading && { opacity: 0.7 }]}
          onPress={() => void generate()}
          disabled={loading}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.generateBtnText}>YUMIA IA réfléchit…</Text>
            </View>
          ) : (
            <Text style={styles.generateBtnText}>✨ Générer mon itinéraire</Text>
          )}
        </Pressable>

        {/* Résultat */}
        {result?.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {result.error}</Text>
            <Pressable onPress={() => void generate()} style={[styles.retryBtn, { backgroundColor: meta.color }]}>
              <Text style={styles.retryText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : result && result.steps.length > 0 ? (
          <View style={styles.result}>
            {/* Résumé */}
            <View style={[styles.summaryBox, { borderLeftColor: meta.color }]}>
              <Text style={styles.summaryText}>{result.itinerary}</Text>
            </View>

            {/* Étapes */}
            {result.steps.map((step, i) => (
              <View key={i} style={styles.step}>
                {/* Ligne timeline */}
                <View style={styles.timeline}>
                  <View style={[styles.dot, { backgroundColor: meta.color }]}>
                    <Text style={styles.dotEmoji}>{step.emoji}</Text>
                  </View>
                  {i < result.steps.length - 1 && (
                    <View style={[styles.line, { backgroundColor: meta.color + '30' }]} />
                  )}
                </View>

                {/* Contenu */}
                <View style={styles.stepCard}>
                  {/* Photo du lieu si disponible */}
                  {step.placePhoto ? (
                    <Image source={{ uri: step.placePhoto }} style={styles.stepPhoto} resizeMode="cover" />
                  ) : null}

                  <View style={styles.stepBody}>
                    <View style={styles.stepTopRow}>
                      <Text style={[styles.stepTime, { color: meta.color }]}>{step.time}</Text>
                      <Text style={styles.stepDuration}>{step.duration}</Text>
                    </View>
                    <Text style={styles.stepName}>{step.name}</Text>
                    <Text style={styles.stepDesc}>{step.description}</Text>

                    {step.placeRating ? (
                      <Text style={styles.stepRating}>⭐ {step.placeRating.toFixed(1)}</Text>
                    ) : null}

                    {step.tips ? (
                      <View style={[styles.tipBox, { borderLeftColor: meta.color }]}>
                        <Text style={styles.tipText}>💡 {step.tips}</Text>
                      </View>
                    ) : null}

                    {step.placeId ? (
                      <Pressable
                        style={[styles.placeBtn, { borderColor: meta.color }]}
                        onPress={() => navigateToPlace(step)}
                      >
                        <Text style={[styles.placeBtnText, { color: meta.color }]}>Voir ce lieu →</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}

            {/* Actions en bas */}
            <View style={styles.bottomActions}>
              <Pressable style={[styles.actionBtn, { backgroundColor: meta.color }]} onPress={() => void shareItinerary()}>
                <Text style={styles.actionBtnText}>↑ Partager</Text>
              </Pressable>
              <Pressable style={styles.actionBtnOutline} onPress={() => { setResult(null); void generate(); }}>
                <Text style={[styles.actionBtnOutlineText, { color: meta.color }]}>↺ Nouveau</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: 14, gap: spacing.sm,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 22, color: '#fff', fontWeight: '700' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 26 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  shareBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  shareIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },

  label: { fontWeight: '700', color: colors.text, fontSize: 14, marginTop: spacing.lg, marginBottom: 8 },

  chipRow: { gap: 8, paddingRight: spacing.md },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: colors.border,
  },
  moodEmoji: { fontSize: 16 },
  moodLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  moodLabelActive: { color: '#fff' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1.5, borderColor: colors.border,
  },
  durationEmoji: { fontSize: 16 },
  durationLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  budgetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: colors.border,
    flex: 1, minWidth: '30%',
  },
  budgetEmoji: { fontSize: 18 },
  budgetLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  budgetDesc: { fontSize: 11, color: colors.textMuted },
  chipLabelActive: { color: '#fff' },

  input: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },

  generateBtn: {
    marginTop: spacing.lg, borderRadius: radius.lg,
    padding: 16, alignItems: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  errorBox: {
    marginTop: spacing.lg, backgroundColor: '#FFF0F0',
    borderRadius: radius.md, padding: spacing.md, gap: 12,
    borderWidth: 1, borderColor: '#FFCCCC',
  },
  errorText: { color: '#C0392B', fontSize: 14, lineHeight: 20 },
  retryBtn: { borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  retryText: { color: '#fff', fontWeight: '700' },

  result: { marginTop: spacing.lg, gap: 0 },

  summaryBox: {
    borderLeftWidth: 4, paddingLeft: 14, marginBottom: spacing.lg,
  },
  summaryText: { fontSize: 15, color: colors.text, lineHeight: 22, fontStyle: 'italic' },

  step: { flexDirection: 'row', gap: 12, marginBottom: 0 },

  timeline: { alignItems: 'center', width: 44 },
  dot: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  dotEmoji: { fontSize: 20 },
  line: { width: 2, flex: 1, minHeight: 20 },

  stepCard: {
    flex: 1, marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  stepPhoto: { width: '100%', height: 120 },
  stepBody: { padding: 12, gap: 4 },
  stepTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepTime: { fontSize: 12, fontWeight: '700' },
  stepDuration: { fontSize: 11, color: colors.textMuted, backgroundColor: colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  stepName: { fontSize: 16, fontWeight: '700', color: colors.text },
  stepDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  stepRating: { fontSize: 12, color: colors.textMuted },
  tipBox: {
    borderLeftWidth: 3, paddingLeft: 10, marginTop: 4,
    backgroundColor: colors.background, paddingVertical: 4, borderRadius: 4,
  },
  tipText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', lineHeight: 16 },

  placeBtn: {
    marginTop: 8, borderWidth: 1.5, borderRadius: radius.md,
    paddingVertical: 8, alignItems: 'center',
  },
  placeBtnText: { fontSize: 13, fontWeight: '700' },

  bottomActions: {
    flexDirection: 'row', gap: 12, marginTop: spacing.md, marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actionBtnOutline: {
    flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface,
  },
  actionBtnOutlineText: { fontWeight: '700', fontSize: 15 },
});
