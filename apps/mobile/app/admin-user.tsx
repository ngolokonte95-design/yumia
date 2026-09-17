/**
 * Centre de contrôle — fiche d'un compte : identité, activité, et sanctions
 * (suspension temporaire, bannissement, levée).
 *
 * Une sanction ferme aussi les sessions ouvertes côté serveur : la personne
 * est déconnectée dès l'expiration de son jeton, et ne peut plus se
 * reconnecter (mot de passe, Google, Apple) tant qu'elle dure.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import {
  accountStatus, adminUsersApi, fmtDateTime, PLAN_LABEL, type AdminUserDetail,
} from '../lib/admin-users';
import { colors, radius, spacing, typography } from '../theme/tokens';

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
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  const status = accountStatus(user?.suspendedUntil ?? null);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Fiche utilisateur</Text>
        <Pressable onPress={() => void load()} hitSlop={8}><Text style={styles.refresh}>↻</Text></Pressable>
      </View>

      {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}

      {user ? (
        <>
          <View style={styles.card}>
            <View style={styles.identity}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{user.displayName?.[0]?.toUpperCase() ?? '?'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.displayName}</Text>
                <Text style={styles.email} selectable>{user.email}</Text>
              </View>
            </View>
            <View style={styles.badges}>
              {user.isAdmin ? <Text style={[styles.badge, styles.badgeAdmin]}>ADMIN</Text> : null}
              <Text style={[styles.badge, user.plan !== 'free' ? styles.badgePlan : styles.badgeFree]}>
                {PLAN_LABEL[user.plan] ?? user.plan}
              </Text>
              {status === 'active' ? <Text style={[styles.badge, styles.badgeOk]}>Actif</Text> : null}
              {status === 'suspended' ? <Text style={[styles.badge, styles.badgeWarn]}>Suspendu</Text> : null}
              {status === 'banned' ? <Text style={[styles.badge, styles.badgeDanger]}>Banni</Text> : null}
            </View>
            {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          </View>

          {status !== 'active' ? (
            <View style={[styles.card, styles.sanctionCard]}>
              <Text style={styles.sectionTitle}>{status === 'banned' ? 'Banni' : 'Suspendu'}</Text>
              {status === 'suspended' ? <Info label="Jusqu'au" value={fmtDateTime(user.suspendedUntil)} /> : null}
              <Info label="Motif" value={user.suspendedReason ?? '—'} />
              <Pressable style={[styles.btn, styles.btnOk, busy && styles.btnBusy]} onPress={lift} disabled={busy}>
                <Text style={styles.btnTxt}>Lever la sanction</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={styles.sectionHeading}>Compte</Text>
          <View style={styles.card}>
            <Info label="Connexion" value={PROVIDER_LABEL[user.authProvider] ?? user.authProvider} />
            <Info label="Pays" value={user.countryCode ?? '—'} />
            <Info label="Langue" value={user.locale} />
            <Info label="Inscrit le" value={fmtDateTime(user.createdAt)} />
            <Info label="Dernière visite" value={fmtDateTime(user.lastVisitAt)} />
            <Info label="Premium depuis" value={fmtDateTime(user.premiumSince)} />
            <Info label="Sessions ouvertes" value={String(user.stats.activeSessions)} />
          </View>

          <Text style={styles.sectionHeading}>Activité</Text>
          <View style={styles.statsGrid}>
            <Stat label="Visites" value={user.stats.visits} />
            <Stat label="Publications" value={user.stats.posts} />
            <Stat label="Lieux enregistrés" value={user.stats.savedPlaces} />
            <Stat label="Itinéraires" value={user.stats.savedItineraries} />
            <Stat label="Commandes" value={user.stats.orders} />
            <Stat label="Signalé" value={user.stats.reportsAgainst} danger={user.stats.reportsAgainst > 0} />
            <Stat label="A signalé" value={user.stats.reportsMade} />
          </View>

          {user.isAdmin ? (
            <Text style={styles.adminNote}>Compte administrateur : il ne peut pas être suspendu depuis l'app.</Text>
          ) : (
            <>
              <Text style={styles.sectionHeading}>Sanctions</Text>
              <View style={styles.card}>
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
                    <Pressable
                      key={d.days}
                      style={[styles.btn, styles.btnWarn, styles.durationBtn, busy && styles.btnBusy]}
                      onPress={() => suspend(d.days, d.label)}
                      disabled={busy}
                    >
                      <Text style={styles.btnTxtDark}>{d.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={[styles.btn, styles.btnDanger, busy && styles.btnBusy]} onPress={ban} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Bannir définitivement</Text>}
                </Pressable>
              </View>
            </>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>{value}</Text>
    </View>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, gap: spacing.sm },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text, flex: 1 },
  refresh: { fontSize: 22, color: colors.brand },
  error: { color: colors.danger, marginHorizontal: spacing.md },
  card: {
    marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  sanctionCard: { borderColor: colors.danger + '66' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 20 },
  name: { ...typography.h3, color: colors.text },
  email: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  bio: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  badge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  badgeAdmin: { color: '#fff', backgroundColor: '#6C3FE8' },
  badgePlan: { color: '#1a1a1a', backgroundColor: '#D4A72C' },
  badgeFree: { color: colors.textSecondary, backgroundColor: colors.border },
  badgeOk: { color: '#fff', backgroundColor: colors.success },
  badgeWarn: { color: '#1a1a1a', backgroundColor: colors.warning },
  badgeDanger: { color: '#fff', backgroundColor: colors.danger },
  sectionHeading: { ...typography.h3, color: colors.text, marginHorizontal: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.danger, marginBottom: spacing.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md },
  infoLabel: { fontSize: 13, color: colors.textMuted },
  infoValue: { fontSize: 13, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: spacing.md },
  stat: {
    width: '31%', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, paddingVertical: 10, alignItems: 'center',
  },
  statVal: { ...typography.h3, color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  adminNote: { color: colors.textMuted, marginHorizontal: spacing.md, marginTop: spacing.md, fontSize: 13 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  reason: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm,
    color: colors.text, minHeight: 60, textAlignVertical: 'top', fontSize: 14,
  },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: 6 },
  durations: { flexDirection: 'row', gap: 8 },
  durationBtn: { flex: 1 },
  btn: { borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm },
  btnBusy: { opacity: 0.5 },
  btnOk: { backgroundColor: colors.success },
  btnWarn: { backgroundColor: colors.warning, marginTop: 0 },
  btnDanger: { backgroundColor: colors.danger, marginTop: spacing.md },
  btnTxt: { color: '#fff', fontWeight: '800' },
  btnTxtDark: { color: '#1a1a1a', fontWeight: '800' },
});
