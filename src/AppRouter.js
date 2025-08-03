const http = require('http');
const { parse } = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class Router {
  constructor() {
    this.middleware_stack = [];
    this.errorHandlers = [];
    this.sessionStore = new Map();
  }

  route(path) {
    const self = this;
    return {
      get: (...fns) => (self.get(path, ...fns), this),
      post: (...fns) => (self.post(path, ...fns), this),
      put: (...fns) => (self.put(path, ...fns), this),
      delete: (...fns) => (self.delete(path, ...fns), this),
      patch: (...fns) => (self.patch(path, ...fns), this),
      head: (...fns) => (self.head(path, ...fns), this),
      options: (...fns) => (self.options(path, ...fns), this),
      all: (...fns) => (self.all(path, ...fns), this),
    };
  }

  use(path, ...fns) {
    if (typeof path === 'function') {
      fns.unshift(path);
      path = '/';
    }

    fns.forEach(fn => {
      if (fn.length === 4) {
        this.errorHandlers.push(fn);
        return;
      }

      const matcher = this._createMatcher(path);
      this.middleware_stack.push({ path, fn, matcher });
    });
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

  _register(method, path, handlers, parseBody = false) {
    const { matcher, keys } = this._createMatcher(path);
    handlers.forEach(handler => {
      this.use(path, async (req, res, next) => {
        const match = matcher(req.url);
        if ((method === null || req.method === method) && match) {
          req.params = keys.reduce((params, key, i) => {
            params[key] = match[i];
            return params;
          }, {});
          req.query = parse(req.url, true).query;

          try {
            if (parseBody) {
              let body = '';
              req.on('data', chunk => body += chunk);
              req.on('end', async () => {
                try {
                  req.body = JSON.parse(body || '{}');
                  await handler(req, res, next);
                } catch (e) {
                  next(e);
                }
              });
            } else {
              await handler(req, res, next);
            }
          } catch (err) {
            next(err);
          }
        } else {
          await next();
        }
      });
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
        const pathname = parse(url).pathname;
        const match = regex.exec(pathname);
        return match ? match.slice(1) : null;
      },
      keys
    };
  }

  async handle(req, res) {
    this._extendResponse(res);
    let index = 0;
    const next = async (err) => {
      if (err) return this._handleError(err, req, res, next);
      if (index >= this.middleware_stack.length) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      const { matcher, fn } = this.middleware_stack[index++];
      if (matcher(req.url)) {
        try {
          await fn(req, res, next);
        } catch (err) {
          await next(err);
        }
      } else {
        await next();
      }
    };
    await next();
  }

  async _handleError(err, req, res, next) {
    let index = 0;
    const nextError = async (error) => {
      const handler = this.errorHandlers[index++];
      if (!handler) {
        res.statusCode = 500;
        res.end('Unhandled Error: ' + error.message);
        return;
      }
      try {
        await handler(error, req, res, nextError);
      } catch (e) {
        await nextError(e);
      }
    };
    await nextError(err);
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
      origin: '*', methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
      headers: 'Content-Type,Authorization', credentials: false, exposeHeaders: '',
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

const app = new Router();
app.use(Router.logger());
app.use(Router.helmet());
app.use(Router.cors({ credentials: true }));
app.use(Router.session());
app.use(Router.rateLimit({ max: 100, windowMs: 60000 }));
app.use(Router.serveStatic(path.join(__dirname, 'public')));

app.route('/hello').get((req, res) => {
  res.send('Hello World');
});

const PORT = process.env.PORT || 5000;
http.createServer((req, res) => app.handle(req, res)).listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
