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
 *
 * Style boutique haut de gamme (17/11/2026) : barre de progression au dégradé
 * de marque, question en grand, choix en tuiles qui apparaissent en cascade,
 * occasion proche signalée par un liseré et un compte à rebours de marque.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, gradients, radius, spacing } from '../../theme/tokens';
import {
  shopApi,
  type GiftChoice,
  type GiftOccasionOption,
  type GiftOptions,
  type GiftSuggestions,
} from '../../lib/shop-api';
import { ProductCard } from '../../components/shop/ProductCard';
import { GradientButton, ShopEmpty, ShopHeader } from '../../components/shop/ShopChrome';
import { GradientText, PressableScale, Reveal } from '../../components/ui';
import { haptics } from '../../lib/useHaptics';
import { useI18n } from '../../lib/useI18n';
import { giftChoiceLabel, type GiftChoiceKind } from '../../lib/gift-guide-label';

type Step = 'recipient' | 'occasion' | 'budget' | 'results';

const STEP_ORDER: Step[] = ['recipient', 'occasion', 'budget'];

type Translate = ReturnType<typeof useI18n>['t'];

/** « Aujourd'hui ! », « Demain », « J-12 » — le compte à rebours d'une occasion proche. */
function countdown(o: GiftOccasionOption, t: Translate): string | null {
  if (!o.isNow || o.daysUntil === null) return null;
  if (o.daysUntil === 0) return t('shop_gift_today');
  if (o.daysUntil === 1) return t('shop_gift_tomorrow');
  return t('shop_gift_countdown').replace('{n}', String(o.daysUntil));
}

