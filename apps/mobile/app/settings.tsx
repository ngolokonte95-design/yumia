/**
 * PARAMÈTRES — notifications, sécurité, compte, données.
 */
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { resetPasswordRequest, deleteAccountRequest, exportDataRequest, updateProfileRequest } from '../lib/auth-api';

const PRIVACY_URL = 'https://yumia.app/privacy';
const TERMS_URL = 'https://yumia.app/terms';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, accessToken } = useAuth();

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
      'Supprimer mon compte',
      'Cette action est irréversible. Toutes tes données (visites, badges, adresses) seront effacées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
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
      Alert.alert('Erreur', 'Impossible de supprimer le compte. Réessaie plus tard.');
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleExportData() {
    if (!accessToken) return;
    setExporting(true);
    try {
      await exportDataRequest(accessToken);
      Alert.alert(
        'Export réussi',
        'Tes données ont été préparées. En production, elles seront envoyées à ton adresse email.',
      );
    } catch {
      Alert.alert('Erreur', "L'export a échoué. Réessaie plus tard.");
    } finally {
      setExporting(false);
    }
  }

  function handleLogout() {
    Alert.alert('Se déconnecter ?', '', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Paramètres</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Compte */}
        <SectionTitle label="Compte" />
        <SettingRow
          icon="✏️"
          label="Modifier le profil"
          onPress={() => router.push('/edit-profile')}
        />
        {user?.authProvider === 'password' ? (
          <SettingRow
            icon="🔑"
            label="Changer le mot de passe"
            onPress={handleChangePassword}
          />
        ) : null}
        <SettingRow
          icon="🌍"
          label="Langue"
          value={user?.locale?.toUpperCase() ?? 'FR'}
          onPress={() => router.push('/edit-profile')}
        />

        {/* Notifications */}
        <SectionTitle label="Notifications" />
        <SettingToggle
          icon="🌅"
          label="Digest du soir"
          sublabel="Une suggestion inspirante chaque soir entre 18h et 23h"
          value={notifDigest}
          onValueChange={(v) => { setNotifDigest(v); void saveNotifPref('notifDigest', v); }}
        />
        <SettingToggle
          icon="🔥"
          label="Rappels de streak"
          sublabel="YUMIA te rappelle d'explorer avant minuit"
          value={notifStreak}
          onValueChange={(v) => { setNotifStreak(v); void saveNotifPref('notifStreak', v); }}
        />

        {/* YUMIA Plus */}
        <SectionTitle label="Abonnement" />
        <Pressable
          style={styles.plusCard}
          onPress={() => router.push('/plus')}
        >
          <View>
            <Text style={styles.plusTitle}>
              {user?.plan === 'plus' ? '✨ YUMIA Plus — Actif' : '✨ Passer à YUMIA Plus'}
            </Text>
            <Text style={styles.plusSub}>
              {user?.plan === 'plus'
                ? 'Merci pour ton soutien !'
                : 'Streak freeze, historique illimité, accès prioritaire aux nouvelles villes.'}
            </Text>
          </View>
          {user?.plan !== 'plus' ? (
            <Text style={styles.plusChevron}>›</Text>
          ) : null}
        </Pressable>

        {/* Données & confidentialité */}
        <SectionTitle label="Données & confidentialité" />
        <SettingRow
          icon="📥"
          label="Exporter mes données"
          loading={exporting}
          onPress={handleExportData}
        />
        <SettingRow
          icon="🔒"
          label="Politique de confidentialité"
          onPress={() => void Linking.openURL(PRIVACY_URL)}
        />
        <SettingRow
          icon="📄"
          label="Conditions d'utilisation"
          onPress={() => void Linking.openURL(TERMS_URL)}
        />
        <SettingRow
          icon="🗑️"
          label="Supprimer mon compte"
          danger
          onPress={handleDeleteAccount}
          loading={deletingAccount}
        />

        {/* Administration (visible uniquement pour les admins) */}
        <AdminSection />

        {/* Déconnexion */}
        <SectionTitle label="Session" />
        <SettingRow
          icon="🚪"
          label="Se déconnecter"
          danger
          onPress={handleLogout}
        />

        {/* Version */}
        <Text style={styles.version}>YUMIA v0.1.0 • {user?.email}</Text>
      </ScrollView>
    </View>
  );
}

const API = process.env.EXPO_PUBLIC_API_URL ?? '';

function AdminSection() {
  const { accessToken } = useAuth();
  const router = useRouter();
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
      <SectionTitle label="Administration" />
      <SettingRow
        icon="🛡️"
        label="Dashboard Admin"
        onPress={() => router.push('/admin')}
      />
    </>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function SettingRow({
  icon,
  label,
  value,
  danger = false,
  loading = false,
  onPress,
}: {
  icon: string;
  label: string;
  value?: string;
  danger?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {loading
        ? <ActivityIndicator size="small" color={colors.textMuted} />
        : value
          ? <Text style={styles.rowValue}>{value}</Text>
          : <Text style={styles.rowChevron}>›</Text>
      }
    </Pressable>
  );
}

function SettingToggle({
  icon,
  label,
  sublabel,
  value,
  onValueChange,
}: {
  icon: string;
  label: string;
  sublabel: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sublabel}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: `${colors.brand}88` }}
        thumbColor={value ? colors.brand : colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 40, padding: spacing.xs },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 22 },
  title: { ...typography.heading, color: colors.textPrimary },
  content: { paddingBottom: spacing.xxl },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  rowLabelDanger: { color: colors.danger },
  rowValue: { ...typography.caption, color: colors.textMuted },
  rowChevron: { ...typography.title, color: colors.textMuted, lineHeight: 20 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleSub: { ...typography.caption, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  plusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${colors.brand}12`,
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  plusTitle: { ...typography.body, color: colors.brandSoft, fontWeight: '700' },
  plusSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  plusChevron: { ...typography.title, color: colors.brandSoft, lineHeight: 20 },
  version: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
});
