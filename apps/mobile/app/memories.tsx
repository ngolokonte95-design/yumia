/**
 * SOUVENIRS — album personnel : publications YUMIA, flashbacks, photos
 * gardées depuis l'appareil.
 *
 * Mise en scène (17/11/2026) : galerie façon album photo. Les publications
 * sont regroupées PAR MOIS (seule donnée de regroupement fiable : la date de
 * publication), chaque mois ouvre sur une grande photo puis une mosaïque à
 * coins arrondis, et les blocs apparaissent en cascade. Une seule couleur
 * d'accent, le dégradé de marque.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth-context';
import { feedApi, type FeedPost } from '../lib/feed-api';
import { colors, elevation, gradients, radius, spacing } from '../theme/tokens';
import { useI18n } from '../lib/useI18n';
import type { TranslationKey } from '../lib/translations';
import { PressableScale, Reveal } from '../components/ui';
import { haptics } from '../lib/useHaptics';
import {
  BrandButton, BrandChip, GlassIconButton, SectionTitle, SocialEmpty, SocialHeader,
} from '../components/social/SocialChrome';

const INTL_LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', ar: 'ar-SA' };

const { width: SW } = Dimensions.get('window');
const GAP = 4;
const PAD = spacing.md;
const GRID_ITEM = (SW - PAD * 2 - GAP * 2) / 3;
const MEMORIES_KEY = 'yumia:memories';

type MemTab = 'accueil' | 'appareil' | 'ia' | 'stories';

interface LocalMemory {
  uri: string;
  url?: string;
  type: 'photo' | 'video';
  caption?: string;
  createdAt: string;
}

function isSameMonthDay(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isVideoPost(p: FeedPost) {
  return !!p.videoUrl || !!p.mediaUrls[0]?.includes('.mp4');
}

// ── Carte Flashback ───────────────────────────────────────────────────────────
function FlashbackCard({ post }: { post: FeedPost }) {
  const { t, locale } = useI18n();
  const d = new Date(post.createdAt);
  const year = d.getFullYear();
  const dayLabel = d.toLocaleDateString(INTL_LOCALE[locale] ?? 'fr-FR', { day: 'numeric', month: 'long' });
  return (
    <PressableScale style={styles.flashCard} scaleTo={0.96}>
      {post.mediaUrls[0] ? (
        <Image source={{ uri: post.mediaUrls[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={{ fontSize: 44 }}>📷</Text>
        </LinearGradient>
      )}
      {/* Voile de lecture confiné à la carte. */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.flashOverlay}>
        <Text style={styles.flashYear}>{year}</Text>
        <Text style={styles.flashTitle} numberOfLines={2}>{t('mem_flashback_of').replace('{day}', dayLabel)}</Text>
      </View>
    </PressableScale>
  );
}

// ── Tuile de mosaïque ────────────────────────────────────────────────────────
function GridTile({
  uri, isVideo, onPress, size = GRID_ITEM, height,
}: {
  uri: string;
  isVideo?: boolean;
  onPress?: () => void;
  size?: number;
  height?: number;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.95} style={[styles.gridTile, { width: size, height: height ?? size }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} recyclingKey={uri} /> : null}
      {isVideo && (
        <View style={styles.gridVideoBadge}>
          <Text style={styles.gridVideoText}>▶</Text>
        </View>
      )}
    </PressableScale>
  );
}

