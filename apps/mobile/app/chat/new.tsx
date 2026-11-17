/**
 * Nouveau message — choisir à qui écrire.
 *
 * Ouvert par le « + » de la messagerie. Liste les personnes que je suis et
 * celles qui me suivent (dédoublonnées), filtrables par nom ; toucher une
 * personne ouvre la conversation existante avec elle, ou la crée.
 *
 * Mise en scène (17/11/2026) : même habillage que la messagerie — fond
 * profond uni, grand titre, recherche en verre, lignes en cascade.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, elevation, radius, spacing } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import type { Plan } from '../../lib/feed-api';
import { Avatar, PlanBadgeIcon } from '../../components/Avatar';
import { useI18n } from '../../lib/useI18n';
import { PressableScale, Reveal } from '../../components/ui';
import {
  BrandFill, CHAT_BG, CHAT_GLASS, CHAT_HAIRLINE, GlassCircle, GradientRing, ringInner,
} from '../../components/chat/ChatChrome';

const API = API_BASE_URL;

interface SimpleUser {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  bio?: string | null;
  plan?: Plan | null;
}

/** Minuscules et sans accents : « eloise » doit trouver « Éloïse ». */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function NewMessageScreen() {
  const { accessToken, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const [people, setPeople] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!accessToken || !user) return;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const get = (path: string) =>
      fetch(`${API}/social/users/${user.id}/${path}`, { headers })
        .then((r) => (r.ok ? (r.json() as Promise<SimpleUser[]>) : []))
        .catch(() => [] as SimpleUser[]);
    // Abonnements d'abord : ce sont ceux à qui on écrit le plus souvent.
    Promise.all([get('following'), get('followers')])
      .then(([following, followers]) => {
        const seen = new Set<string>();
        setPeople(
          [...following, ...followers].filter((p) => {
            if (p.id === user.id || seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          }),
        );
      })
      .finally(() => setLoading(false));
  }, [accessToken, user]);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? people.filter((p) => fold(p.displayName).includes(q)) : people;
  }, [people, query]);

  const openConversation = async (userId: string) => {
    if (!accessToken || openingId) return;
    setOpeningId(userId);
    setError(false);
    try {
      const res = await fetch(`${API}/chat/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      // `replace` : revenir en arrière depuis la conversation ramène à la
      // messagerie, pas à ce sélecteur.
      router.replace(`/chat/${id}` as never);
    } catch {
      setError(true);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GlassCircle onPress={() => router.back()}>
          <Text style={styles.headerIcon}>←</Text>
        </GlassCircle>
        <Text style={styles.title} numberOfLines={1}>{t('newmsg_title')}</Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={t('newmsg_search')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {error && <Text style={styles.error}>{t('newmsg_error')}</Text>}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : shown.length === 0 ? (
        <Reveal style={styles.center}>
          <View style={styles.emptyMedal}>
            <BrandFill />
            <Text style={styles.emptyEmoji}>💬</Text>
          </View>
          <Text style={styles.emptyText}>
            {people.length === 0 ? t('newmsg_empty') : t('newmsg_no_match')}
          </Text>
        </Reveal>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item, index }) => {
            const row = (
              <PressableScale style={styles.row} onPress={() => void openConversation(item.id)} scaleTo={0.98}>
                <GradientRing size={RING} active={false}>
                  <Avatar
                    uri={item.photoUrl}
                    size={ringInner(RING)}
                    placeholderColor={colors.surfaceElevated}
                    fallback={<Text style={styles.avatarLetter}>{item.displayName[0]}</Text>}
                  />
                </GradientRing>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
                    <PlanBadgeIcon plan={item.plan} size={18} />
                  </View>
                  {item.bio ? <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text> : null}
                </View>
                {openingId === item.id ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <View style={styles.chevronBox}><Text style={styles.chevron}>›</Text></View>
                )}
              </PressableScale>
            );
            return index < 10 ? <Reveal index={index} from="fade">{row}</Reveal> : row;
          }}
        />
      )}
    </View>
  );
}

const RING = 54;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHAT_BG },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  headerIcon: { fontSize: 20, color: '#fff', fontWeight: '700' },
  title: { flex: 1, color: colors.textPrimary, fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.md, marginBottom: spacing.sm,
    backgroundColor: CHAT_GLASS, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)', paddingHorizontal: spacing.md,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 12 },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: spacing.xl },
  emptyMedal: {
    width: 76, height: 76, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    ...elevation.glowBrand,
  },
  emptyEmoji: { fontSize: 36 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.sm, paddingVertical: 10, borderRadius: radius.lg,
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },
  name: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
  bio: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  chevronBox: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CHAT_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: CHAT_HAIRLINE,
  },
  chevron: { fontSize: 20, color: colors.brandSoft, marginTop: -2 },
});
