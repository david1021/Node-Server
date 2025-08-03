const http = require('http');
const url = require('url');
const querystring = require('querystring');

class Router {
  constructor() {
    this.middleware = [];
  }

  use(fn) {
    this.middleware.push(fn);
  }

  get(path, handler) {
    this.use(async (req, res, next) => {
      const parsedUrl = url.parse(req.url, true);
      if (req.method === 'GET' && parsedUrl.pathname === path) {
        await handler(req, res);
        await next();
      } else {
        await next();
      }
    });
  }

  post(path, handler) {
    this.use(async (req, res, next) => {
      const parsedUrl = url.parse(req.url, true);
      if (req.method === 'POST' && parsedUrl.pathname === path) {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          req.body = querystring.parse(body);
          await handler(req, res);
          await next();
        });
      } else {
        await next();
      }
    });
  }

  async handle(req, res) {
    let idx = 0;

    const next = async () => {
      if (idx >= this.middleware.length) return;

      const fn = this.middleware[idx++];
      await fn(req, res, next);
    };

    try {
      await next();
    } catch (err) {
      console.error(err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
}

// Instantiate Router
const router = new Router();

// Add middleware and routes to router
router.use(async (req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  await next();
});

router.get('/hello', async (req, res) => {
  res.end('Hello, world!');
});

router.post('/data', async (req, res) => {
  res.end(`Received data: ${JSON.stringify(req.body)}`);
});

router.use(async (req, res) => {
  res.statusCode = 404;
  res.end('Not Found');
});

// Create server
const server = http.createServer(async (req, res) => {
  await router.handle(req, res);
});

// Start server
server.listen(3000, () => {
  console.log('Server running on http://localhost:3000/');
});
