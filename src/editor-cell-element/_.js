const current_script_url = import.meta.url;  // save for later

import {
    manage_selection_for_insert,
    manage_selection_for_delete,
    insert_at,
    delete_nearest_leaf,
    validate_parent_and_before_from_options,
    create_element,
    create_stylesheet_link,
} from '../../lib/ui/dom-util.js';

import {
    logbook_manager,
} from '../logbook-manager.js';

import {
    EventListenerManager,
} from '../../lib/sys/event-listener-manager.js';

import {
    KeyEventManager,
    KeyMap,
} from '../../lib/ui/key/_.js';

import {
    ChangeManager,
} from '../../lib/ui/change-manager.js';

import {
    StatusBarElement,
} from '../status-bar-element/_.js';

import {
    beep,
} from '../../lib/ui/beep.js';


export class EditorCellElement extends HTMLElement {
    static custom_element_name = 'editor-cell';

    constructor() {
        super();
        this.#event_listener_manager = new EventListenerManager();

        this.#key_event_manager = new KeyEventManager(this, this.#command_observer.bind(this));
        this.#command_bindings  = this.get_command_bindings();

        const key_map = new KeyMap(this.constructor.get_initial_key_map_bindings(), this.constructor.key_map_insert_self_recognizer);
        this.push_key_map(key_map);

        // _status_bar is used instead of #status_bar so that subclasses have access (see establish_status_bar())
        this._status_bar = null;
    }
    #event_listener_manager;
    #key_event_manager;
    #command_bindings;


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

    static key_map_insert_self_recognizer(key_spec) {
        return (key_spec.is_printable ? 'insert-self' : false);
    }

    // === STATUS BAR ===

    async establish_status_bar() {
        if (!this._status_bar) {
            this._status_bar = await StatusBarElement.create_for(this, {
                autohide: { initial: true,  on: (event) => console.log('AUTOHIDE', event) },//!!!
                autoeval: { initial: false, on: (event) => console.log('AUTOEVAL', event) },//!!!
                modified: true,
            });
            this.parentElement.insertBefore(this._status_bar, this);
        }
    }

    remove_status_bar() {
        if (this._status_bar) {
            this._status_bar.remove();
            this._status_bar = undefined;
        }
    }


    // === DOM ===

    /** return the first and last elements in the DOM that are associated with this editor-cell
     *  @return {Object|null} null if this is not in the DOM body, otherwise { first: Element, last: Element }
     */
    get_dom_extent() {
        if (document.body === this || !document.body?.contains(this)) {
            return null;  // indicate: not in DOM body
        } else {
            let first = this,
                last  = this;
            if (this._status_bar) {
                if (first.compareDocumentPosition(this._status_bar) & Node.DOCUMENT_POSITION_PRECEDING) {
                    first = this._status_bar;
                }
                if (last.compareDocumentPosition(this._status_bar) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    last = this._status_bar;
                }
            }
            return { first, last };
        }
    }

    /** create a new EditorCellElement instance with standard settings
     *  @param {null|undefined|Object} options: {
     *      parent?:   Node,    // default: document.body
     *      before?:   Node,    // default: null
     *      innerText: String,  // cell.innerText to set
     *  }
     *  @return {EditorCellElement} new cell
     */
    static async create_cell(options=null) {
        const {
            parent = document.body,
            before = null,
            innerText,
        } = (options ?? {});

        const cell = create_element({
            parent,
            before,
            tag: this.custom_element_name,
            attrs: {
                tabindex: 0,  // permit focus
                contenteditable: 'true',
            },
        });

        if (innerText) {
            cell.innerText = innerText;
        }

        await cell.establish_status_bar();

        return cell;
    }

