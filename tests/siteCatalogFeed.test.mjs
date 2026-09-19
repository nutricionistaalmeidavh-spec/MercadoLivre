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
    priceMode: "marketplace"
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
    priceMode: "marketplace"
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
