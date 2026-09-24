/**
 * Feuille de consentement aux fonctions IA (Anthropic) — montée une seule
 * fois à la racine de l'app. `ensureAiConsent()` (lib/ai-consent) l'ouvre la
 * première fois qu'une fonction IA est utilisée ; `openAiConsentSettings()`
 * l'ouvre en mode réglage (interrupteur « Fonctions IA (Anthropic) »).
 */
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import { PRIVACY_URL } from '../lib/legal';
import {
  getAiConsent,
  registerAiConsentPresenter,
  setAiConsent,
  setAiConsentUser,
  subscribeAiConsent,
  type AiConsent,
  type AiConsentSheetMode,
} from '../lib/ai-consent';
import { colors, radius, spacing } from '../theme/tokens';

export function AiConsentSheet() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState<AiConsentSheetMode | null>(null);
  const [consent, setConsent] = useState<AiConsent | null>(null);
  const resolver = useRef<((c: AiConsent | null) => void) | null>(null);

  useEffect(() => { setAiConsentUser(user?.id); }, [user?.id]);
  useEffect(() => subscribeAiConsent(setConsent), []);

  useEffect(() => registerAiConsentPresenter((m) => {
    // Une demande encore ouverte est close sans choix avant d'en ouvrir une autre.
    resolver.current?.(null);
    void getAiConsent().then(setConsent);
    setMode(m);
    return new Promise<AiConsent | null>((resolve) => { resolver.current = resolve; });
  }), []);

  const finish = (decision: AiConsent | null) => {
    const r = resolver.current;
    resolver.current = null;
    setMode(null);
    r?.(decision);
  };

  const toggle = (on: boolean) => { void setAiConsent(on ? 'granted' : 'denied'); };

  const visible = mode !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => finish(null)}>
      <Pressable style={styles.backdrop} onPress={() => finish(null)} accessibilityRole="button" accessibilityLabel={t('ai_consent_close')}>
        <Pressable style={[styles.sheet, { paddingBottom: spacing.md + insets.bottom }]} onPress={() => undefined}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <View style={styles.badge}><Text style={styles.badgeEmoji}>✨</Text></View>
            <Text style={styles.title}>
              {mode === 'refused' ? t('ai_consent_refused_title') : t('ai_consent_title')}
            </Text>
            <Text style={styles.intro}>
              {mode === 'refused' ? t('ai_consent_refused_body') : t('ai_consent_intro')}
            </Text>

            <View style={styles.rows}>
              <InfoRow icon="📤" label={t('ai_consent_what_label')} body={t('ai_consent_what_body')} />
              <InfoRow icon="🎯" label={t('ai_consent_why_label')} body={t('ai_consent_why_body')} />
              <InfoRow icon="🔒" label={t('ai_consent_training_label')} body={t('ai_consent_training_body')} />
            </View>

            <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
              <Text style={styles.link}>{t('ai_consent_privacy_link')}</Text>
            </Pressable>

            {mode === 'manage' ? (
              <>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>{t('ai_consent_toggle_label')}</Text>
                    <Text style={styles.switchHint}>{t('ai_consent_toggle_hint')}</Text>
                  </View>
                  <Switch
                    value={consent === 'granted'}
                    onValueChange={toggle}
                    trackColor={{ true: colors.brand, false: colors.border }}
                    thumbColor="#fff"
                    accessibilityLabel={t('ai_consent_toggle_label')}
                  />
                </View>
                <Pressable style={({ pressed }) => [styles.secondary, pressed && styles.pressed]} onPress={() => finish(null)} accessibilityRole="button">
                  <Text style={styles.secondaryText}>{t('ai_consent_close')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  onPress={() => finish('granted')}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryText}>
                    {mode === 'refused' ? t('ai_consent_enable') : t('ai_consent_accept')}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                  onPress={() => finish(mode === 'refused' ? null : 'denied')}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryText}>
                    {mode === 'refused' ? t('ai_consent_close') : t('ai_consent_refuse')}
                  </Text>
                </Pressable>
                <Text style={styles.footnote}>{t('ai_consent_change_later')}</Text>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function InfoRow({ icon, label, body }: { icon: string; label: string; body: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  badge: {
    alignSelf: 'center', width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.brand + '22', alignItems: 'center', justifyContent: 'center',
  },
  badgeEmoji: { fontSize: 24 },
  title: { color: colors.textPrimary, fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: spacing.sm },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing.xs },
  rows: { marginTop: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  rowIcon: { fontSize: 18, marginTop: 1 },
  rowLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  rowBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  link: { color: colors.brandSoft, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: spacing.md, textDecorationLine: 'underline' },
  primary: { marginTop: spacing.md, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { marginTop: spacing.sm, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  footnote: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xs },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: spacing.md,
    padding: 12, borderRadius: radius.md, backgroundColor: colors.surface,
  },
  switchLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  switchHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
