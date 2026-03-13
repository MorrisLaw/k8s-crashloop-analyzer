const { createAiExplainer, sanitizeLogSnippet } = require("../server/llm-explainer");

console.log("[ai-explanation] GEMINI_API_KEY present:", Boolean(process.env.GEMINI_API_KEY));
const aiExplainer = createAiExplainer();
console.log("[ai-explanation] aiExplainer.isEnabled():", aiExplainer.isEnabled());
const RATE_LIMIT_MAX_PER_MINUTE = 10;
const rateLimitByIp = new Map();
setInterval(() => rateLimitByIp.clear(), 60 * 1000);

function checkRateLimit(req, res) {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "").split(",")[0].trim() || "unknown";
    const current = rateLimitByIp.get(ip) || 0;
    if (current >= RATE_LIMIT_MAX_PER_MINUTE) {
        res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
        return false;
    }

    rateLimitByIp.set(ip, current + 1);
    return true;
}

async function handler(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }

    if (!checkRateLimit(req, res)) {
        return;
    }

    if (!aiExplainer.isEnabled()) {
        console.warn("[ai-explanation] AI explainer disabled. GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "set" : "MISSING");
        res.status(204).end();
        return;
    }

    const cause = String(req.body?.cause || "").trim();
    const explanation = String(req.body?.explanation || "").trim();
    const logSnippet = sanitizeLogSnippet(req.body?.logText || "");

    if (!cause || !explanation) {
        res.status(400).json({ error: "Missing required fields: cause, explanation" });
        return;
    }

    const ai = await aiExplainer.explain({ cause, explanation, logSnippet });
    if (!ai) {
        res.status(204).end();
        return;
    }

    res.status(200).json({ ai });
}

module.exports = handler;
module.exports.default = handler;
