// Fixture-only adapter for legacy tool dependencies. Production plugins consume
// host-provided public capabilities; no privileged context fallback is installed.
export function fixtureCapability(services) {
  const names = {
    'data.messages': 'store', 'data.memory': 'memory', 'data.sessions': 'sessions',
    'data.reminders': 'reminders', 'data.stickers': 'stickers', 'core.send': 'send',
    'web.search': 'webSearch', 'process.mcp': 'mcp', 'compat04.http': 'compat',
  };
  return (name, ...args) => {
    if (name === 'host.config') return { get: () => typeof services.cfg === 'function' ? services.cfg() : services.cfg ?? {} };
    if (name === 'host.feedback') return { report: (payload) => services.bus?.emit('feedback', payload) };
    if (name === 'transport.actions') return services.transport?.actions;
    if (name === 'media.reader') return typeof services.mediaReader === 'function' ? services.mediaReader() : services.mediaReader;
    if (name === 'extensions.state') return { isActive: (id) => services.loader?.isActive(id) === true };
    return names[name] ? services[names[name]] : services.capability?.consume(name, ...args);
  };
}
