export { auth as proxy } from "@/auth";

export const config = { matcher: ["/agency/:path*", "/clients/:path*"] };
