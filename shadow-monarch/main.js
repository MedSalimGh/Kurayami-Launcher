/**
 * main.js — Electron Main Process
 * Shadow Monarch — Solo Leveling CSLOL Manager
 */

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const ModManager = require('./backend/mod-manager');

let mainWindow = null;
let tray = null;
let modManager = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0a0a0f',
        icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('close', (event) => {
        const config = modManager.getConfig();
        if (config.enableSystray && tray) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    try {
        const iconPath = path.join(__dirname, 'renderer', 'assets', 'icon.png');
        const fs = require('fs');
        if (!fs.existsSync(iconPath)) return;
        tray = new Tray(nativeImage.createFromPath(iconPath));
    } catch (e) {
        tray = new Tray(nativeImage.createEmpty());
    }

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show',
            click: () => { mainWindow.show(); }
        },
        {
            label: 'Run / Stop',
            click: () => {
                if (modManager.state === 'running') {
                    modManager.stopProfile();
                } else {
                    mainWindow.webContents.send('tray-run');
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);
    tray.setToolTip('Shadow Monarch — CSLOL Manager');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => { mainWindow.show(); });
}

function setupIPC() {
    modManager = new ModManager();

    // Status & state callbacks
    modManager.setStatusCallback((status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('status-update', status);
        }
    });
    modManager.setStateCallback((state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('state-update', state);
        }
    });

    // ===== Window controls =====
    ipcMain.handle('window:minimize', () => mainWindow.minimize());
    ipcMain.handle('window:maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
        return mainWindow.isMaximized();
    });
    ipcMain.handle('window:close', () => mainWindow.close());
    ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized());

    // ===== Initialization =====
    ipcMain.handle('app:init', () => {
        return modManager.init();
    });

    // ===== Config =====
    ipcMain.handle('config:get', () => modManager.getConfig());
    ipcMain.handle('config:update', (event, updates) => {
        modManager.updateConfig(updates);
        return modManager.getConfig();
    });

    // ===== Game Path =====
    ipcMain.handle('game:detect', () => modManager.detectGamePath());
    ipcMain.handle('game:check', (event, gamePath) => modManager.checkGamePath(gamePath));
    ipcMain.handle('game:checkAsia', (event, gamePath) => modManager.checkGamePathAsia(gamePath));
    ipcMain.handle('game:selectFolder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select League of Legends Game folder'
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    // ===== Mods =====
    ipcMain.handle('mods:list', () => modManager.refreshMods());
    ipcMain.handle('mods:install', async (event, filePath) => {
        return await modManager.installFantomeZip(filePath);
    });
    ipcMain.handle('mods:delete', (event, modName) => modManager.deleteMod(modName));
    ipcMain.handle('mods:export', async (event, modName) => {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Mod',
            defaultPath: modName + '.fantome',
            filters: [{ name: 'Fantome Mod', extensions: ['fantome'] }]
        });
        if (!result.canceled && result.filePath) {
            await modManager.exportMod(modName, result.filePath);
            return true;
        }
        return false;
    });
    ipcMain.handle('mods:make', (event, fileName, infoData, image) => {
        return modManager.makeMod(fileName, infoData, image);
    });
    ipcMain.handle('mods:changeInfo', (event, fileName, infoData, image) => {
        return modManager.changeModInfo(fileName, infoData, image);
    });
    ipcMain.handle('mods:getInfo', (event, modName) => modManager.modInfoRead(modName));
    ipcMain.handle('mods:getImage', (event, modName) => modManager.modImageGet(modName));
    ipcMain.handle('mods:getWads', (event, modName) => modManager.modWadsList(modName));
    ipcMain.handle('mods:addWad', async (event, modFileName, wadPath, removeUnknown) => {
        return await modManager.addModWad(modFileName, wadPath, removeUnknown);
    });
    ipcMain.handle('mods:removeWads', (event, modFileName, wadNames) => {
        return modManager.removeModWads(modFileName, wadNames);
    });
    ipcMain.handle('mods:refresh', () => modManager.refreshMods());

    // ===== Profiles =====
    ipcMain.handle('profiles:list', () => modManager.listProfiles());
    ipcMain.handle('profiles:load', (event, name) => modManager.readProfile(name));
    ipcMain.handle('profiles:save', (event, name, mods) => {
        modManager.writeCurrentProfile(name);
        modManager.writeProfile(name, mods);
    });
    ipcMain.handle('profiles:delete', (event, name) => modManager.deleteProfile(name));
    ipcMain.handle('profiles:getCurrent', () => modManager.readCurrentProfile());

    // ===== Patcher =====
    ipcMain.handle('patcher:run', async (event, profileName, enabledMods, suppressConflict, debugPatcher) => {
        const config = modManager.getConfig();
        await modManager.saveProfileAndRun(
            profileName,
            enabledMods,
            true,
            suppressConflict || config.suppressInstallConflicts,
            debugPatcher || config.verbosePatcher
        );
    });
    ipcMain.handle('patcher:save', async (event, profileName, enabledMods) => {
        const config = modManager.getConfig();
        await modManager.saveProfileAndRun(
            profileName,
            enabledMods,
            false,
            config.suppressInstallConflicts,
            config.verbosePatcher
        );
    });
    ipcMain.handle('patcher:stop', () => modManager.stopProfile());
    ipcMain.handle('patcher:state', () => modManager.state);

    // ===== Dialogs =====
    ipcMain.handle('dialog:openFile', async (event, filters) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: filters || [
                { name: 'Mod Files', extensions: ['fantome', 'zip'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });
    ipcMain.handle('dialog:openWad', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'WAD Files', extensions: ['wad.client', 'wad'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });
    ipcMain.handle('dialog:openFolder', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });
    ipcMain.handle('dialog:openImage', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] }
            ]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0];
        }
        return null;
    });

    // ===== Utils =====
    ipcMain.handle('utils:openExternal', (event, url) => shell.openExternal(url));
    ipcMain.handle('utils:openPath', (event, p) => shell.openPath(p));
    ipcMain.handle('utils:runDiag', () => modManager.runDiag());
    ipcMain.handle('utils:openLogs', () => {
        const logPath = path.join(modManager.prog, 'log.txt');
        shell.openPath(logPath);
    });
}

// ===== App Lifecycle =====
app.whenReady().then(() => {
    setupIPC();
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    if (modManager && modManager.state === 'running') {
        modManager.stopProfile();
    }
});
