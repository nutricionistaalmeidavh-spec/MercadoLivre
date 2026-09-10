const { findOtherOption, findCap } = require("./communicationReasons");

function evaluatePolicy({ guideResponse, capsResponse, text }) {
  if (!guideResponse?.ok) {
    return { allowed: false, reason: "ACTION_GUIDE_UNAVAILABLE", details: guideResponse?.data || null };
  }
  if (!capsResponse?.ok) {
    return { allowed: false, reason: "CAPS_UNAVAILABLE", details: capsResponse?.data || null };
  }

  const option = findOtherOption(guideResponse.data);
  if (!option) return { allowed: false, reason: "OTHER_NOT_AVAILABLE" };

  const cap = findCap(capsResponse.data);
  if (cap == null || cap < 1) return { allowed: false, reason: "NO_MESSAGE_CAP" };

  const charLimit = Number(option.char_limit || guideResponse.data?.char_limit || 350);
  const normalized = String(text || "").trim();
  if (!normalized) return { allowed: false, reason: "EMPTY_MESSAGE" };
  if (normalized.length > charLimit) {
    return { allowed: false, reason: "MESSAGE_TOO_LONG", charLimit, length: normalized.length };
  }

  return { allowed: true, reason: "OTHER_ALLOWED", optionId: "OTHER", charLimit, capAvailable: cap };
}

module.exports = { evaluatePolicy };
