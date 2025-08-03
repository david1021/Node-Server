const Router = require("./Router");

// Require route files
const UsersRoute = require('./routes/users');

const dispatch = new Router();
dispatch.use('/users', UsersRoute);


/*
dispatch.post('/signup', async (req, res) => {
    let new_user = new User();
    new_user.set_user(req.body.fname, req.body.lname, req.body.email, req.body.user, req.body.pass);
    res.end(`User Signed Up: ${JSON.stringify(new_user.last_name)}`);
});
*/

module.exports = {dispatch}