import databaseInstance from './DatabaseModel.js';
import {hashPasswordPBKDF2, verifyPasswordPBKDF2} from '../utils/hashUtility.js';
import {v4 as uuidv4} from 'uuid';

class UserModel {

    constructor(){
    }
    
    //Public

    createSessionID(){
        const sessionID = v4();
        return sessionID;
    }

    getUserByID(){
    }

    getUserAttByID(){
    }

    async getAllUsers(){
        const users = await databaseInstance.getAllRecords('users');
        return users;
    }

    getCollections(){
        
    }

    async addUser(data){

        const hash_obj = hashPasswordPBKDF2(data.password);
        
        const hash = hash_obj.hash;
        const salt = hash_obj.salt;

        try {
            await databaseInstance.addRecord('untitled', {
                "username": data.username,
                "email": data.email,
                "password": hash,
                "salt": salt,
                "first_name": data.first_name,
                "last_name": data.last_name
            });
        }catch(error){
            console.error(`this is my add_record error message: ${error.message}`);
            throw new Error(`Throwing error to user route: ${error.message}`);
        }
    }
}

export default UserModel;