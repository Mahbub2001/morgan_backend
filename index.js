const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const moment = require("moment");
// const cloudinary = require("cloudinary").v2;
const port = process.env.PORT || 5000;
// const fileUpload = require("express-fileupload");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded());

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
    const transactionCollection = client
      .db("Morgen")
      .collection("transactions");
    const ordersCollection = client.db("Morgen").collection("orders");
    const reviewCollection = client.db("Morgen").collection("reviews");
    const adminSettingsCollection = client.db("Morgen").collection("settings");

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
      product.sales = 0;
      product.createdAt = new Date();
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
                  if (subCategory.toLowerCase() === "all") {
                    typeFilters.push({
                      person: new RegExp(`^${gender}$`, "i"),
                      category: new RegExp(`^${category}$`, "i"),
                    });
                  } else {
                    typeFilters.push({
                      person: new RegExp(`^${gender}$`, "i"),
                      category: new RegExp(`^${category}$`, "i"),
                      subCategory: new RegExp(`^${subCategory}$`, "i"),
                    });
                  }
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

    // -----------------------------------transactions manage------------------------------
    app.post("/create-payment", async (req, res) => {
      const paymentInfo = req.body;

      const trxId = new ObjectId().toString();

      const initiateData = {
        store_id: process.env.STORE_ID,
        store_passwd: process.env.STORE_PASSWORD,
        total_amount: paymentInfo.totalAmount,
        currency: "BDT",
        tran_id: trxId,
        success_url: `${process.env.SERVER_URL}/success-payment`,
        fail_url: `${process.env.SERVER_URL}/fail-payment`,
        cancel_url: `${process.env.SERVER_URL}/cancel-payment`,
        cus_name: "Customer Name",
        cus_email: "cust@yahoo.com",
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: 1000,
        cus_country: "Bangladesh",
        cus_phone: "01711111111",
        cus_fax: "01711111111",
        shipping_method: "NO",
        product_name: "Laptop",
        product_category: "Laptop",
        product_profile: "general",
        // ship_name: "Customer Name",
        // ship_add1: "Dhaka",
        // ship_add2: "Dhaka",
        // ship_city: "Dhaka",
        // ship_state: "Dhaka",
        // ship_postcode: 1000,
        // ship_country: "Bangladesh",
        multi_card_name: "mastercard,visacard,amexcard",
        value_a: "ref001_A",
        value_b: "ref002_B",
        value_c: "ref003_C",
        value_d: "ref004_D",
      };

      const response = await axios({
        method: "POST",
        url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
        data: initiateData,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const saveData = {
        cus_name: "dummy",
        paymentId: trxId,
        amount: paymentInfo.totalAmount,
        status: "pending",
      };

      const save = await transactionCollection.insertOne(saveData);

      if (save) {
        res.send({
          paymentUrl: response.data.GatewayPageURL,
        });
      }
    });

    app.post("/success-payment", async (req, res) => {
      const successData = req.body;

      if (successData.status !== "valid") {
        throw new Error("Payment failed");
      }

      // update the database

      const query = {
        paymentId: successData.tran_id,
      };

      const update = {
        $set: {
          status: "success",
          // transactionId: successData.bank_tran_id,
        },
      };

      const updateData = await transactionCollection.updateOne(query, update);

      console.log("successData", successData);
      console.log("updateDate", updateData);

      res.redirect(`${process.env.CLIENT_URL}/success_payment`);
    });

    app.post("/fail-payment", async (req, res) => {
      res.redirect(`${process.env.CLIENT_URL}/fail_payment`);
    });
    app.post("/cancel-payment", async (req, res) => {
      res.redirect(`${process.env.CLIENT_URL}/cancel_payment`);
    });

    async function generateOrderId() {
      try {
        const lastOrder = await ordersCollection
          .find()
          .sort({ orderId: -1 })
          .limit(1)
          .toArray();

        let orderCounter = 0;

        if (lastOrder.length > 0) {
          const lastOrderId = lastOrder[0].orderId;
          const lastOrderIdParts = lastOrderId.split("-");
          orderCounter = parseInt(lastOrderIdParts[2], 10);
        }
        orderCounter++;
        const prefix = "NYMORGEN";
        const date = new Date();
        const dateString = `${date.getFullYear()}${String(
          date.getMonth() + 1
        ).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;

        return `${prefix}-${dateString}-${String(orderCounter).padStart(
          5,
          "0"
        )}`;
      } catch (error) {
        console.error("Error generating Order ID:", error);
        return null;
      }
    }
    app.post("/orders", verifyJWT, async (req, res) => {
      try {
        const transaction = {
          email: req.body.email,
          address: req.body.address,
          city: req.body.city,
          userid: req.body.userid,
          country: req.body.country,
          phone_number: req.body.phone_number,
          totalPrice: req.body.totalPrice,
          postcode: req.body.postcode,
          totalPriceWithOutDiscount: req.body.totalPriceWithOutDiscount,
          firstName: req.body.firstName,
          currency: req.body.currency,
          currencyRate: req.body.currencyRate,
          total_with_payment_method: req.body.total_with_payment_method,
          lastName: req.body.lastName,
          paymentMethod: req.body.paymentMethod,
          coupon: req.body.coupon ? req.body.coupon : null,
          products: req.body.products,
          status: "pending",
          createdAt: new Date(),
        };
        let totalMainAmount = 0;

        for (const item of req.body.products) {
          const { id, color, quantity } = item;
          const product = await productCollection.findOne({
            _id: new ObjectId(id),
          });
          if (product) {
            totalMainAmount += product.mainPrice * quantity;
          }
        }
        transaction.totalMainAmount = totalMainAmount;

        // Verify product stock
        for (const item of req.body.products) {
          const { id, color, quantity } = item;

          const product = await productCollection.findOne({
            _id: new ObjectId(id),
            "utilities.color": color,
          });

          if (!product) {
            return res.status(400).json({
              success: false,
              message: `Product with id ${id} and color ${color} not found`,
            });
          }

          const utility = product.utilities.find(
            (util) => util.color === color
          );

          if (!utility || utility.numberOfProducts < quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for product with id ${id} and color ${color}`,
            });
          }
        }

        const orderResult = await transactionCollection.insertOne(transaction);
        for (const item of req.body.products) {
          const { id, color, quantity } = item;

          await productCollection.updateOne(
            {
              _id: new ObjectId(id),
              "utilities.color": color,
            },
            {
              $inc: { "utilities.$.numberOfProducts": -quantity },
            }
          );
        }
        const ordId = await generateOrderId();
        const order = {
          tran_id: orderResult.insertedId,
          status: "pending",
          orderId: ordId,
          userId: req.body.userid,
          customer_email: req.body.email,
          customer_firstName: req.body.firstName,
          customer_lastName: req.body.lastName,
          totalPriceWithOutDiscount: req.body.totalPriceWithOutDiscount,
          currency: req.body.currency,
          currencyRate: req.body.currencyRate,
          total_with_payment_method: req.body.total_with_payment_method,
          products: req.body.products,
          createdAt: new Date(),
          totalPrice: req.body.totalPrice,
          coupon: req.body.coupon ? req.body.coupon : null,
          totalMainAmount: totalMainAmount,
        };

        const ordered = await ordersCollection.insertOne(order);

        res.status(201).json({
          success: true,
          message: "Order placed successfully",
          orderId: orderResult.insertedId,
        });
      } catch (error) {
        // console.error("Error placing order:", error);
        res.status(500).json({ message: "Failed to place order", error });
      }
    });

    // get orders by user id
    app.get("/orders/:id", verifyJWT, async (req, res) => {
      try {
        const userId = req.params.id;
        if (!userId) {
          return res
            .status(400)
            .json({ success: false, message: "User ID is required." });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { userId: userId };
        const totalOrders = await ordersCollection.countDocuments(query);
        const orders = await ordersCollection
          .find(query)
          .skip(skip)
          .limit(limit)
          .toArray();

        if (orders.length === 0) {
          return res.status(404).json({
            success: false,
            message: "No orders found for this user.",
          });
        }

        res.json({
          success: true,
          data: orders,
          pagination: {
            totalOrders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            limit,
          },
        });
      } catch (error) {
        console.error("Error fetching orders:", error);
        res
          .status(500)
          .json({ success: false, message: "Error fetching orders" });
      }
    });

    // cancel order by order id
    app.put("/orders/:id", verifyJWT, async (req, res) => {
      try {
        const orderId = req.params.id;

        const order = await ordersCollection.findOne({
          _id: new ObjectId(orderId),
        });
        if (!order) {
          return res
            .status(404)
            .json({ success: false, message: "Order not found" });
        }
        if (order.status === "cancelled") {
          return res
            .status(400)
            .json({ success: false, message: "Order already cancelled" });
        }
        if (order.status === "delivered") {
          return res
            .status(400)
            .json({ success: false, message: "Cannot cancel delivered order" });
        }
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(orderId) },
          { $set: { status: "cancelled" } }
        );

        const transaction = await transactionCollection.findOne({
          _id: order.tran_id,
        });
        if (transaction) {
          await transactionCollection.updateOne(
            { _id: order.tran_id },
            { $set: { status: "cancelled" } }
          );
        }

        for (const item of req.body.products) {
          const { id, color, quantity } = item;

          await productCollection.updateOne(
            {
              _id: new ObjectId(id),
              "utilities.color": color,
            },
            {
              $inc: { "utilities.$.numberOfProducts": +quantity },
            }
          );
        }

        res.json({
          success: true,
          message: "Order cancelled successfully",
          result,
        });
      } catch (error) {
        console.error("Error cancelling order:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to cancel order" });
      }
    });

    // get all orders for admin
    app.get("/admin/orders", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const {
          page = 1,
          limit = 10,
          search = "",
          sort = "createdAt",
          order = "desc",
        } = req.query;

        const pageNumber = parseInt(page, 10);
        const limitNumber = parseInt(limit, 10);

        const searchQuery = search
          ? { orderId: { $regex: search, $options: "i" } }
          : {};

        const sortOption = { [sort]: order === "desc" ? -1 : 1 };
        const orders = await ordersCollection
          .find(searchQuery)
          .sort(sortOption)
          .skip((pageNumber - 1) * limitNumber)
          .limit(limitNumber)
          .toArray();

        const totalOrders = await ordersCollection.countDocuments(searchQuery);

        res.json({
          orders,
          totalOrders,
          totalPages: Math.ceil(totalOrders / limitNumber),
          currentPage: pageNumber,
        });
      } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send("Error fetching orders");
      }
    });

    app.put(
      "/admin/orders/bulk-update",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const { updates } = req.body;

        // console.log("updates", updates);
        // return;

        if (!updates || !Array.isArray(updates)) {
          return res.status(400).json({ message: "Invalid updates format." });
        }

        try {
          const bulkOrderOperations = [];
          const bulkTransactionOperations = [];
          const productUpdates = {};

          for (const update of updates) {
            const { id, status, products, tran_id } = update;

            bulkOrderOperations.push({
              updateOne: {
                filter: { _id: new ObjectId(id) },
                update: { $set: { status } },
              },
            });

            bulkTransactionOperations.push({
              updateOne: {
                filter: { _id: new ObjectId(tran_id) },
                update: { $set: { status } },
              },
            });

            if (status === "canceled") {
              for (const item of products) {
                const { id, color, quantity } = item;

                await productCollection.updateOne(
                  {
                    _id: new ObjectId(id),
                    "utilities.color": color,
                  },
                  {
                    $inc: { "utilities.$.numberOfProducts": +quantity },
                  }
                );
              }
            }
          }

          if (bulkOrderOperations.length > 0) {
            await ordersCollection.bulkWrite(bulkOrderOperations);
          }
          if (bulkTransactionOperations.length > 0) {
            await transactionCollection.bulkWrite(bulkTransactionOperations);
          }

          res.json({ message: "Order statuses updated successfully." });
        } catch (error) {
          console.error("Error updating order statuses:", error);
          res.status(500).json({ message: "Error updating order statuses." });
        }
      }
    );

    // get user eligibility of a person
    app.post("/eligible_reviews", async (req, res) => {
      const { pageData, email } = req.body;

      try {
        const user = await userCollection.findOne({ email: email });
        if (!user) {
          return res.status(200).json({
            eligible: false,
            message: "User is not eligible to review this product",
          });
        }
        const userId = user._id.toString();
        // console.log("User ID:", userId);
        // console.log("Page Data:", pageData);
        const orders = await ordersCollection
          .find({
            userId: userId,
            status: "received",
          })
          .toArray();
        const isEligible = orders.some((order) =>
          order.products.some(
            (product) =>
              product.id === pageData.allData._id &&
              product.color === pageData.utility.color
          )
        );

        if (isEligible) {
          return res.status(200).json({
            eligible: true,
            message: "User is eligible to review this product",
          });
        } else {
          return res.status(200).json({
            eligible: false,
            message: "No matching orders found for review eligibility",
          });
        }
      } catch (error) {
        console.error("Error checking review eligibility:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    });

    // Add a review
    app.post("/add_reviews", verifyJWT, async (req, res) => {
      const review = req.body;
      review.createdAt = new Date();
      try {
        const result = await reviewCollection.insertOne(review);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding review:", error);
        res.status(500).send({ error: "Failed to add review" });
      }
    });

    // Get all reviews of a product by product id & color
    app.get("/reviews/:productId", async (req, res) => {
      const { productId } = req.params;
      const { color, limit = 5, offset = 0 } = req.query;

      if (!productId || !color) {
        return res
          .status(400)
          .json({ error: "Product ID and color are required" });
      }

      try {
        const aggregation = [
          { $match: { productId: productId, color: color } },
          {
            $facet: {
              metadata: [
                {
                  $group: {
                    _id: null,
                    averageRating: { $avg: "$rating" },
                    totalRatings: { $sum: 1 },
                    oneStar: {
                      $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] },
                    },
                    twoStar: {
                      $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] },
                    },
                    threeStar: {
                      $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] },
                    },
                    fourStar: {
                      $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] },
                    },
                    fiveStar: {
                      $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] },
                    },
                  },
                },
              ],
              reviews: [
                // { $sort: { createdAt: -1 } },
                { $skip: parseInt(offset) },
                { $limit: parseInt(limit) },
              ],
            },
          },
        ];

        const result = await reviewCollection.aggregate(aggregation).toArray();

        const metadata = result[0]?.metadata[0] || {
          averageRating: 0,
          totalRatings: 0,
          oneStar: 0,
          twoStar: 0,
          threeStar: 0,
          fourStar: 0,
          fiveStar: 0,
        };

        const reviews = result[0]?.reviews || [];

        res.status(200).json({
          averageRating: metadata.averageRating.toFixed(2),
          totalRatings: metadata.totalRatings,
          oneStar: metadata.oneStar,
          twoStar: metadata.twoStar,
          threeStar: metadata.threeStar,
          fourStar: metadata.fourStar,
          fiveStar: metadata.fiveStar,
          reviews,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
      }
    });

    app.get("/admin/settings", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const settings = await adminSettingsCollection.findOne({});
        res.json(settings);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch settings" });
      }
    });

    app.put("/admin/settings", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const { _id, ...newSettings } = req.body;
        await adminSettingsCollection.updateOne(
          {},
          { $set: newSettings },
          { upsert: true }
        );
        res.status(200).json({ message: "Settings updated successfully" });
      } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).json({ error: "Failed to update settings" });
      }
    });

    // fetch all customers: admin
    app.get("/admin/customers", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const { page = 1, limit = 10, name = "", id = "" } = req.query;

        const pageNumber = parseInt(page, 10);
        const limitNumber = parseInt(limit, 10);

        const filter = {};
        if (name) {
          const regex = { $regex: name, $options: "i" };
          filter.$or = [{ firstName: regex }, { lastName: regex }];
        }
        if (id) {
          const regex = { $regex: id, $options: "i" };
          filter.$expr = {
            $regexMatch: {
              input: { $toString: "$_id" },
              regex: id,
              options: "i",
            },
          };
        }

        const customers = await userCollection
          .find(filter)
          .skip((pageNumber - 1) * limitNumber)
          .limit(limitNumber)
          .toArray();

        const totalCustomers = await userCollection.countDocuments(filter);
        res.json({
          customers,
          totalCustomers,
          totalPages: Math.ceil(totalCustomers / limitNumber),
          currentPage: pageNumber,
        });
      } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).send("Error fetching customers");
      }
    });

    // top sales 5 products
    app.get("/top-sales", async (req, res) => {
      try {
        const productCollection = client.db("Morgen").collection("products");

        const topProducts = await productCollection
          .find({})
          .sort({ sales: -1 })
          .limit(5)
          .toArray();

        res.status(200).json(topProducts);
      } catch (error) {
        console.error("Error retrieving top products:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/settings", async (req, res) => {
      try {
        const settings = await adminSettingsCollection.findOne({});
        res.json(settings);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch settings" });
      }
    });

    // fetch promoted products by ids
    app.get("/promoted-products", async (req, res) => {
      try {
        const { ids } = req.query;

        if (!ids) {
          return res.status(400).json({ error: "No product IDs provided." });
        }

        const productIds = ids.split(",").map((id) => id.trim());

        const promotedProducts = await productCollection
          .find({ _id: { $in: productIds.map((id) => new ObjectId(id)) } })
          .toArray();

        res.json(promotedProducts);
      } catch (error) {
        console.error("Error fetching promoted products:", error);
        res.status(500).send("Error fetching promoted products");
      }
    });

    app.get("/chart-data", async (req, res) => {
      const { timeframe } = req.query;

      let startDate;
      if (timeframe === "7days") {
        startDate = moment().subtract(6, "days").startOf("day").toDate();
      } else if (timeframe === "1month") {
        startDate = moment().subtract(29, "days").startOf("day").toDate();
      } else if (timeframe === "6months") {
        startDate = moment().subtract(5, "months").startOf("month").toDate();
      } else {
        return res.status(400).json({ error: "Invalid timeframe" });
      }

      const currentDate = new Date();

      const productsAdded = await productCollection
        .aggregate([
          {
            $match: {
              createdAt: { $gte: startDate, $lte: currentDate },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: timeframe === "6months" ? "%Y-%m" : "%Y-%m-%d",
                  date: "$createdAt",
                },
              },
              count: { $sum: 1 },
            },
          },
          {
            $sort: { _id: 1 },
          },
        ])
        .toArray();

      const sales = await ordersCollection
        .aggregate([
          {
            $match: {
              createdAt: { $gte: startDate, $lte: currentDate },
              status: "received",
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: timeframe === "6months" ? "%Y-%m" : "%Y-%m-%d",
                  date: "$createdAt",
                },
              },
              count: { $sum: 1 },
            },
          },
          {
            $sort: { _id: 1 },
          },
        ])
        .toArray();

      const dates = [];
      const productsData = [];
      const salesData = [];

      for (
        let date = moment(startDate);
        date <= moment(currentDate);
        date.add(1, timeframe === "6months" ? "month" : "day")
      ) {
        const formattedDate =
          timeframe === "6months"
            ? date.format("YYYY-MM")
            : date.format("YYYY-MM-DD");
        dates.push(formattedDate);

        const productEntry = productsAdded.find(
          (item) => item._id === formattedDate
        );
        const salesEntry = sales.find((item) => item._id === formattedDate);

        productsData.push(productEntry ? productEntry.count : 0);
        salesData.push(salesEntry ? salesEntry.count : 0);
      }

      res.json({
        categories: dates,
        series: [
          { name: "Products Added", data: productsData },
          { name: "Sales", data: salesData },
        ],
      });
    });

    // pie chart
    app.get("/pie-chart-data", async (req, res) => {
      try {
        await client.connect();
        const pipeline = [
          {
            $facet: {
              personData: [{ $group: { _id: "$person", count: { $sum: 1 } } }],
              categoryData: [
                { $group: { _id: "$category", count: { $sum: 1 } } },
              ],
              subCategoryData: [
                { $group: { _id: "$subCategory", count: { $sum: 1 } } },
              ],
            },
          },
        ];

        const result = await productCollection.aggregate(pipeline).toArray();
        const data = result[0];

        res.json({
          personData: data.personData,
          categoryData: data.categoryData,
          subCategoryData: data.subCategoryData,
        });
      } catch (error) {
        console.error(error);
      }
    });

    // pie chart of sales
    const countOccurrences = (data, field) => {
      return data.reduce((acc, item) => {
        const key = item[field];
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    };

    // pie chart
    app.get("/pie-chart-sales", async (req, res) => {
      try {
        const orders = await ordersCollection
          .find({ status: "received" })
          .toArray();
        const productIds = orders.flatMap((order) =>
          order.products.map((p) => new ObjectId(p.id))
        );
        const products = await productCollection
          .find({ _id: { $in: productIds } })
          .toArray();

        const personCount = countOccurrences(products, "person");
        const categoryCount = countOccurrences(products, "category");
        const subCategoryCount = countOccurrences(products, "subCategory");
        const formatData = (data) =>
          Object.entries(data).map(([key, value]) => ({
            _id: key,
            count: value,
          }));

        res.json({
          personData: formatData(personCount),
          categoryData: formatData(categoryCount),
          subCategoryData: formatData(subCategoryCount),
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    // last 5 orders
    app.get("/last-five-orders", async (req, res) => {
      try {
        const lastFiveOrders = await ordersCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray();
        res.status(200).json(lastFiveOrders);
      } catch (error) {
        console.error("Error fetching last five orders:", error);
      }
    });

    // get number of sales by admin
    app.get("/total-sales", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await ordersCollection
          .aggregate([
            { $match: { status: "received" } },
            { $unwind: "$products" },
            {
              $group: {
                _id: null,
                totalSales: { $sum: "$products.quantity" },
              },
            },
            {
              $project: {
                _id: 0,
                totalSales: 1,
              },
            },
          ])
          .toArray();

        res.json({ totalSales: result[0]?.totalSales || 0 });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/order-stats", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await ordersCollection
          .aggregate([
            {
              $match: { status: "received" },
            },
            {
              $group: {
                _id: null,
                totalMainAmount: { $sum: "$totalMainAmount" },
                totalPrice: { $sum: "$totalPrice" },
              },
            },
            {
              $project: {
                _id: 0,
                totalMainAmount: 1,
                totalPrice: 1,
                profit: { $subtract: ["$totalPrice", "$totalMainAmount"] },
              },
            },
          ])
          .toArray();

        if (result.length > 0) {
          res.json(result[0]);
        } else {
          res.json({
            totalMainAmount: 0,
            totalPrice: 0,
            profit: 0,
          });
        }
      } catch (error) {
        console.error("Error fetching order stats:", error);
        res.status(500).json({ error: "Internal Server Error" });
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
