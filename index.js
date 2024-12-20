const express = require("express");
const app = express();
// const cloudinary = require("cloudinary").v2;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
// const fileUpload = require("express-fileupload");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
app.use(cors());
app.use(express.json());

// app.use(
//   fileUpload({
//     useTempFiles: true,
//     tempFileDir: "/tmp/",
//   })
// );
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nxaiqcz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const uuid = function () {
  return Date.now() + "_" + Math.random().toString(36).substr(2, 9);
};


function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
//   secure: true,
// });

async function run() {
  try {
    const userCollection = client.db("Morgen").collection("users");

    //user input
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      console.log(result);
      res.send({ result, token });
    });

    // //image upload
    // app.post("/uploadImage", async (req, res) => {
    //   try {
    //     const { file } = req?.files;

    //     console.log(file, "get the fiel", uuid());
    //     if (file) {
    //       await cloudinary.uploader.upload(
    //         file.tempFilePath,
    //         {
    //           resource_type: "image",
    //           public_id:
    //             "Mahbub_Turza/Images/" + file?.name.split(".")[0] + uuid(),
    //           overwrite: true,
    //         },
    //         function (error, result) {
    //           if (result) {
    //             res.json({ url: result.url });
    //           }
    //           if (error) {
    //             res.status(400).json({ error });
    //           }
    //           console.log({ result, error });
    //         }
    //       );
    //     }
    //   } catch (e) {
    //     console.log(e);
    //     res.status(400).json({ error: "could not upload image" });
    //   }
    // });

    // app.post("/video", async (req, res) => {
    //   console.log("the file", req.files.video);
    //   const file = req.files?.video;
    //   let url;
    //   if (file) {
    //     await cloudinary.uploader.upload(
    //       file.tempFilePath,
    //       {
    //         resource_type: "video",
    //         public_id: "Mahbub_Turza/Videos/" + file.name.split(".")[0],
    //         overwrite: true,
    //       },
    //       function (error, result) {
    //         if (result) {
    //           url = result.url;
    //         }
    //         console.log(result, error);
    //       }
    //     );
    //   }
    //   res.json({ url });
    // });

  } finally {
  }
}
run().catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.send("Ny Morgen server is running");
});

app.listen(port, () => {
  console.log(`Ny Morgen is running on port ${port}`);
});
