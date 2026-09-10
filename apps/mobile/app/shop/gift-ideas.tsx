/**
 * ASSISTANT IDÉES CADEAUX.
 *
 * Trois questions — pour qui, quelle occasion, quel budget — puis une
 * sélection tirée de la boutique. Les libellés viennent du serveur (comme les
 * rayons, en français) : ajuster les occasions ne demande pas une nouvelle
 * version sur les stores.
 *
 * Une fois les résultats affichés, les trois critères restent visibles sous
 * forme de puces : on en change une d'un geste au lieu de recommencer le
 * questionnaire.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  shopApi,
  type GiftChoice,
  type GiftOccasionOption,
  type GiftOptions,
  type GiftSuggestions,
} from '../../lib/shop-api';
import { ProductCard } from '../../components/shop/ProductCard';

type Step = 'recipient' | 'occasion' | 'budget' | 'results';

const STEP_ORDER: Step[] = ['recipient', 'occasion', 'budget'];

const STEP_TITLE: Record<Exclude<Step, 'results'>, string> = {
  recipient: 'À qui veux-tu faire plaisir ?',
  occasion: "Pour quelle occasion ?",
  budget: 'Quel budget ?',
};

/** « Aujourd'hui ! », « Demain », « J-12 » — le compte à rebours d'une occasion proche. */
function countdown(o: GiftOccasionOption): string | null {
  if (!o.isNow || o.daysUntil === null) return null;
  if (o.daysUntil === 0) return "Aujourd'hui !";
  if (o.daysUntil === 1) return 'Demain';
  return `J-${o.daysUntil}`;
}

