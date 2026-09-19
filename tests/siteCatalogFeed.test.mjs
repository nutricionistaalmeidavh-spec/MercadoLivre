import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicCatalogFeed,
  normalizeCatalogDecision,
  productPictures
} from "../cloudflare/src/site-catalog.mjs";

test("catálogo público exclui anúncio sem aprovação e anúncio oculto", () => {
  const listings = [
    { item_id: "MLB1", title: "Sistema A", price: 100, currency_id: "BRL", permalink: "https://produto/1", pictures: [] },
    { item_id: "MLB2", title: "Sistema B", price: 200, currency_id: "BRL", permalink: "https://produto/2", pictures: [] }
  ];
  const decisions = [
    { item_id: "MLB1", approved: 0, site_visibility: "individual" },
    { item_id: "MLB2", approved: 1, site_visibility: "hidden" }
  ];
  assert.deepEqual(buildPublicCatalogFeed(listings, decisions), []);
});

test("catálogo público publica somente decisão aprovada e preserva fotos reais do anúncio", () => {
  const listings = [{
    item_id: "MLB10",
    title: "Oficina Agrícola",
    price: 189,
    currency_id: "BRL",
    permalink: "https://produto/10",
    sold_quantity: 7,
    thumbnail: "https://http2.mlstatic.com/thumb.jpg",
    pictures: [
      { id: "A", url: "https://http2.mlstatic.com/a.jpg", secure_url: "https://http2.mlstatic.com/a-secure.jpg" },
      { id: "B", url: "http://http2.mlstatic.com/b.jpg", secure_url: "https://http2.mlstatic.com/b-secure.jpg" }
    ]
  }];
  const decisions = [{
    item_id: "MLB10",
    approved: 1,
    site_visibility: "collection",
    collection_slug: "agro",
    site_name: "Oficina Agrícola",
    site_slug: "oficina-agricola",
    featured: 1,
    price_mode: "marketplace"
  }];
  const feed = buildPublicCatalogFeed(listings, decisions);
  assert.equal(feed.length, 1);
  assert.deepEqual(feed[0], {
    item_id: "MLB10",
    name: "Oficina Agrícola",
    slug: "oficina-agricola",
    pageMode: "collection",
    collection: "agro",
    featured: true,
    priceMode: "marketplace",
    price: 189,
    currency: "BRL",
    permalink: "https://produto/10",
    soldQuantity: 7,
    pictures: [
      "https://http2.mlstatic.com/a-secure.jpg",
      "https://http2.mlstatic.com/b-secure.jpg"
    ]
  });
});

test("normalização não permite publicação implícita nem classificação desconhecida", () => {
  assert.deepEqual(normalizeCatalogDecision({ item_id: " MLB99 ", approved: true, site_visibility: "unknown" }), {
    itemId: "MLB99",
    approved: false,
    siteVisibility: "hidden",
    collectionSlug: "",
    siteName: "",
    siteSlug: "",
    featured: false,
    priceMode: "marketplace",
    heroPictureUrl: ""
  });
});

test("coleção ainda não publicada no site não pode ser aprovada", () => {
  assert.deepEqual(normalizeCatalogDecision({
    item_id: "MLB200",
    approved: true,
    site_visibility: "collection",
    collection_slug: "negocios",
    site_name: "Sistema de Negócios"
  }), {
    itemId: "MLB200",
    approved: false,
    siteVisibility: "collection",
    collectionSlug: "negocios",
    siteName: "Sistema de Negócios",
    siteSlug: "",
    featured: false,
    priceMode: "marketplace",
    heroPictureUrl: ""
  });
});

test("fotos públicas usam somente URL HTTPS", () => {
  assert.deepEqual(productPictures({
    thumbnail: "https://http2.mlstatic.com/thumb.jpg",
    pictures: [
      { secure_url: "https://http2.mlstatic.com/1.jpg" },
      { secure_url: "http://inseguro/2.jpg" },
      { url: "https://http2.mlstatic.com/3.jpg" }
    ]
  }), ["https://http2.mlstatic.com/1.jpg", "https://http2.mlstatic.com/3.jpg"]);
});

test("capa escolhida precisa ser HTTPS e aparece primeiro no feed público", () => {
  const listing = {
    item_id: "MLB300",
    title: "PDV ArtiSys",
    price: 189,
    currency_id: "BRL",
    permalink: "https://produto/300",
    pictures: [
      { secure_url: "https://http2.mlstatic.com/1.jpg" },
      { secure_url: "https://http2.mlstatic.com/2.jpg" },
      { secure_url: "https://http2.mlstatic.com/3.jpg" }
    ]
  };
  const normalized = normalizeCatalogDecision({
    item_id: "MLB300",
    approved: true,
    site_visibility: "individual",
    site_slug: "pdv-artisys",
    hero_picture_url: "https://http2.mlstatic.com/2.jpg"
  });
  assert.equal(normalized.heroPictureUrl, "https://http2.mlstatic.com/2.jpg");

  const [product] = buildPublicCatalogFeed([listing], [{
    item_id: "MLB300",
    approved: 1,
    site_visibility: "individual",
    site_slug: "pdv-artisys",
    hero_picture_url: "https://http2.mlstatic.com/2.jpg"
  }]);
  assert.equal(product.heroPicture, "https://http2.mlstatic.com/2.jpg");
  assert.deepEqual(product.pictures, [
    "https://http2.mlstatic.com/2.jpg",
    "https://http2.mlstatic.com/1.jpg",
    "https://http2.mlstatic.com/3.jpg"
  ]);

  assert.equal(normalizeCatalogDecision({
    item_id: "MLB301",
    hero_picture_url: "http://inseguro/capa.jpg"
  }).heroPictureUrl, "");
});

