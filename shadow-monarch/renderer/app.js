/**
 * app.js — Shadow Monarch Application Controller
 * Wires the Solo Leveling UI to the cslol-tools backend
 */

// ===== Global State =====
const state = {
    mods: {},           // { fileName: { Name, Version, Author, Description, Home, Heart } }
    enabledMods: {},    // { fileName: true }
    profiles: [],
    currentProfile: 'Default Profile',
    gamePath: '',
    appState: 'idle',   // 'idle', 'busy', 'running', 'error'
    currentPage: 'dashboard',
    editingMod: null,
    editModImage: '',
};

// ===== Helper: Modal =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}
// Expose globally for inline onclick
window.closeModal = closeModal;

// ===== Navigation =====
function navigateTo(page) {
    state.currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

    // Refresh page data
    if (page === 'skins') renderModGrid();
    if (page === 'profiles') renderProfiles();
    if (page === 'settings') renderSettings();
    if (page === 'dashboard') renderDashboard();
}

// ===== Status & State Updates =====
function updateAppState(newState) {
    state.appState = newState;
    const dot = document.getElementById('sidebar-status-dot');
    const text = document.getElementById('sidebar-status-text');
    const statusbarState = document.getElementById('statusbar-state');
    const statusbar = document.getElementById('statusbar');
    const ariseBtn = document.getElementById('btn-arise-main');

    dot.className = 'status-dot ' + newState;

    const labels = { idle: 'Ready', busy: 'Working...', running: 'Patching Active', error: 'Error' };
    text.textContent = labels[newState] || 'Ready';
    statusbarState.textContent = newState.toUpperCase();

    statusbar.classList.toggle('active', newState !== 'idle');

    // Update ARISE button
    const isBusy = newState === 'busy';
    const isRunning = newState === 'running';
    ariseBtn.disabled = isBusy;
    ariseBtn.classList.toggle('running', isRunning);
    ariseBtn.querySelector('span').textContent = isRunning ? 'STOP' : 'ARISE';

    // Toggle button states
    document.querySelectorAll('.btn:not(.btn-arise)').forEach(btn => {
        if (btn.dataset.alwaysEnabled) return;
        // Don't disable window controls or close buttons
        if (btn.closest('.titlebar-controls') || btn.closest('.modal-footer') || btn.closest('.modal-header')) return;
        btn.disabled = isBusy;
    });

    // Update dashboard stat
    const statStatus = document.getElementById('stat-status');
    if (statStatus) {
        statStatus.textContent = isRunning ? 'Active' : isBusy ? 'Busy' : 'Idle';
        statStatus.style.color = isRunning ? 'var(--purple-light)' : isBusy ? 'var(--gold-main)' : 'var(--text-primary)';
    }
}

function updateStatus(msg) {
    document.getElementById('statusbar-text').textContent = msg;
    addLog(msg);
}

