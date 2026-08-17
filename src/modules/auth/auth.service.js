const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const prisma = require("../../lib/prisma");

const { jwtSecret, jwtExpiresIn } = require("../../config/env");

const loginUser = async ({ name, password }) => {
  if (!name || !password) {
    const error = new Error("Name and password are required");
    error.statusCode = 400;
    throw error;
  }

  const user = await prisma.user.findFirst({
    where: { name },
  });

  if (!user) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  if (user.status !== "ACTIVE") {
    const error = new Error("User account is suspended");
    error.statusCode = 403;
    throw error;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    jwtSecret,
    {
      expiresIn: jwtExpiresIn,
    }
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      position: user.position,
      role: user.role,
      status: user.status,
    },
    token,
  };
};

module.exports = {
  loginUser,
};