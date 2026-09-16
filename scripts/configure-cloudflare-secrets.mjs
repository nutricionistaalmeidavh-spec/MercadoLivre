import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const workerUrl = String(process.argv[2] || "").replace(/\/$/, "");
if (!/^https:\/\//i.test(workerUrl)) {
  throw new Error("Informe a URL HTTPS do Worker como primeiro argumento.");
}

const requiredFromVercel = ["ML_CLIENT_SECRET", "ADMIN_PASSWORD"];
for (const key of requiredFromVercel) {
  if (!process.env[key]) throw new Error(`${key} não está disponível no ambiente Production da Vercel.`);
}

const randomSecret = () => randomBytes(32).toString("base64url");
const migrationSecret = randomSecret();
const secrets = {
  ML_CLIENT_SECRET: process.env.ML_CLIENT_SECRET,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  TOKEN_ENCRYPTION_KEY: randomSecret(),
  ADMIN_SESSION_SECRET: randomSecret(),
  ML_MIGRATION_SECRET: migrationSecret
};

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args, input) {
  const result = spawnSync(npx, args, {
    cwd: process.cwd(),
    input,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Comando falhou: npx ${args.join(" ")}`);
}

run(
  ["-y", "wrangler@4", "secret", "bulk", "--config", "cloudflare/wrangler.jsonc"],
  JSON.stringify(secrets)
);

function setVercelProductionEnv(name, value) {
  run(
    ["-y", "vercel@latest", "env", "add", name, "production", "--force"],
    `${value}\n`
  );
}

setVercelProductionEnv("ML_MIGRATION_TARGET_URL", workerUrl);
setVercelProductionEnv("ML_MIGRATION_SECRET", migrationSecret);

console.log("Secrets do Worker configurados e bridge temporário preparado na Vercel.");
console.log("Nenhum valor secreto foi impresso ou salvo pelo script.");
