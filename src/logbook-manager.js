import {
    EvalCellElement,
} from './eval-cell-element/_.js';

import {
    ToolBarElement,
} from './tool-bar-element/_.js';

import {
    Subscribable,
} from '../lib/sys/subscribable.js';

import {
    KeyEventManager,
    KeyMap,
} from '../lib/ui/key/_.js';

import {
    get_global_command_bindings,
    get_global_initial_key_map_bindings,
} from './global-bindings.js';

import {
    create_element,
    clear_element,
    move_node,
} from '../lib/ui/dom-util.js';

import {
    get_menubar_spec,
} from './global-bindings.js';

import {
    MenuBar,
} from '../lib/ui/menu/_.js';

import {
    SettingsDialog,
} from './settings/_.js';

import {
    ConfirmDialog,
} from '../lib/ui/dialog/_.js';

import {
    fs_interface,
} from '../lib/sys/fs-interface.js';

import {
    beep,
} from '../lib/ui/beep.js';

import {
    assets_server_url,
} from './assets-server-url.js';


// import {
//     create_stylesheet_link,
// } from '../lib/ui/dom-util.js';
// {
//     const server_url = assets_server_url(current_script_url);  // current_script_url is from initial import.meta.url
//     create_stylesheet_link(document.head, new URL('./style.css',       server_url));
//     create_stylesheet_link(document.head, new URL('./style-hacks.css', server_url));
// }
import './style.css';        // webpack implementation
import './style-hacks.css';  // webpack implementation


export class LogbookManager {
    static get singleton() {
        if (!this.#singleton) {
            this.#singleton = new this();
            this.#singleton.initialize();
        }
        return this.#singleton;
    }
    static #singleton;

    constructor() {
        this.#editable = true;
        this.#active_cell = null;
        this.#initialize_called = false;

        this.reset_global_eval_context();

        this.#eval_states = new Subscribable();
        //!!! this.#eval_states_subscription is never unsubscribed
        this.#eval_states_subscription = this.#eval_states.subscribe(this.#eval_states_observer.bind(this));

        this.#command_bindings = get_global_command_bindings();

        this.#key_event_manager = new KeyEventManager(window, this.#command_observer.bind(this));
        const key_map = new KeyMap(get_global_initial_key_map_bindings());
        this.push_key_map(key_map);
        this.#key_event_manager.attach();

    }
    #editable;
    #active_cell;
    #initialize_called;
    #global_eval_context;  // persistent eval_context for eval commands
    #header_element;  // element inserted into document by initialize() to hold menus, etc
    #eval_states;
    #eval_states_subscription;
    #command_bindings;
    #key_event_manager;
    #main_element;           // element wrapped around original body content by initialize()
    #tool_bar;
    #resize_handle_element;  // resize element; created in this.#initialize_document_structure()
    #menubar;
    #menubar_commands_subscription;
    #menubar_selects_subscription;
    #file_handle;

    static resize_handle_class                = 'resize-handle';
    static resize_handle_dragging_state_class = 'dragging';
    static collapse_cells_state_class         = 'collapse-cells';
    static input_output_split_css_variable    = '--input-output-split';

