const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Post = require("../models/Post");

// List all people
router.get("/", async (req, res) => {
  const currentUserId = req.session.userId || null;
  const perPage = 1;
  const page = parseInt(req.query.page) || 1;

  const totalUsers = await User.countDocuments();
  const totalPages = Math.ceil(totalUsers / perPage);

  const users = await User.find()
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  res.render("people", {
    users,
    currentUser: currentUserId,
    currentPage: page,
    totalPages,
  });
});

// Profile page
router.get("/:id", async (req, res) => {
  const currentUserId = req.session.userId || null;
  const user = await User.findById(req.params.id).lean();
  const posts = await Post.find({ authorId: user._id })
    .sort({ createdAt: -1 })
    .lean();

  let isFollowing = false;
  if (currentUserId) {
    // Convert ObjectIds to strings before comparison
    const followerIds = user.followers.map((f) => f.toString());
    isFollowing = followerIds.includes(currentUserId.toString());
  }

  res.render("profile", {
    user,
    posts,
    currentUser: currentUserId,
    isFollowing,
  });
});

// Follow user
router.post("/:id/follow", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  const userToFollow = await User.findById(req.params.id);
  const currentUser = await User.findById(req.session.userId);

  // Compare as strings
  if (
    !currentUser.following
      .map((f) => f.toString())
      .includes(userToFollow._id.toString())
  ) {
    currentUser.following.push(userToFollow._id);
    userToFollow.followers.push(currentUser._id);
    await currentUser.save();
    await userToFollow.save();
  }

  res.redirect(`/people/${userToFollow._id}`);
});

module.exports = router;