export default function GiftIdeasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t } = useI18n();

  const STEP_TITLE: Record<Exclude<Step, 'results'>, string> = {
    recipient: t('shop_gift_step_recipient'),
    occasion: t('shop_gift_step_occasion'),
    budget: t('shop_gift_step_budget'),
  };

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
    haptics.select();
    if (step === 'recipient') setRecipient(value);
    else if (step === 'occasion') setOccasion(value);
    else if (step === 'budget') setBudget(value);
    advance();
  }

  function advance() {
    const i = STEP_ORDER.indexOf(step as Exclude<Step, 'results'>);
    setStep(i === -1 || i === STEP_ORDER.length - 1 ? 'results' : STEP_ORDER[i + 1]);
  }

  const labelOf = (list: GiftChoice[] | undefined, kind: GiftChoiceKind, slug: string | undefined, fallback: string) => {
    const found = list?.find((x) => x.slug === slug);
    return found ? `${found.emoji ?? ''} ${giftChoiceLabel(t, kind, found.slug, found.label)}`.trim() : fallback;
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
      <ShopHeader title={`🎁 ${t('explorer_action_gifts_label')}`} onBack={() => router.back()} backLabel={t('gs_back')} />

      {step !== 'results' ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
          showsVerticalScrollIndicator={false}
        >
          {/* Progression : un segment par question, rempli au dégradé de marque. */}
          <View style={styles.progress}>
            {STEP_ORDER.map((s, i) => (
              <View key={s} style={styles.progressSeg}>
                {i <= STEP_ORDER.indexOf(step as Exclude<Step, 'results'>) ? (
                  <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                ) : null}
              </View>
            ))}
          </View>
          <Text style={styles.stepIndex}>
            {t('shop_gift_step_index')
              .replace('{n}', String(STEP_ORDER.indexOf(step as Exclude<Step, 'results'>) + 1))
              .replace('{total}', String(STEP_ORDER.length))}
          </Text>
          {/* `key` : la question réapparaît en fondu à chaque étape. */}
          <Reveal key={step} index={0}>
            <GradientText style={styles.question}>{STEP_TITLE[step as Exclude<Step, 'results'>]}</GradientText>
          </Reveal>

          {step === 'recipient' && (
            <View style={styles.choiceGrid}>
              {options?.recipients.map((r, i) => (
                <Reveal key={r.slug} index={Math.min(i, 9)} from="fade" style={styles.choiceCell}>
                  <PressableScale style={styles.choiceTile} onPress={() => choose(r.slug)} scaleTo={0.92}>
                    <View style={styles.choiceMedal}>
                      <LinearGradient colors={gradients.brandSoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <Text style={styles.choiceEmoji}>{r.emoji}</Text>
                    </View>
                    <Text style={styles.choiceLabel} numberOfLines={2}>{giftChoiceLabel(t, 'recipient', r.slug, r.label)}</Text>
                  </PressableScale>
                </Reveal>
              ))}
            </View>
          )}

          {step === 'occasion' && (
            <View style={styles.choiceGrid}>
              {options?.occasions.map((o, i) => {
                const cd = countdown(o, t);
                return (
                  <Reveal key={o.slug} index={Math.min(i, 9)} from="fade" style={styles.choiceCell}>
                    <PressableScale
                      style={[styles.choiceTile, o.isNow && styles.choiceTileNow]}
                      onPress={() => choose(o.slug)}
                      scaleTo={0.92}
                    >
                      {cd && (
                        <View style={styles.badge}>
                          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                          <Text style={styles.badgeTxt}>{cd}</Text>
                        </View>
                      )}
                      <View style={styles.choiceMedal}>
                        <LinearGradient colors={gradients.brandSoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        <Text style={styles.choiceEmoji}>{o.emoji}</Text>
                      </View>
                      <Text style={styles.choiceLabel} numberOfLines={2}>{giftChoiceLabel(t, 'occasion', o.slug, o.label)}</Text>
                    </PressableScale>
                  </Reveal>
                );
              })}
            </View>
          )}

          {step === 'budget' && (
            <View style={styles.budgetList}>
              {options?.budgets.map((b, i) => (
                <Reveal key={b.slug} index={i}>
                  <PressableScale style={styles.budgetRow} onPress={() => choose(b.slug)} scaleTo={0.97}>
                    <Text style={styles.budgetLabel}>{giftChoiceLabel(t, 'budget', b.slug, b.label)}</Text>
                    <View style={styles.budgetGo}>
                      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      <Text style={styles.budgetChevron}>›</Text>
                    </View>
                  </PressableScale>
                </Reveal>
              ))}
            </View>
          )}

          <Pressable onPress={advance} hitSlop={8} style={styles.skip}>
            <Text style={styles.skipTxt}>{t('shop_gift_skip')}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          {/* Critères retenus — chaque puce ramène à sa question.
              Retour à la ligne plutôt que défilement horizontal : les libellés
              viennent du serveur et peuvent être longs (« Anniversaire de
              mariage », « Fête des grands-parents »). Une rangée qui défile
              coupait la troisième puce au bord de l'écran, sans rien pour
              signaler qu'il y avait quelque chose à côté. */}
          <View style={styles.criteriaRow}>
            <PressableScale style={styles.criteriaChip} onPress={() => setStep('recipient')} scaleTo={0.94}>
              <Text style={styles.criteriaTxt}>{labelOf(options?.recipients, 'recipient', recipient, t('shop_gift_chip_recipient'))}  ✎</Text>
            </PressableScale>
            <PressableScale style={styles.criteriaChip} onPress={() => setStep('occasion')} scaleTo={0.94}>
              <Text style={styles.criteriaTxt}>{labelOf(options?.occasions, 'occasion', occasion, t('shop_gift_chip_occasion'))}  ✎</Text>
            </PressableScale>
            <PressableScale style={styles.criteriaChip} onPress={() => setStep('budget')} scaleTo={0.94}>
              <Text style={styles.criteriaTxt}>{labelOf(options?.budgets, 'budget', budget, t('shop_gift_chip_budget'))}  ✎</Text>
            </PressableScale>
          </View>

          {loading ? (
            <View style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></View>
          ) : failed ? (
            <ShopEmpty emoji="📡" title={t('shop_gift_error')}>
              <GradientButton size="md" style={styles.retry} label={t('retry')} onPress={() => void search()} />
            </ShopEmpty>
          ) : result && result.items.length === 0 ? (
            <ShopEmpty emoji="🎁" title={t('shop_gift_empty_title')} text={t('shop_gift_empty_text')} />
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
                    {t(result.total > 1 ? 'shop_gift_result_count_other' : 'shop_gift_result_count_one')
                      .replace('{n}', String(result.total))}
                  </Text>
                ) : undefined
              }
              renderItem={({ item, index }) => (
                <Reveal index={index < 6 ? index : 0} from={index < 6 ? 'below' : 'fade'} style={styles.cell}>
                  <ProductCard
                    product={item}
                    variant="grid"
                    onPress={() => router.push(`/shop/product/${item.slug}` as never)}
                  />
                </Reveal>
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

  progress: { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border },
  stepIndex: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.6,
    textTransform: 'uppercase', marginBottom: 6,
  },
  question: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8, lineHeight: 35, marginBottom: spacing.lg },

  // Trois par ligne : neuf destinataires et neuf occasions tiennent alors sur
  // un écran sans défilement, ce qui garde le choix immédiat.
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceCell: { width: '31.5%' },
  choiceTile: {
    aspectRatio: 0.92,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 6,
  },
  choiceTileNow: { borderColor: colors.brand, borderWidth: 1.5 },
  choiceMedal: {
    width: 50, height: 50, borderRadius: 25, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  choiceEmoji: { fontSize: 25 },
  choiceLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
  badge: {
    position: 'absolute', top: 6, right: 6, overflow: 'hidden',
    borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },

  budgetList: { gap: spacing.sm },
  budgetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.md,
  },
  budgetLabel: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  budgetGo: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  budgetChevron: { fontSize: 22, color: '#fff', fontWeight: '800', marginTop: -2 },

  skip: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  skipTxt: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },

  criteriaRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  criteriaChip: {
    backgroundColor: 'rgba(31,31,42,0.72)', borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.brand,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  criteriaTxt: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },

  resultCount: {
    color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.6,
    textTransform: 'uppercase', marginBottom: spacing.md,
  },
  column: { gap: spacing.md },
  cell: { flex: 1, marginBottom: spacing.md },

  retry: { marginTop: spacing.md, alignSelf: 'stretch' },
});
