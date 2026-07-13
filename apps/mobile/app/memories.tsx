import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Image, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth-context';
import { feedApi, type FeedPost } from '../lib/feed-api';
import { colors, radius, spacing, typography } from '../theme/tokens';

const { width: SW } = Dimensions.get('window');
const GRID_ITEM = (SW - 4) / 3;
const MEMORIES_KEY = 'yumia:memories';

type MemTab = 'accueil' | 'appareil' | 'ia' | 'stories';

interface LocalMemory {
  uri: string;
  url?: string;
  type: 'photo' | 'video';
  caption?: string;
  createdAt: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isSameMonthDay(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ── Carte Flashback ───────────────────────────────────────────────────────────
function FlashbackCard({ post }: { post: FeedPost }) {
  const d = new Date(post.createdAt);
  const year = d.getFullYear();
  const dayLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return (
    <Pressable style={styles.flashCard}>
      {post.mediaUrls[0] ? (
        <Image source={{ uri: post.mediaUrls[0] }} style={styles.flashImage} />
      ) : (
        <View style={[styles.flashImage, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 36 }}>📷</Text>
        </View>
      )}
      <View style={styles.flashOverlay}>
        <View style={styles.flashBar} />
        <Text style={styles.flashTitle}>Flashback du {dayLabel}</Text>
        <Text style={styles.flashYear}>{year}</Text>
      </View>
    </Pressable>
  );
}

// ── Tuile grille ─────────────────────────────────────────────────────────────
function GridTile({ uri, isVideo, onPress }: { uri: string; isVideo?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.gridTile}>
      <Image source={{ uri }} style={styles.gridImg} />
      {isVideo && (
        <View style={styles.gridVideoBadge}>
          <Text style={{ color: '#fff', fontSize: 12 }}>▶</Text>
        </View>
      )}
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function MemoriesScreen() {
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MemTab>('accueil');
  const [myPosts, setMyPosts] = useState<FeedPost[]>([]);
  const [localMems, setLocalMems] = useState<LocalMemory[]>([]);
  const [devicePhotos, setDevicePhotos] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !me?.id) return;
    const [allPosts, mems] = await Promise.all([
      feedApi.globalFeed(accessToken).catch(() => [] as FeedPost[]),
      AsyncStorage.getItem(MEMORIES_KEY).then((v) => JSON.parse(v ?? '[]') as LocalMemory[]).catch(() => [] as LocalMemory[]),
    ]);
    setMyPosts(allPosts.filter((p) => p.userId === me.id || p.user?.id === me.id));
    setLocalMems(mems);
    setLoading(false);
    setRefreshing(false);
  }, [accessToken, me?.id]);

