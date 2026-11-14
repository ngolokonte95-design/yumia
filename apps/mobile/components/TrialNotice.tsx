import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FREE_LIMITS, LIMITS_BY_PLAN, PLAN_PRICE_EUR, TRIAL_DAYS, TRIAL_REMINDER_DAYS, isOnTrial, trialDaysLeft,
} from '@yumia/shared';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { getCurrentAccessToken, request } from '../lib/api';
import { useI18n } from '../lib/useI18n';
import { PlanBadgeIcon } from './Avatar';

const GOLD = '#E3B341';
/** Laisse l'écran d'accueil se poser avant d'ouvrir la fenêtre. */
const SHOW_DELAY_MS = 1500;
const DAY_MS = 86_400_000;

type Kind = 'welcome' | 'reminder' | 'ended';
interface Seen { welcome?: boolean; reminderDay?: string; ended?: boolean }

const storageKey = (userId: string) => `trial-notice:${userId}`;

async function readSeen(userId: string): Promise<Seen> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Seen) : {};
  } catch {
    return {};
  }
}

async function writeSeen(userId: string, seen: Seen): Promise<void> {
  try { await AsyncStorage.setItem(storageKey(userId), JSON.stringify(seen)); } catch { /* best-effort */ }
}

/**
 * Essai Gold offert à l'inscription, raconté à l'utilisateur :
 * - à l'arrivée : Gold offert 7 jours, sans carte, puis retour au Gratuit ;
 * - chacun des 3 derniers jours, une fois par jour : le temps qui reste, ce
 *   que le Gratuit change, et l'offre pour garder Gold ;
 * - une fois l'essai fini : retour au Gratuit, et l'offre.
 * Les mêmes rappels partent en notification push (TrialCronService, serveur).
 *
 * Monté dans les onglets : jamais pendant l'inscription ni l'onboarding.
 * C'est aussi lui qui DÉMARRE l'essai d'un compte neuf (POST /auth/me/trial) :
 * le serveur ne l'offre qu'aux apps qui savent l'afficher.
 */
export function TrialNotice() {
  const { user, reloadUser } = useAuth();
  const startRequested = useRef(false);
  const { t } = useI18n();
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [daysLeft, setDaysLeft] = useState(0);

  const check = useCallback(async () => {
    if (!user || user.plan !== 'free') return;
    const now = Date.now();
    if (!user.trialEndsAt) {
      // Compte de moins de 24 h : on demande l'essai. Le serveur refuse les
      // comptes plus anciens, et le profil rechargé relance cette vérification.
      if (startRequested.current || now - new Date(user.createdAt).getTime() > DAY_MS) return;
      startRequested.current = true;
      const token = getCurrentAccessToken();
      if (!token) return;
      try {
        await request('/auth/me/trial', { method: 'POST', token });
        await reloadUser();
      } catch { /* réessayé au prochain lancement */ }
      return;
    }
    const seen = await readSeen(user.id);
    const today = new Date(now).toISOString().slice(0, 10);
    const left = trialDaysLeft(user.trialEndsAt, now);
    let next: Kind | null = null;

    if (isOnTrial(user.plan, user.trialEndsAt, now)) {
      if (!seen.welcome) {
        next = 'welcome';
        seen.welcome = true;
        // L'accueil compte comme le rappel du jour : pas deux fenêtres d'affilée.
        seen.reminderDay = today;
      } else if (left <= TRIAL_REMINDER_DAYS && seen.reminderDay !== today) {
        next = 'reminder';
        seen.reminderDay = today;
      }
    } else if (!seen.ended && new Date(user.trialEndsAt).getTime() > now - 7 * DAY_MS) {
      next = 'ended';
      seen.ended = true;
    }

    if (!next) return;
    await writeSeen(user.id, seen);
    setDaysLeft(left);
    setTimeout(() => setKind(next), SHOW_DELAY_MS);
  }, [user, reloadUser]);

  useEffect(() => {
    void check();
    // L'app reste souvent ouverte en fond : on revérifie à chaque retour.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void check(); });
    return () => sub.remove();
  }, [check]);

  if (!kind) return null;

  const price = `${PLAN_PRICE_EUR.gold.toFixed(2).replace('.', ',')} €`;
  const title = kind === 'welcome'
    ? t('trial_welcome_title').replace('{n}', String(TRIAL_DAYS))
    : kind === 'ended'
      ? t('trial_ended_title')
      : daysLeft <= 1
        ? t('trial_reminder_title_last')
        : t('trial_reminder_title').replace('{n}', String(daysLeft));
  const body = (kind === 'welcome' ? t('trial_welcome_body') : kind === 'ended' ? t('trial_ended_body') : t('trial_reminder_body'))
    .replace('{n}', String(TRIAL_DAYS))
    .replace('{free}', String(FREE_LIMITS.chatbotPerDay))
    .replace('{gold}', String(LIMITS_BY_PLAN.gold.chatbotPerDay))
    .replace('{price}', price);

  const close = () => setKind(null);
  const subscribe = () => { close(); router.push('/plus' as never); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.crownCircle}>
            <PlanBadgeIcon plan="gold" size={36} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{body}</Text>
          {kind === 'welcome' ? (
            <Pressable style={styles.primaryBtn} onPress={close}>
              <Text style={styles.primaryText}>{t('trial_welcome_cta')}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.primaryBtn} onPress={subscribe}>
                <Text style={styles.primaryText}>{t('trial_keep_gold').replace('{price}', price)}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={close}>
                <Text style={styles.secondaryText}>{t('pu_later')}</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: GOLD,
  },
  crownCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${GOLD}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: GOLD,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryText: { color: '#1A1300', fontWeight: '800', fontSize: 16 },
  secondaryBtn: { paddingVertical: spacing.sm },
  secondaryText: { color: colors.textMuted, fontWeight: '600' },
});
