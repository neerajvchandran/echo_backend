const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Post = require("../models/Post");

/* Helper token/session */
function extractToken(req) {
  const auth = (req.headers.authorization || "").trim();
  if (auth.startsWith("Bearer ")) return auth.replace("Bearer ", "").trim();
  if (req.session && req.session.userId) return req.session.userId.toString();
  return null;
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  const user = await User.findById(token);
  if (!user)
    return res.status(401).json({ error: "Invalid token / user not found" });
  req.currentUser = user;
  next();
}

/* GET /api/people (paginated list) */
router.get("/", async (req, res) => {
  try {
    const perPage = parseInt(req.query.perPage) || 10;
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / perPage);

    const usersRaw = await User.find()
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();

    const users = usersRaw.map((u) => ({
      id: u._id.toString(),
      username: u.username,
      email: u.email, // remove if you don't want to expose emails
      followersCount: (u.followers || []).length,
      followingCount: (u.following || []).length,
    }));

    const currentUserId = extractToken(req);

    res.json({
      ok: true,
      users,
      currentPage: page,
      totalPages,
      perPage,
      currentUser: currentUserId ? currentUserId.toString() : null,
    });
  } catch (err) {
    console.error("People list error:", err);
    res
      .status(500)
      .json({ error: "Something went wrong while fetching users." });
  }
});

/* GET /api/people/:id (profile + posts) */
router.get("/:id", async (req, res) => {
  try {
    const currentUserId = extractToken(req);
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const postsRaw = await Post.find({ authorId: user._id })
      .sort({ createdAt: -1 })
      .lean();

    const posts = postsRaw.map((p) => ({
      id: p._id.toString(),
      content: p.content,
      authorId: p.authorId.toString(),
      likes: (p.likes || []).map((id) => id.toString()),
      edited: !!p.edited,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    let isFollowing = false;
    if (currentUserId) {
      const followerIds = (user.followers || []).map((f) => f.toString());
      isFollowing = followerIds.includes(currentUserId.toString());
    }

    res.json({
      ok: true,
      user: {
        id: user._id.toString(),
        username: user.username,
        followersCount: (user.followers || []).length,
        followingCount: (user.following || []).length,
      },
      posts,
      isFollowing,
      currentUser: currentUserId ? currentUserId.toString() : null,
    });
  } catch (err) {
    console.error("Profile error:", err);
    res
      .status(500)
      .json({ error: "Something went wrong while loading profile." });
  }
});

/* POST /api/people/:id/follow (follow user) */
router.post("/:id/follow", requireAuth, async (req, res) => {
  try {
    const userToFollow = await User.findById(req.params.id);
    if (!userToFollow)
      return res.status(404).json({ error: "User to follow not found" });

    const currentUser = await User.findById(req.currentUser._id);

    if (currentUser._id.toString() === userToFollow._id.toString())
      return res.status(400).json({ error: "You cannot follow yourself" });

    const alreadyFollowing = (currentUser.following || [])
      .map((f) => f.toString())
      .includes(userToFollow._id.toString());

    if (!alreadyFollowing) {
      currentUser.following.push(userToFollow._id);
      userToFollow.followers.push(currentUser._id);
      await currentUser.save();
      await userToFollow.save();
    }

    return res.json({
      ok: true,
      message: alreadyFollowing ? "Already following" : "Followed",
      isFollowing: true,
      followersCount: (userToFollow.followers || []).length,
    });
  } catch (err) {
    console.error("Follow error:", err);
    res
      .status(500)
      .json({ error: "Something went wrong while following the user." });
  }
});

module.exports = router;
