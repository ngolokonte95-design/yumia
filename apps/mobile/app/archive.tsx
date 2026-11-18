import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
import { GridTile } from '../components/p2b/ProfileVisuals';
import { QuietEmpty, QuietHeader, SegmentTabs, SPINNER_COLOR } from '../components/pb2/Pb2Chrome';

const API = API_BASE_URL;
const { width: SCREEN_W } = Dimensions.get('window');

interface Post { id: string; mediaUrls: string[]; caption?: string | null }

/**
 * Archivés & brouillons — posts masqués sans suppression + posts non publiés.
 * Habillage sobre (18/11/2026) : onglets en rail de verre, vignettes à coins
 * arrondis espacées ; aucun accent de couleur.
 */
export default function ArchiveScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [tab, setTab] = useState<'archived' | 'drafts'>('archived');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    const res = await fetch(`${API}/posts/${tab}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) setPosts(await res.json());
    setLoading(false);
  }, [accessToken, tab]);

  useEffect(() => { void load(); }, [load]);

  const act = (post: Post) => {
    if (!accessToken) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    if (tab === 'archived') {
      Alert.alert(post.caption ?? t('ar_archived_post_default'), undefined, [
        { text: t('ar_cancel'), style: 'cancel' },
        {
          text: t('ar_restore_to_profile'),
          onPress: async () => { await fetch(`${API}/posts/${post.id}/archive`, { method: 'POST', headers: h }); void load(); },
        },
        {
          text: t('ar_delete'), style: 'destructive',
          onPress: async () => { await fetch(`${API}/posts/${post.id}`, { method: 'DELETE', headers: h }); void load(); },
        },
      ]);
    } else {
      Alert.alert(post.caption ?? t('ar_draft_default'), undefined, [
        { text: t('ar_cancel'), style: 'cancel' },
        {
          text: t('ar_publish_now'),
          onPress: async () => { await fetch(`${API}/posts/${post.id}/publish`, { method: 'POST', headers: h }); void load(); },
        },
        {
          text: t('ar_delete'), style: 'destructive',
          onPress: async () => { await fetch(`${API}/posts/${post.id}`, { method: 'DELETE', headers: h }); void load(); },
        },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <QuietHeader title={t('ar_title')} onBack={() => router.back()} />

      <SegmentTabs
        tabs={[
          { key: 'archived', label: t('ar_tab_archived') },
          { key: 'drafts', label: t('ar_tab_drafts') },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={SPINNER_COLOR} /></View>
      ) : (
        <FlatList
          data={posts}
          numColumns={3}
          keyExtractor={(p) => p.id}
          columnWrapperStyle={styles.gridRow}
          ItemSeparatorComponent={GridGap}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          renderItem={({ item, index }) => (
            <GridTile size={TILE} index={index} onPress={() => act(item)}>
              {item.mediaUrls[0] ? (
                <Image source={{ uri: item.mediaUrls[0] }} style={styles.gridImg} />
              ) : (
                <View style={[styles.gridImg, styles.gridPlaceholder]}><Text style={styles.placeholderIcon}>📷</Text></View>
              )}
            </GridTile>
          )}
          ListEmptyComponent={
            <QuietEmpty
              emoji={tab === 'archived' ? '📁' : '📝'}
              text={tab === 'archived' ? t('ar_empty_archived') : t('ar_empty_drafts')}
            />
          }
        />
      )}
    </View>
  );
}

const GRID_GAP = 4;
/** Vignette : 3 par ligne, avec marges et espaces. */
const TILE = Math.floor((SCREEN_W - spacing.md * 2 - GRID_GAP * 2) / 3);

function GridGap() {
  return <View style={{ height: GRID_GAP }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridRow: { gap: GRID_GAP, paddingHorizontal: spacing.md },
  gridImg: { width: '100%', height: '100%' },
  gridPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 22 },
});
