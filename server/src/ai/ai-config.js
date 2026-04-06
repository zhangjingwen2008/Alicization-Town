/**
 * AI NPC Configuration
 *
 * Environment Variables:
 *   ALICIZATION_AI_NPC_ENABLED    - Enable/disable AI NPCs (default: true)
 *   AI_PROVIDER                   - Provider: 'openai' or 'claude' (default: openai)
 *   OPENAI_API_KEY                - OpenAI API key
 *   OPENAI_BASE_URL               - Custom OpenAI-compatible endpoint
 *   OPENAI_MODEL                  - Model name (default: gpt-4o-mini)
 *   ANTHROPIC_API_KEY             - Anthropic API key
 *   ANTHROPIC_BASE_URL            - Custom Claude-compatible endpoint
 *   ANTHROPIC_MODEL               - Model name (default: claude-3-haiku-20240307)
 *   AI_MAX_TOKENS                 - Max response tokens (default: 500)
 *   AI_TEMPERATURE                - Response temperature (default: 0.7)
 *   AI_TICK_INTERVAL_MIN          - Min action interval ms (default: 5000)
 *   AI_TICK_INTERVAL_MAX          - Max action interval ms (default: 10000)
 *   AI_HEARTBEAT_INTERVAL         - Heartbeat refresh interval ms (default: 10000)
 *   AI_RESPONSE_TIMEOUT           - AI response timeout ms (default: 15000)
 */

const aiConfig = {
  enabled: process.env.ALICIZATION_AI_NPC_ENABLED !== 'false',

  provider: process.env.AI_PROVIDER || 'openai',

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
  },

  generation: {
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
  },

  scheduler: {
    tickIntervalMin: parseInt(process.env.AI_TICK_INTERVAL_MIN) || 5000,
    tickIntervalMax: parseInt(process.env.AI_TICK_INTERVAL_MAX) || 10000,
    heartbeatInterval: parseInt(process.env.AI_HEARTBEAT_INTERVAL) || 10000,
    responseTimeout: parseInt(process.env.AI_RESPONSE_TIMEOUT) || 15000,
  },
};

module.exports = { aiConfig };
