/** Rayon de la boutique — réutilise la grille commune (filtres, tri, pagination). */
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth-context';
import { shopApi } from '../../../lib/shop-api';
import { ProductGridScreen } from '../../../components/shop/ProductGridScreen';

export default function ShopCategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { accessToken } = useAuth();
  const [title, setTitle] = useState('Rayon');

  // Le nom lisible du rayon n'est pas dans l'URL : on le récupère pour
  // l'en-tête, en gardant un titre neutre tant qu'il n'est pas connu.
  useEffect(() => {
    if (!accessToken || !slug) return;
    shopApi.categories(accessToken)
      .then((cats) => {
        const found = cats.find((c) => c.slug === slug);
        if (found) setTitle(`${found.emoji} ${found.nameFr}`);
      })
      .catch(() => {});
  }, [accessToken, slug]);

  return <ProductGridScreen title={title} baseQuery={{ category: slug }} />;
}
