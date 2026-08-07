/**
 * Où naviguer pour une notification donnée — partagé entre le tap sur une
 * notification push (voir pushListeners.ts) et le tap sur une ligne du
 * centre de notifications (app/notifications.tsx), pour qu'ils mènent
 * toujours au même endroit.
 */

export interface NotificationLike {
  type: string;
  data?: Record<string, unknown> | null;
}

export function notificationTarget(n: NotificationLike): string {
  const data = n.data ?? {};
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

  switch (n.type) {
    case 'post_like':
    case 'post_comment': {
      const postId = str(data.postId);
      return postId ? `/post/${postId}` : '/notifications';
    }
    case 'new_follower': {
      const followerId = str(data.followerId);
      return followerId ? `/user/${followerId}` : '/notifications';
    }
    case 'encounter': {
      const userId = str(data.userId);
      return userId ? `/user/${userId}` : '/notifications';
    }
    case 'story_reply':
      // La réponse atterrit en DM — pas de convId dans le payload, on ouvre
      // la liste des messages plutôt qu'une conversation précise.
      return '/chat';
    case 'incoming_call':
      // Déjà construit côté serveur avec tous les paramètres de l'appel.
      return str(data.path) ?? '/notifications';
    case 'badge_unlocked':
    case 'level_up':
    case 'streak_milestone':
    case 'streak_danger':
      return '/(tabs)/passport';
    case 'closing_soon':
      // `place.tsx` se lit depuis un store client rempli au clic dans l'app —
      // impossible d'y deep-link à froid depuis une notif. Les favoris restent
      // le point d'entrée le plus pertinent pour "un lieu sauvegardé ferme bientôt".
      return '/favorites';
    case 'daily_digest':
      return '/';
    default:
      return '/notifications';
  }
}
