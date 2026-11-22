// Defence in depth, not a CSP boundary. Never retain URLs or request arguments.
export function neutralizeWorkerNetwork(scope) {
  const attempts = {};
  const deny = name => {
    attempts[name] = 0;
    return function () { attempts[name]++; throw new Error('Network access is disabled in the provenance verifier.'); };
  };
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts']) {
    Object.defineProperty(scope, name, { value: deny(name), writable: false, configurable: false });
  }
  if (!scope.navigator) Object.defineProperty(scope, 'navigator', { value: {} });
  Object.defineProperty(scope.navigator, 'sendBeacon', { value: deny('sendBeacon'), writable: false, configurable: false });
  return attempts;
}