export default function GiftIdeasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();

  const [options, setOptions] = useState<GiftOptions | null>(null);
  const [step, setStep] = useState<Step>('recipient');
  const [recipient, setRecipient] = useState<string | undefined>();
  const [occasion, setOccasion] = useState<string | undefined>();
  const [budget, setBudget] = useState<string | undefined>();

  const [result, setResult] = useState<GiftSuggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    shopApi.giftOptions(accessToken)
      .then((o) => { if (!cancelled) setOptions(o); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [accessToken]);

  const search = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(await shopApi.giftIdeas(accessToken, { recipient, occasion, budget }));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken, recipient, occasion, budget]);

  // Relance la recherche dès qu'un critère change, une fois les résultats
  // atteints — modifier une puce doit rafraîchir la sélection sans bouton.
  useEffect(() => {
    if (step === 'results') void search();
  }, [step, search]);

  function choose(value: string) {
    if (step === 'recipient') setRecipient(value);
    else if (step === 'occasion') setOccasion(value);
    else if (step === 'budget') setBudget(value);
    advance();
  }

  function advance() {
    const i = STEP_ORDER.indexOf(step as Exclude<Step, 'results'>);
    setStep(i === -1 || i === STEP_ORDER.length - 1 ? 'results' : STEP_ORDER[i + 1]);
  }

  const labelOf = (list: GiftChoice[] | undefined, slug: string | undefined, fallback: string) => {
    const found = list?.find((x) => x.slug === slug);
    return found ? `${found.emoji ?? ''} ${found.label}`.trim() : fallback;
  };

  if (!options && !failed) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>🎁 Idées cadeaux</Text>
        <View style={{ width: 22 }} />
      </View>

      {step !== 'results' ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepIndex}>
            Étape {STEP_ORDER.indexOf(step as Exclude<Step, 'results'>) + 1} sur {STEP_ORDER.length}
          </Text>
          <Text style={styles.question}>{STEP_TITLE[step as Exclude<Step, 'results'>]}</Text>

          {step === 'recipient' && (
            <View style={styles.choiceGrid}>
              {options?.recipients.map((r) => (
                <Pressable key={r.slug} style={styles.choiceTile} onPress={() => choose(r.slug)}>
                  <Text style={styles.choiceEmoji}>{r.emoji}</Text>
                  <Text style={styles.choiceLabel} numberOfLines={2}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {step === 'occasion' && (
            <View style={styles.choiceGrid}>
              {options?.occasions.map((o) => {
                const cd = countdown(o);
                return (
                  <Pressable
                    key={o.slug}
                    style={[styles.choiceTile, o.isNow && styles.choiceTileNow]}
                    onPress={() => choose(o.slug)}
                  >
                    {cd && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeTxt}>{cd}</Text>
                      </View>
                    )}
                    <Text style={styles.choiceEmoji}>{o.emoji}</Text>
                    <Text style={styles.choiceLabel} numberOfLines={2}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {step === 'budget' && (
            <View style={styles.budgetList}>
              {options?.budgets.map((b) => (
                <Pressable key={b.slug} style={styles.budgetRow} onPress={() => choose(b.slug)}>
                  <Text style={styles.budgetLabel}>{b.label}</Text>
                  <Text style={styles.budgetChevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable onPress={advance} hitSlop={8} style={styles.skip}>
            <Text style={styles.skipTxt}>Passer cette question</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          {/* Critères retenus — chaque puce ramène à sa question. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.criteriaRow}
          >
            <Pressable style={styles.criteriaChip} onPress={() => setStep('recipient')}>
              <Text style={styles.criteriaTxt}>{labelOf(options?.recipients, recipient, 'Pour qui ?')}</Text>
            </Pressable>
            <Pressable style={styles.criteriaChip} onPress={() => setStep('occasion')}>
              <Text style={styles.criteriaTxt}>{labelOf(options?.occasions, occasion, 'Occasion ?')}</Text>
            </Pressable>
            <Pressable style={styles.criteriaChip} onPress={() => setStep('budget')}>
              <Text style={styles.criteriaTxt}>{labelOf(options?.budgets, budget, 'Budget ?')}</Text>
            </Pressable>
          </ScrollView>

          {loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
          ) : failed ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Impossible de charger les idées.</Text>
              <Pressable style={styles.retry} onPress={() => void search()}>
                <Text style={styles.retryTxt}>Réessayer</Text>
              </Pressable>
            </View>
          ) : result && result.items.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>🎁</Text>
              <Text style={styles.emptyTitle}>Rien ne correspond à ces critères.</Text>
              <Text style={styles.emptyText}>
                Élargis le budget ou change d'occasion en appuyant sur une puce ci-dessus.
              </Text>
            </View>
          ) : (
            <FlatList
              data={result?.items ?? []}
              keyExtractor={(p) => p.id}
              numColumns={2}
              columnWrapperStyle={styles.column}
              contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                result ? (
                  <Text style={styles.resultCount}>
                    {result.total} idée{result.total > 1 ? 's' : ''} pour toi
                  </Text>
                ) : null
              }
              renderItem={({ item }) => (
                <View style={styles.cell}>
                  <ProductCard
                    product={item}
                    variant="grid"
                    onPress={() => router.push(`/shop/product/${item.slug}` as never)}
                  />
                </View>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  back: { fontSize: 22, color: colors.textPrimary },
  headerTitle: { ...typography.h3, color: colors.textPrimary },

  stepIndex: { ...typography.label, color: colors.textMuted, marginBottom: 4 },
  question: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.lg },

  // Trois par ligne : neuf destinataires et neuf occasions tiennent alors sur
  // un écran sans défilement, ce qui garde le choix immédiat.
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceTile: {
    width: '31.5%', aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 4,
  },
  choiceTileNow: { borderColor: colors.brand },
  choiceEmoji: { fontSize: 26 },
  choiceLabel: { ...typography.label, color: colors.textPrimary, fontSize: 11, textAlign: 'center' },
  badge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },

  budgetList: { gap: spacing.sm },
  budgetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
  },
  budgetLabel: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  budgetChevron: { fontSize: 20, color: colors.textMuted },

  skip: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  skipTxt: { ...typography.label, color: colors.textMuted, textDecorationLine: 'underline' },

  criteriaRow: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  criteriaChip: {
    backgroundColor: colors.surfaceElevated, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  criteriaTxt: { ...typography.label, color: colors.textPrimary, fontSize: 12 },

  resultCount: { ...typography.label, color: colors.textMuted, marginBottom: spacing.sm },
  column: { gap: spacing.sm },
  cell: { flex: 1, marginBottom: spacing.sm },

  emptyEmoji: { fontSize: 40 },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  retry: {
    marginTop: spacing.sm, backgroundColor: colors.brand,
    borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  retryTxt: { color: '#fff', fontWeight: '800' },
});
