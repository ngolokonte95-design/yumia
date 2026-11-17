/**
 * PARAMÈTRES — notifications, sécurité, compte, données.
 *
 * Mise en scène (17/11/2026) : sections en petites capitales, lignes en
 * groupes vitrés (icône dans un rond en verre, chevron, filets fins),
 * carte d'abonnement à cadre dégradé, actions destructrices en rouge
 * fonctionnel dans des groupes à part. Logique inchangée.
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Platform,
  Share,
} from 'react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '../theme/tokens';
import { GradientText, PressableScale, Reveal } from '../components/ui';
import { haptics } from '../lib/useHaptics';
import {
  BrandDot, BrandFrame, CHEVRON, GlassGroup, MenuRow, ScreenHeader, SectionLabel, ToggleRow,
} from '../components/profile/ProfileChrome';
import { useAuth } from '../lib/auth-context';
import { resetPasswordRequest, deleteAccountRequest, exportDataRequest, updateProfileRequest } from '../lib/auth-api';
import { API_BASE_URL } from '../lib/config';
import { CGV_URL, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../lib/legal';
import { openManageSubscriptions } from '../lib/purchases';
import { useI18n } from '../lib/useI18n';
import { nextPaidPlan } from '../lib/constants/plan-limits';
import type { Plan } from '@yumia/shared';
import { resetTips } from '../lib/feature-tips';

/** Noms commerciaux des paliers — identiques dans toutes les langues. */
const PLAN_NAME: Record<Plan, string> = {
  free: 'YUMIA Free', plus: 'YUMIA Plus', gold: 'YUMIA Gold', diamond: 'YUMIA Diamond',
};

/** Version réelle du binaire (app.json → expoConfig), plus de numéro écrit en dur. */
const APP_VERSION = Constants.expoConfig?.version ?? '';

/**
 * Écrit l'export dans un fichier JSON puis ouvre la feuille de partage : la
 * personne choisit où l'envoyer (Fichiers, mail, AirDrop…). Rien n'est
 * envoyé par YUMIA.
 *
 * Le Share de React Native ne partage un FICHIER que sur iOS (`url`) ; sur
 * Android il n'accepte que du texte, d'où le JSON passé en `message`.
 */
