import { GoogleGenerativeAI } from '@google/generative-ai';
import { CSV_TOOL_DECLARATIONS } from './csvTools';
import { YOUTUBE_TOOL_DECLARATIONS } from './youtubeTools';

const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || '');

const MODEL = 'gemini-2.0-flash';

const SEARCH_TOOL = { googleSearch: {} };
const CODE_EXEC_TOOL = { codeExecution: {} };

export const CODE_KEYWORDS = /\b(plot|chart|graph|analyz|statistic|regression|correlat|histogram|visualiz|calculat|compute|run code|write code|execute|pandas|numpy|matplotlib|csv|data)\b/i;

let cachedPrompt = null;

async function loadSystemPrompt() {
  if (cachedPrompt) return cachedPrompt;
  try {
    const res = await fetch('/prompt_chat.txt');
    cachedPrompt = res.ok ? (await res.text()).trim() : '';
  } catch {
    cachedPrompt = '';
  }
  return cachedPrompt;
}

// Yields:
//   { type: 'text', text }           — streaming text chunks
//   { type: 'fullResponse', parts }  — when code was executed; replaces streamed text
//   { type: 'grounding', data }      — Google Search metadata
//
// fullResponse parts: { type: 'text'|'code'|'result'|'image', ... }
//
// useCodeExecution: pass true to use codeExecution tool (CSV/analysis),
//                   false (default) to use googleSearch tool.
// Note: Gemini does not support both tools simultaneously.
// userContext: { firstName, lastName } — used to personalize responses and address user by name.
export const streamChat = async function* (
  history,
  newMessage,
  imageParts = [],
  useCodeExecution = false,
  userContext = null
) {
  let systemInstruction = await loadSystemPrompt();
  if (userContext?.firstName || userContext?.lastName) {
    const name = [userContext.firstName, userContext.lastName].filter(Boolean).join(' ');
    systemInstruction = `[Current user: ${name}]\n\nAddress the user by name (${name}) in your first message and when appropriate.\n\n${systemInstruction}`;
  }
  const tools = useCodeExecution ? [CODE_EXEC_TOOL] : [SEARCH_TOOL];
  const model = genAI.getGenerativeModel({
    model: MODEL,
    tools,
  });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        {
          role: 'user',
          parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }],
        },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  const parts = [
    { text: newMessage },
    ...imageParts.map((img) => ({
      inlineData: { mimeType: img.mimeType || 'image/png', data: img.data },
    })),
  ].filter((p) => p.text !== undefined || p.inlineData !== undefined);

  const result = await chat.sendMessageStream(parts);

  // Stream text chunks for live display
  for await (const chunk of result.stream) {
    const chunkParts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of chunkParts) {
      if (part.text) yield { type: 'text', text: part.text };
    }
  }

  // After stream: inspect all response parts
  const response = await result.response;
  const allParts = response.candidates?.[0]?.content?.parts || [];

  const hasCodeExecution = allParts.some(
    (p) =>
      p.executableCode ||
      p.codeExecutionResult ||
      (p.inlineData && p.inlineData.mimeType?.startsWith('image/'))
  );

  if (hasCodeExecution) {
    // Build ordered structured parts to replace the streamed text
    const structuredParts = allParts
      .map((p) => {
        if (p.text) return { type: 'text', text: p.text };
        if (p.executableCode)
          return {
            type: 'code',
            language: p.executableCode.language || 'PYTHON',
            code: p.executableCode.code,
          };
        if (p.codeExecutionResult)
          return {
            type: 'result',
            outcome: p.codeExecutionResult.outcome,
            output: p.codeExecutionResult.output,
          };
        if (p.inlineData)
          return { type: 'image', mimeType: p.inlineData.mimeType, data: p.inlineData.data };
        return null;
      })
      .filter(Boolean);

    yield { type: 'fullResponse', parts: structuredParts };
  }

  // Grounding metadata (search sources)
  const grounding = response.candidates?.[0]?.groundingMetadata;
  if (grounding) {
    console.log('[Search grounding]', grounding);
    yield { type: 'grounding', data: grounding };
  }
};

// ── Function-calling chat for CSV tools ───────────────────────────────────────
// Gemini picks a tool + args → executeFn runs it client-side (free) → Gemini
// receives the result and returns a natural-language answer.
//
// executeFn(toolName, args) → plain JS object with the result
// Returns the final text response from the model.
// userContext: { firstName, lastName } — used to personalize responses.

