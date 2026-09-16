import { collectOrderIds } from '../aliexpress.service';

/**
 * YUM-E2EE26 a été acceptée par AliExpress avec un `order_id` vide : lue comme
 * un échec, elle aurait été retransmise, donc passée en double.
 */
describe('numéros de commande AliExpress', () => {
  it('lit un order_id simple', () => {
    expect(collectOrderIds({ is_success: true, order_id: 8200123456789012 })).toEqual(['8200123456789012']);
  });

  it('lit une liste de numéros, une commande par vendeur', () => {
    expect(
      collectOrderIds({ is_success: true, order_list: { number: [8200123456789012, 8200123456789013] } }),
    ).toEqual(['8200123456789012', '8200123456789013']);
  });

  it('trouve les numéros à plus grande profondeur', () => {
    expect(collectOrderIds({ is_success: true, data: { orders: [{ order_id: '8200123456789099' }] } })).toEqual([
      '8200123456789099',
    ]);
  });

  it("n'invente rien quand il n'y a pas de numéro", () => {
    expect(collectOrderIds({ is_success: true, order_id: '' })).toEqual([]);
    expect(collectOrderIds({ is_success: true, error_code: '12345678' })).toEqual([]);
  });
});
