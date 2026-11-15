import "dotenv/config";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

// 1. Initialize all three SDKs
const openai = new OpenAI();
const anthropic = new Anthropic();
const gemini = new GoogleGenAI({});

// 2. Get question from CLI
const question = process.argv.slice(2).join(" ");
if (!question) {
  console.log('Usage: node index.js "Your coding question"');
  process.exit(1);
}

const codingPrompt =
  "You are a senior software engineer. Provide clean, modular code using best design patterns.";

const judgeSystemPrompt = `You are a Principal Software Architect evaluating three AI solutions (OpenAI, Claude, Gemini).
Compare them strictly on code quality, clean code principles, design patterns, and edge-case handling.

Format your response into two sections:
1. COMPARISON & SCORECARD: Briefly compare the strengths, weaknesses, and design pattern choices of OpenAI, Claude, and Gemini, and declare which model gave the strongest individual answer.
2. BEST SYNTHESIZED SOLUTION: Combine the best elements of all three into one optimal, bug-free final implementation.`;

console.log("Generating solutions from OpenAI, Claude, and Gemini...\n");

// 3. Run all three and wait for every result
const results = await Promise.allSettled([
  openai.chat.completions
    .create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: codingPrompt },
        { role: "user", content: question },
      ],
    })
    .then((res) => ({ model: "OpenAI", text: res.choices[0].message.content })),

  anthropic.messages
    .create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: codingPrompt,
      messages: [{ role: "user", content: question }],
    })
    .then((res) => ({ model: "Claude", text: res.content[0].text })),

  gemini.models
    .generateContent({
      model: "gemini-2.5-pro",
      contents: question,
      config: { systemInstruction: codingPrompt },
    })
    .then((res) => ({ model: "Gemini", text: res.text })),
]);

// 4. Print all three responses side-by-side in the terminal so you can compare them
const validResponses = [];

for (const result of results) {
  if (result.status === "fulfilled") {
    const { model, text } = result.value;
    validResponses.push(`--- ${model} Response ---\n${text}`);

    console.log(`==================== ${model.toUpperCase()} ====================`);
    console.log(text);
    console.log("\n");
  } else {
    console.log(`⚠️ A model failed: ${result.reason.message}\n`);
  }
}

if (validResponses.length === 0) {
  console.error("All models failed.");
  process.exit(1);
}

// 5. Pass all three to Claude Judge to compare & produce the best output
console.log("==================== CLAUDE JUDGE: COMPARISON & BEST OUTPUT ====================\n");

const finalPrompt = `User Question: ${question}\n\n${validResponses.join("\n\n")}`;

const stream = anthropic.messages.stream({
  model: "claude-sonnet-4-5",
  max_tokens: 4096,
  system: judgeSystemPrompt,
  messages: [{ role: "user", content: finalPrompt }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}

console.log("\n");