    get editable (){ return this.#editable; }
    set_editable(editable) {
        editable = !!editable;  // ensure Boolean
        this.#editable = editable;
        for (const cell of this.constructor.get_cells()) {
            cell.set_editable(editable);
        }
    }

    get active_cell (){ return this.#active_cell; }
    set_active_cell(cell) {
        this.#active_cell = (cell ?? null);
        for (const cell of this.constructor.get_cells()) {
            cell.set_active(cell === this.active_cell);
        }
    }

    get global_eval_context (){ return this.#global_eval_context; }
    reset_global_eval_context() {
        this.#global_eval_context = {};
    }

    get header_element (){ return this.#header_element; }
    get main_element   (){ return this.#main_element; }

    /** return an ordered list of the EvalCellElement (eval-cell) cells in the document
     *  @return {Array} the cells in the document
     * Note that EditorCellElement elements are not returned even though
     * EditorCellElement is a base class of EvalCellElement.  This is not ambiguous
     * because they have different tag names (editor-cell vs eval-cell).
     */
    static get_cells() {
        return [ ...document.getElementsByTagName(EvalCellElement.custom_element_name) ];
    }

    /** reset the document, meaning that all cells will be reset,
     *  and this.global_eval_context will be reset.  Also, the
     *  saved file handle this.#file_handle set to undefined.
     *  @return {LogbookManager} this
     */
    reset() {
        for (const cell of this.constructor.get_cells()) {
            cell.reset();
        }
        this.reset_global_eval_context();
        this.#file_handle = undefined;
        return this;
    }

    /** clear the current document
     */
    clear() {
        clear_element(this.main_element);
        const first_cell = this.create_cell();
        first_cell.focus();
    }

    stop() {
        for (const cell of this.constructor.get_cells()) {
            cell.stop();
        }
    }

    initialize() {
        if (this.#initialize_called) {
            throw new Error('initialize() called more than once');
        }
        this.#initialize_called = true;

        try {

            // establish this.#main_element / this.main_element
            this.#initialize_document_structure();

            this.#setup_csp();
            this.#setup_header();

            this.set_editable(this.editable);  // update all cells consistently

            // validate structure of document
            const cells = this.constructor.get_cells();
            if (cells.length > 0) {
//!!! improve this or eliminate !!!
            }

            // ensure all incoming cells have output elements (for layout coherence)
            for (const cell of cells) {
//!!! review this !!!
                cell.establish_output_element();
            }

            // set up active cell
            // ... find the first incoming "active" cell, or the first cell, or create a new cell
            const active_cell = cells.find(cell => cell.active) ?? cells[0] ?? this.create_cell();
            this.set_active_cell(active_cell);  // also resets "active" tool on all cells except for active_cell
            active_cell.focus();

            // add event handler for this.#resize_handle_element
            this.#resize_handle_element.addEventListener('mousedown', (event) => this.#enter_resize_mode(event));  //!!! event handler never removed

            // add "changes may not be saved" prompt for when document is being closed while modified
            window.addEventListener('beforeunload', (event) => {
                if (true/*!!! always warn for now !!!*/) {
                    event.preventDefault();
                    return (event.returnValue = '');
                }
            });  //!!! event handler never removed

        } catch (error) {
            show_initialization_failed(error);
        }
    }


    // === KEY MAP STACK ===

    reset_key_map_stack() {
        this.#key_event_manager.reset_key_map_stack();
    }
    push_key_map(key_map) {
        this.#key_event_manager.push_key_map(key_map);
    }
    pop_key_map() {
        return this.#key_event_manager.pop_key_map();
    }
    remove_key_map(key_map, remove_subsequent_too=false) {
        return this.#key_event_manager.remove_key_map(key_map, remove_subsequent_too);
    }


    // === DOCUMENT STRUCTURE ===

    static header_element_tag = 'header';
    static main_element_tag   = 'main';

    /** create a new cell in the document
     *  @param (Object|null|undefined} options
     *  @return {EvalCellElement} cell
     * options is passed to EvalCellElement.create_cell() but
     * with "parent", "before" and "output_element" overridden.
     * The new cell is put within an element structure.
     * "parent" and "before" are used to create the cell structure,
     * and "output_element" and "active_element_mapper" are ignored.
     */
    create_cell(options=null) {
        options ??= {};
        if (options.output_element) {
            console.warn('options.output_element ignored');
        }
        if (options.active_element_mapper) {
            console.warn('options.active_element_mapper ignored');
        }
        const {
            parent,
            before,
        } = options;
        const {
            cell_parent,
            cell_before,
            output_element_parent,
            output_element_before,
        } = this.#create_cell_element_structure({ parent, before });
        const output_element = EvalCellElement.create_output_element({
            parent: output_element_parent,
            before: output_element_before,
        });
        const cell = EvalCellElement.create_cell({
            editable: this.editable,
            ...options,
            parent: cell_parent,
            before: cell_before,
            output_element,
            active_element_mapper: this.constructor.active_element_mapper.bind(this.constructor),
        });
        return cell;
    }

    // put everything in the body into a new top-level main element
    #initialize_document_structure() {
        if (document.querySelector(this.constructor.header_element_tag)) {
            throw new Error(`bad format for document: element with id ${this.constructor.header_element_tag} already exists`);
        }
        if (document.querySelector(this.constructor.main_element_tag)) {
            throw new Error(`bad format for document: element with id ${this.constructor.main_element_tag} already exists`);
        }

        // establish head element if not already present
        if (!document.head) {
            document.documentElement.insertBefore(document.createElement('head'), document.documentElement.firstChild);
            // document.head is now set
        }
        // establish favicon
        if (!document.querySelector('link[rel="icon"]')) {
            create_element({
                parent: document.head,
                tag:    'link',
                attrs: {
                    rel: 'icon',
                    href: assets_server_url('dist/favicon.ico'),
                },
            });
        }
        // establish body element if not already present
        if (!document.body) {
            document.documentElement.appendChild(document.createElement('body'));
            // document.body is now set
        }
        // create the main element and move the current children of the body to it
        this.#main_element = document.createElement(this.constructor.main_element_tag);
        // create the this.#resize_handle_element element as the first child of this.#main_element
        this.#resize_handle_element = create_element({
            parent: this.#main_element,
        });
        this.#resize_handle_element.classList.add(this.constructor.resize_handle_class);
        // move the cells and their associated output_elements (if any)
        for (const cell of document.querySelectorAll(EvalCellElement.custom_element_name)) {
            const {
                cell_parent,
                cell_before,
                output_element_parent,
                output_element_before,
            } = this.#create_cell_element_structure({ parent: this.#main_element });
            cell_parent.insertBefore(cell, cell_before);  // moves cell
            const output_element = cell.output_element;
            if (output_element) {
                output_element_parent.insertBefore(output_element, output_element_before);  // moves output_element
            } else {
                // create output_element if none exists
                cell.output_element = EvalCellElement.create_output_element({
                    parent: output_element_parent,
                    before: output_element_before,
                });
            }
            // don't call cell.set_active_element_mapper() before the cell's structure is established
            cell.set_active_element_mapper(this.constructor.active_element_mapper.bind(this.constructor));
        }
        // now remove any remaining (extraneous) nodes from the document
        while (document.body.firstChild) {
            const node = document.body.firstChild;
            node.parentNode.removeChild(node);
            if (node.nodeType !== Node.TEXT_NODE || node.nodeValue.trim().length > 0) {  // don't warn when removing empty-ish TEXT nodes
                console.warn('removed extraneous node from incoming document', node);
            }
        }
        // create header element
        this.#header_element = document.createElement(this.constructor.header_element_tag);
        // add header and main elements
        document.body.appendChild(this.#header_element);
        document.body.appendChild(this.#main_element);

        // add a tool-bar element to each pre-existing cell
        for (const cell of this.constructor.get_cells()) {
            cell.establish_tool_bar();
            // the following will establish the event handlers for cell
            const current_output_element = cell.output_element;
            cell.output_element = null;
            cell.output_element = current_output_element;
        }
    }
    #assets_server_root;
    #local_server_root;

    #setup_csp(enabled=false) {
        if (enabled) {

            // === CONTENT SECURITY POLICY ===

            // set a Content-Security-Policy that will permit us
            // to dynamically load associated content

            const csp_header_content = [
                //!!! audit this !!!
                "default-src 'self' 'unsafe-eval'",
                "style-src   'self' 'unsafe-inline' *",
                "script-src  'self' 'unsafe-inline' 'unsafe-eval' *",
                "img-src     'self' data: blob: *",
                "media-src   'self' data: blob: *",
                "connect-src data:",
            ].join('; ');

            create_element({
                parent: document.head,
                tag:    'meta',
                attrs: {
                    "http-equiv": "Content-Security-Policy",
                    "content":    csp_header_content,
                },
            });
        }
    }

    #setup_header() {
        if (!this.header_element) {
            throw new Error(`bad format for document: header element does not exist`);
        }
        const get_recents = null;//!!! implement this
        this.#menubar = MenuBar.create(this.header_element, get_menubar_spec(), get_global_initial_key_map_bindings, get_recents);
        //!!! this.#menubar_commands_subscription is never unsubscribed
        this.#menubar_commands_subscription = this.#menubar.commands.subscribe(this.#menubar_commands_observer.bind(this));
        //!!! this.#menubar_selects_subscription is never unsubscribed
        this.#menubar_selects_subscription = this.#menubar.selects.subscribe(this.update_menu_state.bind(this));

        // add a tool-bar element to the header document
        this.#tool_bar = ToolBarElement.create_for(this.#header_element, {
            /*!!! autoeval: {
                initial: this.autoeval,
                on: (event) => {
                    this.set_autoeval(!this.autoeval);
                    return true;
                }, !!!*/
            modified: true,
            running:  true,
        });
        this.#header_element.appendChild(this.#tool_bar);
    }