    /** return the next cell in the document with this.tagName, or null if none
     *  @param {Boolean} forward (default false) if true, return the next cell, otherwise previous
     *  @return {null|Element} the adjacent cell, or null if not found
     */
    adjacent_cell(forward=false) {
        // note that this.tagName is a selector for elements with that tag name
        const cells = [ ...document.querySelectorAll(this.tagName) ];
        const index = cells.indexOf(this);
        if (index === -1) {
            return null
        } else {
            if (forward) {
                if (index >= cells.length-1) {
                    return null;
                } else {
                    return cells[index+1];
                }
            } else {
                if (index <= 0) {
                    return null;
                } else {
                    return cells[index-1];
                }
            }
        }
    }

    /** move (or remove) this cell within the DOM
     *  @param {null|undefined|Object} options: {
     *      parent?: Node,  // default: null  // new parent, or null/undefined to remove
     *      before?: Node,  // default: null  // new before node
     *  }
     */
    move_cell(options=null) {
        const { parent, before } = validate_parent_and_before_from_options(options);
        if (!parent) {
            if (this.parentNode) {
                this.remove_cell();
            }
        } else {
            const had_status_bar = !!this._status_bar;
            this.remove_status_bar();
            parent.insertBefore(this, before);
            if (had_status_bar) {
                this.establish_status_bar();
//!!! the above call to this.establish_status_bar() is async
            }
        }
    }

    /** remove this cell from the DOM
     */
    remove_cell() {
        this.remove_status_bar();
        this.remove();
    }

    /** reset the cell; this base class version does nothing
     *  @return {EvalCellElement} this
     */
    reset() {
        return this;
    }


    // === COMMAND HANDLER INTERFACE ===

    /** return the initial key map bindings
     *  @return {Object} mapping from command strings to arrays of triggering key sequences
     */
    static get_initial_key_map_bindings() {
        return {
            ...logbook_manager.constructor.get_global_initial_key_map_bindings(),

//!!!            'insert-line-break':   [ 'Enter' ],

//!!!            'delete-forward':      [ 'Delete' ],
//!!!            'delete-reverse':      [ 'Backspace' ],
//!!!            'delete-text-forward': [ 'Alt-Delete' ],
//!!!            'delete-text-reverse': [ 'Alt-Backspace' ],

//!!!            'cut':                 [ 'CmdOrCtrl-X' ],
//!!!            'copy':                [ 'CmdOrCtrl-C' ],
//!!!            'paste':               [ 'CmdOrCtrl-V' ],
        };
    }

    /** return command bindings for this cell
     *  @return {Object} mapping from command strings to functions implementing that command
     * The bindings are obtained by merging local command bindings with logbook_manager
     * command bindings.
     */
    get_command_bindings() {
        const command_bindings = {
            ...logbook_manager.get_global_command_bindings(),

            'insert-self':         this.command_handler__insert_self.bind(this),
            'insert-line-break':   this.command_handler__insert_line_break.bind(this),

            'delete-text-forward': this.create_command_handler___delete({ element_too: false, reverse: false }),
            'delete-text-reverse': this.create_command_handler___delete({ element_too: false, reverse: true  }),
            'delete-forward':      this.create_command_handler___delete({ element_too: true,  reverse: false }),
            'delete-reverse':      this.create_command_handler___delete({ element_too: true,  reverse: true  }),

            'cut':                 this.command_handler__cut.bind(this),
            'copy':                this.command_handler__copy.bind(this),
            'paste':               this.command_handler__paste.bind(this),

            'reset-cell':          this.command_handler__reset_cell.bind(this),
        };

        return command_bindings;
    }

