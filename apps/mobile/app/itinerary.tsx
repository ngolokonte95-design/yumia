import { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { colors, radius, spacing, typography } from '../theme/tokens';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

type Mood = 'date' | 'amis' | 'famille' | 'solo' | 'touriste';
type Duration = 'soirée' | 'journée' | 'demi-journée' | 'weekend';
type Budget = 'économique' | 'moyen' | 'premium';

interface Step {
  time: string; type: string; name: string;
  description: string; duration: string; emoji: string; tips?: string;
}

const MOODS: Array<{ key: Mood; emoji: string; label: string }> = [
  { key: 'date', emoji: '❤️', label: 'Date' },
  { key: 'amis', emoji: '👫', label: 'Amis' },
  { key: 'famille', emoji: '👨‍👩‍👧', label: 'Famille' },
  { key: 'solo', emoji: '🧘', label: 'Solo' },
  { key: 'touriste', emoji: '✈️', label: 'Touriste' },
];

const DURATIONS: Array<{ key: Duration; label: string }> = [
  { key: 'demi-journée', label: 'Demi-journée' },
  { key: 'soirée', label: 'Soirée' },
  { key: 'journée', label: 'Journée' },
  { key: 'weekend', label: 'Weekend' },
];

const BUDGETS: Array<{ key: Budget; emoji: string; label: string }> = [
  { key: 'économique', emoji: '💸', label: 'Économique' },
  { key: 'moyen', emoji: '💶', label: 'Moyen' },
  { key: 'premium', emoji: '💎', label: 'Premium' },
];

export default function ItineraryScreen() {
  const { accessToken } = useAuth();
  const { location } = useLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mood, setMood] = useState<Mood>('amis');
  const [duration, setDuration] = useState<Duration>('soirée');
  const [budget, setBudget] = useState<Budget>('moyen');
  const [city, setCity] = useState('');
  const [constraints, setConstraints] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ itinerary: string; steps: Step[] } | null>(null);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/itinerary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ mood, duration, budget, city: city.trim() || 'Paris', constraints: constraints.trim() || undefined }),
      });
      if (res.ok) setResult(await res.json());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Itinéraire IA ✨</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 100 }}>
        {/* Mood */}
        <Text style={styles.sectionLabel}>Pour qui ?</Text>
        <View style={styles.chips}>
          {MOODS.map((m) => (
            <Pressable key={m.key} style={[styles.chip, mood === m.key && styles.chipActive]} onPress={() => setMood(m.key)}>
              <Text style={styles.chipEmoji}>{m.emoji}</Text>
              <Text style={[styles.chipLabel, mood === m.key && styles.chipLabelActive]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Duration */}
        <Text style={styles.sectionLabel}>Durée</Text>
        <View style={styles.chips}>
          {DURATIONS.map((d) => (
            <Pressable key={d.key} style={[styles.chip, duration === d.key && styles.chipActive]} onPress={() => setDuration(d.key)}>
              <Text style={[styles.chipLabel, duration === d.key && styles.chipLabelActive]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Budget */}
        <Text style={styles.sectionLabel}>Budget</Text>
        <View style={styles.chips}>
          {BUDGETS.map((b) => (
            <Pressable key={b.key} style={[styles.chip, budget === b.key && styles.chipActive]} onPress={() => setBudget(b.key)}>
              <Text style={styles.chipEmoji}>{b.emoji}</Text>
              <Text style={[styles.chipLabel, budget === b.key && styles.chipLabelActive]}>{b.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* City */}
        <Text style={styles.sectionLabel}>Ville</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="Paris (par défaut)"
          placeholderTextColor={colors.textMuted}
        />

        {/* Constraints */}
        <Text style={styles.sectionLabel}>Contraintes (optionnel)</Text>
        <TextInput
          style={[styles.input, { height: 64 }]}
          value={constraints}
          onChangeText={setConstraints}
          placeholder="ex: végétarien, pas d'alcool, en fauteuil roulant..."
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {/* Generate */}
        <Pressable style={[styles.generateBtn, loading && styles.generateBtnLoading]} onPress={generate} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.generateBtnText}>✨ Générer mon itinéraire</Text>
          )}
        </Pressable>

        {/* Result */}
        {result && (
          <View style={styles.resultWrap}>
            <Text style={styles.resultSummary}>{result.itinerary}</Text>
            {result.steps.map((step, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepLeft}>
                  <Text style={styles.stepEmoji}>{step.emoji}</Text>
                  {i < result.steps.length - 1 && <View style={styles.stepLine} />}
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepTime}>{step.time} · {step.duration}</Text>
                  <Text style={styles.stepName}>{step.name}</Text>
                  <Text style={styles.stepDesc}>{step.description}</Text>
                  {step.tips && <Text style={styles.stepTips}>💡 {step.tips}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  sectionLabel: { fontWeight: '700', color: colors.text, fontSize: 15, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.surface, borderRadius: radius.full,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipEmoji: { fontSize: 16 },
  chipLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  chipLabelActive: { color: '#fff' },
  input: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  generateBtn: {
    marginTop: 24, backgroundColor: colors.brand, borderRadius: radius.lg,
    padding: 16, alignItems: 'center',
  },
  generateBtnLoading: { opacity: 0.7 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resultWrap: { marginTop: 24 },
  resultSummary: { ...typography.h3, color: colors.text, marginBottom: 20, lineHeight: 22 },
  step: { flexDirection: 'row', gap: 14, marginBottom: 0 },
  stepLeft: { alignItems: 'center', width: 40 },
  stepEmoji: { fontSize: 28, marginBottom: 4 },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 4 },
  stepBody: { flex: 1, paddingBottom: 20 },
  stepTime: { fontSize: 12, color: colors.brand, fontWeight: '700', marginBottom: 2 },
  stepName: { fontWeight: '700', color: colors.text, fontSize: 16, marginBottom: 4 },
  stepDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 4 },
  stepTips: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
});
