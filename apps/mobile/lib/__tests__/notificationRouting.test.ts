import { notificationTarget } from '../notificationRouting';

describe('notificationTarget', () => {
  it('renvoie vers le post pour un like', () => {
    expect(notificationTarget({ type: 'post_like', data: { postId: 'p1' } })).toBe('/post/p1');
  });

  it('renvoie vers le post pour un commentaire', () => {
    expect(notificationTarget({ type: 'post_comment', data: { postId: 'p1', commentId: 'c1' } })).toBe('/post/p1');
  });

  it('renvoie vers le profil pour un nouvel abonné', () => {
    expect(notificationTarget({ type: 'new_follower', data: { followerId: 'u1' } })).toBe('/user/u1');
  });

  it('renvoie vers le profil pour une rencontre', () => {
    expect(notificationTarget({ type: 'encounter', data: { userId: 'u2', placeId: 'pl1' } })).toBe('/user/u2');
  });

  it('renvoie vers les messages pour une réponse de story', () => {
    expect(notificationTarget({ type: 'story_reply', data: { storyId: 's1' } })).toBe('/chat');
  });

  it('utilise le chemin déjà construit pour un appel entrant', () => {
    expect(notificationTarget({ type: 'incoming_call', data: { path: '/call?callId=c1' } })).toBe('/call?callId=c1');
  });

  it.each(['badge_unlocked', 'level_up', 'streak_milestone', 'streak_danger'])(
    'renvoie vers le passeport pour %s',
    (type) => {
      expect(notificationTarget({ type })).toBe('/(tabs)/passport');
    },
  );

  it('renvoie vers les favoris pour un lieu sauvegardé qui ferme bientôt', () => {
    expect(notificationTarget({ type: 'closing_soon', data: { placeId: 'pl1' } })).toBe('/favorites');
  });

  it('renvoie vers l\'accueil pour le digest quotidien', () => {
    expect(notificationTarget({ type: 'daily_digest' })).toBe('/');
  });

  it('retombe sur le centre de notifications pour un type inconnu', () => {
    expect(notificationTarget({ type: 'mystere' })).toBe('/notifications');
  });

  it('retombe sur le centre de notifications si l\'identifiant attendu est absent', () => {
    expect(notificationTarget({ type: 'post_like' })).toBe('/notifications');
    expect(notificationTarget({ type: 'new_follower', data: {} })).toBe('/notifications');
  });
});
