const http = require('http');
const https = require('https');
const { LOCAL_CANDIDATES } = require('./config');

function requestJson(baseUrl, method, apiPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, baseUrl);
    const isHttps = url.protocol === 'https:';
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      timeout: 10_000,
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = {};
        if (data) {
          try {
            parsed = JSON.parse(data);
          } catch {
            reject(new Error(`无法解析响应: ${data}`));
            return;
          }
        }

        if (res.statusCode >= 400) {
          const message = parsed && parsed.error ? parsed.error : `HTTP ${res.statusCode}`;
          const error = new Error(message);
          error.statusCode = res.statusCode;
          error.payload = parsed;
          reject(error);
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', (error) => reject(new Error(`连接失败: ${error.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('连接超时'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function probeServer(baseUrl) {
  await requestJson(baseUrl, 'GET', '/api/characters');
  return baseUrl;
}

async function discoverServer(explicitServer) {
  const seen = new Set();
  const candidates = [
    explicitServer || null,
    process.env.SERVER_URL || null,
    ...LOCAL_CANDIDATES,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      await probeServer(candidate);
      return candidate;
    } catch {}
  }

  throw new Error('未找到可用服务器。请先启动世界服务，或通过 SERVER_URL 指定地址。');
}

module.exports = {
  requestJson,
  discoverServer,
};
