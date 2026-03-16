/**
 * patcher.js — Direct FFI patcher using cslol-dll.dll
 * 
 * Replicates ltk-manager's legacy_patcher/runner.rs approach:
 * Load cslol-dll.dll directly via FFI and call the C API.
 * 
 * This REPLACES mod-tools.exe runoverlay which has the C0000229 error.
 * mod-tools.exe mkoverlay is still used for building overlays.
 * 
 * API (from cslol-api.h / cslol-patcher-legacy):
 *   cslol_init()                        -> const char* (null = success)
 *   cslol_set_config(prefix: wchar*)    -> const char* (null = success)
 *   cslol_set_flags(flags: uint64)      -> const char* (null = success)
 *   cslol_set_log_level(level: uint64)  -> const char* (null = success)
 *   cslol_find()                        -> uint32 (thread id, 0 = not found)
 *   cslol_hook(tid, timeout, step)      -> const char* (null = success)
 *   cslol_log_pull()                    -> const char* (null = no message)
 */

const koffi = require('koffi');
const path = require('path');

// Log levels matching cslol-api.h
const CSLOL_LOG_ERROR = 0x0;
const CSLOL_LOG_INFO = 0x10;
const CSLOL_LOG_DEBUG = 0x20;
const CSLOL_LOG_ALL = 0x1000;

class CslolPatcher {
    constructor(dllPath) {
        this.dllPath = dllPath;
        this.lib = null;
        this.running = false;
        this.stopRequested = false;
        this.pollInterval = null;
        this.statusCallback = null;
        this.stateCallback = null;
        this.logCallback = null;

        // FFI function pointers
        this._cslol_init = null;
        this._cslol_set_config = null;
        this._cslol_set_flags = null;
        this._cslol_set_log_level = null;
        this._cslol_find = null;
        this._cslol_hook = null;
        this._cslol_log_pull = null;
    }

    setStatusCallback(cb) { this.statusCallback = cb; }
    setStateCallback(cb) { this.stateCallback = cb; }
    setLogCallback(cb) { this.logCallback = cb; }

    _status(msg) {
        if (this.statusCallback) this.statusCallback(msg);
        if (this.logCallback) this.logCallback(msg);
    }

    _setState(state) {
        if (this.stateCallback) this.stateCallback(state);
    }

    /**
     * Load the DLL and resolve all function pointers.
     * Same approach as ltk-manager's PatcherApi::load()
     */
    _loadDll() {
        if (this.lib) return; // Already loaded

        this._status('Loading cslol-dll.dll...');

        this.lib = koffi.load(this.dllPath);

        // Define function signatures matching cslol-api.h
        // const char* cslol_init()
        this._cslol_init = this.lib.func('cslol_init', 'str', []);

        // const char* cslol_set_config(const char16_t* prefix)
        // koffi uses 'str16' for wchar_t*/char16_t*
        this._cslol_set_config = this.lib.func('cslol_set_config', 'str', ['str16']);

        // const char* cslol_set_flags(uint64 flags)
        this._cslol_set_flags = this.lib.func('cslol_set_flags', 'str', ['uint64']);

        // const char* cslol_set_log_level(uint64 level)
        this._cslol_set_log_level = this.lib.func('cslol_set_log_level', 'str', ['uint64']);

        // unsigned cslol_find()
        this._cslol_find = this.lib.func('cslol_find', 'uint32', []);

        // const char* cslol_hook(unsigned tid, unsigned timeout, unsigned step)
        this._cslol_hook = this.lib.func('cslol_hook', 'str', ['uint32', 'uint32', 'uint32']);

        // const char* cslol_log_pull()
        this._cslol_log_pull = this.lib.func('cslol_log_pull', 'str', []);

        this._status('cslol-dll.dll loaded successfully');
    }

