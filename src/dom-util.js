// We need to save current script url for access later
const current_script_url = import.meta.url;


// === ESCAPE HTML ===

/** escape_for_html(s)
 *  convert all '<' and '>' to their corresponding HTML entities
 *  @param {string} string to be converted
 *  @return {string} converted string
 */
export function escape_for_html(s) {
    return s.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** make_string_literal(s)
 *  @param {string} s
 *  @return {string} string representation of a string literal for s
 */
export function make_string_literal(s) {
    return `'${[ ...s ].map(s => s === "'" ? "\\'" : s).join('')}'`;
}


// === INITIALIZATION FAILED DISPLAY ===

export function show_initialization_failed(error) {
    console.error('initialization failed', error.stack);
    document.body.innerText = '';  // completely reset body
    document.body.classList.add('error');
    const error_h1 = document.createElement('h1');
    error_h1.textContent = 'Initialization Failed';
    const error_pre = document.createElement('pre');
    error_pre.textContent = escape_for_html(error.stack);
    document.body.appendChild(error_h1);
    document.body.appendChild(error_pre);
}


// === ELEMENT CREATION ===

/** set attributes, taken from an object, on an element
 *  @param element {Element} element
 *  @param {Object|undefined|null} attrs
 *  @return {Element} element
 *  Attribute values obtained by calling toString() on the values in attrs
 *  except that values which are undefined are translated to ''.
 */
export function set_element_attributes(element, attrs) {
    if (attrs) {
        if ('id' in attrs && document.getElementById(_attr_value(attrs.id))) {
            throw new Error(`element already exists with id ${attrs.id}`);
        }
        for (const k in attrs) {
            const v = attrs[k];
            element.setAttribute(k, _attr_value(v));
        }
    }
    return element;
}

function _attr_value(v) {
    return (typeof v === 'undefined') ? '' : v.toString();
}

/** create_element(tag_name, attrs)
 *  @param {string} tag_name
 *  @param {Object|undefined|null} attrs
 *  @return {Element} the new element
 *  If attrs contains an "id" entry, then the existing element with that id,
 *  if such an element exists, will be returned instead of a new element.
 *  In either case, the attributes specified in attrs are applied to the
 *  element that is returned.
 */
export function create_element(tag_name, attrs) {
    if (typeof tag_name !== 'string' || tag_name.length <= 0) {
        throw new Error('tag_name must be a non-empty string');
    }
    tag_name = tag_name.toUpperCase();  // normalize for HTML (not XML)

    // check for pre-existing element
    const id = attrs?.id;
    const existing_el = id ? document.getElementById(id) : undefined;
    if (existing_el && existing_el.tagName !== tag_name) {
        throw new Error(`pre-existing element with id "${id}" has tagName "${existing_el.tagName}" but caller specified "${tag_name}"`);
    }

    const el = existing_el ?? document.createElement(tag_name);
    set_element_attributes(el, attrs);
    return el;
}

/** create_child_element(parent, tag_name, attrs, prepend=false)
 *  @param {Element} parent
 *  @param {string} tag_name
 *  @param {Object|undefined|null} attrs
 *  @param {boolean|undefined} prepend instead of append
 *  @return {Element} the new element
 *  If attrs contains an "id" entry, then the existing element with that id,
 *  if such an element exists, will be returned instead of a new element.
 *  In either case, the attributes specified in attrs are applied to the
 *  element that is returned.
 */
export function create_child_element(parent, tag_name, attrs, prepend=false) {
    if (! (parent instanceof Element)) {
        throw new Error('parent must be an Element');
    }
    const el = create_element(tag_name, attrs);
    if (prepend) {
        parent.insertBefore(el, parent.firstChild);
    } else {
        parent.appendChild(el);
    }
    return el;
}

/** create_stylesheet_link(parent, stylesheet_url, attrs)
 *  @param {Element} parent
 *  @param {string} stylesheet_url
 *  @param {Object|undefined|null} attrs
 *  @param {boolean} permit_duplication if true then do not recreate element if already present
 *  @return {HTMLElement} the new <link> element
 */
export function create_stylesheet_link(parent, stylesheet_url, attrs, permit_duplication=false) {
    if (! (parent instanceof Element)) {
        throw new Error('parent must be an Element');
    }
    attrs = attrs ?? {};
    if ('rel' in attrs || 'href' in attrs) {
        throw new Error('attrs must not contain "rel" or "href"');
    }
    let link_element;
    if (!permit_duplication) {
        // note that the duplication does not take into account attrs
        link_element = parent.querySelector(`link[rel="stylesheet"][href="${stylesheet_url.toString().replaceAll('"', '\\"')}"]`);
        // make sure link_element that was found is a direct child of parent
        if (link_element?.parentElement !== parent) {
            link_element = undefined;
        }
    }
    return link_element ?? create_child_element(parent, 'link', {
        rel: "stylesheet",
        href: stylesheet_url,
        ...attrs,
    });
}

/** create_inline_stylesheet(parent, stylesheet_text, attrs)
 *  @param {Element} parent
 *  @param {string} stylesheet_text
 *  @param {Object|undefined|null} attrs
 *  @return {HTMLStyleElement} the new <style> element
 */
export function create_inline_stylesheet(parent, stylesheet_text, attrs) {
    if (! (parent instanceof Element)) {
        throw new Error('parent must be an Element');
    }
    const style_el = create_element('style', attrs);
    style_el.appendChild(document.createTextNode(stylesheet_text));
    parent.appendChild(style_el);
    return style_el;
}

/** create_script(parent, script_url, attrs)
 *  @param {Element} parent
 *  @param {string} script_url
 *  @param {Object|undefined|null} attrs
 *  @param {boolean} permit_duplication if true then do not recreate element if already present
 *  @return {HTMLStyleElement} the new <style> element
 */
export function create_script(parent, script_url, attrs, permit_duplication=false) {
    if (! (parent instanceof Element)) {
        throw new Error('parent must be an Element');
    }
    attrs = attrs ?? {};
    if ('src' in attrs) {
        throw new Error('attrs must not contain "src"');
    }
    let script_element;
    if (!permit_duplication) {
        // note that the duplication does not take into account attrs
        script_element = parent.querySelector(`script[src="${script_url.toString().replaceAll('"', '\\"')}"]`);
        // make sure script_element that was found is a direct child of parent
        if (script_element?.parentElement !== parent) {
            script_element = undefined;
        }
    }
    return script_element ?? create_child_element(parent, 'script', {
        src: script_url,
        ...attrs,
    });
}

/** create_inline_script(parent, script_text, attrs)
 *  @param {Element} parent
 *  @param {string} script_text
 *  @param {Object|undefined|null} attrs
 *  @return {HTMLScriptElement} the new <script> element
 */
export function create_inline_script(parent, script_text, attrs) {
    if (! (parent instanceof Element)) {
        throw new Error('parent must be an Element');
    }
    if (attrs && 'src' in attrs) {
        throw new Error('attrs must not contain "src"');
    }
    const script_el = create_element('script', attrs);
    script_el.appendChild(document.createTextNode(script_text));
    parent.appendChild(script_el);
    return script_el;
}


// === SCRIPT LOADING ===

const _script_promise_data = {};  // map: url -> { promise?: Promise, resolve?: any=>void, reject?: any=>void }

// _establish_script_promise_data(script_url) returns
// { promise_data, initial } where promise_data is
// _script_promise_data[script_url] and initial is true
// iff the promise was newly created.
function _establish_script_promise_data(full_script_url) {
    const data_key = full_script_url.toString();
    let promise_data = _script_promise_data[data_key];
    let initial;
    if (promise_data) {
        initial = false;
    } else {
        promise_data = {};
        promise_data.promise = new Promise((resolve, reject) => {
            promise_data.resolve = resolve;
            promise_data.reject  = reject;
        });
        _script_promise_data[data_key] = promise_data;
        initial = true;
    }
    return { initial, promise_data };
}

/** async function load_script(parent, script_url)
 *  @param {Node} parent the parent element for script
 *  @param {string} script_url url of script to load (the script tag will be created without defer or async attributes)
 *  @return {Promise}
 *  Use this to load a script and wait for its 'load' event.
 *  Only the first invokation for a particular script_url will create
 *  the script element.  Others will simply wait for the script to load
 *  or for error.
 */
export async function load_script(parent, script_url) {
    const full_script_url = new URL(script_url, current_script_url);
    const { promise_data, initial } = _establish_script_promise_data(full_script_url);
    if (initial) {
        let script_el;
        function script_load_handler(event) {
            promise_data.resolve?.();
            reset();
        }
        function script_load_error_handler(event) {
            promise_data.reject?.(new Error(`error loading script ${full_script_url}`));
            reset();
        }
        function reset() {
            if (script_el) {
                script_el.removeEventListener('load',  script_load_handler);
                script_el.removeEventListener('error', script_load_error_handler);
            }
            promise_data.resolve = undefined;
            promise_data.reject  = undefined;
        }
        try {
            script_el = create_script(parent, full_script_url);
            script_el.addEventListener('load',  script_load_handler,       { once: true });
            script_el.addEventListener('error', script_load_error_handler, { once: true });
        } catch (err) {
            promise_data.reject?.(err);
            reset();
        }
    }
    return promise_data.promise;
}

/** async function load_script_and_wait_for_condition(parent, script_url, condition_poll_fn)
 *  @param {Node} parent the parent element for script
 *  @param {string} script_url url of script to load (the script tag will be created without defer or async attributes)
 *  @param {() => boolean} condition_poll_fn function that will return true when script has loaded
 *  @return {Promise}
 *  Use this to load a script where you want to poll for condition
 *  that will be triggered asynchronously by the script, in which
 *  case waiting for the load event will not work because it fires
 *  when script execution completes but not when some later condition
 *  is triggered asynchronously by the script.
 *  Only the first invokation for a particular script_url will create
 *  the script element.  Others will simply wait for the script to load
 *  or for error.
 */
export async function load_script_and_wait_for_condition(parent, script_url, condition_poll_fn) {
    const full_script_url = new URL(script_url, current_script_url);
    const { promise_data, initial } = _establish_script_promise_data(full_script_url);
    if (initial) {
        let script_el;
        let wait_timer_id;
        function script_load_error_handler(event) {
            promise_data.reject?.(new Error(`error loading script ${full_script_url}`));
            reset();
        }
        function wait() {
            if (condition_poll_fn()) {
                promise_data.resolve?.();
                reset();
            } else {
                wait_timer_id = setTimeout(wait);  // check again on next tick
            }
        }
        function reset() {
            if (typeof wait_timer_id !== 'undefined') {
                clearTimeout(wait_timer_id);
                wait_timer_id = undefined;
            }
            if (script_el) {
                script_el.removeEventListener('error', script_load_error_handler);
            }
            promise_data.resolve = undefined;
            promise_data.reject  = undefined;
        }
        try {
            script_el = create_script(parent, full_script_url);
            script_el.addEventListener('error', script_load_error_handler, { once: true });
            wait();
        } catch (err) {
            promise_data.reject?.(err);
            reset();
        }
    }
    return promise_data.promise;
}
