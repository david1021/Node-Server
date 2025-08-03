#!/usr/bin/env nodejs
import http from 'http';
import Router from './Router.js';
import database from './models/DatabaseModel.js';
import {UsersRouter} from './routes/users.js';

const app = new Router();

//mounted routes
app.use('/users', UsersRouter);

async function startServer(){
    try{
        await database.connect();
        server.listen(PORT, () => {
            console.log(`Server running on port: ${PORT}`);
        });
    } catch (error) {
        console.error('Application: FATAL ERROR during startup! Unable to proceed.');
        console.error('Error details:', error.message);
        process.exit(1);
    }
}

//app.use(() => {return 'this is my new function'});

const PORT = process.env.PORT || 5000;

const server = http.createServer( (req, res) => {
  try {
    app.handle(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.end('Internal Server Error');
    console.error('Server error:', err);
  }
});

startServer();

process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down gracefully...');
    try {
        await database.close();
        console.log('MongoDB connection closed on app termination.');
        process.exit(0);
    } catch (error) {
        console.error('Error closing MongoDB connection:', error.message);
        process.exit(1);
    }
});

