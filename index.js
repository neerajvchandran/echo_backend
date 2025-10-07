require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const User = require("./models/User");

const bodyParser = require("body-parser");
const expressLayouts = require("express-ejs-layouts");
const app = express();
app.use(expressLayouts);

const authRoutes = require("./routes/auth");
const feedRoutes = require("./routes/feed");
const peopleRoutes = require("./routes/people");

app.set("layout", "layout"); // views/layout.ejs

// Connect MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"));

app.use(express.static("public"));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  })
);
// Make currentUser available in all EJS templates
app.use(async (req, res, next) => {
  if (req.session.userId) {
    res.locals.currentUser = await User.findById(req.session.userId).lean();
  } else {
    res.locals.currentUser = null;
  }
  next();
});


// Routes
app.use("/", authRoutes);
app.use("/feed", feedRoutes);
app.use("/people", peopleRoutes);

// Landing page
app.get("/", (req, res) => {
  res.redirect("/people");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
