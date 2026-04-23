/* eslint-disable @typescript-eslint/no-require-imports, n/no-unsupported-features/node-builtins */

if (process.versions.bun) {
  const nodeModule = require('node:module');
  const vm = require('node:vm');

  const modulePrototypeDescriptor = Object.getOwnPropertyDescriptor(
    nodeModule.Module,
    'prototype',
  );

  if (modulePrototypeDescriptor?.enumerable) {
    Object.defineProperty(nodeModule.Module, 'prototype', {
      ...modulePrototypeDescriptor,
      enumerable: false,
    });
  }

  if (typeof vm.SyntheticModule === 'function') {
    Object.defineProperty(vm, 'SyntheticModule', {
      configurable: true,
      enumerable: false,
      value: undefined,
      writable: true,
    });
  }
}
