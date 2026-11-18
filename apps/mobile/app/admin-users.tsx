/**
 * Centre de contrôle — liste des comptes.
 *
 * Ouvert depuis une carte de la vue d'ensemble (`segment`) ou un pays
 * (`country`). Recherche par email ou nom. Textes en français sans i18n, comme
 * le reste de l'administration : une seule personne voit cet écran.
 *
 * Refonte visuelle du 18/11/2026 (sobre : lignes de verre, pastilles d'état
 * discrètes) ; logique d'origine à l'identique.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import {
  accountStatus, adminUsersApi, PLAN_LABEL, SEGMENT_LABEL, type AdminUserRow, type UserSegment,
} from '../lib/admin-users';
import { colors, radius, spacing } from '../theme/tokens';
import { PressableScale } from '../components/ui';
import { CHEVRON, GLASS } from '../components/profile/ProfileChrome';
import { SearchPill } from '../components/p2a/P2Chrome';
import { QuietChip, QuietEmpty, QuietHeader } from '../components/pb2/Pb2Chrome';
import { ADMIN_SPINNER, ErrorBanner, InitialAvatar, StatusBadge } from '../components/admin/AdminChrome';

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
      <PressableScale
        style={[styles.row, GLASS]}
        onPress={() => router.push(`/admin-user?id=${item.id}` as never)}
        scaleTo={0.98}
      >
        <InitialAvatar name={item.displayName} />
        <View style={styles.rowText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
            {item.isAdmin ? <StatusBadge label="ADMIN" tone="plan" /> : null}
            {item.plan !== 'free' ? <StatusBadge label={PLAN_LABEL[item.plan] ?? item.plan} tone="plan" /> : null}
            {status === 'suspended' ? <StatusBadge label="Suspendu" tone="warn" /> : null}
            {status === 'banned' ? <StatusBadge label="Banni" tone="danger" /> : null}
          </View>
          <Text style={styles.email} numberOfLines={1} selectable>{item.email}</Text>
          <Text style={styles.meta}>
            {item.countryCode ?? '—'} · inscrit le {new Date(item.createdAt).toLocaleDateString('fr-FR')}
          </Text>
        </View>
        <Text style={styles.chevron}>{CHEVRON}</Text>
      </PressableScale>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <QuietHeader
        title="Utilisateurs"
        onBack={() => router.back()}
        right={<Text style={styles.count}>{loading ? '…' : total}</Text>}
      />

      <SearchPill
        style={styles.search}
        placeholder="Email ou nom"
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {country ? (
            <QuietChip label={`Pays : ${country} ✕`} active onPress={() => setCountry(undefined)} />
          ) : null}
          {SEGMENTS.map((s) => (
            <QuietChip key={s} label={SEGMENT_LABEL[s]} active={segment === s} onPress={() => setSegment(s)} />
          ))}
        </ScrollView>
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      <FlatList
        data={items}
        keyExtractor={(u) => u.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: insets.bottom + 40 }}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={ADMIN_SPINNER} colors={[colors.brand]} />}
        ListEmptyComponent={
          loading
            ? <ActivityIndicator color={ADMIN_SPINNER} style={{ marginTop: 40 }} />
            : <QuietEmpty emoji="👥" title="Aucun compte" />
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={ADMIN_SPINNER} style={{ marginVertical: 16 }} /> : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  count: { color: colors.textSecondary, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  search: { marginHorizontal: spacing.md },
  chips: { gap: 8, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 12, marginBottom: spacing.sm,
  },
  rowText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', maxWidth: '55%' },
  email: { color: colors.textSecondary, fontSize: 12.5, marginTop: 2 },
  meta: { color: colors.textMuted, fontSize: 11.5, marginTop: 1 },
  chevron: { color: colors.textMuted, fontSize: 22, fontWeight: '300' },
});