test("grupo publica um único produto, soma vendas e usa anúncio principal para preço e link", () => {
  const listings = [
    {
      item_id: "MLB401",
      title: "PDV ArtiSys A",
      price: 189,
      currency_id: "BRL",
      permalink: "https://produto/401",
      sold_quantity: 12,
      pictures: [{ secure_url: "https://http2.mlstatic.com/401.jpg" }]
    },
    {
      item_id: "MLB402",
      title: "PDV ArtiSys B",
      price: 199,
      currency_id: "BRL",
      permalink: "https://produto/402",
      sold_quantity: 5,
      pictures: [{ secure_url: "https://http2.mlstatic.com/402.jpg" }]
    },
    {
      item_id: "MLB403",
      title: "Sistema Isolado",
      price: 79,
      currency_id: "BRL",
      permalink: "https://produto/403",
      sold_quantity: 2,
      pictures: []
    }
  ];
  const decisions = [
    { item_id: "MLB401", approved: 1, site_visibility: "individual", site_slug: "pdv-a", site_name: "PDV A" },
    { item_id: "MLB402", approved: 1, site_visibility: "individual", site_slug: "pdv-b", site_name: "PDV B" },
    { item_id: "MLB403", approved: 1, site_visibility: "individual", site_slug: "isolado", site_name: "Sistema Isolado" }
  ];
  const groups = [{
    group_id: "grp-pdv",
    approved: 1,
    site_visibility: "individual",
    collection_slug: "",
    site_name: "PDV ArtiSys",
    site_slug: "pdv-artisys",
    primary_item_id: "MLB402",
    featured: 1,
    price_mode: "marketplace",
    hero_picture_url: "https://http2.mlstatic.com/401.jpg"
  }];
  const groupItems = [
    { group_id: "grp-pdv", item_id: "MLB401" },
    { group_id: "grp-pdv", item_id: "MLB402" }
  ];

  const feed = buildPublicCatalogFeed(listings, decisions, groups, groupItems);
  assert.equal(feed.length, 2);
  const grouped = feed.find((item) => item.group_id === "grp-pdv");
  assert.ok(grouped);
  assert.equal(grouped.item_id, "MLB402");
  assert.equal(grouped.name, "PDV ArtiSys");
  assert.equal(grouped.price, 199);
  assert.equal(grouped.permalink, "https://produto/402");
  assert.equal(grouped.soldQuantity, 17);
  assert.deepEqual(grouped.sourceItemIds, ["MLB401", "MLB402"]);
  assert.equal(grouped.heroPicture, "https://http2.mlstatic.com/401.jpg");
  assert.deepEqual(grouped.pictures, [
    "https://http2.mlstatic.com/401.jpg",
    "https://http2.mlstatic.com/402.jpg"
  ]);
  assert.equal(feed.filter((item) => ["pdv-a", "pdv-b"].includes(item.slug)).length, 0);
  assert.equal(feed.find((item) => item.slug === "isolado")?.item_id, "MLB403");
});

test("grupo com anúncio principal ausente falha fechado e não deixa membros vazarem como individuais", () => {
  const listings = [
    { item_id: "MLB501", title: "Duplicado A", price: 10, currency_id: "BRL", permalink: "https://produto/501", sold_quantity: 1, pictures: [] },
    { item_id: "MLB502", title: "Duplicado B", price: 20, currency_id: "BRL", permalink: "https://produto/502", sold_quantity: 2, pictures: [] }
  ];
  const decisions = listings.map((item) => ({
    item_id: item.item_id,
    approved: 1,
    site_visibility: "individual",
    site_slug: item.item_id.toLowerCase()
  }));
  const groups = [{
    group_id: "grp-broken",
    approved: 1,
    site_visibility: "individual",
    site_name: "Produto quebrado",
    site_slug: "produto-quebrado",
    primary_item_id: "MLB999",
    price_mode: "marketplace"
  }];
  const groupItems = [
    { group_id: "grp-broken", item_id: "MLB501" },
    { group_id: "grp-broken", item_id: "MLB502" }
  ];

  assert.deepEqual(buildPublicCatalogFeed(listings, decisions, groups, groupItems), []);
});
