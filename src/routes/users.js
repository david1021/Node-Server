import UserModel from '../models/UserModel.js';
import Router from '../Router.js';
const router = new Router();

router.route('/').get( async (req, res) => {
    let allUsers = new UserModel();
    allUsers = await allUsers.getAllUsers();
    if(allUsers.length < 1){
        res.end(`No users`);
    }else{
        console.log(allUsers);
        allUsers = JSON.stringify(allUsers);
        res.end(`All Users: \n ${allUsers}`);
    }
}).post( async (req, res) => {
    try {
        let um = new UserModel();
        let user = req.body;
        await um.add_user(user);
        res.end(`New User Added`);
    } catch(error){
        console.error(`this is my user route error message: ${error.message}`)
    }
});

router.route('/:id').get( async (req, res) => {
    let allUsers = new UserModel();
    allUsers = await allUsers.getAllUsers();
    if(allUsers.length < 1){
        res.end(`No users`);
    }else{
        console.log(allUsers);
        allUsers = JSON.stringify(allUsers);
        res.end(`All Users: \n ${allUsers}`);
    }
});

export {router as UsersRouter};
