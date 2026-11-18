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
 *
 * Refonte visuelle du 18/11/2026 (sobre : cartes de verre, actions en jaune /
 * rouge fonctionnels) ; décisions, confirmations et appels d'origine à l'identique.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { API_BASE_URL } from '../lib/config';
import { colors, radius, spacing } from '../theme/tokens';
import { Reveal } from '../components/ui';
import { QuietEmpty, QuietHeader } from '../components/pb2/Pb2Chrome';
import {
  ADMIN_SPINNER, AdminButton, AdminCard, AdminLoading, AdminSection, AlertCount, InitialAvatar, StatusBadge,
} from '../components/admin/AdminChrome';

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
    return <AdminLoading paddingTop={insets.top} />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xxl }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={ADMIN_SPINNER} colors={[colors.brand]} progressViewOffset={insets.top} />}
    >
      <QuietHeader title="Modération" onBack={() => router.back()} />

      <AdminSection
        title={reports.length === 0 ? 'Aucun signalement en attente' : `${reports.length} signalement(s) en attente`}
        right={reports.length > 0 ? <AlertCount count={reports.length} /> : undefined}
      />

      {reports.length === 0 ? (
        <QuietEmpty emoji="🛡️" />
      ) : null}

      {reports.map((report, i) => (
        <Reveal key={report.id} index={Math.min(i, 5)} from="fade">
          <AdminCard style={styles.card}>
            <View style={styles.cardHead}>
              <StatusBadge label={(TARGET_LABEL[report.targetType] ?? report.targetType).toUpperCase()} tone="plan" />
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
              <ActivityIndicator color={ADMIN_SPINNER} style={{ marginTop: spacing.sm }} />
            ) : (
              <View style={styles.actions}>
                <AdminButton label="Classer sans suite" onPress={() => void resolve(report, 'dismiss')} style={styles.action} />
                <AdminButton label="Retirer le contenu" tone="warn" onPress={() => void resolve(report, 'delete')} style={styles.action} />
                <AdminButton label="Suspendre 7 j" tone="warn" onPress={() => confirmSuspend(report, 'suspend', 7)} style={styles.action} />
                <AdminButton label="Retirer + bannir" tone="danger" onPress={() => confirmSuspend(report, 'delete_and_suspend')} style={styles.action} />
              </View>
            )}
          </AdminCard>
        </Reveal>
      ))}

      {suspended.length > 0 ? (
        <>
          <AdminSection title={`${suspended.length} compte(s) suspendu(s)`} />
          {suspended.map((user) => (
            <AdminCard key={user.id} style={styles.card}>
              <View style={styles.person}>
                <InitialAvatar name={user.displayName} />
                <View style={styles.personText}>
                  <Text style={styles.reason} numberOfLines={1}>{user.displayName}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{user.email}</Text>
                </View>
              </View>
              {user.suspendedReason ? <Text style={styles.details}>{user.suspendedReason}</Text> : null}
              <Text style={styles.meta}>
                Jusqu'au {new Date(user.suspendedUntil).toLocaleDateString('fr-FR')}
              </Text>
              {busy === user.id ? (
                <ActivityIndicator color={ADMIN_SPINNER} style={{ marginTop: spacing.sm }} />
              ) : (
                <AdminButton label="Rétablir le compte" tone="ok" onPress={() => void unsuspend(user)} style={styles.restore} />
              )}
            </AdminCard>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { gap: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  reason: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  details: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
  preview: {
    color: colors.textSecondary, fontSize: 14, lineHeight: 20,
    backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: radius.md, padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  gone: { color: colors.textMuted, fontSize: 13 },
  meta: { color: colors.textMuted, fontSize: 12.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  // Deux boutons par ligne, de même largeur.
  action: { flexGrow: 1, flexBasis: '46%', paddingHorizontal: 10, minHeight: 42 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  personText: { flex: 1, minWidth: 0, gap: 2 },
  restore: { marginTop: spacing.xs },
});
