/**
 * Demandes d'abonnement (compte privé) : accepter ou supprimer.
 * Habillage sobre (18/11/2026) : lignes en verre, « Confirmer » en pastille
 * blanche, « Supprimer » en rouge fonctionnel discret.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import type { Plan } from '../lib/feed-api';
import { useI18n } from '../lib/useI18n';
import { PersonRow, PillButton, QuietEmpty, QuietHeader, SPINNER_COLOR } from '../components/pb2/Pb2Chrome';

const API = API_BASE_URL;

interface FollowRequest {
  id: string;
  requester: { id: string; displayName: string; photoUrl?: string; bio?: string; plan?: Plan | null };
  createdAt: string;
}

export default function FollowRequestsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`${API}/social/follow-requests`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) setRequests(await res.json() as FollowRequest[]);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const respond = async (requestId: string, accept: boolean) => {
    if (!accessToken) return;
    setProcessingId(requestId);
    await fetch(`${API}/social/follow-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ accept }),
    });
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    setProcessingId(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <QuietHeader title={t('fr_title')} onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={SPINNER_COLOR} /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <QuietEmpty emoji="👥" title={t('fr_empty_title')} text={t('fr_empty_text')} />
          }
          renderItem={({ item, index }) => {
            const isProcessing = processingId === item.id;
            return (
              <PersonRow
                index={index}
                avatarSize={52}
                uri={item.requester.photoUrl}
                name={item.requester.displayName}
                plan={item.requester.plan}
                sub={item.requester.bio}
                onPress={() => router.push(`/user/${item.requester.id}` as never)}
                action={isProcessing ? (
                  <View style={styles.processing}><ActivityIndicator color={SPINNER_COLOR} /></View>
                ) : (
                  <View style={styles.btnGroup}>
                    <PillButton tone="solid" label={t('fr_confirm')} onPress={() => void respond(item.id, true)} />
                    <PillButton tone="danger" label={t('fr_delete')} onPress={() => void respond(item.id, false)} />
                  </View>
                )}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  btnGroup: { flexDirection: 'column', gap: 8 },
  processing: { minWidth: 84, alignItems: 'center' },
});
