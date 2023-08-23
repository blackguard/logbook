"use strict";(self.webpackChunklogbook=self.webpackChunklogbook||[]).push([[978],{1824:(n,e,t)=>{t.d(e,{Z:()=>a});var A=t(7537),i=t.n(A),s=t(3645),o=t.n(s)()(i());o.push([n.id,'.settings-dialog .dialog-text {\n    font-style: italic;\n}\n\n.settings-dialog [data-section] {\n    position: relative;\n    display: grid;\n    grid-template-columns: min-content min-content;\n    min-width: max-content;\n    margin: 1.75em 0 0 0;\n    padding: 1em 0.5em 0.5em;\n    border: 1px solid black;\n    border-radius: 8px;\n    color: hsl(  0deg   0%   0% / 100%);\n    background-color: hsl(  0deg   0%  95% / 100%);\n}\n\n.settings-dialog [data-section]::before {\n    position: absolute;\n    content: attr(data-section);\n    left: 0.8em;\n    top: -0.7em;\n    padding: 0 1em;\n    border: 1px solid #aaa;\n    border-radius: 4px;\n    color: hsl(  0deg   0%   0% / 100%);\n    background-color: hsl(  0deg   0%  95% / 100%);\n    font-style: italic;\n}\n\n.settings-dialog [data-section] label {\n    align-self: center;\n    justify-self: end;\n    white-space: nowrap;\n    user-select: none;\n}\n\n.settings-dialog [data-section] input,\n.settings-dialog [data-section] select {\n    align-self: center;\n    justify-self: start;\n    color:            fieldtext;\n    background-color: field;\n    margin: 0.25em;\n}\n\n.settings-dialog [data-section] input[type="text"] {\n    width: 5em;\n}\n\n.settings-dialog .warning {\n    display: none;\n    width: 13em;\n    margin: 1.75em 0 0 1em;\n    padding: 0.5em;\n    border: 1px solid black;\n    border-radius: 8px;\n    color: hsl(  0deg   0%   0% / 100%);\n    background-color: hsl( 60deg  80%  50% / 100%);\n}\n.settings-dialog .warning p:first-child {\n    margin-block-start: 0;\n}\n.settings-dialog .warning p:last-child {\n    margin-block-end: 0;\n}\n.settings-dialog .show-emacs-warning .emacs-warning {\n    display: block;\n}\n\n.settings-dialog input[type="submit"] {\n    margin-top: 1em;\n}\n\n.settings-dialog .error-message {\n    display: none;\n    width: 13em;\n    margin: 1.75em 0 0 1em;\n    padding: 0.5em;\n    border-radius: 5pt;\n    background-color: hsl(  0deg  60%  50% / 100%);\n    color: hsl(  0deg   0% 100% / 100%);\n    height: fit-content;\n}\n.settings-dialog .error-message.active {\n    display: block;\n}\n',"",{version:3,sources:["webpack://./src/settings/settings-dialog/settings-dialog.css"],names:[],mappings:"AAAA;IACI,kBAAkB;AACtB;;AAEA;IACI,kBAAkB;IAClB,aAAa;IACb,8CAA8C;IAC9C,sBAAsB;IACtB,oBAAoB;IACpB,wBAAwB;IACxB,uBAAuB;IACvB,kBAAkB;IAClB,mCAAmC;IACnC,8CAA8C;AAClD;;AAEA;IACI,kBAAkB;IAClB,2BAA2B;IAC3B,WAAW;IACX,WAAW;IACX,cAAc;IACd,sBAAsB;IACtB,kBAAkB;IAClB,mCAAmC;IACnC,8CAA8C;IAC9C,kBAAkB;AACtB;;AAEA;IACI,kBAAkB;IAClB,iBAAiB;IACjB,mBAAmB;IACnB,iBAAiB;AACrB;;AAEA;;IAEI,kBAAkB;IAClB,mBAAmB;IACnB,2BAA2B;IAC3B,uBAAuB;IACvB,cAAc;AAClB;;AAEA;IACI,UAAU;AACd;;AAEA;IACI,aAAa;IACb,WAAW;IACX,sBAAsB;IACtB,cAAc;IACd,uBAAuB;IACvB,kBAAkB;IAClB,mCAAmC;IACnC,8CAA8C;AAClD;AACA;IACI,qBAAqB;AACzB;AACA;IACI,mBAAmB;AACvB;AACA;IACI,cAAc;AAClB;;AAEA;IACI,eAAe;AACnB;;AAEA;IACI,aAAa;IACb,WAAW;IACX,sBAAsB;IACtB,cAAc;IACd,kBAAkB;IAClB,8CAA8C;IAC9C,mCAAmC;IACnC,mBAAmB;AACvB;AACA;IACI,cAAc;AAClB",sourcesContent:['.settings-dialog .dialog-text {\n    font-style: italic;\n}\n\n.settings-dialog [data-section] {\n    position: relative;\n    display: grid;\n    grid-template-columns: min-content min-content;\n    min-width: max-content;\n    margin: 1.75em 0 0 0;\n    padding: 1em 0.5em 0.5em;\n    border: 1px solid black;\n    border-radius: 8px;\n    color: hsl(  0deg   0%   0% / 100%);\n    background-color: hsl(  0deg   0%  95% / 100%);\n}\n\n.settings-dialog [data-section]::before {\n    position: absolute;\n    content: attr(data-section);\n    left: 0.8em;\n    top: -0.7em;\n    padding: 0 1em;\n    border: 1px solid #aaa;\n    border-radius: 4px;\n    color: hsl(  0deg   0%   0% / 100%);\n    background-color: hsl(  0deg   0%  95% / 100%);\n    font-style: italic;\n}\n\n.settings-dialog [data-section] label {\n    align-self: center;\n    justify-self: end;\n    white-space: nowrap;\n    user-select: none;\n}\n\n.settings-dialog [data-section] input,\n.settings-dialog [data-section] select {\n    align-self: center;\n    justify-self: start;\n    color:            fieldtext;\n    background-color: field;\n    margin: 0.25em;\n}\n\n.settings-dialog [data-section] input[type="text"] {\n    width: 5em;\n}\n\n.settings-dialog .warning {\n    display: none;\n    width: 13em;\n    margin: 1.75em 0 0 1em;\n    padding: 0.5em;\n    border: 1px solid black;\n    border-radius: 8px;\n    color: hsl(  0deg   0%   0% / 100%);\n    background-color: hsl( 60deg  80%  50% / 100%);\n}\n.settings-dialog .warning p:first-child {\n    margin-block-start: 0;\n}\n.settings-dialog .warning p:last-child {\n    margin-block-end: 0;\n}\n.settings-dialog .show-emacs-warning .emacs-warning {\n    display: block;\n}\n\n.settings-dialog input[type="submit"] {\n    margin-top: 1em;\n}\n\n.settings-dialog .error-message {\n    display: none;\n    width: 13em;\n    margin: 1.75em 0 0 1em;\n    padding: 0.5em;\n    border-radius: 5pt;\n    background-color: hsl(  0deg  60%  50% / 100%);\n    color: hsl(  0deg   0% 100% / 100%);\n    height: fit-content;\n}\n.settings-dialog .error-message.active {\n    display: block;\n}\n'],sourceRoot:""}]);const a=o},1978:(n,e,t)=>{t.r(e),t.d(e,{default:()=>I});var A=t(3379),i=t.n(A),s=t(7795),o=t.n(s),a=t(569),l=t.n(a),d=t(3565),r=t.n(d),g=t(9216),c=t.n(g),C=t(4589),m=t.n(C),B=t(1824),p={};p.styleTagTransform=m(),p.setAttributes=r(),p.insert=l().bind(null,"head"),p.domAPI=o(),p.insertStyleElement=c(),i()(B.Z,p);const I=B.Z&&B.Z.locals?B.Z.locals:void 0}}]);
//# sourceMappingURL=978.main.js.map