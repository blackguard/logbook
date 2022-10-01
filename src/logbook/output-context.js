const {
    generate_object_id,
} = await import('../uuid.js');

const {
    output_handlers,
} = await import('./output-handlers.js');

function _get_svg_string(svg_node, stylesheet_text) {
    svg_node.setAttribute('xlink', 'http://www.w3.org/1999/xlink');

    const style_element = document.createElement("style");
    style_element.setAttribute("type","text/css");
    style_element.innerText = stylesheet_text;
    const ref_node = svg_node.hasChildNodes() ? svg_node.children[0] : null;
    svg_node.insertBefore(style_element, ref_node);

    const serializer = new XMLSerializer();
    let svg_string = serializer.serializeToString(svg_node);
    svg_string = svg_string.replace(/(\w+)?:?xlink=/g, 'xmlns:xlink=');  // fix root xlink without namespace
    svg_string = svg_string.replace(/NS\d+:href/g, 'xlink:href');  // Safari NS namespace fix

    return svg_string;
}

export function create_output_context(ie, output_data_collection) {
    // Define instance this way to isolate references to logbook,
    // ie and output_data_collection.

    // Note that the output_data_collection is queried now so that
    // if it changes, this output context will only affect the original
    // one.
    const output_element_collection = ie.querySelector('.output');

    return {
        async output_handler_update_logbook(type, value) {
            const handler = output_handlers[type];
            if (!handler) {
                throw new Error(`unknown output type: ${type}`);
            } else {
                return handler.update_logbook(this, value);
            }
        },

        validate_size_config(size_config) {
            if ( !Array.isArray(size_config) ||
                 size_config.length !== 2 ||
                 typeof size_config[0] !== 'number' ||
                 typeof size_config[1] !== 'number' ) {
                throw new Error('size_config must be an array containing two numbers');
            }
        },

        parse_graphics_args(args, error_message) {
            if (args.length < 1 || args.length > 2) {
                throw new Error(error_message);
            }
            let size_config, config;
            if (args.length < 2) {
                config = args[0];
            } else {
                [ size_config, config ] = args;
            }
            if (size_config) {
                this.validate_size_config(size_config);
            }
            if (config === null || typeof config !== 'object') {
                throw new Error('config must be a non-null object');
            }
            return [ size_config, config ];
        },

        /** create a new element in the output section of the ie
         *  @param {Object|undefined|null} options: {
         *             size_config?: [width: number, height: number],
         *             tag?: string,                      // tag name for element; default: 'div'
         *             element_namespace?: string,        // namespace for element creation
         *             attrs?: object,                    // attributes to set on element
         *             child_tag?: string,                // if given, create and return a child element
         *             child_element_namespace?: string,  // namespace for child element creation
         *             child_attrs?: object,              // attributes to set on child element
         *         }
         * An randomly-generated id will be assigned to the element (and
         * also to the child element, if one is created) unless those
         * elements have an id attribute specified (in *_attrs).
         */
        create_output_element(options) {
            const {
                size_config,
                tag = 'div',
                element_namespace,
                attrs,
                child_tag,
                child_element_namespace,
                child_attrs,
            } = (options ?? {});

            // Re: Chart.js:
            // Wrap the canvas element in a div to prevent quirky behavious of Chart.js size handling.
            // See: https://stackoverflow.com/questions/19847582/chart-js-canvas-resize.
            // (Note: doing this for all text/graphics types)
            let output_element;
            if (element_namespace) {
                output_element = document.createElementNS(element_namespace, tag);
            } else {
                output_element = document.createElement(tag);
            }
            let output_element_id_specified = false;
            if (attrs) {
                for (const k in attrs) {
                    const v = attrs[k];
                    output_element.setAttribute(k, v);
                    if (k == 'id') {
                        output_element_id_specified = true;
                    }
                }
            }
            if (!output_element_id_specified) {
                output_element.id = generate_object_id();
            }
            output_element_collection.appendChild(output_element);
            let child;
            if (child_tag) {
                if (child_element_namespace) {
                    child = document.createElementNS(child_element_namespace, child_tag);
                } else {
                    child = document.createElement(child_tag);
                }
                let child_id_specified = false;
                if (child_attrs) {
                    for (const k in child_attrs) {
                        const v = child_attrs[k];
                        child.setAttribute(k, v);
                        if (k == 'id') {
                            child_id_specified = true;
                        }
                    }
                }
                if (!child_id_specified) {
                    child.id = generate_object_id();
                }
            }
            if (size_config) {
                const [ width, height ] = size_config;
                if (typeof width === 'number') {
                    output_element.width = width;
                    output_element.style.width = `${width}px`;
                }
                if (typeof height === 'number') {
                    output_element.height = height;
                    output_element.style.height = `${height}px`;
                }
                if (child) {
                    if (typeof width === 'number') {
                        child.width = width;
                    }
                    if (typeof height === 'number') {
                        child.height = height;
                    }
                }
            }
            if (child) {
                output_element.appendChild(child);
            }
            return child ? child : output_element;
        },

        /** create a new canvas element in the output section of the ie
         *  @param {number} width
         *  @param {number} height
         *  @return {HTMLCanvasElement} canvas element with a <div> parent
         */
        create_canvas_output_element(width, height) {
            return this.create_output_element({
                size_config: [width, height],
                child_tag: 'canvas',
            });
        },

        // Also creates the output element (via static_element_generator()).
        // If type === 'text', then the text may be merged into the previous element if
        // the previous element was also of type 'text'.
        // Note: static_element_generator() is assumed to always return an element.
        async create_text_output_data(type, text, static_element_generator, leave_scroll_position_alone=false) {
            // try to merge
            if (type === 'text') {
                // may coalesce with previous element if it is also a text type element
                const previous_output_data = output_data_collection[output_data_collection.length-1];
                if (previous_output_data?.type === 'text') {
                    // new data and the previous are both 'text'; merge new data into previous
                    previous_output_data.text += text;
                    // connect output_data and output_element into logbook and ui
                    const merged_output_element = await static_element_generator(previous_output_data);
                    merged_output_element.id = output_element_collection.lastChild.id;  // preserve id
                    output_element_collection.lastChild.replaceWith(merged_output_element);
                    return;
                }
            }

            // if we get here, we were not able to merge
            const output_data = {
                type,
                text,
            };
            const output_element = await static_element_generator(output_data);
            // connect output_data and output_element into logbook and ui
            output_element_collection.appendChild(output_element);
            output_data_collection.push(output_data);
            if (!leave_scroll_position_alone) {
                this.scroll_output_into_view();
            }
            return output_data;
        },

        async create_generic_output_data(type, props, leave_scroll_position_alone=false) {
            props = props ?? {};
            const output_data = {
                type,
                ...props,
            };
            const handler = output_handlers[type];
            if (!handler) {
                throw new Error(`unknown output type: ${type}`);
            }
            if (!handler.validate_output_data(output_data)) {
                throw new Error('invalid output_data');
            }
            output_data_collection.push(output_data);
            if (!leave_scroll_position_alone) {
                this.scroll_output_into_view();
            }
            return output_data;
        },

        // async create_canvas_output_data([ type='generic', ] canvas, leave_scroll_position_alone=false)
        async create_canvas_output_data(...args) {
            const [ type, canvas, leave_scroll_position_alone=false ] =
                  (args[0] instanceof HTMLCanvasElement)
                  ? [ 'generic', ...args ]
                  : args;
            // Save an image of the rendered canvas.  This will be used if this
            // logbook is saved and then loaded again later.
            // Note: using image/png because image/jpeg fails on Firefox (as of writing)
            const image_format = 'image/png';
            const image_format_quality = 1.0;
            const image_uri = canvas.toDataURL(image_format, image_format_quality);
            return this.create_generic_output_data(type, {
                image_format,
                image_format_quality,
                image_uri,
            }, leave_scroll_position_alone);
        },

        async create_svg_output_data(type, svg, leave_scroll_position_alone=false, stylesheet_text=undefined) {
            const svg_string = _get_svg_string(svg, stylesheet_text);

            // dagreD3 specifies arrowheads at the end or edges by referencing a path with an id.
            // These references take the form: url(<location>#<id>).
            // These fail when embedded in an image URI, therefore delete the <location> part.
            const replacement_url = new URL(location);
            replacement_url.hash = '';  // hash, if any, must be eliminated
            // Note that we're just tacking the hash on the end here, but that should be ok.
            const adjusted_svg_string = svg_string.replaceAll(`url(${replacement_url}#`, 'url(#');

            const width  = svg.clientWidth;
            const height = svg.clientHeight;
            const image_format = 'image/svg+xml';
            const image_uri = `data:${image_format};utf8,${encodeURIComponent(adjusted_svg_string)}`;
            // The width and height are necessary because when we load this later (using the svg data uri)
            // the image width and height will not be set (as opposed to a png data uri which encodes
            // the width and height in its content).
            return this.create_generic_output_data(type, {
                width,
                height,
                image_format,
                image_uri,
            }, leave_scroll_position_alone);
        },

        /** scroll output section of ie into view
         */
        scroll_output_into_view() {
            const interaction_area = document.getElementById('interaction_area');
            const ia_rect = interaction_area.getBoundingClientRect();
            const ie_rect = ie.getBoundingClientRect();
            if (ie_rect.bottom > ia_rect.bottom) {
                interaction_area.scrollBy(0, (ie_rect.bottom - ia_rect.bottom));
            }
        },
    };
}
