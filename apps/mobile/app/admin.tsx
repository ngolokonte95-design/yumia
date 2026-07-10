import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';

const API = API_BASE_URL;

interface Overview {
  users: { total: number; newToday: number; newThisWeek: number; newThisMonth: number; premium: number; active7d: number };
  content: { places: number; visits: number; posts: number; meetups: number };
}

interface CountryRow { countryCode: string; count: number; pct: number }
interface GrowthRow { date: string; count: number }
interface UniverseRow { universe: string; count: number }
interface RecentUser { id: string; email: string; displayName: string; countryCode?: string; plan: string; isPremium: boolean; createdAt: string }

const FLAG: Record<string, string> = {
  FR: '🇫🇷', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹',
  CA: '🇨🇦', AU: '🇦🇺', JP: '🇯🇵', BR: '🇧🇷', MX: '🇲🇽', MA: '🇲🇦',
  DZ: '🇩🇿', TN: '🇹🇳', SN: '🇸🇳', CM: '🇨🇲', CI: '🇨🇮', NG: '🇳🇬',
  ZA: '🇿🇦', BE: '🇧🇪', CH: '🇨🇭', PT: '🇵🇹', NL: '🇳🇱', PL: '🇵🇱',
  RU: '🇷🇺', CN: '🇨🇳', IN: '🇮🇳', XX: '🌍',
};

