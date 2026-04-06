const { BaseAIClient } = require('./base-client');

/**
 * OpenAI-compatible API client.
 * Works with OpenAI, Azure OpenAI, and other OpenAI-compatible endpoints.
 */
class OpenAIClient extends BaseAIClient {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.baseURL = config.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    this.model = config.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.maxTokens = config.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 500;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async generate({ system, messages, tools, temperature = 0.7 }) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
      temperature,
      max_tokens: this.maxTokens,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = this._formatTools(tools);
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message.content || '',
      toolCalls: (choice.message.tool_calls || []).map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments,
      })),
      usage: data.usage,
    };
  }

  _formatTools(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  getModelName() {
    return `openai:${this.model}`;
  }
}

module.exports = { OpenAIClient };