// ── Mois d'album : grande photo d'ouverture + mosaïque ──────────────────────
function MonthAlbum({
  label, posts, index, onOpen,
}: {
  label: string;
  posts: FeedPost[];
  index: number;
  onOpen: (p: FeedPost) => void;
}) {
  const [hero, ...rest] = posts;
  return (
    <Reveal index={Math.min(index, 5)} style={styles.month}>
      <SectionTitle title={label} right={<Text style={styles.monthCount}>{posts.length}</Text>} />
      <View style={styles.mosaic}>
        <GridTile
          uri={hero.mediaUrls[0] ?? hero.videoUrl ?? ''}
          isVideo={isVideoPost(hero)}
          onPress={() => onOpen(hero)}
          size={SW - PAD * 2}
          height={Math.round((SW - PAD * 2) * 0.62)}
        />
        {rest.map((p) => (
          <GridTile
            key={p.id}
            uri={p.mediaUrls[0] ?? p.videoUrl ?? ''}
            isVideo={isVideoPost(p)}
            onPress={() => onOpen(p)}
          />
        ))}
      </View>
    </Reveal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function MemoriesScreen() {
  const { accessToken, user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState<MemTab>('accueil');
  const [myPosts, setMyPosts] = useState<FeedPost[]>([]);
  const [localMems, setLocalMems] = useState<LocalMemory[]>([]);
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
      haptics.success();
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
  const recentYumiaPosts = useMemo(
    () => [...myPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [myPosts],
  );
  const recentLocal = [...localMems].slice(0, 8);

  // Regroupement par mois (ordre déjà antichronologique).
  const months = useMemo(() => {
    const out: { key: string; label: string; posts: FeedPost[] }[] = [];
    for (const p of recentYumiaPosts) {
      const d = new Date(p.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let bucket = out[out.length - 1];
      if (!bucket || bucket.key !== key) {
        let label: string;
        try {
          label = d.toLocaleDateString(INTL_LOCALE[locale] ?? locale ?? 'fr-FR', { month: 'long', year: 'numeric' });
        } catch {
          label = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        }
        bucket = { key, label, posts: [] };
        out.push(bucket);
      }
      bucket.posts.push(p);
    }
    return out;
  }, [recentYumiaPosts, locale]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  const TABS: { id: MemTab; labelKey: TranslationKey }[] = [
    { id: 'accueil', labelKey: 'mem_tab_home' },
    { id: 'appareil', labelKey: 'mem_tab_device' },
    { id: 'ia', labelKey: 'mem_tab_ai' },
    { id: 'stories', labelKey: 'mem_tab_stories' },
  ];

  // ── Contenu de l'onglet "Appareil" ──────────────────────────────────────────
  const renderAppareil = () => (
    <View style={{ flex: 1 }}>
      <ActionBanner
        icon="🖼️"
        title={t('mem_gallery_photos_title')}
        sub={t('mem_gallery_photos_sub')}
        onPress={() => void pickFromGallery()}
      />
      {localMems.length === 0 ? (
        <SocialEmpty emoji="📁" title={t('mem_empty_local_title')} text={t('mem_empty_local_sub')} />
      ) : (
        <FlatList
          data={localMems}
          keyExtractor={(_, i) => String(i)}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: insets.bottom + 40 }}
          renderItem={({ item }) => (
            <GridTile uri={item.uri} isVideo={item.type === 'video'} />
          )}
          columnWrapperStyle={{ gap: GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
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
      <ActionBanner
        icon="🎬"
        title={t('mem_create_video')}
        onPress={() => router.push('/camera?mode=reel' as never)}
      />

      {/* Flashbacks */}
      {flashbacks.length > 0 && (
        <Reveal index={0} style={styles.section}>
          <SectionTitle title={t('mem_flashbacks')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: PAD }}>
            {flashbacks.map((p) => <FlashbackCard key={p.id} post={p} />)}
          </ScrollView>
        </Reveal>
      )}

      {/* Photos récentes de la galerie locale */}
      {recentLocal.length > 0 && (
        <Reveal index={1} style={styles.section}>
          <SectionTitle
            title={t('mem_recent_gallery_photos')}
            right={(
              <Pressable onPress={() => setActiveTab('appareil')} hitSlop={8}>
                <Text style={styles.seeAll}>{t('mem_see_all')}</Text>
              </Pressable>
            )}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: PAD }}>
            {recentLocal.map((m, i) => (
              <Image key={i} source={{ uri: m.uri }} style={styles.recentThumb} contentFit="cover" />
            ))}
            <PressableScale style={styles.recentMore} onPress={() => void pickFromGallery()} scaleTo={0.92}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.recentMoreText}>+</Text>
            </PressableScale>
          </ScrollView>
        </Reveal>
      )}

      {/* Mes publications YUMIA, en album par mois */}
      <View style={styles.section}>
        <View style={styles.albumHead}>
          <Text style={styles.albumTitle}>{t('mem_yumia_memories_count').replace('{n}', String(recentYumiaPosts.length))}</Text>
        </View>
        {recentYumiaPosts.length === 0 ? (
          <SocialEmpty
            emoji="📸"
            title={t('mem_empty_posts_title')}
            text={t('mem_empty_posts_sub')}
            action={<BrandButton label={t('mem_open_camera')} onPress={() => router.push('/camera' as never)} />}
          />
        ) : (
          months.map((m, i) => (
            <MonthAlbum
              key={m.key}
              label={m.label}
              posts={m.posts}
              index={i + 2}
              onOpen={(p) => router.push(`/post/${p.id}` as never)}
            />
          ))
        )}
      </View>

      {/* Pad bas */}
      <View style={{ height: insets.bottom + 80 }} />
    </ScrollView>
  );

  // ── Onglet Stories ─────────────────────────────────────────────────────────
  const renderStories = () => (
    <SocialEmpty
      emoji="⭕"
      title={t('mem_stories_title')}
      text={t('mem_stories_sub')}
      action={<BrandButton label={t('mem_new_story')} onPress={() => router.push('/camera?mode=story' as never)} />}
    />
  );

  // ── Onglet IA ──────────────────────────────────────────────────────────────
  const renderIA = () => (
    <SocialEmpty emoji="🤖" title={t('mem_ai_title')} text={t('mem_ai_sub')} />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <SocialHeader
        title={t('mem_header_title')}
        backIcon="∨"
        onBack={() => router.back()}
        right={(
          <>
            <GlassIconButton icon="🔍" size={38} />
            <View style={styles.selectPill}>
              <Text style={styles.selectText}>{t('mem_select')}</Text>
            </View>
          </>
        )}
      />

      {/* ── Onglets ──────────────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((tab) => (
          <BrandChip
            key={tab.id}
            label={t(tab.labelKey)}
            active={activeTab === tab.id}
            onPress={() => { haptics.select(); setActiveTab(tab.id); }}
          />
        ))}
      </ScrollView>

      {/* ── Contenu ───────────────────────────────────────────────────────────── */}
      <View style={{ flex: 1 }}>
        {activeTab === 'accueil' && renderAccueil()}
        {activeTab === 'appareil' && renderAppareil()}
        {activeTab === 'ia' && renderIA()}
        {activeTab === 'stories' && renderStories()}
      </View>
    </View>
  );
}

/** Bandeau d'action premium : médaillon dégradé, titre, flèche. */
function ActionBanner({
  icon, title, sub, onPress,
}: { icon: string; title: string; sub?: string; onPress: () => void }) {
  return (
    <PressableScale style={styles.banner} onPress={onPress} scaleTo={0.97}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bannerMedal}>
        <Text style={styles.bannerIcon}>{icon}</Text>
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={styles.bannerSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      <Text style={styles.bannerArrow}>›</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },

  selectPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: 'rgba(31,31,42,0.72)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  selectText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },

  // Onglets
  tabBar: { maxHeight: 52, marginBottom: spacing.xs, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: PAD, gap: 8, alignItems: 'center' },

  // Bandeau d'action
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: PAD, marginVertical: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  bannerMedal: {
    width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    ...elevation.glowBrand,
  },
  bannerIcon: { fontSize: 26 },
  bannerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900' },
  bannerSub: { color: colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 },
  bannerArrow: { fontSize: 26, color: colors.brandSoft, fontWeight: '300' },

  // Sections
  section: { marginBottom: spacing.lg },
  seeAll: { fontSize: 13, color: colors.brandSoft, fontWeight: '800' },
  albumHead: { paddingHorizontal: PAD, marginBottom: spacing.md },
  albumTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },

  // Mois d'album
  month: { marginBottom: spacing.lg },
  monthCount: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: PAD },

  // Flashback
  flashCard: {
    width: 210, height: 290, borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.surface, ...elevation.medium,
  },
  flashOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, gap: 2 },
  flashYear: {
    color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 },
  },
  flashTitle: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13 },

  // Vignettes récentes
  recentThumb: { width: 92, height: 92, borderRadius: radius.md },
  recentMore: {
    width: 92, height: 92, borderRadius: radius.md, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  recentMoreText: { color: '#fff', fontSize: 32, fontWeight: '300' },

  // Mosaïque
  gridTile: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  gridVideoBadge: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(14,14,18,0.6)', alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)',
  },
  gridVideoText: { color: '#fff', fontSize: 10, marginLeft: 1 },
});
