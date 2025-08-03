// ... (imports and other Router class methods) ...

class Router {
  // ... (constructor, route, use, get, post, etc. methods) ...

  handle = (req, res, outerNext) => { // Added outerNext parameter for chainability
    this._extendResponse(res);
    let index = 0;

    // This 'next' function now explicitly controls the iteration through THIS router's middleware_stack
    const next = (err) => {
      if (err) return this._handleError(err, req, res, outerNext || next); // Pass error or self-next
      
      if (index >= this.middleware_stack.length) {
        // If this router has no more middleware, and it's the top-level router, 404
        if (!outerNext) { // This means it's the top-level app.handle
          res.statusCode = 404;
          res.end('Not Found');
        } else {
          // This means it's a sub-router that didn't match.
          // We need to pass control back to the outer router/app
          outerNext();
        }
        return;
      }

      const { path: routePathPattern, fn } = this.middleware_stack[index++];
      
      // Crucial: Create a temporary URL object to get the pathname without query
      const parsedReqUrl = new URL(req.url, 'http://localhost').pathname; // Base URL is dummy, just to parse pathname
      
      const { matchFunc, keys } = this._createMatcher(routePathPattern);

      // IMPORTANT: Adjust the path being matched for mounted routers
      // If this router is mounted at a path (e.g., '/users'),
      // the `req.url` coming in might be '/users/123'.
      // We need to match it against '/users' first, and then
      // give the sub-router '/123'.

      // Determine the *effective* path for this layer to match
      let effectivePathForMatch = parsedReqUrl;
      let matchedBase = null; // Will store the part of req.url that matched this router's base path

      // This logic is tricky. A simple approach for mounting is to make `use` more powerful.
      // If `fn` is another router's handle, we need to adjust `req.url` before calling it.
      // Let's refine the logic for 'use' and 'handle'
      
      // Let's store the matcher and the original path in the middleware_stack
      // This part is the core issue for sub-routers.
      // A route's handler should only be called if its *path* matches.
      // For app.use('/users', UsersRouter.handle),
      // the matcher for '/users' needs to match the start of req.url.
      // If it matches, then UsersRouter.handle is called, and its req.url needs to be rebased.

      // We need to distinguish between 'middleware' that applies to all subpaths (like app.use('/prefix', router.handle))
      // and specific 'route handlers' like router.get('/path', handler).

      // ---- REVISED LOGIC FOR handle() AND _register() ----
      // To correctly handle mounted routers like Express, the `handle` method needs to work with a `routeLayer` concept.
      // The `middleware_stack` should contain objects that store the matcher, the handler, AND if it's a sub-router.

      // Let's restructure how handlers are stored slightly for clarity
      // and how matching happens.

      // --- New Plan ---
      // 1. `middleware_stack` will store `{ pathPattern, matcher, keys, handler, isRouter, method }`
      // 2. `handle` will iterate and call `matcher` with `req.url`.
      // 3. If `isRouter` is true, the `req.url` passed to `handler` (which is the sub-router's handle) is `req.url.substring(basePath.length)`

      // Refactor _register and use
    };

    next();
  }

  // ... rest of the Router class ...

  // REVISED _register method
  _register(method, pathPattern, handlers, parseBody = false) {
    const { matchFunc, keys } = this._createMatcher(pathPattern);
    handlers.forEach(handler => {
      this.middleware_stack.push({
        method: method, // HTTP method (GET, POST, null for all)
        pathPattern: pathPattern, // Original path string (e.g., '/', '/:id')
        matchFunc: matchFunc,     // The function that uses regex.exec
        keys: keys,               // Captured parameter keys
        handler: handler,         // The actual user-provided handler
        parseBody: parseBody,     // Whether to parse body for this handler
        isRouter: false           // This is a direct route handler, not a mounted router
      });
    });
  }

  // REVISED use method
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
      
