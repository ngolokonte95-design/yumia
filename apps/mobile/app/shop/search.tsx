/** Recherche produits — même grille que les rayons, avec le champ de saisie. */
import { useLocalSearchParams } from 'expo-router';
import { ProductGridScreen } from '../../components/shop/ProductGridScreen';
import type { ProductQuery } from '../../lib/shop-api';
import { useI18n } from '../../lib/useI18n';

export default function ShopSearchScreen() {
  const { q, sort, featured } = useLocalSearchParams<{ q?: string; sort?: string; featured?: string }>();

  const { t } = useI18n();

  const title = q
    ? t('shop_search_title_query').replace('{q}', q)
    : featured === 'true' ? t('shop_home_featured') : t('shop_search_all_products');

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
