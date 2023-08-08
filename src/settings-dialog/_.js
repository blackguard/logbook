const current_script_url = import.meta.url;  // save for later

import {
    create_element,
} from '../../lib/ui/dom-util.js';

import {
    Dialog,
    AlertDialog,
    create_control_element,
    create_select_element,
} from '../../lib/ui/dialog/_.js';

import {
    get_obj_path,
    set_obj_path,
} from '../../lib/sys/obj-path.js';

import {
    get_settings,
    update_settings,
    analyze_editor_options_indentUnit,
    analyze_editor_options_tabSize,
    analyze_editor_options_indentWithTabs,
    valid_editor_options_keyMap_values,
    analyze_editor_options_keyMap,
    valid_formatting_options_align_values,
    analyze_formatting_options_align,
    analyze_formatting_options_indent,
    valid_theme_colors_values,
    analyze_theme_colors,
} from '../settings.js';

import {
    beep,
} from '../../lib/ui/beep.js';

import {
    assets_server_url,
} from '../assets-server-url.js';


// import {
//     create_stylesheet_link,
// } from '../../lib/ui/dom-util.js';
// {
//     const stylesheet_url = new URL('./settings-dialog.css', assets_server_url(current_script_url));
//     create_stylesheet_link(document.head, stylesheet_url);
// }
/* do not import; stylesheet coalesced into main stylesheet
import './settings-dialog.css';  // webpack implementation
*/


// dialog definitiion

const sections = [{
    section: {
        name: 'Editor',
        settings: [{
            id: 'editor_options_indentUnit',
            label: 'Indent',
            type: 'text',
            settings_path: [ 'editor_options', 'indentUnit' ],
            analyze: (value) => analyze_editor_options_indentUnit(value, 'Indent'),
            convert_to_number: true,
        }, {
            id: 'editor_options_tabSize',
            label: 'Tab size',
            type: 'text',
            settings_path: [ 'editor_options', 'tabSize' ],
            analyze: (value) => analyze_editor_options_tabSize(value, 'Tab size'),
            convert_to_number: true,
        }, {
            id: 'editor_options_indentWithTabs',
            label: 'Indent with tabs',
            type: 'checkbox',
            settings_path: [ 'editor_options', 'indentWithTabs' ],
            analyze: (value) => analyze_editor_options_indentWithTabs(value, 'Indent with tabs'),
        }, {
            id: 'editor_options_keyMap',
            label: 'Key map',
            type: 'select',
            options: valid_editor_options_keyMap_values.map(value => ({ value, label: value })),
            settings_path: [ 'editor_options', 'keyMap' ],
            analyze: (value) => analyze_editor_options_keyMap(value, 'Key map'),
        }],
    },
}, {
    section: {
        name: 'TeX Formatting',
        settings: [{
            id: 'formatting_options_align',
            label: 'Horizontal alignment',
            type: 'select',
            options: valid_formatting_options_align_values.map(value => ({ value, label: value })),
            settings_path: [ 'formatting_options', 'align' ],
            analyze: (value) => analyze_formatting_options_align(value, 'Align'),
        }, {
            id: 'formatting_options_indent',
            label: 'Indentation',
            type: 'text',
            settings_path: [ 'formatting_options', 'indent' ],
            analyze: (value) => analyze_formatting_options_indent(value, 'Indentation'),
        }],
    },
}, {
    section: {
        name: 'Appearance',
        settings: [{
            id: 'theme_colors',
            label: 'Theme',
            type: 'select',
            options: valid_theme_colors_values.map(value =>({ value, label: value })),
            settings_path: [ 'theme_colors' ],
            analyze: (value) => analyze_theme_colors(value, 'Theme colors'),
        }],
    },
}];


export class SettingsDialog extends Dialog {
    static settings_dialog_css_class = 'settings-dialog';

    static run(message, options) {
        const pre_existing_element = document.querySelector(`#content #ui .${this.settings_dialog_css_class}`);
        if (pre_existing_element) {
            const pre_existing_instance = Dialog.instance_from_element(pre_existing_element);
            if (!pre_existing_instance) {
                throw new Error(`unexpected: Dialog.instance_from_element() returned null for element with class ${this.settings_dialog_css_class}`);
            }
            return pre_existing_instance.promise;
        } else {
            return new this().run();
        }
    }

    _populate_dialog_element() {
        const current_settings = get_settings();

        // make this dialog identifiable so that the static method run()
        // can find it if it already exists.
        this._dialog_element.classList.add(this.constructor.settings_dialog_css_class);

        this._dialog_text_container.innerText = 'Settings';

        for (const { section } of sections) {
            const { name, settings } = section;
            const section_div = create_element({ parent: this._dialog_form, attrs: { class: 'section' } });

            const named_section_div = create_element({ parent: section_div, attrs: { 'data-section': name } });
            const error_div = create_element({ parent: section_div, attrs: { class: `error-message` } });

            for (const setting of settings) {
                const { id, label, type, settings_path, options, analyze, convert_to_number } = setting;
                const setting_div = create_element({ parent: named_section_div, attrs: { 'data-setting': undefined } });
                let control;
                if (type === 'select') {
                    control = create_select_element(setting_div, id, {
                        label,
                        options,
                    });
                } else {
                    control = create_control_element(setting_div, id, {
                        label,
                        type,
                    });
                }

                if (type === 'checkbox') {
                    control.checked = get_obj_path(current_settings, settings_path);
                } else {
                    control.value = get_obj_path(current_settings, settings_path);
                }

                const update_handler = async (event) => {
                    const current_settings = get_settings();

                    const handle_error = async (error_message) => {
                        error_div.classList.add('active');
                        error_div.innerText = error_message;
                        const existing_control = document.getElementById(control.id);
                        if (!this._completed && existing_control) {
                            existing_control.focus();
                            if (existing_control instanceof HTMLInputElement && existing_control.type === 'text') {
                                existing_control.select();
                            }
                            await beep();
                        } else {
                            await AlertDialog.run(`settings update failed: ${error_message}`);
                        }
                    };

                    const value = (type === 'checkbox') ? control.checked : control.value;
                    if (analyze) {
                        const complaint = analyze(value)
                        if (complaint) {
                            await handle_error(complaint);
                            return;
                        }
                    }
                    set_obj_path(current_settings, settings_path, (convert_to_number ? +value : value));

                    try {
                        await update_settings(current_settings)
                        error_div.classList.remove('active');
                    } catch (error) {
                        await handle_error(error.message);
                    }
                };

                control.addEventListener('change', update_handler);
                control.addEventListener('blur',   update_handler);
            }
        }

        // Done button should not cause Enter to automatically submit the form
        // unless directly clicked.
        const accept_button = create_element({
            parent: this._dialog_form,
            tag:    'input',
            attrs: {
                type: 'button',
                value: 'Done',
            },
        });
        accept_button.onclick = (event) => this._dialog_element.close();

        this._dialog_element.onclose = (event) => this._complete();
    }
}
