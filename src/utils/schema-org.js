import { config } from '../config/app.js';

export function generateSchemaOrg(type, data) {
  const baseUrl = config.store.siteUrl || 'http://localhost:3000';

  switch (type) {
    case 'website':
      return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: data.name || 'altCMS Store',
        url: baseUrl,
        description: data.description,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${baseUrl}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      };

    case 'organization':
      return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: data.name,
        url: baseUrl,
        logo: data.logo ? `${baseUrl}${data.logo}` : undefined,
        sameAs: data.socialLinks || [],
      };

    case 'product':
      return {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: data.name,
        description: data.short_desc || data.description,
        image: data.gallery?.map(img => img.url) || [data.featured_image],
        sku: data.sku,
        brand: data.brand_name ? {
          '@type': 'Brand',
          name: data.brand_name,
        } : undefined,
        offers: {
          '@type': 'Offer',
          url: `${baseUrl}/products/${data.slug}`,
          priceCurrency: data.currency || 'VND',
          price: data.price,
          availability: data.stock_quantity > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
        },
        aggregateRating: data.review_count > 0 ? {
          '@type': 'AggregateRating',
          ratingValue: data.avg_rating,
          reviewCount: data.review_count,
        } : undefined,
      };

    case 'article':
      return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: data.title,
        description: data.meta_description || data.excerpt,
        image: data.featured_image,
        author: data.author_name ? {
          '@type': 'Person',
          name: data.author_name,
        } : undefined,
        publisher: {
          '@type': 'Organization',
          name: data.site_name || 'altCMS',
        },
        datePublished: data.published_at,
        dateModified: data.updated_at,
        mainEntityOfPage: `${baseUrl}/blog/${data.slug}`,
      };

    case 'breadcrumb':
      return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: (data.items || []).map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          item: item.url ? `${baseUrl}${item.url}` : undefined,
        })),
      };

    case 'collection':
      return {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: data.name,
        description: data.description,
        numberOfItems: data.item_count,
      };

    default:
      return null;
  }
}
