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

function findOption(value, optionId) {
  if (!value || typeof value !== "object") return null;
  if (value.option_id === optionId) return value;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const entry of child) {
        const found = findOption(entry, optionId);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findOption(child, optionId);
      if (found) return found;
    }
  }
  return null;
}

function findOtherOption(value) {
  return findOption(value, "OTHER");
}

function findCapForOption(value, optionId = "OTHER") {
  const option = findOption(value, optionId);
  return option && typeof option.cap_available === "number" ? option.cap_available : null;
}

module.exports = { fetchGuide, findOption, findOtherOption, findCapForOption };
