require("dotenv").config();

const mongoose = require("mongoose");
const User = require("./models/User");

const rolePermissions = {
  super_admin: {
    manageVideos: true,
    createArticles: true,
    editArticles: true,
    publishArticles: true,
    deleteContent: true,
    manageUsers: true,
    manageSettings: true,
  },

  admin: {
    manageVideos: true,
    createArticles: true,
    editArticles: true,
    publishArticles: true,
    deleteContent: false,
    manageUsers: false,
    manageSettings: true,
  },

  editor: {
    manageVideos: true,
    createArticles: true,
    editArticles: true,
    publishArticles: true,
    deleteContent: false,
    manageUsers: false,
    manageSettings: true,
  },

  contributor: {
    manageVideos: false,
    createArticles: true,
    editArticles: true,
    publishArticles: false,
    deleteContent: false,
    manageUsers: false,
    manageSettings: false,
  },

  restricted: {
    manageVideos: false,
    createArticles: false,
    editArticles: false,
    publishArticles: false,
    deleteContent: false,
    manageUsers: false,
    manageSettings: false,
  },
};

async function refreshPermissions() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MongoDB connection string not found in .env");
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");

    for (const [role, permissions] of Object.entries(rolePermissions)) {
      const result = await User.updateMany(
        { role },
        { $set: { permissions } }
      );

      console.log(
        `${role}: ${result.modifiedCount} user(s) updated`
      );
    }

    console.log("Permissions refreshed successfully");
  } catch (error) {
    console.error("Error refreshing permissions:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

refreshPermissions();