export const chatWithCsvTools = async (history, newMessage, csvHeaders, executeFn, userContext = null) => {
  let systemInstruction = await loadSystemPrompt();
  if (userContext?.firstName || userContext?.lastName) {
    const name = [userContext.firstName, userContext.lastName].filter(Boolean).join(' ');
    systemInstruction = `[Current user: ${name}]\n\nAddress the user by name (${name}) in your first message and when appropriate.\n\n${systemInstruction}`;
  }
  const model = genAI.getGenerativeModel({
    model: MODEL,
    tools: [{ functionDeclarations: CSV_TOOL_DECLARATIONS }],
  });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        {
          role: 'user',
          parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }],
        },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  // Include column names so the model can match user intent to exact column names
  const msgWithContext = csvHeaders?.length
    ? `[CSV columns: ${csvHeaders.join(', ')}]\n\n${newMessage}`
    : newMessage;

  let response = (await chat.sendMessage(msgWithContext)).response;

  // Accumulate chart payloads and a log of every tool call made
  const charts = [];
  const toolCalls = [];

  // Function-calling loop (Gemini may chain multiple tool calls)
  for (let round = 0; round < 5; round++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p) => p.functionCall);
    if (!funcCall) break;

    const { name, args } = funcCall.functionCall;
    console.log('[CSV Tool]', name, args);
    const toolResult = executeFn(name, args);
    console.log('[CSV Tool result]', toolResult);

    // Log the call for persistence
    toolCalls.push({ name, args, result: toolResult });

    // Capture chart payloads so the UI can render them
    if (toolResult?._chartType) {
      charts.push(toolResult);
    }

    response = (
      await chat.sendMessage([
        { functionResponse: { name, response: { result: toolResult } } },
      ])
    ).response;
  }

  return { text: response.text() || 'Sorry, I could not complete that request. Please try again.', charts, toolCalls };
};

