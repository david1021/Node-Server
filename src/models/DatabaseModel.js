import {MongoClient, ObjectId} from 'mongodb';

class DatabaseModel {

    constructor(){
        this.uri = "mongodb+srv://daguilar5:Baseball14@serverlessinstance1.95oou.mongodb.net/?retryWrites=true&w=majority";
        this.client = new MongoClient(this.uri);
        this.dbName = 'development';
        DatabaseModel.instance = this;
    }

    async connect(){

        try {
            await this.client.connect();
            console.log('MongoDB connected successfully!');
        } catch(error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }  
    }

    async close(){

        try {
            await this.client.close();
            console.log('MongoDB connection closed.');
        } catch(error){
            throw new Error(`Database closure failed: ${error.message}`);
        }
    }

    _getDB(){
        return this.client.db(this.dbName);
    }

    async _getCollection(colName){

        const db = this._getDB();
        try{
            const isCollection = await db.listCollections({ name: colName }).toArray();
            if(isCollection) throw new Error(`MongoDB Error: Collection '${colName}' does not exist.`);
            const collection = await db.collection(colName);
            if(!collection) throw new Error(`MongoDB Error: Collection '${colName}' does not exist.`);
            return collection;
        }catch(error){
            console.error(`Error getting collection '${colName}': `, error.message);
        }
    }

    async getAllRecords(col){
        
        try {
            const collection = this._getCollection(col);
            const collectionArray = await collection.find({}).toArray();
            return collectionArray;
        }catch(error){
            console.error(`Error getting all records from '${col}': `, error.message);
        }
    }

    async getRecordByID(col, idString){
    
        try {
            const collection = this._getCollection(col);
            const objectId = new ObjectId(idString);
            const record = await collection.findOne({ _id: objectId });
            return record;
        }catch(error){
            console.error(`Error getting record from '${col}': `, error.message);
        }
    }

    async addRecord(col, data){

        const collection = this._getCollection(col);
        try {
            const resultOne = await collection.insertOne(data);
            console.log(`A document was inserted with the _id: ${resultOne.insertedId}`);
            return resultOne.insertedId;
        }catch(error){
            console.error(`Error inserting document into collection '${col}': `, error.message);
            throw new Error(`throwing error to add_user function: ${error.message}`);
        }
    }

}

const databaseInstance = new DatabaseModel();
export default databaseInstance;