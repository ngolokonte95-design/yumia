/**
 * Signalement d'un CONTENU (publication, reel, story, commentaire, message).
 *
 * Exigé par la règle 1.2 de l'App Store et la politique de contenu de Google
 * Play : une application qui héberge du contenu d'utilisateurs doit permettre
 * de signaler ce contenu, et pas seulement son auteur. Notre signalement
 * n'existait que sur la fiche d'un membre, ce qui laissait les publications
 * sans recours — le motif de refus le plus courant pour une app sociale.
 *
 * La route serveur accepte déjà ces types de cible : le manque était
 * entièrement côté écran.
 */
import { Alert } from 'react-native';
import { API_BASE_URL } from './config';
import type { TranslationKey } from './translations';

export type ReportTarget = 'post' | 'comment' | 'story' | 'message' | 'user';

type Translate = (key: TranslationKey) => string;

/**
 * Ouvre la liste des motifs, puis envoie le signalement.
 *
 * Les motifs sont ceux déjà traduits pour le signalement d'un compte : un
 * contenu se signale pour les mêmes raisons qu'un profil, et treize nouvelles
 * traductions n'auraient rien apporté.
 */
export function promptReport(params: {
  accessToken: string | null;
  targetType: ReportTarget;
  targetId: string;
  t: Translate;
  /** Titre de la fenêtre — laisse dire de QUOI il s'agit (publication, story…). */
  titleKey?: TranslationKey;
}): void {
  const { accessToken, targetType, targetId, t } = params;
  if (!accessToken || !targetId) return;

  const reasons: TranslationKey[] = [
    'up_report_spam',
    'up_report_inappropriate',
    'up_report_harassment',
    'up_report_false_info',
    'up_report_other',
  ];

  Alert.alert(
    t(params.titleKey ?? 'report_content_title'),
    t('report_content_why'),
    [
      ...reasons.map((key) => ({
        text: t(key),
        onPress: () => {
          // Envoi sans attendre la réponse : l'accusé de réception est
          // immédiat, car un signalement refait par doute serait pire qu'un
          // échec silencieux — et le serveur accepte les doublons.
          void fetch(`${API_BASE_URL}/social/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ targetType, targetId, reason: t(key) }),
          }).catch(() => undefined);
          Alert.alert(t('up_report_thanks_title'), t('up_report_thanks_body'));
        },
      })),
      { text: t('up_cancel'), style: 'cancel' as const },
    ],
  );
}