function flagOf(code: string) { return FLAG[code] ?? '🌍'; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={[styles.statVal, accent && styles.statValAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function AdminScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [byCountry, setByCountry] = useState<CountryRow[]>([]);
  const [growth, setGrowth] = useState<GrowthRow[]>([]);
  const [byUniverse, setByUniverse] = useState<UniverseRow[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const h = { Authorization: `Bearer ${accessToken}` };
    setLoading(true);
    setError(null);
    try {
      const [ovRes, ctrRes, gwRes, univRes, recentRes] = await Promise.allSettled([
        fetch(`${API}/admin/stats`, { headers: h }),
        fetch(`${API}/admin/users/by-country`, { headers: h }),
        fetch(`${API}/admin/users/growth?days=30`, { headers: h }),
        fetch(`${API}/admin/places/by-universe`, { headers: h }),
        fetch(`${API}/admin/users/recent?limit=15`, { headers: h }),
      ]);
      if (ovRes.status === 'fulfilled') {
        if (ovRes.value.ok) setOverview(await ovRes.value.json());
        else setError(`Stats: ${ovRes.value.status}`);
      }
      if (ctrRes.status === 'fulfilled' && ctrRes.value.ok) setByCountry(await ctrRes.value.json());
      if (gwRes.status === 'fulfilled' && gwRes.value.ok) setGrowth(await gwRes.value.json());
      if (univRes.status === 'fulfilled' && univRes.value.ok) setByUniverse(await univRes.value.json());
      if (recentRes.status === 'fulfilled' && recentRes.value.ok) setRecentUsers(await recentRes.value.json());
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const maxGrowth = growth.length > 0 ? Math.max(...growth.map((g) => g.count), 1) : 1;
  const maxCountry = byCountry.length > 0 ? Math.max(...byCountry.map((c) => c.count), 1) : 1;

  if (loading) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brand} size="large" /></View>;
  }

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <Text style={styles.title}>Dashboard Admin</Text>
        <Pressable onPress={load} style={styles.refreshBtn}><Text style={styles.refreshTxt}>↻</Text></Pressable>
      </View>

      {/* ── Erreur de chargement ── */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* ── Overview ── */}
      {overview?.users && (
        <>
          <Text style={styles.sectionTitle}>Vue d'ensemble</Text>
          <View style={styles.statsGrid}>
            <StatCard label="Utilisateurs" value={overview.users.total} accent />
            <StatCard label="Premium" value={overview.users.premium} sub={`${Math.round((overview.users.premium / Math.max(overview.users.total, 1)) * 100)}%`} />
            <StatCard label="Actifs 7j" value={overview.users.active7d} />
            <StatCard label="Nouveaux auj." value={overview.users.newToday} />
            <StatCard label="Nouveaux 7j" value={overview.users.newThisWeek} />
            <StatCard label="Nouveaux 30j" value={overview.users.newThisMonth} />
          </View>
          <View style={styles.statsGrid}>
            <StatCard label="Lieux" value={overview.content.places} />
            <StatCard label="Visites" value={overview.content.visits} />
          </View>
        </>
      )}

      {/* ── Utilisateurs par pays ── */}
      {byCountry.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Utilisateurs par pays</Text>
          <View style={styles.card}>
            {byCountry.slice(0, 20).map((row) => (
              <View key={row.countryCode} style={styles.countryRow}>
                <Text style={styles.countryFlag}>{flagOf(row.countryCode)}</Text>
                <Text style={styles.countryCode}>{row.countryCode}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(row.count / maxCountry) * 100}%` }]} />
                </View>
                <Text style={styles.countryCount}>{row.count}</Text>
                <Text style={styles.countryPct}>{row.pct}%</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Croissance inscriptions (30j) ── */}
      {growth.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Inscriptions (30 derniers jours)</Text>
          <View style={[styles.card, styles.growthChart]}>
            {growth.map((g) => (
              <View key={g.date} style={styles.growthBar}>
                <View style={[styles.growthFill, { height: `${(g.count / maxGrowth) * 100}%` }]} />
                <Text style={styles.growthLabel}>{g.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Lieux par univers ── */}
      {byUniverse.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Lieux par univers</Text>
          <View style={styles.card}>
            {byUniverse.map((row) => (
              <View key={row.universe} style={styles.univRow}>
                <Text style={styles.univName}>{row.universe}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFillGreen, { width: `${(row.count / Math.max(...byUniverse.map((u) => u.count), 1)) * 100}%` }]} />
                </View>
                <Text style={styles.univCount}>{row.count}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Inscriptions récentes ── */}
      {recentUsers.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Dernières inscriptions</Text>
          <View style={styles.card}>
            {recentUsers.map((u) => (
              <View key={u.id} style={styles.userRow}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{u.displayName[0]?.toUpperCase()}</Text>
                </View>
                <View style={styles.userInfo}>
                  <View style={styles.userNameRow}>
                    <Text style={styles.userName}>{u.displayName}</Text>
                    {u.isPremium && <Text style={styles.premiumBadge}>⭐ Plus</Text>}
                    {u.countryCode && <Text style={styles.userFlag}>{flagOf(u.countryCode)}</Text>}
                  </View>
                  <Text style={styles.userEmail}>{u.email}</Text>
                </View>
                <Text style={styles.userDate}>{fmtDate(u.createdAt)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={{ height: insets.bottom + 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12 },
  back: { fontSize: 22, color: colors.brand, marginRight: spacing.sm },
  title: { ...typography.h2, color: colors.text, flex: 1 },
  refreshBtn: { padding: 8 },
  refreshTxt: { fontSize: 22, color: colors.brand },
  sectionTitle: { ...typography.h3, color: colors.text, marginHorizontal: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.md, gap: 10, marginBottom: 4 },
  statCard: {
    flex: 1, minWidth: '28%', backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  statCardAccent: { backgroundColor: colors.brand + '15', borderColor: colors.brand + '40' },
  statVal: { ...typography.h2, color: colors.text, marginBottom: 2 },
  statValAccent: { color: colors.brand },
  statLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  statSub: { fontSize: 11, color: colors.brand, fontWeight: '700', marginTop: 2 },
  card: { marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  countryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  countryFlag: { fontSize: 18, width: 26 },
  countryCode: { fontSize: 13, color: colors.textMuted, width: 30, fontWeight: '600' },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 4 },
  barFillGreen: { height: '100%', backgroundColor: '#4ade80', borderRadius: 4 },
  countryCount: { fontSize: 13, color: colors.text, fontWeight: '700', width: 42, textAlign: 'right' },
  countryPct: { fontSize: 12, color: colors.textMuted, width: 40, textAlign: 'right' },
  growthChart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2, paddingBottom: 20 },
  growthBar: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  growthFill: { width: '80%', backgroundColor: colors.brand, borderRadius: 2, minHeight: 2 },
  growthLabel: { fontSize: 8, color: colors.textMuted, marginTop: 2, transform: [{ rotate: '-45deg' }] },
  univRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  univName: { fontSize: 12, color: colors.textMuted, width: 120 },
  univCount: { fontSize: 12, color: colors.text, fontWeight: '700', width: 40, textAlign: 'right' },
  errorBox: { marginHorizontal: spacing.md, marginTop: spacing.md, backgroundColor: colors.danger + '22', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.danger + '55' },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  userAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { fontWeight: '700', color: colors.text, fontSize: 14 },
  premiumBadge: { fontSize: 11, color: '#f59e0b', fontWeight: '700' },
  userFlag: { fontSize: 14 },
  userEmail: { fontSize: 12, color: colors.textMuted },
  userDate: { fontSize: 11, color: colors.textMuted },
});
