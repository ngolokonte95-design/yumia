/** Libellés d'affichage par partenaire d'affiliation — utilisé dans la fiche
 * lieu, l'onglet "Bons plans" et le dashboard admin. */
export const AFFILIATE_PROVIDER_LABEL: Record<string, string> = {
  booking: 'Booking.com',
  getyourguide: 'GetYourGuide',
  viator: 'Viator',
  fever: 'Fever',
  shotgun: 'Shotgun',
  trainline: 'Trainline',
  treatwell: 'Treatwell',
};

export const AFFILIATE_PROVIDER_EMOJI: Record<string, string> = {
  booking: '🏨',
  getyourguide: '🎡',
  viator: '🎫',
  fever: '🎉',
  shotgun: '🎧',
  trainline: '🚆',
  treatwell: '💆',
};

export function affiliateProviderLabel(key: string): string {
  const emoji = AFFILIATE_PROVIDER_EMOJI[key] ?? '🔗';
  const name = AFFILIATE_PROVIDER_LABEL[key] ?? key;
  return `${emoji} ${name}`;
}
