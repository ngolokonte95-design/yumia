/**
 * ErrorBoundary — capture les erreurs React non gérées en production.
 * Affiche un écran de repli propre plutôt qu'un écran blanc.
 * Doit être un class component (API React).
 */
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { captureException } from '../lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
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

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>😞</Text>
        <Text style={styles.title}>Quelque chose s'est mal passé</Text>
        <Text style={styles.body}>
          YUMIA a rencontré une erreur inattendue. Appuie sur le bouton ci-dessous pour relancer.
        </Text>
        <Pressable style={styles.btn} onPress={this.handleReset}>
          <Text style={styles.btnText}>Réessayer</Text>
        </Pressable>
      </View>
    );
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
