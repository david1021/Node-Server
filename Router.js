import http from 'http';
import {URL} from 'url';
import path from 'path';
import fs from 'fs';
import * as crypto from 'crypto';

class Router {
  constructor() {
    this.middleware_stack = [];
    this.errorHandlers = [];
    this.sessionStore = new Map();
  }

  route(path) {
    const self = this;
    const routeObject = {
        get: (...fns) => {self.get(path, ...fns); return routeObject},
        post: (...fns) => {self.post(path, ...fns); return routeObject},
        put: (...fns) => {self.put(path, ...fns); return routeObject},
        delete: (...fns) => {self.delete(path, ...fns); return routeObject},
        patch: (...fns) => {self.patch(path, ...fns); return routeObject},
        head: (...fns) => {self.head(path, ...fns); return routeObject},
        options: (...fns) => {self.options(path, ...fns); return routeObject},
        all: (...fns) => {self.all(path, ...fns); return routeObject},
    };

    return routeObject;
    
  }

  get(path, ...handlers) {
    this._register('GET', path, handlers);
  }

  post(path, ...handlers) {
    this._register('POST', path, handlers, true);
  }

  put(path, ...handlers) {
    this._register('PUT', path, handlers, true);
  }

  delete(path, ...handlers) {
    this._register('DELETE', path, handlers);

  }

  patch(path, ...handlers) {
    this._register('PATCH', path, handlers, true);
  }

  head(path, ...handlers) {
    this._register('HEAD', path, handlers);
  }

  options(path, ...handlers) {
    this._register('OPTIONS', path, handlers);
  }

  all(path, ...handlers) {
    this._register(null, path, handlers);
  }

  _register(method, pathPattern, handlers, parseBody = false) {
    
    const { matcher, keys } = this._createMatcher(pathPattern);
    handlers.forEach(handler => {
      this.middleware_stack.push({
        method: method, // HTTP method (GET, POST, null for all)
        pathPattern: pathPattern, // Original path string (e.g., '/', '/:id')
        matcher: matcher,     // The function that uses regex.exec
        keys: keys,               // Captured parameter keys
        handler: handler,         // The actual user-provided handler
        parseBody: parseBody,     // Whether to parse body for this handler
        isRouter: false           // This is a direct route handler, not a mounted router
      });
    });
  }

  use(pathPrefix, ...fns) {
    if (typeof pathPrefix === 'function') {
      fns.unshift(pathPrefix);
      pathPrefix = '/'; // Default to '/' if no path specified
    }

    fns.forEach(fn => {
      if (fn.length === 4) { // Error handler
        this.errorHandlers.push(fn);
        return;
      }

      //console.log(fn.name);
      
      // If the function is another Router instance's handle method
      if (fn instanceof Router) { // Heuristic: check if it's a Router instance's handle
          // This is a mounted router
          const { matcher, keys } = this._createMatcher(pathPrefix);
          this.middleware_stack.push({
              method: null, // Applies to all methods
              pathPattern: pathPrefix, // The mount path, e.g., '/users'
              matcher: matcher, // Match the base path
              keys: keys, // No keys captured for the base mount path itself
              handler: fn.handle, // The sub-router's handle method
              parseBody: false, // Body parsing handled by the specific route handler
              isRouter: true
          });
      } else {
          // This is a regular middleware or a direct route handler being added via .use()
          // For .use(), the handler typically runs for any matching prefix, so we don't need method.
          const { matcher, keys } = this._createMatcher(pathPrefix);
          this.middleware_stack.push({
              method: null, // Applies to all methods
              pathPattern: pathPrefix,
              matcher: matcher,
              keys: keys,
              handler: fn,
              parseBody: false, // Middleware typically doesn't parse body here
              isRouter: false
          });
      }
    });
  }

  _createMatcher(path) {
    const keys = [];
    const pattern = path
      .split('/')
      .map(part => {
        if (part === '*') {
          keys.push('wildcard');
          return '(.*)';
        }
        if (part.startsWith(':')) {
          const key = part.replace(/^:/, '').replace(/\?$/, '');
          keys.push(key);
          return part.endsWith('?') ? '(?:/([^/]+))?' : '([^/]+)';
        }
        return part;
      })
      .join('/');
      
    const regex = new RegExp(`^${pattern}$`);
    return {
      matcher: url => {
        const match = regex.exec(url);
        return match ? match.slice(1) : null;
      },
      keys
    };
  }

