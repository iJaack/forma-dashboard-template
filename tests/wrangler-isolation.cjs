// Preloaded only in the e2e test's Wrangler children. Older/global Wrangler state
// must never override the isolated XDG directory, even when a legacy folder exists.
const os = require('node:os');
const { syncBuiltinESMExports } = require('node:module');
const net = require('node:net');
const tls = require('node:tls');
if (!process.env.FORMA_TEST_CONFIG_HOME) throw new Error('Missing test config home');
os.homedir = () => process.env.FORMA_TEST_CONFIG_HOME;
function localOnly(args) {
  if (Array.isArray(args[0])) return localOnly(args[0]);
  const options = typeof args[0] === 'object' ? args[0] : null;
  if (options?.path || (typeof args[0] === 'string' && !/^\d+$/.test(args[0]))) return;
  const host = options?.host || options?.hostname || (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (!['localhost', '::1', '[::1]', '0.0.0.0'].includes(host) && !/^127(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error('Offline integration test blocked an external connection');
  }
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { localOnly(args); return connect.apply(this, args); };
const secureConnect = tls.connect;
tls.connect = function (...args) { localOnly(args); return secureConnect.apply(this, args); };
syncBuiltinESMExports();
