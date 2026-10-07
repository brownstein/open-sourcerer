// Browser-compatible shim for @babel/core.
//
// The @babel/plugin-* packages import from @babel/core at runtime for types,
// helpers, parser, etc. The full @babel/core package pulls in config-loading
// code that uses Node.js APIs (process, path, fs) which fails in the browser.
//
// This shim provides the specific sub-packages that plugins actually use.
// These are all pure JavaScript with no Node.js dependencies.
//
// The resolve alias in vite.config.ts maps @babel/core to this file only
// during Vite builds — Jest and Node.js scripts continue to use the real
// @babel/core unaffected.

import * as _types from "@babel/types";
import _template from "@babel/template";
import _traverse from "@babel/traverse";
import { parse as _parse } from "@babel/parser";

export const types = _types;
export const template = _template;
export const traverse = _traverse;
export const parse = _parse;
