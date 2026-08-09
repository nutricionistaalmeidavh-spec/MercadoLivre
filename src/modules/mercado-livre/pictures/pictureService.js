async function uploadProductPictures(product, request, token) {
  const ids = [];
  const origin = `${(request.headers["x-forwarded-proto"] || "https").split(",")[0]}://${request.headers.host}`;

  for (const imagePath of product.images || []) {
    const imageUrl = origin + imagePath;
    const imageResponse = await fetch(imageUrl, { headers: { "user-agent": "ArtiSys-ML-Publisher/1.0" } });
    if (!imageResponse.ok) throw new Error(`Falha ao baixar imagem ${imageUrl}: HTTP ${imageResponse.status}`);
    const bytes = await imageResponse.arrayBuffer();
    const fileName = String(imagePath).split("/").pop() || "imagem.jpg";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: imageResponse.headers.get("content-type") || "image/jpeg" }), fileName);
    const upload = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
    });
    const text = await upload.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { text }; }
    if (!upload.ok || !data.id) throw new Error(`Falha no upload da imagem ${fileName}: HTTP ${upload.status} ${JSON.stringify(data)}`);
    ids.push(data.id);
  }
  if (!ids.length) throw new Error("Nenhuma imagem foi carregada para o Mercado Livre.");
  return ids;
}

module.exports = { uploadProductPictures };
