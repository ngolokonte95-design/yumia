/**
 * ErrorBoundary — capture les erreurs React non gérées en production.
 * Affiche un écran de repli propre plutôt qu'un écran blanc.
 * Doit être un class component (API React).
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { captureException } from '../lib/sentry';
import { useAuthSafe } from '../lib/auth-context';
import { TRANSLATIONS, type TranslationKey } from '../lib/translations';
import { DEFAULT_LOCALE } from '@yumia/shared';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Écran de repli, en composant fonctionnel séparé pour pouvoir lire la
 * locale — via `useAuthSafe` (jamais de throw, même si AuthProvider a
 * lui-même planté avant ErrorBoundary, qui l'englobe) plutôt que le hook
 * `useI18n` habituel qui planterait dans ce cas précis.
 */
function ErrorFallback({ onReset }: { onReset: () => void }) {
  const auth = useAuthSafe();
  const locale = (auth?.user?.locale ?? DEFAULT_LOCALE) as string;
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS['fr'];
  const t = (key: TranslationKey) => dict[key] ?? key;

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>😞</Text>
      <Text style={styles.title}>{t('eb_title')}</Text>
      <Text style={styles.body}>{t('eb_body')}</Text>
      <Pressable style={styles.btn} onPress={onReset}>
        <Text style={styles.btnText}>{t('eb_retry')}</Text>
      </Pressable>
    </View>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    captureException(error, { componentStack: info.componentStack ?? undefined });
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return <ErrorFallback onReset={this.handleReset} />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emoji: { fontSize: 56 },
  title: { ...typography.title, color: colors.textPrimary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  btn: {
    marginTop: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: 24,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  btnText: { ...typography.heading, color: '#fff' },
});
