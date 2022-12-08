import * as React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./Home";
import Login from "./Login";
import Verify from "./Verify";

export default function App() {
  return (
    <div>
      <h2>SST Auth Example</h2>
      <Routes>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="login/verify" element={<Verify />} />
      </Routes>
    </div>
  );
}