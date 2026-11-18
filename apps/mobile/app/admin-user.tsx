/**
 * Centre de contrôle — fiche d'un compte : identité, activité, et sanctions
 * (suspension temporaire, bannissement, levée).
 *
 * Une sanction ferme aussi les sessions ouvertes côté serveur : la personne
 * est déconnectée dès l'expiration de son jeton, et ne peut plus se
 * reconnecter (mot de passe, Google, Apple) tant qu'elle dure.
 *
 * Refonte visuelle du 18/11/2026 (sobre : verre, chiffres forts, sanctions en
 * jaune / rouge fonctionnels) ; logique et confirmations d'origine à l'identique.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import {
  accountStatus, adminUsersApi, fmtDateTime, PLAN_LABEL, type AdminUserDetail,
} from '../lib/admin-users';
import { colors, radius, spacing } from '../theme/tokens';
import { GlassGroup } from '../components/profile/ProfileChrome';
import { QuietHeader, RoundGlassButton } from '../components/pb2/Pb2Chrome';
import {
  ADMIN_SPINNER, AdminButton, AdminCard, AdminLoading, AdminSection, ErrorBanner, InfoRow,
  InitialAvatar, StatGrid, StatTile, StatusBadge,
} from '../components/admin/AdminChrome';

const DURATIONS: Array<{ days: number; label: string }> = [
  { days: 1, label: '24 h' },
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
];

const PROVIDER_LABEL: Record<string, string> = { password: 'Email', google: 'Google', apple: 'Apple' };

export default function AdminUserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError(null);
    try {
      setUser(await adminUsersApi.detail(accessToken, id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      setReason('');
      await load();
      Alert.alert('Fait', done);
    } catch (e) {
      Alert.alert('Action impossible', e instanceof Error ? e.message : 'Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const suspend = (days: number, label: string) => {
    if (!accessToken || !user) return;
    Alert.alert(
      `Suspendre ${label} ?`,
      `${user.displayName} (${user.email}) ne pourra plus publier ni se reconnecter pendant ${label}.` +
        (reason.trim() ? `\n\nMotif : ${reason.trim()}` : '\n\nAucun motif ne sera affiché.'),
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Suspendre',
          style: 'destructive',
          onPress: () => void run(() => adminUsersApi.suspend(accessToken, user.id, days, reason), `Compte suspendu ${label}.`),
        },
      ],
    );
  };

  const ban = () => {
    if (!accessToken || !user) return;
    Alert.alert(
      'Bannir définitivement ?',
      `${user.displayName} (${user.email}) sera exclu de YUMIA sans date de fin. Tu pourras revenir sur cette décision depuis cette fiche.` +
        (reason.trim() ? `\n\nMotif : ${reason.trim()}` : ''),
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bannir',
          style: 'destructive',
          onPress: () => void run(() => adminUsersApi.suspend(accessToken, user.id, undefined, reason), 'Compte banni.'),
        },
      ],
    );
  };

  const lift = () => {
    if (!accessToken || !user) return;
    Alert.alert('Lever la sanction ?', `${user.displayName} pourra de nouveau utiliser YUMIA.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Lever', onPress: () => void run(() => adminUsersApi.unsuspend(accessToken, user.id), 'Sanction levée.') },
    ]);
  };

  if (loading && !user) {
    return <AdminLoading paddingTop={insets.top} />;
  }

  const status = accountStatus(user?.suspendedUntil ?? null);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load()}
          tintColor={ADMIN_SPINNER}
          colors={[colors.brand]}
          progressViewOffset={insets.top}
        />
      }
    >
      <QuietHeader
        title="Fiche utilisateur"
        onBack={() => router.back()}
        right={<RoundGlassButton label="↻" onPress={() => void load()} />}
      />

      {error ? <ErrorBanner message={error} /> : null}

      {user ? (
        <>
          <AdminCard>
            <View style={styles.identity}>
              <InitialAvatar name={user.displayName} size={60} />
              <View style={styles.identityText}>
                <Text style={styles.name}>{user.displayName}</Text>
                <Text style={styles.email} selectable>{user.email}</Text>
              </View>
            </View>
            <View style={styles.badges}>
              {user.isAdmin ? <StatusBadge label="ADMIN" tone="plan" /> : null}
              <StatusBadge label={PLAN_LABEL[user.plan] ?? user.plan} tone={user.plan !== 'free' ? 'plan' : 'neutral'} />
              {status === 'active' ? <StatusBadge label="Actif" tone="ok" /> : null}
              {status === 'suspended' ? <StatusBadge label="Suspendu" tone="warn" /> : null}
              {status === 'banned' ? <StatusBadge label="Banni" tone="danger" /> : null}
            </View>
            {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          </AdminCard>

          {status !== 'active' ? (
            <AdminCard alert>
              <Text style={styles.sanctionTitle}>{status === 'banned' ? 'Banni' : 'Suspendu'}</Text>
              {status === 'suspended' ? <InfoRow flush label="Jusqu'au" value={fmtDateTime(user.suspendedUntil)} /> : null}
              <InfoRow flush label="Motif" value={user.suspendedReason ?? '—'} />
              <AdminButton label="Lever la sanction" tone="ok" onPress={lift} disabled={busy} style={styles.liftBtn} />
            </AdminCard>
          ) : null}

          <AdminSection title="Compte" />
          <GlassGroup style={styles.group}>
            <InfoRow label="Connexion" value={PROVIDER_LABEL[user.authProvider] ?? user.authProvider} />
            <InfoRow label="Pays" value={user.countryCode ?? '—'} />
            <InfoRow label="Langue" value={user.locale} />
            <InfoRow label="Inscrit le" value={fmtDateTime(user.createdAt)} />
            <InfoRow label="Dernière visite" value={fmtDateTime(user.lastVisitAt)} />
            <InfoRow label="Premium depuis" value={fmtDateTime(user.premiumSince)} />
            <InfoRow label="Sessions ouvertes" value={String(user.stats.activeSessions)} />
          </GlassGroup>

          <AdminSection title="Activité" />
          <StatGrid>
            <StatTile third label="Visites" value={user.stats.visits} />
            <StatTile third label="Publications" value={user.stats.posts} />
            <StatTile third label="Lieux enregistrés" value={user.stats.savedPlaces} />
            <StatTile third label="Itinéraires" value={user.stats.savedItineraries} />
            <StatTile third label="Commandes" value={user.stats.orders} />
            <StatTile third label="Signalé" value={user.stats.reportsAgainst} danger={user.stats.reportsAgainst > 0} />
            <StatTile third label="A signalé" value={user.stats.reportsMade} />
          </StatGrid>

          {user.isAdmin ? (
            <Text style={styles.adminNote}>Compte administrateur : il ne peut pas être suspendu depuis l'app.</Text>
          ) : (
            <>
              <AdminSection title="Sanctions" />
              <AdminCard>
                <Text style={styles.hint}>
                  Le motif est montré à la personne quand elle essaie de se connecter.
                </Text>
                <TextInput
                  style={styles.reason}
                  placeholder="Motif (facultatif)"
                  placeholderTextColor={colors.textMuted}
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  maxLength={200}
                />
                <Text style={styles.label}>Suspendre</Text>
                <View style={styles.durations}>
                  {DURATIONS.map((d) => (
                    <AdminButton
                      key={d.days}
                      label={d.label}
                      tone="warn"
                      onPress={() => suspend(d.days, d.label)}
                      disabled={busy}
                      style={styles.durationBtn}
                    />
                  ))}
                </View>
                <AdminButton
                  label="Bannir définitivement"
                  tone="danger"
                  onPress={ban}
                  disabled={busy}
                  loading={busy}
                  style={styles.banBtn}
                />
              </AdminCard>
            </>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  group: { marginHorizontal: spacing.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1, minWidth: 0 },
  name: { color: colors.textPrimary, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  email: { color: colors.textSecondary, fontSize: 13.5, marginTop: 2 },
  bio: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 19, marginTop: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  sanctionTitle: { color: colors.danger, fontSize: 17, fontWeight: '900', marginBottom: spacing.xs },
  liftBtn: { marginTop: spacing.sm },
  adminNote: { color: colors.textMuted, marginHorizontal: spacing.md, marginTop: spacing.lg, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: spacing.sm },
  reason: {
    borderRadius: radius.md, padding: spacing.md, minHeight: 64, textAlignVertical: 'top',
    color: colors.textPrimary, fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: spacing.sm },
  durations: { flexDirection: 'row', gap: 8 },
  durationBtn: { flex: 1, paddingHorizontal: 8 },
  banBtn: { marginTop: spacing.md },
});
