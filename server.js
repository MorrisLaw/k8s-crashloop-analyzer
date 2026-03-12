require("dotenv").config();

const fs = require("fs");
const path = require("path");
const http = require("http");
const { createAiExplainer, sanitizeLogSnippet } = require("./server/llm-explainer");

const PORT = Number(process.env.PORT || 8000);
const ROOT_DIR = path.join(__dirname, "public");
const aiExplainer = createAiExplainer();

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
};

const RATE_LIMIT_MAX_PER_MINUTE = 10;
const rateLimitByIp = new Map();
setInterval(() => rateLimitByIp.clear(), 60 * 1000);

function sendJson(res, status, payload) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxSize = 100 * 1024) {
    return new Promise((resolve, reject) => {
        let raw = "";

        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > maxSize) {
                req.destroy();
                reject(new Error("Request body too large"));
            }
        });

        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (err) {
                reject(err);
            }
        });

        req.on("error", reject);
    });
}

function checkRateLimit(req, res) {
    const ip = req.socket?.remoteAddress || "unknown";
    const current = rateLimitByIp.get(ip) || 0;
    if (current >= RATE_LIMIT_MAX_PER_MINUTE) {
        sendJson(res, 429, { error: "Rate limit exceeded. Try again shortly." });
        return false;
    }

    rateLimitByIp.set(ip, current + 1);
    return true;
}

function serveStatic(req, res) {
    const rawPath = req.url.split("?")[0];
    const requestPath = rawPath === "/" ? "/index.html" : rawPath;
    const relativePath = requestPath.replace(/^\/+/, "");
    const normalizedRelativePath = path.normalize(relativePath);
    const filePath = path.resolve(ROOT_DIR, normalizedRelativePath);

    if (!filePath.startsWith(ROOT_DIR + path.sep) && filePath !== ROOT_DIR) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not Found");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
        res.end(data);
    });
}

async function handleAiExplanation(req, res) {
    if (!checkRateLimit(req, res)) {
        return;
    }

    if (!aiExplainer.isEnabled()) {
        res.writeHead(204);
        res.end();
        return;
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch (_err) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
    }

    const cause = String(body?.cause || "").trim();
    const explanation = String(body?.explanation || "").trim();
    const logSnippet = sanitizeLogSnippet(body?.logText || "");

    if (!cause || !explanation) {
        sendJson(res, 400, { error: "Missing required fields: cause, explanation" });
        return;
    }

    const ai = await aiExplainer.explain({ cause, explanation, logSnippet });
    if (!ai) {
        res.writeHead(204);
        res.end();
        return;
    }

    sendJson(res, 200, { ai });
}

const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/ai-explanation") {
        await handleAiExplanation(req, res);
        return;
    }

    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`K8s CrashLoop Analyzer running on http://localhost:${PORT}`);
});
