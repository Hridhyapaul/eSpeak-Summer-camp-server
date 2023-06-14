const express = require('express')
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }

    const token = authorization.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    });
}

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
        const reviewsCollection = client.db("eSpeakDB").collection("review");
        const paymentsCollection = client.db("eSpeakDB").collection("payments");
        // const enrolledCollection = client.db("eSpeakDB").collection("enrolledClass");

        // JWT API

        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'Admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }

        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'Instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }

        // Get all courses by sorting...

        app.get('/courses', async (req, res) => {
            const result = await courseCollection.find().sort({ enrolled_students: -1 }).toArray()
            res.send(result)
        })

        // Get all courses....

        app.get('/manageCourses', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await courseCollection.find().toArray()
            res.send(result)
        })

        // Get courses by email....

        app.get('/instructorCourse', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.query.email
            const query = { instructor_email: email };
            const result = await courseCollection.find(query).toArray();
            res.send(result)
        })

        // Posting new courses by instructor...

        app.post('/courses', async (req, res) => {
            const query = req.body
            const result = await courseCollection.insertOne(query)
            res.send(result)
        })

        // Update full details of course....

        app.put('/updateCourse/:id', verifyJWT, verifyInstructor, async (req, res) => {
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

        // update course status.....

        app.patch('/courses/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateStatus = req.body;
            const updateDoc = {
                $set: {
                    status: updateStatus.status
                }
            };
            const result = await courseCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        // update feedback status.....

        app.patch('/courses/:id/feedback', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const { feedback } = req.body;
            const updateDoc = {
                $set: {
                    feedback: feedback
                }
            };
            const result = await courseCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        // User collection related api....

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist' })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)
        })

        // getting users whose role only instructor and finding their number of classes and name of classes...

        app.get('/users/instructors', async (req, res) => {

            const query = { role: 'Instructor' };
            const instructors = await usersCollection.find(query).toArray();

            const result = await Promise.all(instructors.map(async (instructor) => {
                const coursesQuery = { instructor_email: instructor.email };
                const courses = await courseCollection.find(coursesQuery).toArray();

                return {
                    ...instructor,
                    coursesCount: courses.length,
                    courses: courses.map((course) => course.title),
                };
            }));

            res.send(result);
        });

        // finding user email is admin or not....

        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'Admin' }
            res.send(result);
        })

        // finding user email is Instructor or not....

        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'Instructor' }
            res.send(result);
        })

        // finding user email is student or not....

        app.get('/users/student/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ student: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { student: user?.role === 'Student' }
            res.send(result);
        })

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateRole = req.body;
            const updateDoc = {
                $set: {
                    role: updateRole.role
                }
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        // Cart Collection related api....

        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email
            if (!email) {
                res.send([])
            }

            const decodedEmail = req.decoded?.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const query = { student_email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const item = req.body;
            console.log(item)
            const result = await cartCollection.insertOne(item)
            res.send(result)
        })

        app.delete('/carts/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        // Payment intent api...

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ["card"]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            })
        })

        app.post('/payments', verifyJWT, async (req, res) => {
            // Payment saved to the database....
            const payments = req.body;
            const insertResult = await paymentsCollection.insertOne(payments)

            const query = { _id: { $in: payments.cartItems_id.map(id => new ObjectId(id)) } }
            const deleteResult = await cartCollection.deleteMany(query)

            const updateCourseQuery = { _id: { $in: payments.course_id.map(id => new ObjectId(id)) } };
            const updateCourseOptions = { $inc: { enrolled_students: 1, available_seats: -1 } };
            const updateCourseResult = await courseCollection.updateMany(updateCourseQuery, updateCourseOptions);

            res.send({ insertResult, deleteResult, updateCourseResult })
        })

        app.get('/payments', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const sort = { date: -1 };
            const result = await paymentsCollection.find(query).sort(sort).toArray();
            res.send(result);
        })

        // finding Enrolled course apis

        app.get('/enrolledCourse', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const payments = await paymentsCollection.find(query).toArray();

            // Extract course_ids from payments
            const courseIds = payments.map(payment => payment.course_id).flat().map(id => new ObjectId(id));

            // // Find courses matching the course_ids
            const courses = await courseCollection.find({ _id: { $in: courseIds } }).toArray();
            res.send(courses)
        })

        // Review collection

        app.get('/review', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            res.send(result)
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