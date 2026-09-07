/** Recherche produits — même grille que les rayons, avec le champ de saisie. */
import { useLocalSearchParams } from 'expo-router';
import { ProductGridScreen } from '../../components/shop/ProductGridScreen';
import type { ProductQuery } from '../../lib/shop-api';

export default function ShopSearchScreen() {
  const { q, sort, featured } = useLocalSearchParams<{ q?: string; sort?: string; featured?: string }>();

  const title = q ? `« ${q} »` : featured === 'true' ? 'Sélection YUMIA' : 'Tous les produits';

  return (
    <ProductGridScreen
      title={title}
      showSearchInput
      baseQuery={{
        q,
        sort: sort as ProductQuery['sort'],
        featured: featured === 'true' ? true : undefined,
      }}
    />
  );
}
