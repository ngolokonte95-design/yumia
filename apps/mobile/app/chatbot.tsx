import { useCallback, useRef, useState } from 'react';
/**
 * ASSISTANT YUMIA — conversation avec l'IA.
 *
 * Mise en scène (17/11/2026) : fond sombre uni, orbe IA animé dans l'en-tête
 * (anneaux au dégradé de marque, arrêtés hors focus), bulles de l'utilisateur
 * au dégradé, réponses en verre sombre, indicateur « réfléchit… » animé,
 * suggestions en pastilles vitrées. Seul l'affichage a changé : envoi,
 * consentement IA, quota et historique sont ceux d'avant.
 */
import {
  FlatList, I18nManager, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth-context';
import { colors, gradients, radius, spacing } from '../theme/tokens';
import { API_BASE_URL } from '../lib/config';
import { useI18n } from '../lib/useI18n';
import { usePlanLimits } from '../lib/usePlanLimits';
import { useLocation } from '../lib/useLocation';
import { PremiumUpsellModal } from '../components/PremiumUpsellModal';
import { FeatureTip } from '../components/FeatureTip';
import { ensureAiConsent, openAiConsentSettings } from '../lib/ai-consent';
import { PressableScale, Reveal } from '../components/ui';
import { GlassCircle } from '../components/chat/ChatChrome';
import { AiOrb, BOT_BG, Bubble, TypingBubble, chatbotGlass } from '../components/chatbot/ChatbotVisuals';

const API = API_BASE_URL;

interface Msg { role: 'user' | 'assistant'; content: string }

export default function ChatbotScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const SUGGESTIONS = [
    t('chatbot_suggestion_1'),
    t('chatbot_suggestion_2'),
    t('chatbot_suggestion_3'),
    t('chatbot_suggestion_4'),
  ];
  const [messages, setMessages] = useState<Msg[]>([{
    role: 'assistant',
    content: t('chatbot_welcome'),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [upsell, setUpsell] = useState<string | null>(null);
  const { checkLimit, recordUsage, quotaMessage } = usePlanLimits();
  const { city } = useLocation();
  const listRef = useRef<FlatList>(null);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    // Consentement Anthropic (Apple 5.1.2(i)) AVANT le quota : un refus ne
    // doit pas coûter un message du jour.
    if (!(await ensureAiConsent())) {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('ai_consent_feature_off') }]);
      return;
    }

    // Quota compté À L'ENVOI : chaque message envoyé appelle une réponse, donc
    // compter les deux reviendrait à diviser le quota par deux sans le dire.
    const { allowed } = await checkLimit('chatbotPerDay');
    if (!allowed) { setUpsell(quotaMessage('chatbotPerDay', t('home_shortcut_chatbot'))); return; }
    await recordUsage('chatbotPerDay');

    const userMsg: Msg = { role: 'user', content: text };
    const history = messages.slice(-10);
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const res = await fetch(`${API}/chatbot/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        // La ville part avec la question : sans elle, l'assistant ouvrait par
        // « dans quelle ville es-tu ? » alors que l'app le sait déjà.
        body: JSON.stringify({ message: text, history, city }),
      });
      if (res.ok) {
        const data = await res.json() as { reply: string };
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('chatbot_error') }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, loading, accessToken, checkLimit, recordUsage, quotaMessage, t]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <PremiumUpsellModal visible={upsell !== null} message={upsell ?? ''} onClose={() => setUpsell(null)} />
      {/* En-tête : orbe IA animé, titre, accord IA. */}
      <View style={styles.header}>
        <GlassCircle onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{I18nManager.isRTL ? '→' : '←'}</Text>
        </GlassCircle>
        <View style={styles.headerCenter}>
          <AiOrb size={36} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>YUMIA Assistant</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{t('chatbot_header_sub')}</Text>
          </View>
        </View>
        {/* Réglage « Fonctions IA (Anthropic) » : retirer ou redonner l'accord. */}
        <Pressable
          onPress={openAiConsentSettings}
          style={styles.aiBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('ai_consent_toggle_label')}
        >
          <Text style={styles.aiBtnText}>🔒 {t('ai_consent_badge')}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={styles.messageList}
          renderItem={({ item, index }) => (
            <Bubble
              role={item.role}
              content={item.content}
              // Seul le dernier message, arrivé pendant la conversation, glisse.
              animate={index > 0 && index === messages.length - 1}
            />
          )}
          ListFooterComponent={loading ? <TypingBubble /> : undefined}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Suggestions de départ, en pastilles vitrées. */}
        {messages.length === 1 && (
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s, i) => (
              <Reveal key={s} index={i} from="fade">
                <PressableScale style={styles.suggestionChip} onPress={() => send(s)} scaleTo={0.95}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </PressableScale>
              </Reveal>
            ))}
          </View>
        )}

        {/* Saisie */}
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={t('chatbot_input_placeholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(input)}
          />
          <PressableScale
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={() => send(input)}
            scaleTo={0.9}
          >
            {input.trim() ? (
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            ) : null}
            <Text style={styles.sendIcon}>↑</Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
      <FeatureTip feature="chatbot" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BOT_BG },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  backBtnText: { fontSize: 18, color: '#fff', fontWeight: '800' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  headerText: { flexShrink: 1 },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  headerSub: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  aiBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full,
    backgroundColor: chatbotGlass.backgroundColor,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  aiBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  messageList: { padding: spacing.md, paddingBottom: 16 },
  suggestions: { paddingHorizontal: spacing.md, paddingBottom: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: {
    borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: chatbotGlass.backgroundColor,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(240,138,75,0.45)',
  },
  suggestionText: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: spacing.md, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)',
    backgroundColor: BOT_BG,
  },
  input: {
    flex: 1, backgroundColor: chatbotGlass.backgroundColor, borderRadius: 22,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    color: colors.textPrimary, fontSize: 15, maxHeight: 110,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
});
