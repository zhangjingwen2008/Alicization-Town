const { BaseAIClient } = require('./base-client');

/**
 * Claude-compatible API client.
 * Works with Anthropic Claude API and Claude-compatible endpoints.
 */
class ClaudeClient extends BaseAIClient {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseURL = config.baseURL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
    this.model = config.model || process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
    this.maxTokens = config.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 500;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async generate({ system, messages, tools, temperature = 0.7 }) {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Claude requires alternating user/assistant messages
    const formattedMessages = this._formatMessages(messages);

    const requestBody = {
      model: this.model,
      system,
      messages: formattedMessages,
      temperature,
      max_tokens: this.maxTokens,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = this._formatTools(tools);
      requestBody.tool_choice = { type: 'auto' };
    }

    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.content.find(c => c.type === 'text')?.text || '',
      toolCalls: data.content
        .filter(c => c.type === 'tool_use')
        .map(c => ({
          id: c.id,
          name: c.name,
          arguments: c.input,
        })),
      usage: { input: data.usage.input_tokens, output: data.usage.output_tokens },
    };
  }

  _formatMessages(messages) {
    // Claude requires messages to alternate user/assistant
    const formatted = [];
    let lastRole = null;

    for (const msg of messages) {
      let role = msg.role === 'assistant' ? 'assistant' : 'user';

      // Merge consecutive same-role messages
      if (lastRole === role && formatted.length > 0) {
        formatted[formatted.length - 1].content += '\n' + msg.content;
      } else {
        formatted.push({ role, content: msg.content });
        lastRole = role;
      }
    }

    // Ensure first message is from user
    if (formatted.length > 0 && formatted[0].role !== 'user') {
      formatted.unshift({ role: 'user', content: '(等待中...)' });
    }

    return formatted;
  }

  _formatTools(tools) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  getModelName() {
    return `claude:${this.model}`;
  }
}

module.exports = { ClaudeClient };