    // === SAVE HANDLING ====

    static #essential_elements_selector = [
        EvalCellElement.custom_element_name,         // html tag (i.e., type)
        `.${EvalCellElement.output_element_class}`,  // css class
    ].join(',');

    #save_serializer() {
        const queried_main_element = document.querySelector(this.constructor.main_element_tag);
        if (!queried_main_element || queried_main_element !== this.main_element) {
            throw new Error('bad format for document');
        }
        if (!this.main_element) {
            throw new Error('bad format for document: this.main_element not set');
        }
        const contents = [ ...this.main_element.querySelectorAll(this.constructor.#essential_elements_selector) ]
              .map(e => (e instanceof EvalCellElement) ? e.get_outer_html() : e.outerHTML)
              .join('\n');
        return `\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <script type="module" src="../dist/main.js"></script>
</head>
<body>
${contents}
</body>
</html>
`;
}

    get_suggested_file_name() {
        return window.location.pathname.split('/').slice(-1)[0];
    }


    // === RESIZE HANDLING ===

    #enter_resize_mode(mousedown_event) {
        if (!this.active_cell) {
            // the this.active_cell is used to with getComputedStyle() to retrieve current split in px
            throw new Error('resize failed: no active cell');
        }
        mousedown_event.preventDefault();
        mousedown_event.stopPropagation();

        const max_split_ratio      = 0.85;  // always leave some room for output elements
        const collapse_split_ratio = 0.01;  // point at which cell contents collapses, leaving only output showing

        const main_element_computed_style = window.getComputedStyle(this.#main_element);
        const main_element_margin_left_px = parseFloat(main_element_computed_style.marginLeft);
        const main_element_width_px       = parseFloat(main_element_computed_style.width);
        // note: parseFloat() stops at the first non-number character, e.g., the trailing "px"
        const left_limit_px  = main_element_margin_left_px;
        const right_limit_px = left_limit_px + max_split_ratio*main_element_width_px;

        // keep showing "hover" state even if mouse moves away from the resize handle
        this.#resize_handle_element.classList.add(this.constructor.resize_handle_dragging_state_class);

        let current_x = mousedown_event.x;
        const resize_handler = (event) => {
            const dx = (current_x < left_limit_px || current_x > right_limit_px) ? 0 : (event.x - current_x);
            current_x = event.x;
            const active_cell_input_container = this.constructor.#cell_input_container_element(this.active_cell);
            const current_split_px = parseFloat(window.getComputedStyle(active_cell_input_container).width);
            const new_split_px = current_split_px + dx;
            const new_split = (new_split_px < 0) ? `0px` : `${new_split_px}px`;
            document.documentElement.style.setProperty(this.constructor.input_output_split_css_variable, new_split);
            // update collapsed state
            if (new_split_px <= collapse_split_ratio*main_element_width_px) {
                this.#main_element.classList.add(this.constructor.collapse_cells_state_class);
            } else {
                this.#main_element.classList.remove(this.constructor.collapse_cells_state_class);
            }
        };
        document.addEventListener('mousemove', resize_handler);  // remove in 'mouseup' handler
        document.addEventListener('mouseup', (event) => {
            // note: 'mouseup' event is fired if the user switches windows while dragging
            document.removeEventListener('mousemove', resize_handler);
            this.#resize_handle_element.classList.remove(this.constructor.resize_handle_dragging_state_class);
        }, {
            once: true,
        });
    }


    // === CELL ELEMENT STRUCTURE ===

    static cell_container_class       = 'cell-container';
    static cell_input_container_class = 'cell-input-container';

    /** create the element structure to contain a cell and its output_element
     *  @param {null|undefined|Object} options: {
     *      parent?: Node,  // default: this.main_element
     *      before?: Node,  // default: null
     *  }
     *  @return {Object} structure_details: {
     *      cell_container:        HTMLElement,  // the container element of the structure
     *      cell_input_container:  HTMLElement,  // the input subcontainer element of the structure
     *      cell_parent:           HTMLElement,  // parent for cell
     *      cell_before:           HTMLElement,  // null or element before which to put cell
     *      output_element_parent: HTMLElement,  // parent for output_element
     *      output_element_before: HTMLElement,  // null or element before which to put output_element
     *  }
     */
    #create_cell_element_structure(options=null) {
        const {
            parent = this.main_element,
            before = null,
        } = (options ?? {});
        const cell_container = create_element({ parent, before });
        cell_container.classList.add(this.constructor.cell_container_class);
        const cell_input_container = create_element({ parent: cell_container });
        cell_input_container.classList.add(this.constructor.cell_input_container_class);
        const cell_parent = cell_input_container;
        const cell_before = null;  // i.e., append
        const output_element_parent = cell_container;
        const output_element_before = null;  // i.e., append
        return {
            cell_container,
            cell_input_container,
            cell_parent,
            cell_before,
            output_element_parent,
            output_element_before,
        };
    }

    static #cell_container_element(cell) {
        if (!(cell instanceof EvalCellElement)) {
            throw new Error('cell must be an instance of EvalCellElement');
        }
        const cell_container = cell.parentElement?.parentElement;
        if (!cell_container || !cell_container.parentElement || !cell_container.classList.contains(this.cell_container_class)) {
            throw new Error('incorrect cell structure');
        }
        return cell_container;
    }

    static #cell_input_container_element(cell) {
        const cell_container = this.#cell_container_element(cell);
        const cell_input_container = cell_container.querySelector(`.${this.cell_input_container_class}`);
        if (!cell_input_container) {
            throw new Error('incorrect cell structure');
        }
        return cell_input_container;
    }

    // mapping from this editor cell element to the element on which "data-active" will be set
    static active_element_mapper(editor_element) {
        return this.#cell_container_element(editor_element);
    }


    // === MENU AND COMMAND CONFIGURATION ===

    // === COMMAND HANDLER INTERFACE ===

    inject_key_event(key_event) {
        if (!this.contains(key_event.target)) {
            // try to set target to the currently active cell
            const active_cell = LogbookManager.singleton.active_cell;
            if (active_cell) {
                // this is a clumsy clone of event, but it will only be used internally from this point
                // the goal is to clone the event but change target and currentTarget
                key_event = {
                    ...key_event,  // captures almost nothing, e.g., just the "isTrusted" property

                    key:           key_event.key,       // non-enumerable getter
                    metaKey:       key_event.metaKey,   // non-enumerable getter
                    ctrlKey:       key_event.ctrlKey,   // non-enumerable getter
                    shiftKey:      key_event.shiftKey,  // non-enumerable getter
                    altKey:        key_event.altKey,    // non-enumerable getter

                    preventDefault:  event.preventDefault.bind(event),
                    stopPropagation: event.stopPropagation.bind(event),

                    target:        active_cell,
                    currentTarget: active_cell,
                };
            }
        }
        this.#key_event_manager.inject_key_event(key_event);
    }

    #command_observer(command_context) {
        if (command_context.target instanceof HTMLTextAreaElement) {
            // patch command_context.target to be the cell itself
            // this is a kludge, but is necessary when key bindings
            // are activated on the contained textarea
            command_context = {
                ...command_context,
                target: command_context.target.parentElement,
            };
        }
        try {
            const success = this.perform_command(command_context);
            if (!success) {
                beep();
            }
        } catch (error) {
            console.error('error processing command', command_context, error);
            beep();
        }
    }

    perform_command(command_context) {
        if (!command_context) {
            return false;  // indicate: command not handled
        } else {
            const target = command_context.target;
            if (!target) {
                return false;  // indicate: command not handled
            } else {
                const bindings_fn = this.#command_bindings[command_context.command];
                if (!bindings_fn) {
                    return false;  // indicate: command not handled
                } else {
                    return bindings_fn(command_context);
                }
            }
        }
    }

    update_menu_state() {
        const cells        = this.constructor.get_cells();
        const active_cell  = this.active_cell;
        const active_index = cells.indexOf(active_cell);
        const editable     = this.editable;

        /*
          'save'  // directly handled in this.#neutral_changes_observer()
        */

        this.#menubar.set_menu_state('clear',      { enabled: editable });
        this.#menubar.set_menu_state('reset',      { enabled: editable });
        this.#menubar.set_menu_state('reset-cell', { enabled: editable });

        this.#menubar.set_menu_state('focus-up',   { enabled: (active_cell && active_index > 0) });
        this.#menubar.set_menu_state('focus-down', { enabled: (active_cell && active_index < cells.length-1) });
        this.#menubar.set_menu_state('move-up',    { enabled: (active_cell && active_index > 0) });
        this.#menubar.set_menu_state('move-down',  { enabled: (active_cell && active_index < cells.length-1) });
        this.#menubar.set_menu_state('add-before', { enabled: editable && active_cell });
        this.#menubar.set_menu_state('add-after',  { enabled: editable && active_cell });
        this.#menubar.set_menu_state('delete',     { enabled: editable && active_cell });

        this.#menubar.set_menu_state('eval-and-refocus', { enabled: editable && active_cell });
        this.#menubar.set_menu_state('eval',             { enabled: editable && active_cell });
        this.#menubar.set_menu_state('eval-before',      { enabled: editable && active_cell });
        this.#menubar.set_menu_state('eval-all',         { enabled: editable && active_cell });

        this.#menubar.set_menu_state('stop',     { enabled: active_cell?.can_stop });
        this.#menubar.set_menu_state('stop-all', { enabled: cells.some(cell => cell.can_stop) });

        /*
          recents
        */
    }

    #menubar_commands_observer(command_context) {
        const target = this.active_cell;
        if (!target) {
            beep();
        } else if (!(target instanceof EvalCellElement)) {
            beep();
        } else {
            // set target in command_context to be the active cell
            const updated_command_context = {
                ...command_context,
                target,
            };
            this.perform_command(updated_command_context);
        }
    }


    // === NEUTRAL CHANGES OBSERVER ===

    #neutral_changes_observer(data) {
        const {
            neutral,
        } = data;
        this.#tool_bar.set_for('modified', !neutral);
        this.#menubar.set_menu_state('save', { enabled: !neutral });
    }


    // === EVAL STATES ===

    emit_eval_state(cell, eval_state) {
        this.#eval_states.dispatch({ cell, eval_state });
    }

    #eval_states_observer(data) {
        // data is ignored
        const {
            cell,
            eval_state,
        } = data;
        const something_foreground = this.constructor.get_cells().some(cell => cell.evaluator_foreground);
        this.#tool_bar.set_for('running', something_foreground);
    }


    // === COMMAND HANDLERS ===

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__create_cell(command_context) {
        let before = null;
        const next_cell = command_context.target?.adjacent_cell?.(true);
        if (next_cell) {
            before = this.constructor.#cell_container_element(next_cell);
        }
        const cell = this.create_cell({ before });
        if (!cell) {
            return false;
        } else {
            cell.focus();
            return true;
        }
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__reset_cell(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            cell.reset();
            return true;
        }
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__reset(command_context) {
        this.reset();
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    async command_handler__clear(command_context) {
        if (!await ConfirmDialog.run('Clear document?')) {
            this.active_cell?.focus();
            return false;
        }
        this.clear();
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    async command_handler__save(command_context) {
        const save_result = await fs_interface.save(this.#save_serializer.bind(this), {
            file_handle: this.#file_handle,
            prompt_options: {
                suggestedName: this.get_suggested_file_name(),//!!!
            },
        });
        const {
            canceled,
            file_handle,
            stats,
        } = save_result;
        if (!canceled) {
            //!!!
            this.#file_handle = file_handle ?? undefined;
        }
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    async command_handler__save_as(command_context) {
        this.#file_handle = undefined;
        await fs_interface.save(this.#save_serializer.bind(this), {
            prompt_options: {
                suggestedName: this.get_suggested_file_name(),//!!!
            },
        });
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__show_settings_dialog(command_context) {
        SettingsDialog.run();
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    async command_handler__eval(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            await cell.eval({
                eval_context: LogbookManager.singleton.global_eval_context,
            });
            return true;
        }
    }

    /** eval target cell and refocus to next cell (or a new one if at the end of the document)
     *  @return {Boolean} true iff command successfully handled
     */
    async command_handler__eval_and_refocus(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            await cell.eval({
                eval_context: this.global_eval_context,
            });
            const next_cell = cell.adjacent_cell(true) ?? this.create_cell();
            next_cell.focus();
            return true;
        }
    }

    /** reset global eval context and then eval all cells in the document
     *  from the beginning up to but not including the target cell.
     *  @return {Boolean} true iff command successfully handled
     */
    async command_handler__eval_before(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            this.reset_global_eval_context();
            for (const iter_cell of this.constructor.get_cells()) {
                iter_cell.focus();
                if (iter_cell === cell) {
                    break;
                }
                await iter_cell.eval({
                    eval_context: this.global_eval_context,
                });
            }
            return true;
        }
    }

    /** stop all running evaluations, reset global eval context and then eval all cells in the document
     *  from first to last, and set focus to the last.
     *  @return {Boolean} true iff command successfully handled
     */
    async command_handler__eval_all(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            this.stop();
            this.reset_global_eval_context();
            for (const iter_cell of this.constructor.get_cells()) {
                iter_cell.focus();
                await iter_cell.eval({
                    eval_context: this.global_eval_context,
                });
            }
            return true;
        }
    }

    /** set the active cell's input_type to "markdown".
     *  @return {Boolean} true iff command successfully handled
     */
    command_handler__set_mode_markdown(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            cell.input_type = 'markdown';
            return true;
        }
    }

    /** set the active cell's input_type to "tex".
     *  @return {Boolean} true iff command successfully handled
     */
    command_handler__set_mode_tex(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            cell.input_type = 'tex';
            return true;
        }
    }

    /** set the active cell's input_type to "javascript".
     *  @return {Boolean} true iff command successfully handled
     */
    command_handler__set_mode_javascript(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            cell.input_type = 'javascript';
            return true;
        }
    }

    /** stop evaluation for the active cell.
     *  @return {Boolean} true iff command successfully handled
     */
    command_handler__stop(command_context) {
        const cell = command_context.target;
        if (!cell || !(cell instanceof EvalCellElement)) {
            return false;
        } else {
            cell.stop();
            return true;
        }
    }

    /** stop all running evaluations.
     *  @return {Boolean} true iff command successfully handled
     */
    command_handler__stop_all(command_context) {
        this.stop();
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__focus_up(command_context) {
        const focus_cell = command_context.target.adjacent_cell(false);
        if (!focus_cell) {
            return false;
        } else {
            focus_cell.focus();
            return true;
        }
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__focus_down(command_context) {
        const focus_cell = command_context.target.adjacent_cell(true);
        if (!focus_cell) {
            return false;
        } else {
            focus_cell.focus();
            return true;
        }
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__move_up(command_context) {
        const cell = command_context.target;
        if (!cell) {
            return false;
        } else {
            const previous = cell.adjacent_cell(false);
            if (!previous) {
                return false;
            } else {
                // beacause we are storing the cell, toolbar and output element
                // in an element structure, just move the entire structure instead
                // of using cell.move_cell()
                const cell_container = this.constructor.#cell_container_element(cell);
                const parent = cell_container.parentElement;
                const before = this.constructor.#cell_container_element(previous);
                move_node(cell_container, { parent, before });
                cell.focus();
                return true;
            }
        }
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__move_down(command_context) {
        const cell = command_context.target;
        if (!cell) {
            return false;
        } else {
            const next = cell.adjacent_cell(true);
            if (!next) {
                return false;
            } else {
                // beacause we are storing the cell, toolbar and output element
                // in an element structure, just move the entire structure instead
                // of using cell.move_cell()
                const cell_container = this.constructor.#cell_container_element(cell);
                const parent = cell_container.parentElement;
                const before = this.constructor.#cell_container_element(next).nextSibling;
                move_node(cell_container, { parent, before });
                cell.focus();
                return true;
            }
        }
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__add_before(command_context) {
        const cell = command_context.target;
        if (!cell) {
            return false;
        }
        const cell_container = this.constructor.#cell_container_element(cell);
        const new_cell = this.create_cell({
            before: cell_container,
        });
        new_cell.focus();
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__add_after(command_context) {
        const cell = command_context.target;
        if (!cell) {
            return false;
        }
        const cell_container = this.constructor.#cell_container_element(cell);
        const new_cell = this.create_cell({
            before: cell_container.nextSibling,
            parent: cell_container.parentElement,  // necessary if before is null
        });
        new_cell.focus();
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    async command_handler__delete(command_context) {
        const cell = command_context.target;
        if (!cell) {
            return false;
        }
        if (cell.get_text().trim().length > 0 || cell.output_element?.firstChild) {
            if (!await ConfirmDialog.run('Cannot undo delete of non-empty cell.\nContinue?')) {
                cell.focus();
                return false;
            }
        }
        let next_cell = cell.adjacent_cell(true) ?? cell.adjacent_cell(false);
        // beacause we are storing the cell, toolbar and output element
        // in an element structure, just remove the entire structure instead
        // of using cell.remove_cell()
        this.constructor.#cell_container_element(cell).remove();
        if (!next_cell) {
            next_cell = this.create_cell();
        }
        // this will re-set this.active_cell
        next_cell.focus();
        return true;
    }
}


// === INITIALIZATION FAILED DISPLAY ===

export function show_initialization_failed(error) {
    console.error('initialization failed', error.stack);
    clear_element(document.body);
    const error_h1 = document.createElement('h1');
    error_h1.innerText = 'Initialization Failed';
    const error_pre = document.createElement('pre');
    error_pre.classList.add('error-message');
    error_pre.innerText = error.stack;
    document.body.appendChild(error_h1);
    document.body.appendChild(error_pre);
}