    #command_observer(command_context) {
        this.perform_command(command_context)
            .then(success => {
                if (!success) {
                    beep();
                }
            })
            .catch(error => {
                console.error('error processing command', command_context, error);
                beep();
            });
    }

    async perform_command(command_context) {
        if (!command_context) {
            return false;  // indicate: command not handled
        } else {
            const target = command_context.target;
            if (!target || !this.contains(target)) {
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

    // === COMMAND HANDLERS ===

    /** @return {Boolean} true iff command successfully handled
     */
    command_handler__insert_self(command_context) {
        const key_spec = command_context.key_spec;
        const text = key_spec?.key ?? key_spec?.canonical ?? '';
        if (!text) {
            return false;
        } else {
            return manage_selection_for_insert(
                (point) => insert_at(point, text)
            );
        }
    }

    command_handler__insert_line_break(command_context) {
        return manage_selection_for_insert(
//            (point) => insert_at(point, document.createElement('br'))
            (point) => insert_at(point, '\n')
        );
    }

    create_command_handler___delete(options) {
        return (command_context) => {
            return manage_selection_for_delete(
                (point) => delete_nearest_leaf(point, options)
            );
        };
    }

    async command_handler__cut(command_context) {
        document.execCommand('cut');  // updates selection
        return true;
    }

    async command_handler__copy(command_context) {
        document.execCommand('copy');  // updates selection
        return true;
    }

    async command_handler__paste(command_context) {
        //!!! THIS NO LONGER WORKS: return document.execCommand('paste');  // updates selection
        //!!! Also, the following does not work on Firefox:
        const text = await navigator.clipboard.readText();
        if (!text) {
            return false;
        } else {
            return manage_selection_for_insert(
                (point) => insert_at(point, text)
            );
        }
    }

    async command_handler__reset_cell(command_context) {
        this.reset();
        return true;
    }


    // === FOCUS HANDLERS ===

    #connect_focus_listeners() {
        if (this.#event_listener_manager.empty()) {
            function focus_handler(event) {
                logbook_manager.set_active_cell(this);
            }
            const listener_specs = [
                [ this, 'focus', focus_handler, { capture: true } ],
            ];
            for (const [ target, type, listener, options ] of listener_specs) {
                this.#event_listener_manager.add(target, type, listener, options);
            }
        }
    }

    #disconnect_focus_listeners() {
        this.#event_listener_manager.remove_all();
    }


    // === WEB COMPONENT LIFECYCLE ===

    // connectedCallback:
    //     Invoked each time the custom element is appended into a document-connected element.
    //     This will happen each time the node is moved, and may happen before the element's contents have been fully parsed.
    //     Note: connectedCallback may be called once your element is no longer connected, use Node.isConnected to make sure.
    connectedCallback() {
console.log('COMPONENT CONNECTED', this);//!!!
        this.#connect_focus_listeners();
        this.#key_event_manager.attach();
    }

    // disconnectedCallback:
    //     Invoked each time the custom element is disconnected from the document's DOM.
    disconnectedCallback() {
console.log('COMPONENT DISCONNECTED', this);//!!!
        this.#disconnect_focus_listeners();
        this.#key_event_manager.detach();
    }

    // adoptedCallback:
    //     Invoked each time the custom element is moved to a new document.
    adoptedCallback() {
console.log('COMPONENT ADOPTED', this);//!!!
        this.#connect_focus_listeners();
        this.#key_event_manager.attach();
    }

    // attributeChangedCallback:
    //     Invoked each time one of the custom element's attributes is added, removed, or changed.
    //     Which attributes to notice change for is specified in a static get observedAttributes method
    attributeChangedCallback(name, old_value, new_value) {
console.log('COMPONENT ATTRIBUTE CHANGED', this, { name, old_value, new_value });//!!!
        switch (name) {
        case 'xyzzy': {
            //!!!
            break;
        }
        }
        //!!!
    }

    static get observedAttributes() {
        return [
            'xyzzy',//!!!
        ];
    }


    // === INTERNAL ===

    // Safari does not support static initialization blocks in classes (at the time of writing), so do it this way:
    static _init_static() {
        globalThis.customElements.define(this.custom_element_name, this);
        //!!! should we assume that the document is ready here?
        create_stylesheet_link(document.head, new URL('style.css', current_script_url));
    }
}

// Safari does not support static initialization blocks in classes (at the time of writing), so do it this way:
EditorCellElement._init_static();