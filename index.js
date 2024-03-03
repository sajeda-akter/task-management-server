const express = require("express");
const app = express();
const cors = require("cors");
var jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_KEY);
const port = process.env.PORT || 5000;

const formData = require("form-data");
const Mailgun = require("mailgun.js");
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAIL_GUN_API_KEY,
});

// middleware
app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nvo4nkj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Forbidden Access" });
  }
  const token = req.headers.authorization.split(" ")[1];

  jwt.verify(token, process.env.DB_TOKEN_ACCESS, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const taskCollection = client.db("task_manage_db").collection("tasks");
    const userCollection = client.db("task_manage_db").collection("users");
    const paymentCollection = client
      .db("task_manage_db")
      .collection("payments");

    // auth api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.DB_TOKEN_ACCESS, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // users api
    app.post("/users", async (req, res) => {
      const users = req.body;
      const addUser = await userCollection.insertOne(users);
      res.send(addUser);
    });

    app.get("/users", verifyToken, async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { email: email };
      }
      const user = await userCollection.find(query).toArray();
      res.send(user);
    });

    app.get("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const data = await userCollection.findOne(query);
      res.send(data);
    });

    app.patch("/users/:id", async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const updateDoc = req.body;
      const updateBook = {
        $set: {
          user: updateDoc.user,
          photoURL: updateDoc.photoURL,
        },
      };

      const result = await userCollection.updateOne(filter, updateBook);
      res.send(result);
    });

    app.get(
      "/users/admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: "unauthorized access" });
        }
        const query = { email: email };
        const user = await userCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user?.role === "admin";
        }
        res.send({ admin });
      }
    );
    // task all api
    app.post("/task", async (req, res) => {
      const task = req.body;
      const addTask = await taskCollection.insertOne(task);
      res.send(addTask);
    });

    app.get("/task", verifyToken, verifyAdmin, async (req, res) => {
      const filter = req.query;
      const query = {};

      // asc and desc by date
      const options = {
        sort: {
          date: filter.sort === "asc" ? -1 : 1,
        },
      };
      const allTask = await taskCollection.find(query, options).toArray();
      res.send(allTask);
    });

    // specific data get by id
    app.get("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const dataBySpecific = await taskCollection.findOne(query);
      res.send(dataBySpecific);
    });

    app.delete("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const dataDelete = await taskCollection.deleteOne(query);
      res.send(dataDelete);
    });

    // update task complete info
    app.patch("/task/:id", async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const updateBook = {
        $set: {
          taskAction: "complete",
        },
      };
      const result = await taskCollection.updateOne(filter, updateBook);
      res.send(result);
    });

    // specific data get by email
    app.get("/tasks", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const specificData = await taskCollection.find(query).toArray();
      res.send(specificData);
    });

    // payment all api
    app.post("/create-payment-intent", async (req, res) => {
      const { salary } = req.body;
      const amount = parseInt(salary * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", async (req, res) => {
      const data = req.body;

      const query = { email: data.email, date: data.date };
      const exitPayments = await paymentCollection.findOne(query);

      if (exitPayments) {
        return res
          .status(400)
          .send({
            message: "Payment with the same email and date already exists",
          });
      }
      const payments = await paymentCollection.insertOne(data);
      // send user email about payment confirmation
      mg.messages
        .create(process.env.MAIL_SEND_DOMAIN_KEY, {
          from: "Mailgun Sandbox <postmaster@sandboxbdfffae822db40f6b0ccc96ae1cb28f3.mailgun.org>",
          to: ["pibixa1929@artgulin.com"],
          subject: "FinTask Company salary Confirmation",
          text: "Testing some Mailgun awesomness!",
          html: `
           <div>
             
             <h4>Your Transaction Id: <strong>${data.transactionId}</strong></h4>
          <p>Thank you</p>
             </div>
         `,
        })
        .then((msg) => console.log(msg)) // logs response data
        .catch((err) => console.log(err)); // logs any error`;

      res.send(payments);
    });

    app.get("/payment", verifyToken, async (req, res) => {
      const payments = await paymentCollection.find({}).toArray();
      res.send(payments);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to  task management app!");
});

app.listen(port, () => {
  console.log(`task management app listening on port ${port}`);
});
