/**
 * Custom Jest resolver to handle ESM .js extension imports from @noble and @scure packages
 */
module.exports = (path, options) => {
  // Only strip .js extension for @noble and @scure packages
  const esmPackages = ['@noble/', '@scure/'];
  const isEsmPackage = esmPackages.some((pkg) => path.startsWith(pkg));

  if (isEsmPackage && path.endsWith('.js')) {
    const strippedPath = path.slice(0, -3);
    try {
      return options.defaultResolver(strippedPath, options);
    } catch {
      // If stripping .js fails, try the original path
    }
  }

  return options.defaultResolver(path, options);
};
