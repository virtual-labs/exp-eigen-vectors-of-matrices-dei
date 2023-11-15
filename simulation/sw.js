/*jslint strict:global*/
/*global self, fetch, caches, Promise, Request, console*/
"use strict";

const CACHE_NAME_PREFIX = "en~";
const CACHE_NAME = "en~20230404T194925Z";
const URLS_TO_CACHE = "./i18n-en.json?20230404T194925Z;./mcss.css?20230404T194925Z;./mjs.js?20230404T194925Z;./mjs2.js?20230404T194925Z;./compiled.expression.js?20230404T194925Z;./polyfills.js?20230404T194925Z;./favicon.svg;./imgs/launcher.svg;./manifest.json;./;./slu.html;./det.html;./vectors.html";

if (self.skipWaiting == null) { //? 40 < Chrome < 42 - https://jakearchibald.github.io/isserviceworkerready/index.html#self.skipwaiting()
    self.skipWaiting = function() {};
}

self.oninstall = function(event) {
    console.log("install", CACHE_NAME);
    event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
        return Promise.all(URLS_TO_CACHE.split(";").map(function(url) {
            // cache - ?
            // cache: "no-cache" is not enought for my hostring (SiteGround), seems
            // same for cache: "no-store" and cache: "reload" !!!
            // so I am trying to use "version tag"
            const request = new Request(url, {
                cache: "no-cache"
            });

            // /index.html -> /symlinks/version/index.html
            // /ru/index.html -> /symlinks/version/ru/index.html
            // ...

            //const clone = request.clone();
            // it will load the same content twice :-(
            //const clone = url.indexOf("?") === -1 && (url.endsWith('.html') || url.endsWith('/')) ? new Request(url + "?" + version, request) : request.clone();

            const version = CACHE_NAME.slice(CACHE_NAME_PREFIX.length);
            //const pathname = new URL(normalizedURL, self.location.href).pathname;
            //const clone = new Request('/nocache.php?p=' + encodeURIComponent(pathname), request);
            // trying... SiteGround with "NGINX DIRECT DELIVERY" disabled

            const normalizedURL = url.endsWith('/') ? url + 'index.html' : url; // to have same "rules" as for other statis pages as slu.html, ...

            const clone = new Request(normalizedURL + (normalizedURL.endsWith('.html') ? '?' + version : ''), request);
            return fetch(clone).then(function(response) {
                if (response.status >= 200 && response.status <= 299 && response.type === "basic") {
                    if (!response.redirected) {
                        return cache.put(request, response);
                    } else {
                        console.warn('self.onfetch may not work well with redirected responses');
                    }
                }
                return Promise.reject(new Error());
            });
        })).then(function() {
            //TODO: https://redfin.engineering/how-to-fix-the-refresh-button-when-using-service-workers-a8e27af6df68
            self.skipWaiting(); //!
        });
    }));
};

self.onactivate = function(event) {
    console.log("activate", CACHE_NAME);
    event.waitUntil(caches.keys().then(function(cacheNames) {
        return Promise.all(cacheNames.map(function(cacheName) {
            if (cacheName.slice(0, CACHE_NAME_PREFIX.length) !== CACHE_NAME_PREFIX) {
                return undefined;
            }
            if (cacheName === CACHE_NAME) {
                return undefined;
            }
            return caches["delete"](cacheName);
        }));
    }));
};

self.onfetch = function(event) {
    const request = event.request;
    const requestURL = request.url;
    event.respondWith(caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(request).then(function(response) {
            if (response != undefined) {
                console.log("cache.match", CACHE_NAME, requestURL);
                return response;
            }
            return fetch(request.clone());
        });
    }));
};



const encodeURIComponentSafe = function(string) {
    //return encodeURIComponent(string.replace(/[\u{D800}-\u{DFFF}]/gu, '\uFFFD'));
    return encodeURIComponent(string.replace(/([^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1\uFFFD').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '\uFFFD'));
};
const stringify = function(object) {
    return Object.keys(object).map(function(key) {
        return key + '=' + encodeURIComponentSafe(object[key].toString());
    }).join('&');
};
const sent = {};
self.onerror = function(message, filename, lineno, colno, error) {
    const stack = error != undefined ? error.stack || "" : "";
    const data = stringify({
        messag: message || "",
        filename: filename || "",
        lineno: lineno || 0,
        colno: colno || 0,
        stack: stack
    });
    if (sent[data] == undefined) {
        sent[data] = data;
        fetch("https://matrixcalc.org/jserrors.php?error=1", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: data
        });
    }
};