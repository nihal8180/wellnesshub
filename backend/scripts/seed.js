require("dotenv").config({
  path: require("path").join(__dirname, "../.env"),
});

const mongoose = require("mongoose");
const User = require("../models/User");

async function seedAdmin() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in .env");
    }

    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      throw new Error(
        "ADMIN_EMAIL or ADMIN_PASSWORD is missing in .env"
      );
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Connected to MongoDB");

    const email = process.env.ADMIN_EMAIL.toLowerCase().trim();

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      console.log(`Admin already exists: ${email}`);
      return;
    }

    await User.create({
      email,
      password: process.env.ADMIN_PASSWORD,
      name: "Admin",
      role: "super_admin",
      active: true,
    });

    console.log(`Super admin created successfully: ${email}`);
  } catch (error) {
    console.error("Seed error:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB connection closed");
  }
}

seedAdmin();