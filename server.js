const http = require("http");
const fs = require("fs");
const path = require("path");
const { migrate } = require("./src/core/database/migrations");
const { startWorker } = require("./src/modules/mercado-livre/jobs/worker");

const handlers = {
  "/api/auth": require("./api/auth"),
  "/api/ml": require("./api/ml"),
  "/api/oauth": require("./api/oauth"),
  "/api/webhook": require("./api/webhook"),
  "/api/automation": require("./api/automation"),
  "/api/health": require("./api/health")
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function serveStatic(req, res, pathname) {
  let requested = pathname === "/" ? "/index.html" : pathname;
  const relative = path.normalize(decodeURIComponent(requested)).replace(/^([.][.][/\\])+/, "").replace(/^[/\\]+/, "");
  const file = path.resolve(process.cwd(), relative);
  const root = path.resolve(process.cwd());
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.statusCode = 200;
    res.setHeader("content-type", mime[path.extname(file).toLowerCase()] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
}

migrate();
startWorker();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const handler = handlers[url.pathname];
    if (handler) return await handler(req, res);
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    if (!res.writableEnded) res.end(JSON.stringify({ error: "Erro interno." }));
    console.error("server_error", { message: error.message });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Artisys Mercado Livre ouvindo na porta ${port}`));