function addLog(msg) {
    const log = document.getElementById('session-log');
    if (!log) return;
    const line = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    line.textContent = `[${time}] ${msg}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    // Keep last 100 lines
    while (log.children.length > 100) log.removeChild(log.firstChild);
}

function showError(message, trace) {
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-trace').textContent = trace || '';
    document.getElementById('error-trace').style.display = trace ? 'block' : 'none';
    openModal('modal-error');
}

// ===== Dashboard =====
function renderDashboard() {
    const totalMods = Object.keys(state.mods).length;
    const activeMods = Object.keys(state.enabledMods).length;
    document.getElementById('stat-total-mods').textContent = totalMods;
    document.getElementById('stat-active-mods').textContent = activeMods;
    document.getElementById('stat-profiles').textContent = state.profiles.length;

    // Profile selector
    const select = document.getElementById('dash-profile-select');
    select.innerHTML = '';
    state.profiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        opt.selected = p === state.currentProfile;
        select.appendChild(opt);
    });
}

// ===== Mod Grid =====
function renderModGrid() {
    const grid = document.getElementById('mod-grid');
    const searchText = (document.getElementById('search-mods')?.value || '').toLowerCase();
    grid.innerHTML = '';

    const sortedMods = Object.keys(state.mods).sort((a, b) =>
        (state.mods[a].Name || a).toLowerCase().localeCompare((state.mods[b].Name || b).toLowerCase())
    );

    for (const fileName of sortedMods) {
        const mod = state.mods[fileName];
        // Filter by search
        if (searchText) {
            const name = (mod.Name || '').toLowerCase();
            const desc = (mod.Description || '').toLowerCase();
            if (!name.includes(searchText) && !desc.includes(searchText)) continue;
        }

        const isEnabled = !!state.enabledMods[fileName];
        const card = document.createElement('div');
        card.className = 'mod-card' + (isEnabled ? ' enabled' : '');
        card.dataset.mod = fileName;

        const imagePath = getModImageUrl(fileName);

        card.innerHTML = `
            <div class="mod-card-image ${imagePath ? '' : 'no-image'}" ${imagePath ? `style="background-image: url('${imagePath}')"` : ''}>
                ${imagePath ? '' : '🗡'}
            </div>
            <div class="mod-card-body">
                <div class="mod-card-header">
                    <div class="mod-card-title">${escapeHtml(mod.Name || fileName)}</div>
                    <label class="toggle mod-toggle">
                        <input type="checkbox" ${isEnabled ? 'checked' : ''}>
                        <div class="toggle-track"></div>
                        <div class="toggle-thumb"></div>
                    </label>
                </div>
                <div class="mod-card-meta">V${escapeHtml(mod.Version || '0.0.0')} by ${escapeHtml(mod.Author || 'Unknown')}</div>
                <div class="mod-card-desc">${escapeHtml(mod.Description || '')}</div>
                <div class="mod-card-actions">
                    <div class="mod-card-buttons">
                        ${mod.Heart ? `<button class="btn-icon sm" title="Support Author" data-action="heart">♥</button>` : ''}
                        ${mod.Home ? `<button class="btn-icon sm" title="Mod Page" data-action="home">🔗</button>` : ''}
                    </div>
                    <div class="mod-card-buttons">
                        <button class="btn-icon sm" title="Edit" data-action="edit">✎</button>
                        <button class="btn-icon sm" title="Export" data-action="export">📤</button>
                        <button class="btn-icon sm" title="Delete" data-action="delete" style="color: var(--red-main);">✕</button>
                    </div>
                </div>
            </div>
        `;

        // Toggle handler
        card.querySelector('.mod-toggle input').addEventListener('change', (e) => {
            if (e.target.checked) {
                state.enabledMods[fileName] = true;
            } else {
                delete state.enabledMods[fileName];
            }
            card.classList.toggle('enabled', e.target.checked);
            renderDashboard();
        });

        // Action buttons
        card.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'edit') openEditMod(fileName);
                if (action === 'export') await exportMod(fileName);
                if (action === 'delete') await deleteMod(fileName);
                if (action === 'home' && mod.Home) api.utils.openExternal(mod.Home);
                if (action === 'heart' && mod.Heart) api.utils.openExternal(mod.Heart);
            });
        });

        grid.appendChild(card);
    }

    // Update enable-all toggle
    const allToggle = document.querySelector('#toggle-all-mods input');
    const totalVisible = grid.children.length;
    const totalEnabled = grid.querySelectorAll('.mod-card.enabled').length;
    allToggle.checked = totalVisible > 0 && totalEnabled === totalVisible;
    allToggle.indeterminate = totalEnabled > 0 && totalEnabled < totalVisible;
}

function getModImageUrl(fileName) {
    // Construct file:// path to mod image
    try {
        const config = state._config;
        if (!config) return '';
        // We'll load images via a data URL approach or file protocol
        return '';
    } catch (e) {
        return '';
    }
}

// ===== Mod Operations =====
async function importMod() {
    try {
        const filePath = await api.dialog.openFile();
        if (!filePath) return;
        const result = await api.mods.install(filePath);
        if (result) {
            state.mods[result.fileName] = result.info;
            addLog(`Installed: ${result.info.Name || result.fileName}`);
            renderModGrid();
            renderDashboard();
        }
    } catch (e) {
        showError(e.message || 'Failed to install mod', e.trace || '');
    }
}

async function deleteMod(fileName) {
    if (!confirm(`Delete "${state.mods[fileName]?.Name || fileName}"? This cannot be undone.`)) return;
    try {
        const ok = await api.mods.delete(fileName);
        if (ok) {
            delete state.mods[fileName];
            delete state.enabledMods[fileName];
            addLog(`Deleted: ${fileName}`);
            renderModGrid();
            renderDashboard();
        }
    } catch (e) {
        showError('Failed to delete mod', e.message);
    }
}

async function exportMod(fileName) {
    try {
        await api.mods.export(fileName);
        addLog(`Exported: ${fileName}`);
    } catch (e) {
        showError('Failed to export mod', e.trace || e.message || '');
    }
}

async function refreshMods() {
    try {
        const mods = await api.mods.refresh();
        state.mods = mods;
        // Remove enabled mods that no longer exist
        for (const key of Object.keys(state.enabledMods)) {
            if (!(key in mods)) delete state.enabledMods[key];
        }
        renderModGrid();
        renderDashboard();
        addLog('Mods refreshed');
    } catch (e) { }
}

// ===== Edit Mod =====
async function openEditMod(fileName) {
    state.editingMod = fileName;
    state.editModImage = '';

    const mod = state.mods[fileName];
    document.getElementById('edit-mod-title').textContent = `Edit: ${mod?.Name || fileName}`;
    document.getElementById('edit-mod-name').value = mod?.Name || '';
    document.getElementById('edit-mod-author').value = mod?.Author || '';
    document.getElementById('edit-mod-version').value = mod?.Version || '';
    document.getElementById('edit-mod-desc').value = mod?.Description || '';
    document.getElementById('edit-mod-home').value = mod?.Home || '';
    document.getElementById('edit-mod-heart').value = mod?.Heart || '';
    document.getElementById('edit-mod-image-name').textContent = '';

    // Show info tab
    switchEditTab('info');

    // Load WADs
    try {
        const wads = await api.mods.getWads(fileName);
        renderWadList(wads);
    } catch (e) {
        renderWadList([]);
    }

    openModal('modal-edit-mod');
}

function renderWadList(wads) {
    const list = document.getElementById('edit-wad-list');
    list.innerHTML = '';
    for (const wad of wads) {
        const item = document.createElement('div');
        item.className = 'wad-item';
        item.innerHTML = `
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(wad)}</span>
            <button class="btn-icon sm" title="Remove" style="color: var(--red-main);">✕</button>
        `;
        item.querySelector('button').addEventListener('click', async () => {
            try {
                await api.mods.removeWads(state.editingMod, [wad]);
                item.remove();
                addLog(`Removed WAD: ${wad}`);
            } catch (e) { }
        });
        list.appendChild(item);
    }
    if (wads.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No WAD files</div>';
    }
}

function switchEditTab(tab) {
    document.querySelectorAll('#edit-mod-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('edit-tab-info').classList.toggle('hidden', tab !== 'info');
    document.getElementById('edit-tab-files').classList.toggle('hidden', tab !== 'files');
}

// ===== Profiles =====
function renderProfiles() {
    const list = document.getElementById('profile-list');
    list.innerHTML = '';
    for (const profile of state.profiles) {
        const isActive = profile === state.currentProfile;
        const card = document.createElement('div');
        card.className = 'profile-card' + (isActive ? ' active' : '');
        card.innerHTML = `
            <div class="profile-icon">${isActive ? '⚔' : '📋'}</div>
            <div class="profile-info">
                <div class="profile-name">${escapeHtml(profile)}</div>
                <div class="profile-meta">${isActive ? 'Currently active' : 'Click to load'}</div>
            </div>
            <div class="profile-actions">
                <button class="btn btn-sm" data-action="load" title="Load profile">Load</button>
                <button class="btn btn-sm btn-danger" data-action="delete" title="Delete" ${profile === 'Default Profile' ? 'disabled' : ''}>✕</button>
            </div>
        `;

        card.querySelector('[data-action="load"]').addEventListener('click', async () => {
            await loadProfile(profile);
        });

        card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
            if (profile === 'Default Profile') return;
            if (!confirm(`Delete profile "${profile}"?`)) return;
            try {
                await api.profiles.delete(profile);
                state.profiles = state.profiles.filter(p => p !== profile);
                if (state.currentProfile === profile) {
                    state.currentProfile = 'Default Profile';
                }
                renderProfiles();
                renderDashboard();
                addLog(`Deleted profile: ${profile}`);
            } catch (e) { }
        });

        list.appendChild(card);
    }
}

async function loadProfile(name) {
    try {
        const profileMods = await api.profiles.load(name);
        state.currentProfile = name;
        state.enabledMods = {};
        for (const key of Object.keys(profileMods)) {
            if (profileMods[key] && key in state.mods) {
                state.enabledMods[key] = true;
            }
        }
        renderProfiles();
        renderModGrid();
        renderDashboard();
        addLog(`Loaded profile: ${name}`);
    } catch (e) { }
}

async function createProfile(name) {
    if (!name || name.trim().length < 1) {
        showError('Profile name is required', '');
        return;
    }
    name = name.trim();
    if (state.profiles.map(p => p.toLowerCase()).includes(name.toLowerCase())) {
        showError('This profile already exists!', '');
        return;
    }
    state.profiles.push(name);
    state.currentProfile = name;
    await api.profiles.save(name, {});
    renderProfiles();
    renderDashboard();
    addLog(`Created profile: ${name}`);
}

// ===== Settings =====
function renderSettings() {
    const config = state._config || {};
    document.getElementById('settings-game-path').textContent = state.gamePath || 'Not set';
    setToggle('setting-detect-path', config.detectGamePath !== false);
    setToggle('setting-blacklist', config.blacklist !== false);
    setToggle('setting-suppress-conflicts', !!config.suppressInstallConflicts);
    setToggle('setting-ignorebad', !!config.ignorebad);
    setToggle('setting-systray', !!config.enableSystray);
    setToggle('setting-autorun', !!config.enableAutoRun);
    setToggle('setting-verbose', !!config.verbosePatcher);
}

function setToggle(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
}

async function saveSettingToggle(key, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const updates = {};
    updates[key] = el.checked;
    state._config = await api.config.update(updates);
}

// ===== ARISE / Patcher =====
async function ariseOrStop() {
    if (state.appState === 'running') {
        addLog('Stopping patcher...');
        await api.patcher.stop();
        return;
    }
    if (state.appState !== 'idle') return;

    // Check game path
    if (!state.gamePath) {
        openModal('modal-game-path');
        return;
    }

    // Check asia
    const isAsia = await api.game.checkAsia(state.gamePath);
    if (isAsia) {
        showError('Asian servers not supported', '因封禁，亚洲服不支持!');
        return;
    }

    const profileName = state.currentProfile || 'Default Profile';
    addLog(`Building overlay for profile: ${profileName}`);
    addLog(`Active mods: ${Object.keys(state.enabledMods).join(', ') || 'none'}`);

    try {
        await api.patcher.run(profileName, state.enabledMods);
    } catch (e) {
        showError(e.message || 'Patcher failed', e.trace || '');
    }
}

async function saveProfile() {
    const profileName = state.currentProfile || 'Default Profile';
    try {
        await api.patcher.save(profileName, state.enabledMods);
        addLog(`Profile saved: ${profileName}`);
    } catch (e) {
        showError(e.message || 'Failed to save', e.trace || '');
    }
}

// ===== Initialization =====
async function initApp() {
    addLog('Initializing Shadow Monarch...');

    try {
        const data = await api.init();

        if (data.error) {
            showError(data.error, '');
            addLog('ERROR: ' + data.error);
            return;
        }

        state.mods = data.mods || {};
        state.profiles = data.profiles || ['Default Profile'];
        state.currentProfile = data.profileName || 'Default Profile';
        state.gamePath = data.gamePath || '';

        // Load enabled mods from profile
        state.enabledMods = {};
        const profileMods = data.profileMods || {};
        for (const key of Object.keys(profileMods)) {
            if (profileMods[key] && key in state.mods) {
                state.enabledMods[key] = true;
            }
        }

        // Load config
        state._config = await api.config.get();

        addLog(`Loaded ${Object.keys(state.mods).length} mods`);
        addLog(`Profile: ${state.currentProfile}`);
        addLog(`Game: ${state.gamePath || 'Not set'}`);

        // Prompt for game path if not set
        if (!state.gamePath) {
            openModal('modal-game-path');
        }

        renderDashboard();
        renderModGrid();

        // Auto-run if setting enabled
        if (state._config.enableAutoRun && state.gamePath) {
            addLog('Auto-run enabled — starting patcher...');
            setTimeout(() => ariseOrStop(), 500);
        }

    } catch (e) {
        addLog('Init failed: ' + (e.message || e));
        showError('Initialization failed', e.message || String(e));
    }
}

// ===== Utility =====
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ===== Event Bindings =====
document.addEventListener('DOMContentLoaded', () => {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.page));
    });

    // Window controls
    document.getElementById('btn-minimize').addEventListener('click', () => api.window.minimize());
    document.getElementById('btn-maximize').addEventListener('click', () => api.window.maximize());
    document.getElementById('btn-close').addEventListener('click', () => api.window.close());

    // ARISE button
    document.getElementById('btn-arise-main').addEventListener('click', ariseOrStop);

    // Dashboard quick actions
    document.getElementById('btn-quick-import').addEventListener('click', importMod);
    document.getElementById('btn-quick-create').addEventListener('click', () => openModal('modal-new-mod'));
    document.getElementById('btn-quick-refresh').addEventListener('click', refreshMods);
    document.getElementById('btn-dash-save').addEventListener('click', saveProfile);
    document.getElementById('btn-dash-load').addEventListener('click', () => {
        const select = document.getElementById('dash-profile-select');
        if (select.value) loadProfile(select.value);
    });
    document.getElementById('dash-profile-select').addEventListener('change', (e) => {
        state.currentProfile = e.target.value;
    });

    // Skins page
    document.getElementById('btn-import-mod').addEventListener('click', importMod);
    document.getElementById('btn-create-mod').addEventListener('click', () => openModal('modal-new-mod'));
    document.getElementById('btn-refresh-mods').addEventListener('click', refreshMods);
    document.getElementById('search-mods').addEventListener('input', () => renderModGrid());

    // Enable/disable all toggle
    document.querySelector('#toggle-all-mods input').addEventListener('change', (e) => {
        const enable = e.target.checked;
        for (const fileName of Object.keys(state.mods)) {
            if (enable) {
                state.enabledMods[fileName] = true;
            } else {
                delete state.enabledMods[fileName];
            }
        }
        renderModGrid();
        renderDashboard();
    });

    // Drag & Drop
    const dropZone = document.getElementById('skin-drop-zone');
    ['dragenter', 'dragover'].forEach(ev => {
        dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
    });
    ['dragleave', 'drop'].forEach(ev => {
        dropZone.addEventListener(ev, () => {
            dropZone.classList.remove('drag-over');
        });
    });
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            try {
                const result = await api.mods.install(file.path);
                if (result) {
                    state.mods[result.fileName] = result.info;
                    addLog(`Installed: ${result.info.Name || result.fileName}`);
                    renderModGrid();
                    renderDashboard();
                }
            } catch (err) {
                showError(err.message || 'Failed to install mod', err.trace || '');
            }
        }
    });

    // Profiles page
    document.getElementById('btn-new-profile').addEventListener('click', () => {
        document.getElementById('new-profile-name').value = '';
        openModal('modal-new-profile');
    });
    document.getElementById('btn-create-profile-confirm').addEventListener('click', () => {
        const name = document.getElementById('new-profile-name').value;
        createProfile(name);
        closeModal('modal-new-profile');
    });

    // New Mod
    document.getElementById('btn-create-mod-confirm').addEventListener('click', async () => {
        const fileName = document.getElementById('new-mod-filename').value.trim();
        if (!fileName) { showError('Mod file name is required', ''); return; }
        const infoData = {
            Name: document.getElementById('new-mod-name').value || fileName,
            Author: document.getElementById('new-mod-author').value || 'Unknown',
            Version: document.getElementById('new-mod-version').value || '1.0.0',
            Description: document.getElementById('new-mod-desc').value || '',
            Home: '',
            Heart: '',
        };
        try {
            const result = await api.mods.make(fileName, infoData, '');
            if (result) {
                state.mods[fileName] = result.info;
                addLog(`Created mod: ${infoData.Name}`);
                closeModal('modal-new-mod');
                renderModGrid();
                renderDashboard();
                // Open edit dialog
                openEditMod(fileName);
            }
        } catch (e) {
            showError('Failed to create mod', e.message || '');
        }
    });

    // Edit Mod tabs
    document.querySelectorAll('#edit-mod-tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => switchEditTab(tab.dataset.tab));
    });

    // Edit Mod — Apply
    document.getElementById('btn-edit-mod-apply').addEventListener('click', async () => {
        const fileName = state.editingMod;
        if (!fileName) return;
        const infoData = {
            Name: document.getElementById('edit-mod-name').value,
            Author: document.getElementById('edit-mod-author').value,
            Version: document.getElementById('edit-mod-version').value,
            Description: document.getElementById('edit-mod-desc').value,
            Home: document.getElementById('edit-mod-home').value,
            Heart: document.getElementById('edit-mod-heart').value,
        };
        try {
            const result = await api.mods.changeInfo(fileName, infoData, state.editModImage || '');
            if (result) {
                state.mods[fileName] = result.info;
                addLog(`Updated mod: ${infoData.Name}`);
                renderModGrid();
            }
        } catch (e) {
            showError('Failed to update mod', e.message || '');
        }
    });

    // Edit Mod — Image
    document.getElementById('btn-edit-mod-image').addEventListener('click', async () => {
        const img = await api.dialog.openImage();
        if (img) {
            state.editModImage = img;
            const parts = img.replace(/\\/g, '/').split('/');
            document.getElementById('edit-mod-image-name').textContent = parts[parts.length - 1];
        }
    });

    // Edit Mod — Add WAD
    document.getElementById('btn-add-wad').addEventListener('click', async () => {
        const wadPath = await api.dialog.openWad();
        if (!wadPath || !state.editingMod) return;
        const removeUnknown = document.getElementById('edit-remove-unknown').checked;
        try {
            const added = await api.mods.addWad(state.editingMod, wadPath, removeUnknown);
            if (added && added.length > 0) {
                const wads = await api.mods.getWads(state.editingMod);
                renderWadList(wads);
                addLog(`Added ${added.length} WAD(s)`);
            }
        } catch (e) {
            showError('Failed to add WAD', e.trace || e.message || '');
        }
    });

    // Edit Mod — Add RAW
    document.getElementById('btn-add-raw').addEventListener('click', async () => {
        const folder = await api.dialog.openFolder();
        if (!folder || !state.editingMod) return;
        const removeUnknown = document.getElementById('edit-remove-unknown').checked;
        try {
            const added = await api.mods.addWad(state.editingMod, folder, removeUnknown);
            if (added && added.length > 0) {
                const wads = await api.mods.getWads(state.editingMod);
                renderWadList(wads);
                addLog(`Added RAW folder`);
            }
        } catch (e) {
            showError('Failed to add RAW folder', e.trace || e.message || '');
        }
    });

    // Edit Mod — Browse
    document.getElementById('btn-browse-mod').addEventListener('click', () => {
        if (state.editingMod) {
            // Open the mod folder
            api.utils.openPath(state.editingMod);
        }
    });

    // Settings
    document.getElementById('btn-change-game-path').addEventListener('click', async () => {
        const folder = await api.game.selectFolder();
        if (!folder) return;
        const checked = await api.game.check(folder);
        if (!checked) {
            showError('Invalid game directory', 'No "League of Legends.exe" found in the selected folder.');
            return;
        }
        state.gamePath = checked;
        await api.config.update({ leaguePath: checked });
        state._config = await api.config.get();
        renderSettings();
        addLog(`Game path set: ${checked}`);
    });

    document.getElementById('setting-detect-path').addEventListener('change', () => saveSettingToggle('detectGamePath', 'setting-detect-path'));
    document.getElementById('setting-blacklist').addEventListener('change', () => saveSettingToggle('blacklist', 'setting-blacklist'));
    document.getElementById('setting-suppress-conflicts').addEventListener('change', () => saveSettingToggle('suppressInstallConflicts', 'setting-suppress-conflicts'));
    document.getElementById('setting-ignorebad').addEventListener('change', () => saveSettingToggle('ignorebad', 'setting-ignorebad'));
    document.getElementById('setting-systray').addEventListener('change', () => saveSettingToggle('enableSystray', 'setting-systray'));
    document.getElementById('setting-autorun').addEventListener('change', () => saveSettingToggle('enableAutoRun', 'setting-autorun'));
    document.getElementById('setting-verbose').addEventListener('change', () => saveSettingToggle('verbosePatcher', 'setting-verbose'));

    document.getElementById('btn-run-diag').addEventListener('click', () => api.utils.runDiag());
    document.getElementById('btn-open-logs').addEventListener('click', () => api.utils.openLogs());

    // Game Path modal
    document.getElementById('btn-select-game-path').addEventListener('click', async () => {
        const folder = await api.game.selectFolder();
        if (!folder) return;
        const checked = await api.game.check(folder);
        if (!checked) {
            showError('Invalid game directory', 'No "League of Legends.exe" found in the selected folder.');
            return;
        }
        state.gamePath = checked;
        await api.config.update({ leaguePath: checked });
        state._config = await api.config.get();
        closeModal('modal-game-path');
        renderSettings();
        renderDashboard();
        addLog(`Game path set: ${checked}`);
    });

    // Listen for backend events
    api.on.statusUpdate((status) => {
        updateStatus(status);
    });

    api.on.stateUpdate((newState) => {
        updateAppState(newState);
    });

    api.on.trayRun(() => {
        ariseOrStop();
    });

    // Start
    updateAppState('idle');
    initApp();
});
