import AuthService from "@repo/services/auth";
import PasskeyService from "@repo/services/passkey";
import UserService from "@repo/services/user";

export const authService = new AuthService();

export const passkeyService = new PasskeyService();

export const userService = new UserService();
