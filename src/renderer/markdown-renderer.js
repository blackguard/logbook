import {
    Renderer,
} from './_.js';

import {
    marked,
} from './marked.js';

import {
    TeXZilla,
} from './texzilla.js';

import {
    OutputContext,
} from '../output-context.js';


export default class MarkdownRenderer extends Renderer {
    static type = 'markdown';

    // options: { style?: Object }

    // may throw an error
    async render(output_context, markdown, options=null) {

        markdown ??= '';

        const {
            style,
        } = (options ?? {});

        const parent = output_context.create_child({
            attrs: {
                'data-type': this.type,
            },
            style,
        });
        const markup = await marked.parse(markdown);  // using extensions, see below
        parent.innerHTML = markup;

        return parent;
    }
}


// === MARKED EXTENSIONS ===

// TeX handling adapted from: marked-katex-extension/index.js
// https://github.com/UziTech/marked-katex-extension/blob/main/src/index.js
// See also: https://marked.js.org/using_pro#async

const extension_name__inline    = 'inline-tex';
const extension_name__block     = 'block-tex';
const extension_name__eval_code = 'eval-code';

marked.use({
    extensions: [
        {
            name: extension_name__inline,
            level: 'inline',
            start(src) { return src.indexOf('$'); },
            tokenizer(src, tokens) {
                const match = src.match(/^\$+([^$]+?)\$+/);
                if (match) {
                    return {
                        type: extension_name__inline,
                        raw:  match[0],
                        text: match[1].trim(),
                    };
                }
            },
            renderer(token) {
                const inline = true;
                const rtl = false;//!!!
                const exc_on_err = false;
                return TeXZilla.toMathMLString(token.text, !inline, rtl, exc_on_err);
            },
        },
        {
            name: extension_name__block,
            level: 'block',
            start(src) { return src.indexOf('$$'); },
            tokenizer(src, tokens) {
                const match = src.match(/^\$\$([^$]+?)\$\$/);
                if (match) {
                    return {
                        type: extension_name__block,
                        raw:  match[0],
                        text: match[1].trim(),
                    };
                }
            },
            renderer(token) {
                const inline = false;
                const rtl = false;//!!!
                const exc_on_err = false;
                return `<p>${TeXZilla.toMathMLString(token.text, !inline, rtl, exc_on_err)}</p>`;
            },
        },

        {
            name: extension_name__eval_code,
            level: 'block',
            start(src) { return src.match(/^[`]{3}[ ]*[!]/)?.index; },
            tokenizer(src, tokens) {
                const match = src.match(/^[`]{3}[ ]*[!](.*?)[`]{3}/s);
                if (match) {
                    return {
                        type: extension_name__eval_code,
                        raw:  match[0],
                        text: match[1],
                        html: '',  // filled in later by walkTokens
                    };
                }
            },
            renderer(token) {
                return token.html;
            },
        },
    ],

    async: true,  // needed to tell the marked parser operate asynchronously, and to return a promise
    async walkTokens(token) {
        if (token.type === extension_name__eval_code) {
            const output_element = document.createElement('div');
            const output_context = new OutputContext(output_element);
            const options = {
                //!!!
            };
            const renderer = await output_context.renderer_for_type('javascript');
            await output_context.invoke_renderer(renderer, token.text, options)
                .catch(error => output_context.invoke_renderer_for_type('error', error));
            renderer?.stop();  // stop background processing, if any
            token.html = output_element.innerHTML;
        }
    }
});