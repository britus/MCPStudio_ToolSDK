// ===================================================================
//  bootstrap.js
//  MCPStudio – JavaScript Pre-Processor / Module Loader
//
//  Implements a Node.js-compatible require() system for JavaScriptCore
//  (JSContext). Runs inside EoF MCP Studio before any plugin
//  script is evaluated.
//
//  Supported boot-strapping:
//    require('dotenv').config({ path: './.env' });
//    const shared      = require('./manager/shared');
//    const payment     = require('./manager/payment');
//    const product     = require('./manager/product');
//    const prices      = require('./manager/prices');
//    const paymentLink = require('./manager/paymentLink');
//    const inApp       = require('./manager/inApp');
//    const payout      = require('./manager/payout');
//    const mailer      = require('./mailer').emailSender;
//
//  MCPStudio bridge dependency:
//    MCPStudio.readFile(path)   – returns file content or null
//    MCPStudio.fileExists(path) – returns bool
//    MCPStudio.log(type, code, message)
// ===================================================================

(function (globalScope) {
    'use strict';

    //  Internal module registry 
    // key: resolved absolute path  -  value: cached module.exports
    var _moduleCache = {};

    //  Built-in / virtual module stubs 
    // Modules that have no real file on disk but must not throw.
    var _builtins = {};

    //  dotenv stub 
    // Reads KEY=VALUE pairs from the .env file through the MCPStudio bridge
    // and injects them into a synthetic `process.env` object.
    _builtins['dotenv'] = {
        config: function (options) {
            var envPath = (options && options.path) ? options.path : './.env';
            var envPath = _resolvePath('', envPath);

            if (!MCPStudio.fileExists(envPath)) {
                MCPStudio.log('warning', -10, '[PreProcessor] dotenv: file not found: ' + envPath);
                return { parsed: {} };
            }

            var raw = MCPStudio.readFile(envPath);
            if (!raw) {
                MCPStudio.log('warning', -10, '[PreProcessor] dotenv: could not read: ' + envPath);
                return { parsed: {} };
            }

            var parsed = {};
            raw.split('\n').forEach(function (line) {
                // Strip comments and blank lines
                var trimmed = line.trim();
                if (!trimmed || trimmed.charAt(0) === '#') { return; }

                var eqIdx = trimmed.indexOf('=');
                if (eqIdx < 1) { return; }

                var key   = trimmed.substring(0, eqIdx).trim();
                var value = trimmed.substring(eqIdx + 1).trim();

                // Strip surrounding quotes (' or ")
                if (value.length >= 2) {
                    var first = value.charAt(0);
                    var last  = value.charAt(value.length - 1);
                    if ((first === '"' && last === '"') ||
                        (first === "'" && last === "'")) {
                        value = value.substring(1, value.length - 1);
                    }
                }

                parsed[key] = value;
            });

            // Merge into process.env (non-destructive – real env wins)
            Object.keys(parsed).forEach(function (k) {
                if (!globalScope.process.env.hasOwnProperty(k)) {
                    globalScope.process.env[k] = parsed[k];
                }
            });

            return { parsed: parsed };
        }
    };

    //  Path helpers 

    /**
     * Normalises a path string: collapses '..', removes double slashes.
     * Does NOT access the file system.
     */
    function _normalisePath(path) {
        var parts  = path.split('/');
        var result = [];
        parts.forEach(function (part) {
            if (part === '..') {
                result.pop();
            } else if (part !== '.' && part !== '') {
                result.push(part);
            }
        });
        var normalised = result.join('/');
        // Preserve leading slash for absolute paths
        return (path.charAt(0) === '/') ? '/' + normalised : normalised;
    }

    /**
     * Resolves `modulePath` relative to `callerPath` (the directory of
     * the currently executing module).
     *
     * Rules (mirrors Node.js resolution, simplified):
     *  1. Builtin names  - returned as-is (special sentinel)
     *  2. Absolute path  - normalised as-is
     *  3. Relative path  - joined with callerDir then normalised
     *  4. No extension   - '.js' appended
     */
    function _resolvePath(callerPath, modulePath) {
        // Already in builtins registry?
        if (_builtins.hasOwnProperty(modulePath)) {
            return '__builtin__:' + modulePath;
        }

        var absolute;

        if (modulePath.charAt(0) === '/') {
            // Absolute path
            absolute = modulePath;
        } else if (modulePath.charAt(0) === '.') {
            // Relative path – resolve against caller's directory
            var callerDir = callerPath.indexOf('/') !== -1
                ? callerPath.substring(0, callerPath.lastIndexOf('/'))
                : '.';
            absolute = callerDir + '/' + modulePath;
        } else {
            // Bare name that is NOT a builtin - treat as relative to '.'
            // (no node_modules support needed inside JSCore sandbox)
            absolute = './' + modulePath;
        }

        // Append .js if no extension present
        if (absolute.lastIndexOf('.') <= absolute.lastIndexOf('/')) {
            absolute += '.js';
        }

        return _normalisePath(absolute);
    }

    //  Core require() implementation 

    /**
     * Loads, compiles and caches a CommonJS module.
     *
     * @param {string} modulePath  – raw string passed to require()
     * @param {string} callerPath  – resolved path of the calling module
     *                               (empty string for the entry point)
     * @returns module.exports of the loaded module
     */
    function _requireFrom(modulePath, callerPath) {
        var resolved = _resolvePath(callerPath, modulePath);

        //  1. Builtin virtual module 
        if (resolved.indexOf('__builtin__:') === 0) {
            var builtinName = resolved.substring('__builtin__:'.length);
            MCPStudio.log('debug', -1, '[PreProcessor] require builtin: ' + builtinName);
            return _builtins[builtinName];
        }

        //  2. Cache hit 
        if (_moduleCache.hasOwnProperty(resolved)) {
            MCPStudio.log('debug', -1, '[PreProcessor] require cached: ' + resolved);
            return _moduleCache[resolved];
        }

        //  3. Load from disk via MCPStudio bridge 
        if (!MCPStudio.fileExists(resolved)) {
            var msg = '[PreProcessor] Module not found: ' + resolved +
                      ' (required from: ' + (callerPath || '<entry>') + ')';
            MCPStudio.log('error', -20, msg);
            throw new Error(msg);
        }

        var source = MCPStudio.readFile(resolved);
        if (source === null || source === undefined) {
            var msg2 = '[PreProcessor] Could not read module: ' + resolved;
            MCPStudio.log('error', -21, msg2);
            throw new Error(msg2);
        }

        MCPStudio.log('debug', -1, '[PreProcessor] require load: ' + resolved);

        //  4. Compile in a CommonJS wrapper 
        // Wrap in an IIFE that receives (module, exports, require, __filename, __dirname)
        // and returns module.exports – mirrors Node.js module wrapper.
        var moduleObj  = { exports: {} };
        var exportsObj = moduleObj.exports;

        // Build a require() that is scoped to the current module's path
        var localRequire = (function (currentPath) {
            return function (id) {
                return _requireFrom(id, currentPath);
            };
        }(resolved));
        localRequire.resolve = function (id) {
            return _resolvePath(resolved, id);
        };

        var __filename = resolved;
        var __dirname  = resolved.indexOf('/') !== -1
            ? resolved.substring(0, resolved.lastIndexOf('/'))
            : '.';

        // Wrap source in CommonJS module wrapper
        var wrappedSource =
            '(function(module, exports, require, __filename, __dirname) {\n' +
            source + '\n' +
            '})';

        // Pre-register in cache BEFORE evaluation to handle circular deps
        _moduleCache[resolved] = exportsObj;

        try {
            // JSCore evaluates the wrapper expression, returning the function
            var moduleFactory = eval(wrappedSource); // eslint-disable-line no-eval
            moduleFactory(moduleObj, exportsObj, localRequire, __filename, __dirname);
        } catch (e) {
            // Remove from cache on failure so a retry is possible
            delete _moduleCache[resolved];
            MCPStudio.log('error', -22,
                '[PreProcessor] Error executing module ' + resolved + ': ' + e);
            throw e;
        }

        // module.exports may have been replaced (e.g. `module.exports = fn`)
        _moduleCache[resolved] = moduleObj.exports;
        return moduleObj.exports;
    }

    //  process stub 
    // Minimal Node.js process object so dotenv and other modules work.
    if (!globalScope.process) {
        globalScope.process = {
            env: {},
            argv: [],
            exit: function (code) {
                MCPStudio.log('warning', code || 0,
                    '[PreProcessor] process.exit(' + (code || 0) + ') called');
            },
            cwd: function () { return '.'; },
            platform: 'darwin',
            version: 'v18.0.0'
        };
    }

    //  Buffer stub 
    // Very thin shim – enough for modules that check `typeof Buffer`.
    if (!globalScope.Buffer) {
        globalScope.Buffer = {
            from: function (data, encoding) {
                return { data: data, encoding: encoding || 'utf8',
                         toString: function (enc) { return data; } };
            },
            isBuffer: function (obj) { return false; }
        };
    }

    //  setTimeout / setInterval stubs 
    // JSCore has no event loop; provide no-op stubs so modules that
    // reference these at load time don't throw.
    if (!globalScope.setTimeout) {
        globalScope.setTimeout  = function (fn) { fn && fn(); return 0; };
        globalScope.clearTimeout = function () {};
    }
    if (!globalScope.setInterval) {
        globalScope.setInterval  = function () { return 0; };
        globalScope.clearInterval = function () {};
    }

    //  Expose global require() 
    // The entry-point plugin script calls require() at the top level.
    // We expose it on globalScope so it is available without a module
    // wrapper.
    globalScope.require = function (modulePath) {
        return _requireFrom(modulePath, globalScope.__moduleDir || '.');
    };
    globalScope.require.resolve = function (modulePath) {
        return _resolvePath(globalScope.__moduleDir || '.', modulePath);
    };

    //  module / exports shims for the entry-point script 
    // Plugin scripts may use `module.exports = ...` at the top level.
    if (!globalScope.module) {
        globalScope.module  = { exports: {} };
        globalScope.exports = globalScope.module.exports;
    }

    MCPStudio.log('info', 0, '[PreProcessor] Module system initialised. require() is ready.');

}(this)); // `this` is the global JSContext object in JavaScriptCore
