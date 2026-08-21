// The assistant layer: which LLM APIs it can use, how to address them, what it
// is allowed to do, and which questions never need one.
// Transport and tool execution live in the app — this package stays pure.
export * from './providers.js';
export * from './tools.js';
export * from './messages.js';
export * from './intents.js';
export * from './prompt.js';
export * from './session.js';
export * from './markdown.js';
