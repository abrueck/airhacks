class Lumo extends HTMLElement {
  static get version() {
    return '1.6.1';
  }
}

customElements.define('vaadin-lumo-styles', Lumo);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/** @type {Promise<void>} */
let readyPromise = null;

/** @type {?function(?function())} */
let whenReady = window['HTMLImports'] && window['HTMLImports']['whenReady'] || null;

/** @type {function()} */
let resolveFn;

/**
 * @param {?function()} callback
 */
function documentWait(callback) {
  requestAnimationFrame(function() {
    if (whenReady) {
      whenReady(callback);
    } else {
      if (!readyPromise) {
        readyPromise = new Promise((resolve) => {resolveFn = resolve;});
        if (document.readyState === 'complete') {
          resolveFn();
        } else {
          document.addEventListener('readystatechange', () => {
            if (document.readyState === 'complete') {
              resolveFn();
            }
          });
        }
      }
      readyPromise.then(function(){ callback && callback(); });
    }
  });
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const SEEN_MARKER = '__seenByShadyCSS';
const CACHED_STYLE = '__shadyCSSCachedStyle';

/** @type {?function(!HTMLStyleElement)} */
let transformFn = null;

/** @type {?function()} */
let validateFn = null;

/**
This interface is provided to add document-level <style> elements to ShadyCSS for processing.
These styles must be processed by ShadyCSS to simulate ShadowRoot upper-bound encapsulation from outside styles
In addition, these styles may also need to be processed for @apply rules and CSS Custom Properties

To add document-level styles to ShadyCSS, one can call `ShadyCSS.addDocumentStyle(styleElement)` or `ShadyCSS.addDocumentStyle({getStyle: () => styleElement})`

In addition, if the process used to discover document-level styles can be synchronously flushed, one should set `ShadyCSS.documentStyleFlush`.
This function will be called when calculating styles.

An example usage of the document-level styling api can be found in `examples/document-style-lib.js`

@unrestricted
*/
class CustomStyleInterface {
  constructor() {
    /** @type {!Array<!CustomStyleProvider>} */
    this['customStyles'] = [];
    this['enqueued'] = false;
    // NOTE(dfreedm): use quotes here to prevent closure inlining to `function(){}`;
    documentWait(() => {
      if (window['ShadyCSS']['flushCustomStyles']) {
        window['ShadyCSS']['flushCustomStyles']();
      }
    });
  }
  /**
   * Queue a validation for new custom styles to batch style recalculations
   */
  enqueueDocumentValidation() {
    if (this['enqueued'] || !validateFn) {
      return;
    }
    this['enqueued'] = true;
    documentWait(validateFn);
  }
  /**
   * @param {!HTMLStyleElement} style
   */
  addCustomStyle(style) {
    if (!style[SEEN_MARKER]) {
      style[SEEN_MARKER] = true;
      this['customStyles'].push(style);
      this.enqueueDocumentValidation();
    }
  }
  /**
   * @param {!CustomStyleProvider} customStyle
   * @return {HTMLStyleElement}
   */
  getStyleForCustomStyle(customStyle) {
    if (customStyle[CACHED_STYLE]) {
      return customStyle[CACHED_STYLE];
    }
    let style;
    if (customStyle['getStyle']) {
      style = customStyle['getStyle']();
    } else {
      style = customStyle;
    }
    return style;
  }
  /**
   * @return {!Array<!CustomStyleProvider>}
   */
  processStyles() {
    const cs = this['customStyles'];
    for (let i = 0; i < cs.length; i++) {
      const customStyle = cs[i];
      if (customStyle[CACHED_STYLE]) {
        continue;
      }
      const style = this.getStyleForCustomStyle(customStyle);
      if (style) {
        // HTMLImports polyfill may have cloned the style into the main document,
        // which is referenced with __appliedElement.
        const styleToTransform = /** @type {!HTMLStyleElement} */(style['__appliedElement'] || style);
        if (transformFn) {
          transformFn(styleToTransform);
        }
        customStyle[CACHED_STYLE] = styleToTransform;
      }
    }
    return cs;
  }
}

/* eslint-disable no-self-assign */
CustomStyleInterface.prototype['addCustomStyle'] = CustomStyleInterface.prototype.addCustomStyle;
CustomStyleInterface.prototype['getStyleForCustomStyle'] = CustomStyleInterface.prototype.getStyleForCustomStyle;
CustomStyleInterface.prototype['processStyles'] = CustomStyleInterface.prototype.processStyles;
/* eslint-enable no-self-assign */

Object.defineProperties(CustomStyleInterface.prototype, {
  'transformCallback': {
    /** @return {?function(!HTMLStyleElement)} */
    get() {
      return transformFn;
    },
    /** @param {?function(!HTMLStyleElement)} fn */
    set(fn) {
      transformFn = fn;
    }
  },
  'validateCallback': {
    /** @return {?function()} */
    get() {
      return validateFn;
    },
    /**
     * @param {?function()} fn
     * @this {CustomStyleInterface}
     */
    set(fn) {
      let needsEnqueue = false;
      if (!validateFn) {
        needsEnqueue = true;
      }
      validateFn = fn;
      if (needsEnqueue) {
        this.enqueueDocumentValidation();
      }
    },
  }
});

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const VAR_ASSIGN = /(?:^|[;\s{]\s*)(--[\w-]*?)\s*:\s*(?:((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};{])+)|\{([^}]*)\}(?:(?=[;\s}])|$))/gi;
const MIXIN_MATCH = /(?:^|\W+)@apply\s*\(?([^);\n]*)\)?/gi;
const MEDIA_MATCH = /@media\s(.*)/;

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * @param {Element} element
 * @param {Object=} properties
 */
function updateNativeProperties(element, properties) {
  // remove previous properties
  for (let p in properties) {
    // NOTE: for bc with shim, don't apply null values.
    if (p === null) {
      element.style.removeProperty(p);
    } else {
      element.style.setProperty(p, properties[p]);
    }
  }
}

/**
 * @param {Element} element
 * @param {string} property
 * @return {string}
 */
function getComputedStyleValue(element, property) {
  /**
   * @const {string}
   */
  const value = window.getComputedStyle(element).getPropertyValue(property);
  if (!value) {
    return '';
  } else {
    return value.trim();
  }
}

/**
 * return true if `cssText` contains a mixin definition or consumption
 * @param {string} cssText
 * @return {boolean}
 */
function detectMixin(cssText) {
  const has = MIXIN_MATCH.test(cssText) || VAR_ASSIGN.test(cssText);
  // reset state of the regexes
  MIXIN_MATCH.lastIndex = 0;
  VAR_ASSIGN.lastIndex = 0;
  return has;
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const nativeShadow = !(window['ShadyDOM'] && window['ShadyDOM']['inUse']);
let nativeCssVariables_;

/**
 * @param {(ShadyCSSOptions | ShadyCSSInterface)=} settings
 */
function calcCssVariables(settings) {
  if (settings && settings['shimcssproperties']) {
    nativeCssVariables_ = false;
  } else {
    // chrome 49 has semi-working css vars, check if box-shadow works
    // safari 9.1 has a recalc bug: https://bugs.webkit.org/show_bug.cgi?id=155782
    // However, shim css custom properties are only supported with ShadyDOM enabled,
    // so fall back on native if we do not detect ShadyDOM
    // Edge 15: custom properties used in ::before and ::after will also be used in the parent element
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/12414257/
    nativeCssVariables_ = nativeShadow || Boolean(!navigator.userAgent.match(/AppleWebKit\/601|Edge\/15/) &&
      window.CSS && CSS.supports && CSS.supports('box-shadow', '0 0 0 var(--foo)'));
  }
}

/** @type {string | undefined} */
let cssBuild;
if (window.ShadyCSS && window.ShadyCSS.cssBuild !== undefined) {
  cssBuild = window.ShadyCSS.cssBuild;
}

/** @type {boolean} */
const disableRuntime = Boolean(window.ShadyCSS && window.ShadyCSS.disableRuntime);

if (window.ShadyCSS && window.ShadyCSS.nativeCss !== undefined) {
  nativeCssVariables_ = window.ShadyCSS.nativeCss;
} else if (window.ShadyCSS) {
  calcCssVariables(window.ShadyCSS);
  // reset window variable to let ShadyCSS API take its place
  window.ShadyCSS = undefined;
} else {
  calcCssVariables(window['WebComponents'] && window['WebComponents']['flags']);
}

// Hack for type error under new type inference which doesn't like that
// nativeCssVariables is updated in a function and assigns the type
// `function(): ?` instead of `boolean`.
const nativeCssVariables = /** @type {boolean} */(nativeCssVariables_);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const customStyleInterface = new CustomStyleInterface();

if (!window.ShadyCSS) {
  window.ShadyCSS = {
    /**
     * @param {!HTMLTemplateElement} template
     * @param {string} elementName
     * @param {string=} elementExtends
     */
    prepareTemplate(template, elementName, elementExtends) {}, // eslint-disable-line no-unused-vars

    /**
     * @param {!HTMLTemplateElement} template
     * @param {string} elementName
     */
    prepareTemplateDom(template, elementName) {}, // eslint-disable-line no-unused-vars

    /**
     * @param {!HTMLTemplateElement} template
     * @param {string} elementName
     * @param {string=} elementExtends
     */
    prepareTemplateStyles(template, elementName, elementExtends) {}, // eslint-disable-line no-unused-vars

    /**
     * @param {Element} element
     * @param {Object=} properties
     */
    styleSubtree(element, properties) {
      customStyleInterface.processStyles();
      updateNativeProperties(element, properties);
    },

    /**
     * @param {Element} element
     */
    styleElement(element) { // eslint-disable-line no-unused-vars
      customStyleInterface.processStyles();
    },

    /**
     * @param {Object=} properties
     */
    styleDocument(properties) {
      customStyleInterface.processStyles();
      updateNativeProperties(document.body, properties);
    },

    /**
     * @param {Element} element
     * @param {string} property
     * @return {string}
     */
    getComputedStyleValue(element, property) {
      return getComputedStyleValue(element, property);
    },

    flushCustomStyles() {},
    nativeCss: nativeCssVariables,
    nativeShadow: nativeShadow,
    cssBuild: cssBuild,
    disableRuntime: disableRuntime,
  };
}

window.ShadyCSS.CustomStyleInterface = customStyleInterface;

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/* eslint-disable no-unused-vars */
/**
 * When using Closure Compiler, JSCompiler_renameProperty(property, object) is replaced by the munged name for object[property]
 * We cannot alias this function, so we have to use a small shim that has the same behavior when not compiling.
 *
 * @param {?} prop Property name
 * @param {*} obj Reference object
 * @return {string} Potentially renamed property name
 */
window.JSCompiler_renameProperty = function(prop, obj) {
  return prop;
};

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

let CSS_URL_RX = /(url\()([^)]*)(\))/g;
let ABS_URL = /(^\/[^\/])|(^#)|(^[\w-\d]*:)/;
let workingURL;
let resolveDoc;
/**
 * Resolves the given URL against the provided `baseUri'.
 *
 * Note that this function performs no resolution for URLs that start
 * with `/` (absolute URLs) or `#` (hash identifiers).  For general purpose
 * URL resolution, use `window.URL`.
 *
 * @param {string} url Input URL to resolve
 * @param {?string=} baseURI Base URI to resolve the URL against
 * @return {string} resolved URL
 */
function resolveUrl(url, baseURI) {
  if (url && ABS_URL.test(url)) {
    return url;
  }
  if (url === '//') {
    return url;
  }
  // Lazy feature detection.
  if (workingURL === undefined) {
    workingURL = false;
    try {
      const u = new URL('b', 'http://a');
      u.pathname = 'c%20d';
      workingURL = (u.href === 'http://a/c%20d');
    } catch (e) {
      // silently fail
    }
  }
  if (!baseURI) {
    baseURI = document.baseURI || window.location.href;
  }
  if (workingURL) {
    try {
      return (new URL(url, baseURI)).href;
    } catch (e) {
      // Bad url or baseURI structure. Do not attempt to resolve.
      return url;
    }
  }
  // Fallback to creating an anchor into a disconnected document.
  if (!resolveDoc) {
    resolveDoc = document.implementation.createHTMLDocument('temp');
    resolveDoc.base = resolveDoc.createElement('base');
    resolveDoc.head.appendChild(resolveDoc.base);
    resolveDoc.anchor = resolveDoc.createElement('a');
    resolveDoc.body.appendChild(resolveDoc.anchor);
  }
  resolveDoc.base.href = baseURI;
  resolveDoc.anchor.href = url;
  return resolveDoc.anchor.href || url;

}

/**
 * Resolves any relative URL's in the given CSS text against the provided
 * `ownerDocument`'s `baseURI`.
 *
 * @param {string} cssText CSS text to process
 * @param {string} baseURI Base URI to resolve the URL against
 * @return {string} Processed CSS text with resolved URL's
 */
function resolveCss(cssText, baseURI) {
  return cssText.replace(CSS_URL_RX, function(m, pre, url, post) {
    return pre + '\'' +
      resolveUrl(url.replace(/["']/g, ''), baseURI) +
      '\'' + post;
  });
}

/**
 * Returns a path from a given `url`. The path includes the trailing
 * `/` from the url.
 *
 * @param {string} url Input URL to transform
 * @return {string} resolved path
 */
function pathFromUrl(url) {
  return url.substring(0, url.lastIndexOf('/') + 1);
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/
const useShadow = !(window.ShadyDOM) || !(window.ShadyDOM.inUse);
const useNativeCSSProperties = Boolean(!window.ShadyCSS || window.ShadyCSS.nativeCss);
const supportsAdoptingStyleSheets = useShadow &&
    ('adoptedStyleSheets' in Document.prototype) &&
    ('replaceSync' in CSSStyleSheet.prototype) &&
    // Since spec may change, feature detect exact API we need
    (() => {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync('');
        const host = document.createElement('div');
        host.attachShadow({mode: 'open'});
        host.shadowRoot.adoptedStyleSheets = [sheet];
        return (host.shadowRoot.adoptedStyleSheets[0] === sheet);
      } catch(e) {
        return false;
      }
    })();

/**
 * Globally settable property that is automatically assigned to
 * `ElementMixin` instances, useful for binding in templates to
 * make URL's relative to an application's root.  Defaults to the main
 * document URL, but can be overridden by users.  It may be useful to set
 * `rootPath` to provide a stable application mount path when
 * using client side routing.
 */
let rootPath = window.Polymer && window.Polymer.rootPath ||
  pathFromUrl(document.baseURI || window.location.href);

/**
 * A global callback used to sanitize any value before inserting it into the DOM.
 * The callback signature is:
 *
 *  function sanitizeDOMValue(value, name, type, node) { ... }
 *
 * Where:
 *
 * `value` is the value to sanitize.
 * `name` is the name of an attribute or property (for example, href).
 * `type` indicates where the value is being inserted: one of property, attribute, or text.
 * `node` is the node where the value is being inserted.
 *
 * @type {(function(*,string,string,?Node):*)|undefined}
 */
let sanitizeDOMValue =
  window.Polymer && window.Polymer.sanitizeDOMValue || undefined;

/**
 * Globally settable property to make Polymer Gestures use passive TouchEvent listeners when recognizing gestures.
 * When set to `true`, gestures made from touch will not be able to prevent scrolling, allowing for smoother
 * scrolling performance.
 * Defaults to `false` for backwards compatibility.
 */
let passiveTouchGestures =
  window.Polymer && window.Polymer.setPassiveTouchGestures || false;

/**
 * Setting to ensure Polymer template evaluation only occurs based on tempates
 * defined in trusted script.  When true, `<dom-module>` re-registration is
 * disallowed, `<dom-bind>` is disabled, and `<dom-if>`/`<dom-repeat>`
 * templates will only evaluate in the context of a trusted element template.
 */
let strictTemplatePolicy =
  window.Polymer && window.Polymer.strictTemplatePolicy || false;

/**
 * Setting to enable dom-module lookup from Polymer.Element.  By default,
 * templates must be defined in script using the `static get template()`
 * getter and the `html` tag function.  To enable legacy loading of templates
 * via dom-module, set this flag to true.
 */
let allowTemplateFromDomModule =
  window.Polymer && window.Polymer.allowTemplateFromDomModule || false;

/**
 * Setting to skip processing style includes and re-writing urls in css styles.
 * Normally "included" styles are pulled into the element and all urls in styles
 * are re-written to be relative to the containing script url.
 * If no includes or relative urls are used in styles, these steps can be
 * skipped as an optimization.
 */
let legacyOptimizations =
  window.Polymer && window.Polymer.legacyOptimizations || false;

/**
 * Setting to add warnings useful when migrating from Polymer 1.x to 2.x.
 */
let legacyWarnings =
  window.Polymer && window.Polymer.legacyWarnings || false;

/**
 * Setting to perform initial rendering synchronously when running under ShadyDOM.
 * This matches the behavior of Polymer 1.
 */
let syncInitialRender =
  window.Polymer && window.Polymer.syncInitialRender || false;

/**
 * Setting to retain the legacy Polymer 1 behavior for multi-property
 * observers around undefined values. Observers and computed property methods
 * are not called until no argument is undefined.
 */
let legacyUndefined =
  window.Polymer && window.Polymer.legacyUndefined || false;

/**
 * Setting to ensure computed properties are computed in order to ensure
 * re-computation never occurs in a given turn.
 */
let orderedComputed =
  window.Polymer && window.Polymer.orderedComputed || false;

/**
 * Setting to remove nested templates inside `dom-if` and `dom-repeat` as
 * part of element template parsing.  This is a performance optimization that
 * eliminates most of the tax of needing two elements due to the loss of
 * type-extended templates as a result of the V1 specification changes.
 */
let removeNestedTemplates =
  window.Polymer && window.Polymer.removeNestedTemplates || false;

/**
 * Setting to place `dom-if` elements in a performance-optimized mode that takes
 * advantage of lighter-weight host runtime template stamping to eliminate the
 * need for an intermediate Templatizer `TemplateInstance` to mange the nodes
 * stamped by `dom-if`.  Under this setting, any Templatizer-provided API's
 * such as `modelForElement` will not be available for nodes stamped by
 * `dom-if`.
 */
let fastDomIf = window.Polymer && window.Polymer.fastDomIf || false;

/**
 * Setting to disable `dom-change` and `rendered-item-count` events from
 * `dom-if` and `dom-repeat`. Users can opt back into `dom-change` events by
 * setting the `notify-dom-change` attribute (`notifyDomChange: true` property)
 * to `dom-if`/`don-repeat` instances.
 */
let suppressTemplateNotifications =
  window.Polymer && window.Polymer.suppressTemplateNotifications || false;

/**
 * Setting to disable use of dynamic attributes. This is an optimization
 * to avoid setting `observedAttributes`. Instead attributes are read
 * once at create time and set/removeAttribute are patched.
 */
let legacyNoObservedAttributes =
  window.Polymer && window.Polymer.legacyNoObservedAttributes || false;

/**
 * Setting to enable use of `adoptedStyleSheets` for sharing style sheets
 * between component instances' shadow roots, if the app uses built Shady CSS
 * styles.
 */
let useAdoptedStyleSheetsWithBuiltCSS =
  window.Polymer && window.Polymer.useAdoptedStyleSheetsWithBuiltCSS || false;

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

let modules = {};
let lcModules = {};
/**
 * Sets a dom-module into the global registry by id.
 *
 * @param {string} id dom-module id
 * @param {DomModule} module dom-module instance
 * @return {void}
 */
function setModule(id, module) {
  // store id separate from lowercased id so that
  // in all cases mixedCase id will stored distinctly
  // and lowercase version is a fallback
  modules[id] = lcModules[id.toLowerCase()] = module;
}
/**
 * Retrieves a dom-module from the global registry by id.
 *
 * @param {string} id dom-module id
 * @return {DomModule!} dom-module instance
 */
function findModule(id) {
  return modules[id] || lcModules[id.toLowerCase()];
}

function styleOutsideTemplateCheck(inst) {
  if (inst.querySelector('style')) {
    console.warn('dom-module %s has style outside template', inst.id);
  }
}

/**
 * The `dom-module` element registers the dom it contains to the name given
 * by the module's id attribute. It provides a unified database of dom
 * accessible via its static `import` API.
 *
 * A key use case of `dom-module` is for providing custom element `<template>`s
 * via HTML imports that are parsed by the native HTML parser, that can be
 * relocated during a bundling pass and still looked up by `id`.
 *
 * Example:
 *
 *     <dom-module id="foo">
 *       <img src="stuff.png">
 *     </dom-module>
 *
 * Then in code in some other location that cannot access the dom-module above
 *
 *     let img = customElements.get('dom-module').import('foo', 'img');
 *
 * @customElement
 * @extends HTMLElement
 * @summary Custom element that provides a registry of relocatable DOM content
 *   by `id` that is agnostic to bundling.
 * @unrestricted
 */
class DomModule extends HTMLElement {

  /** @override */
  static get observedAttributes() { return ['id']; }

  /**
   * Retrieves the element specified by the css `selector` in the module
   * registered by `id`. For example, this.import('foo', 'img');
   * @param {string} id The id of the dom-module in which to search.
   * @param {string=} selector The css selector by which to find the element.
   * @return {Element} Returns the element which matches `selector` in the
   * module registered at the specified `id`.
   *
   * @export
   * @nocollapse Referred to indirectly in style-gather.js
   */
  static import(id, selector) {
    if (id) {
      let m = findModule(id);
      if (m && selector) {
        return m.querySelector(selector);
      }
      return m;
    }
    return null;
  }

  /* eslint-disable no-unused-vars */
  /**
   * @param {string} name Name of attribute.
   * @param {?string} old Old value of attribute.
   * @param {?string} value Current value of attribute.
   * @param {?string} namespace Attribute namespace.
   * @return {void}
   * @override
   */
  attributeChangedCallback(name, old, value, namespace) {
    if (old !== value) {
      this.register();
    }
  }
  /* eslint-enable no-unused-args */

  /**
   * The absolute URL of the original location of this `dom-module`.
   *
   * This value will differ from this element's `ownerDocument` in the
   * following ways:
   * - Takes into account any `assetpath` attribute added during bundling
   *   to indicate the original location relative to the bundled location
   * - Uses the HTMLImports polyfill's `importForElement` API to ensure
   *   the path is relative to the import document's location since
   *   `ownerDocument` is not currently polyfilled
   */
  get assetpath() {
    // Don't override existing assetpath.
    if (!this.__assetpath) {
      // note: assetpath set via an attribute must be relative to this
      // element's location; accomodate polyfilled HTMLImports
      const owner = window.HTMLImports && HTMLImports.importForElement ?
        HTMLImports.importForElement(this) || document : this.ownerDocument;
      const url = resolveUrl(
        this.getAttribute('assetpath') || '', owner.baseURI);
      this.__assetpath = pathFromUrl(url);
    }
    return this.__assetpath;
  }

  /**
   * Registers the dom-module at a given id. This method should only be called
   * when a dom-module is imperatively created. For
   * example, `document.createElement('dom-module').register('foo')`.
   * @param {string=} id The id at which to register the dom-module.
   * @return {void}
   */
  register(id) {
    id = id || this.id;
    if (id) {
      // Under strictTemplatePolicy, reject and null out any re-registered
      // dom-module since it is ambiguous whether first-in or last-in is trusted
      if (strictTemplatePolicy && findModule(id) !== undefined) {
        setModule(id, null);
        throw new Error(`strictTemplatePolicy: dom-module ${id} re-registered`);
      }
      this.id = id;
      setModule(id, this);
      styleOutsideTemplateCheck(this);
    }
  }
}

DomModule.prototype['modules'] = modules;

customElements.define('dom-module', DomModule);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const MODULE_STYLE_LINK_SELECTOR = 'link[rel=import][type~=css]';
const INCLUDE_ATTR = 'include';
const SHADY_UNSCOPED_ATTR = 'shady-unscoped';

/**
 * @param {string} moduleId .
 * @return {?DomModule} .
 */
function importModule(moduleId) {
  return /** @type {?DomModule} */(DomModule.import(moduleId));
}

function styleForImport(importDoc) {
  // NOTE: polyfill affordance.
  // under the HTMLImports polyfill, there will be no 'body',
  // but the import pseudo-doc can be used directly.
  let container = importDoc.body ? importDoc.body : importDoc;
  const importCss = resolveCss(container.textContent,
    importDoc.baseURI);
  const style = document.createElement('style');
  style.textContent = importCss;
  return style;
}


/**
 * Returns a list of <style> elements in a space-separated list of `dom-module`s.
 *
 * @function
 * @param {string} moduleIds List of dom-module id's within which to
 * search for css.
 * @return {!Array<!HTMLStyleElement>} Array of contained <style> elements
 */
function stylesFromModules(moduleIds) {
 const modules = moduleIds.trim().split(/\s+/);
 const styles = [];
 for (let i=0; i < modules.length; i++) {
   styles.push(...stylesFromModule(modules[i]));
 }
 return styles;
}

/**
 * Returns a list of <style> elements in a given `dom-module`.
 * Styles in a `dom-module` can come either from `<style>`s within the
 * first `<template>`, or else from one or more
 * `<link rel="import" type="css">` links outside the template.
 *
 * @param {string} moduleId dom-module id to gather styles from
 * @return {!Array<!HTMLStyleElement>} Array of contained styles.
 */
function stylesFromModule(moduleId) {
  const m = importModule(moduleId);

  if (!m) {
    console.warn('Could not find style data in module named', moduleId);
    return [];
  }

  if (m._styles === undefined) {
    const styles = [];
    // module imports: <link rel="import" type="css">
    styles.push(..._stylesFromModuleImports(m));
    // include css from the first template in the module
    const template = /** @type {?HTMLTemplateElement} */(
        m.querySelector('template'));
    if (template) {
      styles.push(...stylesFromTemplate(template,
        /** @type {templateWithAssetPath} */(m).assetpath));
    }

    m._styles = styles;
  }

  return m._styles;
}

/**
 * Returns the `<style>` elements within a given template.
 *
 * @param {!HTMLTemplateElement} template Template to gather styles from
 * @param {string=} baseURI baseURI for style content
 * @return {!Array<!HTMLStyleElement>} Array of styles
 */
function stylesFromTemplate(template, baseURI) {
  if (!template._styles) {
    const styles = [];
    // if element is a template, get content from its .content
    const e$ = template.content.querySelectorAll('style');
    for (let i=0; i < e$.length; i++) {
      let e = e$[i];
      // support style sharing by allowing styles to "include"
      // other dom-modules that contain styling
      let include = e.getAttribute(INCLUDE_ATTR);
      if (include) {
        styles.push(...stylesFromModules(include).filter(function(item, index, self) {
          return self.indexOf(item) === index;
        }));
      }
      if (baseURI) {
        e.textContent =
            resolveCss(e.textContent, /** @type {string} */ (baseURI));
      }
      styles.push(e);
    }
    template._styles = styles;
  }
  return template._styles;
}

/**
 * Returns a list of <style> elements  from stylesheets loaded via `<link rel="import" type="css">` links within the specified `dom-module`.
 *
 * @param {string} moduleId Id of `dom-module` to gather CSS from
 * @return {!Array<!HTMLStyleElement>} Array of contained styles.
 */
function stylesFromModuleImports(moduleId) {
 let m = importModule(moduleId);
 return m ? _stylesFromModuleImports(m) : [];
}

/**
 * @param {!HTMLElement} module dom-module element that could contain `<link rel="import" type="css">` styles
 * @return {!Array<!HTMLStyleElement>} Array of contained styles
 */
function _stylesFromModuleImports(module) {
  const styles = [];
  const p$ = module.querySelectorAll(MODULE_STYLE_LINK_SELECTOR);
  for (let i=0; i < p$.length; i++) {
    let p = p$[i];
    if (p.import) {
      const importDoc = p.import;
      const unscoped = p.hasAttribute(SHADY_UNSCOPED_ATTR);
      if (unscoped && !importDoc._unscopedStyle) {
        const style = styleForImport(importDoc);
        style.setAttribute(SHADY_UNSCOPED_ATTR, '');
        importDoc._unscopedStyle = style;
      } else if (!importDoc._style) {
        importDoc._style = styleForImport(importDoc);
      }
      styles.push(unscoped ? importDoc._unscopedStyle : importDoc._style);
    }
  }
  return styles;
}

/**
 *
 * Returns CSS text of styles in a space-separated list of `dom-module`s.
 * Note: This method is deprecated, use `stylesFromModules` instead.
 *
 * @deprecated
 * @param {string} moduleIds List of dom-module id's within which to
 * search for css.
 * @return {string} Concatenated CSS content from specified `dom-module`s
 */
function cssFromModules(moduleIds) {
 let modules = moduleIds.trim().split(/\s+/);
 let cssText = '';
 for (let i=0; i < modules.length; i++) {
   cssText += cssFromModule(modules[i]);
 }
 return cssText;
}

/**
 * Returns CSS text of styles in a given `dom-module`.  CSS in a `dom-module`
 * can come either from `<style>`s within the first `<template>`, or else
 * from one or more `<link rel="import" type="css">` links outside the
 * template.
 *
 * Any `<styles>` processed are removed from their original location.
 * Note: This method is deprecated, use `styleFromModule` instead.
 *
 * @deprecated
 * @param {string} moduleId dom-module id to gather styles from
 * @return {string} Concatenated CSS content from specified `dom-module`
 */
function cssFromModule(moduleId) {
  let m = importModule(moduleId);
  if (m && m._cssText === undefined) {
    // module imports: <link rel="import" type="css">
    let cssText = _cssFromModuleImports(m);
    // include css from the first template in the module
    let t = /** @type {?HTMLTemplateElement} */(m.querySelector('template'));
    if (t) {
      cssText += cssFromTemplate(t,
        /** @type {templateWithAssetPath} */(m).assetpath);
    }
    m._cssText = cssText || null;
  }
  if (!m) {
    console.warn('Could not find style data in module named', moduleId);
  }
  return m && m._cssText || '';
}

/**
 * Returns CSS text of `<styles>` within a given template.
 *
 * Any `<styles>` processed are removed from their original location.
 * Note: This method is deprecated, use `styleFromTemplate` instead.
 *
 * @deprecated
 * @param {!HTMLTemplateElement} template Template to gather styles from
 * @param {string} baseURI Base URI to resolve the URL against
 * @return {string} Concatenated CSS content from specified template
 */
function cssFromTemplate(template, baseURI) {
  let cssText = '';
  const e$ = stylesFromTemplate(template, baseURI);
  // if element is a template, get content from its .content
  for (let i=0; i < e$.length; i++) {
    let e = e$[i];
    if (e.parentNode) {
      e.parentNode.removeChild(e);
    }
    cssText += e.textContent;
  }
  return cssText;
}

/**
 * @deprecated
 * @param {!HTMLElement} module dom-module element that could contain `<link rel="import" type="css">` styles
 * @return {string} Concatenated CSS content from links in the dom-module
 */
function _cssFromModuleImports(module) {
  let cssText = '';
  let styles = _stylesFromModuleImports(module);
  for (let i=0; i < styles.length; i++) {
    cssText += styles[i].textContent;
  }
  return cssText;
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const attr = 'include';

const CustomStyleInterface$1 = window.ShadyCSS.CustomStyleInterface;

/**
 * Custom element for defining styles in the main document that can take
 * advantage of [shady DOM](https://github.com/webcomponents/shadycss) shims
 * for style encapsulation, custom properties, and custom mixins.
 *
 * - Document styles defined in a `<custom-style>` are shimmed to ensure they
 *   do not leak into local DOM when running on browsers without native
 *   Shadow DOM.
 * - Custom properties can be defined in a `<custom-style>`. Use the `html` selector
 *   to define custom properties that apply to all custom elements.
 * - Custom mixins can be defined in a `<custom-style>`, if you import the optional
 *   [apply shim](https://github.com/webcomponents/shadycss#about-applyshim)
 *   (`shadycss/apply-shim.html`).
 *
 * To use:
 *
 * - Import `custom-style.html`.
 * - Place a `<custom-style>` element in the main document, wrapping an inline `<style>` tag that
 *   contains the CSS rules you want to shim.
 *
 * For example:
 *
 * ```html
 * <!-- import apply shim--only required if using mixins -->
 * <link rel="import" href="bower_components/shadycss/apply-shim.html">
 * <!-- import custom-style element -->
 * <link rel="import" href="bower_components/polymer/lib/elements/custom-style.html">
 *
 * <custom-style>
 *   <style>
 *     html {
 *       --custom-color: blue;
 *       --custom-mixin: {
 *         font-weight: bold;
 *         color: red;
 *       };
 *     }
 *   </style>
 * </custom-style>
 * ```
 *
 * @customElement
 * @extends HTMLElement
 * @summary Custom element for defining styles in the main document that can
 *   take advantage of Polymer's style scoping and custom properties shims.
 */
class CustomStyle extends HTMLElement {
  constructor() {
    super();
    this._style = null;
    CustomStyleInterface$1.addCustomStyle(this);
  }
  /**
   * Returns the light-DOM `<style>` child this element wraps.  Upon first
   * call any style modules referenced via the `include` attribute will be
   * concatenated to this element's `<style>`.
   *
   * @export
   * @return {HTMLStyleElement} This element's light-DOM `<style>`
   */
  getStyle() {
    if (this._style) {
      return this._style;
    }
    const style = /** @type {HTMLStyleElement} */(this.querySelector('style'));
    if (!style) {
      return null;
    }
    this._style = style;
    const include = style.getAttribute(attr);
    if (include) {
      style.removeAttribute(attr);
      /** @suppress {deprecated} */
      style.textContent = cssFromModules(include) + style.textContent;
    }
    /*
    HTML Imports styling the main document are deprecated in Chrome
    https://crbug.com/523952

    If this element is not in the main document, then it must be in an HTML Import document.
    In that case, move the custom style to the main document.

    The ordering of `<custom-style>` should stay the same as when loaded by HTML Imports, but there may be odd
    cases of ordering w.r.t the main document styles.
    */
    if (this.ownerDocument !== window.document) {
      window.document.head.appendChild(this);
    }
    return this._style;
  }
}

window.customElements.define('custom-style', CustomStyle);

const $_documentContainer = document.createElement('template');

$_documentContainer.innerHTML = `<custom-style>
  <style>
    html {
      --lumo-size-xs: 1.625rem;
      --lumo-size-s: 1.875rem;
      --lumo-size-m: 2.25rem;
      --lumo-size-l: 2.75rem;
      --lumo-size-xl: 3.5rem;

      /* Icons */
      --lumo-icon-size-s: 1.25em;
      --lumo-icon-size-m: 1.5em;
      --lumo-icon-size-l: 2.25em;
      /* For backwards compatibility */
      --lumo-icon-size: var(--lumo-icon-size-m);
    }
  </style>
</custom-style>`;

document.head.appendChild($_documentContainer.content);

const $_documentContainer$1 = document.createElement('template');

$_documentContainer$1.innerHTML = `<custom-style>
  <style>
    html {
      /* Square */
      --lumo-space-xs: 0.25rem;
      --lumo-space-s: 0.5rem;
      --lumo-space-m: 1rem;
      --lumo-space-l: 1.5rem;
      --lumo-space-xl: 2.5rem;

      /* Wide */
      --lumo-space-wide-xs: calc(var(--lumo-space-xs) / 2) var(--lumo-space-xs);
      --lumo-space-wide-s: calc(var(--lumo-space-s) / 2) var(--lumo-space-s);
      --lumo-space-wide-m: calc(var(--lumo-space-m) / 2) var(--lumo-space-m);
      --lumo-space-wide-l: calc(var(--lumo-space-l) / 2) var(--lumo-space-l);
      --lumo-space-wide-xl: calc(var(--lumo-space-xl) / 2) var(--lumo-space-xl);

      /* Tall */
      --lumo-space-tall-xs: var(--lumo-space-xs) calc(var(--lumo-space-xs) / 2);
      --lumo-space-tall-s: var(--lumo-space-s) calc(var(--lumo-space-s) / 2);
      --lumo-space-tall-m: var(--lumo-space-m) calc(var(--lumo-space-m) / 2);
      --lumo-space-tall-l: var(--lumo-space-l) calc(var(--lumo-space-l) / 2);
      --lumo-space-tall-xl: var(--lumo-space-xl) calc(var(--lumo-space-xl) / 2);
    }
  </style>
</custom-style>`;

document.head.appendChild($_documentContainer$1.content);

const $_documentContainer$2 = document.createElement('template');

$_documentContainer$2.innerHTML = `<custom-style>
  <style>
    html {
      /* Border radius */
      --lumo-border-radius-s: 0.25em; /* Checkbox, badge, date-picker year indicator, etc */
      --lumo-border-radius-m: var(--lumo-border-radius, 0.25em); /* Button, text field, menu overlay, etc */
      --lumo-border-radius-l: 0.5em; /* Dialog, notification, etc */
      --lumo-border-radius: 0.25em; /* Deprecated */

      /* Shadow */
      --lumo-box-shadow-xs: 0 1px 4px -1px var(--lumo-shade-50pct);
      --lumo-box-shadow-s: 0 2px 4px -1px var(--lumo-shade-20pct), 0 3px 12px -1px var(--lumo-shade-30pct);
      --lumo-box-shadow-m: 0 2px 6px -1px var(--lumo-shade-20pct), 0 8px 24px -4px var(--lumo-shade-40pct);
      --lumo-box-shadow-l: 0 3px 18px -2px var(--lumo-shade-20pct), 0 12px 48px -6px var(--lumo-shade-40pct);
      --lumo-box-shadow-xl: 0 4px 24px -3px var(--lumo-shade-20pct), 0 18px 64px -8px var(--lumo-shade-40pct);

      /* Clickable element cursor */
      --lumo-clickable-cursor: default;
    }
  </style>
</custom-style>`;

document.head.appendChild($_documentContainer$2.content);

const $_documentContainer$3 = document.createElement('template');

$_documentContainer$3.innerHTML = `<custom-style>
  <style>
    html {
      /* Base (background) */
      --lumo-base-color: #FFF;

      /* Tint */
      --lumo-tint-5pct: hsla(0, 0%, 100%, 0.3);
      --lumo-tint-10pct: hsla(0, 0%, 100%, 0.37);
      --lumo-tint-20pct: hsla(0, 0%, 100%, 0.44);
      --lumo-tint-30pct: hsla(0, 0%, 100%, 0.5);
      --lumo-tint-40pct: hsla(0, 0%, 100%, 0.57);
      --lumo-tint-50pct: hsla(0, 0%, 100%, 0.64);
      --lumo-tint-60pct: hsla(0, 0%, 100%, 0.7);
      --lumo-tint-70pct: hsla(0, 0%, 100%, 0.77);
      --lumo-tint-80pct: hsla(0, 0%, 100%, 0.84);
      --lumo-tint-90pct: hsla(0, 0%, 100%, 0.9);
      --lumo-tint: #FFF;

      /* Shade */
      --lumo-shade-5pct: hsla(214, 61%, 25%, 0.05);
      --lumo-shade-10pct: hsla(214, 57%, 24%, 0.1);
      --lumo-shade-20pct: hsla(214, 53%, 23%, 0.16);
      --lumo-shade-30pct: hsla(214, 50%, 22%, 0.26);
      --lumo-shade-40pct: hsla(214, 47%, 21%, 0.38);
      --lumo-shade-50pct: hsla(214, 45%, 20%, 0.5);
      --lumo-shade-60pct: hsla(214, 43%, 19%, 0.61);
      --lumo-shade-70pct: hsla(214, 42%, 18%, 0.72);
      --lumo-shade-80pct: hsla(214, 41%, 17%, 0.83);
      --lumo-shade-90pct: hsla(214, 40%, 16%, 0.94);
      --lumo-shade: hsl(214, 35%, 15%);

      /* Contrast */
      --lumo-contrast-5pct: var(--lumo-shade-5pct);
      --lumo-contrast-10pct: var(--lumo-shade-10pct);
      --lumo-contrast-20pct: var(--lumo-shade-20pct);
      --lumo-contrast-30pct: var(--lumo-shade-30pct);
      --lumo-contrast-40pct: var(--lumo-shade-40pct);
      --lumo-contrast-50pct: var(--lumo-shade-50pct);
      --lumo-contrast-60pct: var(--lumo-shade-60pct);
      --lumo-contrast-70pct: var(--lumo-shade-70pct);
      --lumo-contrast-80pct: var(--lumo-shade-80pct);
      --lumo-contrast-90pct: var(--lumo-shade-90pct);
      --lumo-contrast: var(--lumo-shade);

      /* Text */
      --lumo-header-text-color: var(--lumo-contrast);
      --lumo-body-text-color: var(--lumo-contrast-90pct);
      --lumo-secondary-text-color: var(--lumo-contrast-70pct);
      --lumo-tertiary-text-color: var(--lumo-contrast-50pct);
      --lumo-disabled-text-color: var(--lumo-contrast-30pct);

      /* Primary */
      --lumo-primary-color: hsl(214, 90%, 52%);
      --lumo-primary-color-50pct: hsla(214, 90%, 52%, 0.5);
      --lumo-primary-color-10pct: hsla(214, 90%, 52%, 0.1);
      --lumo-primary-text-color: var(--lumo-primary-color);
      --lumo-primary-contrast-color: #FFF;

      /* Error */
      --lumo-error-color: hsl(3, 100%, 61%);
      --lumo-error-color-50pct: hsla(3, 100%, 60%, 0.5);
      --lumo-error-color-10pct: hsla(3, 100%, 60%, 0.1);
      --lumo-error-text-color: hsl(3, 92%, 53%);
      --lumo-error-contrast-color: #FFF;

      /* Success */
      --lumo-success-color: hsl(145, 80%, 42%); /* hsl(144,82%,37%); */
      --lumo-success-color-50pct: hsla(145, 76%, 44%, 0.55);
      --lumo-success-color-10pct: hsla(145, 76%, 44%, 0.12);
      --lumo-success-text-color: hsl(145, 100%, 32%);
      --lumo-success-contrast-color: #FFF;
    }
  </style>
</custom-style><dom-module id="lumo-color">
  <template>
    <style>
      [theme~="dark"] {
        /* Base (background) */
        --lumo-base-color: hsl(214, 35%, 21%);

        /* Tint */
        --lumo-tint-5pct: hsla(214, 65%, 85%, 0.06);
        --lumo-tint-10pct: hsla(214, 60%, 80%, 0.14);
        --lumo-tint-20pct: hsla(214, 64%, 82%, 0.23);
        --lumo-tint-30pct: hsla(214, 69%, 84%, 0.32);
        --lumo-tint-40pct: hsla(214, 73%, 86%, 0.41);
        --lumo-tint-50pct: hsla(214, 78%, 88%, 0.5);
        --lumo-tint-60pct: hsla(214, 82%, 90%, 0.6);
        --lumo-tint-70pct: hsla(214, 87%, 92%, 0.7);
        --lumo-tint-80pct: hsla(214, 91%, 94%, 0.8);
        --lumo-tint-90pct: hsla(214, 96%, 96%, 0.9);
        --lumo-tint: hsl(214, 100%, 98%);

        /* Shade */
        --lumo-shade-5pct: hsla(214, 0%, 0%, 0.07);
        --lumo-shade-10pct: hsla(214, 4%, 2%, 0.15);
        --lumo-shade-20pct: hsla(214, 8%, 4%, 0.23);
        --lumo-shade-30pct: hsla(214, 12%, 6%, 0.32);
        --lumo-shade-40pct: hsla(214, 16%, 8%, 0.41);
        --lumo-shade-50pct: hsla(214, 20%, 10%, 0.5);
        --lumo-shade-60pct: hsla(214, 24%, 12%, 0.6);
        --lumo-shade-70pct: hsla(214, 28%, 13%, 0.7);
        --lumo-shade-80pct: hsla(214, 32%, 13%, 0.8);
        --lumo-shade-90pct: hsla(214, 33%, 13%, 0.9);
        --lumo-shade: hsl(214, 33%, 13%);

        /* Contrast */
        --lumo-contrast-5pct: var(--lumo-tint-5pct);
        --lumo-contrast-10pct: var(--lumo-tint-10pct);
        --lumo-contrast-20pct: var(--lumo-tint-20pct);
        --lumo-contrast-30pct: var(--lumo-tint-30pct);
        --lumo-contrast-40pct: var(--lumo-tint-40pct);
        --lumo-contrast-50pct: var(--lumo-tint-50pct);
        --lumo-contrast-60pct: var(--lumo-tint-60pct);
        --lumo-contrast-70pct: var(--lumo-tint-70pct);
        --lumo-contrast-80pct: var(--lumo-tint-80pct);
        --lumo-contrast-90pct: var(--lumo-tint-90pct);
        --lumo-contrast: var(--lumo-tint);

        /* Text */
        --lumo-header-text-color: var(--lumo-contrast);
        --lumo-body-text-color: var(--lumo-contrast-90pct);
        --lumo-secondary-text-color: var(--lumo-contrast-70pct);
        --lumo-tertiary-text-color: var(--lumo-contrast-50pct);
        --lumo-disabled-text-color: var(--lumo-contrast-30pct);

        /* Primary */
        --lumo-primary-color: hsl(214, 86%, 55%);
        --lumo-primary-color-50pct: hsla(214, 86%, 55%, 0.5);
        --lumo-primary-color-10pct: hsla(214, 90%, 63%, 0.1);
        --lumo-primary-text-color: hsl(214, 100%, 70%);
        --lumo-primary-contrast-color: #FFF;

        /* Error */
        --lumo-error-color: hsl(3, 90%, 63%);
        --lumo-error-color-50pct: hsla(3, 90%, 63%, 0.5);
        --lumo-error-color-10pct: hsla(3, 90%, 63%, 0.1);
        --lumo-error-text-color: hsl(3, 100%, 67%);

        /* Success */
        --lumo-success-color: hsl(145, 65%, 42%);
        --lumo-success-color-50pct: hsla(145, 65%, 42%, 0.5);
        --lumo-success-color-10pct: hsla(145, 65%, 42%, 0.1);
        --lumo-success-text-color: hsl(145, 85%, 47%);
      }

      html {
        color: var(--lumo-body-text-color);
        background-color: var(--lumo-base-color);
      }

      [theme~="dark"] {
        color: var(--lumo-body-text-color);
        background-color: var(--lumo-base-color);
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        color: var(--lumo-header-text-color);
      }

      a {
        color: var(--lumo-primary-text-color);
      }

      blockquote {
        color: var(--lumo-secondary-text-color);
      }

      code,
      pre {
        background-color: var(--lumo-contrast-10pct);
        border-radius: var(--lumo-border-radius-m);
      }
    </style>
  </template>
</dom-module><dom-module id="lumo-color-legacy">
  <template>
    <style include="lumo-color">
      :host {
        color: var(--lumo-body-text-color) !important;
        background-color: var(--lumo-base-color) !important;
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$3.content);

const $_documentContainer$4 = document.createElement('template');

$_documentContainer$4.innerHTML = `<custom-style>
  <style>
    html {
      /* Font families */
      --lumo-font-family: -apple-system, BlinkMacSystemFont, "Roboto", "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";

      /* Font sizes */
      --lumo-font-size-xxs: .75rem;
      --lumo-font-size-xs: .8125rem;
      --lumo-font-size-s: .875rem;
      --lumo-font-size-m: 1rem;
      --lumo-font-size-l: 1.125rem;
      --lumo-font-size-xl: 1.375rem;
      --lumo-font-size-xxl: 1.75rem;
      --lumo-font-size-xxxl: 2.5rem;

      /* Line heights */
      --lumo-line-height-xs: 1.25;
      --lumo-line-height-s: 1.375;
      --lumo-line-height-m: 1.625;
    }

  </style>
</custom-style><dom-module id="lumo-typography">
  <template>
    <style>
      html {
        font-family: var(--lumo-font-family);
        font-size: var(--lumo-font-size, var(--lumo-font-size-m));
        line-height: var(--lumo-line-height-m);
        -webkit-text-size-adjust: 100%;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Can’t combine with the above selector because that doesn’t work in browsers without native shadow dom */
      :host {
        font-family: var(--lumo-font-family);
        font-size: var(--lumo-font-size, var(--lumo-font-size-m));
        line-height: var(--lumo-line-height-m);
        -webkit-text-size-adjust: 100%;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      small,
      [theme~="font-size-s"] {
        font-size: var(--lumo-font-size-s);
        line-height: var(--lumo-line-height-s);
      }

      [theme~="font-size-xs"] {
        font-size: var(--lumo-font-size-xs);
        line-height: var(--lumo-line-height-xs);
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        font-weight: 600;
        line-height: var(--lumo-line-height-xs);
        margin-top: 1.25em;
      }

      h1 {
        font-size: var(--lumo-font-size-xxxl);
        margin-bottom: 0.75em;
      }

      h2 {
        font-size: var(--lumo-font-size-xxl);
        margin-bottom: 0.5em;
      }

      h3 {
        font-size: var(--lumo-font-size-xl);
        margin-bottom: 0.5em;
      }

      h4 {
        font-size: var(--lumo-font-size-l);
        margin-bottom: 0.5em;
      }

      h5 {
        font-size: var(--lumo-font-size-m);
        margin-bottom: 0.25em;
      }

      h6 {
        font-size: var(--lumo-font-size-xs);
        margin-bottom: 0;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      p,
      blockquote {
        margin-top: 0.5em;
        margin-bottom: 0.75em;
      }

      a {
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      hr {
        display: block;
        align-self: stretch;
        height: 1px;
        border: 0;
        padding: 0;
        margin: var(--lumo-space-s) calc(var(--lumo-border-radius-m) / 2);
        background-color: var(--lumo-contrast-10pct);
      }

      blockquote {
        border-left: 2px solid var(--lumo-contrast-30pct);
      }

      b,
      strong {
        font-weight: 600;
      }

      /* RTL specific styles */

      blockquote[dir="rtl"] {
        border-left: none;
        border-right: 2px solid var(--lumo-contrast-30pct);
      }

    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$4.content);

const $_documentContainer$5 = document.createElement('template');

$_documentContainer$5.innerHTML = `<dom-module id="lumo-overlay">
  <template>
    <style>
      :host {
        top: var(--lumo-space-m);
        right: var(--lumo-space-m);
        bottom: var(--lumo-space-m);
        left: var(--lumo-space-m);
        /* Workaround for Edge issue (only on Surface), where an overflowing vaadin-list-box inside vaadin-select-overlay makes the overlay transparent */
        /* stylelint-disable-next-line */
        outline: 0px solid transparent;
      }

      [part="overlay"] {
        background-color: var(--lumo-base-color);
        background-image: linear-gradient(var(--lumo-tint-5pct), var(--lumo-tint-5pct));
        border-radius: var(--lumo-border-radius-m);
        box-shadow: 0 0 0 1px var(--lumo-shade-5pct), var(--lumo-box-shadow-m);
        color: var(--lumo-body-text-color);
        font-family: var(--lumo-font-family);
        font-size: var(--lumo-font-size-m);
        font-weight: 400;
        line-height: var(--lumo-line-height-m);
        letter-spacing: 0;
        text-transform: none;
        -webkit-text-size-adjust: 100%;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      [part="content"] {
        padding: var(--lumo-space-xs);
      }

      [part="backdrop"] {
        background-color: var(--lumo-shade-20pct);
        animation: 0.2s lumo-overlay-backdrop-enter both;
        will-change: opacity;
      }

      @keyframes lumo-overlay-backdrop-enter {
        0% {
          opacity: 0;
        }
      }

      :host([closing]) [part="backdrop"] {
        animation: 0.2s lumo-overlay-backdrop-exit both;
      }

      @keyframes lumo-overlay-backdrop-exit {
        100% {
          opacity: 0;
        }
      }

      @keyframes lumo-overlay-dummy-animation {
        0% { opacity: 1; }
        100% { opacity: 1; }
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$5.content);

const $_documentContainer$6 = document.createElement('template');

$_documentContainer$6.innerHTML = `<dom-module id="lumo-menu-overlay-core">
  <template>
    <style>
      :host([opening]),
      :host([closing]) {
        animation: 0.14s lumo-overlay-dummy-animation;
      }

      [part="overlay"] {
        will-change: opacity, transform;
      }

      :host([opening]) [part="overlay"] {
        animation: 0.1s lumo-menu-overlay-enter ease-out both;
      }

      @keyframes lumo-menu-overlay-enter {
        0% {
          opacity: 0;
          transform: translateY(-4px);
        }
      }

      :host([closing]) [part="overlay"] {
        animation: 0.1s lumo-menu-overlay-exit both;
      }

      @keyframes lumo-menu-overlay-exit {
        100% {
          opacity: 0;
        }
      }
    </style>
  </template>
</dom-module><dom-module id="lumo-menu-overlay">
  <template>
    <style include="lumo-overlay lumo-menu-overlay-core">
      /* Small viewport (bottom sheet) styles */
      /* Use direct media queries instead of the state attributes (\`[phone]\` and \`[fullscreen]\`) provided by the elements */
      @media (max-width: 420px), (max-height: 420px) {
        :host {
          top: 0 !important;
          right: 0 !important;
          bottom: var(--vaadin-overlay-viewport-bottom, 0) !important;
          left: 0 !important;
          align-items: stretch !important;
          justify-content: flex-end !important;
        }

        [part="overlay"] {
          max-height: 50vh;
          width: 100vw;
          border-radius: 0;
          box-shadow: var(--lumo-box-shadow-xl);
        }

        /* The content part scrolls instead of the overlay part, because of the gradient fade-out */
        [part="content"] {
          padding: 30px var(--lumo-space-m);
          max-height: inherit;
          box-sizing: border-box;
          -webkit-overflow-scrolling: touch;
          overflow: auto;
          -webkit-mask-image: linear-gradient(transparent, #000 40px, #000 calc(100% - 40px), transparent);
          mask-image: linear-gradient(transparent, #000 40px, #000 calc(100% - 40px), transparent);
        }

        [part="backdrop"] {
          display: block;
        }

        /* Animations */

        :host([opening]) [part="overlay"] {
          animation: 0.2s lumo-mobile-menu-overlay-enter cubic-bezier(.215, .61, .355, 1) both;
        }

        :host([closing]),
        :host([closing]) [part="backdrop"] {
          animation-delay: 0.14s;
        }

        :host([closing]) [part="overlay"] {
          animation: 0.14s 0.14s lumo-mobile-menu-overlay-exit cubic-bezier(.55, .055, .675, .19) both;
        }
      }

      @keyframes lumo-mobile-menu-overlay-enter {
        0% {
          transform: translateY(150%);
        }
      }

      @keyframes lumo-mobile-menu-overlay-exit {
        100% {
          transform: translateY(150%);
        }
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$6.content);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Class representing a static string value which can be used to filter
 * strings by asseting that they have been created via this class. The
 * `value` property returns the string passed to the constructor.
 */
class LiteralString {
  constructor(string) {
    /** @type {string} */
    this.value = string.toString();
  }
  /**
   * @return {string} LiteralString string value
   * @override
   */
  toString() {
    return this.value;
  }
}

/**
 * @param {*} value Object to stringify into HTML
 * @return {string} HTML stringified form of `obj`
 */
function literalValue(value) {
  if (value instanceof LiteralString) {
    return /** @type {!LiteralString} */(value).value;
  } else {
    throw new Error(
        `non-literal value passed to Polymer's htmlLiteral function: ${value}`
    );
  }
}

/**
 * @param {*} value Object to stringify into HTML
 * @return {string} HTML stringified form of `obj`
 */
function htmlValue(value) {
  if (value instanceof HTMLTemplateElement) {
    return /** @type {!HTMLTemplateElement } */(value).innerHTML;
  } else if (value instanceof LiteralString) {
    return literalValue(value);
  } else {
    throw new Error(
        `non-template value passed to Polymer's html function: ${value}`);
  }
}

/**
 * A template literal tag that creates an HTML <template> element from the
 * contents of the string.
 *
 * This allows you to write a Polymer Template in JavaScript.
 *
 * Templates can be composed by interpolating `HTMLTemplateElement`s in
 * expressions in the JavaScript template literal. The nested template's
 * `innerHTML` is included in the containing template.  The only other
 * values allowed in expressions are those returned from `htmlLiteral`
 * which ensures only literal values from JS source ever reach the HTML, to
 * guard against XSS risks.
 *
 * All other values are disallowed in expressions to help prevent XSS
 * attacks; however, `htmlLiteral` can be used to compose static
 * string values into templates. This is useful to compose strings into
 * places that do not accept html, like the css text of a `style`
 * element.
 *
 * Example:
 *
 *     static get template() {
 *       return html`
 *         <style>:host{ content:"..." }</style>
 *         <div class="shadowed">${this.partialTemplate}</div>
 *         ${super.template}
 *       `;
 *     }
 *     static get partialTemplate() { return html`<span>Partial!</span>`; }
 *
 * @param {!ITemplateArray} strings Constant parts of tagged template literal
 * @param {...*} values Variable parts of tagged template literal
 * @return {!HTMLTemplateElement} Constructed HTMLTemplateElement
 */
const html = function html(strings, ...values) {
  const template = /** @type {!HTMLTemplateElement} */(document.createElement('template'));
  template.innerHTML = values.reduce((acc, v, idx) =>
      acc + htmlValue(v) + strings[idx + 1], strings[0]);
  return template;
};

const $_documentContainer$7 = html`<dom-module id="lumo-date-picker-overlay" theme-for="vaadin-date-picker-overlay">
  <template>
    <style include="lumo-menu-overlay">
      [part="overlay"] {
        /*
        Width:
            date cell widths
          + month calendar side padding
          + year scroller width
        */
        width:
          calc(
              var(--lumo-size-m) * 7
            + var(--lumo-space-xs) * 2
            + 57px
          );
        height: 100%;
        max-height: calc(var(--lumo-size-m) * 14);
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      [part="overlay"] {
        flex-direction: column;
      }

      [part="content"] {
        padding: 0;
        height: 100%;
        overflow: hidden;
        -webkit-mask-image: none;
        mask-image: none;
      }

      @media (max-width: 420px), (max-height: 420px) {
        [part="overlay"] {
          width: 100vw;
          height: 70vh;
          max-height: 70vh;
        }
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$7.content);

const $_documentContainer$8 = html`<dom-module id="lumo-button" theme-for="vaadin-button">
  <template>
    <style>
      :host {
        /* Sizing */
        --lumo-button-size: var(--lumo-size-m);
        min-width: calc(var(--lumo-button-size) * 2);
        height: var(--lumo-button-size);
        padding: 0 calc(var(--lumo-button-size) / 3 + var(--lumo-border-radius) / 2);
        margin: var(--lumo-space-xs) 0;
        box-sizing: border-box;
        /* Style */
        font-family: var(--lumo-font-family);
        font-size: var(--lumo-font-size-m);
        font-weight: 500;
        color: var(--_lumo-button-color, var(--lumo-primary-text-color));
        background-color: var(--_lumo-button-background-color, var(--lumo-contrast-5pct));
        border-radius: var(--lumo-border-radius);
        cursor: default;
        -webkit-tap-highlight-color: transparent;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* Set only for the internal parts so we don’t affect the host vertical alignment */
      [part="label"],
      [part="prefix"],
      [part="suffix"] {
        line-height: var(--lumo-line-height-xs);
      }

      [part="label"] {
        padding: calc(var(--lumo-button-size) / 6) 0;
      }

      :host([theme~="small"]) {
        font-size: var(--lumo-font-size-s);
        --lumo-button-size: var(--lumo-size-s);
      }

      :host([theme~="large"]) {
        font-size: var(--lumo-font-size-l);
        --lumo-button-size: var(--lumo-size-l);
      }

      /* This needs to be the last selector for it to take priority */
      :host([disabled][disabled]) {
        pointer-events: none;
        color: var(--lumo-disabled-text-color);
        background-color: var(--lumo-contrast-5pct);
      }

      /* For interaction states */
      :host::before,
      :host::after {
        content: "";
        /* We rely on the host always being relative */
        position: absolute;
        z-index: 1;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        background-color: currentColor;
        border-radius: inherit;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
      }

      /* Hover */

      :host(:hover)::before {
        opacity: 0.05;
      }

      /* Disable hover for touch devices */
      @media (pointer: coarse) {
        :host(:not([active]):hover)::before {
          opacity: 0;
        }
      }

      /* Active */

      :host::after {
        transition: opacity 1.4s, transform 0.1s;
        filter: blur(8px);
      }

      :host([active])::before {
        opacity: 0.1;
        transition-duration: 0s;
      }

      :host([active])::after {
        opacity: 0.1;
        transition-duration: 0s, 0s;
        transform: scale(0);
      }

      /* Keyboard focus */

      :host([focus-ring]) {
        box-shadow: 0 0 0 2px var(--lumo-primary-color-50pct);
      }

      /* Types (primary, tertiary, tertiary-inline */

      :host([theme~="tertiary"]),
      :host([theme~="tertiary-inline"]) {
        background-color: transparent !important;
        transition: opacity 0.2s;
        min-width: 0;
      }

      :host([theme~="tertiary"])::before,
      :host([theme~="tertiary-inline"])::before {
        display: none;
      }

      :host([theme~="tertiary"]) {
        padding: 0 calc(var(--lumo-button-size) / 6);
      }

      @media (hover: hover) {
        :host([theme*="tertiary"]:not([active]):hover) {
          opacity: 0.8;
        }
      }

      :host([theme~="tertiary"][active]),
      :host([theme~="tertiary-inline"][active]) {
        opacity: 0.5;
        transition-duration: 0s;
      }

      :host([theme~="tertiary-inline"]) {
        margin: 0;
        height: auto;
        padding: 0;
        line-height: inherit;
        font-size: inherit;
      }

      :host([theme~="tertiary-inline"]) [part="label"] {
        padding: 0;
        overflow: visible;
        line-height: inherit;
      }

      :host([theme~="primary"]) {
        background-color: var(--_lumo-button-primary-background-color, var(--lumo-primary-color));
        color: var(--_lumo-button-primary-color, var(--lumo-primary-contrast-color));
        font-weight: 600;
        min-width: calc(var(--lumo-button-size) * 2.5);
      }

      :host([theme~="primary"][disabled]) {
        background-color: var(--lumo-primary-color-50pct);
        color: var(--lumo-primary-contrast-color);
      }

      :host([theme~="primary"]:hover)::before {
        opacity: 0.1;
      }

      :host([theme~="primary"][active])::before {
        background-color: var(--lumo-shade-20pct);
      }

      @media (pointer: coarse) {
        :host([theme~="primary"][active])::before {
          background-color: var(--lumo-shade-60pct);
        }

        :host([theme~="primary"]:not([active]):hover)::before {
          opacity: 0;
        }
      }

      :host([theme~="primary"][active])::after {
        opacity: 0.2;
      }

      /* Colors (success, error, contrast) */

      :host([theme~="success"]) {
        color: var(--lumo-success-text-color);
      }

      :host([theme~="success"][theme~="primary"]) {
        background-color: var(--lumo-success-color);
        color: var(--lumo-success-contrast-color);
      }

      :host([theme~="success"][theme~="primary"][disabled]) {
        background-color: var(--lumo-success-color-50pct);
      }

      :host([theme~="error"]) {
        color: var(--lumo-error-text-color);
      }

      :host([theme~="error"][theme~="primary"]) {
        background-color: var(--lumo-error-color);
        color: var(--lumo-error-contrast-color);
      }

      :host([theme~="error"][theme~="primary"][disabled]) {
        background-color: var(--lumo-error-color-50pct);
      }

      :host([theme~="contrast"]) {
        color: var(--lumo-contrast);
      }

      :host([theme~="contrast"][theme~="primary"]) {
        background-color: var(--lumo-contrast);
        color: var(--lumo-base-color);
      }

      :host([theme~="contrast"][theme~="primary"][disabled]) {
        background-color: var(--lumo-contrast-50pct);
      }

      /* Icons */

      [part] ::slotted(iron-icon) {
        display: inline-block;
        width: var(--lumo-icon-size-m);
        height: var(--lumo-icon-size-m);
      }

      /* Vaadin icons are based on a 16x16 grid (unlike Lumo and Material icons with 24x24), so they look too big by default */
      [part] ::slotted(iron-icon[icon^="vaadin:"]) {
        padding: 0.25em;
        box-sizing: border-box !important;
      }

      [part="prefix"] {
        margin-left: -0.25em;
        margin-right: 0.25em;
      }

      [part="suffix"] {
        margin-left: 0.25em;
        margin-right: -0.25em;
      }

      /* Icon-only */

      :host([theme~="icon"]:not([theme~="tertiary-inline"])) {
        min-width: var(--lumo-button-size);
        padding-left: calc(var(--lumo-button-size) / 4);
        padding-right: calc(var(--lumo-button-size) / 4);
      }

      :host([theme~="icon"]) [part="prefix"],
      :host([theme~="icon"]) [part="suffix"] {
        margin-left: 0;
        margin-right: 0;
      }

      /* RTL specific styles */

      :host([dir="rtl"]) [part="prefix"] {
        margin-left: 0.25em;
        margin-right: -0.25em;
      }

      :host([dir="rtl"]) [part="suffix"] {
        margin-left: -0.25em;
        margin-right: 0.25em;
      }

      :host([dir="rtl"][theme~="icon"]) [part="prefix"],
      :host([dir="rtl"][theme~="icon"]) [part="suffix"] {
        margin-left: 0;
        margin-right: 0;
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$8.content);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

// unique global id for deduping mixins.
let dedupeId = 0;

/* eslint-disable valid-jsdoc */
/**
 * Wraps an ES6 class expression mixin such that the mixin is only applied
 * if it has not already been applied its base argument. Also memoizes mixin
 * applications.
 *
 * @template T
 * @param {T} mixin ES6 class expression mixin to wrap
 * @return {T}
 * @suppress {invalidCasts}
 */
const dedupingMixin = function(mixin) {
  let mixinApplications = /** @type {!MixinFunction} */(mixin).__mixinApplications;
  if (!mixinApplications) {
    mixinApplications = new WeakMap();
    /** @type {!MixinFunction} */(mixin).__mixinApplications = mixinApplications;
  }
  // maintain a unique id for each mixin
  let mixinDedupeId = dedupeId++;
  function dedupingMixin(base) {
    let baseSet = /** @type {!MixinFunction} */(base).__mixinSet;
    if (baseSet && baseSet[mixinDedupeId]) {
      return base;
    }
    let map = mixinApplications;
    let extended = map.get(base);
    if (!extended) {
      extended = /** @type {!Function} */(mixin)(base);
      map.set(base, extended);
      // copy inherited mixin set from the extended class, or the base class
      // NOTE: we avoid use of Set here because some browser (IE11)
      // cannot extend a base Set via the constructor.
      let mixinSet = Object.create(/** @type {!MixinFunction} */(extended).__mixinSet || baseSet || null);
      mixinSet[mixinDedupeId] = true;
      /** @type {!MixinFunction} */(extended).__mixinSet = mixinSet;
    }
    return extended;
  }

  return dedupingMixin;
};
/* eslint-enable valid-jsdoc */

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/* eslint-disable valid-jsdoc */
/**
 * Node wrapper to ensure ShadowDOM safe operation regardless of polyfill
 * presence or mode. Note that with the introduction of `ShadyDOM.noPatch`,
 * a node wrapper must be used to access ShadowDOM API.
 * This is similar to using `Polymer.dom` but relies exclusively
 * on the presence of the ShadyDOM polyfill rather than requiring the loading
 * of legacy (Polymer.dom) API.
 * @type {function(Node):Node}
 */
const wrap = (window['ShadyDOM'] && window['ShadyDOM']['noPatch'] && window['ShadyDOM']['wrap']) ?
  window['ShadyDOM']['wrap'] :
  (window['ShadyDOM'] ? (n) => ShadyDOM['patch'](n) : (n) => n);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Module with utilities for manipulating structured data path strings.
 *
 * @summary Module with utilities for manipulating structured data path strings.
 */

/**
 * Returns true if the given string is a structured data path (has dots).
 *
 * Example:
 *
 * ```
 * isPath('foo.bar.baz') // true
 * isPath('foo')         // false
 * ```
 *
 * @param {string} path Path string
 * @return {boolean} True if the string contained one or more dots
 */
function isPath(path) {
  return path.indexOf('.') >= 0;
}

/**
 * Returns the root property name for the given path.
 *
 * Example:
 *
 * ```
 * root('foo.bar.baz') // 'foo'
 * root('foo')         // 'foo'
 * ```
 *
 * @param {string} path Path string
 * @return {string} Root property name
 */
function root(path) {
  let dotIndex = path.indexOf('.');
  if (dotIndex === -1) {
    return path;
  }
  return path.slice(0, dotIndex);
}

/**
 * Given `base` is `foo.bar`, `foo` is an ancestor, `foo.bar` is not
 * Returns true if the given path is an ancestor of the base path.
 *
 * Example:
 *
 * ```
 * isAncestor('foo.bar', 'foo')         // true
 * isAncestor('foo.bar', 'foo.bar')     // false
 * isAncestor('foo.bar', 'foo.bar.baz') // false
 * ```
 *
 * @param {string} base Path string to test against.
 * @param {string} path Path string to test.
 * @return {boolean} True if `path` is an ancestor of `base`.
 */
function isAncestor(base, path) {
  //     base.startsWith(path + '.');
  return base.indexOf(path + '.') === 0;
}

/**
 * Given `base` is `foo.bar`, `foo.bar.baz` is an descendant
 *
 * Example:
 *
 * ```
 * isDescendant('foo.bar', 'foo.bar.baz') // true
 * isDescendant('foo.bar', 'foo.bar')     // false
 * isDescendant('foo.bar', 'foo')         // false
 * ```
 *
 * @param {string} base Path string to test against.
 * @param {string} path Path string to test.
 * @return {boolean} True if `path` is a descendant of `base`.
 */
function isDescendant(base, path) {
  //     path.startsWith(base + '.');
  return path.indexOf(base + '.') === 0;
}

/**
 * Replaces a previous base path with a new base path, preserving the
 * remainder of the path.
 *
 * User must ensure `path` has a prefix of `base`.
 *
 * Example:
 *
 * ```
 * translate('foo.bar', 'zot', 'foo.bar.baz') // 'zot.baz'
 * ```
 *
 * @param {string} base Current base string to remove
 * @param {string} newBase New base string to replace with
 * @param {string} path Path to translate
 * @return {string} Translated string
 */
function translate(base, newBase, path) {
  return newBase + path.slice(base.length);
}

/**
 * @param {string} base Path string to test against
 * @param {string} path Path string to test
 * @return {boolean} True if `path` is equal to `base`
 */
function matches(base, path) {
  return (base === path) ||
         isAncestor(base, path) ||
         isDescendant(base, path);
}

/**
 * Converts array-based paths to flattened path.  String-based paths
 * are returned as-is.
 *
 * Example:
 *
 * ```
 * normalize(['foo.bar', 0, 'baz'])  // 'foo.bar.0.baz'
 * normalize('foo.bar.0.baz')        // 'foo.bar.0.baz'
 * ```
 *
 * @param {string | !Array<string|number>} path Input path
 * @return {string} Flattened path
 */
function normalize(path) {
  if (Array.isArray(path)) {
    let parts = [];
    for (let i=0; i<path.length; i++) {
      let args = path[i].toString().split('.');
      for (let j=0; j<args.length; j++) {
        parts.push(args[j]);
      }
    }
    return parts.join('.');
  } else {
    return path;
  }
}

/**
 * Splits a path into an array of property names. Accepts either arrays
 * of path parts or strings.
 *
 * Example:
 *
 * ```
 * split(['foo.bar', 0, 'baz'])  // ['foo', 'bar', '0', 'baz']
 * split('foo.bar.0.baz')        // ['foo', 'bar', '0', 'baz']
 * ```
 *
 * @param {string | !Array<string|number>} path Input path
 * @return {!Array<string>} Array of path parts
 * @suppress {checkTypes}
 */
function split(path) {
  if (Array.isArray(path)) {
    return normalize(path).split('.');
  }
  return path.toString().split('.');
}

/**
 * Reads a value from a path.  If any sub-property in the path is `undefined`,
 * this method returns `undefined` (will never throw.
 *
 * @param {Object} root Object from which to dereference path from
 * @param {string | !Array<string|number>} path Path to read
 * @param {Object=} info If an object is provided to `info`, the normalized
 *  (flattened) path will be set to `info.path`.
 * @return {*} Value at path, or `undefined` if the path could not be
 *  fully dereferenced.
 */
function get(root, path, info) {
  let prop = root;
  let parts = split(path);
  // Loop over path parts[0..n-1] and dereference
  for (let i=0; i<parts.length; i++) {
    if (!prop) {
      return;
    }
    let part = parts[i];
    prop = prop[part];
  }
  if (info) {
    info.path = parts.join('.');
  }
  return prop;
}

/**
 * Sets a value to a path.  If any sub-property in the path is `undefined`,
 * this method will no-op.
 *
 * @param {Object} root Object from which to dereference path from
 * @param {string | !Array<string|number>} path Path to set
 * @param {*} value Value to set to path
 * @return {string | undefined} The normalized version of the input path
 */
function set(root, path, value) {
  let prop = root;
  let parts = split(path);
  let last = parts[parts.length-1];
  if (parts.length > 1) {
    // Loop over path parts[0..n-2] and dereference
    for (let i=0; i<parts.length-1; i++) {
      let part = parts[i];
      prop = prop[part];
      if (!prop) {
        return;
      }
    }
    // Set value to object at end of path
    prop[last] = value;
  } else {
    // Simple property set
    prop[path] = value;
  }
  return parts.join('.');
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const caseMap = {};
const DASH_TO_CAMEL = /-[a-z]/g;
const CAMEL_TO_DASH = /([A-Z])/g;

/**
 * @fileoverview Module with utilities for converting between "dash-case" and
 * "camelCase" identifiers.
 */

/**
 * Converts "dash-case" identifier (e.g. `foo-bar-baz`) to "camelCase"
 * (e.g. `fooBarBaz`).
 *
 * @param {string} dash Dash-case identifier
 * @return {string} Camel-case representation of the identifier
 */
function dashToCamelCase(dash) {
  return caseMap[dash] || (
    caseMap[dash] = dash.indexOf('-') < 0 ? dash : dash.replace(DASH_TO_CAMEL,
      (m) => m[1].toUpperCase()
    )
  );
}

/**
 * Converts "camelCase" identifier (e.g. `fooBarBaz`) to "dash-case"
 * (e.g. `foo-bar-baz`).
 *
 * @param {string} camel Camel-case identifier
 * @return {string} Dash-case representation of the identifier
 */
function camelToDashCase(camel) {
  return caseMap[camel] || (
    caseMap[camel] = camel.replace(CAMEL_TO_DASH, '-$1').toLowerCase()
  );
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

// Microtask implemented using Mutation Observer
let microtaskCurrHandle = 0;
let microtaskLastHandle = 0;
let microtaskCallbacks = [];
let microtaskNodeContent = 0;
let microtaskScheduled = false;
let microtaskNode = document.createTextNode('');
new window.MutationObserver(microtaskFlush).observe(microtaskNode, {characterData: true});

function microtaskFlush() {
  microtaskScheduled = false;
  const len = microtaskCallbacks.length;
  for (let i = 0; i < len; i++) {
    let cb = microtaskCallbacks[i];
    if (cb) {
      try {
        cb();
      } catch (e) {
        setTimeout(() => { throw e; });
      }
    }
  }
  microtaskCallbacks.splice(0, len);
  microtaskLastHandle += len;
}

/**
 * Async interface wrapper around `setTimeout`.
 *
 * @namespace
 * @summary Async interface wrapper around `setTimeout`.
 */
const timeOut = {
  /**
   * Returns a sub-module with the async interface providing the provided
   * delay.
   *
   * @memberof timeOut
   * @param {number=} delay Time to wait before calling callbacks in ms
   * @return {!AsyncInterface} An async timeout interface
   */
  after(delay) {
    return {
      run(fn) { return window.setTimeout(fn, delay); },
      cancel(handle) {
        window.clearTimeout(handle);
      }
    };
  },
  /**
   * Enqueues a function called in the next task.
   *
   * @memberof timeOut
   * @param {!Function} fn Callback to run
   * @param {number=} delay Delay in milliseconds
   * @return {number} Handle used for canceling task
   */
  run(fn, delay) {
    return window.setTimeout(fn, delay);
  },
  /**
   * Cancels a previously enqueued `timeOut` callback.
   *
   * @memberof timeOut
   * @param {number} handle Handle returned from `run` of callback to cancel
   * @return {void}
   */
  cancel(handle) {
    window.clearTimeout(handle);
  }
};

/**
 * Async interface wrapper around `requestAnimationFrame`.
 *
 * @namespace
 * @summary Async interface wrapper around `requestAnimationFrame`.
 */
const animationFrame = {
  /**
   * Enqueues a function called at `requestAnimationFrame` timing.
   *
   * @memberof animationFrame
   * @param {function(number):void} fn Callback to run
   * @return {number} Handle used for canceling task
   */
  run(fn) {
    return window.requestAnimationFrame(fn);
  },
  /**
   * Cancels a previously enqueued `animationFrame` callback.
   *
   * @memberof animationFrame
   * @param {number} handle Handle returned from `run` of callback to cancel
   * @return {void}
   */
  cancel(handle) {
    window.cancelAnimationFrame(handle);
  }
};

/**
 * Async interface wrapper around `requestIdleCallback`.  Falls back to
 * `setTimeout` on browsers that do not support `requestIdleCallback`.
 *
 * @namespace
 * @summary Async interface wrapper around `requestIdleCallback`.
 */
const idlePeriod = {
  /**
   * Enqueues a function called at `requestIdleCallback` timing.
   *
   * @memberof idlePeriod
   * @param {function(!IdleDeadline):void} fn Callback to run
   * @return {number} Handle used for canceling task
   */
  run(fn) {
    return window.requestIdleCallback ?
      window.requestIdleCallback(fn) :
      window.setTimeout(fn, 16);
  },
  /**
   * Cancels a previously enqueued `idlePeriod` callback.
   *
   * @memberof idlePeriod
   * @param {number} handle Handle returned from `run` of callback to cancel
   * @return {void}
   */
  cancel(handle) {
    window.cancelIdleCallback ?
      window.cancelIdleCallback(handle) :
      window.clearTimeout(handle);
  }
};

/**
 * Async interface for enqueuing callbacks that run at microtask timing.
 *
 * Note that microtask timing is achieved via a single `MutationObserver`,
 * and thus callbacks enqueued with this API will all run in a single
 * batch, and not interleaved with other microtasks such as promises.
 * Promises are avoided as an implementation choice for the time being
 * due to Safari bugs that cause Promises to lack microtask guarantees.
 *
 * @namespace
 * @summary Async interface for enqueuing callbacks that run at microtask
 *   timing.
 */
const microTask = {

  /**
   * Enqueues a function called at microtask timing.
   *
   * @memberof microTask
   * @param {!Function=} callback Callback to run
   * @return {number} Handle used for canceling task
   */
  run(callback) {
    if (!microtaskScheduled) {
      microtaskScheduled = true;
      microtaskNode.textContent = microtaskNodeContent++;
    }
    microtaskCallbacks.push(callback);
    return microtaskCurrHandle++;
  },

  /**
   * Cancels a previously enqueued `microTask` callback.
   *
   * @memberof microTask
   * @param {number} handle Handle returned from `run` of callback to cancel
   * @return {void}
   */
  cancel(handle) {
    const idx = handle - microtaskLastHandle;
    if (idx >= 0) {
      if (!microtaskCallbacks[idx]) {
        throw new Error('invalid async handle: ' + handle);
      }
      microtaskCallbacks[idx] = null;
    }
  }

};

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/** @const {!AsyncInterface} */
const microtask = microTask;

/**
 * Element class mixin that provides basic meta-programming for creating one
 * or more property accessors (getter/setter pair) that enqueue an async
 * (batched) `_propertiesChanged` callback.
 *
 * For basic usage of this mixin, call `MyClass.createProperties(props)`
 * once at class definition time to create property accessors for properties
 * named in props, implement `_propertiesChanged` to react as desired to
 * property changes, and implement `static get observedAttributes()` and
 * include lowercase versions of any property names that should be set from
 * attributes. Last, call `this._enableProperties()` in the element's
 * `connectedCallback` to enable the accessors.
 *
 * @mixinFunction
 * @polymer
 * @summary Element class mixin for reacting to property changes from
 *   generated property accessors.
 * @template T
 * @param {function(new:T)} superClass Class to apply mixin to.
 * @return {function(new:T)} superClass with mixin applied.
 */
const PropertiesChanged = dedupingMixin(
    /**
     * @template T
     * @param {function(new:T)} superClass Class to apply mixin to.
     * @return {function(new:T)} superClass with mixin applied.
     */
    (superClass) => {

  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_PropertiesChanged}
   * @unrestricted
   */
  class PropertiesChanged extends superClass {

    /**
     * Creates property accessors for the given property names.
     * @param {!Object} props Object whose keys are names of accessors.
     * @return {void}
     * @protected
     * @nocollapse
     */
    static createProperties(props) {
      const proto = this.prototype;
      for (let prop in props) {
        // don't stomp an existing accessor
        if (!(prop in proto)) {
          proto._createPropertyAccessor(prop);
        }
      }
    }

    /**
     * Returns an attribute name that corresponds to the given property.
     * The attribute name is the lowercased property name. Override to
     * customize this mapping.
     * @param {string} property Property to convert
     * @return {string} Attribute name corresponding to the given property.
     *
     * @protected
     * @nocollapse
     */
    static attributeNameForProperty(property) {
      return property.toLowerCase();
    }

    /**
     * Override point to provide a type to which to deserialize a value to
     * a given property.
     * @param {string} name Name of property
     *
     * @protected
     * @nocollapse
     */
    static typeForProperty(name) { } //eslint-disable-line no-unused-vars

    /**
     * Creates a setter/getter pair for the named property with its own
     * local storage.  The getter returns the value in the local storage,
     * and the setter calls `_setProperty`, which updates the local storage
     * for the property and enqueues a `_propertiesChanged` callback.
     *
     * This method may be called on a prototype or an instance.  Calling
     * this method may overwrite a property value that already exists on
     * the prototype/instance by creating the accessor.
     *
     * @param {string} property Name of the property
     * @param {boolean=} readOnly When true, no setter is created; the
     *   protected `_setProperty` function must be used to set the property
     * @return {void}
     * @protected
     * @override
     */
    _createPropertyAccessor(property, readOnly) {
      this._addPropertyToAttributeMap(property);
      if (!this.hasOwnProperty(JSCompiler_renameProperty('__dataHasAccessor', this))) {
        this.__dataHasAccessor = Object.assign({}, this.__dataHasAccessor);
      }
      if (!this.__dataHasAccessor[property]) {
        this.__dataHasAccessor[property] = true;
        this._definePropertyAccessor(property, readOnly);
      }
    }

    /**
     * Adds the given `property` to a map matching attribute names
     * to property names, using `attributeNameForProperty`. This map is
     * used when deserializing attribute values to properties.
     *
     * @param {string} property Name of the property
     * @override
     */
    _addPropertyToAttributeMap(property) {
      if (!this.hasOwnProperty(JSCompiler_renameProperty('__dataAttributes', this))) {
        this.__dataAttributes = Object.assign({}, this.__dataAttributes);
      }
      // This check is technically not correct; it's an optimization that
      // assumes that if a _property_ name is already in the map (note this is
      // an attr->property map), the property mapped directly to the attribute
      // and it has already been mapped.  This would fail if
      // `attributeNameForProperty` were overridden such that this was not the
      // case.
      let attr = this.__dataAttributes[property];
      if (!attr) {
        attr = this.constructor.attributeNameForProperty(property);
        this.__dataAttributes[attr] = property;
      }
      return attr;
    }

    /**
     * Defines a property accessor for the given property.
     * @param {string} property Name of the property
     * @param {boolean=} readOnly When true, no setter is created
     * @return {void}
     * @override
     */
     _definePropertyAccessor(property, readOnly) {
      Object.defineProperty(this, property, {
        /* eslint-disable valid-jsdoc */
        /** @this {PropertiesChanged} */
        get() {
          // Inline for perf instead of using `_getProperty`
          return this.__data[property];
        },
        /** @this {PropertiesChanged} */
        set: readOnly ? function () {} : function (value) {
          // Inline for perf instead of using `_setProperty`
          if (this._setPendingProperty(property, value, true)) {
            this._invalidateProperties();
          }
        }
        /* eslint-enable */
      });
    }

    constructor() {
      super();
      /** @type {boolean} */
      this.__dataEnabled = false;
      this.__dataReady = false;
      this.__dataInvalid = false;
      this.__data = {};
      this.__dataPending = null;
      this.__dataOld = null;
      this.__dataInstanceProps = null;
      /** @type {number} */
      // NOTE: used to track re-entrant calls to `_flushProperties`
      this.__dataCounter = 0;
      this.__serializing = false;
      this._initializeProperties();
    }

    /**
     * Lifecycle callback called when properties are enabled via
     * `_enableProperties`.
     *
     * Users may override this function to implement behavior that is
     * dependent on the element having its property data initialized, e.g.
     * from defaults (initialized from `constructor`, `_initializeProperties`),
     * `attributeChangedCallback`, or values propagated from host e.g. via
     * bindings.  `super.ready()` must be called to ensure the data system
     * becomes enabled.
     *
     * @return {void}
     * @public
     * @override
     */
    ready() {
      this.__dataReady = true;
      this._flushProperties();
    }

    /**
     * Initializes the local storage for property accessors.
     *
     * Provided as an override point for performing any setup work prior
     * to initializing the property accessor system.
     *
     * @return {void}
     * @protected
     * @override
     */
    _initializeProperties() {
      // Capture instance properties; these will be set into accessors
      // during first flush. Don't set them here, since we want
      // these to overwrite defaults/constructor assignments
      for (let p in this.__dataHasAccessor) {
        if (this.hasOwnProperty(p)) {
          this.__dataInstanceProps = this.__dataInstanceProps || {};
          this.__dataInstanceProps[p] = this[p];
          delete this[p];
        }
      }
    }

    /**
     * Called at ready time with bag of instance properties that overwrote
     * accessors when the element upgraded.
     *
     * The default implementation sets these properties back into the
     * setter at ready time.  This method is provided as an override
     * point for customizing or providing more efficient initialization.
     *
     * @param {Object} props Bag of property values that were overwritten
     *   when creating property accessors.
     * @return {void}
     * @protected
     * @override
     */
    _initializeInstanceProperties(props) {
      Object.assign(this, props);
    }

    /**
     * Updates the local storage for a property (via `_setPendingProperty`)
     * and enqueues a `_proeprtiesChanged` callback.
     *
     * @param {string} property Name of the property
     * @param {*} value Value to set
     * @return {void}
     * @protected
     * @override
     */
    _setProperty(property, value) {
      if (this._setPendingProperty(property, value)) {
        this._invalidateProperties();
      }
    }

    /**
     * Returns the value for the given property.
     * @param {string} property Name of property
     * @return {*} Value for the given property
     * @protected
     * @override
     */
    _getProperty(property) {
      return this.__data[property];
    }

    /* eslint-disable no-unused-vars */
    /**
     * Updates the local storage for a property, records the previous value,
     * and adds it to the set of "pending changes" that will be passed to the
     * `_propertiesChanged` callback.  This method does not enqueue the
     * `_propertiesChanged` callback.
     *
     * @param {string} property Name of the property
     * @param {*} value Value to set
     * @param {boolean=} ext Not used here; affordance for closure
     * @return {boolean} Returns true if the property changed
     * @protected
     * @override
     */
    _setPendingProperty(property, value, ext) {
      let old = this.__data[property];
      let changed = this._shouldPropertyChange(property, value, old);
      if (changed) {
        if (!this.__dataPending) {
          this.__dataPending = {};
          this.__dataOld = {};
        }
        // Ensure old is captured from the last turn
        if (this.__dataOld && !(property in this.__dataOld)) {
          this.__dataOld[property] = old;
        }
        this.__data[property] = value;
        this.__dataPending[property] = value;
      }
      return changed;
    }
    /* eslint-enable */

    /**
     * @param {string} property Name of the property
     * @return {boolean} Returns true if the property is pending.
     */
    _isPropertyPending(property) {
      return !!(this.__dataPending && this.__dataPending.hasOwnProperty(property));
    }

    /**
     * Marks the properties as invalid, and enqueues an async
     * `_propertiesChanged` callback.
     *
     * @return {void}
     * @protected
     * @override
     */
    _invalidateProperties() {
      if (!this.__dataInvalid && this.__dataReady) {
        this.__dataInvalid = true;
        microtask.run(() => {
          if (this.__dataInvalid) {
            this.__dataInvalid = false;
            this._flushProperties();
          }
        });
      }
    }

    /**
     * Call to enable property accessor processing. Before this method is
     * called accessor values will be set but side effects are
     * queued. When called, any pending side effects occur immediately.
     * For elements, generally `connectedCallback` is a normal spot to do so.
     * It is safe to call this method multiple times as it only turns on
     * property accessors once.
     *
     * @return {void}
     * @protected
     * @override
     */
    _enableProperties() {
      if (!this.__dataEnabled) {
        this.__dataEnabled = true;
        if (this.__dataInstanceProps) {
          this._initializeInstanceProperties(this.__dataInstanceProps);
          this.__dataInstanceProps = null;
        }
        this.ready();
      }
    }

    /**
     * Calls the `_propertiesChanged` callback with the current set of
     * pending changes (and old values recorded when pending changes were
     * set), and resets the pending set of changes. Generally, this method
     * should not be called in user code.
     *
     * @return {void}
     * @protected
     * @override
     */
    _flushProperties() {
      this.__dataCounter++;
      const props = this.__data;
      const changedProps = this.__dataPending;
      const old = this.__dataOld;
      if (this._shouldPropertiesChange(props, changedProps, old)) {
        this.__dataPending = null;
        this.__dataOld = null;
        this._propertiesChanged(props, changedProps, old);
      }
      this.__dataCounter--;
    }

    /**
     * Called in `_flushProperties` to determine if `_propertiesChanged`
     * should be called. The default implementation returns true if
     * properties are pending. Override to customize when
     * `_propertiesChanged` is called.
     * @param {!Object} currentProps Bag of all current accessor values
     * @param {?Object} changedProps Bag of properties changed since the last
     *   call to `_propertiesChanged`
     * @param {?Object} oldProps Bag of previous values for each property
     *   in `changedProps`
     * @return {boolean} true if changedProps is truthy
     * @override
     */
    _shouldPropertiesChange(currentProps, changedProps, oldProps) { // eslint-disable-line no-unused-vars
      return Boolean(changedProps);
    }

    /**
     * Callback called when any properties with accessors created via
     * `_createPropertyAccessor` have been set.
     *
     * @param {!Object} currentProps Bag of all current accessor values
     * @param {?Object} changedProps Bag of properties changed since the last
     *   call to `_propertiesChanged`
     * @param {?Object} oldProps Bag of previous values for each property
     *   in `changedProps`
     * @return {void}
     * @protected
     * @override
     */
    _propertiesChanged(currentProps, changedProps, oldProps) { // eslint-disable-line no-unused-vars
    }

    /**
     * Method called to determine whether a property value should be
     * considered as a change and cause the `_propertiesChanged` callback
     * to be enqueued.
     *
     * The default implementation returns `true` if a strict equality
     * check fails. The method always returns false for `NaN`.
     *
     * Override this method to e.g. provide stricter checking for
     * Objects/Arrays when using immutable patterns.
     *
     * @param {string} property Property name
     * @param {*} value New property value
     * @param {*} old Previous property value
     * @return {boolean} Whether the property should be considered a change
     *   and enqueue a `_proeprtiesChanged` callback
     * @protected
     * @override
     */
    _shouldPropertyChange(property, value, old) {
      return (
        // Strict equality check
        (old !== value &&
          // This ensures (old==NaN, value==NaN) always returns false
          (old === old || value === value))
      );
    }

    /**
     * Implements native Custom Elements `attributeChangedCallback` to
     * set an attribute value to a property via `_attributeToProperty`.
     *
     * @param {string} name Name of attribute that changed
     * @param {?string} old Old attribute value
     * @param {?string} value New attribute value
     * @param {?string} namespace Attribute namespace.
     * @return {void}
     * @suppress {missingProperties} Super may or may not implement the callback
     * @override
     */
    attributeChangedCallback(name, old, value, namespace) {
      if (old !== value) {
        this._attributeToProperty(name, value);
      }
      if (super.attributeChangedCallback) {
        super.attributeChangedCallback(name, old, value, namespace);
      }
    }

    /**
     * Deserializes an attribute to its associated property.
     *
     * This method calls the `_deserializeValue` method to convert the string to
     * a typed value.
     *
     * @param {string} attribute Name of attribute to deserialize.
     * @param {?string} value of the attribute.
     * @param {*=} type type to deserialize to, defaults to the value
     * returned from `typeForProperty`
     * @return {void}
     * @override
     */
    _attributeToProperty(attribute, value, type) {
      if (!this.__serializing) {
        const map = this.__dataAttributes;
        const property = map && map[attribute] || attribute;
        this[property] = this._deserializeValue(value, type ||
          this.constructor.typeForProperty(property));
      }
    }

    /**
     * Serializes a property to its associated attribute.
     *
     * @suppress {invalidCasts} Closure can't figure out `this` is an element.
     *
     * @param {string} property Property name to reflect.
     * @param {string=} attribute Attribute name to reflect to.
     * @param {*=} value Property value to refect.
     * @return {void}
     * @override
     */
    _propertyToAttribute(property, attribute, value) {
      this.__serializing = true;
      value = (arguments.length < 3) ? this[property] : value;
      this._valueToNodeAttribute(/** @type {!HTMLElement} */(this), value,
        attribute || this.constructor.attributeNameForProperty(property));
      this.__serializing = false;
    }

    /**
     * Sets a typed value to an HTML attribute on a node.
     *
     * This method calls the `_serializeValue` method to convert the typed
     * value to a string.  If the `_serializeValue` method returns `undefined`,
     * the attribute will be removed (this is the default for boolean
     * type `false`).
     *
     * @param {Element} node Element to set attribute to.
     * @param {*} value Value to serialize.
     * @param {string} attribute Attribute name to serialize to.
     * @return {void}
     * @override
     */
    _valueToNodeAttribute(node, value, attribute) {
      const str = this._serializeValue(value);
      if (attribute === 'class' || attribute === 'name' || attribute === 'slot') {
        node = /** @type {?Element} */(wrap(node));
      }
      if (str === undefined) {
        node.removeAttribute(attribute);
      } else {
        node.setAttribute(attribute, str);
      }
    }

    /**
     * Converts a typed JavaScript value to a string.
     *
     * This method is called when setting JS property values to
     * HTML attributes.  Users may override this method to provide
     * serialization for custom types.
     *
     * @param {*} value Property value to serialize.
     * @return {string | undefined} String serialized from the provided
     * property  value.
     * @override
     */
    _serializeValue(value) {
      switch (typeof value) {
        case 'boolean':
          return value ? '' : undefined;
        default:
          return value != null ? value.toString() : undefined;
      }
    }

    /**
     * Converts a string to a typed JavaScript value.
     *
     * This method is called when reading HTML attribute values to
     * JS properties.  Users may override this method to provide
     * deserialization for custom `type`s. Types for `Boolean`, `String`,
     * and `Number` convert attributes to the expected types.
     *
     * @param {?string} value Value to deserialize.
     * @param {*=} type Type to deserialize the string to.
     * @return {*} Typed value deserialized from the provided string.
     * @override
     */
    _deserializeValue(value, type) {
      switch (type) {
        case Boolean:
          return (value !== null);
        case Number:
          return Number(value);
        default:
          return value;
      }
    }

  }

  return PropertiesChanged;
});

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

// Save map of native properties; this forms a blacklist or properties
// that won't have their values "saved" by `saveAccessorValue`, since
// reading from an HTMLElement accessor from the context of a prototype throws
const nativeProperties = {};
let proto = HTMLElement.prototype;
while (proto) {
  let props = Object.getOwnPropertyNames(proto);
  for (let i=0; i<props.length; i++) {
    nativeProperties[props[i]] = true;
  }
  proto = Object.getPrototypeOf(proto);
}

/**
 * Used to save the value of a property that will be overridden with
 * an accessor. If the `model` is a prototype, the values will be saved
 * in `__dataProto`, and it's up to the user (or downstream mixin) to
 * decide how/when to set these values back into the accessors.
 * If `model` is already an instance (it has a `__data` property), then
 * the value will be set as a pending property, meaning the user should
 * call `_invalidateProperties` or `_flushProperties` to take effect
 *
 * @param {Object} model Prototype or instance
 * @param {string} property Name of property
 * @return {void}
 * @private
 */
function saveAccessorValue(model, property) {
  // Don't read/store value for any native properties since they could throw
  if (!nativeProperties[property]) {
    let value = model[property];
    if (value !== undefined) {
      if (model.__data) {
        // Adding accessor to instance; update the property
        // It is the user's responsibility to call _flushProperties
        model._setPendingProperty(property, value);
      } else {
        // Adding accessor to proto; save proto's value for instance-time use
        if (!model.__dataProto) {
          model.__dataProto = {};
        } else if (!model.hasOwnProperty(JSCompiler_renameProperty('__dataProto', model))) {
          model.__dataProto = Object.create(model.__dataProto);
        }
        model.__dataProto[property] = value;
      }
    }
  }
}

/**
 * Element class mixin that provides basic meta-programming for creating one
 * or more property accessors (getter/setter pair) that enqueue an async
 * (batched) `_propertiesChanged` callback.
 *
 * For basic usage of this mixin:
 *
 * -   Declare attributes to observe via the standard `static get
 *     observedAttributes()`. Use `dash-case` attribute names to represent
 *     `camelCase` property names.
 * -   Implement the `_propertiesChanged` callback on the class.
 * -   Call `MyClass.createPropertiesForAttributes()` **once** on the class to
 *     generate property accessors for each observed attribute. This must be
 *     called before the first instance is created, for example, by calling it
 *     before calling `customElements.define`. It can also be called lazily from
 *     the element's `constructor`, as long as it's guarded so that the call is
 *     only made once, when the first instance is created.
 * -   Call `this._enableProperties()` in the element's `connectedCallback` to
 *     enable the accessors.
 *
 * Any `observedAttributes` will automatically be
 * deserialized via `attributeChangedCallback` and set to the associated
 * property using `dash-case`-to-`camelCase` convention.
 *
 * @mixinFunction
 * @polymer
 * @appliesMixin PropertiesChanged
 * @summary Element class mixin for reacting to property changes from
 *   generated property accessors.
 * @template T
 * @param {function(new:T)} superClass Class to apply mixin to.
 * @return {function(new:T)} superClass with mixin applied.
 */
const PropertyAccessors = dedupingMixin(superClass => {

  /**
   * @constructor
   * @implements {Polymer_PropertiesChanged}
   * @unrestricted
   * @private
   */
   const base = PropertiesChanged(superClass);

  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_PropertyAccessors}
   * @extends {base}
   * @unrestricted
   */
  class PropertyAccessors extends base {

    /**
     * Generates property accessors for all attributes in the standard
     * static `observedAttributes` array.
     *
     * Attribute names are mapped to property names using the `dash-case` to
     * `camelCase` convention
     *
     * @return {void}
     * @nocollapse
     */
    static createPropertiesForAttributes() {
      let a$ =  /** @type {?} */ (this).observedAttributes;
      for (let i=0; i < a$.length; i++) {
        this.prototype._createPropertyAccessor(dashToCamelCase(a$[i]));
      }
    }

    /**
     * Returns an attribute name that corresponds to the given property.
     * By default, converts camel to dash case, e.g. `fooBar` to `foo-bar`.
     * @param {string} property Property to convert
     * @return {string} Attribute name corresponding to the given property.
     *
     * @protected
     * @nocollapse
     */
    static attributeNameForProperty(property) {
      return camelToDashCase(property);
    }

    /**
     * Overrides PropertiesChanged implementation to initialize values for
     * accessors created for values that already existed on the element
     * prototype.
     *
     * @return {void}
     * @protected
     * @override
     */
    _initializeProperties() {
      if (this.__dataProto) {
        this._initializeProtoProperties(this.__dataProto);
        this.__dataProto = null;
      }
      super._initializeProperties();
    }

    /**
     * Called at instance time with bag of properties that were overwritten
     * by accessors on the prototype when accessors were created.
     *
     * The default implementation sets these properties back into the
     * setter at instance time.  This method is provided as an override
     * point for customizing or providing more efficient initialization.
     *
     * @param {Object} props Bag of property values that were overwritten
     *   when creating property accessors.
     * @return {void}
     * @protected
     * @override
     */
    _initializeProtoProperties(props) {
      for (let p in props) {
        this._setProperty(p, props[p]);
      }
    }

    /**
     * Ensures the element has the given attribute. If it does not,
     * assigns the given value to the attribute.
     *
     * @suppress {invalidCasts} Closure can't figure out `this` is infact an
     *     element
     *
     * @param {string} attribute Name of attribute to ensure is set.
     * @param {string} value of the attribute.
     * @return {void}
     * @override
     */
    _ensureAttribute(attribute, value) {
      const el = /** @type {!HTMLElement} */(this);
      if (!el.hasAttribute(attribute)) {
        this._valueToNodeAttribute(el, value, attribute);
      }
    }

    /**
     * Overrides PropertiesChanged implemention to serialize objects as JSON.
     *
     * @param {*} value Property value to serialize.
     * @return {string | undefined} String serialized from the provided property
     *     value.
     * @override
     */
    _serializeValue(value) {
      /* eslint-disable no-fallthrough */
      switch (typeof value) {
        case 'object':
          if (value instanceof Date) {
            return value.toString();
          } else if (value) {
            try {
              return JSON.stringify(value);
            } catch(x) {
              return '';
            }
          }

        default:
          return super._serializeValue(value);
      }
    }

    /**
     * Converts a string to a typed JavaScript value.
     *
     * This method is called by Polymer when reading HTML attribute values to
     * JS properties.  Users may override this method on Polymer element
     * prototypes to provide deserialization for custom `type`s.  Note,
     * the `type` argument is the value of the `type` field provided in the
     * `properties` configuration object for a given property, and is
     * by convention the constructor for the type to deserialize.
     *
     *
     * @param {?string} value Attribute value to deserialize.
     * @param {*=} type Type to deserialize the string to.
     * @return {*} Typed value deserialized from the provided string.
     * @override
     */
    _deserializeValue(value, type) {
      /**
       * @type {*}
       */
      let outValue;
      switch (type) {
        case Object:
          try {
            outValue = JSON.parse(/** @type {string} */(value));
          } catch(x) {
            // allow non-JSON literals like Strings and Numbers
            outValue = value;
          }
          break;
        case Array:
          try {
            outValue = JSON.parse(/** @type {string} */(value));
          } catch(x) {
            outValue = null;
            console.warn(`Polymer::Attributes: couldn't decode Array as JSON: ${value}`);
          }
          break;
        case Date:
          outValue = isNaN(value) ? String(value) : Number(value);
          outValue = new Date(outValue);
          break;
        default:
          outValue = super._deserializeValue(value, type);
          break;
      }
      return outValue;
    }
    /* eslint-enable no-fallthrough */

    /**
     * Overrides PropertiesChanged implementation to save existing prototype
     * property value so that it can be reset.
     * @param {string} property Name of the property
     * @param {boolean=} readOnly When true, no setter is created
     *
     * When calling on a prototype, any overwritten values are saved in
     * `__dataProto`, and it is up to the subclasser to decide how/when
     * to set those properties back into the accessor.  When calling on an
     * instance, the overwritten value is set via `_setPendingProperty`,
     * and the user should call `_invalidateProperties` or `_flushProperties`
     * for the values to take effect.
     * @protected
     * @return {void}
     * @override
     */
    _definePropertyAccessor(property, readOnly) {
      saveAccessorValue(this, property);
      super._definePropertyAccessor(property, readOnly);
    }

    /**
     * Returns true if this library created an accessor for the given property.
     *
     * @param {string} property Property name
     * @return {boolean} True if an accessor was created
     * @override
     */
    _hasAccessor(property) {
      return this.__dataHasAccessor && this.__dataHasAccessor[property];
    }

    /**
     * Returns true if the specified property has a pending change.
     *
     * @param {string} prop Property name
     * @return {boolean} True if property has a pending change
     * @protected
     * @override
     */
    _isPropertyPending(prop) {
      return Boolean(this.__dataPending && (prop in this.__dataPending));
    }

  }

  return PropertyAccessors;

});

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

// 1.x backwards-compatible auto-wrapper for template type extensions
// This is a clear layering violation and gives favored-nation status to
// dom-if and dom-repeat templates.  This is a conceit we're choosing to keep
// a.) to ease 1.x backwards-compatibility due to loss of `is`, and
// b.) to maintain if/repeat capability in parser-constrained elements
//     (e.g. table, select) in lieu of native CE type extensions without
//     massive new invention in this space (e.g. directive system)
const templateExtensions = {
  'dom-if': true,
  'dom-repeat': true
};

let placeholderBugDetect = false;
let placeholderBug = false;

function hasPlaceholderBug() {
  if (!placeholderBugDetect) {
    placeholderBugDetect = true;
    const t = document.createElement('textarea');
    t.placeholder = 'a';
    placeholderBug = t.placeholder === t.textContent;
  }
  return placeholderBug;
}

/**
 * Some browsers have a bug with textarea, where placeholder text is copied as
 * a textnode child of the textarea.
 *
 * If the placeholder is a binding, this can break template stamping in two
 * ways.
 *
 * One issue is that when the `placeholder` attribute is removed when the
 * binding is processed, the textnode child of the textarea is deleted, and the
 * template info tries to bind into that node.
 *
 * With `legacyOptimizations` in use, when the template is stamped and the
 * `textarea.textContent` binding is processed, no corresponding node is found
 * because it was removed during parsing. An exception is generated when this
 * binding is updated.
 *
 * With `legacyOptimizations` not in use, the template is cloned before
 * processing and this changes the above behavior. The cloned template also has
 * a value property set to the placeholder and textContent. This prevents the
 * removal of the textContent when the placeholder attribute is removed.
 * Therefore the exception does not occur. However, there is an extra
 * unnecessary binding.
 *
 * @param {!Node} node Check node for placeholder bug
 * @return {void}
 */
function fixPlaceholder(node) {
  if (hasPlaceholderBug() && node.localName === 'textarea' && node.placeholder
        && node.placeholder === node.textContent) {
    node.textContent = null;
  }
}

function wrapTemplateExtension(node) {
  let is = node.getAttribute('is');
  if (is && templateExtensions[is]) {
    let t = node;
    t.removeAttribute('is');
    node = t.ownerDocument.createElement(is);
    t.parentNode.replaceChild(node, t);
    node.appendChild(t);
    while(t.attributes.length) {
      node.setAttribute(t.attributes[0].name, t.attributes[0].value);
      t.removeAttribute(t.attributes[0].name);
    }
  }
  return node;
}

function findTemplateNode(root, nodeInfo) {
  // recursively ascend tree until we hit root
  let parent = nodeInfo.parentInfo && findTemplateNode(root, nodeInfo.parentInfo);
  // unwind the stack, returning the indexed node at each level
  if (parent) {
    // note: marginally faster than indexing via childNodes
    // (http://jsperf.com/childnodes-lookup)
    for (let n=parent.firstChild, i=0; n; n=n.nextSibling) {
      if (nodeInfo.parentIndex === i++) {
        return n;
      }
    }
  } else {
    return root;
  }
}

// construct `$` map (from id annotations)
function applyIdToMap(inst, map, node, nodeInfo) {
  if (nodeInfo.id) {
    map[nodeInfo.id] = node;
  }
}

// install event listeners (from event annotations)
function applyEventListener(inst, node, nodeInfo) {
  if (nodeInfo.events && nodeInfo.events.length) {
    for (let j=0, e$=nodeInfo.events, e; (j<e$.length) && (e=e$[j]); j++) {
      inst._addMethodEventListenerToNode(node, e.name, e.value, inst);
    }
  }
}

// push configuration references at configure time
function applyTemplateInfo(inst, node, nodeInfo, parentTemplateInfo) {
  if (nodeInfo.templateInfo) {
    // Give the node an instance of this templateInfo and set its parent
    node._templateInfo = nodeInfo.templateInfo;
    node._parentTemplateInfo = parentTemplateInfo;
  }
}

function createNodeEventHandler(context, eventName, methodName) {
  // Instances can optionally have a _methodHost which allows redirecting where
  // to find methods. Currently used by `templatize`.
  context = context._methodHost || context;
  let handler = function(e) {
    if (context[methodName]) {
      context[methodName](e, e.detail);
    } else {
      console.warn('listener method `' + methodName + '` not defined');
    }
  };
  return handler;
}

/**
 * Element mixin that provides basic template parsing and stamping, including
 * the following template-related features for stamped templates:
 *
 * - Declarative event listeners (`on-eventname="listener"`)
 * - Map of node id's to stamped node instances (`this.$.id`)
 * - Nested template content caching/removal and re-installation (performance
 *   optimization)
 *
 * @mixinFunction
 * @polymer
 * @summary Element class mixin that provides basic template parsing and stamping
 */
const TemplateStamp = dedupingMixin(
    /**
     * @template T
     * @param {function(new:T)} superClass Class to apply mixin to.
     * @return {function(new:T)} superClass with mixin applied.
     */
    (superClass) => {

  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_TemplateStamp}
   */
  class TemplateStamp extends superClass {

    /**
     * Scans a template to produce template metadata.
     *
     * Template-specific metadata are stored in the object returned, and node-
     * specific metadata are stored in objects in its flattened `nodeInfoList`
     * array.  Only nodes in the template that were parsed as nodes of
     * interest contain an object in `nodeInfoList`.  Each `nodeInfo` object
     * contains an `index` (`childNodes` index in parent) and optionally
     * `parent`, which points to node info of its parent (including its index).
     *
     * The template metadata object returned from this method has the following
     * structure (many fields optional):
     *
     * ```js
     *   {
     *     // Flattened list of node metadata (for nodes that generated metadata)
     *     nodeInfoList: [
     *       {
     *         // `id` attribute for any nodes with id's for generating `$` map
     *         id: {string},
     *         // `on-event="handler"` metadata
     *         events: [
     *           {
     *             name: {string},   // event name
     *             value: {string},  // handler method name
     *           }, ...
     *         ],
     *         // Notes when the template contained a `<slot>` for shady DOM
     *         // optimization purposes
     *         hasInsertionPoint: {boolean},
     *         // For nested `<template>`` nodes, nested template metadata
     *         templateInfo: {object}, // nested template metadata
     *         // Metadata to allow efficient retrieval of instanced node
     *         // corresponding to this metadata
     *         parentInfo: {number},   // reference to parent nodeInfo>
     *         parentIndex: {number},  // index in parent's `childNodes` collection
     *         infoIndex: {number},    // index of this `nodeInfo` in `templateInfo.nodeInfoList`
     *       },
     *       ...
     *     ],
     *     // When true, the template had the `strip-whitespace` attribute
     *     // or was nested in a template with that setting
     *     stripWhitespace: {boolean},
     *     // For nested templates, nested template content is moved into
     *     // a document fragment stored here; this is an optimization to
     *     // avoid the cost of nested template cloning
     *     content: {DocumentFragment}
     *   }
     * ```
     *
     * This method kicks off a recursive treewalk as follows:
     *
     * ```
     *    _parseTemplate <---------------------+
     *      _parseTemplateContent              |
     *        _parseTemplateNode  <------------|--+
     *          _parseTemplateNestedTemplate --+  |
     *          _parseTemplateChildNodes ---------+
     *          _parseTemplateNodeAttributes
     *            _parseTemplateNodeAttribute
     *
     * ```
     *
     * These methods may be overridden to add custom metadata about templates
     * to either `templateInfo` or `nodeInfo`.
     *
     * Note that this method may be destructive to the template, in that
     * e.g. event annotations may be removed after being noted in the
     * template metadata.
     *
     * @param {!HTMLTemplateElement} template Template to parse
     * @param {TemplateInfo=} outerTemplateInfo Template metadata from the outer
     *   template, for parsing nested templates
     * @return {!TemplateInfo} Parsed template metadata
     * @nocollapse
     */
    static _parseTemplate(template, outerTemplateInfo) {
      // since a template may be re-used, memo-ize metadata
      if (!template._templateInfo) {
        // TODO(rictic): fix typing
        let /** ? */ templateInfo = template._templateInfo = {};
        templateInfo.nodeInfoList = [];
        templateInfo.nestedTemplate = Boolean(outerTemplateInfo);
        templateInfo.stripWhiteSpace =
          (outerTemplateInfo && outerTemplateInfo.stripWhiteSpace) ||
          template.hasAttribute('strip-whitespace');
         // TODO(rictic): fix typing
         this._parseTemplateContent(
             template, templateInfo, /** @type {?} */ ({parent: null}));
      }
      return template._templateInfo;
    }

    /**
     * See docs for _parseTemplateNode.
     *
     * @param {!HTMLTemplateElement} template .
     * @param {!TemplateInfo} templateInfo .
     * @param {!NodeInfo} nodeInfo .
     * @return {boolean} .
     * @nocollapse
     */
    static _parseTemplateContent(template, templateInfo, nodeInfo) {
      return this._parseTemplateNode(template.content, templateInfo, nodeInfo);
    }

    /**
     * Parses template node and adds template and node metadata based on
     * the current node, and its `childNodes` and `attributes`.
     *
     * This method may be overridden to add custom node or template specific
     * metadata based on this node.
     *
     * @param {Node} node Node to parse
     * @param {!TemplateInfo} templateInfo Template metadata for current template
     * @param {!NodeInfo} nodeInfo Node metadata for current template.
     * @return {boolean} `true` if the visited node added node-specific
     *   metadata to `nodeInfo`
     * @nocollapse
     */
    static _parseTemplateNode(node, templateInfo, nodeInfo) {
      let noted = false;
      let element = /** @type {!HTMLTemplateElement} */ (node);
      if (element.localName == 'template' && !element.hasAttribute('preserve-content')) {
        noted = this._parseTemplateNestedTemplate(element, templateInfo, nodeInfo) || noted;
      } else if (element.localName === 'slot') {
        // For ShadyDom optimization, indicating there is an insertion point
        templateInfo.hasInsertionPoint = true;
      }
      fixPlaceholder(element);
      if (element.firstChild) {
        this._parseTemplateChildNodes(element, templateInfo, nodeInfo);
      }
      if (element.hasAttributes && element.hasAttributes()) {
        noted = this._parseTemplateNodeAttributes(element, templateInfo, nodeInfo) || noted;
      }
      // Checking `nodeInfo.noted` allows a child node of this node (who gets
      // access to `parentInfo`) to cause the parent to be noted, which
      // otherwise has no return path via `_parseTemplateChildNodes` (used by
      // some optimizations)
      return noted || nodeInfo.noted;
    }

    /**
     * Parses template child nodes for the given root node.
     *
     * This method also wraps whitelisted legacy template extensions
     * (`is="dom-if"` and `is="dom-repeat"`) with their equivalent element
     * wrappers, collapses text nodes, and strips whitespace from the template
     * if the `templateInfo.stripWhitespace` setting was provided.
     *
     * @param {Node} root Root node whose `childNodes` will be parsed
     * @param {!TemplateInfo} templateInfo Template metadata for current template
     * @param {!NodeInfo} nodeInfo Node metadata for current template.
     * @return {void}
     */
    static _parseTemplateChildNodes(root, templateInfo, nodeInfo) {
      if (root.localName === 'script' || root.localName === 'style') {
        return;
      }
      for (let node=root.firstChild, parentIndex=0, next; node; node=next) {
        // Wrap templates
        if (node.localName == 'template') {
          node = wrapTemplateExtension(node);
        }
        // collapse adjacent textNodes: fixes an IE issue that can cause
        // text nodes to be inexplicably split =(
        // note that root.normalize() should work but does not so we do this
        // manually.
        next = node.nextSibling;
        if (node.nodeType === Node.TEXT_NODE) {
          let /** Node */ n = next;
          while (n && (n.nodeType === Node.TEXT_NODE)) {
            node.textContent += n.textContent;
            next = n.nextSibling;
            root.removeChild(n);
            n = next;
          }
          // optionally strip whitespace
          if (templateInfo.stripWhiteSpace && !node.textContent.trim()) {
            root.removeChild(node);
            continue;
          }
        }
        let childInfo =
            /** @type {!NodeInfo} */ ({parentIndex, parentInfo: nodeInfo});
        if (this._parseTemplateNode(node, templateInfo, childInfo)) {
          childInfo.infoIndex = templateInfo.nodeInfoList.push(childInfo) - 1;
        }
        // Increment if not removed
        if (node.parentNode) {
          parentIndex++;
        }
      }
    }

    /**
     * Parses template content for the given nested `<template>`.
     *
     * Nested template info is stored as `templateInfo` in the current node's
     * `nodeInfo`. `template.content` is removed and stored in `templateInfo`.
     * It will then be the responsibility of the host to set it back to the
     * template and for users stamping nested templates to use the
     * `_contentForTemplate` method to retrieve the content for this template
     * (an optimization to avoid the cost of cloning nested template content).
     *
     * @param {HTMLTemplateElement} node Node to parse (a <template>)
     * @param {TemplateInfo} outerTemplateInfo Template metadata for current template
     *   that includes the template `node`
     * @param {!NodeInfo} nodeInfo Node metadata for current template.
     * @return {boolean} `true` if the visited node added node-specific
     *   metadata to `nodeInfo`
     * @nocollapse
     */
    static _parseTemplateNestedTemplate(node, outerTemplateInfo, nodeInfo) {
      // TODO(rictic): the type of node should be non-null
      let element = /** @type {!HTMLTemplateElement} */ (node);
      let templateInfo = this._parseTemplate(element, outerTemplateInfo);
      let content = templateInfo.content =
          element.content.ownerDocument.createDocumentFragment();
      content.appendChild(element.content);
      nodeInfo.templateInfo = templateInfo;
      return true;
    }

    /**
     * Parses template node attributes and adds node metadata to `nodeInfo`
     * for nodes of interest.
     *
     * @param {Element} node Node to parse
     * @param {!TemplateInfo} templateInfo Template metadata for current
     *     template
     * @param {!NodeInfo} nodeInfo Node metadata for current template.
     * @return {boolean} `true` if the visited node added node-specific
     *   metadata to `nodeInfo`
     * @nocollapse
     */
    static _parseTemplateNodeAttributes(node, templateInfo, nodeInfo) {
      // Make copy of original attribute list, since the order may change
      // as attributes are added and removed
      let noted = false;
      let attrs = Array.from(node.attributes);
      for (let i=attrs.length-1, a; (a=attrs[i]); i--) {
        noted = this._parseTemplateNodeAttribute(node, templateInfo, nodeInfo, a.name, a.value) || noted;
      }
      return noted;
    }

    /**
     * Parses a single template node attribute and adds node metadata to
     * `nodeInfo` for attributes of interest.
     *
     * This implementation adds metadata for `on-event="handler"` attributes
     * and `id` attributes.
     *
     * @param {Element} node Node to parse
     * @param {!TemplateInfo} templateInfo Template metadata for current template
     * @param {!NodeInfo} nodeInfo Node metadata for current template.
     * @param {string} name Attribute name
     * @param {string} value Attribute value
     * @return {boolean} `true` if the visited node added node-specific
     *   metadata to `nodeInfo`
     * @nocollapse
     */
    static _parseTemplateNodeAttribute(node, templateInfo, nodeInfo, name, value) {
      // events (on-*)
      if (name.slice(0, 3) === 'on-') {
        node.removeAttribute(name);
        nodeInfo.events = nodeInfo.events || [];
        nodeInfo.events.push({
          name: name.slice(3),
          value
        });
        return true;
      }
      // static id
      else if (name === 'id') {
        nodeInfo.id = value;
        return true;
      }
      return false;
    }

    /**
     * Returns the `content` document fragment for a given template.
     *
     * For nested templates, Polymer performs an optimization to cache nested
     * template content to avoid the cost of cloning deeply nested templates.
     * This method retrieves the cached content for a given template.
     *
     * @param {HTMLTemplateElement} template Template to retrieve `content` for
     * @return {DocumentFragment} Content fragment
     * @nocollapse
     */
    static _contentForTemplate(template) {
      let templateInfo = /** @type {HTMLTemplateElementWithInfo} */ (template)._templateInfo;
      return (templateInfo && templateInfo.content) || template.content;
    }

    /**
     * Clones the provided template content and returns a document fragment
     * containing the cloned dom.
     *
     * The template is parsed (once and memoized) using this library's
     * template parsing features, and provides the following value-added
     * features:
     * * Adds declarative event listeners for `on-event="handler"` attributes
     * * Generates an "id map" for all nodes with id's under `$` on returned
     *   document fragment
     * * Passes template info including `content` back to templates as
     *   `_templateInfo` (a performance optimization to avoid deep template
     *   cloning)
     *
     * Note that the memoized template parsing process is destructive to the
     * template: attributes for bindings and declarative event listeners are
     * removed after being noted in notes, and any nested `<template>.content`
     * is removed and stored in notes as well.
     *
     * @param {!HTMLTemplateElement} template Template to stamp
     * @param {TemplateInfo=} templateInfo Optional template info associated
     *   with the template to be stamped; if omitted the template will be
     *   automatically parsed.
     * @return {!StampedTemplate} Cloned template content
     * @override
     */
    _stampTemplate(template, templateInfo) {
      // Polyfill support: bootstrap the template if it has not already been
      if (template && !template.content &&
          window.HTMLTemplateElement && HTMLTemplateElement.decorate) {
        HTMLTemplateElement.decorate(template);
      }
      // Accepting the `templateInfo` via an argument allows for creating
      // instances of the `templateInfo` by the caller, useful for adding
      // instance-time information to the prototypical data
      templateInfo = templateInfo || this.constructor._parseTemplate(template);
      let nodeInfo = templateInfo.nodeInfoList;
      let content = templateInfo.content || template.content;
      let dom = /** @type {DocumentFragment} */ (document.importNode(content, true));
      // NOTE: ShadyDom optimization indicating there is an insertion point
      dom.__noInsertionPoint = !templateInfo.hasInsertionPoint;
      let nodes = dom.nodeList = new Array(nodeInfo.length);
      dom.$ = {};
      for (let i=0, l=nodeInfo.length, info; (i<l) && (info=nodeInfo[i]); i++) {
        let node = nodes[i] = findTemplateNode(dom, info);
        applyIdToMap(this, dom.$, node, info);
        applyTemplateInfo(this, node, info, templateInfo);
        applyEventListener(this, node, info);
      }
      dom = /** @type {!StampedTemplate} */(dom); // eslint-disable-line no-self-assign
      return dom;
    }

    /**
     * Adds an event listener by method name for the event provided.
     *
     * This method generates a handler function that looks up the method
     * name at handling time.
     *
     * @param {!EventTarget} node Node to add listener on
     * @param {string} eventName Name of event
     * @param {string} methodName Name of method
     * @param {*=} context Context the method will be called on (defaults
     *   to `node`)
     * @return {Function} Generated handler function
     * @override
     */
    _addMethodEventListenerToNode(node, eventName, methodName, context) {
      context = context || node;
      let handler = createNodeEventHandler(context, eventName, methodName);
      this._addEventListenerToNode(node, eventName, handler);
      return handler;
    }

    /**
     * Override point for adding custom or simulated event handling.
     *
     * @param {!EventTarget} node Node to add event listener to
     * @param {string} eventName Name of event
     * @param {function(!Event):void} handler Listener function to add
     * @return {void}
     * @override
     */
    _addEventListenerToNode(node, eventName, handler) {
      node.addEventListener(eventName, handler);
    }

    /**
     * Override point for adding custom or simulated event handling.
     *
     * @param {!EventTarget} node Node to remove event listener from
     * @param {string} eventName Name of event
     * @param {function(!Event):void} handler Listener function to remove
     * @return {void}
     * @override
     */
    _removeEventListenerFromNode(node, eventName, handler) {
      node.removeEventListener(eventName, handler);
    }

  }

  return TemplateStamp;

});

/**
 * @fileoverview
 * @suppress {checkPrototypalTypes}
 * @license Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

// Monotonically increasing unique ID used for de-duping effects triggered
// from multiple properties in the same turn
let dedupeId$1 = 0;

const NOOP = [];

/**
 * Property effect types; effects are stored on the prototype using these keys
 * @enum {string}
 */
const TYPES = {
  COMPUTE: '__computeEffects',
  REFLECT: '__reflectEffects',
  NOTIFY: '__notifyEffects',
  PROPAGATE: '__propagateEffects',
  OBSERVE: '__observeEffects',
  READ_ONLY: '__readOnly'
};

const COMPUTE_INFO = '__computeInfo';

/** @const {!RegExp} */
const capitalAttributeRegex = /[A-Z]/;

/**
 * Ensures that the model has an own-property map of effects for the given type.
 * The model may be a prototype or an instance.
 *
 * Property effects are stored as arrays of effects by property in a map,
 * by named type on the model. e.g.
 *
 *   __computeEffects: {
 *     foo: [ ... ],
 *     bar: [ ... ]
 *   }
 *
 * If the model does not yet have an effect map for the type, one is created
 * and returned.  If it does, but it is not an own property (i.e. the
 * prototype had effects), the the map is deeply cloned and the copy is
 * set on the model and returned, ready for new effects to be added.
 *
 * @param {Object} model Prototype or instance
 * @param {string} type Property effect type
 * @param {boolean=} cloneArrays Clone any arrays assigned to the map when
 *   extending a superclass map onto this subclass
 * @return {Object} The own-property map of effects for the given type
 * @private
 */
function ensureOwnEffectMap(model, type, cloneArrays) {
  let effects = model[type];
  if (!effects) {
    effects = model[type] = {};
  } else if (!model.hasOwnProperty(type)) {
    effects = model[type] = Object.create(model[type]);
    if (cloneArrays) {
      for (let p in effects) {
        let protoFx = effects[p];
        // Perf optimization over Array.slice
        let instFx = effects[p] = Array(protoFx.length);
        for (let i=0; i<protoFx.length; i++) {
          instFx[i] = protoFx[i];
        }
      }
    }
  }
  return effects;
}

// -- effects ----------------------------------------------

/**
 * Runs all effects of a given type for the given set of property changes
 * on an instance.
 *
 * @param {!Polymer_PropertyEffects} inst The instance with effects to run
 * @param {?Object} effects Object map of property-to-Array of effects
 * @param {?Object} props Bag of current property changes
 * @param {?Object=} oldProps Bag of previous values for changed properties
 * @param {boolean=} hasPaths True with `props` contains one or more paths
 * @param {*=} extraArgs Additional metadata to pass to effect function
 * @return {boolean} True if an effect ran for this property
 * @private
 */
function runEffects(inst, effects, props, oldProps, hasPaths, extraArgs) {
  if (effects) {
    let ran = false;
    const id = dedupeId$1++;
    for (let prop in props) {
      // Inline `runEffectsForProperty` for perf.
      let rootProperty = hasPaths ? root(prop) : prop;
      let fxs = effects[rootProperty];
      if (fxs) {
        for (let i=0, l=fxs.length, fx; (i<l) && (fx=fxs[i]); i++) {
          if ((!fx.info || fx.info.lastRun !== id) &&
              (!hasPaths || pathMatchesTrigger(prop, fx.trigger))) {
            if (fx.info) {
              fx.info.lastRun = id;
            }
            fx.fn(inst, prop, props, oldProps, fx.info, hasPaths, extraArgs);
            ran = true;
          }
        }
      }
    }
    return ran;
  }
  return false;
}

/**
 * Runs a list of effects for a given property.
 *
 * @param {!Polymer_PropertyEffects} inst The instance with effects to run
 * @param {!Object} effects Object map of property-to-Array of effects
 * @param {number} dedupeId Counter used for de-duping effects
 * @param {string} prop Name of changed property
 * @param {*} props Changed properties
 * @param {*} oldProps Old properties
 * @param {boolean=} hasPaths True with `props` contains one or more paths
 * @param {*=} extraArgs Additional metadata to pass to effect function
 * @return {boolean} True if an effect ran for this property
 * @private
 */
function runEffectsForProperty(inst, effects, dedupeId, prop, props, oldProps, hasPaths, extraArgs) {
  let ran = false;
  let rootProperty = hasPaths ? root(prop) : prop;
  let fxs = effects[rootProperty];
  if (fxs) {
    for (let i=0, l=fxs.length, fx; (i<l) && (fx=fxs[i]); i++) {
      if ((!fx.info || fx.info.lastRun !== dedupeId) &&
          (!hasPaths || pathMatchesTrigger(prop, fx.trigger))) {
        if (fx.info) {
          fx.info.lastRun = dedupeId;
        }
        fx.fn(inst, prop, props, oldProps, fx.info, hasPaths, extraArgs);
        ran = true;
      }
    }
  }
  return ran;
}

/**
 * Determines whether a property/path that has changed matches the trigger
 * criteria for an effect.  A trigger is a descriptor with the following
 * structure, which matches the descriptors returned from `parseArg`.
 * e.g. for `foo.bar.*`:
 * ```
 * trigger: {
 *   name: 'a.b',
 *   structured: true,
 *   wildcard: true
 * }
 * ```
 * If no trigger is given, the path is deemed to match.
 *
 * @param {string} path Path or property that changed
 * @param {?DataTrigger} trigger Descriptor
 * @return {boolean} Whether the path matched the trigger
 */
function pathMatchesTrigger(path, trigger) {
  if (trigger) {
    let triggerPath = /** @type {string} */ (trigger.name);
    return (triggerPath == path) ||
        !!(trigger.structured && isAncestor(triggerPath, path)) ||
        !!(trigger.wildcard && isDescendant(triggerPath, path));
  } else {
    return true;
  }
}

/**
 * Implements the "observer" effect.
 *
 * Calls the method with `info.methodName` on the instance, passing the
 * new and old values.
 *
 * @param {!Polymer_PropertyEffects} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {Object} props Bag of current property changes
 * @param {Object} oldProps Bag of previous values for changed properties
 * @param {?} info Effect metadata
 * @return {void}
 * @private
 */
function runObserverEffect(inst, property, props, oldProps, info) {
  let fn = typeof info.method === "string" ? inst[info.method] : info.method;
  let changedProp = info.property;
  if (fn) {
    fn.call(inst, inst.__data[changedProp], oldProps[changedProp]);
  } else if (!info.dynamicFn) {
    console.warn('observer method `' + info.method + '` not defined');
  }
}

/**
 * Runs "notify" effects for a set of changed properties.
 *
 * This method differs from the generic `runEffects` method in that it
 * will dispatch path notification events in the case that the property
 * changed was a path and the root property for that path didn't have a
 * "notify" effect.  This is to maintain 1.0 behavior that did not require
 * `notify: true` to ensure object sub-property notifications were
 * sent.
 *
 * @param {!Polymer_PropertyEffects} inst The instance with effects to run
 * @param {Object} notifyProps Bag of properties to notify
 * @param {Object} props Bag of current property changes
 * @param {Object} oldProps Bag of previous values for changed properties
 * @param {boolean} hasPaths True with `props` contains one or more paths
 * @return {void}
 * @private
 */
function runNotifyEffects(inst, notifyProps, props, oldProps, hasPaths) {
  // Notify
  let fxs = inst[TYPES.NOTIFY];
  let notified;
  let id = dedupeId$1++;
  // Try normal notify effects; if none, fall back to try path notification
  for (let prop in notifyProps) {
    if (notifyProps[prop]) {
      if (fxs && runEffectsForProperty(inst, fxs, id, prop, props, oldProps, hasPaths)) {
        notified = true;
      } else if (hasPaths && notifyPath(inst, prop, props)) {
        notified = true;
      }
    }
  }
  // Flush host if we actually notified and host was batching
  // And the host has already initialized clients; this prevents
  // an issue with a host observing data changes before clients are ready.
  let host;
  if (notified && (host = inst.__dataHost) && host._invalidateProperties) {
    host._invalidateProperties();
  }
}

/**
 * Dispatches {property}-changed events with path information in the detail
 * object to indicate a sub-path of the property was changed.
 *
 * @param {!Polymer_PropertyEffects} inst The element from which to fire the
 *     event
 * @param {string} path The path that was changed
 * @param {Object} props Bag of current property changes
 * @return {boolean} Returns true if the path was notified
 * @private
 */
function notifyPath(inst, path, props) {
  let rootProperty = root(path);
  if (rootProperty !== path) {
    let eventName = camelToDashCase(rootProperty) + '-changed';
    dispatchNotifyEvent(inst, eventName, props[path], path);
    return true;
  }
  return false;
}

/**
 * Dispatches {property}-changed events to indicate a property (or path)
 * changed.
 *
 * @param {!Polymer_PropertyEffects} inst The element from which to fire the
 *     event
 * @param {string} eventName The name of the event to send
 *     ('{property}-changed')
 * @param {*} value The value of the changed property
 * @param {string | null | undefined} path If a sub-path of this property
 *     changed, the path that changed (optional).
 * @return {void}
 * @private
 * @suppress {invalidCasts}
 */
function dispatchNotifyEvent(inst, eventName, value, path) {
  let detail = {
    value: value,
    queueProperty: true
  };
  if (path) {
    detail.path = path;
  }
  // As a performance optimization, we could elide the wrap here since notifying
  // events are non-bubbling and shouldn't need retargeting. However, a very
  // small number of internal tests failed in obscure ways, which may indicate
  // user code relied on timing differences resulting from ShadyDOM flushing
  // as a result of the wrapped `dispatchEvent`.
  wrap(/** @type {!HTMLElement} */(inst)).dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Implements the "notify" effect.
 *
 * Dispatches a non-bubbling event named `info.eventName` on the instance
 * with a detail object containing the new `value`.
 *
 * @param {!Polymer_PropertyEffects} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {Object} props Bag of current property changes
 * @param {Object} oldProps Bag of previous values for changed properties
 * @param {?} info Effect metadata
 * @param {boolean} hasPaths True with `props` contains one or more paths
 * @return {void}
 * @private
 */
function runNotifyEffect(inst, property, props, oldProps, info, hasPaths) {
  let rootProperty = hasPaths ? root(property) : property;
  let path = rootProperty != property ? property : null;
  let value = path ? get(inst, path) : inst.__data[property];
  if (path && value === undefined) {
    value = props[property];  // specifically for .splices
  }
  dispatchNotifyEvent(inst, info.eventName, value, path);
}

/**
 * Handler function for 2-way notification events. Receives context
 * information captured in the `addNotifyListener` closure from the
 * `__notifyListeners` metadata.
 *
 * Sets the value of the notified property to the host property or path.  If
 * the event contained path information, translate that path to the host
 * scope's name for that path first.
 *
 * @param {CustomEvent} event Notification event (e.g. '<property>-changed')
 * @param {!Polymer_PropertyEffects} inst Host element instance handling the
 *     notification event
 * @param {string} fromProp Child element property that was bound
 * @param {string} toPath Host property/path that was bound
 * @param {boolean} negate Whether the binding was negated
 * @return {void}
 * @private
 */
function handleNotification(event, inst, fromProp, toPath, negate) {
  let value;
  let detail = /** @type {Object} */(event.detail);
  let fromPath = detail && detail.path;
  if (fromPath) {
    toPath = translate(fromProp, toPath, fromPath);
    value = detail && detail.value;
  } else {
    value = event.currentTarget[fromProp];
  }
  value = negate ? !value : value;
  if (!inst[TYPES.READ_ONLY] || !inst[TYPES.READ_ONLY][toPath]) {
    if (inst._setPendingPropertyOrPath(toPath, value, true, Boolean(fromPath))
      && (!detail || !detail.queueProperty)) {
      inst._invalidateProperties();
    }
  }
}

/**
 * Implements the "reflect" effect.
 *
 * Sets the attribute named `info.attrName` to the given property value.
 *
 * @param {!Polymer_PropertyEffects} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {Object} props Bag of current property changes
 * @param {Object} oldProps Bag of previous values for changed properties
 * @param {?} info Effect metadata
 * @return {void}
 * @private
 */
function runReflectEffect(inst, property, props, oldProps, info) {
  let value = inst.__data[property];
  if (sanitizeDOMValue) {
    value = sanitizeDOMValue(value, info.attrName, 'attribute', /** @type {Node} */(inst));
  }
  inst._propertyToAttribute(property, info.attrName, value);
}

/**
 * Runs "computed" effects for a set of changed properties.
 *
 * This method differs from the generic `runEffects` method in that it
 * continues to run computed effects based on the output of each pass until
 * there are no more newly computed properties.  This ensures that all
 * properties that will be computed by the initial set of changes are
 * computed before other effects (binding propagation, observers, and notify)
 * run.
 *
 * @param {!Polymer_PropertyEffects} inst The instance the effect will be run on
 * @param {?Object} changedProps Bag of changed properties
 * @param {?Object} oldProps Bag of previous values for changed properties
 * @param {boolean} hasPaths True with `props` contains one or more paths
 * @return {void}
 * @private
 */
function runComputedEffects(inst, changedProps, oldProps, hasPaths) {
  let computeEffects = inst[TYPES.COMPUTE];
  if (computeEffects) {
    if (orderedComputed) {
      // Runs computed effects in efficient order by keeping a topologically-
      // sorted queue of compute effects to run, and inserting subsequently
      // invalidated effects as they are run
      dedupeId$1++;
      const order = getComputedOrder(inst);
      const queue = [];
      for (let p in changedProps) {
        enqueueEffectsFor(p, computeEffects, queue, order, hasPaths);
      }
      let info;
      while ((info = queue.shift())) {
        if (runComputedEffect(inst, '', changedProps, oldProps, info)) {
          enqueueEffectsFor(info.methodInfo, computeEffects, queue, order, hasPaths);
        }
      }
      Object.assign(/** @type {!Object} */ (oldProps), inst.__dataOld);
      Object.assign(/** @type {!Object} */ (changedProps), inst.__dataPending);
      inst.__dataPending = null;
    } else {
      // Original Polymer 2.x computed effects order, which continues running
      // effects until no further computed properties have been invalidated
      let inputProps = changedProps;
      while (runEffects(inst, computeEffects, inputProps, oldProps, hasPaths)) {
        Object.assign(/** @type {!Object} */ (oldProps), inst.__dataOld);
        Object.assign(/** @type {!Object} */ (changedProps), inst.__dataPending);
        inputProps = inst.__dataPending;
        inst.__dataPending = null;
      }
    }
  }
}

/**
 * Inserts a computed effect into a queue, given the specified order. Performs
 * the insert using a binary search.
 *
 * Used by `orderedComputed: true` computed property algorithm.
 *
 * @param {Object} info Property effects metadata
 * @param {Array<Object>} queue Ordered queue of effects
 * @param {Map<string,number>} order Map of computed property name->topological
 *   sort order
 */
const insertEffect = (info, queue, order) => {
  let start = 0;
  let end = queue.length - 1;
  let idx = -1;
  while (start <= end) {
    const mid = (start + end) >> 1;
    // Note `methodInfo` is where the computed property name is stored in
    // the effect metadata
    const cmp = order.get(queue[mid].methodInfo) - order.get(info.methodInfo);
    if (cmp < 0) {
      start = mid + 1;
    } else if (cmp > 0) {
      end = mid - 1;
    } else {
      idx = mid;
      break;
    }
  }
  if (idx < 0) {
    idx = end + 1;
  }
  queue.splice(idx, 0, info);
};

/**
 * Inserts all downstream computed effects invalidated by the specified property
 * into the topologically-sorted queue of effects to be run.
 *
 * Used by `orderedComputed: true` computed property algorithm.
 *
 * @param {string} prop Property name
 * @param {Object} computeEffects Computed effects for this element
 * @param {Array<Object>} queue Topologically-sorted queue of computed effects
 *   to be run
 * @param {Map<string,number>} order Map of computed property name->topological
 *   sort order
 * @param {boolean} hasPaths True with `changedProps` contains one or more paths
 */
const enqueueEffectsFor = (prop, computeEffects, queue, order, hasPaths) => {
  const rootProperty = hasPaths ? root(prop) : prop;
  const fxs = computeEffects[rootProperty];
  if (fxs) {
    for (let i=0; i<fxs.length; i++) {
      const fx = fxs[i];
      if ((fx.info.lastRun !== dedupeId$1) &&
          (!hasPaths || pathMatchesTrigger(prop, fx.trigger))) {
        fx.info.lastRun = dedupeId$1;
        insertEffect(fx.info, queue, order);
      }
    }
  }
};

/**
 * Generates and retrieves a memoized map of computed property name to its
 * topologically-sorted order.
 *
 * The map is generated by first assigning a "dependency count" to each property
 * (defined as number properties it depends on, including its method for
 * "dynamic functions"). Any properties that have no dependencies are added to
 * the `ready` queue, which are properties whose order can be added to the final
 * order map. Properties are popped off the `ready` queue one by one and a.) added as
 * the next property in the order map, and b.) each property that it is a
 * dependency for has its dep count decremented (and if that property's dep
 * count goes to zero, it is added to the `ready` queue), until all properties
 * have been visited and ordered.
 *
 * Used by `orderedComputed: true` computed property algorithm.
 *
 * @param {!Polymer_PropertyEffects} inst The instance to retrieve the computed
 *   effect order for.
 * @return {Map<string,number>} Map of computed property name->topological sort
 *   order
 */
function getComputedOrder(inst) {
  let ordered = inst.constructor.__orderedComputedDeps;
  if (!ordered) {
    ordered = new Map();
    const effects = inst[TYPES.COMPUTE];
    let {counts, ready, total} = dependencyCounts(inst);
    let curr;
    while ((curr = ready.shift())) {
      ordered.set(curr, ordered.size);
      const computedByCurr = effects[curr];
      if (computedByCurr) {
        computedByCurr.forEach(fx => {
          // Note `methodInfo` is where the computed property name is stored
          const computedProp = fx.info.methodInfo;
          --total;
          if (--counts[computedProp] === 0) {
            ready.push(computedProp);
          }
        });
      }
    }
    if (total !== 0) {
      const el = /** @type {HTMLElement} */ (inst);
      console.warn(`Computed graph for ${el.localName} incomplete; circular?`);
    }
    inst.constructor.__orderedComputedDeps = ordered;
  }
  return ordered;
}

/**
 * Generates a map of property-to-dependency count (`counts`, where "dependency
 * count" is the number of dependencies a given property has assuming it is a
 * computed property, otherwise 0).  It also returns a pre-populated list of
 * `ready` properties that have no dependencies and a `total` count, which is
 * used for error-checking the graph.
 *
 * Used by `orderedComputed: true` computed property algorithm.
 *
 * @param {!Polymer_PropertyEffects} inst The instance to generate dependency
 *   counts for.
 * @return {!Object} Object containing `counts` map (property-to-dependency
 *   count) and pre-populated `ready` array of properties that had zero
 *   dependencies.
 */
function dependencyCounts(inst) {
  const infoForComputed = inst[COMPUTE_INFO];
  const counts = {};
  const computedDeps = inst[TYPES.COMPUTE];
  const ready = [];
  let total = 0;
  // Count dependencies for each computed property
  for (let p in infoForComputed) {
    const info = infoForComputed[p];
    // Be sure to add the method name itself in case of "dynamic functions"
    total += counts[p] =
      info.args.filter(a => !a.literal).length + (info.dynamicFn ? 1 : 0);
  }
  // Build list of ready properties (that aren't themselves computed)
  for (let p in computedDeps) {
    if (!infoForComputed[p]) {
      ready.push(p);
    }
  }
  return {counts, ready, total};
}

/**
 * Implements the "computed property" effect by running the method with the
 * values of the arguments specified in the `info` object and setting the
 * return value to the computed property specified.
 *
 * @param {!Polymer_PropertyEffects} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {?Object} changedProps Bag of current property changes
 * @param {?Object} oldProps Bag of previous values for changed properties
 * @param {?} info Effect metadata
 * @return {boolean} True when the property being computed changed
 * @private
 */
function runComputedEffect(inst, property, changedProps, oldProps, info) {
  // Dirty check dependencies and run if any invalid
  let result = runMethodEffect(inst, property, changedProps, oldProps, info);
  // Abort if method returns a no-op result
  if (result === NOOP) {
    return false;
  }
  let computedProp = info.methodInfo;
  if (inst.__dataHasAccessor && inst.__dataHasAccessor[computedProp]) {
    return inst._setPendingProperty(computedProp, result, true);
  } else {
    inst[computedProp] = result;
    return false;
  }
}

/**
 * Computes path changes based on path links set up using the `linkPaths`
 * API.
 *
 * @param {!Polymer_PropertyEffects} inst The instance whose props are changing
 * @param {string} path Path that has changed
 * @param {*} value Value of changed path
 * @return {void}
 * @private
 */
function computeLinkedPaths(inst, path, value) {
  let links = inst.__dataLinkedPaths;
  if (links) {
    let link;
    for (let a in links) {
      let b = links[a];
      if (isDescendant(a, path)) {
        link = translate(a, b, path);
        inst._setPendingPropertyOrPath(link, value, true, true);
      } else if (isDescendant(b, path)) {
        link = translate(b, a, path);
        inst._setPendingPropertyOrPath(link, value, true, true);
      }
    }
  }
}

// -- bindings ----------------------------------------------

/**
 * Adds binding metadata to the current `nodeInfo`, and binding effects
 * for all part dependencies to `templateInfo`.
 *
 * @param {Function} constructor Class that `_parseTemplate` is currently
 *   running on
 * @param {TemplateInfo} templateInfo Template metadata for current template
 * @param {NodeInfo} nodeInfo Node metadata for current template node
 * @param {string} kind Binding kind, either 'property', 'attribute', or 'text'
 * @param {string} target Target property name
 * @param {!Array<!BindingPart>} parts Array of binding part metadata
 * @param {string=} literal Literal text surrounding binding parts (specified
 *   only for 'property' bindings, since these must be initialized as part
 *   of boot-up)
 * @return {void}
 * @private
 */
function addBinding(constructor, templateInfo, nodeInfo, kind, target, parts, literal) {
  // Create binding metadata and add to nodeInfo
  nodeInfo.bindings = nodeInfo.bindings || [];
  let /** Binding */ binding = { kind, target, parts, literal, isCompound: (parts.length !== 1) };
  nodeInfo.bindings.push(binding);
  // Add listener info to binding metadata
  if (shouldAddListener(binding)) {
    let {event, negate} = binding.parts[0];
    binding.listenerEvent = event || (camelToDashCase(target) + '-changed');
    binding.listenerNegate = negate;
  }
  // Add "propagate" property effects to templateInfo
  let index = templateInfo.nodeInfoList.length;
  for (let i=0; i<binding.parts.length; i++) {
    let part = binding.parts[i];
    part.compoundIndex = i;
    addEffectForBindingPart(constructor, templateInfo, binding, part, index);
  }
}

/**
 * Adds property effects to the given `templateInfo` for the given binding
 * part.
 *
 * @param {Function} constructor Class that `_parseTemplate` is currently
 *   running on
 * @param {TemplateInfo} templateInfo Template metadata for current template
 * @param {!Binding} binding Binding metadata
 * @param {!BindingPart} part Binding part metadata
 * @param {number} index Index into `nodeInfoList` for this node
 * @return {void}
 */
function addEffectForBindingPart(constructor, templateInfo, binding, part, index) {
  if (!part.literal) {
    if (binding.kind === 'attribute' && binding.target[0] === '-') {
      console.warn('Cannot set attribute ' + binding.target +
        ' because "-" is not a valid attribute starting character');
    } else {
      let dependencies = part.dependencies;
      let info = { index, binding, part, evaluator: constructor };
      for (let j=0; j<dependencies.length; j++) {
        let trigger = dependencies[j];
        if (typeof trigger == 'string') {
          trigger = parseArg(trigger);
          trigger.wildcard = true;
        }
        constructor._addTemplatePropertyEffect(templateInfo, trigger.rootProperty, {
          fn: runBindingEffect,
          info, trigger
        });
      }
    }
  }
}

/**
 * Implements the "binding" (property/path binding) effect.
 *
 * Note that binding syntax is overridable via `_parseBindings` and
 * `_evaluateBinding`.  This method will call `_evaluateBinding` for any
 * non-literal parts returned from `_parseBindings`.  However,
 * there is no support for _path_ bindings via custom binding parts,
 * as this is specific to Polymer's path binding syntax.
 *
 * @param {!Polymer_PropertyEffects} inst The instance the effect will be run on
 * @param {string} path Name of property
 * @param {Object} props Bag of current property changes
 * @param {Object} oldProps Bag of previous values for changed properties
 * @param {?} info Effect metadata
 * @param {boolean} hasPaths True with `props` contains one or more paths
 * @param {Array} nodeList List of nodes associated with `nodeInfoList` template
 *   metadata
 * @return {void}
 * @private
 */
function runBindingEffect(inst, path, props, oldProps, info, hasPaths, nodeList) {
  let node = nodeList[info.index];
  let binding = info.binding;
  let part = info.part;
  // Subpath notification: transform path and set to client
  // e.g.: foo="{{obj.sub}}", path: 'obj.sub.prop', set 'foo.prop'=obj.sub.prop
  if (hasPaths && part.source && (path.length > part.source.length) &&
      (binding.kind == 'property') && !binding.isCompound &&
      node.__isPropertyEffectsClient &&
      node.__dataHasAccessor && node.__dataHasAccessor[binding.target]) {
    let value = props[path];
    path = translate(part.source, binding.target, path);
    if (node._setPendingPropertyOrPath(path, value, false, true)) {
      inst._enqueueClient(node);
    }
  } else {
    let value = info.evaluator._evaluateBinding(inst, part, path, props, oldProps, hasPaths);
    // Propagate value to child
    // Abort if value is a no-op result
    if (value !== NOOP) {
      applyBindingValue(inst, node, binding, part, value);
    }
  }
}

/**
 * Sets the value for an "binding" (binding) effect to a node,
 * either as a property or attribute.
 *
 * @param {!Polymer_PropertyEffects} inst The instance owning the binding effect
 * @param {Node} node Target node for binding
 * @param {!Binding} binding Binding metadata
 * @param {!BindingPart} part Binding part metadata
 * @param {*} value Value to set
 * @return {void}
 * @private
 */
function applyBindingValue(inst, node, binding, part, value) {
  value = computeBindingValue(node, value, binding, part);
  if (sanitizeDOMValue) {
    value = sanitizeDOMValue(value, binding.target, binding.kind, node);
  }
  if (binding.kind == 'attribute') {
    // Attribute binding
    inst._valueToNodeAttribute(/** @type {Element} */(node), value, binding.target);
  } else {
    // Property binding
    let prop = binding.target;
    if (node.__isPropertyEffectsClient &&
        node.__dataHasAccessor && node.__dataHasAccessor[prop]) {
      if (!node[TYPES.READ_ONLY] || !node[TYPES.READ_ONLY][prop]) {
        if (node._setPendingProperty(prop, value)) {
          inst._enqueueClient(node);
        }
      }
    } else {
      // In legacy no-batching mode, bindings applied before dataReady are
      // equivalent to the "apply config" phase, which only set managed props
      inst._setUnmanagedPropertyToNode(node, prop, value);
    }
  }
}

/**
 * Transforms an "binding" effect value based on compound & negation
 * effect metadata, as well as handling for special-case properties
 *
 * @param {Node} node Node the value will be set to
 * @param {*} value Value to set
 * @param {!Binding} binding Binding metadata
 * @param {!BindingPart} part Binding part metadata
 * @return {*} Transformed value to set
 * @private
 */
function computeBindingValue(node, value, binding, part) {
  if (binding.isCompound) {
    let storage = node.__dataCompoundStorage[binding.target];
    storage[part.compoundIndex] = value;
    value = storage.join('');
  }
  if (binding.kind !== 'attribute') {
    // Some browsers serialize `undefined` to `"undefined"`
    if (binding.target === 'textContent' ||
        (binding.target === 'value' &&
          (node.localName === 'input' || node.localName === 'textarea'))) {
      value = value == undefined ? '' : value;
    }
  }
  return value;
}

/**
 * Returns true if a binding's metadata meets all the requirements to allow
 * 2-way binding, and therefore a `<property>-changed` event listener should be
 * added:
 * - used curly braces
 * - is a property (not attribute) binding
 * - is not a textContent binding
 * - is not compound
 *
 * @param {!Binding} binding Binding metadata
 * @return {boolean} True if 2-way listener should be added
 * @private
 */
function shouldAddListener(binding) {
  return Boolean(binding.target) &&
         binding.kind != 'attribute' &&
         binding.kind != 'text' &&
         !binding.isCompound &&
         binding.parts[0].mode === '{';
}

/**
 * Setup compound binding storage structures, notify listeners, and dataHost
 * references onto the bound nodeList.
 *
 * @param {!Polymer_PropertyEffects} inst Instance that bas been previously
 *     bound
 * @param {TemplateInfo} templateInfo Template metadata
 * @return {void}
 * @private
 */
function setupBindings(inst, templateInfo) {
  // Setup compound storage, dataHost, and notify listeners
  let {nodeList, nodeInfoList} = templateInfo;
  if (nodeInfoList.length) {
    for (let i=0; i < nodeInfoList.length; i++) {
      let info = nodeInfoList[i];
      let node = nodeList[i];
      let bindings = info.bindings;
      if (bindings) {
        for (let i=0; i<bindings.length; i++) {
          let binding = bindings[i];
          setupCompoundStorage(node, binding);
          addNotifyListener(node, inst, binding);
        }
      }
      // This ensures all bound elements have a host set, regardless
      // of whether they upgrade synchronous to creation
      node.__dataHost = inst;
    }
  }
}

/**
 * Initializes `__dataCompoundStorage` local storage on a bound node with
 * initial literal data for compound bindings, and sets the joined
 * literal parts to the bound property.
 *
 * When changes to compound parts occur, they are first set into the compound
 * storage array for that property, and then the array is joined to result in
 * the final value set to the property/attribute.
 *
 * @param {Node} node Bound node to initialize
 * @param {Binding} binding Binding metadata
 * @return {void}
 * @private
 */
function setupCompoundStorage(node, binding) {
  if (binding.isCompound) {
    // Create compound storage map
    let storage = node.__dataCompoundStorage ||
      (node.__dataCompoundStorage = {});
    let parts = binding.parts;
    // Copy literals from parts into storage for this binding
    let literals = new Array(parts.length);
    for (let j=0; j<parts.length; j++) {
      literals[j] = parts[j].literal;
    }
    let target = binding.target;
    storage[target] = literals;
    // Configure properties with their literal parts
    if (binding.literal && binding.kind == 'property') {
      // Note, className needs style scoping so this needs wrapping.
      // We may also want to consider doing this for `textContent` and
      // `innerHTML`.
      if (target === 'className') {
        node = wrap(node);
      }
      node[target] = binding.literal;
    }
  }
}

/**
 * Adds a 2-way binding notification event listener to the node specified
 *
 * @param {Object} node Child element to add listener to
 * @param {!Polymer_PropertyEffects} inst Host element instance to handle
 *     notification event
 * @param {Binding} binding Binding metadata
 * @return {void}
 * @private
 */
function addNotifyListener(node, inst, binding) {
  if (binding.listenerEvent) {
    let part = binding.parts[0];
    node.addEventListener(binding.listenerEvent, function(e) {
      handleNotification(e, inst, binding.target, part.source, part.negate);
    });
  }
}

// -- for method-based effects (complexObserver & computed) --------------

/**
 * Adds property effects for each argument in the method signature (and
 * optionally, for the method name if `dynamic` is true) that calls the
 * provided effect function.
 *
 * @param {Element | Object} model Prototype or instance
 * @param {!MethodSignature} sig Method signature metadata
 * @param {string} type Type of property effect to add
 * @param {Function} effectFn Function to run when arguments change
 * @param {*=} methodInfo Effect-specific information to be included in
 *   method effect metadata
 * @param {boolean|Object=} dynamicFn Boolean or object map indicating whether
 *   method names should be included as a dependency to the effect. Note,
 *   defaults to true if the signature is static (sig.static is true).
 * @return {!Object} Effect metadata for this method effect
 * @private
 */
function createMethodEffect(model, sig, type, effectFn, methodInfo, dynamicFn) {
  dynamicFn = sig.static || (dynamicFn &&
    (typeof dynamicFn !== 'object' || dynamicFn[sig.methodName]));
  let info = {
    methodName: sig.methodName,
    args: sig.args,
    methodInfo,
    dynamicFn
  };
  for (let i=0, arg; (i<sig.args.length) && (arg=sig.args[i]); i++) {
    if (!arg.literal) {
      model._addPropertyEffect(arg.rootProperty, type, {
        fn: effectFn, info: info, trigger: arg
      });
    }
  }
  if (dynamicFn) {
    model._addPropertyEffect(sig.methodName, type, {
      fn: effectFn, info: info
    });
  }
  return info;
}

/**
 * Calls a method with arguments marshaled from properties on the instance
 * based on the method signature contained in the effect metadata.
 *
 * Multi-property observers, computed properties, and inline computing
 * functions call this function to invoke the method, then use the return
 * value accordingly.
 *
 * @param {!Polymer_PropertyEffects} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {Object} props Bag of current property changes
 * @param {Object} oldProps Bag of previous values for changed properties
 * @param {?} info Effect metadata
 * @return {*} Returns the return value from the method invocation
 * @private
 */
function runMethodEffect(inst, property, props, oldProps, info) {
  // Instances can optionally have a _methodHost which allows redirecting where
  // to find methods. Currently used by `templatize`.
  let context = inst._methodHost || inst;
  let fn = context[info.methodName];
  if (fn) {
    let args = inst._marshalArgs(info.args, property, props);
    return args === NOOP ? NOOP : fn.apply(context, args);
  } else if (!info.dynamicFn) {
    console.warn('method `' + info.methodName + '` not defined');
  }
}

const emptyArray = [];

// Regular expressions used for binding
const IDENT  = '(?:' + '[a-zA-Z_$][\\w.:$\\-*]*' + ')';
const NUMBER = '(?:' + '[-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?' + ')';
const SQUOTE_STRING = '(?:' + '\'(?:[^\'\\\\]|\\\\.)*\'' + ')';
const DQUOTE_STRING = '(?:' + '"(?:[^"\\\\]|\\\\.)*"' + ')';
const STRING = '(?:' + SQUOTE_STRING + '|' + DQUOTE_STRING + ')';
const ARGUMENT = '(?:(' + IDENT + '|' + NUMBER + '|' +  STRING + ')\\s*' + ')';
const ARGUMENTS = '(?:' + ARGUMENT + '(?:,\\s*' + ARGUMENT + ')*' + ')';
const ARGUMENT_LIST = '(?:' + '\\(\\s*' +
                              '(?:' + ARGUMENTS + '?' + ')' +
                            '\\)\\s*' + ')';
const BINDING = '(' + IDENT + '\\s*' + ARGUMENT_LIST + '?' + ')'; // Group 3
const OPEN_BRACKET = '(\\[\\[|{{)' + '\\s*';
const CLOSE_BRACKET = '(?:]]|}})';
const NEGATE = '(?:(!)\\s*)?'; // Group 2
const EXPRESSION = OPEN_BRACKET + NEGATE + BINDING + CLOSE_BRACKET;
const bindingRegex = new RegExp(EXPRESSION, "g");

/**
 * Create a string from binding parts of all the literal parts
 *
 * @param {!Array<BindingPart>} parts All parts to stringify
 * @return {string} String made from the literal parts
 */
function literalFromParts(parts) {
  let s = '';
  for (let i=0; i<parts.length; i++) {
    let literal = parts[i].literal;
    s += literal || '';
  }
  return s;
}

/**
 * Parses an expression string for a method signature, and returns a metadata
 * describing the method in terms of `methodName`, `static` (whether all the
 * arguments are literals), and an array of `args`
 *
 * @param {string} expression The expression to parse
 * @return {?MethodSignature} The method metadata object if a method expression was
 *   found, otherwise `undefined`
 * @private
 */
function parseMethod(expression) {
  // tries to match valid javascript property names
  let m = expression.match(/([^\s]+?)\(([\s\S]*)\)/);
  if (m) {
    let methodName = m[1];
    let sig = { methodName, static: true, args: emptyArray };
    if (m[2].trim()) {
      // replace escaped commas with comma entity, split on un-escaped commas
      let args = m[2].replace(/\\,/g, '&comma;').split(',');
      return parseArgs(args, sig);
    } else {
      return sig;
    }
  }
  return null;
}

/**
 * Parses an array of arguments and sets the `args` property of the supplied
 * signature metadata object. Sets the `static` property to false if any
 * argument is a non-literal.
 *
 * @param {!Array<string>} argList Array of argument names
 * @param {!MethodSignature} sig Method signature metadata object
 * @return {!MethodSignature} The updated signature metadata object
 * @private
 */
function parseArgs(argList, sig) {
  sig.args = argList.map(function(rawArg) {
    let arg = parseArg(rawArg);
    if (!arg.literal) {
      sig.static = false;
    }
    return arg;
  }, this);
  return sig;
}

/**
 * Parses an individual argument, and returns an argument metadata object
 * with the following fields:
 *
 *   {
 *     value: 'prop',        // property/path or literal value
 *     literal: false,       // whether argument is a literal
 *     structured: false,    // whether the property is a path
 *     rootProperty: 'prop', // the root property of the path
 *     wildcard: false       // whether the argument was a wildcard '.*' path
 *   }
 *
 * @param {string} rawArg The string value of the argument
 * @return {!MethodArg} Argument metadata object
 * @private
 */
function parseArg(rawArg) {
  // clean up whitespace
  let arg = rawArg.trim()
    // replace comma entity with comma
    .replace(/&comma;/g, ',')
    // repair extra escape sequences; note only commas strictly need
    // escaping, but we allow any other char to be escaped since its
    // likely users will do this
    .replace(/\\(.)/g, '\$1')
    ;
  // basic argument descriptor
  let a = {
    name: arg,
    value: '',
    literal: false
  };
  // detect literal value (must be String or Number)
  let fc = arg[0];
  if (fc === '-') {
    fc = arg[1];
  }
  if (fc >= '0' && fc <= '9') {
    fc = '#';
  }
  switch(fc) {
    case "'":
    case '"':
      a.value = arg.slice(1, -1);
      a.literal = true;
      break;
    case '#':
      a.value = Number(arg);
      a.literal = true;
      break;
  }
  // if not literal, look for structured path
  if (!a.literal) {
    a.rootProperty = root(arg);
    // detect structured path (has dots)
    a.structured = isPath(arg);
    if (a.structured) {
      a.wildcard = (arg.slice(-2) == '.*');
      if (a.wildcard) {
        a.name = arg.slice(0, -2);
      }
    }
  }
  return a;
}

function getArgValue(data, props, path) {
  let value = get(data, path);
  // when data is not stored e.g. `splices`, get the value from changedProps
  // TODO(kschaaf): Note, this can cause a rare issue where the wildcard
  // info.value could pull a stale value out of changedProps during a reentrant
  // change that sets the value back to undefined.
  // https://github.com/Polymer/polymer/issues/5479
  if (value === undefined) {
    value = props[path];
  }
  return value;
}

// data api

/**
 * Sends array splice notifications (`.splices` and `.length`)
 *
 * Note: this implementation only accepts normalized paths
 *
 * @param {!Polymer_PropertyEffects} inst Instance to send notifications to
 * @param {Array} array The array the mutations occurred on
 * @param {string} path The path to the array that was mutated
 * @param {Array} splices Array of splice records
 * @return {void}
 * @private
 */
function notifySplices(inst, array, path, splices) {
  const splicesData = { indexSplices: splices };
  // Legacy behavior stored splices in `__data__` so it was *not* ephemeral.
  // To match this behavior, we store splices directly on the array.
  if (legacyUndefined && !inst._overrideLegacyUndefined) {
    array.splices = splicesData;
  }
  inst.notifyPath(path + '.splices', splicesData);
  inst.notifyPath(path + '.length', array.length);
  // Clear splice data only when it's stored on the array.
  if (legacyUndefined && !inst._overrideLegacyUndefined) {
    splicesData.indexSplices = [];
  }
}

/**
 * Creates a splice record and sends an array splice notification for
 * the described mutation
 *
 * Note: this implementation only accepts normalized paths
 *
 * @param {!Polymer_PropertyEffects} inst Instance to send notifications to
 * @param {Array} array The array the mutations occurred on
 * @param {string} path The path to the array that was mutated
 * @param {number} index Index at which the array mutation occurred
 * @param {number} addedCount Number of added items
 * @param {Array} removed Array of removed items
 * @return {void}
 * @private
 */
function notifySplice(inst, array, path, index, addedCount, removed) {
  notifySplices(inst, array, path, [{
    index: index,
    addedCount: addedCount,
    removed: removed,
    object: array,
    type: 'splice'
  }]);
}

/**
 * Returns an upper-cased version of the string.
 *
 * @param {string} name String to uppercase
 * @return {string} Uppercased string
 * @private
 */
function upper(name) {
  return name[0].toUpperCase() + name.substring(1);
}

/**
 * Element class mixin that provides meta-programming for Polymer's template
 * binding and data observation (collectively, "property effects") system.
 *
 * This mixin uses provides the following key static methods for adding
 * property effects to an element class:
 * - `addPropertyEffect`
 * - `createPropertyObserver`
 * - `createMethodObserver`
 * - `createNotifyingProperty`
 * - `createReadOnlyProperty`
 * - `createReflectedProperty`
 * - `createComputedProperty`
 * - `bindTemplate`
 *
 * Each method creates one or more property accessors, along with metadata
 * used by this mixin's implementation of `_propertiesChanged` to perform
 * the property effects.
 *
 * Underscored versions of the above methods also exist on the element
 * prototype for adding property effects on instances at runtime.
 *
 * Note that this mixin overrides several `PropertyAccessors` methods, in
 * many cases to maintain guarantees provided by the Polymer 1.x features;
 * notably it changes property accessors to be synchronous by default
 * whereas the default when using `PropertyAccessors` standalone is to be
 * async by default.
 *
 * @mixinFunction
 * @polymer
 * @appliesMixin TemplateStamp
 * @appliesMixin PropertyAccessors
 * @summary Element class mixin that provides meta-programming for Polymer's
 * template binding and data observation system.
 */
const PropertyEffects = dedupingMixin(superClass => {

  /**
   * @constructor
   * @implements {Polymer_PropertyAccessors}
   * @implements {Polymer_TemplateStamp}
   * @unrestricted
   * @private
   */
  const propertyEffectsBase = TemplateStamp(PropertyAccessors(superClass));

  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_PropertyEffects}
   * @extends {propertyEffectsBase}
   * @unrestricted
   */
  class PropertyEffects extends propertyEffectsBase {

    constructor() {
      super();
      /** @type {boolean} */
      // Used to identify users of this mixin, ala instanceof
      this.__isPropertyEffectsClient = true;
      /** @type {boolean} */
      this.__dataClientsReady;
      /** @type {Array} */
      this.__dataPendingClients;
      /** @type {Object} */
      this.__dataToNotify;
      /** @type {Object} */
      this.__dataLinkedPaths;
      /** @type {boolean} */
      this.__dataHasPaths;
      /** @type {Object} */
      this.__dataCompoundStorage;
      /** @type {Polymer_PropertyEffects} */
      this.__dataHost;
      /** @type {!Object} */
      this.__dataTemp;
      /** @type {boolean} */
      this.__dataClientsInitialized;
      /** @type {!Object} */
      this.__data;
      /** @type {!Object|null} */
      this.__dataPending;
      /** @type {!Object} */
      this.__dataOld;
      /** @type {Object} */
      this.__computeEffects;
      /** @type {Object} */
      this.__computeInfo;
      /** @type {Object} */
      this.__reflectEffects;
      /** @type {Object} */
      this.__notifyEffects;
      /** @type {Object} */
      this.__propagateEffects;
      /** @type {Object} */
      this.__observeEffects;
      /** @type {Object} */
      this.__readOnly;
      /** @type {!TemplateInfo} */
      this.__templateInfo;
      /** @type {boolean} */
      this._overrideLegacyUndefined;
    }

    get PROPERTY_EFFECT_TYPES() {
      return TYPES;
    }

    /**
     * @override
     * @return {void}
     */
    _initializeProperties() {
      super._initializeProperties();
      this._registerHost();
      this.__dataClientsReady = false;
      this.__dataPendingClients = null;
      this.__dataToNotify = null;
      this.__dataLinkedPaths = null;
      this.__dataHasPaths = false;
      // May be set on instance prior to upgrade
      this.__dataCompoundStorage = this.__dataCompoundStorage || null;
      this.__dataHost = this.__dataHost || null;
      this.__dataTemp = {};
      this.__dataClientsInitialized = false;
    }

    _registerHost() {
      if (hostStack.length) {
        let host = hostStack[hostStack.length-1];
        host._enqueueClient(this);
        // This ensures even non-bound elements have a host set, as
        // long as they upgrade synchronously
        this.__dataHost = host;
      }
    }

    /**
     * Overrides `PropertyAccessors` implementation to provide a
     * more efficient implementation of initializing properties from
     * the prototype on the instance.
     *
     * @override
     * @param {Object} props Properties to initialize on the prototype
     * @return {void}
     */
    _initializeProtoProperties(props) {
      this.__data = Object.create(props);
      this.__dataPending = Object.create(props);
      this.__dataOld = {};
    }

    /**
     * Overrides `PropertyAccessors` implementation to avoid setting
     * `_setProperty`'s `shouldNotify: true`.
     *
     * @override
     * @param {Object} props Properties to initialize on the instance
     * @return {void}
     */
    _initializeInstanceProperties(props) {
      let readOnly = this[TYPES.READ_ONLY];
      for (let prop in props) {
        if (!readOnly || !readOnly[prop]) {
          this.__dataPending = this.__dataPending || {};
          this.__dataOld = this.__dataOld || {};
          this.__data[prop] = this.__dataPending[prop] = props[prop];
        }
      }
    }

    // Prototype setup ----------------------------------------

    /**
     * Equivalent to static `addPropertyEffect` API but can be called on
     * an instance to add effects at runtime.  See that method for
     * full API docs.
     *
     * @override
     * @param {string} property Property that should trigger the effect
     * @param {string} type Effect type, from this.PROPERTY_EFFECT_TYPES
     * @param {Object=} effect Effect metadata object
     * @return {void}
     * @protected
     */
    _addPropertyEffect(property, type, effect) {
      this._createPropertyAccessor(property, type == TYPES.READ_ONLY);
      // effects are accumulated into arrays per property based on type
      let effects = ensureOwnEffectMap(this, type, true)[property];
      if (!effects) {
        effects = this[type][property] = [];
      }
      effects.push(effect);
    }

    /**
     * Removes the given property effect.
     *
     * @override
     * @param {string} property Property the effect was associated with
     * @param {string} type Effect type, from this.PROPERTY_EFFECT_TYPES
     * @param {Object=} effect Effect metadata object to remove
     * @return {void}
     */
    _removePropertyEffect(property, type, effect) {
      let effects = ensureOwnEffectMap(this, type, true)[property];
      let idx = effects.indexOf(effect);
      if (idx >= 0) {
        effects.splice(idx, 1);
      }
    }

    /**
     * Returns whether the current prototype/instance has a property effect
     * of a certain type.
     *
     * @override
     * @param {string} property Property name
     * @param {string=} type Effect type, from this.PROPERTY_EFFECT_TYPES
     * @return {boolean} True if the prototype/instance has an effect of this
     *     type
     * @protected
     */
    _hasPropertyEffect(property, type) {
      let effects = this[type];
      return Boolean(effects && effects[property]);
    }

    /**
     * Returns whether the current prototype/instance has a "read only"
     * accessor for the given property.
     *
     * @override
     * @param {string} property Property name
     * @return {boolean} True if the prototype/instance has an effect of this
     *     type
     * @protected
     */
    _hasReadOnlyEffect(property) {
      return this._hasPropertyEffect(property, TYPES.READ_ONLY);
    }

    /**
     * Returns whether the current prototype/instance has a "notify"
     * property effect for the given property.
     *
     * @override
     * @param {string} property Property name
     * @return {boolean} True if the prototype/instance has an effect of this
     *     type
     * @protected
     */
    _hasNotifyEffect(property) {
      return this._hasPropertyEffect(property, TYPES.NOTIFY);
    }

    /**
     * Returns whether the current prototype/instance has a "reflect to
     * attribute" property effect for the given property.
     *
     * @override
     * @param {string} property Property name
     * @return {boolean} True if the prototype/instance has an effect of this
     *     type
     * @protected
     */
    _hasReflectEffect(property) {
      return this._hasPropertyEffect(property, TYPES.REFLECT);
    }

    /**
     * Returns whether the current prototype/instance has a "computed"
     * property effect for the given property.
     *
     * @override
     * @param {string} property Property name
     * @return {boolean} True if the prototype/instance has an effect of this
     *     type
     * @protected
     */
    _hasComputedEffect(property) {
      return this._hasPropertyEffect(property, TYPES.COMPUTE);
    }

    // Runtime ----------------------------------------

    /**
     * Sets a pending property or path.  If the root property of the path in
     * question had no accessor, the path is set, otherwise it is enqueued
     * via `_setPendingProperty`.
     *
     * This function isolates relatively expensive functionality necessary
     * for the public API (`set`, `setProperties`, `notifyPath`, and property
     * change listeners via {{...}} bindings), such that it is only done
     * when paths enter the system, and not at every propagation step.  It
     * also sets a `__dataHasPaths` flag on the instance which is used to
     * fast-path slower path-matching code in the property effects host paths.
     *
     * `path` can be a path string or array of path parts as accepted by the
     * public API.
     *
     * @override
     * @param {string | !Array<number|string>} path Path to set
     * @param {*} value Value to set
     * @param {boolean=} shouldNotify Set to true if this change should
     *  cause a property notification event dispatch
     * @param {boolean=} isPathNotification If the path being set is a path
     *   notification of an already changed value, as opposed to a request
     *   to set and notify the change.  In the latter `false` case, a dirty
     *   check is performed and then the value is set to the path before
     *   enqueuing the pending property change.
     * @return {boolean} Returns true if the property/path was enqueued in
     *   the pending changes bag.
     * @protected
     */
    _setPendingPropertyOrPath(path, value, shouldNotify, isPathNotification) {
      if (isPathNotification ||
          root(Array.isArray(path) ? path[0] : path) !== path) {
        // Dirty check changes being set to a path against the actual object,
        // since this is the entry point for paths into the system; from here
        // the only dirty checks are against the `__dataTemp` cache to prevent
        // duplicate work in the same turn only. Note, if this was a notification
        // of a change already set to a path (isPathNotification: true),
        // we always let the change through and skip the `set` since it was
        // already dirty checked at the point of entry and the underlying
        // object has already been updated
        if (!isPathNotification) {
          let old = get(this, path);
          path = /** @type {string} */ (set(this, path, value));
          // Use property-accessor's simpler dirty check
          if (!path || !super._shouldPropertyChange(path, value, old)) {
            return false;
          }
        }
        this.__dataHasPaths = true;
        if (this._setPendingProperty(/**@type{string}*/(path), value, shouldNotify)) {
          computeLinkedPaths(this, /**@type{string}*/ (path), value);
          return true;
        }
      } else {
        if (this.__dataHasAccessor && this.__dataHasAccessor[path]) {
          return this._setPendingProperty(/**@type{string}*/(path), value, shouldNotify);
        } else {
          this[path] = value;
        }
      }
      return false;
    }

    /**
     * Applies a value to a non-Polymer element/node's property.
     *
     * The implementation makes a best-effort at binding interop:
     * Some native element properties have side-effects when
     * re-setting the same value (e.g. setting `<input>.value` resets the
     * cursor position), so we do a dirty-check before setting the value.
     * However, for better interop with non-Polymer custom elements that
     * accept objects, we explicitly re-set object changes coming from the
     * Polymer world (which may include deep object changes without the
     * top reference changing), erring on the side of providing more
     * information.
     *
     * Users may override this method to provide alternate approaches.
     *
     * @override
     * @param {!Node} node The node to set a property on
     * @param {string} prop The property to set
     * @param {*} value The value to set
     * @return {void}
     * @protected
     */
    _setUnmanagedPropertyToNode(node, prop, value) {
      // It is a judgment call that resetting primitives is
      // "bad" and resettings objects is also "good"; alternatively we could
      // implement a whitelist of tag & property values that should never
      // be reset (e.g. <input>.value && <select>.value)
      if (value !== node[prop] || typeof value == 'object') {
        // Note, className needs style scoping so this needs wrapping.
        if (prop === 'className') {
          node = /** @type {!Node} */(wrap(node));
        }
        node[prop] = value;
      }
    }

    /**
     * Overrides the `PropertiesChanged` implementation to introduce special
     * dirty check logic depending on the property & value being set:
     *
     * 1. Any value set to a path (e.g. 'obj.prop': 42 or 'obj.prop': {...})
     *    Stored in `__dataTemp`, dirty checked against `__dataTemp`
     * 2. Object set to simple property (e.g. 'prop': {...})
     *    Stored in `__dataTemp` and `__data`, dirty checked against
     *    `__dataTemp` by default implementation of `_shouldPropertyChange`
     * 3. Primitive value set to simple property (e.g. 'prop': 42)
     *    Stored in `__data`, dirty checked against `__data`
     *
     * The dirty-check is important to prevent cycles due to two-way
     * notification, but paths and objects are only dirty checked against any
     * previous value set during this turn via a "temporary cache" that is
     * cleared when the last `_propertiesChanged` exits. This is so:
     * a. any cached array paths (e.g. 'array.3.prop') may be invalidated
     *    due to array mutations like shift/unshift/splice; this is fine
     *    since path changes are dirty-checked at user entry points like `set`
     * b. dirty-checking for objects only lasts one turn to allow the user
     *    to mutate the object in-place and re-set it with the same identity
     *    and have all sub-properties re-propagated in a subsequent turn.
     *
     * The temp cache is not necessarily sufficient to prevent invalid array
     * paths, since a splice can happen during the same turn (with pathological
     * user code); we could introduce a "fixup" for temporarily cached array
     * paths if needed: https://github.com/Polymer/polymer/issues/4227
     *
     * @override
     * @param {string} property Name of the property
     * @param {*} value Value to set
     * @param {boolean=} shouldNotify True if property should fire notification
     *   event (applies only for `notify: true` properties)
     * @return {boolean} Returns true if the property changed
     */
    _setPendingProperty(property, value, shouldNotify) {
      let propIsPath = this.__dataHasPaths && isPath(property);
      let prevProps = propIsPath ? this.__dataTemp : this.__data;
      if (this._shouldPropertyChange(property, value, prevProps[property])) {
        if (!this.__dataPending) {
          this.__dataPending = {};
          this.__dataOld = {};
        }
        // Ensure old is captured from the last turn
        if (!(property in this.__dataOld)) {
          this.__dataOld[property] = this.__data[property];
        }
        // Paths are stored in temporary cache (cleared at end of turn),
        // which is used for dirty-checking, all others stored in __data
        if (propIsPath) {
          this.__dataTemp[property] = value;
        } else {
          this.__data[property] = value;
        }
        // All changes go into pending property bag, passed to _propertiesChanged
        this.__dataPending[property] = value;
        // Track properties that should notify separately
        if (propIsPath || (this[TYPES.NOTIFY] && this[TYPES.NOTIFY][property])) {
          this.__dataToNotify = this.__dataToNotify || {};
          this.__dataToNotify[property] = shouldNotify;
        }
        return true;
      }
      return false;
    }

    /**
     * Overrides base implementation to ensure all accessors set `shouldNotify`
     * to true, for per-property notification tracking.
     *
     * @override
     * @param {string} property Name of the property
     * @param {*} value Value to set
     * @return {void}
     */
    _setProperty(property, value) {
      if (this._setPendingProperty(property, value, true)) {
        this._invalidateProperties();
      }
    }

    /**
     * Overrides `PropertyAccessor`'s default async queuing of
     * `_propertiesChanged`: if `__dataReady` is false (has not yet been
     * manually flushed), the function no-ops; otherwise flushes
     * `_propertiesChanged` synchronously.
     *
     * @override
     * @return {void}
     */
    _invalidateProperties() {
      if (this.__dataReady) {
        this._flushProperties();
      }
    }

    /**
     * Enqueues the given client on a list of pending clients, whose
     * pending property changes can later be flushed via a call to
     * `_flushClients`.
     *
     * @override
     * @param {Object} client PropertyEffects client to enqueue
     * @return {void}
     * @protected
     */
    _enqueueClient(client) {
      this.__dataPendingClients = this.__dataPendingClients || [];
      if (client !== this) {
        this.__dataPendingClients.push(client);
      }
    }

    /**
     * Flushes any clients previously enqueued via `_enqueueClient`, causing
     * their `_flushProperties` method to run.
     *
     * @override
     * @return {void}
     * @protected
     */
    _flushClients() {
      if (!this.__dataClientsReady) {
        this.__dataClientsReady = true;
        this._readyClients();
        // Override point where accessors are turned on; importantly,
        // this is after clients have fully readied, providing a guarantee
        // that any property effects occur only after all clients are ready.
        this.__dataReady = true;
      } else {
        this.__enableOrFlushClients();
      }
    }

    // NOTE: We ensure clients either enable or flush as appropriate. This
    // handles two corner cases:
    // (1) clients flush properly when connected/enabled before the host
    // enables; e.g.
    //   (a) Templatize stamps with no properties and does not flush and
    //   (b) the instance is inserted into dom and
    //   (c) then the instance flushes.
    // (2) clients enable properly when not connected/enabled when the host
    // flushes; e.g.
    //   (a) a template is runtime stamped and not yet connected/enabled
    //   (b) a host sets a property, causing stamped dom to flush
    //   (c) the stamped dom enables.
    __enableOrFlushClients() {
      let clients = this.__dataPendingClients;
      if (clients) {
        this.__dataPendingClients = null;
        for (let i=0; i < clients.length; i++) {
          let client = clients[i];
          if (!client.__dataEnabled) {
            client._enableProperties();
          } else if (client.__dataPending) {
            client._flushProperties();
          }
        }
      }
    }

    /**
     * Perform any initial setup on client dom. Called before the first
     * `_flushProperties` call on client dom and before any element
     * observers are called.
     *
     * @override
     * @return {void}
     * @protected
     */
    _readyClients() {
      this.__enableOrFlushClients();
    }

    /**
     * Sets a bag of property changes to this instance, and
     * synchronously processes all effects of the properties as a batch.
     *
     * Property names must be simple properties, not paths.  Batched
     * path propagation is not supported.
     *
     * @override
     * @param {Object} props Bag of one or more key-value pairs whose key is
     *   a property and value is the new value to set for that property.
     * @param {boolean=} setReadOnly When true, any private values set in
     *   `props` will be set. By default, `setProperties` will not set
     *   `readOnly: true` root properties.
     * @return {void}
     * @public
     */
    setProperties(props, setReadOnly) {
      for (let path in props) {
        if (setReadOnly || !this[TYPES.READ_ONLY] || !this[TYPES.READ_ONLY][path]) {
          //TODO(kschaaf): explicitly disallow paths in setProperty?
          // wildcard observers currently only pass the first changed path
          // in the `info` object, and you could do some odd things batching
          // paths, e.g. {'foo.bar': {...}, 'foo': null}
          this._setPendingPropertyOrPath(path, props[path], true);
        }
      }
      this._invalidateProperties();
    }

    /**
     * Overrides `PropertyAccessors` so that property accessor
     * side effects are not enabled until after client dom is fully ready.
     * Also calls `_flushClients` callback to ensure client dom is enabled
     * that was not enabled as a result of flushing properties.
     *
     * @override
     * @return {void}
     */
    ready() {
      // It is important that `super.ready()` is not called here as it
      // immediately turns on accessors. Instead, we wait until `readyClients`
      // to enable accessors to provide a guarantee that clients are ready
      // before processing any accessors side effects.
      this._flushProperties();
      // If no data was pending, `_flushProperties` will not `flushClients`
      // so ensure this is done.
      if (!this.__dataClientsReady) {
        this._flushClients();
      }
      // Before ready, client notifications do not trigger _flushProperties.
      // Therefore a flush is necessary here if data has been set.
      if (this.__dataPending) {
        this._flushProperties();
      }
    }

    /**
     * Implements `PropertyAccessors`'s properties changed callback.
     *
     * Runs each class of effects for the batch of changed properties in
     * a specific order (compute, propagate, reflect, observe, notify).
     *
     * @override
     * @param {!Object} currentProps Bag of all current accessor values
     * @param {?Object} changedProps Bag of properties changed since the last
     *   call to `_propertiesChanged`
     * @param {?Object} oldProps Bag of previous values for each property
     *   in `changedProps`
     * @return {void}
     */
    _propertiesChanged(currentProps, changedProps, oldProps) {
      // ----------------------------
      // let c = Object.getOwnPropertyNames(changedProps || {});
      // window.debug && console.group(this.localName + '#' + this.id + ': ' + c);
      // if (window.debug) { debugger; }
      // ----------------------------
      let hasPaths = this.__dataHasPaths;
      this.__dataHasPaths = false;
      let notifyProps;
      // Compute properties
      runComputedEffects(this, changedProps, oldProps, hasPaths);
      // Clear notify properties prior to possible reentry (propagate, observe),
      // but after computing effects have a chance to add to them
      notifyProps = this.__dataToNotify;
      this.__dataToNotify = null;
      // Propagate properties to clients
      this._propagatePropertyChanges(changedProps, oldProps, hasPaths);
      // Flush clients
      this._flushClients();
      // Reflect properties
      runEffects(this, this[TYPES.REFLECT], changedProps, oldProps, hasPaths);
      // Observe properties
      runEffects(this, this[TYPES.OBSERVE], changedProps, oldProps, hasPaths);
      // Notify properties to host
      if (notifyProps) {
        runNotifyEffects(this, notifyProps, changedProps, oldProps, hasPaths);
      }
      // Clear temporary cache at end of turn
      if (this.__dataCounter == 1) {
        this.__dataTemp = {};
      }
      // ----------------------------
      // window.debug && console.groupEnd(this.localName + '#' + this.id + ': ' + c);
      // ----------------------------
    }

    /**
     * Called to propagate any property changes to stamped template nodes
     * managed by this element.
     *
     * @override
     * @param {Object} changedProps Bag of changed properties
     * @param {Object} oldProps Bag of previous values for changed properties
     * @param {boolean} hasPaths True with `props` contains one or more paths
     * @return {void}
     * @protected
     */
    _propagatePropertyChanges(changedProps, oldProps, hasPaths) {
      if (this[TYPES.PROPAGATE]) {
        runEffects(this, this[TYPES.PROPAGATE], changedProps, oldProps, hasPaths);
      }
      if (this.__templateInfo) {
        this._runEffectsForTemplate(this.__templateInfo, changedProps, oldProps, hasPaths);
      }
    }

    _runEffectsForTemplate(templateInfo, changedProps, oldProps, hasPaths) {
      const baseRunEffects = (changedProps, hasPaths) => {
        runEffects(this, templateInfo.propertyEffects, changedProps, oldProps,
          hasPaths, templateInfo.nodeList);
        for (let info=templateInfo.firstChild; info; info=info.nextSibling) {
          this._runEffectsForTemplate(info, changedProps, oldProps, hasPaths);
        }
      };
      if (templateInfo.runEffects) {
        templateInfo.runEffects(baseRunEffects, changedProps, hasPaths);
      } else {
        baseRunEffects(changedProps, hasPaths);
      }
    }

    /**
     * Aliases one data path as another, such that path notifications from one
     * are routed to the other.
     *
     * @override
     * @param {string | !Array<string|number>} to Target path to link.
     * @param {string | !Array<string|number>} from Source path to link.
     * @return {void}
     * @public
     */
    linkPaths(to, from) {
      to = normalize(to);
      from = normalize(from);
      this.__dataLinkedPaths = this.__dataLinkedPaths || {};
      this.__dataLinkedPaths[to] = from;
    }

    /**
     * Removes a data path alias previously established with `_linkPaths`.
     *
     * Note, the path to unlink should be the target (`to`) used when
     * linking the paths.
     *
     * @override
     * @param {string | !Array<string|number>} path Target path to unlink.
     * @return {void}
     * @public
     */
    unlinkPaths(path) {
      path = normalize(path);
      if (this.__dataLinkedPaths) {
        delete this.__dataLinkedPaths[path];
      }
    }

    /**
     * Notify that an array has changed.
     *
     * Example:
     *
     *     this.items = [ {name: 'Jim'}, {name: 'Todd'}, {name: 'Bill'} ];
     *     ...
     *     this.items.splice(1, 1, {name: 'Sam'});
     *     this.items.push({name: 'Bob'});
     *     this.notifySplices('items', [
     *       { index: 1, removed: [{name: 'Todd'}], addedCount: 1,
     *         object: this.items, type: 'splice' },
     *       { index: 3, removed: [], addedCount: 1,
     *         object: this.items, type: 'splice'}
     *     ]);
     *
     * @param {string} path Path that should be notified.
     * @param {Array} splices Array of splice records indicating ordered
     *   changes that occurred to the array. Each record should have the
     *   following fields:
     *    * index: index at which the change occurred
     *    * removed: array of items that were removed from this index
     *    * addedCount: number of new items added at this index
     *    * object: a reference to the array in question
     *    * type: the string literal 'splice'
     *
     *   Note that splice records _must_ be normalized such that they are
     *   reported in index order (raw results from `Object.observe` are not
     *   ordered and must be normalized/merged before notifying).
     *
     * @override
     * @return {void}
     * @public
     */
    notifySplices(path, splices) {
      let info = {path: ''};
      let array = /** @type {Array} */(get(this, path, info));
      notifySplices(this, array, info.path, splices);
    }

    /**
     * Convenience method for reading a value from a path.
     *
     * Note, if any part in the path is undefined, this method returns
     * `undefined` (this method does not throw when dereferencing undefined
     * paths).
     *
     * @override
     * @param {(string|!Array<(string|number)>)} path Path to the value
     *   to read.  The path may be specified as a string (e.g. `foo.bar.baz`)
     *   or an array of path parts (e.g. `['foo.bar', 'baz']`).  Note that
     *   bracketed expressions are not supported; string-based path parts
     *   *must* be separated by dots.  Note that when dereferencing array
     *   indices, the index may be used as a dotted part directly
     *   (e.g. `users.12.name` or `['users', 12, 'name']`).
     * @param {Object=} root Root object from which the path is evaluated.
     * @return {*} Value at the path, or `undefined` if any part of the path
     *   is undefined.
     * @public
     */
    get(path, root) {
      return get(root || this, path);
    }

    /**
     * Convenience method for setting a value to a path and notifying any
     * elements bound to the same path.
     *
     * Note, if any part in the path except for the last is undefined,
     * this method does nothing (this method does not throw when
     * dereferencing undefined paths).
     *
     * @override
     * @param {(string|!Array<(string|number)>)} path Path to the value
     *   to write.  The path may be specified as a string (e.g. `'foo.bar.baz'`)
     *   or an array of path parts (e.g. `['foo.bar', 'baz']`).  Note that
     *   bracketed expressions are not supported; string-based path parts
     *   *must* be separated by dots.  Note that when dereferencing array
     *   indices, the index may be used as a dotted part directly
     *   (e.g. `'users.12.name'` or `['users', 12, 'name']`).
     * @param {*} value Value to set at the specified path.
     * @param {Object=} root Root object from which the path is evaluated.
     *   When specified, no notification will occur.
     * @return {void}
     * @public
     */
    set(path, value, root) {
      if (root) {
        set(root, path, value);
      } else {
        if (!this[TYPES.READ_ONLY] || !this[TYPES.READ_ONLY][/** @type {string} */(path)]) {
          if (this._setPendingPropertyOrPath(path, value, true)) {
            this._invalidateProperties();
          }
        }
      }
    }

    /**
     * Adds items onto the end of the array at the path specified.
     *
     * The arguments after `path` and return value match that of
     * `Array.prototype.push`.
     *
     * This method notifies other paths to the same array that a
     * splice occurred to the array.
     *
     * @override
     * @param {string | !Array<string|number>} path Path to array.
     * @param {...*} items Items to push onto array
     * @return {number} New length of the array.
     * @public
     */
    push(path, ...items) {
      let info = {path: ''};
      let array = /** @type {Array}*/(get(this, path, info));
      let len = array.length;
      let ret = array.push(...items);
      if (items.length) {
        notifySplice(this, array, info.path, len, items.length, []);
      }
      return ret;
    }

    /**
     * Removes an item from the end of array at the path specified.
     *
     * The arguments after `path` and return value match that of
     * `Array.prototype.pop`.
     *
     * This method notifies other paths to the same array that a
     * splice occurred to the array.
     *
     * @override
     * @param {string | !Array<string|number>} path Path to array.
     * @return {*} Item that was removed.
     * @public
     */
    pop(path) {
      let info = {path: ''};
      let array = /** @type {Array} */(get(this, path, info));
      let hadLength = Boolean(array.length);
      let ret = array.pop();
      if (hadLength) {
        notifySplice(this, array, info.path, array.length, 0, [ret]);
      }
      return ret;
    }

    /**
     * Starting from the start index specified, removes 0 or more items
     * from the array and inserts 0 or more new items in their place.
     *
     * The arguments after `path` and return value match that of
     * `Array.prototype.splice`.
     *
     * This method notifies other paths to the same array that a
     * splice occurred to the array.
     *
     * @override
     * @param {string | !Array<string|number>} path Path to array.
     * @param {number} start Index from which to start removing/inserting.
     * @param {number=} deleteCount Number of items to remove.
     * @param {...*} items Items to insert into array.
     * @return {!Array} Array of removed items.
     * @public
     */
    splice(path, start, deleteCount, ...items) {
      let info = {path : ''};
      let array = /** @type {Array} */(get(this, path, info));
      // Normalize fancy native splice handling of crazy start values
      if (start < 0) {
        start = array.length - Math.floor(-start);
      } else if (start) {
        start = Math.floor(start);
      }
      // array.splice does different things based on the number of arguments
      // you pass in. Therefore, array.splice(0) and array.splice(0, undefined)
      // do different things. In the former, the whole array is cleared. In the
      // latter, no items are removed.
      // This means that we need to detect whether 1. one of the arguments
      // is actually passed in and then 2. determine how many arguments
      // we should pass on to the native array.splice
      //
      let ret;
      // Omit any additional arguments if they were not passed in
      if (arguments.length === 2) {
        ret = array.splice(start);
      // Either start was undefined and the others were defined, but in this
      // case we can safely pass on all arguments
      //
      // Note: this includes the case where none of the arguments were passed in,
      // e.g. this.splice('array'). However, if both start and deleteCount
      // are undefined, array.splice will not modify the array (as expected)
      } else {
        ret = array.splice(start, deleteCount, ...items);
      }
      // At the end, check whether any items were passed in (e.g. insertions)
      // or if the return array contains items (e.g. deletions).
      // Only notify if items were added or deleted.
      if (items.length || ret.length) {
        notifySplice(this, array, info.path, start, items.length, ret);
      }
      return ret;
    }

    /**
     * Removes an item from the beginning of array at the path specified.
     *
     * The arguments after `path` and return value match that of
     * `Array.prototype.pop`.
     *
     * This method notifies other paths to the same array that a
     * splice occurred to the array.
     *
     * @override
     * @param {string | !Array<string|number>} path Path to array.
     * @return {*} Item that was removed.
     * @public
     */
    shift(path) {
      let info = {path: ''};
      let array = /** @type {Array} */(get(this, path, info));
      let hadLength = Boolean(array.length);
      let ret = array.shift();
      if (hadLength) {
        notifySplice(this, array, info.path, 0, 0, [ret]);
      }
      return ret;
    }

    /**
     * Adds items onto the beginning of the array at the path specified.
     *
     * The arguments after `path` and return value match that of
     * `Array.prototype.push`.
     *
     * This method notifies other paths to the same array that a
     * splice occurred to the array.
     *
     * @override
     * @param {string | !Array<string|number>} path Path to array.
     * @param {...*} items Items to insert info array
     * @return {number} New length of the array.
     * @public
     */
    unshift(path, ...items) {
      let info = {path: ''};
      let array = /** @type {Array} */(get(this, path, info));
      let ret = array.unshift(...items);
      if (items.length) {
        notifySplice(this, array, info.path, 0, items.length, []);
      }
      return ret;
    }

    /**
     * Notify that a path has changed.
     *
     * Example:
     *
     *     this.item.user.name = 'Bob';
     *     this.notifyPath('item.user.name');
     *
     * @override
     * @param {string} path Path that should be notified.
     * @param {*=} value Value at the path (optional).
     * @return {void}
     * @public
     */
    notifyPath(path, value) {
      /** @type {string} */
      let propPath;
      if (arguments.length == 1) {
        // Get value if not supplied
        let info = {path: ''};
        value = get(this, path, info);
        propPath = info.path;
      } else if (Array.isArray(path)) {
        // Normalize path if needed
        propPath = normalize(path);
      } else {
        propPath = /** @type{string} */(path);
      }
      if (this._setPendingPropertyOrPath(propPath, value, true, true)) {
        this._invalidateProperties();
      }
    }

    /**
     * Equivalent to static `createReadOnlyProperty` API but can be called on
     * an instance to add effects at runtime.  See that method for
     * full API docs.
     *
     * @override
     * @param {string} property Property name
     * @param {boolean=} protectedSetter Creates a custom protected setter
     *   when `true`.
     * @return {void}
     * @protected
     */
    _createReadOnlyProperty(property, protectedSetter) {
      this._addPropertyEffect(property, TYPES.READ_ONLY);
      if (protectedSetter) {
        this['_set' + upper(property)] = /** @this {PropertyEffects} */function(value) {
          this._setProperty(property, value);
        };
      }
    }

    /**
     * Equivalent to static `createPropertyObserver` API but can be called on
     * an instance to add effects at runtime.  See that method for
     * full API docs.
     *
     * @override
     * @param {string} property Property name
     * @param {string|function(*,*)} method Function or name of observer method
     *     to call
     * @param {boolean=} dynamicFn Whether the method name should be included as
     *   a dependency to the effect.
     * @return {void}
     * @protected
     */
    _createPropertyObserver(property, method, dynamicFn) {
      let info = { property, method, dynamicFn: Boolean(dynamicFn) };
      this._addPropertyEffect(property, TYPES.OBSERVE, {
        fn: runObserverEffect, info, trigger: {name: property}
      });
      if (dynamicFn) {
        this._addPropertyEffect(/** @type {string} */(method), TYPES.OBSERVE, {
          fn: runObserverEffect, info, trigger: {name: method}
        });
      }
    }

    /**
     * Equivalent to static `createMethodObserver` API but can be called on
     * an instance to add effects at runtime.  See that method for
     * full API docs.
     *
     * @override
     * @param {string} expression Method expression
     * @param {boolean|Object=} dynamicFn Boolean or object map indicating
     *   whether method names should be included as a dependency to the effect.
     * @return {void}
     * @protected
     */
    _createMethodObserver(expression, dynamicFn) {
      let sig = parseMethod(expression);
      if (!sig) {
        throw new Error("Malformed observer expression '" + expression + "'");
      }
      createMethodEffect(this, sig, TYPES.OBSERVE, runMethodEffect, null, dynamicFn);
    }

    /**
     * Equivalent to static `createNotifyingProperty` API but can be called on
     * an instance to add effects at runtime.  See that method for
     * full API docs.
     *
     * @override
     * @param {string} property Property name
     * @return {void}
     * @protected
     */
    _createNotifyingProperty(property) {
      this._addPropertyEffect(property, TYPES.NOTIFY, {
        fn: runNotifyEffect,
        info: {
          eventName: camelToDashCase(property) + '-changed',
          property: property
        }
      });
    }

    /**
     * Equivalent to static `createReflectedProperty` API but can be called on
     * an instance to add effects at runtime.  See that method for
     * full API docs.
     *
     * @override
     * @param {string} property Property name
     * @return {void}
     * @protected
     * @suppress {missingProperties} go/missingfnprops
     */
    _createReflectedProperty(property) {
      let attr = this.constructor.attributeNameForProperty(property);
      if (attr[0] === '-') {
        console.warn('Property ' + property + ' cannot be reflected to attribute ' +
          attr + ' because "-" is not a valid starting attribute name. Use a lowercase first letter for the property instead.');
      } else {
        this._addPropertyEffect(property, TYPES.REFLECT, {
          fn: runReflectEffect,
          info: {
            attrName: attr
          }
        });
      }
    }

    /**
     * Equivalent to static `createComputedProperty` API but can be called on
     * an instance to add effects at runtime.  See that method for
     * full API docs.
     *
     * @override
     * @param {string} property Name of computed property to set
     * @param {string} expression Method expression
     * @param {boolean|Object=} dynamicFn Boolean or object map indicating
     *   whether method names should be included as a dependency to the effect.
     * @return {void}
     * @protected
     */
    _createComputedProperty(property, expression, dynamicFn) {
      let sig = parseMethod(expression);
      if (!sig) {
        throw new Error("Malformed computed expression '" + expression + "'");
      }
      const info = createMethodEffect(this, sig, TYPES.COMPUTE, runComputedEffect, property, dynamicFn);
      // Effects are normally stored as map of dependency->effect, but for
      // ordered computation, we also need tree of computedProp->dependencies
      ensureOwnEffectMap(this, COMPUTE_INFO)[property] = info;
    }

    /**
     * Gather the argument values for a method specified in the provided array
     * of argument metadata.
     *
     * The `path` and `value` arguments are used to fill in wildcard descriptor
     * when the method is being called as a result of a path notification.
     *
     * @param {!Array<!MethodArg>} args Array of argument metadata
     * @param {string} path Property/path name that triggered the method effect
     * @param {Object} props Bag of current property changes
     * @return {!Array<*>} Array of argument values
     * @private
     */
    _marshalArgs(args, path, props) {
      const data = this.__data;
      const values = [];
      for (let i=0, l=args.length; i<l; i++) {
        let {name, structured, wildcard, value, literal} = args[i];
        if (!literal) {
          if (wildcard) {
            const matches = isDescendant(name, path);
            const pathValue = getArgValue(data, props, matches ? path : name);
            value = {
              path: matches ? path : name,
              value: pathValue,
              base: matches ? get(data, name) : pathValue
            };
          } else {
            value = structured ? getArgValue(data, props, name) : data[name];
          }
        }
        // When the `legacyUndefined` flag is enabled, pass a no-op value
        // so that the observer, computed property, or compound binding is aborted.
        if (legacyUndefined && !this._overrideLegacyUndefined && value === undefined && args.length > 1) {
          return NOOP;
        }
        values[i] = value;
      }
      return values;
    }

    // -- static class methods ------------

    /**
     * Ensures an accessor exists for the specified property, and adds
     * to a list of "property effects" that will run when the accessor for
     * the specified property is set.  Effects are grouped by "type", which
     * roughly corresponds to a phase in effect processing.  The effect
     * metadata should be in the following form:
     *
     *     {
     *       fn: effectFunction, // Reference to function to call to perform effect
     *       info: { ... }       // Effect metadata passed to function
     *       trigger: {          // Optional triggering metadata; if not provided
     *         name: string      // the property is treated as a wildcard
     *         structured: boolean
     *         wildcard: boolean
     *       }
     *     }
     *
     * Effects are called from `_propertiesChanged` in the following order by
     * type:
     *
     * 1. COMPUTE
     * 2. PROPAGATE
     * 3. REFLECT
     * 4. OBSERVE
     * 5. NOTIFY
     *
     * Effect functions are called with the following signature:
     *
     *     effectFunction(inst, path, props, oldProps, info, hasPaths)
     *
     * @param {string} property Property that should trigger the effect
     * @param {string} type Effect type, from this.PROPERTY_EFFECT_TYPES
     * @param {Object=} effect Effect metadata object
     * @return {void}
     * @protected
     * @nocollapse
     */
    static addPropertyEffect(property, type, effect) {
      this.prototype._addPropertyEffect(property, type, effect);
    }

    /**
     * Creates a single-property observer for the given property.
     *
     * @param {string} property Property name
     * @param {string|function(*,*)} method Function or name of observer method to call
     * @param {boolean=} dynamicFn Whether the method name should be included as
     *   a dependency to the effect.
     * @return {void}
     * @protected
     * @nocollapse
     */
    static createPropertyObserver(property, method, dynamicFn) {
      this.prototype._createPropertyObserver(property, method, dynamicFn);
    }

    /**
     * Creates a multi-property "method observer" based on the provided
     * expression, which should be a string in the form of a normal JavaScript
     * function signature: `'methodName(arg1, [..., argn])'`.  Each argument
     * should correspond to a property or path in the context of this
     * prototype (or instance), or may be a literal string or number.
     *
     * @param {string} expression Method expression
     * @param {boolean|Object=} dynamicFn Boolean or object map indicating
     * @return {void}
     *   whether method names should be included as a dependency to the effect.
     * @protected
     * @nocollapse
     */
    static createMethodObserver(expression, dynamicFn) {
      this.prototype._createMethodObserver(expression, dynamicFn);
    }

    /**
     * Causes the setter for the given property to dispatch `<property>-changed`
     * events to notify of changes to the property.
     *
     * @param {string} property Property name
     * @return {void}
     * @protected
     * @nocollapse
     */
    static createNotifyingProperty(property) {
      this.prototype._createNotifyingProperty(property);
    }

    /**
     * Creates a read-only accessor for the given property.
     *
     * To set the property, use the protected `_setProperty` API.
     * To create a custom protected setter (e.g. `_setMyProp()` for
     * property `myProp`), pass `true` for `protectedSetter`.
     *
     * Note, if the property will have other property effects, this method
     * should be called first, before adding other effects.
     *
     * @param {string} property Property name
     * @param {boolean=} protectedSetter Creates a custom protected setter
     *   when `true`.
     * @return {void}
     * @protected
     * @nocollapse
     */
    static createReadOnlyProperty(property, protectedSetter) {
      this.prototype._createReadOnlyProperty(property, protectedSetter);
    }

    /**
     * Causes the setter for the given property to reflect the property value
     * to a (dash-cased) attribute of the same name.
     *
     * @param {string} property Property name
     * @return {void}
     * @protected
     * @nocollapse
     */
    static createReflectedProperty(property) {
      this.prototype._createReflectedProperty(property);
    }

    /**
     * Creates a computed property whose value is set to the result of the
     * method described by the given `expression` each time one or more
     * arguments to the method changes.  The expression should be a string
     * in the form of a normal JavaScript function signature:
     * `'methodName(arg1, [..., argn])'`
     *
     * @param {string} property Name of computed property to set
     * @param {string} expression Method expression
     * @param {boolean|Object=} dynamicFn Boolean or object map indicating whether
     *   method names should be included as a dependency to the effect.
     * @return {void}
     * @protected
     * @nocollapse
     */
    static createComputedProperty(property, expression, dynamicFn) {
      this.prototype._createComputedProperty(property, expression, dynamicFn);
    }

    /**
     * Parses the provided template to ensure binding effects are created
     * for them, and then ensures property accessors are created for any
     * dependent properties in the template.  Binding effects for bound
     * templates are stored in a linked list on the instance so that
     * templates can be efficiently stamped and unstamped.
     *
     * @param {!HTMLTemplateElement} template Template containing binding
     *   bindings
     * @return {!TemplateInfo} Template metadata object
     * @protected
     * @nocollapse
     */
    static bindTemplate(template) {
      return this.prototype._bindTemplate(template);
    }

    // -- binding ----------------------------------------------

    /*
     * Overview of binding flow:
     *
     * During finalization (`instanceBinding==false`, `wasPreBound==false`):
     *  `_bindTemplate(t, false)` called directly during finalization - parses
     *  the template (for the first time), and then assigns that _prototypical_
     *  template info to `__preboundTemplateInfo` _on the prototype_; note in
     *  this case `wasPreBound` is false; this is the first time we're binding
     *  it, thus we create accessors.
     *
     * During first stamping (`instanceBinding==true`, `wasPreBound==true`):
     *   `_stampTemplate` calls `_bindTemplate(t, true)`: the `templateInfo`
     *   returned matches the prebound one, and so this is `wasPreBound == true`
     *   state; thus we _skip_ creating accessors, but _do_ create an instance
     *   of the template info to serve as the start of our linked list (needs to
     *   be an instance, not the prototypical one, so that we can add `nodeList`
     *   to it to contain the `nodeInfo`-ordered list of instance nodes for
     *   bindings, and so we can chain runtime-stamped template infos off of
     *   it). At this point, the call to `_stampTemplate` calls
     *   `applyTemplateInfo` for each nested `<template>` found during parsing
     *   to hand prototypical `_templateInfo` to them; we also pass the _parent_
     *   `templateInfo` to the `<template>` so that we have the instance-time
     *   parent to link the `templateInfo` under in the case it was
     *   runtime-stamped.
     *
     * During subsequent runtime stamping (`instanceBinding==true`,
     *   `wasPreBound==false`): `_stampTemplate` calls `_bindTemplate(t, true)`
     *   - here `templateInfo` is guaranteed to _not_ match the prebound one,
     *   because it was either a different template altogether, or even if it
     *   was the same template, the step above created a instance of the info;
     *   in this case `wasPreBound == false`, so we _do_ create accessors, _and_
     *   link a instance into the linked list.
     */

    /**
     * Equivalent to static `bindTemplate` API but can be called on an instance
     * to add effects at runtime.  See that method for full API docs.
     *
     * This method may be called on the prototype (for prototypical template
     * binding, to avoid creating accessors every instance) once per prototype,
     * and will be called with `runtimeBinding: true` by `_stampTemplate` to
     * create and link an instance of the template metadata associated with a
     * particular stamping.
     *
     * @override
     * @param {!HTMLTemplateElement} template Template containing binding
     * bindings
     * @param {boolean=} instanceBinding When false (default), performs
     * "prototypical" binding of the template and overwrites any previously
     * bound template for the class. When true (as passed from
     * `_stampTemplate`), the template info is instanced and linked into the
     * list of bound templates.
     * @return {!TemplateInfo} Template metadata object; for `runtimeBinding`,
     * this is an instance of the prototypical template info
     * @protected
     * @suppress {missingProperties} go/missingfnprops
     */
    _bindTemplate(template, instanceBinding) {
      let templateInfo = this.constructor._parseTemplate(template);
      let wasPreBound = this.__preBoundTemplateInfo == templateInfo;
      // Optimization: since this is called twice for proto-bound templates,
      // don't attempt to recreate accessors if this template was pre-bound
      if (!wasPreBound) {
        for (let prop in templateInfo.propertyEffects) {
          this._createPropertyAccessor(prop);
        }
      }
      if (instanceBinding) {
        // For instance-time binding, create instance of template metadata
        // and link into tree of templates if necessary
        templateInfo = /** @type {!TemplateInfo} */(Object.create(templateInfo));
        templateInfo.wasPreBound = wasPreBound;
        if (!this.__templateInfo) {
          // Set the info to the root of the tree
          this.__templateInfo = templateInfo;
        } else {
          // Append this template info onto the end of its parent template's
          // list, which will determine the tree structure via which property
          // effects are run; if this template was not nested in another
          // template, use the root template (the first stamped one) as the
          // parent. Note, `parent` is the `templateInfo` instance for this
          // template's parent (containing) template, which was set up in
          // `applyTemplateInfo`.  While a given template's `parent` is set
          // apriori, it is only added to the parent's child list at the point
          // that it is being bound, since a template may or may not ever be
          // stamped, and may be stamped more than once (in which case instances
          // of the template info will be in the tree under its parent more than
          // once).
          const parent = template._parentTemplateInfo || this.__templateInfo;
          const previous = parent.lastChild;
          templateInfo.parent = parent;
          parent.lastChild = templateInfo;
          templateInfo.previousSibling = previous;
          if (previous) {
            previous.nextSibling = templateInfo;
          } else {
            parent.firstChild = templateInfo;
          }
        }
      } else {
        this.__preBoundTemplateInfo = templateInfo;
      }
      return templateInfo;
    }

    /**
     * Adds a property effect to the given template metadata, which is run
     * at the "propagate" stage of `_propertiesChanged` when the template
     * has been bound to the element via `_bindTemplate`.
     *
     * The `effect` object should match the format in `_addPropertyEffect`.
     *
     * @param {Object} templateInfo Template metadata to add effect to
     * @param {string} prop Property that should trigger the effect
     * @param {Object=} effect Effect metadata object
     * @return {void}
     * @protected
     * @nocollapse
     */
    static _addTemplatePropertyEffect(templateInfo, prop, effect) {
      let hostProps = templateInfo.hostProps = templateInfo.hostProps || {};
      hostProps[prop] = true;
      let effects = templateInfo.propertyEffects = templateInfo.propertyEffects || {};
      let propEffects = effects[prop] = effects[prop] || [];
      propEffects.push(effect);
    }

    /**
     * Stamps the provided template and performs instance-time setup for
     * Polymer template features, including data bindings, declarative event
     * listeners, and the `this.$` map of `id`'s to nodes.  A document fragment
     * is returned containing the stamped DOM, ready for insertion into the
     * DOM.
     *
     * This method may be called more than once; however note that due to
     * `shadycss` polyfill limitations, only styles from templates prepared
     * using `ShadyCSS.prepareTemplate` will be correctly polyfilled (scoped
     * to the shadow root and support CSS custom properties), and note that
     * `ShadyCSS.prepareTemplate` may only be called once per element. As such,
     * any styles required by in runtime-stamped templates must be included
     * in the main element template.
     *
     * @param {!HTMLTemplateElement} template Template to stamp
     * @param {TemplateInfo=} templateInfo Optional bound template info associated
     *   with the template to be stamped; if omitted the template will be
     *   automatically bound.
     * @return {!StampedTemplate} Cloned template content
     * @override
     * @protected
     */
    _stampTemplate(template, templateInfo) {
      templateInfo =  templateInfo || /** @type {!TemplateInfo} */(this._bindTemplate(template, true));
      // Ensures that created dom is `_enqueueClient`'d to this element so
      // that it can be flushed on next call to `_flushProperties`
      hostStack.push(this);
      let dom = super._stampTemplate(template, templateInfo);
      hostStack.pop();
      // Add template-instance-specific data to instanced templateInfo
      templateInfo.nodeList = dom.nodeList;
      // Capture child nodes to allow unstamping of non-prototypical templates
      if (!templateInfo.wasPreBound) {
        let nodes = templateInfo.childNodes = [];
        for (let n=dom.firstChild; n; n=n.nextSibling) {
          nodes.push(n);
        }
      }
      dom.templateInfo = templateInfo;
      // Setup compound storage, 2-way listeners, and dataHost for bindings
      setupBindings(this, templateInfo);
      // Flush properties into template nodes; the check on `__dataClientsReady`
      // ensures we don't needlessly run effects for an element's initial
      // prototypical template stamping since they will happen as a part of the
      // first call to `_propertiesChanged`. This flag is set to true
      // after running the initial propagate effects, and immediately before
      // flushing clients. Since downstream clients could cause stamping on
      // this host (e.g. a fastDomIf `dom-if` being forced to render
      // synchronously), this flag ensures effects for runtime-stamped templates
      // are run at this point during the initial element boot-up.
      if (this.__dataClientsReady) {
        this._runEffectsForTemplate(templateInfo, this.__data, null, false);
        this._flushClients();
      }
      return dom;
    }

    /**
     * Removes and unbinds the nodes previously contained in the provided
     * DocumentFragment returned from `_stampTemplate`.
     *
     * @override
     * @param {!StampedTemplate} dom DocumentFragment previously returned
     *   from `_stampTemplate` associated with the nodes to be removed
     * @return {void}
     * @protected
     */
    _removeBoundDom(dom) {
      // Unlink template info; Note that while the child is unlinked from its
      // parent list, a template's `parent` reference is never removed, since
      // this is is determined by the tree structure and applied at
      // `applyTemplateInfo` time.
      const templateInfo = dom.templateInfo;
      const {previousSibling, nextSibling, parent} = templateInfo;
      if (previousSibling) {
        previousSibling.nextSibling = nextSibling;
      } else if (parent) {
        parent.firstChild = nextSibling;
      }
      if (nextSibling) {
        nextSibling.previousSibling = previousSibling;
      } else if (parent) {
        parent.lastChild = previousSibling;
      }
      templateInfo.nextSibling = templateInfo.previousSibling = null;
      // Remove stamped nodes
      let nodes = templateInfo.childNodes;
      for (let i=0; i<nodes.length; i++) {
        let node = nodes[i];
        wrap(wrap(node).parentNode).removeChild(node);
      }
    }

    /**
     * Overrides default `TemplateStamp` implementation to add support for
     * parsing bindings from `TextNode`'s' `textContent`.  A `bindings`
     * array is added to `nodeInfo` and populated with binding metadata
     * with information capturing the binding target, and a `parts` array
     * with one or more metadata objects capturing the source(s) of the
     * binding.
     *
     * @param {Node} node Node to parse
     * @param {TemplateInfo} templateInfo Template metadata for current template
     * @param {NodeInfo} nodeInfo Node metadata for current template node
     * @return {boolean} `true` if the visited node added node-specific
     *   metadata to `nodeInfo`
     * @protected
     * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
     * @nocollapse
     */
    static _parseTemplateNode(node, templateInfo, nodeInfo) {
      // TODO(https://github.com/google/closure-compiler/issues/3240):
      //     Change back to just super.methodCall()
      let noted = propertyEffectsBase._parseTemplateNode.call(
        this, node, templateInfo, nodeInfo);
      if (node.nodeType === Node.TEXT_NODE) {
        let parts = this._parseBindings(node.textContent, templateInfo);
        if (parts) {
          // Initialize the textContent with any literal parts
          // NOTE: default to a space here so the textNode remains; some browsers
          // (IE) omit an empty textNode following cloneNode/importNode.
          node.textContent = literalFromParts(parts) || ' ';
          addBinding(this, templateInfo, nodeInfo, 'text', 'textContent', parts);
          noted = true;
        }
      }
      return noted;
    }

    /**
     * Overrides default `TemplateStamp` implementation to add support for
     * parsing bindings from attributes.  A `bindings`
     * array is added to `nodeInfo` and populated with binding metadata
     * with information capturing the binding target, and a `parts` array
     * with one or more metadata objects capturing the source(s) of the
     * binding.
     *
     * @param {Element} node Node to parse
     * @param {TemplateInfo} templateInfo Template metadata for current template
     * @param {NodeInfo} nodeInfo Node metadata for current template node
     * @param {string} name Attribute name
     * @param {string} value Attribute value
     * @return {boolean} `true` if the visited node added node-specific
     *   metadata to `nodeInfo`
     * @protected
     * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
     * @nocollapse
     */
    static _parseTemplateNodeAttribute(node, templateInfo, nodeInfo, name, value) {
      let parts = this._parseBindings(value, templateInfo);
      if (parts) {
        // Attribute or property
        let origName = name;
        let kind = 'property';
        // The only way we see a capital letter here is if the attr has
        // a capital letter in it per spec. In this case, to make sure
        // this binding works, we go ahead and make the binding to the attribute.
        if (capitalAttributeRegex.test(name)) {
          kind = 'attribute';
        } else if (name[name.length-1] == '$') {
          name = name.slice(0, -1);
          kind = 'attribute';
        }
        // Initialize attribute bindings with any literal parts
        let literal = literalFromParts(parts);
        if (literal && kind == 'attribute') {
          // Ensure a ShadyCSS template scoped style is not removed
          // when a class$ binding's initial literal value is set.
          if (name == 'class' && node.hasAttribute('class')) {
            literal += ' ' + node.getAttribute(name);
          }
          node.setAttribute(name, literal);
        }
        // support disable-upgrade
        if (kind == 'attribute' && origName == 'disable-upgrade$') {
          node.setAttribute(name, '');
        }
        // Clear attribute before removing, since IE won't allow removing
        // `value` attribute if it previously had a value (can't
        // unconditionally set '' before removing since attributes with `$`
        // can't be set using setAttribute)
        if (node.localName === 'input' && origName === 'value') {
          node.setAttribute(origName, '');
        }
        // Remove annotation
        node.removeAttribute(origName);
        // Case hackery: attributes are lower-case, but bind targets
        // (properties) are case sensitive. Gambit is to map dash-case to
        // camel-case: `foo-bar` becomes `fooBar`.
        // Attribute bindings are excepted.
        if (kind === 'property') {
          name = dashToCamelCase(name);
        }
        addBinding(this, templateInfo, nodeInfo, kind, name, parts, literal);
        return true;
      } else {
        // TODO(https://github.com/google/closure-compiler/issues/3240):
        //     Change back to just super.methodCall()
        return propertyEffectsBase._parseTemplateNodeAttribute.call(
          this, node, templateInfo, nodeInfo, name, value);
      }
    }

    /**
     * Overrides default `TemplateStamp` implementation to add support for
     * binding the properties that a nested template depends on to the template
     * as `_host_<property>`.
     *
     * @param {Node} node Node to parse
     * @param {TemplateInfo} templateInfo Template metadata for current template
     * @param {NodeInfo} nodeInfo Node metadata for current template node
     * @return {boolean} `true` if the visited node added node-specific
     *   metadata to `nodeInfo`
     * @protected
     * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
     * @nocollapse
     */
    static _parseTemplateNestedTemplate(node, templateInfo, nodeInfo) {
      // TODO(https://github.com/google/closure-compiler/issues/3240):
      //     Change back to just super.methodCall()
      let noted = propertyEffectsBase._parseTemplateNestedTemplate.call(
        this, node, templateInfo, nodeInfo);
      const parent = node.parentNode;
      const nestedTemplateInfo = nodeInfo.templateInfo;
      const isDomIf = parent.localName === 'dom-if';
      const isDomRepeat = parent.localName === 'dom-repeat';
      // Remove nested template and redirect its host bindings & templateInfo
      // onto the parent (dom-if/repeat element)'s nodeInfo
      if (removeNestedTemplates && (isDomIf || isDomRepeat)) {
        parent.removeChild(node);
        // Use the parent's nodeInfo (for the dom-if/repeat) to record the
        // templateInfo, and use that for any host property bindings below
        nodeInfo = nodeInfo.parentInfo;
        nodeInfo.templateInfo = nestedTemplateInfo;
        // Ensure the parent dom-if/repeat is noted since it now may have host
        // bindings; it may not have been if it did not have its own bindings
        nodeInfo.noted = true;
        noted = false;
      }
      // Merge host props into outer template and add bindings
      let hostProps = nestedTemplateInfo.hostProps;
      if (fastDomIf && isDomIf) {
        // `fastDomIf` mode uses runtime-template stamping to add accessors/
        // effects to properties used in its template; as such we don't need to
        // tax the host element with `_host_` bindings for the `dom-if`.
        // However, in the event it is nested in a `dom-repeat`, it is still
        // important that its host properties are added to the
        // TemplateInstance's `hostProps` so that they are forwarded to the
        // TemplateInstance.
        if (hostProps) {
          templateInfo.hostProps =
            Object.assign(templateInfo.hostProps || {}, hostProps);
          // Ensure the dom-if is noted so that it has a __dataHost, since
          // `fastDomIf` uses the host for runtime template stamping; note this
          // was already ensured above in the `removeNestedTemplates` case
          if (!removeNestedTemplates) {
            nodeInfo.parentInfo.noted = true;
          }
        }
      } else {
        let mode = '{';
        for (let source in hostProps) {
          let parts = [{ mode, source, dependencies: [source], hostProp: true }];
          addBinding(this, templateInfo, nodeInfo, 'property', '_host_' + source, parts);
        }
      }
      return noted;
    }

    /**
     * Called to parse text in a template (either attribute values or
     * textContent) into binding metadata.
     *
     * Any overrides of this method should return an array of binding part
     * metadata  representing one or more bindings found in the provided text
     * and any "literal" text in between.  Any non-literal parts will be passed
     * to `_evaluateBinding` when any dependencies change.  The only required
     * fields of each "part" in the returned array are as follows:
     *
     * - `dependencies` - Array containing trigger metadata for each property
     *   that should trigger the binding to update
     * - `literal` - String containing text if the part represents a literal;
     *   in this case no `dependencies` are needed
     *
     * Additional metadata for use by `_evaluateBinding` may be provided in
     * each part object as needed.
     *
     * The default implementation handles the following types of bindings
     * (one or more may be intermixed with literal strings):
     * - Property binding: `[[prop]]`
     * - Path binding: `[[object.prop]]`
     * - Negated property or path bindings: `[[!prop]]` or `[[!object.prop]]`
     * - Two-way property or path bindings (supports negation):
     *   `{{prop}}`, `{{object.prop}}`, `{{!prop}}` or `{{!object.prop}}`
     * - Inline computed method (supports negation):
     *   `[[compute(a, 'literal', b)]]`, `[[!compute(a, 'literal', b)]]`
     *
     * The default implementation uses a regular expression for best
     * performance. However, the regular expression uses a white-list of
     * allowed characters in a data-binding, which causes problems for
     * data-bindings that do use characters not in this white-list.
     *
     * Instead of updating the white-list with all allowed characters,
     * there is a StrictBindingParser (see lib/mixins/strict-binding-parser)
     * that uses a state machine instead. This state machine is able to handle
     * all characters. However, it is slightly less performant, therefore we
     * extracted it into a separate optional mixin.
     *
     * @param {string} text Text to parse from attribute or textContent
     * @param {Object} templateInfo Current template metadata
     * @return {Array<!BindingPart>} Array of binding part metadata
     * @protected
     * @nocollapse
     */
    static _parseBindings(text, templateInfo) {
      let parts = [];
      let lastIndex = 0;
      let m;
      // Example: "literal1{{prop}}literal2[[!compute(foo,bar)]]final"
      // Regex matches:
      //        Iteration 1:  Iteration 2:
      // m[1]: '{{'          '[['
      // m[2]: ''            '!'
      // m[3]: 'prop'        'compute(foo,bar)'
      while ((m = bindingRegex.exec(text)) !== null) {
        // Add literal part
        if (m.index > lastIndex) {
          parts.push({literal: text.slice(lastIndex, m.index)});
        }
        // Add binding part
        let mode = m[1][0];
        let negate = Boolean(m[2]);
        let source = m[3].trim();
        let customEvent = false, notifyEvent = '', colon = -1;
        if (mode == '{' && (colon = source.indexOf('::')) > 0) {
          notifyEvent = source.substring(colon + 2);
          source = source.substring(0, colon);
          customEvent = true;
        }
        let signature = parseMethod(source);
        let dependencies = [];
        if (signature) {
          // Inline computed function
          let {args, methodName} = signature;
          for (let i=0; i<args.length; i++) {
            let arg = args[i];
            if (!arg.literal) {
              dependencies.push(arg);
            }
          }
          let dynamicFns = templateInfo.dynamicFns;
          if (dynamicFns && dynamicFns[methodName] || signature.static) {
            dependencies.push(methodName);
            signature.dynamicFn = true;
          }
        } else {
          // Property or path
          dependencies.push(source);
        }
        parts.push({
          source, mode, negate, customEvent, signature, dependencies,
          event: notifyEvent
        });
        lastIndex = bindingRegex.lastIndex;
      }
      // Add a final literal part
      if (lastIndex && lastIndex < text.length) {
        let literal = text.substring(lastIndex);
        if (literal) {
          parts.push({
            literal: literal
          });
        }
      }
      if (parts.length) {
        return parts;
      } else {
        return null;
      }
    }

    /**
     * Called to evaluate a previously parsed binding part based on a set of
     * one or more changed dependencies.
     *
     * @param {!Polymer_PropertyEffects} inst Element that should be used as
     *     scope for binding dependencies
     * @param {BindingPart} part Binding part metadata
     * @param {string} path Property/path that triggered this effect
     * @param {Object} props Bag of current property changes
     * @param {Object} oldProps Bag of previous values for changed properties
     * @param {boolean} hasPaths True with `props` contains one or more paths
     * @return {*} Value the binding part evaluated to
     * @protected
     * @nocollapse
     */
    static _evaluateBinding(inst, part, path, props, oldProps, hasPaths) {
      let value;
      if (part.signature) {
        value = runMethodEffect(inst, path, props, oldProps, part.signature);
      } else if (path != part.source) {
        value = get(inst, part.source);
      } else {
        if (hasPaths && isPath(path)) {
          value = get(inst, path);
        } else {
          value = inst.__data[path];
        }
      }
      if (part.negate) {
        value = !value;
      }
      return value;
    }

  }

  return PropertyEffects;
});

/**
 * Stack for enqueuing client dom created by a host element.
 *
 * By default elements are flushed via `_flushProperties` when
 * `connectedCallback` is called. Elements attach their client dom to
 * themselves at `ready` time which results from this first flush.
 * This provides an ordering guarantee that the client dom an element
 * creates is flushed before the element itself (i.e. client `ready`
 * fires before host `ready`).
 *
 * However, if `_flushProperties` is called *before* an element is connected,
 * as for example `Templatize` does, this ordering guarantee cannot be
 * satisfied because no elements are connected. (Note: Bound elements that
 * receive data do become enqueued clients and are properly ordered but
 * unbound elements are not.)
 *
 * To maintain the desired "client before host" ordering guarantee for this
 * case we rely on the "host stack. Client nodes registers themselves with
 * the creating host element when created. This ensures that all client dom
 * is readied in the proper order, maintaining the desired guarantee.
 *
 * @private
 */
const hostStack = [];

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Registers a class prototype for telemetry purposes.
 * @param {!PolymerElementConstructor} prototype Element prototype to register
 * @protected
 */
function register(prototype) {
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Creates a copy of `props` with each property normalized such that
 * upgraded it is an object with at least a type property { type: Type}.
 *
 * @param {!Object} props Properties to normalize
 * @return {!Object} Copy of input `props` with normalized properties that
 * are in the form {type: Type}
 * @private
 */
function normalizeProperties(props) {
  const output = {};
  for (let p in props) {
    const o = props[p];
    output[p] = (typeof o === 'function') ? {type: o} : o;
  }
  return output;
}

/**
 * Mixin that provides a minimal starting point to using the PropertiesChanged
 * mixin by providing a mechanism to declare properties in a static
 * getter (e.g. static get properties() { return { foo: String } }). Changes
 * are reported via the `_propertiesChanged` method.
 *
 * This mixin provides no specific support for rendering. Users are expected
 * to create a ShadowRoot and put content into it and update it in whatever
 * way makes sense. This can be done in reaction to properties changing by
 * implementing `_propertiesChanged`.
 *
 * @mixinFunction
 * @polymer
 * @appliesMixin PropertiesChanged
 * @summary Mixin that provides a minimal starting point for using
 * the PropertiesChanged mixin by providing a declarative `properties` object.
 * @template T
 * @param {function(new:T)} superClass Class to apply mixin to.
 * @return {function(new:T)} superClass with mixin applied.
 */
const PropertiesMixin = dedupingMixin(superClass => {

 /**
  * @constructor
  * @implements {Polymer_PropertiesChanged}
  * @private
  */
 const base = PropertiesChanged(superClass);

 /**
  * Returns the super class constructor for the given class, if it is an
  * instance of the PropertiesMixin.
  *
  * @param {!PropertiesMixinConstructor} constructor PropertiesMixin constructor
  * @return {?PropertiesMixinConstructor} Super class constructor
  */
 function superPropertiesClass(constructor) {
   const superCtor = Object.getPrototypeOf(constructor);

   // Note, the `PropertiesMixin` class below only refers to the class
   // generated by this call to the mixin; the instanceof test only works
   // because the mixin is deduped and guaranteed only to apply once, hence
   // all constructors in a proto chain will see the same `PropertiesMixin`
   return (superCtor.prototype instanceof PropertiesMixin) ?
     /** @type {!PropertiesMixinConstructor} */ (superCtor) : null;
 }

 /**
  * Returns a memoized version of the `properties` object for the
  * given class. Properties not in object format are converted to at
  * least {type}.
  *
  * @param {PropertiesMixinConstructor} constructor PropertiesMixin constructor
  * @return {Object} Memoized properties object
  */
 function ownProperties(constructor) {
   if (!constructor.hasOwnProperty(JSCompiler_renameProperty('__ownProperties', constructor))) {
     let props = null;

     if (constructor.hasOwnProperty(JSCompiler_renameProperty('properties', constructor))) {
       const properties = constructor.properties;

       if (properties) {
        props = normalizeProperties(properties);
       }
     }

     constructor.__ownProperties = props;
   }
   return constructor.__ownProperties;
 }

 /**
  * @polymer
  * @mixinClass
  * @extends {base}
  * @implements {Polymer_PropertiesMixin}
  * @unrestricted
  */
 class PropertiesMixin extends base {

   /**
    * Implements standard custom elements getter to observes the attributes
    * listed in `properties`.
    * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
    * @nocollapse
    */
   static get observedAttributes() {
     if (!this.hasOwnProperty(JSCompiler_renameProperty('__observedAttributes', this))) {
       register(this.prototype);
       const props = this._properties;
       this.__observedAttributes = props ? Object.keys(props).map(p => this.prototype._addPropertyToAttributeMap(p)) : [];
     }
     return this.__observedAttributes;
   }

   /**
    * Finalizes an element definition, including ensuring any super classes
    * are also finalized. This includes ensuring property
    * accessors exist on the element prototype. This method calls
    * `_finalizeClass` to finalize each constructor in the prototype chain.
    * @return {void}
    * @nocollapse
    */
   static finalize() {
     if (!this.hasOwnProperty(JSCompiler_renameProperty('__finalized', this))) {
       const superCtor = superPropertiesClass(/** @type {!PropertiesMixinConstructor} */(this));
       if (superCtor) {
         superCtor.finalize();
       }
       this.__finalized = true;
       this._finalizeClass();
     }
   }

   /**
    * Finalize an element class. This includes ensuring property
    * accessors exist on the element prototype. This method is called by
    * `finalize` and finalizes the class constructor.
    *
    * @protected
    * @nocollapse
    */
   static _finalizeClass() {
     const props = ownProperties(/** @type {!PropertiesMixinConstructor} */(this));
     if (props) {
       /** @type {?} */ (this).createProperties(props);
     }
   }

   /**
    * Returns a memoized version of all properties, including those inherited
    * from super classes. Properties not in object format are converted to
    * at least {type}.
    *
    * @return {Object} Object containing properties for this class
    * @protected
    * @nocollapse
    */
   static get _properties() {
     if (!this.hasOwnProperty(
       JSCompiler_renameProperty('__properties', this))) {
       const superCtor = superPropertiesClass(/** @type {!PropertiesMixinConstructor} */(this));
       this.__properties = Object.assign({},
         superCtor && superCtor._properties,
         ownProperties(/** @type {PropertiesMixinConstructor} */(this)));
     }
     return this.__properties;
   }

   /**
    * Overrides `PropertiesChanged` method to return type specified in the
    * static `properties` object for the given property.
    * @param {string} name Name of property
    * @return {*} Type to which to deserialize attribute
    *
    * @protected
    * @nocollapse
    */
   static typeForProperty(name) {
     const info = this._properties[name];
     return info && info.type;
   }

   /**
    * Overrides `PropertiesChanged` method and adds a call to
    * `finalize` which lazily configures the element's property accessors.
    * @override
    * @return {void}
    */
   _initializeProperties() {
     this.constructor.finalize();
     super._initializeProperties();
   }

   /**
    * Called when the element is added to a document.
    * Calls `_enableProperties` to turn on property system from
    * `PropertiesChanged`.
    * @suppress {missingProperties} Super may or may not implement the callback
    * @return {void}
    * @override
    */
   connectedCallback() {
     if (super.connectedCallback) {
       super.connectedCallback();
     }
     this._enableProperties();
   }

   /**
    * Called when the element is removed from a document
    * @suppress {missingProperties} Super may or may not implement the callback
    * @return {void}
    * @override
    */
   disconnectedCallback() {
     if (super.disconnectedCallback) {
       super.disconnectedCallback();
     }
   }

 }

 return PropertiesMixin;

});

/**
 * @fileoverview
 * @suppress {checkPrototypalTypes}
 * @license Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

/**
 * Current Polymer version in Semver notation.
 * @type {string} Semver notation of the current version of Polymer.
 */
const version = '3.4.1';

const builtCSS = window.ShadyCSS && window.ShadyCSS['cssBuild'];

/**
 * Element class mixin that provides the core API for Polymer's meta-programming
 * features including template stamping, data-binding, attribute deserialization,
 * and property change observation.
 *
 * Subclassers may provide the following static getters to return metadata
 * used to configure Polymer's features for the class:
 *
 * - `static get is()`: When the template is provided via a `dom-module`,
 *   users should return the `dom-module` id from a static `is` getter.  If
 *   no template is needed or the template is provided directly via the
 *   `template` getter, there is no need to define `is` for the element.
 *
 * - `static get template()`: Users may provide the template directly (as
 *   opposed to via `dom-module`) by implementing a static `template` getter.
 *   The getter must return an `HTMLTemplateElement`.
 *
 * - `static get properties()`: Should return an object describing
 *   property-related metadata used by Polymer features (key: property name
 *   value: object containing property metadata). Valid keys in per-property
 *   metadata include:
 *   - `type` (String|Number|Object|Array|...): Used by
 *     `attributeChangedCallback` to determine how string-based attributes
 *     are deserialized to JavaScript property values.
 *   - `notify` (boolean): Causes a change in the property to fire a
 *     non-bubbling event called `<property>-changed`. Elements that have
 *     enabled two-way binding to the property use this event to observe changes.
 *   - `readOnly` (boolean): Creates a getter for the property, but no setter.
 *     To set a read-only property, use the private setter method
 *     `_setProperty(property, value)`.
 *   - `observer` (string): Observer method name that will be called when
 *     the property changes. The arguments of the method are
 *     `(value, previousValue)`.
 *   - `computed` (string): String describing method and dependent properties
 *     for computing the value of this property (e.g. `'computeFoo(bar, zot)'`).
 *     Computed properties are read-only by default and can only be changed
 *     via the return value of the computing method.
 *
 * - `static get observers()`: Array of strings describing multi-property
 *   observer methods and their dependent properties (e.g.
 *   `'observeABC(a, b, c)'`).
 *
 * The base class provides default implementations for the following standard
 * custom element lifecycle callbacks; users may override these, but should
 * call the super method to ensure
 * - `constructor`: Run when the element is created or upgraded
 * - `connectedCallback`: Run each time the element is connected to the
 *   document
 * - `disconnectedCallback`: Run each time the element is disconnected from
 *   the document
 * - `attributeChangedCallback`: Run each time an attribute in
 *   `observedAttributes` is set or removed (note: this element's default
 *   `observedAttributes` implementation will automatically return an array
 *   of dash-cased attributes based on `properties`)
 *
 * @mixinFunction
 * @polymer
 * @appliesMixin PropertyEffects
 * @appliesMixin PropertiesMixin
 * @property rootPath {string} Set to the value of `rootPath`,
 *   which defaults to the main document path
 * @property importPath {string} Set to the value of the class's static
 *   `importPath` property, which defaults to the path of this element's
 *   `dom-module` (when `is` is used), but can be overridden for other
 *   import strategies.
 * @summary Element class mixin that provides the core API for Polymer's
 * meta-programming features.
 * @template T
 * @param {function(new:T)} superClass Class to apply mixin to.
 * @return {function(new:T)} superClass with mixin applied.
 */
const ElementMixin = dedupingMixin(base => {
  /**
   * @constructor
   * @implements {Polymer_PropertyEffects}
   * @implements {Polymer_PropertiesMixin}
   * @extends {HTMLElement}
   * @private
   */
  const polymerElementBase = PropertiesMixin(PropertyEffects(base));

  /**
   * Returns a list of properties with default values.
   * This list is created as an optimization since it is a subset of
   * the list returned from `_properties`.
   * This list is used in `_initializeProperties` to set property defaults.
   *
   * @param {PolymerElementConstructor} constructor Element class
   * @return {PolymerElementProperties} Flattened properties for this class
   *   that have default values
   * @private
   */
  function propertyDefaults(constructor) {
    if (!constructor.hasOwnProperty(
      JSCompiler_renameProperty('__propertyDefaults', constructor))) {
      constructor.__propertyDefaults = null;
      let props = constructor._properties;
      for (let p in props) {
        let info = props[p];
        if ('value' in info) {
          constructor.__propertyDefaults = constructor.__propertyDefaults || {};
          constructor.__propertyDefaults[p] = info;
        }
      }
    }
    return constructor.__propertyDefaults;
  }

  /**
   * Returns a memoized version of the `observers` array.
   * @param {PolymerElementConstructor} constructor Element class
   * @return {Array} Array containing own observers for the given class
   * @protected
   */
  function ownObservers(constructor) {
    if (!constructor.hasOwnProperty(
      JSCompiler_renameProperty('__ownObservers', constructor))) {
      constructor.__ownObservers =
          constructor.hasOwnProperty(
              JSCompiler_renameProperty('observers', constructor)) ?
          /** @type {PolymerElementConstructor} */ (constructor).observers :
          null;
    }
    return constructor.__ownObservers;
  }

  /**
   * Creates effects for a property.
   *
   * Note, once a property has been set to
   * `readOnly`, `computed`, `reflectToAttribute`, or `notify`
   * these values may not be changed. For example, a subclass cannot
   * alter these settings. However, additional `observers` may be added
   * by subclasses.
   *
   * The info object should contain property metadata as follows:
   *
   * * `type`: {function} type to which an attribute matching the property
   * is deserialized. Note the property is camel-cased from a dash-cased
   * attribute. For example, 'foo-bar' attribute is deserialized to a
   * property named 'fooBar'.
   *
   * * `readOnly`: {boolean} creates a readOnly property and
   * makes a private setter for the private of the form '_setFoo' for a
   * property 'foo',
   *
   * * `computed`: {string} creates a computed property. A computed property
   * is also automatically set to `readOnly: true`. The value is calculated
   * by running a method and arguments parsed from the given string. For
   * example 'compute(foo)' will compute a given property when the
   * 'foo' property changes by executing the 'compute' method. This method
   * must return the computed value.
   *
   * * `reflectToAttribute`: {boolean} If true, the property value is reflected
   * to an attribute of the same name. Note, the attribute is dash-cased
   * so a property named 'fooBar' is reflected as 'foo-bar'.
   *
   * * `notify`: {boolean} sends a non-bubbling notification event when
   * the property changes. For example, a property named 'foo' sends an
   * event named 'foo-changed' with `event.detail` set to the value of
   * the property.
   *
   * * observer: {string} name of a method that runs when the property
   * changes. The arguments of the method are (value, previousValue).
   *
   * Note: Users may want control over modifying property
   * effects via subclassing. For example, a user might want to make a
   * reflectToAttribute property not do so in a subclass. We've chosen to
   * disable this because it leads to additional complication.
   * For example, a readOnly effect generates a special setter. If a subclass
   * disables the effect, the setter would fail unexpectedly.
   * Based on feedback, we may want to try to make effects more malleable
   * and/or provide an advanced api for manipulating them.
   *
   * @param {!PolymerElement} proto Element class prototype to add accessors
   *   and effects to
   * @param {string} name Name of the property.
   * @param {Object} info Info object from which to create property effects.
   * Supported keys:
   * @param {Object} allProps Flattened map of all properties defined in this
   *   element (including inherited properties)
   * @return {void}
   * @private
   */
  function createPropertyFromConfig(proto, name, info, allProps) {
    // computed forces readOnly...
    if (info.computed) {
      info.readOnly = true;
    }
    // Note, since all computed properties are readOnly, this prevents
    // adding additional computed property effects (which leads to a confusing
    // setup where multiple triggers for setting a property)
    // While we do have `hasComputedEffect` this is set on the property's
    // dependencies rather than itself.
    if (info.computed) {
      if (proto._hasReadOnlyEffect(name)) {
        console.warn(`Cannot redefine computed property '${name}'.`);
      } else {
        proto._createComputedProperty(name, info.computed, allProps);
      }
    }
    if (info.readOnly && !proto._hasReadOnlyEffect(name)) {
      proto._createReadOnlyProperty(name, !info.computed);
    } else if (info.readOnly === false && proto._hasReadOnlyEffect(name)) {
      console.warn(`Cannot make readOnly property '${name}' non-readOnly.`);
    }
    if (info.reflectToAttribute && !proto._hasReflectEffect(name)) {
      proto._createReflectedProperty(name);
    } else if (info.reflectToAttribute === false && proto._hasReflectEffect(name)) {
      console.warn(`Cannot make reflected property '${name}' non-reflected.`);
    }
    if (info.notify && !proto._hasNotifyEffect(name)) {
      proto._createNotifyingProperty(name);
    } else if (info.notify === false && proto._hasNotifyEffect(name)) {
      console.warn(`Cannot make notify property '${name}' non-notify.`);
    }
    // always add observer
    if (info.observer) {
      proto._createPropertyObserver(name, info.observer, allProps[info.observer]);
    }
    // always create the mapping from attribute back to property for deserialization.
    proto._addPropertyToAttributeMap(name);
  }

  /**
   * Process all style elements in the element template. Styles with the
   * `include` attribute are processed such that any styles in
   * the associated "style modules" are included in the element template.
   * @param {PolymerElementConstructor} klass Element class
   * @param {!HTMLTemplateElement} template Template to process
   * @param {string} is Name of element
   * @param {string} baseURI Base URI for element
   * @private
   */
  function processElementStyles(klass, template, is, baseURI) {
    if (!builtCSS) {
      const templateStyles = template.content.querySelectorAll('style');
      const stylesWithImports = stylesFromTemplate(template);
      // insert styles from <link rel="import" type="css"> at the top of the template
      const linkedStyles = stylesFromModuleImports(is);
      const firstTemplateChild = template.content.firstElementChild;
      for (let idx = 0; idx < linkedStyles.length; idx++) {
        let s = linkedStyles[idx];
        s.textContent = klass._processStyleText(s.textContent, baseURI);
        template.content.insertBefore(s, firstTemplateChild);
      }
      // keep track of the last "concrete" style in the template we have encountered
      let templateStyleIndex = 0;
      // ensure all gathered styles are actually in this template.
      for (let i = 0; i < stylesWithImports.length; i++) {
        let s = stylesWithImports[i];
        let templateStyle = templateStyles[templateStyleIndex];
        // if the style is not in this template, it's been "included" and
        // we put a clone of it in the template before the style that included it
        if (templateStyle !== s) {
          s = s.cloneNode(true);
          templateStyle.parentNode.insertBefore(s, templateStyle);
        } else {
          templateStyleIndex++;
        }
        s.textContent = klass._processStyleText(s.textContent, baseURI);
      }
    }
    if (window.ShadyCSS) {
      window.ShadyCSS.prepareTemplate(template, is);
    }
    // Support for `adoptedStylesheets` relies on using native Shadow DOM
    // and built CSS. Built CSS is required because runtime transformation of
    // `@apply` is not supported. This is because ShadyCSS relies on being able
    // to update a `style` element in the element template and this is
    // removed when using `adoptedStyleSheets`.
    // Note, it would be more efficient to allow style includes to become
    // separate stylesheets; however, because of `@apply` these are
    // potentially not shareable and sharing the ones that could be shared
    // would require some coordination. To keep it simple, all the includes
    // and styles are collapsed into a single shareable stylesheet.
    if (useAdoptedStyleSheetsWithBuiltCSS && builtCSS &&
        supportsAdoptingStyleSheets) {
      // Remove styles in template and make a shareable stylesheet
      const styles = template.content.querySelectorAll('style');
      if (styles) {
        let css = '';
        Array.from(styles).forEach(s => {
          css += s.textContent;
          s.parentNode.removeChild(s);
        });
        klass._styleSheet = new CSSStyleSheet();
        klass._styleSheet.replaceSync(css);
      }
    }
  }

  /**
   * Look up template from dom-module for element
   *
   * @param {string} is Element name to look up
   * @return {?HTMLTemplateElement|undefined} Template found in dom module, or
   *   undefined if not found
   * @protected
   */
  function getTemplateFromDomModule(is) {
    let template = null;
    // Under strictTemplatePolicy in 3.x+, dom-module lookup is only allowed
    // when opted-in via allowTemplateFromDomModule
    if (is && (!strictTemplatePolicy || allowTemplateFromDomModule)) {
      template = /** @type {?HTMLTemplateElement} */ (
          DomModule.import(is, 'template'));
      // Under strictTemplatePolicy, require any element with an `is`
      // specified to have a dom-module
      if (strictTemplatePolicy && !template) {
        throw new Error(`strictTemplatePolicy: expecting dom-module or null template for ${is}`);
      }
    }
    return template;
  }

  /**
   * @polymer
   * @mixinClass
   * @unrestricted
   * @implements {Polymer_ElementMixin}
   * @extends {polymerElementBase}
   */
  class PolymerElement extends polymerElementBase {

    /**
     * Current Polymer version in Semver notation.
     * @type {string} Semver notation of the current version of Polymer.
     * @nocollapse
     */
    static get polymerElementVersion() {
      return version;
    }

    /**
     * Override of PropertiesMixin _finalizeClass to create observers and
     * find the template.
     * @return {void}
     * @protected
     * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
     * @nocollapse
     */
    static _finalizeClass() {
      // TODO(https://github.com/google/closure-compiler/issues/3240):
      //     Change back to just super.methodCall()
      polymerElementBase._finalizeClass.call(this);
      const observers = ownObservers(this);
      if (observers) {
        this.createObservers(observers, this._properties);
      }
      this._prepareTemplate();
    }

    /** @nocollapse */
    static _prepareTemplate() {
      // note: create "working" template that is finalized at instance time
      let template = /** @type {PolymerElementConstructor} */ (this).template;
      if (template) {
        if (typeof template === 'string') {
          console.error('template getter must return HTMLTemplateElement');
          template = null;
        } else if (!legacyOptimizations) {
          template = template.cloneNode(true);
        }
      }

      /** @override */
      this.prototype._template = template;
    }

    /**
     * Override of PropertiesChanged createProperties to create accessors
     * and property effects for all of the properties.
     * @param {!Object} props .
     * @return {void}
     * @protected
     * @nocollapse
     */
    static createProperties(props) {
      for (let p in props) {
        createPropertyFromConfig(
            /** @type {?} */ (this.prototype), p, props[p], props);
      }
    }

    /**
     * Creates observers for the given `observers` array.
     * Leverages `PropertyEffects` to create observers.
     * @param {Object} observers Array of observer descriptors for
     *   this class
     * @param {Object} dynamicFns Object containing keys for any properties
     *   that are functions and should trigger the effect when the function
     *   reference is changed
     * @return {void}
     * @protected
     * @nocollapse
     */
    static createObservers(observers, dynamicFns) {
      const proto = this.prototype;
      for (let i=0; i < observers.length; i++) {
        proto._createMethodObserver(observers[i], dynamicFns);
      }
    }

    /**
     * Returns the template that will be stamped into this element's shadow root.
     *
     * If a `static get is()` getter is defined, the default implementation will
     * return the first `<template>` in a `dom-module` whose `id` matches this
     * element's `is` (note that a `_template` property on the class prototype
     * takes precedence over the `dom-module` template, to maintain legacy
     * element semantics; a subclass will subsequently fall back to its super
     * class template if neither a `prototype._template` or a `dom-module` for
     * the class's `is` was found).
     *
     * Users may override this getter to return an arbitrary template
     * (in which case the `is` getter is unnecessary). The template returned
     * must be an `HTMLTemplateElement`.
     *
     * Note that when subclassing, if the super class overrode the default
     * implementation and the subclass would like to provide an alternate
     * template via a `dom-module`, it should override this getter and
     * return `DomModule.import(this.is, 'template')`.
     *
     * If a subclass would like to modify the super class template, it should
     * clone it rather than modify it in place.  If the getter does expensive
     * work such as cloning/modifying a template, it should memoize the
     * template for maximum performance:
     *
     *   let memoizedTemplate;
     *   class MySubClass extends MySuperClass {
     *     static get template() {
     *       if (!memoizedTemplate) {
     *         memoizedTemplate = super.template.cloneNode(true);
     *         let subContent = document.createElement('div');
     *         subContent.textContent = 'This came from MySubClass';
     *         memoizedTemplate.content.appendChild(subContent);
     *       }
     *       return memoizedTemplate;
     *     }
     *   }
     *
     * @return {!HTMLTemplateElement|string} Template to be stamped
     * @nocollapse
     */
    static get template() {
      // Explanation of template-related properties:
      // - constructor.template (this getter): the template for the class.
      //     This can come from the prototype (for legacy elements), from a
      //     dom-module, or from the super class's template (or can be overridden
      //     altogether by the user)
      // - constructor._template: memoized version of constructor.template
      // - prototype._template: working template for the element, which will be
      //     parsed and modified in place. It is a cloned version of
      //     constructor.template, saved in _finalizeClass(). Note that before
      //     this getter is called, for legacy elements this could be from a
      //     _template field on the info object passed to Polymer(), a behavior,
      //     or set in registered(); once the static getter runs, a clone of it
      //     will overwrite it on the prototype as the working template.
      if (!this.hasOwnProperty(JSCompiler_renameProperty('_template', this))) {
        const protoTemplate = this.prototype.hasOwnProperty(
          JSCompiler_renameProperty('_template', this.prototype)) ?
          this.prototype._template : undefined;
        this._template =
          // If user has put template on prototype (e.g. in legacy via registered
          // callback or info object), prefer that first. Note that `null` is
          // used as a sentinel to indicate "no template" and can be used to
          // override a super template, whereas `undefined` is used as a
          // sentinel to mean "fall-back to default template lookup" via
          // dom-module and/or super.template.
          protoTemplate !== undefined ? protoTemplate :
          // Look in dom-module associated with this element's is
          ((this.hasOwnProperty(JSCompiler_renameProperty('is', this)) &&
          (getTemplateFromDomModule(/** @type {PolymerElementConstructor}*/ (this).is))) ||
          // Next look for superclass template (call the super impl this
          // way so that `this` points to the superclass)
          Object.getPrototypeOf(/** @type {PolymerElementConstructor}*/ (this).prototype).constructor.template);
      }
      return this._template;
    }

    /**
     * Set the template.
     *
     * @param {!HTMLTemplateElement|string} value Template to set.
     * @nocollapse
     */
    static set template(value) {
      this._template = value;
    }

    /**
     * Path matching the url from which the element was imported.
     *
     * This path is used to resolve url's in template style cssText.
     * The `importPath` property is also set on element instances and can be
     * used to create bindings relative to the import path.
     *
     * For elements defined in ES modules, users should implement
     * `static get importMeta() { return import.meta; }`, and the default
     * implementation of `importPath` will  return `import.meta.url`'s path.
     * For elements defined in HTML imports, this getter will return the path
     * to the document containing a `dom-module` element matching this
     * element's static `is` property.
     *
     * Note, this path should contain a trailing `/`.
     *
     * @return {string} The import path for this element class
     * @suppress {missingProperties}
     * @nocollapse
     */
    static get importPath() {
      if (!this.hasOwnProperty(JSCompiler_renameProperty('_importPath', this))) {
        const meta = this.importMeta;
        if (meta) {
          this._importPath = pathFromUrl(meta.url);
        } else {
          const module = DomModule.import(/** @type {PolymerElementConstructor} */ (this).is);
          this._importPath = (module && module.assetpath) ||
            Object.getPrototypeOf(/** @type {PolymerElementConstructor}*/ (this).prototype).constructor.importPath;
        }
      }
      return this._importPath;
    }

    constructor() {
      super();
      /** @type {HTMLTemplateElement} */
      this._template;
      /** @type {string} */
      this._importPath;
      /** @type {string} */
      this.rootPath;
      /** @type {string} */
      this.importPath;
      /** @type {StampedTemplate | HTMLElement | ShadowRoot} */
      this.root;
      /** @type {!Object<string, !Element>} */
      this.$;
    }

    /**
     * Overrides the default `PropertyAccessors` to ensure class
     * metaprogramming related to property accessors and effects has
     * completed (calls `finalize`).
     *
     * It also initializes any property defaults provided via `value` in
     * `properties` metadata.
     *
     * @return {void}
     * @override
     * @suppress {invalidCasts,missingProperties} go/missingfnprops
     */
    _initializeProperties() {
      this.constructor.finalize();
      // note: finalize template when we have access to `localName` to
      // avoid dependence on `is` for polyfilling styling.
      this.constructor._finalizeTemplate(/** @type {!HTMLElement} */(this).localName);
      super._initializeProperties();
      // set path defaults
      this.rootPath = rootPath;
      this.importPath = this.constructor.importPath;
      // apply property defaults...
      let p$ = propertyDefaults(this.constructor);
      if (!p$) {
        return;
      }
      for (let p in p$) {
        let info = p$[p];
        if (this._canApplyPropertyDefault(p)) {
          let value = typeof info.value == 'function' ?
            info.value.call(this) :
            info.value;
          // Set via `_setProperty` if there is an accessor, to enable
          // initializing readOnly property defaults
          if (this._hasAccessor(p)) {
            this._setPendingProperty(p, value, true);
          } else {
            this[p] = value;
          }
        }
      }
    }

    /**
     * Determines if a property dfeault can be applied. For example, this
     * prevents a default from being applied when a property that has no
     * accessor is overridden by its host before upgrade (e.g. via a binding).
     * @override
     * @param {string} property Name of the property
     * @return {boolean} Returns true if the property default can be applied.
     */
    _canApplyPropertyDefault(property) {
      return !this.hasOwnProperty(property);
    }

    /**
     * Gather style text for a style element in the template.
     *
     * @param {string} cssText Text containing styling to process
     * @param {string} baseURI Base URI to rebase CSS paths against
     * @return {string} The processed CSS text
     * @protected
     * @nocollapse
     */
    static _processStyleText(cssText, baseURI) {
      return resolveCss(cssText, baseURI);
    }

    /**
    * Configures an element `proto` to function with a given `template`.
    * The element name `is` and extends `ext` must be specified for ShadyCSS
    * style scoping.
    *
    * @param {string} is Tag name (or type extension name) for this element
    * @return {void}
    * @protected
    * @nocollapse
    */
    static _finalizeTemplate(is) {
      /** @const {HTMLTemplateElement} */
      const template = this.prototype._template;
      if (template && !template.__polymerFinalized) {
        template.__polymerFinalized = true;
        const importPath = this.importPath;
        const baseURI = importPath ? resolveUrl(importPath) : '';
        // e.g. support `include="module-name"`, and ShadyCSS
        processElementStyles(this, template, is, baseURI);
        this.prototype._bindTemplate(template);
      }
    }

    /**
     * Provides a default implementation of the standard Custom Elements
     * `connectedCallback`.
     *
     * The default implementation enables the property effects system and
     * flushes any pending properties, and updates shimmed CSS properties
     * when using the ShadyCSS scoping/custom properties polyfill.
     *
     * @override
     * @suppress {missingProperties, invalidCasts} Super may or may not
     *     implement the callback
     * @return {void}
     */
    connectedCallback() {
      if (window.ShadyCSS && this._template) {
        window.ShadyCSS.styleElement(/** @type {!HTMLElement} */(this));
      }
      super.connectedCallback();
    }

    /**
     * Stamps the element template.
     *
     * @return {void}
     * @override
     */
    ready() {
      if (this._template) {
        this.root = this._stampTemplate(this._template);
        this.$ = this.root.$;
      }
      super.ready();
    }

    /**
     * Implements `PropertyEffects`'s `_readyClients` call. Attaches
     * element dom by calling `_attachDom` with the dom stamped from the
     * element's template via `_stampTemplate`. Note that this allows
     * client dom to be attached to the element prior to any observers
     * running.
     *
     * @return {void}
     * @override
     */
    _readyClients() {
      if (this._template) {
        this.root = this._attachDom(/** @type {StampedTemplate} */(this.root));
      }
      // The super._readyClients here sets the clients initialized flag.
      // We must wait to do this until after client dom is created/attached
      // so that this flag can be checked to prevent notifications fired
      // during this process from being handled before clients are ready.
      super._readyClients();
    }


    /**
     * Attaches an element's stamped dom to itself. By default,
     * this method creates a `shadowRoot` and adds the dom to it.
     * However, this method may be overridden to allow an element
     * to put its dom in another location.
     *
     * @override
     * @throws {Error}
     * @suppress {missingReturn}
     * @param {StampedTemplate} dom to attach to the element.
     * @return {ShadowRoot} node to which the dom has been attached.
     */
    _attachDom(dom) {
      const n = wrap(this);
      if (n.attachShadow) {
        if (dom) {
          if (!n.shadowRoot) {
            n.attachShadow({mode: 'open', shadyUpgradeFragment: dom});
            n.shadowRoot.appendChild(dom);
            // When `adoptedStyleSheets` is supported a stylesheet is made
            // available on the element constructor.
            if (this.constructor._styleSheet) {
              n.shadowRoot.adoptedStyleSheets = [this.constructor._styleSheet];
            }
          }
          if (syncInitialRender && window.ShadyDOM) {
            window.ShadyDOM.flushInitial(n.shadowRoot);
          }
          return n.shadowRoot;
        }
        return null;
      } else {
        throw new Error('ShadowDOM not available. ' +
          // TODO(sorvell): move to compile-time conditional when supported
        'PolymerElement can create dom as children instead of in ' +
        'ShadowDOM by setting `this.root = this;\` before \`ready\`.');
      }
    }

    /**
     * When using the ShadyCSS scoping and custom property shim, causes all
     * shimmed styles in this element (and its subtree) to be updated
     * based on current custom property values.
     *
     * The optional parameter overrides inline custom property styles with an
     * object of properties where the keys are CSS properties, and the values
     * are strings.
     *
     * Example: `this.updateStyles({'--color': 'blue'})`
     *
     * These properties are retained unless a value of `null` is set.
     *
     * Note: This function does not support updating CSS mixins.
     * You can not dynamically change the value of an `@apply`.
     *
     * @override
     * @param {Object=} properties Bag of custom property key/values to
     *   apply to this element.
     * @return {void}
     * @suppress {invalidCasts}
     */
    updateStyles(properties) {
      if (window.ShadyCSS) {
        window.ShadyCSS.styleSubtree(/** @type {!HTMLElement} */(this), properties);
      }
    }

    /**
     * Rewrites a given URL relative to a base URL. The base URL defaults to
     * the original location of the document containing the `dom-module` for
     * this element. This method will return the same URL before and after
     * bundling.
     *
     * Note that this function performs no resolution for URLs that start
     * with `/` (absolute URLs) or `#` (hash identifiers).  For general purpose
     * URL resolution, use `window.URL`.
     *
     * @override
     * @param {string} url URL to resolve.
     * @param {string=} base Optional base URL to resolve against, defaults
     * to the element's `importPath`
     * @return {string} Rewritten URL relative to base
     */
    resolveUrl(url, base) {
      if (!base && this.importPath) {
        base = resolveUrl(this.importPath);
      }
      return resolveUrl(url, base);
    }

    /**
     * Overrides `PropertyEffects` to add map of dynamic functions on
     * template info, for consumption by `PropertyEffects` template binding
     * code. This map determines which method templates should have accessors
     * created for them.
     *
     * @param {!HTMLTemplateElement} template Template
     * @param {!TemplateInfo} templateInfo Template metadata for current template
     * @param {!NodeInfo} nodeInfo Node metadata for current template.
     * @return {boolean} .
     * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
     * @nocollapse
     */
    static _parseTemplateContent(template, templateInfo, nodeInfo) {
      templateInfo.dynamicFns = templateInfo.dynamicFns || this._properties;
      // TODO(https://github.com/google/closure-compiler/issues/3240):
      //     Change back to just super.methodCall()
      return polymerElementBase._parseTemplateContent.call(
        this, template, templateInfo, nodeInfo);
    }

    /**
     * Overrides `PropertyEffects` to warn on use of undeclared properties in
     * template.
     *
     * @param {Object} templateInfo Template metadata to add effect to
     * @param {string} prop Property that should trigger the effect
     * @param {Object=} effect Effect metadata object
     * @return {void}
     * @protected
     * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
     * @nocollapse
     */
    static _addTemplatePropertyEffect(templateInfo, prop, effect) {
      // Warn if properties are used in template without being declared.
      // Properties must be listed in `properties` to be included in
      // `observedAttributes` since CE V1 reads that at registration time, and
      // since we want to keep template parsing lazy, we can't automatically
      // add undeclared properties used in templates to `observedAttributes`.
      // The warning is only enabled in `legacyOptimizations` mode, since
      // we don't want to spam existing users who might have adopted the
      // shorthand when attribute deserialization is not important.
      if (legacyWarnings && !(prop in this._properties) &&
          // Methods used in templates with no dependencies (or only literal
          // dependencies) become accessors with template effects; ignore these
          !(effect.info.part.signature && effect.info.part.signature.static) &&
          // Warnings for bindings added to nested templates are handled by
          // templatizer so ignore both the host-to-template bindings
          // (`hostProp`) and TemplateInstance-to-child bindings
          // (`nestedTemplate`)
          !effect.info.part.hostProp && !templateInfo.nestedTemplate) {
        console.warn(`Property '${prop}' used in template but not declared in 'properties'; ` +
          `attribute will not be observed.`);
      }
      // TODO(https://github.com/google/closure-compiler/issues/3240):
      //     Change back to just super.methodCall()
      return polymerElementBase._addTemplatePropertyEffect.call(
        this, templateInfo, prop, effect);
    }

  }

  return PolymerElement;
});

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Base class that provides the core API for Polymer's meta-programming
 * features including template stamping, data-binding, attribute deserialization,
 * and property change observation.
 *
 * @customElement
 * @polymer
 * @constructor
 * @implements {Polymer_ElementMixin}
 * @extends HTMLElement
 * @appliesMixin ElementMixin
 * @summary Custom element base class that provides the core API for Polymer's
 *   key meta-programming features including template stamping, data-binding,
 *   attribute deserialization, and property change observation
 */
const PolymerElement = ElementMixin(HTMLElement);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * @summary Collapse multiple callbacks into one invocation after a timer.
 */
class Debouncer {
  constructor() {
    this._asyncModule = null;
    this._callback = null;
    this._timer = null;
  }
  /**
   * Sets the scheduler; that is, a module with the Async interface,
   * a callback and optional arguments to be passed to the run function
   * from the async module.
   *
   * @param {!AsyncInterface} asyncModule Object with Async interface.
   * @param {function()} callback Callback to run.
   * @return {void}
   */
  setConfig(asyncModule, callback) {
    this._asyncModule = asyncModule;
    this._callback = callback;
    this._timer = this._asyncModule.run(() => {
      this._timer = null;
      debouncerQueue.delete(this);
      this._callback();
    });
  }
  /**
   * Cancels an active debouncer and returns a reference to itself.
   *
   * @return {void}
   */
  cancel() {
    if (this.isActive()) {
      this._cancelAsync();
      // Canceling a debouncer removes its spot from the flush queue,
      // so if a debouncer is manually canceled and re-debounced, it
      // will reset its flush order (this is a very minor difference from 1.x)
      // Re-debouncing via the `debounce` API retains the 1.x FIFO flush order
      debouncerQueue.delete(this);
    }
  }
  /**
   * Cancels a debouncer's async callback.
   *
   * @return {void}
   */
  _cancelAsync() {
    if (this.isActive()) {
      this._asyncModule.cancel(/** @type {number} */(this._timer));
      this._timer = null;
    }
  }
  /**
   * Flushes an active debouncer and returns a reference to itself.
   *
   * @return {void}
   */
  flush() {
    if (this.isActive()) {
      this.cancel();
      this._callback();
    }
  }
  /**
   * Returns true if the debouncer is active.
   *
   * @return {boolean} True if active.
   */
  isActive() {
    return this._timer != null;
  }
  /**
   * Creates a debouncer if no debouncer is passed as a parameter
   * or it cancels an active debouncer otherwise. The following
   * example shows how a debouncer can be called multiple times within a
   * microtask and "debounced" such that the provided callback function is
   * called once. Add this method to a custom element:
   *
   * ```js
   * import {microTask} from '@polymer/polymer/lib/utils/async.js';
   * import {Debouncer} from '@polymer/polymer/lib/utils/debounce.js';
   * // ...
   *
   * _debounceWork() {
   *   this._debounceJob = Debouncer.debounce(this._debounceJob,
   *       microTask, () => this._doWork());
   * }
   * ```
   *
   * If the `_debounceWork` method is called multiple times within the same
   * microtask, the `_doWork` function will be called only once at the next
   * microtask checkpoint.
   *
   * Note: In testing it is often convenient to avoid asynchrony. To accomplish
   * this with a debouncer, you can use `enqueueDebouncer` and
   * `flush`. For example, extend the above example by adding
   * `enqueueDebouncer(this._debounceJob)` at the end of the
   * `_debounceWork` method. Then in a test, call `flush` to ensure
   * the debouncer has completed.
   *
   * @param {Debouncer?} debouncer Debouncer object.
   * @param {!AsyncInterface} asyncModule Object with Async interface
   * @param {function()} callback Callback to run.
   * @return {!Debouncer} Returns a debouncer object.
   */
  static debounce(debouncer, asyncModule, callback) {
    if (debouncer instanceof Debouncer) {
      // Cancel the async callback, but leave in debouncerQueue if it was
      // enqueued, to maintain 1.x flush order
      debouncer._cancelAsync();
    } else {
      debouncer = new Debouncer();
    }
    debouncer.setConfig(asyncModule, callback);
    return debouncer;
  }
}

let debouncerQueue = new Set();

/**
 * Adds a `Debouncer` to a list of globally flushable tasks.
 *
 * @param {!Debouncer} debouncer Debouncer to enqueue
 * @return {void}
 */
const enqueueDebouncer = function(debouncer) {
  debouncerQueue.add(debouncer);
};

/**
 * Flushes any enqueued debouncers
 *
 * @return {boolean} Returns whether any debouncers were flushed
 */
const flushDebouncers = function() {
  const didFlush = Boolean(debouncerQueue.size);
  // If new debouncers are added while flushing, Set.forEach will ensure
  // newly added ones are also flushed
  debouncerQueue.forEach(debouncer => {
    try {
      debouncer.flush();
    } catch(e) {
      setTimeout(() => {
        throw e;
      });
    }
  });
  return didFlush;
};

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

// detect native touch action support
let HAS_NATIVE_TA = typeof document.head.style.touchAction === 'string';
let GESTURE_KEY = '__polymerGestures';
let HANDLED_OBJ = '__polymerGesturesHandled';
let TOUCH_ACTION = '__polymerGesturesTouchAction';
// radius for tap and track
let TAP_DISTANCE = 25;
let TRACK_DISTANCE = 5;
// number of last N track positions to keep
let TRACK_LENGTH = 2;

// Disabling "mouse" handlers for 2500ms is enough
let MOUSE_TIMEOUT = 2500;
let MOUSE_EVENTS = ['mousedown', 'mousemove', 'mouseup', 'click'];
// an array of bitmask values for mapping MouseEvent.which to MouseEvent.buttons
let MOUSE_WHICH_TO_BUTTONS = [0, 1, 4, 2];
let MOUSE_HAS_BUTTONS = (function() {
  try {
    return new MouseEvent('test', {buttons: 1}).buttons === 1;
  } catch (e) {
    return false;
  }
})();

/**
 * @param {string} name Possible mouse event name
 * @return {boolean} true if mouse event, false if not
 */
function isMouseEvent(name) {
  return MOUSE_EVENTS.indexOf(name) > -1;
}

/* eslint no-empty: ["error", { "allowEmptyCatch": true }] */
// check for passive event listeners
let supportsPassive = false;
(function() {
  try {
    let opts = Object.defineProperty({}, 'passive', {get() {supportsPassive = true;}});
    window.addEventListener('test', null, opts);
    window.removeEventListener('test', null, opts);
  } catch(e) {}
})();

/**
 * Generate settings for event listeners, dependant on `passiveTouchGestures`
 *
 * @param {string} eventName Event name to determine if `{passive}` option is
 *   needed
 * @return {{passive: boolean} | undefined} Options to use for addEventListener
 *   and removeEventListener
 */
function PASSIVE_TOUCH(eventName) {
  if (isMouseEvent(eventName) || eventName === 'touchend') {
    return;
  }
  if (HAS_NATIVE_TA && supportsPassive && passiveTouchGestures) {
    return {passive: true};
  } else {
    return;
  }
}

// Check for touch-only devices
let IS_TOUCH_ONLY = navigator.userAgent.match(/iP(?:[oa]d|hone)|Android/);

// keep track of any labels hit by the mouseCanceller
/** @type {!Array<!HTMLLabelElement>} */
const clickedLabels = [];

/** @type {!Object<boolean>} */
const labellable = {
  'button': true,
  'input': true,
  'keygen': true,
  'meter': true,
  'output': true,
  'textarea': true,
  'progress': true,
  'select': true
};

// Defined at https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#enabling-and-disabling-form-controls:-the-disabled-attribute
/** @type {!Object<boolean>} */
const canBeDisabled = {
  'button': true,
  'command': true,
  'fieldset': true,
  'input': true,
  'keygen': true,
  'optgroup': true,
  'option': true,
  'select': true,
  'textarea': true
};

/**
 * @param {HTMLElement} el Element to check labelling status
 * @return {boolean} element can have labels
 */
function canBeLabelled(el) {
  return labellable[el.localName] || false;
}

/**
 * @param {HTMLElement} el Element that may be labelled.
 * @return {!Array<!HTMLLabelElement>} Relevant label for `el`
 */
function matchingLabels(el) {
  let labels = Array.prototype.slice.call(/** @type {HTMLInputElement} */(el).labels || []);
  // IE doesn't have `labels` and Safari doesn't populate `labels`
  // if element is in a shadowroot.
  // In this instance, finding the non-ancestor labels is enough,
  // as the mouseCancellor code will handle ancstor labels
  if (!labels.length) {
    labels = [];
    let root = el.getRootNode();
    // if there is an id on `el`, check for all labels with a matching `for` attribute
    if (el.id) {
      let matching = root.querySelectorAll(`label[for = ${el.id}]`);
      for (let i = 0; i < matching.length; i++) {
        labels.push(/** @type {!HTMLLabelElement} */(matching[i]));
      }
    }
  }
  return labels;
}

// touch will make synthetic mouse events
// `preventDefault` on touchend will cancel them,
// but this breaks `<input>` focus and link clicks
// disable mouse handlers for MOUSE_TIMEOUT ms after
// a touchend to ignore synthetic mouse events
let mouseCanceller = function(mouseEvent) {
  // Check for sourceCapabilities, used to distinguish synthetic events
  // if mouseEvent did not come from a device that fires touch events,
  // it was made by a real mouse and should be counted
  // http://wicg.github.io/InputDeviceCapabilities/#dom-inputdevicecapabilities-firestouchevents
  let sc = mouseEvent.sourceCapabilities;
  if (sc && !sc.firesTouchEvents) {
    return;
  }
  // skip synthetic mouse events
  mouseEvent[HANDLED_OBJ] = {skip: true};
  // disable "ghost clicks"
  if (mouseEvent.type === 'click') {
    let clickFromLabel = false;
    let path = getComposedPath(mouseEvent);
    for (let i = 0; i < path.length; i++) {
      if (path[i].nodeType === Node.ELEMENT_NODE) {
        if (path[i].localName === 'label') {
          clickedLabels.push(/** @type {!HTMLLabelElement} */ (path[i]));
        } else if (canBeLabelled(/** @type {!HTMLElement} */ (path[i]))) {
          let ownerLabels =
              matchingLabels(/** @type {!HTMLElement} */ (path[i]));
          // check if one of the clicked labels is labelling this element
          for (let j = 0; j < ownerLabels.length; j++) {
            clickFromLabel = clickFromLabel || clickedLabels.indexOf(ownerLabels[j]) > -1;
          }
        }
      }
      if (path[i] === POINTERSTATE.mouse.target) {
        return;
      }
    }
    // if one of the clicked labels was labelling the target element,
    // this is not a ghost click
    if (clickFromLabel) {
      return;
    }
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
  }
};

/**
 * @param {boolean=} setup True to add, false to remove.
 * @return {void}
 */
function setupTeardownMouseCanceller(setup) {
  let events = IS_TOUCH_ONLY ? ['click'] : MOUSE_EVENTS;
  for (let i = 0, en; i < events.length; i++) {
    en = events[i];
    if (setup) {
      // reset clickLabels array
      clickedLabels.length = 0;
      document.addEventListener(en, mouseCanceller, true);
    } else {
      document.removeEventListener(en, mouseCanceller, true);
    }
  }
}

function ignoreMouse(e) {
  if (!POINTERSTATE.mouse.mouseIgnoreJob) {
    setupTeardownMouseCanceller(true);
  }
  let unset = function() {
    setupTeardownMouseCanceller();
    POINTERSTATE.mouse.target = null;
    POINTERSTATE.mouse.mouseIgnoreJob = null;
  };
  POINTERSTATE.mouse.target = getComposedPath(e)[0];
  POINTERSTATE.mouse.mouseIgnoreJob = Debouncer.debounce(
        POINTERSTATE.mouse.mouseIgnoreJob
      , timeOut.after(MOUSE_TIMEOUT)
      , unset);
}

/**
 * @param {MouseEvent} ev event to test for left mouse button down
 * @return {boolean} has left mouse button down
 */
function hasLeftMouseButton(ev) {
  let type = ev.type;
  // exit early if the event is not a mouse event
  if (!isMouseEvent(type)) {
    return false;
  }
  // ev.button is not reliable for mousemove (0 is overloaded as both left button and no buttons)
  // instead we use ev.buttons (bitmask of buttons) or fall back to ev.which (deprecated, 0 for no buttons, 1 for left button)
  if (type === 'mousemove') {
    // allow undefined for testing events
    let buttons = ev.buttons === undefined ? 1 : ev.buttons;
    if ((ev instanceof window.MouseEvent) && !MOUSE_HAS_BUTTONS) {
      buttons = MOUSE_WHICH_TO_BUTTONS[ev.which] || 0;
    }
    // buttons is a bitmask, check that the left button bit is set (1)
    return Boolean(buttons & 1);
  } else {
    // allow undefined for testing events
    let button = ev.button === undefined ? 0 : ev.button;
    // ev.button is 0 in mousedown/mouseup/click for left button activation
    return button === 0;
  }
}

function isSyntheticClick(ev) {
  if (ev.type === 'click') {
    // ev.detail is 0 for HTMLElement.click in most browsers
    if (ev.detail === 0) {
      return true;
    }
    // in the worst case, check that the x/y position of the click is within
    // the bounding box of the target of the event
    // Thanks IE 10 >:(
    let t = _findOriginalTarget(ev);
    // make sure the target of the event is an element so we can use getBoundingClientRect,
    // if not, just assume it is a synthetic click
    if (!t.nodeType || /** @type {Element} */(t).nodeType !== Node.ELEMENT_NODE) {
      return true;
    }
    let bcr = /** @type {Element} */(t).getBoundingClientRect();
    // use page x/y to account for scrolling
    let x = ev.pageX, y = ev.pageY;
    // ev is a synthetic click if the position is outside the bounding box of the target
    return !((x >= bcr.left && x <= bcr.right) && (y >= bcr.top && y <= bcr.bottom));
  }
  return false;
}

let POINTERSTATE = {
  mouse: {
    target: null,
    mouseIgnoreJob: null
  },
  touch: {
    x: 0,
    y: 0,
    id: -1,
    scrollDecided: false
  }
};

function firstTouchAction(ev) {
  let ta = 'auto';
  let path = getComposedPath(ev);
  for (let i = 0, n; i < path.length; i++) {
    n = path[i];
    if (n[TOUCH_ACTION]) {
      ta = n[TOUCH_ACTION];
      break;
    }
  }
  return ta;
}

function trackDocument(stateObj, movefn, upfn) {
  stateObj.movefn = movefn;
  stateObj.upfn = upfn;
  document.addEventListener('mousemove', movefn);
  document.addEventListener('mouseup', upfn);
}

function untrackDocument(stateObj) {
  document.removeEventListener('mousemove', stateObj.movefn);
  document.removeEventListener('mouseup', stateObj.upfn);
  stateObj.movefn = null;
  stateObj.upfn = null;
}

{
  // use a document-wide touchend listener to start the ghost-click prevention mechanism
  // Use passive event listeners, if supported, to not affect scrolling performance
  document.addEventListener('touchend', ignoreMouse, supportsPassive ? {passive: true} : false);
}

/**
 * Returns the composedPath for the given event.
 * @param {Event} event to process
 * @return {!Array<!EventTarget>} Path of the event
 */
const getComposedPath = window.ShadyDOM && window.ShadyDOM.noPatch ?
  window.ShadyDOM.composedPath :
  (event) => event.composedPath && event.composedPath() || [];

/** @type {!Object<string, !GestureRecognizer>} */
const gestures = {};

/** @type {!Array<!GestureRecognizer>} */
const recognizers = [];

/**
 * Finds the element rendered on the screen at the provided coordinates.
 *
 * Similar to `document.elementFromPoint`, but pierces through
 * shadow roots.
 *
 * @param {number} x Horizontal pixel coordinate
 * @param {number} y Vertical pixel coordinate
 * @return {Element} Returns the deepest shadowRoot inclusive element
 * found at the screen position given.
 */
function deepTargetFind(x, y) {
  let node = document.elementFromPoint(x, y);
  let next = node;
  // this code path is only taken when native ShadowDOM is used
  // if there is a shadowroot, it may have a node at x/y
  // if there is not a shadowroot, exit the loop
  while (next && next.shadowRoot && !window.ShadyDOM) {
    // if there is a node at x/y in the shadowroot, look deeper
    let oldNext = next;
    next = next.shadowRoot.elementFromPoint(x, y);
    // on Safari, elementFromPoint may return the shadowRoot host
    if (oldNext === next) {
      break;
    }
    if (next) {
      node = next;
    }
  }
  return node;
}

/**
 * a cheaper check than ev.composedPath()[0];
 *
 * @private
 * @param {Event|Touch} ev Event.
 * @return {EventTarget} Returns the event target.
 */
function _findOriginalTarget(ev) {
  const path = getComposedPath(/** @type {?Event} */ (ev));
  // It shouldn't be, but sometimes path is empty (window on Safari).
  return path.length > 0 ? path[0] : ev.target;
}

/**
 * @private
 * @param {Event} ev Event.
 * @return {void}
 */
function _handleNative(ev) {
  let handled;
  let type = ev.type;
  let node = ev.currentTarget;
  let gobj = node[GESTURE_KEY];
  if (!gobj) {
    return;
  }
  let gs = gobj[type];
  if (!gs) {
    return;
  }
  if (!ev[HANDLED_OBJ]) {
    ev[HANDLED_OBJ] = {};
    if (type.slice(0, 5) === 'touch') {
      ev = /** @type {TouchEvent} */(ev); // eslint-disable-line no-self-assign
      let t = ev.changedTouches[0];
      if (type === 'touchstart') {
        // only handle the first finger
        if (ev.touches.length === 1) {
          POINTERSTATE.touch.id = t.identifier;
        }
      }
      if (POINTERSTATE.touch.id !== t.identifier) {
        return;
      }
      if (!HAS_NATIVE_TA) {
        if (type === 'touchstart' || type === 'touchmove') {
          _handleTouchAction(ev);
        }
      }
    }
  }
  handled = ev[HANDLED_OBJ];
  // used to ignore synthetic mouse events
  if (handled.skip) {
    return;
  }
  // reset recognizer state
  for (let i = 0, r; i < recognizers.length; i++) {
    r = recognizers[i];
    if (gs[r.name] && !handled[r.name]) {
      if (r.flow && r.flow.start.indexOf(ev.type) > -1 && r.reset) {
        r.reset();
      }
    }
  }
  // enforce gesture recognizer order
  for (let i = 0, r; i < recognizers.length; i++) {
    r = recognizers[i];
    if (gs[r.name] && !handled[r.name]) {
      handled[r.name] = true;
      r[type](ev);
    }
  }
}

/**
 * @private
 * @param {TouchEvent} ev Event.
 * @return {void}
 */
function _handleTouchAction(ev) {
  let t = ev.changedTouches[0];
  let type = ev.type;
  if (type === 'touchstart') {
    POINTERSTATE.touch.x = t.clientX;
    POINTERSTATE.touch.y = t.clientY;
    POINTERSTATE.touch.scrollDecided = false;
  } else if (type === 'touchmove') {
    if (POINTERSTATE.touch.scrollDecided) {
      return;
    }
    POINTERSTATE.touch.scrollDecided = true;
    let ta = firstTouchAction(ev);
    let shouldPrevent = false;
    let dx = Math.abs(POINTERSTATE.touch.x - t.clientX);
    let dy = Math.abs(POINTERSTATE.touch.y - t.clientY);
    if (!ev.cancelable) ; else if (ta === 'none') {
      shouldPrevent = true;
    } else if (ta === 'pan-x') {
      shouldPrevent = dy > dx;
    } else if (ta === 'pan-y') {
      shouldPrevent = dx > dy;
    }
    if (shouldPrevent) {
      ev.preventDefault();
    } else {
      prevent('track');
    }
  }
}

/**
 * Adds an event listener to a node for the given gesture type.
 *
 * @param {!EventTarget} node Node to add listener on
 * @param {string} evType Gesture type: `down`, `up`, `track`, or `tap`
 * @param {!function(!Event):void} handler Event listener function to call
 * @return {boolean} Returns true if a gesture event listener was added.
 */
function addListener(node, evType, handler) {
  if (gestures[evType]) {
    _add(node, evType, handler);
    return true;
  }
  return false;
}

/**
 * Removes an event listener from a node for the given gesture type.
 *
 * @param {!EventTarget} node Node to remove listener from
 * @param {string} evType Gesture type: `down`, `up`, `track`, or `tap`
 * @param {!function(!Event):void} handler Event listener function previously passed to
 *  `addListener`.
 * @return {boolean} Returns true if a gesture event listener was removed.
 */
function removeListener(node, evType, handler) {
  if (gestures[evType]) {
    _remove(node, evType, handler);
    return true;
  }
  return false;
}

/**
 * automate the event listeners for the native events
 *
 * @private
 * @param {!EventTarget} node Node on which to add the event.
 * @param {string} evType Event type to add.
 * @param {function(!Event)} handler Event handler function.
 * @return {void}
 */
function _add(node, evType, handler) {
  let recognizer = gestures[evType];
  let deps = recognizer.deps;
  let name = recognizer.name;
  let gobj = node[GESTURE_KEY];
  if (!gobj) {
    node[GESTURE_KEY] = gobj = {};
  }
  for (let i = 0, dep, gd; i < deps.length; i++) {
    dep = deps[i];
    // don't add mouse handlers on iOS because they cause gray selection overlays
    if (IS_TOUCH_ONLY && isMouseEvent(dep) && dep !== 'click') {
      continue;
    }
    gd = gobj[dep];
    if (!gd) {
      gobj[dep] = gd = {_count: 0};
    }
    if (gd._count === 0) {
      node.addEventListener(dep, _handleNative, PASSIVE_TOUCH(dep));
    }
    gd[name] = (gd[name] || 0) + 1;
    gd._count = (gd._count || 0) + 1;
  }
  node.addEventListener(evType, handler);
  if (recognizer.touchAction) {
    setTouchAction(node, recognizer.touchAction);
  }
}

/**
 * automate event listener removal for native events
 *
 * @private
 * @param {!EventTarget} node Node on which to remove the event.
 * @param {string} evType Event type to remove.
 * @param {function(!Event): void} handler Event handler function.
 * @return {void}
 */
function _remove(node, evType, handler) {
  let recognizer = gestures[evType];
  let deps = recognizer.deps;
  let name = recognizer.name;
  let gobj = node[GESTURE_KEY];
  if (gobj) {
    for (let i = 0, dep, gd; i < deps.length; i++) {
      dep = deps[i];
      gd = gobj[dep];
      if (gd && gd[name]) {
        gd[name] = (gd[name] || 1) - 1;
        gd._count = (gd._count || 1) - 1;
        if (gd._count === 0) {
          node.removeEventListener(dep, _handleNative, PASSIVE_TOUCH(dep));
        }
      }
    }
  }
  node.removeEventListener(evType, handler);
}

/**
 * Registers a new gesture event recognizer for adding new custom
 * gesture event types.
 *
 * @param {!GestureRecognizer} recog Gesture recognizer descriptor
 * @return {void}
 */
function register$1(recog) {
  recognizers.push(recog);
  for (let i = 0; i < recog.emits.length; i++) {
    gestures[recog.emits[i]] = recog;
  }
}

/**
 * @private
 * @param {string} evName Event name.
 * @return {Object} Returns the gesture for the given event name.
 */
function _findRecognizerByEvent(evName) {
  for (let i = 0, r; i < recognizers.length; i++) {
    r = recognizers[i];
    for (let j = 0, n; j < r.emits.length; j++) {
      n = r.emits[j];
      if (n === evName) {
        return r;
      }
    }
  }
  return null;
}

/**
 * Sets scrolling direction on node.
 *
 * This value is checked on first move, thus it should be called prior to
 * adding event listeners.
 *
 * @param {!EventTarget} node Node to set touch action setting on
 * @param {string} value Touch action value
 * @return {void}
 */
function setTouchAction(node, value) {
  if (HAS_NATIVE_TA && node instanceof HTMLElement) {
    // NOTE: add touchAction async so that events can be added in
    // custom element constructors. Otherwise we run afoul of custom
    // elements restriction against settings attributes (style) in the
    // constructor.
    microTask.run(() => {
      node.style.touchAction = value;
    });
  }
  node[TOUCH_ACTION] = value;
}

/**
 * Dispatches an event on the `target` element of `type` with the given
 * `detail`.
 * @private
 * @param {!EventTarget} target The element on which to fire an event.
 * @param {string} type The type of event to fire.
 * @param {!Object=} detail The detail object to populate on the event.
 * @return {void}
 */
function _fire(target, type, detail) {
  let ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
  ev.detail = detail;
  wrap(/** @type {!Node} */(target)).dispatchEvent(ev);
  // forward `preventDefault` in a clean way
  if (ev.defaultPrevented) {
    let preventer = detail.preventer || detail.sourceEvent;
    if (preventer && preventer.preventDefault) {
      preventer.preventDefault();
    }
  }
}

/**
 * Prevents the dispatch and default action of the given event name.
 *
 * @param {string} evName Event name.
 * @return {void}
 */
function prevent(evName) {
  let recognizer = _findRecognizerByEvent(evName);
  if (recognizer.info) {
    recognizer.info.prevent = true;
  }
}

/* eslint-disable valid-jsdoc */

register$1({
  name: 'downup',
  deps: ['mousedown', 'touchstart', 'touchend'],
  flow: {
    start: ['mousedown', 'touchstart'],
    end: ['mouseup', 'touchend']
  },
  emits: ['down', 'up'],

  info: {
    movefn: null,
    upfn: null
  },

  /**
   * @this {GestureRecognizer}
   * @return {void}
   */
  reset: function() {
    untrackDocument(this.info);
  },

  /**
   * @this {GestureRecognizer}
   * @param {MouseEvent} e
   * @return {void}
   */
  mousedown: function(e) {
    if (!hasLeftMouseButton(e)) {
      return;
    }
    let t = _findOriginalTarget(e);
    let self = this;
    let movefn = function movefn(e) {
      if (!hasLeftMouseButton(e)) {
        downupFire('up', t, e);
        untrackDocument(self.info);
      }
    };
    let upfn = function upfn(e) {
      if (hasLeftMouseButton(e)) {
        downupFire('up', t, e);
      }
      untrackDocument(self.info);
    };
    trackDocument(this.info, movefn, upfn);
    downupFire('down', t, e);
  },
  /**
   * @this {GestureRecognizer}
   * @param {TouchEvent} e
   * @return {void}
   */
  touchstart: function(e) {
    downupFire('down', _findOriginalTarget(e), e.changedTouches[0], e);
  },
  /**
   * @this {GestureRecognizer}
   * @param {TouchEvent} e
   * @return {void}
   */
  touchend: function(e) {
    downupFire('up', _findOriginalTarget(e), e.changedTouches[0], e);
  }
});

/**
 * @param {string} type
 * @param {EventTarget} target
 * @param {Event|Touch} event
 * @param {Event=} preventer
 * @return {void}
 */
function downupFire(type, target, event, preventer) {
  if (!target) {
    return;
  }
  _fire(target, type, {
    x: event.clientX,
    y: event.clientY,
    sourceEvent: event,
    preventer: preventer,
    prevent: function(e) {
      return prevent(e);
    }
  });
}

register$1({
  name: 'track',
  touchAction: 'none',
  deps: ['mousedown', 'touchstart', 'touchmove', 'touchend'],
  flow: {
    start: ['mousedown', 'touchstart'],
    end: ['mouseup', 'touchend']
  },
  emits: ['track'],

  info: {
    x: 0,
    y: 0,
    state: 'start',
    started: false,
    moves: [],
    /** @this {GestureInfo} */
    addMove: function(move) {
      if (this.moves.length > TRACK_LENGTH) {
        this.moves.shift();
      }
      this.moves.push(move);
    },
    movefn: null,
    upfn: null,
    prevent: false
  },

  /**
   * @this {GestureRecognizer}
   * @return {void}
   */
  reset: function() {
    this.info.state = 'start';
    this.info.started = false;
    this.info.moves = [];
    this.info.x = 0;
    this.info.y = 0;
    this.info.prevent = false;
    untrackDocument(this.info);
  },

  /**
   * @this {GestureRecognizer}
   * @param {MouseEvent} e
   * @return {void}
   */
  mousedown: function(e) {
    if (!hasLeftMouseButton(e)) {
      return;
    }
    let t = _findOriginalTarget(e);
    let self = this;
    let movefn = function movefn(e) {
      let x = e.clientX, y = e.clientY;
      if (trackHasMovedEnough(self.info, x, y)) {
        // first move is 'start', subsequent moves are 'move', mouseup is 'end'
        self.info.state = self.info.started ? (e.type === 'mouseup' ? 'end' : 'track') : 'start';
        if (self.info.state === 'start') {
          // if and only if tracking, always prevent tap
          prevent('tap');
        }
        self.info.addMove({x: x, y: y});
        if (!hasLeftMouseButton(e)) {
          // always fire "end"
          self.info.state = 'end';
          untrackDocument(self.info);
        }
        if (t) {
          trackFire(self.info, t, e);
        }
        self.info.started = true;
      }
    };
    let upfn = function upfn(e) {
      if (self.info.started) {
        movefn(e);
      }

      // remove the temporary listeners
      untrackDocument(self.info);
    };
    // add temporary document listeners as mouse retargets
    trackDocument(this.info, movefn, upfn);
    this.info.x = e.clientX;
    this.info.y = e.clientY;
  },
  /**
   * @this {GestureRecognizer}
   * @param {TouchEvent} e
   * @return {void}
   */
  touchstart: function(e) {
    let ct = e.changedTouches[0];
    this.info.x = ct.clientX;
    this.info.y = ct.clientY;
  },
  /**
   * @this {GestureRecognizer}
   * @param {TouchEvent} e
   * @return {void}
   */
  touchmove: function(e) {
    let t = _findOriginalTarget(e);
    let ct = e.changedTouches[0];
    let x = ct.clientX, y = ct.clientY;
    if (trackHasMovedEnough(this.info, x, y)) {
      if (this.info.state === 'start') {
        // if and only if tracking, always prevent tap
        prevent('tap');
      }
      this.info.addMove({x: x, y: y});
      trackFire(this.info, t, ct);
      this.info.state = 'track';
      this.info.started = true;
    }
  },
  /**
   * @this {GestureRecognizer}
   * @param {TouchEvent} e
   * @return {void}
   */
  touchend: function(e) {
    let t = _findOriginalTarget(e);
    let ct = e.changedTouches[0];
    // only trackend if track was started and not aborted
    if (this.info.started) {
      // reset started state on up
      this.info.state = 'end';
      this.info.addMove({x: ct.clientX, y: ct.clientY});
      trackFire(this.info, t, ct);
    }
  }
});

/**
 * @param {!GestureInfo} info
 * @param {number} x
 * @param {number} y
 * @return {boolean}
 */
function trackHasMovedEnough(info, x, y) {
  if (info.prevent) {
    return false;
  }
  if (info.started) {
    return true;
  }
  let dx = Math.abs(info.x - x);
  let dy = Math.abs(info.y - y);
  return (dx >= TRACK_DISTANCE || dy >= TRACK_DISTANCE);
}

/**
 * @param {!GestureInfo} info
 * @param {?EventTarget} target
 * @param {Touch} touch
 * @return {void}
 */
function trackFire(info, target, touch) {
  if (!target) {
    return;
  }
  let secondlast = info.moves[info.moves.length - 2];
  let lastmove = info.moves[info.moves.length - 1];
  let dx = lastmove.x - info.x;
  let dy = lastmove.y - info.y;
  let ddx, ddy = 0;
  if (secondlast) {
    ddx = lastmove.x - secondlast.x;
    ddy = lastmove.y - secondlast.y;
  }
  _fire(target, 'track', {
    state: info.state,
    x: touch.clientX,
    y: touch.clientY,
    dx: dx,
    dy: dy,
    ddx: ddx,
    ddy: ddy,
    sourceEvent: touch,
    hover: function() {
      return deepTargetFind(touch.clientX, touch.clientY);
    }
  });
}

register$1({
  name: 'tap',
  deps: ['mousedown', 'click', 'touchstart', 'touchend'],
  flow: {
    start: ['mousedown', 'touchstart'],
    end: ['click', 'touchend']
  },
  emits: ['tap'],
  info: {
    x: NaN,
    y: NaN,
    prevent: false
  },
  /**
   * @this {GestureRecognizer}
   * @return {void}
   */
  reset: function() {
    this.info.x = NaN;
    this.info.y = NaN;
    this.info.prevent = false;
  },
  /**
   * @this {GestureRecognizer}
   * @param {MouseEvent} e
   * @return {void}
   */
  mousedown: function(e) {
    if (hasLeftMouseButton(e)) {
      this.info.x = e.clientX;
      this.info.y = e.clientY;
    }
  },
  /**
   * @this {GestureRecognizer}
   * @param {MouseEvent} e
   * @return {void}
   */
  click: function(e) {
    if (hasLeftMouseButton(e)) {
      trackForward(this.info, e);
    }
  },
  /**
   * @this {GestureRecognizer}
   * @param {TouchEvent} e
   * @return {void}
   */
  touchstart: function(e) {
    const touch = e.changedTouches[0];
    this.info.x = touch.clientX;
    this.info.y = touch.clientY;
  },
  /**
   * @this {GestureRecognizer}
   * @param {TouchEvent} e
   * @return {void}
   */
  touchend: function(e) {
    trackForward(this.info, e.changedTouches[0], e);
  }
});

/**
 * @param {!GestureInfo} info
 * @param {Event | Touch} e
 * @param {Event=} preventer
 * @return {void}
 */
function trackForward(info, e, preventer) {
  let dx = Math.abs(e.clientX - info.x);
  let dy = Math.abs(e.clientY - info.y);
  // find original target from `preventer` for TouchEvents, or `e` for MouseEvents
  let t = _findOriginalTarget((preventer || e));
  if (!t || (canBeDisabled[/** @type {!HTMLElement} */(t).localName] && t.hasAttribute('disabled'))) {
    return;
  }
  // dx,dy can be NaN if `click` has been simulated and there was no `down` for `start`
  if (isNaN(dx) || isNaN(dy) || (dx <= TAP_DISTANCE && dy <= TAP_DISTANCE) || isSyntheticClick(e)) {
    // prevent taps from being generated if an event has canceled them
    if (!info.prevent) {
      _fire(t, 'tap', {
        x: e.clientX,
        y: e.clientY,
        sourceEvent: e,
        preventer: preventer
      });
    }
  }
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Element class mixin that provides API for adding Polymer's cross-platform
 * gesture events to nodes.
 *
 * The API is designed to be compatible with override points implemented
 * in `TemplateStamp` such that declarative event listeners in
 * templates will support gesture events when this mixin is applied along with
 * `TemplateStamp`.
 *
 * @mixinFunction
 * @polymer
 * @summary Element class mixin that provides API for adding Polymer's
 *   cross-platform gesture events to nodes
 * @template T
 * @param {function(new:T)} superClass Class to apply mixin to.
 * @return {function(new:T)} superClass with mixin applied.
 */
const GestureEventListeners = dedupingMixin((superClass) => {
  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_GestureEventListeners}
   */
  class GestureEventListeners extends superClass {
    /**
     * Add the event listener to the node if it is a gestures event.
     *
     * @param {!EventTarget} node Node to add event listener to
     * @param {string} eventName Name of event
     * @param {function(!Event):void} handler Listener function to add
     * @return {void}
     * @override
     */
    _addEventListenerToNode(node, eventName, handler) {
      if (!addListener(node, eventName, handler)) {
        super._addEventListenerToNode(node, eventName, handler);
      }
    }

    /**
     * Remove the event listener to the node if it is a gestures event.
     *
     * @param {!EventTarget} node Node to remove event listener from
     * @param {string} eventName Name of event
     * @param {function(!Event):void} handler Listener function to remove
     * @return {void}
     * @override
     */
    _removeEventListenerFromNode(node, eventName, handler) {
      if (!removeListener(node, eventName, handler)) {
        super._removeEventListenerFromNode(node, eventName, handler);
      }
    }
  }

  return GestureEventListeners;
});

/**
 * @polymerMixin
 */
const ThemePropertyMixin = superClass => class VaadinThemePropertyMixin extends superClass {
  static get properties() {
    return {
      /**
       * Helper property with theme attribute value facilitating propagation
       * in shadow DOM.
       *
       * Enables the component implementation to propagate the `theme`
       * attribute value to the subcomponents in Shadow DOM by binding
       * the subcomponent’s "theme" attribute to the `theme` property of
       * the host.
       *
       * **NOTE:** Extending the mixin only provides the property for binding,
       * and does not make the propagation alone.
       *
       * See [Theme Attribute and Subcomponents](https://github.com/vaadin/vaadin-themable-mixin/wiki/5.-Theme-Attribute-and-Subcomponents).
       * page for more information.
       *
       * @protected
       */
      theme: {
        type: String,
        readOnly: true
      }
    };
  }

  /** @protected */
  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);

    if (name === 'theme') {
      this._setTheme(newValue);
    }
  }
};

/**
 * @polymerMixin
 * @mixes ThemePropertyMixin
 */
const ThemableMixin = superClass => class VaadinThemableMixin extends ThemePropertyMixin(superClass) {

  /** @protected */
  static finalize() {
    super.finalize();

    const template = this.prototype._template;

    const hasOwnTemplate = this.template && this.template.parentElement && this.template.parentElement.id === this.is;
    const inheritedTemplate = Object.getPrototypeOf(this.prototype)._template;
    if (inheritedTemplate && !hasOwnTemplate) {
      // The element doesn't define its own template -> include the theme modules from the inherited template
      Array.from(inheritedTemplate.content.querySelectorAll('style[include]')).forEach(s => {
        this._includeStyle(s.getAttribute('include'), template);
      });
    }

    this._includeMatchingThemes(template);
  }

  /** @private */
  static _includeMatchingThemes(template) {
    const domModule = DomModule;
    const modules = domModule.prototype.modules;

    let hasThemes = false;
    const defaultModuleName = this.is + '-default-theme';

    Object.keys(modules)
      .sort((moduleNameA, moduleNameB) => {
        const vaadinA = moduleNameA.indexOf('vaadin-') === 0;
        const vaadinB = moduleNameB.indexOf('vaadin-') === 0;

        const vaadinThemePrefixes = ['lumo-', 'material-'];
        const vaadinThemeA = vaadinThemePrefixes.filter(prefix => moduleNameA.indexOf(prefix) === 0).length > 0;
        const vaadinThemeB = vaadinThemePrefixes.filter(prefix => moduleNameB.indexOf(prefix) === 0).length > 0;

        if (vaadinA !== vaadinB) {
          // Include vaadin core styles first
          return vaadinA ? -1 : 1;
        } else if (vaadinThemeA !== vaadinThemeB) {
          // Include vaadin theme styles after that
          return vaadinThemeA ? -1 : 1;
        } else {
          // Lastly include custom styles so they override all vaadin styles
          return 0;
        }
      })
      .forEach(moduleName => {
        if (moduleName !== defaultModuleName) {
          const themeFor = modules[moduleName].getAttribute('theme-for');
          if (themeFor) {
            themeFor.split(' ').forEach(themeForToken => {
              if (new RegExp('^' + themeForToken.split('*').join('.*') + '$').test(this.is)) {
                hasThemes = true;
                this._includeStyle(moduleName, template);
              }
            });
          }
        }
      });

    if (!hasThemes && modules[defaultModuleName]) {
      // No theme modules found, include the default module if it exists
      this._includeStyle(defaultModuleName, template);
    }
  }

  /** @private */
  static _includeStyle(moduleName, template) {
    if (template && !template.content.querySelector(`style[include="${moduleName}"]`)) {
      const styleEl = document.createElement('style');
      styleEl.setAttribute('include', moduleName);
      template.content.appendChild(styleEl);
    }
  }

};

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
// We consider the keyboard to be active if the window has received a keydown
// event since the last mousedown event.
let keyboardActive = false;

// Listen for top-level keydown and mousedown events.
// Use capture phase so we detect events even if they're handled.
window.addEventListener(
  'keydown',
  () => {
    keyboardActive = true;
  },
  {capture: true}
);

window.addEventListener(
  'mousedown',
  () => {
    keyboardActive = false;
  },
  {capture: true}
);

/**
 * A private mixin to avoid problems with dynamic properties and Polymer Analyzer.
 * No need to expose these properties in the API docs.
 * @polymerMixin
 * @private
 */
const TabIndexMixin = superClass => class VaadinTabIndexMixin extends superClass {
  static get properties() {
    var properties = {
      /**
       * Internal property needed to listen to `tabindex` attribute changes.
       *
       * For changing the tabindex of this component use the native `tabIndex` property.
       * @private
       */
      tabindex: {
        type: Number,
        value: 0,
        reflectToAttribute: true,
        observer: '_tabindexChanged'
      }
    };

    if (window.ShadyDOM) {
      // ShadyDOM browsers need the `tabIndex` in order to notify when the user changes it programmatically.
      properties['tabIndex'] = properties.tabindex;
    }

    return properties;
  }
};

/**
 * Polymer.IronControlState is not a proper 2.0 class, also, its tabindex
 * implementation fails in the shadow dom, so we have this for vaadin elements.
 * @polymerMixin
 */
const ControlStateMixin = superClass => class VaadinControlStateMixin extends TabIndexMixin(superClass) {
  static get properties() {
    return {
      /**
       * Specify that this control should have input focus when the page loads.
       */
      autofocus: {
        type: Boolean
      },

      /**
       * Stores the previous value of tabindex attribute of the disabled element
       * @private
       */
      _previousTabIndex: {
        type: Number
      },

      /**
       * If true, the user cannot interact with this element.
       */
      disabled: {
        type: Boolean,
        observer: '_disabledChanged',
        reflectToAttribute: true
      },

      /**
       * @private
       */
      _isShiftTabbing: {
        type: Boolean
      }
    };
  }

  /**
   * @protected
   */
  ready() {
    this.addEventListener('focusin', e => {
      if (e.composedPath()[0] === this) {
        // Only focus if the focus is received from somewhere outside
        if (!this.contains(e.relatedTarget)) {
          this._focus();
        }
      } else if (e.composedPath().indexOf(this.focusElement) !== -1 && !this.disabled) {
        this._setFocused(true);
      }
    });
    this.addEventListener('focusout', e => this._setFocused(false));

    // In super.ready() other 'focusin' and 'focusout' listeners might be
    // added, so we call it after our own ones to ensure they execute first.
    // Issue to watch out: when incorrect, <vaadin-combo-box> refocuses the
    // input field on iOS after “Done” is pressed.
    super.ready();

    // This fixes the bug in Firefox 61 (https://bugzilla.mozilla.org/show_bug.cgi?id=1472887)
    // where focusout event does not go out of shady DOM because composed property in the event is not true
    const ensureEventComposed = e => {
      if (!e.composed) {
        e.target.dispatchEvent(new CustomEvent(e.type, {
          bubbles: true,
          composed: true,
          cancelable: false
        }));
      }
    };
    this.shadowRoot.addEventListener('focusin', ensureEventComposed);
    this.shadowRoot.addEventListener('focusout', ensureEventComposed);

    this.addEventListener('keydown', e => {
      if (!e.defaultPrevented && e.keyCode === 9) {
        if (e.shiftKey) {
          // Flag is checked in _focus event handler.
          this._isShiftTabbing = true;
          HTMLElement.prototype.focus.apply(this);
          this._setFocused(false);
          // Event handling in IE is asynchronous and the flag is removed asynchronously as well
          setTimeout(() => this._isShiftTabbing = false, 0);
        } else {
          // Workaround for FF63-65 bug that causes the focus to get lost when
          // blurring a slotted component with focusable shadow root content
          // https://bugzilla.mozilla.org/show_bug.cgi?id=1528686
          // TODO: Remove when safe
          const firefox = window.navigator.userAgent.match(/Firefox\/(\d\d\.\d)/);
          if (firefox
            && parseFloat(firefox[1]) >= 63
            && parseFloat(firefox[1]) < 66
            && this.parentNode
            && this.nextSibling) {
            const fakeTarget = document.createElement('input');
            fakeTarget.style.position = 'absolute';
            fakeTarget.style.opacity = '0';
            fakeTarget.tabIndex = this.tabIndex;

            this.parentNode.insertBefore(fakeTarget, this.nextSibling);
            fakeTarget.focus();
            fakeTarget.addEventListener('focusout', () => this.parentNode.removeChild(fakeTarget));
          }
        }

      }
    });

    if (this.autofocus && !this.disabled) {
      window.requestAnimationFrame(() => {
        this._focus();
        this._setFocused(true);
        this.setAttribute('focus-ring', '');
      });
    }
  }

  /**
   * @protected
   */
  disconnectedCallback() {
    super.disconnectedCallback();

    // in non-Chrome browsers, blur does not fire on the element when it is disconnected.
    // reproducible in `<vaadin-date-picker>` when closing on `Cancel` or `Today` click.
    if (this.hasAttribute('focused')) {
      this._setFocused(false);
    }
  }

  /**
   * @param {boolean} focused
   * @protected
   */
  _setFocused(focused) {
    if (focused) {
      this.setAttribute('focused', '');
    } else {
      this.removeAttribute('focused');
    }

    // focus-ring is true when the element was focused from the keyboard.
    // Focus Ring [A11ycasts]: https://youtu.be/ilj2P5-5CjI
    if (focused && keyboardActive) {
      this.setAttribute('focus-ring', '');
    } else {
      this.removeAttribute('focus-ring');
    }
  }

  /**
   * Any element extending this mixin is required to implement this getter.
   * It returns the actual focusable element in the component.
   * @return {Element | null | undefined}
   */
  get focusElement() {
    window.console.warn(`Please implement the 'focusElement' property in <${this.localName}>`);
    return this;
  }

  /**
   * @protected
   */
  _focus() {
    if (!this.focusElement || this._isShiftTabbing) {
      return;
    }

    this.focusElement.focus();
    this._setFocused(true);
  }

  /**
   * Moving the focus from the host element causes firing of the blur event what leads to problems in IE.
   * @private
   */
  focus() {
    if (!this.focusElement || this.disabled) {
      return;
    }

    this.focusElement.focus();
    this._setFocused(true);
  }

  /**
   * Native bluring in the host element does nothing because it does not have the focus.
   * In chrome it works, but not in FF.
   * @private
   */
  blur() {
    if (!this.focusElement) {
      return;
    }
    this.focusElement.blur();
    this._setFocused(false);
  }

  /**
   * @param {boolean} disabled
   * @private
   */
  _disabledChanged(disabled) {
    this.focusElement.disabled = disabled;
    if (disabled) {
      this.blur();
      this._previousTabIndex = this.tabindex;
      this.tabindex = -1;
      this.setAttribute('aria-disabled', 'true');
    } else {
      if (typeof this._previousTabIndex !== 'undefined') {
        this.tabindex = this._previousTabIndex;
      }
      this.removeAttribute('aria-disabled');
    }
  }

  /**
   * @param {number | null | undefined} tabindex
   * @private
   */
  _tabindexChanged(tabindex) {
    if (tabindex !== undefined) {
      this.focusElement.tabIndex = tabindex;
    }

    if (this.disabled && this.tabindex) {
      // If tabindex attribute was changed while checkbox was disabled
      if (this.tabindex !== -1) {
        this._previousTabIndex = this.tabindex;
      }
      this.tabindex = tabindex = undefined;
    }

    if (window.ShadyDOM) {
      this.setProperties({tabIndex: tabindex, tabindex: tabindex});
    }
  }

  /**
   * @protected
   */
  click() {
    if (!this.disabled) {
      super.click();
    }
  }
};

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Forces several classes of asynchronously queued tasks to flush:
 * - Debouncers added via `enqueueDebouncer`
 * - ShadyDOM distribution
 *
 * @return {void}
 */
const flush = function() {
  let shadyDOM, debouncers;
  do {
    shadyDOM = window.ShadyDOM && ShadyDOM.flush();
    if (window.ShadyCSS && window.ShadyCSS.ScopingShim) {
      window.ShadyCSS.ScopingShim.flush();
    }
    debouncers = flushDebouncers();
  } while (shadyDOM || debouncers);
};

/**
@license
Copyright (c) 2020 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/**
 * Helper that provides a set of functions for RTL.
 */
class DirHelper {
  /**
   * Get the scroll type in the current browser view.
   *
   * @return {string} the scroll type. Possible values are `default|reverse|negative`
   */
  static detectScrollType() {
    const dummy = document.createElement('div');
    dummy.textContent = 'ABCD';
    dummy.dir = 'rtl';
    dummy.style.fontSize = '14px';
    dummy.style.width = '4px';
    dummy.style.height = '1px';
    dummy.style.position = 'absolute';
    dummy.style.top = '-1000px';
    dummy.style.overflow = 'scroll';
    document.body.appendChild(dummy);

    let cachedType = 'reverse';
    if (dummy.scrollLeft > 0) {
      cachedType = 'default';
    } else {
      dummy.scrollLeft = 2;
      if (dummy.scrollLeft < 2) {
        cachedType = 'negative';
      }
    }
    document.body.removeChild(dummy);
    return cachedType;
  }

  /**
   * Get the scrollLeft value of the element relative to the direction
   *
   * @param {string} scrollType type of the scroll detected with `detectScrollType`
   * @param {string} direction current direction of the element
   * @param {Element} element
   * @return {number} the scrollLeft value.
  */
  static getNormalizedScrollLeft(scrollType, direction, element) {
    const {scrollLeft} = element;
    if (direction !== 'rtl' || !scrollType) {
      return scrollLeft;
    }

    switch (scrollType) {
      case 'negative':
        return element.scrollWidth - element.clientWidth + scrollLeft;
      case 'reverse':
        return element.scrollWidth - element.clientWidth - scrollLeft;
    }
    return scrollLeft;
  }

  /**
   * Set the scrollLeft value of the element relative to the direction
   *
   * @param {string} scrollType type of the scroll detected with `detectScrollType`
   * @param {string} direction current direction of the element
   * @param {Element} element
   * @param {number} scrollLeft the scrollLeft value to be set
   */
  static setNormalizedScrollLeft(scrollType, direction, element, scrollLeft) {
    if (direction !== 'rtl' || !scrollType) {
      element.scrollLeft = scrollLeft;
      return;
    }

    switch (scrollType) {
      case 'negative':
        element.scrollLeft = element.clientWidth - element.scrollWidth + scrollLeft;
        break;
      case 'reverse':
        element.scrollLeft = element.scrollWidth - element.clientWidth - scrollLeft;
        break;
      default:
        element.scrollLeft = scrollLeft;
        break;
    }
  }
}

/**
 * Array of Vaadin custom element classes that have been subscribed to the dir changes.
 */
const directionSubscribers = [];
const directionUpdater = function() {
  const documentDir = getDocumentDir();
  directionSubscribers.forEach(element => {
    alignDirs(element, documentDir);
  });
};

let scrollType;

const directionObserver = new MutationObserver(directionUpdater);
directionObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['dir']});

const alignDirs = function(element, documentDir) {
  if (documentDir) {
    element.setAttribute('dir', documentDir);
  } else {
    element.removeAttribute('dir');
  }
};

const getDocumentDir = function() {
  return document.documentElement.getAttribute('dir');
};

/**
 * @polymerMixin
 */
const DirMixin = superClass => class VaadinDirMixin extends superClass {
  static get properties() {
    return {
      /**
       * @protected
       */
      dir: {
        type: String,
        readOnly: true
      }
    };
  }

  /** @protected */
  static finalize() {
    super.finalize();

    if (!scrollType) {
      scrollType = DirHelper.detectScrollType();
    }
  }

  /** @protected */
  connectedCallback() {
    super.connectedCallback();

    if (!this.hasAttribute('dir')) {
      this.__subscribe();
      alignDirs(this, getDocumentDir());
    }
  }

  /** @protected */
  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name !== 'dir') {
      return;
    }

    // New value equals to the document direction and the element is not subscribed to the changes
    const newValueEqlDocDir = newValue === getDocumentDir() && directionSubscribers.indexOf(this) === -1;
    // Value was emptied and the element is not subscribed to the changes
    const newValueEmptied = !newValue && oldValue && directionSubscribers.indexOf(this) === -1;
    // New value is different and the old equals to document direction and the element is not subscribed to the changes
    const newDiffValue = newValue !== getDocumentDir() && oldValue === getDocumentDir();

    if (newValueEqlDocDir || newValueEmptied) {
      this.__subscribe();
      alignDirs(this, getDocumentDir());
    } else if (newDiffValue) {
      this.__subscribe(false);
    }
  }

  /** @protected */
  disconnectedCallback() {
    super.disconnectedCallback();
    this.__subscribe(false);
    this.removeAttribute('dir');
  }

  /** @private */
  __subscribe(push = true) {
    if (push) {
      directionSubscribers.indexOf(this) === -1 &&
        directionSubscribers.push(this);
    } else {
      directionSubscribers.indexOf(this) > -1 &&
        directionSubscribers.splice(directionSubscribers.indexOf(this), 1);
    }
  }

  /**
   * @param {Element} element
   * @return {number}
   * @protected
   */
  __getNormalizedScrollLeft(element) {
    return DirHelper.getNormalizedScrollLeft(scrollType, this.getAttribute('dir') || 'ltr', element);
  }

  /**
   * @param {Element} element
   * @param {number} scrollLeft
   * @protected
   */
  __setNormalizedScrollLeft(element, scrollLeft) {
    return DirHelper.setNormalizedScrollLeft(scrollType, this.getAttribute('dir') || 'ltr', element, scrollLeft);
  }
};

if (!window.Vaadin) {
  window['Vaadin'] = {};
}

/**
 * Array of Vaadin custom element classes that have been finalized.
 */
window['Vaadin'].registrations = window.Vaadin.registrations || [];

// Use the hack to prevent polymer-modulizer from converting to exports
window['Vaadin'].developmentModeCallback = window.Vaadin.developmentModeCallback || {};
window['Vaadin'].developmentModeCallback['vaadin-usage-statistics'] = function() {
};

let statsJob;

const registered = new Set();

/**
 * @polymerMixin
 * @mixes DirMixin
 */
const ElementMixin$1 = superClass => class VaadinElementMixin extends DirMixin(superClass) {
  /** @protected */
  static finalize() {
    super.finalize();

    const {is} = this;

    // Registers a class prototype for telemetry purposes.
    if (is && !registered.has(is)) {
      window.Vaadin.registrations.push(this);
      registered.add(is);

      if (window.Vaadin.developmentModeCallback) {
        statsJob = Debouncer.debounce(statsJob,
          idlePeriod, () => {
            window.Vaadin.developmentModeCallback['vaadin-usage-statistics']();
          }
        );
        enqueueDebouncer(statsJob);
      }
    }
  }

  constructor() {
    super();
    if (document.doctype === null) {
      console.warn(
        'Vaadin components require the "standards mode" declaration. Please add <!DOCTYPE html> to the HTML document.'
      );
    }
  }
};

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/**
 * `<vaadin-button>` is a Web Component providing an accessible and customizable button.
 *
 * ```html
 * <vaadin-button>
 * </vaadin-button>
 * ```
 *
 * ```js
 * document.querySelector('vaadin-button').addEventListener('click', () => alert('Hello World!'));
 * ```
 *
 * ### Styling
 *
 * The following shadow DOM parts are exposed for styling:
 *
 * Part name | Description
 * ----------------|----------------
 * `label` | The label (text) inside the button
 * `prefix` | A slot for e.g. an icon before the label
 * `suffix` | A slot for e.g. an icon after the label
 *
 *
 * The following attributes are exposed for styling:
 *
 * Attribute | Description
 * --------- | -----------
 * `active` | Set when the button is pressed down, either with mouse, touch or the keyboard.
 * `disabled` | Set when the button is disabled.
 * `focus-ring` | Set when the button is focused using the keyboard.
 * `focused` | Set when the button is focused.
 *
 * See [ThemableMixin – how to apply styles for shadow parts](https://github.com/vaadin/vaadin-themable-mixin/wiki)
 *
 * @extends PolymerElement
 * @mixes ElementMixin
 * @mixes ControlStateMixin
 * @mixes ThemableMixin
 * @mixes GestureEventListeners
 * @demo demo/index.html
 */
class ButtonElement extends
  ElementMixin$1(
    ControlStateMixin(
      ThemableMixin(
        GestureEventListeners(PolymerElement)))) {
  static get template() {
    return html`
    <style>
      :host {
        display: inline-block;
        position: relative;
        outline: none;
        white-space: nowrap;
      }

      :host([hidden]) {
        display: none !important;
      }

      /* Ensure the button is always aligned on the baseline */
      .vaadin-button-container::before {
        content: "\\2003";
        display: inline-block;
        width: 0;
      }

      .vaadin-button-container {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        width: 100%;
        height: 100%;
        min-height: inherit;
        text-shadow: inherit;
        -webkit-user-select: none;
        -moz-user-select: none;
        user-select: none;
      }

      [part="prefix"],
      [part="suffix"] {
        flex: none;
      }

      [part="label"] {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #button {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: inherit;
      }
    </style>
    <div class="vaadin-button-container">
      <div part="prefix">
        <slot name="prefix"></slot>
      </div>
      <div part="label">
        <slot></slot>
      </div>
      <div part="suffix">
        <slot name="suffix"></slot>
      </div>
    </div>
    <button id="button" type="button"></button>
`;
  }

  static get is() {
    return 'vaadin-button';
  }

  static get version() {
    return '2.4.0';
  }

  ready() {
    super.ready();

    // Leaving default role in the native button, makes navigation announcement
    // being different when using focus navigation (tab) versus using normal
    // navigation (arrows). The first way announces the label on a button
    // since the focus is moved programmatically, and the second on a group.
    this.setAttribute('role', 'button');
    this.$.button.setAttribute('role', 'presentation');

    this._addActiveListeners();

    // Fix for https://github.com/vaadin/vaadin-button-flow/issues/120
    window.ShadyDOM && window.ShadyDOM.flush();
  }

  /**
   * @protected
   */
  disconnectedCallback() {
    super.disconnectedCallback();

    // `active` state is preserved when the element is disconnected between keydown and keyup events.
    // reproducible in `<vaadin-date-picker>` when closing on `Cancel` or `Today` click.
    if (this.hasAttribute('active')) {
      this.removeAttribute('active');
    }
  }

  /** @private */
  _addActiveListeners() {
    addListener(this, 'down', () => !this.disabled && this.setAttribute('active', ''));
    addListener(this, 'up', () => this.removeAttribute('active'));
    this.addEventListener('keydown', e => !this.disabled && [13, 32].indexOf(e.keyCode) >= 0 && this.setAttribute('active', ''));
    this.addEventListener('keyup', () => this.removeAttribute('active'));
    this.addEventListener('blur', () => this.removeAttribute('active'));
  }

  /**
   * @protected
   * @return {Element}
   */
  get focusElement() {
    return this.$.button;
  }
}

customElements.define(ButtonElement.is, ButtonElement);

const $_documentContainer$9 = html`<dom-module id="lumo-date-picker-overlay-content" theme-for="vaadin-date-picker-overlay-content">
  <template>
    <style>
      :host {
        position: relative;
        background-color: transparent;
        /* Background for the year scroller, placed here as we are using a mask image on the actual years part */
        background-image: linear-gradient(var(--lumo-shade-5pct), var(--lumo-shade-5pct));
        background-size: 57px 100%;
        background-position: top right;
        background-repeat: no-repeat;
        cursor: default;
      }

      /* Month scroller */

      [part="months"] {
        /* Month calendar height:
              header height + margin-bottom
            + weekdays height + margin-bottom
            + date cell heights
            + small margin between month calendars
        */
        --vaadin-infinite-scroller-item-height:
          calc(
              var(--lumo-font-size-l) + var(--lumo-space-m)
            + var(--lumo-font-size-xs) + var(--lumo-space-s)
            + var(--lumo-size-m) * 6
            + var(--lumo-space-s)
          );
        --vaadin-infinite-scroller-buffer-offset: 20%;
        -webkit-mask-image: linear-gradient(transparent, #000 10%, #000 85%, transparent);
        mask-image: linear-gradient(transparent, #000 10%, #000 85%, transparent);
        position: relative;
        margin-right: 57px;
      }

      /* Year scroller */

      [part="years"] {
        /* TODO get rid of fixed magic number */
        --vaadin-infinite-scroller-buffer-width: 97px;
        width: 57px;
        height: auto;
        top: 0;
        bottom: 0;
        font-size: var(--lumo-font-size-s);
        box-shadow: inset 2px 0 4px 0 var(--lumo-shade-5pct);
        -webkit-mask-image: linear-gradient(transparent, #000 35%, #000 65%, transparent);
        mask-image: linear-gradient(transparent, #000 35%, #000 65%, transparent);
      }

      [part="year-number"],
      [part="year-separator"] {
        opacity: 0.5;
        transition: 0.2s opacity;
      }

      [part="years"]:hover [part="year-number"],
      [part="years"]:hover [part="year-separator"] {
        opacity: 1;
      }

      /* TODO unsupported selector */
      #scrollers {
        position: static;
        display: block;
      }

      /* TODO unsupported selector, should fix this in vaadin-date-picker that it adapts to the
       * width of the year scroller */
      #scrollers[desktop] [part="months"] {
        right: auto;
      }

      /* Year scroller position indicator */
      [part="years"]::before {
        border: none;
        width: 1em;
        height: 1em;
        background-color: var(--lumo-base-color);
        background-image: linear-gradient(var(--lumo-tint-5pct), var(--lumo-tint-5pct));
        transform: translate(-75%, -50%) rotate(45deg);
        border-top-right-radius: calc(var(--lumo-border-radius) / 2);
        box-shadow: 2px -2px 6px 0 var(--lumo-shade-5pct);
        z-index: 1;
      }

      [part="year-number"],
      [part="year-separator"] {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 50%;
        transform: translateY(-50%);
      }

      [part="years"] [part="year-separator"]::after {
        color: var(--lumo-disabled-text-color);
        content: "•";
      }

      /* Current year */

      [part="years"] [part="year-number"][current] {
        color: var(--lumo-primary-text-color);
      }

      /* Toolbar (footer) */

      [part="toolbar"] {
        padding: var(--lumo-space-s);
        box-shadow: 0 -1px 0 0 var(--lumo-contrast-10pct);
        border-bottom-left-radius: var(--lumo-border-radius);
        margin-right: 57px;
      }

      @supports (mask-image: linear-gradient(#000, #000)) or (-webkit-mask-image: linear-gradient(#000, #000)) {
        [part="toolbar"] {
          box-shadow: none;
        }
      }

      [part="toolbar"] [part\$="button"] {
        margin: 0;
      }

      /* Narrow viewport mode (fullscreen) */

      :host([fullscreen]) [part="toolbar"] {
        order: -1;
        background-color: var(--lumo-base-color);
      }

      :host([fullscreen]) [part="overlay-header"] {
        order: -2;
        height: var(--lumo-size-m);
        padding: var(--lumo-space-s);
        position: absolute;
        left: 0;
        right: 0;
        justify-content: center;
      }

      :host([fullscreen]) [part="toggle-button"],
      :host([fullscreen]) [part="clear-button"],
      [part="overlay-header"] [part="label"] {
        display: none;
      }

      /* Very narrow screen (year scroller initially hidden) */

      [part="years-toggle-button"] {
        position: relative;
        right: auto;
        display: flex;
        align-items: center;
        height: var(--lumo-size-s);
        padding: 0 0.5em;
        border-radius: var(--lumo-border-radius);
        z-index: 3;
        color: var(--lumo-primary-text-color);
        font-weight: 500;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      :host([years-visible]) [part="years-toggle-button"] {
        background-color: var(--lumo-primary-color);
        color: var(--lumo-primary-contrast-color);
      }

      [part="years-toggle-button"]::before {
        content: none;
      }

      /* TODO magic number (same as used for iron-media-query in vaadin-date-picker-overlay-content) */
      @media screen and (max-width: 374px) {
        :host {
          background-image: none;
        }

        [part="years"] {
          background-color: var(--lumo-shade-5pct);
        }

        [part="toolbar"],
        [part="months"] {
          margin-right: 0;
        }

        /* TODO make date-picker adapt to the width of the years part */
        [part="years"] {
          --vaadin-infinite-scroller-buffer-width: 90px;
          width: 50px;
        }

        :host([years-visible]) [part="months"] {
          padding-left: 50px;
        }
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$9.content);

const $_documentContainer$a = html`<dom-module id="lumo-month-calendar" theme-for="vaadin-month-calendar">
  <template>
    <style>
      :host {
        -moz-user-select: none;
        -ms-user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        font-size: var(--lumo-font-size-m);
        color: var(--lumo-body-text-color);
        text-align: center;
        padding: 0 var(--lumo-space-xs);
      }

      /* Month header */

      [part="month-header"] {
        color: var(--lumo-header-text-color);
        font-size: var(--lumo-font-size-l);
        line-height: 1;
        font-weight: 500;
        margin-bottom: var(--lumo-space-m);
      }

      /* Week days and numbers */

      [part="weekdays"],
      [part="weekday"],
      [part="week-numbers"] {
        font-size: var(--lumo-font-size-xs);
        line-height: 1;
        color: var(--lumo-tertiary-text-color);
      }

      [part="weekdays"] {
        margin-bottom: var(--lumo-space-s);
      }

      /* TODO should have part="week-number" for the cell in weekdays-container */
      [part="weekday"]:empty,
      [part="week-numbers"] {
        width: var(--lumo-size-xs);
      }

      /* Date and week number cells */

      [part="date"],
      [part="week-number"] {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: var(--lumo-size-m);
        position: relative;
      }

      [part="date"] {
        transition: color 0.1s;
      }

      /* Today date */

      [part="date"][today] {
        color: var(--lumo-primary-text-color);
      }

      /* Focused date */

      [part="date"]::before {
        content: "";
        position: absolute;
        z-index: -1;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        min-width: 2em;
        min-height: 2em;
        width: 80%;
        height: 80%;
        max-height: 100%;
        max-width: 100%;
        border-radius: var(--lumo-border-radius);
      }

      [part="date"][focused]::before {
        box-shadow: 0 0 0 2px var(--lumo-primary-color-50pct);
      }

      :host(:not([focused])) [part="date"][focused]::before {
        animation: vaadin-date-picker-month-calendar-focus-date 1.4s infinite;
      }

      @keyframes vaadin-date-picker-month-calendar-focus-date {
        50% {
          box-shadow: 0 0 0 2px transparent;
        }
      }

      /* TODO should not rely on the role attribute */
      [part="date"][role="button"]:not([disabled]):not([selected]):hover::before {
        background-color: var(--lumo-primary-color-10pct);
      }

      [part="date"][selected] {
        color: var(--lumo-primary-contrast-color);
      }

      [part="date"][selected]::before {
        background-color: var(--lumo-primary-color);
      }

      [part="date"][disabled] {
        color: var(--lumo-disabled-text-color);
      }

      @media (pointer: coarse) {
        [part="date"]:hover:not([selected])::before,
        [part="date"][focused]:not([selected])::before {
          display: none;
        }

        [part="date"][role="button"]:not([disabled]):active::before {
          display: block;
        }

        [part="date"][selected]::before {
          box-shadow: none;
        }
      }

      /* Disabled */

      :host([disabled]) * {
        color: var(--lumo-disabled-text-color) !important;
      }
    </style>
  </template>
</dom-module><custom-style>
  <style>
    @keyframes vaadin-date-picker-month-calendar-focus-date {
      50% {
        box-shadow: 0 0 0 2px transparent;
      }
    }
  </style>
</custom-style>`;

document.head.appendChild($_documentContainer$a.content);

const $_documentContainer$b = document.createElement('template');

$_documentContainer$b.innerHTML = `<custom-style>
  <style>
    @font-face {
      font-family: 'lumo-icons';
      src: url(data:application/font-woff;charset=utf-8;base64,d09GRgABAAAAABEcAAsAAAAAIiwAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAABHU1VCAAABCAAAADsAAABUIIslek9TLzIAAAFEAAAAQwAAAFZAIUuKY21hcAAAAYgAAAD4AAADrsCU8d5nbHlmAAACgAAAC2MAABd4h9To2WhlYWQAAA3kAAAAMAAAADZa/6SsaGhlYQAADhQAAAAdAAAAJAbpA35obXR4AAAONAAAABAAAACspBAAAGxvY2EAAA5EAAAAWAAAAFh55IAsbWF4cAAADpwAAAAfAAAAIAFKAXBuYW1lAAAOvAAAATEAAAIuUUJZCHBvc3QAAA/wAAABKwAAAelm8SzVeJxjYGRgYOBiMGCwY2BycfMJYeDLSSzJY5BiYGGAAJA8MpsxJzM9kYEDxgPKsYBpDiBmg4gCACY7BUgAeJxjYGS+yDiBgZWBgamKaQ8DA0MPhGZ8wGDIyAQUZWBlZsAKAtJcUxgcXjG+0mIO+p/FEMUcxDANKMwIkgMABn8MLQB4nO3SWW6DMABF0UtwCEnIPM/zhLK8LqhfXRybSP14XUYtHV9hGYQwQBNIo3cUIPkhQeM7rib1ekqnXg981XuC1qvy84lzojleh3puxL0hPjGjRU473teloEefAUNGjJkwZcacBUtWrNmwZceeA0dOnLlw5cadB09elPGhGf+j0NTI/65KfXerT6JhqKnpRKtgOpuqaTrtKjPUlqHmhto21I7pL6i6hlqY3q7qGWrfUAeGOjTUkaGODXViqFNDnRnq3FAXhro01JWhrg11Y6hbQ90Z6t5QD4Z6NNSToZ4N9WKoV0O9GerdUB+G+jTUl6GWRvkL24BkEXictVh9bFvVFb/nxvbz+7Rf/N6zHcd2bCfP+Wgc1Z9N0jpNnEL6kbRVS6HA2hQYGh9TGR1CbCqa2rXrWOkQE/sHNJgmtZvoVNZqE1B1DNHxzTQxCehUTYiJTQyENui0qSLezr3PduyQfgmRWOfde8+9551z7rnn/O4jLoJ/bRP0UaKQMLFJjpBAvphLZC3Dk0ok7WBzR2/upJs7Ryw/nfFbln/uuN/apCvwrKLrSvUqRufbm5pn0fs0w4gYxnGVP6qHnO4bWiDQGQgwtS6lm3lB3QoX1M2vwEmuzirF39y+Es2+DJ8d1pkyqBIqoze3D1+Zz4DrFoazxI8dWwMrDlZ2DMqQAR9AROsJU+2cmlTPazTco52F1xTa2a2+K8vvq92dVHmtLoPeQX/AZPRYGthDYOeZjBjKoFsVGulR3lWU95WeCK44qHU7MhWUGUKZDT3oKUcG2GWuh+EDDfUYA/jhAhl0TOsJNYSEu7mQmi3UzfXwZKA4BsVsHLXQYGgRW95uEtpJ1Vfn9XiLriRBlFEqxsDjA09yCNUoQxxwd7KWSTt2y3GTKiflqHRSoWZc3m11Wa/fJdFgXD4sSYfleJBKd8GMz7J8dZn/cGRCcKGDnA2Ge3fKzcvlnTDNthGWLXzX/WaXtUAmRgeLlHSr30r0G9UTXMb0AtmwzOoy73fkSlHZkduw/TYuU9cAD4YutPoxTTsA3797wVr4Z/1NC5zARHr4vtxJjxIfiZMhMkbWk+14BnJZKwqGZwDfswLyxWDSg11rFLJF7Nopxjd1h1/QOT+oezgfu3Yq+Hk+duf5x+40o1GTkaIgikK/IEnC6aYxCUBaZJSN4XTYFjU/YMNIKqJwhDGOCCI8FDXnXmXjtGhGJyShqjAOnBOkW2JG9S7GgYeMWAU5JzhnWmBOaOM+CKEPoqSfFDC2Unq+DLlUgUVUFFLZGJg6jtlojsdsa8kPObPuJdi5dnBdBsLJMGTWDa4t2JvtwuPo9s+Y86suv/W33QG1rAaOAUV+vx4K6f2D04PVKlC7WLSrZzAi45ZV6lIC7WoXqmRyvUqoVwrzUoVsIjeTXWQv+RH5GTlBXiB/In8ln0IbBCAFOajAJrgZYyOHWqOfUe/aHjI12R6OQo1jCgt215l+4f6XPb+0MNou0V+43n2F77tSfRb24d7zitgnKmvYHs69zugaPvBwv6ioXkb2LdL65Atw51uLkXlu1bhMMRcXSPcYoqKIRlh34lQP8/5JbuUFye4vxD6/6MxFF11C0uVLr9Ulgw44tS3pMViNLUExbycFgLIct+QDMibRimx1ydUz8FXZiuOIDBOMVX2nUZc+huNE5XUJ81uiJoiabwqaVF0uacKbau/pl4R2VW0XXlJra6boVrYG646TF5NYzwy4vjENVrDlcNpZPl8DH6XX8XWCx0mvWVZY6KFLrvsY66/zPict5FnxaNUR/juvZCM3TvD60E2W1tZizbXTPDuabcm0nbbzpWKpmA1ayBQ8giedLUM+A0kNjBjQjmuYz7YrgIXYvmF63ZLBwSXrpn9Tb9wwdd/U1H0PMQK3XcO8ul3WT7PyPPdpy0TemKxNRcJNauiXJnnUDpUppQWs4SnUIy0EESGYqJYQLGHxzaGWwVIaS6Y7mQFM8ZjYDQ3axjf61SWjU33JwOZA1pwaG1L9mzf71aHRdX1JHw6Fp0aXhNwbqyeGNg4NbdzGCBxoz4ZXjy4Nu69Zr6sDY6vMrLU5nA1P8JkbdWXJ6ERfMryvNh1JfQ9+T4dIhGvK9w3dxjBBzatsQ/MlOHVIDnYpDz6odAXlQ01t2Pa5Iafd8MMpxAeDKP0C6CjgVLT5osB6icUx01lWjXxzT/GyRF2welEM5Z/7jG3VjQ1SrNn5IbyzOG5dobB3/QHxyZvsXcoz8IoEwS7plCg+zxHQk424q9BfEpkESJbFHQusDBSWFkuBkoPO0kLKwRVYjxGXlHTcTDQMJ/H6TX9afkO7mnraTO1feTnZAXLu4cp7HAXMmNG1yeFk9TgS/NHhZR/4QoBTr/ZB+6hCgyl15Nq1UbN6nE1/ZnP1U2cizCBpvs8cJQZJ4LkYx5N/yZPAUZNQQ0V4f3BQllWrK3YRzl30dOT6RVn2upNur6woSa8CqpdT/aKnBM4o3jNur9d9xqtUT6veBEt9Ca9at+ERzEEhUkR8sa5mQ4aVvJoVeEA8zI4ei5mULXFGyU7z/6TAeYLVcpzSWZY8PYYF5yrTV60sT0+XV141vX++Wf16V2bFeGVPZXxFpkvyeKTWLlzfW0mnKxsY6Y3294/0998SCfX1blm5pbcvFGlq/r07MRAMhYIDiW5JFKWW3vdrEpCsZSJG+om7Zu/PSScZJhNkLbmW5Wsr12pWqW5zKtlwRS4bFOxUw17mCzy6lskCDl1WYOGWDYrADrMA7BDDweWWNd5koiJnR1dz+ytLP2q0SqPB1lnK2ccB7RYe4FSoPks3iB3t4txTSHctb2sy1ivk0pvHuCNm6w1f6wxv3+OCgN78LqdQnUVh7R0oTAp0zOf2rbW770Vu5C2dIyGdTnHo8zSji7dppj0USoVCz+lhRMTh53Teq9VbGfbjuSbAooSdXayY4PYHg374C6f7gl1B/DXuJ4/QXxOBdJFJspFsI3egpoWUUCjlTIFnNYNl+ZyZKmBeYKGHkD1QyDlhaKbKwKcIJqJ4TLJ2OmdY/JWXae4DdGBw8HZ7eXcgFF2zr2SoalDry5iKqoa0Puhe3hPQ2s3elTYM+MI+n3rK0KgL7/La3GeMLt6m7u912vGnvtORiIa0qBmhqVi+XW9XNBmqb8eVgKzIHfGI5bNoG7X0UCzeISmqIcO/nY8FH7U8avX9fx/ST+hx0sezPw9Qy8Mum3GWf2N4Uy/yIYGVBXbJHWIZp7dfTcptdMTr9Qmq7DaiK/ukqCL4kt4RUfS5XPnMtmT22/mQFqF7emSqtrlu8SVElxDRJrZODkpuwe0VfTfjdEp1f7A7v+fozNBXUJ/6WTuK2TtFlpFVZAZ3LcFvUi1Z2p2YT+EMAkGJVStOzLTAPg4IqWIAlzRSjOBkl2zxj3TKycpzT/MnvX3uaSMWM+gU0rkXjohhefVRMaps3/kLMSKv23lT23uxQrkQjyOJleMDsdhAnD6ZGElWZ5MjCXzCE/hkWX+WF4knzGhVOyK2eQZekV3eyo0zL8kuYWCnDCvjjhAkcTPOBDXVdoav3HVcFnQjLvtV9S2p0zA6JegPwMQxt+yFb3ll9zGlq/5dRKb3cEyQYoaNYpharJ7xCB7AWxsLY3jjZXY0XsZj0Wjwc9I6PP/dKABnCZaqHpaZEACxk4ZeLZSKNgZABl+lYQX1sJQOSX3n6r410evcoud5JeAGUXVP9H1tZOKejTq4Ono0z0erro1FrnOpohva1d/hTdtVsQdKN5W9RlT3NjD0nznyKNTgKAMfWNWcyodV0IGLPIHOF0o4JyqufaK4z6WIIzuGh3d8c8cwQg8ER+OVxyrjdm8vNuhts4LoOihGxIMuUdgzwiYN7xhh1+oZnJNuTG7gQZvu4XWZ9GAZZjGEubwePqYhtKDTH+9VQkl17/iGybsnJ+8+sKtyPrcll9ty65Zsdst/9iqpEKh7M5VdBxh3csOdNc6tW3I1uyM1PzOXegSOrLFsFNI2O27M+TF2ApnN9MUv5ud6LjxIvEQnHRzxIu4IsA9MLFkJn2tcZoZ7ON7dXe7ujrc8HrusPKamlqXwd77lQUuLpilau4PUMapueBb7irU4RoUXEYXuVuIGlRGmOp+2lNkaRPVziOqmlaZvaqG4dFgSj0jxEJWrv12IUWntmw+rfQarRE0Aph4ocI6nlUlGqs+u3/+T/ethW62PpHp2eHbZstnh/wOO95yDAHicY2BkYGAA4pmJ6QHx/DZfGbiZXwBFGGpUNzQi6P+vmacy3QJyORiYQKIANoULVXicY2BkYGAO+p8FJF8wAAHzVAZGBlSgDQBW9gNvAAAAeJxjYGBgYH4xNDAAzwQmjwAAAAAATgCaAOgBCgEsAU4BcAGaAcQB7gIaApwC6ASaBLwE1gTyBQ4FKgV6BdAF/gZEBmYGtgcYB5AIGAhSCGoI/glGCb4J2goECjwKggq4CvALUAuWC7x4nGNgZGBg0GZMYRBlAAEmIOYCQgaG/2A+AwAYlAG8AHicbZE9TsMwGIbf9A/RSggEYmHxAgtq+jN2ZGj3Dt3T1GlTOXHkuBW9AyfgEByCgTNwCA7BW/NJlVBtyd/jx+8XKwmAa3whwnFE6Ib1OBq44O6Pm6Qb4Rb5QbiNHh6FO/RD4S6eMRHu4RaaT4halzR3eBVu4Apvwk36d+EW+UO4jXt8Cnfov4W7WOBHuIen6MXsCtvPU1vWc73emcSdxIkW2tW5LdUoHp7kTJfaJV6v1PKg6v167H2mMmcLNbWl18ZYVTm71amPN95Xk8EgEx+ntoDBDgUs+siRspaoMef7rukNEriziXNuwS7Hmoe9wggxv+e55IzJMqQTeNYV00scuNbY8+YxrUfGfcaMZb/CNPQe04bT0lThbEuT0sfYhK6K/23Amf3Lx+H24hcj4GScAAAAeJxtjtlugzAQRbkJUEJIuu/7vqR8lGNPAcWx0YAb5e/LklR96EgenSufGY038PqKvf9rhgGG8BEgxA4ijBBjjAQTTLGLPezjAIc4wjFOcIoznOMCl7jCNW5wizvc4wGPeMIzXvCKN7zjAzN8eonQRWZSSaYmjvug6ase98hFltexMJmmVNmV2WBvdNgZUc+ujAWzXW3UDnu1w43asStHc8GpzAXX/py0jqTQZJTgkcxJLpaCF0lD32xNt+43tAsn29Dft02uDKS2cjGUNgsk26qK2lFthYoU27INPqmiDqg5goe0pqR5qSoqMdek/CUZFywL46rEsiImleqiqoMyt4baXlu/1GLdNFf5zbcNmdr1YUWCZe47o+zUmb/DoStbw3cVsef9ALjjiPQA) format('woff');
      font-weight: normal;
      font-style: normal;
    }

    html {
      --lumo-icons-align-center: "\\ea01";
      --lumo-icons-align-left: "\\ea02";
      --lumo-icons-align-right: "\\ea03";
      --lumo-icons-angle-down: "\\ea04";
      --lumo-icons-angle-left: "\\ea05";
      --lumo-icons-angle-right: "\\ea06";
      --lumo-icons-angle-up: "\\ea07";
      --lumo-icons-arrow-down: "\\ea08";
      --lumo-icons-arrow-left: "\\ea09";
      --lumo-icons-arrow-right: "\\ea0a";
      --lumo-icons-arrow-up: "\\ea0b";
      --lumo-icons-bar-chart: "\\ea0c";
      --lumo-icons-bell: "\\ea0d";
      --lumo-icons-calendar: "\\ea0e";
      --lumo-icons-checkmark: "\\ea0f";
      --lumo-icons-chevron-down: "\\ea10";
      --lumo-icons-chevron-left: "\\ea11";
      --lumo-icons-chevron-right: "\\ea12";
      --lumo-icons-chevron-up: "\\ea13";
      --lumo-icons-clock: "\\ea14";
      --lumo-icons-cog: "\\ea15";
      --lumo-icons-cross: "\\ea16";
      --lumo-icons-download: "\\ea17";
      --lumo-icons-dropdown: "\\ea18";
      --lumo-icons-edit: "\\ea19";
      --lumo-icons-error: "\\ea1a";
      --lumo-icons-eye: "\\ea1b";
      --lumo-icons-eye-disabled: "\\ea1c";
      --lumo-icons-menu: "\\ea1d";
      --lumo-icons-minus: "\\ea1e";
      --lumo-icons-ordered-list: "\\ea1f";
      --lumo-icons-phone: "\\ea20";
      --lumo-icons-photo: "\\ea21";
      --lumo-icons-play: "\\ea22";
      --lumo-icons-plus: "\\ea23";
      --lumo-icons-redo: "\\ea24";
      --lumo-icons-reload: "\\ea25";
      --lumo-icons-search: "\\ea26";
      --lumo-icons-undo: "\\ea27";
      --lumo-icons-unordered-list: "\\ea28";
      --lumo-icons-upload: "\\ea29";
      --lumo-icons-user: "\\ea2a";
    }
  </style>
</custom-style>`;

document.head.appendChild($_documentContainer$b.content);

const $_documentContainer$c = document.createElement('template');

$_documentContainer$c.innerHTML = `<dom-module id="lumo-field-button">
  <template>
    <style>
      [part\$="button"] {
        flex: none;
        width: 1em;
        height: 1em;
        line-height: 1;
        font-size: var(--lumo-icon-size-m);
        text-align: center;
        color: var(--lumo-contrast-60pct);
        transition: 0.2s color;
        cursor: var(--lumo-clickable-cursor);
      }

      :host(:not([readonly])) [part\$="button"]:hover {
        color: var(--lumo-contrast-90pct);
      }

      :host([disabled]) [part\$="button"],
      :host([readonly]) [part\$="button"] {
        color: var(--lumo-contrast-20pct);
      }

      [part\$="button"]::before {
        font-family: "lumo-icons";
        display: block;
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$c.content);

const $_documentContainer$d = html`<dom-module id="lumo-date-picker" theme-for="vaadin-date-picker">
  <template>
    <style include="lumo-field-button">
      :host {
        outline: none;
      }

      [part="toggle-button"]::before {
        content: var(--lumo-icons-calendar);
      }

      [part="clear-button"]::before {
        content: var(--lumo-icons-cross);
      }

      @media (max-width: 420px), (max-height: 420px) {
        [part="overlay-content"] {
          height: 70vh;
        }
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$d.content);

const $_documentContainer$e = document.createElement('template');

$_documentContainer$e.innerHTML = `<dom-module id="lumo-required-field">
  <template>
    <style>
      [part="label"] {
        align-self: flex-start;
        color: var(--lumo-secondary-text-color);
        font-weight: 500;
        font-size: var(--lumo-font-size-s);
        margin-left: calc(var(--lumo-border-radius-m) / 4);
        transition: color 0.2s;
        line-height: 1;
        padding-bottom: 0.5em;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        position: relative;
        max-width: 100%;
        box-sizing: border-box;
      }

      :host([has-label])::before {
        margin-top: calc(var(--lumo-font-size-s) * 1.5);
      }

      :host([has-label]) {
        padding-top: var(--lumo-space-m);
      }

      :host([required]) [part="label"] {
        padding-right: 1em;
      }

      [part="label"]::after {
        content: var(--lumo-required-field-indicator, "•");
        transition: opacity 0.2s;
        opacity: 0;
        color: var(--lumo-primary-text-color);
        position: absolute;
        right: 0;
        width: 1em;
        text-align: center;
      }

      :host([required]:not([has-value])) [part="label"]::after {
        opacity: 1;
      }

      :host([invalid]) [part="label"]::after {
        color: var(--lumo-error-text-color);
      }

      [part="error-message"] {
        margin-left: calc(var(--lumo-border-radius-m) / 4);
        font-size: var(--lumo-font-size-xs);
        line-height: var(--lumo-line-height-xs);
        color: var(--lumo-error-text-color);
        will-change: max-height;
        transition: 0.4s max-height;
        max-height: 5em;
      }

      /* Margin that doesn’t reserve space when there’s no error message */
      [part="error-message"]:not(:empty)::before,
      [part="error-message"]:not(:empty)::after {
        content: "";
        display: block;
        height: 0.4em;
      }

      :host(:not([invalid])) [part="error-message"] {
        max-height: 0;
        overflow: hidden;
      }

      /* RTL specific styles */

      :host([dir="rtl"]) [part="label"] {
        margin-left: 0;
        margin-right: calc(var(--lumo-border-radius-m) / 4);
      }

      :host([required][dir="rtl"]) [part="label"] {
        padding-left: 1em;
        padding-right: 0;
      }

      :host([dir="rtl"]) [part="label"]::after {
        right: auto;
        left: 0;
      }

      :host([dir="rtl"]) [part="error-message"] {
        margin-left: 0;
        margin-right: calc(var(--lumo-border-radius-m) / 4);
      }

    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$e.content);

const $_documentContainer$f = html`<dom-module id="lumo-text-field" theme-for="vaadin-text-field">
  <template>
    <style include="lumo-required-field lumo-field-button">
      :host {
        --lumo-text-field-size: var(--lumo-size-m);
        color: var(--lumo-body-text-color);
        font-size: var(--lumo-font-size-m);
        font-family: var(--lumo-font-family);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        -webkit-tap-highlight-color: transparent;
        padding: var(--lumo-space-xs) 0;
      }

      :host::before {
        height: var(--lumo-text-field-size);
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
      }

      :host([focused]:not([readonly])) [part="label"] {
        color: var(--lumo-primary-text-color);
      }

      :host([has-helper]) [part="helper-text"]::before {
        content: "";
        display: block;
        height: 0.4em;
      }

      [part="helper-text"],
      [part="helper-text"] ::slotted(*) {
        display: block;
        color: var(--lumo-secondary-text-color);
        font-size: var(--lumo-font-size-xs);
        line-height: var(--lumo-line-height-xs);
        margin-left: calc(var(--lumo-border-radius-m) / 4);
        transition: color 0.2s;
      }

      [part="value"],
      [part="input-field"] ::slotted(input),
      [part="input-field"] ::slotted(textarea),
      /* Slotted by vaadin-select-text-field */
      [part="input-field"] ::slotted([part="value"]) {
        cursor: inherit;
        min-height: var(--lumo-text-field-size);
        padding: 0 0.25em;
        --_lumo-text-field-overflow-mask-image: linear-gradient(to left, transparent, #000 1.25em);
        -webkit-mask-image: var(--_lumo-text-field-overflow-mask-image);
      }

      [part="value"]:focus,
      :host([focused]) [part="input-field"] ::slotted(input),
      :host([focused]) [part="input-field"] ::slotted(textarea) {
        -webkit-mask-image: none;
        mask-image: none;
      }

      /*
        TODO: CSS custom property in \`mask-image\` causes crash in Edge
        see https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/15415089/
      */
      @-moz-document url-prefix() {
        [part="value"],
        [part="input-field"] ::slotted(input),
        [part="input-field"] ::slotted(textarea),
        [part="input-field"] ::slotted([part="value"]) {
          mask-image: var(--_lumo-text-field-overflow-mask-image);
        }
      }

      [part="value"]::-webkit-input-placeholder {
        color: inherit;
        transition: opacity 0.175s 0.05s;
        opacity: 0.5;
      }

      [part="value"]:-ms-input-placeholder {
        color: inherit;
        opacity: 0.5;
      }

      [part="value"]::-moz-placeholder {
        color: inherit;
        transition: opacity 0.175s 0.05s;
        opacity: 0.5;
      }

      [part="value"]::placeholder {
        color: inherit;
        transition: opacity 0.175s 0.1s;
        opacity: 0.5;
      }

      [part="input-field"] {
        border-radius: var(--lumo-border-radius);
        background-color: var(--lumo-contrast-10pct);
        padding: 0 calc(0.375em + var(--lumo-border-radius) / 4 - 1px);
        font-weight: 500;
        line-height: 1;
        position: relative;
        cursor: text;
        box-sizing: border-box;
      }

      /* Used for hover and activation effects */
      [part="input-field"]::after {
        content: "";
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        border-radius: inherit;
        pointer-events: none;
        background-color: var(--lumo-contrast-50pct);
        opacity: 0;
        transition: transform 0.15s, opacity 0.2s;
        transform-origin: 100% 0;
      }

      /* Hover */

      :host(:hover:not([readonly]):not([focused])) [part="label"],
      :host(:hover:not([readonly])) [part="helper-text"],
      :host(:hover:not([readonly])) [part="helper-text"] ::slotted(*) {
        color: var(--lumo-body-text-color);
      }

      :host(:hover:not([readonly]):not([focused])) [part="input-field"]::after {
        opacity: 0.1;
      }

      /* Touch device adjustment */
      @media (pointer: coarse) {
        :host(:hover:not([readonly]):not([focused])) [part="label"] {
          color: var(--lumo-secondary-text-color);
        }

        :host(:hover:not([readonly]):not([focused])) [part="input-field"]::after {
          opacity: 0;
        }

        :host(:active:not([readonly]):not([focused])) [part="input-field"]::after {
          opacity: 0.2;
        }
      }

      /* Trigger when not focusing using the keyboard */
      :host([focused]:not([focus-ring]):not([readonly])) [part="input-field"]::after {
        transform: scaleX(0);
        transition-duration: 0.15s, 1s;
      }

      /* Focus-ring */

      :host([focus-ring]) [part="input-field"] {
        box-shadow: 0 0 0 2px var(--lumo-primary-color-50pct);
      }

      /* Read-only and disabled */
      :host([readonly]) [part="value"]::-webkit-input-placeholder,
      :host([disabled]) [part="value"]::-webkit-input-placeholder {
        opacity: 0;
      }

      :host([readonly]) [part="value"]:-ms-input-placeholder,
      :host([disabled]) [part="value"]:-ms-input-placeholder {
        opacity: 0;
      }

      :host([readonly]) [part="value"]::-moz-placeholder,
      :host([disabled]) [part="value"]::-moz-placeholder {
        opacity: 0;
      }

      :host([readonly]) [part="value"]::placeholder,
      :host([disabled]) [part="value"]::placeholder {
        opacity: 0;
      }

      /* Read-only */

      :host([readonly]) [part="input-field"] {
        color: var(--lumo-secondary-text-color);
        background-color: transparent;
        cursor: default;
      }

      :host([readonly]) [part="input-field"]::after {
        background-color: transparent;
        opacity: 1;
        border: 1px dashed var(--lumo-contrast-30pct);
      }

      /* Disabled style */

      :host([disabled]) {
        pointer-events: none;
      }

      :host([disabled]) [part="input-field"] {
        background-color: var(--lumo-contrast-5pct);
      }

      :host([disabled]) [part="label"],
      :host([disabled]) [part="helper-text"],
      :host([disabled]) [part="value"],
      :host([disabled]) [part="input-field"] ::slotted(*) {
        color: var(--lumo-disabled-text-color);
        -webkit-text-fill-color: var(--lumo-disabled-text-color);
      }

      /* Invalid style */

      :host([invalid]) [part="input-field"] {
        background-color: var(--lumo-error-color-10pct);
      }

      :host([invalid]) [part="input-field"]::after {
        background-color: var(--lumo-error-color-50pct);
      }

      :host([invalid][focus-ring]) [part="input-field"] {
        box-shadow: 0 0 0 2px var(--lumo-error-color-50pct);
      }

      :host([input-prevented]) [part="input-field"] {
        color: var(--lumo-error-text-color);
      }

      /* Small theme */

      :host([theme~="small"]) {
        font-size: var(--lumo-font-size-s);
        --lumo-text-field-size: var(--lumo-size-s);
      }

      :host([theme~="small"][has-label]) [part="label"] {
        font-size: var(--lumo-font-size-xs);
      }

      :host([theme~="small"][has-label]) [part="error-message"] {
        font-size: var(--lumo-font-size-xxs);
      }

      /* Text align */

      :host([theme~="align-left"]) [part="value"] {
        text-align: left;
        --_lumo-text-field-overflow-mask-image: none;
      }

      :host([theme~="align-center"]) [part="value"] {
        text-align: center;
        --_lumo-text-field-overflow-mask-image: none;
      }

      :host([theme~="align-right"]) [part="value"] {
        text-align: right;
        --_lumo-text-field-overflow-mask-image: none;
      }

      @-moz-document url-prefix() {
        /* Firefox is smart enough to align overflowing text to right */
        :host([theme~="align-right"]) [part="value"] {
          --_lumo-text-field-overflow-mask-image: linear-gradient(to right, transparent 0.25em, #000 1.5em);
        }
      }

      @-moz-document url-prefix() {
        /* Firefox is smart enough to align overflowing text to right */
        :host([theme~="align-left"]) [part="value"] {
          --_lumo-text-field-overflow-mask-image: linear-gradient(to left, transparent 0.25em, #000 1.5em);
        }
      }
      /* helper-text position */

      :host([has-helper][theme~="helper-above-field"]) [part="helper-text"]::before {
        display: none;
      }

      :host([has-helper][theme~="helper-above-field"]) [part="helper-text"]::after {
        content: "";
        display: block;
        height: 0.4em;
      }

      :host([has-helper][theme~="helper-above-field"]) [part="label"] {
        order: 0;
        padding-bottom: 0.4em;
      }

      :host([has-helper][theme~="helper-above-field"]) [part="helper-text"] {
        order: 1;
      }

      :host([has-helper][theme~="helper-above-field"]) [part="input-field"] {
        order: 2;
      }

      :host([has-helper][theme~="helper-above-field"]) [part="error-message"] {
        order: 3;
      }

      /* Slotted content */

      [part="input-field"] ::slotted(:not([part]):not(iron-icon):not(input):not(textarea)) {
        color: var(--lumo-secondary-text-color);
        font-weight: 400;
      }

      /* Slotted icons */

      [part="input-field"] ::slotted(iron-icon) {
        color: var(--lumo-contrast-60pct);
        width: var(--lumo-icon-size-m);
        height: var(--lumo-icon-size-m);
      }

      /* Vaadin icons are based on a 16x16 grid (unlike Lumo and Material icons with 24x24), so they look too big by default */
      [part="input-field"] ::slotted(iron-icon[icon^="vaadin:"]) {
        padding: 0.25em;
        box-sizing: border-box !important;
      }

      [part="clear-button"]::before {
        content: var(--lumo-icons-cross);
      }

      /* RTL specific styles */

      :host([dir="rtl"]) [part="input-field"]::after {
        transform-origin: 0% 0;
      }

      :host([dir="rtl"]) [part="value"],
      :host([dir="rtl"]) [part="input-field"] ::slotted(input),
      :host([dir="rtl"]) [part="input-field"] ::slotted(textarea) {
        --_lumo-text-field-overflow-mask-image: linear-gradient(to right, transparent, #000 1.25em);
      }

      :host([dir="rtl"]) [part="value"]:focus,
      :host([focused][dir="rtl"]) [part="input-field"] ::slotted(input),
      :host([focused][dir="rtl"]) [part="input-field"] ::slotted(textarea) {
        -webkit-mask-image: none;
        mask-image: none;
      }

      @-moz-document url-prefix() {
        :host([dir="rtl"]) [part="value"],
        :host([dir="rtl"]) [part="input-field"] ::slotted(input),
        :host([dir="rtl"]) [part="input-field"] ::slotted(textarea),
        :host([dir="rtl"]) [part="input-field"] ::slotted([part="value"]) {
          mask-image: var(--_lumo-text-field-overflow-mask-image);
        }
      }

      :host([theme~="align-left"][dir="rtl"]) [part="value"] {
        --_lumo-text-field-overflow-mask-image: none;
      }

      :host([theme~="align-center"][dir="rtl"]) [part="value"] {
        --_lumo-text-field-overflow-mask-image: none;
      }

      :host([theme~="align-right"][dir="rtl"]) [part="value"] {
        --_lumo-text-field-overflow-mask-image: none;
      }

      @-moz-document url-prefix() {
        /* Firefox is smart enough to align overflowing text to right */
        :host([theme~="align-right"][dir="rtl"]) [part="value"] {
          --_lumo-text-field-overflow-mask-image: linear-gradient(to right, transparent 0.25em, #000 1.5em);
        }
      }

      @-moz-document url-prefix() {
        /* Firefox is smart enough to align overflowing text to right */
        :host([theme~="align-left"][dir="rtl"]) [part="value"] {
          --_lumo-text-field-overflow-mask-image: linear-gradient(to left, transparent 0.25em, #000 1.5em);
        }
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$f.content);

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/

const $_documentContainer$g = html`<dom-module id="vaadin-text-field-shared-styles">
  <template>
    <style>
      :host {
        display: inline-flex;
        outline: none;
      }

      :host::before {
        content: "\\2003";
        width: 0;
        display: inline-block;
        /* Size and position this element on the same vertical position as the input-field element
           to make vertical align for the host element work as expected */
      }

      :host([hidden]) {
        display: none !important;
      }

      .vaadin-text-field-container,
      .vaadin-text-area-container {
        display: flex;
        flex-direction: column;
        min-width: 100%;
        max-width: 100%;
        width: var(--vaadin-text-field-default-width, 12em);
      }

      [part="label"]:empty {
        display: none;
      }

      [part="input-field"] {
        display: flex;
        align-items: center;
        flex: auto;
      }

      .vaadin-text-field-container [part="input-field"] {
        flex-grow: 0;
      }

      /* Reset the native input styles */
      [part="value"],
      [part="input-field"] ::slotted(input),
      [part="input-field"] ::slotted(textarea) {
        -webkit-appearance: none;
        -moz-appearance: none;
        outline: none;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        min-width: 0;
        font: inherit;
        font-size: 1em;
        line-height: normal;
        color: inherit;
        background-color: transparent;
        /* Disable default invalid style in Firefox */
        box-shadow: none;
      }

      [part="input-field"] ::slotted(*) {
        flex: none;
      }

      [part="value"],
      [part="input-field"] ::slotted(input),
      [part="input-field"] ::slotted(textarea),
      /* Slotted by vaadin-select-text-field */
      [part="input-field"] ::slotted([part="value"]) {
        flex: auto;
        white-space: nowrap;
        overflow: hidden;
        width: 100%;
        height: 100%;
      }

      [part="input-field"] ::slotted(textarea) {
        resize: none;
      }

      [part="value"]::-ms-clear,
      [part="input-field"] ::slotted(input)::-ms-clear {
        display: none;
      }

      [part="clear-button"] {
        cursor: default;
      }

      [part="clear-button"]::before {
        content: "✕";
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$g.content);

const HOST_PROPS = {
  default: ['list', 'autofocus', 'pattern', 'autocapitalize', 'autocorrect', 'maxlength',
    'minlength', 'name', 'placeholder', 'autocomplete', 'title', 'disabled', 'readonly', 'required'],
  accessible: ['invalid']
};

const PROP_TYPE = {
  DEFAULT: 'default',
  ACCESSIBLE: 'accessible'
};


/**
 * @polymerMixin
 */
const TextFieldMixin = subclass => class VaadinTextFieldMixin extends subclass {
  static get properties() {
    return {
      /**
       * Whether the value of the control can be automatically completed by the browser.
       * List of available options at:
       * https://developer.mozilla.org/en/docs/Web/HTML/Element/input#attr-autocomplete
       */
      autocomplete: {
        type: String
      },

      /**
       * This is a property supported by Safari that is used to control whether
       * autocorrection should be enabled when the user is entering/editing the text.
       * Possible values are:
       * on: Enable autocorrection.
       * off: Disable autocorrection.
       * @type {!TextFieldAutoCorrect | undefined}
       */
      autocorrect: {
        type: String
      },

      /**
       * This is a property supported by Safari and Chrome that is used to control whether
       * autocapitalization should be enabled when the user is entering/editing the text.
       * Possible values are:
       * characters: Characters capitalization.
       * words: Words capitalization.
       * sentences: Sentences capitalization.
       * none: No capitalization.
       * @type {!TextFieldAutoCapitalize | undefined}
       */
      autocapitalize: {
        type: String
      },

      /**
       * Specify that the value should be automatically selected when the field gains focus.
       * @type {boolean}
       */
      autoselect: {
        type: Boolean,
        value: false
      },

      /**
       * Set to true to display the clear icon which clears the input.
       * @attr {boolean} clear-button-visible
       * @type {boolean}
       */
      clearButtonVisible: {
        type: Boolean,
        value: false
      },

      /**
       * Error to show when the input value is invalid.
       * @attr {string} error-message
       * @type {string}
       */
      errorMessage: {
        type: String,
        value: '',
        observer: '_errorMessageChanged'
      },

      /**
       * Object with translated strings used for localization. Has
       * the following structure and default values:
       *
       * ```
       * {
       *   // Translation of the clear icon button accessible label
       *   clear: 'Clear'
       * }
       * ```
       * @type {{clear: string}}
       */
      i18n: {
        type: Object,
        value: () => {
          return {
            clear: 'Clear'
          };
        }
      },

      /**
       * String used for the label element.
       * @type {string}
       */
      label: {
        type: String,
        value: '',
        observer: '_labelChanged'
      },

      /**
       * String used for the helper text.
       * @attr {string} helper-text
       * @type {string | null}
       */
      helperText: {
        type: String,
        value: '',
        observer: '_helperTextChanged'
      },

      /**
       * Maximum number of characters (in Unicode code points) that the user can enter.
       */
      maxlength: {
        type: Number
      },

      /**
       * Minimum number of characters (in Unicode code points) that the user can enter.
       */
      minlength: {
        type: Number
      },

      /**
       * The name of the control, which is submitted with the form data.
       */
      name: {
        type: String
      },

      /**
       * A hint to the user of what can be entered in the control.
       */
      placeholder: {
        type: String
      },

      /**
       * This attribute indicates that the user cannot modify the value of the control.
       */
      readonly: {
        type: Boolean,
        reflectToAttribute: true
      },

      /**
       * Specifies that the user must fill in a value.
       */
      required: {
        type: Boolean,
        reflectToAttribute: true
      },


      /**
       * The initial value of the control.
       * It can be used for two-way data binding.
       * @type {string}
       */
      value: {
        type: String,
        value: '',
        observer: '_valueChanged',
        notify: true
      },

      /**
       * This property is set to true when the control value is invalid.
       * @type {boolean}
       */
      invalid: {
        type: Boolean,
        reflectToAttribute: true,
        notify: true,
        value: false
      },

      /**
       * Specifies that the text field has value.
       * @attr {boolean} has-value
       */
      hasValue: {
        type: Boolean,
        reflectToAttribute: true
      },

      /**
       * When set to true, user is prevented from typing a value that
       * conflicts with the given `pattern`.
       * @attr {boolean} prevent-invalid-input
       */
      preventInvalidInput: {
        type: Boolean
      },

      /**
       * A pattern matched against individual characters the user inputs.
       * When set, the field will prevent:
       * - `keyDown` events if the entered key doesn't match `/^_enabledCharPattern$/`
       * - `paste` events if the pasted text doesn't match `/^_enabledCharPattern*$/`
       * - `drop` events if the dropped text doesn't match `/^_enabledCharPattern*$/`
       *
       * For example, to enable entering only numbers and minus signs,
       * `_enabledCharPattern = "[\\d-]"`
       * @protected
       */
      _enabledCharPattern: String,

      /** @private */
      _labelId: String,

      /** @private */
      _helperTextId: String,

      /** @private */
      _errorId: String,

      /** @private */
      _inputId: String,

      /** @private */
      _hasSlottedHelper: Boolean
    };
  }

  static get observers() {
    return ['_stateChanged(disabled, readonly, clearButtonVisible, hasValue)',
      '_hostPropsChanged(' + HOST_PROPS.default.join(', ') + ')',
      '_hostAccessiblePropsChanged(' + HOST_PROPS.accessible.join(', ') + ')',
      '_getActiveErrorId(invalid, errorMessage, _errorId, helperText, _helperTextId, _hasSlottedHelper)',
      '_getActiveLabelId(label, _labelId, _inputId)',
      '__observeOffsetHeight(errorMessage, invalid, label, helperText)',
      '__enabledCharPatternChanged(_enabledCharPattern)'
    ];
  }

  /**
   * @return {HTMLElement | undefined}
   * @protected
   */
  get focusElement() {
    if (!this.shadowRoot) {
      return;
    }
    const slotted = this.querySelector(`${this._slottedTagName}[slot="${this._slottedTagName}"]`);
    if (slotted) {
      return slotted;
    }
    return this.shadowRoot.querySelector('[part="value"]');
  }

  /**
   * @return {HTMLElement | undefined}}
   * @protected
   */
  get inputElement() {
    return this.focusElement;
  }

  /**
   * @return {string}
   * @protected
   */
  get _slottedTagName() {
    return 'input';
  }

  /** @protected */
  _createConstraintsObserver() {
    // This complex observer needs to be added dynamically here (instead of defining it above in the `get observers()`)
    // so that it runs after complex observers of inheriting classes. Otherwise e.g. `_stepOrMinChanged()` observer of
    // vaadin-number-field would run after this and the `min` and `step` properties would not yet be propagated to
    // the `inputElement` when this runs.
    this._createMethodObserver('_constraintsChanged(required, minlength, maxlength, pattern)');
  }

  /** @private */
  _onInput(e) {
    if (this.__preventInput) {
      e.stopImmediatePropagation();
      this.__preventInput = false;
      return;
    }

    if (this.preventInvalidInput) {
      const input = this.inputElement;
      if (input.value.length > 0 && !this.checkValidity()) {
        input.value = this.value || '';
        // add input-prevented attribute for 200ms
        this.setAttribute('input-prevented', '');
        this._inputDebouncer = Debouncer.debounce(
          this._inputDebouncer,
          timeOut.after(200), () => {
            this.removeAttribute('input-prevented');
          });
        return;
      }
    }

    if (!e.__fromClearButton) {
      this.__userInput = true;
    }

    this.value = e.target.value;
    this.__userInput = false;
  }

  // NOTE(yuriy): Workaround needed for IE11 and Edge for proper displaying
  // of the clear button instead of setting display property for it depending on state.
  /** @private */
  _stateChanged(disabled, readonly, clearButtonVisible, hasValue) {
    if (!disabled &&
        !readonly &&
        clearButtonVisible &&
        hasValue
    ) {
      this.$.clearButton.removeAttribute('hidden');
    } else {
      this.$.clearButton.setAttribute('hidden', true);
    }
  }

  /**
   * @param {!Event} e
   * @protected
   */
  _onChange(e) {
    if (this._valueClearing) {
      return;
    }

    // In the Shadow DOM, the `change` event is not leaked into the
    // ancestor tree, so we must do this manually.
    const changeEvent = new CustomEvent('change', {
      detail: {
        sourceEvent: e
      },
      bubbles: e.bubbles,
      cancelable: e.cancelable,
    });
    this.dispatchEvent(changeEvent);
  }

  /**
   * @param {unknown} newVal
   * @param {unknown} oldVal
   * @protected
   */
  _valueChanged(newVal, oldVal) {
    // setting initial value to empty string, skip validation
    if (newVal === '' && oldVal === undefined) {
      return;
    }

    if (newVal !== '' && newVal != null) {
      this.hasValue = true;
    } else {
      this.hasValue = false;
    }

    if (this.__userInput) {
      return;
    } else if (newVal !== undefined) {
      this.inputElement.value = newVal;
    } else {
      this.value = this.inputElement.value = '';
    }

    if (this.invalid) {
      this.validate();
    }
  }

  /** @private */
  _labelChanged(label) {
    this._setOrToggleAttribute('has-label', !!label, this);
  }

  /** @private */
  _helperTextChanged(helperText) {
    this._setOrToggleAttribute('has-helper', !!helperText, this);
  }

  /** @private */
  _errorMessageChanged(errorMessage) {
    this._setOrToggleAttribute('has-error-message', !!errorMessage, this);
  }

  /** @private */
  _onHelperSlotChange() {
    const slottedNodes = this.shadowRoot.querySelector(`[name="helper"]`).assignedNodes({flatten: true});
    // Only has slotted helper if not a text node
    // Text nodes are added by the helperText prop and not the helper slot
    // The filter is added due to shady DOM triggering this callback on helperText prop change
    this._hasSlottedHelper = slottedNodes.filter(node => node.nodeType !== 3).length;

    if (this._hasSlottedHelper) {
      this.setAttribute('has-helper', 'slotted');
    } else if (this.helperText === '' || this.helperText === null) {
      this.removeAttribute('has-helper');
    }
  }

  /** @private */
  _onSlotChange() {
    const slotted = this.querySelector(`${this._slottedTagName}[slot="${this._slottedTagName}"]`);

    if (this.value) {
      this.inputElement.value = this.value;
      this.validate();
    }

    if (slotted && !this._slottedInput) {
      this._validateSlottedValue(slotted);
      this._addInputListeners(slotted);
      this._addIEListeners(slotted);
      this._slottedInput = slotted;
    } else if (!slotted && this._slottedInput) {
      this._removeInputListeners(this._slottedInput);
      this._removeIEListeners(this._slottedInput);
      this._slottedInput = undefined;
    }

    Object.keys(PROP_TYPE).map(key => PROP_TYPE[key]).forEach(type =>
      this._propagateHostAttributes(HOST_PROPS[type].map(attr => this[attr]), type));
  }

  /** @private */
  _hostPropsChanged(...attributesValues) {
    this._propagateHostAttributes(attributesValues, PROP_TYPE.DEFAULT);
  }

  /** @private */
  _hostAccessiblePropsChanged(...attributesValues) {
    this._propagateHostAttributes(attributesValues, PROP_TYPE.ACCESSIBLE);
  }

  /** @private */
  _validateSlottedValue(slotted) {
    if (slotted.value !== this.value) {
      console.warn('Please define value on the vaadin-text-field component!');
      slotted.value = '';
    }
  }

  /** @private */
  _propagateHostAttributes(attributesValues, type) {
    const input = this.inputElement;
    const attributeNames = HOST_PROPS[type];

    if (type === PROP_TYPE.ACCESSIBLE) {
      attributeNames.forEach((attr, index) => {
        this._setOrToggleAttribute(attr, attributesValues[index], input);
        this._setOrToggleAttribute(`aria-${attr}`, attributesValues[index] ? 'true' : false, input);
      });
    } else {
      attributeNames.forEach((attr, index) => {
        this._setOrToggleAttribute(attr, attributesValues[index], input);
      });
    }
  }

  /** @private */
  _setOrToggleAttribute(name, value, node) {
    if (!name || !node) {
      return;
    }

    if (value) {
      node.setAttribute(name, (typeof value === 'boolean') ? '' : value);
    } else {
      node.removeAttribute(name);
    }
  }

  /**
   * @param {boolean | undefined} required
   * @param {number | undefined} minlength
   * @param {number | undefined} maxlength
   * @param {string | undefined} maxlength
   * @protected
   */
  _constraintsChanged(required, minlength, maxlength, pattern) {
    if (!this.invalid) {
      return;
    }

    if (!required && !minlength && !maxlength && !pattern) {
      this.invalid = false;
    } else {
      this.validate();
    }
  }

  /**
   * Returns true if the current input value satisfies all constraints (if any)
   * @return {boolean}
   */
  checkValidity() {
    // Note (Yuriy): `__forceCheckValidity` is used in containing components (i.e. `vaadin-date-picker`) in order
    // to force the checkValidity instead of returning the previous invalid state.
    if (this.required || this.pattern || this.maxlength || this.minlength || this.__forceCheckValidity) {
      return this.inputElement.checkValidity();
    } else {
      return !this.invalid;
    }
  }

  /** @private */
  _addInputListeners(node) {
    node.addEventListener('input', this._boundOnInput);
    node.addEventListener('change', this._boundOnChange);
    node.addEventListener('blur', this._boundOnBlur);
    node.addEventListener('focus', this._boundOnFocus);
    node.addEventListener('paste', this._boundOnPaste);
    node.addEventListener('drop', this._boundOnDrop);
    node.addEventListener('beforeinput', this._boundOnBeforeInput);
  }

  /** @private */
  _removeInputListeners(node) {
    node.removeEventListener('input', this._boundOnInput);
    node.removeEventListener('change', this._boundOnChange);
    node.removeEventListener('blur', this._boundOnBlur);
    node.removeEventListener('focus', this._boundOnFocus);
    node.removeEventListener('paste', this._boundOnPaste);
    node.removeEventListener('drop', this._boundOnDrop);
    node.removeEventListener('beforeinput', this._boundOnBeforeInput);
  }

  /** @protected */
  ready() {
    super.ready();

    this._createConstraintsObserver();

    this._boundOnInput = this._onInput.bind(this);
    this._boundOnChange = this._onChange.bind(this);
    this._boundOnBlur = this._onBlur.bind(this);
    this._boundOnFocus = this._onFocus.bind(this);
    this._boundOnPaste = this._onPaste.bind(this);
    this._boundOnDrop = this._onDrop.bind(this);
    this._boundOnBeforeInput = this._onBeforeInput.bind(this);

    const defaultInput = this.shadowRoot.querySelector('[part="value"]');
    this._slottedInput = this.querySelector(`${this._slottedTagName}[slot="${this._slottedTagName}"]`);
    this._addInputListeners(defaultInput);
    this._addIEListeners(defaultInput);
    if (this._slottedInput) {
      this._addIEListeners(this._slottedInput);
      this._addInputListeners(this._slottedInput);
    }

    this.shadowRoot.querySelector('[name="input"], [name="textarea"]')
      .addEventListener('slotchange', this._onSlotChange.bind(this));

    this._onHelperSlotChange();
    this.shadowRoot.querySelector('[name="helper"]').addEventListener('slotchange', this._onHelperSlotChange.bind(this));

    if (!(window.ShadyCSS && window.ShadyCSS.nativeCss)) {
      this.updateStyles();
    }

    this.$.clearButton.addEventListener('mousedown', () => this._valueClearing = true);
    this.$.clearButton.addEventListener('mouseleave', () => this._valueClearing = false);
    this.$.clearButton.addEventListener('click', this._onClearButtonClick.bind(this));
    this.addEventListener('keydown', this._onKeyDown.bind(this));

    var uniqueId = TextFieldMixin._uniqueId = 1 + TextFieldMixin._uniqueId || 0;
    this._errorId = `${this.constructor.is}-error-${uniqueId}`;
    this._labelId = `${this.constructor.is}-label-${uniqueId}`;
    this._helperTextId = `${this.constructor.is}-helper-${uniqueId}`;
    this._inputId = `${this.constructor.is}-input-${uniqueId}`;

    // Lumo theme defines a max-height transition for the "error-message"
    // part on invalid state change.
    this.shadowRoot.querySelector('[part="error-message"]')
      .addEventListener('transitionend', () => {
        this.__observeOffsetHeight();
      });
  }

  /**
   * Returns true if `value` is valid.
   * `<iron-form>` uses this to check the validity for all its elements.
   *
   * @return {boolean} True if the value is valid.
   */
  validate() {
    return !(this.invalid = !this.checkValidity());
  }

  clear() {
    this.value = '';
  }

  /** @private */
  _onBlur() {
    this.validate();
  }

  /** @private */
  _onFocus() {
    if (this.autoselect) {
      this.inputElement.select();
      // iOS 9 workaround: https://stackoverflow.com/a/7436574
      setTimeout(() => {
        try {
          this.inputElement.setSelectionRange(0, 9999);
        } catch (e) {
          // The workaround may cause errors on different input types.
          // Needs to be suppressed. See https://github.com/vaadin/flow/issues/6070
        }
      });
    }
  }

  /** @private */
  _onClearButtonClick(e) {
    e.preventDefault();
    // NOTE(yuriy): This line won't affect focus on the host. Cannot be properly tested.
    this.inputElement.focus();
    this.clear();
    this._valueClearing = false;
    if (navigator.userAgent.match(/Trident/)) {
      // Disable IE input" event prevention here, we want the input event from
      // below to propagate normally.
      this.__preventInput = false;
    }
    const inputEvent = new Event('input', {bubbles: true, composed: true});
    inputEvent.__fromClearButton = true;
    const changeEvent = new Event('change', {bubbles: !this._slottedInput});
    changeEvent.__fromClearButton = true;
    this.inputElement.dispatchEvent(inputEvent);
    this.inputElement.dispatchEvent(changeEvent);
  }

  /**
   * @param {!KeyboardEvent} e
   * @protected
   */
  _onKeyDown(e) {
    if (e.keyCode === 27 && this.clearButtonVisible) {
      const dispatchChange = !!this.value;
      this.clear();
      dispatchChange && this.inputElement.dispatchEvent(new Event('change', {bubbles: !this._slottedInput}));
    }

    if (this._enabledCharPattern && !this.__shouldAcceptKey(e)) {
      e.preventDefault();
    }
  }

  /** @private */
  __shouldAcceptKey(event) {
    return (event.metaKey || event.ctrlKey)
      || !event.key // allow typing anything if event.key is not supported
      || event.key.length !== 1 // allow "Backspace", "ArrowLeft" etc.
      || this.__enabledCharRegExp.test(event.key);
  }

  /** @private */
  _onPaste(e) {
    if (this._enabledCharPattern) {
      const pastedText = (e.clipboardData || window.clipboardData).getData('text');
      if (!this.__enabledTextRegExp.test(pastedText)) {
        e.preventDefault();
      }
    }
  }

  /** @private */
  _onDrop(e) {
    if (this._enabledCharPattern) {
      const draggedText = e.dataTransfer.getData('text');
      if (!this.__enabledTextRegExp.test(draggedText)) {
        e.preventDefault();
      }
    }
  }

  /** @private */
  _onBeforeInput(e) {
    // The `beforeinput` event covers all the cases for `_enabledCharPattern`: keyboard, pasting and dropping,
    // but it is still experimental technology so we can't rely on it. It's used here just as an additional check,
    // because it seems to be the only way to detect and prevent specific keys on mobile devices. See issue #429.
    if (this._enabledCharPattern && e.data && !this.__enabledTextRegExp.test(e.data)) {
      e.preventDefault();
    }
  }

  /** @private */
  __enabledCharPatternChanged(_enabledCharPattern) {
    this.__enabledCharRegExp = _enabledCharPattern && new RegExp('^' + _enabledCharPattern + '$');
    this.__enabledTextRegExp = _enabledCharPattern && new RegExp('^' + _enabledCharPattern + '*$');
  }

  /** @private */
  _addIEListeners(node) {
    /* istanbul ignore if */
    if (navigator.userAgent.match(/Trident/)) {
      // IE11 dispatches `input` event in following cases:
      // - focus or blur, when placeholder attribute is set
      // - placeholder attribute value changed
      // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/101220/
      this._shouldPreventInput = () => {
        this.__preventInput = true;
        requestAnimationFrame(() => {
          this.__preventInput = false;
        });
      };
      node.addEventListener('focusin', this._shouldPreventInput);
      node.addEventListener('focusout', this._shouldPreventInput);
      this._createPropertyObserver('placeholder', this._shouldPreventInput);
    }
  }

  /** @private */
  _removeIEListeners(node) {
    /* istanbul ignore if */
    if (navigator.userAgent.match(/Trident/)) {
      node.removeEventListener('focusin', this._shouldPreventInput);
      node.removeEventListener('focusout', this._shouldPreventInput);
    }
  }

  /** @private */
  _getActiveErrorId(invalid, errorMessage, errorId, helperText, helperTextId, hasSlottedHelper) {
    const ids = [];
    if (helperText || hasSlottedHelper) {
      ids.push(helperTextId);
    }
    if (errorMessage && invalid) {
      ids.push(errorId);
    }
    this._setOrToggleAttribute('aria-describedby', ids.join(' '), this.focusElement);
  }

  /** @private */
  _getActiveLabelId(label, _labelId, _inputId) {
    let ids = _inputId;
    if (label) {
      ids = `${_labelId} ${_inputId}`;
    }
    this.focusElement.setAttribute('aria-labelledby', ids);
  }

  /** @private */
  _getErrorMessageAriaHidden(invalid, errorMessage, errorId) {
    return (!(errorMessage && invalid ? errorId : undefined)).toString();
  }

  /** @private */
  _dispatchIronResizeEventIfNeeded(sizePropertyName, value) {
    const previousSizePropertyName = '__previous' + sizePropertyName;
    if (this[previousSizePropertyName] !== undefined
        && this[previousSizePropertyName] !== value) {
      this.dispatchEvent(
        new CustomEvent('iron-resize', {bubbles: true})
      );
    }

    this[previousSizePropertyName] = value;
  }

  /** @private */
  __observeOffsetHeight() {
    this.__observeOffsetHeightDebouncer = Debouncer.debounce(
      this.__observeOffsetHeightDebouncer,
      animationFrame, () => {
        this._dispatchIronResizeEventIfNeeded('Height', this.offsetHeight);
      });
  }

  /**
   * @param {string} prop
   * @param {string} oldVal
   * @param {string} newVal
   * @protected
   */
  attributeChangedCallback(prop, oldVal, newVal) {
    super.attributeChangedCallback(prop, oldVal, newVal);
    // Needed until Edge has CSS Custom Properties (present in Edge Preview)
    /* istanbul ignore if */
    if (!(window.ShadyCSS && window.ShadyCSS.nativeCss) &&
      /^(focused|focus-ring|invalid|disabled|placeholder|has-value)$/.test(prop)) {
      this.updateStyles();
    }

    // Safari has an issue with repainting shadow root element styles when a host attribute changes.
    // Need this workaround (toggle any inline css property on and off) until the issue gets fixed.
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    /* istanbul ignore if */
    if (isSafari && this.root) {
      const WEBKIT_PROPERTY = '-webkit-backface-visibility';
      this.root.querySelectorAll('*').forEach(el => {
        el.style[WEBKIT_PROPERTY] = 'visible';
        el.style[WEBKIT_PROPERTY] = '';
      });
    }
  }

  // Workaround for https://github.com/Polymer/polymer/issues/5259
  get __data() {
    return this.__dataValue || {};
  }

  set __data(value) {
    this.__dataValue = value;
  }

  /**
   * Fired when the user commits a value change.
   *
   * @event change
   */

  /**
   * Fired when the value is changed by the user: on every typing keystroke,
   * and the value is cleared using the clear button.
   *
   * @event input
   */

  /**
   * Fired when the size of the element changes.
   *
   * @event iron-resize
   */
};

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/**
 * `<vaadin-text-field>` is a Web Component for text field control in forms.
 *
 * ```html
 * <vaadin-text-field label="First Name">
 * </vaadin-text-field>
 * ```
 *
 * ### Prefixes and suffixes
 *
 * These are child elements of a `<vaadin-text-field>` that are displayed
 * inline with the input, before or after.
 * In order for an element to be considered as a prefix, it must have the slot
 * attribute set to `prefix` (and similarly for `suffix`).
 *
 * ```html
 * <vaadin-text-field label="Email address">
 *   <div slot="prefix">Sent to:</div>
 *   <div slot="suffix">@vaadin.com</div>
 * </vaadin-text-area>
 * ```
 *
 * ### Styling
 *
 * The following custom properties are available for styling:
 *
 * Custom property | Description | Default
 * ----------------|-------------|-------------
 * `--vaadin-text-field-default-width` | Set the default width of the input field | `12em`
 *
 * The following shadow DOM parts are available for styling:
 *
 * Part name | Description
 * ----------------|----------------
 * `label` | The label element
 * `input-field` | The element that wraps prefix, value and suffix
 * `value` | The text value element inside the `input-field` element
 * `error-message` | The error message element
 *
 * The following state attributes are available for styling:
 *
 * Attribute    | Description | Part name
 * -------------|-------------|------------
 * `disabled` | Set to a disabled text field | :host
 * `has-value` | Set when the element has a value | :host
 * `has-label` | Set when the element has a label | :host
 * `has-helper` | Set when the element has helper text or slot | :host
 * `has-error-message` | Set when the element has an error message | :host
 * `invalid` | Set when the element is invalid | :host
 * `input-prevented` | Temporarily set when invalid input is prevented | :host
 * `focused` | Set when the element is focused | :host
 * `focus-ring` | Set when the element is keyboard focused | :host
 * `readonly` | Set to a readonly text field | :host
 *
 * See [ThemableMixin – how to apply styles for shadow parts](https://github.com/vaadin/vaadin-themable-mixin/wiki)
 *
 * @extends PolymerElement
 * @mixes TextFieldMixin
 * @mixes ControlStateMixin
 * @mixes ThemableMixin
 * @mixes ElementMixin
 * @demo demo/index.html
 */
class TextFieldElement extends
  ElementMixin$1(
    TextFieldMixin(
      ControlStateMixin(
        ThemableMixin(PolymerElement)))) {
  static get template() {
    return html`
    <style include="vaadin-text-field-shared-styles">
      /* polymer-cli linter breaks with empty line */
    </style>

    <div class="vaadin-text-field-container">

      <label part="label" on-click="focus" id="[[_labelId]]">[[label]]</label>

      <div part="input-field" id="[[_inputId]]">

        <slot name="prefix"></slot>

        <slot name="input">
          <input part="value">
        </slot>

        <div part="clear-button" id="clearButton" role="button" aria-label\$="[[i18n.clear]]"></div>
        <slot name="suffix"></slot>

      </div>

      <div part="helper-text" on-click="focus" id="[[_helperTextId]]">
        <slot name="helper">[[helperText]]</slot>
      </div>

      <div part="error-message" id="[[_errorId]]" aria-live="assertive" aria-hidden\$="[[_getErrorMessageAriaHidden(invalid, errorMessage, _errorId)]]">[[errorMessage]]</div>

    </div>
`;
  }

  static get is() {
    return 'vaadin-text-field';
  }

  static get version() {
    return '2.8.1';
  }

  static get properties() {
    return {
      /**
       * Identifies a list of pre-defined options to suggest to the user.
       * The value must be the id of a <datalist> element in the same document.
       */
      list: {
        type: String
      },

      /**
       * A regular expression that the value is checked against.
       * The pattern must match the entire value, not just some subset.
       */
      pattern: {
        type: String
      },

      /**
       * The text usually displayed in a tooltip popup when the mouse is over the field.
       * @type {string}
       */
      title: {
        type: String
      }
    };
  }
}

customElements.define(TextFieldElement.is, TextFieldElement);

const $_documentContainer$h = html`<dom-module id="lumo-date-picker-text-field" theme-for="vaadin-date-picker-text-field">
  <template>
    <style>
      :not(*):placeholder-shown, /* to prevent broken styles on IE */
      :host([dir="rtl"]) [part="value"]:placeholder-shown,
      :host([dir="rtl"]) [part="input-field"] ::slotted(input:placeholder-shown) {
        --_lumo-text-field-overflow-mask-image: none;
      }

      :host([dir="rtl"]) [part="value"],
      :host([dir="rtl"]) [part="input-field"] ::slotted(input) {
        --_lumo-text-field-overflow-mask-image: linear-gradient(to left, transparent, #000 1.25em);
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$h.content);

/**
@license
Copyright (c) 2019 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/

const $_documentContainer$i = document.createElement('template');

$_documentContainer$i.innerHTML = `<dom-module id="vaadin-date-picker-text-field-styles" theme-for="vaadin-date-picker-text-field">
  <template>
    <style>
      :host([dir="rtl"]) [part="input-field"] {
        direction: ltr;
      }

      :host([dir="rtl"]) [part="value"]::placeholder {
        direction: rtl;
        text-align: left;
      }

      :host([dir="rtl"]) [part="input-field"] ::slotted(input)::placeholder {
        direction: rtl;
        text-align: left;
      }

      :host([dir="rtl"]) [part="value"]:-ms-input-placeholder,
      :host([dir="rtl"]) [part="input-field"] ::slotted(input):-ms-input-placeholder {
        direction: rtl;
        text-align: left;
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$i.content);
/**
  * The text-field element for date input.
  *
  * ### Styling
  *
  * See [`<vaadin-text-field>` documentation](https://github.com/vaadin/vaadin-text-field/blob/master/src/vaadin-text-field.html)
  * for `<vaadin-date-picker-text-field>` parts and available slots (prefix, suffix etc.)
  *
  * See [ThemableMixin – how to apply styles for shadow parts](https://github.com/vaadin/vaadin-themable-mixin/wiki)
  *
  * @extends PolymerElement
  */
class DatePickerTextFieldElement extends TextFieldElement {
  static get is() {
    return 'vaadin-date-picker-text-field';
  }
}

customElements.define(DatePickerTextFieldElement.is, DatePickerTextFieldElement);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/** @unrestricted */
class StyleNode {
  constructor() {
    /** @type {number} */
    this['start'] = 0;
    /** @type {number} */
    this['end'] = 0;
    /** @type {StyleNode} */
    this['previous'] = null;
    /** @type {StyleNode} */
    this['parent'] = null;
    /** @type {Array<StyleNode>} */
    this['rules'] = null;
    /** @type {string} */
    this['parsedCssText'] = '';
    /** @type {string} */
    this['cssText'] = '';
    /** @type {boolean} */
    this['atRule'] = false;
    /** @type {number} */
    this['type'] = 0;
    /** @type {string} */
    this['keyframesName'] = '';
    /** @type {string} */
    this['selector'] = '';
    /** @type {string} */
    this['parsedSelector'] = '';
  }
}

// given a string of css, return a simple rule tree
/**
 * @param {string} text
 * @return {StyleNode}
 */
function parse(text) {
  text = clean(text);
  return parseCss(lex(text), text);
}

// remove stuff we don't care about that may hinder parsing
/**
 * @param {string} cssText
 * @return {string}
 */
function clean(cssText) {
  return cssText.replace(RX.comments, '').replace(RX.port, '');
}

// super simple {...} lexer that returns a node tree
/**
 * @param {string} text
 * @return {!StyleNode}
 */
function lex(text) {
  let root = new StyleNode();
  root['start'] = 0;
  root['end'] = text.length;
  let n = root;
  for (let i = 0, l = text.length; i < l; i++) {
    if (text[i] === OPEN_BRACE) {
      if (!n['rules']) {
        n['rules'] = [];
      }
      let p = n;
      let previous = p['rules'][p['rules'].length - 1] || null;
      n = new StyleNode();
      n['start'] = i + 1;
      n['parent'] = p;
      n['previous'] = previous;
      p['rules'].push(n);
    } else if (text[i] === CLOSE_BRACE) {
      n['end'] = i + 1;
      n = n['parent'] || root;
    }
  }
  return root;
}

// add selectors/cssText to node tree
/**
 * @param {StyleNode} node
 * @param {string} text
 * @return {!StyleNode}
 */
function parseCss(node, text) {
  let t = text.substring(node['start'], node['end'] - 1);
  node['parsedCssText'] = node['cssText'] = t.trim();
  if (node['parent']) {
    let ss = node['previous'] ? node['previous']['end'] : node['parent']['start'];
    t = text.substring(ss, node['start'] - 1);
    t = _expandUnicodeEscapes(t);
    t = t.replace(RX.multipleSpaces, ' ');
    // TODO(sorvell): ad hoc; make selector include only after last ;
    // helps with mixin syntax
    t = t.substring(t.lastIndexOf(';') + 1);
    let s = node['parsedSelector'] = node['selector'] = t.trim();
    node['atRule'] = (s.indexOf(AT_START) === 0);
    // note, support a subset of rule types...
    if (node['atRule']) {
      if (s.indexOf(MEDIA_START) === 0) {
        node['type'] = types.MEDIA_RULE;
      } else if (s.match(RX.keyframesRule)) {
        node['type'] = types.KEYFRAMES_RULE;
        node['keyframesName'] =
          node['selector'].split(RX.multipleSpaces).pop();
      }
    } else {
      if (s.indexOf(VAR_START) === 0) {
        node['type'] = types.MIXIN_RULE;
      } else {
        node['type'] = types.STYLE_RULE;
      }
    }
  }
  let r$ = node['rules'];
  if (r$) {
    for (let i = 0, l = r$.length, r;
      (i < l) && (r = r$[i]); i++) {
      parseCss(r, text);
    }
  }
  return node;
}

/**
 * conversion of sort unicode escapes with spaces like `\33 ` (and longer) into
 * expanded form that doesn't require trailing space `\000033`
 * @param {string} s
 * @return {string}
 */
function _expandUnicodeEscapes(s) {
  return s.replace(/\\([0-9a-f]{1,6})\s/gi, function() {
    let code = arguments[1],
      repeat = 6 - code.length;
    while (repeat--) {
      code = '0' + code;
    }
    return '\\' + code;
  });
}

/**
 * stringify parsed css.
 * @param {StyleNode} node
 * @param {boolean=} preserveProperties
 * @param {string=} text
 * @return {string}
 */
function stringify(node, preserveProperties, text = '') {
  // calc rule cssText
  let cssText = '';
  if (node['cssText'] || node['rules']) {
    let r$ = node['rules'];
    if (r$ && !_hasMixinRules(r$)) {
      for (let i = 0, l = r$.length, r;
        (i < l) && (r = r$[i]); i++) {
        cssText = stringify(r, preserveProperties, cssText);
      }
    } else {
      cssText = preserveProperties ? node['cssText'] :
        removeCustomProps(node['cssText']);
      cssText = cssText.trim();
      if (cssText) {
        cssText = '  ' + cssText + '\n';
      }
    }
  }
  // emit rule if there is cssText
  if (cssText) {
    if (node['selector']) {
      text += node['selector'] + ' ' + OPEN_BRACE + '\n';
    }
    text += cssText;
    if (node['selector']) {
      text += CLOSE_BRACE + '\n\n';
    }
  }
  return text;
}

/**
 * @param {Array<StyleNode>} rules
 * @return {boolean}
 */
function _hasMixinRules(rules) {
  let r = rules[0];
  return Boolean(r) && Boolean(r['selector']) && r['selector'].indexOf(VAR_START) === 0;
}

/**
 * @param {string} cssText
 * @return {string}
 */
function removeCustomProps(cssText) {
  cssText = removeCustomPropAssignment(cssText);
  return removeCustomPropApply(cssText);
}

/**
 * @param {string} cssText
 * @return {string}
 */
function removeCustomPropAssignment(cssText) {
  return cssText
    .replace(RX.customProp, '')
    .replace(RX.mixinProp, '');
}

/**
 * @param {string} cssText
 * @return {string}
 */
function removeCustomPropApply(cssText) {
  return cssText
    .replace(RX.mixinApply, '')
    .replace(RX.varApply, '');
}

/** @enum {number} */
const types = {
  STYLE_RULE: 1,
  KEYFRAMES_RULE: 7,
  MEDIA_RULE: 4,
  MIXIN_RULE: 1000
};

const OPEN_BRACE = '{';
const CLOSE_BRACE = '}';

// helper regexp's
const RX = {
  comments: /\/\*[^*]*\*+([^/*][^*]*\*+)*\//gim,
  port: /@import[^;]*;/gim,
  customProp: /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?(?:[;\n]|$)/gim,
  mixinProp: /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?{[^}]*?}(?:[;\n]|$)?/gim,
  mixinApply: /@apply\s*\(?[^);]*\)?\s*(?:[;\n]|$)?/gim,
  varApply: /[^;:]*?:[^;]*?var\([^;]*\)(?:[;\n]|$)?/gim,
  keyframesRule: /^@[^\s]*keyframes/,
  multipleSpaces: /\s+/g
};

const VAR_START = '--';
const MEDIA_START = '@media';
const AT_START = '@';

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/** @type {!Set<string>} */
const styleTextSet = new Set();

const scopingAttribute = 'shady-unscoped';

/**
 * Add a specifically-marked style to the document directly, and only one copy of that style.
 *
 * @param {!HTMLStyleElement} style
 * @return {undefined}
 */
function processUnscopedStyle(style) {
  const text = style.textContent;
  if (!styleTextSet.has(text)) {
    styleTextSet.add(text);
    const newStyle = document.createElement('style');
    newStyle.setAttribute('shady-unscoped', '');
    newStyle.textContent = text;
    document.head.appendChild(newStyle);
  }
}

/**
 * Check if a style is supposed to be unscoped
 * @param {!HTMLStyleElement} style
 * @return {boolean} true if the style has the unscoping attribute
 */
function isUnscopedStyle(style) {
  return style.hasAttribute(scopingAttribute);
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * @param {string|StyleNode} rules
 * @param {function(StyleNode)=} callback
 * @return {string}
 */
function toCssText (rules, callback) {
  if (!rules) {
    return '';
  }
  if (typeof rules === 'string') {
    rules = parse(rules);
  }
  if (callback) {
    forEachRule(rules, callback);
  }
  return stringify(rules, nativeCssVariables);
}

/**
 * @param {HTMLStyleElement} style
 * @return {StyleNode}
 */
function rulesForStyle(style) {
  if (!style['__cssRules'] && style.textContent) {
    style['__cssRules'] = parse(style.textContent);
  }
  return style['__cssRules'] || null;
}

/**
 * @param {StyleNode} node
 * @param {Function=} styleRuleCallback
 * @param {Function=} keyframesRuleCallback
 * @param {boolean=} onlyActiveRules
 */
function forEachRule(node, styleRuleCallback, keyframesRuleCallback, onlyActiveRules) {
  if (!node) {
    return;
  }
  let skipRules = false;
  let type = node['type'];
  if (onlyActiveRules) {
    if (type === types.MEDIA_RULE) {
      let matchMedia = node['selector'].match(MEDIA_MATCH);
      if (matchMedia) {
        // if rule is a non matching @media rule, skip subrules
        if (!window.matchMedia(matchMedia[1]).matches) {
          skipRules = true;
        }
      }
    }
  }
  if (type === types.STYLE_RULE) {
    styleRuleCallback(node);
  } else if (keyframesRuleCallback &&
    type === types.KEYFRAMES_RULE) {
    keyframesRuleCallback(node);
  } else if (type === types.MIXIN_RULE) {
    skipRules = true;
  }
  let r$ = node['rules'];
  if (r$ && !skipRules) {
    for (let i=0, l=r$.length, r; (i<l) && (r=r$[i]); i++) {
      forEachRule(r, styleRuleCallback, keyframesRuleCallback, onlyActiveRules);
    }
  }
}

/**
 * Walk from text[start] matching parens and
 * returns position of the outer end paren
 * @param {string} text
 * @param {number} start
 * @return {number}
 */
function findMatchingParen(text, start) {
  let level = 0;
  for (let i=start, l=text.length; i < l; i++) {
    if (text[i] === '(') {
      level++;
    } else if (text[i] === ')') {
      if (--level === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * @param {string} str
 * @param {function(string, string, string, string)} callback
 */
function processVariableAndFallback(str, callback) {
  // find 'var('
  let start = str.indexOf('var(');
  if (start === -1) {
    // no var?, everything is prefix
    return callback(str, '', '', '');
  }
  //${prefix}var(${inner})${suffix}
  let end = findMatchingParen(str, start + 3);
  let inner = str.substring(start + 4, end);
  let prefix = str.substring(0, start);
  // suffix may have other variables
  let suffix = processVariableAndFallback(str.substring(end + 1), callback);
  let comma = inner.indexOf(',');
  // value and fallback args should be trimmed to match in property lookup
  if (comma === -1) {
    // variable, no fallback
    return callback(prefix, inner.trim(), '', suffix);
  }
  // var(${value},${fallback})
  let value = inner.substring(0, comma).trim();
  let fallback = inner.substring(comma + 1).trim();
  return callback(prefix, value, fallback, suffix);
}

/**
 * @type {function(*):*}
 */
const wrap$1 = window['ShadyDOM'] && window['ShadyDOM']['wrap'] || ((node) => node);

/**
 * @param {Element | {is: string, extends: string}} element
 * @return {{is: string, typeExtension: string}}
 */
function getIsExtends(element) {
  let localName = element['localName'];
  let is = '', typeExtension = '';
  /*
  NOTE: technically, this can be wrong for certain svg elements
  with `-` in the name like `<font-face>`
  */
  if (localName) {
    if (localName.indexOf('-') > -1) {
      is = localName;
    } else {
      typeExtension = localName;
      is = (element.getAttribute && element.getAttribute('is')) || '';
    }
  } else {
    is = /** @type {?} */(element).is;
    typeExtension = /** @type {?} */(element).extends;
  }
  return {is, typeExtension};
}

/**
 * @param {Element|DocumentFragment} element
 * @return {string}
 */
function gatherStyleText(element) {
  /** @type {!Array<string>} */
  const styleTextParts = [];
  const styles = /** @type {!NodeList<!HTMLStyleElement>} */(element.querySelectorAll('style'));
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    if (isUnscopedStyle(style)) {
      if (!nativeShadow) {
        processUnscopedStyle(style);
        style.parentNode.removeChild(style);
      }
    } else {
      styleTextParts.push(style.textContent);
      style.parentNode.removeChild(style);
    }
  }
  return styleTextParts.join('').trim();
}

const CSS_BUILD_ATTR = 'css-build';

/**
 * Return the polymer-css-build "build type" applied to this element
 *
 * @param {!HTMLElement} element
 * @return {string} Can be "", "shady", or "shadow"
 */
function getCssBuild(element) {
  if (cssBuild !== undefined) {
    return /** @type {string} */(cssBuild);
  }
  if (element.__cssBuild === undefined) {
    // try attribute first, as it is the common case
    const attrValue = element.getAttribute(CSS_BUILD_ATTR);
    if (attrValue) {
      element.__cssBuild = attrValue;
    } else {
      const buildComment = getBuildComment(element);
      if (buildComment !== '') {
        // remove build comment so it is not needlessly copied into every element instance
        removeBuildComment(element);
      }
      element.__cssBuild = buildComment;
    }
  }
  return element.__cssBuild || '';
}

/**
 * Check if the given element, either a <template> or <style>, has been processed
 * by polymer-css-build.
 *
 * If so, then we can make a number of optimizations:
 * - polymer-css-build will decompose mixins into individual CSS Custom Properties,
 * so the ApplyShim can be skipped entirely.
 * - Under native ShadowDOM, the style text can just be copied into each instance
 * without modification
 * - If the build is "shady" and ShadyDOM is in use, the styling does not need
 * scoping beyond the shimming of CSS Custom Properties
 *
 * @param {!HTMLElement} element
 * @return {boolean}
 */
function elementHasBuiltCss(element) {
  return getCssBuild(element) !== '';
}

/**
 * For templates made with tagged template literals, polymer-css-build will
 * insert a comment of the form `<!--css-build:shadow-->`
 *
 * @param {!HTMLElement} element
 * @return {string}
 */
function getBuildComment(element) {
  const buildComment = element.localName === 'template' ?
      /** @type {!HTMLTemplateElement} */ (element).content.firstChild :
      element.firstChild;
  if (buildComment instanceof Comment) {
    const commentParts = buildComment.textContent.trim().split(':');
    if (commentParts[0] === CSS_BUILD_ATTR) {
      return commentParts[1];
    }
  }
  return '';
}

/**
 * @param {!HTMLElement} element
 */
function removeBuildComment(element) {
  const buildComment = element.localName === 'template' ?
      /** @type {!HTMLTemplateElement} */ (element).content.firstChild :
      element.firstChild;
  buildComment.parentNode.removeChild(buildComment);
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const APPLY_NAME_CLEAN = /;\s*/m;
const INITIAL_INHERIT = /^\s*(initial)|(inherit)\s*$/;
const IMPORTANT = /\s*!important/;

// separator used between mixin-name and mixin-property-name when producing properties
// NOTE: plain '-' may cause collisions in user styles
const MIXIN_VAR_SEP = '_-_';

// map of mixin to property names
// --foo: {border: 2px} -> {properties: {(--foo, ['border'])}, dependants: {'element-name': proto}}
class MixinMap {
  constructor() {
    /** @type {!Object<string, !MixinMapEntry>} */
    this._map = {};
  }
  /**
   * @param {string} name
   * @param {!PropertyEntry} props
   */
  set(name, props) {
    name = name.trim();
    this._map[name] = {
      properties: props,
      dependants: {}
    };
  }
  /**
   * @param {string} name
   * @return {MixinMapEntry}
   */
  get(name) {
    name = name.trim();
    return this._map[name] || null;
  }
}

/**
 * Callback for when an element is marked invalid
 * @type {?function(string)}
 */
let invalidCallback = null;

/** @unrestricted */
class ApplyShim {
  constructor() {
    /** @type {?string} */
    this._currentElement = null;
    /** @type {HTMLMetaElement} */
    this._measureElement = null;
    this._map = new MixinMap();
  }
  /**
   * return true if `cssText` contains a mixin definition or consumption
   * @param {string} cssText
   * @return {boolean}
   */
  detectMixin(cssText) {
    return detectMixin(cssText);
  }

  /**
   * Gather styles into one style for easier processing
   * @param {!HTMLTemplateElement} template
   * @return {HTMLStyleElement}
   */
  gatherStyles(template) {
    const styleText = gatherStyleText(template.content);
    if (styleText) {
      const style = /** @type {!HTMLStyleElement} */(document.createElement('style'));
      style.textContent = styleText;
      template.content.insertBefore(style, template.content.firstChild);
      return style;
    }
    return null;
  }
  /**
   * @param {!HTMLTemplateElement} template
   * @param {string} elementName
   * @return {StyleNode}
   */
  transformTemplate(template, elementName) {
    if (template._gatheredStyle === undefined) {
      template._gatheredStyle = this.gatherStyles(template);
    }
    /** @type {HTMLStyleElement} */
    const style = template._gatheredStyle;
    return style ? this.transformStyle(style, elementName) : null;
  }
  /**
   * @param {!HTMLStyleElement} style
   * @param {string} elementName
   * @return {StyleNode}
   */
  transformStyle(style, elementName = '') {
    let ast = rulesForStyle(style);
    this.transformRules(ast, elementName);
    style.textContent = toCssText(ast);
    return ast;
  }
  /**
   * @param {!HTMLStyleElement} style
   * @return {StyleNode}
   */
  transformCustomStyle(style) {
    let ast = rulesForStyle(style);
    forEachRule(ast, (rule) => {
      if (rule['selector'] === ':root') {
        rule['selector'] = 'html';
      }
      this.transformRule(rule);
    });
    style.textContent = toCssText(ast);
    return ast;
  }
  /**
   * @param {StyleNode} rules
   * @param {string} elementName
   */
  transformRules(rules, elementName) {
    this._currentElement = elementName;
    forEachRule(rules, (r) => {
      this.transformRule(r);
    });
    this._currentElement = null;
  }
  /**
   * @param {!StyleNode} rule
   */
  transformRule(rule) {
    rule['cssText'] = this.transformCssText(rule['parsedCssText'], rule);
    // :root was only used for variable assignment in property shim,
    // but generates invalid selectors with real properties.
    // replace with `:host > *`, which serves the same effect
    if (rule['selector'] === ':root') {
      rule['selector'] = ':host > *';
    }
  }
  /**
   * @param {string} cssText
   * @param {!StyleNode} rule
   * @return {string}
   */
  transformCssText(cssText, rule) {
    // produce variables
    cssText = cssText.replace(VAR_ASSIGN, (matchText, propertyName, valueProperty, valueMixin) =>
      this._produceCssProperties(matchText, propertyName, valueProperty, valueMixin, rule));
    // consume mixins
    return this._consumeCssProperties(cssText, rule);
  }
  /**
   * @param {string} property
   * @return {string}
   */
  _getInitialValueForProperty(property) {
    if (!this._measureElement) {
      this._measureElement = /** @type {HTMLMetaElement} */(document.createElement('meta'));
      this._measureElement.setAttribute('apply-shim-measure', '');
      this._measureElement.style.all = 'initial';
      document.head.appendChild(this._measureElement);
    }
    return window.getComputedStyle(this._measureElement).getPropertyValue(property);
  }
  /**
   * Walk over all rules before this rule to find fallbacks for mixins
   *
   * @param {!StyleNode} startRule
   * @return {!Object}
   */
  _fallbacksFromPreviousRules(startRule) {
    // find the "top" rule
    let topRule = startRule;
    while (topRule['parent']) {
      topRule = topRule['parent'];
    }
    const fallbacks = {};
    let seenStartRule = false;
    forEachRule(topRule, (r) => {
      // stop when we hit the input rule
      seenStartRule = seenStartRule || r === startRule;
      if (seenStartRule) {
        return;
      }
      // NOTE: Only matching selectors are "safe" for this fallback processing
      // It would be prohibitive to run `matchesSelector()` on each selector,
      // so we cheat and only check if the same selector string is used, which
      // guarantees things like specificity matching
      if (r['selector'] === startRule['selector']) {
        Object.assign(fallbacks, this._cssTextToMap(r['parsedCssText']));
      }
    });
    return fallbacks;
  }
  /**
   * replace mixin consumption with variable consumption
   * @param {string} text
   * @param {!StyleNode=} rule
   * @return {string}
   */
  _consumeCssProperties(text, rule) {
    /** @type {Array} */
    let m = null;
    // loop over text until all mixins with defintions have been applied
    while((m = MIXIN_MATCH.exec(text))) {
      let matchText = m[0];
      let mixinName = m[1];
      let idx = m.index;
      // collect properties before apply to be "defaults" if mixin might override them
      // match includes a "prefix", so find the start and end positions of @apply
      let applyPos = idx + matchText.indexOf('@apply');
      let afterApplyPos = idx + matchText.length;
      // find props defined before this @apply
      let textBeforeApply = text.slice(0, applyPos);
      let textAfterApply = text.slice(afterApplyPos);
      let defaults = rule ? this._fallbacksFromPreviousRules(rule) : {};
      Object.assign(defaults, this._cssTextToMap(textBeforeApply));
      let replacement = this._atApplyToCssProperties(mixinName, defaults);
      // use regex match position to replace mixin, keep linear processing time
      text = `${textBeforeApply}${replacement}${textAfterApply}`;
      // move regex search to _after_ replacement
      MIXIN_MATCH.lastIndex = idx + replacement.length;
    }
    return text;
  }
  /**
   * produce variable consumption at the site of mixin consumption
   * `@apply` --foo; -> for all props (${propname}: var(--foo_-_${propname}, ${fallback[propname]}}))
   * Example:
   *  border: var(--foo_-_border); padding: var(--foo_-_padding, 2px)
   *
   * @param {string} mixinName
   * @param {Object} fallbacks
   * @return {string}
   */
  _atApplyToCssProperties(mixinName, fallbacks) {
    mixinName = mixinName.replace(APPLY_NAME_CLEAN, '');
    let vars = [];
    let mixinEntry = this._map.get(mixinName);
    // if we depend on a mixin before it is created
    // make a sentinel entry in the map to add this element as a dependency for when it is defined.
    if (!mixinEntry) {
      this._map.set(mixinName, {});
      mixinEntry = this._map.get(mixinName);
    }
    if (mixinEntry) {
      if (this._currentElement) {
        mixinEntry.dependants[this._currentElement] = true;
      }
      let p, parts, f;
      const properties = mixinEntry.properties;
      for (p in properties) {
        f = fallbacks && fallbacks[p];
        parts = [p, ': var(', mixinName, MIXIN_VAR_SEP, p];
        if (f) {
          parts.push(',', f.replace(IMPORTANT, ''));
        }
        parts.push(')');
        if (IMPORTANT.test(properties[p])) {
          parts.push(' !important');
        }
        vars.push(parts.join(''));
      }
    }
    return vars.join('; ');
  }

  /**
   * @param {string} property
   * @param {string} value
   * @return {string}
   */
  _replaceInitialOrInherit(property, value) {
    let match = INITIAL_INHERIT.exec(value);
    if (match) {
      if (match[1]) {
        // initial
        // replace `initial` with the concrete initial value for this property
        value = this._getInitialValueForProperty(property);
      } else {
        // inherit
        // with this purposfully illegal value, the variable will be invalid at
        // compute time (https://www.w3.org/TR/css-variables/#invalid-at-computed-value-time)
        // and for inheriting values, will behave similarly
        // we cannot support the same behavior for non inheriting values like 'border'
        value = 'apply-shim-inherit';
      }
    }
    return value;
  }

  /**
   * "parse" a mixin definition into a map of properties and values
   * cssTextToMap('border: 2px solid black') -> ('border', '2px solid black')
   * @param {string} text
   * @param {boolean=} replaceInitialOrInherit
   * @return {!Object<string, string>}
   */
  _cssTextToMap(text, replaceInitialOrInherit = false) {
    let props = text.split(';');
    let property, value;
    let out = {};
    for (let i = 0, p, sp; i < props.length; i++) {
      p = props[i];
      if (p) {
        sp = p.split(':');
        // ignore lines that aren't definitions like @media
        if (sp.length > 1) {
          property = sp[0].trim();
          // some properties may have ':' in the value, like data urls
          value = sp.slice(1).join(':');
          if (replaceInitialOrInherit) {
            value = this._replaceInitialOrInherit(property, value);
          }
          out[property] = value;
        }
      }
    }
    return out;
  }

  /**
   * @param {MixinMapEntry} mixinEntry
   */
  _invalidateMixinEntry(mixinEntry) {
    if (!invalidCallback) {
      return;
    }
    for (let elementName in mixinEntry.dependants) {
      if (elementName !== this._currentElement) {
        invalidCallback(elementName);
      }
    }
  }

  /**
   * @param {string} matchText
   * @param {string} propertyName
   * @param {?string} valueProperty
   * @param {?string} valueMixin
   * @param {!StyleNode} rule
   * @return {string}
   */
  _produceCssProperties(matchText, propertyName, valueProperty, valueMixin, rule) {
    // handle case where property value is a mixin
    if (valueProperty) {
      // form: --mixin2: var(--mixin1), where --mixin1 is in the map
      processVariableAndFallback(valueProperty, (prefix, value) => {
        if (value && this._map.get(value)) {
          valueMixin = `@apply ${value};`;
        }
      });
    }
    if (!valueMixin) {
      return matchText;
    }
    let mixinAsProperties = this._consumeCssProperties('' + valueMixin, rule);
    let prefix = matchText.slice(0, matchText.indexOf('--'));
    // `initial` and `inherit` as properties in a map should be replaced because
    // these keywords are eagerly evaluated when the mixin becomes CSS Custom Properties,
    // and would set the variable value, rather than carry the keyword to the `var()` usage.
    let mixinValues = this._cssTextToMap(mixinAsProperties, true);
    let combinedProps = mixinValues;
    let mixinEntry = this._map.get(propertyName);
    let oldProps = mixinEntry && mixinEntry.properties;
    if (oldProps) {
      // NOTE: since we use mixin, the map of properties is updated here
      // and this is what we want.
      combinedProps = Object.assign(Object.create(oldProps), mixinValues);
    } else {
      this._map.set(propertyName, combinedProps);
    }
    let out = [];
    let p, v;
    // set variables defined by current mixin
    let needToInvalidate = false;
    for (p in combinedProps) {
      v = mixinValues[p];
      // if property not defined by current mixin, set initial
      if (v === undefined) {
        v = 'initial';
      }
      if (oldProps && !(p in oldProps)) {
        needToInvalidate = true;
      }
      out.push(`${propertyName}${MIXIN_VAR_SEP}${p}: ${v}`);
    }
    if (needToInvalidate) {
      this._invalidateMixinEntry(mixinEntry);
    }
    if (mixinEntry) {
      mixinEntry.properties = combinedProps;
    }
    // because the mixinMap is global, the mixin might conflict with
    // a different scope's simple variable definition:
    // Example:
    // some style somewhere:
    // --mixin1:{ ... }
    // --mixin2: var(--mixin1);
    // some other element:
    // --mixin1: 10px solid red;
    // --foo: var(--mixin1);
    // In this case, we leave the original variable definition in place.
    if (valueProperty) {
      prefix = `${matchText};${prefix}`;
    }
    return `${prefix}${out.join('; ')};`;
  }
}

/* exports */
/* eslint-disable no-self-assign */
ApplyShim.prototype['detectMixin'] = ApplyShim.prototype.detectMixin;
ApplyShim.prototype['transformStyle'] = ApplyShim.prototype.transformStyle;
ApplyShim.prototype['transformCustomStyle'] = ApplyShim.prototype.transformCustomStyle;
ApplyShim.prototype['transformRules'] = ApplyShim.prototype.transformRules;
ApplyShim.prototype['transformRule'] = ApplyShim.prototype.transformRule;
ApplyShim.prototype['transformTemplate'] = ApplyShim.prototype.transformTemplate;
ApplyShim.prototype['_separator'] = MIXIN_VAR_SEP;
/* eslint-enable no-self-assign */
Object.defineProperty(ApplyShim.prototype, 'invalidCallback', {
  /** @return {?function(string)} */
  get() {
    return invalidCallback;
  },
  /** @param {?function(string)} cb */
  set(cb) {
    invalidCallback = cb;
  }
});

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * @const {!Object<string, !HTMLTemplateElement>}
 */
const templateMap = {};

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/*
 * Utilities for handling invalidating apply-shim mixins for a given template.
 *
 * The invalidation strategy involves keeping track of the "current" version of a template's mixins, and updating that count when a mixin is invalidated.
 * The template
 */

/** @const {string} */
const CURRENT_VERSION = '_applyShimCurrentVersion';

/** @const {string} */
const NEXT_VERSION = '_applyShimNextVersion';

/** @const {string} */
const VALIDATING_VERSION = '_applyShimValidatingVersion';

/**
 * @const {Promise<void>}
 */
const promise = Promise.resolve();

/**
 * @param {string} elementName
 */
function invalidate(elementName){
  let template = templateMap[elementName];
  if (template) {
    invalidateTemplate(template);
  }
}

/**
 * This function can be called multiple times to mark a template invalid
 * and signal that the style inside must be regenerated.
 *
 * Use `startValidatingTemplate` to begin an asynchronous validation cycle.
 * During that cycle, call `templateIsValidating` to see if the template must
 * be revalidated
 * @param {HTMLTemplateElement} template
 */
function invalidateTemplate(template) {
  // default the current version to 0
  template[CURRENT_VERSION] = template[CURRENT_VERSION] || 0;
  // ensure the "validating for" flag exists
  template[VALIDATING_VERSION] = template[VALIDATING_VERSION] || 0;
  // increment the next version
  template[NEXT_VERSION] = (template[NEXT_VERSION] || 0) + 1;
}

/**
 * @param {HTMLTemplateElement} template
 * @return {boolean}
 */
function templateIsValid(template) {
  return template[CURRENT_VERSION] === template[NEXT_VERSION];
}

/**
 * Returns true if the template is currently invalid and `startValidating` has been called since the last invalidation.
 * If false, the template must be validated.
 * @param {HTMLTemplateElement} template
 * @return {boolean}
 */
function templateIsValidating(template) {
  return !templateIsValid(template) && template[VALIDATING_VERSION] === template[NEXT_VERSION];
}

/**
 * Begin an asynchronous invalidation cycle.
 * This should be called after every validation of a template
 *
 * After one microtask, the template will be marked as valid until the next call to `invalidateTemplate`
 * @param {HTMLTemplateElement} template
 */
function startValidatingTemplate(template) {
  // remember that the current "next version" is the reason for this validation cycle
  template[VALIDATING_VERSION] = template[NEXT_VERSION];
  // however, there only needs to be one async task to clear the counters
  if (!template._validating) {
    template._validating = true;
    promise.then(function() {
      // sync the current version to let future invalidations cause a refresh cycle
      template[CURRENT_VERSION] = template[NEXT_VERSION];
      template._validating = false;
    });
  }
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/** @const {ApplyShim} */
const applyShim = new ApplyShim();

class ApplyShimInterface {
  constructor() {
    /** @type {?CustomStyleInterfaceInterface} */
    this.customStyleInterface = null;
    applyShim['invalidCallback'] = invalidate;
  }
  ensure() {
    if (this.customStyleInterface) {
      return;
    }
    if (window.ShadyCSS.CustomStyleInterface) {
      this.customStyleInterface =
          /** @type {!CustomStyleInterfaceInterface} */ (
              window.ShadyCSS.CustomStyleInterface);
      this.customStyleInterface['transformCallback'] = (style) => {
        applyShim.transformCustomStyle(style);
      };
      this.customStyleInterface['validateCallback'] = () => {
        requestAnimationFrame(() => {
          if (this.customStyleInterface['enqueued']) {
            this.flushCustomStyles();
          }
        });
      };
    }
  }
  /**
   * @param {!HTMLTemplateElement} template
   * @param {string} elementName
   */
  prepareTemplate(template, elementName) {
    this.ensure();
    if (elementHasBuiltCss(template)) {
      return;
    }
    templateMap[elementName] = template;
    let ast = applyShim.transformTemplate(template, elementName);
    // save original style ast to use for revalidating instances
    template['_styleAst'] = ast;
  }
  flushCustomStyles() {
    this.ensure();
    if (!this.customStyleInterface) {
      return;
    }
    let styles = this.customStyleInterface['processStyles']();
    if (!this.customStyleInterface['enqueued']) {
      return;
    }
    for (let i = 0; i < styles.length; i++ ) {
      let cs = styles[i];
      let style = this.customStyleInterface['getStyleForCustomStyle'](cs);
      if (style) {
        applyShim.transformCustomStyle(style);
      }
    }
    this.customStyleInterface['enqueued'] = false;
  }
  /**
   * @param {HTMLElement} element
   * @param {Object=} properties
   */
  styleSubtree(element, properties) {
    this.ensure();
    if (properties) {
      updateNativeProperties(element, properties);
    }
    if (element.shadowRoot) {
      this.styleElement(element);
      let shadowChildren =
          /** @type {!ParentNode} */ (element.shadowRoot).children ||
          element.shadowRoot.childNodes;
      for (let i = 0; i < shadowChildren.length; i++) {
        this.styleSubtree(/** @type {HTMLElement} */(shadowChildren[i]));
      }
    } else {
      let children = element.children || element.childNodes;
      for (let i = 0; i < children.length; i++) {
        this.styleSubtree(/** @type {HTMLElement} */(children[i]));
      }
    }
  }
  /**
   * @param {HTMLElement} element
   */
  styleElement(element) {
    this.ensure();
    let {is} = getIsExtends(element);
    let template = templateMap[is];
    if (template && elementHasBuiltCss(template)) {
      return;
    }
    if (template && !templateIsValid(template)) {
      // only revalidate template once
      if (!templateIsValidating(template)) {
        this.prepareTemplate(template, is);
        startValidatingTemplate(template);
      }
      // update this element instance
      let root = element.shadowRoot;
      if (root) {
        let style = /** @type {HTMLStyleElement} */(root.querySelector('style'));
        if (style) {
          // reuse the template's style ast, it has all the original css text
          style['__cssRules'] = template['_styleAst'];
          style.textContent = toCssText(template['_styleAst']);
        }
      }
    }
  }
  /**
   * @param {Object=} properties
   */
  styleDocument(properties) {
    this.ensure();
    this.styleSubtree(document.body, properties);
  }
}

if (!window.ShadyCSS || !window.ShadyCSS.ScopingShim) {
  const applyShimInterface = new ApplyShimInterface();
  let CustomStyleInterface = window.ShadyCSS && window.ShadyCSS.CustomStyleInterface;

  /** @suppress {duplicate} */
  window.ShadyCSS = {
    /**
     * @param {!HTMLTemplateElement} template
     * @param {string} elementName
     * @param {string=} elementExtends
     */
    prepareTemplate(template, elementName, elementExtends) { // eslint-disable-line no-unused-vars
      applyShimInterface.flushCustomStyles();
      applyShimInterface.prepareTemplate(template, elementName);
    },

    /**
     * @param {!HTMLTemplateElement} template
     * @param {string} elementName
     * @param {string=} elementExtends
     */
    prepareTemplateStyles(template, elementName, elementExtends) {
      window.ShadyCSS.prepareTemplate(template, elementName, elementExtends);
    },

    /**
     * @param {!HTMLTemplateElement} template
     * @param {string} elementName
     */
    prepareTemplateDom(template, elementName) {}, // eslint-disable-line no-unused-vars

    /**
     * @param {!HTMLElement} element
     * @param {Object=} properties
     */
    styleSubtree(element, properties) {
      applyShimInterface.flushCustomStyles();
      applyShimInterface.styleSubtree(element, properties);
    },

    /**
     * @param {!HTMLElement} element
     */
    styleElement(element) {
      applyShimInterface.flushCustomStyles();
      applyShimInterface.styleElement(element);
    },

    /**
     * @param {Object=} properties
     */
    styleDocument(properties) {
      applyShimInterface.flushCustomStyles();
      applyShimInterface.styleDocument(properties);
    },

    /**
     * @param {Element} element
     * @param {string} property
     * @return {string}
     */
    getComputedStyleValue(element, property) {
      return getComputedStyleValue(element, property);
    },

    flushCustomStyles() {
      applyShimInterface.flushCustomStyles();
    },

    nativeCss: nativeCssVariables,
    nativeShadow: nativeShadow,
    cssBuild: cssBuild,
    disableRuntime: disableRuntime,
  };

  if (CustomStyleInterface) {
    window.ShadyCSS.CustomStyleInterface = CustomStyleInterface;
  }
}

window.ShadyCSS.ApplyShim = applyShim;

/**
 * @fileoverview
 * @suppress {checkPrototypalTypes}
 * @license Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

const HOST_DIR = /:host\(:dir\((ltr|rtl)\)\)/g;
const HOST_DIR_REPLACMENT = ':host([dir="$1"])';

const EL_DIR = /([\s\w-#\.\[\]\*]*):dir\((ltr|rtl)\)/g;
const EL_DIR_REPLACMENT = ':host([dir="$2"]) $1';

const DIR_CHECK = /:dir\((?:ltr|rtl)\)/;

const SHIM_SHADOW = Boolean(window['ShadyDOM'] && window['ShadyDOM']['inUse']);

/**
 * @type {!Array<!Polymer_DirMixin>}
 */
const DIR_INSTANCES = [];

/** @type {?MutationObserver} */
let observer = null;

let documentDir = '';

function getRTL() {
  documentDir = document.documentElement.getAttribute('dir');
}

/**
 * @param {!Polymer_DirMixin} instance Instance to set RTL status on
 */
function setRTL(instance) {
  if (!instance.__autoDirOptOut) {
    const el = /** @type {!HTMLElement} */(instance);
    el.setAttribute('dir', documentDir);
  }
}

function updateDirection() {
  getRTL();
  documentDir = document.documentElement.getAttribute('dir');
  for (let i = 0; i < DIR_INSTANCES.length; i++) {
    setRTL(DIR_INSTANCES[i]);
  }
}

function takeRecords() {
  if (observer && observer.takeRecords().length) {
    updateDirection();
  }
}

/**
 * Element class mixin that allows elements to use the `:dir` CSS Selector to
 * have text direction specific styling.
 *
 * With this mixin, any stylesheet provided in the template will transform
 * `:dir` into `:host([dir])` and sync direction with the page via the
 * element's `dir` attribute.
 *
 * Elements can opt out of the global page text direction by setting the `dir`
 * attribute directly in `ready()` or in HTML.
 *
 * Caveats:
 * - Applications must set `<html dir="ltr">` or `<html dir="rtl">` to sync
 *   direction
 * - Automatic left-to-right or right-to-left styling is sync'd with the
 *   `<html>` element only.
 * - Changing `dir` at runtime is supported.
 * - Opting out of the global direction styling is permanent
 *
 * @mixinFunction
 * @polymer
 * @appliesMixin PropertyAccessors
 * @template T
 * @param {function(new:T)} superClass Class to apply mixin to.
 * @return {function(new:T)} superClass with mixin applied.
 */
const DirMixin$1 = dedupingMixin((base) => {

  if (!SHIM_SHADOW) {
    if (!observer) {
      getRTL();
      observer = new MutationObserver(updateDirection);
      observer.observe(document.documentElement, {attributes: true, attributeFilter: ['dir']});
    }
  }

  /**
   * @constructor
   * @implements {Polymer_PropertyAccessors}
   * @private
   */
  const elementBase = PropertyAccessors(base);

  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_DirMixin}
   */
  class Dir extends elementBase {

    /**
     * @param {string} cssText .
     * @param {string} baseURI .
     * @return {string} .
     * @suppress {missingProperties} Interfaces in closure do not inherit statics, but classes do
     * @nocollapse
     */
    static _processStyleText(cssText, baseURI) {
      // TODO(https://github.com/google/closure-compiler/issues/3240):
      //     Change back to just super.methodCall()
      cssText = elementBase._processStyleText.call(this, cssText, baseURI);
      if (!SHIM_SHADOW && DIR_CHECK.test(cssText)) {
        cssText = this._replaceDirInCssText(cssText);
        this.__activateDir = true;
      }
      return cssText;
    }

    /**
     * Replace `:dir` in the given CSS text
     *
     * @param {string} text CSS text to replace DIR
     * @return {string} Modified CSS
     * @nocollapse
     */
    static _replaceDirInCssText(text) {
      let replacedText = text;
      replacedText = replacedText.replace(HOST_DIR, HOST_DIR_REPLACMENT);
      replacedText = replacedText.replace(EL_DIR, EL_DIR_REPLACMENT);
      return replacedText;
    }

    constructor() {
      super();
      /** @type {boolean} */
      this.__autoDirOptOut = false;
    }

    /**
     * @override
     * @suppress {invalidCasts} Closure doesn't understand that `this` is an
     *     HTMLElement
     * @return {void}
     */
    ready() {
      super.ready();
      this.__autoDirOptOut = /** @type {!HTMLElement} */(this).hasAttribute('dir');
    }

    /**
     * @override
     * @suppress {missingProperties} If it exists on elementBase, it can be
     *   super'd
     * @return {void}
     */
    connectedCallback() {
      if (elementBase.prototype.connectedCallback) {
        super.connectedCallback();
      }
      if (this.constructor.__activateDir) {
        takeRecords();
        DIR_INSTANCES.push(this);
        setRTL(this);
      }
    }

    /**
     * @override
     * @suppress {missingProperties} If it exists on elementBase, it can be
     *   super'd
     * @return {void}
     */
    disconnectedCallback() {
      if (elementBase.prototype.disconnectedCallback) {
        super.disconnectedCallback();
      }
      if (this.constructor.__activateDir) {
        const idx = DIR_INSTANCES.indexOf(this);
        if (idx > -1) {
          DIR_INSTANCES.splice(idx, 1);
        }
      }
    }
  }

  Dir.__activateDir = false;

  return Dir;
});

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

let scheduled = false;
let beforeRenderQueue = [];
let afterRenderQueue = [];

function schedule() {
  scheduled = true;
  // before next render
  requestAnimationFrame(function() {
    scheduled = false;
    flushQueue(beforeRenderQueue);
    // after the render
    setTimeout(function() {
      runQueue(afterRenderQueue);
    });
  });
}

function flushQueue(queue) {
  while (queue.length) {
    callMethod(queue.shift());
  }
}

function runQueue(queue) {
  for (let i=0, l=queue.length; i < l; i++) {
    callMethod(queue.shift());
  }
}

function callMethod(info) {
  const context = info[0];
  const callback = info[1];
  const args = info[2];
  try {
    callback.apply(context, args);
  } catch(e) {
    setTimeout(() => {
      throw e;
    });
  }
}

/**
 * Enqueues a callback which will be run after the next render, equivalent
 * to one task (`setTimeout`) after the next `requestAnimationFrame`.
 *
 * This method is useful for tuning the first-render performance of an
 * element or application by deferring non-critical work until after the
 * first paint.  Typical non-render-critical work may include adding UI
 * event listeners and aria attributes.
 *
 * @param {*} context Context object the callback function will be bound to
 * @param {function(...*):void} callback Callback function
 * @param {!Array=} args An array of arguments to call the callback function with
 * @return {void}
 */
function afterNextRender(context, callback, args) {
  if (!scheduled) {
    schedule();
  }
  afterRenderQueue.push([context, callback, args]);
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

function resolve() {
  document.body.removeAttribute('unresolved');
}

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  resolve();
} else {
  window.addEventListener('DOMContentLoaded', resolve);
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

function newSplice(index, removed, addedCount) {
  return {
    index: index,
    removed: removed,
    addedCount: addedCount
  };
}

const EDIT_LEAVE = 0;
const EDIT_UPDATE = 1;
const EDIT_ADD = 2;
const EDIT_DELETE = 3;

// Note: This function is *based* on the computation of the Levenshtein
// "edit" distance. The one change is that "updates" are treated as two
// edits - not one. With Array splices, an update is really a delete
// followed by an add. By retaining this, we optimize for "keeping" the
// maximum array items in the original array. For example:
//
//   'xxxx123' -> '123yyyy'
//
// With 1-edit updates, the shortest path would be just to update all seven
// characters. With 2-edit updates, we delete 4, leave 3, and add 4. This
// leaves the substring '123' intact.
function calcEditDistances(current, currentStart, currentEnd,
                            old, oldStart, oldEnd) {
  // "Deletion" columns
  let rowCount = oldEnd - oldStart + 1;
  let columnCount = currentEnd - currentStart + 1;
  let distances = new Array(rowCount);

  // "Addition" rows. Initialize null column.
  for (let i = 0; i < rowCount; i++) {
    distances[i] = new Array(columnCount);
    distances[i][0] = i;
  }

  // Initialize null row
  for (let j = 0; j < columnCount; j++)
    distances[0][j] = j;

  for (let i = 1; i < rowCount; i++) {
    for (let j = 1; j < columnCount; j++) {
      if (equals(current[currentStart + j - 1], old[oldStart + i - 1]))
        distances[i][j] = distances[i - 1][j - 1];
      else {
        let north = distances[i - 1][j] + 1;
        let west = distances[i][j - 1] + 1;
        distances[i][j] = north < west ? north : west;
      }
    }
  }

  return distances;
}

// This starts at the final weight, and walks "backward" by finding
// the minimum previous weight recursively until the origin of the weight
// matrix.
function spliceOperationsFromEditDistances(distances) {
  let i = distances.length - 1;
  let j = distances[0].length - 1;
  let current = distances[i][j];
  let edits = [];
  while (i > 0 || j > 0) {
    if (i == 0) {
      edits.push(EDIT_ADD);
      j--;
      continue;
    }
    if (j == 0) {
      edits.push(EDIT_DELETE);
      i--;
      continue;
    }
    let northWest = distances[i - 1][j - 1];
    let west = distances[i - 1][j];
    let north = distances[i][j - 1];

    let min;
    if (west < north)
      min = west < northWest ? west : northWest;
    else
      min = north < northWest ? north : northWest;

    if (min == northWest) {
      if (northWest == current) {
        edits.push(EDIT_LEAVE);
      } else {
        edits.push(EDIT_UPDATE);
        current = northWest;
      }
      i--;
      j--;
    } else if (min == west) {
      edits.push(EDIT_DELETE);
      i--;
      current = west;
    } else {
      edits.push(EDIT_ADD);
      j--;
      current = north;
    }
  }

  edits.reverse();
  return edits;
}

/**
 * Splice Projection functions:
 *
 * A splice map is a representation of how a previous array of items
 * was transformed into a new array of items. Conceptually it is a list of
 * tuples of
 *
 *   <index, removed, addedCount>
 *
 * which are kept in ascending index order of. The tuple represents that at
 * the |index|, |removed| sequence of items were removed, and counting forward
 * from |index|, |addedCount| items were added.
 */

/**
 * Lacking individual splice mutation information, the minimal set of
 * splices can be synthesized given the previous state and final state of an
 * array. The basic approach is to calculate the edit distance matrix and
 * choose the shortest path through it.
 *
 * Complexity: O(l * p)
 *   l: The length of the current array
 *   p: The length of the old array
 *
 * @param {!Array} current The current "changed" array for which to
 * calculate splices.
 * @param {number} currentStart Starting index in the `current` array for
 * which splices are calculated.
 * @param {number} currentEnd Ending index in the `current` array for
 * which splices are calculated.
 * @param {!Array} old The original "unchanged" array to compare `current`
 * against to determine splices.
 * @param {number} oldStart Starting index in the `old` array for
 * which splices are calculated.
 * @param {number} oldEnd Ending index in the `old` array for
 * which splices are calculated.
 * @return {!Array} Returns an array of splice record objects. Each of these
 * contains: `index` the location where the splice occurred; `removed`
 * the array of removed items from this location; `addedCount` the number
 * of items added at this location.
 */
function calcSplices(current, currentStart, currentEnd,
                      old, oldStart, oldEnd) {
  let prefixCount = 0;
  let suffixCount = 0;
  let splice;

  let minLength = Math.min(currentEnd - currentStart, oldEnd - oldStart);
  if (currentStart == 0 && oldStart == 0)
    prefixCount = sharedPrefix(current, old, minLength);

  if (currentEnd == current.length && oldEnd == old.length)
    suffixCount = sharedSuffix(current, old, minLength - prefixCount);

  currentStart += prefixCount;
  oldStart += prefixCount;
  currentEnd -= suffixCount;
  oldEnd -= suffixCount;

  if (currentEnd - currentStart == 0 && oldEnd - oldStart == 0)
    return [];

  if (currentStart == currentEnd) {
    splice = newSplice(currentStart, [], 0);
    while (oldStart < oldEnd)
      splice.removed.push(old[oldStart++]);

    return [ splice ];
  } else if (oldStart == oldEnd)
    return [ newSplice(currentStart, [], currentEnd - currentStart) ];

  let ops = spliceOperationsFromEditDistances(
      calcEditDistances(current, currentStart, currentEnd,
                             old, oldStart, oldEnd));

  splice = undefined;
  let splices = [];
  let index = currentStart;
  let oldIndex = oldStart;
  for (let i = 0; i < ops.length; i++) {
    switch(ops[i]) {
      case EDIT_LEAVE:
        if (splice) {
          splices.push(splice);
          splice = undefined;
        }

        index++;
        oldIndex++;
        break;
      case EDIT_UPDATE:
        if (!splice)
          splice = newSplice(index, [], 0);

        splice.addedCount++;
        index++;

        splice.removed.push(old[oldIndex]);
        oldIndex++;
        break;
      case EDIT_ADD:
        if (!splice)
          splice = newSplice(index, [], 0);

        splice.addedCount++;
        index++;
        break;
      case EDIT_DELETE:
        if (!splice)
          splice = newSplice(index, [], 0);

        splice.removed.push(old[oldIndex]);
        oldIndex++;
        break;
    }
  }

  if (splice) {
    splices.push(splice);
  }
  return splices;
}

function sharedPrefix(current, old, searchLength) {
  for (let i = 0; i < searchLength; i++)
    if (!equals(current[i], old[i]))
      return i;
  return searchLength;
}

function sharedSuffix(current, old, searchLength) {
  let index1 = current.length;
  let index2 = old.length;
  let count = 0;
  while (count < searchLength && equals(current[--index1], old[--index2]))
    count++;

  return count;
}

/**
 * Returns an array of splice records indicating the minimum edits required
 * to transform the `previous` array into the `current` array.
 *
 * Splice records are ordered by index and contain the following fields:
 * - `index`: index where edit started
 * - `removed`: array of removed items from this index
 * - `addedCount`: number of items added at this index
 *
 * This function is based on the Levenshtein "minimum edit distance"
 * algorithm. Note that updates are treated as removal followed by addition.
 *
 * The worst-case time complexity of this algorithm is `O(l * p)`
 *   l: The length of the current array
 *   p: The length of the previous array
 *
 * However, the worst-case complexity is reduced by an `O(n)` optimization
 * to detect any shared prefix & suffix between the two arrays and only
 * perform the more expensive minimum edit distance calculation over the
 * non-shared portions of the arrays.
 *
 * @function
 * @param {!Array} current The "changed" array for which splices will be
 * calculated.
 * @param {!Array} previous The "unchanged" original array to compare
 * `current` against to determine the splices.
 * @return {!Array} Returns an array of splice record objects. Each of these
 * contains: `index` the location where the splice occurred; `removed`
 * the array of removed items from this location; `addedCount` the number
 * of items added at this location.
 */
function calculateSplices(current, previous) {
  return calcSplices(current, 0, current.length, previous, 0,
                          previous.length);
}

function equals(currentValue, previousValue) {
  return currentValue === previousValue;
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Returns true if `node` is a slot element
 * @param {!Node} node Node to test.
 * @return {boolean} Returns true if the given `node` is a slot
 * @private
 */
function isSlot(node) {
  return (node.localName === 'slot');
}

/**
 * Class that listens for changes (additions or removals) to
 * "flattened nodes" on a given `node`. The list of flattened nodes consists
 * of a node's children and, for any children that are `<slot>` elements,
 * the expanded flattened list of `assignedNodes`.
 * For example, if the observed node has children `<a></a><slot></slot><b></b>`
 * and the `<slot>` has one `<div>` assigned to it, then the flattened
 * nodes list is `<a></a><div></div><b></b>`. If the `<slot>` has other
 * `<slot>` elements assigned to it, these are flattened as well.
 *
 * The provided `callback` is called whenever any change to this list
 * of flattened nodes occurs, where an addition or removal of a node is
 * considered a change. The `callback` is called with one argument, an object
 * containing an array of any `addedNodes` and `removedNodes`.
 *
 * Note: the callback is called asynchronous to any changes
 * at a microtask checkpoint. This is because observation is performed using
 * `MutationObserver` and the `<slot>` element's `slotchange` event which
 * are asynchronous.
 *
 * An example:
 * ```js
 * class TestSelfObserve extends PolymerElement {
 *   static get is() { return 'test-self-observe';}
 *   connectedCallback() {
 *     super.connectedCallback();
 *     this._observer = new FlattenedNodesObserver(this, (info) => {
 *       this.info = info;
 *     });
 *   }
 *   disconnectedCallback() {
 *     super.disconnectedCallback();
 *     this._observer.disconnect();
 *   }
 * }
 * customElements.define(TestSelfObserve.is, TestSelfObserve);
 * ```
 *
 * @summary Class that listens for changes (additions or removals) to
 * "flattened nodes" on a given `node`.
 * @implements {PolymerDomApi.ObserveHandle}
 */
let FlattenedNodesObserver = class {

  /**
   * Returns the list of flattened nodes for the given `node`.
   * This list consists of a node's children and, for any children
   * that are `<slot>` elements, the expanded flattened list of `assignedNodes`.
   * For example, if the observed node has children `<a></a><slot></slot><b></b>`
   * and the `<slot>` has one `<div>` assigned to it, then the flattened
   * nodes list is `<a></a><div></div><b></b>`. If the `<slot>` has other
   * `<slot>` elements assigned to it, these are flattened as well.
   *
   * @param {!HTMLElement|!HTMLSlotElement} node The node for which to
   *      return the list of flattened nodes.
   * @return {!Array<!Node>} The list of flattened nodes for the given `node`.
   * @nocollapse See https://github.com/google/closure-compiler/issues/2763
   */
  // eslint-disable-next-line
  static getFlattenedNodes(node) {
    const wrapped = wrap(node);
    if (isSlot(node)) {
      node = /** @type {!HTMLSlotElement} */(node); // eslint-disable-line no-self-assign
      return wrapped.assignedNodes({flatten: true});
    } else {
      return Array.from(wrapped.childNodes).map((node) => {
        if (isSlot(node)) {
          node = /** @type {!HTMLSlotElement} */(node); // eslint-disable-line no-self-assign
          return wrap(node).assignedNodes({flatten: true});
        } else {
          return [node];
        }
      }).reduce((a, b) => a.concat(b), []);
    }
  }

  /**
   * @param {!HTMLElement} target Node on which to listen for changes.
   * @param {?function(this: Element, { target: !HTMLElement, addedNodes: !Array<!Element>, removedNodes: !Array<!Element> }):void} callback Function called when there are additions
   * or removals from the target's list of flattened nodes.
   */
  // eslint-disable-next-line
  constructor(target, callback) {
    /**
     * @type {MutationObserver}
     * @private
     */
    this._shadyChildrenObserver = null;
    /**
     * @type {MutationObserver}
     * @private
     */
    this._nativeChildrenObserver = null;
    this._connected = false;
    /**
     * @type {!HTMLElement}
     * @private
     */
    this._target = target;
    this.callback = callback;
    this._effectiveNodes = [];
    this._observer = null;
    this._scheduled = false;
    /**
     * @type {function()}
     * @private
     */
    this._boundSchedule = () => {
      this._schedule();
    };
    this.connect();
    this._schedule();
  }

  /**
   * Activates an observer. This method is automatically called when
   * a `FlattenedNodesObserver` is created. It should only be called to
   * re-activate an observer that has been deactivated via the `disconnect` method.
   *
   * @return {void}
   */
  connect() {
    if (isSlot(this._target)) {
      this._listenSlots([this._target]);
    } else if (wrap(this._target).children) {
      this._listenSlots(
          /** @type {!NodeList<!Node>} */ (wrap(this._target).children));
      if (window.ShadyDOM) {
        this._shadyChildrenObserver =
          window.ShadyDOM.observeChildren(this._target, (mutations) => {
            this._processMutations(mutations);
          });
      } else {
        this._nativeChildrenObserver =
          new MutationObserver((mutations) => {
            this._processMutations(mutations);
          });
        this._nativeChildrenObserver.observe(this._target, {childList: true});
      }
    }
    this._connected = true;
  }

  /**
   * Deactivates the flattened nodes observer. After calling this method
   * the observer callback will not be called when changes to flattened nodes
   * occur. The `connect` method may be subsequently called to reactivate
   * the observer.
   *
   * @return {void}
   * @override
   */
  disconnect() {
    if (isSlot(this._target)) {
      this._unlistenSlots([this._target]);
    } else if (wrap(this._target).children) {
      this._unlistenSlots(
          /** @type {!NodeList<!Node>} */ (wrap(this._target).children));
      if (window.ShadyDOM && this._shadyChildrenObserver) {
        window.ShadyDOM.unobserveChildren(this._shadyChildrenObserver);
        this._shadyChildrenObserver = null;
      } else if (this._nativeChildrenObserver) {
        this._nativeChildrenObserver.disconnect();
        this._nativeChildrenObserver = null;
      }
    }
    this._connected = false;
  }

  /**
   * @return {void}
   * @private
   */
  _schedule() {
    if (!this._scheduled) {
      this._scheduled = true;
      microTask.run(() => this.flush());
    }
  }

  /**
   * @param {Array<MutationRecord>} mutations Mutations signaled by the mutation observer
   * @return {void}
   * @private
   */
  _processMutations(mutations) {
    this._processSlotMutations(mutations);
    this.flush();
  }

  /**
   * @param {Array<MutationRecord>} mutations Mutations signaled by the mutation observer
   * @return {void}
   * @private
   */
  _processSlotMutations(mutations) {
    if (mutations) {
      for (let i=0; i < mutations.length; i++) {
        let mutation = mutations[i];
        if (mutation.addedNodes) {
          this._listenSlots(mutation.addedNodes);
        }
        if (mutation.removedNodes) {
          this._unlistenSlots(mutation.removedNodes);
        }
      }
    }
  }

  /**
   * Flushes the observer causing any pending changes to be immediately
   * delivered the observer callback. By default these changes are delivered
   * asynchronously at the next microtask checkpoint.
   *
   * @return {boolean} Returns true if any pending changes caused the observer
   * callback to run.
   */
  flush() {
    if (!this._connected) {
      return false;
    }
    if (window.ShadyDOM) {
      ShadyDOM.flush();
    }
    if (this._nativeChildrenObserver) {
      this._processSlotMutations(this._nativeChildrenObserver.takeRecords());
    } else if (this._shadyChildrenObserver) {
      this._processSlotMutations(this._shadyChildrenObserver.takeRecords());
    }
    this._scheduled = false;
    let info = {
      target: this._target,
      addedNodes: [],
      removedNodes: []
    };
    let newNodes = this.constructor.getFlattenedNodes(this._target);
    let splices = calculateSplices(newNodes,
      this._effectiveNodes);
    // process removals
    for (let i=0, s; (i<splices.length) && (s=splices[i]); i++) {
      for (let j=0, n; (j < s.removed.length) && (n=s.removed[j]); j++) {
        info.removedNodes.push(n);
      }
    }
    // process adds
    for (let i=0, s; (i<splices.length) && (s=splices[i]); i++) {
      for (let j=s.index; j < s.index + s.addedCount; j++) {
        info.addedNodes.push(newNodes[j]);
      }
    }
    // update cache
    this._effectiveNodes = newNodes;
    let didFlush = false;
    if (info.addedNodes.length || info.removedNodes.length) {
      didFlush = true;
      this.callback.call(this._target, info);
    }
    return didFlush;
  }

  /**
   * @param {!Array<!Node>|!NodeList<!Node>} nodeList Nodes that could change
   * @return {void}
   * @private
   */
  _listenSlots(nodeList) {
    for (let i=0; i < nodeList.length; i++) {
      let n = nodeList[i];
      if (isSlot(n)) {
        n.addEventListener('slotchange', this._boundSchedule);
      }
    }
  }

  /**
   * @param {!Array<!Node>|!NodeList<!Node>} nodeList Nodes that could change
   * @return {void}
   * @private
   */
  _unlistenSlots(nodeList) {
    for (let i=0; i < nodeList.length; i++) {
      let n = nodeList[i];
      if (isSlot(n)) {
        n.removeEventListener('slotchange', this._boundSchedule);
      }
    }
  }

};

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/
/* eslint-enable no-unused-vars */

const p = Element.prototype;
/**
 * @const {function(this:Node, string): boolean}
 */
const normalizedMatchesSelector = p.matches || p.matchesSelector ||
  p.mozMatchesSelector || p.msMatchesSelector ||
  p.oMatchesSelector || p.webkitMatchesSelector;

/**
 * Cross-platform `element.matches` shim.
 *
 * @function matchesSelector
 * @param {!Node} node Node to check selector against
 * @param {string} selector Selector to match
 * @return {boolean} True if node matched selector
 */
const matchesSelector = function(node, selector) {
  return normalizedMatchesSelector.call(node, selector);
};

/**
 * Node API wrapper class returned from `Polymer.dom.(target)` when
 * `target` is a `Node`.
 * @implements {PolymerDomApi}
 * @unrestricted
 */
class DomApiNative {

  /**
   * @param {!Node} node Node for which to create a Polymer.dom helper object.
   */
  constructor(node) {
    if (window['ShadyDOM'] && window['ShadyDOM']['inUse']) {
      window['ShadyDOM']['patch'](node);
    }
    this.node = node;
  }

  /**
   * Returns an instance of `FlattenedNodesObserver` that
   * listens for node changes on this element.
   *
   * @param {function(this:HTMLElement, { target: !HTMLElement, addedNodes: !Array<!Element>, removedNodes: !Array<!Element> }):void} callback Called when direct or distributed children
   *   of this element changes
   * @return {!PolymerDomApi.ObserveHandle} Observer instance
   * @override
   */
  observeNodes(callback) {
    return new FlattenedNodesObserver(
        /** @type {!HTMLElement} */(this.node), callback);
  }

  /**
   * Disconnects an observer previously created via `observeNodes`
   *
   * @param {!PolymerDomApi.ObserveHandle} observerHandle Observer instance
   *   to disconnect.
   * @return {void}
   * @override
   */
  unobserveNodes(observerHandle) {
    observerHandle.disconnect();
  }

  /**
   * Provided as a backwards-compatible API only.  This method does nothing.
   * @return {void}
   */
  notifyObserver() {}

  /**
   * Returns true if the provided node is contained with this element's
   * light-DOM children or shadow root, including any nested shadow roots
   * of children therein.
   *
   * @param {Node} node Node to test
   * @return {boolean} Returns true if the given `node` is contained within
   *   this element's light or shadow DOM.
   * @override
   */
  deepContains(node) {
    if (wrap(this.node).contains(node)) {
      return true;
    }
    let n = node;
    let doc = node.ownerDocument;
    // walk from node to `this` or `document`
    while (n && n !== doc && n !== this.node) {
      // use logical parentnode, or native ShadowRoot host
      n = wrap(n).parentNode || wrap(n).host;
    }
    return n === this.node;
  }

  /**
   * Returns the root node of this node.  Equivalent to `getRootNode()`.
   *
   * @return {!Node} Top most element in the dom tree in which the node
   * exists. If the node is connected to a document this is either a
   * shadowRoot or the document; otherwise, it may be the node
   * itself or a node or document fragment containing it.
   * @override
   */
  getOwnerRoot() {
    return wrap(this.node).getRootNode();
  }

  /**
   * For slot elements, returns the nodes assigned to the slot; otherwise
   * an empty array. It is equivalent to `<slot>.addignedNodes({flatten:true})`.
   *
   * @return {!Array<!Node>} Array of assigned nodes
   * @override
   */
  getDistributedNodes() {
    return (this.node.localName === 'slot') ?
      wrap(this.node).assignedNodes({flatten: true}) :
      [];
  }

  /**
   * Returns an array of all slots this element was distributed to.
   *
   * @return {!Array<!HTMLSlotElement>} Description
   * @override
   */
  getDestinationInsertionPoints() {
    let ip$ = [];
    let n = wrap(this.node).assignedSlot;
    while (n) {
      ip$.push(n);
      n = wrap(n).assignedSlot;
    }
    return ip$;
  }

  /**
   * Calls `importNode` on the `ownerDocument` for this node.
   *
   * @param {!Node} node Node to import
   * @param {boolean} deep True if the node should be cloned deeply during
   *   import
   * @return {Node} Clone of given node imported to this owner document
   */
  importNode(node, deep) {
    let doc = this.node instanceof Document ? this.node :
      this.node.ownerDocument;
    return wrap(doc).importNode(node, deep);
  }

  /**
   * @return {!Array<!Node>} Returns a flattened list of all child nodes and
   * nodes assigned to child slots.
   * @override
   */
  getEffectiveChildNodes() {
    return FlattenedNodesObserver.getFlattenedNodes(
        /** @type {!HTMLElement} */ (this.node));
  }

  /**
   * Returns a filtered list of flattened child elements for this element based
   * on the given selector.
   *
   * @param {string} selector Selector to filter nodes against
   * @return {!Array<!HTMLElement>} List of flattened child elements
   * @override
   */
  queryDistributedElements(selector) {
    let c$ = this.getEffectiveChildNodes();
    let list = [];
    for (let i=0, l=c$.length, c; (i<l) && (c=c$[i]); i++) {
      if ((c.nodeType === Node.ELEMENT_NODE) &&
          matchesSelector(c, selector)) {
        list.push(c);
      }
    }
    return list;
  }

  /**
   * For shadow roots, returns the currently focused element within this
   * shadow root.
   *
   * return {Node|undefined} Currently focused element
   * @override
   */
  get activeElement() {
    let node = this.node;
    return node._activeElement !== undefined ? node._activeElement : node.activeElement;
  }
}

function forwardMethods(proto, methods) {
  for (let i=0; i < methods.length; i++) {
    let method = methods[i];
    /* eslint-disable valid-jsdoc */
    proto[method] = /** @this {DomApiNative} */ function() {
      return this.node[method].apply(this.node, arguments);
    };
    /* eslint-enable */
  }
}

function forwardReadOnlyProperties(proto, properties) {
  for (let i=0; i < properties.length; i++) {
    let name = properties[i];
    Object.defineProperty(proto, name, {
      get: function() {
        const domApi = /** @type {DomApiNative} */(this);
        return domApi.node[name];
      },
      configurable: true
    });
  }
}

function forwardProperties(proto, properties) {
  for (let i=0; i < properties.length; i++) {
    let name = properties[i];
    Object.defineProperty(proto, name, {
      /**
       * @this {DomApiNative}
       * @return {*} .
       */
      get: function() {
        return this.node[name];
      },
      /**
       * @this {DomApiNative}
       * @param {*} value .
       */
      set: function(value) {
        this.node[name] = value;
      },
      configurable: true
    });
  }
}


/**
 * Event API wrapper class returned from `dom.(target)` when
 * `target` is an `Event`.
 */
class EventApi {
  constructor(event) {
    this.event = event;
  }

  /**
   * Returns the first node on the `composedPath` of this event.
   *
   * @return {!EventTarget} The node this event was dispatched to
   */
  get rootTarget() {
    return this.path[0];
  }

  /**
   * Returns the local (re-targeted) target for this event.
   *
   * @return {!EventTarget} The local (re-targeted) target for this event.
   */
  get localTarget() {
    return this.event.target;
  }

  /**
   * Returns the `composedPath` for this event.
   * @return {!Array<!EventTarget>} The nodes this event propagated through
   */
  get path() {
    return this.event.composedPath();
  }
}

let DomApiImpl = DomApiNative;

if (window['ShadyDOM'] && window['ShadyDOM']['inUse'] && window['ShadyDOM']['noPatch'] && window['ShadyDOM']['Wrapper']) {

  /**
   * @private
   * @extends {HTMLElement}
   */
  class Wrapper extends window['ShadyDOM']['Wrapper'] {}

  // copy bespoke API onto wrapper
  Object.getOwnPropertyNames(DomApiNative.prototype).forEach((prop) => {
    if (prop != 'activeElement') {
      Wrapper.prototype[prop] = DomApiNative.prototype[prop];
    }
  });

  // Note, `classList` is here only for legacy compatibility since it does not
  // trigger distribution in v1 Shadow DOM.
  forwardReadOnlyProperties(Wrapper.prototype, [
    'classList'
  ]);

  DomApiImpl = Wrapper;

  Object.defineProperties(EventApi.prototype, {

    // Returns the "lowest" node in the same root as the event's currentTarget.
    // When in `noPatch` mode, this must be calculated by walking the event's
    // path.
    localTarget: {
      get() {
        const current = this.event.currentTarget;
        const currentRoot = current && dom(current).getOwnerRoot();
        const p$ = this.path;
        for (let i = 0; i < p$.length; i++) {
          const e = p$[i];
          if (dom(e).getOwnerRoot() === currentRoot) {
            return e;
          }
        }
      },
      configurable: true
    },

    path: {
      get() {
        return window['ShadyDOM']['composedPath'](this.event);
      },
      configurable: true
    }
  });

} else {

  // Methods that can provoke distribution or must return the logical, not
  // composed tree.
  forwardMethods(DomApiNative.prototype, [
    'cloneNode', 'appendChild', 'insertBefore', 'removeChild',
    'replaceChild', 'setAttribute', 'removeAttribute',
    'querySelector', 'querySelectorAll'
  ]);

  // Properties that should return the logical, not composed tree. Note, `classList`
  // is here only for legacy compatibility since it does not trigger distribution
  // in v1 Shadow DOM.
  forwardReadOnlyProperties(DomApiNative.prototype, [
    'parentNode', 'firstChild', 'lastChild',
    'nextSibling', 'previousSibling', 'firstElementChild',
    'lastElementChild', 'nextElementSibling', 'previousElementSibling',
    'childNodes', 'children', 'classList'
  ]);

  forwardProperties(DomApiNative.prototype, [
    'textContent', 'innerHTML', 'className'
  ]);
}

/**
 * Legacy DOM and Event manipulation API wrapper factory used to abstract
 * differences between native Shadow DOM and "Shady DOM" when polyfilling on
 * older browsers.
 *
 * Note that in Polymer 2.x use of `Polymer.dom` is no longer required and
 * in the majority of cases simply facades directly to the standard native
 * API.
 *
 * @summary Legacy DOM and Event manipulation API wrapper factory used to
 * abstract differences between native Shadow DOM and "Shady DOM."
 * @param {(Node|Event|DomApiNative|EventApi)=} obj Node or event to operate on
 * @return {!DomApiNative|!EventApi} Wrapper providing either node API or event API
 */
const dom = function(obj) {
  obj = obj || document;
  if (obj instanceof DomApiImpl) {
    return /** @type {!DomApi} */(obj);
  }
  if (obj instanceof EventApi) {
    return /** @type {!EventApi} */(obj);
  }
  let helper = obj['__domApi'];
  if (!helper) {
    if (obj instanceof Event) {
      helper = new EventApi(obj);
    } else {
      helper = new DomApiImpl(/** @type {Node} */(obj));
    }
    obj['__domApi'] = helper;
  }
  return helper;
};

/**
@license
Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const ShadyDOM$1 = window.ShadyDOM;
const ShadyCSS = window.ShadyCSS;

/**
 * Return true if node scope is correct.
 *
 * @param {!Element} node Node to check scope
 * @param {!Node} scope Scope reference
 * @return {boolean} True if node is in scope
 */
function sameScope(node, scope) {
  return wrap(node).getRootNode() === scope;
}

/**
 * Ensure that elements in a ShadowDOM container are scoped correctly.
 * This function is only needed when ShadyDOM is used and unpatched DOM APIs are used in third party code.
 * This can happen in noPatch mode or when specialized APIs like ranges or tables are used to mutate DOM.
 *
 * @param  {!Element} container Container element to scope
 * @param  {boolean=} shouldObserve if true, start a mutation observer for added nodes to the container
 * @return {?MutationObserver} Returns a new MutationObserver on `container` if `shouldObserve` is true.
 */
function scopeSubtree(container, shouldObserve = false) {
  // If using native ShadowDOM, abort
  if (!ShadyDOM$1 || !ShadyCSS) {
    return null;
  }
  // ShadyCSS handles DOM mutations when ShadyDOM does not handle scoping itself
  if (!ShadyDOM$1['handlesDynamicScoping']) {
    return null;
  }
  const ScopingShim = ShadyCSS['ScopingShim'];
  // if ScopingShim is not available, abort
  if (!ScopingShim) {
    return null;
  }
  // capture correct scope for container
  const containerScope = ScopingShim['scopeForNode'](container);
  const root = wrap(container).getRootNode();

  const scopify = (node) => {
    if (!sameScope(node, root)) {
      return;
    }
    // NOTE: native qSA does not honor scoped DOM, but it is faster, and the same behavior as Polymer v1
    const elements = Array.from(ShadyDOM$1['nativeMethods']['querySelectorAll'].call(node, '*'));
    elements.push(node);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!sameScope(el, root)) {
        continue;
      }
      const currentScope = ScopingShim['currentScopeForNode'](el);
      if (currentScope !== containerScope) {
        if (currentScope !== '') {
          ScopingShim['unscopeNode'](el, currentScope);
        }
        ScopingShim['scopeNode'](el, containerScope);
      }
    }
  };

  // scope everything in container
  scopify(container);

  if (shouldObserve) {
    const mo = new MutationObserver((mxns) => {
      for (let i = 0; i < mxns.length; i++) {
        const mxn = mxns[i];
        for (let j = 0; j < mxn.addedNodes.length; j++) {
          const addedNode = mxn.addedNodes[j];
          if (addedNode.nodeType === Node.ELEMENT_NODE) {
            scopify(addedNode);
          }
        }
      }
    });
    mo.observe(container, {childList: true, subtree: true});
    return mo;
  } else {
    return null;
  }
}

/**
 * @fileoverview
 * @suppress {checkPrototypalTypes}
 * @license Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

const DISABLED_ATTR = 'disable-upgrade';

const findObservedAttributesGetter = (ctor) => {
  while (ctor) {
    const desc = Object.getOwnPropertyDescriptor(ctor, 'observedAttributes');
    if (desc) {
      return desc.get;
    }
    ctor = Object.getPrototypeOf(ctor.prototype).constructor;
  }
  return () => [];
};

/**
 * Element class mixin that allows the element to boot up in a non-enabled
 * state when the `disable-upgrade` attribute is present. This mixin is
 * designed to be used with element classes like PolymerElement that perform
 * initial startup work when they are first connected. When the
 * `disable-upgrade` attribute is removed, if the element is connected, it
 * boots up and "enables" as it otherwise would; if it is not connected, the
 * element boots up when it is next connected.
 *
 * Using `disable-upgrade` with PolymerElement prevents any data propagation
 * to the element, any element DOM from stamping, or any work done in
 * connected/disconnctedCallback from occuring, but it does not prevent work
 * done in the element constructor.
 *
 * Note, this mixin must be applied on top of any element class that
 * itself implements a `connectedCallback` so that it can control the work
 * done in `connectedCallback`. For example,
 *
 *     MyClass = DisableUpgradeMixin(class extends BaseClass {...});
 *
 * @mixinFunction
 * @polymer
 * @appliesMixin ElementMixin
 * @template T
 * @param {function(new:T)} superClass Class to apply mixin to.
 * @return {function(new:T)} superClass with mixin applied.
 */
const DisableUpgradeMixin = dedupingMixin((base) => {
  /**
   * @constructor
   * @implements {Polymer_ElementMixin}
   * @extends {HTMLElement}
   * @private
   */
  const superClass = ElementMixin(base);

  // Work around for closure bug #126934458. Using `super` in a property
  // getter does not work so instead we search the Base prototype for an
  // implementation of observedAttributes so that we can override and call
  // the `super` getter. Note, this is done one time ever because we assume
  // that `Base` is always comes from `Polymer.LegacyElementMixn`.
  let observedAttributesGetter = findObservedAttributesGetter(superClass);

  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_DisableUpgradeMixin}
   */
  class DisableUpgradeClass extends superClass {

    constructor() {
      super();
      /** @type {boolean|undefined} */
      this.__isUpgradeDisabled;
    }

    static get observedAttributes() {
      return observedAttributesGetter.call(this).concat(DISABLED_ATTR);
    }

    // Prevent element from initializing properties when it's upgrade disabled.
    /** @override */
    _initializeProperties() {
      if (this.hasAttribute(DISABLED_ATTR)) {
        this.__isUpgradeDisabled = true;
      } else {
        super._initializeProperties();
      }
    }

    // Prevent element from enabling properties when it's upgrade disabled.
    // Normally overriding connectedCallback would be enough, but dom-* elements
    /** @override */
    _enableProperties() {
      if (!this.__isUpgradeDisabled) {
        super._enableProperties();
      }
    }

    // If the element starts upgrade-disabled and a property is set for
    // which an accessor exists, the default should not be applied.
    // This additional check is needed because defaults are applied via
    // `_initializeProperties` which is called after initial properties
    // have been set when the element starts upgrade-disabled.
    /** @override */
    _canApplyPropertyDefault(property) {
      return super._canApplyPropertyDefault(property) &&
        !(this.__isUpgradeDisabled && this._isPropertyPending(property));
    }

    /**
     * @override
     * @param {string} name Attribute name.
     * @param {?string} old The previous value for the attribute.
     * @param {?string} value The new value for the attribute.
     * @param {?string} namespace The XML namespace for the attribute.
     * @return {void}
     */
    attributeChangedCallback(name, old, value, namespace) {
      if (name == DISABLED_ATTR) {
        // When disable-upgrade is removed, intialize properties and
        // provoke connectedCallback if the element is already connected.
        if (this.__isUpgradeDisabled && value == null) {
          super._initializeProperties();
          this.__isUpgradeDisabled = false;
          if (wrap(this).isConnected) {
            super.connectedCallback();
          }
        }
      } else {
        super.attributeChangedCallback(
            name, old, value, /** @type {null|string} */ (namespace));
      }
    }

    // Prevent element from connecting when it's upgrade disabled.
    // This prevents user code in `attached` from being called.
    /** @override */
    connectedCallback() {
      if (!this.__isUpgradeDisabled) {
        super.connectedCallback();
      }
    }

    // Prevent element from disconnecting when it's upgrade disabled.
    // This avoids allowing user code `detached` from being called without a
    // paired call to `attached`.
    /** @override */
    disconnectedCallback() {
      if (!this.__isUpgradeDisabled) {
        super.disconnectedCallback();
      }
    }

  }

  return DisableUpgradeClass;
});

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const DISABLED_ATTR$1 = 'disable-upgrade';

let styleInterface = window.ShadyCSS;

/**
 * Element class mixin that provides Polymer's "legacy" API intended to be
 * backward-compatible to the greatest extent possible with the API
 * found on the Polymer 1.x `Polymer.Base` prototype applied to all elements
 * defined using the `Polymer({...})` function.
 *
 * @mixinFunction
 * @polymer
 * @appliesMixin ElementMixin
 * @appliesMixin GestureEventListeners
 * @appliesMixin DirMixin
 * @property isAttached {boolean} Set to `true` in this element's
 *   `connectedCallback` and `false` in `disconnectedCallback`
 * @summary Element class mixin that provides Polymer's "legacy" API
 */
const LegacyElementMixin = dedupingMixin((base) => {

  // TODO(kschaaf): Note, the `@implements {Polymer_DirMixin}` is required here
  // (rather than on legacyElementBase) for unknown reasons.
  /**
   * @constructor
   * @implements {Polymer_ElementMixin}
   * @implements {Polymer_GestureEventListeners}
   * @implements {Polymer_DirMixin}
   * @extends {HTMLElement}
   * @private
   */
  const GesturesElement = GestureEventListeners(ElementMixin(base));

  // Note, the DirMixin does nothing if css is built so avoid including it
  // in that case.

  /**
   * @constructor
   * @extends {GesturesElement}
   * @private
   */
  const legacyElementBase = builtCSS ? GesturesElement :
    DirMixin$1(GesturesElement);

  const observedAttributesGetter = findObservedAttributesGetter(legacyElementBase);

  /**
   * Map of simple names to touch action names
   * @dict
   */
  const DIRECTION_MAP = {
    'x': 'pan-x',
    'y': 'pan-y',
    'none': 'none',
    'all': 'auto'
  };

  /**
   * @polymer
   * @mixinClass
   * @extends {legacyElementBase}
   * @implements {Polymer_LegacyElementMixin}
   * @unrestricted
   */
  class LegacyElement extends legacyElementBase {

    constructor() {
      super();
      /** @type {boolean} */
      this.isAttached;
      /** @type {?WeakMap<!Element, !Object<string, !Function>>} */
      this.__boundListeners;
      /** @type {?Object<string, ?Function>} */
      this._debouncers;
      // NOTE: Inlined for perf from version of DisableUpgradeMixin.
      /** @type {boolean|undefined} */
      this.__isUpgradeDisabled;
      /** @type {boolean|undefined} */
      this.__needsAttributesAtConnected;
      /** @type {boolean|undefined} */
      this._legacyForceObservedAttributes;
    }

    /**
     * Forwards `importMeta` from the prototype (i.e. from the info object
     * passed to `Polymer({...})`) to the static API.
     *
     * @return {!Object} The `import.meta` object set on the prototype
     * @suppress {missingProperties} `this` is always in the instance in
     *  closure for some reason even in a static method, rather than the class
     * @nocollapse
     */
    static get importMeta() {
      return this.prototype.importMeta;
    }

    /**
     * Legacy callback called during the `constructor`, for overriding
     * by the user.
     * @override
     * @return {void}
     */
    created() {}

    /**
     * Processes an attribute reaction when the `legacyNoObservedAttributes`
     * setting is in use.
     * @param {string} name Name of attribute that changed
     * @param {?string} old Old attribute value
     * @param {?string} value New attribute value
     * @return {void}
     */
    __attributeReaction(name, old, value) {
      if ((this.__dataAttributes && this.__dataAttributes[name]) || name === DISABLED_ATTR$1) {
        this.attributeChangedCallback(name, old, value, null);
      }
    }

    /**
     * Sets the value of an attribute.
     * @override
     * @param {string} name The name of the attribute to change.
     * @param {string|number|boolean|!TrustedHTML|!TrustedScriptURL|!TrustedURL} value The new attribute value.
     */
    setAttribute(name, value) {
      if (legacyNoObservedAttributes && !this._legacyForceObservedAttributes) {
        const oldValue = this.getAttribute(name);
        super.setAttribute(name, value);
        // value coerced to String for closure's benefit
        this.__attributeReaction(name, oldValue, String(value));
      } else {
        super.setAttribute(name, value);
      }
    }

    /**
     * Removes an attribute.
     * @override
     * @param {string} name The name of the attribute to remove.
     */
    removeAttribute(name) {
      if (legacyNoObservedAttributes && !this._legacyForceObservedAttributes) {
        const oldValue = this.getAttribute(name);
        super.removeAttribute(name);
        this.__attributeReaction(name, oldValue, null);
      } else {
        super.removeAttribute(name);
      }
    }

    // NOTE: Inlined for perf from version of DisableUpgradeMixin.
    static get observedAttributes() {
      if (legacyNoObservedAttributes && !this.prototype._legacyForceObservedAttributes) {
        // Ensure this element is property registered with the telemetry system.
        if (!this.hasOwnProperty(JSCompiler_renameProperty('__observedAttributes', this))) {
          this.__observedAttributes = [];
          register(this.prototype);
        }
        return this.__observedAttributes;
      } else {
        return observedAttributesGetter.call(this).concat(DISABLED_ATTR$1);
      }
    }

    // NOTE: Inlined for perf from version of DisableUpgradeMixin.
    // Prevent element from enabling properties when it's upgrade disabled.
    // Normally overriding connectedCallback would be enough, but dom-* elements
    /** @override */
    _enableProperties() {
      if (!this.__isUpgradeDisabled) {
        super._enableProperties();
      }
    }

    // NOTE: Inlined for perf from version of DisableUpgradeMixin.
    // If the element starts upgrade-disabled and a property is set for
    // which an accessor exists, the default should not be applied.
    // This additional check is needed because defaults are applied via
    // `_initializeProperties` which is called after initial properties
    // have been set when the element starts upgrade-disabled.
    /** @override */
    _canApplyPropertyDefault(property) {
      return super._canApplyPropertyDefault(property) &&
        !(this.__isUpgradeDisabled && this._isPropertyPending(property));
    }

    /**
     * Provides an implementation of `connectedCallback`
     * which adds Polymer legacy API's `attached` method.
     * @return {void}
     * @override
     */
    connectedCallback() {
      if (this.__needsAttributesAtConnected) {
        this._takeAttributes();
      }
      // NOTE: Inlined for perf from version of DisableUpgradeMixin.
      if (!this.__isUpgradeDisabled) {
        super.connectedCallback();
        this.isAttached = true;
        this.attached();
      }
    }

    /**
     * Legacy callback called during `connectedCallback`, for overriding
     * by the user.
     * @override
     * @return {void}
     */
    attached() {}

    /**
     * Provides an implementation of `disconnectedCallback`
     * which adds Polymer legacy API's `detached` method.
     * @return {void}
     * @override
     */
    disconnectedCallback() {
      // NOTE: Inlined for perf from version of DisableUpgradeMixin.
      if (!this.__isUpgradeDisabled) {
        super.disconnectedCallback();
        this.isAttached = false;
        this.detached();
      }
    }

    /**
     * Legacy callback called during `disconnectedCallback`, for overriding
     * by the user.
     * @override
     * @return {void}
     */
    detached() {}

    /**
     * Provides an override implementation of `attributeChangedCallback`
     * which adds the Polymer legacy API's `attributeChanged` method.
     * @param {string} name Name of attribute.
     * @param {?string} old Old value of attribute.
     * @param {?string} value Current value of attribute.
     * @param {?string} namespace Attribute namespace.
     * @return {void}
     * @override
     */
    attributeChangedCallback(name, old, value, namespace) {
      if (old !== value) {
        // NOTE: Inlined for perf from version of DisableUpgradeMixin.
        if (name == DISABLED_ATTR$1) {
          // When disable-upgrade is removed, intialize properties and
          // provoke connectedCallback if the element is already connected.
          if (this.__isUpgradeDisabled && value == null) {
            this._initializeProperties();
            this.__isUpgradeDisabled = false;
            if (wrap(this).isConnected) {
              this.connectedCallback();
            }
          }
        } else {
          super.attributeChangedCallback(name, old, value, namespace);
          this.attributeChanged(name, old, value);
        }
      }
    }

    /**
     * Legacy callback called during `attributeChangedChallback`, for overriding
     * by the user.
     * @param {string} name Name of attribute.
     * @param {?string} old Old value of attribute.
     * @param {?string} value Current value of attribute.
     * @return {void}
     * @override
     */
    attributeChanged(name, old, value) {} // eslint-disable-line no-unused-vars

    /**
     * Overrides the default `Polymer.PropertyEffects` implementation to
     * add support for class initialization via the `_registered` callback.
     * This is called only when the first instance of the element is created.
     *
     * @return {void}
     * @override
     * @suppress {invalidCasts}
     */
    _initializeProperties() {
      // NOTE: Inlined for perf from version of DisableUpgradeMixin.
      // Only auto-use disable-upgrade if legacyOptimizations is set.
      if (legacyOptimizations && this.hasAttribute(DISABLED_ATTR$1)) {
        this.__isUpgradeDisabled = true;
      } else {
        let proto = Object.getPrototypeOf(this);
        if (!proto.hasOwnProperty(JSCompiler_renameProperty('__hasRegisterFinished', proto))) {
          this._registered();
          // backstop in case the `_registered` implementation does not set this
          proto.__hasRegisterFinished = true;
        }
        super._initializeProperties();
        this.root = /** @type {HTMLElement} */(this);
        this.created();
        // Pull all attribute values 1x if `legacyNoObservedAttributes` is set.
        if (legacyNoObservedAttributes && !this._legacyForceObservedAttributes) {
          if (this.hasAttributes()) {
            this._takeAttributes();
          // Element created from scratch or parser generated
          } else if (!this.parentNode) {
            this.__needsAttributesAtConnected = true;
          }
        }
        // Ensure listeners are applied immediately so that they are
        // added before declarative event listeners. This allows an element to
        // decorate itself via an event prior to any declarative listeners
        // seeing the event. Note, this ensures compatibility with 1.x ordering.
        this._applyListeners();
      }
    }

    _takeAttributes() {
      const a = this.attributes;
      for (let i=0, l=a.length; i < l; i++) {
        const attr = a[i];
        this.__attributeReaction(attr.name, null, attr.value);
      }
    }

    /**
     * Called automatically when an element is initializing.
     * Users may override this method to perform class registration time
     * work. The implementation should ensure the work is performed
     * only once for the class.
     * @protected
     * @return {void}
     * @override
     */
    _registered() {}

    /**
     * Overrides the default `Polymer.PropertyEffects` implementation to
     * add support for installing `hostAttributes` and `listeners`.
     *
     * @return {void}
     * @override
     */
    ready() {
      this._ensureAttributes();
      super.ready();
    }

    /**
     * Ensures an element has required attributes. Called when the element
     * is being readied via `ready`. Users should override to set the
     * element's required attributes. The implementation should be sure
     * to check and not override existing attributes added by
     * the user of the element. Typically, setting attributes should be left
     * to the element user and not done here; reasonable exceptions include
     * setting aria roles and focusability.
     * @protected
     * @return {void}
     * @override
     */
    _ensureAttributes() {}

    /**
     * Adds element event listeners. Called when the element
     * is being readied via `ready`. Users should override to
     * add any required element event listeners.
     * In performance critical elements, the work done here should be kept
     * to a minimum since it is done before the element is rendered. In
     * these elements, consider adding listeners asynchronously so as not to
     * block render.
     * @protected
     * @return {void}
     * @override
     */
    _applyListeners() {}

    /**
     * Converts a typed JavaScript value to a string.
     *
     * Note this method is provided as backward-compatible legacy API
     * only.  It is not directly called by any Polymer features. To customize
     * how properties are serialized to attributes for attribute bindings and
     * `reflectToAttribute: true` properties as well as this method, override
     * the `_serializeValue` method provided by `Polymer.PropertyAccessors`.
     *
     * @param {*} value Value to deserialize
     * @return {string | undefined} Serialized value
     * @override
     */
    serialize(value) {
      return this._serializeValue(value);
    }

    /**
     * Converts a string to a typed JavaScript value.
     *
     * Note this method is provided as backward-compatible legacy API
     * only.  It is not directly called by any Polymer features.  To customize
     * how attributes are deserialized to properties for in
     * `attributeChangedCallback`, override `_deserializeValue` method
     * provided by `Polymer.PropertyAccessors`.
     *
     * @param {string} value String to deserialize
     * @param {*} type Type to deserialize the string to
     * @return {*} Returns the deserialized value in the `type` given.
     * @override
     */
    deserialize(value, type) {
      return this._deserializeValue(value, type);
    }

    /**
     * Serializes a property to its associated attribute.
     *
     * Note this method is provided as backward-compatible legacy API
     * only.  It is not directly called by any Polymer features.
     *
     * @param {string} property Property name to reflect.
     * @param {string=} attribute Attribute name to reflect.
     * @param {*=} value Property value to reflect.
     * @return {void}
     * @override
     */
    reflectPropertyToAttribute(property, attribute, value) {
      this._propertyToAttribute(property, attribute, value);
    }

    /**
     * Sets a typed value to an HTML attribute on a node.
     *
     * Note this method is provided as backward-compatible legacy API
     * only.  It is not directly called by any Polymer features.
     *
     * @param {*} value Value to serialize.
     * @param {string} attribute Attribute name to serialize to.
     * @param {Element} node Element to set attribute to.
     * @return {void}
     * @override
     */
    serializeValueToAttribute(value, attribute, node) {
      this._valueToNodeAttribute(/** @type {Element} */ (node || this), value, attribute);
    }

    /**
     * Copies own properties (including accessor descriptors) from a source
     * object to a target object.
     *
     * @param {Object} prototype Target object to copy properties to.
     * @param {Object} api Source object to copy properties from.
     * @return {Object} prototype object that was passed as first argument.
     * @override
     */
    extend(prototype, api) {
      if (!(prototype && api)) {
        return prototype || api;
      }
      let n$ = Object.getOwnPropertyNames(api);
      for (let i=0, n; (i<n$.length) && (n=n$[i]); i++) {
        let pd = Object.getOwnPropertyDescriptor(api, n);
        if (pd) {
          Object.defineProperty(prototype, n, pd);
        }
      }
      return prototype;
    }

    /**
     * Copies props from a source object to a target object.
     *
     * Note, this method uses a simple `for...in` strategy for enumerating
     * properties.  To ensure only `ownProperties` are copied from source
     * to target and that accessor implementations are copied, use `extend`.
     *
     * @param {!Object} target Target object to copy properties to.
     * @param {!Object} source Source object to copy properties from.
     * @return {!Object} Target object that was passed as first argument.
     * @override
     */
    mixin(target, source) {
      for (let i in source) {
        target[i] = source[i];
      }
      return target;
    }

    /**
     * Sets the prototype of an object.
     *
     * Note this method is provided as backward-compatible legacy API
     * only.  It is not directly called by any Polymer features.
     * @param {Object} object The object on which to set the prototype.
     * @param {Object} prototype The prototype that will be set on the given
     * `object`.
     * @return {Object} Returns the given `object` with its prototype set
     * to the given `prototype` object.
     * @override
     */
    chainObject(object, prototype) {
      if (object && prototype && object !== prototype) {
        object.__proto__ = prototype;
      }
      return object;
    }

    /* **** Begin Template **** */

    /**
     * Calls `importNode` on the `content` of the `template` specified and
     * returns a document fragment containing the imported content.
     *
     * @param {HTMLTemplateElement} template HTML template element to instance.
     * @return {!DocumentFragment} Document fragment containing the imported
     *   template content.
     * @override
     * @suppress {missingProperties} go/missingfnprops
     */
    instanceTemplate(template) {
      let content = this.constructor._contentForTemplate(template);
      let dom = /** @type {!DocumentFragment} */
        (document.importNode(content, true));
      return dom;
    }

    /* **** Begin Events **** */



    /**
     * Dispatches a custom event with an optional detail value.
     *
     * @param {string} type Name of event type.
     * @param {*=} detail Detail value containing event-specific
     *   payload.
     * @param {{ bubbles: (boolean|undefined), cancelable: (boolean|undefined),
     *     composed: (boolean|undefined) }=}
     *  options Object specifying options.  These may include:
     *  `bubbles` (boolean, defaults to `true`),
     *  `cancelable` (boolean, defaults to false), and
     *  `node` on which to fire the event (HTMLElement, defaults to `this`).
     * @return {!Event} The new event that was fired.
     * @override
     */
    fire(type, detail, options) {
      options = options || {};
      detail = (detail === null || detail === undefined) ? {} : detail;
      let event = new Event(type, {
        bubbles: options.bubbles === undefined ? true : options.bubbles,
        cancelable: Boolean(options.cancelable),
        composed: options.composed === undefined ? true: options.composed
      });
      event.detail = detail;
      let node = options.node || this;
      wrap(node).dispatchEvent(event);
      return event;
    }

    /**
     * Convenience method to add an event listener on a given element,
     * late bound to a named method on this element.
     *
     * @param {?EventTarget} node Element to add event listener to.
     * @param {string} eventName Name of event to listen for.
     * @param {string} methodName Name of handler method on `this` to call.
     * @return {void}
     * @override
     */
    listen(node, eventName, methodName) {
      node = /** @type {!EventTarget} */ (node || this);
      let hbl = this.__boundListeners ||
        (this.__boundListeners = new WeakMap());
      let bl = hbl.get(node);
      if (!bl) {
        bl = {};
        hbl.set(node, bl);
      }
      let key = eventName + methodName;
      if (!bl[key]) {
        bl[key] = this._addMethodEventListenerToNode(
            /** @type {!Node} */ (node), eventName, methodName, this);
      }
    }

    /**
     * Convenience method to remove an event listener from a given element,
     * late bound to a named method on this element.
     *
     * @param {?EventTarget} node Element to remove event listener from.
     * @param {string} eventName Name of event to stop listening to.
     * @param {string} methodName Name of handler method on `this` to not call
     anymore.
     * @return {void}
     * @override
     */
    unlisten(node, eventName, methodName) {
      node = /** @type {!EventTarget} */ (node || this);
      let bl = this.__boundListeners &&
          this.__boundListeners.get(/** @type {!Element} */ (node));
      let key = eventName + methodName;
      let handler = bl && bl[key];
      if (handler) {
        this._removeEventListenerFromNode(
            /** @type {!Node} */ (node), eventName, handler);
        bl[key] = /** @type {?} */ (null);
      }
    }

    /**
     * Override scrolling behavior to all direction, one direction, or none.
     *
     * Valid scroll directions:
     *   - 'all': scroll in any direction
     *   - 'x': scroll only in the 'x' direction
     *   - 'y': scroll only in the 'y' direction
     *   - 'none': disable scrolling for this node
     *
     * @param {string=} direction Direction to allow scrolling
     * Defaults to `all`.
     * @param {Element=} node Element to apply scroll direction setting.
     * Defaults to `this`.
     * @return {void}
     * @override
     */
    setScrollDirection(direction, node) {
      setTouchAction(
          /** @type {!Element} */ (node || this),
          DIRECTION_MAP[direction] || 'auto');
    }
    /* **** End Events **** */

    /**
     * Convenience method to run `querySelector` on this local DOM scope.
     *
     * This function calls `Polymer.dom(this.root).querySelector(slctr)`.
     *
     * @param {string} slctr Selector to run on this local DOM scope
     * @return {Element} Element found by the selector, or null if not found.
     * @override
     */
    $$(slctr) {
      // Note, no need to `wrap` this because root is always patched
      return this.root.querySelector(slctr);
    }

    /**
     * Return the element whose local dom within which this element
     * is contained. This is a shorthand for
     * `this.getRootNode().host`.
     * @this {Element}
     * @return {?Node} The element whose local dom within which this element is
     * contained.
     * @override
     */
    get domHost() {
      let root = wrap(this).getRootNode();
      return (root instanceof DocumentFragment) ? /** @type {ShadowRoot} */ (root).host : root;
    }

    /**
     * Force this element to distribute its children to its local dom.
     * This should not be necessary as of Polymer 2.0.2 and is provided only
     * for backwards compatibility.
     * @return {void}
     * @override
     */
    distributeContent() {
      const thisEl = /** @type {Element} */ (this);
      const domApi = /** @type {PolymerDomApi} */(dom(thisEl));
      if (window.ShadyDOM && domApi.shadowRoot) {
        ShadyDOM.flush();
      }
    }

    /**
     * Returns a list of nodes that are the effective childNodes. The effective
     * childNodes list is the same as the element's childNodes except that
     * any `<content>` elements are replaced with the list of nodes distributed
     * to the `<content>`, the result of its `getDistributedNodes` method.
     * @return {!Array<!Node>} List of effective child nodes.
     * @suppress {invalidCasts} LegacyElementMixin must be applied to an
     *     HTMLElement
     * @override
     */
    getEffectiveChildNodes() {
      const thisEl = /** @type {Element} */ (this);
      const domApi = /** @type {PolymerDomApi} */ (dom(thisEl));
      return domApi.getEffectiveChildNodes();
    }

    /**
     * Returns a list of nodes distributed within this element that match
     * `selector`. These can be dom children or elements distributed to
     * children that are insertion points.
     * @param {string} selector Selector to run.
     * @return {!Array<!Node>} List of distributed elements that match selector.
     * @suppress {invalidCasts} LegacyElementMixin must be applied to an
     * HTMLElement
     * @override
     */
    queryDistributedElements(selector) {
      const thisEl = /** @type {Element} */ (this);
      const domApi = /** @type {PolymerDomApi} */ (dom(thisEl));
      return domApi.queryDistributedElements(selector);
    }

    /**
     * Returns a list of elements that are the effective children. The effective
     * children list is the same as the element's children except that
     * any `<content>` elements are replaced with the list of elements
     * distributed to the `<content>`.
     *
     * @return {!Array<!Node>} List of effective children.
     * @override
     */
    getEffectiveChildren() {
      let list = this.getEffectiveChildNodes();
      return list.filter(function(/** @type {!Node} */ n) {
        return (n.nodeType === Node.ELEMENT_NODE);
      });
    }

    /**
     * Returns a string of text content that is the concatenation of the
     * text content's of the element's effective childNodes (the elements
     * returned by <a href="#getEffectiveChildNodes>getEffectiveChildNodes</a>.
     *
     * @return {string} List of effective children.
     * @override
     */
    getEffectiveTextContent() {
      let cn = this.getEffectiveChildNodes();
      let tc = [];
      for (let i=0, c; (c = cn[i]); i++) {
        if (c.nodeType !== Node.COMMENT_NODE) {
          tc.push(c.textContent);
        }
      }
      return tc.join('');
    }

    /**
     * Returns the first effective childNode within this element that
     * match `selector`. These can be dom child nodes or elements distributed
     * to children that are insertion points.
     * @param {string} selector Selector to run.
     * @return {Node} First effective child node that matches selector.
     * @override
     */
    queryEffectiveChildren(selector) {
      let e$ = this.queryDistributedElements(selector);
      return e$ && e$[0];
    }

    /**
     * Returns a list of effective childNodes within this element that
     * match `selector`. These can be dom child nodes or elements distributed
     * to children that are insertion points.
     * @param {string} selector Selector to run.
     * @return {!Array<!Node>} List of effective child nodes that match
     *     selector.
     * @override
     */
    queryAllEffectiveChildren(selector) {
      return this.queryDistributedElements(selector);
    }

    /**
     * Returns a list of nodes distributed to this element's `<slot>`.
     *
     * If this element contains more than one `<slot>` in its local DOM,
     * an optional selector may be passed to choose the desired content.
     *
     * @param {string=} slctr CSS selector to choose the desired
     *   `<slot>`.  Defaults to `content`.
     * @return {!Array<!Node>} List of distributed nodes for the `<slot>`.
     * @override
     */
    getContentChildNodes(slctr) {
      // Note, no need to `wrap` this because root is always
      let content = this.root.querySelector(slctr || 'slot');
      return content ?
          /** @type {PolymerDomApi} */ (dom(content)).getDistributedNodes() :
          [];
    }

    /**
     * Returns a list of element children distributed to this element's
     * `<slot>`.
     *
     * If this element contains more than one `<slot>` in its
     * local DOM, an optional selector may be passed to choose the desired
     * content.  This method differs from `getContentChildNodes` in that only
     * elements are returned.
     *
     * @param {string=} slctr CSS selector to choose the desired
     *   `<content>`.  Defaults to `content`.
     * @return {!Array<!HTMLElement>} List of distributed nodes for the
     *   `<slot>`.
     * @suppress {invalidCasts}
     * @override
     */
    getContentChildren(slctr) {
      let children = /** @type {!Array<!HTMLElement>} */(this.getContentChildNodes(slctr).filter(function(n) {
        return (n.nodeType === Node.ELEMENT_NODE);
      }));
      return children;
    }

    /**
     * Checks whether an element is in this element's light DOM tree.
     *
     * @param {?Node} node The element to be checked.
     * @return {boolean} true if node is in this element's light DOM tree.
     * @suppress {invalidCasts} LegacyElementMixin must be applied to an
     * HTMLElement
     * @override
     */
    isLightDescendant(node) {
      const thisNode = /** @type {Node} */ (this);
      return thisNode !== node && wrap(thisNode).contains(node) &&
        wrap(thisNode).getRootNode() === wrap(node).getRootNode();
    }

    /**
     * Checks whether an element is in this element's local DOM tree.
     *
     * @param {!Element} node The element to be checked.
     * @return {boolean} true if node is in this element's local DOM tree.
     * @override
     */
    isLocalDescendant(node) {
      return this.root === wrap(node).getRootNode();
    }

    /**
     * No-op for backwards compatibility. This should now be handled by
     * ShadyCss library.
     * @param  {!Element} container Container element to scope
     * @param  {boolean=} shouldObserve if true, start a mutation observer for added nodes to the container
     * @return {?MutationObserver} Returns a new MutationObserver on `container` if `shouldObserve` is true.
     * @override
     */
    scopeSubtree(container, shouldObserve = false) {
      return scopeSubtree(container, shouldObserve);
    }

    /**
     * Returns the computed style value for the given property.
     * @param {string} property The css property name.
     * @return {string} Returns the computed css property value for the given
     * `property`.
     * @suppress {invalidCasts} LegacyElementMixin must be applied to an
     *     HTMLElement
     * @override
     */
    getComputedStyleValue(property) {
      return styleInterface.getComputedStyleValue(/** @type {!Element} */(this), property);
    }

    // debounce

    /**
     * Call `debounce` to collapse multiple requests for a named task into
     * one invocation which is made after the wait time has elapsed with
     * no new request.  If no wait time is given, the callback will be called
     * at microtask timing (guaranteed before paint).
     *
     *     debouncedClickAction(e) {
     *       // will not call `processClick` more than once per 100ms
     *       this.debounce('click', function() {
     *        this.processClick();
     *       } 100);
     *     }
     *
     * @param {string} jobName String to identify the debounce job.
     * @param {function():void} callback Function that is called (with `this`
     *   context) when the wait time elapses.
     * @param {number=} wait Optional wait time in milliseconds (ms) after the
     *   last signal that must elapse before invoking `callback`
     * @return {!Object} Returns a debouncer object on which exists the
     * following methods: `isActive()` returns true if the debouncer is
     * active; `cancel()` cancels the debouncer if it is active;
     * `flush()` immediately invokes the debounced callback if the debouncer
     * is active.
     * @override
     */
    debounce(jobName, callback, wait) {
      this._debouncers = this._debouncers || {};
      return this._debouncers[jobName] = Debouncer.debounce(
            this._debouncers[jobName]
          , wait > 0 ? timeOut.after(wait) : microTask
          , callback.bind(this));
    }

    /**
     * Returns whether a named debouncer is active.
     *
     * @param {string} jobName The name of the debouncer started with `debounce`
     * @return {boolean} Whether the debouncer is active (has not yet fired).
     * @override
     */
    isDebouncerActive(jobName) {
      this._debouncers = this._debouncers || {};
      let debouncer = this._debouncers[jobName];
      return !!(debouncer && debouncer.isActive());
    }

    /**
     * Immediately calls the debouncer `callback` and inactivates it.
     *
     * @param {string} jobName The name of the debouncer started with `debounce`
     * @return {void}
     * @override
     */
    flushDebouncer(jobName) {
      this._debouncers = this._debouncers || {};
      let debouncer = this._debouncers[jobName];
      if (debouncer) {
        debouncer.flush();
      }
    }

    /**
     * Cancels an active debouncer.  The `callback` will not be called.
     *
     * @param {string} jobName The name of the debouncer started with `debounce`
     * @return {void}
     * @override
     */
    cancelDebouncer(jobName) {
      this._debouncers = this._debouncers || {};
      let debouncer = this._debouncers[jobName];
      if (debouncer) {
        debouncer.cancel();
      }
    }

    /**
     * Runs a callback function asynchronously.
     *
     * By default (if no waitTime is specified), async callbacks are run at
     * microtask timing, which will occur before paint.
     *
     * @param {!Function} callback The callback function to run, bound to
     *     `this`.
     * @param {number=} waitTime Time to wait before calling the
     *   `callback`.  If unspecified or 0, the callback will be run at microtask
     *   timing (before paint).
     * @return {number} Handle that may be used to cancel the async job.
     * @override
     */
    async(callback, waitTime) {
      return waitTime > 0 ? timeOut.run(callback.bind(this), waitTime) :
          ~microTask.run(callback.bind(this));
    }

    /**
     * Cancels an async operation started with `async`.
     *
     * @param {number} handle Handle returned from original `async` call to
     *   cancel.
     * @return {void}
     * @override
     */
    cancelAsync(handle) {
      handle < 0 ? microTask.cancel(~handle) :
          timeOut.cancel(handle);
    }

    // other

    /**
     * Convenience method for creating an element and configuring it.
     *
     * @param {string} tag HTML element tag to create.
     * @param {Object=} props Object of properties to configure on the
     *    instance.
     * @return {!Element} Newly created and configured element.
     * @override
     */
    create(tag, props) {
      let elt = document.createElement(tag);
      if (props) {
        if (elt.setProperties) {
          elt.setProperties(props);
        } else {
          for (let n in props) {
            elt[n] = props[n];
          }
        }
      }
      return elt;
    }

    /**
     * Polyfill for Element.prototype.matches, which is sometimes still
     * prefixed.
     *
     * @param {string} selector Selector to test.
     * @param {!Element=} node Element to test the selector against.
     * @return {boolean} Whether the element matches the selector.
     * @override
     */
    elementMatches(selector, node) {
      return matchesSelector( (node || this), selector);
    }

    /**
     * Toggles an HTML attribute on or off.
     *
     * @param {string} name HTML attribute name
     * @param {boolean=} bool Boolean to force the attribute on or off.
     *    When unspecified, the state of the attribute will be reversed.
     * @return {boolean} true if the attribute now exists
     * @override
     */
    toggleAttribute(name, bool) {
      let node = /** @type {Element} */(this);
      if (arguments.length === 3) {
        node = /** @type {Element} */(arguments[2]);
      }
      if (arguments.length == 1) {
        bool = !node.hasAttribute(name);
      }
      if (bool) {
        wrap(node).setAttribute(name, '');
        return true;
      } else {
        wrap(node).removeAttribute(name);
        return false;
      }
    }


    /**
     * Toggles a CSS class on or off.
     *
     * @param {string} name CSS class name
     * @param {boolean=} bool Boolean to force the class on or off.
     *    When unspecified, the state of the class will be reversed.
     * @param {Element=} node Node to target.  Defaults to `this`.
     * @return {void}
     * @override
     */
    toggleClass(name, bool, node) {
      node = /** @type {Element} */ (node || this);
      if (arguments.length == 1) {
        bool = !node.classList.contains(name);
      }
      if (bool) {
        node.classList.add(name);
      } else {
        node.classList.remove(name);
      }
    }

    /**
     * Cross-platform helper for setting an element's CSS `transform` property.
     *
     * @param {string} transformText Transform setting.
     * @param {Element=} node Element to apply the transform to.
     * Defaults to `this`
     * @return {void}
     * @override
     */
    transform(transformText, node) {
      node = /** @type {Element} */ (node || this);
      node.style.webkitTransform = transformText;
      node.style.transform = transformText;
    }

    /**
     * Cross-platform helper for setting an element's CSS `translate3d`
     * property.
     *
     * @param {number|string} x X offset.
     * @param {number|string} y Y offset.
     * @param {number|string} z Z offset.
     * @param {Element=} node Element to apply the transform to.
     * Defaults to `this`.
     * @return {void}
     * @override
     */
    translate3d(x, y, z, node) {
      node = /** @type {Element} */ (node || this);
      this.transform('translate3d(' + x + ',' + y + ',' + z + ')', node);
    }

    /**
     * Removes an item from an array, if it exists.
     *
     * If the array is specified by path, a change notification is
     * generated, so that observers, data bindings and computed
     * properties watching that path can update.
     *
     * If the array is passed directly, **no change
     * notification is generated**.
     *
     * @param {string | !Array<number|string>} arrayOrPath Path to array from
     *     which to remove the item
     *   (or the array itself).
     * @param {*} item Item to remove.
     * @return {Array} Array containing item removed.
     * @override
     */
    arrayDelete(arrayOrPath, item) {
      let index;
      if (Array.isArray(arrayOrPath)) {
        index = arrayOrPath.indexOf(item);
        if (index >= 0) {
          return arrayOrPath.splice(index, 1);
        }
      } else {
        let arr = get(this, arrayOrPath);
        index = arr.indexOf(item);
        if (index >= 0) {
          return this.splice(arrayOrPath, index, 1);
        }
      }
      return null;
    }

    // logging

    /**
     * Facades `console.log`/`warn`/`error` as override point.
     *
     * @param {string} level One of 'log', 'warn', 'error'
     * @param {Array} args Array of strings or objects to log
     * @return {void}
     * @override
     */
    _logger(level, args) {
      // accept ['foo', 'bar'] and [['foo', 'bar']]
      if (Array.isArray(args) && args.length === 1 && Array.isArray(args[0])) {
        args = args[0];
      }
      switch(level) {
        case 'log':
        case 'warn':
        case 'error':
          console[level](...args);
      }
    }

    /**
     * Facades `console.log` as an override point.
     *
     * @param {...*} args Array of strings or objects to log
     * @return {void}
     * @override
     */
    _log(...args) {
      this._logger('log', args);
    }

    /**
     * Facades `console.warn` as an override point.
     *
     * @param {...*} args Array of strings or objects to log
     * @return {void}
     * @override
     */
    _warn(...args) {
      this._logger('warn', args);
    }

    /**
     * Facades `console.error` as an override point.
     *
     * @param {...*} args Array of strings or objects to log
     * @return {void}
     * @override
     */
    _error(...args) {
      this._logger('error', args);
    }

    /**
     * Formats a message using the element type an a method name.
     *
     * @param {string} methodName Method name to associate with message
     * @param {...*} args Array of strings or objects to log
     * @return {!Array} Array with formatting information for `console`
     *   logging.
     * @override
     */
    _logf(methodName, ...args) {
      return ['[%s::%s]', this.is, methodName, ...args];
    }

  }

  LegacyElement.prototype.is = '';

  return LegacyElement;
});

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

const lifecycleProps = {
  attached: true,
  detached: true,
  ready: true,
  created: true,
  beforeRegister: true,
  registered: true,
  attributeChanged: true,
  listeners: true,
  hostAttributes: true
};

const excludeOnInfo = {
  attached: true,
  detached: true,
  ready: true,
  created: true,
  beforeRegister: true,
  registered: true,
  attributeChanged: true,
  behaviors: true,
  _noAccessors: true
};

const excludeOnBehaviors = Object.assign({
  listeners: true,
  hostAttributes: true,
  properties: true,
  observers: true,
}, excludeOnInfo);

function copyProperties(source, target, excludeProps) {
  const noAccessors = source._noAccessors;
  const propertyNames = Object.getOwnPropertyNames(source);
  for (let i = 0; i < propertyNames.length; i++) {
    let p = propertyNames[i];
    if (p in excludeProps) {
      continue;
    }
    if (noAccessors) {
      target[p] = source[p];
    } else {
      let pd = Object.getOwnPropertyDescriptor(source, p);
      if (pd) {
        // ensure property is configurable so that a later behavior can
        // re-configure it.
        pd.configurable = true;
        Object.defineProperty(target, p, pd);
      }
    }
  }
}

/**
 * Applies a "legacy" behavior or array of behaviors to the provided class.
 *
 * Note: this method will automatically also apply the `LegacyElementMixin`
 * to ensure that any legacy behaviors can rely on legacy Polymer API on
 * the underlying element.
 *
 * @function
 * @template T
 * @param {!Object|!Array<!Object>} behaviors Behavior object or array of behaviors.
 * @param {function(new:T)} klass Element class.
 * @return {?} Returns a new Element class extended by the
 * passed in `behaviors` and also by `LegacyElementMixin`.
 * @suppress {invalidCasts, checkTypes}
 */
function mixinBehaviors(behaviors, klass) {
  return GenerateClassFromInfo({}, LegacyElementMixin(klass), behaviors);
}

// NOTE:
// 1.x
// Behaviors were mixed in *in reverse order* and de-duped on the fly.
// The rule was that behavior properties were copied onto the element
// prototype if and only if the property did not already exist.
// Given: Polymer{ behaviors: [A, B, C, A, B]}, property copy order was:
// (1), B, (2), A, (3) C. This means prototype properties win over
// B properties win over A win over C. This mirrors what would happen
// with inheritance if element extended B extended A extended C.
//
// Again given, Polymer{ behaviors: [A, B, C, A, B]}, the resulting
// `behaviors` array was [C, A, B].
// Behavior lifecycle methods were called in behavior array order
// followed by the element, e.g. (1) C.created, (2) A.created,
// (3) B.created, (4) element.created. There was no support for
// super, and "super-behavior" methods were callable only by name).
//
// 2.x
// Behaviors are made into proper mixins which live in the
// element's prototype chain. Behaviors are placed in the element prototype
// eldest to youngest and de-duped youngest to oldest:
// So, first [A, B, C, A, B] becomes [C, A, B] then,
// the element prototype becomes (oldest) (1) PolymerElement, (2) class(C),
// (3) class(A), (4) class(B), (5) class(Polymer({...})).
// Result:
// This means element properties win over B properties win over A win
// over C. (same as 1.x)
// If lifecycle is called (super then me), order is
// (1) C.created, (2) A.created, (3) B.created, (4) element.created
// (again same as 1.x)
function applyBehaviors(proto, behaviors, lifecycle) {
  for (let i=0; i<behaviors.length; i++) {
    applyInfo(proto, behaviors[i], lifecycle, excludeOnBehaviors);
  }
}

function applyInfo(proto, info, lifecycle, excludeProps) {
  copyProperties(info, proto, excludeProps);
  for (let p in lifecycleProps) {
    if (info[p]) {
      lifecycle[p] = lifecycle[p] || [];
      lifecycle[p].push(info[p]);
    }
  }
}

/**
 * @param {Array} behaviors List of behaviors to flatten.
 * @param {Array=} list Target list to flatten behaviors into.
 * @param {Array=} exclude List of behaviors to exclude from the list.
 * @return {!Array} Returns the list of flattened behaviors.
 */
function flattenBehaviors(behaviors, list, exclude) {
  list = list || [];
  for (let i=behaviors.length-1; i >= 0; i--) {
    let b = behaviors[i];
    if (b) {
      if (Array.isArray(b)) {
        flattenBehaviors(b, list);
      } else {
        // dedup
        if (list.indexOf(b) < 0 && (!exclude || exclude.indexOf(b) < 0)) {
          list.unshift(b);
        }
      }
    } else {
      console.warn('behavior is null, check for missing or 404 import');
    }
  }
  return list;
}

/**
 * Copies property descriptors from source to target, overwriting all fields
 * of any previous descriptor for a property *except* for `value`, which is
 * merged in from the target if it does not exist on the source.
 *
 * @param {*} target Target properties object
 * @param {*} source Source properties object
 */
function mergeProperties(target, source) {
  for (const p in source) {
    const targetInfo = target[p];
    const sourceInfo = source[p];
    if (!('value' in sourceInfo) && targetInfo && ('value' in targetInfo)) {
      target[p] = Object.assign({value: targetInfo.value}, sourceInfo);
    } else {
      target[p] = sourceInfo;
    }
  }
}

const LegacyElement = LegacyElementMixin(HTMLElement);

/* Note about construction and extension of legacy classes.
  [Changed in Q4 2018 to optimize performance.]

  When calling `Polymer` or `mixinBehaviors`, the generated class below is
  made. The list of behaviors was previously made into one generated class per
  behavior, but this is no longer the case as behaviors are now called
  manually. Note, there may *still* be multiple generated classes in the
  element's prototype chain if extension is used with `mixinBehaviors`.

  The generated class is directly tied to the info object and behaviors
  used to create it. That list of behaviors is filtered so it's only the
  behaviors not active on the superclass. In order to call through to the
  entire list of lifecycle methods, it's important to call `super`.

  The element's `properties` and `observers` are controlled via the finalization
  mechanism provided by `PropertiesMixin`. `Properties` and `observers` are
  collected by manually traversing the prototype chain and merging.

  To limit changes, the `_registered` method is called via `_initializeProperties`
  and not `_finalizeClass`.

*/
/**
 * @param {!PolymerInit} info Polymer info object
 * @param {function(new:HTMLElement)} Base base class to extend with info object
 * @param {Object=} behaviors behaviors to copy into the element
 * @return {function(new:HTMLElement)} Generated class
 * @suppress {checkTypes}
 * @private
 */
function GenerateClassFromInfo(info, Base, behaviors) {

  // manages behavior and lifecycle processing (filled in after class definition)
  let behaviorList;
  const lifecycle = {};

  /** @private */
  class PolymerGenerated extends Base {

    // explicitly not calling super._finalizeClass
    /** @nocollapse */
    static _finalizeClass() {
      // if calling via a subclass that hasn't been generated, pass through to super
      if (!this.hasOwnProperty(JSCompiler_renameProperty('generatedFrom', this))) {
        // TODO(https://github.com/google/closure-compiler/issues/3240):
        //     Change back to just super.methodCall()
        Base._finalizeClass.call(this);
      } else {
        // interleave properties and observers per behavior and `info`
        if (behaviorList) {
          for (let i=0, b; i < behaviorList.length; i++) {
            b = behaviorList[i];
            if (b.properties) {
              this.createProperties(b.properties);
            }
            if (b.observers) {
              this.createObservers(b.observers, b.properties);
            }
          }
        }
        if (info.properties) {
          this.createProperties(info.properties);
        }
        if (info.observers) {
          this.createObservers(info.observers, info.properties);
        }
        // make sure to prepare the element template
        this._prepareTemplate();
      }
    }

    /** @nocollapse */
    static get properties() {
      const properties = {};
      if (behaviorList) {
        for (let i=0; i < behaviorList.length; i++) {
          mergeProperties(properties, behaviorList[i].properties);
        }
      }
      mergeProperties(properties, info.properties);
      return properties;
    }

    /** @nocollapse */
    static get observers() {
      let observers = [];
      if (behaviorList) {
        for (let i=0, b; i < behaviorList.length; i++) {
          b = behaviorList[i];
          if (b.observers) {
            observers = observers.concat(b.observers);
          }
        }
      }
      if (info.observers) {
        observers = observers.concat(info.observers);
      }
      return observers;
    }

    /**
     * @return {void}
     */
    created() {
      super.created();
      const list = lifecycle.created;
      if (list) {
        for (let i=0; i < list.length; i++) {
          list[i].call(this);
        }
      }
    }

    /**
     * @return {void}
     */
    _registered() {
      /* NOTE: `beforeRegister` is called here for bc, but the behavior
        is different than in 1.x. In 1.0, the method was called *after*
        mixing prototypes together but *before* processing of meta-objects.
        However, dynamic effects can still be set here and can be done either
        in `beforeRegister` or `registered`. It is no longer possible to set
        `is` in `beforeRegister` as you could in 1.x.
      */
      // only proceed if the generated class' prototype has not been registered.
      const generatedProto = PolymerGenerated.prototype;
      if (!generatedProto.hasOwnProperty(JSCompiler_renameProperty('__hasRegisterFinished', generatedProto))) {
        generatedProto.__hasRegisterFinished = true;
        // ensure superclass is registered first.
        super._registered();
        // copy properties onto the generated class lazily if we're optimizing,
        if (legacyOptimizations) {
          copyPropertiesToProto(generatedProto);
        }
        // make sure legacy lifecycle is called on the *element*'s prototype
        // and not the generated class prototype; if the element has been
        // extended, these are *not* the same.
        const proto = Object.getPrototypeOf(this);
        let list = lifecycle.beforeRegister;
        if (list) {
          for (let i=0; i < list.length; i++) {
            list[i].call(proto);
          }
        }
        list = lifecycle.registered;
        if (list) {
          for (let i=0; i < list.length; i++) {
            list[i].call(proto);
          }
        }
      }
    }

    /**
     * @return {void}
     */
    _applyListeners() {
      super._applyListeners();
      const list = lifecycle.listeners;
      if (list) {
        for (let i=0; i < list.length; i++) {
          const listeners = list[i];
          if (listeners) {
            for (let l in listeners) {
              this._addMethodEventListenerToNode(this, l, listeners[l]);
            }
          }
        }
      }
    }

    // note: exception to "super then me" rule;
    // do work before calling super so that super attributes
    // only apply if not already set.
    /**
     * @return {void}
     */
    _ensureAttributes() {
      const list = lifecycle.hostAttributes;
      if (list) {
        for (let i=list.length-1; i >= 0; i--) {
          const hostAttributes = list[i];
          for (let a in hostAttributes) {
              this._ensureAttribute(a, hostAttributes[a]);
            }
        }
      }
      super._ensureAttributes();
    }

    /**
     * @return {void}
     */
    ready() {
      super.ready();
      let list = lifecycle.ready;
      if (list) {
        for (let i=0; i < list.length; i++) {
          list[i].call(this);
        }
      }
    }

    /**
     * @return {void}
     */
    attached() {
      super.attached();
      let list = lifecycle.attached;
      if (list) {
        for (let i=0; i < list.length; i++) {
          list[i].call(this);
        }
      }
    }

    /**
     * @return {void}
     */
    detached() {
      super.detached();
      let list = lifecycle.detached;
      if (list) {
        for (let i=0; i < list.length; i++) {
          list[i].call(this);
        }
      }
    }

    /**
     * Implements native Custom Elements `attributeChangedCallback` to
     * set an attribute value to a property via `_attributeToProperty`.
     *
     * @param {string} name Name of attribute that changed
     * @param {?string} old Old attribute value
     * @param {?string} value New attribute value
     * @return {void}
     */
    attributeChanged(name, old, value) {
      super.attributeChanged();
      let list = lifecycle.attributeChanged;
      if (list) {
        for (let i=0; i < list.length; i++) {
          list[i].call(this, name, old, value);
        }
      }
    }
  }

  // apply behaviors, note actual copying is done lazily at first instance creation
  if (behaviors) {
    // NOTE: ensure the behavior is extending a class with
    // legacy element api. This is necessary since behaviors expect to be able
    // to access 1.x legacy api.
    if (!Array.isArray(behaviors)) {
      behaviors = [behaviors];
    }
    let superBehaviors = Base.prototype.behaviors;
    // get flattened, deduped list of behaviors *not* already on super class
    behaviorList = flattenBehaviors(behaviors, null, superBehaviors);
    PolymerGenerated.prototype.behaviors = superBehaviors ?
      superBehaviors.concat(behaviors) : behaviorList;
  }

  const copyPropertiesToProto = (proto) => {
    if (behaviorList) {
      applyBehaviors(proto, behaviorList, lifecycle);
    }
    applyInfo(proto, info, lifecycle, excludeOnInfo);
  };

  // copy properties if we're not optimizing
  if (!legacyOptimizations) {
    copyPropertiesToProto(PolymerGenerated.prototype);
  }

  PolymerGenerated.generatedFrom = info;

  return PolymerGenerated;
}

/**
 * Generates a class that extends `LegacyElement` based on the
 * provided info object.  Metadata objects on the `info` object
 * (`properties`, `observers`, `listeners`, `behaviors`, `is`) are used
 * for Polymer's meta-programming systems, and any functions are copied
 * to the generated class.
 *
 * Valid "metadata" values are as follows:
 *
 * `is`: String providing the tag name to register the element under. In
 * addition, if a `dom-module` with the same id exists, the first template
 * in that `dom-module` will be stamped into the shadow root of this element,
 * with support for declarative event listeners (`on-...`), Polymer data
 * bindings (`[[...]]` and `{{...}}`), and id-based node finding into
 * `this.$`.
 *
 * `properties`: Object describing property-related metadata used by Polymer
 * features (key: property names, value: object containing property metadata).
 * Valid keys in per-property metadata include:
 * - `type` (String|Number|Object|Array|...): Used by
 *   `attributeChangedCallback` to determine how string-based attributes
 *   are deserialized to JavaScript property values.
 * - `notify` (boolean): Causes a change in the property to fire a
 *   non-bubbling event called `<property>-changed`. Elements that have
 *   enabled two-way binding to the property use this event to observe changes.
 * - `readOnly` (boolean): Creates a getter for the property, but no setter.
 *   To set a read-only property, use the private setter method
 *   `_setProperty(property, value)`.
 * - `observer` (string): Observer method name that will be called when
 *   the property changes. The arguments of the method are
 *   `(value, previousValue)`.
 * - `computed` (string): String describing method and dependent properties
 *   for computing the value of this property (e.g. `'computeFoo(bar, zot)'`).
 *   Computed properties are read-only by default and can only be changed
 *   via the return value of the computing method.
 *
 * `observers`: Array of strings describing multi-property observer methods
 *  and their dependent properties (e.g. `'observeABC(a, b, c)'`).
 *
 * `listeners`: Object describing event listeners to be added to each
 *  instance of this element (key: event name, value: method name).
 *
 * `behaviors`: Array of additional `info` objects containing metadata
 * and callbacks in the same format as the `info` object here which are
 * merged into this element.
 *
 * `hostAttributes`: Object listing attributes to be applied to the host
 *  once created (key: attribute name, value: attribute value).  Values
 *  are serialized based on the type of the value.  Host attributes should
 *  generally be limited to attributes such as `tabIndex` and `aria-...`.
 *  Attributes in `hostAttributes` are only applied if a user-supplied
 *  attribute is not already present (attributes in markup override
 *  `hostAttributes`).
 *
 * In addition, the following Polymer-specific callbacks may be provided:
 * - `registered`: called after first instance of this element,
 * - `created`: called during `constructor`
 * - `attached`: called during `connectedCallback`
 * - `detached`: called during `disconnectedCallback`
 * - `ready`: called before first `attached`, after all properties of
 *   this element have been propagated to its template and all observers
 *   have run
 *
 * @param {!PolymerInit} info Object containing Polymer metadata and functions
 *   to become class methods.
 * @template T
 * @param {function(T):T} mixin Optional mixin to apply to legacy base class
 *   before extending with Polymer metaprogramming.
 * @return {function(new:HTMLElement)} Generated class
 */
const Class = function(info, mixin) {
  if (!info) {
    console.warn('Polymer.Class requires `info` argument');
  }
  let klass = mixin ? mixin(LegacyElement) :
      LegacyElement;
  klass = GenerateClassFromInfo(info, klass, info.behaviors);
  // decorate klass with registration info
  klass.is = klass.prototype.is = info.is;
  return klass;
};

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Legacy class factory and registration helper for defining Polymer
 * elements.
 *
 * This method is equivalent to
 *
 *     import {Class} from '@polymer/polymer/lib/legacy/class.js';
 *     customElements.define(info.is, Class(info));
 *
 * See `Class` for details on valid legacy metadata format for `info`.
 *
 * @global
 * @override
 * @function
 * @param {!PolymerInit} info Object containing Polymer metadata and functions
 *   to become class methods.
 * @return {function(new: HTMLElement)} Generated class
 * @suppress {duplicate, invalidCasts, checkTypes}
 */
const Polymer = function(info) {
  // if input is a `class` (aka a function with a prototype), use the prototype
  // remember that the `constructor` will never be called
  let klass;
  if (typeof info === 'function') {
    klass = info;
  } else {
    klass = Polymer.Class(info);
  }
  // Copy opt out for `legacyNoObservedAttributes` from info object to class.
  if (info._legacyForceObservedAttributes) {
    klass.prototype._legacyForceObservedAttributes = info._legacyForceObservedAttributes;
  }
  customElements.define(klass.is, /** @type {!HTMLElement} */(klass));
  return klass;
};

Polymer.Class = Class;

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

// Common implementation for mixin & behavior
function mutablePropertyChange(inst, property, value, old, mutableData) {
  let isObject;
  if (mutableData) {
    isObject = (typeof value === 'object' && value !== null);
    // Pull `old` for Objects from temp cache, but treat `null` as a primitive
    if (isObject) {
      old = inst.__dataTemp[property];
    }
  }
  // Strict equality check, but return false for NaN===NaN
  let shouldChange = (old !== value && (old === old || value === value));
  // Objects are stored in temporary cache (cleared at end of
  // turn), which is used for dirty-checking
  if (isObject && shouldChange) {
    inst.__dataTemp[property] = value;
  }
  return shouldChange;
}

/**
 * Element class mixin to skip strict dirty-checking for objects and arrays
 * (always consider them to be "dirty"), for use on elements utilizing
 * `PropertyEffects`
 *
 * By default, `PropertyEffects` performs strict dirty checking on
 * objects, which means that any deep modifications to an object or array will
 * not be propagated unless "immutable" data patterns are used (i.e. all object
 * references from the root to the mutation were changed).
 *
 * Polymer also provides a proprietary data mutation and path notification API
 * (e.g. `notifyPath`, `set`, and array mutation API's) that allow efficient
 * mutation and notification of deep changes in an object graph to all elements
 * bound to the same object graph.
 *
 * In cases where neither immutable patterns nor the data mutation API can be
 * used, applying this mixin will cause Polymer to skip dirty checking for
 * objects and arrays (always consider them to be "dirty").  This allows a
 * user to make a deep modification to a bound object graph, and then either
 * simply re-set the object (e.g. `this.items = this.items`) or call `notifyPath`
 * (e.g. `this.notifyPath('items')`) to update the tree.  Note that all
 * elements that wish to be updated based on deep mutations must apply this
 * mixin or otherwise skip strict dirty checking for objects/arrays.
 * Specifically, any elements in the binding tree between the source of a
 * mutation and the consumption of it must apply this mixin or enable the
 * `OptionalMutableData` mixin.
 *
 * In order to make the dirty check strategy configurable, see
 * `OptionalMutableData`.
 *
 * Note, the performance characteristics of propagating large object graphs
 * will be worse as opposed to using strict dirty checking with immutable
 * patterns or Polymer's path notification API.
 *
 * @mixinFunction
 * @polymer
 * @summary Element class mixin to skip strict dirty-checking for objects
 *   and arrays
 * @template T
 * @param {function(new:T)} superClass Class to apply mixin to.
 * @return {function(new:T)} superClass with mixin applied.
 */
const MutableData = dedupingMixin(superClass => {

  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_MutableData}
   */
  class MutableData extends superClass {
    /**
     * Overrides `PropertyEffects` to provide option for skipping
     * strict equality checking for Objects and Arrays.
     *
     * This method pulls the value to dirty check against from the `__dataTemp`
     * cache (rather than the normal `__data` cache) for Objects.  Since the temp
     * cache is cleared at the end of a turn, this implementation allows
     * side-effects of deep object changes to be processed by re-setting the
     * same object (using the temp cache as an in-turn backstop to prevent
     * cycles due to 2-way notification).
     *
     * @param {string} property Property name
     * @param {*} value New property value
     * @param {*} old Previous property value
     * @return {boolean} Whether the property should be considered a change
     * @protected
     */
    _shouldPropertyChange(property, value, old) {
      return mutablePropertyChange(this, property, value, old, true);
    }

  }

  return MutableData;

});

/**
 * Element class mixin to add the optional ability to skip strict
 * dirty-checking for objects and arrays (always consider them to be
 * "dirty") by setting a `mutable-data` attribute on an element instance.
 *
 * By default, `PropertyEffects` performs strict dirty checking on
 * objects, which means that any deep modifications to an object or array will
 * not be propagated unless "immutable" data patterns are used (i.e. all object
 * references from the root to the mutation were changed).
 *
 * Polymer also provides a proprietary data mutation and path notification API
 * (e.g. `notifyPath`, `set`, and array mutation API's) that allow efficient
 * mutation and notification of deep changes in an object graph to all elements
 * bound to the same object graph.
 *
 * In cases where neither immutable patterns nor the data mutation API can be
 * used, applying this mixin will allow Polymer to skip dirty checking for
 * objects and arrays (always consider them to be "dirty").  This allows a
 * user to make a deep modification to a bound object graph, and then either
 * simply re-set the object (e.g. `this.items = this.items`) or call `notifyPath`
 * (e.g. `this.notifyPath('items')`) to update the tree.  Note that all
 * elements that wish to be updated based on deep mutations must apply this
 * mixin or otherwise skip strict dirty checking for objects/arrays.
 * Specifically, any elements in the binding tree between the source of a
 * mutation and the consumption of it must enable this mixin or apply the
 * `MutableData` mixin.
 *
 * While this mixin adds the ability to forgo Object/Array dirty checking,
 * the `mutableData` flag defaults to false and must be set on the instance.
 *
 * Note, the performance characteristics of propagating large object graphs
 * will be worse by relying on `mutableData: true` as opposed to using
 * strict dirty checking with immutable patterns or Polymer's path notification
 * API.
 *
 * @mixinFunction
 * @polymer
 * @summary Element class mixin to optionally skip strict dirty-checking
 *   for objects and arrays
 */
const OptionalMutableData = dedupingMixin(superClass => {

  /**
   * @mixinClass
   * @polymer
   * @implements {Polymer_OptionalMutableData}
   */
  class OptionalMutableData extends superClass {

    /** @nocollapse */
    static get properties() {
      return {
        /**
         * Instance-level flag for configuring the dirty-checking strategy
         * for this element.  When true, Objects and Arrays will skip dirty
         * checking, otherwise strict equality checking will be used.
         */
        mutableData: Boolean
      };
    }

    /**
     * Overrides `PropertyEffects` to provide option for skipping
     * strict equality checking for Objects and Arrays.
     *
     * When `this.mutableData` is true on this instance, this method
     * pulls the value to dirty check against from the `__dataTemp` cache
     * (rather than the normal `__data` cache) for Objects.  Since the temp
     * cache is cleared at the end of a turn, this implementation allows
     * side-effects of deep object changes to be processed by re-setting the
     * same object (using the temp cache as an in-turn backstop to prevent
     * cycles due to 2-way notification).
     *
     * @param {string} property Property name
     * @param {*} value New property value
     * @param {*} old Previous property value
     * @return {boolean} Whether the property should be considered a change
     * @protected
     */
    _shouldPropertyChange(property, value, old) {
      return mutablePropertyChange(this, property, value, old, this.mutableData);
    }
  }

  return OptionalMutableData;

});

// Export for use by legacy behavior
MutableData._mutablePropertyChange = mutablePropertyChange;

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

// Base class for HTMLTemplateElement extension that has property effects
// machinery for propagating host properties to children. This is an ES5
// class only because Babel (incorrectly) requires super() in the class
// constructor even though no `this` is used and it returns an instance.
let newInstance = null;

/**
 * @constructor
 * @extends {HTMLTemplateElement}
 * @private
 */
function HTMLTemplateElementExtension() { return newInstance; }
HTMLTemplateElementExtension.prototype = Object.create(HTMLTemplateElement.prototype, {
  constructor: {
    value: HTMLTemplateElementExtension,
    writable: true
  }
});

/**
 * @constructor
 * @implements {Polymer_PropertyEffects}
 * @extends {HTMLTemplateElementExtension}
 * @private
 */
const DataTemplate = PropertyEffects(HTMLTemplateElementExtension);

/**
 * @constructor
 * @implements {Polymer_MutableData}
 * @extends {DataTemplate}
 * @private
 */
const MutableDataTemplate = MutableData(DataTemplate);

// Applies a DataTemplate subclass to a <template> instance
function upgradeTemplate(template, constructor) {
  newInstance = template;
  Object.setPrototypeOf(template, constructor.prototype);
  new constructor();
  newInstance = null;
}

/**
 * Base class for TemplateInstance.
 * @constructor
 * @extends {HTMLElement}
 * @implements {Polymer_PropertyEffects}
 * @private
 */
const templateInstanceBase = PropertyEffects(class {});

function showHideChildren(hide, children) {
  for (let i=0; i<children.length; i++) {
    let n = children[i];
    // Ignore non-changes
    if (Boolean(hide) != Boolean(n.__hideTemplateChildren__)) {
      // clear and restore text
      if (n.nodeType === Node.TEXT_NODE) {
        if (hide) {
          n.__polymerTextContent__ = n.textContent;
          n.textContent = '';
        } else {
          n.textContent = n.__polymerTextContent__;
        }
      // remove and replace slot
      } else if (n.localName === 'slot') {
        if (hide) {
          n.__polymerReplaced__ = document.createComment('hidden-slot');
          wrap(wrap(n).parentNode).replaceChild(n.__polymerReplaced__, n);
        } else {
          const replace = n.__polymerReplaced__;
          if (replace) {
            wrap(wrap(replace).parentNode).replaceChild(n, replace);
          }
        }
      }
      // hide and show nodes
      else if (n.style) {
        if (hide) {
          n.__polymerDisplay__ = n.style.display;
          n.style.display = 'none';
        } else {
          n.style.display = n.__polymerDisplay__;
        }
      }
    }
    n.__hideTemplateChildren__ = hide;
    if (n._showHideChildren) {
      n._showHideChildren(hide);
    }
  }
}

/**
 * @polymer
 * @customElement
 * @appliesMixin PropertyEffects
 * @unrestricted
 */
class TemplateInstanceBase extends templateInstanceBase {
  constructor(props) {
    super();
    this._configureProperties(props);
    /** @type {!StampedTemplate} */
    this.root = this._stampTemplate(this.__dataHost);
    // Save list of stamped children
    let children = [];
    /** @suppress {invalidCasts} */
    this.children = /** @type {!NodeList} */ (children);
    // Polymer 1.x did not use `Polymer.dom` here so not bothering.
    for (let n = this.root.firstChild; n; n=n.nextSibling) {
      children.push(n);
      n.__templatizeInstance = this;
    }
    if (this.__templatizeOwner &&
      this.__templatizeOwner.__hideTemplateChildren__) {
      this._showHideChildren(true);
    }
    // Flush props only when props are passed if instance props exist
    // or when there isn't instance props.
    let options = this.__templatizeOptions;
    if ((props && options.instanceProps) || !options.instanceProps) {
      this._enableProperties();
    }
  }
  /**
   * Configure the given `props` by calling `_setPendingProperty`. Also
   * sets any properties stored in `__hostProps`.
   * @private
   * @param {Object} props Object of property name-value pairs to set.
   * @return {void}
   */
  _configureProperties(props) {
    let options = this.__templatizeOptions;
    if (options.forwardHostProp) {
      for (let hprop in this.__hostProps) {
        this._setPendingProperty(hprop, this.__dataHost['_host_' + hprop]);
      }
    }
    // Any instance props passed in the constructor will overwrite host props;
    // normally this would be a user error but we don't specifically filter them
    for (let iprop in props) {
      this._setPendingProperty(iprop, props[iprop]);
    }
  }
  /**
   * Forwards a host property to this instance.  This method should be
   * called on instances from the `options.forwardHostProp` callback
   * to propagate changes of host properties to each instance.
   *
   * Note this method enqueues the change, which are flushed as a batch.
   *
   * @param {string} prop Property or path name
   * @param {*} value Value of the property to forward
   * @return {void}
   */
  forwardHostProp(prop, value) {
    if (this._setPendingPropertyOrPath(prop, value, false, true)) {
      this.__dataHost._enqueueClient(this);
    }
  }

  /**
   * Override point for adding custom or simulated event handling.
   *
   * @override
   * @param {!Node} node Node to add event listener to
   * @param {string} eventName Name of event
   * @param {function(!Event):void} handler Listener function to add
   * @return {void}
   */
  _addEventListenerToNode(node, eventName, handler) {
    if (this._methodHost && this.__templatizeOptions.parentModel) {
      // If this instance should be considered a parent model, decorate
      // events this template instance as `model`
      this._methodHost._addEventListenerToNode(node, eventName, (e) => {
        e.model = this;
        handler(e);
      });
    } else {
      // Otherwise delegate to the template's host (which could be)
      // another template instance
      let templateHost = this.__dataHost.__dataHost;
      if (templateHost) {
        templateHost._addEventListenerToNode(node, eventName, handler);
      }
    }
  }
  /**
   * Shows or hides the template instance top level child elements. For
   * text nodes, `textContent` is removed while "hidden" and replaced when
   * "shown."
   * @param {boolean} hide Set to true to hide the children;
   * set to false to show them.
   * @return {void}
   * @protected
   */
  _showHideChildren(hide) {
    showHideChildren(hide, this.children);
  }
  /**
   * Overrides default property-effects implementation to intercept
   * textContent bindings while children are "hidden" and cache in
   * private storage for later retrieval.
   *
   * @override
   * @param {!Node} node The node to set a property on
   * @param {string} prop The property to set
   * @param {*} value The value to set
   * @return {void}
   * @protected
   */
  _setUnmanagedPropertyToNode(node, prop, value) {
    if (node.__hideTemplateChildren__ &&
        node.nodeType == Node.TEXT_NODE && prop == 'textContent') {
      node.__polymerTextContent__ = value;
    } else {
      super._setUnmanagedPropertyToNode(node, prop, value);
    }
  }
  /**
   * Find the parent model of this template instance.  The parent model
   * is either another templatize instance that had option `parentModel: true`,
   * or else the host element.
   *
   * @return {!Polymer_PropertyEffects} The parent model of this instance
   */
  get parentModel() {
    let model = this.__parentModel;
    if (!model) {
      let options;
      model = this;
      do {
        // A template instance's `__dataHost` is a <template>
        // `model.__dataHost.__dataHost` is the template's host
        model = model.__dataHost.__dataHost;
      } while ((options = model.__templatizeOptions) && !options.parentModel);
      this.__parentModel = model;
    }
    return model;
  }

  /**
   * Stub of HTMLElement's `dispatchEvent`, so that effects that may
   * dispatch events safely no-op.
   *
   * @param {Event} event Event to dispatch
   * @return {boolean} Always true.
   * @override
   */
   dispatchEvent(event) { // eslint-disable-line no-unused-vars
     return true;
  }
}

/**
 * @constructor
 * @extends {TemplateInstanceBase}
 * @implements {Polymer_MutableData}
 * @private
 */
const MutableTemplateInstanceBase = MutableData(
    // This cast shouldn't be neccessary, but Closure doesn't understand that
    // TemplateInstanceBase is a constructor function.
    /** @type {function(new:TemplateInstanceBase)} */ (TemplateInstanceBase));

function findMethodHost(template) {
  // Technically this should be the owner of the outermost template.
  // In shadow dom, this is always getRootNode().host, but we can
  // approximate this via cooperation with our dataHost always setting
  // `_methodHost` as long as there were bindings (or id's) on this
  // instance causing it to get a dataHost.
  let templateHost = template.__dataHost;
  return templateHost && templateHost._methodHost || templateHost;
}

/* eslint-disable valid-jsdoc */
/**
 * @suppress {missingProperties} class.prototype is not defined for some reason
 */
function createTemplatizerClass(template, templateInfo, options) {
  /**
   * @constructor
   * @extends {TemplateInstanceBase}
   */
  let templatizerBase = options.mutableData ?
    MutableTemplateInstanceBase : TemplateInstanceBase;

  // Affordance for global mixins onto TemplatizeInstance
  if (templatize.mixin) {
    templatizerBase = templatize.mixin(templatizerBase);
  }

  /**
   * Anonymous class created by the templatize
   * @constructor
   * @private
   */
  let klass = class extends templatizerBase { };
  /** @override */
  klass.prototype.__templatizeOptions = options;
  klass.prototype._bindTemplate(template);
  addNotifyEffects(klass, template, templateInfo, options);
  return klass;
}

/**
 * Adds propagate effects from the template to the template instance for
 * properties that the host binds to the template using the `_host_` prefix.
 *
 * @suppress {missingProperties} class.prototype is not defined for some reason
 */
function addPropagateEffects(target, templateInfo, options, methodHost) {
  let userForwardHostProp = options.forwardHostProp;
  if (userForwardHostProp && templateInfo.hasHostProps) {
    // Under the `removeNestedTemplates` optimization, a custom element like
    // `dom-if` or `dom-repeat` can itself be treated as the "template"; this
    // flag is used to switch between upgrading a `<template>` to be a property
    // effects client vs. adding the effects directly to the custom element
    const isTemplate = target.localName == 'template';
    // Provide data API and property effects on memoized template class
    let klass = templateInfo.templatizeTemplateClass;
    if (!klass) {
      if (isTemplate) {
        /**
         * @constructor
         * @extends {DataTemplate}
         */
        let templatizedBase =
            options.mutableData ? MutableDataTemplate : DataTemplate;

        // NOTE: due to https://github.com/google/closure-compiler/issues/2928,
        // combining the next two lines into one assignment causes a spurious
        // type error.
        /** @private */
        class TemplatizedTemplate extends templatizedBase {}
        klass = templateInfo.templatizeTemplateClass = TemplatizedTemplate;
      } else {
        /**
         * @constructor
         * @extends {PolymerElement}
         */
        const templatizedBase = target.constructor;

        // Create a cached subclass of the base custom element class onto which
        // to put the template-specific propagate effects
        // NOTE: due to https://github.com/google/closure-compiler/issues/2928,
        // combining the next two lines into one assignment causes a spurious
        // type error.
        /** @private */
        class TemplatizedTemplateExtension extends templatizedBase {}
        klass = templateInfo.templatizeTemplateClass =
            TemplatizedTemplateExtension;
      }
      // Add template - >instances effects
      // and host <- template effects
      let hostProps = templateInfo.hostProps;
      for (let prop in hostProps) {
        klass.prototype._addPropertyEffect('_host_' + prop,
          klass.prototype.PROPERTY_EFFECT_TYPES.PROPAGATE,
          {fn: createForwardHostPropEffect(prop, userForwardHostProp)});
        klass.prototype._createNotifyingProperty('_host_' + prop);
      }
      if (legacyWarnings && methodHost) {
        warnOnUndeclaredProperties(templateInfo, options, methodHost);
      }
    }
    // Mix any pre-bound data into __data; no need to flush this to
    // instances since they pull from the template at instance-time
    if (target.__dataProto) {
      // Note, generally `__dataProto` could be chained, but it's guaranteed
      // to not be since this is a vanilla template we just added effects to
      Object.assign(target.__data, target.__dataProto);
    }
    if (isTemplate) {
      upgradeTemplate(target, klass);
      // Clear any pending data for performance
      target.__dataTemp = {};
      target.__dataPending = null;
      target.__dataOld = null;
      target._enableProperties();
    } else {
      // Swizzle the cached subclass prototype onto the custom element
      Object.setPrototypeOf(target, klass.prototype);
      // Check for any pre-bound instance host properties, and do the
      // instance property delete/assign dance for those (directly into data;
      // not need to go through accessor since they are pulled at instance time)
      const hostProps = templateInfo.hostProps;
      for (let prop in hostProps) {
        prop = '_host_' + prop;
        if (prop in target) {
          const val = target[prop];
          delete target[prop];
          target.__data[prop] = val;
        }
      }
    }
  }
}
/* eslint-enable valid-jsdoc */

function createForwardHostPropEffect(hostProp, userForwardHostProp) {
  return function forwardHostProp(template, prop, props) {
    userForwardHostProp.call(template.__templatizeOwner,
      prop.substring('_host_'.length), props[prop]);
  };
}

function addNotifyEffects(klass, template, templateInfo, options) {
  let hostProps = templateInfo.hostProps || {};
  for (let iprop in options.instanceProps) {
    delete hostProps[iprop];
    let userNotifyInstanceProp = options.notifyInstanceProp;
    if (userNotifyInstanceProp) {
      klass.prototype._addPropertyEffect(iprop,
        klass.prototype.PROPERTY_EFFECT_TYPES.NOTIFY,
        {fn: createNotifyInstancePropEffect(iprop, userNotifyInstanceProp)});
    }
  }
  if (options.forwardHostProp && template.__dataHost) {
    for (let hprop in hostProps) {
      // As we're iterating hostProps in this function, note whether
      // there were any, for an optimization in addPropagateEffects
      if (!templateInfo.hasHostProps) {
        templateInfo.hasHostProps = true;
      }
      klass.prototype._addPropertyEffect(hprop,
        klass.prototype.PROPERTY_EFFECT_TYPES.NOTIFY,
        {fn: createNotifyHostPropEffect()});
    }
  }
}

function createNotifyInstancePropEffect(instProp, userNotifyInstanceProp) {
  return function notifyInstanceProp(inst, prop, props) {
    userNotifyInstanceProp.call(inst.__templatizeOwner,
      inst, prop, props[prop]);
  };
}

function createNotifyHostPropEffect() {
  return function notifyHostProp(inst, prop, props) {
    inst.__dataHost._setPendingPropertyOrPath('_host_' + prop, props[prop], true, true);
  };
}


/**
 * Returns an anonymous `PropertyEffects` class bound to the
 * `<template>` provided.  Instancing the class will result in the
 * template being stamped into a document fragment stored as the instance's
 * `root` property, after which it can be appended to the DOM.
 *
 * Templates may utilize all Polymer data-binding features as well as
 * declarative event listeners.  Event listeners and inline computing
 * functions in the template will be called on the host of the template.
 *
 * The constructor returned takes a single argument dictionary of initial
 * property values to propagate into template bindings.  Additionally
 * host properties can be forwarded in, and instance properties can be
 * notified out by providing optional callbacks in the `options` dictionary.
 *
 * Valid configuration in `options` are as follows:
 *
 * - `forwardHostProp(property, value)`: Called when a property referenced
 *   in the template changed on the template's host. As this library does
 *   not retain references to templates instanced by the user, it is the
 *   templatize owner's responsibility to forward host property changes into
 *   user-stamped instances.  The `instance.forwardHostProp(property, value)`
 *    method on the generated class should be called to forward host
 *   properties into the template to prevent unnecessary property-changed
 *   notifications. Any properties referenced in the template that are not
 *   defined in `instanceProps` will be notified up to the template's host
 *   automatically.
 * - `instanceProps`: Dictionary of property names that will be added
 *   to the instance by the templatize owner.  These properties shadow any
 *   host properties, and changes within the template to these properties
 *   will result in `notifyInstanceProp` being called.
 * - `mutableData`: When `true`, the generated class will skip strict
 *   dirty-checking for objects and arrays (always consider them to be
 *   "dirty").
 * - `notifyInstanceProp(instance, property, value)`: Called when
 *   an instance property changes.  Users may choose to call `notifyPath`
 *   on e.g. the owner to notify the change.
 * - `parentModel`: When `true`, events handled by declarative event listeners
 *   (`on-event="handler"`) will be decorated with a `model` property pointing
 *   to the template instance that stamped it.  It will also be returned
 *   from `instance.parentModel` in cases where template instance nesting
 *   causes an inner model to shadow an outer model.
 *
 * All callbacks are called bound to the `owner`. Any context
 * needed for the callbacks (such as references to `instances` stamped)
 * should be stored on the `owner` such that they can be retrieved via
 * `this`.
 *
 * When `options.forwardHostProp` is declared as an option, any properties
 * referenced in the template will be automatically forwarded from the host of
 * the `<template>` to instances, with the exception of any properties listed in
 * the `options.instanceProps` object.  `instanceProps` are assumed to be
 * managed by the owner of the instances, either passed into the constructor
 * or set after the fact.  Note, any properties passed into the constructor will
 * always be set to the instance (regardless of whether they would normally
 * be forwarded from the host).
 *
 * Note that `templatize()` can be run only once for a given `<template>`.
 * Further calls will result in an error. Also, there is a special
 * behavior if the template was duplicated through a mechanism such as
 * `<dom-repeat>` or `<test-fixture>`. In this case, all calls to
 * `templatize()` return the same class for all duplicates of a template.
 * The class returned from `templatize()` is generated only once using
 * the `options` from the first call. This means that any `options`
 * provided to subsequent calls will be ignored. Therefore, it is very
 * important not to close over any variables inside the callbacks. Also,
 * arrow functions must be avoided because they bind the outer `this`.
 * Inside the callbacks, any contextual information can be accessed
 * through `this`, which points to the `owner`.
 *
 * @param {!HTMLTemplateElement} template Template to templatize
 * @param {Polymer_PropertyEffects=} owner Owner of the template instances;
 *   any optional callbacks will be bound to this owner.
 * @param {Object=} options Options dictionary (see summary for details)
 * @return {function(new:TemplateInstanceBase, Object=)} Generated class bound
 *   to the template provided
 * @suppress {invalidCasts}
 */
function templatize(template, owner, options) {
  // Under strictTemplatePolicy, the templatized element must be owned
  // by a (trusted) Polymer element, indicated by existence of _methodHost;
  // e.g. for dom-if & dom-repeat in main document, _methodHost is null
  if (strictTemplatePolicy && !findMethodHost(template)) {
    throw new Error('strictTemplatePolicy: template owner not trusted');
  }
  options = /** @type {!TemplatizeOptions} */(options || {});
  if (template.__templatizeOwner) {
    throw new Error('A <template> can only be templatized once');
  }
  template.__templatizeOwner = owner;
  const ctor = owner ? owner.constructor : TemplateInstanceBase;
  let templateInfo = ctor._parseTemplate(template);
  // Get memoized base class for the prototypical template, which
  // includes property effects for binding template & forwarding
  /**
   * @constructor
   * @extends {TemplateInstanceBase}
   */
  let baseClass = templateInfo.templatizeInstanceClass;
  if (!baseClass) {
    baseClass = createTemplatizerClass(template, templateInfo, options);
    templateInfo.templatizeInstanceClass = baseClass;
  }
  const methodHost = findMethodHost(template);
  // Host property forwarding must be installed onto template instance
  addPropagateEffects(template, templateInfo, options, methodHost);
  // Subclass base class and add reference for this specific template
  /** @private */
  let klass = class TemplateInstance extends baseClass {};
  /** @override */
  klass.prototype._methodHost = methodHost;
  /** @override */
  klass.prototype.__dataHost = /** @type {!DataTemplate} */ (template);
  /** @override */
  klass.prototype.__templatizeOwner = /** @type {!Object} */ (owner);
  /** @override */
  klass.prototype.__hostProps = templateInfo.hostProps;
  klass = /** @type {function(new:TemplateInstanceBase)} */(klass); //eslint-disable-line no-self-assign
  return klass;
}

function warnOnUndeclaredProperties(templateInfo, options, methodHost) {
  const declaredProps = methodHost.constructor._properties;
  const {propertyEffects} = templateInfo;
  const {instanceProps} = options;
  for (let prop in propertyEffects) {
    // Ensure properties with template effects are declared on the outermost
    // host (`methodHost`), unless they are instance props or static functions
    if (!declaredProps[prop] && !(instanceProps && instanceProps[prop])) {
      const effects = propertyEffects[prop];
      for (let i=0; i<effects.length; i++) {
        const {part} = effects[i].info;
        if (!(part.signature && part.signature.static)) {
          console.warn(`Property '${prop}' used in template but not ` +
            `declared in 'properties'; attribute will not be observed.`);
          break;
        }
      }
    }
  }
}

/**
 * Returns the template "model" associated with a given element, which
 * serves as the binding scope for the template instance the element is
 * contained in. A template model is an instance of
 * `TemplateInstanceBase`, and should be used to manipulate data
 * associated with this template instance.
 *
 * Example:
 *
 *   let model = modelForElement(el);
 *   if (model.index < 10) {
 *     model.set('item.checked', true);
 *   }
 *
 * @param {HTMLElement} template The model will be returned for
 *   elements stamped from this template (accepts either an HTMLTemplateElement)
 *   or a `<dom-if>`/`<dom-repeat>` element when using `removeNestedTemplates`
 *   optimization.
 * @param {Node=} node Node for which to return a template model.
 * @return {TemplateInstanceBase} Template instance representing the
 *   binding scope for the element
 */
function modelForElement(template, node) {
  let model;
  while (node) {
    // An element with a __templatizeInstance marks the top boundary
    // of a scope; walk up until we find one, and then ensure that
    // its __dataHost matches `this`, meaning this dom-repeat stamped it
    if ((model = node.__dataHost ? node : node.__templatizeInstance)) {
      // Found an element stamped by another template; keep walking up
      // from its __dataHost
      if (model.__dataHost != template) {
        node = model.__dataHost;
      } else {
        return model;
      }
    } else {
      // Still in a template scope, keep going up until
      // a __templatizeInstance is found
      node = wrap(node).parentNode;
    }
  }
  return null;
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

let elementsHidden = false;

/**
 * @return {boolean} True if elements will be hidden globally
 */
function hideElementsGlobally() {
  if (legacyOptimizations && !useShadow) {
    if (!elementsHidden) {
      elementsHidden = true;
      const style = document.createElement('style');
      style.textContent = 'dom-bind,dom-if,dom-repeat{display:none;}';
      document.head.appendChild(style);
    }
    return true;
  }
  return false;
}

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * @constructor
 * @extends {HTMLElement}
 * @implements {Polymer_PropertyEffects}
 * @implements {Polymer_OptionalMutableData}
 * @implements {Polymer_GestureEventListeners}
 * @private
 */
const domBindBase =
  GestureEventListeners(
    OptionalMutableData(
      PropertyEffects(HTMLElement)));

/**
 * Custom element to allow using Polymer's template features (data binding,
 * declarative event listeners, etc.) in the main document without defining
 * a new custom element.
 *
 * `<template>` tags utilizing bindings may be wrapped with the `<dom-bind>`
 * element, which will immediately stamp the wrapped template into the main
 * document and bind elements to the `dom-bind` element itself as the
 * binding scope.
 *
 * @polymer
 * @customElement
 * @appliesMixin PropertyEffects
 * @appliesMixin OptionalMutableData
 * @appliesMixin GestureEventListeners
 * @extends {domBindBase}
 * @summary Custom element to allow using Polymer's template features (data
 *   binding, declarative event listeners, etc.) in the main document.
 */
class DomBind extends domBindBase {

  static get observedAttributes() { return ['mutable-data']; }

  constructor() {
    super();
    if (strictTemplatePolicy) {
      throw new Error(`strictTemplatePolicy: dom-bind not allowed`);
    }
    this.root = null;
    this.$ = null;
    this.__children = null;
  }

  /* eslint-disable no-unused-vars */
  /**
   * @override
   * @param {string} name Name of attribute that changed
   * @param {?string} old Old attribute value
   * @param {?string} value New attribute value
   * @param {?string} namespace Attribute namespace.
   * @return {void}
   */
  attributeChangedCallback(name, old, value, namespace) {
    // assumes only one observed attribute
    this.mutableData = true;
  }

  /**
   * @override
   * @return {void}
   */
  connectedCallback() {
    if (!hideElementsGlobally()) {
      this.style.display = 'none';
    }
    this.render();
  }

  /**
   * @override
   * @return {void}
   */
  disconnectedCallback() {
    this.__removeChildren();
  }

  __insertChildren() {
    wrap(wrap(this).parentNode).insertBefore(this.root, this);
  }

  __removeChildren() {
    if (this.__children) {
      for (let i=0; i<this.__children.length; i++) {
        this.root.appendChild(this.__children[i]);
      }
    }
  }

  /**
   * Forces the element to render its content. This is typically only
   * necessary to call if HTMLImports with the async attribute are used.
   * @return {void}
   */
  render() {
    let template;
    if (!this.__children) {
      template = /** @type {?HTMLTemplateElement} */(template || this.querySelector('template'));
      if (!template) {
        // Wait until childList changes and template should be there by then
        let observer = new MutationObserver(() => {
          template = /** @type {HTMLTemplateElement} */(this.querySelector('template'));
          if (template) {
            observer.disconnect();
            this.render();
          } else {
            throw new Error('dom-bind requires a <template> child');
          }
        });
        observer.observe(this, {childList: true});
        return;
      }
      this.root = this._stampTemplate(
        /** @type {!HTMLTemplateElement} */(template));
      this.$ = this.root.$;
      this.__children = [];
      for (let n=this.root.firstChild; n; n=n.nextSibling) {
        this.__children[this.__children.length] = n;
      }
      this._enableProperties();
    }
    this.__insertChildren();
    this.dispatchEvent(new CustomEvent('dom-change', {
      bubbles: true,
      composed: true
    }));
  }

}

customElements.define('dom-bind', DomBind);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * @constructor
 * @implements {Polymer_OptionalMutableData}
 * @extends {PolymerElement}
 * @private
 */
const domRepeatBase = OptionalMutableData(PolymerElement);

/**
 * The `<dom-repeat>` element will automatically stamp and binds one instance
 * of template content to each object in a user-provided array.
 * `dom-repeat` accepts an `items` property, and one instance of the template
 * is stamped for each item into the DOM at the location of the `dom-repeat`
 * element.  The `item` property will be set on each instance's binding
 * scope, thus templates should bind to sub-properties of `item`.
 *
 * Example:
 *
 * ```html
 * <dom-module id="employee-list">
 *
 *   <template>
 *
 *     <div> Employee list: </div>
 *     <dom-repeat items="{{employees}}">
 *       <template>
 *         <div>First name: <span>{{item.first}}</span></div>
 *         <div>Last name: <span>{{item.last}}</span></div>
 *       </template>
 *     </dom-repeat>
 *
 *   </template>
 *
 * </dom-module>
 * ```
 *
 * With the following custom element definition:
 *
 * ```js
 * class EmployeeList extends PolymerElement {
 *   static get is() { return 'employee-list'; }
 *   static get properties() {
 *     return {
 *       employees: {
 *         value() {
 *           return [
 *             {first: 'Bob', last: 'Smith'},
 *             {first: 'Sally', last: 'Johnson'},
 *             ...
 *           ];
 *         }
 *       }
 *     };
 *   }
 * }
 * ```
 *
 * Notifications for changes to items sub-properties will be forwarded to template
 * instances, which will update via the normal structured data notification system.
 *
 * Mutations to the `items` array itself should be made using the Array
 * mutation API's on the PropertyEffects mixin (`push`, `pop`, `splice`,
 * `shift`, `unshift`), and template instances will be kept in sync with the
 * data in the array.
 *
 * Events caught by event handlers within the `dom-repeat` template will be
 * decorated with a `model` property, which represents the binding scope for
 * each template instance.  The model should be used to manipulate data on the
 * instance, for example `event.model.set('item.checked', true);`.
 *
 * Alternatively, the model for a template instance for an element stamped by
 * a `dom-repeat` can be obtained using the `modelForElement` API on the
 * `dom-repeat` that stamped it, for example
 * `this.$.domRepeat.modelForElement(event.target).set('item.checked', true);`.
 * This may be useful for manipulating instance data of event targets obtained
 * by event handlers on parents of the `dom-repeat` (event delegation).
 *
 * A view-specific filter/sort may be applied to each `dom-repeat` by supplying a
 * `filter` and/or `sort` property.  This may be a string that names a function on
 * the host, or a function may be assigned to the property directly.  The functions
 * should implemented following the standard `Array` filter/sort API.
 *
 * In order to re-run the filter or sort functions based on changes to sub-fields
 * of `items`, the `observe` property may be set as a space-separated list of
 * `item` sub-fields that should cause a re-filter/sort when modified.  If
 * the filter or sort function depends on properties not contained in `items`,
 * the user should observe changes to those properties and call `render` to update
 * the view based on the dependency change.
 *
 * For example, for an `dom-repeat` with a filter of the following:
 *
 * ```js
 * isEngineer(item) {
 *   return item.type == 'engineer' || item.manager.type == 'engineer';
 * }
 * ```
 *
 * Then the `observe` property should be configured as follows:
 *
 * ```html
 * <dom-repeat items="{{employees}}" filter="isEngineer" observe="type manager.type">
 * ```
 *
 * @customElement
 * @polymer
 * @extends {domRepeatBase}
 * @appliesMixin OptionalMutableData
 * @summary Custom element for stamping instance of a template bound to
 *   items in an array.
 */
class DomRepeat extends domRepeatBase {

  // Not needed to find template; can be removed once the analyzer
  // can find the tag name from customElements.define call
  static get is() { return 'dom-repeat'; }

  static get template() { return null; }

  static get properties() {

    /**
     * Fired whenever DOM is added or removed by this template (by
     * default, rendering occurs lazily).  To force immediate rendering, call
     * `render`.
     *
     * @event dom-change
     */
    return {

      /**
       * An array containing items determining how many instances of the template
       * to stamp and that that each template instance should bind to.
       */
      items: {
        type: Array
      },

      /**
       * The name of the variable to add to the binding scope for the array
       * element associated with a given template instance.
       */
      as: {
        type: String,
        value: 'item'
      },

      /**
       * The name of the variable to add to the binding scope with the index
       * of the instance in the sorted and filtered list of rendered items.
       * Note, for the index in the `this.items` array, use the value of the
       * `itemsIndexAs` property.
       */
      indexAs: {
        type: String,
        value: 'index'
      },

      /**
       * The name of the variable to add to the binding scope with the index
       * of the instance in the `this.items` array. Note, for the index of
       * this instance in the sorted and filtered list of rendered items,
       * use the value of the `indexAs` property.
       */
      itemsIndexAs: {
        type: String,
        value: 'itemsIndex'
      },

      /**
       * A function that should determine the sort order of the items.  This
       * property should either be provided as a string, indicating a method
       * name on the element's host, or else be an actual function.  The
       * function should match the sort function passed to `Array.sort`.
       * Using a sort function has no effect on the underlying `items` array.
       */
      sort: {
        type: Function,
        observer: '__sortChanged'
      },

      /**
       * A function that can be used to filter items out of the view.  This
       * property should either be provided as a string, indicating a method
       * name on the element's host, or else be an actual function.  The
       * function should match the sort function passed to `Array.filter`.
       * Using a filter function has no effect on the underlying `items` array.
       */
      filter: {
        type: Function,
        observer: '__filterChanged'
      },

      /**
       * When using a `filter` or `sort` function, the `observe` property
       * should be set to a space-separated list of the names of item
       * sub-fields that should trigger a re-sort or re-filter when changed.
       * These should generally be fields of `item` that the sort or filter
       * function depends on.
       */
      observe: {
        type: String,
        observer: '__observeChanged'
      },

      /**
       * When using a `filter` or `sort` function, the `delay` property
       * determines a debounce time in ms after a change to observed item
       * properties that must pass before the filter or sort is re-run.
       * This is useful in rate-limiting shuffling of the view when
       * item changes may be frequent.
       */
      delay: Number,

      /**
       * Count of currently rendered items after `filter` (if any) has been applied.
       * If "chunking mode" is enabled, `renderedItemCount` is updated each time a
       * set of template instances is rendered.
       *
       */
      renderedItemCount: {
        type: Number,
        notify: !suppressTemplateNotifications,
        readOnly: true
      },

      /**
       * When greater than zero, defines an initial count of template instances
       * to render after setting the `items` array, before the next paint, and
       * puts the `dom-repeat` into "chunking mode".  The remaining items (and
       * any future items as a result of pushing onto the array) will be created
       * and rendered incrementally at each animation frame thereof until all
       * instances have been rendered.
       */
      initialCount: {
        type: Number
      },

      /**
       * When `initialCount` is used, this property defines a frame rate (in
       * fps) to target by throttling the number of instances rendered each
       * frame to not exceed the budget for the target frame rate.  The
       * framerate is effectively the number of `requestAnimationFrame`s that
       * it tries to allow to actually fire in a given second. It does this
       * by measuring the time between `rAF`s and continuously adjusting the
       * number of items created each `rAF` to maintain the target framerate.
       * Setting this to a higher number allows lower latency and higher
       * throughput for event handlers and other tasks, but results in a
       * longer time for the remaining items to complete rendering.
       */
      targetFramerate: {
        type: Number,
        value: 20
      },

      _targetFrameTime: {
        type: Number,
        computed: '__computeFrameTime(targetFramerate)'
      },

      /**
       * When the global `suppressTemplateNotifications` setting is used, setting
       * `notifyDomChange: true` will enable firing `dom-change` events on this
       * element.
       */
      notifyDomChange: {
        type: Boolean
      },

      /**
       * When chunking is enabled via `initialCount` and the `items` array is
       * set to a new array, this flag controls whether the previously rendered
       * instances are reused or not.
       *
       * When `true`, any previously rendered template instances are updated in
       * place to their new item values synchronously in one shot, and then any
       * further items (if any) are chunked out.  When `false`, the list is
       * returned back to its `initialCount` (any instances over the initial
       * count are discarded) and the remainder of the list is chunked back in.
       * Set this to `true` to avoid re-creating the list and losing scroll
       * position, although note that when changing the list to completely
       * different data the render thread will be blocked until all existing
       * instances are updated to their new data.
       */
      reuseChunkedInstances: {
        type: Boolean
      }

    };

  }

  static get observers() {
    return [ '__itemsChanged(items.*)' ];
  }

  constructor() {
    super();
    this.__instances = [];
    this.__renderDebouncer = null;
    this.__itemsIdxToInstIdx = {};
    this.__chunkCount = null;
    this.__renderStartTime = null;
    this.__itemsArrayChanged = false;
    this.__shouldMeasureChunk = false;
    this.__shouldContinueChunking = false;
    this.__chunkingId = 0;
    this.__sortFn = null;
    this.__filterFn = null;
    this.__observePaths = null;
    /** @type {?function(new:TemplateInstanceBase, Object=)} */
    this.__ctor = null;
    this.__isDetached = true;
    this.template = null;
    /** @type {TemplateInfo} */
    this._templateInfo;
  }

  /**
   * @override
   * @return {void}
   */
  disconnectedCallback() {
    super.disconnectedCallback();
    this.__isDetached = true;
    for (let i=0; i<this.__instances.length; i++) {
      this.__detachInstance(i);
    }
  }

  /**
   * @override
   * @return {void}
   */
  connectedCallback() {
    super.connectedCallback();
    if (!hideElementsGlobally()) {
      this.style.display = 'none';
    }
    // only perform attachment if the element was previously detached.
    if (this.__isDetached) {
      this.__isDetached = false;
      let wrappedParent = wrap(wrap(this).parentNode);
      for (let i=0; i<this.__instances.length; i++) {
        this.__attachInstance(i, wrappedParent);
      }
    }
  }

  __ensureTemplatized() {
    // Templatizing (generating the instance constructor) needs to wait
    // until ready, since won't have its template content handed back to
    // it until then
    if (!this.__ctor) {
      // When `removeNestedTemplates` is true, the "template" is the element
      // itself, which has been given a `_templateInfo` property
      const thisAsTemplate = /** @type {!HTMLTemplateElement} */ (
          /** @type {!HTMLElement} */ (this));
      let template = this.template = thisAsTemplate._templateInfo ?
          thisAsTemplate :
          /** @type {!HTMLTemplateElement} */ (this.querySelector('template'));
      if (!template) {
        // Wait until childList changes and template should be there by then
        let observer = new MutationObserver(() => {
          if (this.querySelector('template')) {
            observer.disconnect();
            this.__render();
          } else {
            throw new Error('dom-repeat requires a <template> child');
          }
        });
        observer.observe(this, {childList: true});
        return false;
      }
      // Template instance props that should be excluded from forwarding
      let instanceProps = {};
      instanceProps[this.as] = true;
      instanceProps[this.indexAs] = true;
      instanceProps[this.itemsIndexAs] = true;
      this.__ctor = templatize(template, this, {
        mutableData: this.mutableData,
        parentModel: true,
        instanceProps: instanceProps,
        /**
         * @this {DomRepeat}
         * @param {string} prop Property to set
         * @param {*} value Value to set property to
         */
        forwardHostProp: function(prop, value) {
          let i$ = this.__instances;
          for (let i=0, inst; (i<i$.length) && (inst=i$[i]); i++) {
            inst.forwardHostProp(prop, value);
          }
        },
        /**
         * @this {DomRepeat}
         * @param {Object} inst Instance to notify
         * @param {string} prop Property to notify
         * @param {*} value Value to notify
         */
        notifyInstanceProp: function(inst, prop, value) {
          if (matches(this.as, prop)) {
            let idx = inst[this.itemsIndexAs];
            if (prop == this.as) {
              this.items[idx] = value;
            }
            let path = translate(this.as, `${JSCompiler_renameProperty('items', this)}.${idx}`, prop);
            this.notifyPath(path, value);
          }
        }
      });
    }
    return true;
  }

  __getMethodHost() {
    // Technically this should be the owner of the outermost template.
    // In shadow dom, this is always getRootNode().host, but we can
    // approximate this via cooperation with our dataHost always setting
    // `_methodHost` as long as there were bindings (or id's) on this
    // instance causing it to get a dataHost.
    return this.__dataHost._methodHost || this.__dataHost;
  }

  __functionFromPropertyValue(functionOrMethodName) {
    if (typeof functionOrMethodName === 'string') {
      let methodName = functionOrMethodName;
      let obj = this.__getMethodHost();
      return function() { return obj[methodName].apply(obj, arguments); };
    }

    return functionOrMethodName;
  }

  __sortChanged(sort) {
    this.__sortFn = this.__functionFromPropertyValue(sort);
    if (this.items) { this.__debounceRender(this.__render); }
  }

  __filterChanged(filter) {
    this.__filterFn = this.__functionFromPropertyValue(filter);
    if (this.items) { this.__debounceRender(this.__render); }
  }

  __computeFrameTime(rate) {
    return Math.ceil(1000/rate);
  }

  __observeChanged() {
    this.__observePaths = this.observe &&
      this.observe.replace('.*', '.').split(' ');
  }

  __handleObservedPaths(path) {
    // Handle cases where path changes should cause a re-sort/filter
    if (this.__sortFn || this.__filterFn) {
      if (!path) {
        // Always re-render if the item itself changed
        this.__debounceRender(this.__render, this.delay);
      } else if (this.__observePaths) {
        // Otherwise, re-render if the path changed matches an observed path
        let paths = this.__observePaths;
        for (let i=0; i<paths.length; i++) {
          if (path.indexOf(paths[i]) === 0) {
            this.__debounceRender(this.__render, this.delay);
          }
        }
      }
    }
  }

  __itemsChanged(change) {
    if (this.items && !Array.isArray(this.items)) {
      console.warn('dom-repeat expected array for `items`, found', this.items);
    }
    // If path was to an item (e.g. 'items.3' or 'items.3.foo'), forward the
    // path to that instance synchronously (returns false for non-item paths)
    if (!this.__handleItemPath(change.path, change.value)) {
      // Otherwise, the array was reset ('items') or spliced ('items.splices'),
      // so queue a render.  Restart chunking when the items changed (for
      // backward compatibility), unless `reuseChunkedInstances` option is set
      if (change.path === 'items') {
        this.__itemsArrayChanged = true;
      }
      this.__debounceRender(this.__render);
    }
  }

  /**
   * @param {function(this:DomRepeat)} fn Function to debounce.
   * @param {number=} delay Delay in ms to debounce by.
   */
  __debounceRender(fn, delay = 0) {
    this.__renderDebouncer = Debouncer.debounce(
          this.__renderDebouncer
        , delay > 0 ? timeOut.after(delay) : microTask
        , fn.bind(this));
    enqueueDebouncer(this.__renderDebouncer);
  }

  /**
   * Forces the element to render its content. Normally rendering is
   * asynchronous to a provoking change. This is done for efficiency so
   * that multiple changes trigger only a single render. The render method
   * should be called if, for example, template rendering is required to
   * validate application state.
   * @return {void}
   */
  render() {
    // Queue this repeater, then flush all in order
    this.__debounceRender(this.__render);
    flush();
  }

  __render() {
    if (!this.__ensureTemplatized()) {
      // No template found yet
      return;
    }
    let items = this.items || [];
    // Sort and filter the items into a mapping array from instance->item
    const isntIdxToItemsIdx = this.__sortAndFilterItems(items);
    // If we're chunking, increase the limit if there are new instances to
    // create and schedule the next chunk
    const limit = this.__calculateLimit(isntIdxToItemsIdx.length);
    // Create, update, and/or remove instances
    this.__updateInstances(items, limit, isntIdxToItemsIdx);
    // If we're chunking, schedule a rAF task to measure/continue chunking.     
    // Do this before any notifying events (renderedItemCount & dom-change)
    // since those could modify items and enqueue a new full render which will
    // pre-empt this measurement.
    if (this.initialCount &&
       (this.__shouldMeasureChunk || this.__shouldContinueChunking)) {
      cancelAnimationFrame(this.__chunkingId);
      this.__chunkingId = requestAnimationFrame(() => this.__continueChunking());
    }
    // Set rendered item count
    this._setRenderedItemCount(this.__instances.length);
    // Notify users
    if (!suppressTemplateNotifications || this.notifyDomChange) {
      this.dispatchEvent(new CustomEvent('dom-change', {
        bubbles: true,
        composed: true
      }));
    }
  }

  __sortAndFilterItems(items) {
    // Generate array maping the instance index to the items array index
    let isntIdxToItemsIdx = new Array(items.length);
    for (let i=0; i<items.length; i++) {
      isntIdxToItemsIdx[i] = i;
    }
    // Apply user filter
    if (this.__filterFn) {
      isntIdxToItemsIdx = isntIdxToItemsIdx.filter((i, idx, array) =>
        this.__filterFn(items[i], idx, array));
    }
    // Apply user sort
    if (this.__sortFn) {
      isntIdxToItemsIdx.sort((a, b) => this.__sortFn(items[a], items[b]));
    }
    return isntIdxToItemsIdx;
  }

  __calculateLimit(filteredItemCount) {
    let limit = filteredItemCount;
    const currentCount = this.__instances.length;
    // When chunking, we increase the limit from the currently rendered count
    // by the chunk count that is re-calculated after each rAF (with special
    // cases for reseting the limit to initialCount after changing items)
    if (this.initialCount) {
      let newCount;
      if (!this.__chunkCount ||
        (this.__itemsArrayChanged && !this.reuseChunkedInstances)) {
        // Limit next render to the initial count
        limit = Math.min(filteredItemCount, this.initialCount);
        // Subtract off any existing instances to determine the number of
        // instances that will be created
        newCount = Math.max(limit - currentCount, 0);
        // Initialize the chunk size with how many items we're creating
        this.__chunkCount = newCount || 1;
      } else {
        // The number of new instances that will be created is based on the
        // existing instances, the new list size, and the chunk size
        newCount = Math.min(
          Math.max(filteredItemCount - currentCount, 0), 
          this.__chunkCount);
        // Update the limit based on how many new items we're making, limited
        // buy the total size of the list
        limit = Math.min(currentCount + newCount, filteredItemCount);
      }
      // Record some state about chunking for use in `__continueChunking`
      this.__shouldMeasureChunk = newCount === this.__chunkCount;
      this.__shouldContinueChunking = limit < filteredItemCount;
      this.__renderStartTime = performance.now();
    }
    this.__itemsArrayChanged = false;
    return limit;
  }

  __continueChunking() {
    // Simple auto chunkSize throttling algorithm based on feedback loop:
    // measure actual time between frames and scale chunk count by ratio of
    // target/actual frame time.  Only modify chunk size if our measurement
    // reflects the cost of a creating a full chunk's worth of instances; this
    // avoids scaling up the chunk size if we e.g. quickly re-rendered instances
    // in place
    if (this.__shouldMeasureChunk) {
      const renderTime = performance.now() - this.__renderStartTime;
      const ratio = this._targetFrameTime / renderTime;
      this.__chunkCount = Math.round(this.__chunkCount * ratio) || 1;
    }
    // Enqueue a new render if we haven't reached the full size of the list
    if (this.__shouldContinueChunking) {
      this.__debounceRender(this.__render);
    }
  }
  
  __updateInstances(items, limit, isntIdxToItemsIdx) {
    // items->inst map kept for item path forwarding
    const itemsIdxToInstIdx = this.__itemsIdxToInstIdx = {};
    let instIdx;
    // Generate instances and assign items
    for (instIdx=0; instIdx<limit; instIdx++) {
      let inst = this.__instances[instIdx];
      let itemIdx = isntIdxToItemsIdx[instIdx];
      let item = items[itemIdx];
      itemsIdxToInstIdx[itemIdx] = instIdx;
      if (inst) {
        inst._setPendingProperty(this.as, item);
        inst._setPendingProperty(this.indexAs, instIdx);
        inst._setPendingProperty(this.itemsIndexAs, itemIdx);
        inst._flushProperties();
      } else {
        this.__insertInstance(item, instIdx, itemIdx);
      }
    }
    // Remove any extra instances from previous state
    for (let i=this.__instances.length-1; i>=instIdx; i--) {
      this.__detachAndRemoveInstance(i);
    }
  }

  __detachInstance(idx) {
    let inst = this.__instances[idx];
    const wrappedRoot = wrap(inst.root);
    for (let i=0; i<inst.children.length; i++) {
      let el = inst.children[i];
      wrappedRoot.appendChild(el);
    }
    return inst;
  }

  __attachInstance(idx, parent) {
    let inst = this.__instances[idx];
    // Note, this is pre-wrapped as an optimization
    parent.insertBefore(inst.root, this);
  }

  __detachAndRemoveInstance(idx) {
    this.__detachInstance(idx);
    this.__instances.splice(idx, 1);
  }

  __stampInstance(item, instIdx, itemIdx) {
    let model = {};
    model[this.as] = item;
    model[this.indexAs] = instIdx;
    model[this.itemsIndexAs] = itemIdx;
    return new this.__ctor(model);
  }

  __insertInstance(item, instIdx, itemIdx) {
    const inst = this.__stampInstance(item, instIdx, itemIdx);
    let beforeRow = this.__instances[instIdx + 1];
    let beforeNode = beforeRow ? beforeRow.children[0] : this;
    wrap(wrap(this).parentNode).insertBefore(inst.root, beforeNode);
    this.__instances[instIdx] = inst;
    return inst;
  }

  // Implements extension point from Templatize mixin
  /**
   * Shows or hides the template instance top level child elements. For
   * text nodes, `textContent` is removed while "hidden" and replaced when
   * "shown."
   * @param {boolean} hidden Set to true to hide the children;
   * set to false to show them.
   * @return {void}
   * @protected
   */
  _showHideChildren(hidden) {
    for (let i=0; i<this.__instances.length; i++) {
      this.__instances[i]._showHideChildren(hidden);
    }
  }

  // Called as a side effect of a host items.<key>.<path> path change,
  // responsible for notifying item.<path> changes to inst for key
  __handleItemPath(path, value) {
    let itemsPath = path.slice(6); // 'items.'.length == 6
    let dot = itemsPath.indexOf('.');
    let itemsIdx = dot < 0 ? itemsPath : itemsPath.substring(0, dot);
    // If path was index into array...
    if (itemsIdx == parseInt(itemsIdx, 10)) {
      let itemSubPath = dot < 0 ? '' : itemsPath.substring(dot+1);
      // If the path is observed, it will trigger a full refresh
      this.__handleObservedPaths(itemSubPath);
      // Note, even if a rull refresh is triggered, always do the path
      // notification because unless mutableData is used for dom-repeat
      // and all elements in the instance subtree, a full refresh may
      // not trigger the proper update.
      let instIdx = this.__itemsIdxToInstIdx[itemsIdx];
      let inst = this.__instances[instIdx];
      if (inst) {
        let itemPath = this.as + (itemSubPath ? '.' + itemSubPath : '');
        // This is effectively `notifyPath`, but avoids some of the overhead
        // of the public API
        inst._setPendingPropertyOrPath(itemPath, value, false, true);
        inst._flushProperties();
      }
      return true;
    }
  }

  /**
   * Returns the item associated with a given element stamped by
   * this `dom-repeat`.
   *
   * Note, to modify sub-properties of the item,
   * `modelForElement(el).set('item.<sub-prop>', value)`
   * should be used.
   *
   * @param {!HTMLElement} el Element for which to return the item.
   * @return {*} Item associated with the element.
   */
  itemForElement(el) {
    let instance = this.modelForElement(el);
    return instance && instance[this.as];
  }

  /**
   * Returns the inst index for a given element stamped by this `dom-repeat`.
   * If `sort` is provided, the index will reflect the sorted order (rather
   * than the original array order).
   *
   * @param {!HTMLElement} el Element for which to return the index.
   * @return {?number} Row index associated with the element (note this may
   *   not correspond to the array index if a user `sort` is applied).
   */
  indexForElement(el) {
    let instance = this.modelForElement(el);
    return instance && instance[this.indexAs];
  }

  /**
   * Returns the template "model" associated with a given element, which
   * serves as the binding scope for the template instance the element is
   * contained in. A template model
   * should be used to manipulate data associated with this template instance.
   *
   * Example:
   *
   *   let model = modelForElement(el);
   *   if (model.index < 10) {
   *     model.set('item.checked', true);
   *   }
   *
   * @param {!HTMLElement} el Element for which to return a template model.
   * @return {TemplateInstanceBase} Model representing the binding scope for
   *   the element.
   */
  modelForElement(el) {
    return modelForElement(this.template, el);
  }

}

customElements.define(DomRepeat.is, DomRepeat);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * @customElement
 * @polymer
 * @extends PolymerElement
 * @summary Base class for dom-if element; subclassed into concrete
 *   implementation.
 */
class DomIfBase extends PolymerElement {

  // Not needed to find template; can be removed once the analyzer
  // can find the tag name from customElements.define call
  static get is() { return 'dom-if'; }

  static get template() { return null; }

  static get properties() {

    return {

      /**
       * Fired whenever DOM is added or removed/hidden by this template (by
       * default, rendering occurs lazily).  To force immediate rendering, call
       * `render`.
       *
       * @event dom-change
       */

      /**
       * A boolean indicating whether this template should stamp.
       */
      if: {
        type: Boolean,
        observer: '__debounceRender'
      },

      /**
       * When true, elements will be removed from DOM and discarded when `if`
       * becomes false and re-created and added back to the DOM when `if`
       * becomes true.  By default, stamped elements will be hidden but left
       * in the DOM when `if` becomes false, which is generally results
       * in better performance.
       */
      restamp: {
        type: Boolean,
        observer: '__debounceRender'
      },

      /**
       * When the global `suppressTemplateNotifications` setting is used, setting
       * `notifyDomChange: true` will enable firing `dom-change` events on this
       * element.
       */
      notifyDomChange: {
        type: Boolean
      }
    };

  }

  constructor() {
    super();
    this.__renderDebouncer = null;
    this._lastIf = false;
    this.__hideTemplateChildren__ = false;
    /** @type {!HTMLTemplateElement|undefined} */
    this.__template;
    /** @type {!TemplateInfo|undefined} */
    this._templateInfo;
  }

  __debounceRender() {
    // Render is async for 2 reasons:
    // 1. To eliminate dom creation trashing if user code thrashes `if` in the
    //    same turn. This was more common in 1.x where a compound computed
    //    property could result in the result changing multiple times, but is
    //    mitigated to a large extent by batched property processing in 2.x.
    // 2. To avoid double object propagation when a bag including values bound
    //    to the `if` property as well as one or more hostProps could enqueue
    //    the <dom-if> to flush before the <template>'s host property
    //    forwarding. In that scenario creating an instance would result in
    //    the host props being set once, and then the enqueued changes on the
    //    template would set properties a second time, potentially causing an
    //    object to be set to an instance more than once.  Creating the
    //    instance async from flushing data ensures this doesn't happen. If
    //    we wanted a sync option in the future, simply having <dom-if> flush
    //    (or clear) its template's pending host properties before creating
    //    the instance would also avoid the problem.
    this.__renderDebouncer = Debouncer.debounce(
          this.__renderDebouncer
        , microTask
        , () => this.__render());
    enqueueDebouncer(this.__renderDebouncer);
  }

  /**
   * @override
   * @return {void}
   */
  disconnectedCallback() {
    super.disconnectedCallback();
    const parent = wrap(this).parentNode;
    if (!parent || (parent.nodeType == Node.DOCUMENT_FRAGMENT_NODE &&
        !wrap(parent).host)) {
      this.__teardownInstance();
    }
  }

  /**
   * @override
   * @return {void}
   */
  connectedCallback() {
    super.connectedCallback();
    if (!hideElementsGlobally()) {
      this.style.display = 'none';
    }
    if (this.if) {
      this.__debounceRender();
    }
  }

  /**
   * Ensures a template has been assigned to `this.__template`.  If it has not
   * yet been, it querySelectors for it in its children and if it does not yet
   * exist (e.g. in parser-generated case), opens a mutation observer and
   * waits for it to appear (returns false if it has not yet been found,
   * otherwise true).  In the `removeNestedTemplates` case, the "template" will
   * be the `dom-if` element itself.
   *
   * @return {boolean} True when a template has been found, false otherwise
   */
  __ensureTemplate() {
    if (!this.__template) {
      // When `removeNestedTemplates` is true, the "template" is the element
      // itself, which has been given a `_templateInfo` property
      const thisAsTemplate = /** @type {!HTMLTemplateElement} */ (
          /** @type {!HTMLElement} */ (this));
      let template = thisAsTemplate._templateInfo ?
          thisAsTemplate :
          /** @type {!HTMLTemplateElement} */
          (wrap(thisAsTemplate).querySelector('template'));
      if (!template) {
        // Wait until childList changes and template should be there by then
        let observer = new MutationObserver(() => {
          if (wrap(this).querySelector('template')) {
            observer.disconnect();
            this.__render();
          } else {
            throw new Error('dom-if requires a <template> child');
          }
        });
        observer.observe(this, {childList: true});
        return false;
      }
      this.__template = template;
    }
    return true;
  }

  /**
   * Ensures a an instance of the template has been created and inserted. This
   * method may return false if the template has not yet been found or if
   * there is no `parentNode` to insert the template into (in either case,
   * connection or the template-finding mutation observer firing will queue
   * another render, causing this method to be called again at a more
   * appropriate time).
   *
   * Subclasses should implement the following methods called here:
   * - `__hasInstance`
   * - `__createAndInsertInstance`
   * - `__getInstanceNodes`
   *
   * @return {boolean} True if the instance was created, false otherwise.
   */
  __ensureInstance() {
    let parentNode = wrap(this).parentNode;
    if (!this.__hasInstance()) {
      // Guard against element being detached while render was queued
      if (!parentNode) {
        return false;
      }
      // Find the template (when false, there was no template yet)
      if (!this.__ensureTemplate()) {
        return false;
      }
      this.__createAndInsertInstance(parentNode);
    } else {
      // Move instance children if necessary
      let children = this.__getInstanceNodes();
      if (children && children.length) {
        // Detect case where dom-if was re-attached in new position
        let lastChild = wrap(this).previousSibling;
        if (lastChild !== children[children.length-1]) {
          for (let i=0, n; (i<children.length) && (n=children[i]); i++) {
            wrap(parentNode).insertBefore(n, this);
          }
        }
      }
    }
    return true;
  }

  /**
   * Forces the element to render its content. Normally rendering is
   * asynchronous to a provoking change. This is done for efficiency so
   * that multiple changes trigger only a single render. The render method
   * should be called if, for example, template rendering is required to
   * validate application state.
   *
   * @return {void}
   */
  render() {
    flush();
  }

  /**
   * Performs the key rendering steps:
   * 1. Ensure a template instance has been stamped (when true)
   * 2. Remove the template instance (when false and restamp:true)
   * 3. Sync the hidden state of the instance nodes with the if/restamp state
   * 4. Fires the `dom-change` event when necessary
   *
   * @return {void}
   */
  __render() {
    if (this.if) {
      if (!this.__ensureInstance()) {
        // No template found yet
        return;
      }
    } else if (this.restamp) {
      this.__teardownInstance();
    }
    this._showHideChildren();
    if ((!suppressTemplateNotifications || this.notifyDomChange)
        && this.if != this._lastIf) {
      this.dispatchEvent(new CustomEvent('dom-change', {
        bubbles: true,
        composed: true
      }));
      this._lastIf = this.if;
    }
  }

  // Ideally these would be annotated as abstract methods in an abstract class,
  // but closure compiler is finnicky
  /* eslint-disable valid-jsdoc */
  /**
   * Abstract API to be implemented by subclass: Returns true if a template
   * instance has been created and inserted.
   *
   * @protected
   * @return {boolean} True when an instance has been created.
   */
  __hasInstance() { }

  /**
   * Abstract API to be implemented by subclass: Returns the child nodes stamped
   * from a template instance.
   *
   * @protected
   * @return {Array<Node>} Array of child nodes stamped from the template
   * instance.
   */
  __getInstanceNodes() { }

  /**
   * Abstract API to be implemented by subclass: Creates an instance of the
   * template and inserts it into the given parent node.
   *
   * @protected
   * @param {Node} parentNode The parent node to insert the instance into
   * @return {void}
   */
  __createAndInsertInstance(parentNode) { } // eslint-disable-line no-unused-vars

  /**
   * Abstract API to be implemented by subclass: Removes nodes created by an
   * instance of a template and any associated cleanup.
   *
   * @protected
   * @return {void}
   */
  __teardownInstance() { }

  /**
   * Abstract API to be implemented by subclass: Shows or hides any template
   * instance childNodes based on the `if` state of the element and its
   * `__hideTemplateChildren__` property.
   *
   * @protected
   * @return {void}
   */
  _showHideChildren() { }
  /* eslint-enable valid-jsdoc */
}

/**
 * The version of DomIf used when `fastDomIf` setting is in use, which is
 * optimized for first-render (but adds a tax to all subsequent property updates
 * on the host, whether they were used in a given `dom-if` or not).
 *
 * This implementation avoids use of `Templatizer`, which introduces a new scope
 * (a non-element PropertyEffects instance), which is not strictly necessary
 * since `dom-if` never introduces new properties to its scope (unlike
 * `dom-repeat`). Taking advantage of this fact, the `dom-if` reaches up to its
 * `__dataHost` and stamps the template directly from the host using the host's
 * runtime `_stampTemplate` API, which binds the property effects of the
 * template directly to the host. This both avoids the intermediary
 * `Templatizer` instance, but also avoids the need to bind host properties to
 * the `<template>` element and forward those into the template instance.
 *
 * In this version of `dom-if`, the `this.__instance` method is the
 * `DocumentFragment` returned from `_stampTemplate`, which also serves as the
 * handle for later removing it using the `_removeBoundDom` method.
 */
class DomIfFast extends DomIfBase {

  constructor() {
    super();
    this.__instance = null;
    this.__syncInfo = null;
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * @override
   * @return {boolean} True when an instance has been created.
   */
  __hasInstance() {
    return Boolean(this.__instance);
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * @override
   * @return {Array<Node>} Array of child nodes stamped from the template
   * instance.
   */
  __getInstanceNodes() {
    return this.__instance.templateInfo.childNodes;
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * Stamps the template by calling `_stampTemplate` on the `__dataHost` of this
   * element and then inserts the resulting nodes into the given `parentNode`.
   *
   * @override
   * @param {Node} parentNode The parent node to insert the instance into
   * @return {void}
   */
  __createAndInsertInstance(parentNode) {
    const host = this.__dataHost || this;
    if (strictTemplatePolicy) {
      if (!this.__dataHost) {
        throw new Error('strictTemplatePolicy: template owner not trusted');
      }
    }
    // Pre-bind and link the template into the effects system
    const templateInfo = host._bindTemplate(
        /** @type {!HTMLTemplateElement} */ (this.__template), true);
    // Install runEffects hook that prevents running property effects
    // (and any nested template effects) when the `if` is false
    templateInfo.runEffects = (runEffects, changedProps, hasPaths) => {
      let syncInfo = this.__syncInfo;
      if (this.if) {
        // Mix any props that changed while the `if` was false into `changedProps`
        if (syncInfo) {
          // If there were properties received while the `if` was false, it is
          // important to sync the hidden state with the element _first_, so that
          // new bindings to e.g. `textContent` do not get stomped on by
          // pre-hidden values if `_showHideChildren` were to be called later at
          // the next render. Clearing `__invalidProps` here ensures
          // `_showHideChildren`'s call to `__syncHostProperties` no-ops, so
          // that we don't call `runEffects` more often than necessary.
          this.__syncInfo = null;
          this._showHideChildren();
          changedProps = Object.assign(syncInfo.changedProps, changedProps);
        }
        runEffects(changedProps, hasPaths);
      } else {
        // Accumulate any values changed while `if` was false, along with the
        // runEffects method to sync them, so that we can replay them once `if`
        // becomes true
        if (this.__instance) {
          if (!syncInfo) {
            syncInfo = this.__syncInfo = { runEffects, changedProps: {} };
          }
          if (hasPaths) {
            // Store root object of any paths; this will ensure direct bindings
            // like [[obj.foo]] bindings run after a `set('obj.foo', v)`, but
            // note that path notifications like `set('obj.foo.bar', v)` will
            // not propagate. Since batched path notifications are not
            // supported, we cannot simply accumulate path notifications. This
            // is equivalent to the non-fastDomIf case, which stores root(p) in
            // __invalidProps.
            for (const p in changedProps) {
              const rootProp = root(p);
              syncInfo.changedProps[rootProp] = this.__dataHost[rootProp];
            }
          } else {
            Object.assign(syncInfo.changedProps, changedProps);
          }
        }
      }
    };
    // Stamp the template, and set its DocumentFragment to the "instance"
    this.__instance = host._stampTemplate(
        /** @type {!HTMLTemplateElement} */ (this.__template), templateInfo);
    wrap(parentNode).insertBefore(this.__instance, this);
  }

  /**
   * Run effects for any properties that changed while the `if` was false.
   *
   * @return {void}
   */
  __syncHostProperties() {
    const syncInfo = this.__syncInfo;
    if (syncInfo) {
      this.__syncInfo = null;
      syncInfo.runEffects(syncInfo.changedProps, false);
    }
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * Remove the instance and any nodes it created.  Uses the `__dataHost`'s
   * runtime `_removeBoundDom` method.
   *
   * @override
   * @return {void}
   */
  __teardownInstance() {
    const host = this.__dataHost || this;
    if (this.__instance) {
      host._removeBoundDom(this.__instance);
      this.__instance = null;
      this.__syncInfo = null;
    }
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * Shows or hides the template instance top level child nodes. For
   * text nodes, `textContent` is removed while "hidden" and replaced when
   * "shown."
   *
   * @override
   * @return {void}
   * @protected
   * @suppress {visibility}
   */
  _showHideChildren() {
    const hidden = this.__hideTemplateChildren__ || !this.if;
    if (this.__instance && Boolean(this.__instance.__hidden) !== hidden) {
      this.__instance.__hidden = hidden;
      showHideChildren(hidden, this.__instance.templateInfo.childNodes);
    }
    if (!hidden) {
      this.__syncHostProperties();
    }
  }
}

/**
 * The "legacy" implementation of `dom-if`, implemented using `Templatizer`.
 *
 * In this version, `this.__instance` is the `TemplateInstance` returned
 * from the templatized constructor.
 */
class DomIfLegacy extends DomIfBase {

  constructor() {
    super();
    this.__ctor = null;
    this.__instance = null;
    this.__invalidProps = null;
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * @override
   * @return {boolean} True when an instance has been created.
   */
  __hasInstance() {
    return Boolean(this.__instance);
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * @override
   * @return {Array<Node>} Array of child nodes stamped from the template
   * instance.
   */
  __getInstanceNodes() {
    return this.__instance.children;
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * Stamps the template by creating a new instance of the templatized
   * constructor (which is created lazily if it does not yet exist), and then
   * inserts its resulting `root` doc fragment into the given `parentNode`.
   *
   * @override
   * @param {Node} parentNode The parent node to insert the instance into
   * @return {void}
   */
  __createAndInsertInstance(parentNode) {
    // Ensure we have an instance constructor
    if (!this.__ctor) {
      this.__ctor = templatize(
          /** @type {!HTMLTemplateElement} */ (this.__template), this, {
            // dom-if templatizer instances require `mutable: true`, as
            // `__syncHostProperties` relies on that behavior to sync objects
            mutableData: true,
            /**
             * @param {string} prop Property to forward
             * @param {*} value Value of property
             * @this {DomIfLegacy}
             */
            forwardHostProp: function(prop, value) {
              if (this.__instance) {
                if (this.if) {
                  this.__instance.forwardHostProp(prop, value);
                } else {
                  // If we have an instance but are squelching host property
                  // forwarding due to if being false, note the invalidated
                  // properties so `__syncHostProperties` can sync them the next
                  // time `if` becomes true
                  this.__invalidProps =
                      this.__invalidProps || Object.create(null);
                  this.__invalidProps[root(prop)] = true;
                }
              }
            }
          });
    }
    // Create and insert the instance
    this.__instance = new this.__ctor();
    wrap(parentNode).insertBefore(this.__instance.root, this);
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * Removes the instance and any nodes it created.
   *
   * @override
   * @return {void}
   */
  __teardownInstance() {
    if (this.__instance) {
      let c$ = this.__instance.children;
      if (c$ && c$.length) {
        // use first child parent, for case when dom-if may have been detached
        let parent = wrap(c$[0]).parentNode;
        // Instance children may be disconnected from parents when dom-if
        // detaches if a tree was innerHTML'ed
        if (parent) {
          parent = wrap(parent);
          for (let i=0, n; (i<c$.length) && (n=c$[i]); i++) {
            parent.removeChild(n);
          }
        }
      }
      this.__invalidProps = null;
      this.__instance = null;
    }
  }

  /**
   * Forwards any properties that changed while the `if` was false into the
   * template instance and flushes it.
   *
   * @return {void}
   */
  __syncHostProperties() {
    let props = this.__invalidProps;
    if (props) {
      this.__invalidProps = null;
      for (let prop in props) {
        this.__instance._setPendingProperty(prop, this.__dataHost[prop]);
      }
      this.__instance._flushProperties();
    }
  }

  /**
   * Implementation of abstract API needed by DomIfBase.
   *
   * Shows or hides the template instance top level child elements. For
   * text nodes, `textContent` is removed while "hidden" and replaced when
   * "shown."
   *
   * @override
   * @protected
   * @return {void}
   * @suppress {visibility}
   */
  _showHideChildren() {
    const hidden = this.__hideTemplateChildren__ || !this.if;
    if (this.__instance && Boolean(this.__instance.__hidden) !== hidden) {
      this.__instance.__hidden = hidden;
      this.__instance._showHideChildren(hidden);
    }
    if (!hidden) {
      this.__syncHostProperties();
    }
  }
}

/**
 * The `<dom-if>` element will stamp a light-dom `<template>` child when
 * the `if` property becomes truthy, and the template can use Polymer
 * data-binding and declarative event features when used in the context of
 * a Polymer element's template.
 *
 * When `if` becomes falsy, the stamped content is hidden but not
 * removed from dom. When `if` subsequently becomes truthy again, the content
 * is simply re-shown. This approach is used due to its favorable performance
 * characteristics: the expense of creating template content is paid only
 * once and lazily.
 *
 * Set the `restamp` property to true to force the stamped content to be
 * created / destroyed when the `if` condition changes.
 *
 * @customElement
 * @polymer
 * @extends DomIfBase
 * @constructor
 * @summary Custom element that conditionally stamps and hides or removes
 *   template content based on a boolean flag.
 */
const DomIf = fastDomIf ? DomIfFast : DomIfLegacy;

customElements.define(DomIf.is, DomIf);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Element mixin for recording dynamic associations between item paths in a
 * master `items` array and a `selected` array such that path changes to the
 * master array (at the host) element or elsewhere via data-binding) are
 * correctly propagated to items in the selected array and vice-versa.
 *
 * The `items` property accepts an array of user data, and via the
 * `select(item)` and `deselect(item)` API, updates the `selected` property
 * which may be bound to other parts of the application, and any changes to
 * sub-fields of `selected` item(s) will be kept in sync with items in the
 * `items` array.  When `multi` is false, `selected` is a property
 * representing the last selected item.  When `multi` is true, `selected`
 * is an array of multiply selected items.
 *
 * @polymer
 * @mixinFunction
 * @appliesMixin ElementMixin
 * @summary Element mixin for recording dynamic associations between item paths in a
 * master `items` array and a `selected` array
 */
let ArraySelectorMixin = dedupingMixin(superClass => {

  /**
   * @constructor
   * @implements {Polymer_ElementMixin}
   * @private
   */
  let elementBase = ElementMixin(superClass);

  /**
   * @polymer
   * @mixinClass
   * @implements {Polymer_ArraySelectorMixin}
   * @unrestricted
   */
  class ArraySelectorMixin extends elementBase {

    static get properties() {
      return {

        /**
         * An array containing items from which selection will be made.
         */
        items: {
          type: Array,
        },

        /**
         * When `true`, multiple items may be selected at once (in this case,
         * `selected` is an array of currently selected items).  When `false`,
         * only one item may be selected at a time.
         */
        multi: {
          type: Boolean,
          value: false,
        },

        /**
         * When `multi` is true, this is an array that contains any selected.
         * When `multi` is false, this is the currently selected item, or `null`
         * if no item is selected.
         * @type {?Object|?Array<!Object>}
         */
        selected: {type: Object, notify: true},

        /**
         * When `multi` is false, this is the currently selected item, or `null`
         * if no item is selected.
         * @type {?Object}
         */
        selectedItem: {type: Object, notify: true},

        /**
         * When `true`, calling `select` on an item that is already selected
         * will deselect the item.
         */
        toggle: {type: Boolean, value: false}

      };
    }

    static get observers() {
      return ['__updateSelection(multi, items.*)'];
    }

    constructor() {
      super();
      this.__lastItems = null;
      this.__lastMulti = null;
      this.__selectedMap = null;
    }

    __updateSelection(multi, itemsInfo) {
      let path = itemsInfo.path;
      if (path == JSCompiler_renameProperty('items', this)) {
        // Case 1 - items array changed, so diff against previous array and
        // deselect any removed items and adjust selected indices
        let newItems = itemsInfo.base || [];
        let lastItems = this.__lastItems;
        let lastMulti = this.__lastMulti;
        if (multi !== lastMulti) {
          this.clearSelection();
        }
        if (lastItems) {
          let splices = calculateSplices(newItems, lastItems);
          this.__applySplices(splices);
        }
        this.__lastItems = newItems;
        this.__lastMulti = multi;
      } else if (itemsInfo.path == `${JSCompiler_renameProperty('items', this)}.splices`) {
        // Case 2 - got specific splice information describing the array mutation:
        // deselect any removed items and adjust selected indices
        this.__applySplices(itemsInfo.value.indexSplices);
      } else {
        // Case 3 - an array element was changed, so deselect the previous
        // item for that index if it was previously selected
        let part = path.slice(`${JSCompiler_renameProperty('items', this)}.`.length);
        let idx = parseInt(part, 10);
        if ((part.indexOf('.') < 0) && part == idx) {
          this.__deselectChangedIdx(idx);
        }
      }
    }

    __applySplices(splices) {
      let selected = this.__selectedMap;
      // Adjust selected indices and mark removals
      for (let i=0; i<splices.length; i++) {
        let s = splices[i];
        selected.forEach((idx, item) => {
          if (idx < s.index) ; else if (idx >= s.index + s.removed.length) {
            // adjust index
            selected.set(item, idx + s.addedCount - s.removed.length);
          } else {
            // remove index
            selected.set(item, -1);
          }
        });
        for (let j=0; j<s.addedCount; j++) {
          let idx = s.index + j;
          if (selected.has(this.items[idx])) {
            selected.set(this.items[idx], idx);
          }
        }
      }
      // Update linked paths
      this.__updateLinks();
      // Remove selected items that were removed from the items array
      let sidx = 0;
      selected.forEach((idx, item) => {
        if (idx < 0) {
          if (this.multi) {
            this.splice(JSCompiler_renameProperty('selected', this), sidx, 1);
          } else {
            this.selected = this.selectedItem = null;
          }
          selected.delete(item);
        } else {
          sidx++;
        }
      });
    }

    __updateLinks() {
      this.__dataLinkedPaths = {};
      if (this.multi) {
        let sidx = 0;
        this.__selectedMap.forEach(idx => {
          if (idx >= 0) {
            this.linkPaths(
                `${JSCompiler_renameProperty('items', this)}.${idx}`,
                `${JSCompiler_renameProperty('selected', this)}.${sidx++}`);
          }
        });
      } else {
        this.__selectedMap.forEach(idx => {
          this.linkPaths(
              JSCompiler_renameProperty('selected', this),
              `${JSCompiler_renameProperty('items', this)}.${idx}`);
          this.linkPaths(
              JSCompiler_renameProperty('selectedItem', this),
              `${JSCompiler_renameProperty('items', this)}.${idx}`);
        });
      }
    }

    /**
     * Clears the selection state.
     * @override
     * @return {void}
     */
    clearSelection() {
      // Unbind previous selection
      this.__dataLinkedPaths = {};
      // The selected map stores 3 pieces of information:
      // key: items array object
      // value: items array index
      // order: selected array index
      this.__selectedMap = new Map();
      // Initialize selection
      this.selected = this.multi ? [] : null;
      this.selectedItem = null;
    }

    /**
     * Returns whether the item is currently selected.
     *
     * @override
     * @param {*} item Item from `items` array to test
     * @return {boolean} Whether the item is selected
     */
    isSelected(item) {
      return this.__selectedMap.has(item);
    }

    /**
     * Returns whether the item is currently selected.
     *
     * @override
     * @param {number} idx Index from `items` array to test
     * @return {boolean} Whether the item is selected
     */
    isIndexSelected(idx) {
      return this.isSelected(this.items[idx]);
    }

    __deselectChangedIdx(idx) {
      let sidx = this.__selectedIndexForItemIndex(idx);
      if (sidx >= 0) {
        let i = 0;
        this.__selectedMap.forEach((idx, item) => {
          if (sidx == i++) {
            this.deselect(item);
          }
        });
      }
    }

    __selectedIndexForItemIndex(idx) {
      let selected = this.__dataLinkedPaths[`${JSCompiler_renameProperty('items', this)}.${idx}`];
      if (selected) {
        return parseInt(selected.slice(`${JSCompiler_renameProperty('selected', this)}.`.length), 10);
      }
    }

    /**
     * Deselects the given item if it is already selected.
     *
     * @override
     * @param {*} item Item from `items` array to deselect
     * @return {void}
     */
    deselect(item) {
      let idx = this.__selectedMap.get(item);
      if (idx >= 0) {
        this.__selectedMap.delete(item);
        let sidx;
        if (this.multi) {
          sidx = this.__selectedIndexForItemIndex(idx);
        }
        this.__updateLinks();
        if (this.multi) {
          this.splice(JSCompiler_renameProperty('selected', this), sidx, 1);
        } else {
          this.selected = this.selectedItem = null;
        }
      }
    }

    /**
     * Deselects the given index if it is already selected.
     *
     * @override
     * @param {number} idx Index from `items` array to deselect
     * @return {void}
     */
    deselectIndex(idx) {
      this.deselect(this.items[idx]);
    }

    /**
     * Selects the given item.  When `toggle` is true, this will automatically
     * deselect the item if already selected.
     *
     * @override
     * @param {*} item Item from `items` array to select
     * @return {void}
     */
    select(item) {
      this.selectIndex(this.items.indexOf(item));
    }

    /**
     * Selects the given index.  When `toggle` is true, this will automatically
     * deselect the item if already selected.
     *
     * @override
     * @param {number} idx Index from `items` array to select
     * @return {void}
     */
    selectIndex(idx) {
      let item = this.items[idx];
      if (!this.isSelected(item)) {
        if (!this.multi) {
          this.__selectedMap.clear();
        }
        this.__selectedMap.set(item, idx);
        this.__updateLinks();
        if (this.multi) {
          this.push(JSCompiler_renameProperty('selected', this), item);
        } else {
          this.selected = this.selectedItem = item;
        }
      } else if (this.toggle) {
        this.deselectIndex(idx);
      }
    }

  }

  return ArraySelectorMixin;

});

/**
 * @constructor
 * @extends {PolymerElement}
 * @implements {Polymer_ArraySelectorMixin}
 * @private
 */
let baseArraySelector = ArraySelectorMixin(PolymerElement);

/**
 * Element implementing the `ArraySelector` mixin, which records
 * dynamic associations between item paths in a master `items` array and a
 * `selected` array such that path changes to the master array (at the host)
 * element or elsewhere via data-binding) are correctly propagated to items
 * in the selected array and vice-versa.
 *
 * The `items` property accepts an array of user data, and via the
 * `select(item)` and `deselect(item)` API, updates the `selected` property
 * which may be bound to other parts of the application, and any changes to
 * sub-fields of `selected` item(s) will be kept in sync with items in the
 * `items` array.  When `multi` is false, `selected` is a property
 * representing the last selected item.  When `multi` is true, `selected`
 * is an array of multiply selected items.
 *
 * Example:
 *
 * ```js
 * import {PolymerElement} from '@polymer/polymer';
 * import '@polymer/polymer/lib/elements/array-selector.js';
 *
 * class EmployeeList extends PolymerElement {
 *   static get _template() {
 *     return html`
 *         <div> Employee list: </div>
 *         <dom-repeat id="employeeList" items="{{employees}}">
 *           <template>
 *             <div>First name: <span>{{item.first}}</span></div>
 *               <div>Last name: <span>{{item.last}}</span></div>
 *               <button on-click="toggleSelection">Select</button>
 *           </template>
 *         </dom-repeat>
 *
 *         <array-selector id="selector"
 *                         items="{{employees}}"
 *                         selected="{{selected}}"
 *                         multi toggle></array-selector>
 *
 *         <div> Selected employees: </div>
 *         <dom-repeat items="{{selected}}">
 *           <template>
 *             <div>First name: <span>{{item.first}}</span></div>
 *             <div>Last name: <span>{{item.last}}</span></div>
 *           </template>
 *         </dom-repeat>`;
 *   }
 *   static get is() { return 'employee-list'; }
 *   static get properties() {
 *     return {
 *       employees: {
 *         value() {
 *           return [
 *             {first: 'Bob', last: 'Smith'},
 *             {first: 'Sally', last: 'Johnson'},
 *             ...
 *           ];
 *         }
 *       }
 *     };
 *   }
 *   toggleSelection(e) {
 *     const item = this.$.employeeList.itemForElement(e.target);
 *     this.$.selector.select(item);
 *   }
 * }
 * ```
 *
 * @polymer
 * @customElement
 * @extends {baseArraySelector}
 * @appliesMixin ArraySelectorMixin
 * @summary Custom element that links paths between an input `items` array and
 *   an output `selected` item or array based on calls to its selection API.
 */
class ArraySelector extends baseArraySelector {
  // Not needed to find template; can be removed once the analyzer
  // can find the tag name from customElements.define call
  static get is() { return 'array-selector'; }
  static get template() { return null; }
}
customElements.define(ArraySelector.is, ArraySelector);

/**
@license
Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
Code distributed by Google as part of the polymer project is also
subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
*/

// bc
const Base = LegacyElementMixin(HTMLElement).prototype;

/**
@license
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/

/**
`iron-media-query` can be used to data bind to a CSS media query.
The `query` property is a bare CSS media query.
The `query-matches` property is a boolean representing whether the page matches
that media query.

Example:

```html
<iron-media-query query="(min-width: 600px)" query-matches="{{queryMatches}}">
</iron-media-query>
```

@group Iron Elements
@demo demo/index.html
@hero hero.svg
@element iron-media-query
*/
Polymer({

  is: 'iron-media-query',

  properties: {

    /**
     * The Boolean return value of the media query.
     */
    queryMatches: {type: Boolean, value: false, readOnly: true, notify: true},

    /**
     * The CSS media query to evaluate.
     */
    query: {type: String, observer: 'queryChanged'},

    /**
     * If true, the query attribute is assumed to be a complete media query
     * string rather than a single media feature.
     */
    full: {type: Boolean, value: false},

    /**
     * @type {function(MediaQueryList)}
     */
    _boundMQHandler: {
      value: function() {
        return this.queryHandler.bind(this);
      }
    },

    /**
     * @type {MediaQueryList}
     */
    _mq: {value: null}
  },

  attached: function() {
    this.style.display = 'none';
    this.queryChanged();
  },

  detached: function() {
    this._remove();
  },

  _add: function() {
    if (this._mq) {
      this._mq.addListener(this._boundMQHandler);
    }
  },

  _remove: function() {
    if (this._mq) {
      this._mq.removeListener(this._boundMQHandler);
    }
    this._mq = null;
  },

  queryChanged: function() {
    this._remove();
    var query = this.query;
    if (!query) {
      return;
    }
    if (!this.full && query[0] !== '(') {
      query = '(' + query + ')';
    }
    this._mq = window.matchMedia(query);
    this._add();
    this.queryHandler(this._mq);
  },

  queryHandler: function(mq) {
    this._setQueryMatches(mq.matches);
  }

});

const p$1 = Element.prototype;
const matches$1 = p$1.matches || p$1.matchesSelector || p$1.mozMatchesSelector ||
  p$1.msMatchesSelector || p$1.oMatchesSelector || p$1.webkitMatchesSelector;

/**
 * `Polymer.IronFocusablesHelper` relies on some Polymer-specific legacy API,
 * especially the `root` property which does not exist for native shadow DOM.
 * That's why we have this helper here.
 * See https://github.com/PolymerElements/iron-overlay-behavior/issues/282
 */
class FocusablesHelper {

  /**
   * Returns a sorted array of tabbable nodes, including the root node.
   * It searches the tabbable nodes in the light and shadow dom of the children,
   * sorting the result by tabindex.
   * @param {!Node} node
   * @return {!Array<!HTMLElement>}
   */
  static getTabbableNodes(node) {
    const result = [];
    // If there is at least one element with tabindex > 0, we need to sort
    // the final array by tabindex.
    const needsSortByTabIndex = this._collectTabbableNodes(node, result);
    if (needsSortByTabIndex) {
      return this._sortByTabIndex(result);
    }
    return result;
  }

  /**
   * Returns if a element is focusable.
   * @param {!HTMLElement} element
   * @return {boolean}
   */
  static isFocusable(element) {
    // From http://stackoverflow.com/a/1600194/4228703:
    // There isn't a definite list, it's up to the browser. The only
    // standard we have is DOM Level 2 HTML
    // https://www.w3.org/TR/DOM-Level-2-HTML/html.html, according to which the
    // only elements that have a focus() method are HTMLInputElement,
    // HTMLSelectElement, HTMLTextAreaElement and HTMLAnchorElement. This
    // notably omits HTMLButtonElement and HTMLAreaElement. Referring to these
    // tests with tabbables in different browsers
    // http://allyjs.io/data-tables/focusable.html

    // Elements that cannot be focused if they have [disabled] attribute.
    if (matches$1.call(element, 'input, select, textarea, button, object')) {
      return matches$1.call(element, ':not([disabled])');
    }
    // Elements that can be focused even if they have [disabled] attribute.
    return matches$1.call(element, 'a[href], area[href], iframe, [tabindex], [contentEditable]');
  }

  /**
   * Returns if a element is tabbable. To be tabbable, a element must be
   * focusable, visible, and with a tabindex !== -1.
   * @param {!HTMLElement} element
   * @return {boolean}
   */
  static isTabbable(element) {
    return this.isFocusable(element) &&
        matches$1.call(element, ':not([tabindex="-1"])') &&
        this._isVisible(element);
  }

  /**
   * Returns the normalized element tabindex. If not focusable, returns -1.
   * It checks for the attribute "tabindex" instead of the element property
   * `tabIndex` since browsers assign different values to it.
   * e.g. in Firefox `<div contenteditable>` has `tabIndex = -1`
   * @param {!HTMLElement} element
   * @return {!number}
   * @private
   */
  static _normalizedTabIndex(element) {
    if (this.isFocusable(element)) {
      const tabIndex = element.getAttribute('tabindex') || 0;
      return Number(tabIndex);
    }
    return -1;
  }

  /**
   * Searches for nodes that are tabbable and adds them to the `result` array.
   * Returns if the `result` array needs to be sorted by tabindex.
   * @param {!Node} node The starting point for the search; added to `result` if tabbable.
   * @param {!Array<!HTMLElement>} result
   * @return {boolean}
   * @private
   */
  static _collectTabbableNodes(node, result) {
    // If not an element or not visible, no need to explore children.
    if (node.nodeType !== Node.ELEMENT_NODE || !this._isVisible(node)) {
      return false;
    }
    const element = /** @type {!HTMLElement} */ (node);
    const tabIndex = this._normalizedTabIndex(element);
    let needsSort = tabIndex > 0;
    if (tabIndex >= 0) {
      result.push(element);
    }

    // In ShadowDOM v1, tab order is affected by the order of distribution.
    // E.g. getTabbableNodes(#root) in ShadowDOM v1 should return [#A, #B];
    // in ShadowDOM v0 tab order is not affected by the distribution order,
    // in fact getTabbableNodes(#root) returns [#B, #A].
    //  <div id="root">
    //   <!-- shadow -->
    //     <slot name="a">
    //     <slot name="b">
    //   <!-- /shadow -->
    //   <input id="A" slot="a">
    //   <input id="B" slot="b" tabindex="1">
    //  </div>
    let children;
    if (element.localName === 'slot') {
      children = element.assignedNodes({flatten: true});
    } else {
      // Use shadow root if possible, will check for distributed nodes.
      children = (element.shadowRoot || element).children;
    }
    if (children) {
      for (let i = 0; i < children.length; i++) {
        // Ensure method is always invoked to collect tabbable children.
        needsSort = this._collectTabbableNodes(children[i], result) || needsSort;
      }
    }
    return needsSort;
  }

  /**
   * Returns false if the element has `visibility: hidden` or `display: none`
   * @param {!HTMLElement} element
   * @return {boolean}
   * @private
   */
  static _isVisible(element) {
    // Check inline style first to save a re-flow. If looks good, check also
    // computed style.
    let style = element.style;
    if (style.visibility !== 'hidden' && style.display !== 'none') {
      style = window.getComputedStyle(element);
      return (style.visibility !== 'hidden' && style.display !== 'none');
    }
    return false;
  }

  /**
   * Sorts an array of tabbable elements by tabindex. Returns a new array.
   * @param {!Array<!HTMLElement>} tabbables
   * @return {!Array<!HTMLElement>}
   * @private
   */
  static _sortByTabIndex(tabbables) {
    // Implement a merge sort as Array.prototype.sort does a non-stable sort
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort
    const len = tabbables.length;
    if (len < 2) {
      return tabbables;
    }
    const pivot = Math.ceil(len / 2);
    const left = this._sortByTabIndex(tabbables.slice(0, pivot));
    const right = this._sortByTabIndex(tabbables.slice(pivot));
    return this._mergeSortByTabIndex(left, right);
  }

  /**
   * Merge sort iterator, merges the two arrays into one, sorted by tab index.
   * @param {!Array<!HTMLElement>} left
   * @param {!Array<!HTMLElement>} right
   * @return {!Array<!HTMLElement>}
   * @private
   */
  static _mergeSortByTabIndex(left, right) {
    const result = [];
    while ((left.length > 0) && (right.length > 0)) {
      if (this._hasLowerTabOrder(left[0], right[0])) {
        result.push(right.shift());
      } else {
        result.push(left.shift());
      }
    }

    return result.concat(left, right);
  }

  /**
   * Returns if element `a` has lower tab order compared to element `b`
   * (both elements are assumed to be focusable and tabbable).
   * Elements with tabindex = 0 have lower tab order compared to elements
   * with tabindex > 0.
   * If both have same tabindex, it returns false.
   * @param {!HTMLElement} a
   * @param {!HTMLElement} b
   * @return {boolean}
   * @private
   */
  static _hasLowerTabOrder(a, b) {
    // Normalize tabIndexes
    // e.g. in Firefox `<div contenteditable>` has `tabIndex = -1`
    const ati = Math.max(a.tabIndex, 0);
    const bti = Math.max(b.tabIndex, 0);
    return (ati === 0 || bti === 0) ? bti > ati : ati > bti;
  }
}

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
let overlayContentCounter = 0;
const overlayContentCache = {};

const createOverlayContent = (cssText) => {
  const is = overlayContentCache[cssText] || processOverlayStyles(cssText);
  return document.createElement(is);
};

const processOverlayStyles = (cssText) => {
  overlayContentCounter++;
  const is = `vaadin-overlay-content-${overlayContentCounter}`;

  const styledTemplate = document.createElement('template');
  const style = document.createElement('style');
  style.textContent = ':host { display: block; }' + cssText;
  styledTemplate.content.appendChild(style);

  if (window.ShadyCSS) {
    window.ShadyCSS.prepareTemplate(styledTemplate, is);
  }

  // NOTE(platosha): Have to use an awkward IIFE returning class here
  // to prevent this class from showing up in analysis.json & API docs.
  const klass = (() => /** @private */ class extends HTMLElement {
    static get is() {
      return is;
    }

    constructor() {
      super();

      if (!this.shadowRoot) {
        this.attachShadow({mode: 'open'});
        this.shadowRoot.appendChild(document.importNode(styledTemplate.content, true));
      }
    }

    connectedCallback() {
      if (window.ShadyCSS) {
        window.ShadyCSS.styleElement(this);
      }
    }
  })();

  customElements.define(klass.is, klass);

  overlayContentCache[cssText] = is;
  return is;
};

/**
 *
 * `<vaadin-overlay>` is a Web Component for creating overlays. The content of the overlay
 * can be populated in two ways: imperatively by using renderer callback function and
 * declaratively by using Polymer's Templates.
 *
 * ### Rendering
 *
 * By default, the overlay uses the content provided by using the renderer callback function.
 *
 * The renderer function provides `root`, `owner`, `model` arguments when applicable.
 * Generate DOM content by using `model` object properties if needed, append it to the `root`
 * element and control the state of the host element by accessing `owner`. Before generating new
 * content, users are able to check if there is already content in `root` for reusing it.
 *
 * ```html
 * <vaadin-overlay id="overlay"></vaadin-overlay>
 * ```
 * ```js
 * const overlay = document.querySelector('#overlay');
 * overlay.renderer = function(root) {
 *  root.textContent = "Overlay content";
 * };
 * ```
 *
 * Renderer is called on the opening of the overlay and each time the related model is updated.
 * DOM generated during the renderer call can be reused
 * in the next renderer call and will be provided with the `root` argument.
 * On first call it will be empty.
 *
 * **NOTE:** when the renderer property is defined, the `<template>` content is not used.
 *
 * ### Templating
 *
 * Alternatively, the content can be provided with Polymer Template.
 * Overlay finds the first child template and uses that in case renderer callback function
 * is not provided. You can also set a custom template using the `template` property.
 *
 * After the content from the template is stamped, the `content` property
 * points to the content container.
 *
 * The overlay provides `forwardHostProp` when calling
 * `Polymer.Templatize.templatize` for the template, so that the bindings
 * from the parent scope propagate to the content.  You can also pass
 * custom `instanceProps` object using the `instanceProps` property.
 *
 * ```html
 * <vaadin-overlay>
 *   <template>Overlay content</template>
 * </vaadin-overlay>
 * ```
 *
 * **NOTE:** when using `instanceProps`: because of the Polymer limitation,
 * every template can only be templatized once, so it is important
 * to set `instanceProps` before the `template` is assigned to the overlay.
 *
 * ### Styling
 *
 * To style the overlay content, use styles in the parent scope:
 *
 * - If the overlay is used in a component, then the component styles
 *   apply the overlay content.
 * - If the overlay is used in the global DOM scope, then global styles
 *   apply to the overlay content.
 *
 * See examples for styling the overlay content in the live demos.
 *
 * The following Shadow DOM parts are available for styling the overlay component itself:
 *
 * Part name  | Description
 * -----------|---------------------------------------------------------|
 * `backdrop` | Backdrop of the overlay
 * `overlay`  | Container for position/sizing/alignment of the content
 * `content`  | Content of the overlay
 *
 * The following state attributes are available for styling:
 *
 * Attribute | Description | Part
 * ---|---|---
 * `opening` | Applied just after the overlay is attached to the DOM. You can apply a CSS @keyframe animation for this state. | `:host`
 * `closing` | Applied just before the overlay is detached from the DOM. You can apply a CSS @keyframe animation for this state. | `:host`
 *
 * The following custom CSS properties are available for styling:
 *
 * Custom CSS property | Description | Default value
 * ---|---|---
 * `--vaadin-overlay-viewport-bottom` | Bottom offset of the visible viewport area | `0` or detected offset
 *
 * See [ThemableMixin – how to apply styles for shadow parts](https://github.com/vaadin/vaadin-themable-mixin/wiki)
 *
 * @extends PolymerElement
 * @mixes ThemableMixin
 * @demo demo/index.html
 */
class OverlayElement extends ThemableMixin(DirMixin(PolymerElement)) {
  static get template() {
    return html`
    <style>
      :host {
        z-index: 200;
        position: fixed;

        /*
          Despite of what the names say, <vaadin-overlay> is just a container
          for position/sizing/alignment. The actual overlay is the overlay part.
        */

        /*
          Default position constraints: the entire viewport. Note: themes can
          override this to introduce gaps between the overlay and the viewport.
        */
        top: 0;
        right: 0;
        bottom: var(--vaadin-overlay-viewport-bottom);
        left: 0;

        /* Use flexbox alignment for the overlay part. */
        display: flex;
        flex-direction: column; /* makes dropdowns sizing easier */
        /* Align to center by default. */
        align-items: center;
        justify-content: center;

        /* Allow centering when max-width/max-height applies. */
        margin: auto;

        /* The host is not clickable, only the overlay part is. */
        pointer-events: none;

        /* Remove tap highlight on touch devices. */
        -webkit-tap-highlight-color: transparent;

        /* CSS API for host */
        --vaadin-overlay-viewport-bottom: 0;
      }

      :host([hidden]),
      :host(:not([opened]):not([closing])) {
        display: none !important;
      }

      [part="overlay"] {
        -webkit-overflow-scrolling: touch;
        overflow: auto;
        pointer-events: auto;

        /* Prevent overflowing the host in MSIE 11 */
        max-width: 100%;
        box-sizing: border-box;

        -webkit-tap-highlight-color: initial; /* reenable tap highlight inside */
      }

      [part="backdrop"] {
        z-index: -1;
        content: "";
        background: rgba(0, 0, 0, 0.5);
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        pointer-events: auto;
      }
    </style>

    <div id="backdrop" part="backdrop" hidden\$="{{!withBackdrop}}"></div>
    <div part="overlay" id="overlay" tabindex="0">
      <div part="content" id="content">
        <slot></slot>
      </div>
    </div>
`;
  }

  static get is() {
    return 'vaadin-overlay';
  }

  static get properties() {
    return {
      /**
       * When true, the overlay is visible and attached to body.
       */
      opened: {
        type: Boolean,
        notify: true,
        observer: '_openedChanged',
        reflectToAttribute: true
      },

      /**
       * Owner element passed with renderer function
       * @type {HTMLElement}
       */
      owner: Element,

      /**
       * Custom function for rendering the content of the overlay.
       * Receives three arguments:
       *
       * - `root` The root container DOM element. Append your content to it.
       * - `owner` The host element of the renderer function.
       * - `model` The object with the properties related with rendering.
       * @type {OverlayRenderer | null | undefined}
       */
      renderer: Function,

      /**
       * The template of the overlay content.
       * @type {HTMLTemplateElement | null | undefined}
       */
      template: {
        type: Object,
        notify: true
      },

      /**
       * Optional argument for `Polymer.Templatize.templatize`.
       */
      instanceProps: {
        type: Object
      },

      /**
       * References the content container after the template is stamped.
       * @type {!HTMLElement | undefined}
       */
      content: {
        type: Object,
        notify: true
      },

      /**
       * When true the overlay has backdrop on top of content when opened.
       * @type {boolean}
       */
      withBackdrop: {
        type: Boolean,
        value: false,
        reflectToAttribute: true
      },

      /**
       * Object with properties that is passed to `renderer` function
       */
      model: Object,

      /**
       * When true the overlay won't disable the main content, showing
       * it doesn’t change the functionality of the user interface.
       * @type {boolean}
       */
      modeless: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        observer: '_modelessChanged'
      },

      /**
       * When set to true, the overlay is hidden. This also closes the overlay
       * immediately in case there is a closing animation in progress.
       * @type {boolean}
       */
      hidden: {
        type: Boolean,
        reflectToAttribute: true,
        observer: '_hiddenChanged'
      },

      /**
       * When true move focus to the first focusable element in the overlay,
       * or to the overlay if there are no focusable elements.
       * @type {boolean}
       */
      focusTrap: {
        type: Boolean,
        value: false
      },

      /**
       * Set to true to enable restoring of focus when overlay is closed.
       * @type {boolean}
       */
      restoreFocusOnClose: {
        type: Boolean,
        value: false,
      },

      /** @private */
      _mouseDownInside: {
        type: Boolean
      },

      /** @private */
      _mouseUpInside: {
        type: Boolean
      },

      /** @private */
      _instance: {
        type: Object
      },

      /** @private */
      _originalContentPart: Object,

      /** @private */
      _contentNodes: Array,

      /** @private */
      _oldOwner: Element,

      /** @private */
      _oldModel: Object,

      /** @private */
      _oldTemplate: Object,

      /** @private */
      _oldInstanceProps: Object,

      /** @private */
      _oldRenderer: Object,

      /** @private */
      _oldOpened: Boolean
    };
  }

  static get observers() {
    return [
      '_templateOrRendererChanged(template, renderer, owner, model, instanceProps, opened)'
    ];
  }

  constructor() {
    super();
    this._boundMouseDownListener = this._mouseDownListener.bind(this);
    this._boundMouseUpListener = this._mouseUpListener.bind(this);
    this._boundOutsideClickListener = this._outsideClickListener.bind(this);
    this._boundKeydownListener = this._keydownListener.bind(this);

    this._observer = new FlattenedNodesObserver(this, info => {
      this._setTemplateFromNodes(info.addedNodes);
    });

    // Listener for preventing closing of the paper-dialog and all components extending `iron-overlay-behavior`.
    this._boundIronOverlayCanceledListener = this._ironOverlayCanceled.bind(this);

    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      this._boundIosResizeListener = () => this._detectIosNavbar();
    }
  }

  ready() {
    super.ready();

    this._observer.flush();

    // Need to add dummy click listeners to this and the backdrop or else
    // the document click event listener (_outsideClickListener) may never
    // get invoked on iOS Safari (reproducible in <vaadin-dialog>
    // and <vaadin-context-menu>).
    this.addEventListener('click', () => {});
    this.$.backdrop.addEventListener('click', () => {});
  }

  /** @private */
  _detectIosNavbar() {
    if (!this.opened) {
      return;
    }

    const innerHeight = window.innerHeight;
    const innerWidth = window.innerWidth;

    const landscape = innerWidth > innerHeight;

    const clientHeight = document.documentElement.clientHeight;

    if (landscape && clientHeight > innerHeight) {
      this.style.setProperty('--vaadin-overlay-viewport-bottom', clientHeight - innerHeight + 'px');
    } else {
      this.style.setProperty('--vaadin-overlay-viewport-bottom', '0');
    }
  }

  /**
   * @param {!Array<!Element>} nodes
   * @protected
   */
  _setTemplateFromNodes(nodes) {
    this.template = nodes.filter(node => node.localName && node.localName === 'template')[0] || this.template;
  }

  /**
   * @param {Event=} sourceEvent
   * @event vaadin-overlay-close
   * fired before the `vaadin-overlay` will be closed. If canceled the closing of the overlay is canceled as well.
   */
  close(sourceEvent) {
    var evt = new CustomEvent('vaadin-overlay-close', {bubbles: true, cancelable: true, detail: {sourceEvent: sourceEvent}});
    this.dispatchEvent(evt);
    if (!evt.defaultPrevented) {
      this.opened = false;
    }
  }

  connectedCallback() {
    super.connectedCallback();

    if (this._boundIosResizeListener) {
      this._detectIosNavbar();
      window.addEventListener('resize', this._boundIosResizeListener);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this._boundIosResizeListener && window.removeEventListener('resize', this._boundIosResizeListener);
  }

  /** @private */
  _ironOverlayCanceled(event) {
    event.preventDefault();
  }

  /** @private */
  _mouseDownListener(event) {
    this._mouseDownInside = event.composedPath().indexOf(this.$.overlay) >= 0;
  }

  /** @private */
  _mouseUpListener(event) {
    this._mouseUpInside = event.composedPath().indexOf(this.$.overlay) >= 0;
  }

  /**
   * We need to listen on 'click' / 'tap' event and capture it and close the overlay before
   * propagating the event to the listener in the button. Otherwise, if the clicked button would call
   * open(), this would happen: https://www.youtube.com/watch?v=Z86V_ICUCD4
   *
   * @event vaadin-overlay-outside-click
   * fired before the `vaadin-overlay` will be closed on outside click. If canceled the closing of the overlay is canceled as well.
   *
   * @private
   */
  _outsideClickListener(event) {
    if (event.composedPath().indexOf(this.$.overlay) !== -1 ||
        this._mouseDownInside || this._mouseUpInside) {
      this._mouseDownInside = false;
      this._mouseUpInside = false;
      return;
    }
    if (!this._last) {
      return;
    }

    const evt = new CustomEvent('vaadin-overlay-outside-click', {bubbles: true, cancelable: true, detail: {sourceEvent: event}});
    this.dispatchEvent(evt);

    if (this.opened && !evt.defaultPrevented) {
      this.close(event);
    }
  }

  /**
   * @event vaadin-overlay-escape-press
   * fired before the `vaadin-overlay` will be closed on ESC button press. If canceled the closing of the overlay is canceled as well.
   *
   * @private
   */
  _keydownListener(event) {
    if (!this._last) {
      return;
    }

    // TAB
    if (event.key === 'Tab' && this.focusTrap && !event.defaultPrevented) {
      // if only tab key is pressed, cycle forward, else cycle backwards.
      this._cycleTab(event.shiftKey ? -1 : 1);

      event.preventDefault();

    // ESC
    } else if (event.key === 'Escape' || event.key === 'Esc') {
      const evt = new CustomEvent('vaadin-overlay-escape-press', {bubbles: true, cancelable: true, detail: {sourceEvent: event}});
      this.dispatchEvent(evt);

      if (this.opened && !evt.defaultPrevented) {
        this.close(event);
      }
    }
  }

  /** @protected */
  _ensureTemplatized() {
    this._setTemplateFromNodes(Array.from(this.children));
  }

  /**
   * @event vaadin-overlay-open
   * fired after the `vaadin-overlay` is opened.
   *
   * @private
   */
  _openedChanged(opened, wasOpened) {
    if (!this._instance) {
      this._ensureTemplatized();
    }

    if (opened) {
      // Store focused node.
      this.__restoreFocusNode = this._getActiveElement();
      this._animatedOpening();

      afterNextRender(this, () => {
        if (this.focusTrap && !this.contains(document._activeElement || document.activeElement)) {
          this._cycleTab(0, 0);
        }

        const evt = new CustomEvent('vaadin-overlay-open', {bubbles: true});
        this.dispatchEvent(evt);
      });

      if (!this.modeless) {
        this._addGlobalListeners();
      }
    } else if (wasOpened) {
      this._animatedClosing();

      if (!this.modeless) {
        this._removeGlobalListeners();
      }
    }
  }

  /** @private */
  _hiddenChanged(hidden) {
    if (hidden && this.hasAttribute('closing')) {
      this._flushAnimation('closing');
    }
  }

  /**
   * @return {boolean}
   * @protected
   */
  _shouldAnimate() {
    const name = getComputedStyle(this).getPropertyValue('animation-name');
    const hidden = getComputedStyle(this).getPropertyValue('display') === 'none';
    return !hidden && name && name != 'none';
  }

  /**
   * @param {string} type
   * @param {Function} callback
   * @protected
   */
  _enqueueAnimation(type, callback) {
    const handler = `__${type}Handler`;
    const listener = event => {
      if (event && event.target !== this) {
        return;
      }
      callback();
      this.removeEventListener('animationend', listener);
      delete this[handler];
    };
    this[handler] = listener;
    this.addEventListener('animationend', listener);
  }

  /**
   * @param {string} type
   * @protected
   */
  _flushAnimation(type) {
    const handler = `__${type}Handler`;
    if (typeof this[handler] === 'function') {
      this[handler]();
    }
  }

  /** @protected */
  _animatedOpening() {
    if (this.parentNode === document.body && this.hasAttribute('closing')) {
      this._flushAnimation('closing');
    }
    this._attachOverlay();
    if (!this.modeless) {
      this._enterModalState();
    }
    this.setAttribute('opening', '');

    const finishOpening = () => {
      document.addEventListener('iron-overlay-canceled', this._boundIronOverlayCanceledListener);

      this.removeAttribute('opening');
    };

    if (this._shouldAnimate()) {
      this._enqueueAnimation('opening', finishOpening);
    } else {
      finishOpening();
    }
  }

  /** @protected */
  _attachOverlay() {
    this._placeholder = document.createComment('vaadin-overlay-placeholder');
    this.parentNode.insertBefore(this._placeholder, this);
    document.body.appendChild(this);
    this.bringToFront();
  }

  /** @protected */
  _animatedClosing() {
    if (this.hasAttribute('opening')) {
      this._flushAnimation('opening');
    }
    if (this._placeholder) {
      this._exitModalState();

      if (this.restoreFocusOnClose && this.__restoreFocusNode) {
        // If the activeElement is `<body>` or inside the overlay,
        // we are allowed to restore the focus. In all the other
        // cases focus might have been moved elsewhere by another
        // component or by the user interaction (e.g. click on a
        // button outside the overlay).
        const activeElement = this._getActiveElement();

        if (activeElement === document.body || this._deepContains(activeElement)) {
          this.__restoreFocusNode.focus();
        }
        this.__restoreFocusNode = null;
      }

      this.setAttribute('closing', '');

      const finishClosing = () => {
        document.removeEventListener('iron-overlay-canceled', this._boundIronOverlayCanceledListener);
        this._detachOverlay();
        this.shadowRoot.querySelector('[part="overlay"]').style.removeProperty('pointer-events');
        this.removeAttribute('closing');
      };

      if (this._shouldAnimate()) {
        this._enqueueAnimation('closing', finishClosing);
      } else {
        finishClosing();
      }
    }
  }

  /** @protected */
  _detachOverlay() {
    this._placeholder.parentNode.insertBefore(this, this._placeholder);
    this._placeholder.parentNode.removeChild(this._placeholder);
  }

  /**
   * Returns all attached overlays in visual stacking order.
   * @private
   */
  static get __attachedInstances() {
    return Array.from(document.body.children)
      .filter(el => el instanceof OverlayElement && !el.hasAttribute('closing'))
      .sort((a, b) => (a.__zIndex - b.__zIndex) || 0);
  }

  /**
   * returns true if this is the last one in the opened overlays stack
   * @return {boolean}
   * @protected
   */
  get _last() {
    return this === OverlayElement.__attachedInstances.pop();
  }

  /** @private */
  _modelessChanged(modeless) {
    if (!modeless) {
      if (this.opened) {
        this._addGlobalListeners();
        this._enterModalState();
      }
    } else {
      this._removeGlobalListeners();
      this._exitModalState();
    }
  }

  /** @protected */
  _addGlobalListeners() {
    document.addEventListener('mousedown', this._boundMouseDownListener);
    document.addEventListener('mouseup', this._boundMouseUpListener);
    // Firefox leaks click to document on contextmenu even if prevented
    // https://bugzilla.mozilla.org/show_bug.cgi?id=990614
    document.documentElement.addEventListener('click', this._boundOutsideClickListener, true);
    document.addEventListener('keydown', this._boundKeydownListener);
  }

  /** @protected */
  _enterModalState() {
    if (document.body.style.pointerEvents !== 'none') {
      // Set body pointer-events to 'none' to disable mouse interactions with
      // other document nodes.
      this._previousDocumentPointerEvents = document.body.style.pointerEvents;
      document.body.style.pointerEvents = 'none';
    }

    // Disable pointer events in other attached overlays
    OverlayElement.__attachedInstances.forEach(el => {
      if (el !== this) {
        el.shadowRoot.querySelector('[part="overlay"]').style.pointerEvents = 'none';
      }
    });
  }

  /** @protected */
  _removeGlobalListeners() {
    document.removeEventListener('mousedown', this._boundMouseDownListener);
    document.removeEventListener('mouseup', this._boundMouseUpListener);
    document.documentElement.removeEventListener('click', this._boundOutsideClickListener, true);
    document.removeEventListener('keydown', this._boundKeydownListener);
  }

  /** @protected */
  _exitModalState() {
    if (this._previousDocumentPointerEvents !== undefined) {
      // Restore body pointer-events
      document.body.style.pointerEvents = this._previousDocumentPointerEvents;
      delete this._previousDocumentPointerEvents;
    }

    // Restore pointer events in the previous overlay(s)
    const instances = OverlayElement.__attachedInstances;
    let el;
    // Use instances.pop() to ensure the reverse order
    while (el = instances.pop()) {
      if (el === this) {
        // Skip the current instance
        continue;
      }
      el.shadowRoot.querySelector('[part="overlay"]').style.removeProperty('pointer-events');
      if (!el.modeless) {
        // Stop after the last modal
        break;
      }
    }
  }

  /** @protected */
  _removeOldContent() {
    if (!this.content || !this._contentNodes) {
      return;
    }

    this._observer.disconnect();

    this._contentNodes.forEach(node => {
      if (node.parentNode === this.content) {
        this.content.removeChild(node);
      }
    });

    if (this._originalContentPart) {
      // Restore the original <div part="content">
      this.$.content.parentNode.replaceChild(this._originalContentPart, this.$.content);
      this.$.content = this._originalContentPart;
      this._originalContentPart = undefined;
    }

    this._observer.connect();

    this._contentNodes = undefined;
    this.content = undefined;
  }

  /**
   * @param {!HTMLTemplateElement} template
   * @param {object} instanceProps
   * @protected
   */
  _stampOverlayTemplate(template, instanceProps) {
    this._removeOldContent();

    if (!template._Templatizer) {
      template._Templatizer = templatize(template, this, {
        instanceProps: instanceProps,
        forwardHostProp: function(prop, value) {
          if (this._instance) {
            this._instance.forwardHostProp(prop, value);
          }
        }
      });
    }

    this._instance = new template._Templatizer({});
    this._contentNodes = Array.from(this._instance.root.childNodes);

    const templateRoot = template._templateRoot || (template._templateRoot = template.getRootNode());
    const _isScoped = templateRoot !== document;

    if (_isScoped) {
      const isShady = window.ShadyCSS && !window.ShadyCSS.nativeShadow;

      if (!this.$.content.shadowRoot) {
        this.$.content.attachShadow({mode: 'open'});
      }

      let scopeCssText = Array.from(templateRoot.querySelectorAll('style'))
        .reduce((result, style) => result + style.textContent, '');

      if (isShady) {
        // NOTE(platosha): ShadyCSS removes <style>’s from templates, so
        // we have to use these protected APIs to get their contents back
        const styleInfo = window.ShadyCSS.ScopingShim
          ._styleInfoForNode(templateRoot.host);
        if (styleInfo) {
          scopeCssText += styleInfo._getStyleRules().parsedCssText;
          scopeCssText += '}';
        }
      }

      // The overlay root’s :host styles should not apply inside the overlay
      scopeCssText = scopeCssText.replace(/:host/g, ':host-nomatch');

      if (scopeCssText) {
        if (isShady) {
          // ShadyDOM: replace the <div part="content"> with a generated
          // styled custom element
          const contentPart = createOverlayContent(scopeCssText);
          contentPart.id = 'content';
          contentPart.setAttribute('part', 'content');
          this.$.content.parentNode.replaceChild(contentPart, this.$.content);
          // NOTE(platosha): carry the style scope of the content part
          contentPart.className = this.$.content.className;
          this._originalContentPart = this.$.content;
          this.$.content = contentPart;
        } else {
          // Shadow DOM: append a style to the content shadowRoot
          const style = document.createElement('style');
          style.textContent = scopeCssText;
          this.$.content.shadowRoot.appendChild(style);
          this._contentNodes.unshift(style);
        }
      }

      this.$.content.shadowRoot.appendChild(this._instance.root);
      this.content = this.$.content.shadowRoot;
    } else {
      this.appendChild(this._instance.root);
      this.content = this;
    }
  }

  /** @private */
  _removeNewRendererOrTemplate(template, oldTemplate, renderer, oldRenderer) {
    if (template !== oldTemplate) {
      this.template = undefined;
    } else if (renderer !== oldRenderer) {
      this.renderer = undefined;
    }
  }

  /**
   * Manually invoke existing renderer.
   */
  render() {
    if (this.renderer) {
      this.renderer.call(this.owner, this.content, this.owner, this.model);
    }
  }

  /** @private */
  _templateOrRendererChanged(template, renderer, owner, model, instanceProps, opened) {
    if (template && renderer) {
      this._removeNewRendererOrTemplate(template, this._oldTemplate, renderer, this._oldRenderer);
      throw new Error('You should only use either a renderer or a template for overlay content');
    }

    const ownerOrModelChanged = (this._oldOwner !== owner || this._oldModel !== model);
    this._oldModel = model;
    this._oldOwner = owner;

    const templateOrInstancePropsChanged = (this._oldInstanceProps !== instanceProps || this._oldTemplate !== template);
    this._oldInstanceProps = instanceProps;
    this._oldTemplate = template;

    const rendererChanged = this._oldRenderer !== renderer;
    this._oldRenderer = renderer;

    const openedChanged = this._oldOpened !== opened;
    this._oldOpened = opened;

    if (template && templateOrInstancePropsChanged) {
      this._stampOverlayTemplate(template, instanceProps);
    } else if (renderer && (rendererChanged || openedChanged || ownerOrModelChanged)) {
      this.content = this;

      if (rendererChanged) {
        while (this.content.firstChild) {
          this.content.removeChild(this.content.firstChild);
        }
      }

      if (opened) {
        this.render();
      }
    }
  }

  /**
   * @param {Element} element
   * @return {boolean}
   * @protected
   */
  _isFocused(element) {
    return element && element.getRootNode().activeElement === element;
  }

  /**
   * @param {Element[]} elements
   * @return {number}
   * @protected
   */
  _focusedIndex(elements) {
    elements = elements || this._getFocusableElements();
    return elements.indexOf(elements.filter(this._isFocused).pop());
  }

  /**
   * @param {number} increment
   * @param {number | undefined} index
   * @protected
   */
  _cycleTab(increment, index) {
    const focusableElements = this._getFocusableElements();

    if (index === undefined) {
      index = this._focusedIndex(focusableElements);
    }

    index += increment;

    // rollover to first item
    if (index >= focusableElements.length) {
      index = 0;
    // go to last item
    } else if (index < 0) {
      index = focusableElements.length - 1;
    }

    focusableElements[index].focus();
  }

  /**
   * @return {!Array<!HTMLElement>}
   * @protected
   */
  _getFocusableElements() {
    // collect all focusable elements
    return FocusablesHelper.getTabbableNodes(this.$.overlay);
  }

  /**
   * @return {!Element}
   * @protected
   */
  _getActiveElement() {
    let active = document._activeElement || document.activeElement;
    // document.activeElement can be null
    // https://developer.mozilla.org/en-US/docs/Web/API/Document/activeElement
    // In IE 11, it can also be an object when operating in iframes
    // or document.documentElement (when overlay closed on outside click).
    // In these cases, default it to document.body.
    if (!active || active === document.documentElement || active instanceof Element === false) {
      active = document.body;
    }
    while (active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  /**
   * @param {!Node} node
   * @return {boolean}
   * @protected
   */
  _deepContains(node) {
    if (this.contains(node)) {
      return true;
    }
    let n = node;
    const doc = node.ownerDocument;
    // walk from node to `this` or `document`
    while (n && n !== doc && n !== this) {
      n = n.parentNode || n.host;
    }
    return n === this;
  }

  /**
   * Brings the overlay as visually the frontmost one
   */
  bringToFront() {
    let zIndex = '';
    const frontmost = OverlayElement.__attachedInstances.filter(o => o !== this).pop();
    if (frontmost) {
      const frontmostZIndex = frontmost.__zIndex;
      zIndex = frontmostZIndex + 1;
    }
    this.style.zIndex = zIndex;
    this.__zIndex = zIndex || parseFloat(getComputedStyle(this).zIndex);
  }
}

customElements.define(OverlayElement.is, OverlayElement);

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/**
 * The overlay element.
 *
 * ### Styling
 *
 * See [`<vaadin-overlay>` documentation](https://github.com/vaadin/vaadin-overlay/blob/master/src/vaadin-overlay.html)
 * for `<vaadin-date-picker-overlay>` parts.
 *
 * See [ThemableMixin – how to apply styles for shadow parts](https://github.com/vaadin/vaadin-themable-mixin/wiki)
 *
 * @extends PolymerElement
 * @private
 */
class DatePickerOverlayElement extends DisableUpgradeMixin(OverlayElement) {
  static get is() {
    return 'vaadin-date-picker-overlay';
  }
}

customElements.define(DatePickerOverlayElement.is, DatePickerOverlayElement);

/**
@license
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/

/**
 * Chrome uses an older version of DOM Level 3 Keyboard Events
 *
 * Most keys are labeled as text, but some are Unicode codepoints.
 * Values taken from:
 * http://www.w3.org/TR/2007/WD-DOM-Level-3-Events-20071221/keyset.html#KeySet-Set
 */
var KEY_IDENTIFIER = {
  'U+0008': 'backspace',
  'U+0009': 'tab',
  'U+001B': 'esc',
  'U+0020': 'space',
  'U+007F': 'del'
};

/**
 * Special table for KeyboardEvent.keyCode.
 * KeyboardEvent.keyIdentifier is better, and KeyBoardEvent.key is even better
 * than that.
 *
 * Values from:
 * https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent.keyCode#Value_of_keyCode
 */
var KEY_CODE = {
  8: 'backspace',
  9: 'tab',
  13: 'enter',
  27: 'esc',
  33: 'pageup',
  34: 'pagedown',
  35: 'end',
  36: 'home',
  32: 'space',
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  46: 'del',
  106: '*'
};

/**
 * MODIFIER_KEYS maps the short name for modifier keys used in a key
 * combo string to the property name that references those same keys
 * in a KeyboardEvent instance.
 */
var MODIFIER_KEYS = {
  'shift': 'shiftKey',
  'ctrl': 'ctrlKey',
  'alt': 'altKey',
  'meta': 'metaKey'
};

/**
 * KeyboardEvent.key is mostly represented by printable character made by
 * the keyboard, with unprintable keys labeled nicely.
 *
 * However, on OS X, Alt+char can make a Unicode character that follows an
 * Apple-specific mapping. In this case, we fall back to .keyCode.
 */
var KEY_CHAR = /[a-z0-9*]/;

/**
 * Matches a keyIdentifier string.
 */
var IDENT_CHAR = /U\+/;

/**
 * Matches arrow keys in Gecko 27.0+
 */
var ARROW_KEY = /^arrow/;

/**
 * Matches space keys everywhere (notably including IE10's exceptional name
 * `spacebar`).
 */
var SPACE_KEY = /^space(bar)?/;

/**
 * Matches ESC key.
 *
 * Value from: http://w3c.github.io/uievents-key/#key-Escape
 */
var ESC_KEY = /^escape$/;

/**
 * Transforms the key.
 * @param {string} key The KeyBoardEvent.key
 * @param {Boolean} [noSpecialChars] Limits the transformation to
 * alpha-numeric characters.
 */
function transformKey(key, noSpecialChars) {
  var validKey = '';
  if (key) {
    var lKey = key.toLowerCase();
    if (lKey === ' ' || SPACE_KEY.test(lKey)) {
      validKey = 'space';
    } else if (ESC_KEY.test(lKey)) {
      validKey = 'esc';
    } else if (lKey.length == 1) {
      if (!noSpecialChars || KEY_CHAR.test(lKey)) {
        validKey = lKey;
      }
    } else if (ARROW_KEY.test(lKey)) {
      validKey = lKey.replace('arrow', '');
    } else if (lKey == 'multiply') {
      // numpad '*' can map to Multiply on IE/Windows
      validKey = '*';
    } else {
      validKey = lKey;
    }
  }
  return validKey;
}

function transformKeyIdentifier(keyIdent) {
  var validKey = '';
  if (keyIdent) {
    if (keyIdent in KEY_IDENTIFIER) {
      validKey = KEY_IDENTIFIER[keyIdent];
    } else if (IDENT_CHAR.test(keyIdent)) {
      keyIdent = parseInt(keyIdent.replace('U+', '0x'), 16);
      validKey = String.fromCharCode(keyIdent).toLowerCase();
    } else {
      validKey = keyIdent.toLowerCase();
    }
  }
  return validKey;
}

function transformKeyCode(keyCode) {
  var validKey = '';
  if (Number(keyCode)) {
    if (keyCode >= 65 && keyCode <= 90) {
      // ascii a-z
      // lowercase is 32 offset from uppercase
      validKey = String.fromCharCode(32 + keyCode);
    } else if (keyCode >= 112 && keyCode <= 123) {
      // function keys f1-f12
      validKey = 'f' + (keyCode - 112 + 1);
    } else if (keyCode >= 48 && keyCode <= 57) {
      // top 0-9 keys
      validKey = String(keyCode - 48);
    } else if (keyCode >= 96 && keyCode <= 105) {
      // num pad 0-9
      validKey = String(keyCode - 96);
    } else {
      validKey = KEY_CODE[keyCode];
    }
  }
  return validKey;
}

/**
 * Calculates the normalized key for a KeyboardEvent.
 * @param {KeyboardEvent} keyEvent
 * @param {Boolean} [noSpecialChars] Set to true to limit keyEvent.key
 * transformation to alpha-numeric chars. This is useful with key
 * combinations like shift + 2, which on FF for MacOS produces
 * keyEvent.key = @
 * To get 2 returned, set noSpecialChars = true
 * To get @ returned, set noSpecialChars = false
 */
function normalizedKeyForEvent(keyEvent, noSpecialChars) {
  // Fall back from .key, to .detail.key for artifical keyboard events,
  // and then to deprecated .keyIdentifier and .keyCode.
  if (keyEvent.key) {
    return transformKey(keyEvent.key, noSpecialChars);
  }
  if (keyEvent.detail && keyEvent.detail.key) {
    return transformKey(keyEvent.detail.key, noSpecialChars);
  }
  return transformKeyIdentifier(keyEvent.keyIdentifier) ||
      transformKeyCode(keyEvent.keyCode) || '';
}

function keyComboMatchesEvent(keyCombo, event) {
  // For combos with modifiers we support only alpha-numeric keys
  var keyEvent = normalizedKeyForEvent(event, keyCombo.hasModifiers);
  return keyEvent === keyCombo.key &&
      (!keyCombo.hasModifiers ||
       (!!event.shiftKey === !!keyCombo.shiftKey &&
        !!event.ctrlKey === !!keyCombo.ctrlKey &&
        !!event.altKey === !!keyCombo.altKey &&
        !!event.metaKey === !!keyCombo.metaKey));
}

function parseKeyComboString(keyComboString) {
  if (keyComboString.length === 1) {
    return {combo: keyComboString, key: keyComboString, event: 'keydown'};
  }
  return keyComboString.split('+')
      .reduce(function(parsedKeyCombo, keyComboPart) {
        var eventParts = keyComboPart.split(':');
        var keyName = eventParts[0];
        var event = eventParts[1];

        if (keyName in MODIFIER_KEYS) {
          parsedKeyCombo[MODIFIER_KEYS[keyName]] = true;
          parsedKeyCombo.hasModifiers = true;
        } else {
          parsedKeyCombo.key = keyName;
          parsedKeyCombo.event = event || 'keydown';
        }

        return parsedKeyCombo;
      }, {combo: keyComboString.split(':').shift()});
}

function parseEventString(eventString) {
  return eventString.trim().split(' ').map(function(keyComboString) {
    return parseKeyComboString(keyComboString);
  });
}

/**
 * `Polymer.IronA11yKeysBehavior` provides a normalized interface for processing
 * keyboard commands that pertain to [WAI-ARIA best
 * practices](http://www.w3.org/TR/wai-aria-practices/#kbd_general_binding). The
 * element takes care of browser differences with respect to Keyboard events and
 * uses an expressive syntax to filter key presses.
 *
 * Use the `keyBindings` prototype property to express what combination of keys
 * will trigger the callback. A key binding has the format
 * `"KEY+MODIFIER:EVENT": "callback"` (`"KEY": "callback"` or
 * `"KEY:EVENT": "callback"` are valid as well). Some examples:
 *
 *      keyBindings: {
 *        'space': '_onKeydown', // same as 'space:keydown'
 *        'shift+tab': '_onKeydown',
 *        'enter:keypress': '_onKeypress',
 *        'esc:keyup': '_onKeyup'
 *      }
 *
 * The callback will receive with an event containing the following information
 * in `event.detail`:
 *
 *      _onKeydown: function(event) {
 *        console.log(event.detail.combo); // KEY+MODIFIER, e.g. "shift+tab"
 *        console.log(event.detail.key); // KEY only, e.g. "tab"
 *        console.log(event.detail.event); // EVENT, e.g. "keydown"
 *        console.log(event.detail.keyboardEvent); // the original KeyboardEvent
 *      }
 *
 * Use the `keyEventTarget` attribute to set up event handlers on a specific
 * node.
 *
 * See the [demo source
 * code](https://github.com/PolymerElements/iron-a11y-keys-behavior/blob/master/demo/x-key-aware.html)
 * for an example.
 *
 * @demo demo/index.html
 * @polymerBehavior
 */
const IronA11yKeysBehavior = {
  properties: {
    /**
     * The EventTarget that will be firing relevant KeyboardEvents. Set it to
     * `null` to disable the listeners.
     * @type {?EventTarget}
     */
    keyEventTarget: {
      type: Object,
      value: function() {
        return this;
      }
    },

    /**
     * If true, this property will cause the implementing element to
     * automatically stop propagation on any handled KeyboardEvents.
     */
    stopKeyboardEventPropagation: {type: Boolean, value: false},

    _boundKeyHandlers: {
      type: Array,
      value: function() {
        return [];
      }
    },

    // We use this due to a limitation in IE10 where instances will have
    // own properties of everything on the "prototype".
    _imperativeKeyBindings: {
      type: Object,
      value: function() {
        return {};
      }
    }
  },

  observers: ['_resetKeyEventListeners(keyEventTarget, _boundKeyHandlers)'],


  /**
   * To be used to express what combination of keys  will trigger the relative
   * callback. e.g. `keyBindings: { 'esc': '_onEscPressed'}`
   * @type {!Object}
   */
  keyBindings: {},

  registered: function() {
    this._prepKeyBindings();
  },

  attached: function() {
    this._listenKeyEventListeners();
  },

  detached: function() {
    this._unlistenKeyEventListeners();
  },

  /**
   * Can be used to imperatively add a key binding to the implementing
   * element. This is the imperative equivalent of declaring a keybinding
   * in the `keyBindings` prototype property.
   *
   * @param {string} eventString
   * @param {string} handlerName
   */
  addOwnKeyBinding: function(eventString, handlerName) {
    this._imperativeKeyBindings[eventString] = handlerName;
    this._prepKeyBindings();
    this._resetKeyEventListeners();
  },

  /**
   * When called, will remove all imperatively-added key bindings.
   */
  removeOwnKeyBindings: function() {
    this._imperativeKeyBindings = {};
    this._prepKeyBindings();
    this._resetKeyEventListeners();
  },

  /**
   * Returns true if a keyboard event matches `eventString`.
   *
   * @param {KeyboardEvent} event
   * @param {string} eventString
   * @return {boolean}
   */
  keyboardEventMatchesKeys: function(event, eventString) {
    var keyCombos = parseEventString(eventString);
    for (var i = 0; i < keyCombos.length; ++i) {
      if (keyComboMatchesEvent(keyCombos[i], event)) {
        return true;
      }
    }
    return false;
  },

  _collectKeyBindings: function() {
    var keyBindings = this.behaviors.map(function(behavior) {
      return behavior.keyBindings;
    });

    if (keyBindings.indexOf(this.keyBindings) === -1) {
      keyBindings.push(this.keyBindings);
    }

    return keyBindings;
  },

  _prepKeyBindings: function() {
    this._keyBindings = {};

    this._collectKeyBindings().forEach(function(keyBindings) {
      for (var eventString in keyBindings) {
        this._addKeyBinding(eventString, keyBindings[eventString]);
      }
    }, this);

    for (var eventString in this._imperativeKeyBindings) {
      this._addKeyBinding(
          eventString, this._imperativeKeyBindings[eventString]);
    }

    // Give precedence to combos with modifiers to be checked first.
    for (var eventName in this._keyBindings) {
      this._keyBindings[eventName].sort(function(kb1, kb2) {
        var b1 = kb1[0].hasModifiers;
        var b2 = kb2[0].hasModifiers;
        return (b1 === b2) ? 0 : b1 ? -1 : 1;
      });
    }
  },

  _addKeyBinding: function(eventString, handlerName) {
    parseEventString(eventString).forEach(function(keyCombo) {
      this._keyBindings[keyCombo.event] =
          this._keyBindings[keyCombo.event] || [];

      this._keyBindings[keyCombo.event].push([keyCombo, handlerName]);
    }, this);
  },

  _resetKeyEventListeners: function() {
    this._unlistenKeyEventListeners();

    if (this.isAttached) {
      this._listenKeyEventListeners();
    }
  },

  _listenKeyEventListeners: function() {
    if (!this.keyEventTarget) {
      return;
    }
    Object.keys(this._keyBindings).forEach(function(eventName) {
      var keyBindings = this._keyBindings[eventName];
      var boundKeyHandler = this._onKeyBindingEvent.bind(this, keyBindings);

      this._boundKeyHandlers.push(
          [this.keyEventTarget, eventName, boundKeyHandler]);

      this.keyEventTarget.addEventListener(eventName, boundKeyHandler);
    }, this);
  },

  _unlistenKeyEventListeners: function() {
    var keyHandlerTuple;
    var keyEventTarget;
    var eventName;
    var boundKeyHandler;

    while (this._boundKeyHandlers.length) {
      // My kingdom for block-scope binding and destructuring assignment..
      keyHandlerTuple = this._boundKeyHandlers.pop();
      keyEventTarget = keyHandlerTuple[0];
      eventName = keyHandlerTuple[1];
      boundKeyHandler = keyHandlerTuple[2];

      keyEventTarget.removeEventListener(eventName, boundKeyHandler);
    }
  },

  _onKeyBindingEvent: function(keyBindings, event) {
    if (this.stopKeyboardEventPropagation) {
      event.stopPropagation();
    }

    // if event has been already prevented, don't do anything
    if (event.defaultPrevented) {
      return;
    }

    for (var i = 0; i < keyBindings.length; i++) {
      var keyCombo = keyBindings[i][0];
      var handlerName = keyBindings[i][1];
      if (keyComboMatchesEvent(keyCombo, event)) {
        this._triggerKeyHandler(keyCombo, handlerName, event);
        // exit the loop if eventDefault was prevented
        if (event.defaultPrevented) {
          return;
        }
      }
    }
  },

  _triggerKeyHandler: function(keyCombo, handlerName, keyboardEvent) {
    var detail = Object.create(keyCombo);
    detail.keyboardEvent = keyboardEvent;
    var event =
        new CustomEvent(keyCombo.event, {detail: detail, cancelable: true});
    this[handlerName].call(this, event);
    if (event.defaultPrevented) {
      keyboardEvent.preventDefault();
    }
  }
};

/**
@license
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/

/**
`iron-a11y-announcer` is a singleton element that is intended to add a11y
to features that require on-demand announcement from screen readers. In
order to make use of the announcer, it is best to request its availability
in the announcing element.

Example:

    Polymer({

      is: 'x-chatty',

      attached: function() {
        // This will create the singleton element if it has not
        // been created yet:
        Polymer.IronA11yAnnouncer.requestAvailability();
      }
    });

After the `iron-a11y-announcer` has been made available, elements can
make announces by firing bubbling `iron-announce` events.

Example:

    this.fire('iron-announce', {
      text: 'This is an announcement!'
    }, { bubbles: true });

Note: announcements are only audible if you have a screen reader enabled.

@demo demo/index.html
*/
const IronA11yAnnouncer = Polymer({
  /** @override */
  _template: html`
    <style>
      :host {
        display: inline-block;
        position: fixed;
        clip: rect(0px,0px,0px,0px);
      }
    </style>
    <div aria-live$="[[mode]]">[[_text]]</div>
`,

  is: 'iron-a11y-announcer',

  properties: {

    /**
     * The value of mode is used to set the `aria-live` attribute
     * for the element that will be announced. Valid values are: `off`,
     * `polite` and `assertive`.
     */
    mode: {type: String, value: 'polite'},

    /**
     * The timeout on refreshing the announcement text. Larger timeouts are
     * needed for certain screen readers to re-announce the same message.
     */
    timeout: {type: Number, value: 150},

    _text: {type: String, value: ''},
  },

  /** @override */
  created: function() {
    if (!IronA11yAnnouncer.instance) {
      IronA11yAnnouncer.instance = this;
    }

    document.addEventListener('iron-announce', this._onIronAnnounce.bind(this));
  },

  /**
   * Cause a text string to be announced by screen readers.
   *
   * @param {string} text The text that should be announced.
   */
  announce: function(text) {
    this._text = '';
    this.async(function() {
      this._text = text;
    }, this.timeout);
  },

  _onIronAnnounce: function(event) {
    if (event.detail && event.detail.text) {
      this.announce(event.detail.text);
    }
  }
});

IronA11yAnnouncer.instance = null;

IronA11yAnnouncer.requestAvailability = function() {
  if (!IronA11yAnnouncer.instance) {
    IronA11yAnnouncer.instance = document.createElement('iron-a11y-announcer');
  }

  if (document.body) {
    document.body.appendChild(IronA11yAnnouncer.instance);
  } else {
    document.addEventListener('load', function() {
      document.body.appendChild(IronA11yAnnouncer.instance);
    });
  }
};

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/** @private */
const DatePickerHelper = class VaadinDatePickerHelper {
  /**
   * Get ISO 8601 week number for the given date.
   *
   * @param {Date} Date object
   * @return {Number} Week number
   */
  static _getISOWeekNumber(date) {
    // Ported from Vaadin Framework method com.vaadin.client.DateTimeService.getISOWeekNumber(date)
    var dayOfWeek = date.getDay(); // 0 == sunday

    // ISO 8601 use weeks that start on monday so we use
    // mon=1,tue=2,...sun=7;
    if (dayOfWeek === 0) {
      dayOfWeek = 7;
    }
    // Find nearest thursday (defines the week in ISO 8601). The week number
    // for the nearest thursday is the same as for the target date.
    var nearestThursdayDiff = 4 - dayOfWeek; // 4 is thursday
    var nearestThursday = new Date(date.getTime() + nearestThursdayDiff * 24 * 3600 * 1000);

    var firstOfJanuary = new Date(0, 0);
    firstOfJanuary.setFullYear(nearestThursday.getFullYear());

    var timeDiff = nearestThursday.getTime() - firstOfJanuary.getTime();

    // Rounding the result, as the division doesn't result in an integer
    // when the given date is inside daylight saving time period.
    var daysSinceFirstOfJanuary = Math.round(timeDiff / (24 * 3600 * 1000));

    return Math.floor((daysSinceFirstOfJanuary) / 7 + 1);
  }

  /**
   * Check if two dates are equal.
   *
   * @param {Date} date1
   * @param {Date} date2
   * @return {Boolean} True if the given date objects refer to the same date
   */
  static _dateEquals(date1, date2) {
    return date1 instanceof Date && date2 instanceof Date &&
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate();
  }

  /**
   * Check if the given date is in the range of allowed dates.
   *
   * @param {Date} date The date to check
   * @param {Date} min Range start
   * @param {Date} max Range end
   * @return {Boolean} True if the date is in the range
   */
  static _dateAllowed(date, min, max) {
    return (!min || date >= min) && (!max || date <= max);
  }

  /**
   * Get closest date from array of dates.
   *
   * @param {Date} date The date to compare dates with
   * @param {Array} dates Array of date objects
   * @return {Date} Closest date
   */
  static _getClosestDate(date, dates) {
    return dates.filter(date => date !== undefined)
      .reduce((closestDate, candidate) => {
        if (!candidate) {
          return closestDate;
        }

        if (!closestDate) {
          return candidate;
        }

        var candidateDiff = Math.abs(date.getTime() - candidate.getTime());
        var closestDateDiff = Math.abs(closestDate.getTime() - date.getTime());
        return candidateDiff < closestDateDiff ? candidate : closestDate;
      });
  }

  /**
   * Extracts the basic component parts of a date (day, month and year)
   * to the expected format.
   */
  static _extractDateParts(date) {
    return {
      day: date.getDate(),
      month: date.getMonth(),
      year: date.getFullYear()
    };
  }
};

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/**
 * @extends PolymerElement
 * @private
 */
class MonthCalendarElement extends ThemableMixin(GestureEventListeners(PolymerElement)) {
  static get template() {
    return html`
    <style>
      :host {
        display: block;
      }

      [part="weekdays"],
      #days {
        display: flex;
        flex-wrap: wrap;
        flex-grow: 1;
      }

      #days-container,
      #weekdays-container {
        display: flex;
      }

      [part="week-numbers"] {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        flex-shrink: 0;
      }

      [part="week-numbers"][hidden],
      [part="weekday"][hidden] {
        display: none;
      }

      [part="weekday"],
      [part="date"] {
        /* Would use calc(100% / 7) but it doesn't work nice on IE */
        width: 14.285714286%;
      }

      [part="weekday"]:empty,
      [part="week-numbers"] {
        width: 12.5%;
        flex-shrink: 0;
      }
    </style>

    <div part="month-header" role="heading">[[_getTitle(month, i18n.monthNames)]]</div>
    <div id="monthGrid" on-tap="_handleTap" on-touchend="_preventDefault" on-touchstart="_onMonthGridTouchStart">
      <div id="weekdays-container">
        <div hidden="[[!_showWeekSeparator(showWeekNumbers, i18n.firstDayOfWeek)]]" part="weekday"></div>
        <div part="weekdays">
          <template is="dom-repeat" items="[[_getWeekDayNames(i18n.weekdays, i18n.weekdaysShort, showWeekNumbers, i18n.firstDayOfWeek)]]">
            <div part="weekday" role="heading" aria-label\$="[[item.weekDay]]">[[item.weekDayShort]]</div>
          </template>
        </div>
      </div>
      <div id="days-container">
        <div part="week-numbers" hidden="[[!_showWeekSeparator(showWeekNumbers, i18n.firstDayOfWeek)]]">
          <template is="dom-repeat" items="[[_getWeekNumbers(_days)]]">
            <div part="week-number" role="heading" aria-label\$="[[i18n.week]] [[item]]">[[item]]</div>
          </template>
        </div>
        <div id="days">
          <template is="dom-repeat" items="[[_days]]">
            <div part="date" today\$="[[_isToday(item)]]" selected\$="[[_dateEquals(item, selectedDate)]]" focused\$="[[_dateEquals(item, focusedDate)]]" date="[[item]]" disabled\$="[[!_dateAllowed(item, minDate, maxDate)]]" role\$="[[_getRole(item)]]" aria-label\$="[[_getAriaLabel(item)]]" aria-disabled\$="[[_getAriaDisabled(item, minDate, maxDate)]]">[[_getDate(item)]]</div>
          </template>
        </div>
      </div>
    </div>
`;
  }

  static get is() {
    return 'vaadin-month-calendar';
  }

  static get properties() {
    return {
      /**
       * A `Date` object defining the month to be displayed. Only year and
       * month properties are actually used.
       */
      month: {
        type: Date,
        value: new Date()
      },

      /**
       * A `Date` object for the currently selected date.
       */
      selectedDate: {
        type: Date,
        notify: true
      },

      /**
       * A `Date` object for the currently focused date.
       */
      focusedDate: Date,

      showWeekNumbers: {
        type: Boolean,
        value: false
      },

      i18n: {
        type: Object
      },

      /**
       * Flag stating whether taps on the component should be ignored.
       */
      ignoreTaps: Boolean,

      _notTapping: Boolean,

      /**
       * The earliest date that can be selected. All earlier dates will be disabled.
       */
      minDate: {
        type: Date,
        value: null
      },

      /**
       * The latest date that can be selected. All later dates will be disabled.
       */
      maxDate: {
        type: Date,
        value: null
      },

      _days: {
        type: Array,
        computed: '_getDays(month, i18n.firstDayOfWeek, minDate, maxDate)'
      },

      disabled: {
        type: Boolean,
        reflectToAttribute: true,
        computed: '_isDisabled(month, minDate, maxDate)'
      }
    };
  }

  static get observers() {
    return [
      '_showWeekNumbersChanged(showWeekNumbers, i18n.firstDayOfWeek)'
    ];
  }

  _dateEquals(date1, date2) {
    return DatePickerHelper._dateEquals(date1, date2);
  }

  _dateAllowed(date, min, max) {
    return DatePickerHelper._dateAllowed(date, min, max);
  }

  /* Returns true if all the dates in the month are out of the allowed range */
  _isDisabled(month, minDate, maxDate) {
    // First day of the month
    var firstDate = new Date(0, 0);
    firstDate.setFullYear(month.getFullYear());
    firstDate.setMonth(month.getMonth());
    firstDate.setDate(1);

    // Last day of the month
    var lastDate = new Date(0, 0);
    lastDate.setFullYear(month.getFullYear());
    lastDate.setMonth(month.getMonth() + 1);
    lastDate.setDate(0);

    if ((minDate && maxDate)
      && minDate.getMonth() === maxDate.getMonth()
      && minDate.getMonth() === month.getMonth()
      && maxDate.getDate() - minDate.getDate() >= 0) {
      return false;
    }

    return !this._dateAllowed(firstDate, minDate, maxDate)
      && !this._dateAllowed(lastDate, minDate, maxDate);
  }

  _getTitle(month, monthNames) {
    if (month === undefined || monthNames === undefined) {
      return;
    }
    return this.i18n.formatTitle(monthNames[month.getMonth()], month.getFullYear());
  }

  _onMonthGridTouchStart() {
    this._notTapping = false;
    setTimeout(() => this._notTapping = true, 300);
  }

  _dateAdd(date, delta) {
    date.setDate(date.getDate() + delta);
  }

  _applyFirstDayOfWeek(weekDayNames, firstDayOfWeek) {
    if (weekDayNames === undefined || firstDayOfWeek === undefined) {
      return;
    }

    return weekDayNames.slice(firstDayOfWeek).concat(weekDayNames.slice(0, firstDayOfWeek));
  }

  _getWeekDayNames(weekDayNames, weekDayNamesShort, showWeekNumbers, firstDayOfWeek) {
    if (weekDayNames === undefined || weekDayNamesShort === undefined ||
      showWeekNumbers === undefined || firstDayOfWeek === undefined) {
      return;
    }
    weekDayNames = this._applyFirstDayOfWeek(weekDayNames, firstDayOfWeek);
    weekDayNamesShort = this._applyFirstDayOfWeek(weekDayNamesShort, firstDayOfWeek);
    weekDayNames = weekDayNames.map((day, index) => {
      return {
        weekDay: day,
        weekDayShort: weekDayNamesShort[index]
      };
    });

    return weekDayNames;
  }

  _getDate(date) {
    return date ? date.getDate() : '';
  }

  _showWeekNumbersChanged(showWeekNumbers, firstDayOfWeek) {
    if (showWeekNumbers && firstDayOfWeek === 1) {
      this.setAttribute('week-numbers', '');
    } else {
      this.removeAttribute('week-numbers');
    }
  }

  _showWeekSeparator(showWeekNumbers, firstDayOfWeek) {
    // Currently only supported for locales that start the week on Monday.
    return showWeekNumbers && firstDayOfWeek === 1;
  }

  _isToday(date) {
    return this._dateEquals(new Date(), date);
  }

  _getDays(month, firstDayOfWeek) {
    if (month === undefined || firstDayOfWeek === undefined) {
      return;
    }
    // First day of the month (at midnight).
    var date = new Date(0, 0);
    date.setFullYear(month.getFullYear());
    date.setMonth(month.getMonth());
    date.setDate(1);

    // Rewind to first day of the week.
    while (date.getDay() !== firstDayOfWeek) {
      this._dateAdd(date, -1);
    }

    var days = [];
    var startMonth = date.getMonth();
    var targetMonth = month.getMonth();
    while (date.getMonth() === targetMonth || date.getMonth() === startMonth) {
      days.push(date.getMonth() === targetMonth ? new Date(date.getTime()) : null);

      // Advance to next day.
      this._dateAdd(date, 1);
    }
    return days;
  }

  _getWeekNumber(date, days) {
    if (date === undefined || days === undefined) {
      return;
    }

    if (!date) {
      // Get the first non-null date from the days array.
      date = days.reduce((acc, d) => {
        return !acc && d ? d : acc;
      });
    }

    return DatePickerHelper._getISOWeekNumber(date);
  }

  _getWeekNumbers(dates) {
    return dates
      .map(date => this._getWeekNumber(date, dates))
      .filter((week, index, arr) => arr.indexOf(week) === index);
  }

  _handleTap(e) {
    if (!this.ignoreTaps && !this._notTapping && e.target.date && !e.target.hasAttribute('disabled')) {
      this.selectedDate = e.target.date;
      this.dispatchEvent(new CustomEvent('date-tap', {bubbles: true, composed: true}));
    }
  }

  _preventDefault(e) {
    e.preventDefault();
  }

  _getRole(date) {
    return date ? 'button' : 'presentation';
  }

  _getAriaLabel(date) {
    if (!date) {
      return '';
    }

    var ariaLabel = this._getDate(date) + ' ' +
      this.i18n.monthNames[date.getMonth()] + ' ' +
      date.getFullYear() + ', ' +
      this.i18n.weekdays[date.getDay()];

    if (this._isToday(date)) {
      ariaLabel += ', ' + this.i18n.today;
    }

    return ariaLabel;
  }

  _getAriaDisabled(date, min, max) {
    if (date === undefined || min === undefined || max === undefined) {
      return;
    }
    return this._dateAllowed(date, min, max) ? 'false' : 'true';
  }
}

customElements.define(MonthCalendarElement.is, MonthCalendarElement);

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/**
 * @extends PolymerElement
 * @private
 */
class InfiniteScrollerElement extends PolymerElement {
  static get template() {
    return html`
    <style>
      :host {
        display: block;
        overflow: hidden;
        height: 500px;
      }

      #scroller {
        position: relative;
        height: 100%;
        overflow: auto;
        outline: none;
        margin-right: -40px;
        -webkit-overflow-scrolling: touch;
        -ms-overflow-style: none;
        overflow-x: hidden;
      }

      #scroller.notouchscroll {
        -webkit-overflow-scrolling: auto;
      }

      #scroller::-webkit-scrollbar {
        display: none;
      }

      .buffer {
        position: absolute;
        width: var(--vaadin-infinite-scroller-buffer-width, 100%);
        box-sizing: border-box;
        padding-right: 40px;
        top: var(--vaadin-infinite-scroller-buffer-offset, 0);
        animation: fadein 0.2s;
      }

      @keyframes fadein {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    </style>

    <div id="scroller" on-scroll="_scroll">
      <div class="buffer"></div>
      <div class="buffer"></div>
      <div id="fullHeight"></div>
    </div>
`;
  }

  static get is() {
    return 'vaadin-infinite-scroller';
  }

  static get properties() {
    return {

      /**
       * Count of individual items in each buffer.
       * The scroller has 2 buffers altogether so bufferSize of 20
       * will result in 40 buffered DOM items in total.
       * Changing after initialization not supported.
       */
      bufferSize: {
        type: Number,
        value: 20
      },

      /**
       * The amount of initial scroll top. Needed in order for the
       * user to be able to scroll backwards.
       */
      _initialScroll: {
        value: 500000
      },

      /**
       * The index/position mapped at _initialScroll point.
       */
      _initialIndex: {
        value: 0
      },

      _buffers: Array,

      _preventScrollEvent: Boolean,

      _mayHaveMomentum: Boolean,

      _initialized: Boolean,

      active: {
        type: Boolean,
        observer: '_activated'
      }
    };
  }

  ready() {
    super.ready();

    this._buffers = Array.prototype.slice.call(this.root.querySelectorAll('.buffer'));

    this.$.fullHeight.style.height = this._initialScroll * 2 + 'px';

    var tpl = this.querySelector('template');
    this._TemplateClass = templatize(tpl, this, {
      forwardHostProp: function(prop, value) {
        if (prop !== 'index') {
          this._buffers.forEach(buffer => {
            [].forEach.call(buffer.children, insertionPoint => {
              insertionPoint._itemWrapper.instance[prop] = value;
            });
          });
        }
      }
    });

    // Firefox interprets elements with overflow:auto as focusable
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1069739
    var isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    if (isFirefox) {
      this.$.scroller.tabIndex = -1;
    }
  }

  _activated(active) {
    if (active && !this._initialized) {
      this._createPool();
      this._initialized = true;
    }
  }

  _finishInit() {
    if (!this._initDone) {
      // Once the first set of items start fading in, stamp the rest
      this._buffers.forEach(buffer => {
        [].forEach.call(buffer.children,
          insertionPoint => this._ensureStampedInstance(insertionPoint._itemWrapper));
      }, this);

      if (!this._buffers[0].translateY) {
        this._reset();
      }

      this._initDone = true;
    }
  }

  _translateBuffer(up) {
    var index = up ? 1 : 0;
    this._buffers[index].translateY = this._buffers[(index ? 0 : 1)].translateY + this._bufferHeight * (index ? -1 : 1);
    this._buffers[index].style.transform = 'translate3d(0, ' + this._buffers[index].translateY + 'px, 0)';
    this._buffers[index].updated = false;
    this._buffers.reverse();
  }

  _scroll() {
    if (this._scrollDisabled) {
      return;
    }

    var scrollTop = this.$.scroller.scrollTop;
    if (scrollTop < this._bufferHeight || scrollTop > this._initialScroll * 2 - this._bufferHeight) {
      // Scrolled near the end/beginning of the scrollable area -> reset.
      this._initialIndex = ~~this.position;
      this._reset();
    }

    // Check if we scrolled enough to translate the buffer positions.
    var bufferOffset = this.root.querySelector('.buffer').offsetTop;
    var upperThresholdReached = scrollTop > this._buffers[1].translateY + this.itemHeight + bufferOffset;
    var lowerThresholdReached = scrollTop < this._buffers[0].translateY + this.itemHeight + bufferOffset;

    if (upperThresholdReached || lowerThresholdReached) {
      this._translateBuffer(lowerThresholdReached);
      this._updateClones();
    }

    if (!this._preventScrollEvent) {
      this.dispatchEvent(new CustomEvent('custom-scroll', {bubbles: false, composed: true}));
      this._mayHaveMomentum = true;
    }
    this._preventScrollEvent = false;

    this._debouncerScrollFinish = Debouncer.debounce(this._debouncerScrollFinish,
      timeOut.after(200), () => {
        var scrollerRect = this.$.scroller.getBoundingClientRect();
        if (!this._isVisible(this._buffers[0], scrollerRect) && !this._isVisible(this._buffers[1], scrollerRect)) {
          this.position = this.position;
        }
      });
  }

  /**
   * Current scroller position as index. Can be a fractional number.
   *
   * @type {Number}
   */
  set position(index) {
    this._preventScrollEvent = true;
    if (index > this._firstIndex && index < this._firstIndex + this.bufferSize * 2) {
      this.$.scroller.scrollTop = this.itemHeight * (index - this._firstIndex) + this._buffers[0].translateY;
    } else {
      this._initialIndex = ~~index;
      this._reset();
      this._scrollDisabled = true;
      this.$.scroller.scrollTop += index % 1 * this.itemHeight;
      this._scrollDisabled = false;
    }

    if (this._mayHaveMomentum) {
      // Stop the possible iOS Safari momentum with -webkit-overflow-scrolling: auto;
      this.$.scroller.classList.add('notouchscroll');
      this._mayHaveMomentum = false;

      setTimeout(() => {
        // Restore -webkit-overflow-scrolling: touch; after a small delay.
        this.$.scroller.classList.remove('notouchscroll');
      }, 10);
    }

  }

  /**
   * @private
   */
  get position() {
    return (this.$.scroller.scrollTop - this._buffers[0].translateY) / this.itemHeight + this._firstIndex;
  }

  get itemHeight() {
    if (!this._itemHeightVal) {
      if (!(window.ShadyCSS && window.ShadyCSS.nativeCss)) {
        this.updateStyles();
      }

      const itemHeight = window.ShadyCSS
        ? window.ShadyCSS.getComputedStyleValue(this, '--vaadin-infinite-scroller-item-height')
        : getComputedStyle(this).getPropertyValue('--vaadin-infinite-scroller-item-height');
      // Use background-position temp inline style for unit conversion
      const tmpStyleProp = 'background-position';
      this.$.fullHeight.style.setProperty(tmpStyleProp, itemHeight);
      const itemHeightPx = getComputedStyle(this.$.fullHeight).getPropertyValue(tmpStyleProp);
      this.$.fullHeight.style.removeProperty(tmpStyleProp);
      this._itemHeightVal = parseFloat(itemHeightPx);
    }

    return this._itemHeightVal;
  }

  get _bufferHeight() {
    return this.itemHeight * this.bufferSize;
  }

  _reset() {
    this._scrollDisabled = true;
    this.$.scroller.scrollTop = this._initialScroll;
    this._buffers[0].translateY = this._initialScroll - this._bufferHeight;
    this._buffers[1].translateY = this._initialScroll;
    this._buffers.forEach(buffer => {
      buffer.style.transform = 'translate3d(0, ' + buffer.translateY + 'px, 0)';
    });
    this._buffers[0].updated = this._buffers[1].updated = false;
    this._updateClones(true);

    this._debouncerUpdateClones = Debouncer.debounce(
      this._debouncerUpdateClones,
      timeOut.after(200), () => {
        this._buffers[0].updated = this._buffers[1].updated = false;
        this._updateClones();
      });

    this._scrollDisabled = false;
  }

  _createPool() {
    var container = this.getBoundingClientRect();
    this._buffers.forEach(buffer => {
      for (var i = 0; i < this.bufferSize; i++) {
        const itemWrapper = document.createElement('div');
        itemWrapper.style.height = this.itemHeight + 'px';
        itemWrapper.instance = {};

        const contentId = InfiniteScrollerElement._contentIndex = InfiniteScrollerElement._contentIndex + 1 || 0;
        const slotName = 'vaadin-infinite-scroller-item-content-' + contentId;

        const insertionPoint = document.createElement('slot');
        insertionPoint.setAttribute('name', slotName);
        insertionPoint._itemWrapper = itemWrapper;
        buffer.appendChild(insertionPoint);

        itemWrapper.setAttribute('slot', slotName);
        this.appendChild(itemWrapper);

        // This is needed by IE
        flush();

        setTimeout(() => {
          // Only stamp the visible instances first
          if (this._isVisible(itemWrapper, container)) {
            this._ensureStampedInstance(itemWrapper);
          }
        }, 1); // Wait for first reset
      }
    }, this);

    setTimeout(() => {
      afterNextRender(this, this._finishInit.bind(this));
    }, 1);
  }

  _ensureStampedInstance(itemWrapper) {
    if (itemWrapper.firstElementChild) {
      return;
    }

    var tmpInstance = itemWrapper.instance;

    itemWrapper.instance = new this._TemplateClass({});
    itemWrapper.appendChild(itemWrapper.instance.root);

    Object.keys(tmpInstance).forEach(prop => {
      itemWrapper.instance.set(prop, tmpInstance[prop]);
    });
  }

  _updateClones(viewPortOnly) {
    this._firstIndex = ~~((this._buffers[0].translateY - this._initialScroll) / this.itemHeight) + this._initialIndex;

    var scrollerRect = viewPortOnly ? this.$.scroller.getBoundingClientRect() : undefined;
    this._buffers.forEach((buffer, bufferIndex) => {
      if (!buffer.updated) {
        var firstIndex = this._firstIndex + this.bufferSize * bufferIndex;

        [].forEach.call(buffer.children, (insertionPoint, index) => {
          const itemWrapper = insertionPoint._itemWrapper;
          if (!viewPortOnly || this._isVisible(itemWrapper, scrollerRect)) {
            itemWrapper.instance.index = firstIndex + index;
          }
        });
        buffer.updated = true;
      }
    }, this);
  }

  _isVisible(element, container) {
    var rect = element.getBoundingClientRect();
    return rect.bottom > container.top && rect.top < container.bottom;
  }
}

customElements.define(InfiniteScrollerElement.is, InfiniteScrollerElement);

const $_documentContainer$j = document.createElement('template');

$_documentContainer$j.innerHTML = `<dom-module id="vaadin-date-picker-overlay-styles" theme-for="vaadin-date-picker-overlay">
  <template>
    <style>
      :host {
        align-items: flex-start;
        justify-content: flex-start;
      }

      :host([bottom-aligned]) {
        justify-content: flex-end;
      }

      :host([right-aligned]) {
        align-items: flex-end;
      }

      :host([dir="rtl"]) {
        align-items: flex-end;
      }

      :host([dir="rtl"][right-aligned]) {
        align-items: flex-start;
      }

      [part="overlay"] {
        display: flex;
        flex: auto;
      }

      [part~="content"] {
        flex: auto;
      }
    </style>
  </template>
</dom-module>`;

document.head.appendChild($_documentContainer$j.content);

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/**
 * @extends PolymerElement
 * @private
 */
class DatePickerOverlayContentElement extends
  ThemableMixin(
    DirMixin(
      GestureEventListeners(PolymerElement))) {
  static get template() {
    return html`
    <style>
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        outline: none;
        background: #fff;
      }

      [part="overlay-header"] {
        display: flex;
        flex-shrink: 0;
        flex-wrap: nowrap;
        align-items: center;
      }

      :host(:not([fullscreen])) [part="overlay-header"] {
        display: none;
      }

      [part="label"] {
        flex-grow: 1;
      }

      [part="clear-button"]:not([showclear]) {
        display: none;
      }

      [part="years-toggle-button"] {
        display: flex;
      }

      [part="years-toggle-button"][desktop] {
        display: none;
      }

      :host(:not([years-visible])) [part="years-toggle-button"]::before {
        transform: rotate(180deg);
      }

      #scrollers {
        display: flex;
        height: 100%;
        width: 100%;
        position: relative;
        overflow: hidden;
      }

      [part="months"],
      [part="years"] {
        height: 100%;
      }

      [part="months"] {
        --vaadin-infinite-scroller-item-height: 270px;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }

      #scrollers[desktop] [part="months"] {
        right: 50px;
        transform: none !important;
      }

      [part="years"] {
        --vaadin-infinite-scroller-item-height: 80px;
        width: 50px;
        position: absolute;
        right: 0;
        transform: translateX(100%);
        -webkit-tap-highlight-color: transparent;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        /* Center the year scroller position. */
        --vaadin-infinite-scroller-buffer-offset: 50%;
      }

      #scrollers[desktop] [part="years"] {
        position: absolute;
        transform: none !important;
      }

      [part="years"]::before {
        content: '';
        display: block;
        background: transparent;
        width: 0;
        height: 0;
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        border-width: 6px;
        border-style: solid;
        border-color: transparent;
        border-left-color: #000;
      }

      :host(.animate) [part="months"],
      :host(.animate) [part="years"] {
        transition: all 200ms;
      }

      [part="toolbar"] {
        display: flex;
        justify-content: space-between;
        z-index: 2;
        flex-shrink: 0;
      }

      [part~="overlay-header"]:not([desktop]) {
        padding-bottom: 40px;
      }

      [part~="years-toggle-button"] {
        position: absolute;
        top: auto;
        right: 8px;
        bottom: 0;
        z-index: 1;
        padding: 8px;
      }

      #announcer {
        display: inline-block;
        position: fixed;
        clip: rect(0, 0, 0, 0);
        clip-path: inset(100%);
      }
    </style>

    <div id="announcer" role="alert" aria-live="polite">
      [[i18n.calendar]]
    </div>

    <div part="overlay-header" on-touchend="_preventDefault" desktop\$="[[_desktopMode]]" aria-hidden="true">
      <div part="label">[[_formatDisplayed(selectedDate, i18n.formatDate, label)]]</div>
      <div part="clear-button" on-tap="_clear" showclear\$="[[_showClear(selectedDate)]]"></div>
      <div part="toggle-button" on-tap="_cancel"></div>

      <div part="years-toggle-button" desktop\$="[[_desktopMode]]" on-tap="_toggleYearScroller" aria-hidden="true">
        [[_yearAfterXMonths(_visibleMonthIndex)]]
      </div>
    </div>

    <div id="scrollers" desktop\$="[[_desktopMode]]" on-track="_track">
      <vaadin-infinite-scroller id="monthScroller" on-custom-scroll="_onMonthScroll" on-touchstart="_onMonthScrollTouchStart" buffer-size="3" active="[[initialPosition]]" part="months">
        <template>
          <vaadin-month-calendar i18n="[[i18n]]" month="[[_dateAfterXMonths(index)]]" selected-date="{{selectedDate}}" focused-date="[[focusedDate]]" ignore-taps="[[_ignoreTaps]]" show-week-numbers="[[showWeekNumbers]]" min-date="[[minDate]]" max-date="[[maxDate]]" focused\$="[[_focused]]" part="month" theme\$="[[theme]]">
          </vaadin-month-calendar>
        </template>
      </vaadin-infinite-scroller>
      <vaadin-infinite-scroller id="yearScroller" on-tap="_onYearTap" on-custom-scroll="_onYearScroll" on-touchstart="_onYearScrollTouchStart" buffer-size="12" active="[[initialPosition]]" part="years">
        <template>
          <div part="year-number" role="button" current\$="[[_isCurrentYear(index)]]" selected\$="[[_isSelectedYear(index, selectedDate)]]">
            [[_yearAfterXYears(index)]]
          </div>
          <div part="year-separator" aria-hidden="true"></div>
        </template>
      </vaadin-infinite-scroller>
    </div>

    <div on-touchend="_preventDefault" role="toolbar" part="toolbar">
      <vaadin-button id="todayButton" theme="tertiary" part="today-button" disabled="[[!_isTodayAllowed(minDate, maxDate)]]" on-tap="_onTodayTap">
        [[i18n.today]]
      </vaadin-button>
      <vaadin-button id="cancelButton" theme="tertiary" part="cancel-button" on-tap="_cancel">
        [[i18n.cancel]]
      </vaadin-button>
    </div>

    <iron-media-query query="(min-width: 375px)" query-matches="{{_desktopMode}}"></iron-media-query>
`;
  }

  static get is() {
    return 'vaadin-date-picker-overlay-content';
  }

  static get properties() {
    return {
      /**
       * The value for this element.
       */
      selectedDate: {
        type: Date,
        notify: true
      },

      /**
       * Date value which is focused using keyboard.
       */
      focusedDate: {
        type: Date,
        notify: true,
        observer: '_focusedDateChanged'
      },

      _focusedMonthDate: Number,

      /**
       * Date which should be visible when there is no value selected.
       */
      initialPosition: {
        type: Date,
        observer: '_initialPositionChanged'
      },

      _originDate: {
        value: new Date()
      },

      _visibleMonthIndex: Number,

      _desktopMode: Boolean,

      _translateX: {
        observer: '_translateXChanged'
      },

      _yearScrollerWidth: {
        value: 50
      },

      i18n: {
        type: Object
      },

      showWeekNumbers: {
        type: Boolean
      },

      _ignoreTaps: Boolean,

      _notTapping: Boolean,

      /**
       * The earliest date that can be selected. All earlier dates will be disabled.
       */
      minDate: Date,

      /**
       * The latest date that can be selected. All later dates will be disabled.
       */
      maxDate: Date,

      _focused: Boolean,

      /**
       * Input label
       */
      label: String
    };
  }

  get __isRTL() {
    return this.getAttribute('dir') === 'rtl';
  }

  ready() {
    super.ready();
    this.setAttribute('tabindex', 0);
    this.addEventListener('keydown', this._onKeydown.bind(this));
    addListener(this, 'tap', this._stopPropagation);
    this.addEventListener('focus', this._onOverlayFocus.bind(this));
    this.addEventListener('blur', this._onOverlayBlur.bind(this));
  }

  /**
   * Fired when the scroller reaches the target scrolling position.
   * @event scroll-animation-finished
   * @param {Number} detail.position new position
   * @param {Number} detail.oldPosition old position
   */

  connectedCallback() {
    super.connectedCallback();
    this._closeYearScroller();
    this._toggleAnimateClass(true);
    setTouchAction(this.$.scrollers, 'pan-y');
    IronA11yAnnouncer.requestAvailability();
  }

  announceFocusedDate() {
    var focusedDate = this._currentlyFocusedDate();
    var announce = [];
    if (DatePickerHelper._dateEquals(focusedDate, new Date())) {
      announce.push(this.i18n.today);
    }
    announce = announce.concat([
      this.i18n.weekdays[focusedDate.getDay()],
      focusedDate.getDate(),
      this.i18n.monthNames[focusedDate.getMonth()],
      focusedDate.getFullYear()
    ]);
    if (this.showWeekNumbers && this.i18n.firstDayOfWeek === 1) {
      announce.push(this.i18n.week);
      announce.push(DatePickerHelper._getISOWeekNumber(focusedDate));
    }
    this.dispatchEvent(new CustomEvent('iron-announce', {
      bubbles: true,
      composed: true,
      detail: {
        text: announce.join(' ')
      }
    }));
    return;
  }

  /**
   * Focuses the cancel button
   */
  focusCancel() {
    this.$.cancelButton.focus();
  }

  /**
   * Scrolls the list to the given Date.
   */
  scrollToDate(date, animate) {
    this._scrollToPosition(this._differenceInMonths(date, this._originDate), animate);
  }

  _focusedDateChanged(focusedDate) {
    this.revealDate(focusedDate);
  }

  _isCurrentYear(yearsFromNow) {
    return yearsFromNow === 0;
  }

  _isSelectedYear(yearsFromNow, selectedDate) {
    if (selectedDate) {
      return selectedDate.getFullYear() === this._originDate.getFullYear() + yearsFromNow;
    }
  }

  /**
   * Scrolls the month and year scrollers enough to reveal the given date.
   */
  revealDate(date) {
    if (date) {
      var diff = this._differenceInMonths(date, this._originDate);
      var scrolledAboveViewport = this.$.monthScroller.position > diff;

      var visibleItems = this.$.monthScroller.clientHeight / this.$.monthScroller.itemHeight;
      var scrolledBelowViewport = this.$.monthScroller.position + visibleItems - 1 < diff;

      if (scrolledAboveViewport) {
        this._scrollToPosition(diff, true);
      } else if (scrolledBelowViewport) {
        this._scrollToPosition(diff - visibleItems + 1, true);
      }
    }
  }

  _onOverlayFocus() {
    this._focused = true;
  }

  _onOverlayBlur() {
    this._focused = false;
  }

  _initialPositionChanged(initialPosition) {
    this.scrollToDate(initialPosition);
  }

  _repositionYearScroller() {
    this._visibleMonthIndex = Math.floor(this.$.monthScroller.position);
    this.$.yearScroller.position = (this.$.monthScroller.position + this._originDate.getMonth()) / 12;
  }

  _repositionMonthScroller() {
    this.$.monthScroller.position = this.$.yearScroller.position * 12 - this._originDate.getMonth();
    this._visibleMonthIndex = Math.floor(this.$.monthScroller.position);
  }

  _onMonthScroll() {
    this._repositionYearScroller();
    this._doIgnoreTaps();
  }

  _onYearScroll() {
    this._repositionMonthScroller();
    this._doIgnoreTaps();
  }

  _onYearScrollTouchStart() {
    this._notTapping = false;
    setTimeout(() => this._notTapping = true, 300);

    this._repositionMonthScroller();
  }

  _onMonthScrollTouchStart() {
    this._repositionYearScroller();
  }

  _doIgnoreTaps() {
    this._ignoreTaps = true;
    this._debouncer = Debouncer.debounce(this._debouncer,
      timeOut.after(300), () => this._ignoreTaps = false);
  }

  _formatDisplayed(date, formatDate, label) {
    if (date) {
      return formatDate(DatePickerHelper._extractDateParts(date));
    } else {
      return label;
    }
  }

  _onTodayTap() {
    var today = new Date();

    if (Math.abs(this.$.monthScroller.position - this._differenceInMonths(today, this._originDate)) < 0.001) {
      // Select today only if the month scroller is positioned approximately
      // at the beginning of the current month
      this.selectedDate = today;
      this._close();
    } else {
      this._scrollToCurrentMonth();
    }
  }

  _scrollToCurrentMonth() {
    if (this.focusedDate) {
      this.focusedDate = new Date();
    }

    this.scrollToDate(new Date(), true);
  }

  _showClear(selectedDate) {
    return !!selectedDate;
  }

  _onYearTap(e) {
    if (!this._ignoreTaps && !this._notTapping) {
      var scrollDelta = e.detail.y - (this.$.yearScroller.getBoundingClientRect().top + this.$.yearScroller.clientHeight / 2);
      var yearDelta = scrollDelta / this.$.yearScroller.itemHeight;
      this._scrollToPosition(this.$.monthScroller.position + yearDelta * 12, true);
    }
  }

  _scrollToPosition(targetPosition, animate) {
    if (this._targetPosition !== undefined) {
      this._targetPosition = targetPosition;
      return;
    }

    if (!animate) {
      this.$.monthScroller.position = targetPosition;
      this._targetPosition = undefined;
      this._repositionYearScroller();
      return;
    }

    this._targetPosition = targetPosition;

    // http://gizma.com/easing/
    var easingFunction = (t, b, c, d) => {
      t /= d / 2;
      if (t < 1) {
        return c / 2 * t * t + b;
      }
      t--;
      return -c / 2 * (t * (t - 2) - 1) + b;
    };

    var duration = animate ? 300 : 0;
    var start = 0;
    var initialPosition = this.$.monthScroller.position;

    var smoothScroll = timestamp => {
      start = start || timestamp;
      var currentTime = timestamp - start;

      if (currentTime < duration) {
        var currentPos = easingFunction(currentTime, initialPosition, this._targetPosition - initialPosition, duration);
        this.$.monthScroller.position = currentPos;
        window.requestAnimationFrame(smoothScroll);
      } else {
        this.dispatchEvent(new CustomEvent('scroll-animation-finished', {
          bubbles: true,
          composed: true,
          detail: {
            position: this._targetPosition,
            oldPosition: initialPosition
          }
        }));

        this.$.monthScroller.position = this._targetPosition;
        this._targetPosition = undefined;
      }

      setTimeout(this._repositionYearScroller.bind(this), 1);
    };

    // Start the animation.
    window.requestAnimationFrame(smoothScroll);
  }

  _limit(value, range) {
    return Math.min(range.max, Math.max(range.min, value));
  }

  _handleTrack(e) {
    // Check if horizontal movement threshold (dx) not exceeded or
    // scrolling fast vertically (ddy).
    if (Math.abs(e.detail.dx) < 10 || Math.abs(e.detail.ddy) > 10) {
      return;
    }

    // If we're flinging quickly -> start animating already.
    if (Math.abs(e.detail.ddx) > this._yearScrollerWidth / 3) {
      this._toggleAnimateClass(true);
    }

    var newTranslateX = this._translateX + e.detail.ddx;
    this._translateX = this._limit(newTranslateX, {
      min: 0,
      max: this._yearScrollerWidth
    });
  }

  _track(e) {
    if (this._desktopMode) {
      // No need to track for swipe gestures on desktop.
      return;
    }

    switch (e.detail.state) {
      case 'start':
        this._toggleAnimateClass(false);
        break;

      case 'track':
        this._handleTrack(e);
        break;

      case 'end':
        this._toggleAnimateClass(true);
        if (this._translateX >= this._yearScrollerWidth / 2) {
          this._closeYearScroller();
        } else {
          this._openYearScroller();
        }
        break;
    }
  }

  _toggleAnimateClass(enable) {
    if (enable) {
      this.classList.add('animate');
    } else {
      this.classList.remove('animate');
    }
  }

  _toggleYearScroller() {
    this._isYearScrollerVisible() ? this._closeYearScroller() : this._openYearScroller();
  }

  _openYearScroller() {
    this._translateX = 0;
    this.setAttribute('years-visible', '');
  }

  _closeYearScroller() {
    this.removeAttribute('years-visible');
    this._translateX = this._yearScrollerWidth;
  }

  _isYearScrollerVisible() {
    return this._translateX < this._yearScrollerWidth / 2;
  }

  _translateXChanged(x) {
    if (!this._desktopMode) {
      this.$.monthScroller.style.transform = 'translateX(' + (x - this._yearScrollerWidth) + 'px)';
      this.$.yearScroller.style.transform = 'translateX(' + x + 'px)';
    }
  }

  _yearAfterXYears(index) {
    var result = new Date(this._originDate);
    result.setFullYear(parseInt(index) + this._originDate.getFullYear());
    return result.getFullYear();
  }

  _yearAfterXMonths(months) {
    return this._dateAfterXMonths(months).getFullYear();
  }

  _dateAfterXMonths(months) {
    var result = new Date(this._originDate);
    result.setDate(1);
    result.setMonth(parseInt(months) + this._originDate.getMonth());
    return result;
  }

  _differenceInMonths(date1, date2) {
    var months = (date1.getFullYear() - date2.getFullYear()) * 12;
    return months - date2.getMonth() + date1.getMonth();
  }

  _differenceInYears(date1, date2) {
    return this._differenceInMonths(date1, date2) / 12;
  }

  _clear() {
    this.selectedDate = '';
  }

  _close() {
    const overlayContent = this.getRootNode().host;
    const overlay = overlayContent ? overlayContent.getRootNode().host : null;
    if (overlay) {
      overlay.opened = false;
    }

    this.dispatchEvent(new CustomEvent('close', {bubbles: true, composed: true}));
  }

  _cancel() {
    this.focusedDate = this.selectedDate;
    this._close();
  }

  _preventDefault(e) {
    e.preventDefault();
  }

  /**
   * Keyboard Navigation
   */
  _eventKey(e) {
    var keys = ['down', 'up', 'right', 'left', 'enter', 'space', 'home', 'end', 'pageup', 'pagedown', 'tab', 'esc'];

    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (IronA11yKeysBehavior.keyboardEventMatchesKeys(e, k)) {
        return k;
      }
    }
  }

  _onKeydown(e) {
    var focus = this._currentlyFocusedDate();

    // Cannot use (today/cancel).focused flag because vaadin-text-field removes it
    // previously in the keydown event.
    const isToday = e.composedPath().indexOf(this.$.todayButton) >= 0;
    const isCancel = e.composedPath().indexOf(this.$.cancelButton) >= 0;
    const isScroller = !isToday && !isCancel;

    var eventKey = this._eventKey(e);
    if (eventKey === 'tab') {
      // We handle tabs here and don't want to bubble up.
      e.stopPropagation();

      const isFullscreen = this.hasAttribute('fullscreen');
      const isShift = e.shiftKey;

      if (isFullscreen) {
        e.preventDefault();
      } else if (isShift && isScroller || !isShift && isCancel) {
        // Return focus back to the input field
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('focus-input', {bubbles: true, composed: true}));
      } else if (isShift && isToday) {
        // Browser returns focus back to the scrollable area. We need to set
        // the focused flag, and move the scroll to focused date.
        this._focused = true;
        setTimeout(() => this.revealDate(this.focusedDate), 1);
      } else {
        // Browser moves the focus out of the scroller, hence focused flag must
        // set to false.
        this._focused = false;
      }
    } else if (eventKey) {
      e.preventDefault();
      e.stopPropagation();
      switch (eventKey) {
        case 'down':
          this._moveFocusByDays(7);
          this.focus();
          break;
        case 'up':
          this._moveFocusByDays(-7);
          this.focus();
          break;
        case 'right':
          if (isScroller) {
            this._moveFocusByDays(this.__isRTL ? -1 : 1);
          }
          break;
        case 'left':
          if (isScroller) {
            this._moveFocusByDays(this.__isRTL ? 1 : -1);
          }
          break;
        case 'enter':
          if (isScroller || isCancel) {
            this._close();
          } else if (isToday) {
            this._onTodayTap();
          }
          break;
        case 'space':
          if (isCancel) {
            this._close();
          } else if (isToday) {
            this._onTodayTap();
          } else {
            var focusedDate = this.focusedDate;
            if (DatePickerHelper._dateEquals(focusedDate, this.selectedDate)) {
              this.selectedDate = '';
              this.focusedDate = focusedDate;
            } else {
              this.selectedDate = focusedDate;
            }
          }
          break;
        case 'home':
          this._moveFocusInsideMonth(focus, 'minDate');
          break;
        case 'end':
          this._moveFocusInsideMonth(focus, 'maxDate');
          break;
        case 'pagedown':
          this._moveFocusByMonths(e.shiftKey ? 12 : 1);
          break;
        case 'pageup':
          this._moveFocusByMonths(e.shiftKey ? -12 : -1);
          break;
        case 'esc':
          this._cancel();
          break;
      }
    }
  }

  _currentlyFocusedDate() {
    return this.focusedDate || this.selectedDate || this.initialPosition || new Date();
  }

  _focusDate(dateToFocus) {
    this.focusedDate = dateToFocus;
    this._focusedMonthDate = dateToFocus.getDate();
  }

  _focusClosestDate(focus) {
    this._focusDate(DatePickerHelper._getClosestDate(focus, [this.minDate, this.maxDate]));
  }

  _moveFocusByDays(days) {
    var focus = this._currentlyFocusedDate();
    var dateToFocus = new Date(0, 0);
    dateToFocus.setFullYear(focus.getFullYear());
    dateToFocus.setMonth(focus.getMonth());
    dateToFocus.setDate(focus.getDate() + days);

    if (this._dateAllowed(dateToFocus, this.minDate, this.maxDate)) {
      this._focusDate(dateToFocus);
    } else {
      if (this._dateAllowed(focus, this.minDate, this.maxDate)) {
        // Move to min or max date
        if (days > 0) { // down or right
          this._focusDate(this.maxDate);
        } else { // up or left
          this._focusDate(this.minDate);
        }
      } else {
        // Move to closest allowed date
        this._focusClosestDate(focus);
      }
    }
  }

  _moveFocusByMonths(months) {
    var focus = this._currentlyFocusedDate();
    var dateToFocus = new Date(0, 0);
    dateToFocus.setFullYear(focus.getFullYear());
    dateToFocus.setMonth(focus.getMonth() + months);

    var targetMonth = dateToFocus.getMonth();

    dateToFocus.setDate(this._focusedMonthDate || (this._focusedMonthDate = focus.getDate()));
    if (dateToFocus.getMonth() !== targetMonth) {
      dateToFocus.setDate(0);
    }

    if (this._dateAllowed(dateToFocus, this.minDate, this.maxDate)) {
      this.focusedDate = dateToFocus;
    } else {
      if (this._dateAllowed(focus, this.minDate, this.maxDate)) {
        // Move to min or max date
        if (months > 0) { // pagedown
          this._focusDate(this.maxDate);
        } else { // pageup
          this._focusDate(this.minDate);
        }
      } else {
        // Move to closest allowed date
        this._focusClosestDate(focus);
      }
    }
  }

  _moveFocusInsideMonth(focusedDate, property) {
    var dateToFocus = new Date(0, 0);
    dateToFocus.setFullYear(focusedDate.getFullYear());

    if (property === 'minDate') {
      dateToFocus.setMonth(focusedDate.getMonth());
      dateToFocus.setDate(1);
    } else {
      dateToFocus.setMonth(focusedDate.getMonth() + 1);
      dateToFocus.setDate(0);
    }

    if (this._dateAllowed(dateToFocus, this.minDate, this.maxDate)) {
      this._focusDate(dateToFocus);
    } else {
      if (this._dateAllowed(focusedDate, this.minDate, this.maxDate)) {
        // Move to minDate or maxDate
        this._focusDate(this[property]);
      } else {
        // Move to closest allowed date
        this._focusClosestDate(focusedDate);
      }
    }
  }

  _dateAllowed(date, min, max) {
    return (!min || date >= min) && (!max || date <= max);
  }

  _isTodayAllowed(min, max) {
    var today = new Date();
    var todayMidnight = new Date(0, 0);
    todayMidnight.setFullYear(today.getFullYear());
    todayMidnight.setMonth(today.getMonth());
    todayMidnight.setDate(today.getDate());
    return this._dateAllowed(todayMidnight, min, max);
  }

  _stopPropagation(e) {
    e.stopPropagation();
  }
}

customElements.define(DatePickerOverlayContentElement.is, DatePickerOverlayContentElement);

/**
@license
Copyright (c) 2015 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/

// Contains all connected resizables that do not have a parent.
var ORPHANS = new Set();

/**
 * `IronResizableBehavior` is a behavior that can be used in Polymer elements to
 * coordinate the flow of resize events between "resizers" (elements that
 *control the size or hidden state of their children) and "resizables" (elements
 *that need to be notified when they are resized or un-hidden by their parents
 *in order to take action on their new measurements).
 *
 * Elements that perform measurement should add the `IronResizableBehavior`
 *behavior to their element definition and listen for the `iron-resize` event on
 *themselves. This event will be fired when they become showing after having
 *been hidden, when they are resized explicitly by another resizable, or when
 *the window has been resized.
 *
 * Note, the `iron-resize` event is non-bubbling.
 *
 * @polymerBehavior
 * @demo demo/index.html
 **/
const IronResizableBehavior = {
  properties: {
    /**
     * The closest ancestor element that implements `IronResizableBehavior`.
     */
    _parentResizable: {
      type: Object,
      observer: '_parentResizableChanged',
    },

    /**
     * True if this element is currently notifying its descendant elements of
     * resize.
     */
    _notifyingDescendant: {
      type: Boolean,
      value: false,
    }
  },

  listeners: {
    'iron-request-resize-notifications': '_onIronRequestResizeNotifications'
  },

  created: function() {
    // We don't really need property effects on these, and also we want them
    // to be created before the `_parentResizable` observer fires:
    this._interestedResizables = [];
    this._boundNotifyResize = this.notifyResize.bind(this);
    this._boundOnDescendantIronResize = this._onDescendantIronResize.bind(this);
  },

  attached: function() {
    this._requestResizeNotifications();
  },

  detached: function() {
    if (this._parentResizable) {
      this._parentResizable.stopResizeNotificationsFor(this);
    } else {
      ORPHANS.delete(this);
      window.removeEventListener('resize', this._boundNotifyResize);
    }

    this._parentResizable = null;
  },

  /**
   * Can be called to manually notify a resizable and its descendant
   * resizables of a resize change.
   */
  notifyResize: function() {
    if (!this.isAttached) {
      return;
    }

    this._interestedResizables.forEach(function(resizable) {
      if (this.resizerShouldNotify(resizable)) {
        this._notifyDescendant(resizable);
      }
    }, this);

    this._fireResize();
  },

  /**
   * Used to assign the closest resizable ancestor to this resizable
   * if the ancestor detects a request for notifications.
   */
  assignParentResizable: function(parentResizable) {
    if (this._parentResizable) {
      this._parentResizable.stopResizeNotificationsFor(this);
    }

    this._parentResizable = parentResizable;

    if (parentResizable &&
        parentResizable._interestedResizables.indexOf(this) === -1) {
      parentResizable._interestedResizables.push(this);
      parentResizable._subscribeIronResize(this);
    }
  },

  /**
   * Used to remove a resizable descendant from the list of descendants
   * that should be notified of a resize change.
   */
  stopResizeNotificationsFor: function(target) {
    var index = this._interestedResizables.indexOf(target);

    if (index > -1) {
      this._interestedResizables.splice(index, 1);
      this._unsubscribeIronResize(target);
    }
  },

  /**
   * Subscribe this element to listen to iron-resize events on the given target.
   *
   * Preferred over target.listen because the property renamer does not
   * understand to rename when the target is not specifically "this"
   *
   * @param {!HTMLElement} target Element to listen to for iron-resize events.
   */
  _subscribeIronResize: function(target) {
    target.addEventListener('iron-resize', this._boundOnDescendantIronResize);
  },

  /**
   * Unsubscribe this element from listening to to iron-resize events on the
   * given target.
   *
   * Preferred over target.unlisten because the property renamer does not
   * understand to rename when the target is not specifically "this"
   *
   * @param {!HTMLElement} target Element to listen to for iron-resize events.
   */
  _unsubscribeIronResize: function(target) {
    target.removeEventListener(
        'iron-resize', this._boundOnDescendantIronResize);
  },

  /**
   * This method can be overridden to filter nested elements that should or
   * should not be notified by the current element. Return true if an element
   * should be notified, or false if it should not be notified.
   *
   * @param {HTMLElement} element A candidate descendant element that
   * implements `IronResizableBehavior`.
   * @return {boolean} True if the `element` should be notified of resize.
   */
  resizerShouldNotify: function(element) {
    return true;
  },

  _onDescendantIronResize: function(event) {
    if (this._notifyingDescendant) {
      event.stopPropagation();
      return;
    }

    // no need to use this during shadow dom because of event retargeting
    if (!useShadow) {
      this._fireResize();
    }
  },

  _fireResize: function() {
    this.fire('iron-resize', null, {node: this, bubbles: false});
  },

  _onIronRequestResizeNotifications: function(event) {
    var target = /** @type {!EventTarget} */ (dom(event).rootTarget);
    if (target === this) {
      return;
    }

    target.assignParentResizable(this);
    this._notifyDescendant(target);

    event.stopPropagation();
  },

  _parentResizableChanged: function(parentResizable) {
    if (parentResizable) {
      window.removeEventListener('resize', this._boundNotifyResize);
    }
  },

  _notifyDescendant: function(descendant) {
    // NOTE(cdata): In IE10, attached is fired on children first, so it's
    // important not to notify them if the parent is not attached yet (or
    // else they will get redundantly notified when the parent attaches).
    if (!this.isAttached) {
      return;
    }

    this._notifyingDescendant = true;
    descendant.notifyResize();
    this._notifyingDescendant = false;
  },

  _requestResizeNotifications: function() {
    if (!this.isAttached) {
      return;
    }

    if (document.readyState === 'loading') {
      var _requestResizeNotifications =
          this._requestResizeNotifications.bind(this);
      document.addEventListener(
          'readystatechange', function readystatechanged() {
            document.removeEventListener('readystatechange', readystatechanged);
            _requestResizeNotifications();
          });
    } else {
      this._findParent();

      if (!this._parentResizable) {
        // If this resizable is an orphan, tell other orphans to try to find
        // their parent again, in case it's this resizable.
        ORPHANS.forEach(function(orphan) {
          if (orphan !== this) {
            orphan._findParent();
          }
        }, this);

        window.addEventListener('resize', this._boundNotifyResize);
        this.notifyResize();
      } else {
        // If this resizable has a parent, tell other child resizables of
        // that parent to try finding their parent again, in case it's this
        // resizable.
        this._parentResizable._interestedResizables
            .forEach(function(resizable) {
              if (resizable !== this) {
                resizable._findParent();
              }
            }, this);
      }
    }
  },

  _findParent: function() {
    this.assignParentResizable(null);
    this.fire(
        'iron-request-resize-notifications',
        null,
        {node: this, bubbles: true, cancelable: true});

    if (!this._parentResizable) {
      ORPHANS.add(this);
    } else {
      ORPHANS.delete(this);
    }
  }
};

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/

/**
 * @polymerMixin
 */
const DatePickerMixin = subclass => class VaadinDatePickerMixin extends mixinBehaviors(
  [IronResizableBehavior], subclass
) {

  static get properties() {
    return {
      /**
       * The current selected date.
       * @type {Date | undefined}
       * @protected
       */
      _selectedDate: {
        type: Date
      },

      /**
       * @type {Date | undefined}
       * @protected
       */
      _focusedDate: Date,

      /**
       * The value for this element.
       *
       * Supported date formats:
       * - ISO 8601 `"YYYY-MM-DD"` (default)
       * - 6-digit extended ISO 8601 `"+YYYYYY-MM-DD"`, `"-YYYYYY-MM-DD"`
       *
       * @type {string}
       */
      value: {
        type: String,
        observer: '_valueChanged',
        notify: true,
        value: ''
      },

      /**
       * Set to true to mark the input as required.
       * @type {boolean}
       */
      required: {
        type: Boolean,
        value: false
      },

      /**
       * The name of this element.
       */
      name: {
        type: String
      },

      /**
       * Date which should be visible when there is no value selected.
       *
       * The same date formats as for the `value` property are supported.
       * @attr {string} initial-position
       */
      initialPosition: String,

      /**
       * The label for this element.
       */
      label: String,

      /**
       * Set true to open the date selector overlay.
       */
      opened: {
        type: Boolean,
        reflectToAttribute: true,
        notify: true,
        observer: '_openedChanged'
      },

      /**
       * Set true to prevent the overlay from opening automatically.
       * @attr {boolean} auto-open-disabled
       */
      autoOpenDisabled: Boolean,

      /**
       * Set true to display ISO-8601 week numbers in the calendar. Notice that
       * displaying week numbers is only supported when `i18n.firstDayOfWeek`
       * is 1 (Monday).
       * @attr {boolean} show-week-numbers
       */
      showWeekNumbers: {
        type: Boolean
      },

      /**
       * @type {boolean}
       * @protected
       */
      _fullscreen: {
        value: false,
        observer: '_fullscreenChanged'
      },

      /**
       * @type {string}
       * @protected
       */
      _fullscreenMediaQuery: {
        value: '(max-width: 420px), (max-height: 420px)'
      },

      /**
       * An array of ancestor elements whose -webkit-overflow-scrolling is forced from value
       * 'touch' to value 'auto' in order to prevent them from clipping the dropdown. iOS only.
       * @private
       */
      _touchPrevented: Array,

      /**
       * The object used to localize this component.
       * To change the default localization, replace the entire
       * _i18n_ object or just the property you want to modify.
       *
       * The object has the following JSON structure and default values:

          {
            // An array with the full names of months starting
            // with January.
            monthNames: [
              'January', 'February', 'March', 'April', 'May',
              'June', 'July', 'August', 'September',
              'October', 'November', 'December'
            ],

            // An array of weekday names starting with Sunday. Used
            // in screen reader announcements.
            weekdays: [
              'Sunday', 'Monday', 'Tuesday', 'Wednesday',
              'Thursday', 'Friday', 'Saturday'
            ],

            // An array of short weekday names starting with Sunday.
            // Displayed in the calendar.
            weekdaysShort: [
              'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
            ],

            // An integer indicating the first day of the week
            // (0 = Sunday, 1 = Monday, etc.).
            firstDayOfWeek: 0,

            // Used in screen reader announcements along with week
            // numbers, if they are displayed.
            week: 'Week',

            // Translation of the Calendar icon button title.
            calendar: 'Calendar',

            // Translation of the Clear icon button title.
            clear: 'Clear',

            // Translation of the Today shortcut button text.
            today: 'Today',

            // Translation of the Cancel button text.
            cancel: 'Cancel',

            // A function to format given `Object` as
            // date string. Object is in the format `{ day: ..., month: ..., year: ... }`
            // Note: The argument month is 0-based. This means that January = 0 and December = 11.
            formatDate: d => {
              // returns a string representation of the given
              // object in 'MM/DD/YYYY' -format
            },

            // A function to parse the given text to an `Object` in the format `{ day: ..., month: ..., year: ... }`.
            // Must properly parse (at least) text formatted by `formatDate`.
            // Setting the property to null will disable keyboard input feature.
            // Note: The argument month is 0-based. This means that January = 0 and December = 11.
            parseDate: text => {
              // Parses a string in 'MM/DD/YY', 'MM/DD' or 'DD' -format to
              // an `Object` in the format `{ day: ..., month: ..., year: ... }`.
            }

            // A function to format given `monthName` and
            // `fullYear` integer as calendar title string.
            formatTitle: (monthName, fullYear) => {
              return monthName + ' ' + fullYear;
            }
          }

       * @type {!DatePickerI18n}
       * @default {English/US}
       */
      i18n: {
        type: Object,
        value: () => {
          return {
            monthNames: [
              'January', 'February', 'March', 'April', 'May',
              'June', 'July', 'August', 'September', 'October', 'November', 'December'
            ],
            weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            firstDayOfWeek: 0,
            week: 'Week',
            calendar: 'Calendar',
            clear: 'Clear',
            today: 'Today',
            cancel: 'Cancel',
            formatDate: d => {
              const yearStr = String(d.year).replace(/\d+/, y => '0000'.substr(y.length) + y);
              return [d.month + 1, d.day, yearStr].join('/');
            },
            parseDate: text => {
              const parts = text.split('/');
              const today = new Date();
              let date, month = today.getMonth(), year = today.getFullYear();

              if (parts.length === 3) {
                year = parseInt(parts[2]);
                if (parts[2].length < 3 && year >= 0) {
                  year += year < 50 ? 2000 : 1900;
                }
                month = parseInt(parts[0]) - 1;
                date = parseInt(parts[1]);
              } else if (parts.length === 2) {
                month = parseInt(parts[0]) - 1;
                date = parseInt(parts[1]);
              } else if (parts.length === 1) {
                date = parseInt(parts[0]);
              }

              if (date !== undefined) {
                return {day: date, month, year};
              }
            },
            formatTitle: (monthName, fullYear) => {
              return monthName + ' ' + fullYear;
            }
          };
        }
      },

      /**
       * The earliest date that can be selected. All earlier dates will be disabled.
       *
       * Supported date formats:
       * - ISO 8601 `"YYYY-MM-DD"` (default)
       * - 6-digit extended ISO 8601 `"+YYYYYY-MM-DD"`, `"-YYYYYY-MM-DD"`
       *
       * @type {string | undefined}
       */
      min: {
        type: String,
        observer: '_minChanged'
      },

      /**
       * The latest date that can be selected. All later dates will be disabled.
       *
       * Supported date formats:
       * - ISO 8601 `"YYYY-MM-DD"` (default)
       * - 6-digit extended ISO 8601 `"+YYYYYY-MM-DD"`, `"-YYYYYY-MM-DD"`
       *
       * @type {string | undefined}
       */
      max: {
        type: String,
        observer: '_maxChanged'
      },

      /**
       * The earliest date that can be selected. All earlier dates will be disabled.
       * @type {Date | string}
       * @protected
       */
      _minDate: {
        type: Date,
        // null does not work here because minimizer passes undefined to overlay (#351)
        value: ''
      },

      /**
       * The latest date that can be selected. All later dates will be disabled.
       * @type {Date | string}
       * @protected
       */
      _maxDate: {
        type: Date,
        value: ''
      },

      /** @private */
      _noInput: {
        type: Boolean,
        computed: '_isNoInput(_fullscreen, _ios, i18n, i18n.*)'
      },

      /** @private */
      _ios: {
        type: Boolean,
        value: navigator.userAgent.match(/iP(?:hone|ad;(?: U;)? CPU) OS (\d+)/)
      },

      /** @private */
      _webkitOverflowScroll: {
        type: Boolean,
        value: document.createElement('div').style.webkitOverflowScrolling === ''
      },

      /** @private */
      _ignoreAnnounce: {
        value: true
      },

      /** @private */
      _focusOverlayOnOpen: Boolean,

      /** @protected */
      _overlayInitialized: Boolean
    };
  }

  static get observers() {
    return [
      '_updateHasValue(value)',
      '_selectedDateChanged(_selectedDate, i18n.formatDate)',
      '_focusedDateChanged(_focusedDate, i18n.formatDate)',
      '_announceFocusedDate(_focusedDate, opened, _ignoreAnnounce)'
    ];
  }

  /** @protected */
  ready() {
    super.ready();
    this._boundOnScroll = this._onScroll.bind(this);
    this._boundFocus = this._focus.bind(this);
    this._boundUpdateAlignmentAndPosition = this._updateAlignmentAndPosition.bind(this);

    const isClearButton = e => {
      const path = e.composedPath();
      const inputIndex = path.indexOf(this._inputElement);
      return path.slice(0, inputIndex)
        .filter(el => el.getAttribute && el.getAttribute('part') === 'clear-button')
        .length === 1;
    };

    addListener(this, 'tap', e => {
      // FIXME(platosha): use preventDefault in the text field clear button,
      // then the following composedPath check could be simplified down
      // to `if (!e.defaultPrevented)`.
      // https://github.com/vaadin/vaadin-text-field/issues/352
      if (!isClearButton(e) && (!this.autoOpenDisabled || this._noInput)) {
        this.open();
      }
    });

    this.addEventListener('touchend', e => {
      if (!isClearButton(e)) {
        e.preventDefault();
      }
    });
    this.addEventListener('keydown', this._onKeydown.bind(this));
    this.addEventListener('input', this._onUserInput.bind(this));
    this.addEventListener('focus', e => this._noInput && e.target.blur());
    this.addEventListener('blur', e => {
      if (!this.opened) {
        if (this.autoOpenDisabled) {
          const parsedDate = this._getParsedDate();
          if (this._isValidDate(parsedDate)) {
            this._selectedDate = parsedDate;
          }
        }

        if (this._inputElement.value === '' && this.__dispatchChange) {
          this.validate();
          this.value = '';
          this.__dispatchChange = false;
        } else {
          this.validate();
        }
      }
    });
  }

  /** @private */
  _initOverlay() {
    this.$.overlay.removeAttribute('disable-upgrade');
    this._overlayInitialized = true;

    this.$.overlay.addEventListener('opened-changed', e => this.opened = e.detail.value);

    this._overlayContent.addEventListener('close', this._close.bind(this));
    this._overlayContent.addEventListener('focus-input', this._focusAndSelect.bind(this));
    this.$.overlay.addEventListener('vaadin-overlay-escape-press', this._boundFocus);

    // Keep focus attribute in focusElement for styling
    this._overlayContent.addEventListener('focus', () => this.focusElement._setFocused(true));

    this.$.overlay.addEventListener('vaadin-overlay-close', this._onVaadinOverlayClose.bind(this));

    const bringToFrontListener = (e) => {
      if (this.$.overlay.bringToFront) {
        requestAnimationFrame(() => {
          this.$.overlay.bringToFront();
        });
      }
    };

    this.addEventListener('mousedown', bringToFrontListener);
    this.addEventListener('touchstart', bringToFrontListener);
  }

  /** @protected */
  disconnectedCallback() {
    super.disconnectedCallback();

    if (this._overlayInitialized) {
      this.$.overlay.removeEventListener('vaadin-overlay-escape-press', this._boundFocus);
    }

    this.opened = false;
  }

  /**
   * Opens the dropdown.
   */
  open() {
    if (!this.disabled && !this.readonly) {
      this.opened = true;
    }
  }

  /** @private */
  _close(e) {
    if (e) {
      e.stopPropagation();
    }
    this._focus();
    this.close();
  }

  /**
   * Closes the dropdown.
   */
  close() {
    if (this._overlayInitialized || this.autoOpenDisabled) {
      this.$.overlay.close();
    }
  }

  /**
   * @return {HTMLElement}
   * @protected
   */
  get _inputElement() {
    return this._input();
  }

  /** @private */
  get _nativeInput() {
    if (this._inputElement) {
      // vaadin-text-field's input is focusElement
      // iron-input's input is inputElement
      return this._inputElement.focusElement ? this._inputElement.focusElement :
        this._inputElement.inputElement ? this._inputElement.inputElement :
          window.unwrap ? window.unwrap(this._inputElement) : this._inputElement;
    }
  }

  /** @private */
  _parseDate(str) {
    // Parsing with RegExp to ensure correct format
    var parts = /^([-+]\d{1}|\d{2,4}|[-+]\d{6})-(\d{1,2})-(\d{1,2})$/.exec(str);
    if (!parts) {
      return;
    }

    var date = new Date(0, 0); // Wrong date (1900-01-01), but with midnight in local time
    date.setFullYear(parseInt(parts[1], 10));
    date.setMonth(parseInt(parts[2], 10) - 1);
    date.setDate(parseInt(parts[3], 10));
    return date;
  }

  /** @private */
  _isNoInput(fullscreen, ios, i18n) {
    return !this._inputElement || fullscreen || ios || !i18n.parseDate;
  }

  /** @private */
  _formatISO(date) {
    if (!(date instanceof Date)) {
      return '';
    }

    const pad = (num, fmt = '00') => (fmt + num).substr((fmt + num).length - fmt.length);

    let yearSign = '';
    let yearFmt = '0000';
    let yearAbs = date.getFullYear();
    if (yearAbs < 0) {
      yearAbs = -yearAbs;
      yearSign = '-';
      yearFmt = '000000';
    } else if (date.getFullYear() >= 10000) {
      yearSign = '+';
      yearFmt = '000000';
    }

    const year = yearSign + pad(yearAbs, yearFmt);
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return [year, month, day].join('-');
  }

  /** @private */
  _openedChanged(opened) {
    if (opened && !this._overlayInitialized) {
      this._initOverlay();
    }
    if (this._overlayInitialized) {
      this.$.overlay.opened = opened;
    }
    if (opened) {
      this._updateAlignmentAndPosition();
    }
  }

  /** @private */
  _selectedDateChanged(selectedDate, formatDate) {
    if (selectedDate === undefined || formatDate === undefined) {
      return;
    }
    if (this.__userInputOccurred) {
      this.__dispatchChange = true;
    }
    const value = this._formatISO(selectedDate);

    this.__keepInputValue || this._applyInputValue(selectedDate);

    if (value !== this.value) {
      this.validate();
      this.value = value;
    }
    this.__userInputOccurred = false;
    this.__dispatchChange = false;
    this._ignoreFocusedDateChange = true;
    this._focusedDate = selectedDate;
    this._ignoreFocusedDateChange = false;
  }

  /** @private */
  _focusedDateChanged(focusedDate, formatDate) {
    if (focusedDate === undefined || formatDate === undefined) {
      return;
    }
    this.__userInputOccurred = true;
    if (!this._ignoreFocusedDateChange && !this._noInput) {
      this._applyInputValue(focusedDate);
    }
  }

  /** @private */
  _updateHasValue(value) {
    if (value) {
      this.setAttribute('has-value', '');
    } else {
      this.removeAttribute('has-value');
    }
  }

  /** @private */
  __getOverlayTheme(theme, overlayInitialized) {
    if (overlayInitialized) {
      return theme;
    }
  }

  /** @private */
  _handleDateChange(property, value, oldValue) {
    if (!value) {
      this[property] = '';
      return;
    }

    var date = this._parseDate(value);
    if (!date) {
      this.value = oldValue;
      return;
    }
    if (!DatePickerHelper._dateEquals(this[property], date)) {
      this[property] = date;
      this.value && this.validate();
    }
  }

  /** @private */
  _valueChanged(value, oldValue) {
    if (this.__dispatchChange) {
      this.dispatchEvent(new CustomEvent('change', {bubbles: true}));
    }
    this._handleDateChange('_selectedDate', value, oldValue);
  }

  /** @private */
  _minChanged(value, oldValue) {
    this._handleDateChange('_minDate', value, oldValue);
  }

  /** @private */
  _maxChanged(value, oldValue) {
    this._handleDateChange('_maxDate', value, oldValue);
  }

  /** @private */
  _updateAlignmentAndPosition() {
    if (!this._overlayInitialized) {
      return;
    }
    if (!this._fullscreen) {
      const inputRect = this._inputElement.getBoundingClientRect();

      const bottomAlign = inputRect.top > window.innerHeight / 2;
      const rightAlign = inputRect.left + this.clientWidth / 2 > window.innerWidth / 2;

      if (rightAlign) {
        const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
        this.$.overlay.setAttribute('right-aligned', '');
        this.$.overlay.style.removeProperty('left');
        this.$.overlay.style.right = (viewportWidth - inputRect.right) + 'px';
      } else {
        this.$.overlay.removeAttribute('right-aligned');
        this.$.overlay.style.removeProperty('right');
        this.$.overlay.style.left = inputRect.left + 'px';
      }

      if (bottomAlign) {
        const viewportHeight = Math.min(window.innerHeight, document.documentElement.clientHeight);
        this.$.overlay.setAttribute('bottom-aligned', '');
        this.$.overlay.style.removeProperty('top');
        this.$.overlay.style.bottom = (viewportHeight - inputRect.top) + 'px';
      } else {
        this.$.overlay.removeAttribute('bottom-aligned');
        this.$.overlay.style.removeProperty('bottom');
        this.$.overlay.style.top = inputRect.bottom + 'px';
      }
    }

    this.$.overlay.setAttribute('dir',
      getComputedStyle(this._inputElement).getPropertyValue('direction')
    );
    this._overlayContent._repositionYearScroller();
  }

  /** @private */
  _fullscreenChanged() {
    if (this._overlayInitialized && this.$.overlay.opened) {
      this._updateAlignmentAndPosition();
    }
  }

  /** @protected */
  _onOverlayOpened() {
    this._openedWithFocusRing = this.hasAttribute('focus-ring') || (this.focusElement && this.focusElement.hasAttribute('focus-ring'));

    var parsedInitialPosition = this._parseDate(this.initialPosition);

    var initialPosition = this._selectedDate || this._overlayContent.initialPosition ||
      parsedInitialPosition || new Date();

    if (parsedInitialPosition ||
      DatePickerHelper._dateAllowed(initialPosition, this._minDate, this._maxDate)) {
      this._overlayContent.initialPosition = initialPosition;
    } else {
      this._overlayContent.initialPosition =
        DatePickerHelper._getClosestDate(initialPosition, [this._minDate, this._maxDate]);
    }

    this._overlayContent.scrollToDate(this._overlayContent.focusedDate || this._overlayContent.initialPosition);
    // Have a default focused date
    this._ignoreFocusedDateChange = true;
    this._overlayContent.focusedDate = this._overlayContent.focusedDate || this._overlayContent.initialPosition;
    this._ignoreFocusedDateChange = false;

    window.addEventListener('scroll', this._boundOnScroll, true);
    this.addEventListener('iron-resize', this._boundUpdateAlignmentAndPosition);

    if (this._webkitOverflowScroll) {
      this._touchPrevented = this._preventWebkitOverflowScrollingTouch(this.parentElement);
    }

    if (this._focusOverlayOnOpen) {
      this._overlayContent.focus();
      this._focusOverlayOnOpen = false;
    } else {
      this._focus();
    }

    if (this._noInput && this.focusElement) {
      this.focusElement.blur();
    }

    this.updateStyles();

    this._ignoreAnnounce = false;
  }

  // A hack needed for iOS to prevent dropdown from being clipped in an
  // ancestor container with -webkit-overflow-scrolling: touch;
  /** @private */
  _preventWebkitOverflowScrollingTouch(element) {
    var result = [];
    while (element) {
      if (window.getComputedStyle(element).webkitOverflowScrolling === 'touch') {
        var oldInlineValue = element.style.webkitOverflowScrolling;
        element.style.webkitOverflowScrolling = 'auto';
        result.push({
          element: element,
          oldInlineValue: oldInlineValue
        });
      }
      element = element.parentElement;
    }
    return result;
  }

  /** @private */
  _selectParsedOrFocusedDate() {
    // Select the parsed input or focused date
    this._ignoreFocusedDateChange = true;
    if (this.i18n.parseDate) {
      const inputValue = this._inputValue || '';
      const parsedDate = this._getParsedDate(inputValue);

      if (this._isValidDate(parsedDate)) {
        this._selectedDate = parsedDate;
      } else {
        this.__keepInputValue = true;
        this._selectedDate = null;
        this.__keepInputValue = false;
      }
    } else if (this._focusedDate) {
      this._selectedDate = this._focusedDate;
    }
    this._ignoreFocusedDateChange = false;
  }

  /** @protected */
  _onOverlayClosed() {
    this._ignoreAnnounce = true;

    window.removeEventListener('scroll', this._boundOnScroll, true);
    this.removeEventListener('iron-resize', this._boundUpdateAlignmentAndPosition);

    if (this._touchPrevented) {
      this._touchPrevented.forEach(prevented =>
        prevented.element.style.webkitOverflowScrolling = prevented.oldInlineValue);
      this._touchPrevented = [];
    }

    this.updateStyles();

    this._selectParsedOrFocusedDate();

    if (this._nativeInput && this._nativeInput.selectionStart) {
      this._nativeInput.selectionStart = this._nativeInput.selectionEnd;
    }
    // No need to revalidate the value after `_selectedDateChanged`
    // Needed in case the value was not changed: open and close dropdown.
    if (!this.value) {
      this.validate();
    }
  }

  /**
   * Returns true if `value` is valid, and sets the `invalid` flag appropriately.
   *
   * @param {string=} value Value to validate. Optional, defaults to user's input value.
   * @return {boolean} True if the value is valid and sets the `invalid` flag appropriately
   */
  validate() {
    // Note (Yuriy): Workaround `this._inputValue` is used in order
    // to avoid breaking change on custom `checkValidity`.
    // Can be removed with next major.
    return !(this.invalid = !this.checkValidity(this._inputValue));
  }

  /**
   * Returns true if the current input value satisfies all constraints (if any)
   *
   * Override the `checkValidity` method for custom validations.
   *
   * @param {string=} value Value to validate. Optional, defaults to the selected date.
   * @return {boolean} True if the value is valid
   */
  checkValidity() {
    const inputValid = !this._inputValue ||
      (this._selectedDate && this._inputValue === this._getFormattedDate(this.i18n.formatDate, this._selectedDate));
    const minMaxValid = !this._selectedDate ||
      DatePickerHelper._dateAllowed(this._selectedDate, this._minDate, this._maxDate);

    let inputValidity = true;
    if (this._inputElement) {
      if (this._inputElement.checkValidity) {
        // vaadin native input elements have the checkValidity method
        this._inputElement.__forceCheckValidity = true;
        inputValidity = this._inputElement.checkValidity();
        this._inputElement.__forceCheckValidity = false;
      } else if (this._inputElement.validate) {
        // iron-form-elements have the validate API
        inputValidity = this._inputElement.validate();
      }
    }

    return inputValid && minMaxValid && inputValidity;
  }

  /** @private */
  _onScroll(e) {
    if (e.target === window || !this._overlayContent.contains(e.target)) {
      this._updateAlignmentAndPosition();
    }
  }

  /** @protected */
  _focus() {
    if (this._noInput) {
      this._overlayInitialized && this._overlayContent.focus();
    } else {
      this._inputElement.focus();
    }
  }

  /** @private */
  _focusAndSelect() {
    this._focus();
    this._setSelectionRange(0, this._inputValue.length);
  }

  /** @private */
  _applyInputValue(date) {
    this._inputValue = date ? this._getFormattedDate(this.i18n.formatDate, date) : '';
  }

  /** @private */
  _getFormattedDate(formatDate, date) {
    return formatDate(DatePickerHelper._extractDateParts(date));
  }

  /** @private */
  _setSelectionRange(a, b) {
    if (this._nativeInput && this._nativeInput.setSelectionRange) {
      this._nativeInput.setSelectionRange(a, b);
    }
  }

  /**
   * Keyboard Navigation
   * @private
   */
  _eventKey(e) {
    var keys = ['down', 'up', 'enter', 'esc', 'tab'];

    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (IronA11yKeysBehavior.keyboardEventMatchesKeys(e, k)) {
        return k;
      }
    }
  }

  /** @private */
  _isValidDate(d) {
    return d && !isNaN(d.getTime());
  }

  /** @private */
  _onKeydown(e) {
    if (this._noInput) {
      // The input element cannot be readonly as it would conflict with
      // the required attribute. Both are not allowed on an input element.
      // Therefore we prevent default on most keydown events.
      var allowedKeys = [
        9 // tab
      ];
      if (allowedKeys.indexOf(e.keyCode) === -1) {
        e.preventDefault();
      }
    }

    switch (this._eventKey(e)) {
      case 'down':
      case 'up':
        // prevent scrolling the page with arrows
        e.preventDefault();

        if (this.opened) {
          this._overlayContent.focus();
          this._overlayContent._onKeydown(e);
        } else {
          this._focusOverlayOnOpen = true;
          this.open();
        }

        break;
      case 'enter': {
        const parsedDate = this._getParsedDate();
        const isValidDate = this._isValidDate(parsedDate);
        if (this.opened) {
          if (this._overlayInitialized && this._overlayContent.focusedDate && isValidDate) {
            this._selectedDate = this._overlayContent.focusedDate;
          }
          this.close();
        } else {
          if (!isValidDate && this._inputElement.value !== '') {
            this.validate();
          } else {
            const oldValue = this.value;
            this._selectParsedOrFocusedDate();
            if (oldValue === this.value) {
              this.validate();
            }
          }
        }
        break;
      }
      case 'esc':
        if (this.opened) {
          this._focusedDate = this._selectedDate;
          this._close();
        } else if (this.autoOpenDisabled) {
          // Do not restore selected date if Esc was pressed after clearing input field
          if (this._inputElement.value === '') {
            this._selectedDate = null;
          }
          this._applyInputValue(this._selectedDate);
        } else {
          this._focusedDate = this._selectedDate;
          this._selectParsedOrFocusedDate();
        }
        break;
      case 'tab':
        if (this.opened) {
          e.preventDefault();
          // Clear the selection range (remains visible on IE)
          this._setSelectionRange(0, 0);
          if (e.shiftKey) {
            this._overlayContent.focusCancel();
          } else {
            this._overlayContent.focus();
            this._overlayContent.revealDate(this._focusedDate);
          }

        }
        break;
    }
  }

  /** @private */
  _getParsedDate(inputValue = this._inputValue) {
    const dateObject = this.i18n.parseDate && this.i18n.parseDate(inputValue);
    const parsedDate = dateObject &&
      this._parseDate(dateObject.year + '-' + (dateObject.month + 1) + '-' + dateObject.day);
    return parsedDate;
  }

  /** @private */
  _onUserInput(e) {
    if (!this.opened && this._inputElement.value && !this.autoOpenDisabled) {
      this.open();
    }
    this._userInputValueChanged();

    if (e.__fromClearButton) {
      this.validate();
      this.__dispatchChange = true;
      this.value = '';
      this.__dispatchChange = false;
    }
  }

  /** @private */
  _userInputValueChanged(value) {
    if (this.opened && this._inputValue) {
      const parsedDate = this._getParsedDate();

      if (this._isValidDate(parsedDate)) {
        this._ignoreFocusedDateChange = true;
        if (!DatePickerHelper._dateEquals(parsedDate, this._focusedDate)) {
          this._focusedDate = parsedDate;
        }
        this._ignoreFocusedDateChange = false;
      }
    }
  }

  /** @private */
  _announceFocusedDate(_focusedDate, opened, _ignoreAnnounce) {
    if (opened && !_ignoreAnnounce) {
      this._overlayContent.announceFocusedDate();
    }
  }

  /** @private */
  get _overlayContent() {
    return this.$.overlay.content.querySelector('#overlay-content');
  }

  /**
   * Fired when the user commits a value change.
   *
   * @event change
   */
};

/**
@license
Copyright (c) 2017 Vaadin Ltd.
This program is available under Apache License Version 2.0, available at https://vaadin.com/license/
*/
/**
 *
 * `<vaadin-date-picker>` is a date selection field which includes a scrollable
 * month calendar view.
 * ```html
 * <vaadin-date-picker label="Birthday"></vaadin-date-picker>
 * ```
 * ```js
 * datePicker.value = '2016-03-02';
 * ```
 * When the selected `value` is changed, a `value-changed` event is triggered.
 *
 *
 * ### Styling
 *
 * The following shadow DOM parts are available for styling:
 *
 * Part name | Description | Theme for Element
 * ----------------|----------------|----------------
 * `text-field` | Input element | vaadin-date-picker
 * `clear-button` | Clear button | vaadin-date-picker
 * `toggle-button` | Toggle button | vaadin-date-picker
 * `overlay-content` | The overlay element | vaadin-date-picker
 * `overlay-header` | Fullscreen mode header | vaadin-date-picker-overlay-content
 * `label` | Fullscreen mode value/label | vaadin-date-picker-overlay-content
 * `clear-button` | Fullscreen mode clear button | vaadin-date-picker-overlay-content
 * `toggle-button` | Fullscreen mode toggle button | vaadin-date-picker-overlay-content
 * `years-toggle-button` | Fullscreen mode years scroller toggle | vaadin-date-picker-overlay-content
 * `months` | Months scroller | vaadin-date-picker-overlay-content
 * `years` | Years scroller | vaadin-date-picker-overlay-content
 * `toolbar` | Footer bar with buttons | vaadin-date-picker-overlay-content
 * `today-button` | Today button | vaadin-date-picker-overlay-content
 * `cancel-button` | Cancel button | vaadin-date-picker-overlay-content
 * `month` | Month calendar | vaadin-date-picker-overlay-content
 * `year-number` | Year number | vaadin-date-picker-overlay-content
 * `year-separator` | Year separator | vaadin-date-picker-overlay-content
 * `month-header` | Month title | vaadin-month-calendar
 * `weekdays` | Weekday container | vaadin-month-calendar
 * `weekday` | Weekday element | vaadin-month-calendar
 * `week-numbers` | Week numbers container | vaadin-month-calendar
 * `week-number` | Week number element | vaadin-month-calendar
 * `date` | Date element | vaadin-month-calendar
 *
 * See [ThemableMixin – how to apply styles for shadow parts](https://github.com/vaadin/vaadin-themable-mixin/wiki)
 *
 * The following state attributes are available for styling:
 *
 * Attribute    | Description | Part name
 * -------------|-------------|------------
 * `invalid` | Set when the element is invalid | :host
 * `opened` | Set when the date selector overlay is opened | :host
 * `readonly` | Set when the element is readonly | :host
 * `disabled` | Set when the element is disabled | :host
 * `today` | Set on the date corresponding to the current day | date
 * `focused` | Set on the focused date | date
 * `disabled` | Set on the date out of the allowed range | date
 * `selected` | Set on the selected date | date
 *
 * If you want to replace the default input field with a custom implementation, you should use the
 * [`<vaadin-date-picker-light>`](#vaadin-date-picker-light) element.
 *
 * In addition to `<vaadin-date-picker>` itself, the following internal
 * components are themable:
 *
 * - `<vaadin-text-field>`
 * - `<vaadin-date-picker-overlay>`
 * - `<vaadin-date-picker-overlay-content>`
 * - `<vaadin-month-calendar>`
 *
 * Note: the `theme` attribute value set on `<vaadin-date-picker>` is
 * propagated to the internal themable components listed above.
 *
 * @extends PolymerElement
 * @mixes ElementMixin
 * @mixes ControlStateMixin
 * @mixes ThemableMixin
 * @mixes DatePickerMixin
 * @mixes GestureEventListeners
 * @demo demo/index.html
 */
class DatePickerElement extends
  ElementMixin$1(
    ControlStateMixin(
      ThemableMixin(
        DatePickerMixin(
          GestureEventListeners(PolymerElement))))) {
  static get template() {
    return html`
    <style>
      :host {
        display: inline-block;
      }

      :host([hidden]) {
        display: none !important;
      }

      :host([opened]) {
        pointer-events: auto;
      }

      [part="text-field"] {
        width: 100%;
        min-width: 0;
      }
    </style>


    <vaadin-date-picker-text-field id="input" role="application" autocomplete="off" on-focus="_focus" value="{{_userInputValue}}" invalid="[[invalid]]" label="[[label]]" name="[[name]]" placeholder="[[placeholder]]" required="[[required]]" disabled="[[disabled]]" readonly="[[readonly]]" error-message="[[errorMessage]]" clear-button-visible="[[clearButtonVisible]]" aria-label\$="[[label]]" part="text-field" helper-text="[[helperText]]" theme\$="[[theme]]">
      <slot name="prefix" slot="prefix"></slot>
      <slot name="helper" slot="helper">[[helperText]]</slot>
      <div part="toggle-button" slot="suffix" on-tap="_toggle" role="button" aria-label\$="[[i18n.calendar]]" aria-expanded\$="[[_getAriaExpanded(opened)]]"></div>
    </vaadin-date-picker-text-field>

    <vaadin-date-picker-overlay id="overlay" fullscreen\$="[[_fullscreen]]" theme\$="[[__getOverlayTheme(theme, _overlayInitialized)]]" on-vaadin-overlay-open="_onOverlayOpened" on-vaadin-overlay-close="_onOverlayClosed" disable-upgrade="">
      <template>
        <vaadin-date-picker-overlay-content id="overlay-content" i18n="[[i18n]]" fullscreen\$="[[_fullscreen]]" label="[[label]]" selected-date="{{_selectedDate}}" slot="dropdown-content" focused-date="{{_focusedDate}}" show-week-numbers="[[showWeekNumbers]]" min-date="[[_minDate]]" max-date="[[_maxDate]]" role="dialog" on-date-tap="_close" part="overlay-content" theme\$="[[__getOverlayTheme(theme, _overlayInitialized)]]">
        </vaadin-date-picker-overlay-content>
      </template>
    </vaadin-date-picker-overlay>

    <iron-media-query query="[[_fullscreenMediaQuery]]" query-matches="{{_fullscreen}}">
    </iron-media-query>
`;
  }

  static get is() {
    return 'vaadin-date-picker';
  }

  static get version() {
    return '4.4.1';
  }

  static get properties() {
    return {
      /**
       * Set to true to display the clear icon which clears the input.
       * @attr {boolean} clear-button-visible
       * @type {boolean}
       */
      clearButtonVisible: {
        type: Boolean,
        value: false
      },

      /**
       * Set to true to disable this element.
       * @type {boolean}
       */
      disabled: {
        type: Boolean,
        value: false,
        reflectToAttribute: true
      },

      /**
       * The error message to display when the input is invalid.
       * @attr {string} error-message
       */
      errorMessage: String,

      /**
       * A placeholder string in addition to the label. If this is set, the label will always float.
       */
      placeholder: String,

      /**
       * String used for the helper text.
       * @attr {string} helper-text
       */
      helperText: {
        type: String,
        value: ''
      },

      /**
       * Set to true to make this element read-only.
       * @type {boolean}
       */
      readonly: {
        type: Boolean,
        value: false,
        reflectToAttribute: true
      },

      /**
       * This property is set to true when the control value invalid.
       * @type {boolean}
       */
      invalid: {
        type: Boolean,
        reflectToAttribute: true,
        notify: true,
        value: false
      },

      /** @private */
      _userInputValue: String
    };
  }

  static get observers() {
    return [
      '_userInputValueChanged(_userInputValue)',
      '_setClearButtonLabel(i18n.clear)'
    ];
  }

  /** @protected */
  ready() {
    super.ready();

    // In order to have synchronized invalid property, we need to use the same validate logic.
    afterNextRender(this, () => this._inputElement.validate = () => {});

    this._inputElement.addEventListener('change', (e) => {
      // For change event on text-field blur, after the field is cleared,
      // we schedule change event to be dispatched on date-picker blur.
      if (this._inputElement.value === '' && !e.__fromClearButton) {
        this.__dispatchChange = true;
      }
    });
  }

  /** @private */
  _onVaadinOverlayClose(e) {
    if (this._openedWithFocusRing && this.hasAttribute('focused')) {
      this.focusElement.setAttribute('focus-ring', '');
    } else if (!this.hasAttribute('focused')) {
      this.focusElement.blur();
    }
    if (e.detail.sourceEvent && e.detail.sourceEvent.composedPath().indexOf(this) !== -1) {
      e.preventDefault();
    }
  }

  /** @private */
  _toggle(e) {
    e.stopPropagation();
    this[(this._overlayInitialized && this.$.overlay.opened) ? 'close' : 'open']();
  }

  /**
   * @return {HTMLElement}
   * @protected
   */
  _input() {
    return this.$.input;
  }

  set _inputValue(value) {
    this._inputElement.value = value;
  }

  /** @return {string} */
  get _inputValue() {
    return this._inputElement.value;
  }

  /** @private */
  _getAriaExpanded(opened) {
    return Boolean(opened).toString();
  }

  /**
   * Focusable element used by vaadin-control-state-mixin
   * @return {!HTMLElement}
   * @protected
   */
  get focusElement() {
    return this._input() || this;
  }

  /** @private */
  _setClearButtonLabel(i18nClear) {
    // FIXME(platosha): expose i18n API in <vaadin-text-field>
    // https://github.com/vaadin/vaadin-text-field/issues/348
    this._inputElement.shadowRoot.querySelector('[part="clear-button"]')
      .setAttribute('aria-label', i18nClear);
  }
}

customElements.define(DatePickerElement.is, DatePickerElement);

export { DatePickerElement };
