import { ShopImportService } from '../shop-import.service';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import type { AliExpressService } from '../aliexpress.service';

const makePrisma = () => ({
  shopCategory: { findUnique: jest.fn(), delete: jest.fn() },
  product: { deleteMany: jest.fn() },
});

describe('ShopImportService.retireCategory', () => {
  it('supprime les produits du rayon avant le rayon lui-même', async () => {
    // L'ordre compte : la contrainte ON DELETE RESTRICT entre Product et
    // ShopCategory refuse de supprimer un rayon encore référencé par un
    // produit.
    const prisma = makePrisma();
    prisma.shopCategory.findUnique.mockResolvedValue({ id: 'cat-1', slug: 'vin-apero' });
    prisma.product.deleteMany.mockResolvedValue({ count: 36 });

    const service = new ShopImportService(
      prisma as unknown as PrismaService,
      {} as AliExpressService,
    );

    const result = await service.retireCategory('vin-apero');

    expect(result).toEqual({ slug: 'vin-apero', productsDeleted: 36 });
    expect(prisma.product.deleteMany).toHaveBeenCalledWith({ where: { categoryId: 'cat-1' } });
    expect(prisma.shopCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });

    // L'ordre réel des appels, pas seulement leur présence.
    const deleteManyOrder = prisma.product.deleteMany.mock.invocationCallOrder[0];
    const deleteOrder = prisma.shopCategory.delete.mock.invocationCallOrder[0];
    expect(deleteManyOrder).toBeLessThan(deleteOrder);
  });

  it('échoue proprement sur un rayon déjà absent, sans rien supprimer', async () => {
    const prisma = makePrisma();
    prisma.shopCategory.findUnique.mockResolvedValue(null);

    const service = new ShopImportService(
      prisma as unknown as PrismaService,
      {} as AliExpressService,
    );

    await expect(service.retireCategory('rayon-fantome')).rejects.toThrow(
      'Rayon absent en base : rayon-fantome',
    );
    expect(prisma.product.deleteMany).not.toHaveBeenCalled();
    expect(prisma.shopCategory.delete).not.toHaveBeenCalled();
  });

  it("fonctionne sur un rayon sans aucun produit (count à 0)", () => {
    const prisma = makePrisma();
    prisma.shopCategory.findUnique.mockResolvedValue({ id: 'cat-2', slug: 'meuble-deco' });
    prisma.product.deleteMany.mockResolvedValue({ count: 0 });

    const service = new ShopImportService(
      prisma as unknown as PrismaService,
      {} as AliExpressService,
    );

    return expect(service.retireCategory('meuble-deco')).resolves.toEqual({
      slug: 'meuble-deco',
      productsDeleted: 0,
    });
  });
});
