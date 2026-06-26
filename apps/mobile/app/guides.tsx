/**
 * GUIDES LOCAUX — guides certifiés d'une ville, avec réservation.
 * Branché sur GET /guides?city= et POST /guides/book (commission 20%).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchGuides, bookGuide, type Guide } from '../lib/business-api';

export default function GuidesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { city: locCity } = useLocation();
  const { city: paramCity } = useLocalSearchParams<{ city?: string }>();

  const [query, setQuery] = useState(paramCity ?? locCity ?? 'Paris');
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Guide | null>(null);

  const load = useCallback(async (city: string) => {
    const c = city.trim();
    if (!c) return;
    setLoading(true);
    try {
      setGuides(await fetchGuides(c));
    } catch {
      setGuides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(query); /* chargement initial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🧭 Guides locaux</Text>
          <Text style={styles.subtitle}>Des experts certifiés pour vivre la ville autrement.</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Dans quelle ville ?"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => load(query)}
          autoCorrect={false}
        />
        <Pressable style={styles.searchBtn} onPress={() => load(query)}>
          <Text style={styles.searchBtnText}>Chercher</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.md }}>
          {guides.length === 0 ? (
            <Text style={styles.empty}>Aucun guide pour « {query} » pour l'instant. Essaie Paris, Lyon, Marseille, London ou Barcelona.</Text>
          ) : (
            guides.map((g) => (
              <Pressable key={g.id} style={styles.card} onPress={() => setSelected(g)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{g.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.guideName}>{g.name}</Text>
                    {g.certified ? <Text style={styles.certBadge}>✓ Certifié</Text> : null}
                  </View>
                  <Text style={styles.guideMeta}>⭐ {g.rating.toFixed(1)} · {g.city} · {g.pricePerPerson}€/pers</Text>
                  {g.bio ? <Text style={styles.guideBio} numberOfLines={2}>{g.bio}</Text> : null}
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      <BookingModal
        guide={selected}
        canBook={!!accessToken}
        onClose={() => setSelected(null)}
        onConfirm={async (dateIso, people) => {
          if (!accessToken || !selected) return;
          try {
            await bookGuide(accessToken, selected.id, dateIso, people);
            setSelected(null);
            Alert.alert('Réservation envoyée 🎉', `Ta demande auprès de ${selected.name} est enregistrée. Tu seras recontacté pour finaliser.`);
          } catch (e) {
            Alert.alert('Erreur', e instanceof Error ? e.message : 'Réservation impossible.');
          }
        }}
      />
    </View>
  );
}

function BookingModal({
  guide, canBook, onClose, onConfirm,
}: {
  guide: Guide | null;
  canBook: boolean;
  onClose: () => void;
  onConfirm: (dateIso: string, people: number) => Promise<void>;
}) {
  const [dayOffset, setDayOffset] = useState(1);
  const [people, setPeople] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  if (!guide) return null;

  const days = Array.from({ length: 7 }, (_, i) => i + 1);
  const total = guide.pricePerPerson * people;

  function labelFor(offset: number): string {
    const d = new Date(Date.now() + offset * 86_400_000);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Réserver avec {guide.name}</Text>
          <Text style={styles.sheetSub}>{guide.pricePerPerson}€ par personne</Text>

          <Text style={styles.fieldLabel}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {days.map((o) => (
              <Pressable key={o} style={[styles.dayChip, dayOffset === o && styles.dayChipActive]} onPress={() => setDayOffset(o)}>
                <Text style={[styles.dayChipText, dayOffset === o && styles.dayChipTextActive]}>{labelFor(o)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>Personnes</Text>
          <View style={styles.counterRow}>
            <Pressable style={styles.counterBtn} onPress={() => setPeople((p) => Math.max(1, p - 1))}>
              <Text style={styles.counterBtnText}>−</Text>
            </Pressable>
            <Text style={styles.counterValue}>{people}</Text>
            <Pressable style={styles.counterBtn} onPress={() => setPeople((p) => Math.min(12, p + 1))}>
              <Text style={styles.counterBtnText}>+</Text>
            </Pressable>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{total}€</Text>
          </View>

          {canBook ? (
            <Pressable
              style={[styles.confirmBtn, submitting && styles.disabled]}
              disabled={submitting}
              onPress={async () => {
                setSubmitting(true);
                const dateIso = new Date(Date.now() + dayOffset * 86_400_000).toISOString();
                await onConfirm(dateIso, people);
                setSubmitting(false);
              }}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Demander à réserver</Text>}
            </Pressable>
          ) : (
            <Text style={styles.loginHint}>Connecte-toi pour réserver un guide.</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xxl },
  card: {
    flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...typography.title, color: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  guideName: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  certBadge: { ...typography.label, color: colors.success, backgroundColor: `${colors.success}1A`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, fontSize: 11 },
  guideMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  guideBio: { ...typography.caption, color: colors.textMuted, marginTop: 4, lineHeight: 18 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.sm },
  sheetTitle: { ...typography.title, color: colors.textPrimary },
  sheetSub: { ...typography.caption, color: colors.textMuted },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginTop: spacing.md },
  chipsRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  dayChip: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  dayChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayChipText: { ...typography.caption, color: colors.textPrimary },
  dayChipTextActive: { color: '#fff', fontWeight: '700' },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xs },
  counterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  counterBtnText: { ...typography.title, color: colors.textPrimary },
  counterValue: { ...typography.heading, color: colors.textPrimary, minWidth: 32, textAlign: 'center' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { ...typography.body, color: colors.textSecondary },
  totalValue: { ...typography.title, color: colors.brandSoft },
  confirmBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  confirmText: { ...typography.body, color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  loginHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
});
