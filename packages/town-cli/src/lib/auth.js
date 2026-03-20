const { login, logoutProfile, listProfiles, stringifyResult, formatLogin, formatProfilesList, parseFlags } = require('./core');

async function loginCommand(args) {
  const flags = parseFlags(args);
  const result = await login({
    profile: flags.profile,
    create: Boolean(flags.create),
    name: flags.name,
    sprite: flags.sprite,
    server: flags.server,
  });
  console.log(formatLogin(result));
}

function listProfileCommand() {
  console.log(formatProfilesList(listProfiles()));
}

async function logoutCommand(args) {
  const flags = parseFlags(args);
  const result = await logoutProfile(flags.profile);
  console.log(stringifyResult(result));
}

module.exports = {
  login: loginCommand,
  logout: logoutCommand,
  listProfile: listProfileCommand,
};
