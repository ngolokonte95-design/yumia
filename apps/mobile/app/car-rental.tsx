/**
 * LOCATION DE VOITURE — choisir sa ville, puis comparer les loueurs chez notre
 * partenaire Discover Cars (compte affilié « yumia »).
 *
 * Discover Cars n'a pas d'API de recherche pour ses affiliés : pas d'offres
 * listées dans l'app, mais la page de la ville ouverte directement, avec notre
 * identifiant. Le serveur vérifie que cette page existe (GET /affiliates/car-rental)
 * et retombe sinon sur leur accueil.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchCarRentalLink, fetchTourCities } from '../lib/affiliates-api';
import { useI18n } from '../lib/useI18n';
import { openExternalHttps } from '../lib/external-link';

export default function CarRentalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accessToken } = useAuth();
  const { t, locale } = useI18n();
  const { city: locCity } = useLocation();

  const [query, setQuery] = useState(locCity ?? '');
  const [typing, setTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; label: string }[]>([]);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);

  // Même autocomplétion que les Visites guidées : les villes du référentiel
  // Viator, dont on tire aussi les noms anglais qui forment l'adresse Discover Cars.
  useEffect(() => {
    const q = query.trim();
    if (!typing || !accessToken || q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      fetchTourCities(q, accessToken)
        .then((c) => { if (!cancelled) setSuggestions(c); })
        .catch(() => { if (!cancelled) setSuggestions([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query, typing, accessToken]);

  const open = async (city: string) => {
    const c = city.trim();
    if (!c || !accessToken || opening) return;
    setTyping(false);
    setSuggestions([]);
    setOpening(true);
    setError(false);
    try {
      const { url } = await fetchCarRentalLink(c, locale, accessToken);
      if (!(await openExternalHttps(url))) setError(true);
    } catch {
      setError(true);
    } finally {
      setOpening(false);
    }
  };

  const city = query.trim();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('cr_title')}</Text>
          <Text style={styles.subtitle}>{t('cr_subtitle')}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <TextInput
          style={styles.input}
          placeholder={t('gd_city_placeholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={(v) => { setQuery(v); setTyping(true); }}
          returnKeyType="search"
          onSubmitEditing={() => void open(query)}
          autoCorrect={false}
        />

        {suggestions.length > 0 && (
          <View style={styles.suggestBox}>
            {suggestions.map((c, i) => (
              <Pressable
                key={c.label}
                style={[styles.suggestRow, i > 0 && styles.suggestDivider]}
                onPress={() => { setQuery(c.name); void open(c.name); }}
              >
                <Text style={styles.suggestIcon}>📍</Text>
                <Text style={styles.suggestText} numberOfLines={1}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable
          style={[styles.cta, (!city || opening) && styles.ctaDisabled]}
          disabled={!city || opening}
          onPress={() => void open(query)}
        >
          {opening ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>
              {city ? t('cr_button').replace('{city}', city) : t('cr_button_empty')} ↗
            </Text>
          )}
        </Pressable>

        {error && <Text style={styles.error}>{t('cr_error')}</Text>}

        <Text style={styles.disclosure}>{t('gd_partner_note')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  backBtn: { paddingTop: 2 },
  backText: { ...typography.heading, color: colors.brandSoft, fontSize: 24 },
  title: { ...typography.heading, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  body: { paddingHorizontal: spacing.md, gap: spacing.md },
  input: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 48, ...typography.body, color: colors.textPrimary,
  },
  suggestBox: {
    marginTop: -spacing.xs, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 12 },
  suggestDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  suggestIcon: { fontSize: 14 },
  suggestText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  cta: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center' },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { ...typography.body, color: '#fff', fontWeight: '800' },
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
  disclosure: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
