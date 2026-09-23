/**
 * Nouveau message — choisir à qui écrire.
 *
 * Ouvert par le « + » de la messagerie. Liste les personnes que je suis et
 * celles qui me suivent (dédoublonnées), filtrables par nom ; toucher une
 * personne ouvre la conversation existante avec elle, ou la crée.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { API_BASE_URL } from '../../lib/config';
import type { Plan } from '../../lib/feed-api';
import { Avatar, PlanBadgeIcon } from '../../components/Avatar';
import { useI18n } from '../../lib/useI18n';

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
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t('newmsg_title')}</Text>
        <View style={{ width: 24 }} />
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
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyText}>
            {people.length === 0 ? t('newmsg_empty') : t('newmsg_no_match')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => void openConversation(item.id)}>
              <Avatar
                uri={item.photoUrl}
                size={48}
                placeholderColor={colors.brand}
                fallback={<Text style={styles.avatarLetter}>{item.displayName[0]}</Text>}
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
                  <PlanBadgeIcon plan={item.plan} size={32} />
                </View>
                {item.bio ? <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text> : null}
              </View>
              {openingId === item.id ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.chevron}>›</Text>}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  back: { fontSize: 24, color: colors.brandSoft },
  title: { ...typography.h3, color: colors.textPrimary },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.md,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 10 },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center', marginBottom: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },
  name: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  bio: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textMuted },
});
