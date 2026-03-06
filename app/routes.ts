import {
  type RouteConfig,
  route,
  layout,
  index,
} from "@react-router/dev/routes";

export default [
  // Auth routes
  route("login", "routes/_auth.login.tsx"),
  route("logout", "routes/_auth.logout.tsx"),

  // GV Layout (인증 필요)
  layout("routes/_layout.tsx", [
    index("routes/_layout.home.tsx"),
    route("po", "routes/_layout.po.tsx"),
    route("po/new", "routes/_layout.po.new.tsx"),
    route("po/:id", "routes/_layout.po.$id.tsx"),
    route("po/:id/edit", "routes/_layout.po.$id.edit.tsx"),
    route("pi", "routes/_layout.pi.tsx"),
    route("pi/new", "routes/_layout.pi.new.tsx"),
    route("pi/:id", "routes/_layout.pi.$id.tsx"),
    route("pi/:id/edit", "routes/_layout.pi.$id.edit.tsx"),
    route("shipping", "routes/_layout.shipping.tsx"),
    route("shipping/new", "routes/_layout.shipping.new.tsx"),
    route("shipping/:id", "routes/_layout.shipping.$id.tsx"),
    route("shipping/:id/edit", "routes/_layout.shipping.$id.edit.tsx"),
    route("orders", "routes/_layout.orders.tsx"),
    route("customs", "routes/_layout.customs.tsx"),
    route("delivery", "routes/_layout.delivery.tsx"),
    route("settings/organizations", "routes/_layout.settings.organizations.tsx"),
    route("settings/products", "routes/_layout.settings.products.tsx"),
    route("settings/users", "routes/_layout.settings.users.tsx"),
  ]),

  // Saelim Layout (세림 전용)
  layout("routes/_saelim.tsx", [
    route("saelim/delivery", "routes/_saelim.delivery.tsx"),
  ]),

  // Resource routes
  route("api/upload", "routes/api.upload.ts"),
] satisfies RouteConfig;