  useEffect(() => { void load(); }, [load]);

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      const newMem: LocalMemory = {
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'photo',
        createdAt: new Date().toISOString(),
      };
      const updated = [newMem, ...localMems];
      setLocalMems(updated);
      await AsyncStorage.setItem(MEMORIES_KEY, JSON.stringify(updated));
    }
  };

  // Flashbacks = posts from same calendar day in previous years
  const today = new Date();
  const flashbacks = myPosts.filter((p) => {
    const d = new Date(p.createdAt);
    return isSameMonthDay(d, today) && d.getFullYear() < today.getFullYear();
  });

  // Posts depuis le début, les plus récents en premier
  const recentYumiaPosts = [...myPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const recentLocal = [...localMems].slice(0, 8);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  const TABS: { id: MemTab; label: string }[] = [
    { id: 'accueil', label: 'Accueil' },
    { id: 'appareil', label: 'Appareil' },
    { id: 'ia', label: 'Yumia IA' },
    { id: 'stories', label: 'Stories' },
  ];

  // ── Contenu de l'onglet "Appareil" ──────────────────────────────────────────
  const renderAppareil = () => (
    <View style={{ flex: 1 }}>
      <Pressable style={styles.galleryBanner} onPress={pickFromGallery}>
        <Text style={styles.galleryBannerIcon}>🖼️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.galleryBannerTitle}>Photos de la galerie</Text>
          <Text style={styles.galleryBannerSub}>Importer depuis votre galerie</Text>
        </View>
        <Text style={styles.galleryBannerArrow}>›</Text>
      </Pressable>
      {localMems.length === 0 ? (
        <View style={styles.emptySection}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📁</Text>
          <Text style={styles.emptyTitle}>Aucun souvenir local</Text>
          <Text style={styles.emptySub}>Tes photos et vidéos enregistrées depuis la caméra Yumia apparaîtront ici.</Text>
        </View>
      ) : (
        <FlatList
          data={localMems}
          keyExtractor={(_, i) => String(i)}
          numColumns={3}
          renderItem={({ item }) => (
            <GridTile uri={item.uri} isVideo={item.type === 'video'} />
          )}
          columnWrapperStyle={{ gap: 2 }}
          ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        />
      )}
    </View>
  );

  // ── Contenu de l'onglet "Accueil" ──────────────────────────────────────────
  const renderAccueil = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
    >
      {/* Créer une vidéo */}
      <Pressable style={styles.createVideoBanner} onPress={() => router.push('/camera?mode=reel' as never)}>
        <Text style={styles.createVideoBannerIcon}>🎬</Text>
        <Text style={styles.createVideoBannerTxt}>Créer une vidéo</Text>
        <Text style={styles.createVideoBannerArrow}>›</Text>
      </Pressable>

      {/* Flashbacks */}
      {flashbacks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Flashbacks</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.md }}>
            {flashbacks.map((p) => <FlashbackCard key={p.id} post={p} />)}
          </ScrollView>
        </View>
      )}

      {/* Photos récentes de la galerie locale */}
      {recentLocal.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos récentes de votre galerie</Text>
            <Pressable onPress={() => setActiveTab('appareil')}>
              <Text style={styles.seeAll}>Voir tout</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: spacing.md }}>
            {recentLocal.map((m, i) => (
              <Image key={i} source={{ uri: m.uri }} style={styles.recentThumb} />
            ))}
            <Pressable style={styles.recentMore} onPress={pickFromGallery}>
              <Text style={{ color: colors.brand, fontSize: 24 }}>+</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      {/* Mes publications Yumia */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{recentYumiaPosts.length} Souvenirs Yumia</Text>
        </View>
        {recentYumiaPosts.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📸</Text>
            <Text style={styles.emptyTitle}>Aucune publication</Text>
            <Text style={styles.emptySub}>Tes posts et reels Yumia seront sauvegardés ici.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/camera' as never)}>
              <Text style={styles.emptyBtnTxt}>📷 Ouvrir la caméra</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={recentYumiaPosts}
            keyExtractor={(p) => p.id}
            numColumns={3}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <GridTile
                uri={item.mediaUrls[0] ?? item.videoUrl ?? ''}
                isVideo={!!item.videoUrl || item.mediaUrls[0]?.includes('.mp4')}
                onPress={() => router.push(`/post/${item.id}` as never)}
              />
            )}
            columnWrapperStyle={{ gap: 2 }}
            ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
          />
        )}
      </View>

      {/* Pad bas */}
      <View style={{ height: insets.bottom + 80 }} />
    </ScrollView>
  );

  // ── Onglets Stories ────────────────────────────────────────────────────────
  const renderStories = () => (
    <View style={styles.emptySection}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>⭕</Text>
      <Text style={styles.emptyTitle}>Tes Stories</Text>
      <Text style={styles.emptySub}>Les stories que tu publies sont sauvegardées ici pendant 24h.</Text>
      <Pressable style={styles.emptyBtn} onPress={() => router.push('/camera?mode=story' as never)}>
        <Text style={styles.emptyBtnTxt}>📷 Nouvelle Story</Text>
      </Pressable>
    </View>
  );

  // ── Onglet IA ──────────────────────────────────────────────────────────────
  const renderIA = () => (
    <View style={styles.emptySection}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>🤖</Text>
      <Text style={styles.emptyTitle}>Snaps générés par l'IA</Text>
      <Text style={styles.emptySub}>Les contenus créés avec les outils IA Yumia apparaîtront ici bientôt.</Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable style={styles.headerBack} onPress={() => router.back()}>
          <Text style={styles.headerBackTxt}>∨</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Souvenirs</Text>
        <View style={styles.headerRight}>
          <Pressable style={styles.headerIconBtn}>
            <Text style={styles.headerIconTxt}>🔍</Text>
          </Pressable>
          <Pressable style={styles.headerSelectBtn}>
            <Text style={styles.headerSelectTxt}>Sélectionner</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Onglets ────────────────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((t) => (
          <Pressable key={t.id} style={[styles.tabBtn, activeTab === t.id && styles.tabBtnActive]} onPress={() => setActiveTab(t.id)}>
            <Text style={[styles.tabTxt, activeTab === t.id && styles.tabTxtActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ── Contenu ─────────────────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
        {activeTab === 'accueil' && renderAccueil()}
        {activeTab === 'appareil' && renderAppareil()}
        {activeTab === 'ia' && renderIA()}
        {activeTab === 'stories' && renderStories()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12 },
  headerBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerBackTxt: { fontSize: 20, color: colors.text, fontWeight: '700' },
  headerTitle: { ...typography.h3, color: colors.text, flex: 1, textAlign: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIconTxt: { fontSize: 20 },
  headerSelectBtn: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  headerSelectTxt: { color: colors.text, fontSize: 13, fontWeight: '600' },

  // Tabs
  tabBar: { maxHeight: 48, marginBottom: 4 },
  tabBarContent: { paddingHorizontal: spacing.md, gap: 8, alignItems: 'center' },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface },
  tabBtnActive: { backgroundColor: colors.brand },
  tabTxt: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  tabTxtActive: { color: '#fff' },

  // Create video banner
  createVideoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: spacing.md, marginVertical: 12,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  createVideoBannerIcon: { fontSize: 28 },
  createVideoBannerTxt: { ...typography.body, color: colors.text, fontWeight: '700', flex: 1 },
  createVideoBannerArrow: { fontSize: 22, color: colors.textMuted },

  // Section
  section: { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, marginBottom: 10 },
  sectionTitle: { ...typography.heading, color: colors.text },
  seeAll: { fontSize: 13, color: colors.brand, fontWeight: '600' },

  // Flashback card
  flashCard: { width: 180, height: 240, borderRadius: radius.xl, overflow: 'hidden', position: 'relative' },
  flashImage: { width: '100%', height: '100%' },
  flashOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  flashBar: { height: 3, backgroundColor: colors.brand, borderRadius: 2, marginBottom: 6, width: '70%' },
  flashTitle: { color: '#fff', fontWeight: '700', fontSize: 13 },
  flashYear: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },

  // Recent thumbs
  recentThumb: { width: 80, height: 80, borderRadius: radius.md },
  recentMore: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed' },

  // Gallery banner
  galleryBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    margin: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  galleryBannerIcon: { fontSize: 32 },
  galleryBannerTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  galleryBannerSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  galleryBannerArrow: { fontSize: 22, color: colors.textMuted },

  // Grid
  gridTile: { width: GRID_ITEM, height: GRID_ITEM, position: 'relative' },
  gridImg: { width: '100%', height: '100%' },
  gridVideoBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },

  // Empty states
  emptySection: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.heading, color: colors.text, textAlign: 'center', marginBottom: 8 },
  emptySub: { color: colors.textMuted, textAlign: 'center', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  emptyBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 28, paddingVertical: 13 },
  emptyBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
