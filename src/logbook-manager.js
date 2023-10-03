import {
    EvalCellElement,
} from './eval-cell-element/_.js';

import {
    ToolBarElement,
} from './tool-bar-element/_.js';

import {
    get_menubar_spec,
} from './global-bindings.js';

import {
    Subscribable,
} from '../lib/sys/subscribable.js';

import {
    create_element,
    clear_element,
    move_node,
} from '../lib/ui/dom-util.js';

import {
    MenuBar,
} from '../lib/ui/menu/_.js';

import {
    ChangeManager,
} from '../lib/ui/change-manager.js';

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


// Note: Each eval-cell maintains its own key_event_manager and key maps.
// Therefore the (active) eval-cell is the locus for incoming commands,
// whether from the menu or the keyboard.  The eval-cell in effect "precompiles"
// command dispatch in eval_cell.get_command_bindings().


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
        this.#editable = false;
        this.#active_cell = null;
        this.#initialize_called = false;
        this.reset_global_eval_context();
        this.#eval_states = new Subscribable();
        //!!! this.#eval_states_subscription is never unsubscribed
        this.#eval_states_subscription = this.#eval_states.subscribe(this.#eval_states_observer.bind(this));

    }
    #editable;
    #active_cell;
    #initialize_called;
    #header_element;  // element inserted into document by initialize() to hold menus, etc
    #main_element;    // element wrapped around original body content by initialize()
    #eval_states;
    #eval_states_subscription;
    #menubar;
    #menubar_commands_subscription;
    #menubar_selects_subscription;
    #tool_bar;
    #global_eval_context;  // persistent eval_context for eval commands
    #global_change_manager;
    #file_handle;

    get editable (){ return this.#editable }
    set_editable(editable) {
        editable = !!editable;
        this.#editable = editable;
        this.#menubar.set_menu_state('toggle-editable', { checked: editable });
        this.#tool_bar.set_for('editable', editable);
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

    /** clear the current document and set "editable"
     */
    clear() {
        clear_element(this.main_element);
        this.set_editable(true);
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

            // Set up this.#global_change_manager now so that it is available
            // during initialization of cells.  It will be reset when document
            // initialization is complete.
            this.#global_change_manager = new ChangeManager(this.main_element, {
                neutral_changes_observer: this.#neutral_changes_observer.bind(this),
            });

            // add "changes may not be saved" prompt for when document is being closed while modified
            window.addEventListener('beforeunload', (event) => {
                if (!this.#global_change_manager.is_neutral()) {
                    event.preventDefault();
                    return (event.returnValue = '');
                }
            });  //!!! event handler never removed

            // make dblclick on top-level tool-bar toggle editable
            document.body.addEventListener('dblclick', (event) => {
                const target_is_body     = (event.target === document.body);
                const target_is_header   = (event.target === this.header_element);
                const target_is_tool_bar = event.target instanceof ToolBarElement;  // handle only if target is directly the tool-bar, not one of its children
                if (target_is_body || target_is_header || target_is_tool_bar) {
                    // event will be handled
                    if (target_is_body) {
                        this.active_cell.focus();
                    } else {
                        const target_is_top_level_tool_bar = target_is_tool_bar && (event.target.parentElement === this.header_element);
                        if (target_is_header || target_is_top_level_tool_bar) {
                            this.set_editable(!this.editable);
                        } else {  // !target_is_body && !target_is_header && !target_is_top_level_tool_bar && target_is_tool_bar
                            const cell = event.target.target;
                            if (!this.editable) {
                                beep();
                            } else {
                                cell.set_visible(!cell.visible);
                            }
                        }
                    }

                    event.preventDefault();
                    event.stopPropagation();
                }
            }, {
                capture: true,
            });  //!!! event handler never removed

            // make click and dblclick in document.body or document.documentElement focus active cell
            for (const click_event of [ 'click', 'dblclick' ]) {
                document.documentElement.addEventListener(click_event, (event) => {
                    if (event.target === document.body || event.target.contains(document.body)) {
                        this.active_cell.focus();
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }, {
                    capture: true,
                });  //!!! event handler never removed
            }

            // send keydown events destined for document.body to the active cell's key_event_manager
            document.body.addEventListener('keydown', (event) => {
                if (event.target === document.body) {
                    this.active_cell?.inject_key_event(event);
                    event.preventDefault();
                    event.stopPropagation();
                }
            });  //!!! event handler never removed

            // set baseline for undo/redo
            // it is important that all async operations have finished before getting here
            this.#global_change_manager.set_neutral();

        } catch (error) {
            show_initialization_failed(error);
        }
    }


    // === DOCUMENT UTILITIES ===

    static header_element_tag = 'header';
    static main_element_tag   = 'main';

    /** create a new cell in the document
     *  @param (Object|null|undefined} options
     *  @return {EvalCellElement} cell
     * options is passed to EvalCellElement.create_cell() but
     * with "parent", "before" and "output_element" overridden.
     * The new cell is put within an element structure.
     * "parent" and "before" are used to create the cell structure,
     * and "output_element" is ignored.
     */
    create_cell(options=null) {
        options ??= {};
        if (options.output_element) {
            console.warn('options.output_element ignored');
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
            ...options,
            parent: cell_parent,
            before: cell_before,
            output_element,
        });
        return cell;
    }

    /** return an ordered list of the EvalCellElement (eval-cell) cells in the document
     *  @return {Array} the cells in the document
     * Note that EditorCellElement elements are not returned even though
     * EditorCellElement is a base class of EvalCellElement.  This is not ambiguous
     * because they have different tag names (editor-cell vs eval-cell).
     */
    static get_cells() {
        return [ ...document.getElementsByTagName(EvalCellElement.custom_element_name) ];
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
              .map(e => e.outerHTML)
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

    get_suggested_file_name() {
        return window.location.pathname.split('/').slice(-1)[0];
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
     *      outer:                 HTMLElement,  // the outermost element of the structure
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
        const outer = create_element({ parent, before });
        outer.classList.add(this.constructor.cell_container_class);
        const cell_parent = create_element({ parent: outer });
        cell_parent.classList.add(this.constructor.cell_input_container_class);
        const cell_before = null;  // i.e., append
        const output_element_parent = outer;
        const output_element_before = null;  // i.e., append
        return {
            outer,
            cell_parent,
            cell_before,
            output_element_parent,
            output_element_before,
        };
    }

    #cell_outer_element(cell) {
        if (!(cell instanceof EvalCellElement)) {
            throw new Error('cell must be an instance of EvalCellElement');
        }
        const outer = cell.parentElement?.parentElement;
        if (!outer || !outer.parentElement) {
            throw new Error('incorrent cell structure');
        }
        return outer;
    }


    // === MENU AND COMMAND CONFIGURATION ===

    update_menu_state() {
        const cells        = this.constructor.get_cells();
        const active_cell  = this.active_cell;
        const active_index = cells.indexOf(active_cell);
        const can_undo     = this.#global_change_manager.can_perform_undo;
        const can_redo     = this.#global_change_manager.can_perform_redo;
        const editable     = this.editable;

        /*
          'toggle-editable'  // directly handled in this.set_editable()
          'save'  // directly handled in this.#neutral_changes_observer()
        */

        this.#menubar.set_menu_state('clear',      { enabled: editable });
        this.#menubar.set_menu_state('reset',      { enabled: editable });
        this.#menubar.set_menu_state('reset-cell', { enabled: editable });

        this.#menubar.set_menu_state('undo', { enabled: can_undo });
        this.#menubar.set_menu_state('redo', { enabled: can_redo });

        this.#menubar.set_menu_state('toggle-cell-visible', { enabled: editable, checked: active_cell?.visible });

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

    #setup_header() {
        if (!this.header_element) {
            throw new Error(`bad format for document: header element does not exist`);
        }
        const get_command_bindings = () => EvalCellElement.get_initial_key_map_bindings();
        const get_recents = null;//!!! implement this
        this.#menubar = MenuBar.create(this.header_element, get_menubar_spec(), get_command_bindings, get_recents);
        //!!! this.#menubar_commands_subscription is never unsubscribed
        this.#menubar_commands_subscription = this.#menubar.commands.subscribe(this.#menubar_commands_observer.bind(this));
        //!!! this.#menubar_selects_subscription is never unsubscribed
        this.#menubar_selects_subscription = this.#menubar.selects.subscribe(this.update_menu_state.bind(this));

        // add a tool-bar element to the header document
        this.#tool_bar = ToolBarElement.create_for(this.#header_element, {
            editable: { initial: this.editable,  on: (event) => { this.set_editable(event.target.get_state()); return true; } },
            /*!!! autoeval: {
                initial: this.autoeval,
                on: (event) => {
                    if (!this.editable) {
                        beep();
                        return false;
                    }
                    this.set_autoeval(!this.autoeval);
                    return true;
                }, !!!*/
            modified: true,
            running:  true,
        });
        this.#header_element.appendChild(this.#tool_bar);
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
            target.perform_command(updated_command_context);
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
        if (!this.editable) {
            return false;
        }
        let before = null;
        const next_cell = command_context.target?.adjacent_cell?.(true);
        if (next_cell) {
            before = this.#cell_outer_element(next_cell);
        }
        const cell = this.create_cell({ before });
        if (!cell) {
            return false;
        } else {
            cell.focus();
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
        if (!this.editable) {
            return false;
        }
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
                const outer = this.#cell_outer_element(cell);
                const parent = outer.parentElement;
                const before = this.#cell_outer_element(previous);
                move_node(outer, { parent, before });
                cell.focus();
                return true;
            }
        }
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__move_down(command_context) {
        if (!this.editable) {
            return false;
        }
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
                const outer = this.#cell_outer_element(cell);
                const parent = outer.parentElement;
                const before = this.#cell_outer_element(next).nextSibling;
                move_node(outer, { parent, before });
                return true;
            }
        }
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__add_before(command_context) {
        if (!this.editable) {
            return false;
        }
        const cell = command_context.target;
        if (!cell) {
            return false;
        }
        const outer = this.#cell_outer_element(cell);
        const new_cell = this.create_cell({
            before: outer,
        });
        new_cell.focus();
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__add_after(command_context) {
        if (!this.editable) {
            return false;
        }
        const cell = command_context.target;
        if (!cell) {
            return false;
        }
        const outer = this.#cell_outer_element(cell);
        const new_cell = this.create_cell({
            before: outer.nextSibling,
            parent: outer.parentElement,  // necessary if before is null
        });
        new_cell.focus();
        return true;
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__delete(command_context) {
        if (!this.editable) {
            return false;
        }
        const cell = command_context.target;
        let next_cell = cell.adjacent_cell(true) ?? cell.adjacent_cell(false);
        // beacause we are storing the cell, toolbar and output element
        // in an element structure, just remove the entire structure instead
        // of using cell.remove_cell()
        this.#cell_outer_element(cell).remove();
        if (!next_cell) {
            next_cell = this.create_cell();
        }
        next_cell.focus();
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
            this.#global_change_manager.set_neutral();
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
    command_handler__undo(command_context) {
        return this.#global_change_manager?.perform_undo();
    }

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__redo(command_context) {
        return this.#global_change_manager?.perform_redo();
    }
}


// === INITIALIZATION FAILED DISPLAY ===

export function show_initialization_failed(error) {
    console.error('initialization failed', error.stack);
    clear_element(document.body);
    const error_h1 = document.createElement('h1');
    error_h1.textContent = 'Initialization Failed';
    const error_pre = document.createElement('pre');
    error_pre.classList.add('error-message');
    error_pre.textContent = error.stack;
    document.body.appendChild(error_h1);
    document.body.appendChild(error_pre);
}
