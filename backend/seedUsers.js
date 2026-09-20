
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

const users = [
  {
    name: "Super Admin",
    email: "superadmin@wellnesshub.com",
    password: "ChangeThisSuperPassword123!",
    role: "super_admin",
    active: true,
  },
  {
    name: "Editorial User",
    email: "editor@wellnesshub.com",
    password: "ChangeThisEditorPassword123!",
    role: "editor",
    active: true,
  },
];

async function seedUsers() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MongoDB connection string not found in .env");
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");

    for (const userData of users) {
      const existingUser = await User.findOne({
        email: userData.email,
      });

      if (existingUser) {
        console.log(`User already exists: ${userData.email}`);
        continue;
      }

      await User.create(userData);
      console.log(`Created user: ${userData.email}`);
    }

    console.log("User seeding completed successfully");
  } catch (error) {
    console.error("Seeding error:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

seedUsers();