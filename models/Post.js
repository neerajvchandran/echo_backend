const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: { type: String, required: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    edited: { type: Boolean, default: false },
  },
  { timestamps: true }
); // ✅ adds createdAt and updatedAt automatically

module.exports = mongoose.model("Post", postSchema);
