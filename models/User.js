const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  otp: String,            // for storing current OTP
  otpExpiry: Date,         // OTP expiration timestamp
  otpVerified: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);
