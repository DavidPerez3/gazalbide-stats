import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PrivateRoute from "./PrivateRoute";
import { useAuth } from "../context/AuthContext";
vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
function visit(auth, adminOnly = true) {
  useAuth.mockReturnValue(auth);
  render(<MemoryRouter initialEntries={["/protected"]}><Routes>
    <Route path="/protected" element={<PrivateRoute adminOnly={adminOnly}><div>Protected content</div></PrivateRoute>} />
    <Route path="/" element={<div>Home</div>} />
    <Route path="/login" element={<div>Login</div>} />
  </Routes></MemoryRouter>);
}
describe("admin route authorization", () => {
  it("redirects anonymous visitors to login", () => { visit({}); expect(screen.getByText("Login")).toBeInTheDocument(); });
  it("denies the formerly privileged email without an admin profile", () => {
    visit({ user: { email: "perez.david@opendeusto.es" }, profile: { is_admin: false } });
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
  it("denies truthy non-boolean admin flags", () => {
    visit({ user: { id: "user" }, profile: { is_admin: "true" } });
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
  it("denies an authenticated visitor whose profile is missing", () => { visit({ user: { id: "user" }, profile: null }); expect(screen.getByText("Home")).toBeInTheDocument(); });
  it("allows an explicitly authorized administrator", () => {
    visit({ user: { id: "admin" }, profile: { is_admin: true } });
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
  it("waits while authentication loads", () => { visit({ loading: true }); expect(screen.queryByText("Protected content")).not.toBeInTheDocument(); });
  it("allows ordinary authenticated routes", () => { visit({ user: { id: "user" } }, false); expect(screen.getByText("Protected content")).toBeInTheDocument(); });
});
