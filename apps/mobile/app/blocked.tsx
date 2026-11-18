/**
 * Comptes bloqués — liste les utilisateurs bloqués et permet de les débloquer.
 * Backend : GET /social/blocked, DELETE /social/block/:userId.
 *
 * Habillage sobre (18/11/2026) : lignes en verre, aucun accent de couleur.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
import { PersonRow, PillButton, QuietEmpty, QuietHeader, SPINNER_COLOR } from '../components/pb2/Pb2Chrome';

const API = API_BASE_URL;

interface BlockedUser {
  id: string;
  displayName: string;
  photoUrl?: string | null;
}

export default function BlockedScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API}/social/blocked`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setUsers(await res.json() as BlockedUser[]);
    } catch {
      // réseau — la liste reste vide, l'utilisateur peut revenir
    }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const unblock = async (userId: string) => {
    if (!accessToken) return;
    setProcessingId(userId);
    try {
      const res = await fetch(`${API}/social/block/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      // best-effort
    }
    setProcessingId(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <QuietHeader title={t('bl_title')} onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={SPINNER_COLOR} /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 40 }}
          ListEmptyComponent={
            <QuietEmpty emoji="🚫" title={t('bl_empty_title')} text={t('bl_empty_text')} />
          }
          renderItem={({ item, index }) => (
            <PersonRow
              index={index}
              uri={item.photoUrl}
              name={item.displayName}
              action={(
                <PillButton
                  label={t('bl_unblock')}
                  loading={processingId === item.id}
                  onPress={() => void unblock(item.id)}
                />
              )}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
