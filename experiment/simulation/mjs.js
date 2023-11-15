function main() {
    /*jslint plusplus: true, vars: true, indent: 2 */
    /*global document, window */

    (function() {
        "use strict";

        function PageUtils() {}

        PageUtils.on = function(eventType, selector, listener) {
            PageUtils.initialize(selector, function(element) {
                element.addEventListener(eventType, listener, false);
            });
        };

        PageUtils.escapeHTML = function(s) {
            return s.replace(/&/g, "&amp;")
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        };

        PageUtils.$import = function(src) {
            //Note: "import" keyword cannot be used in IE 11
            return new Promise(function(resolve, reject) {
                var script = document.createElement("script");
                script.async = true;
                script.src = src;
                //script.setAttribute("crossorigin", "anonymous");
                document.head.appendChild(script);
                script.onload = function() {
                    resolve();
                };
                script.onerror = function() {
                    reject();
                };
            });
        };

        var initializers = {
            className: {},
            tagName: {}
        };

        var checkElement = function(element) {
            var tagName = element.tagName.toLowerCase();
            if (element.hasAttributes() || tagName === "details") { // for performance
                var initialized = element.getAttribute("data-i");
                if (initialized == undefined) {
                    var callback = initializers.tagName[tagName];
                    if (callback != undefined) {
                        element.setAttribute("data-i", "1");
                        callback(element);
                    }
                    var classList = element.classList;
                    if (classList != undefined) { // <math> in IE 11, Opera 12 (during the check for MathML support)
                        var classListLength = classList.length;
                        if (classListLength !== 0) {
                            element.setAttribute("data-i", "1");
                            var t = 0;
                            for (var k = 0; k < classListLength; k += 1) {
                                var className = classList[k];
                                var callback = initializers.className[className];
                                if (callback != undefined) {
                                    if (t > 0) {
                                        throw new TypeError(classList.toString());
                                    }
                                    t += 1;
                                    callback(element);
                                }
                            }
                        }
                    }
                }
            }
        };

        var checkCustomPaint = function(element) {
            if (element.getAttribute("data-custom-paint") != undefined) {
                if (element.getAttribute("data-p") == undefined && element.getBoundingClientRect().top !== 0) {
                    element.setAttribute("data-p", "1");
                    element.dispatchEvent(new Event('custom-paint', {
                        bubbles: true
                    }));
                }
            }
        };

        var checkSubtree = function(element) {
            checkElement(element);
            var firstElementChild = element.firstElementChild;
            while (firstElementChild != undefined) {
                checkSubtree(firstElementChild);
                firstElementChild = firstElementChild.nextElementSibling;
            }
        };

        var checkSubtree2 = function(element) {
            checkCustomPaint(element);
            var firstElementChild = element.firstElementChild;
            while (firstElementChild != undefined) {
                checkSubtree2(firstElementChild);
                firstElementChild = firstElementChild.nextElementSibling;
            }
        };

        // copy-pasted from MathML.js:
        var q = [];
        var queue = function(callback) {
            if (q.length === 0) {
                var c = function() {
                    for (var i = 0; i < q.length; i += 1) {
                        q[i]();
                    }
                    q.length = 0;
                };
                window.requestAnimationFrame(c);
            }
            q.push(callback);
        };

        var checkSubtree2Wrapper = function(element) {
            queue(function() {
                checkSubtree2(element);
            });
        };

        var started = false;

        PageUtils.initialize = function(selector, callback) {
            if (selector.startsWith(".")) {
                var className = selector.slice(1);
                if (started || initializers.className[className] != undefined) {
                    throw new TypeError(className);
                }
                initializers.className[className] = callback;
            } else {
                initializers.tagName[selector] = callback;
            }
        };

        var observe = function() {
            if (!started) {
                started = true;
                // some initializers can modify DOM, so it is important to call `checkSubtree` after `observer.observe`
                checkSubtree(document.body);
                checkSubtree2Wrapper(document.body);
            }
        };

        var preObserve = function() {
            if (true) {
                // trying to initialize page earlier (before first paint (?))
                observe();
            }
            //loadI18n();
        };

        PageUtils.waitI18n = function(callback) {
            if (globalThis.i18n != null) {
                callback();
            } else {
                window.addEventListener('i18n-loaded', function(event) {
                    callback();
                }, {
                    once: true
                });
            }
        };

        // document.documentElement.lang === PageUtils.ROOT_SITE_LANG ? '.' : '..'
        PageUtils.ROOT_PATH = document.documentElement.getAttribute('data-root-path') || (document.currentScript.src.replace(/\?[\s\S]*/g, '') + '/..');

        var loadI18n = function() {
            var lang = document.documentElement.lang;
            //! the lang is set to iw-x-mtfrom-en at https://translate.googleusercontent.com/translate_c?depth=1&hl=iw&prev=search&rurl=translate.google.co.il&sl=en&u=https://matrixcalc.org/en/ - TODO - check
            if (lang.indexOf('-mtfrom-') !== -1) {
                lang = lang.slice(lang.indexOf('-mtfrom-') + '-mtfrom-'.length);
            }
            var i18nUrl = './i18n-' + lang + '.json' + (document.documentElement.getAttribute('data-version-tag') || '');
            // Use `cache: 'force-cache'` to workaround the issue, that Cache-Control is different for HTML/JS/CSS and JSON
            // As we have a version tag in the query string, it should be fine.
            fetch(i18nUrl, {
                credentials: 'same-origin',
                cache: 'force-cache'
            }).then(function(response) {
                return response.json();
            }).then(function(i18n) {
                globalThis.i18n = i18n;
                if (i18n.errors == null) {
                    window.location.reload(true); //!
                }
                //observe();
                window.dispatchEvent(new Event('i18n-loaded')); // https://stackoverflow.com/a/42837595/839199
            });
        };
        loadI18n();

        function onDOMReady(event) {
            //TODO: remove
            var scriptVersion = '?20230404T194925Z';
            var htmlVersion = document.documentElement.getAttribute('data-version-tag') || scriptVersion;
            if ((scriptVersion !== htmlVersion) && (window.location.protocol === 'http:' || window.location.protocol === 'https:') && Object.keys != null && Object.keys(initializers).length !== 0 && window.fetch != null) {
                // a workaround for a caching bug in browsers
                // https://bugs.chromium.org/p/chromium/issues/detail?id=899752 - ?
                // Chrome/70
                // also there are some another error in Firefox, seems
                // Chrome - only for http: protocol, seems
                // Firefox - any protocol - ? (https:)
                fetch(window.location.href.replace(/^http\:/g, 'https:'), {
                    cache: "reload"
                }).then(function(response) {
                    return response.text();
                }).then(function(text) {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(text, "text/html");
                    document.body.innerHTML = doc.body.innerHTML;
                    preObserve();
                })["catch"](function() {
                    preObserve(); //!
                });
            } else {
                preObserve();
            }
        }

        if (document.readyState === "interactive" || document.readyState === "complete") {
            window.setTimeout(function() {
                onDOMReady(null);
            }, 0);
        } else {
            document.addEventListener("DOMContentLoaded", onDOMReady, {
                once: true
            });
        }

        // workaround for browsers, which do not support MutationObserver
        PageUtils.check = function(element) {
            checkSubtree(element);
            checkSubtree2Wrapper(element);
        };

        PageUtils.check1 = function(element) {
            checkSubtree(element);
            checkSubtree2Wrapper(element);
        };

        //Note: `Utils` is not a good name (somehow web clients may already have a variable with that name)
        globalThis.PageUtils = PageUtils;

    }());

    // Hello,
    // Please, don't make a full clone of this application for wide publishing purposes.
    // Some of the code is shared, some parts have their own license linked in the comments.
    // If you need something, you may contact matri-tri-ca@yandex.ru.
    // Have a nice day!

    "use strict"; // It will be in the beginning of a mjs.js.
    /*jslint sloppy: true, indent: 2 */
    /*global XMLHttpRequest, window, Node */

    (function(global) {
        "use strict";

        var encodeURIComponentSafe = function(string) {
            //return encodeURIComponent(String(string).replace(/[\u{D800}-\u{DFFF}]/gu, '\uFFFD'));
            return encodeURIComponent(String(string).replace(/([^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1\uFFFD').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '\uFFFD'));
        };

        var sent = {};
        global.onerror = function(message, filename, lineno, colno, error) {
            var data = "";
            data += "message=" + encodeURIComponentSafe(message || "") + "&";
            data += "filename=" + encodeURIComponentSafe(filename || "") + "&";
            data += "lineno=" + encodeURIComponentSafe(lineno || 0) + "&";
            data += "colno=" + encodeURIComponentSafe(colno || 0) + "&";
            data += "stack=" + encodeURIComponentSafe(error != undefined ? error.stack || "" : "");
            if (sent[data] == undefined && window.location.protocol !== "file:") {
                sent[data] = data;
                var xhr = new XMLHttpRequest();
                xhr.open("POST", "https://matrixcalc.mcdir.ru/jserrors.php?error=1", true);
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                xhr.send(data);
                if (error instanceof TypeError && lineno !== 1 && global.sendSnapshot != null) {
                    global.sendSnapshot();
                }
            }
        };

    }(self));



    // Safari has no it
    if (!window.requestIdleCallback) {
        window.requestIdleCallback = function(callback) {
            window.setTimeout(callback, 0);
        };
    }

    // IE, Edge, Firefox, Opera
    if (!Element.prototype.scrollIntoViewIfNeeded) {
        Element.prototype.scrollIntoViewIfNeeded = function() {
            "use strict";
            // `centerIfNeeded` is not implemented
            var rect = this.getBoundingClientRect();
            if (rect.left < 0 || document.documentElement.clientWidth < rect.right ||
                rect.top < 0 || document.documentElement.clientHeight < rect.bottom) {
                this.scrollIntoView(document.documentElement.clientHeight < rect.bottom - rect.top || rect.top < 0);
            }
        };
    }


    // layout work (?)
    var getMathMLSupport2 = function(callback) {
        var tmp = document.createElement("div");
        tmp.style.position = "fixed";
        tmp.style.top = "0px"; // affects layout root in Chrome
        tmp.style.left = "0px"; // affects layout root in Chrome
        tmp.style.whiteSpace = "nowrap";
        tmp.style.width = "0px";
        tmp.style.height = "0px";
        tmp.style.overflow = "hidden";
        tmp.style.visibility = "hidden";
        tmp.style.contain = "strict"; //TODO: ?

        var table = function(id, attr) {
            return '<math><mtable id="' + id + '"' + (attr !== '' ? ' ' + attr : '') + '>' + ('<mtr>' + '<mtd><mn>0</mn></mtd>'.repeat(4) + '</mtr>').repeat(4) + '</mtable></math>';
        };

        // use long number to detect increase of the width:
        // have to implement stretching for Chrome on Android:
        tmp.innerHTML = [
            table('rowspacing-a', ''),
            table('rowspacing-b', 'rowspacing="0ex"'),
            table('columnspacing-a', ''),
            table('columnspacing-b', 'columnspacing="0em"'),
            table('columnlines-b', ''),
            table('columnlines-a', 'columnlines="none solid none"'),
            '<math><mrow id="mpadded-b"><mn>1234567890</mn></mrow></math>',
            '<math><mpadded id="mpadded-a" width="+1em" lspace="+1em"><mn>1234567890</mn></mpadded></math>',
            '<math><mrow id="menclose-a"><mn>1</mn></mrow></math>',
            '<math><menclose id="menclose-b" notation="circle"><mn>1</mn></menclose></math>',
            '<math id="linebreaking-a" style="white-space: nowrap;"><mn>1</mn><mo>+</mo><mn>1</mn><mo>=</mo><mn>1</mn></math>',
            '<math id="linebreaking-b" style="white-space: normal;"><mn>1</mn><mo>+</mo><mn>1</mn><mo>=</mo><mn>1</mn></math>',
            '<math><mrow><mo id="stretchy-operators-a">(</mo><mtable><mtr><mtd><mn>0</mn></mtd></mtr><mtr><mtd><mn>0</mn></mtd></mtr><mtr><mtd><mn>0</mn></mtd></mtr></mtable><mo>)</mo></mrow></math>',
            '<math><mrow><mo id="stretchy-operators-b">(</mo><mi>X</mi><mo>)</mo></mrow></math>',
            '<math><mrow><mover accent="true"><mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow><mo id="stretchy-horizontal-operators-a">¯</mo></mover></mrow></math>',
            '<math><mi>x</mi><mo id="stretchy-horizontal-operators-b">+</mo><mi>y</mi></math>'
        ].join('');

        (document.body || document.documentElement).appendChild(tmp);

        return function() {
            var t = document.getElementById('columnspacing-a');
            // In IE the widths are almost equal
            var epsilon = 5e-5;

            var width = function(id) {
                return document.getElementById(id).getBoundingClientRect().width;
            };
            var height = function(id) {
                return document.getElementById(id).getBoundingClientRect().height;
            };

            var menclose = width('menclose-a') + height('menclose-a') + 3 < width('menclose-b') + height('menclose-b'); // for inline elements there is some different, so bigger epsilon is needed
            var rowspacingTooSmall = Number.parseFloat(window.getComputedStyle(document.querySelector('#rowspacing-a mn'), null).fontSize) > 1.4 * document.querySelector('#rowspacing-a mn').getBoundingClientRect().height;

            window.requestIdleCallback(function() {
                window.requestAnimationFrame(function() {
                    tmp.parentNode.removeChild(tmp);
                });
            });
            //TODO: !?
            return [(width('columnspacing-a') - epsilon > width('columnspacing-b') ? "" : "no-columnspacing"),
                (width('mpadded-a') - epsilon > width('mpadded-b') ? "" : "no-mpadded"),
                (width('columnlines-a') - epsilon > width('columnlines-b') ? "" : "no-columnlines"),
                (width('linebreaking-a') - epsilon > width('linebreaking-b') ? "" : "no-linebreaking"),
                (width('stretchy-horizontal-operators-a') - epsilon > width('stretchy-horizontal-operators-b') ? "" : "no-stretchy-horizontal-operators"),
                (height('rowspacing-a') - epsilon > height('rowspacing-b') ? "" : "no-rowspacing"),
                (height('stretchy-operators-a') - epsilon > height('stretchy-operators-b') ? "" : "no-stretchy-operators"),
                (menclose ? "" : "no-menclose"),
                (!rowspacingTooSmall ? "" : "no-rowspacing-bug"), // Safari 16.1, Chrome
                (t.draggable != null ? "" : "no-draggable")
            ];
        };
    };

    function polyfillMathML(mathmlSupport) {
        var c = window.opera != undefined ? 'math no-columnspacing no-mpadded no-columnlines no-menclose no-rowspacing no-draggable'.split(" ") : mathmlSupport();
        var classes = c;
        for (var i = 0; i < classes.length; i += 1) {
            if (classes[i] !== "") {
                document.body.classList.toggle(classes[i], true);
            }
        }
    }


    if (document.readyState === "interactive" || document.readyState === "complete") {
        polyfillMathML(getMathMLSupport2());
    } else {
        document.addEventListener("DOMContentLoaded", function(event) {
            polyfillMathML(getMathMLSupport2());
        }, {
            once: true
        });
    }

    // I want to have focusable and draggable element, mrow[href="#"] can be used, but I need to prevent the navigation.
    if (true) {
        // Opera supports MathML links too with some special CSS
        var preventNavigation = function(event) {
            if (event.button === 0 || event.button === 1) {
                var target = event.target.closest('[href]');
                if (target != null && target.getAttribute('href') === '#') {
                    var tagName = target.tagName.toLowerCase();
                    if (tagName === 'mrow' || tagName === 'mtd') {
                        event.preventDefault();
                    }
                }
            }
        };
        document.addEventListener("click", preventNavigation, false);
        document.addEventListener("auxclick", preventNavigation, false);
    }

    document.addEventListener('animationstart', function(event) {
        if (event.animationName === 'mathmlAnimation') {
            var target = event.target;
            if (target.matches('mo') && target.textContent === '¯') {
                var scaleX = (target.parentNode.clientWidth / target.clientWidth) || 1;
                window.requestAnimationFrame(function() {
                    if (target.style != null) {
                        target.style.transform = 'scale(' + scaleX + ', 1)';
                        target.style.top = '1.75ex';
                        target.style.display = 'inline-block';
                        target.style.position = 'relative';
                    }
                });
            }
            if (target.matches('mo') && /^[\(\)\||{\}]$/.test(target.textContent)) {
                var fontSize = Number.parseFloat(window.getComputedStyle(target, null).fontSize);
                var height = target.parentNode.clientHeight; // Element#offsetHeight is not here in Chrome
                var scaleY = Math.max(height / fontSize - 0.1875, 0);
                if (scaleY === 0 || Math.abs(scaleY - 1) < 0.05) { // 0 when the element is not rendered
                    scaleY = 1;
                }
                var scaleX = Math.sqrt(Math.sqrt(scaleY));
                window.requestAnimationFrame(function() {
                    target.style.transform = 'scale(' + scaleX + ', ' + scaleY + ')';
                });
            }
            if (target.matches('mtable[columnlines]')) {
                var columnlines = (target.getAttribute('columnlines') || '').replace(/^\s+|\s+$/g, '').split(/\s+/g);
                window.requestAnimationFrame(function() {
                    for (var row = target.firstElementChild; row != null; row = row.nextElementSibling) {
                        for (var cell = row.firstElementChild, index = 0; cell != null; cell = cell.nextElementSibling, index += 1) {
                            if (index > 0) {
                                var linestyle = columnlines[Math.min(index - 1, columnlines.length - 1)];
                                if (linestyle === 'solid' || linestyle === 'dashed') {
                                    if (cell.style != null) {
                                        cell.style.borderLeftStyle = 'linestyle';
                                        cell.style.borderLeftWidth = '1px';
                                    } else {
                                        cell.setAttribute('style', cell.getAttribute('style') + ';' + 'border-left-style: ' + linestyle + ';' + 'border-left-width: 1px;');
                                    }
                                }
                            }
                        }
                    }
                });
            }
            if (target.matches('mrow[draggable]')) {
                if (!('webkitUserDrag' in document.documentElement.style)) {
                    window.requestAnimationFrame(function() {
                        target.setAttribute('href', '#');
                    });
                }
            }
        }
    });


    //!new 2019-11-13
    if ('webkitUserDrag' in document.documentElement.style) {
        // no keydown for Alt in Opera!
        // autorepeat of Alt key does not work in Chrome and no way to get the Alt state(?)
        // It is too slow to toggle class on the document.body!
        // TODO:Caret Browsing mode needs user-select: text!
        window.addEventListener('mousedown', function(event) {
            var target = event.target.closest('[draggable]');
            var es = document.querySelectorAll('mrow[draggable]');
            for (var i = 0; i < es.length; i += 1) {
                es[i].setAttribute('draggable', event.altKey || target == null ? 'false' : 'true');
            }
            // setting draggable to false will hide the text selection in Chrome
        }, false);
    } else {
        // Alt key works good in Firefox
        // change the cursor to text selection cursor for selection:
        var onKeyDownUp = function(event) {
            if (event.keyCode === 18) {
                var es = document.querySelectorAll('mrow[draggable]');
                for (var i = 0; i < es.length; i += 1) {
                    es[i].style.cursor = event.type === 'keydown' ? 'auto' : '';
                }
            }
        };
        window.addEventListener('keydown', onKeyDownUp, false);
        window.addEventListener('keyup', onKeyDownUp, false);
    }

    /*global window, console*/

    (function() {
        "use strict";

        function IDBItemsStorage(fallbackItemsStorageLoad) {
            this.fallbackItemsStorageLoad = fallbackItemsStorageLoad;
        }
        IDBItemsStorage.prototype._ = function(operation, item, key, callback) {
            var fallbackItemsStorageLoad = this.fallbackItemsStorageLoad;
            var useFallback = function() {
                fallbackItemsStorageLoad(function(fallbackItemsStorage) {
                    if (operation === "getAllEntries") {
                        fallbackItemsStorage.getAllEntries(callback);
                    }
                    if (operation === "add") {
                        fallbackItemsStorage.add(item, callback);
                    }
                    if (operation === "delete") {
                        fallbackItemsStorage["delete"](key);
                    }
                    if (operation === "clear") {
                        fallbackItemsStorage.clear();
                    }
                });
            };
            var roundValue = function(value, max) {
                return "10**" + (Math.floor(Math.log(Math.max(value, max) + 0.5) / Math.log(10)) + 1);
            };
            var length = function(value) {
                var n = 0;
                if (value == undefined) {
                    n += 8;
                } else if (typeof value === "boolean") {
                    n += 8;
                } else if (typeof value === "number") {
                    n += 8;
                } else if (typeof value === "string") {
                    n += 16 + value.length;
                } else if (typeof value === "object") {
                    if (value instanceof Array) {
                        for (var j = 0; j < value.length; j += 1) {
                            n += length(value[j]);
                        }
                    } else {
                        for (var i in value) {
                            if (Object.prototype.hasOwnProperty.call(value, i)) {
                                n += length(value[i]);
                            }
                        }
                    }
                }
                return n;
            };
            var handleQuotaExceeded = function(db, item, callback) {
                // delete some old records + repeat
                // `getAllKeys` is used to carefully work with multiple concurrent calls
                var transaction1 = db.transaction("items", "readonly");
                var store1 = transaction1.objectStore("items");
                store1.getAllKeys().onsuccess = function(event) {
                    var keys = event.target.result;
                    var n = keys.length;
                    var slowAdd = function(divisor) {
                        var transaction2 = db.transaction("items", "readwrite");
                        var store2 = transaction2.objectStore("items");
                        transaction2.onabort = function(event) {
                            console.log(event.target.error); // Chrome shows nothing in the Console
                            if (event.target.error != null && event.target.error.name === "QuotaExceededError" && n >= divisor) {
                                slowAdd(divisor * 2);
                            } else {
                                db.close();
                            }
                        };
                        for (var i = 0; i < n - Math.floor(n / divisor); i += 1) {
                            store2["delete"](keys[i]);
                        }
                        store2.add(item).onsuccess = function(event) {
                            var key = event.target.result;
                            transaction2.oncomplete = function(event) {
                                db.close();
                                callback(key);
                            };
                        };
                    };
                    transaction1.oncomplete = function(event) {
                        slowAdd(1);
                    };
                };
                transaction1.onabort = function(event) {
                    console.log(event.target.error); // Chrome shows nothing in the Console
                    db.close();
                };
            };
            var onOpen = function(db) {
                onEvent("access", "successful", undefined);
                // Note: it may throw a NotFoundError
                var transaction = db.transaction("items", operation === "getAllEntries" ? "readonly" : "readwrite");
                var store = transaction.objectStore("items");
                // Looks like "abort" is fired for QuotaExceededError
                transaction.onabort = function(event) {
                    // TypeError: null is not an object (evaluating 'event.target.error.name') - https://matrixcalc.org/slu.html
                    // Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.1 Mobile/15E148 Safari/604.1
                    onEvent(operation, event.target.error != null ? event.target.error.name : null, item);
                    console.log(event.target.error); // Chrome shows nothing in the Console
                    if (operation === "add") {
                        if (event.target.error != null && event.target.error.name === "QuotaExceededError") {
                            handleQuotaExceeded(db, item, callback);
                        } else {
                            db.close();
                        }
                    } else {
                        db.close();
                        if (operation === "getAllEntries") {
                            callback({
                                keys: [],
                                items: []
                            });
                        }
                    }
                };
                if (operation === "getAllEntries") {
                    store.getAllKeys().onsuccess = function(event) {
                        var keys = event.target.result;
                        store.getAll().onsuccess = function(event) {
                            var items = event.target.result;
                            transaction.oncomplete = function(event) {
                                onEvent(operation, "successful", {
                                    keys: keys,
                                    items: items
                                });
                                db.close();
                                callback({
                                    keys: keys,
                                    items: items
                                });
                            };
                        };
                    };
                } else if (operation === "add") {
                    store.add(item).onsuccess = function(event) {
                        var key = event.target.result;
                        transaction.oncomplete = function(event) {
                            onEvent(operation, "successful", item);
                            db.close();
                            callback(key);
                        };
                    };
                } else if (operation === "delete") {
                    store["delete"](key);
                    db.close();
                } else if (operation === "clear") {
                    store.clear();
                    db.close();
                    //TODO: REMOVE
                    try {
                        var s = window.localStorage;
                        if (s) {
                            s.removeItem("resdiv");
                        }
                    } catch (error) {
                        console.error(error);
                    }
                    //if (fallbackItemsStorage != null) {
                    //  fallbackItemsStorage.clear(); //TODO: remove
                    //}
                }
            };
            var start = Date.now();
            var onEvent = function(operation, errorName, value) {
                var tmp = {};
                tmp[operation] = {
                    ok: errorName,
                    duration: roundValue(Date.now() - start, 100 - 1),
                    valueLength: roundValue(length(value), 1000 - 1)
                };
                hit({
                    idb: tmp
                });
            };
            var indexedDB = undefined;
            var wasError = false;
            try {
                indexedDB = window.indexedDB;
            } catch (error) {
                wasError = true;
                // "Cookies blocking in Firefox" - https://github.com/Modernizr/Modernizr/issues/1825#issuecomment-171087703
                onEvent("access", error.name, undefined);
                console.log(error);
                useFallback();
            }
            if (!wasError &&
                indexedDB != undefined) {
                var openRequest = undefined;
                try {
                    openRequest = indexedDB.open("acthistory");
                } catch (error) {
                    // "SecurityError" for opaque origins
                    onEvent("access", error.name, undefined);
                    console.log(error);
                    useFallback();
                }
                if (openRequest != undefined) {
                    openRequest.onupgradeneeded = function(event) {
                        var db = event.target.result;
                        if (db == null) {
                            // Mozilla/5.0 (Linux; U; Android 9; ru-ru; Redmi Note 5 Build/PKQ1.180904.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.141 Mobile Safari/537.36 XiaoMi/MiuiBrowser/11.3.4-g
                            window.onerror('TypeError: db is null, ' + (openRequest.result == null) + ' ' + (event.target === openRequest)); //TODO: remove
                            useFallback();
                        }
                        //Note: as the version was not provided, the object store should not exist at this point.
                        var store = db.createObjectStore("items", {
                            //keyPath: undefined, // IE 11 throws an InvalidAccessError for undefined or null
                            autoIncrement: true
                        });
                        //! fallbackItemsStorage should be synchronous
                        var x = (localStorage.getItem('resdiv') || '[]') !== '[]' || /(?:^|;)\s*lastResult\s*\=\s*([^;]*)/.test(document.cookie);
                        if (x) {
                            openRequest.transaction.abort();
                            useFallback();
                            //for (var i = 0; i < items.length; i += 1) {
                            //  store.add(items[i]);
                            //}
                        }
                        //TODO: fallbackItemsStorage.clear()
                    };
                    //Note: this will handle abort of `openRequest.transaction` or an error during creation of a new database (step 5.1.6)
                    openRequest.onerror = function(event) {
                        onEvent("access", event.target.error != null ? event.target.error.name : null, undefined);
                        console.log(event.target.error);
                        useFallback();
                        event.preventDefault(); // FireFox 52 - 57
                    };
                    openRequest.onsuccess = function(event) {
                        var db = event.target.result;
                        if (!db.objectStoreNames.contains("items")) {
                            onEvent("access", "No store", undefined);
                            console.log("No store");
                            if (operation === "getAllEntries") {
                                callback({
                                    keys: [],
                                    items: []
                                });
                            }
                        } else {
                            onOpen(db);
                        }
                    };
                }
            } else if (!wasError) {
                onEvent("access", "No indexedDB", undefined);
                console.log("No indexedDB");
                useFallback();
            }
        };
        IDBItemsStorage.prototype.getAllEntries = function(callback) {
            this._("getAllEntries", undefined, undefined, callback);
        };
        IDBItemsStorage.prototype.add = function(item, callback) {
            this._("add", item, undefined, callback);
        };
        IDBItemsStorage.prototype["delete"] = function(key) {
            this._("delete", undefined, key, undefined);
        };
        IDBItemsStorage.prototype.clear = function() {
            this._("clear", undefined, undefined, undefined);
        };

        globalThis.IDBItemsStorage = IDBItemsStorage;
    }());

    /*global ItemsStorage */

    (function() {
        "use strict";

        var td = globalThis.TextDecoder != null ? new TextDecoder() : null;
        var te = globalThis.TextEncoder != null ? new TextEncoder() : null;
        var forceOneByte = function(s) {
            if (td == null || te == null) {
                return s;
            }
            return td.decode(te.encode(s));
        };

        var compress = function(html) {
            // make string ASCII-only
            var s = html.replace(/[\u0080-\uD7FF\uE000-\uFFFF]/g, function(s) {
                return '&#x' + ('0000' + s.charCodeAt(0).toString(16).toUpperCase()).slice(-4) + ';';
            });
            //TODO: pairs and invalid chars
            return forceOneByte(s);
        };

        ActHistoryStorage.createItem = function createItem(data) {
            //var oldVersion = data.version || 0;
            //if (oldVersion < ActHistoryStorage.itemVersion) {
            //  data = ItemsStorage.updateItem(data);
            //}
            //this.oldVersion = oldVersion;
            return {
                resultHTML: compress(data.resultHTML || ""),
                resultMatrix: data.resultMatrix || "",
                details: data.details,
                expressionString: data.expressionString,
                actHistoryId: data.actHistoryId,
                detailsHTML: compress(data.detailsHTML || ""),
                version: data.version,
                timestamp: data.timestamp
            };
        }

        ActHistoryStorage.itemVersion = 22;

        function ActHistoryStorage(itemsStorage) {
            this.itemsStorage = itemsStorage;
            this.actHistory = {};
            this.actHistoryId = 0;
        }
        ActHistoryStorage.prototype.load = function(callback) {
            this.itemsStorage.getAllEntries(function(tmp) {
                var keys = tmp.keys;
                var items = tmp.items;

                var needsUpdate = false;
                for (var i = 0; i < items.length; i += 1) {
                    var key = keys[i];
                    var item = items[i];
                    if (item != null && item.version < ActHistoryStorage.itemVersion) {
                        needsUpdate = true;
                    }
                }
                //TODO: remove waitExpression
                var f = needsUpdate ? globalThis.waitExpression : function(c) {
                    c();
                };

                f(function() {
                    this.actHistory = {};
                    for (var i = 0; i < items.length; i += 1) {
                        var key = keys[i];
                        var item = items[i];
                        if (item != null) { //! some strange issue in Safari
                            if (item.version < ActHistoryStorage.itemVersion) {
                                item = ItemsStorage.updateItem(item);
                            }
                            this.actHistory[key] = {
                                item: item,
                                key: key
                            };
                            this.actHistoryId = Math.max(this.actHistoryId, key);
                        }
                    }
                    callback(this.actHistory);
                }.bind(this));
            }.bind(this));
        };
        ActHistoryStorage.prototype.getPreviousItem = function() {
            var previousItem = undefined;
            for (var i in this.actHistory) {
                if (Object.prototype.hasOwnProperty.call(this.actHistory, i)) { // TODO: iteration order - ?
                    if (this.actHistory[i] != undefined) {
                        previousItem = this.actHistory[i].item;
                    }
                }
            }
            return previousItem;
        };
        ActHistoryStorage.prototype.size = function() {
            var size = 0;
            for (var i in this.actHistory) {
                if (Object.prototype.hasOwnProperty.call(this.actHistory, i)) {
                    if (this.actHistory[i] != undefined) {
                        size += 1;
                    }
                }
            }
            return size;
        };
        ActHistoryStorage.prototype.getItem = function(actHistoryId) {
            var x = this.actHistory[actHistoryId];
            return x == undefined ? undefined : x.item;
        };
        ActHistoryStorage.prototype.setItem = function(actHistoryId, item) {
            this.actHistory[actHistoryId] = {
                item: item,
                key: undefined
            };
            this.itemsStorage.add(item, function(key) {
                this.actHistoryId = Math.max(this.actHistoryId, key);
                if (this.actHistory[actHistoryId] != undefined) {
                    this.actHistory[actHistoryId] = {
                        item: item,
                        key: key
                    };
                } else {
                    this.itemsStorage["delete"](key);
                }
            }.bind(this));
        };
        ActHistoryStorage.prototype.removeItem = function(actHistoryId) {
            var key = this.actHistory[actHistoryId].key;
            if (key != undefined) {
                this.itemsStorage["delete"](key);
            }
            delete this.actHistory[actHistoryId];
        };
        ActHistoryStorage.prototype.clear = function() {
            this.itemsStorage.clear();
            this.actHistory = {};
        };

        ActHistoryStorage.prototype.getActHistory = function() {
            return Object.assign({}, this.actHistory);
        };

        globalThis.ActHistoryStorage = ActHistoryStorage; //!

    }());

    /*global RPN*/

    (function() {
        "use strict";

        function RPNProxy() {}

        RPNProxy.getPositionInfo = function() {
            //TODO: async
            return RPN.getPositionInfo();
        };
        RPNProxy.toMathML = function(matrix, options) {
            //TODO: async
            var result = RPN.toMathML(matrix, options);
            return result;
        };
        RPNProxy.createDetailsSummary = function(idPrefix, details, bestMethodsLimit) {
            //TODO: async
            var result = RPN.createDetailsSummary(idPrefix, details, bestMethodsLimit);
            return result;
        };
        RPNProxy.getMatrix = function(string, callback, errorCallback) {
            try {
                var result = RPN.getMatrix(string);
                callback(result);
            } catch (error) {
                errorCallback(error);
            }
        };
        RPNProxy.getElementsArray = function(matrixTableState, callback) {
            var result = RPN.getElementsArray(matrixTableState);
            callback(result);
        };
        RPNProxy.checkExpressions = function(textareaValue, type, callback, errorCallback) {
            try {
                var result = RPN.checkExpressions(textareaValue, type);
                callback(result);
            } catch (error) {
                errorCallback(error);
            }
        };
        RPNProxy.checkExpression = function(input, callback, errorCallback) {
            try {
                var result = RPN.checkExpression(input);
                callback(result);
            } catch (error) {
                errorCallback(error);
            }
        };
        RPNProxy.runExpression = function(input, kInputValue, kInputId, matrixTableStates, printOptions, callback) {
            var result = RPN.runExpression(input, kInputValue, kInputId, matrixTableStates, printOptions);
            callback(result);
        };
        RPNProxy.getDetails = function(data, printOptions, callback) {
            var result = RPN.getDetails(data, printOptions);
            callback(result);
        };

        globalThis.RPNProxy = RPNProxy;
    }());

    /*jshint esversion:6*/

    (function() {
        "use strict";

        // tabindex="0" - remove tabindex, as it does not work well with spatial navigation
        var INSERT_TABLE_TEMPLATE = '' +
            '<div data-for="NAME" tabindex="-1" class="matrix-table-inner" dir="ltr">' +
            '  <div class="table-container">' +
            '    <math>' +
            '      <mrow>' +
            '        <mo>(</mo>' +
            '        <mpadded height="+0.250em" voffset="+0.125em">' +
            '          <mtable rowspacing="0ex" columnspacing="0em" columnalign="left">' +
            '          </mtable>' +
            '        </mpadded>' +
            '        <mo>)</mo>' +
            '      </mrow>' +
            '    </math>' +
            '  </div>' +
            '  <div class="textarea-container">' +
            '    <math>' +
            '      <mrow>' +
            '        <mo>(</mo>' +
            '        <mpadded height="+0.250em" voffset="+0.125em">' +
            '          <mi>' +
            '            <span class="a-input">' +
            '              <textarea id="TEXTAREA_NAME" name="TEXTAREA_NAME" wrap="off" autocapitalize="off" autocomplete="off" spellcheck="false" class="matrix-table-textarea unfocused-placeholder" placeholder=""></textarea>' +
            '            </span>' +
            '          </mi>' +
            '        </mpadded>' +
            '        <mo>)</mo>' +
            '      </mrow>' +
            '    </math>' +
            '  </div>' +
            '</div>' +
            '<div role="group">' +
            '  <span class="div-nowrap">' +
            '    <button type="button" class="increment-size-button resize-table-button" data-increment="+1">+</button>' +
            '    <button type="button" class="decrement-size-button resize-table-button" data-increment="-1">&minus;</button>' +
            '  </span>' +
            '  <button type="button" aria-pressed="mixed" style=" visibility: hidden;" class="swap-mode-button"></button>' +
            '  <button type="button" aria-pressed="mixed" class="numbers-only-mode-button">⌨</button>' +
            '  <button type="button" class="upload-image" style=" visibility: hidden;"><span>📷︎</span></button>' +
            '  <input type="file" name="upload" accept="image/*" hidden />' +
            '  <button type="button" class="undo-button" disabled hidden>↶</button>' +
            '  <button type="button" class="redo-button" disabled hidden>↷</button>' +
            '  <button type="button" class="clear-table-button" style=" visibility: hidden;"><span>🧹︎</span></button>' +
           
            '</div>';

        var insertTableTemplate = document.createElement('div');
        insertTableTemplate.innerHTML = INSERT_TABLE_TEMPLATE.trim().replace(/>\s+</g, '><');

        var inputTemplate = document.createElement("div");
        var prepareInputTemplate = function() {
            var isInsertTextWorking = function() {
                var activeElement = document.activeElement;
                var input = document.createElement('input');
                input.style.position = 'fixed'; // prevent scrolling - ?
                input.style.top = '0px';
                input.style.left = '0px';
                input.style.opacity = '0.05';
                input.style.contain = 'strict';
                (document.body || document.documentElement).appendChild(input);
                input.focus({
                    preventScroll: true
                });
                var result = document.queryCommandEnabled('insertText');
                window.requestIdleCallback(function() {
                    window.requestAnimationFrame(function() {
                        input.parentNode.removeChild(input);
                    });
                });
                if (activeElement != null) {
                    activeElement.focus({
                        preventScroll: true
                    });
                }
                return result;
            };
            //! autocomplete:
            //! "off" does not allow to use the bfcache, but helps with an input from mobiles

            // no way to input negative numbers on some android devices with inputmode="numeric" or inputmode="decimal"
            // https://bugs.webkit.org/show_bug.cgi?id=197916 - numeric becomes useless in iOS 13
            var userAgent = window.navigator.userAgent;
            var inputMode = /android/i.test(userAgent) || !/OS\s+12/.test(userAgent) ? '' : 'numeric';

            var pattern = '[\\p{Decimal_Number}\\p{Punctuation}\\p{Math}\\p{Script=Latin}\\p{Script=Greek}\\p{Other_Number}]+'; // "contextual information" to determine which type of virtual keyboard should be presented to the user
            //console.assert(new RegExp('^(?:' + pattern + ')$', 'u').test("ⅇ^(ⅈ⋅π)+1=x") === true);

            // https://github.com/whatwg/html/issues/3478
            // https://github.com/whatwg/html/issues/4589

            //! Notes:
            //! extra spans - to fix an issue in Firefox with an extra height
            //! lang="" affects monospace font selection
            var INPUT_TEMPLATE = ('<span class="matrix-table-cell">' +
                    '  <span>' +
                    '    <span class="a-input">' +
                    '      <input type="text" id="id" name="name" autocapitalize="off" autocomplete="off" ' +
                    '             spellcheck="false" inputmode="${inputMode}" class="matrix-table-input unfocused-placeholder" ' +
                    '             data-for="for" data-row="-1" data-column="-1" enterkeyhint="enter" placeholder="0" ' +
                    '             pattern="${pattern}" />' +
                    '    </span>' +
                    '  </span>' +
                    '</span>').trim().replace(/>\s+</g, '><')
                .replace(/a\-input/, !('activeElement' in document) ? '' : 'a-input') // Firefox 2
                .replace(/\$\{inputMode\}/g, inputMode)
                .replace(/\$\{pattern\}/g, pattern);
            //var isFirefox = /firefox/i.test(window.navigator.userAgent);//TODO: fix
            //TODO: check in Firefox 89 - insertText should work, but is global undo stack needed? + the issus with placeholder (resets the undo stack) - there is a workaround
            var isFirefox = /*!isInsertTextWorking() || */ HTMLInputElement.prototype.mozIsTextField != null; //!
            inputTemplate.innerHTML = (isFirefox && window.customElements != null ? INPUT_TEMPLATE.replace(/<input ([^>]+) \/>/g, '<custom-input $1></custom-input>') : INPUT_TEMPLATE);
        };
        prepareInputTemplate();

        // for layout initialization
        function MatrixTableBase() {}
        MatrixTableBase.initialize = function(container, type, name) {
            var content = insertTableTemplate.cloneNode(true);
            var matrixTableInner = content.firstElementChild;
            var toolbar = content.lastElementChild;
            var placeholder = '';
            if (type === 'system') {
                //TODO: what user input coefficient matrices or systems - ?
                placeholder = '' +
                    '-2x+2y-3z=0\n' +
                    '-x+y-3z=0\n' +
                    '2x+0y-z=0\n' +
                    //'    ' + i18n.unused.other.or + '    \n' + //TODO: i18n.other.or
                    '    ' + document.getElementById('i18n-or').textContent + '    \n' +
                    '-2  2 -3 0\n' +
                    '-1  1 -3 0\n' +
                    ' 2  0 -1 0';
            } else {
                placeholder = '' +
                    '-2  2 -3\n' +
                    '-1  1  3\n' +
                    ' 2  0 -1/3';
            }
            matrixTableInner.querySelector('textarea').placeholder = placeholder;
            container.appendChild(matrixTableInner);
            container.appendChild(toolbar);

            var setParentheses = function(open, close) {
                var updateMo = function(mo, content) {
                    if (content === '') {
                        mo.parentNode.removeChild(mo);
                    } else {
                        mo.textContent = content;
                    }
                };
                var updateMrow = function(mrow, open, close) {
                    updateMo(mrow.firstElementChild, open);
                    updateMo(mrow.lastElementChild, close);
                };
                updateMrow(matrixTableInner.querySelector('.table-container').querySelector('mrow'), open, close);
                updateMrow(matrixTableInner.querySelector('.textarea-container').querySelector('mrow'), open, close);
            };
            if (type === 'polynomial') {
                setParentheses('', '');
            }
            if (type === 'system') {
                setParentheses('{', '');
            }

            var textarea = container.querySelector("textarea");
            var textareaName = name + "-textarea";
            textarea.id = textareaName;
            textarea.name = textareaName;

            container.classList.toggle("matrix-table", true);

        };

        MatrixTableBase.onKeyDown = null;
        MatrixTableBase.onInput = null;

        MatrixTableBase._onKeyDown = function(event) {
            MatrixTableBase.onKeyDown(event);
        };
        MatrixTableBase._onInput = function(event) {
            MatrixTableBase.onInput(event);
        };

        function addInputEventListeners(input) {
            input.addEventListener('beforeinput', MatrixTableBase._onKeyDown, false);
            input.addEventListener('keydown', MatrixTableBase._onKeyDown, false);
            input.addEventListener('input', MatrixTableBase._onInput, false);
        }
        /*function removeInputEventListeners(input) {
          input.removeEventListener('input', MatrixTableBase._onInput, false);
          input.removeEventListener('keydown', MatrixTableBase._onKeyDown, false);
          input.removeEventListener('beforeinput', MatrixTableBase._onKeyDown, false);
        }*/
        function makeNewInput(tableName, i, j) {
            var aInput = inputTemplate.firstElementChild.cloneNode(true);
            var inputName = tableName + "-" + i + "-" + j;
            var input = aInput.querySelector(".matrix-table-input");
            input.id = inputName;
            input.name = inputName;
            input.setAttribute("data-for", tableName);
            input.setAttribute("data-row", i);
            input.setAttribute("data-column", j);
            return aInput;
        }

        // some hacks to use native undo/redo stack in Chrome:
        // TODO: https://www.grapecity.com/blogs/easy-undo-redo-for-html-forms - to make it cross browser (?)
        /*var retrieveInput = function (tableName, i, j) {
          var inputName = tableName + "-" + i + "-" + j;
          var input = document.getElementById(inputName);
          if (input != null) {
            input.oninput = null;
            return input.closest('.matrix-table-cell');
          }
          return null;
        };

        //TODO: UNDO is broken in Chrome 106 !!! after element reattached to the DOM

        var getElementStorage = function () {
          // element storage cannot be part of the matrix table container to support "undo" of the table removal
          var elementStorage = document.getElementById("matrix-table-element-storage");
          if (elementStorage == null) {
            var tmp = document.createElement("div");
            tmp.id = "matrix-table-element-storage";
            tmp.style.position = "absolute";
            tmp.style.width = "0px";
            tmp.style.height = "0px";
            tmp.style.overflow = "hidden";
            tmp.style.contain = "strict";
            document.body.appendChild(tmp);
            elementStorage = tmp;
          }
          return elementStorage;
        };
        var removeInputs = function (cell) {
          var input = cell.querySelector('.matrix-table-input');
          removeInputEventListeners(input);
          //updateInputValue(input, '');
          input.oninput = function (event) {
            MatrixTableBase.onInputOnRemovedInput(event);
          };
          getElementStorage().appendChild(input.closest('.matrix-table-cell'));
        };*/

        MatrixTableBase.onInputOnRemovedInput = null;

        //TODO: !?
        function makeContent(variableName) {
            var i = variableName.indexOf("_");
            if (i === -1) {
                return '<mi>${x}</mi>'.replace(/\$\{x\}/g, variableName);
            }
            var t = '<msub><mi>${x}</mi><mn>${i}</mn></msub>';
            return t.replace(/\$\{x\}/g, variableName.slice(0, i)).replace(/\$\{i\}/g, variableName.slice(i + 1));
        }
        MatrixTableBase.makeContent = makeContent;

        MatrixTableBase.addMoreCells = function(tbody, type, rows, cols, tableName, variableNames) {
            var table = new Array(rows);
            var MathML = "http://www.w3.org/1998/Math/MathML";
            var row = tbody.firstElementChild;
            for (var i = 0; i < rows; i += 1) {
                table[i] = new Array(cols);
                if (row == null) {
                    row = document.createElementNS(MathML, "mtr");
                    tbody.appendChild(row);
                }
                row.style.display = '';
                var cell = row.firstElementChild;
                for (var j = 0; j < cols; j += 1) {
                    if (cell == null) {
                        cell = document.createElementNS(MathML, "mtd");
                        if (type === "system" || type === "polynomial") {
                            if (j > 0) {
                                cell.appendChild(document.createElementNS(MathML, "mo")); // '+' or '='
                                cell.firstElementChild.setAttribute('form', 'infix');
                                cell.firstElementChild.textContent = '+';
                            }
                        }
                        var inputContainer = document.createElementNS(MathML, "mi");
                        cell.appendChild(inputContainer);
                        var aInput = /*retrieveInput(tableName, i, j) || */ makeNewInput(tableName, i, j);
                        addInputEventListeners(aInput.querySelector(".matrix-table-input"));
                        //Note: title is not supported on <mtd>
                        aInput.title = tableName.toLowerCase() + '_(' + (i + 1) + ',' + (j + 1) + ')'; //?TODO: ??? is it useful for big matrices - ?
                        var ariaLabel = tableName.toLowerCase() + ' ' + (i + 1) + ' ' + (j + 1);
                        aInput.querySelector(".matrix-table-input").setAttribute('aria-label', ariaLabel);
                        inputContainer.appendChild(aInput);
                        if (type === "system" || type === "polynomial") {
                            var mo = document.createElementNS(MathML, "mo");
                            mo.innerHTML = '&it;';
                            var mrow = document.createElementNS(MathML, "mrow"); // 'x_j' or ' '
                            cell.appendChild(mo);
                            cell.appendChild(mrow);
                        }
                        row.appendChild(cell);
                    }
                    cell.style.display = '';

                    if (type === "system") {
                        var cellType = i === 0 && j < cols - 1 ? 'coefficient+editable' : (i !== 0 && j < cols - 1 ? 'coefficient' : 'constant');
                        var variableName = cellType !== 'constant' ? variableNames[j] : undefined;
                        var cellState = cellType + ':' + variableName + ':' + j;
                        if (cell.getAttribute('data-cell-state') !== cellState) { // optimization
                            cell.setAttribute('data-cell-state', cellState);
                            //Note: <span> is needed to set the "far" class
                            if (j > 0) {
                                cell.firstElementChild.textContent = (cellType !== 'constant' ? '+' : '=');
                            }
                            var cellHTML = (cellType === 'coefficient+editable' ? '<mi><span class="editable-on-click" data-index="${j}" data-value="${variableName}"></span></mi>'.replace(/\$\{j\}/g, j).replace(/\$\{variableName\}/g, variableName) : '') +
                                (cellType === 'coefficient' ? makeContent(variableName) : '') +
                                (cellType === 'constant' ? "<mtext>&nbsp;</mtext>" : "");
                            //if (i !== 0 || cell.lastElementChild.firstElementChild == null || cell.lastElementChild.firstElementChild.getAttribute('data-value') !== variableName) {
                            cell.lastElementChild.innerHTML = cellHTML;
                            //}
                        }
                    }
                    if (type === "polynomial") {
                        if (j > 0) {
                            cell.firstElementChild.textContent = '+';
                        }
                        //Note: <span> is needed to set the "far" class
                        var cellHTML = (j < cols - 2 ? "<msup><mi>x</mi><mn>" + (cols - j - 1) + "</mn></msup>" : "") +
                            (j === cols - 2 ? "<mi>x</mi>" : "") +
                            (j === cols - 1 ? "<mtext>&nbsp;</mtext>" : "");
                        cell.lastElementChild.innerHTML = cellHTML;
                    }
                    var input = cell.querySelector(".matrix-table-input");
                    table[i][j] = input;
                    cell = cell.nextElementSibling;
                }
                row = row.nextElementSibling;
            }
            return table;
        };

        MatrixTableBase.deleteExtraCells = function(tbody, type, rows, cols) {
            var clearRow = function(row, cell) {
                var c = row.lastElementChild;
                while (c !== cell) {
                    //removeInputs(c);
                    var previous = c.previousElementSibling;
                    //c.parentNode.removeChild(c);
                    c.style.display = 'none';
                    c = previous;
                }
            };
            var row = tbody.firstElementChild;
            for (var i = 0; i < rows; i += 1) {
                var cell = row.firstElementChild;
                for (var j = 0; j < cols; j += 1) {
                    cell = cell.nextElementSibling;
                }
                if (cell != null) {
                    cell = cell.previousElementSibling;
                    clearRow(row, cell);
                }
                row = row.nextElementSibling;
            }
            if (row != null) {
                row = row.previousElementSibling;
                var r = tbody.lastElementChild;
                while (r !== row) {
                    clearRow(r, null);
                    var previous = r.previousElementSibling;
                    //r.parentNode.removeChild(r);
                    r.style.display = 'none';
                    r = previous;line
                }
            }
        };

        /*document.addEventListener('DOMContentLoaded', function () {
          var es = document.querySelectorAll('.insert-table');
          for (var i = 0; i < es.length; i += 1) {
            MatrixTableBase.initialize(es[i]);
          }
        }, false);*/

        window.MatrixTableBase = MatrixTableBase;


    }());

    /*jslint plusplus: true, vars: true, indent: 2, white: true, esversion:6 */
    /*global window, document, console, Node, Image, Element, Event, Dialog, Ya, PageUtils, reportValidity, fetch, initializeAInput, initializeAHighlight, initializeATooltip, MathMLToSVG, ItemsStorage, IDBItemsStorage, RPNProxy, i18n, serializeMatrixContainer, toMultilineString, getTableFromAsciiMathMatrix, ActHistoryStorage, parseMathML, YT*/

    (function() {
        "use strict";

        // TODO: remove?
        // an array of array of strings -> string
        var toMultilineString = function(array) {
            var table = new Array(array.length);
            for (var i = 0; i < array.length; i += 1) {
                var elements = array[i];
                var row = new Array(elements.length);
                for (var j = 0; j < elements.length; j += 1) {
                    row[j] = elements[j].toString().replace(/^\s+|\s+$/g, '');
                }
                table[i] = row;
            }
            var columns = 0;
            for (var i = 0; i < array.length; i += 1) {
                columns = Math.max(columns, array[i].length);
            }
            var columnWidths = new Array(columns);
            for (var i = 0; i < columns; i += 1) {
                columnWidths[i] = 0;
            }
            for (var i = 0; i < table.length; i += 1) {
                var row = table[i];
                for (var j = 0; j < row.length; j += 1) {
                    columnWidths[j] = Math.max(columnWidths[j], row[j].length);
                }
            }
            var result = '';
            for (var i = 0; i < table.length; i += 1) {
                var row = table[i];
                result += (i !== 0 ? '\n' : '');
                for (var j = 0; j < columns; j += 1) {
                    var e = j < row.length ? row[j] : '';
                    result += (j !== 0 ? '\t' : '') + ' '.repeat(columnWidths[j] - e.length) + e;
                }
            }
            return result;
        };


        //TODO: REMOVE
        function waitExpression(callback) {
            if (globalThis.Expression != null) {
                callback();
            } else {
                var script = document.querySelector('script[async]');
                if (script != null) {
                    var listener = function() {
                        window.clearTimeout(id);
                        script.removeEventListener('load', listener);
                        waitExpression(callback);
                    };
                    var id = window.setTimeout(listener, 100);
                    script.addEventListener('load', listener);
                }
            }
        }
        globalThis.waitExpression = waitExpression;


        var hasNativeTextDetector = typeof TextDetector !== 'undefined';


        var supportsChUnits = false;
        try {
            var tmp = document.createElement('div');
            tmp.style.width = '1ch';
            supportsChUnits = tmp.style.width !== '';
            //var supportsChUnits = CSS.supports('(width: 1ch)');
        } catch (error) {
            // IE 8
        }

        function ch(value) {
            return supportsChUnits ? value : (0.55 * Number.parseFloat(value)) + "em";
        }

        function isCharacterSupported(character, notSupportedCallback) {
            window.requestAnimationFrame(function() {
                // https://stackoverflow.com/a/4635712
                var tmp = document.createElement('div');
                tmp.style.position = "fixed";
                tmp.style.top = "0px"; // affects layout root in Chrome
                tmp.style.left = "0px"; // affects layout root in Chrome
                tmp.style.whiteSpace = "nowrap";
                tmp.style.width = "0px";
                tmp.style.height = "0px";
                tmp.style.overflow = "hidden";
                tmp.style.visibility = "hidden";
                tmp.style.contain = "strict"; //TODO: ?

                var span1 = document.createElement('span');
                span1.textContent = character;
                tmp.appendChild(span1);
                var span2 = document.createElement('span');
                span2.textContent = '\uFFFD';
                tmp.appendChild(span2);

                document.body.appendChild(tmp);

                window.requestAnimationFrame(function() {
                    var value = span1.getBoundingClientRect().width !== span2.getBoundingClientRect().width;
                    window.requestIdleCallback(function() {
                        window.requestAnimationFrame(function() {
                            tmp.parentNode.removeChild(tmp);
                        });
                    });
                    if (!value) {
                        notSupportedCallback(value);
                    }
                });
            });
        }

        document.addEventListener('click', function(event) {
            // the event target is a Document somehow, and so event.target.tagName is null
            if (event.target.matches('a[href*="//"]')) {
                event.target.setAttribute('rel', 'noopener');
            }
        });

        // TODO: implement Dialog.prompt, replace button+input with button+Dialog.prompt



        var addClickOnEnter = function(element) {
            var input = element.querySelector('input');
            var button = element.querySelector('button');
            input.enterKeyHint = 'go'; //?  it should produce keydown events - https://groups.google.com/a/chromium.org/d/msg/blink-dev/Hfe5xktjSV8/KItGmnG_BAAJ
            input.addEventListener('keydown', function(event) {
                var DOM_VK_RETURN = 13;
                if (event.keyCode === DOM_VK_RETURN && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !event.defaultPrevented) {
                    event.preventDefault(); // in case of moving focus to some other element (textarea)
                    button.click();
                }
            }, false);
        };

        var Utils = PageUtils;

        Utils.initialize(".button-before-input", function(element) {
            addClickOnEnter(element);
        });

        // ...

        //TODO: remove "window."
        var yaCounter = undefined;
        globalThis.hitQueue = [];
        var sendHits = function() {
            yaCounter.params(hitQueue);
            globalThis.hitQueue = [];
        };
        var roundValue = function(value, max) {
            return "10**" + (Math.floor(Math.log2(Math.max(value, max) + 0.5) / Math.log2(10)) + 1);
        };
        var hit = function(params) {
            if (globalThis.hitQueue != undefined) {
                globalThis.hitQueue.push(params);
                if (yaCounter != undefined) {
                    requestIdleCallback("sendHits", sendHits, 1000);
                }
            }
        };
        globalThis.hit = hit; //! see Polynomial#getroots

        var postError = function(error, input, initialInput, classList) {
            input = input || undefined;
            initialInput = initialInput || undefined;
            classList = classList || undefined;
            var e = function(element) {
                if (element == undefined) {
                    return undefined;
                }
                var a = element.getAttribute("data-expression");
                return (element.classList || "").toString() + (a == undefined ? "" : "[data-expression=" + a + "]");
            };
            var object = {
                error: error.name + ": " + error.message,
                input: input,
                initialInput: initialInput,
                classList: classList,
                focusedElement: e(document.querySelector(":focus")),
                rounding: decimalRounding
            };
            var tables = document.querySelectorAll(".matrix-table");
            for (var i = 0; i < tables.length; i += 1) {
                var id = tables[i].getAttribute("data-id");
                var table = MatrixTables[id];
                if (table != undefined) {
                    var x = table.getRawInput(table.mode);
                    var value = "";
                    if (typeof x !== "string") {
                        var y = "";
                        y += "{";
                        for (var j = 0; j < x.length; j += 1) {
                            y += j !== 0 ? "," : "";
                            y += "{" + x[j].join(",") + "}";
                        }
                        y += "}";
                        value = y;
                    } else {
                        value = x;
                    }
                    object[id] = value;
                }
            }
            var inputs = document.querySelectorAll("input");
            for (var k = 0; k < inputs.length; k += 1) {
                var name = inputs[k].name;
                if (name != undefined && (name.slice(0, 2) === "k-" || name === "expression")) {
                    object[name] = inputs[k].value;
                }
            }
            var s = JSON.stringify(object);
            window.onerror(s, error.fileName || "", error.lineNumber || 0, error.columnNumber || 0, error);
        };

        globalThis.postError = postError;

        var handleError = function(initialInput, classList, e, positionInfo) {
            //TODO: check
            var message = e.message;
            var i = message.indexOf(":");
            var errorName = i === -1 ? message : message.slice(0, i);
            var errorDetail = i === -1 ? "" : message.slice(i + 1);

            if (errorName === "ArithmeticException") {
                Dialog.alert(getInputErrorHTML(positionInfo, i18n.errors.divisionByZeroError)); //?
            } else if (errorName === "IntegerInputError") {
                var inputElementId = errorDetail;
                var inputElement = document.getElementById(inputElementId);
                reportValidity(inputElement, i18n.errors.pleaseFillOutThisField); //TODO: ?
            } else if (errorName === "NotSupportedError") {
                var text = i18n.errors.operationIsNotSupported;
                if (errorDetail === "matrixArgExpected") {
                    text += "\n" + i18n.errors.matrixArgExpected;
                }
                Dialog.alert(getInputErrorHTML(positionInfo, text)); //?
                postError(e, positionInfo.input, initialInput, classList);
            } else if (errorName === "UserError") {
                Dialog.alert(getInputErrorHTML(positionInfo, getInputError(e))); //?
                postError(e, positionInfo.input, initialInput, classList);
            } else if (errorName === "SingularMatrixException") {
                Dialog.alert(i18n.inverse.determinantIsEqualToZeroTheMatrixIsSingularNotInvertible);
            } else if (errorName === "MatrixDimensionMismatchException") {
                Dialog.alert(i18n.errors.matricesShouldHaveSameDimensions);
            } else if (errorName === "NonSquareMatrixException") {
                var text = errorDetail !== "" ? errorDetail : i18n.errors.matrixIsNotSquare;
                Dialog.alert(text);
                //} else if (errorName === "NonRealMatrixException") {//TODO: remove - ?
                //  Dialog.alert(i18n.CholeskyDecomposition.matrixIsNotReal);
                //} else if (errorName === "NonComplexMatrixException") {//TODO: remove - ?
                //  Dialog.alert(i18n.CholeskyDecomposition.matrixIsNotComplex);
            } else if (errorName === "NonSymmetricMatrixException") {
                Dialog.alert("<math>" + Expression.p("A=A^T").replace(/\=/g, "&ne;") + "</math>" + " — " + i18n.CholeskyDecomposition.theMatrixIsNotSymmetric);
            } else if (errorName === "NonHermitianMatrixException") {
                Dialog.alert("<math>" + Expression.p("A=A^{*}").replace(/\=/g, "&ne;") + "</math>" + " — " + i18n.CholeskyDecomposition.theMatrixIsNotHermitian);
            } else if (errorName === "DimensionMismatchException") {
                Dialog.alert(i18n.errors.theNumberOfColumnsInFirstMatrixShouldEqualTheNumberOfRowsInSecond);
            } else if (errorName === "ValueMissingError") {
                hit({
                    error: message
                }); //?
                var inputElementId = errorDetail;
                var inputElement = document.getElementById(inputElementId);
                reportValidity(inputElement, i18n.errors.pleaseFillOutThisField);
            } else {
                Dialog.alert(getInputErrorHTML(positionInfo, getInputError(null))); //?
                postError(e, positionInfo.input, initialInput, classList);
                window.sendSnapshot();
                //throw new TypeError(message);
                console.log(e);
            }
        };

        //!
        var decimalRounding = null;

        /* #matrix-menu-dialog */

        var getMatrixMenuShow = function(matrixContainer) {
            return matrixContainer.parentNode.querySelector(".matrix-menu-show") || matrixContainer.parentNode.parentNode.querySelector(".matrix-menu-show");
        };

        var showDialog = function(matrixMenu, content) {
            //!
            // as MathML elements are not focusable, move the focus to the button (Firefox + contextmenu)
            var matrixContainer = document.getElementById(matrixMenu.getAttribute("data-for-matrix"));
            if (document.activeElement === matrixContainer && document.activeElement.focus == null) {
                var focusNode = getMatrixMenuShow(matrixContainer);
                focusNode.focus();
            }
            if (document.activeElement.classList.contains("menuitem")) {
                var focusNode = getMatrixMenuShow(matrixContainer);
                focusNode.focus();
            }
            //!
            var dialog = Dialog.standard(content, "<button autofocus=\"autofocus\" type=\"submit\">" + i18n.misc.close + "</button>");
            dialog.setAttribute("dir", "ltr");
            var input = dialog.querySelector("input") || dialog.querySelector("textarea") || dialog.querySelector("img");
            if (input.tagName.toLowerCase() !== 'img') {
                input.select();
            }
            input.focus();
        };

        var onShowAsMenuitemClick = function(event) {
            var menuitem = event.target;
            hit({
                click: menuitem.id
            });
            var matrixMenu = menuitem.parentNode;
            var matrixContainer = document.getElementById(matrixMenu.getAttribute('data-for-matrix'));
            var content = null;
            if (menuitem.id === 'show-mathml-menuitem') {
                var value = serializeMatrixContainer(matrixContainer);
                content = '<textarea class="show-textarea" wrap="off">' + Utils.escapeHTML(value) + '</textarea>';
            } else if (menuitem.id === 'show-text-menuitem') {
                var value = matrixContainer.getAttribute('data-matrix');
                content = '<input type="text" value="${value}" />'.replace(/\$\{value\}/g, Utils.escapeHTML(value));
            } else if (menuitem.id === "show-image-menuitem") {
                var image = MathMLToSVG.drawMathMLElement(matrixContainer);
                content = '<img width="${image.width}" height="${image.height}" src="${image.src}" tabindex="0" />'
                    .replace(/\$\{image\.width\}/g, image.width)
                    .replace(/\$\{image\.height\}/g, image.height)
                    .replace(/\$\{image\.src\}/g, image.src);
            } else if (menuitem.id === "show-latex-menuitem") {
                var value = mathmlToLaTeX(matrixContainer);
                content = '<textarea class="show-textarea" wrap="off">' + Utils.escapeHTML(value) + '</textarea>';
            }
            showDialog(matrixMenu, content, event);
        };




        //!
        //TODO: (!) Firefox 75(?) uses "global" undo/redo stack for contenteditable=true !
        //!

        var insertText = function(text, input) {
            if (document.queryCommandEnabled("insertText")) {
                document.execCommand("insertText", false, text); // "undo" support
                // Note: "insertText" does not fire any events in Chrome, when the text is empty and the field is empty
            } else {
                // Firefox with <input> or <textarea>, see https://bugzilla.mozilla.org/show_bug.cgi?id=1220696
                // Mobile Safari somehow (?)
                //var input = document.activeElement; - on Mobile Safari the document.activeElement is the <body> when it should be a <textarea>
                var selectionStart = input.selectionStart;
                var selectionEnd = input.selectionEnd;
                input.setRangeText(text);
                input.setSelectionRange(selectionStart + text.length, selectionStart + text.length);
                if (text !== "" || selectionStart !== selectionEnd) { // to match Chrome's behaviour
                    input.dispatchEvent(new Event('input'));
                }
            }
        };


        var prepareMatrixMenu = function(dataForMatrix) {
            var matrixMenu = document.getElementById("matrix-menu");
            if (matrixMenu == undefined) {
                var addMenuItem = function(id, label, onClick) {
                    var node = document.createElement("menuitem");
                    node.id = id;
                    node.setAttribute("label", label);
                    node.onclick = onClick;
                    matrixMenu.appendChild(node);
                };
                matrixMenu = document.createElement('menu');
                matrixMenu.id = 'matrix-menu';
                matrixMenu.setAttribute('type', 'context');
                var tables = document.querySelectorAll(".matrix-table");
                for (var i = 0; i < tables.length; i += 1) {
                    var id = tables[i].getAttribute("data-id");
                    addMenuItem('print-matrix-menuitem-' + id, i18n.buttons.insertIn + ' ' + id, onPrintMatrix);
                }
                if (document.querySelector(".add-table") != null) { // not on slu.html
                    var nextId = getNextTableId();
                    addMenuItem('print-matrix-menuitem-' + nextId, i18n.buttons.insertInNewTable || (i18n.buttons.insertIn + ' ' + nextId), onPrintMatrixIntoNewTable);
                }
                // `document.queryCommandEnabled("copy")` returns false in Edge 17 when the selection is "collapsed"
                // `document.queryCommandEnabled("copy")` returns false, but "copy" works in Opera 12 (if allow js clipboard access)
                if (document.queryCommandSupported("copy")) {
                    addMenuItem('copy-matrix-to-clipboard-menuitem', i18n.matrixMenu.copyToClipboard, onCopyMatrixToClipboard);
                }
                addMenuItem('show-mathml-menuitem', i18n.matrixMenu.showMathML, onShowAsMenuitemClick);
                addMenuItem('show-text-menuitem', i18n.matrixMenu.showText, onShowAsMenuitemClick);
                addMenuItem('show-image-menuitem', i18n.matrixMenu.showImage, onShowAsMenuitemClick);
                addMenuItem('show-latex-menuitem', i18n.matrixMenu.showLaTeX, onShowAsMenuitemClick);
                document.body.appendChild(matrixMenu);
                Utils.check(matrixMenu);
            }
            matrixMenu.setAttribute("data-for-matrix", dataForMatrix); //!
        };

        var initializeMenuDialog = function(menuDialog, items, trigger) {
            var focusedElements = 0;
            var closeDialog = function() {
                if (menuDialog.getAttribute("open") != undefined) {
                    var focus = true;
                    if (!menuDialog.contains(document.activeElement)) {
                        focus = false;
                    }
                    menuDialog.removeAttribute("open");
                    if (focus) {
                        // https://github.com/whatwg/html/issues/5678
                        trigger().focus();
                    }
                }
            };
            var onItemFocus = function(event) {
                focusedElements += 1;
            };
            var onItemBlur = function(event) {
                focusedElements -= 1;
                window.setTimeout(function() {
                    if (focusedElements === 0) {
                        closeDialog();
                    }
                }, 10);
            };
            var onItemClick = function(event) {
                event.preventDefault(); //selection
                var i = event.target.getAttribute("data-i");
                if (i != undefined) {
                    items[i].click();
                }
                closeDialog();
            };
            // https://www.w3.org/TR/wai-aria-practices-1.1/examples/listbox/js/listbox.js
            var keysSoFar = '';
            var startNode = null;
            var keyClear = 0;
            var clearKeysSoFar = function() {
                keysSoFar = '';
                startNode = null;
                keyClear = 0;
            };
            menuDialog.addEventListener("keypress", function(event) {
                if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.defaultPrevented) {
                    var target = document.activeElement;
                    if (target.parentNode === this) {
                        var s = String.fromCharCode(event.charCode).toLocaleUpperCase();
                        if (startNode == null) {
                            startNode = target;
                        }
                        keysSoFar += s;
                        window.clearTimeout(keyClear);
                        keyClear = window.setTimeout(clearKeysSoFar, 300);
                        var node = startNode;
                        for (var x = node.nextElementSibling || this.firstElementChild; x !== startNode; x = x.nextElementSibling || this.firstElementChild) {
                            var label = x.textContent;
                            if (keysSoFar === label.slice(0, keysSoFar.length).toLocaleUpperCase() && node === startNode) {
                                node = x;
                            }
                        }
                        if (node !== startNode) {
                            event.preventDefault();
                            node.focus();
                        }
                    }
                }
            }, false);
            menuDialog.addEventListener("keydown", function(event) {
                if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !event.defaultPrevented) {
                    var keyCode = event.keyCode;
                    var target = document.activeElement;
                    if (target.parentNode === this) {
                        var DOM_VK_LEFT = 37;
                        var DOM_VK_UP = 38;
                        var DOM_VK_RIGHT = 39;
                        var DOM_VK_DOWN = 40;
                        var DOM_VK_ESCAPE = 27;
                        var DOM_VK_RETURN = 13;

                        if (keyCode === DOM_VK_LEFT || keyCode === DOM_VK_UP) {
                            var previous = target.previousElementSibling;
                            if (previous == undefined) {
                                previous = this.lastElementChild;
                            }
                            if (previous != undefined) {
                                event.preventDefault();
                                previous.focus();
                            }
                        }
                        if (keyCode === DOM_VK_RIGHT || keyCode === DOM_VK_DOWN) {
                            var next = target.nextElementSibling;
                            if (next == undefined) {
                                next = this.firstElementChild;
                            }
                            if (next != undefined) {
                                event.preventDefault();
                                next.focus();
                            }
                        }
                        if (keyCode === DOM_VK_ESCAPE) {
                            event.preventDefault();
                            closeDialog();
                        }
                        if (keyCode === DOM_VK_RETURN) {
                            event.preventDefault();
                            target.click();
                        }
                    }
                }
            }, false);
            var elements = menuDialog.querySelectorAll(".menuitem");
            for (var k = 0; k < elements.length; k += 1) {
                elements[k].addEventListener("focus", onItemFocus, false);
                elements[k].addEventListener("blur", onItemBlur, false);
                if (items != null) { //?
                    elements[k].onclick = onItemClick;
                }
            }
        };

        var getMatrixMenuDialog = function(matrixMenu) {
            var matrixMenuDialog = document.getElementById("matrix-menu-dialog");
            if (matrixMenuDialog == undefined) { //?
                matrixMenuDialog = document.createElement("div");
                matrixMenuDialog.id = "matrix-menu-dialog";
                matrixMenuDialog.classList.toggle("menu-dialog", true);
                matrixMenuDialog.setAttribute("role", "menu");
                var items = matrixMenu.querySelectorAll("menuitem");
                var html = "";
                for (var i = 0; i < items.length; i += 1) {
                    html += "<a role=\"menuitem\" class=\"menuitem\" tabindex=\"0\" data-i=\"" + i.toString() + "\">" + items[i].getAttribute("label") + "</a>";
                }
                matrixMenuDialog.innerHTML = html;
                initializeMenuDialog(matrixMenuDialog, items, function() {
                    var matrixContainer = document.getElementById(matrixMenu.getAttribute("data-for-matrix"));
                    //var focusNode = matrixContainer;//TODO: fix - cannot focus MathML element
                    var focusNode = getMatrixMenuShow(matrixContainer);
                    return focusNode;
                });
                document.body.appendChild(matrixMenuDialog);
            }
            return matrixMenuDialog;
        };

        var onCopyMatrixToClipboard = function(event) {
            hit({
                click: "copy-matrix-to-clipboard-menuitem"
            });
            var matrixMenu = this.parentNode;
            var matrixContainer = document.getElementById(matrixMenu.getAttribute("data-for-matrix"));
            //var focusNode = matrixContainer;//TODO: fix - cannot focus MathML element
            var focusNode = getMatrixMenuShow(matrixContainer);
            focusNode.focus();
            window.getSelection().collapse(focusNode, 0);
            // The previous line moves the focus to the body in Edge 17
            if (document.activeElement !== focusNode) {
                focusNode.focus();
            }
            try {
                document.execCommand("copy");
            } catch (error) {
                handleError("", "", error, {});
            }
        };

        // button
        Utils.on("click", ".matrix-menu-show", function(event) {
            hit({
                click: "matrix-menu-show"
            });
            prepareMatrixMenu(this.getAttribute("data-for-matrix"));
            var matrixMenu = document.getElementById("matrix-menu");
            var matrixMenuDialog = getMatrixMenuDialog(matrixMenu);
            var anchorRect = this.getBoundingClientRect();
            matrixMenuDialog.style.position = 'absolute';
            matrixMenuDialog.style.left = Math.min(Math.max(window.pageXOffset + anchorRect.left, 0), window.innerWidth) + 'px';
            matrixMenuDialog.style.top = (window.pageYOffset + anchorRect.bottom) + 'px';
            matrixMenuDialog.style.transformOrigin = "top left";
            matrixMenuDialog.setAttribute("open", "open");
            if (document.documentElement.dir === 'rtl') {
                matrixMenuDialog.style.left = Math.min(Math.max(window.pageXOffset + anchorRect.right - matrixMenuDialog.offsetWidth, 0), window.innerWidth) + 'px';
            }
            if (anchorRect.bottom + matrixMenuDialog.offsetHeight > window.innerHeight) {
                matrixMenuDialog.style.top = (window.pageYOffset + anchorRect.top - matrixMenuDialog.offsetHeight) + 'px';
                matrixMenuDialog.style.transformOrigin = "bottom left";
            }
            matrixMenuDialog.firstElementChild.focus(); //?
        });

        // button
        Utils.on("click", ".popup-button", function(event) {
            var menuDialog = document.getElementById(event.target.getAttribute("data-menu"));
            var popupButton = event.target;
            if (menuDialog.getAttribute("data-initialized") == null) {
                //TODO: fix

                initializeMenuDialog(menuDialog, null, function() {
                    return popupButton;
                });
                menuDialog.setAttribute("data-initialized", "true");
            }
            menuDialog.setAttribute("open", "open");
            menuDialog.firstElementChild.focus(); //?
        });

        // << Tables >>

        var MatrixTables = {};

        // << MatrixTable >>


        //-----------------!

        var getInputError = function(error) {
            if (error != null) {
                var t = null;
                var x = ' ';
                var y = ' ';
                var match = null;
                if ((match = /^UserError\: unexpected end of input, '([\s\S]+)' expected$/.exec(error.message)) != null) {
                    t = i18n.errors.unexpectedEndOfInputYExpected;
                    y = match[1];
                } else if ((match = /^UserError\: unexpected '([\s\S]+)', '([\s\S]+)' expected$/.exec(error.message)) != null) {
                    t = i18n.errors.unexpectedXYExpected;
                    x = match[1];
                    y = match[2];
                } else if ((match = /^UserError\: unexpected '([\s\S]+)'$/.exec(error.message)) != null) {
                    t = i18n.errors.unexpectedX;
                    x = match[1];
                } else if ((match = /^UserError\: unexpected end of input$/.exec(error.message)) != null) {
                    t = i18n.errors.unexpectedEndOfInput;
                } else {
                    console.error(error.message);
                }
                if (t != null && t !== "") {
                    return t.replace(/\$\{x\}/g, "<code>" + x + "</code>").replace(/\$\{y\}/g, "<code>" + y + "</code>");
                }
            }
            return i18n.errors.inputError.replace(/\$\{listOfExamples\}/g, i18n.listOfExamples).replace(/\$\{listOfComplexExamples\}/g, i18n.listOfComplexExamples) + i18n.colonSpacing + ":";
        };

        globalThis.getInputError = getInputError; //TODO: remove

        var setInputCustomValidity = function(input, checkedValue, error) {
            if (input.value === checkedValue) {
                var dataTitle = input.getAttribute("data-title");
                if (dataTitle == undefined) {
                    var title = input.title || "";
                    input.setAttribute("data-title", title);
                    dataTitle = title;
                }
                if (error == null) {
                    if (dataTitle !== "") {
                        input.title = dataTitle;
                    } else {
                        input.removeAttribute('title'); // input.title = ""; does not work as expected
                    }
                } else {
                    Utils.waitI18n(function() {
                        input.title = getInputError(error).replace(/<[^>]*>/g, "").replace(/\s*\:/g, "");
                    });
                }
                var e = input.parentNode.classList.contains("a-input") ? input.parentNode : input;
                var isValid = error == null;
                //e.classList.toggle("invalid", !isValid);
                var ariaInvalid = !isValid ? "true" : "false";
                if (e.getAttribute("aria-invalid") !== ariaInvalid) { // Style Recalculation
                    e.setAttribute("aria-invalid", ariaInvalid);
                    input.setAttribute("aria-invalid", ariaInvalid);
                }
            }
        };

        var getInputValue = function(value, type) {
            var v = value.trim();
            // Users are often trying to input "-"/"+" instead of "-1"/"+1" for SLU
            if ((v === "-" || v === "+") && (type === "system" || type === "polynomial")) {
                return v + "1";
            }
            if (v === "") {
                return "0";
            }
            return value;
        };


        var checkInput = function(input, type) {
            var inputName = input.name;
            requestIdleCallback(inputName, function() {
                waitExpression(function() {
                    var checkedValue = input.value;
                    var value = getInputValue(checkedValue, type); // getInputValue
                    RPNProxy.checkExpression(value, function() {
                        removeDataErrorAttribute(input);
                        setInputCustomValidity(input, checkedValue, null);
                    }, function(error) {
                        updateDataErrorAttribute(input, error, RPNProxy.getPositionInfo());
                        //TODO: other errors
                        setInputCustomValidity(input, checkedValue, error);
                    });
                });
            }, 50);
        };

        // type: "simple" | "system" | "polynomial"
        var checkTextarea = function(textarea, type) {
            requestIdleCallback(textarea.name, function() {
                waitExpression(function() {
                    var textareaValue = textarea.value;
                    RPNProxy.checkExpressions(textareaValue, type, function() {
                        removeDataErrorAttribute(textarea);
                        setInputCustomValidity(textarea, textareaValue, null);
                    }, function(error) {
                        updateDataErrorAttribute(textarea, error, RPNProxy.getPositionInfo(), true); //?
                        //TODO:
                        console.log(error);
                        setInputCustomValidity(textarea, textareaValue, error);
                    });
                });
            }, 200);
        };

        var requestAnimationFrameQueue = []; // for better performance
        Utils.initialize(".a-input", function(element) {
            if (requestAnimationFrameQueue.length === 0) {
                window.requestAnimationFrame(function() { // window.getComputedStyle(...)
                    waitExpression(wait2(function() {
                        for (var i = 0; i < requestAnimationFrameQueue.length; i += 1) {
                            var element = requestAnimationFrameQueue[i];
                            initializeAInput(element);
                        }
                        requestAnimationFrameQueue.length = 0;
                    }));
                });
            }
            requestAnimationFrameQueue.push(element);
            element.setAttribute("dir", "ltr"); // "math-dir"
            element.setAttribute('lang', '');
            var input = element.querySelector(".fraction-input");
            if (input != undefined) {
                input.addEventListener("input", function(event) {
                    var input = event.target;
                    checkInput(input, "");
                }, false);
                checkInput(input, ""); // autofill
            }
        });

        function wait2(callback) {
            return function(e) {
                if (globalThis.initializeAHighlight != null) {
                    callback(e);
                } else {
                    window.setTimeout(function() {
                        wait2(callback);
                    }, 100);
                }
            };
        }
        Utils.initialize(".a-highlight", wait2(function(e) {
            initializeAHighlight(e);
        }));
        Utils.initialize(".a-tooltip", wait2(function(e) {
            initializeATooltip(e);
        }));


        var keyStorage = {
            a: function(methodName, key, value) {
                var result = undefined;
                try {
                    var storage = window.localStorage;
                    if (storage == undefined) {
                        console.log("No localStorage");
                        hit({
                            localStorage: "No localStorage"
                        });
                    } else {
                        if (methodName === "getItem") {
                            result = storage.getItem(key);
                        } else if (methodName === "setItem") {
                            storage.setItem(key, value);
                            if (storage.getItem(key) !== value) {
                                console.log("No error");
                                hit({
                                    localStorage: "No error"
                                });
                            }
                        } else {
                            throw new TypeError(methodName);
                        }
                    }
                } catch (error) {
                    if (error.name === 'SecurityError') {
                        console.debug(error.toString());
                    } else {
                        console.log(error);
                    }
                    hit({
                        localStorage: error.name
                    });
                }
                return result;
            },
            getItem: function(key) {
                return keyStorage.a("getItem", key, undefined);
            },
            setItem: function(key, value) {
                if (keyStorage.a("setItem", key, value) != undefined) {
                    throw new TypeError();
                }
            }
        };

        globalThis.keyStorage = keyStorage; //TODO: remove

        var timeoutIds = {};
        var delayByKey = {};
        var requestIdleCallback = function(key, callback, delay) {
            var timeoutId = timeoutIds[key];
            if (timeoutId == undefined || timeoutId === 0) {
                timeoutId = window.setTimeout(function() {
                    timeoutIds[key] = 0;
                    var start = Date.now();
                    callback();
                    var end = Date.now();
                    if (end - start > 300) {
                        hit({
                            checkInput: roundValue(end - start, 1000 - 1)
                        });
                    }
                    delayByKey[key] = Math.min(5000, Math.max(delay, end - start)); //?
                }, delayByKey[key] || delay);
                timeoutIds[key] = timeoutId;
            }
        };


        // type : "simple", "system", "polynomial"
        function MatrixTable(name, initialRows, initialCols, type, container) {
            this.name = name;
            this.rows = 0;
            this.cols = 0;
            this.initRows = initialRows;
            this.initCols = initialCols;
            this.mode = "cells";
            this.type = type;
            this.container = container;
            this.onmodechange = undefined;
            this.table = [];
            this.updateRequested = false;

            //class=\"matrix\"

            MatrixTableBase.initialize(container, type, name);
            this.tbody = container.querySelector("mtable");

            var matrixTableInner = container.querySelector(".matrix-table-inner");
            matrixTableInner.setAttribute("data-for", this.name);

            // https://github.com/w3c/csswg-drafts/issues/3871
            // any-pointer: fine is not enough on 
            var noHardwareKeyboard = !(window.matchMedia("(pointer: fine)").matches && window.matchMedia("(hover: hover)").matches);
            var clearTableButton = container.querySelector(".clear-table-button");
            if (noHardwareKeyboard || true) {
                clearTableButton.title = document.getElementById('i18n-buttons-clear').textContent;
                isCharacterSupported('🧹', function() {
                    clearTableButton.firstElementChild.textContent = '🖌\uFE0E'; // https://emojipedia.org/broom/ - not supported on Android 8 - ?
                });
            } else {
                clearTableButton.firstElementChild.parentNode.removeChild(clearTableButton.firstElementChild);
                clearTableButton.textContent = document.getElementById('i18n-buttons-clear').textContent; // i18n.buttons.clear;
            }

            var swapModeButton = container.querySelector(".swap-mode-button");
            swapModeButton.textContent = document.getElementById('i18n-buttons-cells').textContent; // i18n.buttons.cells;

            var numbersOnlyModeButton = container.querySelector(".numbers-only-mode-button");
            numbersOnlyModeButton.hidden = !noHardwareKeyboard;

            var that = this;
            //TODO: 
            //matrixTableInner.setAttribute("dir", "ltr"); // "math-dir"
            clearTableButton.onclick = function(event) {
                if (event.pointerType !== 'mouse' && event.pointerType != null || !window.matchMedia("(pointer: fine)").matches) { //"polyfill"
                    //TODO: 'Are you sure?'
                    if (!window.confirm(document.getElementById('i18n-buttons-clear').textContent + '?')) {
                        return;
                    }
                }
                hit({
                    click: "clear-table-button"
                });
                that.insert({
                    inputValues: [],
                    textareaValue: "",
                    rows: that.initRows,
                    cols: that.initCols
                });
            };

            var onResizeTable = function(event) {
                hit({
                    click: "resize-table-button"
                });
                var increment = Number(this.getAttribute("data-increment"));
                that._resizeTable(that.rows + (that.type !== "polynomial" ? increment : 0), that.cols + increment);
            };
            //var resizeButtons = container.querySelectorAll(".resize-table-button");
            var incrementSizeButton = container.querySelector(".increment-size-button");
            incrementSizeButton.onclick = onResizeTable;
            this.incrementSizeButton = incrementSizeButton;
            var decrementSizeButton = container.querySelector(".decrement-size-button");
            decrementSizeButton.onclick = onResizeTable;
            this.decrementSizeButton = decrementSizeButton;

            var onSwapModeChange = function(event) {
                hit({
                    swapMode: window.matchMedia("(pointer: fine)").matches.toString()
                });
                event.preventDefault();
                var isChecked = this.getAttribute("aria-pressed") === "true";
                var isCellsMode = !isChecked;
                this.setAttribute("aria-pressed", isCellsMode ? "true" : "false");
                if ((isCellsMode && that.mode !== "cells") || (!isCellsMode && that.mode === "cells")) {
                    that.onswapmode();
                }
            };
            swapModeButton.onclick = onSwapModeChange;

            this.swapModeButton = swapModeButton;

            //!new 2020-10-06
            this.numbersOnlyMode = noHardwareKeyboard; //TODO: save the value - ?
            var numbersOnlyModeKey = "~" + window.location.pathname + "~" + this.name + "~" + "numbersOnlyMode";
            this.numbersOnlyMode = noHardwareKeyboard && keyStorage.getItem(numbersOnlyModeKey) || this.numbersOnlyMode;

            numbersOnlyModeButton.title = document.getElementById("i18n-use-decimal-keyboard-on-mobile-phones").textContent;
            numbersOnlyModeButton.onclick = function(event) {
                event.preventDefault();
                this.numbersOnlyMode = !this.numbersOnlyMode;
                numbersOnlyModeButton.setAttribute("aria-pressed", this.numbersOnlyMode ? "true" : "false");
                var inputs = this.tbody.getElementsByTagName('input'); // not input[type="file"]
                for (var i = 0; i < inputs.length; i += 1) {
                    if (inputs[i].classList.contains('matrix-table-input')) { // filter out inputs to enter variable names
                        this._setInputType(inputs[i], inputs[i].value);
                    }
                }
                keyStorage.setItem(numbersOnlyModeKey, this.numbersOnlyMode);
            }.bind(this);
            numbersOnlyModeButton.onpointerdown = function(event) {
                event.preventDefault();
            };
            numbersOnlyModeButton.setAttribute('aria-pressed', this.numbersOnlyMode ? "true" : "false");
            this.numbersOnlyModeButton = numbersOnlyModeButton;

            var uploadImageButton = container.querySelector(".upload-image");
            var uploadImageInput = container.querySelector("[name=upload]");
            uploadImageButton.onclick = function(event) {
                uploadImageInput.hidden = false; // Opera 12
                uploadImageInput.click();
                uploadImageInput.hidden = true; // Opera 12
            };
            uploadImageInput.onchange = function(event) {
                var files = event.target.files;
                //TODO: dialog - ?
                DnD.onDropOrPaste.call(container, {
                    type: 'drop',
                    target: container,
                    clientX: 0,
                    clientY: 0,
                    dataTransfer: {
                        getData: function() {},
                        files: files
                    },
                    preventDefault: function() {}
                });
            };
            uploadImageButton.hidden = !hasNativeTextDetector;
            isCharacterSupported('📷', function() {
                uploadImageButton.firstElementChild.textContent = '🖼\uFE0E';
            });
            uploadImageButton.title = document.getElementById("i18n-buttons-upload-image").textContent;

            var initUndoRedoButton = function(command) {
                var button = container.querySelector(command === "undo" ? ".undo-button" : ".redo-button");
                button.onclick = function(event) {
                    event.preventDefault();
                    document.execCommand(command, false);
                };
                button.onpointerdown = function(event) {
                    event.preventDefault();
                };
                window.addEventListener("input", function(event) {
                    button.disabled = !document.queryCommandEnabled(command);
                }, true);
                button.title = command.toLowerCase(); //TODO: !?
                button.hidden = false;
            };
            if (noHardwareKeyboard) {
                initUndoRedoButton('undo');
                initUndoRedoButton('redo');
            }

            this.textarea = container.querySelector("textarea");
            var onTextareaInput = function(event) {
                checkTextarea(that.textarea, that.type);
                that.update(event);
            };
            this.textarea.addEventListener("input", onTextareaInput, false);

            container.setAttribute("data-matrix-table", this.name);

            Utils.check(container);

            this.variableNames = undefined;

            this._updateVariableNames = function(event) {
                that.updateVariableNames(event);
            };
        }

        MatrixTableBase.onKeyDown = function(event) {
            var mt = MatrixTables[event.target.getAttribute('data-for')];
            mt.onKeyDown(event);
        };
        MatrixTableBase.onInput = function(event) {
            var mt = MatrixTables[event.target.getAttribute('data-for')];
            var input = event.target;
            checkInput(input, mt.type);
            mt.update(event);
        };

        MatrixTable.prototype._setInputType = function(input, inputValue) {
            // in case not only numbers are inserted switch to text mode as <input type="number"> cannot be set to contain such values
            var type = this.numbersOnlyMode && isFloatingPoint(inputValue) ? 'number' : 'text';
            if (input.type !== type) {
                input.type = type;
                if ('activeElement' in document) {
                    input.closest('.a-input').classList.toggle('enabled', document.hasFocus() && !this.numbersOnlyMode); // input[type="number"] does not allow to get value when the raw input is not a valid number, it does not allow to enter not a numbers anyway
                }
                input.setAttribute('step', 'any');
            }
        };

        MatrixTable.prototype._resizeTable = function(newRows, newCols) {
            this.insert({
                rows: newRows,
                cols: newCols
            });
        };

        MatrixTable.prototype.getState = function() {
            return {
                type: this.type,
                mode: this.mode,
                inputValues: this.mode === "cells" ? this.getRawInput("cells") : undefined,
                variableNames: this.variableNames,
                textareaValue: this.mode !== "cells" ? this.getRawInput("") : undefined,
                rows: this.rows,
                cols: this.cols,
                textareaStyleWidth: this.textarea != undefined ? this.textarea.style.width : undefined,
                textareaStyleHeight: this.textarea != undefined ? this.textarea.style.height : undefined,
                firstInputElementId: this.getFirstInputElementId()
            };
        };

        MatrixTable.prototype.getDataState = function() {
            var state = {
                type: this.type,
                mode: this.mode,
                inputValues: this.mode === "cells" ? this.getRawInput("cells") : undefined,
                variableNames: this.variableNames,
                textareaValue: this.mode !== "cells" ? this.getRawInput("") : undefined,
                firstInputElementId: this.getFirstInputElementId()
            };
            if (state.mode === "cells") {
                var type = this.type;
                var inputValues = state.inputValues;
                for (var i = 0; i < inputValues.length; i += 1) {
                    for (var j = 0; j < inputValues[i].length; j += 1) {
                        inputValues[i][j] = getInputValue(inputValues[i][j], type);
                    }
                }
            }
            return state;
        };

        MatrixTable.prototype._availableWidth = function() {
            // document.documentElement.clientWidth on Android
            // trying to use window.visualViewport.width to avoid forcing layout (?)
            var viewportWidth = Math.min(window.innerWidth, (window.visualViewport != null && window.visualViewport.scale === 1 ? 1 / 0 : document.documentElement.clientWidth));
            var vw = ((viewportWidth <= 800 ? viewportWidth : viewportWidth - 200) / 17 - 2) / 0.55; //!?
            return vw;
        };

        // private
        MatrixTable.prototype.updateInputWidths = function() {
            var dimensions = this.getDimensions(true);
            var expectedRows = dimensions.rows;
            var expectedCols = dimensions.cols;

            var table = this.table;
            var vw = this._availableWidth();

            var cols = table.length === 0 ? 0 : table[0].length;
            for (var j = 0; j < cols; j += 1) {
                var maxLength = 1; // placeholder.length
                for (var i = 0; i < table.length; i += 1) {
                    var l = table[i][j].value.length;
                    maxLength = Math.max(maxLength, l);
                }
                for (var i = 0; i < table.length; i += 1) {
                    var w = 2 + maxLength;
                    var minWidth = this.type === "system" ? 5 : (6 + 1 / 3);
                    if (minWidth > vw / cols || cols > 20) { //TODO:
                        minWidth = 2 + maxLength;
                    }
                    if (w < minWidth) {
                        w = minWidth;
                    }
                    if (w > 17 && w > vw / cols) {
                        w = 17;
                    }
                    var input = table[i][j];
                    input.style.minWidth = ch(minWidth + "ch"); // (minWidth * 0.6) + "em";
                    input.style.maxWidth = ch(w + "ch"); // (w * 0.6) + "em";
                    //TODO: set max-width somehow (?)

                    //!
                    var out = (i >= expectedRows || j >= expectedCols) && (i >= expectedRows || this.type !== "system" || j !== table[i].length - 1);
                    var isFirefox = /firefox/i.test(window.navigator.userAgent); //TODO: fix
                    if (input.tagName.toLowerCase() === 'input' && isFirefox) {
                        // https://twitter.com/4esn0k/status/1240749397459324930
                        // only hide placeholder
                        input.classList.toggle('placeholder-hidden', out);
                    } else {
                        if (input.placeholder !== (out ? '' : '0')) {
                            input.placeholder = (out ? '' : '0');
                        }
                    }
                    var far = (i > expectedRows || j > expectedCols) && (i > expectedRows || this.type !== "system" || j !== table[i].length - 1);
                    input.classList.toggle("far", far);
                    var cellChild = input.closest('mi');
                    var previousElementSibling = cellChild.previousElementSibling;
                    if (previousElementSibling != undefined) {
                        previousElementSibling.classList.toggle("far", far);
                    }
                    var nextElementSibling = cellChild.nextElementSibling;
                    while (nextElementSibling != null) {
                        nextElementSibling.classList.toggle("far", far);
                        nextElementSibling = nextElementSibling.nextElementSibling;
                    }
                }
            }
        };

        //private
        MatrixTable.prototype.updateTextareaHeight = function() {
            var vw = this._availableWidth();
            var value = this.textarea.value;
            var i = 0;
            var c = 0;
            var width = 0;
            while (i >= 0) {
                c += 1;
                var n = value.indexOf('\n', i + 1);
                width = Math.max(width, (n === -1 ? value.length : n) - (i + 1));
                i = n;
            }
            var placeholderLines = Math.max(3, (this.textarea.placeholder || '').trim().split('\n').length + 1);
            var h = Math.floor(Math.max(placeholderLines + 1, c + 2) * 4 / 3);
            this.textarea.style.minHeight = Math.min(h, 12).toString() + "em";
            this.textarea.style.minWidth = ch(Math.min(width + 1, vw) + 'ch');
            if (this.type === 'system') {
                this.textarea.cols = Math.min(36, vw);
            }
        };

        // private
        MatrixTable.prototype.update = function(event) {
            var that = this;
            if (!this.updateRequested) {
                // requestAnimationFrame(f) allows to delay the update when doing MatrixTable#insert and does not cause flickering as setTimeout(f, 0) when user inputs something
                this.updateRequested = true;
                window.requestAnimationFrame(function() {
                    that.updateRequested = false;
                    if (that.mode === "cells") {
                        that.updateInputWidths();
                    } else {
                        that.updateTextareaHeight();
                    }
                });
            }
        };

        //TODO: move somewhere
        MatrixTable.prototype.updateVariableNames = function(event) {
            var variableName = event.target.getAttribute('data-value');
            var j = Number(event.target.getAttribute('data-index'));
            this.variableNames[j] = variableName;
            //TODO: - ?
            //var t2 = this.getState();
            //this.insert(t2);
            //TODO: remove
            var c = makeContent(variableName);
            var tbody = this.tbody;
            //! should work on <mtable></mtable> (no HTMLTableSectionElement#rows)
            for (var row = tbody.firstElementChild.nextElementSibling; row != null; row = row.nextElementSibling) {
                var cell = row.firstElementChild;
                for (var i = 0; i < j; i += 1) {
                    cell = cell.nextElementSibling;
                }
                cell.lastElementChild.innerHTML = c;
            }
        };

        function updateInputValue(input, value) {
            // This method updates the value of an <input> or a <textarea> element trying to preserve undo/redo history stack.
            // It can change focused element as a side effect
            // It does not change it back for performance reasons (?)
            input.focus({
                preventScroll: true
            });
            input.select();
            // documen.activeElement is not input on Mobile Safari somehow, but insertText works
            insertText(value, input);
            //Note: insertText dispatches the input event

            if (value === "" && input.value !== "" && document.queryCommandEnabled("delete")) { // Safari 5.1.7 does not clear the value with "insertText" command
                document.execCommand("delete");
            }
        }

        // see https://github.com/samthor/undoer
        function undoManager() {}

        undoManager._input = null;
        undoManager._undo = [];
        undoManager._redo = [];
        undoManager._id = 0;
        undoManager.addItem = function(item) {
            undoManager._redo = [];
            undoManager._undo.push(item);
            if (undoManager._input == null) {
                var input = document.createElement('div');
                input.contentEditable = true; // for Firefox use it intead of <input> (global undo stack)
                input.style.opacity = 0;
                input.style.position = 'fixed';
                input.style.left = '-1000px';
                input.style.top = '-1000px';
                input.style.width = '0px';
                input.style.height = '0px';
                input.tabIndex = -1;
                input.style.visibility = 'hidden';
                input.oninput = function(event) {
                    if (event.inputType === 'historyUndo') {
                        var item = undoManager._undo.pop();
                        if (item != null) {
                            undoManager._redo.push(item);
                            item.undo();
                        }
                    } else if (event.inputType === 'historyRedo') {
                        var item = undoManager._redo.pop();
                        if (item != null) {
                            undoManager._undo.push(item);
                            item.redo();
                        }
                    }
                };
                document.body.appendChild(input);
                undoManager._input = input;
            }
            var input = undoManager._input;
            input.style.visibility = '';
            try {
                input.focus();
                if (document.activeElement === input) {
                    undoManager._id += 1;
                    document.execCommand('insertText', false, undoManager._id);
                }
            } finally {
                input.style.visibility = 'hidden';
            }
        };


        var numberFormat = null;
        globalThis.addEventListener('languagechange', function(event) {
            numberFormat = null;
        });
        var localeString = function(number) {
            console.assert(Math.floor(number) === number && 1 / number > 0 && number >= 0 && number <= Number.MAX_SAFE_INTEGER);
            if (numberFormat == null) {
                numberFormat = new Intl.NumberFormat(undefined, {
                    useGrouping: false
                });
            }
            return numberFormat.format(number);
        };

        function isFloatingPoint(s) {
            return /^\-?\d*\.?\d*(?:[eE][+\-]?\d+)?$/.test(s.trim() || '0');
        }


        MatrixTableBase.onInputOnRemovedInput = function(event) {
            var input = event.target;
            var tableName = input.getAttribute('data-for');
            var row = Number(input.getAttribute('data-row'));
            var column = Number(input.getAttribute('data-column'));
            var mt = MatrixTables[tableName];
            if (mt == undefined) {
                // restore table
                addTable(tableName);
                mt = MatrixTables[tableName];
            }
            var state = mt.getState();
            mt._resizeTable(Math.max(row + 1, state.rows), Math.max(column + 1, state.cols));
        };

        MatrixTable._ignoreFlag = false; //TODO: REMOVE

        // `inputValues` - array of array of strings (non-square)
        MatrixTable.prototype.insert = function(options) {
            var inputValues = options.inputValues;
            var textareaValue = options.textareaValue;
            var rows = options.rows;
            var cols = options.cols;
            var textareaStyleWidth = options.textareaStyleWidth;
            var textareaStyleHeight = options.textareaStyleHeight;
            var mode = options.mode;
            var variableNames = options.variableNames;
            var isResizeOrInitialization = inputValues == null && textareaValue == null; // to not add entries to undo/redo history when adding/removing cells
            if (inputValues == undefined) {
                inputValues = [];
            }
            if (textareaValue == undefined) {
                textareaValue = toMultilineString(inputValues);
            }
            if (rows == undefined) {
                rows = inputValues.length;
            }
            if (cols == undefined) {
                cols = 0;
                for (var y = 0; y < inputValues.length; y += 1) {
                    cols = Math.max(cols, inputValues[y].length);
                }
            }
            if (mode == undefined) {
                mode = this.mode;
            }
            if (rows !== -1 / 0 || cols !== -1 / 0) {
                if (rows === 0) {
                    rows = this.initRows;
                    cols = this.initCols;
                }
                rows = Math.max(rows, 1);
                cols = Math.max(cols, 1);
                if (this.type === "polynomial") {
                    rows = 1;
                    cols = Math.max(cols, 2); // swapmode
                }
                if (this.type === "system") {
                    cols = Math.max(cols, 2);
                }
            } else {
                rows = 0;
                cols = 0;
            }
            variableNames = variableNames || this.variableNames;

            var oldCols = this.cols;
            var oldRows = this.rows;

            this.rows = rows;
            this.cols = cols;

            var name = this.name;
            var that = this;

            this.variableNames = variableNames;
            if (this.type === 'system') {
                this.variableNames = new Array(this.cols);
                for (var j = 0; j < this.cols; j += 1) {
                    this.variableNames[j] = variableNames != null && j < variableNames.length ? variableNames[j] : 'x_' + localeString(j + 1);
                }
            }

            var activeElement = document.activeElement;

            //TODO: order should be (to preserver the order of the update):
            //1. add more cells
            //2. update input values
            //3. delete extra cells

            // Update the table:
            // We are trying to avoid removal of old inputs to support undo/redo and to not loose the focus on "paste":

            var oldTable = this.table;
            this.table = MatrixTableBase.addMoreCells(this.tbody, this.type, this.rows, this.cols, this.name, this.variableNames);

            for (var i = 0; i < this.rows; i += 1) {
                for (var j = 0; j < this.cols; j += 1) {
                    var input = this.table[i][j];
                    var cell = input.closest('.matrix-table-cell');
                    //var input = cell.querySelector(".matrix-table-input");
                    Utils.check(cell); //TODO: only for new (?)
                    var editableOnClick = cell.closest('mtd').querySelector('.editable-on-click');
                    if (editableOnClick != null) {
                        editableOnClick.addEventListener('change-value', this._updateVariableNames, false);
                        Utils.check(editableOnClick);
                    }
                    this.table[i][j] = input;
                }
            }

            if (this.mode !== mode) {
                this.mode = mode;
                if (this.onmodechange != undefined) {
                    this.onmodechange();
                }
            }

            var isCellsMode = mode === "cells";

            this.container.querySelector('.table-container').hidden = !isCellsMode;
            this.container.querySelector('.textarea-container').hidden = isCellsMode;

            //this.container.classList.toggle("cells", isCellsMode);
            //this.container.classList.toggle("textarea", !isCellsMode);
            this.swapModeButton.setAttribute("aria-pressed", isCellsMode ? "true" : "false");
            this.incrementSizeButton.disabled = !isCellsMode;
            this.decrementSizeButton.disabled = !isCellsMode;
            this.numbersOnlyModeButton.disabled = !isCellsMode;

            if (isCellsMode) {
                var hasItemsToHide = false;
                for (var i = 0; i < Math.max(this.table.length, oldTable.length); i += 1) {
                    if (i < this.table.length) {
                        for (var j = 0; j < this.table[i].length; j += 1) {
                            var input = this.table[i][j];
                            var inputValue = (i < inputValues.length && j < inputValues[i].length ? inputValues[i][j].trim() : "");
                            this._setInputType(input, inputValue);
                            if (!isResizeOrInitialization || i >= oldTable.length || j >= oldTable[i].length) { //TODO: optimize first load
                                if (input.value !== inputValue) { // to optimize page reload (history navigation - ?), TODO: should we update if value the same ?
                                    if (!MatrixTable._ignoreFlag) {
                                        updateInputValue(input, inputValue);
                                    }
                                }
                            }
                        }
                    }
                    if (i < oldTable.length) {
                        for (var j = i < this.table.length ? this.table[i].length : 0; j < oldTable[i].length; j += 1) {
                            var input = oldTable[i][j];
                            //updateInputValue(input, '');
                            hasItemsToHide = true;
                        }
                    }
                }
                if (hasItemsToHide && 'inputType' in InputEvent.prototype && !MatrixTable._ignoreFlag) {
                    var newCols = this.cols;
                    var newRows = this.rows;
                    undoManager.addItem({
                        undo: function() {
                            MatrixTable._ignoreFlag = true;
                            if (MatrixTables[this.name] == null) {
                                addTable(this.name);
                            }
                            this._resizeTable(oldRows, oldCols);
                            MatrixTable._ignoreFlag = false;
                        }.bind(this),
                        redo: function() {
                            MatrixTable._ignoreFlag = true;
                            if (MatrixTables[this.name] == null) {
                                addTable(this.name);
                            }
                            this._resizeTable(newRows, newCols);
                            MatrixTable._ignoreFlag = false;
                        }.bind(this)
                    });
                }
            }

            MatrixTableBase.deleteExtraCells(this.tbody, this.type, this.rows, this.cols);

            this.updateInputWidths(); // initialization

            if (textareaStyleWidth != undefined) {
                this.textarea.style.width = textareaStyleWidth;
            }
            if (textareaStyleHeight != undefined) {
                this.textarea.style.height = textareaStyleHeight;
            }

            if (!isCellsMode) {
                if (!isResizeOrInitialization) {
                    updateInputValue(this.textarea, textareaValue);
                }
            }

            if (document.activeElement !== activeElement) { // focus the previously focused element
                activeElement = activeElement || document.body;
                if (typeof activeElement.focus !== 'function') {
                    activeElement = activeElement.parentNode.querySelector('button') || document.body;
                }
                activeElement.focus({
                    preventScroll: true
                });
                if (activeElement === document.body) {
                    if (document.activeElement != null) {
                        document.activeElement.blur();
                    }
                }
            }

            this.updateTextareaHeight(); // initialization
        };

        MatrixTable.prototype.getRawInput = function(mode) {
            if (this.textarea != undefined) {
                if (mode !== "cells") {
                    return this.textarea.value;
                }
                var dimensions = this.getDimensions(false);
                var rows = dimensions.rows;
                var cols = dimensions.cols;
                var result = new Array(rows);
                var i = -1;
                while (++i < rows) {
                    result[i] = new Array(cols);
                    var j = -1;
                    while (++j < cols) {
                        var value = this.table[i][j].value;
                        result[i][j] = value;
                    }
                }
                return result;
            }
            return "";
        };

        // private
        MatrixTable.prototype.getFirstInputElementId = function() {
            return this.mode !== "cells" ? this.textarea.id : (this.table.length > 0 ? this.table[0][0].id : null);
        };

        // private
        MatrixTable.prototype.getDimensions = function(real) {
            var rows = 0;
            var cols = (this.type === "system" && !real || this.type === "polynomial") && this.table.length !== 0 ? this.table[0].length : 0;
            for (var i = 0; i < this.table.length; i += 1) {
                for (var j = 0; j < this.table[i].length; j += 1) {
                    if (this.table[i][j].value.trim() !== "") {
                        rows = Math.max(rows, i + 1);
                        if (!(real && this.type === "system" && j === this.table[i].length - 1)) {
                            cols = Math.max(cols, j + 1);
                        }
                    }
                }
            }
            return {
                rows: rows,
                cols: cols
            };
        };

        var isSpace = function(value) {
            //var code = value.length >= 4 ? value.charCodeAt(value.length - 4) : 0;
            //var isAlpha = (code >= "a".charCodeAt(0) && code <= "z".charCodeAt(0)) ||
            //              (code >= "A".charCodeAt(0) && code <= "Z".charCodeAt(0));
            //if (isAlpha) {
            //  return true;
            //}
            //TODO: new Tokenizer().next().value === 'operator' - ?
            return !/(sin|sen|cos|log|lg|ln|sqrt|cbrt)$/.test(value); //TODO: String#endsWith
        };

        // private
        MatrixTable.prototype.onKeyDown = function(event) {
            if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !event.defaultPrevented) {
                var DOM_VK_BACK_SPACE = 8;
                var DOM_VK_RETURN = 13;
                var DOM_VK_SPACE = 32;
                var DOM_VK_LEFT = 37;
                var DOM_VK_UP = 38;
                var DOM_VK_RIGHT = 39;
                var DOM_VK_DOWN = 40;
                var DOM_VK_DELETE = 46;

                var keyCode = event.type === "keydown" ? event.keyCode : (event.data === " " ? DOM_VK_SPACE : 0);
                var input = event.target;

                var ds = 0;

                if (keyCode === DOM_VK_BACK_SPACE) {
                    if (input.selectionStart === 0 && input.selectionEnd === 0) {
                        ds = 1;
                    }
                } else if (keyCode === DOM_VK_DELETE) {
                    if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
                        ds = 6;
                    }
                } else if (keyCode === DOM_VK_RETURN) {
                    ds = 2;
                } else if (keyCode === DOM_VK_SPACE) {
                    if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
                        if (isSpace(input.value)) {
                            ds = 3;
                        } else {
                            hit({
                                input: "space"
                            }); //!
                        }
                    }
                } else if (keyCode === DOM_VK_LEFT) {
                    if (input.selectionStart === 0 && input.selectionEnd === 0) {
                        ds = 1;
                    }
                } else if (keyCode === DOM_VK_UP) {
                    ds = 4;
                } else if (keyCode === DOM_VK_RIGHT) {
                    if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
                        ds = 3;
                    }
                } else if (keyCode === DOM_VK_DOWN) {
                    ds = 5;
                }

                if (ds !== 0) {
                    event.preventDefault();
                    var mt = this;
                    var i = Number(input.getAttribute("data-row"));
                    var j = Number(input.getAttribute("data-column"));
                    if (i >= mt.rows) {
                        i = mt.rows - 1;
                    }
                    if (j >= mt.cols) {
                        j = mt.cols - 1;
                    }
                    var oldI = i;
                    var oldJ = j;

                    if (ds === 1) {
                        // return back to first non-empty cell
                        if (j > 0) {
                            j -= 1;
                        } else {
                            if (i > 0) {
                                i -= 1;
                                if (mt.cols > 0) {
                                    j = mt.cols - 1;
                                }
                            }
                        }
                    } else if (ds === 2) {
                        i += 1;
                        j = 0;
                    } else if (ds === 3) {
                        j += 1;
                    } else if (ds === 4) {
                        i -= 1;
                    } else if (ds === 5) {
                        i += 1;
                    } else if (ds === 6) {
                        j += 1;
                        if (j === mt.cols) {
                            if (i + 1 !== mt.rows) {
                                i += 1;
                                j = 0;
                            } else {
                                j -= 1;
                            }
                        }
                    }

                    if (i < 0) {
                        i = 0;
                    }
                    if (j < 0) {
                        j = 0;
                    }

                    if (i !== oldI || j !== oldJ) {
                        var hideCol = j < oldJ && oldJ === mt.cols - 1 && mt.cols > mt.initCols;
                        for (var k = 0; k < mt.rows; k += 1) {
                            hideCol = hideCol && mt.table[k][mt.cols - 1].value.length === 0;
                        }
                        var hideRow = i < oldI && oldI === mt.rows - 1 && mt.rows > mt.initRows;
                        for (var k = 0; k < mt.cols; k += 1) {
                            hideRow = hideRow && mt.table[mt.rows - 1][k].value.length === 0;
                        }
                        if (i === mt.rows || j === mt.cols) {
                            mt._resizeTable(mt.rows + (i === mt.rows ? +1 : 0), mt.cols + (j === mt.cols ? +1 : 0));
                        }
                        var e = mt.table[i][j];
                        e.focus();
                        e.select();
                        if (hideCol || hideRow) {
                            // when hiding some cells, the focus should be moved at first
                            mt._resizeTable(mt.rows + (hideRow ? -1 : 0), mt.cols + (hideCol ? -1 : 0));
                        }
                    }
                }
            }
        };



        //TODO: 
        // 

        var actHistoryStorage = new ActHistoryStorage(new IDBItemsStorage(function(callback) {
            wait2(function() {
                callback(new ItemsStorage(keyStorage));
            });
        }));
        var isLoaded = false;
        var _isLoadedListener = null;

        function waitActHistory(callback) {
            if (isLoaded) {
                callback(actHistoryStorage.getActHistory());
            } else {
                _isLoadedListener = callback;
            }
        }
        actHistoryStorage.load(function(data) {
            if (_isLoadedListener != null) {
                _isLoadedListener(actHistoryStorage.getActHistory());
                _isLoadedListener = null;
            } else {
                isLoaded = true;
            }
        });

        var setLocationHash = function(hash) {
            // origin is required to support https://translate.googleusercontent.com/translate_c?depth=1&hl=iw&prev=search&rurl=translate.google.co.il&sl=en&u=https://matrixcalc.org/en/ - TODO - check
            // and for https://webcache.googleusercontent.com/search?q=cache:https://matrixcalc.org/
            // "#" cause scrolling to the top of an iframe in Chrome on iframe's "onload"
            window.history.replaceState(window.history.state, document.title, window.location.href.replace(/#[^#]*$/g, '') + hash);
        };

       


        Utils.initialize(".decimal-fraction-digits-controls", function(element) {
            var checkbox = document.getElementById("decfraccheckbox");
            var digitsValueInput = document.getElementById("frdigits");
            var roundingTypeSelectBox = document.getElementById("rounding-type");
            var span = document.getElementById("frdigitsspan");

            var onDecimalFractionDigitsChange = function(event) {
                if (event != undefined) { // initialization
                    hit({
                        click: "onDecimalFractionDigitsChange"
                    });
                }
                var useDecimalFractions = checkbox.checked;
                var value = Math.floor(Number(digitsValueInput.value) || 0);
                span.hidden = !useDecimalFractions;
                var roundingType = roundingTypeSelectBox.value || "fractionDigits";
                if (roundingType === "fractionDigits") {
                    decimalRounding = useDecimalFractions ? {
                        fractionDigits: Math.max(value, 0)
                    } : undefined;
                    digitsValueInput.min = 0;
                } else if (roundingType === "significantDigits") {
                    decimalRounding = useDecimalFractions ? {
                        significantDigits: Math.max(value, 1)
                    } : undefined;
                    digitsValueInput.min = 1;
                } else {
                    //?
                }
                if (event != undefined) {
                    keyStorage.setItem("decfraccheckbox", useDecimalFractions ? "true" : "false");
                    keyStorage.setItem("frdigits", value.toString());
                    keyStorage.setItem("roundingType", roundingType);
                }
            };

            checkbox.addEventListener("change", onDecimalFractionDigitsChange);
            digitsValueInput.addEventListener("change", onDecimalFractionDigitsChange);
            roundingTypeSelectBox.addEventListener("change", onDecimalFractionDigitsChange);
            var checked = keyStorage.getItem("decfraccheckbox");
            var value = keyStorage.getItem("frdigits");
            var roundingType = keyStorage.getItem("roundingType");

            if (checked != undefined) {
                checkbox.checked = checked === "true";
            }
            if (value != undefined) {
                digitsValueInput.value = value; // updateInputValue may not work with <input type="number" /> in Firefox
            }
            if (roundingType != undefined) {
                roundingTypeSelectBox.value = roundingType;
            }
            window.setTimeout(function() { // Chrome
                onDecimalFractionDigitsChange(undefined); // autofill + localStorage
            }, 0);
        });

        //TODO: bug - ?
        //TODO: seems, "paste" is not fired on <button> elements
        document.addEventListener('paste', function(event) {
            var e = document.activeElement;
            if (e != null && e.tagName.toLowerCase() === 'button' && event.target !== e) {
                var extraEvent = new Event('paste');
                extraEvent.clipboardData = event.clipboardData; // TODO:
                e.dispatchEvent(extraEvent);
            }
        });

        var DnD = {};
        DnD.initializeDropZone = function(element) {
            element.setAttribute("dropzone", "copy string:text/plain string:application/mathml-presentation+xml");
            element.addEventListener("dragenter", DnD.onDragEnterOrDragOver, false);
            element.addEventListener("dragover", DnD.onDragEnterOrDragOver, false);
            element.addEventListener("drop", DnD.onDropOrPaste, false);
            element.addEventListener("paste", DnD.onDropOrPaste, false);
            element.addEventListener("beforepaste", function(event) {
                event.preventDefault();
            }, false);
        };
        DnD.onDragEnterOrDragOver = function(event) {
            if (event.target == undefined || event.target.nodeType !== Node.ELEMENT_NODE || (event.target.tagName.toLowerCase() !== 'textarea' && event.target.tagName.toLowerCase() !== 'input')) {
                event.dataTransfer.dropEffect = "copy";
                event.preventDefault();
            }
        };
        // reimplementation of the default drop or paste insertion
        DnD.textDropOrPaste = function(input, insertion, caretPosition, isDrop) {
            input.focus(); //!
            if (caretPosition !== -1) { // isDrop is true
                input.setSelectionRange(caretPosition, caretPosition);
            }
            var selectionStart = input.selectionStart;
            //var selectionEnd = input.selectionEnd;
            if (input.hasAttribute('contenteditable') && input.getAttribute('aria-multiline') !== 'true') {
                insertion = insertion.replace(/[\r\n]/g, '');
            }
            insertText(insertion, input);
            // insetText does not scroll to selection (!) in Chrome
            input.setSelectionRange(selectionStart + (isDrop ? 0 : insertion.length), selectionStart + insertion.length); // force scrolling
            // TODO: force the scrolling in Chrome
            //input.dispatchEvent(new Event('input'));
            //TODO: what if the effect was "cut" - ? it should be done by the browser
        };



        DnD.onDropOrPaste = function(event) {
            var target = this;
            var input = event.target;
            var caretPosition = event.type === "paste" || (event.clientX === 0 && event.clientY === 0) ? -1 : document.caretPositionFromPoint(event.clientX, event.clientY).offset;
            var isDrop = event.type === "drop";
            var dataTransfer = event.type === "paste" ? event.clipboardData : event.dataTransfer;
            var tableId = target.getAttribute('data-matrix-table');
            var plainText = dataTransfer.getData('text/plain');
            var hasSpecialData = DnD.hasInterestingData(dataTransfer) &&
                //plainText !== '' && // image insertion, default action is show the image, TODO: fix
                /[^\w]/.test(plainText) && // try to not avoid default action as insertText is not works well in Firefox (undo/redo), TODO: fix
                (plainText.indexOf('=') === -1 || (tableId != null && !(MatrixTables[tableId].mode !== 'cells' && input.tagName.toLowerCase() === 'textarea' && MatrixTables[tableId].type === 'system')) || plainText === '') &&
                (/[\t\n\r]/.test(plainText) && input.tagName.toLowerCase() === 'input' || tableId != null || plainText === '');
            //!!!
            //TODO: test (insertion of `x+y=2,y=1` into a textarea for a system of linear equations
            //TODO: insertion of "1 2\n3 4" into a textarea
            //TODO: insertion of "1\t2\t3\n" into a textarea with text "4\t5\t6\n" at the end
            var isEditable = input.tagName.toLowerCase() === 'input' || input.tagName.toLowerCase() === 'textarea' || input.hasAttribute('contenteditable');
            dndGetTextData(dataTransfer, function(text) {
                var isPlainText = text === plainText;
                if (isPlainText && !hasSpecialData && isEditable) {
                    DnD.textDropOrPaste(input, text, caretPosition, isDrop);
                } else {
                    RPNProxy.getMatrix(text, function(tmp) {
                        var elements = tmp.elements;
                        var variableNames = tmp.variableNames;
                        if (elements != undefined && tableId != null) {
                            //TODO: do not insert zeros when there are a lot of them (!)
                            MatrixTables[tableId].insert({
                                inputValues: elements,
                                variableNames: variableNames
                            });
                        } else if (elements != undefined && target.tagName.toLowerCase() === 'button') { // .add-table
                            target.click();
                            //TODO:
                            var newTableId = document.querySelector('.main').lastElementChild.querySelector('.insert-table').getAttribute('data-id');
                            MatrixTables[newTableId].insert({
                                inputValues: elements,
                                variableNames: variableNames
                            });
                        } else if (elements != undefined && isEditable) {
                            //TODO: test, fix (spaces, decimal commas - ?)
                            DnD.textDropOrPaste(input, '{' + elements.map(function(row) {
                                return '{' + row.map(function(cell) {
                                    return cell.trim();
                                }).join(', ') + '}';
                            }).join(',') + '}', caretPosition, isDrop);
                        } else if (isEditable) {
                            DnD.textDropOrPaste(input, text, caretPosition, isDrop);
                        } else {
                            throw new TypeError('drop or paste of ' + text);
                        }
                    }, function(resultError) {
                        if (isEditable) {
                            DnD.textDropOrPaste(input, text, caretPosition, isDrop);
                        } else {
                            var positionInfo = RPNProxy.getPositionInfo();
                            handleError(text, isDrop ? 'drop' : 'paste', resultError, positionInfo);
                        }
                    });
                }
            });
            event.preventDefault();
        };

        globalThis.DnD = DnD;

        // see also https://bugzilla.mozilla.org/show_bug.cgi?id=1012662

        var checkIfCanCopy = function() {
            var isCollapsed = window.getSelection().isCollapsed || document.getElementById("copy-fix") != undefined;
            if (!isCollapsed) {
                return undefined;
            }
            var target = document.activeElement;
            if (target == undefined ||
                target.classList == undefined) {
                return undefined;
            }
            if (target.classList.contains("matrix-menu-show")) {
                target = document.getElementById(target.getAttribute("data-for-matrix"));
            }
            if (target.getAttribute("data-matrix") == undefined &&
                !target.classList.contains("matrix-table-inner")) {
                return undefined;
            }
            return target;
        };

        document.addEventListener("beforecopy", function(event) {
            if (checkIfCanCopy() != undefined) {
                event.preventDefault();
            }
        }, false);

        var onCopy = function(event) {
            var dataTransfer = event.clipboardData;
            var target = checkIfCanCopy();
            if (target != undefined) {
                event.preventDefault();
                if (target.getAttribute("data-matrix") != undefined) {
                    var matrixContainer = target;
                    hit({
                        click: "copy-matrix-container"
                    });
                    dataTransfer.setData("application/mathml-presentation+xml", serializeMatrixContainer(matrixContainer));
                    dataTransfer.setData("text/plain", "\n" + toMultilineString(getTableFromAsciiMathMatrix(matrixContainer.getAttribute("data-matrix"))) + "\n");
                } else {
                    hit({
                        click: "copy-matrix-table"
                    });
                    var tableName = target.getAttribute("data-for");
                    var matrixTableState = MatrixTables[tableName].getDataState();
                    var tmp = RPN.getElementsArray(matrixTableState);
                    //dataTransfer.setData("text/plain", "\n" + toMultilineString(getTableFromAsciiMathMatrix(matrix.toString())) + "\n");
                    //presave decimals:
                    dataTransfer.setData("text/plain", "\n" + toMultilineString(tmp.elements) + "\n");
                    //! set the text/plain data before the xml as Matrix.toMatrix may throw an error
                    var matrix = Matrix.toMatrix(tmp.elements);
                    dataTransfer.setData("application/mathml-presentation+xml", serializeMatrixContainer(parseMathML(new Expression.Matrix(matrix).toMathML({
                        idPrefix: "g",
                        rounding: decimalRounding,
                        useMatrixContainer: false
                    }))));
                }
            }
        };

        document.addEventListener("copy", onCopy, false);

        // It works in Firefox
        document.addEventListener("contextmenu", function(event) {
            var target = event.target.closest("[data-matrix]");
            if (target != undefined) {
                hit({
                    click: "contextmenu"
                });
                prepareMatrixMenu(target.id);
            }
        }, false);
        document.addEventListener("dragstart", function(event) {
            var target = event.target;
            //while (target != undefined && (target.nodeType !== Node.ELEMENT_NODE || target.getAttribute("data-matrix") == undefined)) {
            //  target = target.parentNode;
            //}
            if (target.nodeType !== Node.ELEMENT_NODE || target.getAttribute("data-matrix") == null) {
                target = null; // !window.getSelection().isCollapsed
            }
            if (target != undefined) {
                var matrixContainer = target;
                hit({
                    click: "dragstart"
                });
                var dataTransfer = event.dataTransfer;
                dataTransfer.effectAllowed = "copy";
                dataTransfer.setData("application/mathml-presentation+xml", serializeMatrixContainer(matrixContainer));
                dataTransfer.setData("text/plain", "\n" + toMultilineString(getTableFromAsciiMathMatrix(matrixContainer.getAttribute("data-matrix"))) + "\n");
            }
        }, false);

        var growTimeoutId = 0;

        var grow = function(element, clipElement, listContainer) {
            if (Element.prototype.animate != undefined) {
                var rect = element.getBoundingClientRect();
                var from = rect.top - rect.bottom;
                var animationDuration = 400;
                var a = function(element) {
                    element.animate([{
                            transform: "translateY(" + from.toString() + "px)"
                        },
                        {
                            transform: "translateY(0px)"
                        }
                    ], {
                        duration: animationDuration,
                        composite: "add"
                    });
                };
                if (true) {
                    var viewportHeight = window.innerHeight;
                    var clipRect = listContainer.getBoundingClientRect();
                    var visibleHeight = viewportHeight - clipRect.top;
                    //console.log(clipRect.top, clipRect.bottom, viewportHeight, h);
                    var c = listContainer.firstElementChild;
                    var h = visibleHeight;
                    while (c != null && h > 0) {
                        var childRect = c.getBoundingClientRect();
                        h -= childRect.bottom - childRect.top;
                        c = c.nextElementSibling;
                    }
                    var child = listContainer.firstElementChild;
                    while (child != null && child !== c) {
                        a(child);
                        child = child.nextElementSibling;
                    }
                } else {
                    a(listContainer);
                }
                //TODO: clip-path (?)
                // Note: change the style here to avoid double style recalculation
                clipElement.style.overflowY = "hidden";
                window.clearTimeout(growTimeoutId);
                growTimeoutId = window.setTimeout(function() {
                    // horizontal scrollbar should be shown for very large matrices
                    clipElement.style.overflowY = "visible";
                }, animationDuration);
            }
        };

        var onPrintMatrix = function(event) {
            hit({
                click: "print-matrix-menuitem"
            });
            var matrixTableId = this.id.slice("print-matrix-menuitem-".length);
            var matrixMenu = this.parentNode;
            var matrixContainer = document.getElementById(matrixMenu.getAttribute("data-for-matrix"));
            var matrixElements = getTableFromAsciiMathMatrix(matrixContainer.getAttribute("data-matrix"));
            MatrixTables[matrixTableId].insert({
                inputValues: matrixElements
            }); //TODO: system - ?
        };

        var onPrintMatrixIntoNewTable = function(event) {
            document.querySelector(".add-table").click();
            this.id = "print-matrix-menuitem-" + Object.keys(MatrixTables).sort().slice(-1).join("");
            onPrintMatrix.call(this, event);
        };

        Utils.on("click", ".print-matrix-button", function(event) {
            hit({
                click: "print-matrix-button"
            });
            var actHistoryId = this.getAttribute("data-act-history-id");
            var item = actHistoryId.slice(0, 1) === "#" ? {
                resultMatrix: actHistoryId.slice(1)
            } : actHistoryStorage.getItem(Number(actHistoryId));
            var matrixElements = getTableFromAsciiMathMatrix(item.resultMatrix);
            MatrixTables[this.getAttribute("data-print-matrix-to")].insert({
                inputValues: matrixElements
            }); //TODO: system - ?
        });

        Utils.on("click", ".clear-button", function(event) {
            hit({
                click: "clear-button"
            });
            var p = this.closest(".actline");
            p.parentNode.removeChild(p);
            var actHistoryId = this.getAttribute("data-act-history-id");
            if (actHistoryId.slice(0, 1) !== "#") {
                actHistoryStorage.removeItem(Number(actHistoryId));
            }
        });

        var getInputErrorHTML = function(positionInfo, textMessage) {
            var input = positionInfo.input;
            var startPosition = positionInfo.startPosition;
            var endPosition = positionInfo.endPosition;
            //TODO: semantic elements - ?
            return textMessage + "\n" +
                //         Utils.escapeHTML(input) +
                "<div class=\"input-error-wrapper\">" +
                (startPosition === -1 || endPosition === -1 ? Utils.escapeHTML(input) : Utils.escapeHTML(input.slice(0, startPosition)) + "<u class=\"input-error-position\"><span>" + Utils.escapeHTML(input.slice(startPosition, endPosition) || " ") + "</span></u>" + Utils.escapeHTML(input.slice(endPosition))) +
                "</div>";
        };

        var removeDataErrorAttribute = function(input) {
            if (input.getAttribute("data-error") != null) {
                input.removeAttribute("data-error");
                input.dispatchEvent(new Event('update-attribute'));
            }
        };

        function updateDataErrorAttribute(input, error, positionInfo, extraPositionOffset) {
            extraPositionOffset = extraPositionOffset == undefined ? 0 : positionInfo.p;
            var message = error.message;
            var position = positionInfo.startPosition;
            var end = positionInfo.endPosition;
            if (message.indexOf("UserError:") === 0 || (position !== -1 && end !== -1)) {
                position += extraPositionOffset; //?
                end += extraPositionOffset; //?
                position = Math.min(position, input.value.length - 1); //TODO: fix ?
                end = Math.max(end, position + 1); // at least one character (textarea with EOF in the middle "sin ")
                end = Math.min(end, input.value.length); //?

                var delay = 0;
                if (end === input.value.length) {
                    // trying not to blink with this error background
                    delay = 1000;
                }
                var checkedValue = input.value;
                window.setTimeout(function() {
                    if (checkedValue !== input.value) {
                        return;
                    }

                    var dataError = position + "," + end;
                    if (dataError !== input.getAttribute("data-error")) {
                        input.setAttribute("data-error", dataError);
                        input.dispatchEvent(new Event('update-attribute'));
                    }

                }, delay);

                // no need to do an extra blinking
                /*
                      var onInput = function (event) {
                        window.setTimeout(function () {
                          input.removeEventListener("input", onInput, false);
                          removeDataErrorAttribute(input);
                        }, 0);
                      };
                      input.addEventListener("input", onInput, false);
                */
            }
        };

        var onExpressionClick = function(event) {
            (wait2(function() {
                var expression = this.getAttribute("data-expression");
                var expressionInput = undefined;
                if (expression == undefined) {
                    expressionInput = this.previousElementSibling.classList.contains("a-input") ? this.previousElementSibling.querySelector("input") : this.previousElementSibling;
                    expression = expressionInput.value;
                    // save
                    keyStorage.setItem("expression", expression);
                }
                hit({
                    onExpressionClick: expression
                });

                //?
                var kInput = this.parentNode.classList.contains("button-before-input") ? this.parentNode.querySelector("input") : undefined;
                if (kInput == null && expression.endsWith('-column k')) {
                    kInput = this.parentNode.querySelector('#columnNumber');
                }
                if (kInput == null && expression.endsWith('-row k')) {
                    kInput = this.parentNode.querySelector('#rowNumber');
                }
                var kInputValue = kInput == undefined ? undefined : kInput.value;
                var kInputId = kInput == undefined ? undefined : kInput.id;
                var matrixTableStates = {};
                for (var tableName in MatrixTables) {
                    if (Object.prototype.hasOwnProperty.call(MatrixTables, tableName)) {
                        matrixTableStates[tableName] = MatrixTables[tableName].getDataState();
                    }
                }

                var actHistoryId = (actHistoryStorage.actHistoryId += 1);
                var printOptions = {
                    idPrefix: "i" + actHistoryId.toString(),
                    rounding: decimalRounding
                };

                var classList = this.classList.toString();
                var start = Date.now();
                RPNProxy.runExpression(expression, kInputValue, kInputId, matrixTableStates, printOptions, function(result) {
                    var resultError = result.resultError;
                    var details = result.details;
                    var expressionString = result.expressionString;
                    var resultHTML = result.resultHTML;
                    var resultMatrix = result.resultMatrix;
                    var detailsHTML = result.detailsHTML;
                    if (resultError == undefined) {
                        lastHash = expressionString.replace(/[^\S\u200B]+/g, ""); //?
                        //? x+y=2, 2x=4
                        setLocationHash("#" + encodeLocationHash(lastHash));
                        zInsAct(resultHTML, resultMatrix, details, expressionString, actHistoryId, detailsHTML, {
                            isLoading: false
                        });
                        var end = Date.now();
                        hit({
                            click: "onExpressionClick-" + roundValue(end - start, 10 - 1)
                        });
                    } else {
                        if (typeof resultError === "string") {
                            resultError = new TypeError(resultError); // out of memory in Firefox
                        }
                        var positionInfo = RPNProxy.getPositionInfo();

                        //TODO: show details anyway (!?)
                        //!new - test
                        if (resultError.message.indexOf("SingularMatrixException") === 0) {
                            hit({
                                click: "SingularMatrixException"
                            });
                            zInsAct("<div>" + i18n.inverse.determinantIsEqualToZeroTheMatrixIsSingularNotInvertible + "</div>", "", details, expression, actHistoryId, detailsHTML, {
                                isLoading: false
                            });
                        }
                        //!new
                        handleError(expression, classList, resultError, positionInfo); //?
                    }
                });
            }.bind(this))());
        };


        var insertButtonsTemplate = document.createElement('div');

        insertButtonsTemplate.innerHTML = '<div role="group" class="insert-buttons">' +
            '<div><button type="button" class="print-matrix-button" data-act-history-id="" data-print-matrix-to="A"></button></div>' +
            '<div><button type="button" class="print-matrix-button" data-act-history-id="" data-print-matrix-to="B"></button></div>' +
            '<div><button type="button" class="clear-button"; data-act-history-id=""></button></div>' +
            '<div><button type="button" class="share-item-button" data-act-history-id="" title="" hidden></button></div>' +
            '</div>';

        var zInsAct = function(resultHTML, resultMatrix, details, expressionString, actHistoryId, detailsHTML, options) {
            if (typeof resultHTML !== "string" || typeof resultMatrix !== "string") {
                throw new RangeError();
            }
            options = options || {};

            var element = document.createElement("li");
            element.classList.toggle("actline", true);
            element.id = "action-" + actHistoryId;

            var insertButtons = insertButtonsTemplate.firstElementChild.cloneNode(true);
            var buttons = insertButtons.querySelectorAll(".print-matrix-button");
            for (var i = 0; i < buttons.length; i += 1) {
                var to = buttons[i].getAttribute("data-print-matrix-to");
                buttons[i].textContent = document.getElementById('i18n-buttons-insertIn').textContent + ' ' + to;
                buttons[i].hidden = resultMatrix === "" || MatrixTables[to] == undefined;
                buttons[i].setAttribute("data-act-history-id", actHistoryId);
            }
            insertButtons.querySelector(".clear-button").textContent = document.getElementById('i18n-buttons-clear').textContent; // i18n.buttons.clear;
            insertButtons.querySelector(".clear-button").setAttribute("data-act-history-id", actHistoryId);

            

            var add = function(html) {
                var div = document.createElement("div");
                div.innerHTML = html;
                while (div.firstChild != undefined) {
                    element.appendChild(div.firstChild);
                }
            };
            element.appendChild(insertButtons);
            add(resultHTML);
            if (detailsHTML != undefined) {
                add(detailsHTML);
            }

            var resdiv = document.getElementById("resdiv");
            var resultsContainer = resdiv.firstElementChild;
            if (resultsContainer == undefined) {
                resultsContainer = document.createElement("ol");
                resultsContainer.id = "results-container";
                resdiv.appendChild(resultsContainer);
            }
            if (resultsContainer.firstChild == null) {
                resultsContainer.appendChild(element);
            } else {
                resultsContainer.firstChild.parentNode.insertBefore(element, resultsContainer.firstChild);
            }
            Utils.check(element);
            if (!options.isLoading) {
                if (options.fromHashChange) {
                    element.scrollIntoView(true);
                    //TODO: :target - ?
                } else {
                    element.scrollIntoViewIfNeeded(false);
                }
                grow(element, resdiv, resultsContainer); //!
                actHistoryStorage.setItem(actHistoryId, ActHistoryStorage.createItem({
                    resultHTML: resultHTML,
                    resultMatrix: resultMatrix,
                    details: details,
                    expressionString: expressionString,
                    actHistoryId: undefined,
                    detailsHTML: detailsHTML,
                    version: ActHistoryStorage.itemVersion,
                    timestamp: new Date(Date.now()).toISOString()
                }));
            }
        };

        //TODO: assign id instead to the <details> - ?
        function getKey(element) {
            var key = [];
            var e = element;
            while (e != null && e.id === '') {
                // https://stackoverflow.com/a/57503796/839199
                var index = 0;
                var c = e.previousElementSibling;
                while (c != null) {
                    if (c.tagName.toLowerCase() === e.tagName.toLowerCase()) {
                        index += 1;
                    }
                    c = c.previousElementSibling;
                }
                key.push(e.tagName.toLowerCase() + ':nth-of-type(' + index + ')');
                e = e.parentNode;
            }
            if (e != null) {
                key.push('#' + e.id);
            }
            key.reverse();
            return key.join(' > ');
        }

        // .details-container > <details> > <summary>
        Utils.initialize("details", function(element) {
            //var details = element.firstElementChild;
            var details = element;
            var summary = details.firstElementChild;
            if (details.initDetails != null) {
                details.initDetails(summary);
            }
            details.addEventListener("toggle", function(event) {
                Utils.check1(event.target);
            }, false);
            details.addEventListener("toggle", function(event) {
                var element = event.target;
                var detailsAttribute = element.getAttribute("data-details");
                if (detailsAttribute == undefined) {
                    return;
                }
                element.removeAttribute("data-details");
                var idPrefix = element.getAttribute("data-id-prefix");
                var printOptions = {
                    idPrefix: idPrefix,
                    rounding: decimalRounding
                };
                var x = JSON.parse(detailsAttribute);
                var e = element.firstElementChild.nextElementSibling;
                hit({
                    details: x.type
                }); //!
                RPNProxy.getDetails(x, printOptions, function(html) {
                    var tmp = document.createElement('div');
                    tmp.innerHTML = html;
                    e.appendChild(tmp);
                    Utils.check(tmp);
                });
            }, false);
            summary.addEventListener("mousedown", function(event) {
                if (event.detail > 1) {
                    event.preventDefault();
                }
            });

            //!new 2019-08-29
            // keep the state of <details> in the history.state:
            var historyState = window.history.state;
            if (historyState != null) {
                var state = historyState.detailsSummary;
                if (state != null) {
                    var key = getKey(details);
                    if (state[key] != null) {
                        summary.click();
                    }
                }
            }

        });

        function canSaveStateOnPageHide() {
            if (!('onpagehide' in window)) {
                return false; // IE 10
            }
            //TODO: fix
            //TODO: Chrome bug
            return !('onfreeze' in document); // it is not a Chrome
        }

        window.addEventListener(!canSaveStateOnPageHide() ? "beforeunload" : "pagehide", function(event) {
            var detailsSummary = {};
            var es = document.querySelectorAll("details[open]");
            for (var i = 0; i < es.length; i++) {
                var key = getKey(es[i]);
                detailsSummary[key] = true;
            }
            var historyState = Object.assign({}, window.history.state);
            historyState.detailsSummary = detailsSummary;
            window.history.replaceState(historyState, document.title, window.location.href);
        }, !canSaveStateOnPageHide() ? {
            once: true,
            passive: true
        } : false);

        Utils.on("click", ".change-button", function(event) {
            hit({
                click: "change-button"
            });
            var s1 = this.getAttribute("data-for1");
            var s2 = this.getAttribute("data-for2");
            var table1 = MatrixTables[s1];
            var table2 = MatrixTables[s2];
            var t1 = table1.getState();
            var t2 = table2.getState();
            table1.insert(t2);
            table2.insert(t1);
        });

        // ---------------------------------------- cookies -----------------------------------------------

        var onInputExampleLinkClick = function(event) {
            hit({
                click: "input-example-link"
            });


            //super hack
            event.preventDefault();
            var s = this.parentNode.parentNode.querySelector(".input-example-code").textContent;
            s = s.replace(/\u0020+/g, " ").trim().replace(/\n\u0020/g, "\n");
            var mt = MatrixTables["A"];
            if (mt.mode === "cells") {
                mt.container.querySelector(".swap-mode-button").click();
            }
            updateInputValue(mt.textarea, s);
            // for some reasons `mt.textarea.focus()` does not scroll to show the full textarea in Chrome sometimes
            window.setTimeout(function() {
                mt.container.scrollIntoViewIfNeeded(false);
            }, 150);
        };

        Utils.initialize(".input-example-link-container", function(element) {
            element.firstElementChild.onclick = onInputExampleLinkClick;
        });



        // detfindDet

        Utils.initialize(".insert-table", function(element) {
            var id = element.getAttribute("data-id");
            var sizes = element.getAttribute("data-sizes") || "";
            var type = element.getAttribute("data-type") || "simple";

            var initialRows = 3;
            var initialCols = 3;
            var match = (/^(\d+)x(\d+)$/).exec(sizes);
            if (match != undefined) {
                initialRows = Number(match[1]);
                initialCols = Number(match[2]);
            }

            var state = undefined;
            var stateKey1 = id + "1";

            var historyState = window.history.state;
            if (historyState != null && historyState[stateKey1] != null) {
                state = historyState[stateKey1];
            }

            if (state == undefined) {
                state = {
                    mode: undefined,
                    inputValues: null,
                    textareaValue: null,
                    rows: initialRows,
                    cols: initialCols,
                    textareaStyleWidth: undefined,
                    textareaStyleHeight: undefined
                };
            }
            //TODO: do we need a title attribute at insert-table and why if we have <legend> ?
            var x = new MatrixTable(id, initialRows, initialCols, type, element);
            //element.style.visibility = "hidden";
            var modeKey = "~" + window.location.pathname + "~" + id + "~" + "mode";
            var mode = keyStorage.getItem(modeKey);
            if (mode == undefined) {
                var initialMode = undefined;
                //use the mode from the last table:
                for (var tableName in MatrixTables) {
                    if (Object.prototype.hasOwnProperty.call(MatrixTables, tableName)) {
                        initialMode = MatrixTables[tableName].mode;
                    }
                }
                if (initialMode == undefined) {
                    //as table of inputs does not work well on mobile phones (on Android the virtual keyboard is swithed to the alphabetical on every focus change)
                    initialMode = !window.matchMedia("(pointer: fine)").matches ? '' : 'cells';
                }
                mode = initialMode;
                //mode = x.mode;
            }
            MatrixTables[id] = x;
            x.mode = mode;
            x.insert(state);
            //element.style.visibility = "";
            x.onmodechange = function() {
                keyStorage.setItem(modeKey, x.mode);
            };
            x.onswapmode = function() {
                var newMode = x.mode === "cells" ? "" : "cells";
                RPNProxy.getElementsArray(x.getDataState(), function(result) {
                    var elements = result.elements;
                    var variableNames = result.variableNames;
                    x.insert({
                        inputValues: elements,
                        mode: newMode,
                        variableNames: variableNames
                    });
                });
            };
            DnD.initializeDropZone(element);

        });

        // TODO: save new tables to the history.state, don't restore old
        window.addEventListener(!canSaveStateOnPageHide() ? "beforeunload" : "pagehide", function(event) {
            var historyState = Object.assign({}, window.history.state);
            for (var tableName in MatrixTables) {
                if (Object.prototype.hasOwnProperty.call(MatrixTables, tableName)) {
                    var stateKey1 = tableName + "1";
                    historyState[stateKey1] = MatrixTables[tableName].getState();
                }
            }
            window.history.replaceState(historyState, document.title, window.location.href);
        }, !canSaveStateOnPageHide() ? {
            once: true,
            passive: true
        } : false);

        Utils.on("click", ".expression-button", onExpressionClick);

        Utils.on("click", ".expression-input-button", onExpressionClick);

        Utils.initialize(".expression-input-container", function(element) {
            var input = element.querySelector("input");

            var form = element;
            addClickOnEnter(element); // focus is moved to button in IE 11 otherwise
            form.addEventListener('submit', function(event) {
                event.preventDefault();
            }, false);

            input.addEventListener("input", function(event) {
                event.target.style.width = ch(Math.max(38, event.target.value.length + 2 + 2) + "ch"); // + 2 as it has a list
            }, false);

            if (input.value === input.getAttribute("value")) { // autofill
                //input.disabled = true;
                var value = keyStorage.getItem("expression");
                if (value != undefined && value !== "") {
                    //input.value = value;
                    updateInputValue(input, value);
                }
                input.addEventListener("input", function(event) {
                    var input = event.target;
                    checkInput(input, "");
                }, false);
                checkInput(input, "");
                //input.disabled = false;
            }

            // transformation of multi-line form into single-line form
            input.addEventListener("drop", DnD.onDropOrPaste, false);
            input.addEventListener("paste", DnD.onDropOrPaste, false);
        });

        var encodeLocationHash = function(hash) {

            //var url = new URL('https://example.com/');
            //url.hash = hash;
            //return hash.slice('#'.length);

            // twitter.com does not support {} in hash, seems
            // comments systems, other software with "auto-link" feature may work not good with some characters ...
            // update: 2021-07-27: *, (, ) - not encoded
            // update: encode (, )
            // TODO: ^ - replace by ** - ?
            return encodeURIComponent(hash).replace(/[\!'\.~\(\)]/g, function(p) {
                    return '%' + p.charCodeAt(0).toString(16);
                })
                // / - 2018-07-09
                // &, +, _ - 2020-08-02
                .replace(/%26|%2B|%2C|%2F|%3D/g, function(p) {
                    return decodeURIComponent(p);
                });
        };

        // https://stackoverflow.com/questions/7449588/why-does-decodeuricomponent-lock-up-my-browser
        function decodeURIComponentSafe(string) {
            var validPercentEncoding = /(?:%[0-7][0-9A-F]|%(?!C[0-1])[C-D][0-9A-F]%[8-9A-B][0-9A-F]|%(?!E0%[8-9])(?!ED%[A-B])E[0-9A-F](?:%[8-9A-B][0-9A-F]){2}|%(?!F0%8)(?!F4%[9A-B])F[0-4](?:%[8-9A-B][0-9A-F]){3}|[^%])+/gi;
            return string.replace(validPercentEncoding, function(p) {
                return decodeURIComponent(p);
            });
        }

        var decodeLocationHash = function(hash) {
            // determinant-Gauss%28%7B%7B0,z,y,u%7D,%7Bz,z,u%2By,u%2By%7D,%7Bu%2By,u%2By,z,z%7D,%7Bu,y,z,0%7D%7D%29
            return decodeURIComponentSafe(hash);
        };

        var lastHash = "";

        var onHashChange = function(event) {
            var hash = decodeLocationHash(window.location.hash.slice(1));
            if (lastHash === hash) {
                return;
            }
            lastHash = hash;

            if (document.getElementById(hash) != undefined) {
                return;
            }
            //TODO: (?)
            if (/^hcm\=\d+$/.exec(hash) != undefined) { // || document.getElementById(hash) != undefined
                return;
            }
            if (/^[\-\da-zA-Z]*system_1$/.exec(hash) != undefined) { // || document.getElementById(hash) != undefined
                return;
            }
            if (hash.trim() === "") {
                return;
            }

            var actHistoryId = (actHistoryStorage.actHistoryId += 1);
            var printOptions = {
                idPrefix: "i" + actHistoryId.toString(),
                rounding: decimalRounding
            };
            //TODO: FIX!!!
            RPNProxy.runExpression(hash, undefined, undefined, undefined, printOptions, function(result) {
                var resultError = result.resultError;
                var details = result.details;
                var expressionString = result.expressionString;
                var resultHTML = result.resultHTML;
                var resultMatrix = result.resultMatrix;
                var detailsHTML = result.detailsHTML;
                if (resultError == undefined) {
                    var previousItem = actHistoryStorage.getPreviousItem();
                    //...
                    // TODO: FIX!!! It is wrong to compare HTML here, as "Expression.id()" generates different HTML each time
                    if (previousItem == undefined || (previousItem.resultHTML !== resultHTML && previousItem.expressionString !== expressionString)) {
                        zInsAct(resultHTML, resultMatrix, details, expressionString, actHistoryId, detailsHTML, {
                            isLoading: false,
                            fromHashChange: true
                        });
                    }
                } else {
                    //if (resultError.message.indexOf("UserError:") === 0) {
                    //ignore
                    //} else {
                    var positionInfo = RPNProxy.getPositionInfo();
                    handleError(hash, "location.hash", resultError, positionInfo);
                    //}
                }
            });
        };

        document.addEventListener('submit', function(event) {
            if (event.target.matches('.main-form')) {
                event.preventDefault();
                event.target.setAttribute('data-expression', (event.target.elements.solveExpression || event.target.elements.determinantExpression).value);
                onExpressionClick.call(event.target);
            }
        });

        Utils.initialize(".an-autocomplete", function(element) {
            element.addEventListener("change", function(event) {
                var value = event.target.value;
                keyStorage.setItem(element.name, value);
            }, false);
            var value = keyStorage.getItem(element.name);
            if (value != undefined) {
                element.value = value;
                element.dispatchEvent(new Event('change'));
            }
        });

        Utils.initialize(".determinant-expression", function(element) {
            var onChange = function(event) {
                var value = event.target.value;
                document.getElementById('rowNumber').parentNode.style.visibility = value.indexOf('-row k') === -1 ? 'hidden' : '';
                document.getElementById('columnNumber').parentNode.style.visibility = value.indexOf('-column k') === -1 ? 'hidden' : '';
            };
            element.querySelector('select').addEventListener('change', onChange, false);
            onChange({
                target: element.querySelector('select')
            });
        });

        Utils.initialize(".from-cookie", function(element) {

            if ((window.navigator.platform || '').indexOf('Mac') === 0) {
                document.body.classList.add('mac');
            }

            // TODO: insert after the <details> element expansion - ? and calculate - ?
            waitExpression(function() {
                var examples = document.getElementById("examples");
                if (examples != undefined) {
                    var list = examples.querySelectorAll("a");
                    for (var i = 0; i < list.length; i += 1) {
                        var code = list[i].querySelector("code");
                        var s = code.textContent;
                        var html = "<math>" + Expression.p(s, {}, {
                            idPrefix: "g",
                            useMatrixContainer: false
                        }) + "</math>";
                        var tmp = document.createElement("div");
                        tmp.innerHTML = html;
                        code.parentNode.insertBefore(tmp.firstElementChild, code);
                        code.parentNode.removeChild(code);
                    }
                }
            });

            waitActHistory(function(storedActHistory) {
                var exampleAttribute = element.getAttribute("data-example");
                var needsExample = exampleAttribute != undefined;
                var oldVersion = ActHistoryStorage.itemVersion;
                if (true) {
                    for (var actHistoryId in storedActHistory) {
                        if (Object.prototype.hasOwnProperty.call(storedActHistory, actHistoryId)) {
                            var storedActHistoryItem = storedActHistory[actHistoryId].item;
                            zInsAct(storedActHistoryItem.resultHTML,
                                storedActHistoryItem.resultMatrix,
                                storedActHistoryItem.details,
                                storedActHistoryItem.expressionString,
                                actHistoryId,
                                storedActHistoryItem.detailsHTML, {
                                    isLoading: true
                                });
                            needsExample = false;
                            oldVersion = Math.min(oldVersion, storedActHistoryItem.oldVersion);
                            if (storedActHistoryItem.expressionString == undefined) {
                                oldVersion = -1;
                            }
                        }
                    }
                    //if (oldVersion !== ActHistoryStorage.itemVersion) {
                    //..
                    //}
                    if (storedActHistory.length !== 0) {
                        hit({
                            version: "version-" + oldVersion
                        });
                    }
                }
                Utils.waitI18n(function() {
                    //TODO: remove waitExpression for example (?) when location.hash === ""
                    waitExpression(function() {
                        window.addEventListener("hashchange", onHashChange, false);
                        onHashChange(undefined);
                        needsExample = needsExample && actHistoryStorage.size() === 0;
                        if (needsExample) {
                            var printOptions = {
                                idPrefix: "example"
                            };
                            RPNProxy.runExpression("{{5,8,-4},{6,9,-5},{4,7,-2}}*{{2},{-3},{1}}", undefined, undefined, undefined, printOptions, function(result) {
                                if (result.resultError == undefined) {
                                    // TODO: isLoading or not isLoading - ?
                                    var actHistoryId = "#" + result.resultMatrix;
                                    zInsAct(result.resultHTML, result.resultMatrix, result.details, result.expressionString, actHistoryId, result.detailsHTML, {
                                        isLoading: true
                                    });
                                    //! Note:
                                    //! No need to save the example
                                } else {
                                    handleError("", "", result.resultError, {});
                                }
                            });
                        }
                    });
                });
            });

            var pathname = window.location.pathname;
            var links = document.querySelector(".menu").querySelectorAll("a");
            for (var i = 0; i < links.length; i += 1) {
                if (links[i].pathname === pathname) {
                    links[i].setAttribute('aria-current', 'page');
                }
            }

        });

        // --------------------------------------------- end ----------------------------------------------

        //  Drag and Drop + Copy and Paste

        var toggleValidDropTarget = function(force) {
            //document.body.classList.toggle("drop-target", force);
            var dropzones = document.querySelectorAll(".matrix-table");
            for (var i = 0; i < dropzones.length; i += 1) {
                dropzones[i].classList.toggle("valid-drop-target", force);
            }
            var expressionInput = document.getElementById("expression");
            if (expressionInput != undefined) {
                expressionInput.classList.toggle("valid-drop-target", force);
            }
            var addTableButton = document.querySelector(".add-table");
            if (addTableButton != null) {
                addTableButton.classList.toggle("valid-drop-target", force);
            }
        };
        DnD.hasInterestingData = function(dataTransfer) {
            // TODO: types is null in Safari 10
            // types returns null in IE 11
            var types = dataTransfer.types || ['text/plain'];
            for (var i = 0; i < types.length; i += 1) {
                var type = types[i];
                if (type === "text/plain" ||
                    type === "application/mathml-presentation+xml" ||
                    (typeof TextDetector !== "undefined" && type === "Files")) { //TODO: /^image\//.test(event.dataTransfer.items[i].type)
                    return true;
                }
            }
            return false;
        };
        var onDragOverOrDragEnd = function(event) {
            if (!DnD.hasInterestingData(event.dataTransfer)) {
                return;
            }
            var key = "data-drop-target-timeout";
            var a = Number(document.body.getAttribute(key) || 0) || 0;
            if (a !== 0) {
                window.clearTimeout(a);
            } else {
                toggleValidDropTarget(true);
            }
            a = window.setTimeout(function() {
                toggleValidDropTarget(false);
                document.body.setAttribute(key, "0");
            }, event.type === "dragend" ? 0 : 600);
            document.body.setAttribute(key, a.toString());
        };

        document.addEventListener("dragover", onDragOverOrDragEnd, false);
        document.addEventListener("dragend", onDragOverOrDragEnd, false);

        //

        var arrowWithLabelInitialize = function(arrowWithLabel) {
            var arrow = arrowWithLabel.querySelector(".arrow");
            var table = arrowWithLabel.previousElementSibling.querySelector("mtable");
            var start = Number(arrowWithLabel.getAttribute("data-start"));
            var end = Number(arrowWithLabel.getAttribute("data-end"));
            var n = 0;
            var row = table.firstElementChild;
            var startRow = undefined;
            var endRow = undefined;
            while (row != undefined) {
                if (n === start) {
                    startRow = row;
                }
                if (n === end) {
                    endRow = row;
                }
                n += 1;
                row = row.nextElementSibling;
            }
            var startRowRect = startRow.getBoundingClientRect();
            var endRowRect = endRow.getBoundingClientRect();
            var tableRect = table.getBoundingClientRect();
            if (end < start) {
                var tmp = endRowRect;
                endRowRect = startRowRect;
                startRowRect = tmp;
            }
            var arrowHeight = ((endRowRect.top + endRowRect.bottom) / 2 - (startRowRect.top + startRowRect.bottom) / 2);
            var arrowWithLabelVerticalAlign = ((tableRect.top + tableRect.bottom) / 2 - (startRowRect.top + endRowRect.bottom) / 2);
            window.requestAnimationFrame(function() {
                arrow.style.height = arrowHeight.toString() + "px";
                arrow.style.top = "50%";
                arrow.style.marginTop = (-arrowHeight / 2).toString() + "px";
                arrowWithLabel.style.verticalAlign = arrowWithLabelVerticalAlign.toString() + "px";
            });
        };

        document.addEventListener("custom-paint", function(event) {
            if (event.target.getAttribute("data-custom-paint") === "arrow-with-label") {
                arrowWithLabelInitialize(event.target);
            }
        }, false);

        if ("navigationMode" in window.history) {
            window.history.navigationMode = "fast"; // - Opera Presto
        }



        if (window.location.protocol !== "file:" && window.location.hostname !== "127.0.0.1") {
            var useAppCache = function() {
                var onDOMReady = function(event) {
                    // https://www.youtube.com/watch?v=IgckqIjvR9U&t=1005s
                    var iframe = document.createElement("iframe");
                    iframe.style.display = "none";
                    iframe.src = "load-appcache.html";
                    document.body.appendChild(iframe);
                };
                if (document.readyState === "interactive" || document.readyState === "complete") {
                    window.setTimeout(function() {
                        onDOMReady(null);
                    }, 0);
                } else {
                    document.addEventListener("DOMContentLoaded", onDOMReady, {
                        once: true
                    });
                }
            };
            if (("serviceWorker" in window.navigator)) {
                var serviceWorker = undefined;
                try {
                    serviceWorker = window.navigator.serviceWorker;
                } catch (error) {
                    if (error.name !== "SecurityError") {
                        throw error;
                    }
                }
                if (serviceWorker != undefined) {
                    var promise = serviceWorker.register('sw.js', {
                        scope: "./"
                    });
                    if (promise.then != undefined) {
                        promise.then(function(registration) {
                            console.log("ServiceWorker registration succeeded:", registration);
                            //TODO:
                            // reload the page if the user has not interacted with the page yet and the major version is bigger (?)
                            //registration.onupdatefound = function () {
                            //  var installingWorker = registration.installing;
                            //  installingWorker.onstatechange = function (event) {
                            //    if (installingWorker.state === "activated") {
                            //      window.location.reload();
                            //    }
                            //  };
                            //};
                        })["catch"](function(error) {
                            useAppCache();
                            console.log("ServiceWorker registration failed:", error);
                        });
                    }
                } else {
                    useAppCache();
                }
            } else {
                useAppCache();
            }
        }

        window.addEventListener("beforeinstallprompt", function(event) {
            event.preventDefault(); // most of users do not accept it
            //if (event.userChoice != undefined) {
            //  event.userChoice.then(function (choiceResult) {
            //    hit({beforeinstallprompt: choiceResult.outcome});
            //  });
            //}
            hit({
                beforeinstallprompt: "show"
            });

            var installButton = document.getElementById('a2hs-button');
            if (installButton != null) {
                installButton.onclick = function(mouseEvent) {
                    event.prompt();
                };
                installButton.hidden = false;
            }
        }, false);

        (function() {
            var onDOMReady = function(event) {
                if (window.navigator.share != undefined) {
                    var shareButton = document.getElementById('share-button');
                    if (shareButton != null) {
                        shareButton.onclick = function(event) {
                            window.navigator.share({
                                title: decodeURIComponent(shareButton.getAttribute("data-text")),
                                url: decodeURIComponent(shareButton.getAttribute("data-url"))
                            });
                        };
                        shareButton.hidden = false;
                    }
                }
            };
            document.addEventListener("DOMContentLoaded", onDOMReady, {
                once: true
            });
        }());

        Utils.on("click", ".share-item-button", function(event) {
            var actHistoryId = this.getAttribute("data-act-history-id");
            var item = actHistoryStorage.getItem(Number(actHistoryId));
            window.navigator.share({
                url: "#" + encodeLocationHash(item.expressionString)
            });
        });

        Utils.initialize(".more-button", function(button) {
            var container = button.previousElementSibling;
            button.onclick = function() {
                container.hidden = !container.hidden;
                button.setAttribute("aria-expanded", container.hidden ? "true" : "false");
            };
        });

        //! 2018-03-20
        var onMatrixTable = function() {
            //!
            var matrixMenu = document.getElementById("matrix-menu");
            if (matrixMenu != undefined) {
                matrixMenu.parentNode.removeChild(matrixMenu);
            }
            var matrixMenuDialog = document.getElementById("matrix-menu-dialog");
            if (matrixMenuDialog != undefined) {
                matrixMenuDialog.parentNode.removeChild(matrixMenuDialog);
            }
        };

        var addTableTemplate = document.createElement('div');
        addTableTemplate.innerHTML = '<div class="tdmatrix">' +
            '<fieldset>' +
            '<legend align="center"><span></span><button type="button" class="remove-table" data-id="X" title="">✗</button></legend>' +
            '<div class="insert-table" data-id="X" data-sizes="3x3" data-type="simple"></div>' +
            '</fieldset>' +
            '</div>';

        var storedTables = {};

        function addTable(id) {
            var tableNode = document.querySelector('.matrix-table[data-id="' + id + '"]');
            var tdNode = tableNode != null ? tableNode.closest('.tdmatrix') : null;
            if (tdNode != null) {
                tdNode.style.display = '';
                MatrixTables[id] = storedTables[id];
                MatrixTables[id]._resizeTable(MatrixTables[id].initRows, MatrixTables[id].initCols);
            } else {
                var newNode = addTableTemplate.firstElementChild.cloneNode(true);
                newNode.querySelector("legend").querySelector("span").textContent = i18n.index.matrix + ' ' + id + i18n.colonSpacing + ': ';
                newNode.querySelector(".remove-table").setAttribute("data-id", id);
                newNode.querySelector(".remove-table").title = i18n.buttons.removeTable;
                newNode.querySelector(".insert-table").setAttribute("data-id", id);
                document.querySelector(".main").appendChild(newNode);
                Utils.check(newNode);
            }
            onMatrixTable();
        }

        function removeTable(id) {
            storedTables[id] = MatrixTables[id];
            MatrixTables[id]._resizeTable(-1 / 0, -1 / 0); //!new 2020-03-22 (To save hidden <input> elements)
            delete MatrixTables[id];
            var tdNode = document.querySelector('.matrix-table[data-id="' + id + '"]').closest('.tdmatrix');
            if (tdNode != null) {
                //tdNode.parentNode.removeChild(tdNode);
                tdNode.style.display = 'none';
            }
            //TODO: update history state when hiding (?)
            //TODO: restore from the history state the table on back button click
            //TODO: set focus to the previous element (?)
            onMatrixTable();
        }

        function getNextTableId() {
            var id = undefined;
            for (var c = "A"; c <= "Z"; c = String.fromCharCode(c.charCodeAt(0) + 1)) {
                if (id == undefined && MatrixTables[c] == undefined) {
                    id = c;
                }
            }
            return id;
        }

        //button
        Utils.initialize(".add-table", function(element) {
            element.addEventListener("click", function(event) {
                hit({
                    click: "add-table"
                });
                var id = getNextTableId();
                if (id == undefined) {
                    throw new TypeError("Not implemented!");
                }
                addTable(id);
            }, false);

            //!new 2019-01-06
            // Note: "paste" event is not working in Chrome 71?
            DnD.initializeDropZone(element);

            Utils.waitI18n(function() { //TODO: ?
                var historyState = window.history.state;
                if (historyState != null) {
                    for (var key in historyState) {
                        if (Object.prototype.hasOwnProperty.call(historyState, key)) {
                            if (/^[A-Z]1$/.test(key)) { //TODO: ?
                                var id = key.slice(0, -1);
                                if (MatrixTables[id] == undefined) {
                                    addTable(id);
                                }
                            }
                        }
                    }
                }
            }, 0);
        });
        //button
        Utils.on("click", ".remove-table", function(event) {
            hit({
                click: "remove-table"
            });
            var id = event.target.getAttribute("data-id");
            removeTable(id);
        });

        function makeContent(variableName) {
            return MatrixTableBase.makeContent(variableName);
        }

        Utils.initialize(".editable-on-click", function(element) {
            element.innerHTML = '<button type="button"></button><input type="text" pattern="[a-z](?:_\\d+)?" autocapitalize="off" autocomplete="off" spellcheck="false" enterkeyhint="done" hidden />';
            var button = element.querySelector("button");
            var input = element.querySelector("input");
            input.value = element.getAttribute('data-value');
            button.innerHTML = '<math>' + makeContent(element.getAttribute('data-value')) + '</math>';
            // Firefox will not insert a new character into the <input> if to switch during "keypress"
            element.addEventListener("keydown", function(event) {
                if (!event.defaultPrevented && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey) {
                    var charCode = String.fromCharCode(event.keyCode).toLowerCase().charCodeAt(0);
                    if (charCode >= "a".charCodeAt(0) && charCode <= "z".charCodeAt(0)) {
                        if (!button.hidden) {
                            button.click();
                        }
                    }
                }
            }, false);

            function updateValue() {
                var value = input.value.trim();
                element.setAttribute("data-value", value);
                button.innerHTML = '<math>' + makeContent(value) + '</math>';
                element.dispatchEvent(new Event('change-value'));
            }
            element.addEventListener("click", function(event) {
                if (!event.defaultPrevented) {
                    event.preventDefault();
                    button.hidden = true;
                    input.hidden = false;
                    input.focus();
                    input.select();
                    input.addEventListener("blur", function(event) {
                        var value = input.value.trim();
                        if (element.getAttribute("data-value") !== value && value !== "") {
                            updateValue();
                        }
                        button.hidden = false;
                        input.hidden = true;
                    }, false);
                    input.addEventListener("keydown", function(event) {
                        var DOM_VK_RETURN = 13;
                        var DOM_VK_ESCAPE = 27;
                        if (event.keyCode === DOM_VK_ESCAPE) {
                            updateInputValue(input, element.getAttribute("data-value"));
                            event.preventDefault();
                            button.hidden = false;
                            button.focus();
                            input.hidden = true;
                        }
                        if (event.keyCode === DOM_VK_RETURN) {
                            if (input.value.trim() === "") {
                                updateInputValue(input, element.getAttribute("data-value"));
                            }
                            event.preventDefault();
                            updateValue();
                            button.hidden = false;
                            button.focus();
                            input.hidden = true;
                        }
                    }, false);
                    input.addEventListener("input", function(event) {
                        input.style.width = ch((input.value.length + 2) + "ch");
                    }, false);
                }
            }, false);
        });

    }());

    'use strict';

    // 1. polyfill beforeinput event

    // Chrome does not support 'onbeforeinput' in document.documentElement
    if (!('onbeforeinput' in document.documentElement) && !(typeof InputEvent !== 'undefined' && 'getTargetRanges' in InputEvent.prototype)) {
        var makeEvent = function(inputType, dataTransfer) {
            var e = new Event('beforeinput', {
                bubbles: true,
                cancelable: true
            });
            e.inputType = inputType; //TODO: fix
            e.dataTransfer = dataTransfer; //TODO: fix
            return e;
        };
        // listen events on window to allow document listeners to prevent them (!)
        window.addEventListener('drop', function(event) {
            if (!event.defaultPrevented && !event.target.dispatchEvent(makeEvent('insertFromDrop', event.dataTransfer))) {
                event.preventDefault();
            }
        }, false);
        window.addEventListener('paste', function(event) {
            if (!event.defaultPrevented && !event.target.dispatchEvent(makeEvent('insertFromPaste', event.clipboardData))) {
                event.preventDefault();
            }
        }, false);
        window.addEventListener('keydown', function(event) {
            if (!event.defaultPrevented) {
                var DOM_VK_RETURN = 13;
                if (event.keyCode === DOM_VK_RETURN && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    if (!event.target.dispatchEvent(makeEvent(event.shiftKey ? 'insertLineBreak' : 'insertParagraph', null))) {
                        event.preventDefault();
                    }
                }
                if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
                    var inputType = null;
                    if (event.keyCode === 'B'.charCodeAt(0)) {
                        inputType = 'formatBold';
                    }
                    if (event.keyCode === 'I'.charCodeAt(0)) {
                        inputType = 'formatItalic';
                    }
                    if (event.keyCode === 'U'.charCodeAt(0)) {
                        inputType = 'formatUnderline';
                    }
                    if (inputType != null) {
                        if (!event.target.dispatchEvent(makeEvent(inputType, null))) {
                            event.preventDefault();
                        }
                    }
                }
            }
        }, false);
    }

    if (window.customElements != null) { // IE 8 does not support getters/setters on non-DOM objects
        (function() {

            // https://bugzilla.mozilla.org/show_bug.cgi?id=1291467
            // Use beforeinput event to implement contenteditable="plaintext-only":
            document.addEventListener('beforeinput', function(event) {
                var inputType = event.inputType;
                if (inputType !== 'insertText') {
                    if (event.target.tagName.toLowerCase() === 'custom-input') {
                        //console.log(event);
                        if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') { // Enter or Shift+Enter
                            if (event.target.getAttribute('aria-multiline') !== 'true') {
                                event.preventDefault();
                            }
                        } else if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop' || inputType === 'insertReplacementText') {
                            event.preventDefault();
                            var insertion = event.data || event.dataTransfer.getData('text/plain');
                            if (event.target.getAttribute('aria-multiline') !== 'true') {
                                insertion = insertion.replace(/[\r\n]/g, '');
                            }
                            //var targetRanges = event.getTargetRanges();
                            document.execCommand('insertText', false, insertion);
                        } else if (inputType === 'formatBold' || inputType === 'formatItalic' || inputType === 'formatUnderline') { // Ctrl+B, Ctrl+I, Ctrl+U
                            event.preventDefault();
                        } else if (inputType === 'historyUndo' ||
                            inputType === 'historyRedo' ||
                            inputType === 'deleteByCut' ||
                            inputType === 'deleteByDrag' ||
                            inputType === 'deleteContentBackward' ||
                            inputType === 'deleteContentForward' ||
                            inputType === 'deleteWordBackward' ||
                            inputType === 'deleteWordForward') {
                            // do nothing
                        } else if (inputType === 'insertText' ||
                            inputType === 'insertCompositionText') {
                            var insertion = event.data;
                            if (event.target.getAttribute('aria-multiline') !== 'true' && /[\r\n]/.test(event.data)) {
                                event.preventDefault();
                                insertion = insertion.replace(/[\r\n]/g, '');
                                document.execCommand('insertText', false, insertion);
                            }
                        } else {
                            throw new TypeError('unexpected inputType: ' + inputType);
                        }
                    }
                }
            }, false);

            function isAfter(container, offset, node) {
                var c = node;
                while (c.parentNode != container) {
                    c = c.parentNode;
                }
                var i = offset;
                while (c != null && i > 0) {
                    c = c.previousSibling;
                    i -= 1;
                }
                return i > 0;
            }

            function compareCaretPositons(node1, offset1, node2, offset2) {
                if (node1 === node2) {
                    return offset1 - offset2;
                }
                var c = node1.compareDocumentPosition(node2);
                if ((c & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0) {
                    return isAfter(node1, offset1, node2) ? +1 : -1;
                } else if ((c & Node.DOCUMENT_POSITION_CONTAINS) !== 0) {
                    return isAfter(node2, offset2, node1) ? -1 : +1;
                } else if ((c & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) {
                    return -1;
                } else if ((c & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
                    return +1;
                }
            }

            function stringifyElementStart(node, isLineStart) {
                if (node.tagName.toLowerCase() === 'br') {
                    if (true) {
                        return '\n';
                    }
                }
                if (node.tagName.toLowerCase() === 'div') { // Is a block-level element?
                    if (!isLineStart) { //TODO: Is not at start of a line?
                        return '\n';
                    }
                }
                return '';
            }

            function positions(node, isLineStart) {
                isLineStart = isLineStart == undefined ? true : isLineStart;
                console.assert(node.nodeType === Node.ELEMENT_NODE);
                var child = node.firstChild;
                var offset = 0;
                var state = 0;
                var i = null;
                var x = null;
                return {
                    next: function() {
                        while (i != null) {
                            x = i.next();
                            if (!x.done) {
                                return {
                                    value: x.value,
                                    done: false
                                };
                            }
                            i = null;
                            isLineStart = x.value;
                        }
                        if (state === 0) {
                            state = 1;
                            return {
                                value: {
                                    node: node,
                                    offset: offset,
                                    text: stringifyElementStart(node, isLineStart)
                                },
                                done: false
                            };
                        }
                        while (child != null) {
                            if (state === 1) {
                                if (child.nodeType === Node.TEXT_NODE) {
                                    isLineStart = false;
                                    state = 2;
                                    return {
                                        value: {
                                            node: child,
                                            offset: 0 / 0,
                                            text: child.data
                                        },
                                        done: false
                                    };
                                } else {
                                    state = 2;
                                    i = positions(child, isLineStart);
                                    x = i.next();
                                    if (!x.done) {
                                        return {
                                            value: x.value,
                                            done: false
                                        };
                                    }
                                    isLineStart = x.value;
                                    i = null;
                                }
                            }
                            if (state === 2) {
                                offset += 1;
                                state = 3;
                                return {
                                    value: {
                                        node: node,
                                        offset: offset,
                                        text: ''
                                    },
                                    done: false
                                };
                            }
                            child = child.nextSibling;
                            console.assert(state === 3);
                            state = 1;
                        }
                        return {
                            value: isLineStart,
                            done: true
                        };
                    }
                };
            }

            function getCaretPosition(contenteditable, textPosition) {
                var textOffset = 0;
                var lastNode = null;
                var lastOffset = 0;
                for (var i = positions(contenteditable), x = i.next(); !x.done; x = i.next()) {
                    var p = x.value;
                    if (p.text.length > textPosition - textOffset) {
                        return {
                            node: p.node,
                            offset: p.node.nodeType === Node.TEXT_NODE ? textPosition - textOffset : p.offset
                        };
                    }
                    textOffset += p.text.length;
                    lastNode = p.node;
                    lastOffset = p.node.nodeType === Node.TEXT_NODE ? p.text.length : p.offset;
                }
                return {
                    node: lastNode,
                    offset: lastOffset
                };
            }

            function getTextOffset(contenteditable, selectionNode, selectionOffset) {
                if (selectionNode == null) {
                    return null;
                }
                var textOffset = 0;
                for (var i = positions(contenteditable), x = i.next(); !x.done; x = i.next()) {
                    var p = x.value;
                    if (selectionNode.nodeType !== Node.TEXT_NODE && selectionNode === p.node && selectionOffset === p.offset) {
                        return textOffset;
                    }
                    if (selectionNode.nodeType === Node.TEXT_NODE && selectionNode === p.node) {
                        return textOffset + selectionOffset;
                    }
                    textOffset += p.text.length;
                }
                return compareCaretPositons(selectionNode, selectionOffset, contenteditable, 0) < 0 ? 0 : textOffset;
            }

            function getValue(contenteditable) {
                var value = '';
                for (var i = positions(contenteditable), x = i.next(); !x.done; x = i.next()) {
                    var p = x.value;
                    value += p.text;
                }
                return value;
            }

            function setSelectionRange(contenteditable, start, end) {
                var selection = window.getSelection();
                var s = getCaretPosition(contenteditable, start);
                var e = getCaretPosition(contenteditable, end);
                selection.setBaseAndExtent(s.node, s.offset, e.node, e.offset);
            }
            //TODO: Ctrl+A - rangeCount is 2
            function getSelectionDirection(contenteditable) {
                var selection = window.getSelection();
                var c = compareCaretPositons(selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset);
                return c < 0 ? 'forward' : 'none';
            }

            function getSelectionStart(contenteditable) {
                var selection = window.getSelection();
                var c = compareCaretPositons(selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset);
                return c < 0 ? getTextOffset(contenteditable, selection.anchorNode, selection.anchorOffset) : getTextOffset(contenteditable, selection.focusNode, selection.focusOffset);
            }

            function getSelectionEnd(contenteditable) {
                var selection = window.getSelection();
                var c = compareCaretPositons(selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset);
                return c < 0 ? getTextOffset(contenteditable, selection.focusNode, selection.focusOffset) : getTextOffset(contenteditable, selection.anchorNode, selection.anchorOffset);
            }

            function CustomInput() {
                return Reflect.construct(HTMLElement, [], CustomInput);
            }
            CustomInput.prototype = Object.create(HTMLElement.prototype);

            //class CustomInput extends HTMLElement {
            //  constructor() {
            // Always call super first in constructor
            //    super();
            //  }
            //}
            CustomInput.prototype.connectedCallback = function() {
                this.appendChild(document.createTextNode(''));
                this.setAttribute('role', 'textbox');
                this.tabIndex = 0; // to support spatial navigation polyfill
                this.setAttribute('contenteditable', 'true');

                var mo = new MutationObserver(function() {
                    if (!this.hasChildNodes()) {
                        // Firefox bug: https://stackoverflow.com/questions/16984287/why-text-align-right-doesnt-work-on-empty-contenteditable-element-in-firefox/16984412#16984412
                        this.appendChild(document.createTextNode(''));
                    }
                    if (this.childElementCount !== 0) {
                        var html = this.innerHTML;
                        window.setTimeout(function() {
                            throw new TypeError('element child: ' + html);
                        }, 0);
                    }
                }.bind(this));
                mo.observe(this, {
                    childList: true,
                    characterData: true,
                    subtree: false
                });
            };
            CustomInput.prototype.select = function() {
                //setSelectionRange(this, 0, 1/0); - "insertText" is not working in Firefox
                window.getSelection().selectAllChildren(this);
            };
            CustomInput.prototype.setSelectionRange = function(start, end) {
                setSelectionRange(this, start, end);
            };
            CustomInput.prototype.setRangeText = function(text) { // call only in fallback cases
                this.value = this.value.slice(0, this.selectionStart) + text + this.value.slice(this.selectionEnd);
            };
            Object.defineProperty(CustomInput.prototype, 'value', {
                get: function() {
                    return getValue(this);
                },
                set: function(value) {
                    //throw new TypeError('CustomInput#value is not settable, use document.execCommand("insertText", false, value) instead');
                    //TODO: multiline: <br /> or \n - ?
                    //TODO: remove - ?
                    while (this.firstElementChild != null) {
                        this.firstElementChild.remove();
                    }
                    this.firstChild.textContent = value;
                    while (this.firstChild.nextSibling != null) {
                        this.firstChild.nextSibling.remove();
                    }
                }
            });
            Object.defineProperty(CustomInput.prototype, 'selectionDirection', {
                get: function() {
                    return getSelectionDirection(this);
                }
            });
            Object.defineProperty(CustomInput.prototype, 'selectionStart', {
                get: function() {
                    return getSelectionStart(this);
                }
            });
            Object.defineProperty(CustomInput.prototype, 'selectionEnd', {
                get: function() {
                    return getSelectionEnd(this);
                }
            });
            Object.defineProperty(CustomInput.prototype, 'placeholder', {
                get: function() {
                    return this.getAttribute('aria-placeholder');
                },
                set: function(value) {
                    this.setAttribute('aria-placeholder', value);
                }
            });

            if (window.customElements != null) {
                //TODO: older Firefox versions (?)
                window.customElements.define('custom-input', CustomInput);
            }

            CustomInput.testables = {
                getValue: getValue,
                getSelectionEnd: getSelectionEnd,
                getSelectionStart: getSelectionStart
            };
            window.CustomInput = CustomInput;

        }());
    }

}
if (typeof BigInt !== 'undefined' &&
    typeof KeyframeEffect !== 'undefined' &&
    'composite' in KeyframeEffect.prototype &&
    typeof MathMLElement !== 'undefined') {
    main();
} else {
    var s = document.createElement('script');
    s.onload = s.onerror = function() {
        main();
    };
    s.src = (document.documentElement.getAttribute('data-root-path') || '/') + 'polyfills.js?20230404T194925Z';
    (document.head || document.documentElement || document.firstElementChild).appendChild(s);
}