async function shareExport(data: Record<string, unknown>, title: string): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if (Platform.OS === 'ios') {
    const file = new File(Paths.cache, `yumia-export-${new Date().toISOString().slice(0, 10)}.json`);
    file.create({ overwrite: true });
    file.write(json);
    await Share.share({ url: file.uri, title });
    return;
  }
  await Share.share({ message: json, title });
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, accessToken } = useAuth();
  const plan = (user?.plan ?? 'free') as Plan;
  const isPaid = plan !== 'free';
  const nextTier = nextPaidPlan(plan);
  const { t } = useI18n();

  const [notifDigest, setNotifDigest] = useState(user?.preferences?.notifDigest ?? true);
  const [notifStreak, setNotifStreak] = useState(user?.preferences?.notifStreak ?? true);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function saveNotifPref(key: 'notifDigest' | 'notifStreak', value: boolean) {
    if (!accessToken) return;
    await updateProfileRequest(accessToken, { preferences: { ...user?.preferences, [key]: value } })
      .catch(() => {}); // fire-and-forget; local state already updated optimistically
  }

  function handleChangePassword() {
    router.push('/forgot-password');
  }

  function handleDeleteAccount() {
    Alert.alert(
      t('settings_delete_account_title'),
      t('settings_delete_account_body'),
      [
        { text: t('settings_cancel'), style: 'cancel' },
        {
          text: t('settings_delete_permanently'),
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ],
    );
  }

  async function confirmDeleteAccount() {
    if (!accessToken) return;
    setDeletingAccount(true);
    try {
      await deleteAccountRequest(accessToken);
      await logout();
    } catch {
      Alert.alert(t('settings_error'), t('settings_delete_account_error'));
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleExportData() {
    if (!accessToken) return;
    setExporting(true);
    try {
      const data = await exportDataRequest(accessToken);
      await shareExport(data, t('settings_export_data'));
    } catch {
      Alert.alert(t('settings_error'), t('settings_export_error'));
    } finally {
      setExporting(false);
    }
  }

  function handleLogout() {
    Alert.alert(t('settings_logout_confirm'), '', [
      { text: t('settings_cancel'), style: 'cancel' },
      { text: t('settings_logout'), style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title={t('settings_title')} onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Compte */}
        <Reveal index={0}>
          <SectionLabel label={t('settings_section_account')} />
          <GlassGroup>
            <MenuRow
              icon="✏️"
              label={t('settings_edit_profile')}
              onPress={() => router.push('/edit-profile')}
            />
            {user?.authProvider === 'password' ? (
              <MenuRow
                icon="🔑"
                label={t('settings_change_password')}
                onPress={handleChangePassword}
              />
            ) : null}
            <MenuRow
              icon="🌍"
              label={t('settings_language')}
              value={user?.locale?.toUpperCase() ?? 'FR'}
              onPress={() => router.push('/edit-profile')}
            />
          </GlassGroup>
        </Reveal>

        {/* Notifications */}
        <Reveal index={1}>
          <SectionLabel label={t('settings_section_notifications')} />
          <GlassGroup>
            <ToggleRow
              icon="🌅"
              label={t('settings_digest_label')}
              sublabel={t('settings_digest_sub')}
              value={notifDigest}
              onValueChange={(v) => { setNotifDigest(v); void saveNotifPref('notifDigest', v); }}
            />
            <ToggleRow
              icon="🔥"
              label={t('settings_streak_label')}
              sublabel={t('settings_streak_sub')}
              value={notifStreak}
              onValueChange={(v) => { setNotifStreak(v); void saveNotifPref('notifStreak', v); }}
            />
          </GlassGroup>
        </Reveal>

        {/* Abonnement */}
        <Reveal index={2}>
          <SectionLabel label={t('settings_section_subscription')} />
          <PressableScale onPress={() => { haptics.select(); router.push('/plus'); }} scaleTo={0.98}>
            <BrandFrame innerStyle={styles.plusInner}>
              <View style={{ flex: 1 }}>
                {/* Le palier réel, pas seulement Plus : un abonné Gold lisait
                    « Passer à YUMIA Plus » alors qu'il paie au-dessus. */}
                <GradientText style={styles.plusTitle}>
                  {isPaid
                    ? t('settings_plus_active').replace('YUMIA Plus', PLAN_NAME[plan])
                    : t('settings_plus_upgrade').replace('YUMIA Plus', PLAN_NAME[nextTier ?? 'gold'])}
                </GradientText>
                <Text style={styles.plusSub}>
                  {isPaid ? t('settings_plus_thanks') : t('settings_plus_pitch')}
                </Text>
              </View>
              {nextTier ? <BrandDot label={CHEVRON} size={30} /> : null}
            </BrandFrame>
          </PressableScale>
          {/* La résiliation se fait dans la boutique, jamais dans l'app : ce
              lien y mène directement. */}
          <GlassGroup style={{ marginTop: spacing.sm }}>
            <MenuRow
              icon="💳"
              label={t('settings_manage_subscription')}
              onPress={() => void openManageSubscriptions().catch(() => undefined)}
            />
          </GlassGroup>
        </Reveal>

        {/* Données & confidentialité */}
        <Reveal index={3}>
          <SectionLabel label={t('settings_section_privacy')} />
          <GlassGroup>
            <MenuRow
              icon="💡"
              label={t('tip_reset')}
              onPress={() => { void resetTips().then(() => Alert.alert(t('tip_reset'), t('tip_reset_done'))); }}
            />
            <MenuRow
              icon="📥"
              label={t('settings_export_data')}
              loading={exporting}
              onPress={handleExportData}
            />
            <MenuRow
              icon="🔒"
              label={t('settings_privacy_policy')}
              onPress={() => void Linking.openURL(PRIVACY_URL)}
            />
            <MenuRow
              icon="📄"
              label={t('settings_terms')}
              onPress={() => void Linking.openURL(TERMS_URL)}
            />
            <MenuRow
              icon="🧾"
              label={t('settings_cgv')}
              onPress={() => void Linking.openURL(CGV_URL)}
            />
            <MenuRow
              icon="💬"
              label={t('settings_support')}
              onPress={() => void Linking.openURL(SUPPORT_URL)}
            />
          </GlassGroup>
          {/* Suppression du compte : à part, en rouge fonctionnel. */}
          <GlassGroup style={{ marginTop: spacing.sm }}>
            <MenuRow
              icon="🗑️"
              label={t('settings_delete_account')}
              danger
              onPress={handleDeleteAccount}
              loading={deletingAccount}
            />
          </GlassGroup>
        </Reveal>

        {/* Administration (visible uniquement pour les admins) */}
        <AdminSection />

        {/* Déconnexion */}
        <Reveal index={4}>
          <SectionLabel label={t('settings_section_session')} />
          <GlassGroup>
            <MenuRow
              icon="🚪"
              label={t('settings_logout')}
              danger
              onPress={handleLogout}
            />
          </GlassGroup>
        </Reveal>

        {/* Version */}
        <Text style={styles.version}>
          {APP_VERSION ? `YUMIA v${APP_VERSION}` : 'YUMIA'}{user?.email ? ` • ${user.email}` : ''}
        </Text>
      </ScrollView>
    </View>
  );
}

const API = API_BASE_URL;

function AdminSection() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API}/admin/is-admin`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => r.json())
      .then((d: { isAdmin?: boolean }) => setIsAdmin(d.isAdmin === true))
      .catch(() => {});
  }, [accessToken]);

  if (!isAdmin) return null;

  return (
    <>
      <SectionLabel label={t('settings_section_admin')} />
      <GlassGroup>
        <MenuRow
          icon="🛡️"
          label={t('settings_admin_dashboard')}
          onPress={() => router.push('/admin')}
        />
      </GlassGroup>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  plusInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  plusTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  plusSub: { ...typography.caption, color: colors.textSecondary, marginTop: 3, lineHeight: 17 },
  version: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
});
