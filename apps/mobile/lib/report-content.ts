/**
 * Signalement d'un CONTENU (publication, reel, story, commentaire, message,
 * sortie, avis) ou d'un compte.
 *
 * Exigé par la règle 1.2 de l'App Store et la politique de contenu de Google
 * Play : une application qui héberge du contenu d'utilisateurs doit permettre
 * de signaler ce contenu, et pas seulement son auteur.
 *
 * Choix du motif : `Alert.alert` ne convient pas — Android n'affiche que TROIS
 * boutons, si bien que cinq motifs + Annuler devenaient deux motifs et un
 * bouton. On passe donc par :
 *   - iOS : `ActionSheetIOS`, feuille native sans limite de boutons ;
 *   - Android : une feuille modale (`ReportReasonSheet`, montée une fois à la
 *     racine de l'app) qui s'abonne ici via `subscribeReportPicker`.
 * Si la feuille n'est pas montée (écran isolé, tests), on retombe sur
 * `Alert.alert` : tronqué sur Android, mais jamais silencieux.
 */
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { API_BASE_URL } from './config';
import type { TranslationKey } from './translations';

export type ReportTarget = 'post' | 'comment' | 'story' | 'message' | 'user' | 'meetup' | 'review';

type Translate = (key: TranslationKey) => string;

/** Motifs proposés — les mêmes pour un contenu et pour un compte. */
export const REPORT_REASON_KEYS: readonly TranslationKey[] = [
  'up_report_spam',
  'up_report_inappropriate',
  'up_report_harassment',
  'up_report_false_info',
  'up_report_other',
];

/** Ce que la feuille Android doit afficher, textes déjà traduits. */
export interface ReportPickerRequest {
  title: string;
  message: string;
  reasons: string[];
  cancelLabel: string;
  /** Appelé avec l'index du motif choisi. Rien n'est appelé en cas d'annulation. */
  onPick: (index: number) => void;
}

type PickerListener = (req: ReportPickerRequest) => void;
let pickerListener: PickerListener | null = null;

/**
 * Branche la feuille de motifs (un seul abonné : la dernière feuille montée).
 * Renvoie la fonction de désabonnement.
 */
export function subscribeReportPicker(listener: PickerListener): () => void {
  pickerListener = listener;
  return () => {
    if (pickerListener === listener) pickerListener = null;
  };
}

/** Affiche la liste des motifs selon la plateforme. */
function showPicker(req: ReportPickerRequest): void {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: req.title,
        message: req.message,
        options: [...req.reasons, req.cancelLabel],
        cancelButtonIndex: req.reasons.length,
      },
      (index) => {
        if (index >= 0 && index < req.reasons.length) req.onPick(index);
      },
    );
    return;
  }
  if (pickerListener) {
    pickerListener(req);
    return;
  }
  Alert.alert(req.title, req.message, [
    ...req.reasons.map((text, i) => ({ text, onPress: () => req.onPick(i) })),
    { text: req.cancelLabel, style: 'cancel' as const },
  ]);
}

/**
 * Ouvre la liste des motifs, puis envoie le signalement.
 */
export function promptReport(params: {
  accessToken: string | null;
  targetType: ReportTarget;
  targetId: string;
  t: Translate;
  /** Titre de la fenêtre — laisse dire de QUOI il s'agit (publication, story…). */
  titleKey?: TranslationKey;
  /** Question sous le titre (par défaut : « Pourquoi signalez-vous ce contenu ? »). */
  whyKey?: TranslationKey;
  /**
   * Contexte joint au signalement. Sert aux messages chiffrés de bout en bout :
   * le serveur n'en a que le texte chiffré, la personne qui signale transmet
   * donc ce qu'elle a lu, sinon la modération n'aurait rien à juger.
   */
  details?: string;
}): void {
  const { accessToken, targetType, targetId, t } = params;
  if (!accessToken || !targetId) return;

  const reasons = REPORT_REASON_KEYS.map((key) => t(key));

  showPicker({
    title: t(params.titleKey ?? 'report_content_title'),
    message: t(params.whyKey ?? 'report_content_why'),
    reasons,
    cancelLabel: t('up_cancel'),
    onPick: (index) => {
      // Envoi sans attendre la réponse : l'accusé de réception est immédiat,
      // car un signalement refait par doute serait pire qu'un échec silencieux.
      void fetch(`${API_BASE_URL}/social/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          targetType,
          targetId,
          reason: reasons[index],
          ...(params.details ? { details: params.details.slice(0, 2000) } : {}),
        }),
      }).catch(() => undefined);
      Alert.alert(t('up_report_thanks_title'), t('up_report_thanks_body'));
    },
  });
}
