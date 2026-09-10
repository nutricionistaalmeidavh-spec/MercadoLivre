const tokenService = require("../auth/tokenService");
const { request } = require("../../../core/http/mercadoLivreClient");

async function fetchGuide(packId, sellerId) {
  const token = await tokenService.getValidToken(sellerId);
  const base = `/messages/action_guide/packs/${encodeURIComponent(packId)}`;
  const [guide, caps] = await Promise.all([
    request(`${base}?tag=post_sale`, {}, token.access_token),
    request(`${base}/caps_available?tag=post_sale`, {}, token.access_token)
  ]);
  return { guide, caps };
}

function findOtherOption(value) {
  if (!value || typeof value !== "object") return null;
  if (value.option_id === "OTHER") return value;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const entry of child) {
        const found = findOtherOption(entry);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findOtherOption(child);
      if (found) return found;
    }
  }
  return null;
}

function findCap(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.cap_available === "number") return value.cap_available;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const entry of child) {
        const found = findCap(entry);
        if (found != null) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findCap(child);
      if (found != null) return found;
    }
  }
  return null;
}

module.exports = { fetchGuide, findOtherOption, findCap };
