const CLIENT_ID_DEFAULT = "7397781723111552";
const REDIRECT_DEFAULT = "https://eng-planilhas-callback-ml.vercel.app/mercadolivre/callback";

function getEnvironment(env = process.env) {
  const clientId = env.ML_CLIENT_ID || CLIENT_ID_DEFAULT;
  const clientSecret = env.ML_CLIENT_SECRET || "";
  const adminPassword = env.ADMIN_PASSWORD || "";
  const redirectUri = env.ML_REDIRECT_URI || REDIRECT_DEFAULT;
  if (!clientSecret) throw new Error("ML_CLIENT_SECRET não configurado.");
  if (!adminPassword) throw new Error("ADMIN_PASSWORD não configurado.");
  return { clientId, clientSecret, adminPassword, redirectUri };
}

module.exports = { CLIENT_ID_DEFAULT, REDIRECT_DEFAULT, getEnvironment };
