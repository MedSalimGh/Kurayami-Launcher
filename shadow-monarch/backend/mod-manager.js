/**
 * mod-manager.js — Backend bridge to cslol-tools
 * 
 * Replicates CSLOLToolsImpl behavior:
 * - Same directory structure (installed/, profiles/)
 * - Same CLI arguments to mod-tools.exe (for mkoverlay, import, export, etc.)
 * - Same mod info format (META/info.json, META/image.png)
 * - Same profile format (.profile text files)
 * 
 * PATCHER: Uses direct FFI to cslol-dll.dll (like ltk-manager's legacy_patcher)
 * instead of mod-tools.exe runoverlay, which has the C0000229 injection error.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const CslolPatcher = require('./patcher');

class ModManager {
    constructor() {
        // prog_ equivalent — the directory where cslol-tools lives
        // This is the parent of the shadow-monarch folder (the cslol-manager release dir)
        this.prog = path.resolve(path.join(__dirname, '..', '..'));
        this.modToolsExe = path.join(this.prog, 'cslol-tools', 'mod-tools.exe');
        this.diagToolExe = path.join(this.prog, 'cslol-tools', 'cslol-diag.exe');

        // Log resolved paths for debugging
        console.log('[ModManager] prog:', this.prog);
        console.log('[ModManager] modToolsExe:', this.modToolsExe);
        console.log('[ModManager] exists:', fs.existsSync(this.modToolsExe));

        this.gamePath = '';
        this.blacklist = true;
        this.ignorebad = false;
        this.state = 'idle'; // 'idle', 'busy', 'running', 'error'
        this.statusCallback = null;
        this.stateCallback = null;

        // FFI Patcher — loads the directly signed cslol-dll.dll
        // Replaces mod-tools.exe runoverlay which has C0000229 error
        // We use the properly signed DLL from cslol-manager release so Vanguard accepts it.
        const dllPath = path.join(this.prog, 'cslol-tools', 'cslol-dll.dll');
        this.cslolPatcher = new CslolPatcher(dllPath);
        console.log('[ModManager] cslol-dll.dll path:', dllPath);
        console.log('[ModManager] cslol-dll.dll exists:', fs.existsSync(dllPath));
        this.statusCallback = null;
        this.stateCallback = null;

        // Config file
        this.configPath = path.join(this.prog, 'config.json');
        this.config = this._loadConfig();

        // Log file — same as original
        this.logPath = path.join(this.prog, 'log.txt');
        this._initLog();
    }

    _initLog() {
        try {
            fs.writeFileSync(this.logPath, `Version: shadow-monarch-1.0.0\n`);
        } catch (e) { }
    }

    _log(msg) {
        try {
            fs.appendFileSync(this.logPath, msg + '\n');
        } catch (e) { }
    }

    _loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
            }
        } catch (e) { }
        return {
            leaguePath: '',
            detectGamePath: true,
            blacklist: true,
            ignorebad: false,
            suppressInstallConflicts: false,
            enableUpdates: true,
            enableAutoRun: false,
            enableSystray: false,
            themeDarkMode: true,
            verbosePatcher: false
        };
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (e) { }
    }

    getConfig() {
        return { ...this.config };
    }

    updateConfig(updates) {
        Object.assign(this.config, updates);
        this.saveConfig();
        if ('leaguePath' in updates) this.gamePath = this._normPath(updates.leaguePath);
        if ('blacklist' in updates) this.blacklist = updates.blacklist;
        if ('ignorebad' in updates) this.ignorebad = updates.ignorebad;
    }

    setStatusCallback(cb) { this.statusCallback = cb; }
    setStateCallback(cb) { this.stateCallback = cb; }

    /**
     * Normalize path to forward slashes — CRITICAL!
     * Qt (the original cslol-manager) uses forward slashes everywhere.
     * mod-tools.exe was built expecting forward slashes.
     * Node.js path.join on Windows uses backslashes which breaks mod-tools.exe.
     */
    _normPath(p) {
        return p.replace(/\\/g, '/');
    }

    _setStatus(msg) {
        msg = String(msg).trim();
        this._log(msg);
        if (!msg.startsWith('[WRN] ') && !msg.startsWith('[DLL] ')) {
            if (this.statusCallback) this.statusCallback(msg);
        }
    }

    _setState(state) {
        if (this.state !== state) {
            this.state = state;
            if (this.stateCallback) this.stateCallback(state);
        }
    }

    // ========== GAME PATH DETECTION ==========
    // Exactly replicates CSLOLUtils::detectGamePath and CSLOLUtils::checkGamePath

    detectGamePath() {
        if (!this.config.detectGamePath) return '';

        // Check common install locations
        const commonPaths = [
            'C:\\Riot Games\\League of Legends',
            'D:\\Riot Games\\League of Legends',
            'C:\\Program Files\\Riot Games\\League of Legends',
            'C:\\Program Files (x86)\\Riot Games\\League of Legends',
            'D:\\Program Files\\Riot Games\\League of Legends',
            'D:\\Program Files (x86)\\Riot Games\\League of Legends',
        ];

        // Try to find from running process or registry
        try {
            const { execSync } = require('child_process');
            // Check if League of Legends.exe is currently running and get its path
            const wmicResult = execSync(
                'wmic process where "name=\'LeagueClient.exe\'" get ExecutablePath /value',
                { encoding: 'utf-8', timeout: 5000, windowsHide: true }
            ).trim();
            const match = wmicResult.match(/ExecutablePath=(.+)/);
            if (match) {
                const clientPath = match[1].trim();
                // Go up to find the Game directory
                const riotDir = path.dirname(clientPath);
                const gamePath = path.join(riotDir, 'Game');
                if (fs.existsSync(path.join(gamePath, 'League of Legends.exe'))) {
                    return gamePath;
                }
            }
        } catch (e) { }

        // Try INSTALLS path from Riot config
        try {
            const localAppData = process.env.LOCALAPPDATA || '';
            const riotConfigPath = path.join(localAppData, 'Riot Games', 'RiotClientInstalls.json');
            if (fs.existsSync(riotConfigPath)) {
                const riotConfig = JSON.parse(fs.readFileSync(riotConfigPath, 'utf-8'));
                // Check associated_client entries
                if (riotConfig.associated_client) {
                    for (const [clientPath,] of Object.entries(riotConfig.associated_client)) {
                        const normalized = clientPath.replace(/\//g, '\\');
                        const gamePath = path.join(path.dirname(normalized), 'Game');
                        if (fs.existsSync(path.join(gamePath, 'League of Legends.exe'))) {
                            return this._normPath(gamePath);
                        }
                    }
                }
                // Fallback: rc_default or rc_live
                const defaultPath = riotConfig.rc_default || riotConfig.rc_live || '';
                if (defaultPath) {
                    const normalized = defaultPath.replace(/\//g, '\\');
                    const riotDir = path.dirname(normalized);
                    const gamePath = path.join(riotDir, 'League of Legends', 'Game');
                    if (fs.existsSync(path.join(gamePath, 'League of Legends.exe'))) {
                        return this._normPath(gamePath);
                    }
                }
            }
        } catch (e) { }

        // Try common paths
        for (const p of commonPaths) {
            const gamePath = path.join(p, 'Game');
            if (fs.existsSync(path.join(gamePath, 'League of Legends.exe'))) {
                return this._normPath(gamePath);
            }
            if (fs.existsSync(path.join(p, 'League of Legends.exe'))) {
                return this._normPath(p);
            }
        }

        return '';
    }

    checkGamePath(gamePath) {
        if (!gamePath) return '';
        const exePath = path.join(gamePath, 'League of Legends.exe');
        if (fs.existsSync(exePath)) {
            return this._normPath(gamePath);
        }
        return '';
    }

    checkGamePathAsia(gamePath) {
        // Check for Asian server indicators — replicate CSLOLUtils::checkGamePathAsia
        try {
            const configPath = path.join(gamePath, '..', 'Config', 'LeagueClientSettings.yaml');
            if (fs.existsSync(configPath)) {
                const config = fs.readFileSync(configPath, 'utf-8');
                if (config.includes('region: "KR"') || config.includes('region: "JP"') ||
                    config.includes('region: "TW"') || config.includes('region: "VN"') ||
                    config.includes('region: "SG"') || config.includes('region: "PH"') ||
                    config.includes('region: "TH"')) {
                    return true;
                }
            }
        } catch (e) { }
        return false;
    }

    // ========== MOD OPERATIONS ==========
    // Exactly replicates CSLOLToolsImpl mod functions

    /** List all installed mods — same as CSLOLToolsImpl::modList() */
    modList() {
        const result = [];
        const installedDir = path.join(this.prog, 'installed');
        if (!fs.existsSync(installedDir)) {
            fs.mkdirSync(installedDir, { recursive: true });
            return result;
        }
        const entries = fs.readdirSync(installedDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name.endsWith('.tmp')) continue;
            const metaPath = path.join(installedDir, entry.name, 'META', 'info.json');
            if (!fs.existsSync(metaPath)) continue;
            result.push(entry.name);
        }
        result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        return result;
    }

    /** Read mod info — same as CSLOLToolsImpl::modInfoRead() */
    modInfoRead(modName) {
        const filePath = path.join(this.prog, 'installed', modName, 'META', 'info.json');
        let obj = {};
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            obj = JSON.parse(data);
        } catch (e) { }
        return this._modInfoFixup(modName, obj);
    }

    /** Fixup mod info — exact replica of modInfoFixup() */
    _modInfoFixup(modName, obj) {
        if (!obj.Name || typeof obj.Name !== 'string' || obj.Name === '') obj.Name = modName;
        if (!obj.Version || typeof obj.Version !== 'string') obj.Version = '0.0.0';
        if (!obj.Author || typeof obj.Author !== 'string') obj.Author = 'UNKNOWN';
        if (!obj.Description || typeof obj.Description !== 'string') obj.Description = '';
        if (!obj.Home || typeof obj.Home !== 'string') obj.Home = '';
        if (!obj.Heart || typeof obj.Heart !== 'string') obj.Heart = '';
        return obj;
    }

    /** Write mod info — same as CSLOLToolsImpl::modInfoWrite() */
    modInfoWrite(modName, obj) {
        const metaDir = path.join(this.prog, 'installed', modName, 'META');
        fs.mkdirSync(metaDir, { recursive: true });
        const filePath = path.join(metaDir, 'info.json');
        const fixed = this._modInfoFixup(modName, obj);
        fs.writeFileSync(filePath, JSON.stringify(fixed, null, 2));
        return fixed;
    }

    /** Get mod image path */
    modImageGet(modName) {
        const imgPath = path.join(this.prog, 'installed', modName, 'META', 'image.png');
        if (fs.existsSync(imgPath)) return imgPath;
        return '';
    }

    /** Set mod image — same as CSLOLToolsImpl::modImageSet() */
    modImageSet(modName, imageSrc) {
        const metaDir = path.join(this.prog, 'installed', modName, 'META');
        fs.mkdirSync(metaDir, { recursive: true });
        const destPath = path.join(metaDir, 'image.png');
        if (!imageSrc || imageSrc === '') {
            try { fs.unlinkSync(destPath); } catch (e) { }
            return '';
        }
        if (destPath === imageSrc) return destPath;
        try {
            fs.copyFileSync(imageSrc, destPath);
            return destPath;
        } catch (e) {
            return '';
        }
    }

    /** List WADs in a mod — same as CSLOLToolsImpl::modWadsList() */
    modWadsList(modName) {
        const wadDir = path.join(this.prog, 'installed', modName, 'WAD');
        const result = [];
        if (!fs.existsSync(wadDir)) return result;
        const entries = fs.readdirSync(wadDir);
        for (const entry of entries) {
            if (entry.endsWith('.tmp')) continue;
            if (entry.endsWith('.wad.client')) {
                result.push(entry);
            }
        }
        result.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        return result;
    }

    /** Delete mod — same as CSLOLToolsImpl::deleteMod() */
    deleteMod(modName) {
        if (this.state !== 'idle') return false;
        this._setState('busy');
        this._setStatus('Delete mod');
        const modDir = path.join(this.prog, 'installed', modName);
        try {
            fs.rmSync(modDir, { recursive: true, force: true });
            this._setState('idle');
            return true;
        } catch (e) {
            this._setState('idle');
            return false;
        }
    }

    /** Create new mod — same as CSLOLToolsImpl::makeMod() */
    makeMod(fileName, infoData, imageSrc) {
        if (this.state !== 'idle') return null;
        this._setState('busy');
        this._setStatus('Make mod');
        const fixed = this.modInfoWrite(fileName, infoData);
        const image = this.modImageSet(fileName, imageSrc);
        this._setState('idle');
        return { info: fixed, image };
    }

    // ========== PROFILE OPERATIONS ==========
    // Exactly replicates CSLOLToolsImpl profile functions

    /** List profiles — same as CSLOLToolsImpl::listProfiles() */
    listProfiles() {
        const profilesDir = path.join(this.prog, 'profiles');
        fs.mkdirSync(profilesDir, { recursive: true });
        const profiles = [];
        const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                profiles.push(entry.name);
            }
        }
        if (!profiles.includes('Default Profile')) {
            profiles.unshift('Default Profile');
        }
        return profiles;
    }

    /** Read profile — same as CSLOLToolsImpl::readProfile() */
    readProfile(profileName) {
        const profile = {};
        const filePath = path.join(this.prog, 'profiles', profileName + '.profile');
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            const lines = data.split('\n').filter(l => l.trim() !== '');
            for (const line of lines) {
                profile[line.trim()] = true;
            }
        } catch (e) { }
        return profile;
    }

    /** Write profile — same as CSLOLToolsImpl::writeProfile() */
    writeProfile(profileName, mods) {
        const profilesDir = path.join(this.prog, 'profiles');
        fs.mkdirSync(profilesDir, { recursive: true });
        const filePath = path.join(profilesDir, profileName + '.profile');
        const lines = Object.keys(mods).filter(k => k.length > 0);
        fs.writeFileSync(filePath, lines.join('\n') + '\n');
    }

    /** Read current profile — same as CSLOLToolsImpl::readCurrentProfile() */
    readCurrentProfile() {
        const filePath = path.join(this.prog, 'current.profile');
        try {
            const data = fs.readFileSync(filePath, 'utf-8').trim();
            return data || 'Default Profile';
        } catch (e) {
            return 'Default Profile';
        }
    }

    /** Write current profile — same as CSLOLToolsImpl::writeCurrentProfile() */
    writeCurrentProfile(profileName) {
        const filePath = path.join(this.prog, 'current.profile');
        fs.writeFileSync(filePath, profileName + '\n');
    }

    /** Delete profile — same as CSLOLToolsImpl::deleteProfile() */
    deleteProfile(profileName) {
        if (this.state !== 'idle') return false;
        this._setState('busy');
        this._setStatus('Delete profile');
        const profileDir = path.join(this.prog, 'profiles', profileName);
        try {
            fs.rmSync(profileDir, { recursive: true, force: true });
        } catch (e) { }
        // Also remove the .profile file
        try {
            fs.unlinkSync(path.join(this.prog, 'profiles', profileName + '.profile'));
        } catch (e) { }
        this._setState('idle');
        return true;
    }

    // ========== TOOL EXECUTION ==========
    // Exactly replicates CSLOLToolsImpl::runTool()

    /** Run mod-tools.exe — EXACT same CLI as original */
    _runTool(args) {
        return new Promise((resolve, reject) => {
            const filteredArgs = args.filter(a => a !== '');
            this._log('Running: mod-tools.exe ' + filteredArgs.join(' '));
            console.log('[_runTool] args:', filteredArgs);

            const proc = spawn(this.modToolsExe, filteredArgs, {
                cwd: this.prog,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            let stderrData = '';

            proc.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        this._setStatus(line.trim());
                    }
                }
            });

            proc.stderr.on('data', (data) => {
                stderrData += data.toString();
            });

            proc.on('close', (code) => {
                if (code !== 0) {
                    const trace = stderrData.trim();
                    const lastLine = trace.split('\n').pop() || '';
                    this._log('Error: ' + trace);
                    reject({ code, message: lastLine, trace });
                } else {
                    resolve(code);
                }
            });

            proc.on('error', (err) => {
                this._log('Process error: ' + err.message);
                reject({ code: -1, message: err.message, trace: '' });
            });
        });
    }

    /** Import fantome/zip — EXACT same as CSLOLToolsImpl::installFantomeZip() */
    async installFantomeZip(filePath) {
        if (this.state !== 'idle' || !filePath) return null;
        this._setState('busy');
        this._setStatus('Installing Mod');

        const baseName = path.basename(filePath)
            .replace('.zip', '')
            .replace('.fantome', '')
            .replace('.wad', '')
            .replace('.client', '');

        const dst = path.join(this.prog, 'installed', baseName);

        if (fs.existsSync(dst)) {
            this._setState('idle');
            throw { message: 'Already exists', trace: '' };
        }

        try {
            // EXACT same CLI as CSLOLToolsImpl — paths normalized to forward slashes
            await this._runTool([
                'import',
                this._normPath(filePath),
                this._normPath(dst),
                '--game:' + this._normPath(this.gamePath),
                this.blacklist ? '--noTFT' : '',
            ]);
            const info = this.modInfoRead(baseName);
            this._setState('idle');
            return { fileName: baseName, info };
        } catch (e) {
            this._setState('idle');
            throw e;
        }
    }

    /** Export mod — EXACT same as CSLOLToolsImpl::exportMod() */
    async exportMod(modName, destPath) {
        if (this.state !== 'idle') return;
        this._setState('busy');
        this._setStatus('Export mod');
        try {
            await this._runTool([
                'export',
                this._normPath(path.join(this.prog, 'installed', modName)),
                this._normPath(destPath),
                '--game:' + this._normPath(this.gamePath),
                this.blacklist ? '--noTFT' : '',
            ]);
        } catch (e) {
            throw e;
        } finally {
            this._setState('idle');
        }
    }

    /** Add WAD to mod — EXACT same as CSLOLToolsImpl::addModWad() */
    async addModWad(modFileName, wadPath, removeUnknownNames) {
        if (this.state !== 'idle') return [];
        this._setState('busy');
        this._setStatus('Add mod wads');

        const before = this.modWadsList(modFileName);
        try {
            await this._runTool([
                'addwad',
                this._normPath(wadPath),
                this._normPath(path.join(this.prog, 'installed', modFileName)),
                '--game:' + this._normPath(this.gamePath),
                removeUnknownNames ? '--removeUNK' : '',
                this.blacklist ? '--noTFT' : '',
            ]);
            const after = this.modWadsList(modFileName);
            const added = after.filter(w => !before.map(b => b.toLowerCase()).includes(w.toLowerCase()));
            this._setState('idle');
            return added;
        } catch (e) {
            this._setState('idle');
            throw e;
        }
    }

    /** Remove WAD files from mod */
    removeModWads(modFileName, wadNames) {
        if (this.state !== 'idle') return [];
        this._setState('busy');
        this._setStatus('Remove mod wads');
        const removed = [];
        for (const name of wadNames) {
            const wadPath = path.join(this.prog, 'installed', modFileName, 'WAD', name);
            try {
                fs.unlinkSync(wadPath);
                removed.push(name);
            } catch (e) { }
        }
        this._setState('idle');
        return removed;
    }

    /** Change mod info */
    changeModInfo(fileName, infoData, imageSrc) {
        if (this.state !== 'idle') return null;
        this._setState('busy');
        this._setStatus('Change mod info');
        const fixed = this.modInfoWrite(fileName, infoData);
        const image = this.modImageSet(fileName, imageSrc);
        this._setState('idle');
        return { info: fixed, image };
    }

    /** Refresh mods list */
    refreshMods() {
        const mods = {};
        for (const name of this.modList()) {
            mods[name] = this.modInfoRead(name);
        }
        return mods;
    }

    // ========== PATCHER / OVERLAY ==========
    // mkoverlay via mod-tools.exe CLI (works fine)
    // Injection via direct FFI to cslol-dll.dll (replaces mod-tools.exe runoverlay)

    /** Save profile and optionally run patcher */
    async saveProfileAndRun(profileName, enabledMods, run, suppressConflict, debugPatcher) {
        if (this.state !== 'idle') return;
        this._setState('busy');
        this._setStatus('Save profile');

        if (!profileName) profileName = 'Default Profile';
        this.writeCurrentProfile(profileName);
        this.writeProfile(profileName, enabledMods);

        this._setStatus('Write profile');

        // ALL PATHS USE FORWARD SLASHES (Qt/cslol convention)
        const modKeys = Object.keys(enabledMods).filter(k => k.length > 0);
        const installedPath = this._normPath(path.join(this.prog, 'installed'));
        const profilePath = this._normPath(path.join(this.prog, 'profiles', profileName));
        const gamePath = this._normPath(this.gamePath);

        this._log('mkoverlay args: installed=' + installedPath + ' profile=' + profilePath + ' game=' + gamePath + ' mods=' + modKeys.join('/'));

        try {
            // Step 1: Build overlay via mod-tools.exe mkoverlay (this works fine)
            await this._runTool([
                'mkoverlay',
                installedPath,
                profilePath,
                '--game:' + gamePath,
                '--mods:' + modKeys.join('/'),
                this.blacklist ? '--noTFT' : '',
                suppressConflict ? '--ignoreConflict' : '',
            ]);

            if (run) {
                // Step 2: Run patcher via FFI to cslol-dll.dll
                // This REPLACES mod-tools.exe runoverlay (which had C0000229)
                this._setStatus('Starting patcher (FFI)...');
                this._log('Starting FFI patcher with overlay path: ' + profilePath);
                this._runFFIPatcher(profilePath);
            } else {
                this._setState('idle');
            }
        } catch (e) {
            this._setState('idle');
            throw e;
        }
    }

    /**
     * Run the patcher via direct FFI to cslol-dll.dll.
     * Replicates ltk-manager's legacy_patcher approach:
     *   cslol_init() → cslol_set_config(path) → cslol_find() → cslol_hook()
     */
    _runFFIPatcher(overlayPath) {
        // Wire up callbacks
        this.cslolPatcher.setStatusCallback((msg) => this._setStatus(msg));
        this.cslolPatcher.setLogCallback((msg) => this._log(msg));
        this.cslolPatcher.setStateCallback((state) => {
            if (state === 'running') this._setState('running');
            else if (state === 'idle') this._setState('idle');
        });

        // Run asynchronously — it will update state via callbacks
        this._setState('running');
        this.cslolPatcher.run(overlayPath).catch((err) => {
            this._log('FFI Patcher error: ' + (err.message || err));
            this._setStatus('Patcher error: ' + (err.message || err));
        }).finally(() => {
            this._setState('idle');
        });
    }

    /** Stop patcher — signals the FFI patcher to stop */
    stopProfile() {
        if (this.state === 'running' && this.cslolPatcher.isRunning()) {
            this._log('Stopping FFI patcher...');
            this.cslolPatcher.stop();
        }
    }

    /** Run diagnostics tool */
    runDiag() {
        if (fs.existsSync(this.diagToolExe)) {
            spawn(this.diagToolExe, ['e'], {
                cwd: this.prog,
                detached: true,
                windowsHide: false
            }).unref();
        }
    }

    // ========== INITIALIZATION ==========

    /** Initialize — exact same as CSLOLToolsImpl::init() */
    init() {
        // Check mod-tools exists
        if (!fs.existsSync(this.modToolsExe)) {
            return {
                error: 'cslol-tools/mod-tools.exe is missing. Make sure you installed properly.'
            };
        }

        // Load game path
        // Load game path — normalize to forward slashes
        this.gamePath = this._normPath(this.config.leaguePath || '');
        this.blacklist = this.config.blacklist !== false;
        this.ignorebad = this.config.ignorebad === true;

        // Auto-detect
        if (this.config.detectGamePath) {
            const detected = this.detectGamePath();
            if (detected) {
                this.gamePath = detected;
                this.config.leaguePath = detected;
                this.saveConfig();
            }
        }

        // Load mods
        const mods = {};
        for (const name of this.modList()) {
            mods[name] = this.modInfoRead(name);
        }

        // Load profiles
        const profiles = this.listProfiles();
        let profileName = this.readCurrentProfile();
        if (!profiles.includes(profileName)) {
            profileName = 'Default Profile';
            this.writeCurrentProfile(profileName);
        }

        const profileMods = this.readProfile(profileName);

        return {
            mods,
            profiles,
            profileName,
            profileMods,
            gamePath: this.gamePath
        };
    }
}

module.exports = ModManager;
