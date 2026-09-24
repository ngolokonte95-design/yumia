/**
 * File d'attente de modération — réservée à l'administrateur.
 *
 * Les signalements étaient enregistrés depuis le début, mais rien ne permettait
 * de les lire : ils partaient dans le vide. La règle 1.2 de l'App Store exige
 * de pouvoir retirer un contenu signalé ET d'exclure son auteur ; cet écran
 * est l'endroit où les deux se font.
 *
 * Textes en français, sans passer par `useI18n` : cet écran n'est visible que
 * par une seule personne, et traduire une interface d'administration en treize
 * langues coûterait plus que ça ne rapporte.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { API_BASE_URL } from '../lib/config';
import { colors, radius, spacing, typography } from '../theme/tokens';

const API = API_BASE_URL;

interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  createdAt: string;
  preview: string | null;
  author: { id: string; displayName: string; email: string } | null;
  reporter: { id: string; displayName: string } | null;
}

interface Suspended {
  id: string;
  displayName: string;
  email: string;
  suspendedUntil: string;
  suspendedReason: string | null;
}

type Action = 'dismiss' | 'delete' | 'suspend' | 'delete_and_suspend';

const TARGET_LABEL: Record<string, string> = {
  post: 'Publication',
  comment: 'Commentaire',
  story: 'Story',
  user: 'Compte',
  message: 'Message',
  meetup: 'Sortie',
  review: 'Avis',
};

export default function AdminModerationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();

  const [reports, setReports] = useState<Report[]>([]);
  const [suspended, setSuspended] = useState<Suspended[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const headers = { Authorization: `Bearer ${accessToken}` };
    try {
      const [r, s] = await Promise.allSettled([
        fetch(`${API}/admin/reports?status=pending`, { headers }),
        fetch(`${API}/admin/users/suspended`, { headers }),
      ]);
      if (r.status === 'fulfilled' && r.value.ok) setReports(await r.value.json());
      if (s.status === 'fulfilled' && s.value.ok) setSuspended(await s.value.json());
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  /** Applique une décision, puis recharge : la file doit refléter l'état réel. */
  const resolve = useCallback(async (report: Report, action: Action, days?: number) => {
    if (!accessToken) return;
    setBusy(report.id);
    try {
      const res = await fetch(`${API}/admin/reports/${report.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action, days, reason: report.reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        Alert.alert('Échec', body.error?.message ?? `Erreur ${res.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }, [accessToken, load]);

  /**
   * Suspendre est la seule action irréversible à l'échelle d'une personne :
   * on demande confirmation, en nommant qui est visé.
   */
  const confirmSuspend = (report: Report, action: Action, days?: number) => {
    const who = report.author?.displayName ?? 'cet utilisateur';
    const duree = days ? `${days} jours` : 'définitivement';
    Alert.alert(
      `Suspendre ${who} ?`,
      `${who} ne pourra plus rien publier (${duree}).${action === 'delete_and_suspend' ? ' Le contenu signalé sera aussi supprimé.' : ''}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Suspendre', style: 'destructive', onPress: () => void resolve(report, action, days) },
      ],
    );
  };

  const unsuspend = useCallback(async (user: Suspended) => {
    if (!accessToken) return;
    setBusy(user.id);
    try {
      await fetch(`${API}/admin/users/${user.id}/unsuspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await load();
    } finally {
      setBusy(null);
    }
  }, [accessToken, load]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={colors.brand} />}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Modération</Text>
      </View>

      <Text style={styles.sectionTitle}>
        {reports.length === 0 ? 'Aucun signalement en attente' : `${reports.length} signalement(s) en attente`}
      </Text>

      {reports.map((report) => (
        <View key={report.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.badge}>{TARGET_LABEL[report.targetType] ?? report.targetType}</Text>
            <Text style={styles.date}>{new Date(report.createdAt).toLocaleDateString('fr-FR')}</Text>
          </View>

          <Text style={styles.reason}>{report.reason}</Text>
          {report.details ? <Text style={styles.details}>« {report.details} »</Text> : null}

          {report.preview ? (
            <Text style={styles.preview} numberOfLines={4}>{report.preview}</Text>
          ) : (
            <Text style={styles.gone}>Contenu introuvable — déjà supprimé.</Text>
          )}

          <Text style={styles.meta}>
            Auteur : {report.author?.displayName ?? 'inconnu'}
            {report.reporter ? `  ·  Signalé par ${report.reporter.displayName}` : ''}
          </Text>

          {busy === report.id ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.sm }} />
          ) : (
            <View style={styles.actions}>
              <Pressable style={styles.btnGhost} onPress={() => void resolve(report, 'dismiss')}>
                <Text style={styles.btnGhostText}>Classer sans suite</Text>
              </Pressable>
              <Pressable style={styles.btnWarn} onPress={() => void resolve(report, 'delete')}>
                <Text style={styles.btnText}>Retirer le contenu</Text>
              </Pressable>
              <Pressable style={styles.btnWarn} onPress={() => confirmSuspend(report, 'suspend', 7)}>
                <Text style={styles.btnText}>Suspendre 7 j</Text>
              </Pressable>
              <Pressable style={styles.btnDanger} onPress={() => confirmSuspend(report, 'delete_and_suspend')}>
                <Text style={styles.btnText}>Retirer + bannir</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {suspended.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>{suspended.length} compte(s) suspendu(s)</Text>
          {suspended.map((user) => (
            <View key={user.id} style={styles.card}>
              <Text style={styles.reason}>{user.displayName}</Text>
              <Text style={styles.meta}>{user.email}</Text>
              {user.suspendedReason ? <Text style={styles.details}>{user.suspendedReason}</Text> : null}
              <Text style={styles.meta}>
                Jusqu'au {new Date(user.suspendedUntil).toLocaleDateString('fr-FR')}
              </Text>
              {busy === user.id ? (
                <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.sm }} />
              ) : (
                <Pressable style={styles.btnGhost} onPress={() => void unsuspend(user)}>
                  <Text style={styles.btnGhostText}>Rétablir le compte</Text>
                </Pressable>
              )}
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    ...typography.caption,
    color: colors.brand,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  date: { ...typography.caption, color: colors.textMuted },
  reason: { ...typography.body, color: colors.text, fontWeight: '700' },
  details: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  preview: {
    ...typography.body,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  gone: { ...typography.caption, color: colors.textMuted },
  meta: { ...typography.caption, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  btnGhost: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  btnGhostText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  btnWarn: {
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  btnDanger: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  btnText: { ...typography.caption, color: '#fff', fontWeight: '700' },
});
