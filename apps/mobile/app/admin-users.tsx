/**
 * Centre de contrôle — liste des comptes.
 *
 * Ouvert depuis une carte de la vue d'ensemble (`segment`) ou un pays
 * (`country`). Recherche par email ou nom. Textes en français sans i18n, comme
 * le reste de l'administration : une seule personne voit cet écran.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import {
  accountStatus, adminUsersApi, PLAN_LABEL, SEGMENT_LABEL, type AdminUserRow, type UserSegment,
} from '../lib/admin-users';
import { colors, radius, spacing, typography } from '../theme/tokens';

const SEGMENTS: UserSegment[] = ['all', 'premium', 'active7d', 'newToday', 'new7d', 'new30d', 'suspended', 'banned'];
const PAGE = 30;

export default function AdminUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const params = useLocalSearchParams<{ segment?: string; country?: string }>();

  const [segment, setSegment] = useState<UserSegment>(
    SEGMENTS.includes(params.segment as UserSegment) ? (params.segment as UserSegment) : 'all',
  );
  const [country, setCountry] = useState<string | undefined>(params.country || undefined);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dernière requête lancée : une réponse lente d'une recherche précédente ne
  // doit pas écraser la liste de la recherche en cours.
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await adminUsersApi.list(accessToken, { segment, q: debounced, country, offset: 0, limit: PAGE });
      if (id !== requestId.current) return;
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [accessToken, segment, debounced, country]);

  useEffect(() => { void load(); }, [load]);

  // Retour de la fiche d'un compte : une suspension a pu changer son statut.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    void load();
  }, [load]));

  const loadMore = async () => {
    if (!accessToken || loading || loadingMore || items.length >= total) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const res = await adminUsersApi.list(accessToken, { segment, q: debounced, country, offset: items.length, limit: PAGE });
      if (id !== requestId.current) return;
      setItems((prev) => [...prev, ...res.items.filter((u) => !prev.some((p) => p.id === u.id))]);
      setTotal(res.total);
    } catch {
      // la liste déjà chargée reste affichée
    } finally {
      setLoadingMore(false);
    }
  };

  const renderItem = ({ item }: { item: AdminUserRow }) => {
    const status = accountStatus(item.suspendedUntil);
    return (
      <Pressable style={styles.row} onPress={() => router.push(`/admin-user?id=${item.id}` as never)}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{item.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
            {item.isAdmin ? <Text style={[styles.badge, styles.badgeAdmin]}>ADMIN</Text> : null}
            {item.plan !== 'free' ? <Text style={[styles.badge, styles.badgePlan]}>{PLAN_LABEL[item.plan] ?? item.plan}</Text> : null}
            {status === 'suspended' ? <Text style={[styles.badge, styles.badgeWarn]}>Suspendu</Text> : null}
            {status === 'banned' ? <Text style={[styles.badge, styles.badgeDanger]}>Banni</Text> : null}
          </View>
          <Text style={styles.email} numberOfLines={1} selectable>{item.email}</Text>
          <Text style={styles.meta}>
            {item.countryCode ?? '—'} · inscrit le {new Date(item.createdAt).toLocaleDateString('fr-FR')}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Utilisateurs</Text>
        <Text style={styles.count}>{loading ? '…' : total}</Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Email ou nom"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Text style={styles.clear}>✕</Text></Pressable> : null}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {country ? (
            <Pressable style={[styles.chip, styles.chipActive]} onPress={() => setCountry(undefined)}>
              <Text style={[styles.chipTxt, styles.chipTxtActive]}>Pays : {country} ✕</Text>
            </Pressable>
          ) : null}
          {SEGMENTS.map((s) => (
            <Pressable key={s} style={[styles.chip, segment === s && styles.chipActive]} onPress={() => setSegment(s)}>
              <Text style={[styles.chipTxt, segment === s && styles.chipTxtActive]}>{SEGMENT_LABEL[s]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(u) => u.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={colors.brand} />}
        ListEmptyComponent={
          loading
            ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
            : <Text style={styles.empty}>Aucun compte</Text>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 16 }} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, gap: spacing.sm },
  back: { fontSize: 22, color: colors.brand },
  title: { ...typography.h2, color: colors.text, flex: 1 },
  count: { ...typography.h3, color: colors.textMuted },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.text, paddingVertical: 10, fontSize: 14 },
  clear: { color: colors.textMuted, fontSize: 14, paddingHorizontal: 4 },
  chips: { gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  error: { color: colors.danger, marginHorizontal: spacing.md, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontWeight: '700', color: colors.text, fontSize: 14, maxWidth: '55%' },
  badge: { fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden' },
  badgeAdmin: { color: '#fff', backgroundColor: '#6C3FE8' },
  badgePlan: { color: '#1a1a1a', backgroundColor: '#D4A72C' },
  badgeWarn: { color: '#1a1a1a', backgroundColor: colors.warning },
  badgeDanger: { color: '#fff', backgroundColor: colors.danger },
  email: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  chevron: { fontSize: 22, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
