const express = require('express')
const app = express()
const cors=require('cors')
var jwt = require('jsonwebtoken');
require('dotenv').config()
const port =process.env.PORT || 5000

// middleware
app.use(express.json())
app.use(cors())




const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nvo4nkj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


const verifyToken=(req,res,next)=>{
  console.log(req)
  next()
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const taskCollection=client.db('task_manage_db').collection('tasks')
    const userCollection=client.db('task_manage_db').collection('users')

    // auth api
    app.post('/jwt',async(req,res)=>{
      const user=req.body
      const token=jwt.sign(user,process.env.DB_TOKEN_ACCESS, { expiresIn: '1h' })
      res.send({token})
    })

    // users api 

    app.post('/users',async(req,res)=>{
      const users=req.body;
      const addUser=await userCollection.insertOne(users)
      res.send(addUser)
    })

    app.get('/users',async(req,res)=>{
      const email=req.query.email
      let query={}
      if(email){
        query={email:email}
      }
      const user=await userCollection.find(query).toArray()
      res.send(user)
    })

    app.patch('/users/:id',async(req,res)=>{
      const filter={_id:new ObjectId(req.params.id)}
      const updateDoc=req.body
      const updateBook={
        $set:{
          user:updateDoc.user,
          photoURL:updateDoc.photoURL
        }
      }
      console.log(updateDoc,updateBook)
      const result=await userCollection.updateOne(filter,updateBook)
      res.send(result)
    })
    
    app.get('/users/admin/:email',async(req,res)=>{
      const email=req.params.email
      const query={email:email}
      const user=await userCollection.findOne(query)
      let admin=false
      if(user){
        admin=user?.role ==='admin'
      }
      res.send({admin})

    })
    // task all api
    app.post('/task',async(req,res)=>{
      const task=req.body
      const addTask=await taskCollection.insertOne(task)
      res.send(addTask)
    })

    app.get('/task',async(req,res)=>{
      const filter=req.query;
      const query={}

      // asc and desc by date
      const options={
        sort:{
          date:filter.sort === 'asc'?  1:-1
        }
      }
      const allTask=await taskCollection.find(query,options).toArray()
      res.send(allTask)
    })

    // specific data get by id
    app.get('/task/:id',async(req,res)=>{
      const id=req.params.id;
      const query={_id:new ObjectId(id)}
      const dataBySpecific=await taskCollection.findOne(query)
      res.send(dataBySpecific)
    })

    // update task complete info
    app.patch('/task/:id',async(req,res)=>{
      const filter={_id:new ObjectId(req.params.id)}
      const updateBook={
        $set:{
          taskAction:'complete'
        }
      }
      const result=await taskCollection.updateOne(filter,updateBook)
      res.send(result)
    })

    // specific data get by email
    app.get('/tasks',async(req,res)=>{
      const email=req.query.email
      const query={email:email}
      const specificData=await taskCollection.find(query).toArray()
      res.send(specificData)
    
    })
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Welcome to  task management app!')
})

app.listen(port, () => {
  console.log(`task management app listening on port ${port}`)
})
