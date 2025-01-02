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
    const couponCollection = client.db("Morgen").collection("coupons");

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

    //all product & filtering products
    app.get("/products", async (req, res) => {
      try {
        const { availability, color, price, size, typeOfProducts, sortPar } =
          req.query;

        console.log(sortPar);

        const query = {};

        if (availability?.length) {
          query.availability = {
            $in: availability
              .split(",")
              .map((item) => new RegExp(`^${item}$`, "i")),
          };
        }

        if (price) {
          const [min, max] = price.split("-").map(Number);
          query.askingPrice = { $gte: min, $lte: max };
        }

        if (size?.length) {
          query.size = {
            $in: size.split(",").map((item) => new RegExp(`^${item}$`, "i")),
          };
        }

        if (typeOfProducts) {
          const parsedTypeOfProducts = JSON.parse(typeOfProducts);
          const typeFilters = [];
          for (const gender in parsedTypeOfProducts) {
            for (const category in parsedTypeOfProducts[gender]) {
              for (const subCategory in parsedTypeOfProducts[gender][
                category
              ]) {
                if (parsedTypeOfProducts[gender][category][subCategory]) {
                  typeFilters.push({
                    person: new RegExp(`^${gender}$`, "i"),
                    category: new RegExp(`^${category}$`, "i"),
                    subCategory: new RegExp(`^${subCategory}$`, "i"),
                  });
                }
              }
            }
          }
          if (typeFilters.length) {
            query.$or = typeFilters;
          }
        }

        const sortCriteria = {};
        if (sortPar) {
          switch (sortPar) {
            case "featured":
              sortCriteria.featured = -1; //  "featured" is a ranking field
              break;
            case "bestSelling":
              sortCriteria.sales = -1; //  "sales" represents best-selling rank
              break;
            case "alphabeticallyAZ":
              sortCriteria.productName = 1; // Sort by name (A-Z)
              break;
            case "alphabeticallyZA":
              sortCriteria.productName = -1; // Sort by name (Z-A)
              break;
            case "priceLowToHigh":
              sortCriteria.askingPrice = 1; // Sort by price (low to high) //future work discount
              break;
            case "priceHighToLow":
              sortCriteria.askingPrice = -1; // Sort by price (high to low)
              break;
            case "dateOldToNew":
              sortCriteria.date = 1; // Sort by date (old to new)
              break;
            case "dateNewToOld":
              sortCriteria.date = -1; // Sort by date (new to old)
              break;
            default:
              break;
          }
        }

        const products = await productCollection
          .find(query)
          .sort(sortCriteria)
          .toArray();

        const filteredProducts = [];
        if (color?.length) {
          const colors = color.split(",").map((item) => item.toLowerCase());
          products.forEach((product) => {
            const matchedUtilities = product.utilities.filter((util) =>
              colors.includes(util.color.toLowerCase())
            );

            matchedUtilities.forEach((utility) => {
              const productCopy = { ...product };
              productCopy.utilities = [utility];
              filteredProducts.push(productCopy);
            });
          });
        } else {
          filteredProducts.push(...products);
        }

        res.send(filteredProducts);
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send({ message: "Error fetching products" });
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
      const {
        productName,
        category,
        subCategory,
        person,
        limit = 5,
      } = req.query;

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

    // get all products  admin with pagination, search, and filtering
    app.get("/admin/products", async (req, res) => {
      try {
        const {
          page = 1,
          limit = 10,
          search = "",
          person,
          category,
          subcategory,
        } = req.query;

        const pageNumber = parseInt(page);
        const pageSize = parseInt(limit);

        const query = {};
        if (search) {
          query.$or = [
            { productName: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }
        if (category) query.category = category;
        if (subcategory) query.subcategory = subcategory;
        if (person) query.person = person;

        const products = await productCollection
          .find(query)
          .skip((pageNumber - 1) * pageSize)
          .limit(pageSize)
          .toArray();

        const totalCount = await productCollection.countDocuments(query);

        res.send({
          success: true,
          products,
          pagination: {
            totalItems: totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
            currentPage: pageNumber,
            pageSize,
          },
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "An error occurred while fetching products.",
          error: error.message,
        });
      }
    });

    // admin product delete,update checkbox,update product
    app.put(
      "/admin/update-products",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const { products } = req.body;

          if (!products || !Array.isArray(products)) {
            return res
              .status(400)
              .json({ success: false, message: "Invalid data format." });
          }
          const bulkOps = products.map((product) => ({
            updateOne: {
              filter: { _id: new ObjectId(product._id) },
              update: {
                $set: {
                  show: product.show,
                  featured: product.featured,
                  discount: product.discount,
                  promote: product.promote,
                },
              },
            },
          }));

          const result = await productCollection.bulkWrite(bulkOps);

          res.json({
            success: true,
            message: "Products updated successfully.",
            modifiedCount: result.modifiedCount,
          });
        } catch (error) {
          console.error("Error updating products:", error);
          res
            .status(500)
            .json({ success: false, message: "Failed to update products." });
        }
      }
    );

    // admin delete product
    app.delete(
      "/admin/delete-product",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        try {
          const { productId } = req.body;
          const objectId = new ObjectId(productId);
          const result = await productCollection.deleteOne({ _id: objectId });
          if (result.deletedCount > 0) {
            res.json({
              success: true,
              message: "Product deleted successfully.",
            });
          } else {
            res
              .status(404)
              .json({ success: false, message: "Product not found." });
          }
        } catch (error) {
          console.error("Error deleting product:", error);
          res
            .status(500)
            .json({ success: false, message: "Failed to delete product." });
        }
      }
    );

    // admin edit product details
    app.put("/admin/product-details/:id", async (req, res) => {
      const productId = req.params.id;
      const {
        person,
        category,
        subCategory,
        productName,
        productDescription,
        askingPrice,
        height,
        width,
        depth,
        features,
        utilities,
      } = req.body;

      if (!ObjectId.isValid(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
      }

      try {
        const updatedProduct = {
          person,
          category,
          subCategory,
          productName,
          productDescription,
          askingPrice,
          height,
          width,
          depth,
          features,
          utilities,
        };

        const result = await productCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $set: updatedProduct }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Product not found" });
        }

        res.status(200).json({ message: "Product updated successfully" });
      } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    //------------------------------------ coupon section--------------------------------
    app.get("/coupons", async (req, res) => {
      try {
        const coupons = await couponCollection.find().toArray();
        res.json(coupons);
      } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).send("Error fetching coupons");
      }
    });

    app.post("/coupons", async (req, res) => {
      const { code, percentageDiscount, amountDiscount } = req.body;

      if (!code) return res.status(400).send("Coupon code is required");
      if (!percentageDiscount && !amountDiscount)
        return res.status(400).send("Provide a discount value");
      if (percentageDiscount && amountDiscount)
        return res.status(400).send("Provide only one type of discount");

      try {
        const existingCoupon = await couponCollection.findOne({ code });
        if (existingCoupon)
          return res.status(400).send("Coupon already exists");

        await couponCollection.insertOne({
          code,
          percentageDiscount: percentageDiscount || 0,
          amountDiscount: amountDiscount || 0,
        });
        res.status(201).send("Coupon added");
      } catch (error) {
        console.error("Error adding coupon:", error);
        res.status(500).send("Error adding coupon");
      }
    });

    app.delete("/coupons/:code", async (req, res) => {
      const { code } = req.params;

      try {
        const result = await couponCollection.deleteOne({ code });
        if (result.deletedCount === 0) {
          return res.status(404).send("Coupon not found");
        }
        res.send("Coupon removed");
      } catch (error) {
        console.error("Error removing coupon:", error);
        res.status(500).send("Error removing coupon");
      }
    });

    // -----------------------------------customers manage------------------------------
    app.get("/customers", async (req, res) => {
      try {
        const customers = await userCollection.find().toArray();
        customers.forEach((customer) => {
          if (customer.role != "user") {
            customers.splice(customers.indexOf(customer), 1);
          }
        });
        res.json(customers);
      } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).send("Error fetching customers");
      }
    });

    // -----------------------------------user profile manage------------------------------
    // update user profile
    app.put("/profile/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const user = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // Add a new address
    app.put("/profile/:id/address", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const newAddress = req.body;

      try {
        if (newAddress.default) {
          await userCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { "address.$[].default": false } }
          );
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { address: { ...newAddress, _id: new ObjectId() } } }
        );

        res.send({ message: "Address added successfully.", result });
      } catch (error) {
        res.status(500).send({ message: "Failed to add address.", error });
      }
    });

    //handle set default
    app.put("/profile/:id/address/default", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const { addressId } = req.body;

      try {
        await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { "address.$[].default": false } }
        );

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id), "address._id": new ObjectId(addressId) },
          { $set: { "address.$.default": true } }
        );

        res.send({ message: "Default address updated successfully.", result });
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to update default address.", error });
      }
    });

    // Delete an address
    app.delete(
      "/profile/:id/address/:addressId",
      verifyJWT,
      async (req, res) => {
        const { id, addressId } = req.params;

        try {
          const result = await userCollection.updateOne(
            { _id: new ObjectId(id) },
            { $pull: { address: { _id: new ObjectId(addressId) } } }
          );

          if (result.modifiedCount === 0) {
            return res
              .status(404)
              .send({ message: "Address not found or already deleted." });
          }

          res.send({ message: "Address deleted successfully.", result });
        } catch (error) {
          res.status(500).send({ message: "Failed to delete address.", error });
        }
      }
    );

    

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
