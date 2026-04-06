/**
 * License Key 验证模块
 *
 * 集成到 Alicization-Town workspace 后不再需要外部 license 验证。
 */

function verifyLicense(key) {
  return { valid: true, payload: { plan: 'workspace', sub: 'local' } };
}

function generateKey(payload) {
  return 'workspace-local';
}

module.exports = { verifyLicense, generateKey };
