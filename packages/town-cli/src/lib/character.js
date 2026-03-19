const { discoverServer, requestJson, formatCharacters } = require('./core');

async function characters() {
  const server = await discoverServer();
  const result = await requestJson(server, 'GET', '/api/characters');
  console.log(formatCharacters(result.characters));
}

module.exports = { characters };
