/**
 * Texte écrit par un autre membre (bio, légende, commentaire) avec, s'il est
 * dans une autre langue que celle de l'utilisateur, un lien « Voir la
 * traduction » — comme sur Instagram. La traduction n'est demandée qu'au
 * toucher, puis gardée en mémoire le temps de la session.
 */
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/useI18n';
import { translateMessage } from '../lib/chat-translate-api';
import { ensureAiConsent } from '../lib/ai-consent';
import { shouldOfferTranslation } from '../lib/detect-language';
import { colors } from '../theme/tokens';

const memo = new Map<string, string>();

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Rendu personnalisé (ex. nom de l'auteur en gras devant la légende). */
  render?: (shown: string) => ReactNode;
  /** Sur fond sombre (reels, visionneuse) : lien clair. */
  tone?: 'default' | 'light';
}

export function TranslatableText({ text, style, numberOfLines, render, tone = 'default' }: Props) {
  const { accessToken } = useAuth();
  const { t, locale } = useI18n();
  const key = `${locale}\u0000${text}`;
  const [translated, setTranslated] = useState<string | null>(memo.get(key) ?? null);
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);

  const offer = shouldOfferTranslation(text, locale);
  const shown = showing && translated ? translated : text;

  const toggle = async () => {
    if (showing) { setShowing(false); return; }
    if (translated) { setShowing(true); return; }
    if (!accessToken || loading) return;
    // La traduction est faite par Claude (Anthropic) : accord demandé au
    // premier « Voir la traduction ». Refus → rien n'est envoyé.
    if (!(await ensureAiConsent())) return;
    setLoading(true);
    try {
      const res = await translateMessage(accessToken, text, locale);
      memo.set(key, res.translated);
      setTranslated(res.translated);
      setShowing(true);
    } catch {
      // Échec silencieux : le lien reste, l'utilisateur peut réessayer.
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      {render ? render(shown) : <Text style={style} numberOfLines={numberOfLines}>{shown}</Text>}
      {offer && (
        <Pressable onPress={() => void toggle()} hitSlop={6} style={styles.link}>
          {loading ? (
            <ActivityIndicator size="small" color={tone === 'light' ? '#fff' : colors.textMuted} />
          ) : (
            <Text style={[styles.linkTxt, tone === 'light' && styles.linkTxtLight]}>
              {showing ? t('tr_see_original') : t('tr_see_translation')}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', marginTop: 2 },
  linkTxt: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  linkTxtLight: { color: 'rgba(255,255,255,0.8)' },
});
