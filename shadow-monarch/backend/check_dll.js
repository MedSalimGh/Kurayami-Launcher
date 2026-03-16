const koffi = require('koffi');
const path = require('path');

const dllPath = path.join(__dirname, '..', '..', 'cslol-tools', 'cslol-dll.dll');
console.log('Loading:', dllPath);
const lib = koffi.load(dllPath);

const funcs = [
    'cslol_init', 'cslol_set_config', 'cslol_set_flags',
    'cslol_set_log_level', 'cslol_set_log_file',
    'cslol_find', 'cslol_sleep',
    'cslol_hook', 'cslol_hook_begin', 'cslol_hook_continue',
    'cslol_hook_end', 'cslol_hook_count',
    'cslol_log_pull', 'cslol_msg_hookproc'
];

for (const f of funcs) {
    try {
        lib.func(f, 'void', []);
        console.log(f + ': FOUND');
    } catch (e) {
        console.log(f + ': NOT FOUND');
    }
}
