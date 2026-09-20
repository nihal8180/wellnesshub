
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    role: {
      type: String,
      enum: [
        "super_admin",
        "admin",
        "editor",
        "contributor",
        "restricted",
      ],
      default: "editor",
    },

    active: {
      type: Boolean,
      default: true,
    },

    permissions: {
      manageVideos: {
        type: Boolean,
        default: false,
      },

      createArticles: {
        type: Boolean,
        default: false,
      },

      editArticles: {
        type: Boolean,
        default: false,
      },

      publishArticles: {
        type: Boolean,
        default: false,
      },

      deleteContent: {
        type: Boolean,
        default: false,
      },

      manageUsers: {
        type: Boolean,
        default: false,
      },

      manageSettings: {
        type: Boolean,
        default: false,
      },
    },

    lastLogin: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Automatically assign default permissions based on role
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  if (this.isNew || this.isModified("role")) {
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

    this.permissions = rolePermissions[this.role];
  }

  next();
});

// Compare password during login
userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive data from API responses
userSchema.methods.toJSON = function () {
  const obj = this.toObject();

  delete obj.password;
  delete obj.__v;

  return obj;
};

module.exports = mongoose.model("User", userSchema);