    /**
     * Run the patcher loop.
     * Replicates ltk-manager's run_legacy_patcher_loop():
     *   1. Load the DLL
     *   2. cslol_init()
     *   3. cslol_set_config(overlayPath)  
     *   4. cslol_find() loop — wait for League
     *   5. cslol_hook(tid, timeout, step)
     *   6. cslol_log_pull() loop — wait for game exit
     * 
     * @param {string} overlayPath — path to the profile overlay directory (e.g. profiles/Default Profile/)
     */
    async run(overlayPath) {
        if (this.running) return;
        this.running = true;
        this.stopRequested = false;

        try {
            // Step 1: Load DLL
            this._loadDll();

            // Step 2: Initialize
            // CSLOL_HOOK_DISABLE_VERIFY = 1 — skip patch_CRYPTO_free which
            // scans game memory for byte patterns. Wrong patterns crash the game.
            // Keep CreateFileA hook only (for WAD file redirection).
            let err = this._cslol_set_flags(1n);
            if (err) throw new Error('cslol_set_flags failed: ' + err);

            err = this._cslol_init();
            if (err) throw new Error('cslol_init failed: ' + err);

            // Ensure trailing separator on the overlay path.
            // From ltk-manager patcher.rs line 217:
            //   "Legacy patcher concatenates the prefix directly with filenames
            //    like DATA/FINAL/... without adding a separator. Ensure trailing backslash."
            let configPath = overlayPath.replace(/\\/g, '/');
            if (!configPath.endsWith('/') && !configPath.endsWith('\\')) {
                configPath += '/';
            }
            this._status('Setting config: ' + configPath);
            err = this._cslol_set_config(configPath);
            if (err) throw new Error('cslol_set_config failed: ' + err);

            err = this._cslol_set_log_level(CSLOL_LOG_INFO);
            if (err) throw new Error('cslol_set_log_level failed: ' + err);

            this._setState('running');
            this._status('Status: Waiting for league match to start');

            // Step 3: Find game — poll until League window appears
            const tid = await this._waitForGame();
            if (!tid) {
                this._status('Patcher stopped');
                return;
            }

            this._status('Status: Found League (thread ' + tid + ')');

            // Step 4: Hook — inject the DLL into the game
            this._status('Applying hook...');
            err = this._cslol_hook(tid, 300000, 100); // 5 min timeout, 100ms step
            if (err) throw new Error('cslol_hook failed: ' + err);

            this._status('Hook applied successfully!');

            // Step 5: Monitor — pull logs and wait for game exit
            await this._waitForGameExit(tid);

            this._status('Game exited');
        } catch (e) {
            this._status('Patcher error: ' + (e.message || e));
            throw e;
        } finally {
            this.running = false;
            this._setState('idle');
        }
    }

    /**
     * Poll cslol_find() until a game thread is found or stop is requested.
     */
    _waitForGame() {
        return new Promise((resolve) => {
            const check = () => {
                if (this.stopRequested) {
                    resolve(0);
                    return;
                }

                // Pull any log messages
                this._pullLogs();

                const tid = this._cslol_find();
                if (tid !== 0) {
                    resolve(tid);
                    return;
                }

                // Poll every 100ms — same as ltk-manager
                setTimeout(check, 100);
            };
            check();
        });
    }

    /**
     * Wait for the game to exit by polling cslol_find().
     */
    _waitForGameExit(originalTid) {
        return new Promise((resolve) => {
            this._status('Status: Waiting for exit');
            const check = () => {
                if (this.stopRequested) {
                    resolve();
                    return;
                }

                // Pull log messages from the DLL
                this._pullLogs();

                const currentTid = this._cslol_find();
                if (currentTid !== originalTid) {
                    resolve();
                    return;
                }

                // Poll every 1000ms — same as legacy patcher
                setTimeout(check, 1000);
            };
            check();
        });
    }

    /**
     * Pull all available log messages from the DLL.
     */
    _pullLogs() {
        try {
            let msg;
            while ((msg = this._cslol_log_pull()) !== null) {
                this._status('[DLL] ' + msg);
            }
        } catch (e) {
            // log_pull might not be available in all DLL versions
        }
    }

    /**
     * Request the patcher to stop.
     */
    stop() {
        this.stopRequested = true;
    }

    /**
     * Check if the patcher is currently running.
     */
    isRunning() {
        return this.running;
    }
}

module.exports = CslolPatcher;
