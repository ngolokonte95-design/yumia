import type { AliExpressOrderStatus } from '../aliexpress.service';
import { combinedStage, stageOf, trackingUrlFor } from '../order-sync.service';

const state = (over: Partial<AliExpressOrderStatus>): AliExpressOrderStatus => ({
  status: 'PLACE_ORDER_SUCCESS',
  logisticsStatus: 'NO_LOGISTICS',
  endReason: null,
  amount: '10.97 USD',
  trackingNumber: null,
  carrier: null,
  ...over,
});

describe('stageOf — état AliExpress vu de YUMIA', () => {
  it('YUM-E2EE26 (réponse réelle) : jamais payée, donc annulée — pas expédiée', () => {
    expect(stageOf(state({ status: 'FINISH', endReason: 'PAYMENT_TIMEOUT_BUYER', logisticsStatus: 'NO_LOGISTICS' })))
      .toBe('cancelled');
  });

  it('créée mais pas encore payée : à payer', () => {
    expect(stageOf(state({ status: 'PLACE_ORDER_SUCCESS' }))).toBe('awaiting_payment');
  });

  it('payée, le vendeur prépare : en préparation', () => {
    expect(stageOf(state({ status: 'WAIT_SELLER_SEND_GOODS' }))).toBe('preparing');
  });

  it('colis parti : expédiée', () => {
    expect(stageOf(state({ status: 'WAIT_BUYER_ACCEPT_GOODS', trackingNumber: 'LP00123456789CN' }))).toBe('shipped');
  });

  it('close après réception : livrée', () => {
    expect(stageOf(state({ status: 'FINISH', logisticsStatus: 'BUYER_ACCEPT_GOODS', trackingNumber: 'LP00123456789CN' })))
      .toBe('delivered');
  });

  it('statut inconnu : on ne touche à rien', () => {
    expect(stageOf(state({ status: 'SOMETHING_NEW', logisticsStatus: null }))).toBe('unknown');
  });
});

describe('combinedStage — commande passée à plusieurs vendeurs', () => {
  it('une annulation passe avant tout', () => {
    expect(combinedStage(['shipped', 'cancelled'])).toBe('cancelled');
  });

  it('un paiement manquant passe avant la préparation', () => {
    expect(combinedStage(['preparing', 'awaiting_payment'])).toBe('awaiting_payment');
  });

  it('livrée seulement quand tout est livré', () => {
    expect(combinedStage(['delivered', 'shipped'])).toBe('shipped');
    expect(combinedStage(['delivered', 'delivered'])).toBe('delivered');
  });
});

it('lien de suivi : numéro encodé dans 17track', () => {
  expect(trackingUrlFor('LP 001')).toBe('https://t.17track.net/fr#nums=LP%20001');
});
