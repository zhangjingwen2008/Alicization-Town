const { OpenAIClient } = require('./openai-client');
const { ClaudeClient } = require('./claude-client');

/**
 * Create an AI client based on configuration.
 * @param {Object} config - Client configuration
 * @param {string} [config.provider] - Provider: 'openai' or 'claude' (default: from env)
 * @param {string} [config.apiKey] - API key (default: from env)
 * @param {string} [config.baseURL] - Custom endpoint URL
 * @param {string} [config.model] - Model name
 * @param {number} [config.maxTokens] - Max response tokens
 * @returns {import('./base-client').BaseAIClient}
 */
function createAIClient(config = {}) {
  const provider = (config.provider || process.env.AI_PROVIDER || 'openai').toLowerCase();

  switch (provider) {
    case 'openai':
    case 'openai-compatible':
      return new OpenAIClient({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
        maxTokens: config.maxTokens,
      });

    case 'claude':
    case 'anthropic':
    case 'claude-compatible':
      return new ClaudeClient({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
        maxTokens: config.maxTokens,
      });

    default:
      throw new Error(`Unknown AI provider: ${provider}. Supported: openai, claude`);
  }
}

/**
 * Validate AI client configuration.
 * @returns {{ valid: boolean, errors: string[], client: import('./base-client').BaseAIClient | null }}
 */
function validateAIClientConfig() {
  const errors = [];
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  }

  if (provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is required when AI_PROVIDER=claude');
  }

  if (errors.length > 0) {
    return { valid: false, errors, client: null };
  }

  try {
    const client = createAIClient();
    return { valid: client.isConfigured(), errors: [], client };
  } catch (err) {
    return { valid: false, errors: [err.message], client: null };
  }
}

module.exports = { createAIClient, validateAIClientConfig };
