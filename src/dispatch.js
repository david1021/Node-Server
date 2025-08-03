const Todo = require("./controllers/todoController");
const Router = require("./Router");
const User = require("./models/User");

const dispatch = new Router();

dispatch.use(async (req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    await next();
});


dispatch.get('/users', async (req, res) => {
    let all_users = new User();
    let users = JSON.stringify(await all_users.get_all_users());
    res.end(`All Users: \n ${users}`);
});

dispatch.get('/login', async (req, res) => {
    res.end('login!');
});



dispatch.post('/signup', async (req, res) => {
    let new_user = new User();
    new_user.set_user(req.body.fname, req.body.lname, req.body.email, req.body.user, req.body.pass);
    res.end(`User Signed Up: ${JSON.stringify(new_user.last_name)}`);
});

module.exports = {dispatch};