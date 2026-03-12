const assert = require("assert");
const { createAiExplainer, sanitizeLogSnippet } = require("../server/llm-explainer");

function run() {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const explainer = createAiExplainer();
    assert.strictEqual(explainer.isEnabled(), false, "explainer should be disabled without GEMINI_API_KEY");

    const snippet = sanitizeLogSnippet("line1\n\nline2\tline3", 20);
    assert.strictEqual(snippet, "line1 line2 line3", "snippet should normalize whitespace");

    const longSnippet = sanitizeLogSnippet("a".repeat(2000), 100);
    assert.strictEqual(longSnippet.length, 100, "snippet should be truncated to maxChars");

    if (originalKey !== undefined) {
        process.env.GEMINI_API_KEY = originalKey;
    }

    console.log("PASS: llm explainer helper test cases");
}

run();
