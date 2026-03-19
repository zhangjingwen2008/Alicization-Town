const { runAuthenticated, formatLook, formatMap } = require('./core');

function throwForAuth(auth) {
  if (!auth) return;
  throw new Error(auth.message || '当前无法执行该操作，请先 login。');
}

async function look() {
  const { auth, result } = await runAuthenticated('GET', '/api/look');
  if (!result) throwForAuth(auth);
  console.log(formatLook(result));
}

async function map() {
  const { auth, result } = await runAuthenticated('GET', '/api/map');
  if (!result) throwForAuth(auth);
  console.log(formatMap(result.directory));
}

module.exports = { look, map };
