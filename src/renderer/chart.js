const current_script_url = import.meta.url;  // save for later

import {
    load_script,
} from '../../lib/ui/dom-util.js';


await load_script(document.head, new URL('../../node_modules/chart.js/dist/Chart.bundle.min.js', current_script_url));  // defines globalThis.Chart

export const Chart = globalThis.Chart;