/**
 * LOCATION DE VOITURE — choisir sa ville, puis comparer les loueurs chez notre
 * partenaire Discover Cars (compte affilié « yumia »).
 *
 * Discover Cars n'a pas d'API de recherche pour ses affiliés : pas d'offres
 * listées dans l'app, mais la page de la ville ouverte directement, avec notre
 * identifiant. Le serveur vérifie que cette page existe (GET /affiliates/car-rental)
 * et retombe sinon sur leur accueil.
 *
 * Habillage du 18/11/2026 : sobre — champ en pilule de verre, suggestions en
 * groupe vitré, un seul bouton au dégradé de marque.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '../theme/tokens';
import { useAuth } from '../lib/auth-context';
import { useLocation } from '../lib/useLocation';
import { fetchCarRentalLink, fetchTourCities } from '../lib/affiliates-api';
import { useI18n } from '../lib/useI18n';
import { openExternalHttps } from '../lib/external-link';
import { PressableScale, Reveal } from '../components/ui';
import { BrandButton } from '../components/social/SocialChrome';
import { GlassGroup } from '../components/profile/ProfileChrome';
import { SearchPill } from '../components/p2a/P2Chrome';
import { PbHeader } from '../components/pb1/PbChrome';

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
      <PbHeader
        title={t('cr_title')}
        subtitle={t('cr_subtitle')}
        onBack={() => router.back()}
        style={styles.header}
      />

      <View style={styles.body}>
        <Reveal index={0}>
          <SearchPill
            placeholder={t('gd_city_placeholder')}
            value={query}
            onChangeText={(v) => { setQuery(v); setTyping(true); }}
            returnKeyType="search"
            onSubmitEditing={() => void open(query)}
            autoCorrect={false}
          />
        </Reveal>

        {suggestions.length > 0 && (
          <GlassGroup style={styles.suggestBox}>
            {suggestions.map((c) => (
              <PressableScale
                key={c.label}
                style={styles.suggestRow}
                scaleTo={0.98}
                onPress={() => { setQuery(c.name); void open(c.name); }}
              >
                <Text style={styles.suggestIcon}>📍</Text>
                <Text style={styles.suggestText} numberOfLines={1}>{c.label}</Text>
              </PressableScale>
            ))}
          </GlassGroup>
        )}

        <Reveal index={1}>
          <BrandButton
            label={`${city ? t('cr_button').replace('{city}', city) : t('cr_button_empty')} ↗`}
            onPress={() => void open(query)}
            disabled={!city}
            loading={opening}
          />
        </Reveal>

        {error && <Text style={styles.error}>{t('cr_error')}</Text>}

        <Text style={styles.disclosure}>{t('gd_partner_note')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: spacing.sm },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  suggestBox: { marginTop: -spacing.xs },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 14 },
  suggestIcon: { fontSize: 14 },
  suggestText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  error: { ...typography.caption, color: colors.danger, textAlign: 'center' },
  disclosure: { ...typography.caption, color: colors.textMuted, textAlign: 'center', lineHeight: 18, marginTop: spacing.xs },
});
