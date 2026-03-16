/**
 * preload.js — Secure IPC bridge
 * Exposes backend APIs to the renderer via contextBridge
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Window controls
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        maximize: () => ipcRenderer.invoke('window:maximize'),
        close: () => ipcRenderer.invoke('window:close'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    },

    // App initialization
    init: () => ipcRenderer.invoke('app:init'),

    // Config
    config: {
        get: () => ipcRenderer.invoke('config:get'),
        update: (updates) => ipcRenderer.invoke('config:update', updates),
    },

    // Game path
    game: {
        detect: () => ipcRenderer.invoke('game:detect'),
        check: (p) => ipcRenderer.invoke('game:check', p),
        checkAsia: (p) => ipcRenderer.invoke('game:checkAsia', p),
        selectFolder: () => ipcRenderer.invoke('game:selectFolder'),
    },

    // Mods
    mods: {
        list: () => ipcRenderer.invoke('mods:list'),
        install: (filePath) => ipcRenderer.invoke('mods:install', filePath),
        delete: (name) => ipcRenderer.invoke('mods:delete', name),
        export: (name) => ipcRenderer.invoke('mods:export', name),
        make: (fileName, info, image) => ipcRenderer.invoke('mods:make', fileName, info, image),
        changeInfo: (fileName, info, image) => ipcRenderer.invoke('mods:changeInfo', fileName, info, image),
        getInfo: (name) => ipcRenderer.invoke('mods:getInfo', name),
        getImage: (name) => ipcRenderer.invoke('mods:getImage', name),
        getWads: (name) => ipcRenderer.invoke('mods:getWads', name),
        addWad: (modName, wadPath, removeUnknown) => ipcRenderer.invoke('mods:addWad', modName, wadPath, removeUnknown),
        removeWads: (modName, wadNames) => ipcRenderer.invoke('mods:removeWads', modName, wadNames),
        refresh: () => ipcRenderer.invoke('mods:refresh'),
    },

    // Profiles
    profiles: {
        list: () => ipcRenderer.invoke('profiles:list'),
        load: (name) => ipcRenderer.invoke('profiles:load', name),
        save: (name, mods) => ipcRenderer.invoke('profiles:save', name, mods),
        delete: (name) => ipcRenderer.invoke('profiles:delete', name),
        getCurrent: () => ipcRenderer.invoke('profiles:getCurrent'),
    },

    // Patcher
    patcher: {
        run: (profileName, enabledMods, suppressConflict, debugPatcher) =>
            ipcRenderer.invoke('patcher:run', profileName, enabledMods, suppressConflict, debugPatcher),
        save: (profileName, enabledMods) =>
            ipcRenderer.invoke('patcher:save', profileName, enabledMods),
        stop: () => ipcRenderer.invoke('patcher:stop'),
        getState: () => ipcRenderer.invoke('patcher:state'),
    },

    // Dialogs
    dialog: {
        openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
        openWad: () => ipcRenderer.invoke('dialog:openWad'),
        openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
        openImage: () => ipcRenderer.invoke('dialog:openImage'),
    },

    // Utils
    utils: {
        openExternal: (url) => ipcRenderer.invoke('utils:openExternal', url),
        openPath: (p) => ipcRenderer.invoke('utils:openPath', p),
        runDiag: () => ipcRenderer.invoke('utils:runDiag'),
        openLogs: () => ipcRenderer.invoke('utils:openLogs'),
    },

    // Events from main process
    on: {
        statusUpdate: (callback) => ipcRenderer.on('status-update', (e, status) => callback(status)),
        stateUpdate: (callback) => ipcRenderer.on('state-update', (e, state) => callback(state)),
        trayRun: (callback) => ipcRenderer.on('tray-run', () => callback()),
    }
});