  handle = (req, res) => {
    this._extendResponse(res);
    let index = 0;
    const dispatch = (err) => {
      if (err) return this._handleError(err, req, res, dispatch);
      // If no more middleware in this router's stack
      if (index >= this.middleware_stack.length) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      const layer = this.middleware_stack[index++];
      const { method, pathPattern, matcher, keys, handler, parseBody, isRouter } = layer;

      if(isRouter){
        if(req.url.startsWith(pathPattern)){
            let layerPath = req.url.substring(pathPattern.length);
            if(!layerPath){
                req.url = '/'
            }else{
                req.url = layerPath;
            }
            handler(req, res);
        }else{
            dispatch();
        }
      }else{
        const match = matcher(req.url);
        //console.log(match);
        if(match && (method === null || req.method === method)){

            try{
                req.params = keys.reduce((params, key, i) => {
                params[key] = match[i]; // 'matched' now contains the captured groups
                return params;
                }, {});

                console.log(req.params);

                // Ensure query parameters are parsed if they exist
                const queryStartIndex = req.url.indexOf('?');
                if (queryStartIndex !== -1) {
                    const queryString = req.url.substring(queryStartIndex + 1);
                    req.query = Object.fromEntries(new URLSearchParams(queryString).entries());
                } else {
                    req.query = {};
                }

                if(parseBody){

                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                    try {
                        req.body = JSON.parse(body || '{}');
                        handler(req, res, dispatch); // Pass dispatch as 'next'
                    } catch (e) {
                        dispatch(e);
                    }
                    });
                    
                }else {
                    handler(req, res, dispatch); // Pass dispatch as 'next'
                }
            } catch (e) {
                dispatch(e);
            }
        }else{
            dispatch();
        }
      }
    };
    dispatch(); // Start the middleware/route processing
  }
  

  _handleError(err, req, res, next) {
    let index = 0;
    const nextError = (error) => {
      const handler = this.errorHandlers[index++];
      if (!handler) {
        res.statusCode = 500;
        res.end('Unhandled Error: ' + error.message);
        return;
      }
      try {
        handler(error, req, res, nextError);
      } catch (e) {
        nextError(e);
      }
    };
    nextError(err);
  }

  _extendResponse(res) {
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };
    res.send = function (data) {
      if (typeof data === 'object') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      } else {
        res.setHeader('Content-Type', 'text/plain');
        res.end(data);
      }
    };
    res.json = function (obj) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(obj));
    };
    res.redirect = function (location, status = 302) {
      res.statusCode = status;
      res.setHeader('Location', location);
      res.end(`Redirecting to ${location}`);
    };
    res.cookie = function (name, value, options = {}) {
      const opts = Object.entries(options).map(([k, v]) => v === true ? k : `${k}=${v}`);
      const parts = [`${name}=${value}`, ...opts];
      const existing = res.getHeader('Set-Cookie') || [];
      const all = Array.isArray(existing) ? existing : [existing];
      res.setHeader('Set-Cookie', [...all, parts.join('; ')]);
    };
    res.setHeader = res.setHeader.bind(res);
    res.getHeader = res.getHeader ? res.getHeader.bind(res) : () => undefined;
  }

  static serveStatic(dirPath) {
    return (req, res, next) => {
      const parsedUrl = parse(req.url).pathname;
      const safePath = path.normalize(parsedUrl).replace(/^\/+/,'');
      const filePath = path.join(dirPath, safePath);
      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) return next();
        const ext = path.extname(filePath).slice(1);
        const mimeTypes = {
          html: 'text/html', css: 'text/css', js: 'application/javascript',
          json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
          jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', txt: 'text/plain',
        };
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      });
    };
  }

  static cors(options = {}) {
    const defaults = {
      origin: '*',
      methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
      headers: 'Content-Type,Authorization',
      credentials: false,
      exposeHeaders: '',
    };
    const config = { ...defaults, ...options };
    return (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', config.origin);
      res.setHeader('Access-Control-Allow-Methods', config.methods);
      res.setHeader('Access-Control-Allow-Headers', config.headers);
      if (config.credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
      if (config.exposeHeaders) res.setHeader('Access-Control-Expose-Headers', config.exposeHeaders);
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
      } else {
        next();
      }
    };
  }

  static rateLimit({ windowMs = 60000, max = 60 } = {}) {
    const hits = new Map();
    return (req, res, next) => {
      const now = Date.now();
      const ip = req.connection.remoteAddress;
      if (!hits.has(ip)) hits.set(ip, []);
      const timestamps = hits.get(ip);
      while (timestamps.length && timestamps[0] <= now - windowMs) timestamps.shift();
      if (timestamps.length >= max) {
        res.statusCode = 429;
        return res.end('Too Many Requests');
      }
      timestamps.push(now);
      next();
    };
  }

  static logger() {
    return (req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
      });
      next();
    };
  }

  static session() {
    const sessions = new Map();
    return (req, res, next) => {
      const cookieHeader = req.headers.cookie || '';
      const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
      let sid = cookies.sid;
      if (!sid || !sessions.has(sid)) {
        sid = crypto.randomBytes(16).toString('hex');
        sessions.set(sid, {});
        res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly`);
      }
      req.session = sessions.get(sid);
      next();
    };
  }

  static helmet() {
    return (req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    };
  }

  static render(filePath, data = {}) {
    let html = fs.readFileSync(filePath, 'utf8');
    for (const key in data) {
      html = html.replace(new RegExp(`{{\s*${key}\s*}}`, 'g'), data[key]);
    }
    return html;
  }
}

export default Router;