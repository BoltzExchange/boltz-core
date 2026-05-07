/**
 * Custom Jest resolver to handle ESM .js extension imports.
 * Strips .js for @noble/@scure packages and relative source imports
 * (where the actual file is .ts and the .js is only for ESM compat).
 */
module.exports = (path, options) => {
  const esmPackages = ['@noble/', '@scure/'];
  const isEsmPackage = esmPackages.some((pkg) => path.startsWith(pkg));
  const isRelative = path.startsWith('./') || path.startsWith('../');

  if ((isEsmPackage || isRelative) && path.endsWith('.js')) {
    const strippedPath = path.slice(0, -3);
    try {
      return options.defaultResolver(strippedPath, options);
    } catch {
      // If stripping .js fails, try the original path
    }
  }

  return options.defaultResolver(path, options);
};