      // If the function is another Router instance's handle method
      if (fn.name === 'handle' && fn.prototype instanceof Router) { // Heuristic: check if it's a Router instance's handle
          // This is a mounted router
          this.middleware_stack.push({
              method: null, // Applies to all methods
              pathPattern: pathPrefix, // The mount path, e.g., '/users'
              matchFunc: this._createMatcher(pathPrefix).matchFunc, // Match the base path
              keys: [], // No keys captured for the base mount path itself
              handler: fn, // The sub-router's handle method
              parseBody: false, // Body parsing handled by the specific route handler
              isRouter: true
          });
      } else {
          // This is a regular middleware or a direct route handler being added via .use()
          // For .use(), the handler typically runs for any matching prefix, so we don't need method.
          const { matchFunc, keys } = this._createMatcher(pathPrefix);
          this.middleware_stack.push({
              method: null, // Applies to all methods
              pathPattern: pathPrefix,
              matchFunc: matchFunc,
              keys: keys,
              handler: fn,
              parseBody: false, // Middleware typically doesn't parse body here
              isRouter: false
          });
      }
    });
  }

  // REVISED handle method - this is the most critical change
  handle = (req, res, outerNext) => { // Added outerNext to allow chaining from parent routers
    this._extendResponse(res);
    let index = 0;

    const dispatch = (err) => {
      if (err) return this._handleError(err, req, res, outerNext || dispatch);

      // If no more middleware in this router's stack
      if (index >= this.middleware_stack.length) {
        if (outerNext) {
          // If this is a sub-router, pass control back to the parent router's next()
          return outerNext();
        } else {
          // If this is the top-level app, it's a 404
          res.statusCode = 404;
          return res.end('Not Found');
        }
      }

      const layer = this.middleware_stack[index++];
      const { method, pathPattern, matchFunc, keys, handler, parseBody, isRouter } = layer;

      // Extract pathname without query string for matching
      const reqPathname = new URL(req.url, 'http://dummy.com').pathname; // Dummy base URL to parse
      
      // Perform the match
      const matched = matchFunc(reqPathname); // Match against the request's full pathname

      // Check if this layer matches and is the correct method
      if (matched && (method === null || req.method === method)) {
        if (isRouter) {
          // This is a mounted router (e.g., UsersRouter.handle)
          // We need to rebase the URL for the sub-router
          const originalUrl = req.url; // Save original URL
          const originalPathname = reqPathname; // Save original pathname

          // The 'matched' array for a mounted router will be empty or contain captured wildcards.
          // The critical part is determining the prefix length that matched this router's base.
          // For example, if pathPattern is '/users' and reqPathname is '/users/123'.
          // We need to strip '/users' from req.url.

          // This simple substring works because the router's base path is explicitly defined in app.use('/prefix', ...)
          // And matchFunc for app.use will match this exact prefix.
          let basePathLength = pathPattern.length;
          if (pathPattern === '/') basePathLength = 0; // Don't strip '/' if router is mounted at root

          const newReqUrl = originalUrl.substring(basePathLength);
          const newReqPathname = originalPathname.substring(basePathLength);
          
          // If the new path is empty, make it '/' to correctly match router.route('/')
          req.url = newReqUrl === '' ? '/' : newReqUrl;
          
          // Temporarily set req.baseUrl to facilitate the sub-router knowing its mount point
          // (This is common in Express, though your router might not use it internally)
          // req.baseUrl = (req.baseUrl || '') + pathPattern; // Accumulate base URL if nested

          // Call the sub-router's handle, passing our own dispatch (this router's 'next')
          // as its 'outerNext'. This ensures control returns to *this* router's stack
          // if the sub-router doesn't find a match.
          handler(req, res, dispatch); // Pass dispatch as the next function for the sub-router
                                      // The sub-router will call dispatch if it doesn't match or calls its own next()
          
          // IMPORTANT: Do NOT call dispatch() here. The sub-router's handler is expected to
          // either send a response, call its own `next()` (which is our `dispatch`),
          // or call its error handler. T/he control flow is passed to the sub-router.

        } else {
          // This is a regular route handler or middleware
          req.params = keys.reduce((params, key, i) => {
            params[key] = matched[i]; // 'matched' now contains the captured groups
            return params;
          }, {});
          
          // Ensure query parameters are parsed if they exist
          const queryStartIndex = req.url.indexOf('?');
          if (queryStartIndex !== -1) {
              const queryString = req.url.substring(queryStartIndex + 1);
              req.query = Object.fromEntries(new URLSearchParams(queryString).entries());
          } else {
              req.query = {};
          }

          try {
            if (parseBody) {
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
            } else {
              handler(req, res, dispatch); // Pass dispatch as 'next'
            }
          } catch (err) {
            dispatch(err); // Pass errors to the next middleware/error handler
          }
          // Again, the handler is expected to either send a response or call dispatch() (next)
        }
      } else {
        // This layer did not match, so try the next one in the stack
        dispatch();
      }
    };

    dispatch(); // Start the middleware/route processing
  }
}