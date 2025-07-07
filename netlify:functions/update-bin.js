const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { barcode, bin } = JSON.parse(event.body);
  const shop = 'opal-and-olive.myshopify.com';
  const accessToken = process.env.SHOPIFY_TOKEN;

  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': accessToken
  };

  const searchQuery = {
    query: `query {
      productVariants(first: 1, query: "barcode:${barcode}") {
        edges {
          node {
            id
            title
            product {
              title
              images(first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
            }
          }
        }
      }
    }`
  };

  try {
    const res = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify(searchQuery)
    });

    const data = await res.json();
    const variant = data.data.productVariants.edges[0]?.node;

    if (!variant) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'No product found for that barcode.' })
      };
    }

    const productTitle = variant.product.title;
    const productImage = variant.product.images.edges[0]?.node.url || '';

    // Only update metafield if bin value is present
    if (bin && bin.length > 0) {
      const mutationQuery = {
        query: `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }`,
        variables: {
          metafields: [{
            ownerId: variant.id,
            namespace: "custom",
            key: "bin_location",
            type: "single_line_text_field",
            value: bin
          }]
        }
      };

      const updateRes = await fetch(`https://${shop}/admin/api/2023-10/graphql.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify(mutationQuery)
      });

      const updateJson = await updateRes.json();
      const userErrors = updateJson.data.metafieldsSet.userErrors;

      if (userErrors.length) {
        return {
          statusCode: 400,
          body: JSON.stringify({ success: false, message: userErrors[0].message })
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Bin location updated.',
        productTitle,
        productImage
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: err.message })
    };
  }
};
