/**
 * Abstract AI Client Interface
 * All AI providers must implement this interface.
 */
class BaseAIClient {
  /**
   * @param {Object} config - Provider-specific configuration
   */
  constructor(config) {
    if (new.target === BaseAIClient) {
      throw new Error('BaseAIClient is abstract and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Generate a completion from the AI model.
   * @param {Object} params
   * @param {string} params.system - System prompt
   * @param {Array<{role: string, content: string}>} params.messages - Conversation history
   * @param {Array} [params.tools] - Available tools/functions
   * @param {number} [params.temperature] - Sampling temperature
   * @returns {Promise<{content: string, toolCalls: Array, usage?: Object}>}
   */
  async generate({ system, messages, tools, temperature }) {
    throw new Error('generate() must be implemented by subclass');
  }

  /**
   * Get the model name for logging/debugging.
   * @returns {string}
   */
  getModelName() {
    throw new Error('getModelName() must be implemented by subclass');
  }

  /**
   * Check if the client is properly configured.
   * @returns {boolean}
   */
  isConfigured() {
    return false;
  }
}

module.exports = { BaseAIClient };
