const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
// const cloudinary = require("cloudinary").v2;
const port = process.env.PORT || 5000;
// const fileUpload = require("express-fileupload");
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

async function run() {
  try {
    const userCollection = client.db("Morgen").collection("users");
    const productCollection = client.db("Morgen").collection("products");

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await userCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

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

    //get user role
    app.get("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;

      // console.log(email);

      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
    });

    //add product
    app.post("/products", verifyJWT, async (req, res) => {
      const product = req.body;
      try {
        const result = await productCollection.insertOne(product);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding product:", error);
        res.status(500).send({ error: "Failed to add product" });
      }
    });

    //get all product
    // app.get("/products", async (req, res) => {
    //   const products = await productCollection.find({}).toArray();
    //   res.send(products);
    // });

    //all product & filtering products
    app.get("/products", async (req, res) => {
      const {
        productName,
        brandName,
        minPrice,
        maxPrice,
        minHeight,
        maxHeight,
        minWidth,
        maxWidth,
        minDepth,
        maxDepth,
        category,
        subCategory,
        color,
      } = req.query;

      const filter = {};

      if (productName) {
        filter.productName = { $regex: productName, $options: "i" };
      }
      if (brandName) {
        filter.brandName = { $regex: brandName, $options: "i" };
      }
      if (minPrice || maxPrice) {
        filter.askingPrice = {};
        if (minPrice) filter.askingPrice.$gte = parseFloat(minPrice);
        if (maxPrice) filter.askingPrice.$lte = parseFloat(maxPrice);
      }
      if (minHeight || maxHeight) {
        filter.height = {};
        if (minHeight) filter.height.$gte = parseFloat(minHeight);
        if (maxHeight) filter.height.$lte = parseFloat(maxHeight);
      }
      if (minWidth || maxWidth) {
        filter.width = {};
        if (minWidth) filter.width.$gte = parseFloat(minWidth);
        if (maxWidth) filter.width.$lte = parseFloat(maxWidth);
      }
      if (minDepth || maxDepth) {
        filter.depth = {};
        if (minDepth) filter.depth.$gte = parseFloat(minDepth);
        if (maxDepth) filter.depth.$lte = parseFloat(maxDepth);
      }
      if (category) {
        filter.category = { $regex: category, $options: "i" };
      }
      if (subCategory) {
        filter.subCategory = { $regex: subCategory, $options: "i" };
      }

      if (color) {
        filter.utilities = {
          $elemMatch: { color: { $regex: color, $options: "i" } },
        };
      }

      try {
        const products = await productCollection.find(filter).toArray();

        const updatedProducts = products.map((product) => {
          const discountAmount = product.askingPrice * (product.discount / 100);
          const discountedPrice = product.askingPrice - discountAmount;
          return {
            ...product,
            discountedPrice: discountedPrice.toFixed(2),
          };
        });

        res.send(updatedProducts);
      } catch (err) {
        console.error("Error fetching products:", err);
        res.status(500).send({ error: "Failed to fetch products" });
      }
    });

    //get product by id
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const product = await productCollection.findOne(query);
      res.send(product);
    });

    //get related products
    app.get("/related-products", async (req, res) => {
      const { productName, category, subCategory, person, limit = 5 } = req.query;
    
      if (!productName && !category && !subCategory && !person) {
        return res.status(400).send({
          error:
            "At least one of productName, category, subCategory, or person must be provided to fetch related products.",
        });
      }
    
      try {
        const filter = [];
        if (category) {
          filter.push({ category: { $regex: category, $options: "i" } });
        }
        if (subCategory) {
          filter.push({ subCategory: { $regex: subCategory, $options: "i" } });
        }
        if (productName) {
          filter.push({ productName: { $ne: productName } });
        }
        if (person) {
          filter.push({ person: { $regex: person, $options: "i" } });
        }
    
        const query = filter.length > 1 ? { $and: filter } : filter[0] || {};
        const parseLimit = Math.max(1, parseInt(limit)); 
    
        const relatedProducts = await productCollection
          .find(query)
          .sort({ category: 1, subCategory: 1 }) 
          .limit(parseLimit) 
          .toArray();
          
        const updatedProducts = relatedProducts.map((product) => {
          const discountAmount = product.askingPrice * (product.discount / 100);
          const discountedPrice = product.askingPrice - discountAmount;
          return {
            ...product,
            discountedPrice: discountedPrice.toFixed(2),
          };
        });
    
        res.send(updatedProducts);
      } catch (err) {
        console.error("Error fetching related products:", err);
        res.status(500).send({ error: "Failed to fetch related products" });
      }
    });
    



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