// ── Retry helper for 429 / rate-limit errors ──────────────────────────────────
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err.message?.includes('429') || err.status === 429;
      if (is429 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1500; // 1.5s → 3s → 6s
        console.warn(`[Gemini] 429 rate limit — retrying in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// ── Function-calling chat for YouTube / JSON tools ───────────────────────────
// executeFn(toolName, args) → plain JS object or Promise (for generateImage)
// Intent-based tool filtering: only give Gemini the tools relevant to the user's request
// so history from previous tool calls doesn't bias the model to pick the wrong tool.
const PLOT_INTENT = /\b(plot|graph|chart|visualiz|trend)\b/i;
const PLAY_INTENT = /\b(play|open|watch)\b.*\b(video|clip)\b/i;
const STATS_INTENT = /\b(stat|average|mean|median|std|min|max|distribution|summary)\b/i;
const IMAGE_INTENT = /\b(generate|create|make|draw|design)\b.*\b(image|picture|photo|illustration|artwork|poster|thumbnail)\b/i;

// Mandatory instruction appended to the message when a single tool is forced
const TOOL_INSTRUCTIONS = {
  play_video: 'REQUIRED: Call the play_video function to display the video card. Do not describe the video in text.',
  plot_metric_vs_time: 'REQUIRED: Call the plot_metric_vs_time function to display the chart. Do not list the data in text.',
  compute_stats_json: 'REQUIRED: Call the compute_stats_json function to return the statistics.',
  generateImage: 'REQUIRED: Call the generateImage function to generate the image.',
};

function filterToolsByIntent(message) {
  const wantPlot = PLOT_INTENT.test(message);
  const wantPlay = PLAY_INTENT.test(message);
  const wantStats = STATS_INTENT.test(message);
  const wantImage = IMAGE_INTENT.test(message);

  // If a clear single intent is detected, return only the matching tools
  const intents = [wantPlot, wantPlay, wantStats, wantImage].filter(Boolean).length;
  if (intents === 1) {
    const names = [];
    if (wantPlot) names.push('plot_metric_vs_time');
    if (wantPlay) names.push('play_video');
    if (wantStats) names.push('compute_stats_json');
    if (wantImage) names.push('generateImage');
    return YOUTUBE_TOOL_DECLARATIONS.filter((t) => names.includes(t.name));
  }
  // Ambiguous or no clear intent → give all tools
  return YOUTUBE_TOOL_DECLARATIONS;
}

export const chatWithYoutubeTools = async (
  history,
  newMessage,
  jsonContext,
  executeFn,
  userContext = null
) => {
  let systemInstruction = await loadSystemPrompt();
  if (userContext?.firstName || userContext?.lastName) {
    const name = [userContext.firstName, userContext.lastName].filter(Boolean).join(' ');
    systemInstruction = `[Current user: ${name}]\n\nAddress the user by name (${name}) in your first message and when appropriate.\n\n${systemInstruction}`;
  }
  const filteredTools = filterToolsByIntent(newMessage);
  const forceSingleTool = filteredTools.length === 1;

  const modelConfig = {
    model: MODEL,
    tools: [{ functionDeclarations: filteredTools }],
  };
  // When intent maps to exactly one tool, force Gemini to call it (prevents text-only answers)
  if (forceSingleTool) {
    modelConfig.toolConfig = {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [filteredTools[0].name],
      },
    };
  }
  const model = genAI.getGenerativeModel(modelConfig);

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        {
          role: 'user',
          parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }],
        },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  const videoCount = jsonContext?.videos?.length || 0;
  const toolHint = forceSingleTool ? `\n\n${TOOL_INSTRUCTIONS[filteredTools[0].name]}` : '';
  const msgWithContext = (videoCount
    ? `[YouTube channel JSON loaded: ${jsonContext.channel_name || 'Channel'}, ${videoCount} videos. Fields: ${Object.keys(jsonContext.videos[0] || {}).join(', ')}]\n\n${newMessage}`
    : newMessage) + toolHint;

  let response = (await withRetry(() => chat.sendMessage(msgWithContext))).response;

  const charts = [];
  const toolCalls = [];

  for (let round = 0; round < 5; round++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCallPart = parts.find((p) => p.functionCall);
    if (!funcCallPart) break;

    const { name, args } = funcCallPart.functionCall;
    console.log('[YouTube Tool]', name, args);
    let toolResult = executeFn(name, args);
    if (toolResult && typeof toolResult.then === 'function') {
      toolResult = await toolResult;
    }
    console.log('[YouTube Tool result]', toolResult);

    toolCalls.push({ name, args, result: toolResult });

    if (toolResult?._chartType) {
      charts.push(toolResult);
    }

    // Strip large payloads (base64 images, chart data arrays) before sending back to Gemini
    let geminiResult = toolResult;
    if (toolResult?._chartType === 'generatedImage') {
      geminiResult = { success: true, message: 'Image generated and displayed in chat.' };
    } else if (toolResult?._chartType === 'metric_vs_time') {
      geminiResult = { success: true, message: `Chart for ${toolResult.metric} displayed in chat.`, dataPoints: toolResult.data?.length || 0 };
    } else if (toolResult?._chartType === 'play_video') {
      geminiResult = { success: true, message: `Video card displayed: "${toolResult.title}"`, video_url: toolResult.video_url };
    }

    if (forceSingleTool) {
      // The initial model uses mode:'ANY' which forces a tool call on EVERY turn.
      // Switch to a tool-free model for the follow-up so Gemini returns text, not another tool call.
      const replyModel = genAI.getGenerativeModel({ model: MODEL });
      const replyHistory = [
        ...chatHistory,
        { role: 'user', parts: [{ text: msgWithContext }] },
        { role: 'model', parts: [funcCallPart] },
      ];
      const replyChat = replyModel.startChat({ history: replyHistory });
      response = (
        await withRetry(() =>
          replyChat.sendMessage([{ functionResponse: { name, response: { result: geminiResult } } }])
        )
      ).response;
      break; // Only one tool call needed in forced mode
    }

    response = (
      await withRetry(() =>
        chat.sendMessage([{ functionResponse: { name, response: { result: geminiResult } } }])
      )
    ).response;
  }

  const rawText = response.text();
  if (rawText) return { text: rawText, charts, toolCalls };

  // Gemini returned empty text — provide a context-aware fallback
  if (charts.length > 0) {
    const c = charts[0];
    if (c._chartType === 'metric_vs_time') return { text: `Here's the ${c.metric} chart for the channel's videos.`, charts, toolCalls };
    if (c._chartType === 'play_video') return { text: '', charts, toolCalls };
    if (c._chartType === 'generatedImage') return { text: "Here's your generated image!", charts, toolCalls };
    return { text: '', charts, toolCalls };
  }
  return { text: 'Sorry, I could not complete that request. Please try again.', charts, toolCalls };
};
