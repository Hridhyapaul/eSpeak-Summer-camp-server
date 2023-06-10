const express = require('express')
const app = express()
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gfisnkk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const courseCollection = client.db("eSpeakDB").collection("courses");
        const cartCollection = client.db("eSpeakDB").collection("carts");
        const usersCollection = client.db("eSpeakDB").collection("users");

        app.get('/courses', async (req, res) => {
            const result = await courseCollection.find().sort({ available_seats: -1 }).toArray()
            res.send(result)
        })

        app.get('/instructorCourse', async (req, res) => {
            const email = req.query.email
            const query = { instructor_email: email };
            const result = await courseCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/courses', async (req, res) => {
            const query = req.body
            const result = await courseCollection.insertOne(query)
            res.send(result)
        })

        app.put('/updateCourse/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateCourse = req.body;
            const courses = {
                $set: {
                    title: updateCourse.title,
                    image: updateCourse.image,
                    price: updateCourse.price,
                    duration: updateCourse.duration,
                    available_seats: updateCourse.available_seats,
                    modules: updateCourse.modules,
                    instructor_name: updateCourse.instructor_name,
                    instructor_email: updateCourse.instructor_email,
                    category: updateCourse.category,
                    description: updateCourse.description,
                    status: updateCourse.status,
                    feedback: updateCourse.feedback
                },
            }
            const result = await courseCollection.updateOne(filter, courses, options)
            res.send(result);
        })

        // User collection related api....

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { instructor_email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist' })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        // Cart Collection related api....

        app.get('/carts', async (req, res) => {
            const email = req.query.email
            if (!email) {
                res.send([])
            }
            const query = { instructor_email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const item = req.body;
            console.log(item)
            const result = await cartCollection.insertOne(item)
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('eSpeak is Running...')
})

app.listen(port, () => {
    console.log(`eSpeak is listening on port ${port}`)
})